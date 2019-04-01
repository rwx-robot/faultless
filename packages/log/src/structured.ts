import { EventEmitter } from 'events';
import { LogEntry, LogLevel } from '@faultless/core';
import { Transport, ConsoleTransport } from './transports';
import { createFormatter, JSONFormatter, LogFormatter } from './formatters';
import { getLevelValue, isLevelEnabled } from './levels';

export interface StructuredField {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface StructuredLogEntry extends LogEntry {
  fields: StructuredField[];
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  serviceName?: string;
  environment?: string;
  version?: string;
}

export interface FieldExtractor {
  (entry: LogEntry): StructuredField[];
}

export const defaultFieldExtractor: FieldExtractor = (entry) => {
  const fields: StructuredField[] = [];

  if (entry.context) {
    fields.push({ key: 'context', value: entry.context, type: 'string' });
  }

  if (entry.metadata) {
    for (const [key, value] of Object.entries(entry.metadata)) {
      if (value === null) {
        fields.push({ key, value: null, type: 'string' });
      } else if (typeof value === 'object') {
        fields.push({ key, value, type: Array.isArray(value) ? 'array' : 'object' });
      } else {
        fields.push({ key, value, type: typeof value as 'string' | 'number' | 'boolean' });
      }
    }
  }

  return fields;
};

export function createStructuredEntry(
  base: LogEntry,
  extractor: FieldExtractor = defaultFieldExtractor,
  extra: Partial<StructuredLogEntry> = {}
): StructuredLogEntry {
  return {
    ...base,
    fields: extractor(base),
    ...extra,
  };
}

export interface LogSampler {
  shouldSample(entry: LogEntry): boolean;
}

export class AlwaysSampler implements LogSampler {
  shouldSample(): boolean {
    return true;
  }
}

export class NeverSampler implements LogSampler {
  shouldSample(): boolean {
    return false;
  }
}

export class ProbabilisticSampler implements LogSampler {
  private rate: number;

  constructor(rate: number) {
    this.rate = Math.max(0, Math.min(1, rate));
  }

  shouldSample(): boolean {
    return Math.random() < this.rate;
  }
}

export class LevelBasedSampler implements LogSampler {
  private rates: Record<LogLevel, number>;

  constructor(rates: Partial<Record<LogLevel, number>> = {}) {
    this.rates = {
      fatal: rates.fatal ?? 1,
      error: rates.error ?? 1,
      warn: rates.warn ?? 1,
      info: rates.info ?? 0.1,
      debug: rates.debug ?? 0.01,
      trace: rates.trace ?? 0.001,
    };
  }

  shouldSample(entry: LogEntry): boolean {
    return Math.random() < (this.rates[entry.level] ?? 1);
  }
}

export class RateLimitedSampler implements LogSampler {
  private maxPerSecond: number;
  private counts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(maxPerSecond: number) {
    this.maxPerSecond = maxPerSecond;
  }

  shouldSample(entry: LogEntry): boolean {
    const key = `${entry.level}:${entry.context ?? 'global'}`;
    const now = Date.now();
    const windowStart = now - 1000;

    let record = this.counts.get(key);
    if (!record || record.resetTime < windowStart) {
      record = { count: 0, resetTime: now + 1000 };
      this.counts.set(key, record);
    }

    if (record.count >= this.maxPerSecond) {
      return false;
    }

    record.count++;
    return true;
  }
}

export class CompositeSampler implements LogSampler {
  private samplers: LogSampler[];

  constructor(...samplers: LogSampler[]) {
    this.samplers = samplers;
  }

