import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManager, CacheProvider, createCacheManager } from '../src/cache-manager';

describe('Cache Strategies', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = createCacheManager({
      provider: CacheProvider.MEMORY,
      ttl: 60000,
      max: 100,
    });
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('writeThrough', () => {
    it('should write to backing store and cache simultaneously', async () => {
      const backingStore = new Map<string, any>();
      const factory = vi.fn(async () => {
        const value = { id: 1, data: 'test' };
        backingStore.set('key1', value);
        return value;
      });

      const result = await cache.writeThrough('key1', factory);

      expect(factory).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, data: 'test' });
      expect(backingStore.get('key1')).toEqual({ id: 1, data: 'test' });

      const cached = await cache.get('key1');
      expect(cached).toEqual({ id: 1, data: 'test' });
    });

    it('should overwrite existing cache entry', async () => {
      await cache.set('key1', { version: 1 });

      const factory = vi.fn(async () => ({ version: 2 }));
      const result = await cache.writeThrough('key1', factory);

      expect(result).toEqual({ version: 2 });
      const cached = await cache.get('key1');
      expect(cached).toEqual({ version: 2 });
    });
  });

  describe('writeBehind', () => {
    it('should return cached value and update backing store in background', async () => {
      const backingStore = new Map<string, any>();
      backingStore.set('key1', { version: 1 });

      // Pre-populate cache
      await cache.set('key1', { version: 1 });

      const factory = vi.fn(async () => {
        const newValue = { version: 2 };
        backingStore.set('key1', newValue);
        return newValue;
      });

      const result = await cache.writeBehind('key1', factory);

      // Should return the cached value immediately
      expect(result).toEqual({ version: 1 });

      // Wait for background write
      await new Promise(resolve => setTimeout(resolve, 100));

      // Backing store should have been updated
      expect(backingStore.get('key1')).toEqual({ version: 2 });
      expect(factory).toHaveBeenCalled();
    });

    it('should fetch from backing store on cache miss', async () => {
      const storeData = { value: 'from-store' };

      const factory = vi.fn(async () => storeData);

      const result = await cache.writeBehind('key1', factory);

      expect(result).toEqual({ value: 'from-store' });
      const cached = await cache.get('key1');
      expect(cached).toEqual({ value: 'from-store' });
      expect(factory).toHaveBeenCalled();
    });

    it('should handle background write failure gracefully', async () => {
      await cache.set('key1', { version: 1 });

      const factory = vi.fn(async () => {
        throw new Error('Write failed');
      });

      // Should not throw — returns cached value
      const result = await cache.writeBehind('key1', factory);
      expect(result).toEqual({ version: 1 });

      // Wait for background attempt
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('refreshAhead', () => {
    it('should return cached value immediately', async () => {
      await cache.set('key1', { data: 'initial' }, 120000);

      const factory = vi.fn(async () => ({ data: 'refreshed' }));

      const result = await cache.refreshAhead('key1', factory, 1000);

      expect(result).toEqual({ data: 'initial' });
    });

    it('should trigger background refresh when past threshold', async () => {
      // Set with short TTL so entry ages quickly
      await cache.set('key1', { data: 'old' }, 120000);

      // Use a negative threshold so age (0) > threshold is always true
      const factory = vi.fn(async () => ({ data: 'refreshed' }));

      await cache.refreshAhead('key1', factory, -1);

      // Wait for background refresh
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(factory).toHaveBeenCalled();

      // Cache should now have refreshed value
      const cached = await cache.get('key1');
      expect(cached).toEqual({ data: 'refreshed' });
    });

    it('should fetch synchronously on cache miss', async () => {
      const factory = vi.fn(async () => ({ data: 'fresh' }));

      const result = await cache.refreshAhead('nonexistent', factory, 1000);

      expect(factory).toHaveBeenCalled();
      expect(result).toEqual({ data: 'fresh' });

      const cached = await cache.get('nonexistent');
      expect(cached).toEqual({ data: 'fresh' });
    });

    it('should handle background refresh failure gracefully', async () => {
      await cache.set('key1', { data: 'current' }, 120000);

      const factory = vi.fn(async () => {
        throw new Error('Refresh failed');
      });

      const result = await cache.refreshAhead('key1', factory, -1);
      expect(result).toEqual({ data: 'current' });

      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('getOrSet (cache-aside)', () => {
    it('should return cached value if available', async () => {
      await cache.set('key1', { data: 'cached' });

      const factory = vi.fn(async () => ({ data: 'fresh' }));
      const result = await cache.getOrSet('key1', factory);

      expect(result).toEqual({ data: 'cached' });
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory on cache miss', async () => {
      const factory = vi.fn(async () => ({ data: 'fresh' }));
      const result = await cache.getOrSet('key1', factory);

      expect(result).toEqual({ data: 'fresh' });
      expect(factory).toHaveBeenCalled();

      const cached = await cache.get('key1');
      expect(cached).toEqual({ data: 'fresh' });
    });
  });
});
