/**
 * @faultless/syncx
 * Concurrency utilities for Node.js/TypeScript
 *
 * Provides thread-safe primitives for async workflows:
 * - Once: Execute a function only once
 * - Semaphore: Concurrency limiter
 * - ConcurrentMap: Thread-safe map with lazy loading
 * - AtomicCounter: Atomic counter operations
 * - Mutex: Mutual exclusion lock
 * - ReadWriteLock: Multiple readers, single writer
 */

// ============================================================================
// Once - Execute a function only once
// ============================================================================

/**
 * Ensures a function is executed only once, even with concurrent calls.
 * Useful for singleton initialization.
 *
 * @example
 * ```typescript
 * const init = new Once();
 * await init.run(async () => {
 *   await database.connect();
 * });
 * // Second call does nothing
 * ```
 */
export class Once {
  private _done = false;
  private _promise: Promise<void> | null = null;

  /**
   * Run the function. Only the first call executes it.
   */
  async run(fn: () => void | Promise<void>): Promise<void> {
    if (this._done) return;

    if (!this._promise) {
      const result = fn();
      this._promise = result instanceof Promise ? result : Promise.resolve(result);
      this._promise = this._promise.then(() => {
        this._done = true;
      });
    }

    await this._promise;
  }

  /**
   * Check if the function has been executed.
   */
  get isDone(): boolean {
    return this._done;
  }

  /**
   * Reset the state (use with caution).
   */
  reset(): void {
    this._done = false;
    this._promise = null;
  }
}

// ============================================================================
// Semaphore - Concurrency limiter (Optimized)
// ============================================================================

/**
 * Limits concurrent access to a resource.
 * Similar to Go's buffered channel used as semaphore.
 *
 * Optimized with promise pool pattern and batch processing.
 *
 * @example
 * ```typescript
 * const sem = new Semaphore(5); // Max 5 concurrent
 *
 * await sem.acquire();
 * try {
 *   await doWork();
 * } finally {
 *   sem.release();
 * }
 *
 * // Or use the helper
 * await sem.run(async () => {
 *   await doWork();
 * });
 * ```
 */
export class Semaphore {
  private _current = 0;
  private readonly _max: number;
  private readonly _queue: Array<{
    resolve: () => void;
    timestamp: number;
  }> = [];
  
  // Pre-allocated promise for fast path
  private readonly _fastPathPromise = Promise.resolve();

  constructor(max: number) {
    if (max <= 0) {
      throw new Error('Semaphore max must be positive');
    }
    this._max = max;
  }

  /**
   * Acquire a slot. Blocks if at capacity.
   */
  acquire(): Promise<void> {
    if (this._current < this._max) {
      this._current++;
      // Fast path: no waiting needed
      return this._fastPathPromise;
    }

    return new Promise<void>((resolve) => {
      this._queue.push({ resolve, timestamp: Date.now() });
    });
  }

  /**
   * Release the current slot.
   */
  release(): void {
    if (this._current > 0) {
      this._current--;
    }

    if (this._queue.length > 0) {
      const next = this._queue.shift()!;
      this._current++;
      next.resolve();
    }
  }

  /**
   * Run a function with automatic acquire/release.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Run multiple functions concurrently with pool size limit.
   * More efficient than individual run() calls for batch operations.
   */
  async runAll<T>(fns: Array<() => T | Promise<T>>): Promise<T[]> {
    const results: T[] = new Array(fns.length);
    let index = 0;
    
    const executeNext = async (): Promise<void> => {
      while (index < fns.length) {
        const currentIndex = index++;
        await this.acquire();
        try {
          results[currentIndex] = await fns[currentIndex]();
        } finally {
          this.release();
        }
      }
    };
    
    // Start multiple workers up to the semaphore limit
    const workers: Promise<void>[] = [];
    const numWorkers = Math.min(this._max, fns.length);
    for (let i = 0; i < numWorkers; i++) {
      workers.push(executeNext());
    }
    
    await Promise.all(workers);
    return results;
  }

  /**
   * Current number of active holders.
   */
  get active(): number {
    return this._current;
  }

  /**
   * Number of waiting acquirers.
   */
  get waiting(): number {
    return this._queue.length;
  }
}

// ============================================================================
// ConcurrentMap - Thread-safe map with lazy loading
// ============================================================================

/**
 * A Map with atomic load-or-compute semantics.
 * Prevents duplicate computation for the same key.
 *
 * @example
 * ```typescript
 * const cache = new ConcurrentMap<string, User>();
 *
 * // Atomic get-or-load
 * const user = await cache.load('user-123', async () => {
 *   return await db.users.findById('user-123');
 * });
 * ```
 */
export class ConcurrentMap<K, V> {
  private readonly _store = new Map<K, V>();
  private readonly _loading = new Map<K, Promise<V>>();

  /**
   * Get a value by key.
   */
  get(key: K): V | undefined {
    return this._store.get(key);
  }

  /**
   * Set a value by key.
   */
  set(key: K, value: V): void {
    this._store.set(key, value);
  }

  /**
   * Delete a key.
   */
  delete(key: K): boolean {
    this._loading.delete(key);
    return this._store.delete(key);
  }

  /**
   * Check if a key exists.
   */
  has(key: K): boolean {
    return this._store.has(key);
  }

