import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication, HttpServer } from '../src';

@Injectable()
class TestController {
  @Get('test')
  async getTest() {
    return { message: 'Hello World' };
  }

  @Post('test')
  async postTest(@Body() body: { name: string }) {
    return { message: `Hello ${body.name}` };
  }

  @Get('test/:id')
  async getById(@Param('id') id: string) {
    return { id };
  }
}

@Module({
  controllers: [TestController],
})
class TestModule {}

describe('HttpServer', () => {
  let server: HttpServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should create server', () => {
    server = new HttpServer({ port: 3000 });
    expect(server).toBeDefined();
  });

  it('should register routes', () => {
    server = new HttpServer({ port: 3000 });
    server.route({
      method: 'GET',
      path: '/hello',
      handler: async () => ({ message: 'Hello' }),
    });
    expect(server).toBeDefined();
  });
});

describe('Router', () => {
  it('should create router', () => {
    const { createRouter } = require('../src');
    const router = createRouter();
    expect(router).toBeDefined();
  });
});

describe('Application', () => {
  it('should create application', () => {
    const app = createApplication({
      modules: [TestModule],
    });
    expect(app).toBeDefined();
  });
});

describe('Decorators', () => {
  it('should define controller', () => {
    const metadata = Reflect.getMetadata('controller', TestController);
    expect(metadata).toBeDefined();
  });

  it('should define routes', () => {
    const metadata = Reflect.getMetadata('routes', TestController);
    expect(metadata).toBeDefined();
    expect(metadata.length).toBe(3);
  });
});