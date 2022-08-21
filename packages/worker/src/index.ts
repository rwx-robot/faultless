/**
 * @faultless/worker
 * Worker thread utilities for Node.js
 *
 * Provides worker pool and task queue abstractions:
 * - WorkerPool: Fixed-size pool of worker threads
 * - TaskQueue: Queue with concurrency control
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { EventEmitter } from 'node:events';

// ============================================================================
// WorkerPool - Fixed-size pool of worker threads
// ============================================================================

interface WorkerTask {
  id: number;
  fn: (data: any) => any;
  data: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface WorkerInfo {
  worker: Worker;
  busy: boolean;
  currentTask?: WorkerTask;
}

/**
 * A fixed-size pool of worker threads for parallel task execution.
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool(4);
 *
 * // Run a task
 * const result = await pool.run((data) => {
 *   return data * 2;
 * }, 21);
 * // result = 42
 *
 * // Run multiple tasks
 * const results = await Promise.all([
 *   pool.run((d) => d + 1, 10),
 *   pool.run((d) => d + 2, 20),
 *   pool.run((d) => d + 3, 30),
 * ]);
 *
 * // Cleanup
 * await pool.terminate();
 * ```
 */
export class WorkerPool<T = any> {
  private _workers: WorkerInfo[] = [];
  private _queue: WorkerTask[] = [];
  private _taskCounter = 0;
  private _terminated = false;

  constructor(size?: number) {
    const poolSize = size ?? (navigator?.hardwareConcurrency ?? 4);

    if (isMainThread) {
      for (let i = 0; i < poolSize; i++) {
        this._workers.push(this._createWorker());
      }
    }
  }

  /**
   * Run a function in a worker thread.
   */
  run<TResult = T>(
    fn: (data: any) => TResult,
    data: any
  ): Promise<TResult> {
    if (this._terminated) {
      return Promise.reject(new Error('WorkerPool has been terminated'));
    }

    return new Promise<TResult>((resolve, reject) => {
      const task: WorkerTask = {
        id: this._taskCounter++,
        fn,
        data,
        resolve: resolve as (value: any) => void,
        reject,
      };

      this._assignTask(task);
    });
  }

  /**
   * Terminate all workers and clear the queue.
   */
  async terminate(): Promise<void> {
    this._terminated = true;

    // Reject all queued tasks
    for (const task of this._queue) {
      task.reject(new Error('WorkerPool has been terminated'));
    }
    this._queue = [];

    // Terminate all workers
    const terminations = this._workers.map(async (info) => {
      try {
        await info.worker.terminate();
      } catch {
        // Ignore errors on terminate
      }
    });

    await Promise.all(terminations);
    this._workers = [];
  }

  /**
   * Get the number of active (busy) workers.
   */
  get activeCount(): number {
    return this._workers.filter((w) => w.busy).length;
  }

  /**
   * Get the number of pending tasks in the queue.
   */
  get pendingCount(): number {
    return this._queue.length;
  }

  /**
   * Get the pool size.
   */
  get size(): number {
    return this._workers.length;
  }

  private _createWorker(): WorkerInfo {
    const workerCode = `
      const { parentPort } = require('worker_threads');

      parentPort.on('message', async ({ id, fnCode, data }) => {
        try {
          const fn = new Function('return ' + fnCode)();
          const result = fn(data);
          const resolved = result instanceof Promise ? await result : result;
          parentPort.postMessage({ id, result: resolved });
        } catch (error) {
          parentPort.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    `;

    const worker = new Worker(workerCode, { eval: true });

    const info: WorkerInfo = { worker, busy: false };

    worker.on('message', (message: { id: number; result?: any; error?: string }) => {
      const task = info.currentTask;
      info.busy = false;
      info.currentTask = undefined;

      if (task) {
        if (message.error) {
          task.reject(new Error(message.error));
        } else {
          task.resolve(message.result);
        }
      }

      // Process next task in queue
      this._processQueue();
    });

    worker.on('error', (error) => {
      const task = info.currentTask;
      info.busy = false;
      info.currentTask = undefined;

      if (task) {
        task.reject(error);
      }

      // Replace the failed worker
      const index = this._workers.indexOf(info);
      if (index !== -1) {
        this._workers[index] = this._createWorker();
      }

      this._processQueue();
    });

    return info;
  }

