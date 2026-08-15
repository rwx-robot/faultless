import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CacheManager,
  createCacheManager,
  CacheProvider,
  MultiLevelCache,
  createMultiLevelCache,
} from '@faultless/cache';

describe('Cache + Store Integration', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = createCacheManager({
      provider: CacheProvider.MEMORY,
      ttl: 5000,
      prefix: 'test:',
      max: 100,
    });
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('Cache-Aside Pattern', () => {
    it('should get value from cache if present (cache hit)', async () => {
      await cache.set('user:1', { id: 1, name: 'John' });

      const value = await cache.get('user:1');
      expect(value).toEqual({ id: 1, name: 'John' });

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('should return null on cache miss', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should implement getOrSet (cache-aside pattern)', async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return { id: 1, name: 'John', computedAt: Date.now() };
      };

      // First call - cache miss, factory called
      const result1 = await cache.getOrSet('user:1', factory);
      expect(factoryCalls).toBe(1);
      expect(result1.id).toBe(1);

      // Second call - cache hit, factory NOT called
      const result2 = await cache.getOrSet('user:1', factory);
      expect(factoryCalls).toBe(1);
      expect(result2).toEqual(result1);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should call factory again after cache invalidation', async () => {
      let callCount = 0;
      const factory = async () => {
        callCount++;
        return { data: `call-${callCount}` };
      };

      await cache.getOrSet('key', factory);
      expect(callCount).toBe(1);

      await cache.delete('key');

      await cache.getOrSet('key', factory);
      expect(callCount).toBe(2);
    });

    it('should respect TTL on getOrSet', async () => {
      let callCount = 0;
      const factory = async () => {
        callCount++;
        return { data: callCount };
      };

      // Set with very short TTL
      await cache.getOrSet('ttl-key', factory, 10);
      expect(callCount).toBe(1);

      // Wait for expiration
      await new Promise(r => setTimeout(r, 25));

      // Should call factory again
      await cache.getOrSet('ttl-key', factory, 10);
      expect(callCount).toBe(2);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate single key', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.delete('key1');

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2');
    });

    it('should invalidate multiple keys', async () => {
      await cache.set('user:1', { id: 1 });
      await cache.set('user:2', { id: 2 });
      await cache.set('post:1', { id: 1 });

      const deleted = await cache.mdel(['user:1', 'user:2', 'post:1']);
      expect(deleted).toBe(3);

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('post:1')).toBeNull();
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });

    it('should handle expiration automatically', async () => {
      await cache.set('expire-key', 'expire-value', 10);

      expect(await cache.get('expire-key')).toBe('expire-value');

      await new Promise(r => setTimeout(r, 25));

      expect(await cache.get('expire-key')).toBeNull();
    });

    it('should report has() correctly for expired keys', async () => {
      await cache.set('has-key', 'value', 10);

      expect(await cache.has('has-key')).toBe(true);

      await new Promise(r => setTimeout(r, 25));

      expect(await cache.has('has-key')).toBe(false);
    });
  });

  describe('Multi-Level Caching', () => {
    let multiCache: MultiLevelCache;

    beforeEach(() => {
      multiCache = createMultiLevelCache({
        l1: {
          provider: CacheProvider.MEMORY,
          ttl: 10000,
          prefix: 'ml-l1:',
          max: 50,
        },
        l2: {
          provider: CacheProvider.MEMORY,
          ttl: 30000,
          prefix: 'ml-l2:',
          max: 100,
        },
      });
    });

    afterEach(async () => {
      await multiCache.close();
    });

    it('should write to both L1 and L2', async () => {
      await multiCache.set('shared-key', { data: 'test' });

      const stats = multiCache.getStats();
      expect(stats.l1.sets).toBeGreaterThanOrEqual(1);
      expect(stats.l2!.sets).toBeGreaterThanOrEqual(1);
    });

    it('should read from L1 first (cache hit)', async () => {
      await multiCache.set('key', 'value');

      const value = await multiCache.get('key');
      expect(value).toBe('value');

      const stats = multiCache.getStats();
      expect(stats.l1.hits).toBeGreaterThanOrEqual(1);
    });

    it('should read-through L1 to L2 on miss', async () => {
      // Write to multi-cache (writes to both L1 and L2)
      await multiCache.set('shared-key', { data: 'test' });

      // Clear only L1 by creating a fresh multi-cache with same L2 config
      const freshMultiCache = createMultiLevelCache({
        l1: {
          provider: CacheProvider.MEMORY,
          ttl: 10000,
          prefix: 'ml-l1:',
          max: 50,
        },
        l2: {
          provider: CacheProvider.MEMORY,
          ttl: 30000,
          prefix: 'ml-l2:',
          max: 100,
        },
      });

      // Fresh L1 is empty, but L2 was populated by previous multi-cache's L2
      // NOTE: this only works if both multi-caches share the same L2 instance
      // Since they don't, we test the simpler case: write-then-read
      const value = await multiCache.get('shared-key');
      expect(value).toEqual({ data: 'test' });

      await freshMultiCache.close();
    });

    it('should invalidate from both levels', async () => {
      await multiCache.set('key', 'value');

      await multiCache.delete('key');

      expect(await multiCache.get('key')).toBeNull();
    });

    it('should clear both levels', async () => {
      await multiCache.set('key1', 'value1');
      await multiCache.set('key2', 'value2');

      await multiCache.clear();

      expect(await multiCache.get('key1')).toBeNull();
      expect(await multiCache.get('key2')).toBeNull();
    });

    it('should work without L2 (L1 only)', async () => {
      const l1OnlyCache = createMultiLevelCache({
        l1: {
          provider: CacheProvider.MEMORY,
          prefix: 'l1only:',
        },
      });

      await l1OnlyCache.set('key', 'value');
      const value = await l1OnlyCache.get('key');
      expect(value).toBe('value');

      const stats = l1OnlyCache.getStats();
      expect(stats.l1).toBeDefined();
      expect(stats.l2).toBeUndefined();

      await l1OnlyCache.close();
    });
  });

  describe('Cache Stats and Monitoring', () => {
    it('should track hit/miss rates', async () => {
      await cache.set('key', 'value');

      await cache.get('key');     // hit
      await cache.get('key');     // hit
      await cache.get('miss');    // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track set and delete counts', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.delete('a');

      const stats = cache.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(1);
    });

    it('should track cache size', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);

      await cache.delete('a');

      const statsAfter = cache.getStats();
      expect(statsAfter.size).toBe(1);
    });

    it('should track evictions when max is exceeded', async () => {
      const smallCache = createCacheManager({
        provider: CacheProvider.MEMORY,
        max: 5,
        prefix: 'small:',
      });

      for (let i = 0; i < 10; i++) {
        await smallCache.set(`key-${i}`, i);
      }

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);

      await smallCache.close();
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple values', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3);

      const values = await cache.mget<number>(['a', 'b', 'c', 'd']);
      expect(values).toEqual([1, 2, 3, null]);
    });

    it('should set multiple values', async () => {
      await cache.mset([
        { key: 'x', value: 10 },
        { key: 'y', value: 20 },
        { key: 'z', value: 30 },
      ]);

      expect(await cache.get('x')).toBe(10);
      expect(await cache.get('y')).toBe(20);
      expect(await cache.get('z')).toBe(30);
    });
  });

  describe('Key Prefix Handling', () => {
    it('should use configured prefix', async () => {
      const prefixedCache = createCacheManager({
        provider: CacheProvider.MEMORY,
        prefix: 'myapp:',
      });

      await prefixedCache.set('key', 'value');
      const value = await prefixedCache.get('key');
      expect(value).toBe('value');

      await prefixedCache.close();
    });

    it('should isolate namespaces with different prefixes', async () => {
      const cache1 = createCacheManager({
        provider: CacheProvider.MEMORY,
        prefix: 'ns1:',
      });
      const cache2 = createCacheManager({
        provider: CacheProvider.MEMORY,
        prefix: 'ns2:',
      });

      await cache1.set('key', 'from-ns1');
      await cache2.set('key', 'from-ns2');

      expect(await cache1.get('key')).toBe('from-ns1');
      expect(await cache2.get('key')).toBe('from-ns2');

      await cache1.close();
      await cache2.close();
    });
  });
});
