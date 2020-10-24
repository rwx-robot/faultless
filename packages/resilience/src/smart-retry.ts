import { Injectable, NofaultError } from '@faultless/core';
import { CircuitBreaker, CircuitBreakerState } from '@faultless/breaker';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'resilience:smart-retry' });

/**
 * Retry Strategy
 */
export enum RetryStrategy {
  FIXED = 'FIXED',           // Fixed delay
  EXPONENTIAL = 'EXPONENTIAL', // Exponential backoff
  LINEAR = 'LINEAR',         // Linear backoff
  FIBONACCI = 'FIBONACCI',   // Fibonacci backoff
  DECORRELATED = 'DECORRELATED', // Decorrelated jitter
}

/**
 * Retry Policy
 */
export interface RetryPolicy {
  strategy: RetryStrategy;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterMs?: number;          // Add random jitter (0-100%)
  retryableErrors?: string[];  // Error codes to retry on
  retryableStatuses?: number[]; // HTTP status codes to retry on
  respectRetryAfter?: boolean;  // Honor Retry-After header
  circuitBreakerAware?: boolean; // Skip retries when circuit open
}

/**
 * Retry Attempt
 */
export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  error: Error;
  timestamp: number;
}

/**
 * Retry Result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: RetryAttempt[];
  totalDurationMs: number;
  circuitBreakerTripped?: boolean;
}

/**
 * Endpoint Retry Config
 */
export interface EndpointRetryConfig {
  path: string;
  method?: string;
  policy: RetryPolicy;
}

/**
 * Smart Retry Engine
 *
 * Enhanced retry logic that:
 * - Per-endpoint retry policies
 * - Circuit breaker aware (stops retrying when circuit open)
 * - Multiple backoff strategies with jitter
 * - Respects Retry-After header
 * - Configurable retryable errors/statuses
 * - Detailed retry history
 * - Connection reset handling
 */
@Injectable()
export class SmartRetryEngine {
  private endpointPolicies: Map<string, RetryPolicy> = new Map();
  private defaultPolicy: RetryPolicy;

  constructor(defaultPolicy?: Partial<RetryPolicy>) {
    this.defaultPolicy = {
      strategy: RetryStrategy.EXPONENTIAL,
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 30000,
      jitterMs: 0.5,
      retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
      retryableStatuses: [408, 429, 500, 502, 503, 504],
      respectRetryAfter: true,
      circuitBreakerAware: true,
      ...defaultPolicy,
    };
  }

  /**
   * Register per-endpoint retry policy
   */
  registerEndpoint(config: EndpointRetryConfig): void {
    const key = `${config.method ?? '*'}:${config.path}`;
    this.endpointPolicies.set(key, config.policy);
  }

  /**
   * Get retry policy for endpoint
   */
  getPolicy(path: string, method?: string): RetryPolicy {
    // Try exact match
    const exactKey = `${method}:${path}`;
    if (this.endpointPolicies.has(exactKey)) {
      return this.endpointPolicies.get(exactKey)!;
    }

    // Try wildcard method
    const wildcardKey = `*:${path}`;
    if (this.endpointPolicies.has(wildcardKey)) {
      return this.endpointPolicies.get(wildcardKey)!;
    }

    // Try pattern match
    for (const [key, policy] of this.endpointPolicies.entries()) {
      const [, pattern] = key.split(':');
      if (new RegExp(pattern).test(path)) {
        return policy;
      }
    }

    return this.defaultPolicy;
  }

