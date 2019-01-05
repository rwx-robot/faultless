import { EventEmitter } from 'events';
import { LogEntry, LogLevel } from '@faultless/core';
import { Transport, ConsoleTransport, FileTransport, RotatingFileTransport, HttpTransport, TransportOptions } from './transports';
import { LogFormatter, JSONFormatter, PrettyFormatter, createFormatter } from './formatters';
import { getLevelValue, isLevelEnabled } from './levels';
import { LogSampler, createSampler, AsyncWriter, BufferedAsyncWriter, BatchedHttpWriter, LogAggregator, InMemoryLogAggregator, StructuredLogEntry, createStructuredEntry, AlwaysSampler } from './structured';

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty' | 'simple' | 'logfmt' | LogFormatter;
  transports?: Transport[];
  defaultContext?: string;
  defaultMetadata?: Record<string, unknown>;
  redactKeys?: string[];
  sampler?: LogSampler | 'always' | 'never' | 'probabilistic' | 'level' | 'rate';
  samplerOptions?: { rate?: number; maxPerSecond?: number };
  asyncWrite?: boolean;
  asyncWriteOptions?: { bufferSize?: number; flushInterval?: number };
  aggregator?: LogAggregator;
  structuredFields?: boolean;
  fieldExtractor?: (entry: LogEntry) => any[];
  serviceName?: string;
  environment?: string;
  version?: string;
}

export class Logger extends EventEmitter {
  private level: LogLevel;
  private formatter: LogFormatter;
  private transports: Transport[] = [];
  private defaultContext?: string;
  private defaultMetadata: Record<string, unknown> = {};
  private redactKeys: string[] = ['password', 'secret', 'token', 'key', 'authorization', 'cookie'];
  private childLoggers: Map<string, Logger> = new Map();
  private sampler: LogSampler;
  private asyncWriters: Map<Transport, AsyncWriter> = new Map();
  private aggregator?: LogAggregator;
  private structuredFields: boolean;
  private fieldExtractor?: (entry: LogEntry) => any[];
  private serviceName?: string;
  private environment?: string;
  private version?: string;

  constructor(options: LoggerOptions = {}) {
    super();
    this.level = options.level ?? 'info';
    this.formatter = this.createFormatter(options.format);
    this.defaultContext = options.defaultContext;
    this.defaultMetadata = options.defaultMetadata ?? {};
    this.redactKeys = options.redactKeys ?? this.redactKeys;
    this.sampler = options.sampler
      ? typeof options.sampler === 'string'
        ? createSampler(options.sampler, options.samplerOptions)
        : options.sampler
      : new AlwaysSampler();
    this.structuredFields = options.structuredFields ?? false;
    this.fieldExtractor = options.fieldExtractor;
    this.serviceName = options.serviceName;
    this.environment = options.environment;
    this.version = options.version;
    this.aggregator = options.aggregator ?? new InMemoryLogAggregator();

    if (options.transports) {
      this.transports = options.transports;
    } else {
      this.transports = [new ConsoleTransport({ level: this.level, formatter: this.formatter })];
    }

    if (options.asyncWrite) {
      this.enableAsyncWrite(options.asyncWriteOptions);
    }
  }

  private createFormatter(format?: 'json' | 'pretty' | 'simple' | 'logfmt' | LogFormatter): LogFormatter {
    if (!format) return new JSONFormatter();
    if (typeof format === 'string') return createFormatter(format);
    return format;
  }

  private enableAsyncWrite(options?: { bufferSize?: number; flushInterval?: number }): void {
    for (const transport of this.transports) {
      if (transport instanceof HttpTransport) {
        const writer = new BatchedHttpWriter((transport as any).endpoint, {
          batchSize: options?.bufferSize ?? 100,
          flushInterval: options?.flushInterval ?? 5000,
        });
        this.asyncWriters.set(transport, writer);
      } else {
        const writer = new BufferedAsyncWriter(
          async (entries) => {
            for (const entry of entries) {
              transport.write(entry);
            }
          },
          { bufferSize: options?.bufferSize ?? 100, flushInterval: options?.flushInterval ?? 1000 }
        );
        this.asyncWriters.set(transport, writer);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return isLevelEnabled(this.level, level);
  }

  private createEntry(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: context ?? this.defaultContext,
      metadata: this.redact({ ...this.defaultMetadata, ...metadata }),
    };
    return entry;
  }

  private createStructuredEntry(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): StructuredLogEntry {
    const baseEntry = this.createEntry(level, message, context, metadata);
    return createStructuredEntry(baseEntry, this.fieldExtractor, {
      serviceName: this.serviceName,
      environment: this.environment,
      version: this.version,
    });
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.redactKeys.some(k => lowerKey.includes(k))) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private async log(entry: LogEntry | StructuredLogEntry): Promise<void> {
    if (!this.sampler.shouldSample(entry)) {
      return;
    }

    for (const transport of this.transports) {
      if (transport.shouldLog(entry.level)) {
        const writer = this.asyncWriters.get(transport);
        if (writer) {
          await writer.write(entry);
        } else {
          transport.write(entry);
        }
      }
    }

    await this.aggregator?.aggregate([entry]);
    this.emit('log', entry);
  }

  fatal(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('fatal')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('fatal', message, context, metadata)
        : this.createEntry('fatal', message, context, metadata);
      this.log(entry);
    }
  }

