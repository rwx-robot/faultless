import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthCheckManager, createHealthCheckManager } from '@faultless/http';

describe('HealthCheckManager', () => {
  let manager: HealthCheckManager;

  beforeEach(() => {
    manager = createHealthCheckManager({ timeout: 1000 });
  });

  afterEach(() => {
    manager.stopPeriodicCheck();
    manager.clear();
  });

  it('should create a health check manager', () => {
    expect(manager).toBeInstanceOf(HealthCheckManager);
  });

  it('should register health checks', () => {
    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test passed',
    }));

    expect(manager.getRegisteredChecks()).toContain('test-check');
  });

  it('should unregister health checks', () => {
    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test passed',
    }));

    expect(manager.getRegisteredChecks()).toContain('test-check');

    manager.unregister('test-check');

    expect(manager.getRegisteredChecks()).not.toContain('test-check');
  });

  it('should run health checks', async () => {
    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test passed',
    }));

    const result = await manager.check();

    expect(result.status).toBe('healthy');
    expect(result.checks['test-check'].status).toBe('pass');
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.timestamp).toBeDefined();
  });

  it('should handle failing checks', async () => {
    manager.register('failing-check', async () => ({
      status: 'fail',
      message: 'Check failed',
    }));

    const result = await manager.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks['failing-check'].status).toBe('fail');
  });

  it('should handle warning checks', async () => {
    manager.register('warning-check', async () => ({
      status: 'warn',
      message: 'Check warning',
    }));

    manager.register('pass-check', async () => ({
      status: 'pass',
      message: 'Pass',
    }));

    const result = await manager.check();

    expect(result.status).toBe('degraded');
  });

  it('should handle degraded status when too many warnings', async () => {
    manager.register('warning-check1', async () => ({
      status: 'warn',
      message: 'Warning 1',
    }));

    manager.register('warning-check2', async () => ({
      status: 'warn',
      message: 'Warning 2',
    }));

    manager.register('pass-check', async () => ({
      status: 'pass',
      message: 'Pass',
    }));

    const result = await manager.check();

    expect(result.status).toBe('degraded');
  });

  it('should handle check timeouts', async () => {
    manager.register('slow-check', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return {
        status: 'pass',
        message: 'Slow check',
      };
    });

    const result = await manager.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks['slow-check'].status).toBe('fail');
    expect(result.checks['slow-check'].message).toContain('timeout');
  });

  it('should handle check errors', async () => {
    manager.register('error-check', async () => {
      throw new Error('Check error');
    });

    const result = await manager.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks['error-check'].status).toBe('fail');
    expect(result.checks['error-check'].message).toContain('Check error');
  });

  it('should measure check duration', async () => {
    manager.register('slow-check', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        status: 'pass',
        message: 'Slow check',
      };
    });

    const result = await manager.check();

    expect(result.checks['slow-check'].duration).toBeGreaterThanOrEqual(100);
  });

  it('should report healthy status', async () => {
    manager.register('pass-check', async () => ({
      status: 'pass',
      message: 'Pass',
    }));

    const isHealthy = await manager.isHealthy();

    expect(isHealthy).toBe(true);
  });

  it('should report unhealthy status', async () => {
    manager.register('fail-check', async () => ({
      status: 'fail',
      message: 'Fail',
    }));

    const isHealthy = await manager.isHealthy();

    expect(isHealthy).toBe(false);
  });

  it('should check if a check exists', () => {
    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test',
    }));

    expect(manager.hasCheck('test-check')).toBe(true);
    expect(manager.hasCheck('nonexistent-check')).toBe(false);
  });

  it('should emit check events', async () => {
    const checkHandler = vi.fn();
    manager.on('check', checkHandler);

    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test',
    }));

    await manager.check();

    expect(checkHandler).toHaveBeenCalled();
  });

  it('should clear all checks', () => {
    manager.register('check1', async () => ({
      status: 'pass',
      message: 'Check 1',
    }));

    manager.register('check2', async () => ({
      status: 'pass',
      message: 'Check 2',
    }));

    manager.clear();

    expect(manager.getRegisteredChecks()).toHaveLength(0);
  });

  it('should start and stop periodic checks', async () => {
    const checkHandler = vi.fn();
    manager.on('check', checkHandler);

    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test',
    }));

    manager.startPeriodicCheck(100);

    await new Promise(resolve => setTimeout(resolve, 250));

    manager.stopPeriodicCheck();

    expect(checkHandler).toHaveBeenCalledTimes(2);
  });

  it('should throw error when starting periodic checks without interval', () => {
    manager.register('test-check', async () => ({
      status: 'pass',
      message: 'Test',
    }));

    expect(() => manager.startPeriodicCheck()).toThrow('Check interval must be specified');
  });
});