  /**
   * Execute with retry
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: {
      path: string;
      method?: string;
      circuitBreaker?: CircuitBreaker;
      onRetry?: (attempt: RetryAttempt) => void;
      deadline?: { remainingMs: number; isExpired: () => boolean };
    }
  ): Promise<RetryResult<T>> {
    const policy = this.getPolicy(options.path, options.method);
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;
    let circuitBreakerTripped = false;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      // Check deadline
      if (options.deadline?.isExpired()) {
        break;
      }

      // Check circuit breaker
      if (policy.circuitBreakerAware && options.circuitBreaker) {
        if (options.circuitBreaker.getState() === CircuitBreakerState.OPEN) {
          circuitBreakerTripped = true;
          logger.debug('Circuit breaker open, stopping retries', { path: options.path });
          break;
        }
      }

      try {
        // Execute the function
        const result = await fn();
        return {
          success: true,
          result,
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        const retryAttempt: RetryAttempt = {
          attempt,
          delayMs: 0,
          error: lastError,
          timestamp: Date.now(),
        };

        // Check if we should retry
        if (!this.shouldRetry(lastError, policy, attempt)) {
          attempts.push(retryAttempt);
          break;
        }

        // Check if we have more retries
        if (attempt >= policy.maxRetries) {
          attempts.push(retryAttempt);
          break;
        }

        // Calculate delay
        let delayMs = this.calculateDelay(attempt, policy);

        // Respect Retry-After header
        if (policy.respectRetryAfter && lastError instanceof NofaultError) {
          const retryAfter = this.parseRetryAfter(lastError);
          if (retryAfter) {
            delayMs = Math.max(delayMs, retryAfter);
          }
        }

        // Apply deadline constraint
        if (options.deadline) {
          const remaining = options.deadline.remainingMs - delayMs;
          if (remaining <= 0) {
            retryAttempt.delayMs = 0;
            attempts.push(retryAttempt);
            break;
          }
        }

        retryAttempt.delayMs = delayMs;
        attempts.push(retryAttempt);

        // Notify retry callback
        options.onRetry?.(retryAttempt);

        logger.debug('Retrying after delay', {
          path: options.path,
          attempt,
          delayMs,
          error: lastError.message,
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return {
      success: false,
      attempts,
      totalDurationMs: Date.now() - startTime,
      circuitBreakerTripped,
    };
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: Error, policy: RetryPolicy, attempt: number): boolean {
    // Check error code
    const errorCode = (error as any).code;
    if (errorCode && policy.retryableErrors?.includes(errorCode)) {
      return true;
    }

    // Check HTTP status
    if (error instanceof NofaultError && error.status) {
      if (policy.retryableStatuses?.includes(error.status)) {
        return true;
      }
    }

    // Check if error message contains retryable patterns
    const retryablePatterns = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'];
    if (retryablePatterns.some(pattern => error.message.includes(pattern))) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay based on strategy
   */
  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    let delay: number;

    switch (policy.strategy) {
      case RetryStrategy.FIXED:
        delay = policy.initialDelayMs;
        break;

      case RetryStrategy.EXPONENTIAL:
        delay = policy.initialDelayMs * Math.pow(2, attempt);
        break;

      case RetryStrategy.LINEAR:
        delay = policy.initialDelayMs * (attempt + 1);
        break;

      case RetryStrategy.FIBONACCI:
        delay = this.fibonacci(attempt + 2) * policy.initialDelayMs;
        break;

      case RetryStrategy.DECORRELATED:
        delay = Math.random() * policy.maxDelayMs;
        break;

      default:
        delay = policy.initialDelayMs * Math.pow(2, attempt);
    }

    // Apply max delay cap
    delay = Math.min(delay, policy.maxDelayMs);

    // Apply jitter
    if (policy.jitterMs) {
      const jitter = delay * policy.jitterMs * Math.random();
      delay = delay + jitter;
    }

    return Math.round(delay);
  }

  /**
   * Calculate Fibonacci number
   */
  private fibonacci(n: number): number {
    if (n <= 1) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  /**
   * Parse Retry-After header from error
   */
  private parseRetryAfter(error: Error): number | null {
    const retryAfter = (error as any).headers?.['retry-after'];
    if (!retryAfter) return null;

    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    return null;
  }

  /**
   * Get registered endpoints
   */
  getEndpoints(): Array<{ key: string; policy: RetryPolicy }> {
    return Array.from(this.endpointPolicies.entries()).map(([key, policy]) => ({
      key,
      policy,
    }));
  }
}

/**
 * Create smart retry engine
 */
export function createSmartRetryEngine(
  defaultPolicy?: Partial<RetryPolicy>
): SmartRetryEngine {
  return new SmartRetryEngine(defaultPolicy);
}

/**
 * Smart Retry Middleware for HTTP Client
 */
export function createSmartRetryMiddleware(
  engine?: SmartRetryEngine,
  circuitBreaker?: CircuitBreaker
) {
  const retryEngine = engine ?? createSmartRetryEngine();

  return async (request: any, reply: any, next: () => Promise<void>) => {
    const result = await retryEngine.execute(
      async () => {
        await next();
        return reply;
      },
      {
        path: request.url,
        method: request.method,
        circuitBreaker,
        onRetry: (attempt) => {
          logger.debug('Retry attempt', {
            path: request.url,
            attempt: attempt.attempt,
            delay: attempt.delayMs,
          });
        },
      }
    );

    if (!result.success && result.circuitBreakerTripped) {
      reply.code(503).send({ error: 'Service unavailable (circuit breaker open)' });
    }
  };
}