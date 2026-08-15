import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  ApiGateway,
  createApiGateway,
  RouteMatchType,
  createGatewayMiddleware,
  createResponseTransformerMiddleware,
  GatewayPlugin,
} from '@faultless/gateway';

const logger = createLogger({ level: 'info', serviceName: 'v9-gateway' });

// Create gateway
const gateway = createApiGateway();

// Register routes
gateway.addRoute({
  id: 'users-list',
  name: 'List Users',
  match: {
    type: RouteMatchType.EXACT,
    path: '/api/users',
    methods: ['GET'],
  },
  upstream: {
    name: 'user-service',
    target: 'http://localhost:3001',
  },
  rateLimit: { max: 100, windowMs: 60000 },
});

gateway.addRoute({
  id: 'users-get',
  name: 'Get User',
  match: {
    type: RouteMatchType.PREFIX,
    path: '/api/users/',
    methods: ['GET'],
  },
  upstream: {
    name: 'user-service',
    target: 'http://localhost:3001',
  },
  transforms: {
    request: [
      { type: 'add-header', name: 'X-Gateway', value: 'nofault' },
    ],
    response: [
      { type: 'add-header', name: 'X-Gateway-Response', value: 'true' },
    ],
  },
});

gateway.addRoute({
  id: 'users-create',
  name: 'Create User',
  match: {
    type: RouteMatchType.EXACT,
    path: '/api/users',
    methods: ['POST'],
  },
  upstream: {
    name: 'user-service',
    target: 'http://localhost:3001',
  },
  rateLimit: { max: 10, windowMs: 60000 },
});

gateway.addRoute({
  id: 'orders-list',
  name: 'List Orders',
  match: {
    type: RouteMatchType.EXACT,
    path: '/api/orders',
    methods: ['GET'],
  },
  upstream: {
    name: 'order-service',
    target: 'http://localhost:3002',
  },
});

gateway.addRoute({
  id: 'products-search',
  name: 'Search Products',
  match: {
    type: RouteMatchType.REGEX,
    path: '^/api/products/search',
    methods: ['GET'],
  },
  upstream: {
    name: 'product-service',
    target: 'http://localhost:3003',
  },
});

// Register logging plugin
const loggingPlugin: GatewayPlugin = {
  name: 'logging',
  enabled: true,
  onRequest: async (request, reply) => {
    logger.info('Request received', {
      method: request.method,
      url: request.url,
    });
  },
  onResponse: async (request, reply, response) => {
    logger.info('Response sent', {
      method: request.method,
      url: request.url,
      statusCode: response.statusCode,
      duration: response.duration,
    });
  },
};

gateway.registerPlugin(loggingPlugin);

@Injectable()
class GatewayController {
  @Get('stats')
  getStats() {
    return gateway.getStats();
  }

  @Get('routes')
  getRoutes() {
    return gateway.getRoutes();
  }

  @Post('routes')
  addRoute(@Body() body: any) {
    gateway.addRoute(body);
    return { success: true };
  }

  @Post('routes/:id/remove')
  removeRoute(@Param('id') id: string) {
    const removed = gateway.removeRoute(id);
    return { success: removed };
  }
}

@Module({
  controllers: [GatewayController],
  providers: [],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
      middleware: [
        createGatewayMiddleware(gateway),
        createResponseTransformerMiddleware(gateway),
      ],
    },
  });
}

main().catch(console.error);