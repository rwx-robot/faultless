import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  CacheManager,
  createCacheManager,
  CacheProvider,
  MultiLevelCache,
  createMultiLevelCache,
} from '@faultless/cache';

const logger = createLogger({ level: 'info', serviceName: 'v7-cache-store' });

// In-memory data store
const users = new Map<string, { id: string; name: string; email: string }>();
users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });

@Injectable()
class UserService {
  private cache: CacheManager;

  constructor() {
    this.cache = createCacheManager({
      provider: CacheProvider.MEMORY,
      ttl: 60000,
      prefix: 'user:',
    });
  }

  async findById(id: string): Promise<{ id: string; name: string; email: string } | null> {
    // Try cache first
    const cached = await this.cache.get<{ id: string; name: string; email: string }>(id);
    if (cached) {
      logger.info('Cache hit', { id });
      return cached;
    }

    // Fetch from store
    logger.info('Cache miss', { id });
    const user = users.get(id);
    if (!user) return null;

    // Cache for later
    await this.cache.set(id, user, 30000);
    return user;
  }

  async create(user: { name: string; email: string }): Promise<{ id: string; name: string; email: string }> {
    const id = String(users.size + 1);
    const newUser = { id, ...user };
    users.set(id, newUser);

    // Invalidate list cache
    await this.cache.delete('list');

    return newUser;
  }

  async list(): Promise<Array<{ id: string; name: string; email: string }>> {
    const cacheKey = 'list';
    const cached = await this.cache.get<Array<{ id: string; name: string; email: string }>>(cacheKey);
    if (cached) {
      logger.info('List cache hit');
      return cached;
    }

    logger.info('List cache miss');
    const allUsers = Array.from(users.values());
    await this.cache.set(cacheKey, allUsers, 10000);
    return allUsers;
  }

  async invalidateUser(id: string): Promise<void> {
    await this.cache.delete(id);
    await this.cache.delete('list');
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

@Injectable()
class ProductService {
  private multiLevelCache: MultiLevelCache;

  constructor() {
    this.multiLevelCache = createMultiLevelCache({
      l1: {
        provider: CacheProvider.MEMORY,
        ttl: 30000,
        prefix: 'product:l1:',
        max: 100,
      },
      // L2 would be Redis in production
    });
  }

  async findById(id: string): Promise<any | null> {
    return this.multiLevelCache.get(id);
  }

  async create(product: any): Promise<any> {
    const newProduct = { id: String(Date.now()), ...product };
    await this.multiLevelCache.set(newProduct.id, newProduct);
    return newProduct;
  }

  getCacheStats() {
    return this.multiLevelCache.getStats();
  }
}

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  list() {
    return this.userService.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }

  @Post(':id/invalidate')
  invalidate(@Param('id') id: string) {
    return this.userService.invalidateUser(id);
  }

  @Get('cache/stats')
  getCacheStats() {
    return this.userService.getCacheStats();
  }
}

@Controller('products')
class ProductsController {
  constructor(private productService: ProductService) {}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.productService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; price: number }) {
    return this.productService.create(body);
  }

  @Get('cache/stats')
  getCacheStats() {
    return this.productService.getCacheStats();
  }
}

@Module({
  controllers: [UsersController, ProductsController],
  providers: [UserService, ProductService],
})
class AppModule {}

async function main() {
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