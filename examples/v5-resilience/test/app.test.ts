import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Bulkhead,
  createBulkhead,
  BulkheadState,
  TimeoutBudget,
  createTimeoutBudget,
  Deadline,
  FaultInjectionEngine,
  createFaultInjectionEngine,
  FaultScenarios,
  FaultType,
  SmartRetryEngine,
  createSmartRetryEngine,
  RetryStrategy,
  bulkheadRegistry,
} from '@faultless/resilience';
import { CircuitBreaker, createCircuitBreaker } from '@faultless/breaker';

describe('v5-resilience example', () => {
  describe('Bulkhead', () => {
    let bulkhead: Bulkhead;

    beforeEach(() => {
      bulkhead = createBulkhead({
        name: 'test-bulkhead',
        maxConcurrent: 3,
        maxQueued: 2,
        timeoutMs: 1000,
        queueTimeoutMs: 500,
      });
    });

    afterEach(() => {
      bulkhead.close();
    });

    it('should execute when capacity available', async () => {
      const result = await bulkhead.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should reject when full and no queue space', async () => {
      // Fill up
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(bulkhead.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return i;
        }));
      }

      // Wait a bit for queue to fill
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should reject
      await expect(bulkhead.execute(async () => 'fail')).rejects.toThrow('Bulkhead full');
    });

    it('should track state', () => {
      const state = bulkhead.getState();
      expect(state.state).toBe(BulkheadState.CLOSED);
      expect(state.running).toBe(0);
      expect(state.queued).toBe(0);
      expect(state.maxConcurrent).toBe(3);
      expect(state.maxQueued).toBe(2);
    });

    it('should report degraded state', async () => {
      const degradedBulkhead = createBulkhead({
        name: 'degraded-test',
        maxConcurrent: 10,
        degradationThreshold: 50,
      });

      // Start 5 long-running tasks (50% load)
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(degradedBulkhead.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return i;
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const state = degradedBulkhead.getState();
      expect(state.state).toBe(BulkheadState.DEGRADED);

      degradedBulkhead.close();
    });

    it('should report open state when full', async () => {
      const fullBulkhead = createBulkhead({
        name: 'full-test',
        maxConcurrent: 2,
        maxQueued: 0,
      });

      // Fill up
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 2; i++) {
        promises.push(fullBulkhead.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return i;
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = fullBulkhead.getState();
      expect(state.state).toBe(BulkheadState.OPEN);

      fullBulkhead.close();
    });

    it('should process queue in order', async () => {
      const orderBulkhead = createBulkhead({
        name: 'order-test',
        maxConcurrent: 1,
        maxQueued: 3,
      });

      const results: number[] = [];

      // Fill up
      const p1 = orderBulkhead.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(1);
        return 1;
      });

      // Queue
      const p2 = orderBulkhead.execute(async () => {
        results.push(2);
        return 2;
      });

      const p3 = orderBulkhead.execute(async () => {
        results.push(3);
        return 3;
      });

      await Promise.all([p1, p2, p3]);

      expect(results).toEqual([1, 2, 3]);

      orderBulkhead.close();
    });
  });

  describe('Timeout Budget', () => {
    it('should create deadline with timeout', () => {
      const deadline = Deadline.fromHeaders({}, 5000);
      // fromHeaders applies a 50ms buffer
      expect(deadline.timeoutMs).toBe(4950);
      expect(deadline.remainingMs).toBeGreaterThan(0);
      expect(deadline.isExpired).toBe(false);
    });

    it('should propagate via headers', () => {
      const deadline = Deadline.fromHeaders({}, 5000);
      const headers = deadline.toHeaders();

      // The timeout includes the 50ms buffer
      expect(headers['x-nofault-deadline']).toBe('4950');
      expect(headers['x-nofault-deadline-id']).toBeDefined();
      expect(headers['x-nofault-deadline-remaining']).toBeDefined();
    });

    it('should create downstream deadline', () => {
      const parent = Deadline.fromHeaders({}, 5000);
      const downstream = parent.createDownstream({ bufferMs: 100 });

      expect(downstream.timeoutMs).toBeLessThan(parent.timeoutMs);
      expect(downstream.cascadeCount).toBeGreaterThanOrEqual(1);
    });

    it('should track budget', () => {
      const budget = createTimeoutBudget();
      const d1 = budget.create({ timeoutMs: 5000 });
      const d2 = budget.create({ timeoutMs: 3000 });

      expect(budget.getRemainingBudget()).toBe(3000);
    });
  });

  describe('Fault Injection', () => {
    let engine: FaultInjectionEngine;

    beforeEach(() => {
      engine = createFaultInjectionEngine();
    });

    it('should register and inject faults', async () => {
      engine.register('test-latency', FaultScenarios.latency500ms());

      const fault = await engine.shouldInject({
        path: '/test',
        method: 'GET',
        headers: {},
      });

      expect(fault).toBeDefined();
      expect(fault?.type).toBe(FaultType.LATENCY);
    });

    it('should apply latency fault', async () => {
      engine.register('test-latency', FaultScenarios.latency500ms());

      const fault = await engine.shouldInject({
        path: '/test',
        method: 'GET',
        headers: {},
      });

      const start = Date.now();
      await engine.applyFault(fault!, {}, {}, async () => {});
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(450);
    });

    it('should apply error fault', async () => {
      engine.register('test-error', FaultScenarios.errorOnApi());

      const fault = await engine.shouldInject({
        path: '/api/users',
        method: 'GET',
        headers: {},
      });

      expect(fault).toBeDefined();
      expect(fault?.type).toBe(FaultType.ERROR);
    });

    it('should respect percentage', async () => {
      engine.register('test-10-percent', {
        type: FaultType.LATENCY,
        condition: { percentage: 10 },
        config: { latencyMs: 100 },
      });

      let injectionCount = 0;
      for (let i = 0; i < 100; i++) {
        const fault = await engine.shouldInject({
          path: '/test',
          method: 'GET',
          headers: {},
        });
        if (fault) injectionCount++;
      }

      expect(injectionCount).toBeLessThan(30);
    });

    it('should track statistics', async () => {
      engine.register('stat-test', FaultScenarios.latency500ms());

      await engine.shouldInject({ path: '/test', method: 'GET', headers: {} });
      await engine.shouldInject({ path: '/test', method: 'GET', headers: {} });

      const stats = engine.getStats();
      expect(stats.totalFaults).toBe(1);
      expect(stats.totalInjections).toBe(2);
    });
  });

  describe('Smart Retry', () => {
    let engine: SmartRetryEngine;
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      engine = createSmartRetryEngine({
        strategy: RetryStrategy.EXPONENTIAL,
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });

      circuitBreaker = createCircuitBreaker({
        name: 'test-cb',
        threshold: 5,
        resetTimeout: 1000,
      });
    });

    it('should succeed on first try', async () => {
      const result = await engine.execute(
        async () => 'success',
        { path: '/test', method: 'GET' }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toHaveLength(0);
    });

    it('should retry on transient errors', async () => {
      let attempts = 0;
      const result = await engine.execute(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('ECONNRESET');
          }
          return 'success';
        },
        { path: '/test', method: 'GET' }
      );

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
      expect(result.attempts).toHaveLength(2);
    });

    it('should fail after max retries', async () => {
      const result = await engine.execute(
        async () => {
          throw new Error('ECONNRESET');
        },
        { path: '/test', method: 'GET' }
      );

      expect(result.success).toBe(false);
      // attempts includes all attempts (0, 1, 2, 3) = 4 total
      expect(result.attempts).toHaveLength(4);
    });

    it('should respect circuit breaker', async () => {
      // Force the circuit breaker open
      circuitBreaker.forceOpen();

      const result = await engine.execute(
        async () => 'should not execute',
        {
          path: '/test',
          method: 'GET',
          circuitBreaker,
        }
      );

      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
    });

    it('should use per-endpoint policy', async () => {
      engine.registerEndpoint({
        path: '/api/critical',
        policy: {
          strategy: RetryStrategy.FIXED,
          maxRetries: 5,
          initialDelayMs: 10,
          maxDelayMs: 100,
        },
      });

      let attempts = 0;
      const result = await engine.execute(
        async () => {
          attempts++;
          throw new Error('ECONNRESET');
        },
        { path: '/api/critical', method: 'GET' }
      );

      // maxRetries: 5 means attempts 0,1,2,3,4,5 = 6 total
      expect(attempts).toBe(6);
      // attempts array includes all attempts
      expect(result.attempts).toHaveLength(6);
    });
  });

  describe('Bulkhead Registry', () => {
    it('should create and manage bulkheads', () => {
      const bh = bulkheadRegistry.getOrCreate('registry-test', {
        maxConcurrent: 5,
      });

      expect(bh.name).toBe('registry-test');
      expect(bulkheadRegistry.get('registry-test')).toBe(bh);
    });

    it('should get all states', () => {
      bulkheadRegistry.getOrCreate('state-test-1', { maxConcurrent: 1 });
      bulkheadRegistry.getOrCreate('state-test-2', { maxConcurrent: 2 });

      const states = bulkheadRegistry.getAllStates();
      expect(states['state-test-1']).toBeDefined();
      expect(states['state-test-2']).toBeDefined();
    });

    it('should remove bulkhead', () => {
      bulkheadRegistry.getOrCreate('remove-test');
      expect(bulkheadRegistry.get('remove-test')).toBeDefined();

      bulkheadRegistry.remove('remove-test');
      expect(bulkheadRegistry.get('remove-test')).toBeUndefined();
    });
  });
});