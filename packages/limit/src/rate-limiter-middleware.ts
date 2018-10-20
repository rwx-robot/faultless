import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiter, RateLimitResult, rateLimiterRegistry, createRateLimiter } from './rate-limiter';
import { NofaultError, TooManyRequestsError } from '@faultless/core';
import { getLogger } from '@faultless/log';

const logger = getLogger('limit:middleware');

export interface RateLimitMiddlewareOptions {
  limiter: RateLimiter;
  keyGenerator?: (request: FastifyRequest) => string;
  skip?: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean> | boolean;
  handler?: (request: FastifyRequest, reply: FastifyReply, result: RateLimitResult) => Promise<void>;
  excludedPaths?: string[];
  excludedMethods?: string[];
  headers?: boolean;
}

export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions
): (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>) => Promise<void> {
  const {
    limiter,
    keyGenerator,
    skip,
    handler,
    excludedPaths = ['/health', '/metrics', '/favicon.ico'],
    excludedMethods = [],
    headers = true,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> => {
    if (excludedPaths.some(path => request.url.startsWith(path))) {
      await next();
      return;
    }

    if (excludedMethods.includes(request.method)) {
      await next();
      return;
    }

    if (skip && await skip(request, reply)) {
      await next();
      return;
    }

    const key = keyGenerator
      ? keyGenerator(request)
      : `${request.ip}:${request.method}:${request.routeOptions?.url ?? request.url}`;

    const result = await limiter.consume(key);

    if (headers) {
      reply.header('X-RateLimit-Limit', result.limit.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000).toString());
      reply.header('X-RateLimit-Total', result.total.toString());
    }

    if (!result.allowed) {
      if (handler) {
        await handler(request, reply, result);
        return;
      }

      const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);

      reply.header('Retry-After', retryAfter.toString());

      const error = new TooManyRequestsError(
        'Too many requests',
        retryAfter,
        (request.headers['x-request-id'] as string) ?? undefined
      );

      reply.status(429).send(error.toJSON());
      return;
    }

    await next();
  };
}

export interface RateLimitRouteConfig {
  path: string;
  method?: string;
  windowMs?: number;
  max?: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skip?: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean> | boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimitMiddlewareManager {
  private limiters: Map<string, RateLimiter> = new Map();
  private routeConfigs: Map<string, RateLimitRouteConfig> = new Map();

  registerRoute(config: RateLimitRouteConfig): void {
    const key = `${config.method ?? 'ALL'}:${config.path}`;
    this.routeConfigs.set(key, config);
  }

  getLimiterForRoute(method: string, path: string): RateLimiter | undefined {
    const key = `${method}:${path}`;
    const routeConfig = this.routeConfigs.get(key);
    if (!routeConfig) return undefined;

    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = createRateLimiter({
        name: key,
        windowMs: routeConfig.windowMs ?? 60000,
        max: routeConfig.max ?? 100,
        keyGenerator: routeConfig.keyGenerator ? (ctx) => routeConfig.keyGenerator!(ctx as any) : undefined,
        skipSuccessfulRequests: routeConfig.skipSuccessfulRequests,
        skipFailedRequests: routeConfig.skipFailedRequests,
      });
      this.limiters.set(key, limiter);
    }
    return limiter;
  }

  getMiddleware(): (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> => {
      const limiter = this.getLimiterForRoute(request.method, request.routeOptions?.url ?? request.url);
      if (!limiter) {
        await next();
        return;
      }

      const key = limiter['config'].keyGenerator
        ? limiter['config'].keyGenerator!(request)
        : `${request.ip}:${request.method}:${request.routeOptions?.url ?? request.url}`;

    const result = await limiter.consume(key);

    reply.header('X-RateLimit-Limit', result.limit.toString());
    reply.header('X-RateLimit-Remaining', result.remaining.toString());
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000).toString());
    reply.header('X-RateLimit-Total', result.total.toString());

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter.toString());

      const error = new TooManyRequestsError(
        'Too many requests',
        retryAfter,
        (request.headers['x-request-id'] as string) ?? undefined
      );

      reply.status(429).send(error.toJSON());
      return;
    }

    await next();
    };
  }

  async getAllStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    for (const [key, limiter] of this.limiters) {
      const result = await limiter.get(key.replace('ratelimit:', ''));
      if (result) {
        stats[key] = result;
      }
    }
    return Promise.resolve(stats);
  }

  async resetAll(): Promise<void> {
    for (const limiter of this.limiters.values()) {
      await limiter.resetAll();
    }
  }
}

export function createRateLimitMiddlewareManager(): RateLimitMiddlewareManager {
  return new RateLimitMiddlewareManager();
}