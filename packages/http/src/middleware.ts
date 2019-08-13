import { FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage } from 'http';
import { MiddlewareFunction, GuardFunction, InterceptorFunction, PipeFunction, FilterFunction } from './types';
import { NofaultError, UnauthorizedError, ForbiddenError, TooManyRequestsError } from '@faultless/core';
import { getLogger } from '@faultless/log';
import { CircuitBreaker, createCircuitBreakerMiddleware } from '@faultless/breaker';
import type { CircuitBreakerMiddlewareOptions } from '@faultless/breaker';
import { RateLimiter, createRateLimitMiddleware } from '@faultless/limit';
import type { RateLimitMiddlewareOptions } from '@faultless/limit';
import { RetryOptions, retry } from '@faultless/core';

const logger = getLogger('http:middleware');

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

export interface RequestIdOptions {
  header?: string;
  generator?: () => string;
  trusted?: (req: IncomingMessage) => boolean;
}

export function corsMiddleware(options: CorsOptions = {}): MiddlewareFunction {
  const {
    origin = '*',
    methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders,
    credentials = true,
    maxAge,
    preflightContinue = false,
    optionsSuccessStatus = 204,
  } = options;

  return async (request, reply, next) => {
    const requestOrigin = request.headers.origin as string;

    const resolvedOrigin = typeof origin === 'function'
      ? origin(requestOrigin)
      : Array.isArray(origin)
        ? origin.includes(requestOrigin) ? requestOrigin : origin[0]
        : origin;

    reply.header('Access-Control-Allow-Origin', resolvedOrigin);
    reply.header('Access-Control-Allow-Methods', methods.join(', '));
    reply.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    reply.header('Access-Control-Allow-Credentials', credentials.toString());

    if (exposedHeaders) {
      reply.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }

    if (maxAge !== undefined) {
      reply.header('Access-Control-Max-Age', maxAge.toString());
    }

    if (request.method === 'OPTIONS') {
      if (preflightContinue) {
        await next();
        return;
      }
      reply.status(optionsSuccessStatus).send();
      return;
    }

    await next();
  };
}

export const helmetMiddleware: MiddlewareFunction = async (request, reply, next) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
};

export function requestIdMiddleware(options: RequestIdOptions = {}): MiddlewareFunction {
  const {
    header = 'x-request-id',
    generator = defaultRequestIdGenerator,
    trusted,
  } = options;

  return async (request, reply, next) => {
    let requestId: string;

    const incomingId = request.headers[header] as string | undefined;

    if (incomingId && (!trusted || trusted(request.raw))) {
      requestId = incomingId;
    } else {
      requestId = generator();
    }

    reply.header('X-Request-ID', requestId);
    (request as any).requestId = requestId;
    await next();
  };
}

function defaultRequestIdGenerator(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const loggingMiddleware: MiddlewareFunction = async (request, reply, next) => {
  const start = Date.now();
  const requestId = (request as any).requestId;

  logger.debug({ method: request.method, url: request.url, requestId }, 'Incoming request');

  await next();

  const duration = Date.now() - start;
  logger.info(
    { method: request.method, url: request.url, statusCode: reply.statusCode, duration, requestId },
    'Request completed'
  );
};

export const bodyParserMiddleware: MiddlewareFunction = async (request, reply, next) => {
  await next();
};

export function createRateLimitMiddlewareFromLimiter(
  options: RateLimitMiddlewareOptions
): MiddlewareFunction {
  return createRateLimitMiddleware(options);
}

export function createCircuitBreakerMiddlewareFromBreaker(
  options: CircuitBreakerMiddlewareOptions
): MiddlewareFunction {
  return createCircuitBreakerMiddleware(options);
}



export function createRetryMiddleware(options: RetryOptions = {}): MiddlewareFunction {
  const retryOptions: RetryOptions = {
    retries: 3,
    delay: 100,
    backoff: 'exponential',
    maxDelay: 5000,
    retryable: (error) => error instanceof NofaultError && isRetryableError(error),
    ...options,
  };

  return async (request, reply, next) => {
    await retry(next, retryOptions);
  };
}

export function createAuthGuard(options: { secret: string; algorithms?: string[] }): GuardFunction {
  return async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const { verify } = await import('jsonwebtoken');
      const payload = verify(token, options.secret, { algorithms: options.algorithms ?? ['HS256'] });
      (request as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  };
}

export function createRoleGuard(allowedRoles: string[]): GuardFunction {
  return async (request, reply) => {
    const user = (request as any).user;
    if (!user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const userRoles = user.roles ?? [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenError('Insufficient permissions');
    }

    return true;
  };
}

export function createApiKeyGuard(apiKeys: Map<string, { name: string; roles: string[] }>): GuardFunction {
  return async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      throw new UnauthorizedError('Missing API key');
    }

    const keyInfo = apiKeys.get(apiKey);
    if (!keyInfo) {
      throw new UnauthorizedError('Invalid API key');
    }

    (request as any).apiKey = { key: apiKey, ...keyInfo };
    return true;
  };
}