  /**
   * Get or compute a value atomically.
   * Prevents duplicate computation for the same key.
   */
  async load(key: K, loader: () => V | Promise<V>): Promise<V> {
    // Return existing value
    const existing = this._store.get(key);
    if (existing !== undefined) {
      return existing;
    }

    // Wait for in-flight computation
    const loading = this._loading.get(key);
    if (loading) {
      return loading;
    }

    // Compute new value
    const promise = loader().then((value) => {
      this._store.set(key, value);
      this._loading.delete(key);
      return value;
    });

    this._loading.set(key, promise);
    return promise;
  }

  /**
   * Get all keys.
   */
  keys(): K[] {
    return Array.from(this._store.keys());
  }

  /**
   * Get all values.
   */
  values(): V[] {
    return Array.from(this._store.values());
  }

  /**
   * Get all entries.
   */
  entries(): [K, V][] {
    return Array.from(this._store.entries());
  }

  /**
   * Number of entries.
   */
  get size(): number {
    return this._store.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this._store.clear();
    this._loading.clear();
  }
}

// ============================================================================
// AtomicCounter - Atomic counter operations
// ============================================================================

/**
 * Thread-safe counter with atomic operations.
 * In Node.js single-threaded context, this provides
 * consistent API and prevents accidental misuse.
 *
 * @example
 * ```typescript
 * const counter = new AtomicCounter(0);
 * counter.inc();
 * counter.add(5);
 * console.log(counter.value); // 6
 * ```
 */
export class AtomicCounter {
  private _value: number;

  constructor(initial = 0) {
    this._value = initial;
  }

  /**
   * Get current value.
   */
  get value(): number {
    return this._value;
  }

  /**
   * Set value.
   */
  set(value: number): void {
    this._value = value;
  }

  /**
   * Add delta and return new value.
   */
  add(delta: number): number {
    this._value += delta;
    return this._value;
  }

  /**
   * Increment by 1 and return new value.
   */
  inc(): number {
    return this.add(1);
  }

  /**
   * Decrement by 1 and return new value.
   */
  dec(): number {
    return this.add(-1);
  }

  /**
   * Compare and swap. Returns true if successful.
   */
  compareAndSwap(expected: number, update: number): boolean {
    if (this._value === expected) {
      this._value = update;
      return true;
    }
    return false;
  }

  /**
   * Reset to initial value.
   */
  reset(initial = 0): void {
    this._value = initial;
  }
}

// ============================================================================
// Mutex - Mutual exclusion lock
// ============================================================================

/**
 * Mutual exclusion lock for async operations.
 * Ensures only one operation runs at a time.
 *
 * @example
 * ```typescript
 * const mutex = new Mutex();
 *
 * const release = await mutex.acquire();
 * try {
 *   await updateSharedResource();
 * } finally {
 *   release();
 * }
 * ```
 */
export class Mutex {
  private _locked = false;
  private readonly _queue: Array<() => void> = [];

  /**
   * Acquire the lock. Returns a release function.
   */
  async acquire(): Promise<() => void> {
    if (!this._locked) {
      this._locked = true;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this._queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  /**
   * Release the lock.
   */
  private release(): void {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._locked = false;
    }
  }

  /**
   * Run a function with mutual exclusion.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Check if the lock is held.
   */
  get isLocked(): boolean {
    return this._locked;
  }

  /**
   * Number of waiting acquirers.
   */
  get waiting(): number {
    return this._queue.length;
  }
}

// ============================================================================
// ReadWriteLock - Multiple readers, single writer
// ============================================================================

/**
 * Allows multiple concurrent readers or a single writer.
 * Useful for read-heavy workloads.
 *
 * @example
 * ```typescript
 * const rwLock = new ReadWriteLock();
 *
 * // Multiple readers can run concurrently
 * await rwLock.readLock.run(async () => {
 *   return await readData();
 * });
 *
 * // Writer has exclusive access
 * await rwLock.writeLock.run(async () => {
 *   await writeData();
 * });
 * ```
 */
export class ReadWriteLock {
  private _readers = 0;
  private _writer = false;
  private readonly _readQueue: Array<() => void> = [];
  private readonly _writeQueue: Array<() => void> = [];

  /**
   * Get a read lock handle.
   */
  get readLock(): { acquire(): Promise<void>; release(): void } {
    const self = this;
    return {
      async acquire() {
        if (!self._writer && self._writeQueue.length === 0) {
          self._readers++;
          return;
        }

        return new Promise<void>((resolve) => {
          self._readQueue.push(resolve);
        });
      },
      release() {
        self._readers--;
        if (self._readers === 0 && self._writeQueue.length > 0) {
          const next = self._writeQueue.shift()!;
          self._writer = true;
          next();
        }
      },
    };
  }

  /**
   * Get a write lock handle.
   */
  get writeLock(): { acquire(): Promise<void>; release(): void } {
    const self = this;
    return {
      async acquire() {
        if (!self._writer && self._readers === 0) {
          self._writer = true;
          return;
        }

        return new Promise<void>((resolve) => {
          self._writeQueue.push(resolve);
        });
      },
      release() {
        self._writer = false;
        if (self._writeQueue.length > 0) {
          const next = self._writeQueue.shift()!;
          self._writer = true;
          next();
        } else if (self._readQueue.length > 0) {
          while (self._readQueue.length > 0) {
            const reader = self._readQueue.shift()!;
            self._readers++;
            reader();
          }
        }
      },
    };
  }
}

// ============================================================================
// Reexport commonly used types
// ============================================================================

export type { Semaphore as Limit } from './index';
export type { ConcurrentMap as SafeMap } from './index';
export type { AtomicCounter as Atomic } from './index';