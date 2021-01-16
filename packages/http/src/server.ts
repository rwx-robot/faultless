import Fastify, { FastifyInstance, FastifyServerOptions, FastifyRequest, FastifyReply } from 'fastify';
import { HttpServerOptions, RouteOptions, RouteMetadata, MiddlewareFunction, GuardFunction, InterceptorFunction, PipeFunction, FilterFunction, FastifyApp } from './types';
import { NofaultError, ValidationError, NotFoundError, isNofaultError } from '@faultless/core';

export class HttpServer {
  private app: FastifyInstance;
  private options: HttpServerOptions;
  private routes: Map<string, RouteMetadata> = new Map();
  private middlewares: MiddlewareFunction[] = [];
  private guards: GuardFunction[] = [];
  private interceptors: InterceptorFunction[] = [];
  private pipes: Map<string, PipeFunction> = new Map();
  private filters: FilterFunction[] = [];

  constructor(options: HttpServerOptions) {
    this.options = options;

    const fastifyOptions: FastifyServerOptions = {
      logger: options.logger ?? false,
      trustProxy: options.trustProxy ?? true,
      bodyLimit: options.bodyLimit ?? 1024 * 1024,
      keepAliveTimeout: options.keepAliveTimeout ?? 5000,
      disableRequestLogging: true,
    };

    if (options.https) {
      (fastifyOptions as any).https = options.https;
    }

    this.app = Fastify(fastifyOptions);
    this.setupErrorHandler();
    this.setupNotFoundHandler();
  }

  getApp(): FastifyApp {
    return this.app;
  }

  getOptions(): HttpServerOptions {
    return this.options;
  }

  private setupErrorHandler(): void {
    this.app.setErrorHandler(async (error, request, reply) => {
      const requestId = (request.headers['x-request-id'] as string) ?? generateRequestId();

      if (isNofaultError(error)) {
        reply.status(error.statusCode).send({
          error: error.code,
          message: error.message,
          details: error.details,
          requestId,
          timestamp: error.timestamp.toISOString(),
        });
        return;
      }

      if (error.validation) {
        const validationError = new ValidationError(
          'Validation failed',
          error.validation[0]?.instancePath?.slice(1) || 'body',
          error.validation.reduce((acc: Record<string, string>, v) => {
            acc[v.instancePath?.slice(1) || 'body'] = v.message || 'Invalid value';
            return acc;
          }, {}),
          requestId
        );
        reply.status(validationError.statusCode).send(validationError.toJSON());
        return;
      }

      const internalError = new NofaultError(
        'Internal server error',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message },
        requestId
      );

      this.app.log.error({ err: error, requestId }, 'Unhandled error');
      reply.status(500).send(internalError.toJSON());
    });
  }

  private setupNotFoundHandler(): void {
    this.app.setNotFoundHandler(async (request, reply) => {
      const requestId = (request.headers['x-request-id'] as string) ?? generateRequestId();
      const error = new NotFoundError('Route', `${request.method} ${request.url}`, requestId);
      reply.status(404).send(error.toJSON());
    });
  }

  addRoute(route: RouteOptions): void {
    this.app.route(route);
  }

  addMiddleware(middleware: MiddlewareFunction): void {
    this.middlewares.push(middleware);
    this.app.addHook('onRequest', middleware);
  }

  addGuard(guard: GuardFunction): void {
    this.guards.push(guard);
    this.app.addHook('preHandler', async (request, reply) => {
      for (const guard of this.guards) {
        const result = await guard(request, reply);
        if (!result) {
          return false;
        }
      }
      return true;
    });
  }

  addInterceptor(interceptor: InterceptorFunction): void {
    this.interceptors.push(interceptor);
    this.app.addHook('preHandler', async (request, reply) => {
      let response: unknown;
      const next = async () => {
        return response;
      };
      for (const interceptor of this.interceptors) {
        response = await interceptor(request, reply, next);
      }
      return response;
    });
  }

  addPipe(name: string, pipe: PipeFunction): void {
    this.pipes.set(name, pipe);
  }

  addFilter(filter: FilterFunction): void {
    this.filters.push(filter);
  }

  async listen(): Promise<void> {
    try {
      await this.app.listen({
        port: this.options.port,
        host: this.options.host ?? '0.0.0.0',
      });
      this.app.log.info(`Server listening on ${this.options.host ?? '0.0.0.0'}:${this.options.port}`);
    } catch (error) {
      this.app.log.error(error, 'Failed to start server');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  ready(): Promise<void> {
    return this.app.ready();
  }

  decorateRequest<T>(name: string, decorator: T): void {
    this.app.decorateRequest(name, decorator);
  }

  decorateReply<T>(name: string, decorator: T): void {
    this.app.decorateReply(name, decorator);
  }

  registerPlugin(plugin: FastifyPluginAsync | FastifyPluginSync, options?: any): void {
    this.app.register(plugin, options);
  }
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type FastifyPluginAsync = (app: FastifyInstance, options: any) => Promise<void>;
type FastifyPluginSync = (app: FastifyInstance, options: any) => void;

export function createServer(options: HttpServerOptions): HttpServer {
  return new HttpServer(options);
}