import { Writable, WritableOptions } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { LogEntry, LogLevel } from '@faultless/core';
import { LogFormatter } from './formatters';

export interface TransportOptions extends WritableOptions {
  level?: LogLevel;
  formatter?: LogFormatter;
}

export abstract class Transport extends Writable {
  protected level: LogLevel;
  protected formatter: LogFormatter;

  constructor(options: TransportOptions = {}) {
    super({ objectMode: true, ...options });
    this.level = options.level ?? 'info';
    this.formatter = options.formatter ?? createDefaultFormatter();
  }

  _write(entry: LogEntry, encoding: string, callback: (error?: Error | null) => void): void {
    if (this.shouldLog(entry.level)) {
      this.writeEntry(entry);
    }
    callback();
  }

  protected shouldLog(entryLevel: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10,
    };
    return levels[entryLevel] >= levels[this.level];
  }

  protected abstract writeEntry(entry: LogEntry): void;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setFormatter(formatter: LogFormatter): void {
    this.formatter = formatter;
  }
}

function createDefaultFormatter(): LogFormatter {
  return {
    format: (entry) => JSON.stringify(entry),
  };
}

export class ConsoleTransport extends Transport {
  private stdout: NodeJS.WriteStream;
  private stderr: NodeJS.WriteStream;

  constructor(options: TransportOptions = {}) {
    super(options);
    this.stdout = process.stdout;
    this.stderr = process.stderr;
  }

  protected writeEntry(entry: LogEntry): void {
    const output = this.formatter.format(entry);
    const stream = entry.level === 'error' || entry.level === 'fatal' ? this.stderr : this.stdout;
    stream.write(output + '\n');
  }
}

export class FileTransport extends Transport {
  private filePath: string;
  private fd?: number;
  private buffer: string[] = [];
  private flushing = false;
  private flushInterval?: NodeJS.Timeout;

  constructor(filePath: string, options: TransportOptions = {}) {
    super(options);
    this.filePath = filePath;
    this.openFile();
    this.startFlushInterval();
  }

  private openFile(): void {
    this.fd = fs.openSync(this.filePath, 'a');
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => this.flush(), 1000);
    if (this.flushInterval.unref) this.flushInterval.unref();
  }

  protected writeEntry(entry: LogEntry): void {
    const output = this.formatter.format(entry);
    this.buffer.push(output);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0 || this.fd === undefined) return;

    this.flushing = true;
    const data = this.buffer.join('\n') + '\n';
    this.buffer = [];

    try {
      fs.writeSync(this.fd!, Buffer.from(data));
    } catch (error) {
      this.buffer.unshift(...data.split('\n').filter(Boolean));
    } finally {
      this.flushing = false;
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
    if (this.fd !== undefined) {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    this.close().then(() => callback()).catch(callback);
  }
}

export class RotatingFileTransport extends FileTransport {
  private maxSize: number;
  private maxFiles: number;
  private currentSize = 0;

  constructor(filePath: string, options: TransportOptions & { maxSize?: number; maxFiles?: number } = {}) {
    super(filePath, options);
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }

  protected async writeEntry(entry: LogEntry): void {
    const output = this.formatter.format(entry) + '\n';
    const size = Buffer.byteLength(output);

    if (this.currentSize + size > this.maxSize) {
      await this.rotate();
    }

    this.currentSize += size;
    return super.writeEntry(entry);
  }

  private async rotate(): Promise<void> {
    await this.flush();

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldPath = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`;
      const newPath = `${this.filePath}.${i}`;

      if (fs.existsSync(oldPath)) {
        if (i === this.maxFiles - 1) {
          fs.unlinkSync(oldPath);
        } else {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    if (this.fd !== undefined) {
      fs.closeSync(this.fd);
    }

    if (fs.existsSync(this.filePath)) {
      fs.renameSync(this.filePath, `${this.filePath}.1`);
    }

    this.openFile();
    this.currentSize = 0;
  }
}

export class HttpTransport extends Transport {
  private endpoint: string;
  private batchSize: number;
  private batch: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(endpoint: string, options: TransportOptions & { batchSize?: number; flushInterval?: number } = {}) {
    super(options);
    this.endpoint = endpoint;
    this.batchSize = options.batchSize ?? 100;

    const interval = options.flushInterval ?? 5000;
    this.flushTimer = setInterval(() => this.flush(), interval);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  protected writeEntry(entry: LogEntry): void {
    this.batch.push(entry);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const batch = this.batch.splice(0, this.batchSize);

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(e => ({
          timestamp: e.timestamp.toISOString(),
          level: e.level,
          message: e.message,
          context: e.context,
          metadata: e.metadata,
        }))),
      });
    } catch {
      this.batch.unshift(...batch);
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    this.flush().then(() => callback()).catch(callback);
  }
}

export class MultiTransport extends Transport {
  private transports: Transport[];

  constructor(transports: Transport[]) {
    super({ level: 'trace' });
    this.transports = transports;
  }

  protected writeEntry(entry: LogEntry): void {
    for (const transport of this.transports) {
      if (transport.shouldLog(entry.level)) {
        transport.write(entry);
      }
    }
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  removeTransport(transport: Transport): void {
    const index = this.transports.indexOf(transport);
    if (index !== -1) this.transports.splice(index, 1);
  }
}