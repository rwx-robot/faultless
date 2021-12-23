/**
 * @faultless/mr
 * MapReduce utilities for parallel and sequential function execution
 *
 * Provides parallel and sequential execution patterns:
 * - mapReduce: Parallel map with reduce
 * - parallel: Run functions concurrently
 * - series: Run functions sequentially
 * - waterfall: Chain functions sequentially
 */

// ============================================================================
// MapReduce - Parallel map/reduce
// ============================================================================

/**
 * Executes a map operation in parallel with controlled concurrency,
 * then reduces the results.
 *
 * @example
 * ```typescript
 * const result = await mapReduce(
 *   [1, 2, 3, 4, 5],
 *   async (n) => n * 2,
 *   (acc, val) => acc + val,
 *   { concurrency: 3 }
 * );
 * // result = 30 (2 + 4 + 6 + 8 + 10)
 * ```
 */
export async function mapReduce<T, R>(
  items: T[],
  map: (item: T) => Promise<R>,
  reduce: (acc: R, item: R) => R,
  options?: { concurrency?: number }
): Promise<R> {
  const concurrency = options?.concurrency ?? items.length;

  if (items.length === 0) {
    throw new Error('mapReduce requires at least one item');
  }

  const results: R[] = [];
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await map(items[currentIndex]);
    }
  };

  // Run workers with concurrency limit
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);

  // Reduce results
  return results.reduce(reduce);
}

// ============================================================================
// Parallel - Run functions concurrently
// ============================================================================

/**
 * Executes multiple functions concurrently and returns all results.
 *
 * @example
 * ```typescript
 * const [users, posts, comments] = await parallel(
 *   () => fetchUsers(),
 *   () => fetchPosts(),
 *   () => fetchComments()
 * );
 * ```
 */
export async function parallel<T>(
  ...fns: Array<() => Promise<T>>
): Promise<T[]> {
  return Promise.all(fns.map((fn) => fn()));
}

// ============================================================================
// Series - Run functions sequentially
// ============================================================================

/**
 * Executes multiple functions sequentially and returns all results.
 *
 * @example
 * ```typescript
 * const results = await series(
 *   async () => { await step1(); return 'step1'; },
 *   async () => { await step2(); return 'step2'; },
 *   async () => { await step3(); return 'step3'; }
 * );
 * // results = ['step1', 'step2', 'step3']
 * ```
 */
export async function series<T>(
  ...fns: Array<() => Promise<T>>
): Promise<T[]> {
  const results: T[] = [];
  for (const fn of fns) {
    results.push(await fn());
  }
  return results;
}

// ============================================================================
// Waterfall - Chain functions sequentially
// ============================================================================

/**
 * Executes functions sequentially, passing the result of each
 * function to the next. Returns the final result.
 *
 * @example
 * ```typescript
 * const result = await waterfall(
 *   async () => 1,
 *   async (n) => n + 1,
 *   async (n) => n * 2
 * );
 * // result = 4 ((1 + 1) * 2)
 * ```
 */
export async function waterfall<T>(
  ...fns: Array<(arg: any) => Promise<T>>
): Promise<T> {
  let result: any;

  for (const fn of fns) {
    result = await fn(result);
  }

  return result as T;
}
