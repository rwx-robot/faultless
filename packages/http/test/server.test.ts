import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, HttpServer } from '../src/server';
import { createApplication, runApplication, HttpApplication } from '../src/application';
import { Controller, Get, Post, Body, Param, Query, Module, Injectable } from '@faultless/core';

describe('HttpServer', () => {
  let server: HttpServer;

  beforeEach(() => {
    server = createServer({ port: 0, logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  it('should create server instance', () => {
    expect(server).toBeInstanceOf(HttpServer);
  });

  it('should get fastify app', () => {
    const app = server.getApp();
    expect(app).toBeDefined();
  });

  it('should add route', () => {
    server.addRoute({
      method: 'GET',
      url: '/test',
      handler: async (request, reply) => {
        reply.send({ ok: true });
      },
    });

    const routes = server.getApp().routes;
    expect(routes).toHaveLength(1);
  });

  it('should add middleware', async () => {
    const middleware = vi.fn().mockImplementation(async (req, reply, next) => {
      (req as any).custom = 'value';
      await next();
    });

    server.addMiddleware(middleware);
    server.addRoute({
      method: 'GET',
      url: '/middleware-test',
      handler: async (request, reply) => {
        reply.send({ custom: (request as any).custom });
      },
    });

    await server.ready();
    await server.listen();

    const response = await server.getApp().inject({
      method: 'GET',
      url: '/middleware-test',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ custom: 'value' });
  });
});

describe('HttpApplication', () => {
  let app: HttpApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should create and initialize application', async () => {
    @Controller()
    class TestController {
      @Get('/hello')
      hello() {
        return { message: 'Hello World' };
      }
    }

    @Module({
      controllers: [TestController],
    })
    class TestModule {}

    app = await createApplication({
      modules: [TestModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/hello',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ message: 'Hello World' });
  });

  it('should handle route parameters', async () => {
    @Controller('users')
    class UsersController {
      @Get(':id')
      getUser(@Param('id') id: string) {
        return { id, name: `User ${id}` };
      }
    }

    @Module({ controllers: [UsersController] })
    class UsersModule {}

    app = await createApplication({
      modules: [UsersModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/users/123',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ id: '123', name: 'User 123' });
  });

  it('should handle query parameters', async () => {
    @Controller('search')
    class SearchController {
      @Get()
      search(@Query('q') query: string, @Query('limit') limit: number = 10) {
        return { query, limit, results: [] };
      }
    }

    @Module({ controllers: [SearchController] })
    class SearchModule {}

    app = await createApplication({
      modules: [SearchModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/search?q=test&limit=5',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ query: 'test', limit: 5, results: [] });
  });

  it('should handle POST body', async () => {
    @Controller('items')
    class ItemsController {
      @Post()
      create(@Body() body: { name: string }) {
        return { id: '1', ...body };
      }
    }

    @Module({ controllers: [ItemsController] })
    class ItemsModule {}

    app = await createApplication({
      modules: [ItemsModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'POST',
      url: '/items',
      payload: { name: 'Test Item' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ id: '1', name: 'Test Item' });
  });

  it('should return 404 for unknown routes', async () => {
    @Module({})
    class EmptyModule {}

    app = await createApplication({
      modules: [EmptyModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/unknown',
    });

    expect(response.statusCode).toBe(404);
  });

  it('should inject providers', async () => {
    @Injectable()
    class TestService {
      getValue() {
        return 'service-value';
      }
    }

    @Controller('service')
    class ServiceController {
      constructor(private service: TestService) {}

      @Get()
      getValue() {
        return { value: this.service.getValue() };
      }
    }

    @Module({
      controllers: [ServiceController],
      providers: [TestService],
    })
    class ServiceModule {}

    app = await createApplication({
      modules: [ServiceModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/service',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ value: 'service-value' });
  });
});