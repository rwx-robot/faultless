import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
} from '@faultless/circuit-breaker';
import {
  RetryPolicy,
  RetryError,
  retry,
} from '@faultless/retry';

describe('Circuit Breaker + Retry Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Circuit Breaker with Retry Policy', () => {
    it('should retry failed operations before circuit opens', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, timeout: 5000 });
      let attempts = 0;

      const retryPolicy = new RetryPolicy({
        maxAttempts: 3,
        delay: 10,
        backoff: 'fixed',
      });

      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('temporary failure');
        }
        return 'success';
      });

      const executePromise = retryPolicy.execute(() => cb.execute(fn));

      // Advance through retries
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);

      const result = await executePromise;
      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(cb.getState()).toBe(CircuitBreakerState.Closed);
    });

    it('should open circuit after retry exhaustion', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, timeout: 5000 });
      let attempts = 0;

      const retryPolicy = new RetryPolicy({
        maxAttempts: 2,
        delay: 10,
        backoff: 'fixed',
      });

      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        throw new Error('persistent failure');
      });

      let caughtError: any = null;
      const executePromise = retryPolicy.execute(() => cb.execute(fn)).catch(e => {
        caughtError = e;
        return 'caught';
      });

      // Advance through retries
      await vi.advanceTimersByTimeAsync(10);
      await executePromise;

      expect(caughtError).toBeInstanceOf(RetryError);
      expect(cb.getState()).toBe(CircuitBreakerState.Open);
    });

    it('should use fallback when circuit is open during retry', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      // Open the circuit
      try {
        await cb.execute(() => { throw new Error('failure'); });
      } catch {}
      expect(cb.getState()).toBe(CircuitBreakerState.Open);

      // Retry with fallback
      const retryPolicy = new RetryPolicy({
        maxAttempts: 2,
        delay: 10,
        retryOn: () => true,
      });

      const fallback = vi.fn().mockReturnValue('fallback-value');
      const fn = vi.fn().mockImplementation(() => { throw new Error('failure'); });

      const result = await retryPolicy.execute(() => cb.execute(fn, fallback));
      expect(result).toBe('fallback-value');
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should return fallback on circuit open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      // Open the circuit
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      const result = await cb.execute(
        () => { throw new Error('should not run'); },
        () => 'fallback-value'
      );

      expect(result).toBe('fallback-value');
    });

    it('should try primary function before fallback in half-open', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        halfOpenAttempts: 1,
        resetTimeout: 100,
      });

      // Open the circuit
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      // Transition to half-open
      vi.advanceTimersByTime(100);
      expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

      // In half-open, primary should be tried first
      const result = await cb.execute(
        () => 'recovered',
        () => 'fallback'
      );

      expect(result).toBe('recovered');
    });

    it('should chain multiple fallback strategies', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      // Open the circuit
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      const result = await cb.execute(
        () => { throw new Error('fail'); },
        async () => {
          return 'final-fallback';
        }
      );

      expect(result).toBe('final-fallback');
    });

    it('should handle async fallback functions', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      const result = await cb.execute(
        () => { throw new Error('fail'); },
        async () => {
          return 'async-fallback';
        }
      );

      expect(result).toBe('async-fallback');
    });
  });

  describe('State Transitions', () => {
    it('should transition Closed → Open on failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, timeout: 5000 });

      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(() => { throw new Error('fail'); });
        } catch {}
      }

      expect(cb.getState()).toBe(CircuitBreakerState.Open);
    });

    it('should transition Open → HalfOpen after reset timeout', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1000, timeout: 5000 });

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      expect(cb.getState()).toBe(CircuitBreakerState.Open);

      vi.advanceTimersByTime(1000);

      expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);
    });

    it('should transition HalfOpen → Closed on success threshold', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        halfOpenAttempts: 2,
        resetTimeout: 100,
        timeout: 5000,
      });

      // Open the circuit
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      // Transition to half-open
      vi.advanceTimersByTime(100);
      expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

      // Two successes should close
      await cb.execute(() => 'ok1');
      await cb.execute(() => 'ok2');

      expect(cb.getState()).toBe(CircuitBreakerState.Closed);
    });

    it('should transition HalfOpen → Open on failure', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
        timeout: 5000,
      });

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      vi.advanceTimersByTime(100);
      expect(cb.getState()).toBe(CircuitBreakerState.HalfOpen);

      try {
        await cb.execute(() => { throw new Error('fail again'); });
      } catch {}

      expect(cb.getState()).toBe(CircuitBreakerState.Open);
    });

    it('should emit state change events during transitions', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 100, timeout: 5000 });
      const stateChanges: any[] = [];
      cb.on('stateChange', (change) => stateChanges.push(change));

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      vi.advanceTimersByTime(100);

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      expect(stateChanges.length).toBeGreaterThanOrEqual(2);
      expect(stateChanges[0].from).toBe(CircuitBreakerState.Closed);
      expect(stateChanges[0].to).toBe(CircuitBreakerState.Open);
    });

    it('should reset to closed state manually', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}
      expect(cb.getState()).toBe(CircuitBreakerState.Open);

      cb.reset();
      expect(cb.getState()).toBe(CircuitBreakerState.Closed);
      expect(cb.stats.failures).toBe(0);
    });
  });

  describe('Retry Strategies with Circuit Breaker', () => {
    it('should apply fixed backoff during retries', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, timeout: 5000 });

      const retryPolicy = new RetryPolicy({
        maxAttempts: 3,
        delay: 50,
        backoff: 'fixed',
      });

      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) throw new Error('fail');
        return 'success';
      });

      const executePromise = retryPolicy.execute(() => cb.execute(fn));

      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);

      const result = await executePromise;
      expect(result).toBe('success');
    });

    it('should stop retrying on non-retryable errors', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 10, timeout: 5000 });

      const retryPolicy = new RetryPolicy({
        maxAttempts: 5,
        delay: 10,
        retryOn: (error) => error.message !== 'non-retryable',
      });

      let callCount = 0;
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        throw new Error('non-retryable');
      });

      try {
        await retryPolicy.execute(() => cb.execute(fn));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('non-retryable');
      }

      expect(callCount).toBe(1);
    });

    it('should track failure and success events', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 10, timeout: 5000 });
      const failures: any[] = [];
      const successes: any[] = [];

      cb.on('failure', (f) => failures.push(f));
      cb.on('success', (s) => successes.push(s));

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      await cb.execute(() => 'ok');

      expect(failures).toHaveLength(1);
      expect(successes).toHaveLength(1);
    });

    it('should handle timeout in circuit breaker with retry', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, timeout: 50 });

      const retryPolicy = new RetryPolicy({
        maxAttempts: 2,
        delay: 10,
        retryOn: (error) => error instanceof CircuitBreakerTimeoutError,
      });

      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return new Promise(r => setTimeout(r, 100));
        }
        return 'fast-success';
      });

      const executePromise = retryPolicy.execute(() => cb.execute(fn));

      // First attempt will timeout
      await vi.advanceTimersByTimeAsync(50);
      // Second attempt
      await vi.advanceTimersByTimeAsync(10);

      const result = await executePromise;
      expect(result).toBe('fast-success');
    });
  });

  describe('Concurrent Circuit Breaker Operations', () => {
    it('should handle concurrent requests with circuit breaker', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5, timeout: 5000 });
      let activeCount = 0;
      let maxActive = 0;

      const fn = async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        activeCount--;
        return 'ok';
      };

      const promises = Array.from({ length: 10 }, () => cb.execute(fn));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every(r => r === 'ok')).toBe(true);
      expect(maxActive).toBeGreaterThan(0);
    });

    it('should reject concurrent requests when circuit is open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });

      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch {}

      const promises = Array.from({ length: 5 }, () =>
        cb.execute(
          () => { throw new Error('should not run'); },
          () => 'fallback'
        )
      );

      const results = await Promise.all(promises);
      expect(results.every(r => r === 'fallback')).toBe(true);
    });
  });
});
