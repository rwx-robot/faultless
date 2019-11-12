import { Injectable, NofaultError } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'resilience:bulkhead' });

/**
 * Bulkhead State
 */
export enum BulkheadState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Bulkhead full, rejecting
  DEGRADED = 'DEGRADED',   // Partially degraded, some requests rejected
}

/**
 * Bulkhead Options
 */
export interface BulkheadOptions {
  name: string;
  maxConcurrent?: number;        // Max concurrent executions (default: 10)
  maxQueued?: number;            // Max queued waiting (default: 0)
  timeoutMs?: number;            // Timeout for waiting (default: 30000)
  degradationThreshold?: number; // % of max to trigger degraded state (default: 80)
  queueTimeoutMs?: number;       // Timeout for queued requests (default: 5000)
  onStateChange?: (state: BulkheadState) => void;
  onRejection?: (error: NofaultError) => void;
}

/**
 * Bulkhead State Info
 */
export interface BulkheadStateInfo {
  state: BulkheadState;
  running: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
  totalExecutions: number;
  totalRejections: number;
  totalTimeouts: number;
}

/**
 * Bulkhead for isolation
 * Two isolation modes:
 * 1. Semaphore-based: Simple concurrency limit (
 * 2. ThreadPool-based: Dedicated thread pool with queue
 * Supports:
 * - Automatic state transitions (CLOSED → DEGRADED → OPEN)
 * - Configurable degradation threshold
 * - Queue timeout for waiting requests
 * - Metrics and monitoring
 * - HTTP middleware integration
 */
@Injectable()
export class Bulkhead {
  private state: BulkheadState = BulkheadState.CLOSED;
  private running = 0;
  private queued = 0;
  private waitQueue: Array<{
    resolve: (value: void) => void;
    reject: (error: NofaultError) => void;
    timeout?: NodeJS.Timeout;
  }> = [];

  private totalExecutions = 0;
  private totalRejections = 0;
  private totalTimeouts = 0;

  private stateChangeCallbacks: Array<(state: BulkheadState) => void> = [];
  private rejectionCallbacks: Array<(error: NofaultError) => void> = [];

  constructor(private readonly options: BulkheadOptions) {
    if (options.onStateChange) this.stateChangeCallbacks.push(options.onStateChange);
    if (options.onRejection) this.rejectionCallbacks.push(options.onRejection);
  }

  get name(): string { return this.options.name; }
  get maxConcurrent(): number { return this.options.maxConcurrent ?? 10; }
  get maxQueued(): number { return this.options.maxQueued ?? 0; }
  get timeoutMs(): number { return this.options.timeoutMs ?? 30000; }
  get degradationThreshold(): number { return this.options.degradationThreshold ?? 80; }
  get queueTimeoutMs(): number { return this.options.queueTimeoutMs ?? 5000; }

  /**
   * Execute function with bulkhead isolation
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can acquire
    const acquireResult = this.tryAcquire();

    if (!acquireResult.success) {
      this.totalRejections++;
      const error = new NofaultError(
        acquireResult.reason ?? 'Bulkhead is full',
        'BULKHEAD_REJECTED',
        503,
        { bulkhead: this.name, running: this.running, queued: this.queued }
      );
      this.rejectionCallbacks.forEach(cb => cb(error));
      throw error;
    }

    // If we got immediate permission
    if (acquireResult.immediate) {
      try {
        this.totalExecutions++;
        return await this.executeWithTimeout(fn);
      } finally {
        this.release();
      }
    }

    // Otherwise wait in queue
    try {
      await this.waitForQueue();
      this.totalExecutions++;
      return await this.executeWithTimeout(fn);
    } catch (error) {
      if (error instanceof NofaultError && error.code === 'BULKHEAD_TIMEOUT') {
        this.totalTimeouts++;
      }
      throw error;
    } finally {
      this.release();
    }
  }

  /**
   * Try to acquire permission (non-blocking)
   */
  private tryAcquire(): { success: boolean; immediate: boolean; reason?: string } {
    // Can we run immediately?
    if (this.running < this.maxConcurrent) {
      this.running++;
      this.updateState();
      return { success: true, immediate: true };
    }

    // Can we queue?
    if (this.queued < this.maxQueued) {
      this.queued++;
      this.updateState();
      return { success: true, immediate: false };
    }

    // Full
    return {
      success: false,
      immediate: false,
      reason: `Bulkhead full: ${this.running}/${this.maxConcurrent} running, ${this.queued}/${this.maxQueued} queued`,
    };
  }

