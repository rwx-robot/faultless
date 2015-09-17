import { EventEmitter } from 'events';
import { LifecycleHook, HealthCheckResult, HealthIndicator, ServiceIdentifier, Constructor, Factory } from './types';

export class LifecycleManager extends EventEmitter {
  private modules: Map<string, LifecycleHook> = new Map();
  private healthIndicators: Map<string, HealthIndicator> = new Map();
  private started = false;
  private shuttingDown = false;

  registerModule(name: string, module: LifecycleHook): void {
    this.modules.set(name, module);
  }

  unregisterModule(name: string): void {
    this.modules.delete(name);
  }

  registerHealthIndicator(indicator: HealthIndicator): void {
    this.healthIndicators.set(indicator.name, indicator);
  }

  unregisterHealthIndicator(name: string): void {
    this.healthIndicators.delete(name);
  }

  async onModuleInit(): Promise<void> {
    for (const [name, module] of this.modules) {
      if (module.onModuleInit) {
        await module.onModuleInit();
      }
    }
    this.emit('modulesInitialized');
  }

  async onApplicationBootstrap(): Promise<void> {
    this.started = true;
    for (const [name, module] of this.modules) {
      if (module.onApplicationBootstrap) {
        await module.onApplicationBootstrap();
      }
    }
    this.emit('applicationBootstrapped');
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, module] of this.modules) {
      if (module.onModuleDestroy) {
        await module.onModuleDestroy();
      }
    }
    this.emit('modulesDestroyed');
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const [name, module] of this.modules) {
      if (module.beforeApplicationShutdown) {
        await module.beforeApplicationShutdown();
      }
    }
    this.emit('beforeShutdown');
  }

  async onApplicationShutdown(): Promise<void> {
    for (const [name, module] of this.modules) {
      if (module.onApplicationShutdown) {
        await module.onApplicationShutdown();
      }
    }
    this.emit('applicationShutdown');
  }

  async checkHealth(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};

    for (const [name, indicator] of this.healthIndicators) {
      try {
        results[name] = await indicator.isHealthy();
      } catch (error) {
        results[name] = {
          status: 'error',
          details: { error: error instanceof Error ? error.message : String(error) },
          timestamp: new Date(),
        };
      }
    }

    return results;
  }

  isStarted(): boolean {
    return this.started;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  getRegisteredModules(): string[] {
    return Array.from(this.modules.keys());
  }

  getRegisteredHealthIndicators(): string[] {
    return Array.from(this.healthIndicators.keys());
  }
}

export const lifecycleManager = new LifecycleManager();

export class ServiceContainer {
  private providers: Map<string | symbol, unknown> = new Map();
  private factories: Map<string | symbol, Factory<unknown>> = new Map();
  private singletons: Map<string | symbol, unknown> = new Map();
  private resolving: Set<string | symbol> = new Set();

  register<T>(identifier: ServiceIdentifier<T>, provider: T | Factory<T>): void {
    const key = identifier.symbol ?? identifier.name;
    if (typeof provider === 'function') {
      this.factories.set(key, provider as Factory<T>);
    } else {
      this.providers.set(key, provider);
    }
  }

  registerSingleton<T>(identifier: ServiceIdentifier<T>, factory: Factory<T>): void {
    const key = identifier.symbol ?? identifier.name;
    this.factories.set(key, factory);
  }

  registerInstance<T>(identifier: ServiceIdentifier<T>, instance: T): void {
    const key = identifier.symbol ?? identifier.name;
    this.providers.set(key, instance);
    this.singletons.set(key, instance);
  }

  async get<T>(identifier: ServiceIdentifier<T>): Promise<T> {
    const key = identifier.symbol ?? identifier.name;

    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }

    if (this.providers.has(key)) {
      const instance = this.providers.get(key);
      this.singletons.set(key, instance);
      return instance as T;
    }

    if (this.factories.has(key)) {
      if (this.resolving.has(key)) {
        throw new Error(`Circular dependency detected for ${key.toString()}`);
      }

      this.resolving.add(key);
      try {
        const factory = this.factories.get(key)!;
        const instance = await factory() as T;
        this.singletons.set(key, instance);
        return instance;
      } finally {
        this.resolving.delete(key);
      }
    }

    throw new Error(`Service not found: ${key.toString()}`);
  }

  has(identifier: ServiceIdentifier): boolean {
    const key = identifier.symbol ?? identifier.name;
    return this.providers.has(key) || this.factories.has(key) || this.singletons.has(key);
  }

  delete(identifier: ServiceIdentifier): void {
    const key = identifier.symbol ?? identifier.name;
    this.providers.delete(key);
    this.factories.delete(key);
    this.singletons.delete(key);
  }

  clear(): void {
    this.providers.clear();
    this.factories.clear();
    this.singletons.clear();
    this.resolving.clear();
  }

  getAllKeys(): (string | symbol)[] {
    return [...new Set([...this.providers.keys(), ...this.factories.keys(), ...this.singletons.keys()])];
  }
}

export const serviceContainer = new ServiceContainer();

export function createServiceIdentifier<T>(name: string): ServiceIdentifier<T> {
  return { name, symbol: Symbol.for(name) };
}

export async function bootstrap(modules: Constructor[]): Promise<ServiceContainer> {
  const visited = new Set<Constructor>();
  const sorted: Constructor[] = [];

  function visit(module: Constructor): void {
    if (visited.has(module)) return;
    visited.add(module);

    const metadata = Reflect.getMetadata('nofault:module', module) as { imports?: Constructor[] } | undefined;
    if (metadata?.imports) {
      for (const imported of metadata.imports) {
        visit(imported);
      }
    }

    sorted.push(module);
  }

  for (const module of modules) {
    visit(module);
  }

  for (const module of sorted) {
    const instance = new module() as LifecycleHook;
    if (instance && typeof instance === 'object') {
      lifecycleManager.registerModule(module.name, instance);
    }
  }

  await lifecycleManager.onModuleInit();
  await lifecycleManager.onApplicationBootstrap();

  return serviceContainer;
}

export async function shutdown(): Promise<void> {
  await lifecycleManager.beforeApplicationShutdown();
  await lifecycleManager.onApplicationShutdown();
  await lifecycleManager.onModuleDestroy();
  serviceContainer.clear();
}