export function createLoggingInterceptor(): InterceptorFunction {
  return async (request, reply, next) => {
    const start = Date.now();
    logger.debug({ method: request.method, url: request.url }, 'Before handler');

    const result = await next();

    const duration = Date.now() - start;
    logger.debug({ method: request.method, url: request.url, duration }, 'After handler');

    return result;
  };
}

export function createTransformInterceptor(): InterceptorFunction {
  return async (request, reply, next) => {
    const result = await next();

    if (result !== undefined && result !== null && !reply.sent) {
      return { data: result, success: true };
    }

    return result;
  };
}

export function createCacheInterceptor(cache: Map<string, { value: any; expires: number }>): InterceptorFunction {
  return async (request, reply, next) => {
    if (request.method !== 'GET') {
      return next();
    }

    const cacheKey = `${request.method}:${request.url}:${JSON.stringify(request.query)}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      reply.header('X-Cache', 'HIT');
      return cached.value;
    }

    const result = await next();

    if (result && !reply.sent) {
      cache.set(cacheKey, { value: result, expires: Date.now() + 60000 });
      reply.header('X-Cache', 'MISS');
    }

    return result;
  };
}

export function createValidationPipe(): PipeFunction {
  return async (value, metadata) => {
    if (metadata.metatype && value !== null && value !== undefined) {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');

      const instance = plainToInstance(metadata.metatype, value);
      const errors = await validate(instance);

      if (errors.length > 0) {
        const constraints: Record<string, string> = {};
        for (const error of errors) {
          if (error.constraints) {
            Object.assign(constraints, error.constraints);
          }
        }
        throw new NofaultError('Validation failed', 'VALIDATION_ERROR', 400, { field: metadata.data, constraints });
      }

      return instance;
    }

    return value;
  };
}

export function createParseIntPipe(): PipeFunction {
  return async (value) => {
    const parsed = parseInt(value as string, 10);
    if (isNaN(parsed)) {
      throw new NofaultError('Expected integer', 'VALIDATION_ERROR', 400);
    }
    return parsed;
  };
}

export function createParseFloatPipe(): PipeFunction {
  return async (value) => {
    const parsed = parseFloat(value as string);
    if (isNaN(parsed)) {
      throw new NofaultError('Expected float', 'VALIDATION_ERROR', 400);
    }
    return parsed;
  };
}

export function createParseBoolPipe(): PipeFunction {
  return async (value) => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return Boolean(value);
  };
}

export function createParseArrayPipe(separator = ','): PipeFunction {
  return async (value) => {
    if (typeof value === 'string') {
      return value.split(separator).map(s => s.trim()).filter(Boolean);
    }
    return Array.isArray(value) ? value : [value];
  };
}

export function createDefaultValuePipe(defaultValue: unknown): PipeFunction {
  return async (value) => {
    return value === undefined || value === null ? defaultValue : value;
  };
}

export function createTransformPipe(transform: (value: any) => any): PipeFunction {
  return async (value) => transform(value);
}

export function createAllExceptionsFilter(): FilterFunction {
  return async (exception, request, reply) => {
    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    if (exception instanceof NofaultError) {
      reply.status(exception.statusCode).send({
        error: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
        timestamp: exception.timestamp.toISOString(),
      });
      return;
    }

    logger.error({ err: exception, requestId }, 'Unhandled exception');

    reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      requestId,
      timestamp: new Date().toISOString(),
    });
  };
}

export function createNotFoundFilter(): FilterFunction {
  return async (exception, request, reply) => {
    if (exception instanceof NofaultError && exception.code === 'NOT_FOUND') {
      reply.status(404).send(exception.toJSON());
      return;
    }
  };
}

export function createValidationFilter(): FilterFunction {
  return async (exception, request, reply) => {
    if (exception instanceof NofaultError && exception.code === 'VALIDATION_ERROR') {
      reply.status(400).send(exception.toJSON());
      return;
    }
  };
}

export interface MiddlewareModuleOptions {
  cors?: boolean | CorsOptions;
  helmet?: boolean;
  requestId?: boolean | RequestIdOptions;
  logging?: boolean;
  rateLimit?: RateLimitMiddlewareOptions;
  circuitBreaker?: CircuitBreakerMiddlewareOptions;
  timeout?: number;
  retry?: RetryOptions;
}

export function registerDefaultMiddlewares(app: any, options: MiddlewareModuleOptions = {}): void {
  if (options.cors !== false) {
    const corsOpts = typeof options.cors === 'object' ? options.cors : undefined;
    app.addHook('onRequest', corsMiddleware(corsOpts));
  }
  if (options.helmet !== false) app.addHook('onRequest', helmetMiddleware);
  if (options.requestId !== false) {
    const reqIdOpts = typeof options.requestId === 'object' ? options.requestId : undefined;
    app.addHook('onRequest', requestIdMiddleware(reqIdOpts));
  }
  if (options.logging !== false) app.addHook('onRequest', loggingMiddleware);

  if (options.rateLimit) {
    app.addHook('preHandler', createRateLimitMiddleware(options.rateLimit));
  }

  if (options.circuitBreaker) {
    app.addHook('preHandler', createCircuitBreakerMiddleware(options.circuitBreaker));
  }

  if (options.timeout) {
    app.addHook('onRequest', timeoutMiddleware({ timeout: options.timeout }));
  }

  if (options.retry) {
    app.addHook('preHandler', createRetryMiddleware(options.retry));
  }
}

function isRetryableError(error: any): boolean {
  if (!error) return false;
  if (error instanceof NofaultError) {
    const retryableCodes = [
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
      'CIRCUIT_BREAKER_OPEN',
      'TOO_MANY_REQUESTS',
      'DEPENDENCY_ERROR',
    ];
    return retryableCodes.includes(error.code);
  }
  return false;
}

export interface CompressionOptions {
  threshold?: number;
  level?: number;
  algorithm?: 'gzip' | 'deflate' | 'br';
}

export function compressionMiddleware(options: CompressionOptions = {}): MiddlewareFunction {
  const { threshold = 1024, level = 6, algorithm = 'gzip' } = options;

  return async (request, reply, next) => {
    const acceptEncoding = (request.headers['accept-encoding'] as string) || '';

    if (!acceptEncoding.includes(algorithm)) {
      await next();
      return;
    }

    await next();

    const body = reply.raw;
    if (!body) return;

    const originalSend = reply.send.bind(reply);
    reply.send = function (data: any) {
      if (data && Buffer.byteLength(JSON.stringify(data)) >= threshold) {
        reply.header('Content-Encoding', algorithm);
        reply.header('Vary', 'Accept-Encoding');
      }
      return originalSend(data);
    };
  };
}

export interface RequestLoggerOptions {
  level?: 'info' | 'debug' | 'warn';
  excludePaths?: string[];
  slowThreshold?: number;
}

export function requestLoggerMiddleware(options: RequestLoggerOptions = {}): MiddlewareFunction {
  const { level = 'info', excludePaths = [], slowThreshold = 1000 } = options;

  return async (request, reply, next) => {
    const path = request.url.split('?')[0];

    if (excludePaths.some(p => path.startsWith(p))) {
      await next();
      return;
    }

    const start = Date.now();
    const requestId = (request as any).requestId;

    await next();

    const duration = Date.now() - start;
    const logData = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      requestId,
    };

    if (duration >= slowThreshold) {
      logger.warn(logData, 'Slow request detected');
    } else if (level === 'debug') {
      logger.debug(logData, 'Request handled');
    } else {
      logger[level](logData, 'Request handled');
    }
  };
}

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: boolean;
  hsts?: boolean;
  noSniff?: boolean;
  xssFilter?: boolean;
}

export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}): MiddlewareFunction {
  const {
    contentSecurityPolicy = true,
    hsts = true,
    noSniff = true,
    xssFilter = true,
  } = options;

  return async (request, reply, next) => {
    if (noSniff) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }
    if (xssFilter) {
      reply.header('X-XSS-Protection', '1; mode=block');
    }
    if (hsts) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (contentSecurityPolicy) {
      reply.header('Content-Security-Policy', "default-src 'self'");
    }
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    await next();
  };
}

export function responseTimeMiddleware(): MiddlewareFunction {
  return async (request, reply, next) => {
    const start = process.hrtime.bigint();

    await next();

    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = (durationNs / 1e6).toFixed(2);
    reply.header('X-Response-Time', `${durationMs}ms`);
  };
}

export interface TimeoutOptions {
  timeout: number;
  message?: string;
}

export function timeoutMiddleware(options: TimeoutOptions): MiddlewareFunction {
  const { timeout, message = 'Request timeout' } = options;

  return async (request, reply, next) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new NofaultError(message, 'REQUEST_TIMEOUT', 408)), timeout);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } catch (error) {
      if (error instanceof NofaultError && error.code === 'REQUEST_TIMEOUT') {
        throw error;
      }
      throw error;
    }
  };
}

export interface SizeLimitOptions {
  limit: string;
}

function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'b').toLowerCase();

  switch (unit) {
    case 'gb': return value * 1024 * 1024 * 1024;
    case 'mb': return value * 1024 * 1024;
    case 'kb': return value * 1024;
    default: return value;
  }
}

export function sizeLimitMiddleware(options: SizeLimitOptions): MiddlewareFunction {
  const limitBytes = parseSize(options.limit);

  return async (request, reply, next) => {
    const contentLength = parseInt(request.headers['content-length'] as string || '0', 10);

    if (contentLength > limitBytes) {
      throw new NofaultError(
        `Request body too large. Limit: ${options.limit}`,
        'PAYLOAD_TOO_LARGE',
        413
      );
    }

    await next();
  };
}