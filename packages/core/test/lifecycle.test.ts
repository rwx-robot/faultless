import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Injectable, Module } from '../src/decorators';
import { LifecycleManager, lifecycleManager, ServiceContainer, serviceContainer, bootstrap, shutdown } from '../src/lifecycle';

describe('LifecycleManager', () => {
  let manager: LifecycleManager;

  beforeEach(() => {
    manager = new LifecycleManager();
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  it('should register and unregister modules', () => {
    const module = {
      onModuleInit: vi.fn(),
    };
    manager.registerModule('test', module);
    expect(manager.getRegisteredModules()).toContain('test');

    manager.unregisterModule('test');
    expect(manager.getRegisteredModules()).not.toContain('test');
  });

  it('should call onModuleInit on all modules', async () => {
    const module1 = { onModuleInit: vi.fn() };
    const module2 = { onModuleInit: vi.fn() };

    manager.registerModule('mod1', module1);
    manager.registerModule('mod2', module2);

    await manager.onModuleInit();

    expect(module1.onModuleInit).toHaveBeenCalled();
    expect(module2.onModuleInit).toHaveBeenCalled();
  });

  it('should call onApplicationBootstrap', async () => {
    const module = { onApplicationBootstrap: vi.fn() };
    manager.registerModule('test', module);

    await manager.onApplicationBootstrap();

    expect(module.onApplicationBootstrap).toHaveBeenCalled();
    expect(manager.isStarted()).toBe(true);
  });

  it('should call onModuleDestroy', async () => {
    const module = { onModuleDestroy: vi.fn() };
    manager.registerModule('test', module);

    await manager.onModuleDestroy();

    expect(module.onModuleDestroy).toHaveBeenCalled();
  });

  it('should call beforeApplicationShutdown', async () => {
    const module = { beforeApplicationShutdown: vi.fn() };
    manager.registerModule('test', module);

    await manager.beforeApplicationShutdown();

    expect(module.beforeApplicationShutdown).toHaveBeenCalled();
    expect(manager.isShuttingDown()).toBe(true);
  });

  it('should call onApplicationShutdown', async () => {
    const module = { onApplicationShutdown: vi.fn() };
    manager.registerModule('test', module);

    await manager.onApplicationShutdown();

    expect(module.onApplicationShutdown).toHaveBeenCalled();
  });

  it('should register health indicators', () => {
    const indicator = {
      name: 'test',
      isHealthy: vi.fn().mockResolvedValue({ status: 'ok' as const, timestamp: new Date() }),
    };
    manager.registerHealthIndicator(indicator);
    expect(manager.getRegisteredHealthIndicators()).toContain('test');
  });

  it('should check health', async () => {
    const indicator = {
      name: 'healthy',
      isHealthy: vi.fn().mockResolvedValue({ status: 'ok' as const, timestamp: new Date() }),
    };
    const unhealthy = {
      name: 'unhealthy',
      isHealthy: vi.fn().mockResolvedValue({ status: 'error' as const, timestamp: new Date() }),
    };

    manager.registerHealthIndicator(indicator);
    manager.registerHealthIndicator(unhealthy);

    const results = await manager.checkHealth();

    expect(results.healthy.status).toBe('ok');
    expect(results.unhealthy.status).toBe('error');
  });

  it('should handle health check errors', async () => {
    const indicator = {
      name: 'error',
      isHealthy: vi.fn().mockRejectedValue(new Error('check failed')),
    };
    manager.registerHealthIndicator(indicator);

    const results = await manager.checkHealth();

    expect(results.error.status).toBe('error');
    expect(results.error.details?.error).toBe('check failed');
  });
});

describe('ServiceContainer', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  it('should register and get instance', async () => {
    const instance = { value: 'test' };
    container.registerInstance({ name: 'test' }, instance);

    const result = await container.get({ name: 'test' });
    expect(result).toBe(instance);
  });

  it('should register and get from factory', async () => {
    const factory = vi.fn().mockResolvedValue({ value: 'factory' });
    container.registerSingleton({ name: 'factory' }, factory);

    const result = await container.get({ name: 'factory' });
    expect(result).toEqual({ value: 'factory' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should cache singleton', async () => {
    const factory = vi.fn().mockResolvedValue({ value: 'factory' });
    container.registerSingleton({ name: 'factory' }, factory);

    await container.get({ name: 'factory' });
    await container.get({ name: 'factory' });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should throw for missing service', async () => {
    await expect(container.get({ name: 'missing' })).rejects.toThrow('Service not found');
  });

  it('should detect circular dependencies', async () => {
    container.registerSingleton({ name: 'a' }, async () => {
      return container.get({ name: 'b' });
    });
    container.registerSingleton({ name: 'b' }, async () => {
      return container.get({ name: 'a' });
    });

    await expect(container.get({ name: 'a' })).rejects.toThrow('Circular dependency detected');
  });

  it('should check if service exists', () => {
    container.registerInstance({ name: 'exists' }, {});
    expect(container.has({ name: 'exists' })).toBe(true);
    expect(container.has({ name: 'missing' })).toBe(false);
  });

  it('should delete service', () => {
    container.registerInstance({ name: 'test' }, {});
    container.delete({ name: 'test' });
    expect(container.has({ name: 'test' })).toBe(false);
  });

  it('should clear all services', () => {
    container.registerInstance({ name: 'a' }, {});
    container.registerInstance({ name: 'b' }, {});
    container.clear();
    expect(container.has({ name: 'a' })).toBe(false);
    expect(container.has({ name: 'b' })).toBe(false);
  });
});

describe('bootstrap and shutdown', () => {
  it('should bootstrap modules in dependency order', async () => {
    const initOrder: string[] = [];

    @Injectable()
    class ServiceA {
      onModuleInit() { initOrder.push('A'); }
    }

    @Module({ imports: [ServiceA] })
    class ModuleB {
      onModuleInit() { initOrder.push('B'); }
    }

    @Module({ imports: [ModuleB] })
    class ModuleC {
      onModuleInit() { initOrder.push('C'); }
    }

    await bootstrap([ModuleC]);
    expect(initOrder).toEqual(['A', 'B', 'C']);

    await shutdown();
  });
});