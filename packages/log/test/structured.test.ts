import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StructuredLogger, createStructuredLogger } from '@faultless/log';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = createStructuredLogger({
      serviceName: 'test-service',
      version: '1.0.0',
      environment: 'test',
      level: 'debug',
    });
  });

  afterEach(async () => {
    await logger.close();
  });

  it('should create a structured logger', () => {
    expect(logger).toBeInstanceOf(StructuredLogger);
  });

  it('should log info messages', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.info('Test message', { key: 'value' });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Test message');
  });

  it('should log warn messages', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.warn('Test warning', { key: 'value' });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('Test warning');
  });

  it('should log error messages', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    const error = new Error('Test error');
    logger.error('Error occurred', error, { key: 'value' });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('Error occurred');
    expect(entry.metadata?.error?.name).toBe('Error');
    expect(entry.metadata?.error?.message).toBe('Test error');
  });

  it('should log debug messages', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.debug('Debug message', { key: 'value' });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.level).toBe('debug');
    expect(entry.message).toBe('Debug message');
  });

  it('should log fatal messages', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    const error = new Error('Fatal error');
    logger.fatal('Fatal occurred', error, { key: 'value' });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.level).toBe('fatal');
    expect(entry.message).toBe('Fatal occurred');
  });

  it('should create child loggers', async () => {
    const childLogger = logger.child({ requestId: '123' });
    const logHandler = vi.fn();
    childLogger.on('log', logHandler);

    childLogger.info('Child message');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.metadata?.requestId).toBe('123');
    expect(entry.metadata?.serviceName).toBe('test-service');
  });

  it('should create child loggers with correlation IDs', async () => {
    const childLogger = logger.withCorrelationId('corr-123');
    const logHandler = vi.fn();
    childLogger.on('log', logHandler);

    childLogger.info('Correlated message');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.metadata?.correlationId).toBe('corr-123');
  });

  it('should redact sensitive fields', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.info('Sensitive data', {
      password: 'secret123',
      token: 'abc123',
      normalField: 'visible',
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.metadata?.password).toBe('[REDACTED]');
    expect(entry.metadata?.token).toBe('[REDACTED]');
    expect(entry.metadata?.normalField).toBe('visible');
  });

  it('should redact nested sensitive fields', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.info('Nested sensitive data', {
      user: {
        password: 'secret123',
        name: 'John',
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    const entry = logHandler.mock.calls[0][0];
    expect(entry.metadata?.user?.password).toBe('[REDACTED]');
    expect(entry.metadata?.user?.name).toBe('John');
  });

  it('should respect log levels', async () => {
    const warnLogger = createStructuredLogger({
      serviceName: 'test-service',
      level: 'warn',
    });

    const logHandler = vi.fn();
    warnLogger.on('log', logHandler);

    warnLogger.info('This should not be logged');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).not.toHaveBeenCalled();

    warnLogger.warn('This should be logged');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
    await warnLogger.close();
  });

  it('should change log level', async () => {
    const logHandler = vi.fn();
    logger.on('log', logHandler);

    logger.setLevel('error');

    logger.info('This should not be logged');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).not.toHaveBeenCalled();

    logger.error('This should be logged');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logHandler).toHaveBeenCalled();
  });

  it('should get current log level', () => {
    expect(logger.getLevel()).toBe('debug');

    logger.setLevel('warn');

    expect(logger.getLevel()).toBe('warn');
  });
});
