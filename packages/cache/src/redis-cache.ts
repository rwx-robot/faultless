import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'cache:redis' });

/**
 * Redis Cache Options
 */
export interface RedisCacheOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  ttl?: number;
  serialize?: boolean;
}

/**
 * Redis Cache
 * - Full Redis cache implementation
 * - TTL support
 * - Key prefix
 * - JSON serialization
 * - Connection management
 * - Pipeline support
 */
@Injectable()
export class RedisCache {
  private options: RedisCacheOptions;
  private client: any;
  private connected = false;

  constructor(options: RedisCacheOptions) {
    this.options = {
      port: 6379,
      keyPrefix: 'nofault:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      ttl: 60000,
      serialize: true,
      ...options,
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      // Dynamic import for ioredis
      const Redis = (await import('ioredis')).default;
      this.client = new Redis({
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
        db: this.options.db,
        keyPrefix: this.options.keyPrefix,
        maxRetriesPerRequest: this.options.maxRetriesPerRequest,
        retryDelayOnFailover: this.options.retryDelayOnFailover,
      });

      this.client.on('connect', () => {
        this.connected = true;
        logger.info('Redis connected', { host: this.options.host, port: this.options.port });
      });

      this.client.on('error', (err: Error) => {
        this.connected = false;
        logger.error('Redis error', { error: err.message });
      });

      await this.client.ping();
      this.connected = true;
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) throw new Error('Redis not connected');

    const value = await this.client.get(key);
    if (!value) return null;

    return this.deserializeValue(value) as T;
  }

  /**
   * Set value
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.connected) throw new Error('Redis not connected');

    const serialized = this.serializeValue(value);
    const expiry = ttl ?? this.options.ttl;

    if (expiry) {
      await this.client.setex(key, Math.floor(expiry / 1000), serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Delete value
   */
  async del(key: string): Promise<boolean> {
    if (!this.connected) throw new Error('Redis not connected');

    const result = await this.client.del(key);
    return result > 0;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.connected) throw new Error('Redis not connected');

    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set TTL
   */
  async expire(key: string, ttlMs: number): Promise<void> {
    if (!this.connected) throw new Error('Redis not connected');

    await this.client.expire(key, Math.floor(ttlMs / 1000));
  }

  /**
   * Get TTL
   */
  async ttl(key: string): Promise<number> {
    if (!this.connected) throw new Error('Redis not connected');

    const ttlSeconds = await this.client.ttl(key);
    return ttlSeconds * 1000;
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    if (!this.connected) throw new Error('Redis not connected');

    return await this.client.incr(key);
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    if (!this.connected) throw new Error('Redis not connected');

    return await this.client.decr(key);
  }

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.connected) throw new Error('Redis not connected');

    const values = await this.client.mget(keys);
    return values.map((v: any) => (v ? this.deserializeValue(v) : null));
  }

  /**
   * Set multiple values
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    if (!this.connected) throw new Error('Redis not connected');

    const pipeline = this.client.pipeline();
    for (const { key, value, ttl } of entries) {
      const serialized = this.serializeValue(value);
      const expiry = ttl ?? this.options.ttl;
      if (expiry) {
        pipeline.setex(key, Math.floor(expiry / 1000), serialized);
      } else {
        pipeline.set(key, serialized);
      }
    }
    await pipeline.exec();
  }

  /**
   * Delete multiple values
   */
  async mdel(keys: string[]): Promise<number> {
    if (!this.connected) throw new Error('Redis not connected');

    return await this.client.del(...keys);
  }

  /**
   * Clear all keys with prefix
   */
  async clear(): Promise<void> {
    if (!this.connected) throw new Error('Redis not connected');

    const pattern = `${this.options.keyPrefix}*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.connected) throw new Error('Redis not connected');

    return await this.client.keys(pattern);
  }

  /**
   * Get or set (cache-aside)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Get stats
   */
  getStats(): { connected: boolean; keyPrefix: string } {
    return {
      connected: this.connected,
      keyPrefix: this.options.keyPrefix ?? '',
    };
  }

  /**
   * Serialize value
   */
  private serializeValue(value: any): string {
    if (!this.options.serialize) return String(value);
    return JSON.stringify(value);
  }

  /**
   * Deserialize value
   */
  private deserializeValue(value: string): any {
    if (!this.options.serialize) return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

/**
 * Create Redis cache
 */
export function createRedisCache(options: RedisCacheOptions): RedisCache {
  return new RedisCache(options);
}

/**
 * Redis Cache with Sentinel support
 */
export class RedisSentinelCache extends RedisCache {
  private sentinels: Array<{ host: string; port: number }>;
  private sentinelPassword?: string;
  private masterName: string;

  constructor(options: RedisCacheOptions & {
    sentinels: Array<{ host: string; port: number }>;
    sentinelPassword?: string;
    masterName: string;
  }) {
    super(options);
    this.sentinels = options.sentinels;
    this.sentinelPassword = options.sentinelPassword;
    this.masterName = options.masterName;
  }

  /**
   * Connect via Sentinel
   */
  async connect(): Promise<void> {
    try {
      const Redis = (await import('ioredis')).default;
      this.client = new Redis({
        sentinels: this.sentinels,
        sentinelPassword: this.sentinelPassword,
        name: this.masterName,
        password: this.options.password,
        db: this.options.db,
        keyPrefix: this.options.keyPrefix,
      });

      await this.client.ping();
      (this as any).connected = true;
      logger.info('Redis connected via Sentinel', {
        masterName: this.masterName,
        sentinels: this.sentinels,
      });
    } catch (error) {
      logger.error('Failed to connect via Sentinel', { error: (error as Error).message });
      throw error;
    }
  }
}

/**
 * Create Redis Sentinel cache
 */
export function createRedisSentinelCache(options: RedisCacheOptions & {
  sentinels: Array<{ host: string; port: number }>;
  sentinelPassword?: string;
  masterName: string;
}): RedisSentinelCache {
  return new RedisSentinelCache(options);
}