  shouldSample(entry: LogEntry): boolean {
    return this.samplers.every(s => s.shouldSample(entry));
  }
}

export function createSampler(type: 'always' | 'never' | 'probabilistic' | 'level' | 'rate', options?: { rate?: number; maxPerSecond?: number }): LogSampler {
  switch (type) {
    case 'always':
      return new AlwaysSampler();
    case 'never':
      return new NeverSampler();
    case 'probabilistic':
      return new ProbabilisticSampler(options?.rate ?? 0.1);
    case 'level':
      return new LevelBasedSampler();
    case 'rate':
      return new RateLimitedSampler(options?.maxPerSecond ?? 100);
    default:
      return new AlwaysSampler();
  }
}

export interface AsyncWriter {
  write(entry: LogEntry): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class BufferedAsyncWriter implements AsyncWriter {
  private buffer: LogEntry[] = [];
  private flushPromise: Promise<void> | null = null;
  private closed = false;
  private flushInterval: NodeJS.Timeout;

  constructor(
    private writer: (entries: LogEntry[]) => Promise<void>,
    private options: { bufferSize?: number; flushInterval?: number } = {}
  ) {
    this.flushInterval = setInterval(() => this.flush(), options.flushInterval ?? 1000);
    this.flushInterval.unref?.();
  }

  async write(entry: LogEntry): Promise<void> {
    if (this.closed) return;

    this.buffer.push(entry);

    if (this.buffer.length >= (this.options.bufferSize ?? 100)) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushPromise) return;

    this.flushPromise = (async () => {
      const toWrite = this.buffer.splice(0, this.buffer.length);
      try {
        await this.writer(toWrite);
      } catch (error) {
        this.buffer.unshift(...toWrite);
        throw error;
      } finally {
        this.flushPromise = null;
      }
    })();

    return this.flushPromise;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    clearInterval(this.flushInterval);
  }
}

export class BatchedHttpWriter implements AsyncWriter {
  private buffer: LogEntry[] = [];
  private flushPromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    private endpoint: string,
    private options: { batchSize?: number; flushInterval?: number; headers?: Record<string, string> } = {}
  ) {}

  async write(entry: LogEntry): Promise<void> {
    if (this.closed) return;

    this.buffer.push(entry);

    if (this.buffer.length >= (this.options.batchSize ?? 100)) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushPromise) return;

    this.flushPromise = (async () => {
      const toWrite = this.buffer.splice(0, this.buffer.length);
      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.options.headers,
          },
          body: JSON.stringify(toWrite.map(e => ({
            timestamp: e.timestamp.toISOString(),
            level: e.level,
            message: e.message,
            context: e.context,
            metadata: e.metadata,
          }))),
        });
      } catch {
        this.buffer.unshift(...toWrite);
      } finally {
        this.flushPromise = null;
      }
    })();

    return this.flushPromise;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }
}

export interface LogAggregator {
  aggregate(entries: LogEntry[]): Promise<void>;
  query(query: LogQuery): Promise<LogQueryResult>;
}

export interface LogQuery {
  level?: LogLevel;
  context?: string;
  startTime?: Date;
  endTime?: Date;
  traceId?: string;
  serviceName?: string;
  limit?: number;
  offset?: number;
}

export interface LogQueryResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