  private _assignTask(task: WorkerTask): void {
    // Find an idle worker
    const worker = this._workers.find((w) => !w.busy);

    if (worker) {
      this._executeTask(worker, task);
    } else {
      this._queue.push(task);
    }
  }

  private _executeTask(workerInfo: WorkerInfo, task: WorkerTask): void {
    workerInfo.busy = true;
    workerInfo.currentTask = task;

    workerInfo.worker.postMessage({
      id: task.id,
      fnCode: task.fn.toString(),
      data: task.data,
    });
  }

  private _processQueue(): void {
    if (this._queue.length === 0 || this._terminated) {
      return;
    }

    const worker = this._workers.find((w) => !w.busy);
    if (worker) {
      const task = this._queue.shift()!;
      this._executeTask(worker, task);
    }
  }
}

// ============================================================================
// TaskQueue - Queue with concurrency control
// ============================================================================

type QueueTask<T> = {
  fn: (data: any) => T;
  data: any;
  resolve: (value: T) => void;
  reject: (error: any) => void;
};

/**
 * A task queue with configurable concurrency control.
 * Runs tasks using the main thread (not worker threads).
 *
 * @example
 * ```typescript
 * const queue = new TaskQueue(3); // Max 3 concurrent tasks
 *
 * // Add tasks
 * const result1 = await queue.add(async (data) => {
 *   await simulateWork();
 *   return data * 2;
 * }, 21);
 *
 * const result2 = await queue.add(async (data) => {
 *   return data + 1;
 * }, 10);
 *
 * console.log(queue.size); // 0 (tasks completed)
 * ```
 */
export class TaskQueue<T = any> extends EventEmitter {
  private _concurrency: number;
  private _running = 0;
  private _queue: QueueTask<T>[] = [];

  constructor(concurrency?: number) {
    super();
    this._concurrency = concurrency ?? 5;
  }

  /**
   * Add a task to the queue.
   */
  add<TResult = T>(
    fn: (data: any) => TResult | Promise<TResult>,
    data: any
  ): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const task: QueueTask<TResult> = {
        fn: fn as (data: any) => TResult,
        data,
        resolve: resolve as (value: TResult) => void,
        reject,
      };

      this._queue.push(task as unknown as QueueTask<T>);
      this._process();
    });
  }

  /**
   * Clear all pending tasks.
   */
  clear(): void {
    const tasks = this._queue.splice(0);
    for (const task of tasks) {
      task.reject(new Error('TaskQueue cleared'));
    }
  }

  /**
   * Get the number of pending tasks.
   */
  get size(): number {
    return this._queue.length;
  }

  /**
   * Get the number of currently running tasks.
   */
  get running(): number {
    return this._running;
  }

  /**
   * Check if the queue is idle (no pending or running tasks).
   */
  get idle(): boolean {
    return this._running === 0 && this._queue.length === 0;
  }

  /**
   * Set concurrency limit.
   */
  set concurrency(value: number) {
    this._concurrency = Math.max(1, value);
    this._process();
  }

  /**
   * Get concurrency limit.
   */
  get concurrency(): number {
    return this._concurrency;
  }

  private async _process(): Promise<void> {
    while (this._running < this._concurrency && this._queue.length > 0) {
      const task = this._queue.shift()!;
      this._running++;
      this._runTask(task);
    }
  }

  private async _runTask(task: QueueTask<T>): Promise<void> {
    try {
      const result = await task.fn(task.data);
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this._running--;
      this.emit('task-complete');
      this._process();
    }
  }
}
