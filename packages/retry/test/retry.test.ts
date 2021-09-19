import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryPolicy,
  RetryError,
  retry,
  fixedDelay,
  exponentialDelay,
  exponentialDelayWithJitter,
  calculateDelay,
} from '../src/index';

describe('retry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('RetryPolicy', () => {
    describe('constructor', () => {
      it('should create a retry policy with default options', () => {
        const policy = new RetryPolicy({
          maxAttempts: 3,
          delay: 100,
        });
        expect(policy).toBeInstanceOf(RetryPolicy);
      });

      it('should throw error for invalid maxAttempts', () => {
        expect(() => new RetryPolicy({ maxAttempts: 0, delay: 100 })).toThrow(
          'maxAttempts must be positive'
        );
        expect(() => new RetryPolicy({ maxAttempts: -1, delay: 100 })).toThrow(
          'maxAttempts must be positive'
        );
      });

      it('should throw error for negative delay', () => {
        expect(() => new RetryPolicy({ maxAttempts: 3, delay: -100 })).toThrow(
          'delay must be non-negative'
        );
      });
    });

    describe('execute()', () => {
      it('should return result on first successful attempt', async () => {
        const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
        const fn = vi.fn().mockReturnValue('success');

        const result = await policy.execute(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure and succeed', async () => {
        const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
        const fn = vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('fail 1');
          })
          .mockImplementationOnce(() => {
            throw new Error('fail 2');
          })
          .mockReturnValue('success');

        const result = await policy.execute(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should throw RetryError after all attempts fail', async () => {
        const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('always fail');
        });

        await expect(policy.execute(fn)).rejects.toThrow(RetryError);
        expect(fn).toHaveBeenCalledTimes(3);

        // Test the error message
        try {
          await policy.execute(fn);
        } catch (error) {
          expect(error).toBeInstanceOf(RetryError);
          expect((error as RetryError).message).toBe('Failed after 3 attempts');
        }
      });

      it('should handle async functions', async () => {
        const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
        const fn = vi.fn().mockResolvedValue('async success');

        const result = await policy.execute(fn);

        expect(result).toBe('async success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry async functions on failure', async () => {
        const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('async fail'))
          .mockResolvedValue('async success');

        const result = await policy.execute(fn);

        expect(result).toBe('async success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should respect retryOn filter', async () => {
        const policy = new RetryPolicy({
          maxAttempts: 3,
          delay: 10,
          retryOn: (error) => error.message === 'retry me',
        });

        const fn = vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('retry me');
          })
          .mockReturnValue('success');

        const result = await policy.execute(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should not retry when retryOn returns false', async () => {
        const policy = new RetryPolicy({
          maxAttempts: 3,
          delay: 10,
          retryOn: (error) => error.message === 'retry me',
        });

        const fn = vi.fn().mockImplementation(() => {
          throw new Error('do not retry');
        });

        await expect(policy.execute(fn)).rejects.toThrow('do not retry');
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('getOptions()', () => {
      it('should return the configured options', () => {
        const policy = new RetryPolicy({
          maxAttempts: 5,
          delay: 200,
          maxDelay: 5000,
          backoff: 'exponential',
        });

        const options = policy.getOptions();
        expect(options.maxAttempts).toBe(5);
        expect(options.delay).toBe(200);
        expect(options.maxDelay).toBe(5000);
        expect(options.backoff).toBe('exponential');
      });
    });
  });

  describe('RetryError', () => {
    it('should contain attempt count and last error', () => {
      const lastError = new Error('last error');
      const retryError = new RetryError('Failed', 3, lastError);

      expect(retryError.name).toBe('RetryError');
      expect(retryError.message).toBe('Failed');
      expect(retryError.attempts).toBe(3);
      expect(retryError.lastError).toBe(lastError);
    });

    it('should be an instance of Error', () => {
      const retryError = new RetryError('Failed', 1, new Error('test'));
      expect(retryError).toBeInstanceOf(Error);
    });
  });

  describe('retry() function', () => {
    it('should work as a convenience wrapper', async () => {
      const fn = vi.fn().mockReturnValue('success');

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('fail');
        })
        .mockReturnValue('success');

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw RetryError after all attempts fail', async () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('always fail');
      });

      await expect(
        retry(fn, { maxAttempts: 3, delay: 10 })
      ).rejects.toThrow(RetryError);
    });
  });

  describe('backoff strategies', () => {
    describe('fixedDelay()', () => {
      it('should return constant delay', () => {
        expect(fixedDelay(0, 100)).toBe(100);
        expect(fixedDelay(1, 100)).toBe(100);
        expect(fixedDelay(5, 100)).toBe(100);
      });
    });

    describe('exponentialDelay()', () => {
      it('should return exponentially increasing delay', () => {
        expect(exponentialDelay(0, 100, 10000)).toBe(100);
        expect(exponentialDelay(1, 100, 10000)).toBe(200);
        expect(exponentialDelay(2, 100, 10000)).toBe(400);
        expect(exponentialDelay(3, 100, 10000)).toBe(800);
      });

      it('should cap at maxDelay', () => {
        expect(exponentialDelay(10, 100, 1000)).toBe(1000);
        expect(exponentialDelay(20, 100, 1000)).toBe(1000);
      });
    });

    describe('exponentialDelayWithJitter()', () => {
      it('should return delay with jitter', () => {
        const delays = new Set<number>();
        for (let i = 0; i < 100; i++) {
          delays.add(exponentialDelayWithJitter(0, 100, 10000));
        }
        // Should have some variation due to jitter
        expect(delays.size).toBeGreaterThan(1);
      });

      it('should be within reasonable bounds', () => {
        for (let i = 0; i < 100; i++) {
          const delay = exponentialDelayWithJitter(0, 100, 10000);
          expect(delay).toBeGreaterThanOrEqual(100);
          expect(delay).toBeLessThanOrEqual(200); // 100 + max jitter of 100
        }
      });

      it('should cap at maxDelay', () => {
        for (let i = 0; i < 100; i++) {
          const delay = exponentialDelayWithJitter(10, 100, 1000);
          expect(delay).toBeLessThanOrEqual(1000);
        }
      });
    });

    describe('calculateDelay()', () => {
      it('should use fixed delay strategy', () => {
        const options = { maxAttempts: 3, delay: 100, backoff: 'fixed' as const };
        expect(calculateDelay(0, options)).toBe(100);
        expect(calculateDelay(5, options)).toBe(100);
      });

      it('should use exponential delay strategy', () => {
        const options = { maxAttempts: 3, delay: 100, backoff: 'exponential' as const };
        expect(calculateDelay(0, options)).toBe(100);
        expect(calculateDelay(1, options)).toBe(200);
      });

      it('should use exponential-jitter delay strategy', () => {
        const options = { maxAttempts: 3, delay: 100, backoff: 'exponential-jitter' as const };
        const delay = calculateDelay(0, options);
        expect(delay).toBeGreaterThanOrEqual(100);
        expect(delay).toBeLessThanOrEqual(200);
      });
    });
  });

  describe('integration with backoff strategies', () => {
    it('should work with fixed delay', async () => {
      const policy = new RetryPolicy({
        maxAttempts: 3,
        delay: 10,
        backoff: 'fixed',
      });
      const fn = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('fail');
        })
        .mockReturnValue('success');

      const result = await policy.execute(fn);
      expect(result).toBe('success');
    });

    it('should work with exponential backoff', async () => {
      vi.useFakeTimers();
      const policy = new RetryPolicy({
        maxAttempts: 3,
        delay: 10,
        backoff: 'exponential',
      });
      const fn = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('fail');
        })
        .mockReturnValue('success');

      const promise = policy.execute(fn);
      await vi.advanceTimersByTimeAsync(10);
      const result = await promise;

      expect(result).toBe('success');
      vi.useRealTimers();
    });

    it('should work with exponential backoff with jitter', async () => {
      vi.useFakeTimers();
      const policy = new RetryPolicy({
        maxAttempts: 3,
        delay: 10,
        backoff: 'exponential-jitter',
      });
      const fn = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('fail');
        })
        .mockReturnValue('success');

      const promise = policy.execute(fn);
      await vi.advanceTimersByTimeAsync(20); // Extra time for jitter
      const result = await promise;

      expect(result).toBe('success');
      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle non-Error throws', async () => {
      const policy = new RetryPolicy({ maxAttempts: 3, delay: 10 });
      const fn = vi.fn().mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      await expect(policy.execute(fn)).rejects.toThrow(RetryError);
    });

    it('should preserve original error in RetryError', async () => {
      const policy = new RetryPolicy({ maxAttempts: 2, delay: 10 });
      const originalError = new Error('original');
      const fn = vi.fn().mockImplementation(() => {
        throw originalError;
      });

      try {
        await policy.execute(fn);
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).lastError).toBe(originalError);
      }
    });
  });
});
