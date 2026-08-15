import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Query, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger, LogLevel, ProbabilisticSampler, BufferedAsyncWriter, InMemoryLogAggregator } from '@faultless/log';
import { ConfigLoader, createFileSource, createEnvSource, createRemoteConfigSource, createEncryption, ConfigVersionManager, MemoryVersionStorage } from '@faultless/config';

@Injectable()
class ConfigService {
  private loader: ConfigLoader;
  private versionManager: ConfigVersionManager;
  private encryption: ReturnType<typeof createEncryption>;

  constructor() {
    this.loader = new ConfigLoader({
      sources: [
        createFileSource('./config/default.json', 0),
        createFileSource(`./config/${process.env.NODE_ENV ?? 'development'}.json`, 10),
        createEnvSource('APP_', 100),
      ],
      watchForChanges: true,
    });

    this.versionManager = new ConfigVersionManager({
      storage: new MemoryVersionStorage(),
      maxVersions: 10,
    });

    this.encryption = createEncryption('master-password-123');
  }

  async initialize() {
    await this.loader.load();
    await this.versionManager.initialize();

    this.loader.on('change', async (event) => {
      console.log('Config changed:', event.key, event.oldValue, '->', event.newValue);
      const config = this.loader.getConfig();
      await this.versionManager.createVersion(config, 'system', `Auto-save: ${event.key} changed`);
    });
  }

  getConfig() {
    return this.loader.getConfig();
  }

  get<T>(key: string): T {
    return this.loader.get(key);
  }

  async encryptConfig(config: Record<string, unknown>) {
    return this.encryption.encrypt(config);
  }

  async decryptConfig(encrypted: any) {
    return this.encryption.decrypt(encrypted);
  }

  async createVersion(author?: string, message?: string) {
    return this.versionManager.createVersion(this.loader.getConfig(), author, message);
  }

  async rollback(version: number) {
    return this.versionManager.rollback(version);
  }

  async listVersions() {
    return this.versionManager.listVersions();
  }
}

@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string; email: string }>();
  private logger = createLogger({ level: 'debug', structuredFields: true });

  constructor() {
    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
    this.users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });
  }

  findAll() {
    this.logger.info('Finding all users', 'UserService', { count: this.users.size });
    return Array.from(this.users.values());
  }

  findById(id: string) {
    this.logger.debug('Finding user by ID', 'UserService', { userId: id });
    const user = this.users.get(id);
    if (!user) {
      this.logger.warn('User not found', 'UserService', { userId: id });
    }
    return user;
  }

  create(user: { name: string; email: string }) {
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    this.logger.info('User created', 'UserService', { userId: id, name: user.name });
    return newUser;
  }
}

@Controller('users')
class UsersController {
  constructor(
    private userService: UserService,
    private configService: ConfigService
  ) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    const user = this.userService.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

@Controller('config')
class ConfigController {
  constructor(private configService: ConfigService) {}

  @Get()
  getConfig() {
    return this.configService.getConfig();
  }

  @Get('versions')
  async getVersions() {
    return this.configService.listVersions();
  }

  @Post('versions')
  async createVersion(@Body() body: { author?: string; message?: string }) {
    return this.configService.createVersion(body.author, body.message);
  }

  @Post('rollback/:version')
  async rollback(@Param('version') version: string) {
    const config = await this.configService.rollback(parseInt(version, 10));
    return { success: true, config };
  }

  @Post('encrypt')
  async encrypt(@Body() body: Record<string, unknown>) {
    return this.configService.encryptConfig(body);
  }

  @Post('decrypt')
  async decrypt(@Body() body: any) {
    return this.configService.decryptConfig(body);
  }
}

@Controller('logs')
class LogsController {
  private aggregator = new InMemoryLogAggregator();

  @Get()
  async getLogs(@Query('level') level?: string, @Query('limit') limit?: string) {
    return this.aggregator.query({
      level: level as any,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Get('stats')
  getStats() {
    const entries = this.aggregator.getAllEntries();
    const byLevel = entries.reduce((acc, e) => {
      acc[e.level] = (acc[e.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total: entries.length, byLevel };
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
  controllers: [UsersController, ConfigController, LogsController, HealthController],
  providers: [UserService, ConfigService],
})
class AppModule {}

async function main() {
  const logger = createLogger({
    level: 'debug',
    structuredFields: true,
    sampler: 'probabilistic',
    samplerOptions: { rate: 1.0 },
    asyncWrite: true,
    serviceName: 'nofault-v2-example',
    environment: 'development',
    version: '2.0.0',
  });

  logger.info('Starting nofault v2.0.0 example application');

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