import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProductionReadyServer, createProductionServer } from '@faultless/core';

describe('ProductionReadyServer', () => {
  let server: ProductionReadyServer;

  beforeEach(() => {
    server = createProductionServer({
      serviceName: 'test-service',
      version: '1.0.0',
      environment: 'test',
      port: 3000,
      shutdownTimeout: 5000,
    });
  });

  afterEach(async () => {
    if (server.isServerStarted()) {
      await server.stop();
    }
  });

  it('should create a production server', () => {
    expect(server).toBeInstanceOf(ProductionReadyServer);
  });

  it('should start the server', async () => {
    await server.start();

    expect(server.isServerStarted()).toBe(true);
  });

  it('should stop the server', async () => {
    await server.start();
    await server.stop();

    expect(server.isServerStarted()).toBe(false);
  });

  it('should emit started event', async () => {
    const startedHandler = vi.fn();
    server.on('started', startedHandler);

    await server.start();

    expect(startedHandler).toHaveBeenCalled();
  });

  it('should emit stopped event', async () => {
    const stoppedHandler = vi.fn();
    server.on('stopped', stoppedHandler);

    await server.start();
    await server.stop();

    expect(stoppedHandler).toHaveBeenCalled();
  });

  it('should throw error when starting twice', async () => {
    await server.start();

    await expect(server.start()).rejects.toThrow('already started');
  });

  it('should handle stop without start gracefully', async () => {
    await server.stop();

    expect(server.isServerStarted()).toBe(false);
  });

  it('should return health check manager', () => {
    const healthCheck = server.getHealthCheck();

    expect(healthCheck).toBeDefined();
    expect(healthCheck.register).toBeDefined();
    expect(healthCheck.check).toBeDefined();
    expect(healthCheck.isHealthy).toBeDefined();
  });

  it('should return metrics exporter', () => {
    const metrics = server.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.addCollector).toBeDefined();
    expect(metrics.start).toBeDefined();
    expect(metrics.stop).toBeDefined();
  });

  it('should return logger', () => {
    const logger = server.getLogger();

    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should return options', () => {
    const options = server.getOptions();

    expect(options.serviceName).toBe('test-service');
    expect(options.version).toBe('1.0.0');
    expect(options.environment).toBe('test');
    expect(options.port).toBe(3000);
  });

  it('should register health checks', async () => {
    const healthCheck = server.getHealthCheck();

    healthCheck.register('test-check', async () => ({
      status: 'pass',
      message: 'Test passed',
    }));

    const result = await healthCheck.check();

    expect(result.status).toBe('healthy');
    expect(result.checks['test-check'].status).toBe('pass');
  });

  it('should add metrics collectors', async () => {
    const metrics = server.getMetrics();

    metrics.addCollector(async () => '# Test metric');

    expect(metrics.addCollector).toBeDefined();
  });

  it('should log messages', () => {
    const logger = server.getLogger();

    logger.info('Test message');
    logger.warn('Test warning');
    logger.error('Test error');
    logger.debug('Test debug');
  });
});
