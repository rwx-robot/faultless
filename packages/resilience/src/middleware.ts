import { Bulkhead, BulkheadRegistry, createBulkhead } from './bulkhead';
import { Deadline, TimeoutBudget, createTimeoutBudgetMiddleware } from './timeout-budget';
import { FaultInjectionEngine, createFaultInjectionEngine, createFaultInjectionMiddleware } from './fault-injection';
import { SmartRetryEngine, createSmartRetryEngine, RetryStrategy } from './smart-retry';
import { CircuitBreaker } from '@faultless/breaker';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'resilience:middleware' });

/**
 * Resilience Configuration
 */
export interface ResilienceConfig {
  bulkhead?: {
    enabled?: boolean;
    maxConcurrent?: number;
    maxQueued?: number;
    timeoutMs?: number;
  };
  timeoutBudget?: {
    enabled?: boolean;
    defaultTimeoutMs?: number;
    propagateHeaders?: boolean;
  };
  faultInjection?: {
    enabled?: boolean;
    faults?: Array<{
      id: string;
      type: any;
      condition?: any;
      config: any;
    }>;
  };
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    strategy?: RetryStrategy;
    initialDelayMs?: number;
  };
}

/**
 * Resilience Middleware Package
 *
 * Combines all resilience patterns into a unified middleware:
 * - Bulkhead isolation
 * - Timeout budget with deadline propagation
 * - Fault injection for chaos testing
 * - Smart retry with circuit breaker awareness
 */
export function createResilienceMiddleware(config: ResilienceConfig = {}) {
  const {
    bulkhead: bulkheadConfig = {},
    timeoutBudget: timeoutConfig = {},
    faultInjection: faultConfig = {},
    retry: retryConfig = {},
  } = config;

  // Create engines
  const bulkhead = bulkheadConfig.enabled !== false
    ? createBulkhead({
        name: 'http-default',
        maxConcurrent: bulkheadConfig.maxConcurrent ?? 100,
        maxQueued: bulkheadConfig.maxQueued ?? 50,
        timeoutMs: bulkheadConfig.timeoutMs ?? 30000,
      })
    : undefined;

  const faultEngine = faultConfig.enabled !== false ? createFaultInjectionEngine() : undefined;
  const retryEngine = retryConfig.enabled !== false
    ? createSmartRetryEngine({
        maxRetries: retryConfig.maxRetries ?? 3,
        strategy: retryConfig.strategy ?? RetryStrategy.EXPONENTIAL,
        initialDelayMs: retryConfig.initialDelayMs ?? 100,
      })
    : undefined;

  // Register fault injection faults
  if (faultConfig.faults) {
    faultConfig.faults.forEach(fault => {
      faultEngine!.register(fault.id, fault);
    });
  }

  // Timeout budget middleware
  const timeoutBudgetMiddleware = timeoutConfig.enabled !== false
    ? createTimeoutBudgetMiddleware({
        defaultTimeoutMs: timeoutConfig.defaultTimeoutMs ?? 30000,
        propagateHeaders: timeoutConfig.propagateHeaders ?? true,
      })
    : undefined;

  // Fault injection middleware
  const faultInjectionMiddleware = faultEngine
    ? createFaultInjectionMiddleware(faultEngine)
    : undefined;

  return async (request: any, reply: any, next: () => Promise<void>) => {
    const startTime = Date.now();

    try {
      // 1. Timeout Budget
      if (timeoutBudgetMiddleware) {
        await timeoutBudgetMiddleware(request, reply, async () => {});
      }

      // 2. Fault Injection (check before bulkhead)
      if (faultInjectionMiddleware) {
        const fault = await faultEngine!.shouldInject({
          path: request.url,
          method: request.method,
          headers: request.headers as Record<string, string>,
        });

        if (fault) {
          await faultEngine!.applyFault(fault, request, reply, async () => {});
          return;
        }
      }

      // 3. Bulkhead
      if (bulkhead) {
        await bulkhead.execute(async () => {
          await next();
        });
      } else {
        await next();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Resilience middleware error', {
        path: request.url,
        method: request.method,
        duration,
        error: (error as Error).message,
      });
      throw error;
    }
  };
}

/**
 * Create resilience stack for HTTP client
 */
export function createResilienceClientStack(config: ResilienceConfig = {}) {
  const retryEngine = retryConfig.enabled !== false
    ? createSmartRetryEngine({
        maxRetries: config.retry?.maxRetries ?? 3,
        strategy: config.retry?.strategy ?? RetryStrategy.EXPONENTIAL,
        initialDelayMs: config.retry?.initialDelayMs ?? 100,
      })
    : undefined;

  return {
    retryEngine,
    createRetryMiddleware: (circuitBreaker?: CircuitBreaker) => {
      return async (request: any, reply: any, next: () => Promise<void>) => {
        if (!retryEngine) {
          await next();
          return;
        }

        const result = await retryEngine.execute(
          async () => {
            await next();
            return reply;
          },
          {
            path: request.url,
            method: request.method,
            circuitBreaker,
          }
        );

        if (!result.success && result.circuitBreakerTripped) {
          reply.code(503).send({ error: 'Service unavailable' });
        }
      };
    },
  };
}

/**
 * Resilience Health Indicator
 */
export class ResilienceHealthIndicator {
  constructor(
    private bulkheads: BulkheadRegistry,
    private faultEngine?: FaultInjectionEngine
  ) {}

  async check() {
    const bulkheads = this.bulkheads.getAllStates();
    const faults = this.faultEngine?.getStats();

    return {
      bulkheads,
      faultInjection: faults,
      healthy: Object.values(bulkheads).every(b => b.state !== 'OPEN'),
    };
  }
}

// Re-export all components
export * from './bulkhead';
export * from './timeout-budget';
export * from './fault-injection';
export * from './smart-retry';