import { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import { Constructor, Provider, ModuleMetadata, DynamicModule } from '@faultless/core';

export type { RouteOptions };

export interface HttpServerOptions {
  port: number;
  host?: string;
  https?: {
    key: string;
    cert: string;
  };
  logger?: boolean | object;
  trustProxy?: boolean;
  bodyLimit?: number;
  keepAliveTimeout?: number;
}

export interface RouteMetadata {
  method: string;
  path: string;
  handler: string;
  middlewares?: Constructor[];
  guards?: Constructor[];
  interceptors?: Constructor[];
  pipes?: Constructor[];
  filters?: Constructor[];
}

export interface ControllerMetadata {
  prefix: string;
  routes: RouteMetadata[];
}

export interface MiddlewareFunction {
  (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void>;
}

export interface GuardFunction {
  (request: FastifyRequest, reply: FastifyReply): Promise<boolean> | boolean;
}

export interface InterceptorFunction {
  (request: FastifyRequest, reply: FastifyReply, next: () => Promise<unknown>): Promise<unknown>;
}

export interface PipeFunction {
  (value: unknown, metadata: PipeMetadata): Promise<unknown>;
}

export interface PipeMetadata {
  type: 'body' | 'query' | 'param' | 'header' | 'custom';
  metatype?: Constructor;
  data?: string;
}

export interface FilterFunction {
  (exception: Error, request: FastifyRequest, reply: FastifyReply): Promise<void> | void;
}

export interface ApplicationModule extends ModuleMetadata {
  imports?: Array<Constructor | DynamicModule>;
  controllers?: Constructor[];
  providers?: Provider[];
  exports?: Array<Constructor | string | symbol>;
}

export interface HttpApplicationOptions {
  modules: Array<Constructor | DynamicModule>;
  serverOptions?: Partial<HttpServerOptions>;
}

export type FastifyApp = FastifyInstance;

export const HTTP_SERVER_TOKEN = Symbol('http:server');
export const ROUTER_TOKEN = Symbol('http:router');
export const MIDDLEWARE_TOKEN = Symbol('http:middleware');
export const GUARD_TOKEN = Symbol('http:guard');
export const INTERCEPTOR_TOKEN = Symbol('http:interceptor');
export const PIPE_TOKEN = Symbol('http:pipe');
export const FILTER_TOKEN = Symbol('http:filter');