export class InMemoryLogAggregator implements LogAggregator {
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  async aggregate(entries: LogEntry[]): Promise<void> {
    this.entries.push(...entries);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  async query(query: LogQuery): Promise<LogQueryResult> {
    let filtered = this.entries;

    if (query.level) {
      filtered = filtered.filter(e => e.level === query.level);
    }
    if (query.context) {
      filtered = filtered.filter(e => e.context === query.context);
    }
    if (query.startTime) {
      filtered = filtered.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      filtered = filtered.filter(e => e.timestamp <= query.endTime!);
    }
    if (query.traceId) {
      filtered = filtered.filter(e => (e as any).traceId === query.traceId);
    }
    if (query.serviceName) {
      filtered = filtered.filter(e => (e as any).serviceName === query.serviceName);
    }

    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      entries: paginated,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  }

  getAllEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

export interface StructuredLoggerOptions {
  serviceName: string;
  version?: string;
  environment?: string;
  correlationId?: boolean;
  sensitiveFields?: string[];
  level?: LogLevel;
  format?: 'json' | 'pretty' | 'simple' | 'logfmt' | LogFormatter;
  transports?: Transport[];
  sampler?: LogSampler | 'always' | 'never' | 'probabilistic' | 'level' | 'rate';
  samplerOptions?: { rate?: number; maxPerSecond?: number };
}

export interface LogContext {
  [key: string]: unknown;
}

export class StructuredLogger extends EventEmitter {
  private serviceName: string;
  private version?: string;
  private environment?: string;
  private correlationIdEnabled: boolean;
  private sensitiveFields: string[];
  private level: LogLevel;
  private formatter: LogFormatter;
  private transports: Transport[];
  private sampler: LogSampler;
  private aggregator: LogAggregator;
  private childContext: LogContext = {};
  private correlationId?: string;

  constructor(options: StructuredLoggerOptions) {
    super();
    this.serviceName = options.serviceName;
    this.version = options.version;
    this.environment = options.environment;
    this.correlationIdEnabled = options.correlationId ?? true;
    this.sensitiveFields = options.sensitiveFields ?? ['password', 'secret', 'token', 'key', 'authorization', 'cookie'];
    this.level = options.level ?? 'info';
    this.formatter = options.format
      ? typeof options.format === 'string'
        ? createFormatter(options.format)
        : options.format
      : new JSONFormatter();
    this.transports = options.transports ?? [new ConsoleTransport({ level: this.level, formatter: this.formatter })];
    this.sampler = options.sampler
      ? typeof options.sampler === 'string'
        ? createSampler(options.sampler, options.samplerOptions)
        : options.sampler
      : new AlwaysSampler();
    this.aggregator = new InMemoryLogAggregator();
  }

  private shouldLog(level: LogLevel): boolean {
    return isLevelEnabled(this.level, level);
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.redact(item as Record<string, unknown>)
            : item
        );
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const metadata: Record<string, unknown> = {
      ...this.childContext,
      ...context,
    };

    if (error) {
      metadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (this.correlationIdEnabled && this.correlationId) {
      metadata.correlationId = this.correlationId;
    }

    metadata.serviceName = this.serviceName;
    if (this.version) {
      metadata.version = this.version;
    }
    if (this.environment) {
      metadata.environment = this.environment;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.serviceName,
      metadata: this.redact(metadata),
    };

    return entry;
  }

  private async log(entry: LogEntry): Promise<void> {
    if (!this.sampler.shouldSample(entry)) {
      return;
    }

    for (const transport of this.transports) {
      if (transport.shouldLog(entry.level)) {
        transport.write(entry);
      }
    }

    await this.aggregator.aggregate([entry]);
    this.emit('log', entry);
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      const entry = this.createLogEntry('info', message, context);
      this.log(entry);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      const entry = this.createLogEntry('warn', message, context);
      this.log(entry);
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const entry = this.createLogEntry('error', message, context, error);
      this.log(entry);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      const entry = this.createLogEntry('debug', message, context);
      this.log(entry);
    }
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog('fatal')) {
      const entry = this.createLogEntry('fatal', message, context, error);
      this.log(entry);
    }
  }

  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger({
      serviceName: this.serviceName,
      version: this.version,
      environment: this.environment,
      correlationId: this.correlationIdEnabled,
      sensitiveFields: this.sensitiveFields,
      level: this.level,
      format: this.formatter as any,
      transports: this.transports,
      sampler: this.sampler,
    });

    childLogger.childContext = { ...this.childContext, ...context };
    childLogger.correlationId = this.correlationId;

    return childLogger;
  }

  withCorrelationId(id: string): StructuredLogger {
    const logger = this.child({});
    logger.correlationId = id;
    return logger;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  getAggregator(): LogAggregator {
    return this.aggregator;
  }

  setAggregator(aggregator: LogAggregator): void {
    this.aggregator = aggregator;
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.transports.map(t => {
        if ('flush' in t && typeof t.flush === 'function') {
          return (t as any).flush();
        }
        return Promise.resolve();
      })
    );
  }

  async close(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.transports.map(t => {
        if ('close' in t && typeof t.close === 'function') {
          return (t as any).close();
        }
        return Promise.resolve();
      })
    );
    this.removeAllListeners();
  }
}

export function createStructuredLogger(options: StructuredLoggerOptions): StructuredLogger {
  return new StructuredLogger(options);
}