  /**
   * Wait for queue slot
   */
  private waitForQueue(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue
        const idx = this.waitQueue.findIndex(item => item.resolve === resolve);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
          this.queued--;
        }
        reject(new NofaultError('Bulkhead queue timeout', 'BULKHEAD_TIMEOUT', 504));
      }, this.queueTimeoutMs);

      this.waitQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new NofaultError('Bulkhead execution timeout', 'BULKHEAD_TIMEOUT', 504));
        }, this.timeoutMs);
      }),
    ]);
  }

  /**
   * Release permission
   */
  private release(): void {
    this.running--;
    this.updateState();

    // Process queue if waiting
    if (this.waitQueue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.waitQueue.shift()!;
      if (next.timeout) clearTimeout(next.timeout);
      this.queued--;
      this.running++;
      next.resolve();
    }

    this.updateState();
  }

  /**
   * Update state based on thresholds
   */
  private updateState(): void {
    const oldState = this.state;
    const loadPercent = (this.running / this.maxConcurrent) * 100;

    if (this.running >= this.maxConcurrent) {
      this.state = BulkheadState.OPEN;
    } else if (loadPercent >= this.degradationThreshold) {
      this.state = BulkheadState.DEGRADED;
    } else {
      this.state = BulkheadState.CLOSED;
    }

    if (oldState !== this.state) {
      this.stateChangeCallbacks.forEach(cb => cb(this.state));
    }
  }

  /**
   * Get current state info
   */
  getState(): BulkheadStateInfo {
    return {
      state: this.state,
      running: this.running,
      queued: this.queued,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued,
      totalExecutions: this.totalExecutions,
      totalRejections: this.totalRejections,
      totalTimeouts: this.totalTimeouts,
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.totalExecutions = 0;
    this.totalRejections = 0;
    this.totalTimeouts = 0;
  }

  /**
   * Close bulkhead and reject all waiting
   */
  close(): void {
    this.waitQueue.forEach(item => {
      if (item.timeout) clearTimeout(item.timeout);
      item.reject(new NofaultError('Bulkhead closed', 'BULKHEAD_CLOSED', 503));
    });
    this.waitQueue = [];
    this.queued = 0;
  }
}

/**
 * Create a bulkhead
 */
export function createBulkhead(options: BulkheadOptions): Bulkhead {
  return new Bulkhead(options);
}

/**
 * Bulkhead Registry - manages multiple bulkheads
 */
export class BulkheadRegistry {
  private bulkheads = new Map<string, Bulkhead>();

  /**
   * Get or create bulkhead
   */
  getOrCreate(name: string, options?: Partial<BulkheadOptions>): Bulkhead {
    if (!this.bulkheads.has(name)) {
      this.bulkheads.set(name, createBulkhead({ name, ...options }));
    }
    return this.bulkheads.get(name)!;
  }

  /**
   * Get bulkhead
   */
  get(name: string): Bulkhead | undefined {
    return this.bulkheads.get(name);
  }

  /**
   * Remove bulkhead
   */
  remove(name: string): boolean {
    const bulkhead = this.bulkheads.get(name);
    if (bulkhead) {
      bulkhead.close();
      return this.bulkheads.delete(name);
    }
    return false;
  }

  /**
   * Get all bulkhead states
   */
  getAllStates(): Record<string, BulkheadStateInfo> {
    const states: Record<string, BulkheadStateInfo> = {};
    this.bulkheads.forEach((bulkhead, name) => {
      states[name] = bulkhead.getState();
    });
    return states;
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    this.bulkheads.forEach(bulkhead => bulkhead.reset());
  }

  /**
   * Close all
   */
  closeAll(): void {
    this.bulkheads.forEach(bulkhead => bulkhead.close());
  }
}

export const bulkheadRegistry = new BulkheadRegistry();