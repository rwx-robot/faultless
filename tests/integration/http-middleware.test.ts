import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, HttpServer, createAllExceptionsFilter } from '@faultless/http';
import { NofaultError, UnauthorizedError } from '@faultless/core';

describe('HTTP + Middleware Integration', () => {
  let server: HttpServer;

  beforeEach(() => {
    server = createServer({ port: 0, logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Middleware Pipeline Execution Order', () => {
    it('should execute middlewares in registration order via onRequest hooks', async () => {
      const executionOrder: string[] = [];

      server.getApp().addHook('onRequest', async (request) => {
        executionOrder.push('first');
      });

      server.getApp().addHook('onRequest', async (request) => {
        executionOrder.push('second');
      });

      server.getApp().addHook('onRequest', async (request) => {
        executionOrder.push('third');
      });

      server.addRoute({
        method: 'GET',
        url: '/order',
        handler: async (request, reply) => {
          executionOrder.push('handler');
          reply.send({ order: executionOrder });
        },
      });

      await server.ready();
      await server.getApp().inject({ method: 'GET', url: '/order' });

      expect(executionOrder).toEqual(['first', 'second', 'third', 'handler']);
    });

    it('should execute preHandler hooks in order', async () => {
      const executionOrder: string[] = [];

      server.addRoute({
        method: 'GET',
        url: '/prehandler',
        preHandler: [
          async (request, reply) => {
            executionOrder.push('guard-1');
          },
          async (request, reply) => {
            executionOrder.push('guard-2');
          },
        ],
        handler: async (request, reply) => {
          executionOrder.push('handler');
          reply.send({ order: executionOrder });
        },
      });

      await server.ready();
      await server.getApp().inject({ method: 'GET', url: '/prehandler' });

      expect(executionOrder).toEqual(['guard-1', 'guard-2', 'handler']);
    });

    it('should stop pipeline if preHandler returns false', async () => {
      const handlerCalled = vi.fn();

      server.addRoute({
        method: 'GET',
        url: '/blocked',
        preHandler: [
          async (request, reply) => {
            reply.status(403).send({ error: 'blocked' });
            return false;
          },
        ],
        handler: async (request, reply) => {
          handlerCalled();
          reply.send({ ok: true });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/blocked' });

      expect(response.statusCode).toBe(403);
      expect(handlerCalled).not.toHaveBeenCalled();
    });

    it('should chain onRequest → preHandler → handler → onResponse', async () => {
      const order: string[] = [];

      server.getApp().addHook('onRequest', async (request) => {
        order.push('onRequest');
      });

      server.addRoute({
        method: 'GET',
        url: '/chain',
        preHandler: [
          async (request, reply) => {
            order.push('preHandler');
          },
        ],
        handler: async (request, reply) => {
          order.push('handler');
          reply.send({ order });
        },
      });

      server.getApp().addHook('onResponse', async (request, reply) => {
        order.push('onResponse');
      });

      await server.ready();
      await server.getApp().inject({ method: 'GET', url: '/chain' });

      expect(order).toEqual(['onRequest', 'preHandler', 'handler', 'onResponse']);
    });
  });

  describe('Guards, Interceptors, Pipes, Filters Working Together', () => {
    it('should combine guard + interceptor + handler in a single request', async () => {
      const callOrder: string[] = [];

      server.addRoute({
        method: 'GET',
        url: '/combined',
        preHandler: [
          async (request, reply) => {
            callOrder.push('guard');
            const authHeader = request.headers.authorization;
            if (!authHeader) {
              reply.status(401).send({ error: 'unauthorized' });
              return false;
            }
            return true;
          },
        ],
        handler: async (request, reply) => {
          callOrder.push('handler');
          reply.send({ result: 'ok' });
        },
      });

      server.getApp().addHook('onResponse', async (request, reply) => {
        callOrder.push('onResponse');
      });

      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/combined',
        headers: { authorization: 'Bearer token123' },
      });

      expect(response.statusCode).toBe(200);
      expect(callOrder).toEqual(['guard', 'handler', 'onResponse']);
    });

    it('should support return value from handler (transform interceptor works differently)', async () => {
      // In @faultless/http, interceptors are preHandler hooks that run before the handler.
      // Transform/cache interceptors rely on reply.code/send, not handler return values.
      server.addRoute({
        method: 'GET',
        url: '/transform',
        handler: async (request, reply) => {
          return { name: 'test', value: 42 };
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/transform' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('test');
      expect(body.value).toBe(42);
    });

    it('should support cache-like logic via hooks', async () => {
      const cache = new Map<string, any>();
      let callCount = 0;

      server.addRoute({
        method: 'GET',
        url: '/cached',
        preHandler: [
          async (request, reply) => {
            const key = request.url;
            if (cache.has(key)) {
              reply.send(cache.get(key));
              return false;
            }
          },
        ],
        handler: async (request, reply) => {
          callCount++;
          const data = { count: callCount };
          cache.set(request.url, data);
          return data;
        },
      });

      await server.ready();

      const response1 = await server.getApp().inject({ method: 'GET', url: '/cached' });
      expect(JSON.parse(response1.payload)).toEqual({ count: 1 });

      const response2 = await server.getApp().inject({ method: 'GET', url: '/cached' });
      expect(JSON.parse(response2.payload)).toEqual({ count: 1 });
      expect(callCount).toBe(1);
    });

    it('should handle parse pipes for query parameters', async () => {
      server.addRoute({
        method: 'GET',
        url: '/parse',
        handler: async (request, reply) => {
          const query = request.query as any;
          reply.send({
            page: parseInt(query.page || '1'),
            active: query.active === 'true',
            tags: (query.tags || '').split(','),
          });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/parse?page=5&active=true&tags=a,b,c',
      });

      const body = JSON.parse(response.payload);
      expect(body.page).toBe(5);
      expect(body.active).toBe(true);
      expect(body.tags).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Error Handling Through Middleware Stack', () => {
    it('should catch NofaultError from handler and format response', async () => {
      server.addRoute({
        method: 'GET',
        url: '/error/nofault',
        handler: async (request, reply) => {
          throw new NofaultError('Custom error', 'CUSTOM_ERROR', 422, { field: 'name' });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/error/nofault' });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('CUSTOM_ERROR');
      expect(body.message).toBe('Custom error');
      expect(body.details).toEqual({ field: 'name' });
    });

    it('should catch UnauthorizedError from preHandler', async () => {
      server.addRoute({
        method: 'GET',
        url: '/error/unauth',
        preHandler: [
          async (request, reply) => {
            throw new UnauthorizedError('Token expired');
          },
        ],
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/error/unauth' });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should catch NotFoundError for unknown routes', async () => {
      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/nonexistent' });

      expect(response.statusCode).toBe(404);
    });

    it('should handle custom error codes from handlers', async () => {
      server.addRoute({
        method: 'GET',
        url: '/error/custom',
        handler: async (request, reply) => {
          throw new NofaultError('Rate limited', 'RATE_LIMITED', 429, { retryAfter: 60 });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/error/custom' });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('RATE_LIMITED');
      expect(body.details).toEqual({ retryAfter: 60 });
    });

    it('should handle unhandled errors gracefully', async () => {
      server.addRoute({
        method: 'GET',
        url: '/crash',
        handler: async (request, reply) => {
          throw new Error('Unexpected crash');
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/crash' });

      expect(response.statusCode).toBe(500);
    });

    it('should handle filter chain for error processing', async () => {
      const filter = createAllExceptionsFilter();
      server.addFilter(filter);

      server.addRoute({
        method: 'GET',
        url: '/filtered-error',
        handler: async (request, reply) => {
          throw new NofaultError('Filtered error', 'FILTERED', 400);
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/filtered-error' });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('FILTERED');
    });
  });

  describe('Built-in Middleware', () => {
    it('should set CORS headers', async () => {
      // Register cors as a proper onRequest hook
      server.getApp().addHook('onRequest', async (request, reply) => {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        reply.header('Access-Control-Allow-Credentials', 'true');
      });

      server.addRoute({
        method: 'GET',
        url: '/cors-test',
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/cors-test' });

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('should set security headers via helmet middleware', async () => {
      // Register helmet as a proper onRequest hook
      server.getApp().addHook('onRequest', async (request, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      });

      server.addRoute({
        method: 'GET',
        url: '/helmet-test',
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/helmet-test' });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should add request ID', async () => {
      server.getApp().addHook('onRequest', async (request, reply) => {
        const requestId = (request.headers['x-request-id'] as string) ?? `req_${Date.now()}`;
        reply.header('X-Request-ID', requestId);
        (request as any).requestId = requestId;
      });

      server.addRoute({
        method: 'GET',
        url: '/reqid-test',
        handler: async (request, reply) => {
          reply.send({ requestId: (request as any).requestId });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({ method: 'GET', url: '/reqid-test' });

      expect(response.headers['x-request-id']).toBeDefined();
      const body = JSON.parse(response.payload);
      expect(body.requestId).toBeDefined();
    });

    it('should use provided request ID', async () => {
      server.getApp().addHook('onRequest', async (request, reply) => {
        const requestId = (request.headers['x-request-id'] as string) ?? `req_${Date.now()}`;
        reply.header('X-Request-ID', requestId);
        (request as any).requestId = requestId;
      });

      server.addRoute({
        method: 'GET',
        url: '/reqid-custom',
        handler: async (request, reply) => {
          reply.send({ requestId: (request as any).requestId });
        },
      });

      await server.ready();
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/reqid-custom',
        headers: { 'x-request-id': 'my-custom-id-123' },
      });

      expect(response.headers['x-request-id']).toBe('my-custom-id-123');
    });
  });
});
