import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger, createLogger, getLogger } from '../src/logger';
import { ConsoleTransport, FileTransport, RotatingFileTransport } from '../src/transports';
import { JSONFormatter, PrettyFormatter, LogfmtFormatter } from '../src/formatters';
import { LogLevel } from '../src/levels';
import { LogEntry } from '@faultless/core';
import { EventEmitter } from 'events';

function makeMockTransport(level: LogLevel = 'debug', formatter?: any): any {
  const collected: string[] = [];
  const fmt = formatter ?? new JSONFormatter();
  return {
    collected,
    shouldLog: (entryLevel: LogLevel) => {
      const levels: Record<string, number> = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
      return levels[entryLevel] >= levels[level];
    },
    write: (entry: LogEntry) => {
      collected.push(fmt.format(entry));
      return true;
    },
    setLevel: () => {},
    setFormatter: () => {},
  };
}

describe('Logger', () => {
  let logger: Logger;
  let mockTransport: ReturnType<typeof makeMockTransport>;

  beforeEach(() => {
    mockTransport = makeMockTransport('debug');
    logger = new Logger({ level: 'debug', transports: [mockTransport as any] });
  });

  afterEach(() => {
    logger.close();
  });

  it('should log at different levels', async () => {
    logger.fatal('fatal message');
    logger.error('error message');
    logger.warn('warn message');
    logger.info('info message');
    logger.debug('debug message');
    logger.trace('trace message');

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected.length).toBe(5);
  });

  it('should respect log level', async () => {
    const warnMock = makeMockTransport('warn');
    const warnLogger = new Logger({ level: 'warn', transports: [warnMock as any] });

    warnLogger.fatal('fatal');
    warnLogger.error('error');
    warnLogger.warn('warn');
    warnLogger.info('info');
    warnLogger.debug('debug');

    await new Promise(r => setTimeout(r, 50));
    expect(warnMock.collected.length).toBe(3);
    warnLogger.close();
  });

  it('should include context', async () => {
    logger.info('test message', 'UserService');

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected[0]).toContain('"context":"UserService"');
  });

  it('should include metadata', async () => {
    logger.info('test', 'ctx', { userId: 123, action: 'login' });

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected[0]).toContain('"userId"');
    expect(mockTransport.collected[0]).toContain('"action"');
  });

  it('should redact sensitive keys', async () => {
    logger.info('test', 'ctx', { password: 'secret', token: 'abc123', normal: 'value' });

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected[0]).toContain('[REDACTED]');
    expect(mockTransport.collected[0]).not.toContain('"secret"');
    expect(mockTransport.collected[0]).not.toContain('"abc123"');
    expect(mockTransport.collected[0]).toContain('"normal"');
  });

  it('should create child logger with context', async () => {
    const child = logger.child('ChildContext', { requestId: 'req-123' });
    child.info('child message');

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected[0]).toContain('"context":"ChildContext"');
    expect(mockTransport.collected[0]).toContain('"requestId":"req-123"');
  });

  it('should reuse child logger', () => {
    const child1 = logger.child('Child', { a: 1 });
    const child2 = logger.child('Child', { a: 1 });
    expect(child1).toBe(child2);
  });

  it('should set level dynamically', async () => {
    logger.setLevel('error');
    logger.info('info');
    logger.error('error');

    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.collected.length).toBe(1);
  });

  it('should use custom formatter', async () => {
    const prettyFmt = new PrettyFormatter();
    const prettyMock = makeMockTransport('debug', prettyFmt);
    const prettyLogger = new Logger({ level: 'debug', transports: [prettyMock as any] });

    prettyLogger.info('pretty message');
    await new Promise(r => setTimeout(r, 50));

    expect(prettyMock.collected[0]).toContain('\x1b[');
    prettyLogger.close();
  });

  it('should add custom transport', async () => {
    const customTransport = {
      write: vi.fn().mockReturnValue(true),
      shouldLog: () => true,
      setLevel: vi.fn(),
      setFormatter: vi.fn(),
    };

    logger.addTransport(customTransport as any);
    logger.info('test');

    await new Promise(r => setTimeout(r, 50));
    expect(customTransport.write).toHaveBeenCalled();
  });
});

describe('ConsoleTransport', () => {
  it('should write to stdout for info', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const transport = new ConsoleTransport({ level: 'info' });

    transport.write({
      level: 'info',
      message: 'test',
      timestamp: new Date(),
      context: 'test',
    } as any);

    await new Promise(r => setTimeout(r, 100));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should write to stderr for error', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const transport = new ConsoleTransport({ level: 'error' });

    transport.write({
      level: 'error',
      message: 'test',
      timestamp: new Date(),
    } as any);

    await new Promise(r => setTimeout(r, 100));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('FileTransport', () => {
  let tempDir: string;
  let logFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nofault-log-'));
    logFile = path.join(tempDir, 'app.log');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should write to file', async () => {
    const transport = new FileTransport(logFile, { level: 'info' });

    transport.write({
      level: 'info',
      message: 'file log',
      timestamp: new Date(),
      context: 'test',
    } as any);

    await new Promise(r => setTimeout(r, 100));
    await transport.flush();

    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('file log');

    await transport.close();
  });

  it('should rotate files', async () => {
    const transport = new RotatingFileTransport(logFile, {
      level: 'info',
      maxSize: 100,
      maxFiles: 3,
    });

    for (let i = 0; i < 20; i++) {
      transport.write({
        level: 'info',
        message: 'x'.repeat(50),
        timestamp: new Date(),
      } as any);
    }

    await new Promise(r => setTimeout(r, 100));
    await transport.flush();
    await transport.close();

    const files = fs.readdirSync(tempDir);
    expect(files.length).toBeGreaterThan(1);
  });
});

describe('Formatters', () => {
  it('should format as JSON', () => {
    const formatter = new JSONFormatter();
    const entry = {
      level: 'info' as LogLevel,
      message: 'test',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      context: 'ctx',
      metadata: { key: 'value' },
    };

    const result = formatter.format(entry);
    const parsed = JSON.parse(result);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.context).toBe('ctx');
    expect(parsed.key).toBe('value');
  });

  it('should format as pretty', () => {
    const formatter = new PrettyFormatter();
    const entry = {
      level: 'error' as LogLevel,
      message: 'error msg',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      context: 'ctx',
    };

    const result = formatter.format(entry);
    expect(result).toContain('\x1b[31m');
    expect(result).toContain('[ctx]');
  });

  it('should format as logfmt', () => {
    const formatter = new LogfmtFormatter();
    const entry = {
      level: 'info' as LogLevel,
      message: 'test msg',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      context: 'ctx',
      metadata: { key: 'value' },
    };

    const result = formatter.format(entry);
    expect(result).toContain('level=info');
    expect(result).toContain('msg="test msg"');
    expect(result).toContain('context="ctx"');
    expect(result).toContain('key="value"');
  });
});
