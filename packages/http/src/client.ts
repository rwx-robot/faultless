import { FastifyInstance } from 'fastify';
import { Resolver, createResolver, ResolverRegistry, resolverRegistry } from '@faultless/discovery';
import type { ResolverOptions, ResolvedEndpoint } from '@faultless/discovery';
import { CircuitBreaker, createCircuitBreaker } from '@faultless/breaker';
import { RateLimiter, createRateLimiter } from '@faultless/limit';
import { createLogger, getLogger } from '@faultless/log';
import { RetryOptions, retry, timeout } from '@faultless/core';
import { NofaultError, isRetryableError } from '@faultless/core';

const logger = getLogger('http:client');

export interface HttpClientOptions {
  serviceName: string;
  resolver?: ResolverOptions;
  circuitBreaker?: {
    enabled: boolean;
    threshold?: number;
    timeout?: number;
    resetTimeout?: number;
  };
  rateLimit?: {
    enabled: boolean;
    windowMs?: number;
    max?: number;
  };
  retry?: RetryOptions;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  circuitBreakerKey?: string;
}

export interface ClientResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  endpoint: ResolvedEndpoint;
}

export class HttpClient {
  private resolver: Resolver;
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private defaultRetry: RetryOptions;
  private fastify: FastifyInstance;

  constructor(private options: HttpClientOptions, fastify: FastifyInstance) {
    this.fastify = fastify;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.defaultTimeout = options.timeout ?? 30000;
    this.defaultRetry = {
      retries: 3,
      delay: 100,
      backoff: 'exponential',
      maxDelay: 5000,
      retryable: isRetryableError,
      ...options.retry,
    };

    this.resolver = createResolver(options.serviceName, options.resolver ?? {
      discovery: {
        type: 'static',
        endpoints: [],
        serviceName: options.serviceName,
      },
    });

    if (options.circuitBreaker?.enabled) {
      this.circuitBreaker = createCircuitBreaker({
        name: `${options.serviceName}-client`,
        threshold: options.circuitBreaker.threshold ?? 5,
        timeout: options.circuitBreaker.timeout ?? 30000,
        resetTimeout: options.circuitBreaker.resetTimeout ?? 10000,
      });
    }

    if (options.rateLimit?.enabled) {
      this.rateLimiter = createRateLimiter({
        name: `${options.serviceName}-client`,
        windowMs: options.rateLimit.windowMs ?? 60000,
        max: options.rateLimit.max ?? 100,
      });
    }
  }

  async start(): Promise<void> {
    await this.resolver.start();
  }

  async stop(): Promise<void> {
    await this.resolver.stop();
  }

  async request<T = any>(requestOptions: RequestOptions): Promise<ClientResponse<T>> {
    const endpoint = await this.resolver.resolve(requestOptions.circuitBreakerKey);
    if (!endpoint) {
      throw new NofaultError(
        `No available instances for service ${this.options.serviceName}`,
        'SERVICE_UNAVAILABLE',
        503
      );
    }

    const url = `http://${endpoint.address}:${endpoint.port}${requestOptions.path}`;
    const headers = { ...this.defaultHeaders, ...requestOptions.headers };
    const timeoutMs = requestOptions.timeout ?? this.defaultTimeout;

    const executeRequest = async (): Promise<ClientResponse<T>> => {
      if (this.rateLimiter) {
        const rlResult = await this.rateLimiter.consume(requestOptions.circuitBreakerKey ?? 'default');
        if (!rlResult.allowed) {
          throw new NofaultError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.fastify.inject({
          method: requestOptions.method,
          url,
          query: requestOptions.query,
          payload: requestOptions.body,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return {
          data: response.json(),
          status: response.statusCode,
          statusText: response.statusMessage ?? '',
          headers: response.headers as Record<string, string>,
          endpoint,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    let lastError: Error | null = null;
    const maxRetries = requestOptions.retries ?? this.defaultRetry.retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let result: ClientResponse<T>;

        if (this.circuitBreaker) {
          result = await this.circuitBreaker.execute(executeRequest);
        } else {
          result = await executeRequest();
        }

        if (result.status >= 500 && attempt < maxRetries) {
          throw new NofaultError('Server error', 'SERVER_ERROR', result.status);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) break;
        if (!isRetryableError(lastError)) break;

        const delay = this.calculateDelay(attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const { delay, backoff, maxDelay } = this.defaultRetry;
    let calculatedDelay = delay;
    if (backoff === 'exponential') {
      calculatedDelay = delay * Math.pow(2, attempt);
    } else if (backoff === 'linear') {
      calculatedDelay = delay * (attempt + 1);
    }
    return Math.min(calculatedDelay, maxDelay ?? 30000);
  }

  async get<T = any>(path: string, options?: Partial<RequestOptions>): Promise<ClientResponse<T>> {
    return this.request<T>({ ...options, method: 'GET', path });
  }

  async post<T = any>(path: string, body?: any, options?: Partial<RequestOptions>): Promise<ClientResponse<T>> {
    return this.request<T>({ ...options, method: 'POST', path, body });
  }

  async put<T = any>(path: string, body?: any, options?: Partial<RequestOptions>): Promise<ClientResponse<T>> {
    return this.request<T>({ ...options, method: 'PUT', path, body });
  }

  async delete<T = any>(path: string, options?: Partial<RequestOptions>): Promise<ClientResponse<T>> {
    return this.request<T>({ ...options, method: 'DELETE', path });
  }

  async patch<T = any>(path: string, body?: any, options?: Partial<RequestOptions>): Promise<ClientResponse<T>> {
    return this.request<T>({ ...options, method: 'PATCH', path, body });
  }

  getResolver(): Resolver {
    return this.resolver;
  }

  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }
}

export class HttpClientFactory {
  private clients: Map<string, HttpClient> = new Map();
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  createClient(name: string, options: HttpClientOptions): HttpClient {
    if (this.clients.has(name)) {
      throw new Error(`Client ${name} already exists`);
    }

    const client = new HttpClient({ ...options, serviceName: name }, this.fastify);
    this.clients.set(name, client);
    return client;
  }

  getClient(name: string): HttpClient | undefined {
    return this.clients.get(name);
  }

  async startAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.stop();
    }
  }

  removeClient(name: string): boolean {
    return this.clients.delete(name);
  }
}

export function createHttpClientFactory(fastify: FastifyInstance): HttpClientFactory {
  return new HttpClientFactory(fastify);
}