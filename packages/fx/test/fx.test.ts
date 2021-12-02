import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pipe,
  flow,
  curry,
  memoize,
  debounce,
  throttle,
  retry,
  timeout,
  tap,
  unless,
} from '../src';

describe('pipe', () => {
  it('should compose functions right to left', () => {
    const process = pipe(
      (x: number) => x * 2,
      (x: number) => x + 1,
      (x: number) => x.toString()
    );
    expect(process(5)).toBe('11'); // (5 * 2) + 1 = 11
  });

  it('should handle single function', () => {
    const double = pipe((x: number) => x * 2);
    expect(double(5)).toBe(10);
  });

  it('should handle identity', () => {
    const identity = pipe((x: number) => x);
    expect(identity(5)).toBe(5);
  });
});

describe('flow', () => {
  it('should compose functions left to right', () => {
    const process = flow(
      (x: number) => x + 1,
      (x: number) => x * 2,
      (x: number) => x.toString()
    );
    expect(process(5)).toBe('12'); // (5 + 1) * 2 = 12
  });

  it('should handle single function', () => {
    const double = flow((x: number) => x * 2);
    expect(double(5)).toBe(10);
  });
});

describe('curry', () => {
  it('should curry a multi-argument function', () => {
    const add = curry((a: number, b: number, c: number) => a + b + c);
    expect(add(1)(2)(3)).toBe(6);
    expect(add(1, 2)(3)).toBe(6);
    expect(add(1)(2, 3)).toBe(6);
    expect(add(1, 2, 3)).toBe(6);
  });

  it('should handle two-argument function', () => {
    const multiply = curry((a: number, b: number) => a * b);
    expect(multiply(3)(4)).toBe(12);
    expect(multiply(3, 4)).toBe(12);
  });
});

describe('memoize', () => {
  it('should cache results', () => {
    let callCount = 0;
    const expensive = memoize((n: number) => {
      callCount++;
      return n * n;
    });

    expect(expensive(5)).toBe(25);
    expect(expensive(5)).toBe(25);
    expect(expensive(5)).toBe(25);
    expect(callCount).toBe(1);
  });

  it('should cache different arguments separately', () => {
    const square = memoize((n: number) => n * n);

    expect(square(3)).toBe(9);
    expect(square(4)).toBe(16);
    expect(square(3)).toBe(9);
  });

  it('should expose cache for debugging', () => {
    const fn = memoize((n: number) => n * 2);
    fn(1);
    fn(2);
    expect((fn as any).__cache.size).toBe(2);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should only execute last call in rapid succession', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    debounced('c');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('should cancel pending execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should flush pending execution immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.flush();

    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should limit execution rate', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledOnce();

    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledOnce(); // Still only once

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // Called again after interval
  });

  it('should cancel pending execution', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled(); // Pending
    throttled.cancel();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce(); // Only the first call
  });
});

describe('retry', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Not ready');
      }
      return 'success';
    });

    const result = await retry(fn, { maxAttempts: 5, delay: 10 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Always fails');
    });

    await expect(
      retry(fn, { maxAttempts: 3, delay: 10 })
    ).rejects.toThrow('Always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect retryOn predicate', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Non-retryable');
    });

    const retryOn = vi.fn(() => false);

    await expect(
      retry(fn, { maxAttempts: 5, delay: 10, retryOn })
    ).rejects.toThrow('Non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(retryOn).toHaveBeenCalledOnce();
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Fail');
    });

    const start = Date.now();
    try {
      await retry(fn, {
        maxAttempts: 3,
        delay: 50,
        exponential: true,
      });
    } catch {
      // Expected
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150); // 50 + 100
  });
});

describe('timeout', () => {
  it('should resolve if function completes in time', async () => {
    const result = await timeout(
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'done';
      },
      1000
    );
    expect(result).toBe('done');
  });

  it('should reject if function takes too long', async () => {
    await expect(
      timeout(
        async () => {
          await new Promise((r) => setTimeout(r, 1000));
          return 'done';
        },
        50
      )
    ).rejects.toThrow('Operation timed out');
  });

  it('should reject if function throws', async () => {
    await expect(
      timeout(
        async () => {
          throw new Error('Function error');
        },
        1000
      )
    ).rejects.toThrow('Function error');
  });
});

describe('tap', () => {
  it('should execute side effect and return original value', () => {
    const sideEffect = vi.fn();
    const process = tap(sideEffect);

    const result = process(5);
    expect(result).toBe(5);
    expect(sideEffect).toHaveBeenCalledWith(5);
  });

  it('should work in pipeline', () => {
    const log: number[] = [];
    const process = pipe(
      (x: number) => x * 2,
      tap((x) => log.push(x)),
      (x: number) => x + 1
    );

    const result = process(5);
    expect(result).toBe(11);
    expect(log).toEqual([10]);
  });
});

describe('unless', () => {
  it('should execute function when condition is false', () => {
    const ensurePositive = unless(
      (n: number) => n > 0,
      (n: number) => Math.abs(n)
    );

    expect(ensurePositive(-5)).toBe(5);
    expect(ensurePositive(5)).toBe(5);
  });

  it('should work with string conditions', () => {
    const ensureLowerCase = unless(
      (s: string) => s === s.toLowerCase(),
      (s: string) => s.toLowerCase()
    );

    expect(ensureLowerCase('HELLO')).toBe('hello');
    expect(ensureLowerCase('hello')).toBe('hello');
  });
});
