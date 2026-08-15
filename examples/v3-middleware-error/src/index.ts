import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Query, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import { CircuitBreaker, createCircuitBreaker } from '@faultless/breaker';
import { RateLimiter, createRateLimiter } from '@faultless/limit';
import { HealthModule, MemoryHealthIndicator, CustomHealthIndicator } from '@faultless/http';

const logger = createLogger({ level: 'debug', structuredFields: true, serviceName: 'v3-example' });

@Injectable()
class UnreliableService {
  private failureCount = 0;
  private shouldFail = false;

  async callExternalApi(data: any) {
    this.failureCount++;

    if (this.shouldFail || this.failureCount % 3 === 0) {
      throw new Error('External service unavailable');
    }

    return { success: true, data, timestamp: new Date().toISOString() };
  }

  setFailureMode(fail: boolean) {
    this.shouldFail = fail;
  }

  getFailureCount() {
    return this.failureCount;
  }
}

@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string; email: string }>();
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  constructor() {
    this.circuitBreaker = createCircuitBreaker({
      name: 'user-service',
      threshold: 3,
      timeout: 30000,
      resetTimeout: 10000,
      fallback: async (error) => ({ error: 'Service degraded', fallback: true }),
    });

    this.rateLimiter = createRateLimiter({
      name: 'user-api',
      windowMs: 60000,
      max: 10,
      keyPrefix: 'user:',
    });

    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
    this.users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });
  }

  async findAll() {
    await this.rateLimiter.consume('list');
    return Array.from(this.users.values());
  }

  async findById(id: string) {
    await this.rateLimiter.consume(`get:${id}`);
    const user = this.users.get(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async create(user: { name: string; email: string }) {
    await this.rateLimiter.consume('create');
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    return newUser;
  }

  async callWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(operation);
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  getRateLimiterStats() {
    return this.rateLimiter.getConfig();
  }
}

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  async create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

@Controller('circuit-breaker')
class CircuitBreakerController {
  constructor(private userService: UserService) {}

  @Get('stats')
  getStats() {
    return this.userService.getCircuitBreakerStats();
  }

  @Post('reset')
  reset() {
    this.userService['circuitBreaker'].reset();
    return { success: true };
  }

  @Post('force-open')
  forceOpen() {
    this.userService['circuitBreaker'].forceOpen();
    return { success: true };
  }

  @Post('force-closed')
  forceClosed() {
    this.userService['circuitBreaker'].forceClosed();
    return { success: true };
  }
}

@Controller('rate-limit')
class RateLimitController {
  constructor(private userService: UserService) {}

  @Get('stats')
  getStats() {
    return this.userService.getRateLimiterStats();
  }

  @Post('reset')
  async reset() {
    await this.userService['rateLimiter'].resetAll();
    return { success: true };
  }
}

@Controller('unreliable')
class UnreliableController {
  constructor(private unreliableService: UnreliableService) {}

  @Get('call')
  async call(@Query('fail') fail?: string) {
    if (fail === 'true') {
      this.unreliableService.setFailureMode(true);
    } else if (fail === 'false') {
      this.unreliableService.setFailureMode(false);
    }

    try {
      const result = await this.unreliableService.callExternalApi({ test: 'data' });
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('stats')
  getStats() {
    return { failureCount: this.unreliableService.getFailureCount() };
  }
}

@Module({
  controllers: [UsersController, CircuitBreakerController, RateLimitController, UnreliableController],
  providers: [UserService, UnreliableService],
  imports: [
    HealthModule.forRoot({
      includeDetails: true,
      timeout: 5000,
      indicators: [
        new MemoryHealthIndicator({ heapUsedThreshold: 0.8 }),
        new CustomHealthIndicator({
          name: 'custom-check',
          check: async () => ({
            status: 'ok',
            details: { custom: 'healthy' },
            timestamp: new Date(),
          }),
        }),
      ],
    }),
  ],
})
class AppModule {}

async function main() {
  logger.info('Starting nofault v3.0.0 example application');

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