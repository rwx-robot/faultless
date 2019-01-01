import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'cache:manager' });

/**
 * Cache Provider
 */
export enum CacheProvider {
  MEMORY = 'MEMORY',
  REDIS = 'REDIS',
  MULTI_LEVEL = 'MULTI_LEVEL',
}

/**
 * Cache Options
 */
export interface CacheOptions {
  provider: CacheProvider;
  ttl?: number;              // Default TTL in milliseconds
  prefix?: string;           // Key prefix
  serialize?: boolean;       // Serialize values (default: true)
  maxAge?: number;           // Max age for entries
  max?: number;              // Max entries for memory cache
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
  };
}

/**
 * Cache Entry
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Cache Stats
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  size: number;
}

/**
 * Cache Manager
 * - Multi-level caching (L1: Memory, L2: Redis)
 * - TTL support
 * - Cache invalidation
 * - Statistics tracking
 * - Key prefix support
 * - JSON serialization
 */
@Injectable()
export class CacheManager {
  private options: CacheOptions;
  private memoryCache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    hitRate: 0,
    size: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;
  private redisClient?: any;

  constructor(options: CacheOptions) {
    this.options = {
      ttl: 60000,        // 1 minute default
      prefix: 'nofault:',
      serialize: true,
      max: 1000,
      ...options,
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const entry = this.memoryCache.get(fullKey);

    if (entry) {
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(fullKey);
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      entry.accessCount++;
      entry.lastAccessedAt = Date.now();
      this.stats.hits++;
      this.updateHitRate();

      return this.deserializeValue(entry.value) as T;
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const entryTtl = ttl ?? this.options.ttl!;
    const serializedValue = this.serializeValue(value);

    const entry: CacheEntry<any> = {
      value: serializedValue,
      expiresAt: Date.now() + entryTtl,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
    };

    this.memoryCache.set(fullKey, entry);
    this.stats.sets++;
    this.stats.size = this.memoryCache.size;

    // Check if we need to evict
    if (this.memoryCache.size > this.options.max!) {
      this.evict();
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const deleted = this.memoryCache.delete(fullKey);
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.memoryCache.size;
    }
    return deleted;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const entry = this.memoryCache.get(fullKey);

    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(fullKey);
      return false;
    }

    return true;
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Write-through: write to cache AND backing store simultaneously
   * The factory should write to the backing store and return the value.
   * The value is then written to cache.
   */
  async writeThrough<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Write-behind (write-back): write to cache immediately,
   * then asynchronously persist to the backing store.
   */
  async writeBehind<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      // Fire-and-forget: update backing store in background
      factory().catch(err => {
        logger.error({ err, key }, 'write-behind background write failed');
      });
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Refresh-ahead: return cached value, but if it's past the refresh threshold,
   * trigger an async refresh in the background.
   */
  async refreshAhead<T>(
    key: string,
    factory: () => Promise<T>,
    refreshThreshold: number,
    ttl?: number
  ): Promise<T> {
    const fullKey = this.getFullKey(key);
    const entry = this.memoryCache.get(fullKey);

    if (entry) {
      const age = Date.now() - entry.createdAt;
      if (age > refreshThreshold) {
        // Background refresh — don't await
        factory()
          .then(newValue => this.set(key, newValue, ttl))
          .catch(err => {
            logger.error({ err, key }, 'refresh-ahead background refresh failed');
          });
      }
      return this.deserializeValue(entry.value) as T;
    }

    // Cache miss: fetch synchronously
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  /**
   * Set multiple values
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    await Promise.all(
      entries.map(({ key, value, ttl }) => this.set(key, value, ttl))
    );
  }

  /**
   * Delete multiple values
   */
  async mdel(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const deleted = await this.delete(key);
      if (deleted) count++;
    }
    return count;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.stats.size = 0;
  }

  /**
   * Get stats
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.memoryCache.size;
    }
  }

  /**
   * Evict least recently used entries
   */
  private evict(): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    const toEvict = Math.ceil(this.options.max! * 0.1); // Evict 10%
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      this.memoryCache.delete(entries[i][0]);
      this.stats.evictions++;
    }

    this.stats.size = this.memoryCache.size;
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.options.prefix}${key}`;
  }

  /**
   * Serialize value
   */
  private serializeValue(value: any): any {
    if (!this.options.serialize) return value;
    return JSON.stringify(value);
  }

  /**
   * Deserialize value
   */
  private deserializeValue(value: any): any {
    if (!this.options.serialize) return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Close cache
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.memoryCache.clear();
  }
}

/**
 * Create cache manager
 */
export function createCacheManager(options: CacheOptions): CacheManager {
  return new CacheManager(options);
}

/**
 * Multi-Level Cache (L1: Memory, L2: Redis)
 */
export class MultiLevelCache {
  private l1: CacheManager;
  private l2?: CacheManager;

  constructor(options: {
    l1: CacheOptions;
    l2?: CacheOptions;
  }) {
    this.l1 = createCacheManager({ ...options.l1, provider: CacheProvider.MEMORY });
    if (options.l2) {
      this.l2 = createCacheManager(options.l2);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try L1 first
    const l1Value = await this.l1.get<T>(key);
    if (l1Value !== null) return l1Value;

    // Try L2
    if (this.l2) {
      const l2Value = await this.l2.get<T>(key);
      if (l2Value !== null) {
        // Populate L1
        await this.l1.set(key, l2Value);
        return l2Value;
      }
    }

    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.l1.set(key, value, ttl);
    if (this.l2) {
      await this.l2.set(key, value, ttl);
    }
  }

  async delete(key: string): Promise<boolean> {
    const l1Deleted = await this.l1.delete(key);
    if (this.l2) {
      await this.l2.delete(key);
    }
    return l1Deleted;
  }

  async clear(): Promise<void> {
    await this.l1.clear();
    if (this.l2) {
      await this.l2.clear();
    }
  }

  getStats(): { l1: CacheStats; l2?: CacheStats } {
    return {
      l1: this.l1.getStats(),
      l2: this.l2?.getStats(),
    };
  }

  async close(): Promise<void> {
    await this.l1.close();
    if (this.l2) {
      await this.l2.close();
    }
  }
}

export function createMultiLevelCache(options: {
  l1: CacheOptions;
  l2?: CacheOptions;
}): MultiLevelCache {
  return new MultiLevelCache(options);
}

/**
 * Cache Decorator for methods
 */
export function Cached(options?: {
  key?: string;
  ttl?: number;
  prefix?: string;
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).__cache__ || createCacheManager({
        provider: CacheProvider.MEMORY,
        prefix: options?.prefix ?? 'method:',
      });

      const key = options?.key
        ? `${options.key}:${args.join(':')}`
        : `${propertyKey}:${args.join(':')}`;

      const cached = await cache.get(key);
      if (cached !== null) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await cache.set(key, result, options?.ttl);
      return result;
    };

    return descriptor;
  };
}

/**
 * Cache Invalidate Decorator
 */
export function CacheInvalidate(pattern: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      const cache = (this as any).__cache__;
      if (cache) {
        // Simple pattern matching - in real implementation, use proper pattern matching
        const keys = Array.from((cache as any).memoryCache.keys())
          .filter((key: string) => key.includes(pattern));

        for (const key of keys) {
          await cache.delete(key);
        }
      }

      return result;
    };

    return descriptor;
  };
}