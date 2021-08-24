/**
 * @faultless/fx
 * Functional utilities for Node.js/TypeScript
 *
 * Provides composable functional programming primitives:
 * - pipe: Right-to-left function composition
 * - flow: Left-to-right function composition
 * - curry: Curry a multi-argument function
 * - memoize: Cache function results
 * - debounce: Delay execution until idle
 * - throttle: Limit execution rate
 * - retry: Retry failed operations
 * - timeout: Abort after deadline
 * - tap: Side effect without modifying value
 * - unless: Conditional execution
 */

// ============================================================================
// Pipe - Right-to-left function composition
// ============================================================================

/**
 * Composes functions from left to right.
 * Each function receives the result of the previous function.
 *
 * @example
 * ```typescript
 * const process = pipe(
 *   (x: number) => x * 2,
 *   (x: number) => x + 1,
 *   (x: number) => x.toString()
 * );
 * process(5); // "11" ((5 * 2) + 1).toString()
 * ```
 */
export function pipe<T>(...fns: Array<(arg: any) => any>): (arg: T) => any {
  return (arg: T): any => fns.reduce((acc, fn) => fn(acc), arg);
}

// ============================================================================
// Flow - Left-to-right function composition
// ============================================================================

/**
 * Composes functions from left to right (alias for pipe).
 * Each function receives the result of the previous function.
 *
 * @example
 * ```typescript
 * const process = flow(
 *   (x: number) => x + 1,
 *   (x: number) => x * 2,
 *   (x: number) => x.toString()
 * );
 * process(5); // "12" ((5 + 1) * 2).toString()
 * ```
 */
export function flow<T>(...fns: Array<(arg: any) => any>): (arg: T) => any {
  return (arg: T): any => fns.reduce((acc, fn) => fn(acc), arg);
}

// ============================================================================
// Curry - Curry a multi-argument function
// ============================================================================

/**
 * Converts a multi-argument function into a sequence of single-argument functions.
 *
 * @example
 * ```typescript
 * const add = curry((a: number, b: number, c: number) => a + b + c);
 * add(1)(2)(3); // 6
 * add(1, 2)(3); // 6
 * add(1)(2, 3); // 6
 * ```
 */
export function curry(fn: Function): Function {
  const arity = fn.length;

  function curried(...args: any[]): any {
    if (args.length >= arity) {
      return fn(...args);
    }
    return (...moreArgs: any[]) => curried(...args, ...moreArgs);
  }

  return curried;
}

// ============================================================================
// Memoize - Cache function results
// ============================================================================

/**
 * Creates a memoized version of a function.
 * Results are cached based on the first argument.
 *
 * @example
 * ```typescript
 * const expensive = memoize((n: number) => {
 *   console.log('Computing...');
 *   return n * n;
 * });
 * expensive(5); // "Computing..." returns 25
 * expensive(5); // returns 25 (cached, no log)
 * ```
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();

  const memoized = ((...args: any[]): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;

  // Expose cache for testing/debugging
  (memoized as any).__cache = cache;

  return memoized;
}

// ============================================================================
// Debounce - Delay execution until idle
// ============================================================================

/**
 * Creates a debounced version of a function.
 * Execution is delayed until the specified wait time has elapsed since the last call.
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   console.log('Searching:', query);
 * }, 300);
 *
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // Only this triggers after 300ms
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;

  const debounced = ((...args: any[]) => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId !== null && lastArgs) {
      clearTimeout(timeoutId);
      fn(...lastArgs);
      timeoutId = null;
      lastArgs = null;
    }
  };

  return debounced;
}

// ============================================================================
// Throttle - Limit execution rate
// ============================================================================

/**
 * Creates a throttled version of a function.
 * Execution is limited to once per specified interval.
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle((event: Event) => {
 *   console.log('Scroll position:', window.scrollY);
 * }, 100);
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: any[]) => {
    const now = Date.now();
    const remaining = limit - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

// ============================================================================
// Retry - Retry failed operations
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  delay: number;
  /** Maximum delay in milliseconds (for exponential backoff) */
  maxDelay?: number;
  /** Whether to use exponential backoff */
  exponential?: boolean;
  /** Optional function to determine if an error should trigger a retry */
  retryOn?: (error: Error) => boolean;
}

/**
 * Retries a function until it succeeds or max attempts are exhausted.
 *
 * @example
 * ```typescript
 * const data = await retry(
 *   () => fetch('/api/data').then(r => r.json()),
 *   { maxAttempts: 3, delay: 1000, exponential: true }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delay, maxDelay = 30000, exponential = false, retryOn = () => true } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!retryOn(lastError)) {
        throw lastError;
      }

      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      const waitTime = exponential
        ? Math.min(delay * Math.pow(2, attempt), maxDelay)
        : delay;

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
}

// ============================================================================
// Timeout - Abort after deadline
// ============================================================================

/**
 * Executes a function with a timeout. Throws if it takes too long.
 *
 * @example
 * ```typescript
 * const data = await timeout(
 *   () => fetch('/api/slow').then(r => r.json()),
 *   5000 // 5 second timeout
 * );
 * ```
 */
export async function timeout<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============================================================================
// Tap - Side effect without modifying value
// ============================================================================

/**
 * Executes a side effect function and returns the original value unchanged.
 *
 * @example
 * ```typescript
 * const result = pipe(
 *   (x: number) => x * 2,
 *   tap((x) => console.log('Doubled:', x)),
 *   (x) => x + 1
 * )(5); // logs "Doubled: 10", returns 11
 * ```
 */
export function tap<T>(fn: (value: T) => void): (value: T) => T {
  return (value: T): T => {
    fn(value);
    return value;
  };
}

// ============================================================================
// Unless - Conditional execution
// ============================================================================

/**
 * Executes a function only if the condition is false.
 * Returns the original value if condition is true.
 *
 * @example
 * ```typescript
 * const ensurePositive = unless(
 *   (n: number) => n > 0,
 *   (n: number) => Math.abs(n)
 * );
 *
 * ensurePositive(5);   // 5 (condition true, returns original)
 * ensurePositive(-5);  // 5 (condition false, executes function)
 * ```
 */
export function unless<T>(
  condition: (value: T) => boolean,
  fn: (value: T) => T
): (value: T) => T {
  return (value: T): T => {
    if (!condition(value)) {
      return fn(value);
    }
    return value;
  };
}
