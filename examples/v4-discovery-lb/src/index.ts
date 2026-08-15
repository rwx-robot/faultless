import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Query, Module, Injectable, OnModuleInit, OnModuleDestroy } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import { InMemoryServiceRegistry, createInMemoryRegistry, ServiceInstance } from '@faultless/discovery';
import { HealthModule, MemoryHealthIndicator } from '@faultless/http';

const logger = createLogger({ level: 'debug', structuredFields: true, serviceName: 'v4-discovery-example' });

@Injectable()
class UserService implements OnModuleInit, OnModuleDestroy {
  private users = new Map<string, { id: string; name: string; email: string }>();
  private registry: InMemoryServiceRegistry;
  private instanceId: string;

  constructor(registry: InMemoryServiceRegistry) {
    this.registry = registry;
    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
    this.users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });
  }

  async onModuleInit() {
    const instance = await this.registry.register({
      name: 'user-service',
      address: 'localhost',
      port: 3000,
      metadata: { version: '1.0.0', zone: 'us-east-1' },
      tags: ['api', 'users'],
      healthCheck: { type: 'http', interval: 10000, path: '/health' },
      heartbeatInterval: 5000,
    });
    this.instanceId = instance.id;
    logger.info('User service registered', { instanceId: this.instanceId });
  }

  async onModuleDestroy() {
    if (this.instanceId) {
      await this.registry.deregister(this.instanceId);
      logger.info('User service deregistered', { instanceId: this.instanceId });
    }
  }

  findAll() {
    return Array.from(this.users.values());
  }

  findById(id: string) {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  create(user: { name: string; email: string }) {
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    return newUser;
  }
}

@Injectable()
class OrderService {
  private orders = new Map<string, { id: string; userId: string; items: string[]; total: number }>();

  findAll() {
    return Array.from(this.orders.values());
  }

  findById(id: string) {
    const order = this.orders.get(id);
    if (!order) throw new Error('Order not found');
    return order;
  }

  create(order: { userId: string; items: string[]; total: number }) {
    const id = String(this.orders.size + 1);
    const newOrder = { id, ...order };
    this.orders.set(id, newOrder);
    return newOrder;
  }
}

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

@Controller('orders')
class OrdersController {
  constructor(private orderService: OrderService) {}

  @Get()
  findAll() {
    return this.orderService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.orderService.findById(id);
  }

  @Post()
  create(@Body() body: { userId: string; items: string[]; total: number }) {
    return this.orderService.create(body);
  }
}

@Controller('discovery')
class DiscoveryController {
  constructor(private registry: InMemoryServiceRegistry) {}

  @Get('services')
  getServices() {
    return this.registry.listAllServices();
  }

  @Get('instances/:serviceName')
  getInstances(@Param('serviceName') serviceName: string) {
    return this.registry.listInstances(serviceName);
  }

  @Post('instances')
  async registerInstance(@Body() body: { name: string; address: string; port: number; metadata?: Record<string, string> }) {
    const instance = await this.registry.register({
      name: body.name,
      address: body.address,
      port: body.port,
      metadata: body.metadata,
    });
    return instance;
  }

  @Post('instances/:instanceId/deregister')
  async deregisterInstance(@Param('instanceId') instanceId: string) {
    await this.registry.deregister(instanceId);
    return { success: true };
  }
}

@Controller('load-balancer')
class LoadBalancerController {
  private instances: ServiceInstance[] = [
    { id: 'svc-1', name: 'api-service', address: 'localhost', port: 3001, metadata: { weight: '2' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
    { id: 'svc-2', name: 'api-service', address: 'localhost', port: 3002, metadata: { weight: '1' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
    { id: 'svc-3', name: 'api-service', address: 'localhost', port: 3003, metadata: { weight: '1' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
  ];

  @Get('pick/:strategy')
  async pick(@Param('strategy') strategy: string, @Query('key') key?: string) {
    const { createLoadBalancer } = await import('@faultless/discovery');
    
    const lb = createLoadBalancer({
      name: 'api-service',
      discovery: { getInstances: () => this.instances, watch: () => () => {} },
      strategy: strategy as any,
    });

    const instance = await lb.pick(key);
    return instance ? { id: instance.id, address: instance.address, port: instance.port } : null;
  }

  @Get('pick-all/:strategy')
  async pickAll(@Param('strategy') strategy: string) {
    const { createLoadBalancer } = await import('@faultless/discovery');
    
    const lb = createLoadBalancer({
      name: 'api-service',
      discovery: { getInstances: () => this.instances, watch: () => () => {} },
      strategy: strategy as any,
    });

    const instances = await lb.pickAll();
    return instances.map(i => ({ id: i.id, address: i.address, port: i.port }));
  }
}

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

@Module({
  controllers: [UsersController, OrdersController, DiscoveryController, LoadBalancerController, HealthController],
  providers: [UserService, OrderService],
  imports: [
    HealthModule.forRoot({
      includeDetails: true,
      indicators: [new MemoryHealthIndicator()],
    }),
  ],
})
class AppModule {}

async function main() {
  const registry = createInMemoryRegistry();

  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);