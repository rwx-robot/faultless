import { HealthIndicator, HealthCheckResult } from '@faultless/core';
import { getLogger } from '@faultless/log';

const logger = getLogger('health:indicators');

export interface MemoryHealthOptions {
  heapUsedThreshold?: number;
  heapTotalThreshold?: number;
  rssThreshold?: number;
}

export class MemoryHealthIndicator implements HealthIndicator {
  name = 'memory';
  private options: MemoryHealthOptions;

  constructor(options: MemoryHealthOptions = {}) {
    this.options = {
      heapUsedThreshold: 0.9,
      heapTotalThreshold: 0.9,
      rssThreshold: 0.9,
      ...options,
    };
  }

  async isHealthy(): Promise<HealthCheckResult> {
    const mem = process.memoryUsage();
    const heapUsedPercent = mem.heapUsed / mem.heapTotal;
    const heapTotalPercent = mem.heapTotal / (1024 * 1024 * 1024);
    const rssPercent = mem.rss / (1024 * 1024 * 1024);

    const details = {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      heapUsedPercent: Math.round(heapUsedPercent * 100),
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    };

    let status: 'ok' | 'error' | 'degraded' = 'ok';

    if (heapUsedPercent > this.options.heapUsedThreshold!) {
      status = 'degraded';
    }
    if (heapUsedPercent > 0.95) {
      status = 'error';
    }

    return {
      status,
      details,
      timestamp: new Date(),
    };
  }
}

export interface DiskHealthOptions {
  path?: string;
  threshold?: number;
}

export class DiskHealthIndicator implements HealthIndicator {
  name = 'disk';
  private options: DiskHealthOptions;

  constructor(options: DiskHealthOptions = {}) {
    this.options = {
      path: process.cwd(),
      threshold: 0.9,
      ...options,
    };
  }

  async isHealthy(): Promise<HealthCheckResult> {
    try {
      const { statfs } = await import('fs/promises');
      const stats = await statfs(this.options.path!);

      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const usedPercent = used / total;

      const details = {
        total,
        free,
        used,
        usedPercent: Math.round(usedPercent * 100),
      };

      let status: 'ok' | 'error' | 'degraded' = 'ok';

      if (usedPercent > this.options.threshold!) {
        status = 'degraded';
      }
      if (usedPercent > 0.95) {
        status = 'error';
      }

      return {
        status,
        details,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
    }
  }
}

export interface DatabaseHealthOptions {
  name: string;
  check: () => Promise<boolean>;
  timeout?: number;
}

export class DatabaseHealthIndicator implements HealthIndicator {
  name: string;
  private checkFn: () => Promise<boolean>;
  private timeout: number;

  constructor(options: DatabaseHealthOptions) {
    this.name = options.name;
    this.checkFn = options.check;
    this.timeout = options.timeout ?? 5000;
  }

  async isHealthy(): Promise<HealthCheckResult> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database health check timeout')), this.timeout);
      });

      const healthy = await Promise.race([this.checkFn(), timeoutPromise]);

      return {
        status: healthy ? 'ok' : 'error',
        details: { database: this.name },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        details: { database: this.name, error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
    }
  }
}

export interface RedisHealthOptions {
  name: string;
  client: any;
  timeout?: number;
}

export class RedisHealthIndicator implements HealthIndicator {
  name: string;
  private client: any;
  private timeout: number;

  constructor(options: RedisHealthOptions) {
    this.name = options.name;
    this.client = options.client;
    this.timeout = options.timeout ?? 5000;
  }

  async isHealthy(): Promise<HealthCheckResult> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis health check timeout')), this.timeout);
      });

      const result = await Promise.race([this.client.ping(), timeoutPromise]);

      return {
        status: result === 'PONG' ? 'ok' : 'error',
        details: { redis: this.name, ping: result },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        details: { redis: this.name, error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
    }
  }
}

export interface HttpHealthOptions {
  name: string;
  url: string;
  expectedStatus?: number;
  timeout?: number;
}

export class HttpHealthIndicator implements HealthIndicator {
  name: string;
  private url: string;
  private expectedStatus: number;
  private timeout: number;

  constructor(options: HttpHealthOptions) {
    this.name = options.name;
    this.url = options.url;
    this.expectedStatus = options.expectedStatus ?? 200;
    this.timeout = options.timeout ?? 5000;
  }

  async isHealthy(): Promise<HealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const healthy = response.status === this.expectedStatus;

      return {
        status: healthy ? 'ok' : 'degraded',
        details: { url: this.url, status: response.status, expected: this.expectedStatus },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        details: { url: this.url, error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
    }
  }
}

export interface CustomHealthOptions {
  name: string;
  check: () => Promise<HealthCheckResult>;
}

export class CustomHealthIndicator implements HealthIndicator {
  name: string;
  private checkFn: () => Promise<HealthCheckResult>;

  constructor(options: CustomHealthOptions) {
    this.name = options.name;
    this.checkFn = options.check;
  }

  async isHealthy(): Promise<HealthCheckResult> {
    return this.checkFn();
  }
}