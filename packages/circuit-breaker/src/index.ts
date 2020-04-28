/**
 * Enhanced Circuit Breaker implementation with state machine,
 * event emitter, fallback support, and health check integration.
 */

import { EventEmitter } from 'events';

/**
 * Circuit breaker states:
 * - Closed: Normal operation, requests pass through
 * - Open: Failing state, requests are blocked
 * - HalfOpen: Testing state, limited requests allowed
 */
export enum CircuitBreakerState {
  Closed = 'CLOSED',
  Open = 'OPEN',
  HalfOpen = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Timeout in milliseconds for requests */
  timeout: number;
  /** Number of successful attempts in half-open state to close circuit */
  halfOpenAttempts: number;
  /** Time in milliseconds before transitioning from open to half-open */
  resetTimeout: number;
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  state: CircuitBreakerState;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

/**
 * Custom error for circuit breaker open state.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Custom error for circuit breaker timeout.
 */
export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string = 'Circuit breaker request timed out') {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

/**
 * Circuit breaker state change event.
 */
export interface CircuitBreakerStateChange {
  from: CircuitBreakerState;
  to: CircuitBreakerState;
  timestamp: Date;
  reason: string;
}

/**
 * Circuit breaker failure event.
 */
export interface CircuitBreakerFailure {
  error: Error;
  timestamp: Date;
  state: CircuitBreakerState;
}

/**
 * Circuit breaker success event.
 */
export interface CircuitBreakerSuccess {
  timestamp: Date;
  state: CircuitBreakerState;
}

/**
 * Circuit breaker timeout event.
 */
export interface CircuitBreakerTimeout {
  timestamp: Date;
  state: CircuitBreakerState;
}

/**
 * Enhanced Circuit Breaker with state machine, event emitter,
 * fallback support, and health check integration.
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.Closed;
  private failureCount: number = 0;
  private successCount: number = 0;
  private halfOpenAttemptsCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private readonly options: Required<CircuitBreakerOptions>;
  private openTimeoutId?: NodeJS.Timeout;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    super();
    this.options = {
      failureThreshold: options?.failureThreshold ?? 5,
      timeout: options?.timeout ?? 30000,
      halfOpenAttempts: options?.halfOpenAttempts ?? 3,
      resetTimeout: options?.resetTimeout ?? 60000,
    };
  }

  /**
   * Execute a function with circuit breaker protection.
   * @param fn - Function to execute (can be sync or async)
   * @param fallback - Optional fallback function to execute when circuit is open
   * @returns Promise resolving to the function result
   * @throws CircuitBreakerOpenError if circuit is open and no fallback provided
   * @throws CircuitBreakerTimeoutError if request times out
   */
  async execute<T>(
    fn: () => T | Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitBreakerState.Open) {
      if (fallback) {
        return fallback();
      }
      throw new CircuitBreakerOpenError();
    }

    // Check if we're in half-open state and have reached the limit
    if (
      this.state === CircuitBreakerState.HalfOpen &&
      this.halfOpenAttemptsCount >= this.options.halfOpenAttempts
    ) {
      if (fallback) {
        return fallback();
      }
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.onFailure(errorObj);

      if (fallback && this.state === CircuitBreakerState.Open) {
        return fallback();
      }

      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void {
    this.transitionTo(CircuitBreakerState.Closed, 'Manual reset');
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttemptsCount = 0;
    if (this.openTimeoutId) {
      clearTimeout(this.openTimeoutId);
      this.openTimeoutId = undefined;
    }
  }

  /**
   * Get circuit breaker statistics.
   */
  get stats(): CircuitBreakerStats {
    return {
      failures: this.failureCount,
      successes: this.successCount,
      state: this.state,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Get circuit breaker options.
   */
  getOptions(): Readonly<Required<CircuitBreakerOptions>> {
    return { ...this.options };
  }

  /**
   * Execute a function with timeout.
   */
  private async executeWithTimeout<T>(fn: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new CircuitBreakerTimeoutError());
      }, this.options.timeout);

      Promise.resolve()
        .then(() => fn())
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution.
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();
    this.successCount++;

    this.emit('success', {
      timestamp: this.lastSuccessTime,
      state: this.state,
    } as CircuitBreakerSuccess);

    if (this.state === CircuitBreakerState.HalfOpen) {
      this.halfOpenAttemptsCount++;
      if (this.halfOpenAttemptsCount >= this.options.halfOpenAttempts) {
        this.transitionTo(CircuitBreakerState.Closed, 'Half-open success threshold reached');
        this.failureCount = 0;
        this.halfOpenAttemptsCount = 0;
      }
    }
  }

  /**
   * Handle failed execution.
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = new Date();
    this.failureCount++;

    this.emit('failure', {
      error,
      timestamp: this.lastFailureTime,
      state: this.state,
    } as CircuitBreakerFailure);

    if (this.state === CircuitBreakerState.HalfOpen) {
      this.transitionTo(CircuitBreakerState.Open, 'Half-open failure');
      this.halfOpenAttemptsCount = 0;
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitBreakerState.Open, 'Failure threshold reached');
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(state: CircuitBreakerState, reason: string): void {
    const previousState = this.state;
    this.state = state;

    this.emit('stateChange', {
      from: previousState,
      to: state,
      timestamp: new Date(),
      reason,
    } as CircuitBreakerStateChange);

    // Set timeout to transition from open to half-open
    if (state === CircuitBreakerState.Open) {
      this.openTimeoutId = setTimeout(() => {
        if (this.state === CircuitBreakerState.Open) {
          this.transitionTo(CircuitBreakerState.HalfOpen, 'Reset timeout reached');
        }
      }, this.options.resetTimeout);
    }
  }
}

export { EventEmitter };
