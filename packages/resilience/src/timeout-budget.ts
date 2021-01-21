import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'resilience:timeout-budget' });

/**
 * Deadline Source
 */
export enum DeadlineSource {
  CLIENT = 'CLIENT',       // Request initiated from client
  SERVER = 'SERVER',       // Request originated from server
  RETRY = 'RETRY',         // Retry attempt
  CASCADE = 'CASCADE',     // Cascaded from upstream
}

/**
 * Deadline State
 */
export interface DeadlineState {
  id: string;
  source: DeadlineSource;
  createdAt: number;
  expiresAt: number;
  timeoutMs: number;
  remainingMs: number;
  isExpired: boolean;
  cascadeCount: number;
}

/**
 * Deadline Options
 */
export interface DeadlineOptions {
  timeoutMs: number;
  source?: DeadlineSource;
  id?: string;
  cascadeCount?: number;
}

/**
 * Deadline - propagates timeout through call chain
 * - Created at entry point with a timeout
 * - Passed via context/headers to downstream services
 * - Each hop decrements the remaining time
 * - If expired, all downstream calls fail fast
 * Supports:
 * - Deadline propagation via headers (x-nofault-deadline, x-nofault-deadline-id)
 * - Remaining time calculation
 * - Automatic expiration
 * - Cascade counting
 */
@Injectable()
export class Deadline {
  public readonly id: string;
  public readonly source: DeadlineSource;
  public readonly createdAt: number;
  public readonly expiresAt: number;
  public readonly timeoutMs: number;
  public readonly cascadeCount: number;

  private _expired = false;
  private _expiredAt?: number;

  constructor(options: DeadlineOptions) {
    this.id = options.id ?? this.generateId();
    this.source = options.source ?? DeadlineSource.CLIENT;
    this.createdAt = Date.now();
    this.timeoutMs = options.timeoutMs;
    this.expiresAt = this.createdAt + options.timeoutMs;
    this.cascadeCount = options.cascadeCount ?? 0;
  }

