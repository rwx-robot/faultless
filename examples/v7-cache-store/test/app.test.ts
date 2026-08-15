import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CacheManager,
  createCacheManager,
  CacheProvider,
  MultiLevelCache,
  createMultiLevelCache,
} from '@faultless/cache';

describe('v7-cache-store example', () => {
  describe('CacheManager', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = createCacheManager({
        provider: CacheProvider.MEMORY,
        ttl: 60000,
        prefix: 'test:',
        max: 100,
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should set and get values', async () => {
      await cache.set('key1', { name: 'test' });
      const result = await cache.get('key1');
      expect(result).toEqual({ name: 'test' });
    });

    it('should return null for missing keys', async () => {
      const result = await cache.get('missing');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.has('key1')).toBe(true);
      expect(await cache.has('missing')).toBe(false);
    });

    it('should implement getOrSet', async () => {
      let callCount = 0;
      const result = await cache.getOrSet('key1', async () => {
        callCount++;
        return 'value1';
      });

      expect(result).toBe('value1');
      expect(callCount).toBe(1);

      // Should use cache
      const result2 = await cache.getOrSet('key1', async () => {
        callCount++;
        return 'value1';
      });

      expect(result2).toBe('value1');
      expect(callCount).toBe(1); // Should not call factory again
    });

    it('should handle multiple values with mget/mset', async () => {
      await cache.mset([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' },
      ]);

      const results = await cache.mget(['key1', 'key2', 'key3']);
      expect(results).toEqual(['value1', 'value2', 'value3']);
    });

    it('should delete multiple keys', async () => {
      await cache.mset([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ]);

      const deleted = await cache.mdel(['key1', 'key2']);
      expect(deleted).toBe(2);
    });

    it('should track stats', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('missing');

      const stats = cache.getStats();
      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('MultiLevelCache', () => {
    let cache: MultiLevelCache;

    beforeEach(() => {
      cache = createMultiLevelCache({
        l1: {
          provider: CacheProvider.MEMORY,
          ttl: 60000,
          prefix: 'l1:',
          max: 100,
        },
      });
    });

    afterEach(async () => {
      await cache.close();
    });

    it('should set and get values', async () => {
      await cache.set('key1', { name: 'test' });
      const result = await cache.get('key1');
      expect(result).toEqual({ name: 'test' });
    });

    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should track stats for both levels', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');

      const stats = cache.getStats();
      expect(stats.l1).toBeDefined();
      expect(stats.l1.hits).toBe(1);
    });
  });

  describe('Cache Decorators', () => {
    // Note: Decorator tests would require proper TypeScript compilation
    // These are placeholder tests for the concept

    it('should support cached method pattern', async () => {
      const cache = createCacheManager({
        provider: CacheProvider.MEMORY,
        ttl: 60000,
        prefix: 'decorator:',
      });

      let callCount = 0;
      const getCachedValue = async (key: string) => {
        const cached = await cache.get(key);
        if (cached) return cached;

        callCount++;
        const value = `value-${key}`;
        await cache.set(key, value);
        return value;
      };

      const result1 = await getCachedValue('test');
      const result2 = await getCachedValue('test');

      expect(result1).toBe('value-test');
      expect(result2).toBe('value-test');
      expect(callCount).toBe(1);

      await cache.close();
    });
  });

  describe('TTL Support', () => {
    it('should expire entries after TTL', async () => {
      const cache = createCacheManager({
        provider: CacheProvider.MEMORY,
        ttl: 100, // 100ms
        prefix: 'ttl:',
      });

      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');

      // Wait for TTL
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(await cache.get('key1')).toBeNull();

      await cache.close();
    });
  });
});