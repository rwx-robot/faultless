import { FastifyRequest, FastifyReply } from 'fastify';
import { CircuitBreaker, CircuitBreakerConfig, circuitBreakerRegistry, CircuitBreakerState } from './circuit-breaker';
import { NofaultError, isRetryableError } from '@faultless/core';
import { getLogger } from '@faultless/log';

const logger = getLogger('breaker:middleware');

export interface CircuitBreakerMiddlewareOptions {
  breaker: CircuitBreaker;
  keyGenerator?: (request: FastifyRequest) => string;
  fallback?: (request: FastifyRequest, reply: FastifyReply, error: Error) => Promise<void>;
  excludedPaths?: string[];
  excludedMethods?: string[];
}

export function createCircuitBreakerMiddleware(
  options: CircuitBreakerMiddlewareOptions
): (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>) => Promise<void> {
  const { breaker, keyGenerator, fallback, excludedPaths = [], excludedMethods = [] } = options;

  return async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> => {
    if (excludedPaths.some(path => request.url.startsWith(path))) {
      await next();
      return;
    }

    if (excludedMethods.includes(request.method)) {
      await next();
      return;
    }

    const key = keyGenerator ? keyGenerator(request) : `${request.method}:${request.routeOptions?.url ?? request.url}`;

    try {
      await breaker.execute(async () => {
        await next();
      });
    } catch (error) {
      if (error instanceof NofaultError && error.code === 'CIRCUIT_BREAKER_OPEN') {
        const retryAfter = Math.ceil((breaker.getStats().nextAttempt?.getTime() ?? Date.now() + breaker['config'].resetTimeout - Date.now()) / 1000);

        reply.header('X-Circuit-Breaker', 'open');
        reply.header('Retry-After', retryAfter.toString());

        if (fallback) {
          await fallback(request, reply, error);
          return;
        }

        reply.status(503).send({
          error: 'CIRCUIT_BREAKER_OPEN',
          message: `Service temporarily unavailable. Circuit breaker is open.`,
          retryAfter,
          breaker: breaker.getName(),
        });
        return;
      }

      throw error;
    }
  };
}

export interface CircuitBreakerRouteConfig {
  path: string;
  method?: string;
  threshold?: number;
  timeout?: number;
  resetTimeout?: number;
  fallback?: (request: FastifyRequest, reply: FastifyReply, error: Error) => Promise<void>;
}

export class CircuitBreakerMiddlewareManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private routeConfigs: Map<string, CircuitBreakerRouteConfig> = new Map();

  registerRoute(config: CircuitBreakerRouteConfig): void {
    const key = `${config.method ?? 'ALL'}:${config.path}`;
    this.routeConfigs.set(key, config);
  }

  getBreakerForRoute(method: string, path: string): CircuitBreaker | undefined {
    const key = `${method}:${path}`;
    const routeConfig = this.routeConfigs.get(key);
    if (!routeConfig) return undefined;

    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name: key,
        threshold: routeConfig.threshold ?? 5,
        timeout: routeConfig.timeout ?? 60000,
        resetTimeout: routeConfig.resetTimeout ?? 30000,
        fallback: routeConfig.fallback ? (error) => routeConfig.fallback!(undefined as any, undefined as any, error) : undefined,
      });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  getMiddleware(): (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> => {
      const breaker = this.getBreakerForRoute(request.method, request.routeOptions?.url ?? request.url);
      if (!breaker) {
        await next();
        return;
      }

      try {
        await breaker.execute(async () => {
          await next();
        });
      } catch (error) {
        if (error instanceof NofaultError && error.code === 'CIRCUIT_BREAKER_OPEN') {
          const retryAfter = Math.ceil((breaker.getStats().nextAttempt?.getTime() ?? Date.now() + breaker['config'].resetTimeout - Date.now()) / 1000);

          reply.header('X-Circuit-Breaker', 'open');
          reply.header('Retry-After', retryAfter.toString());

          reply.status(503).send({
            error: 'CIRCUIT_BREAKER_OPEN',
            message: `Service temporarily unavailable. Circuit breaker is open.`,
            retryAfter,
            breaker: breaker.getName(),
          });
          return;
        }
        throw error;
      }
    };
  }

  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [key, breaker] of this.breakers) {
      stats[key] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export function createCircuitBreakerMiddlewareManager(): CircuitBreakerMiddlewareManager {
  return new CircuitBreakerMiddlewareManager();
}