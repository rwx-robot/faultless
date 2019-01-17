import { EventEmitter } from 'events';
import { RateLimitOptions } from '@faultless/core';
import { RateLimitStore, MemoryRateLimitStore, RedisRateLimitStore } from './store';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('limit:rate-limiter');

export interface DistributedRateLimiterOptions {
  store: 'memory' | 'redis';
  redis?: { host: string; port: number; password?: string; db?: number };
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  total: number;
}

export interface RateLimitConfig extends RateLimitOptions {
  name: string;
  store?: RateLimitStore;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: (result: RateLimitResult) => void;
}

export class RateLimiter extends EventEmitter {
  private store: RateLimitStore;
  private config: RateLimitConfig;
  private windowMs: number;
  private max: number;

  constructor(config: RateLimitConfig) {
    super();
    this.config = {
      windowMs: 60000,
      max: 100,
      keyPrefix: 'ratelimit:',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };
    this.windowMs = this.config.windowMs;
    this.max = this.config.max;

    this.store = config.store ?? new MemoryRateLimitStore();
  }

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const prefixedKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const resetTime = new Date(now + this.windowMs);

    const result = await this.store.increment(prefixedKey, cost, this.windowMs, now);

    const allowed = result.total <= this.max;
    const remaining = Math.max(0, this.max - result.total);

    const rateLimitResult: RateLimitResult = {
      allowed,
      limit: this.max,
      remaining,
      resetTime,
      total: result.total,
    };

    this.config.handler?.(rateLimitResult);

    if (!allowed) {
      this.emit('limited', { key, result: rateLimitResult });
      logger.warn(`Rate limit exceeded for key: ${key}`, rateLimitResult);
    } else {
      this.emit('allowed', { key, result: rateLimitResult });
    }

    return rateLimitResult;
  }

  async get(key: string): Promise<RateLimitResult | null> {
    const prefixedKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const resetTime = new Date(now + this.windowMs);

    const result = await this.store.get(prefixedKey, windowStart, now);

    if (!result) {
      return null;
    }

    return {
      allowed: result.total <= this.max,
      limit: this.max,
      remaining: Math.max(0, this.max - result.total),
      resetTime,
      total: result.total,
    };
  }

  async reset(key: string): Promise<void> {
    const prefixedKey = `${this.config.keyPrefix}${key}`;
    if (this.store.delete) {
      await this.store.delete(prefixedKey);
    } else {
      await this.store.decrement(prefixedKey, this.max);
    }
  }

  async resetAll(): Promise<void> {
    await this.store.resetAll();
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    this.windowMs = this.config.windowMs;
    this.max = this.config.max;
  }
}

export class RateLimiterRegistry {
  private limiters: Map<string, RateLimiter> = new Map();
  private defaultStore?: RateLimitStore;

  setDefaultStore(store: RateLimitStore): void {
    this.defaultStore = store;
  }

  create(config: RateLimitConfig): RateLimiter {
    if (this.limiters.has(config.name)) {
      throw new Error(`Rate limiter ${config.name} already exists`);
    }

    const limiter = new RateLimiter({
      ...config,
      store: config.store ?? this.defaultStore,
    });

    this.limiters.set(config.name, limiter);
    return limiter;
  }

  get(name: string): RateLimiter | undefined {
    return this.limiters.get(name);
  }

  getOrCreate(config: RateLimitConfig): RateLimiter {
    let limiter = this.limiters.get(config.name);
    if (!limiter) {
      limiter = this.create(config);
    }
    return limiter;
  }

  remove(name: string): boolean {
    return this.limiters.delete(name);
  }

  getAll(): RateLimiter[] {
    return Array.from(this.limiters.values());
  }

  async resetAll(): Promise<void> {
    for (const limiter of this.limiters.values()) {
      await limiter.resetAll();
    }
  }
}

export const rateLimiterRegistry = new RateLimiterRegistry();

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return rateLimiterRegistry.getOrCreate(config);
}

export class DistributedRateLimiter extends RateLimiter {
  constructor(options: DistributedRateLimiterOptions & Omit<RateLimitConfig, 'store' | 'keyPrefix'>) {
    const store = options.store === 'redis' && options.redis
      ? new RedisRateLimitStore({
          client: createRedisClient(options.redis),
          prefix: options.keyPrefix ?? 'ratelimit:',
        })
      : new MemoryRateLimitStore();

    super({
      ...options,
      store,
      keyPrefix: options.keyPrefix,
    });
  }
}

function createRedisClient(options: { host: string; port: number; password?: string; db?: number }): any {
  try {
    const Redis = require('ioredis');
    return new Redis({
      host: options.host,
      port: options.port,
      password: options.password,
      db: options.db ?? 0,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });
  } catch {
    logger.warn('ioredis not available, falling back to memory store');
    return null;
  }
}