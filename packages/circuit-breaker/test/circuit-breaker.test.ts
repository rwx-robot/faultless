import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
} from '../src/index';

describe('circuit-breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CircuitBreaker', () => {
    describe('constructor', () => {
      it('should create a circuit breaker with default options', () => {
        const cb = new CircuitBreaker();
        expect(cb).toBeInstanceOf(CircuitBreaker);
        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      });

      it('should create a circuit breaker with custom options', () => {
        const cb = new CircuitBreaker({
          failureThreshold: 10,
          timeout: 5000,
          halfOpenAttempts: 5,
          resetTimeout: 30000,
        });
        expect(cb.getOptions().failureThreshold).toBe(10);
        expect(cb.getOptions().timeout).toBe(5000);
        expect(cb.getOptions().halfOpenAttempts).toBe(5);
        expect(cb.getOptions().resetTimeout).toBe(30000);
      });
    });

    describe('execute()', () => {
      it('should execute function successfully in closed state', async () => {
        const cb = new CircuitBreaker();
        const fn = vi.fn().mockReturnValue('success');

        const result = await cb.execute(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      });

      it('should execute async function successfully', async () => {
        const cb = new CircuitBreaker();
        const fn = vi.fn().mockResolvedValue('async success');

        const result = await cb.execute(fn);

        expect(result).toBe('async success');
        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      });

      it('should transition to open after failure threshold', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // First 3 failures should open the circuit
        for (let i = 0; i < 3; i++) {
          try {
            await cb.execute(fn);
          } catch (error) {
            // Expected
          }
        }

        expect(cb.getState()).toBe(CircuitBreakerState.Open);
        expect(cb.stats.failures).toBe(3);
      });

      it('should use fallback when circuit is open', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });
        const fallback = vi.fn().mockReturnValue('fallback');

        // First failure opens the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Second call should use fallback
        const result = await cb.execute(fn, fallback);
        expect(result).toBe('fallback');
        expect(fallback).toHaveBeenCalledTimes(1);
      });

      it('should throw CircuitBreakerOpenError when no fallback', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // First failure opens the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Second call should throw CircuitBreakerOpenError
        await expect(cb.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
      });

      it('should transition to half-open after reset timeout', async () => {
        const cb = new CircuitBreaker({
          failureThreshold: 1,
          resetTimeout: 1000,
        });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // First failure opens the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(cb.getState()).toBe(CircuitBreakerState.Open);

        // Advance time past reset timeout
        vi.advanceTimersByTime(1000);

        expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);
      });

      it('should transition back to closed after half-open success', async () => {
        const cb = new CircuitBreaker({
          failureThreshold: 1,
          halfOpenAttempts: 2,
          resetTimeout: 1000,
        });
        const fn = vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('fail');
          })
          .mockReturnValue('success');

        // First failure opens the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Advance time past reset timeout
        vi.advanceTimersByTime(1000);

        // First success in half-open
        await cb.execute(fn);
        expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

        // Second success should close the circuit
        await cb.execute(fn);
        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      });

      it('should transition back to open on half-open failure', async () => {
        const cb = new CircuitBreaker({
          failureThreshold: 1,
          resetTimeout: 1000,
        });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // First failure opens the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Advance time past reset timeout
        vi.advanceTimersByTime(1000);

        expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

        // Failure in half-open should open the circuit again
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(cb.getState()).toBe(CircuitBreakerState.Open);
      });

      it('should handle timeout', async () => {
        const cb = new CircuitBreaker({ timeout: 100 });
        const fn = vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(resolve, 200);
          });
        });

        const promise = cb.execute(fn);
        vi.advanceTimersByTime(150);
        await expect(promise).rejects.toThrow(CircuitBreakerTimeoutError);
      });
    });

    describe('reset()', () => {
      it('should reset circuit breaker to closed state', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(cb.getState()).toBe(CircuitBreakerState.Open);

        // Reset
        cb.reset();

        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
        expect(cb.stats.failures).toBe(0);
        expect(cb.stats.successes).toBe(0);
      });

      it('should clear timeout when reset', async () => {
        const cb = new CircuitBreaker({
          failureThreshold: 1,
          resetTimeout: 1000,
        });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Reset before timeout
        cb.reset();
        vi.advanceTimersByTime(1000);

        // Should still be closed (not half-open)
        expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      });
    });

    describe('stats', () => {
      it('should track failures and successes', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 10 });
        const fn = vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('fail');
          })
          .mockReturnValue('success');

        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        await cb.execute(fn);

        expect(cb.stats.failures).toBe(1);
        expect(cb.stats.successes).toBe(1);
        expect(cb.stats.state).toBe(CircuitBreakerState.Closed);
      });

      it('should track last failure and success times', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 10 });
        const fn = vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('fail');
          })
          .mockReturnValue('success');

        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(cb.stats.lastFailureTime).toBeInstanceOf(Date);

        await cb.execute(fn);

        expect(cb.stats.lastSuccessTime).toBeInstanceOf(Date);
      });
    });

    describe('events', () => {
      it('should emit stateChange events', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        const stateChanges: any[] = [];
        cb.on('stateChange', (change) => stateChanges.push(change));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(stateChanges).toHaveLength(1);
        expect(stateChanges[0].from).toBe(CircuitBreakerState.Closed);
        expect(stateChanges[0].to).toBe(CircuitBreakerState.Open);
        expect(stateChanges[0].reason).toBe('Failure threshold reached');
      });

      it('should emit failure events', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 10 });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        const failures: any[] = [];
        cb.on('failure', (failure) => failures.push(failure));

        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        expect(failures).toHaveLength(1);
        expect(failures[0].error.message).toBe('fail');
        expect(failures[0].state).toBe(CircuitBreakerState.Closed);
      });

      it('should emit success events', async () => {
        const cb = new CircuitBreaker();
        const fn = vi.fn().mockReturnValue('success');

        const successes: any[] = [];
        cb.on('success', (success) => successes.push(success));

        await cb.execute(fn);

        expect(successes).toHaveLength(1);
        expect(successes[0].state).toBe(CircuitBreakerState.Closed);
      });
    });

    describe('timeout', () => {
      it('should use configured timeout', async () => {
        const cb = new CircuitBreaker({ timeout: 50 });
        const fn = vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(resolve, 100);
          });
        });

        const promise = cb.execute(fn);
        vi.advanceTimersByTime(75);
        await expect(promise).rejects.toThrow(CircuitBreakerTimeoutError);
      });
    });

    describe('half-open state', () => {
      it('should limit requests in half-open state', async () => {
        const cb = new CircuitBreaker({
          failureThreshold: 1,
          halfOpenAttempts: 2,
          resetTimeout: 1000,
        });
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('fail');
        });

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch (error) {
          // Expected
        }

        // Advance to half-open
        vi.advanceTimersByTime(1000);
        expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

        // First two attempts should be allowed (but fail)
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch (error) {
            // Expected
          }
        }

        // Third attempt should be blocked (fallback or error)
        await expect(cb.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
      });
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('should have correct name and message', () => {
      const error = new CircuitBreakerOpenError();
      expect(error.name).toBe('CircuitBreakerOpenError');
      expect(error.message).toBe('Circuit breaker is open');
    });

    it('should accept custom message', () => {
      const error = new CircuitBreakerOpenError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('CircuitBreakerTimeoutError', () => {
    it('should have correct name and message', () => {
      const error = new CircuitBreakerTimeoutError();
      expect(error.name).toBe('CircuitBreakerTimeoutError');
      expect(error.message).toBe('Circuit breaker request timed out');
    });

    it('should accept custom message', () => {
      const error = new CircuitBreakerTimeoutError('Custom timeout');
      expect(error.message).toBe('Custom timeout');
    });
  });
});
