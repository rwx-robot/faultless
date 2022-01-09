import { EventEmitter } from 'events';
import { CircuitBreakerOptions } from '@faultless/core';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('breaker:circuit-breaker');

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  nextAttempt?: Date;
}

export interface CircuitBreakerConfig extends CircuitBreakerOptions {
  name: string;
  fallback?: (error: Error) => Promise<any> | any;
  isFailure?: (error: Error) => boolean;
  onStateChange?: (state: CircuitBreakerState, previousState: CircuitBreakerState) => void;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private nextAttempt?: Date;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    super();
    this.config = {
      threshold: 5,
      timeout: 60000,
      resetTimeout: 30000,
      ...config,
    };
  }

  getState(): CircuitBreakerState {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.nextAttempt && Date.now() >= this.nextAttempt.getTime()) {
        this.transitionToHalfOpen();
      }
    }
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      nextAttempt: this.nextAttempt,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      const error = new Error(`Circuit breaker ${this.config.name} is OPEN`);
      (error as any).code = 'CIRCUIT_BREAKER_OPEN';
      (error as any).resetTime = this.nextAttempt;

      if (this.config.fallback) {
        return this.config.fallback(error);
      }
      throw error;
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccess = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToClosed();
    }

    this.emit('success', { state: this.state });
  }

  private onFailure(error: Error): void {
    const isFailure = this.config.isFailure?.(error) ?? true;

    if (!isFailure) {
      return;
    }

    this.failures++;
    this.lastFailure = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.CLOSED && this.failures >= this.config.threshold) {
      this.transitionToOpen();
    }

    this.emit('failure', { error, state: this.state, failures: this.failures });
  }

  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);

    logger.warn(`Circuit breaker ${this.config.name} OPENED`, {
      threshold: this.config.threshold,
      failures: this.failures,
      nextAttempt: this.nextAttempt,
    });

    this.config.onStateChange?.(this.state, previousState);
    this.emit('stateChange', { state: this.state, previousState });
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.failures = 0;
    this.successes = 0;

    logger.info(`Circuit breaker ${this.config.name} HALF_OPEN`, {
      resetTimeout: this.config.resetTimeout,
    });

    this.config.onStateChange?.(this.state, previousState);
    this.emit('stateChange', { state: this.state, previousState });
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = undefined;

    logger.info(`Circuit breaker ${this.config.name} CLOSED`);

    this.config.onStateChange?.(this.state, previousState);
    this.emit('stateChange', { state: this.state, previousState });
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailure = undefined;
    this.lastSuccess = undefined;
    this.nextAttempt = undefined;
    this.emit('reset');
  }

  forceOpen(): void {
    this.transitionToOpen();
  }

  forceClosed(): void {
    this.transitionToClosed();
  }

  getName(): string {
    return this.config.name;
  }
}

export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  create(config: CircuitBreakerConfig): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      throw new Error(`Circuit breaker ${config.name} already exists`);
    }
    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getOrCreate(config: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(config.name);
    if (!breaker) {
      breaker = this.create(config);
    }
    return breaker;
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return circuitBreakerRegistry.getOrCreate(config);
}