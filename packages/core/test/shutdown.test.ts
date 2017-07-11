import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GracefulShutdown, createGracefulShutdown } from '@faultless/core';

describe('GracefulShutdown', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => {
    shutdown = createGracefulShutdown(1000);
  });

  afterEach(() => {
    shutdown.destroy();
  });

  it('should create a shutdown instance', () => {
    expect(shutdown).toBeInstanceOf(GracefulShutdown);
  });

  it('should register services', () => {
    shutdown.registerService('test-service', async () => {});
    expect(shutdown.getRegisteredServices()).toContain('test-service');
  });

  it('should register multiple services', async () => {
    const order: string[] = [];

    shutdown.registerService('service1', async () => {
      order.push('service1');
    });

    shutdown.registerService('service2', async () => {
      order.push('service2');
    });

    await shutdown.shutdown();

    expect(order).toHaveLength(2);
    expect(order).toContain('service1');
    expect(order).toContain('service2');
  });

  it('should shutdown services in reverse order', async () => {
    const order: string[] = [];

    shutdown.registerService('first', async () => {
      order.push('first');
    });

    shutdown.registerService('second', async () => {
      order.push('second');
    });

    shutdown.registerService('third', async () => {
      order.push('third');
    });

    await shutdown.shutdown();

    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('should emit events during shutdown', async () => {
    const events: string[] = [];

    shutdown.on('start', () => events.push('start'));
    shutdown.on('service', (event) => events.push(`service:${event.service}`));
    shutdown.on('complete', () => events.push('complete'));

    shutdown.registerService('test-service', async () => {});

    await shutdown.shutdown();

    expect(events).toContain('start');
    expect(events).toContain('service:test-service');
    expect(events).toContain('complete');
  });

  it('should handle service errors gracefully', async () => {
    const errorHandler = vi.fn();
    shutdown.on('error', errorHandler);

    shutdown.registerService('failing-service', async () => {
      throw new Error('Service failed');
    });

    await shutdown.shutdown();

    expect(errorHandler).toHaveBeenCalled();
  });

  it('should not shutdown twice', async () => {
    const order: string[] = [];

    shutdown.registerService('service1', async () => {
      order.push('service1');
    });

    await shutdown.shutdown();
    await shutdown.shutdown();

    expect(order).toHaveLength(1);
  });

  it('should remove services', () => {
    shutdown.registerService('service1', async () => {});
    shutdown.registerService('service2', async () => {});

    expect(shutdown.getRegisteredServices()).toHaveLength(2);

    shutdown.removeService('service1');

    expect(shutdown.getRegisteredServices()).toHaveLength(1);
    expect(shutdown.getRegisteredServices()).toContain('service2');
    expect(shutdown.getRegisteredServices()).not.toContain('service1');
  });

  it('should clear all services', () => {
    shutdown.registerService('service1', async () => {});
    shutdown.registerService('service2', async () => {});

    shutdown.clear();

    expect(shutdown.getRegisteredServices()).toHaveLength(0);
  });

  it('should report shutdown in progress', async () => {
    expect(shutdown.isShutdownInProgress()).toBe(false);

    const shutdownPromise = shutdown.shutdown();

    expect(shutdown.isShutdownInProgress()).toBe(true);

    await shutdownPromise;

    expect(shutdown.isShutdownInProgress()).toBe(true);
  });
});
