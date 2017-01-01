import { FastifyInstance } from 'fastify';
import { HttpServer, createServer } from './server';
import { HttpServerOptions } from './types';
import { Router, createRouter } from './router';
import { NestMiddleware, NestGuard, NestInterceptor, NestPipe, NestFilter } from './interceptor';
import { Module, Global, Injectable, Controller, getModuleMetadata, isModule, isController, isProvider, getInjectableOptions, getInjectTokens } from '@faultless/core';
import { serviceContainer, createServiceIdentifier, LifecycleManager, lifecycleManager, bootstrap, shutdown } from '@faultless/core';
import { getLogger } from '@faultless/log';
import { ConfigLoader, createFileSource, createEnvSource, AppConfig } from '@faultless/config';
import { ApplicationModule } from './types';

const logger = getLogger('http:application');

export interface ApplicationOptions {
  modules: Array<any | { module: any }>;
  serverOptions?: Partial<HttpServerOptions>;
  config?: Partial<AppConfig>;
}

export class HttpApplication {
  private server: HttpServer;
  private router: Router;
  private modules: Map<string, any> = new Map();
  private configLoader?: ConfigLoader;
  private started = false;

  constructor(private options: ApplicationOptions) {
    this.server = createServer({
      port: options.serverOptions?.port ?? 3000,
      host: options.serverOptions?.host ?? '0.0.0.0',
      logger: options.serverOptions?.logger ?? { level: 'info' },
      trustProxy: true,
      bodyLimit: 1024 * 1024,
    });

    this.router = createRouter(this.server.getApp());
    this.setupDefaultMiddlewares();
  }

  private setupDefaultMiddlewares(): void {
    const app = this.server.getApp();
    app.addHook('onRequest', async (request, reply) => {
      const requestId = (request.headers['x-request-id'] as string) ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      reply.header('X-Request-ID', requestId);
      (request as any).requestId = requestId;
    });

    app.addHook('onRequest', async (request, reply) => {
      const start = Date.now();
      (request as any).__startTime = start;
    });

    app.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - ((request as any).__startTime ?? Date.now());
      logger.debug({ method: request.method, url: request.url, duration, statusCode: reply.statusCode }, 'Request processed');
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing application...');

    await this.loadConfiguration();
    await this.resolveModules(this.options.modules);
    await this.registerProviders();
    await this.registerControllers();
    await this.registerMiddleware();
    await this.registerGuards();
    await this.registerInterceptors();
    await this.registerPipes();
    await this.registerFilters();

    logger.info('Application initialized');
  }

  private async loadConfiguration(): Promise<void> {
    const configSources = [
      createFileSource('./config/default.json', 0),
      createFileSource(`./config/${process.env.NODE_ENV ?? 'development'}.json`, 10),
      createEnvSource('APP_', 100),
    ];

    this.configLoader = new ConfigLoader({
      sources: configSources,
      watchForChanges: process.env.NODE_ENV !== 'production',
    });

    await this.configLoader.load();
    logger.info('Configuration loaded');
  }

  private async resolveModules(modules: Array<any | { module: any }>): Promise<void> {
    const visited = new Set<any>();
    const sorted: any[] = [];

    const visit = (mod: any): void => {
      if (visited.has(mod)) return;
      visited.add(mod);

      const metadata = getModuleMetadata(mod);
      if (metadata?.imports) {
        for (const imported of metadata.imports) {
          const moduleClass = imported.module ?? imported;
          visit(moduleClass);
        }
      }

      sorted.push(mod);
    };

    for (const mod of modules) {
      const moduleClass = mod.module ?? mod;
      visit(moduleClass);
    }

    for (const mod of sorted) {
      const moduleClass = mod.module ?? mod;
      const instance = new moduleClass();
      this.modules.set(moduleClass.name, instance);

      if (instance.onModuleInit) {
        await instance.onModuleInit();
      }
    }
  }

