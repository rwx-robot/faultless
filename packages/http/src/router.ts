import { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import { RouteMetadata, ControllerMetadata, PipeFunction, PipeMetadata } from './types';
import { ValidationError, NofaultError } from '@faultless/core';
import { getRouteMetadata, getControllerPrefix, getParamMetadata, ParamMetadata } from '@faultless/core';

// Pre-compiled route pattern cache
const routePatternCache = new Map<string, RegExp>();
const routeParamCache = new Map<string, string[]>();

// Fast path resolver with memoization
function getCompiledRoute(pattern: string): { regex: RegExp; paramNames: string[] } {
  let cached = routePatternCache.get(pattern);
  if (cached) {
    return { regex: cached, paramNames: routeParamCache.get(pattern)! };
  }

  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  
  cached = new RegExp(`^${regexStr}$`);
  routePatternCache.set(pattern, cached);
  routeParamCache.set(pattern, paramNames);

  return { regex: cached, paramNames };
}

export class Router {
  private app: FastifyInstance;
  private controllers: Map<string, ControllerMetadata> = new Map();
  private globalPipes: Map<string, PipeFunction> = new Map();
  
  // Pre-resolved handler cache
  private handlerCache = new Map<string, Function>();

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  registerController(controller: any): void {
    const prefix = getControllerPrefix(controller.constructor);
    const routes = getRouteMetadata(controller.constructor);

    const metadata: ControllerMetadata = {
      prefix,
      routes: routes.map(r => ({
        ...r,
        handler: r.handler,
      })),
    };

    this.controllers.set(controller.constructor.name, metadata);
    this.registerRoutes(controller, metadata);
  }

  private registerRoutes(instance: any, metadata: ControllerMetadata): void {
    for (const route of metadata.routes) {
      const handler = instance[route.handler];
      if (!handler) continue;

      const paramMetadata = getParamMetadata(instance.constructor, route.handler);
      const fullPath = this.joinPath(metadata.prefix, route.path);
      
      // Pre-compile route pattern
      getCompiledRoute(fullPath);
      
      // Cache resolved handler
      const handlerKey = `${route.method}:${fullPath}`;
      this.handlerCache.set(handlerKey, handler);

      const fastifyRoute: RouteOptions = {
        method: route.method as any,
        url: fullPath,
        handler: this.createHandler(instance, route.handler, paramMetadata),
        schema: this.buildSchema(route, paramMetadata),
      };

      this.app.route(fastifyRoute);
    }
  }

  private createHandler(
    instance: any,
    handlerName: string,
    paramMetadata: ParamMetadata[]
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    // Pre-resolve param extractors for faster request handling
    const paramExtractors = paramMetadata.map(param => {
      switch (param.type) {
        case 'param':
          return param.name 
            ? (req: FastifyRequest) => (req.params as Record<string, unknown>)[param.name!]
            : (req: FastifyRequest) => req.params;
        case 'query':
          return param.name
            ? (req: FastifyRequest) => (req.query as Record<string, unknown>)[param.name!]
            : (req: FastifyRequest) => req.query;
        case 'body':
          return (req: FastifyRequest) => req.body;
        case 'headers':
          return param.name
            ? (req: FastifyRequest) => (req.headers as Record<string, unknown>)[param.name!]
            : (req: FastifyRequest) => req.headers;
        case 'req':
          return (req: FastifyRequest) => req;
        case 'res':
          return (_req: FastifyRequest, reply: FastifyReply) => reply;
        case 'next':
          return () => () => Promise.resolve();
        case 'session':
          return param.name
            ? (req: FastifyRequest) => (req.session as Record<string, unknown>)?.[param.name!]
            : (req: FastifyRequest) => req.session;
        default:
          return () => undefined;
      }
    });
    
    const hasValidation = this.globalPipes.has('validation');

    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const args: unknown[] = new Array(paramExtractors.length);
      
      for (let i = 0; i < paramExtractors.length; i++) {
        let value = paramExtractors[i](request, reply);
        
        if (value !== undefined && hasValidation) {
          const pipe = this.globalPipes.get('validation')!;
          value = await pipe(value, { type: paramMetadata[i].type, data: paramMetadata[i].name });
        }
        
        args[i] = value;
      }

      const result = await instance[handlerName](...args);

      if (result !== undefined && result !== null) {
        reply.send(result);
      }
    };
  }

  private buildSchema(route: RouteMetadata, paramMetadata: ParamMetadata[]): RouteOptions['schema'] {
    const schema: Record<string, any> = {
      params: this.buildParamSchema(paramMetadata.filter(p => p.type === 'param')),
      query: this.buildParamSchema(paramMetadata.filter(p => p.type === 'query')),
    };

    if (!['GET', 'HEAD', 'DELETE'].includes(route.method)) {
      schema.body = this.buildBodySchema(paramMetadata.find(p => p.type === 'body'));
    }

    return schema;
  }

  private buildParamSchema(params: ParamMetadata[]): object {
    const properties: Record<string, { type: string }> = {};
    const required: string[] = [];

    for (const param of params) {
      if (param.name) {
        properties[param.name] = { type: 'string' };
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private buildBodySchema(param: ParamMetadata | undefined): object {
    return {
      type: 'object',
    };
  }

  private joinPath(prefix: string, path: string): string {
    // Optimized path joining with cached regex
    if (!prefix) return path.startsWith('/') ? path : `/${path}`;
    if (!path) return prefix.endsWith('/') ? prefix : `${prefix}/`;
    
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${normalizedPrefix}${normalizedPath}`;
  }

  addGlobalPipe(name: string, pipe: PipeFunction): void {
    this.globalPipes.set(name, pipe);
  }

  getRegisteredControllers(): string[] {
    return Array.from(this.controllers.keys());
  }

  getControllerMetadata(name: string): ControllerMetadata | undefined {
    return this.controllers.get(name);
  }
}

export function createRouter(app: FastifyInstance): Router {
  return new Router(app);
}