  error(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('error', message, context, metadata)
        : this.createEntry('error', message, context, metadata);
      this.log(entry);
    }
  }

  warn(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('warn', message, context, metadata)
        : this.createEntry('warn', message, context, metadata);
      this.log(entry);
    }
  }

  info(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('info', message, context, metadata)
        : this.createEntry('info', message, context, metadata);
      this.log(entry);
    }
  }

  debug(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('debug', message, context, metadata)
        : this.createEntry('debug', message, context, metadata);
      this.log(entry);
    }
  }

  trace(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('trace')) {
      const entry = this.structuredFields
        ? this.createStructuredEntry('trace', message, context, metadata)
        : this.createEntry('trace', message, context, metadata);
      this.log(entry);
    }
  }

  logWithLevel(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): void {
    switch (level) {
      case 'fatal': this.fatal(message, context, metadata); break;
      case 'error': this.error(message, context, metadata); break;
      case 'warn': this.warn(message, context, metadata); break;
      case 'info': this.info(message, context, metadata); break;
      case 'debug': this.debug(message, context, metadata); break;
      case 'trace': this.trace(message, context, metadata); break;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    for (const transport of this.transports) {
      transport.setLevel(level);
    }
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setSampler(sampler: LogSampler): void {
    this.sampler = sampler;
  }

  getSampler(): LogSampler {
    return this.sampler;
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
    if (this.asyncWriters.size > 0) {
      const writer = new BufferedAsyncWriter(
        async (entries) => {
          for (const entry of entries) {
            transport.write(entry);
          }
        },
        { bufferSize: 100, flushInterval: 1000 }
      );
      this.asyncWriters.set(transport, writer);
    }
  }

  removeTransport(transport: Transport): void {
    const index = this.transports.indexOf(transport);
    if (index !== -1) {
      this.transports.splice(index, 1);
      const writer = this.asyncWriters.get(transport);
      if (writer) {
        writer.close();
        this.asyncWriters.delete(transport);
      }
    }
  }

  setFormatter(formatter: LogFormatter): void {
    this.formatter = formatter;
    for (const transport of this.transports) {
      transport.setFormatter(formatter);
    }
  }

  setDefaultContext(context: string): void {
    this.defaultContext = context;
  }

  setDefaultMetadata(metadata: Record<string, unknown>): void {
    this.defaultMetadata = { ...this.defaultMetadata, ...metadata };
  }

  child(context: string, metadata?: Record<string, unknown>): Logger {
    const key = context + JSON.stringify(metadata ?? {});
    let child = this.childLoggers.get(key);

    if (!child) {
      child = new Logger({
        level: this.level,
        format: this.formatter,
        transports: this.transports,
        defaultContext: context,
        defaultMetadata: { ...this.defaultMetadata, ...metadata },
        redactKeys: this.redactKeys,
        sampler: this.sampler,
        asyncWrite: this.asyncWriters.size > 0,
        aggregator: this.aggregator,
        structuredFields: this.structuredFields,
        fieldExtractor: this.fieldExtractor,
        serviceName: this.serviceName,
        environment: this.environment,
        version: this.version,
      });
      this.childLoggers.set(key, child);
    }

    return child;
  }

  async flush(): Promise<void> {
    await Promise.all(
      Array.from(this.asyncWriters.values()).map(w => w.flush())
    );
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
      Array.from(this.asyncWriters.values()).map(w => w.close())
    );
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

  getAggregator(): LogAggregator {
    return this.aggregator;
  }

  setAggregator(aggregator: LogAggregator): void {
    this.aggregator = aggregator;
  }

  enableStructuredFields(extractor?: (entry: LogEntry) => any[]): void {
    this.structuredFields = true;
    this.fieldExtractor = extractor;
  }

  disableStructuredFields(): void {
    this.structuredFields = false;
    this.fieldExtractor = undefined;
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

export const defaultLogger = createLogger();

export function getLogger(context?: string): Logger {
  if (context) {
    return defaultLogger.child(context);
  }
  return defaultLogger;
}