  private async registerControllers(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.controllers) {
        for (const controller of metadata.controllers) {
          const injectTokens = getInjectTokens(controller);
          const deps = await Promise.all(
            injectTokens.map((token: any) => {
              const serviceName = typeof token === 'function' ? token.name : token;
              if (typeof serviceName === 'string') {
                return serviceContainer.get(createServiceIdentifier(serviceName));
              }
              return serviceContainer.get({ name: '', symbol: token });
            })
          );
          const controllerInstance = new controller(...deps);
          this.router.registerController(controllerInstance);
          logger.debug({ controller: controller.name }, 'Controller registered');
        }
      }
    }
  }

  private async registerProviders(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          await this.registerProvider(provider);
        }
      }
    }
  }

  private async registerProvider(provider: any): Promise<void> {
    if (typeof provider === 'function') {
      const options = getInjectableOptions(provider);
      const identifier = createServiceIdentifier(provider.name);

      if (options?.scope === 'singleton') {
        serviceContainer.registerSingleton(identifier, async () => new provider());
      } else {
        serviceContainer.register(identifier, async () => new provider());
      }
    } else if (provider && provider.provide) {
      const identifier = typeof provider.provide === 'string'
        ? createServiceIdentifier(provider.provide)
        : { name: String(provider.provide), symbol: Symbol.for(String(provider.provide)) };

      if (provider.useClass) {
        serviceContainer.registerSingleton(identifier, async () => new provider.useClass());
      } else if (provider.useValue !== undefined) {
        serviceContainer.registerInstance(identifier, provider.useValue);
      } else if (provider.useFactory) {
        serviceContainer.registerSingleton(identifier, async () => {
          const deps = provider.inject?.map((token: any) =>
            typeof token === 'string' ? serviceContainer.get(createServiceIdentifier(token)) : serviceContainer.get({ name: '', symbol: token })
          ) ?? [];
          return provider.useFactory(...await Promise.all(deps));
        });
      }
    }
  }

  private async registerMiddleware(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          const providerClass = provider.useClass ?? provider;
          if (isMiddleware(providerClass)) {
            const middleware = new providerClass();
            this.server.addMiddleware(middleware.use.bind(middleware));
            logger.debug({ middleware: providerClass.name }, 'Middleware registered');
          }
        }
      }
    }
  }

  private async registerGuards(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          const providerClass = provider.useClass ?? provider;
          if (isGuard(providerClass)) {
            const guard = new providerClass();
            this.server.addGuard(guard.canActivate.bind(guard));
            logger.debug({ guard: providerClass.name }, 'Guard registered');
          }
        }
      }
    }
  }

  private async registerInterceptors(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          const providerClass = provider.useClass ?? provider;
          if (isInterceptor(providerClass)) {
            const interceptor = new providerClass();
            this.server.addInterceptor(interceptor.intercept.bind(interceptor));
            logger.debug({ interceptor: providerClass.name }, 'Interceptor registered');
          }
        }
      }
    }
  }

  private async registerPipes(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          const providerClass = provider.useClass ?? provider;
          if (isPipe(providerClass)) {
            const pipe = new providerClass();
            this.router.addGlobalPipe(providerClass.name, pipe.transform.bind(pipe));
            logger.debug({ pipe: providerClass.name }, 'Pipe registered');
          }
        }
      }
    }
  }

  private async registerFilters(): Promise<void> {
    for (const [name, instance] of this.modules) {
      const metadata = getModuleMetadata(instance.constructor);
      if (metadata?.providers) {
        for (const provider of metadata.providers) {
          const providerClass = provider.useClass ?? provider;
          if (isFilter(providerClass)) {
            const filter = new providerClass();
            this.server.addFilter(filter.catch.bind(filter));
            logger.debug({ filter: providerClass.name }, 'Filter registered');
          }
        }
      }
    }
  }

  async listen(): Promise<void> {
    if (this.started) {
      logger.warn('Application already started');
      return;
    }

    await this.server.listen();
    this.started = true;

    for (const [name, instance] of this.modules) {
      if (instance.onApplicationBootstrap) {
        await instance.onApplicationBootstrap();
      }
    }

    logger.info(`Application started on port ${this.options.serverOptions?.port ?? 3000}`);
  }

  async close(): Promise<void> {
    if (!this.started) return;

    logger.info('Shutting down application...');

    await this.server.close();

    for (const [name, instance] of this.modules) {
      if (instance.onApplicationShutdown) {
        await instance.onApplicationShutdown();
      }
      if (instance.onModuleDestroy) {
        await instance.onModuleDestroy();
      }
    }

    if (this.configLoader) {
      await this.configLoader.destroy();
    }

    this.started = false;
    logger.info('Application stopped');
  }

  getServer(): HttpServer {
    return this.server;
  }

  getRouter(): Router {
    return this.router;
  }

  getConfig(): AppConfig | undefined {
    return this.configLoader?.getConfig();
  }

  getModule(name: string): any {
    return this.modules.get(name);
  }

  getContainer() {
    return serviceContainer;
  }
}

function isMiddleware(cls: any): cls is new () => NestMiddleware {
  return cls && typeof cls.prototype?.use === 'function';
}

function isGuard(cls: any): cls is new () => NestGuard {
  return cls && typeof cls.prototype?.canActivate === 'function';
}

function isInterceptor(cls: any): cls is new () => NestInterceptor {
  return cls && typeof cls.prototype?.intercept === 'function';
}

function isPipe(cls: any): cls is new () => NestPipe {
  return cls && typeof cls.prototype?.transform === 'function';
}

function isFilter(cls: any): cls is new () => NestFilter {
  return cls && typeof cls.prototype?.catch === 'function';
}

export async function createApplication(options: ApplicationOptions): Promise<HttpApplication> {
  const app = new HttpApplication(options);
  await app.initialize();
  return app;
}

export async function runApplication(options: ApplicationOptions): Promise<void> {
  const app = await createApplication(options);
  await app.listen();

  const signals = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}