import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DistributedRateLimiter,
  RateLimiter,
  MemoryRateLimitStore,
  RateLimiterRegistry,
  rateLimiterRegistry,
} from '../src/index';

describe('DistributedRateLimiter', () => {
  it('should create a memory-backed distributed rate limiter', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-memory',
      windowMs: 60000,
      max: 10,
    });

    expect(limiter).toBeInstanceOf(RateLimiter);

    const result = await limiter.consume('user:1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
  });

  it('should enforce limits with memory store', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-limit',
      windowMs: 60000,
      max: 3,
    });

    await limiter.consume('key');
    await limiter.consume('key');
    await limiter.consume('key');

    const result = await limiter.consume('key');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should support custom keyPrefix', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-prefix',
      windowMs: 60000,
      max: 100,
      keyPrefix: 'myapp:',
    });

    const result = await limiter.consume('test');
    expect(result.allowed).toBe(true);
  });

  it('should emit limited event when limit is exceeded', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-events',
      windowMs: 60000,
      max: 1,
    });

    let limitedEmitted = false;
    limiter.on('limited', () => {
      limitedEmitted = true;
    });

    await limiter.consume('key');
    await limiter.consume('key');

    expect(limitedEmitted).toBe(true);
  });

  it('should reset keys', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-reset',
      windowMs: 60000,
      max: 2,
    });

    await limiter.consume('key');
    await limiter.consume('key');

    const before = await limiter.consume('key');
    expect(before.allowed).toBe(false);

    await limiter.reset('key');

    const after = await limiter.consume('key');
    expect(after.allowed).toBe(true);
  });

  it('should get current status', async () => {
    const limiter = new DistributedRateLimiter({
      store: 'memory',
      name: 'test-get',
      windowMs: 60000,
      max: 10,
    });

    await limiter.consume('key');
    await limiter.consume('key');

    const status = await limiter.get('key');
    expect(status).not.toBeNull();
    expect(status!.total).toBe(2);
    expect(status!.remaining).toBe(8);
  });
});

describe('RateLimiterRegistry', () => {
  let registry: RateLimiterRegistry;

  beforeEach(() => {
    registry = new RateLimiterRegistry();
  });

  it('should create and retrieve limiters', () => {
    const limiter = registry.create({
      name: 'api',
      windowMs: 60000,
      max: 100,
    });

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(registry.get('api')).toBe(limiter);
  });

  it('should throw on duplicate names', () => {
    registry.create({ name: 'dup', windowMs: 60000, max: 100 });
    expect(() => registry.create({ name: 'dup', windowMs: 60000, max: 100 })).toThrow();
  });

  it('should get or create', () => {
    const a = registry.getOrCreate({ name: 'lazy', windowMs: 60000, max: 100 });
    const b = registry.getOrCreate({ name: 'lazy', windowMs: 60000, max: 100 });
    expect(a).toBe(b);
  });

  it('should remove limiters', () => {
    registry.create({ name: 'removable', windowMs: 60000, max: 100 });
    expect(registry.remove('removable')).toBe(true);
    expect(registry.get('removable')).toBeUndefined();
  });

  it('should get all limiters', () => {
    registry.create({ name: 'a', windowMs: 60000, max: 100 });
    registry.create({ name: 'b', windowMs: 60000, max: 100 });
    expect(registry.getAll()).toHaveLength(2);
  });
});
