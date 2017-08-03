import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateId,
  generateRequestId,
  generateTraceId,
  generateSpanId,
  hashString,
  sleep,
  retry,
  timeout,
  TimeoutError,
  deepMerge,
  omit,
  pick,
  isPlainObject,
  flattenObject,
  unflattenObject,
  parseEnvValue,
  maskSensitive,
  formatBytes,
  formatDuration,
  chunkArray,
  uniqueArray,
  groupBy,
} from '../src/utils';

describe('utils', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should include prefix', () => {
      const id = generateId('test_');
      expect(id).toMatch(/^test_/);
    });
  });

  describe('generateRequestId', () => {
    it('should generate request IDs with req_ prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_/);
    });
  });

  describe('generateTraceId', () => {
    it('should generate trace IDs with trace_ prefix', () => {
      const id = generateTraceId();
      expect(id).toMatch(/^trace_/);
    });
  });

  describe('generateSpanId', () => {
    it('should generate 16 character hex span IDs', () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('hashString', () => {
    it('should hash string with SHA256 by default', () => {
      const hash = hashString('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should hash string with SHA1', () => {
      const hash = hashString('test', 'sha1');
      expect(hash).toHaveLength(40);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified ms', async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const result = await retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(retry(fn, { retries: 2, delay: 10 })).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect retryable function', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const result = await retry(fn, {
        retries: 3,
        delay: 10,
        retryable: () => false,
      }).catch(e => e);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const start = Date.now();
      await retry(fn, { retries: 2, delay: 50, backoff: 'exponential' });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('timeout', () => {
    it('should resolve if promise resolves in time', async () => {
      const result = await timeout(Promise.resolve('success'), 100);
      expect(result).toBe('success');
    });

    it('should reject if promise takes too long', async () => {
      await expect(timeout(new Promise(r => setTimeout(r, 100)), 10, 'Custom timeout'))
        .rejects.toThrow('Custom timeout');
    });

    it('should throw TimeoutError', async () => {
      await expect(timeout(new Promise(r => setTimeout(r, 100)), 10))
        .rejects.toThrow(TimeoutError);
    });
  });

  describe('deepMerge', () => {
    it('should merge nested objects', () => {
      const target = { a: { b: 1, c: 2 }, d: 3 };
      const source = { a: { b: 10, e: 4 }, f: 5 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { b: 10, c: 2, e: 4 }, d: 3, f: 5 });
    });

    it('should not mutate target', () => {
      const target = { a: { b: 1 } };
      deepMerge(target, { a: { c: 2 } });
      expect(target).toEqual({ a: { b: 1 } });
    });

    it('should handle arrays', () => {
      const target = { a: [1, 2] };
      const source = { a: [3, 4] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: [3, 4] });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ['b']);
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should not mutate original', () => {
      const obj = { a: 1, b: 2 };
      omit(obj, ['b']);
      expect(obj).toEqual({ a: 1, b: 2 });
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pick(obj, ['a', 'c']);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
    });
  });

  describe('flattenObject', () => {
    it('should flatten nested objects', () => {
      const obj = { a: { b: { c: 1 } }, d: 2 };
      const result = flattenObject(obj);
      expect(result).toEqual({ 'a.b.c': 1, d: 2 });
    });
  });

  describe('unflattenObject', () => {
    it('should unflatten objects', () => {
      const obj = { 'a.b.c': 1, d: 2 };
      const result = unflattenObject(obj);
      expect(result).toEqual({ a: { b: { c: 1 } }, d: 2 });
    });
  });

  describe('parseEnvValue', () => {
    it('should parse boolean', () => {
      expect(parseEnvValue('true')).toBe(true);
      expect(parseEnvValue('false')).toBe(false);
    });

    it('should parse null', () => {
      expect(parseEnvValue('null')).toBeNull();
    });

    it('should parse numbers', () => {
      expect(parseEnvValue('123')).toBe(123);
      expect(parseEnvValue('0')).toBe(0);
      expect(parseEnvValue('-10')).toBe(-10);
      expect(parseEnvValue('3.14')).toBe(3.14);
    });

    it('should parse JSON', () => {
      expect(parseEnvValue('{"a":1}')).toEqual({ a: 1 });
      expect(parseEnvValue('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should return string for other values', () => {
      expect(parseEnvValue('hello')).toBe('hello');
    });
  });

  describe('maskSensitive', () => {
    it('should mask sensitive keys', () => {
      const data = { password: 'secret', username: 'user', api_key: 'key123' };
      const result = maskSensitive(data);
      expect(result.password).toBe('***MASKED***');
      expect(result.api_key).toBe('***MASKED***');
      expect(result.username).toBe('user');
    });

    it('should mask nested sensitive keys', () => {
      const data = { user: { password: 'secret' } };
      const result = maskSensitive(data);
      expect(result.user).toEqual({ password: '***MASKED***' });
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format durations', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(90000)).toBe('1.50m');
      expect(formatDuration(7200000)).toBe('2.00h');
    });
  });

  describe('chunkArray', () => {
    it('should chunk array', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should throw for invalid size', () => {
      expect(() => chunkArray([1, 2], 0)).toThrow();
      expect(() => chunkArray([1, 2], -1)).toThrow();
    });
  });

  describe('uniqueArray', () => {
    it('should remove duplicates', () => {
      expect(uniqueArray([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should use key function', () => {
      const arr = [{ id: 1 }, { id: 2 }, { id: 1 }];
      expect(uniqueArray(arr, x => x.id)).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('groupBy', () => {
    it('should group by key', () => {
      const arr = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
      expect(groupBy(arr, x => x.type)).toEqual({
        a: [{ type: 'a', v: 1 }, { type: 'a', v: 3 }],
        b: [{ type: 'b', v: 2 }],
      });
    });
  });
});