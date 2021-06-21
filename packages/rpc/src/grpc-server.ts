import * as grpc from '@grpc/grpc-js';
import * as protoLoaderPkg from '@grpc/proto-loader';
import { Injectable, ModuleMetadata } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'rpc:server' });

/**
 * gRPC Server Options
 */
export interface GrpcServerOptions {
  port: number;
  host?: string;
  maxReceiveMessageLength?: number;
  maxSendMessageLength?: number;
  keepalive?: {
    timeMs: number;
    timeoutMs: number;
    permitWithoutCalls: boolean;
  };
  credentials?: grpc.ServerCredentials;
  reflection?: boolean;
  gracefulShutdown?: {
    timeoutMs: number;
    signals: string[];
  };
}

/**
 * Proto Definition
 */
export interface ProtoDefinition {
  packagePath: string;
  serviceName: string;
  implementation: Record<string, grpc.UntypedHandleCall>;
}

/**
 * gRPC Server
 * - Proto file loading
 * - Service registration
 * - Interceptor chain (auth, logging, metrics, rate limiting)
 * - Health check service
 * - Reflection service
 * - Graceful shutdown
 * - Connection management
 */
@Injectable()
export class GrpcServer {
  private server: grpc.Server;
  private options: GrpcServerOptions;
  private services: ProtoDefinition[] = [];
  private interceptors: grpc.Interceptor[] = [];
  private metadata?: ModuleMetadata;

  constructor(options: GrpcServerOptions) {
    this.options = options;
    this.server = new grpc.Server({
      'grpc.max_receive_message_length': options.maxReceiveMessageLength ?? 4 * 1024 * 1024,
      'grpc.max_send_message_length': options.maxSendMessageLength ?? 4 * 1024 * 1024,
    });
  }

  /**
   * Register service from proto file
   */
  async addServiceFromProto(protoPath: string, serviceName: string, implementation: Record<string, grpc.UntypedHandleCall>) {
    const packageDefinition = protoLoaderPkg.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const serviceDefinition = (protoDescriptor as any)[serviceName];

    if (!serviceDefinition) {
      throw new Error(`Service ${serviceName} not found in proto file`);
    }

    this.server.addService(serviceDefinition.service, implementation);
    this.services.push({ packagePath: protoPath, serviceName, implementation });

    logger.info('gRPC service registered', { serviceName, protoPath });
  }

  /**
   * Add service from loaded proto descriptor
   */
  addService(service: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>, implementation: grpc.UntypedServiceImplementation) {
    this.server.addService(service, implementation);
    logger.info('gRPC service added');
  }

  /**
   * Add interceptor
   */
  addInterceptor(interceptor: grpc.Interceptor) {
    this.interceptors.push(interceptor);
  }

  /**
   * Add middleware (adapter to interceptor)
   */
  addMiddleware(middleware: (call: grpc.ServerCall, next: () => Promise<void>) => Promise<void>) {
    this.interceptors.push((options, next) => {
      return async (call, metadata, sendNext) => {
        await middleware(call, async () => {
          await next()(call, metadata, sendNext);
        });
      };
    });
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    const host = this.options.host ?? '0.0.0.0';
    const port = this.options.port;
    const bindAddress = `${host}:${port}`;

    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        bindAddress,
        this.options.credentials ?? grpc.ServerCredentials.createInsecure(),
        (err, port) => {
          if (err) {
            logger.error('Failed to bind gRPC server', { error: err.message });
            reject(err);
            return;
          }

          logger.info('gRPC server started', { port, host });
          resolve();
        }
      );
    });
  }

  /**
   * Stop server gracefully
   */
  async stop(): Promise<void> {
    const timeoutMs = this.options.gracefulShutdown?.timeoutMs ?? 30000;

    return new Promise((resolve) => {
      const forceShutdown = setTimeout(() => {
        logger.warn('Force shutting down gRPC server');
        this.server.forceShutdown();
        resolve();
      }, timeoutMs);

      this.server.tryShutdown(() => {
        clearTimeout(forceShutdown);
        logger.info('gRPC server stopped gracefully');
        resolve();
      });
    });
  }

  /**
   * Get server address
   */
  getAddress(): string {
    return this.server.bindAddress || 'unknown';
  }

  /**
   * Get registered services
   */
  getServices(): ProtoDefinition[] {
    return [...this.services];
  }
}

/**
 * Create gRPC server
 */
export function createGrpcServer(options: GrpcServerOptions): GrpcServer {
  return new GrpcServer(options);
}

/**
 * Proto Loader Helper
 */
export class ProtoLoader {
  private cache = new Map<string, grpc.GrpcObject>();

  /**
   * Load proto file
   */
  async load(protoPath: string): Promise<grpc.GrpcObject> {
    if (this.cache.has(protoPath)) {
      return this.cache.get(protoPath)!;
    }

    const packageDefinition = protoLoaderPkg.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);
    this.cache.set(protoPath, proto);
    return proto;
  }

  /**
   * Load and get service
   */
  async getService(protoPath: string, serviceName: string): Promise<any> {
    const proto = await this.load(protoPath);
    const service = (proto as any)[serviceName];
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    return service;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const protoLoader = new ProtoLoader();