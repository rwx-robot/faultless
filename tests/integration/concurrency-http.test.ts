import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, HttpServer } from '@faultless/http';
import {
  Once,
  Semaphore,
  Mutex,
  AtomicCounter,
  ConcurrentMap,
} from '@faultless/concurrency';

describe('Concurrency + HTTP Integration', () => {
  let server: HttpServer;

  beforeEach(() => {
    server = createServer({ port: 0, logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Concurrent Request Handling with Semaphore', () => {
    it('should limit concurrent request processing', async () => {
      const semaphore = new Semaphore(2);
      let activeRequests = 0;
      let maxActive = 0;

      server.addRoute({
        method: 'GET',
        url: '/limited',
        handler: async (request, reply) => {
          await semaphore.acquire();
          activeRequests++;
          maxActive = Math.max(maxActive, activeRequests);

          await new Promise(r => setTimeout(r, 50));

          activeRequests--;
          semaphore.release();

          reply.send({ active: activeRequests, max: maxActive });
        },
      });

      await server.ready();

      // Fire 6 concurrent requests through 2 slots
      const promises = Array.from({ length: 6 }, () =>
        server.getApp().inject({ method: 'GET', url: '/limited' })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Max concurrent should not exceed 2
      expect(maxActive).toBeLessThanOrEqual(2);
    });

    it('should handle burst traffic with semaphore', async () => {
      const semaphore = new Semaphore(3);
      const processed: number[] = [];
      let counter = 0;

      server.addRoute({
        method: 'GET',
        url: '/burst',
        handler: async (request, reply) => {
          await semaphore.acquire();
          counter++;
          const id = counter;
          processed.push(id);
          await new Promise(r => setTimeout(r, 10));
          semaphore.release();
          reply.send({ id });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 10 }, () =>
        server.getApp().inject({ method: 'GET', url: '/burst' })
      );

      await Promise.all(promises);

      expect(processed).toHaveLength(10);
      // All 10 should have been processed
      expect(new Set(processed).size).toBe(10);
    });

    it('should track semaphore state during requests', async () => {
      const semaphore = new Semaphore(2);

      server.addRoute({
        method: 'GET',
        url: '/sem-state',
        handler: async (request, reply) => {
          reply.send({
            active: semaphore.active,
            waiting: semaphore.waiting,
          });
        },
      });

      await server.ready();

      const response = await server.getApp().inject({ method: 'GET', url: '/sem-state' });
      const body = JSON.parse(response.payload);

      expect(body.active).toBe(0);
      expect(body.waiting).toBe(0);
    });

    it('should queue requests when semaphore is full', async () => {
      const semaphore = new Semaphore(1);
      const order: number[] = [];
      let counter = 0;

      server.addRoute({
        method: 'GET',
        url: '/queue',
        handler: async (request, reply) => {
          await semaphore.acquire();
          counter++;
          const id = counter;
          await new Promise(r => setTimeout(r, 20));
          order.push(id);
          semaphore.release();
          reply.send({ id, order: [...order] });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 3 }, () =>
        server.getApp().inject({ method: 'GET', url: '/queue' })
      );

      await Promise.all(promises);

      // Processing order should be sequential
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Mutex for Shared Resource Access', () => {
    it('should ensure mutual exclusion on shared counter', async () => {
      const mutex = new Mutex();
      let counter = 0;

      server.addRoute({
        method: 'POST',
        url: '/increment',
        handler: async (request, reply) => {
          const release = await mutex.acquire();
          try {
            const current = counter;
            await new Promise(r => setTimeout(r, 5));
            counter = current + 1;
            reply.send({ counter });
          } finally {
            release();
          }
        },
      });

      server.addRoute({
        method: 'GET',
        url: '/counter',
        handler: async (request, reply) => {
          reply.send({ counter });
        },
      });

      await server.ready();

      // Fire 5 concurrent increment requests
      const promises = Array.from({ length: 5 }, () =>
        server.getApp().inject({ method: 'POST', url: '/increment' })
      );

      await Promise.all(promises);

      const response = await server.getApp().inject({ method: 'GET', url: '/counter' });
      const body = JSON.parse(response.payload);

      expect(body.counter).toBe(5);
    });

    it('should serialize write operations on shared state', async () => {
      const mutex = new Mutex();
      const writes: string[] = [];

      server.addRoute({
        method: 'POST',
        url: '/write',
        handler: async (request, reply) => {
          const body = request.body as any;
          const release = await mutex.acquire();
          try {
            writes.push(body.value);
            await new Promise(r => setTimeout(r, 10));
          } finally {
            release();
          }
          reply.send({ writes: [...writes] });
        },
      });

      await server.ready();

      const promises = [
        server.getApp().inject({ method: 'POST', url: '/write', payload: { value: 'a' } }),
        server.getApp().inject({ method: 'POST', url: '/write', payload: { value: 'b' } }),
        server.getApp().inject({ method: 'POST', url: '/write', payload: { value: 'c' } }),
      ];

      await Promise.all(promises);

      // Writes should happen sequentially
      expect(writes).toEqual(['a', 'b', 'c']);
    });

    it('should handle mutex.run helper', async () => {
      const mutex = new Mutex();
      let counter = 0;

      server.addRoute({
        method: 'POST',
        url: '/mutex-run',
        handler: async (request, reply) => {
          await mutex.run(async () => {
            const current = counter;
            await new Promise(r => setTimeout(r, 5));
            counter = current + 1;
          });
          reply.send({ counter });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 3 }, () =>
        server.getApp().inject({ method: 'POST', url: '/mutex-run' })
      );

      await Promise.all(promises);

      const response = await server.getApp().inject({ method: 'GET', url: '/mutex-run' });
    });

    it('should report lock state correctly', async () => {
      const mutex = new Mutex();

      expect(mutex.isLocked).toBe(false);
      expect(mutex.waiting).toBe(0);

      const release = await mutex.acquire();
      expect(mutex.isLocked).toBe(true);

      // Start a waiter
      const waiterPromise = mutex.acquire();
      expect(mutex.waiting).toBe(1);

      release();
      await waiterPromise;
      mutex.release();

      expect(mutex.isLocked).toBe(false);
    });
  });

  describe('Once for Initialization', () => {
    it('should initialize database connection only once', async () => {
      const once = new Once();
      let initCount = 0;

      server.addRoute({
        method: 'GET',
        url: '/data',
        handler: async (request, reply) => {
          await once.run(async () => {
            initCount++;
            await new Promise(r => setTimeout(r, 10));
          });

          reply.send({ initCount, initialized: once.isDone });
        },
      });

      await server.ready();

      // Fire 5 concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        server.getApp().inject({ method: 'GET', url: '/data' })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        const body = JSON.parse(response.payload);
        expect(body.initCount).toBe(1);
        expect(body.initialized).toBe(true);
      });
    });

    it('should handle concurrent initialization safely', async () => {
      const once = new Once();
      const results: number[] = [];

      server.addRoute({
        method: 'GET',
        url: '/concurrent-init',
        handler: async (request, reply) => {
          await once.run(async () => {
            await new Promise(r => setTimeout(r, 20));
            results.push(1);
          });
          reply.send({ done: once.isDone, resultCount: results.length });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 4 }, () =>
        server.getApp().inject({ method: 'GET', url: '/concurrent-init' })
      );

      await Promise.all(promises);

      expect(results).toHaveLength(1);
    });

    it('should allow re-initialization after reset', async () => {
      const once = new Once();
      let count = 0;

      server.addRoute({
        method: 'POST',
        url: '/reinit',
        handler: async (request, reply) => {
          const body = request.body as any;
          if (body.reset) {
            once.reset();
          }
          await once.run(() => { count++; });
          reply.send({ count, isDone: once.isDone });
        },
      });

      await server.ready();

      // Initialize
      const response1 = await server.getApp().inject({
        method: 'POST',
        url: '/reinit',
        payload: { reset: false },
      });
      expect(JSON.parse(response1.payload).count).toBe(1);

      // Reset and reinitialize
      const response2 = await server.getApp().inject({
        method: 'POST',
        url: '/reinit',
        payload: { reset: true },
      });
      expect(JSON.parse(response2.payload).count).toBe(2);
    });
  });

  describe('ConcurrentMap for Request Cache', () => {
    it('should cache computed results per request key', async () => {
      const cache = new ConcurrentMap<string, { data: string; computedAt: number }>();
      let computeCount = 0;

      server.addRoute({
        method: 'GET',
        url: '/compute/:id',
        handler: async (request, reply) => {
          const id = (request.params as any).id;
          const result = await cache.load(id, async () => {
            computeCount++;
            await new Promise(r => setTimeout(r, 10));
            return { data: `result-${id}`, computedAt: Date.now() };
          });
          reply.send(result);
        },
      });

      await server.ready();

      // First request computes
      const response1 = await server.getApp().inject({ method: 'GET', url: '/compute/1' });
      expect(response1.statusCode).toBe(200);
      expect(computeCount).toBe(1);

      // Second request with same key uses cache
      const response2 = await server.getApp().inject({ method: 'GET', url: '/compute/1' });
      expect(response2.statusCode).toBe(200);
      expect(computeCount).toBe(1);

      // Different key computes new
      const response3 = await server.getApp().inject({ method: 'GET', url: '/compute/2' });
      expect(response3.statusCode).toBe(200);
      expect(computeCount).toBe(2);
    });

    it('should prevent duplicate computation for same key', async () => {
      const cache = new ConcurrentMap<string, number>();
      let computeCount = 0;

      // Simulate concurrent loads for the same key
      const promises = Array.from({ length: 5 }, () =>
        cache.load('same-key', async () => {
          computeCount++;
          await new Promise(r => setTimeout(r, 50));
          return 42;
        })
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r === 42)).toBe(true);
      expect(computeCount).toBe(1);
    });

    it('should handle concurrent requests with different keys', async () => {
      const cache = new ConcurrentMap<string, number>();
      const results = new Map<string, number>();

      server.addRoute({
        method: 'GET',
        url: '/cached/:id',
        handler: async (request, reply) => {
          const id = (request.params as any).id;
          const value = await cache.load(id, async () => {
            return Number(id) * 10;
          });
          reply.send({ id, value });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 5 }, (_, i) =>
        server.getApp().inject({ method: 'GET', url: `/cached/${i + 1}` })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, i) => {
        const body = JSON.parse(response.payload);
        expect(body.value).toBe((i + 1) * 10);
      });
    });
  });

  describe('AtomicCounter for Request Counting', () => {
    it('should count concurrent requests atomically', async () => {
      const counter = new AtomicCounter(0);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      server.addRoute({
        method: 'GET',
        url: '/counted',
        handler: async (request, reply) => {
          counter.inc();
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          await new Promise(r => setTimeout(r, 20));

          currentConcurrent--;
          counter.dec();

          reply.send({
            total: counter.value,
            maxConcurrent,
          });
        },
      });

      await server.ready();

      const promises = Array.from({ length: 5 }, () =>
        server.getApp().inject({ method: 'GET', url: '/counted' })
      );

      await Promise.all(promises);

      // After all requests complete, counter should be 0
      expect(counter.value).toBe(0);
    });

    it('should track request statistics', async () => {
      const requestCount = new AtomicCounter(0);
      const errorCount = new AtomicCounter(0);

      server.addRoute({
        method: 'GET',
        url: '/stats',
        handler: async (request, reply) => {
          requestCount.inc();
          reply.send({
            requests: requestCount.value,
            errors: errorCount.value,
          });
        },
      });

      server.addRoute({
        method: 'GET',
        url: '/error',
        handler: async (request, reply) => {
          errorCount.inc();
          reply.status(500).send({ error: true });
        },
      });

      await server.ready();

      await server.getApp().inject({ method: 'GET', url: '/stats' });
      await server.getApp().inject({ method: 'GET', url: '/stats' });
      await server.getApp().inject({ method: 'GET', url: '/error' });
      const response = await server.getApp().inject({ method: 'GET', url: '/stats' });

      const body = JSON.parse(response.payload);
      expect(body.requests).toBe(3);
      expect(body.errors).toBe(1);
    });

    it('should support compare and swap for optimistic updates', async () => {
      const counter = new AtomicCounter(10);

      server.addRoute({
        method: 'POST',
        url: '/cas',
        handler: async (request, reply) => {
          const body = request.body as any;
          const success = counter.compareAndSwap(body.expected, body.update);
          reply.send({ success, value: counter.value });
        },
      });

      await server.ready();

      // Successful CAS
      const response1 = await server.getApp().inject({
        method: 'POST',
        url: '/cas',
        payload: { expected: 10, update: 20 },
      });
      expect(JSON.parse(response1.payload).success).toBe(true);
      expect(JSON.parse(response1.payload).value).toBe(20);

      // Failed CAS
      const response2 = await server.getApp().inject({
        method: 'POST',
        url: '/cas',
        payload: { expected: 10, update: 30 },
      });
      expect(JSON.parse(response2.payload).success).toBe(false);
      expect(JSON.parse(response2.payload).value).toBe(20);
    });
  });

  describe('Combined Concurrency Patterns', () => {
    it('should use Semaphore + Mutex together for rate-limited exclusive access', async () => {
      const semaphore = new Semaphore(2);
      const mutex = new Mutex();
      let exclusiveCounter = 0;

      server.addRoute({
        method: 'POST',
        url: '/exclusive-limited',
        handler: async (request, reply) => {
          await semaphore.acquire();
          try {
            await mutex.run(async () => {
              const current = exclusiveCounter;
              await new Promise(r => setTimeout(r, 5));
              exclusiveCounter = current + 1;
            });
            reply.send({ counter: exclusiveCounter });
          } finally {
            semaphore.release();
          }
        },
      });

      await server.ready();

      const promises = Array.from({ length: 6 }, () =>
        server.getApp().inject({ method: 'POST', url: '/exclusive-limited' })
      );

      await Promise.all(promises);

      expect(exclusiveCounter).toBe(6);
    });

    it('should use Once for lazy initialization with Semaphore for access control', async () => {
      const initOnce = new Once();
      const accessSemaphore = new Semaphore(3);

      server.addRoute({
        method: 'GET',
        url: '/lazy-init',
        handler: async (request, reply) => {
          await initOnce.run(async () => {
            await new Promise(r => setTimeout(r, 10));
          });

          await accessSemaphore.acquire();
          try {
            reply.send({ initialized: true, active: accessSemaphore.active });
          } finally {
            accessSemaphore.release();
          }
        },
      });

      await server.ready();

      const promises = Array.from({ length: 5 }, () =>
        server.getApp().inject({ method: 'GET', url: '/lazy-init' })
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).initialized).toBe(true);
      });
    });
  });
});
