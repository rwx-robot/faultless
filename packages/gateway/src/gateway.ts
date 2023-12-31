import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'gateway' });

/**
 * Route Match Type
 */
export enum RouteMatchType {
  EXACT = 'EXACT',
  PREFIX = 'PREFIX',
  REGEX = 'REGEX',
}

/**
 * Upstream Service
 */
export interface UpstreamService {
  name: string;
  target: string;
  port?: number;
  protocol?: 'http' | 'https' | 'grpc';
  loadBalancer?: string;
  healthCheck?: {
    path: string;
    intervalMs: number;
  };
}

/**
 * Route Configuration
 */
export interface RouteConfig {
  id: string;
  name: string;
  match: {
    type: RouteMatchType;
    path: string;
    methods?: string[];
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
  upstream: UpstreamService;
  transforms?: {
    request?: RequestTransform[];
    response?: ResponseTransform[];
  };
  plugins?: GatewayPlugin[];
  rateLimit?: {
    max: number;
    windowMs: number;
  };
  timeout?: number;
  retries?: number;
}

/**
 * Request Transform
 */
export interface RequestTransform {
  type: 'add-header' | 'remove-header' | 'set-header' | 'rewrite-path' | 'add-query' | 'remove-query';
  name?: string;
  value?: string;
  pattern?: string;
  replacement?: string;
}

/**
 * Response Transform
 */
export interface ResponseTransform {
  type: 'add-header' | 'remove-header' | 'set-header' | 'remove-body-field' | 'add-body-field';
  name?: string;
  value?: string;
  path?: string;
}

/**
 * Gateway Plugin
 */
export interface GatewayPlugin {
  name: string;
  enabled: boolean;
  config?: any;
  onRoute?: (route: RouteConfig, request: any, reply: any) => Promise<void>;
  onRequest?: (request: any, reply: any) => Promise<void>;
  onResponse?: (request: any, reply: any, response: any) => Promise<void>;
}

/**
 * Gateway Request
 */
export interface GatewayRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  upstream?: UpstreamService;
  route?: RouteConfig;
  startTime: number;
}

/**
 * Gateway Response
 */
export interface GatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  upstream?: UpstreamService;
  duration: number;
}

/**
 * API Gateway
 * - Route matching (exact, prefix, regex)
 * - Upstream load balancing
 * - Request/Response transformation
 * - Plugin system
 * - Rate limiting per route
 * - Timeout configuration
 * - Retry support
 * - Circuit breaker integration
 * - Tracing/Metrics integration
 */
@Injectable()
export class ApiGateway {
  private routes: RouteConfig[] = [];
  private plugins: Map<string, GatewayPlugin> = new Map();
  private upstreams: Map<string, UpstreamService> = new Map();

  /**
   * Add route
   */
  addRoute(config: RouteConfig): void {
    this.routes.push(config);
    this.upstreams.set(config.upstream.name, config.upstream);
    logger.info('Route added', { id: config.id, path: config.match.path, upstream: config.upstream.name });
  }

