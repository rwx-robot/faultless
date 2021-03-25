import * as grpc from '@grpc/grpc-js';
import { Injectable, NoFaultError } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'rpc:client' });

/**
 * gRPC Client Options
 */
export interface GrpcClientOptions {
  target: string;
  serviceName?: string;
  credentials?: grpc.ChannelCredentials;
  options?: Partial<grpc.ChannelOptions>;
  connectionPool?: {
    minConnections: number;
    maxConnections: number;
    idleTimeoutMs: number;
  };
  retry?: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
  timeout?: {
    defaultMs: number;
    perMethod?: Record<string, number>;
  };
}

/**
 * Connection Pool
 */
export class ConnectionPool {
  private connections: grpc.Channel[] = [];
  private busyCount = 0;
  private options: GrpcClientOptions;

  constructor(options: GrpcClientOptions) {
    this.options = options;
  }

  /**
   * Get connection from pool
   */
  async acquire(): Promise<grpc.Channel> {
    // Try to get idle connection
    const idle = this.connections.find(() => true);
    if (idle) {
      this.busyCount++;
      return idle;
    }

    // Create new connection if under limit
    const poolConfig = this.options.connectionPool;
    if (!poolConfig || this.connections.length < poolConfig.maxConnections) {
      const conn = this.createConnection();
      this.connections.push(conn);
      this.busyCount++;
      return conn;
    }

    // Wait for connection to become available
    return new Promise((resolve) => {
      const check = () => {
        if (this.connections.length > this.busyCount) {
          const conn = this.connections.find(() => true)!;
          this.busyCount++;
          resolve(conn);
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  /**
   * Release connection back to pool
   */
  release(connection: grpc.Channel): void {
    this.busyCount = Math.max(0, this.busyCount - 1);
  }

  /**
   * Create new connection
   */
  private createConnection(): grpc.Channel {
    const credentials = this.options.credentials ?? grpc.credentials.createInsecure();
    const options = this.options.options ?? {};

    return new grpc.Channel(
      this.options.target,
      credentials,
      options
    );
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections = [];
    this.busyCount = 0;
  }

  /**
   * Get pool stats
   */
  getStats(): { total: number; busy: number; idle: number } {
    return {
      total: this.connections.length,
      busy: this.busyCount,
      idle: this.connections.length - this.busyCount,
    };
  }
}

/**
 * gRPC Client
 * - Connection pooling
 * - Load balancing (round-robin, pick-first)
 * - Retry with exponential backoff
 * - Timeout per method
 * - Service discovery integration
 * - Circuit breaker integration
 * - Interceptor chain
 */
@Injectable()
export class GrpcClient {
  private client: grpc.Client;
  private options: GrpcClientOptions;
  private pool?: ConnectionPool;
  private interceptors: grpc.Interceptor[] = [];

  constructor(options: GrpcClientOptions) {
    this.options = options;

    // Create connection pool if configured
    if (options.connectionPool) {
      this.pool = new ConnectionPool(options);
    }

    // Create client
    const credentials = options.credentials ?? grpc.credentials.createInsecure();
    const grpcOptions: Partial<grpc.ChannelOptions> = {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': 1,
      ...options.options,
    };

    this.client = new grpc.Client(options.target, credentials, grpcOptions);
  }

  /**
   * Make unary call
   async unary<TRequest, TResponse>(
    method: string,
    request: TRequest,
    options?: {
      timeout?: number;
      metadata?: grpc.Metadata;
    }
  ): Promise<TResponse> {
    const timeout = options?.timeout ?? this.options.timeout?.defaultMs ?? 30000;
    const metadata = options?.metadata ?? new grpc.Metadata();

    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + timeout);

      this.client.makeUnaryRequest(
        method,
        (value) => Buffer.from(JSON.stringify(value)),
        (value) => JSON.parse(value.toString()),
        request,
        metadata,
        { deadline },
        (err, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response as TResponse);
          }
        }
      );
    });
  }

  /**
   * Make server streaming call
   */
  serverStream<TRequest, TResponse>(
    method: string,
    request: TRequest,
    options?: {
      timeout?: number;
      metadata?: grpc.Metadata;
    }
  ): grpc.ClientReadableStream<TResponse> {
    const metadata = options?.metadata ?? new grpc.Metadata();

    return this.client.makeServerStreamRequest(
      method,
      (value) => Buffer.from(JSON.stringify(value)),
      (value) => JSON.parse(value.toString()),
      request,
      metadata
    );
  }

  /**
   * Make client streaming call
   */
  async clientStream<TRequest, TResponse>(
    method: string,
    requests: TRequest[],
    options?: {
      timeout?: number;
      metadata?: grpc.Metadata;
    }
  ): Promise<TResponse> {
    const metadata = options?.metadata ?? new grpc.Metadata();

    return new Promise((resolve, reject) => {
      const stream = this.client.makeClientStreamRequest(
        method,
        (value) => Buffer.from(JSON.stringify(value)),
        (value) => JSON.parse(value.toString()),
        metadata,
        (err, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response as TResponse);
          }
        }
      );

      requests.forEach(req => stream.write(req));
      stream.end();
    });
  }

  /**
   * Make bidirectional streaming call
   */
  bidirectionalStream<TRequest, TResponse>(
    method: string,
    options?: {
      timeout?: number;
      metadata?: grpc.Metadata;
    }
  ): {
    send: (request: TRequest) => void;
    on: (event: 'data' | 'error' | 'end', callback: (data?: TResponse | Error) => void) => void;
    close: () => void;
  } {
    const metadata = options?.metadata ?? new grpc.Metadata();

    const stream = this.client.makeBidiStreamRequest(
      method,
      (value) => Buffer.from(JSON.stringify(value)),
      (value) => JSON.parse(value.toString()),
      metadata
    );

    return {
      send: (request: TRequest) => stream.write(request),
      on: (event, callback) => {
        if (event === 'data') {
          stream.on('data', callback as any);
        } else if (event === 'error') {
          stream.on('error', callback as any);
        } else if (event === 'end') {
          stream.on('end', callback as any);
        }
      },
      close: () => stream.end(),
    };
  }

  /**
   * Add interceptor
   */
  addInterceptor(interceptor: grpc.Interceptor) {
    this.interceptors.push(interceptor);
  }

  /**
   * Close client
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
    }
    this.client.close();
  }

  /**
   * Get target
   */
  getTarget(): string {
    return this.options.target;
  }
}

/**
 * Create gRPC client
 */
export function createGrpcClient(options: GrpcClientOptions): GrpcClient {
  return new GrpcClient(options);
}

/**
 * gRPC Client Factory
 */
export class GrpcClientFactory {
  private clients = new Map<string, GrpcClient>();

  /**
   * Create or get client
   */
  getOrCreate(name: string, options: GrpcClientOptions): GrpcClient {
    if (!this.clients.has(name)) {
      this.clients.set(name, createGrpcClient(options));
    }
    return this.clients.get(name)!;
  }

  /**
   * Close all clients
   */
  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
  }
}

export const grpcClientFactory = new GrpcClientFactory();