  /**
   * Get remaining time in milliseconds
   */
  get remainingMs(): number {
    if (this._expired) return 0;
    const remaining = this.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Check if deadline is expired
   */
  get isExpired(): boolean {
    if (this._expired) return true;
    if (Date.now() >= this.expiresAt) {
      this._expired = true;
      this._expiredAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Create derived deadline for downstream call
   * Uses remaining time minus a buffer
   */
  createDownstream(options?: {
    bufferMs?: number;
    source?: DeadlineSource;
  }): Deadline {
    const bufferMs = options?.bufferMs ?? 100; // 100ms buffer for processing
    const remainingMs = this.remainingMs - bufferMs;

    if (remainingMs <= 0) {
      throw new Error('Deadline expired, cannot create downstream deadline');
    }

    return new Deadline({
      timeoutMs: remainingMs,
      source: options?.source ?? DeadlineSource.CASCADE,
      cascadeCount: this.cascadeCount + 1,
    });
  }

  /**
   * Convert to headers for HTTP propagation
   */
  toHeaders(): Record<string, string> {
    return {
      'x-nofault-deadline': String(this.timeoutMs),
      'x-nofault-deadline-id': this.id,
      'x-nofault-deadline-remaining': String(this.remainingMs),
      'x-nofault-deadline-source': this.source,
      'x-nofault-deadline-cascade': String(this.cascadeCount),
    };
  }

  /**
   * Create deadline from incoming headers
   */
  static fromHeaders(
    headers: Record<string, string | string[] | undefined>,
    defaultTimeoutMs?: number
  ): Deadline {
    const timeoutMs = parseInt(
      (headers['x-nofault-deadline'] as string) ?? String(defaultTimeoutMs ?? 30000),
      10
    );

    const remainingMs = parseInt(
      (headers['x-nofault-deadline-remaining'] as string) ?? String(timeoutMs),
      10
    );

    // Use remaining time as our timeout (after buffer)
    const bufferMs = 50;
    const effectiveTimeoutMs = Math.max(0, remainingMs - bufferMs);

    return new Deadline({
      timeoutMs: effectiveTimeoutMs,
      source: DeadlineSource.CASCADE,
      id: (headers['x-nofault-deadline-id'] as string),
      cascadeCount: parseInt(
        (headers['x-nofault-deadline-cascade'] as string) ?? '0',
        10
      ) + 1,
    });
  }

  /**
   * Wait for deadline with callback
   */
  async wait(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.isExpired) {
          resolve();
        } else {
          setTimeout(check, Math.min(100, this.remainingMs));
        }
      };
      check();
    });
  }

  /**
   * Wrap promise with deadline
   */
  async race<T>(promise: Promise<T>): Promise<T> {
    if (this.isExpired) {
      throw new Error('Deadline expired before execution');
    }

    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Deadline expired after ${this.timeoutMs}ms`));
        }, this.remainingMs);
        promise.finally(() => clearTimeout(timeout));
      }),
    ]);
  }

  /**
   * Get state
   */
  getState(): DeadlineState {
    return {
      id: this.id,
      source: this.source,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      timeoutMs: this.timeoutMs,
      remainingMs: this.remainingMs,
      isExpired: this.isExpired,
      cascadeCount: this.cascadeCount,
    };
  }

  private generateId(): string {
    return `deadline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Create a deadline
 */
export function createDeadline(options: DeadlineOptions): Deadline {
  return new Deadline(options);
}

/**
 * Timeout Budget - manages deadlines across a request lifecycle
 * Tracks:
 * - Original request deadline
 * - All downstream deadlines
 * - Total time consumed
 * - Remaining budget
 */
@Injectable()
export class TimeoutBudget {
  private deadlines: Map<string, Deadline> = new Map();

  /**
   * Create deadline and track it
   */
  create(options: DeadlineOptions): Deadline {
    const deadline = createDeadline(options);
    this.deadlines.set(deadline.id, deadline);
    return deadline;
  }

  /**
   * Create downstream deadline from parent
   */
  createDownstream(
    parentId: string,
    options?: { bufferMs?: number; source?: DeadlineSource }
  ): Deadline {
    const parent = this.deadlines.get(parentId);
    if (!parent) throw new Error(`Parent deadline ${parentId} not found`);

    const downstream = parent.createDownstream(options);
    this.deadlines.set(downstream.id, downstream);
    return downstream;
  }

  /**
   * Get deadline from headers or create new one
   */
  getOrCreateFromHeaders(
    headers: Record<string, string | string[] | undefined>,
    defaultTimeoutMs?: number
  ): Deadline {
    const existingId = headers['x-nofault-deadline-id'] as string;
    if (existingId && this.deadlines.has(existingId)) {
      return this.deadlines.get(existingId)!;
    }

    return Deadline.fromHeaders(headers, defaultTimeoutMs);
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    let minRemaining = Infinity;
    this.deadlines.forEach(deadline => {
      minRemaining = Math.min(minRemaining, deadline.remainingMs);
    });
    return minRemaining === Infinity ? 0 : minRemaining;
  }

  /**
   * Check if budget is exhausted
   */
  isExhausted(): boolean {
    return this.getRemainingBudget() <= 0;
  }

  /**
   * Get all deadline states
   */
  getStates(): DeadlineState[] {
    return Array.from(this.deadlines.values()).map(d => d.getState());
  }

  /**
   * Clear expired deadlines
   */
  cleanup(): number {
    let count = 0;
    this.deadlines.forEach((deadline, id) => {
      if (deadline.isExpired) {
        this.deadlines.delete(id);
        count++;
      }
    });
    return count;
  }
}

/**
 * Create a timeout budget
 */
export function createTimeoutBudget(): TimeoutBudget {
  return new TimeoutBudget();
}

/**
 * Timeout Budget Middleware for HTTP
 */
export function createTimeoutBudgetMiddleware(options?: {
  defaultTimeoutMs?: number;
  propagateHeaders?: boolean;
  rejectOnExpired?: boolean;
}) {
  const defaultTimeoutMs = options?.defaultTimeoutMs ?? 30000;
  const propagateHeaders = options?.propagateHeaders ?? true;
  const rejectOnExpired = options?.rejectOnExpired ?? true;

  return async (request: any, reply: any, next: () => Promise<void>) => {
    // Get or create deadline
    const deadline = Deadline.fromHeaders(request.headers, defaultTimeoutMs);

    // Attach to request
    request.deadline = deadline;

    // Check if already expired
    if (deadline.isExpired) {
      if (rejectOnExpired) {
        reply.code(504).send({ error: 'Deadline expired' });
        return;
      }
    }

    // Add response headers if propagating
    if (propagateHeaders) {
      reply.header('x-nofault-deadline-remaining', String(deadline.remainingMs));
    }

    await next();
  };
}