  /**
   * Remove route
   */
  removeRoute(id: string): boolean {
    const index = this.routes.findIndex(r => r.id === id);
    if (index !== -1) {
      this.routes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get routes
   */
  getRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  /**
   * Register plugin
   */
  registerPlugin(plugin: GatewayPlugin): void {
    this.plugins.set(plugin.name, plugin);
    logger.info('Plugin registered', { name: plugin.name });
  }

  /**
   * Match route
   */
  matchRoute(method: string, path: string, headers?: Record<string, string>): RouteConfig | null {
    for (const route of this.routes) {
      // Check method
      if (route.match.methods && !route.match.methods.includes(method)) {
        continue;
      }

      // Check path
      let pathMatch = false;
      switch (route.match.type) {
        case RouteMatchType.EXACT:
          pathMatch = route.match.path === path;
          break;
        case RouteMatchType.PREFIX:
          pathMatch = path.startsWith(route.match.path);
          break;
        case RouteMatchType.REGEX:
          pathMatch = new RegExp(route.match.path).test(path);
          break;
      }

      if (!pathMatch) continue;

      // Check headers
      if (route.match.headers && headers) {
        const headersMatch = Object.entries(route.match.headers).every(
          ([key, value]) => headers[key] === value
        );
        if (!headersMatch) continue;
      }

      return route;
    }

    return null;
  }

  /**
   * Transform request
   */
  async transformRequest(request: any, route: RouteConfig): Promise<any> {
    if (!route.transforms?.request) return request;

    let transformed = { ...request };

    for (const transform of route.transforms.request) {
      switch (transform.type) {
        case 'add-header':
          transformed.headers[transform.name!] = transform.value!;
          break;
        case 'remove-header':
          delete transformed.headers[transform.name!];
          break;
        case 'set-header':
          transformed.headers[transform.name!] = transform.value!;
          break;
        case 'rewrite-path':
          if (transform.pattern && transform.replacement) {
            transformed.path = transformed.path.replace(
              new RegExp(transform.pattern),
              transform.replacement
            );
          }
          break;
        case 'add-query':
          transformed.query[transform.name!] = transform.value!;
          break;
        case 'remove-query':
          delete transformed.query[transform.name!];
          break;
      }
    }

    return transformed;
  }

  /**
   * Transform response
   */
  async transformResponse(response: any, route: RouteConfig): Promise<any> {
    if (!route.transforms?.response) return response;

    let transformed = { ...response };

    for (const transform of route.transforms.response) {
      switch (transform.type) {
        case 'add-header':
          transformed.headers[transform.name!] = transform.value!;
          break;
        case 'remove-header':
          delete transformed.headers[transform.name!];
          break;
        case 'set-header':
          transformed.headers[transform.name!] = transform.value!;
          break;
        case 'remove-body-field':
          if (transform.path) {
            const fields = transform.path.split('.');
            let obj = transformed.body;
            for (let i = 0; i < fields.length - 1; i++) {
              obj = obj[fields[i]];
            }
            delete obj[fields[fields.length - 1]];
          }
          break;
        case 'add-body-field':
          if (transform.path && transform.value) {
            const fields = transform.path.split('.');
            let obj = transformed.body;
            for (let i = 0; i < fields.length - 1; i++) {
              if (!obj[fields[i]]) obj[fields[i]] = {};
              obj = obj[fields[i]];
            }
            obj[fields[fields.length - 1]] = transform.value;
          }
          break;
      }
    }

    return transformed;
  }

  /**
   * Execute plugin hooks
   */
  async executePlugins(
    hook: 'onRoute' | 'onRequest' | 'onResponse',
    ...args: any[]
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;

      switch (hook) {
        case 'onRoute':
          if (plugin.onRoute) await plugin.onRoute(args[0], args[1], args[2]);
          break;
        case 'onRequest':
          if (plugin.onRequest) await plugin.onRequest(args[0], args[1]);
          break;
        case 'onResponse':
          if (plugin.onResponse) await plugin.onResponse(args[0], args[1], args[2]);
          break;
      }
    }
  }

  /**
   * Get gateway stats
   */
  getStats(): {
    routes: number;
    plugins: number;
    upstreams: number;
  } {
    return {
      routes: this.routes.length,
      plugins: this.plugins.size,
      upstreams: this.upstreams.size,
    };
  }
}

/**
 * Create API Gateway
 */
export function createApiGateway(): ApiGateway {
  return new ApiGateway();
}

/**
 * Gateway Middleware for Fastify
 */
export function createGatewayMiddleware(gateway: ApiGateway) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const route = gateway.matchRoute(
      request.method,
      request.url,
      request.headers as Record<string, string>
    );

    if (!route) {
      // No matching route, continue to next handler
      await next();
      return;
    }

    // Execute onRequest plugins
    await gateway.executePlugins('onRequest', request, reply);

    // Transform request
    const transformedRequest = await gateway.transformRequest(request, route);

    // Attach route info
    request.route = route;
    request.upstream = route.upstream;

    // Execute onRoute plugins
    await gateway.executePlugins('onRoute', route, request, reply);

    await next();
  };
}

/**
 * Response Transformer Middleware
 */
export function createResponseTransformerMiddleware(gateway: ApiGateway) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    await next();

    if (request.route) {
      const transformed = await gateway.transformResponse(
        { statusCode: reply.statusCode, headers: reply.getHeaders(), body: reply.payload },
        request.route
      );

      reply.code(transformed.statusCode);
      Object.entries(transformed.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });
    }
  };
}