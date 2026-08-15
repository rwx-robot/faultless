import { bench, describe } from 'vitest';
import { CircuitBreaker, CircuitBreakerState } from '@faultless/breaker';
import { RateLimiter } from '@faultless/limit';
import { CacheManager, CacheProvider } from '@faultless/cache';
import { Bulkhead } from '@faultless/resilience';
import { Deadline, TimeoutBudget, DeadlineSource } from '@faultless/resilience';

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

describe('CircuitBreaker: execute (success, closed)', () => {
  bench('successful operation', async () => {
    const cb = new CircuitBreaker({ name: 'bench-cb', threshold: 5, resetTimeout: 60000 });
    await cb.execute(async () => 42);
  });
});

describe('CircuitBreaker: execute (failure → open)', () => {
  bench('threshold failures → OPEN', async () => {
    const cb = new CircuitBreaker({ name: 'bench-cb-fail', threshold: 3, resetTimeout: 60000 });
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error('fail');
        });
      } catch {}
    }
  });
});

describe('CircuitBreaker: getState', () => {
  bench('getState (closed)', () => {
    const cb = new CircuitBreaker({ name: 'bench-state', threshold: 5, resetTimeout: 60000 });
    cb.getState();
  });
});

describe('CircuitBreaker: getStats', () => {
  bench('getStats', () => {
    const cb = new CircuitBreaker({ name: 'bench-stats', threshold: 5, resetTimeout: 60000 });
    cb.getStats();
  });
});

describe('CircuitBreaker: reset', () => {
  bench('reset after failures', async () => {
    const cb = new CircuitBreaker({ name: 'bench-reset', threshold: 2, resetTimeout: 60000 });
    try {
      await cb.execute(async () => { throw new Error('fail'); });
    } catch {}
    try {
      await cb.execute(async () => { throw new Error('fail'); });
    } catch {}
    cb.reset();
  });
});

// ─── Rate Limiter ────────────────────────────────────────────────────────────

describe('RateLimiter: consume (under limit)', () => {
  bench('single consume', async () => {
    const rl = new RateLimiter({ name: 'bench-rl', windowMs: 60000, max: 1000 });
    await rl.consume('user:1');
  });
});

describe('RateLimiter: consume (burst)', () => {
  bench('100 consumes under limit', async () => {
    const rl = new RateLimiter({ name: 'bench-rl-burst', windowMs: 60000, max: 1000 });
    for (let i = 0; i < 100; i++) {
      await rl.consume('user:1');
    }
  });
});

describe('RateLimiter: get', () => {
  bench('get current status', async () => {
    const rl = new RateLimiter({ name: 'bench-rl-get', windowMs: 60000, max: 100 });
    await rl.consume('user:1');
    await rl.get('user:1');
  });
});

describe('RateLimiter: reset', () => {
  bench('reset after consume', async () => {
    const rl = new RateLimiter({ name: 'bench-rl-reset', windowMs: 60000, max: 100 });
    await rl.consume('user:1');
    await rl.reset('user:1');
  });
});

// ─── Cache Manager ───────────────────────────────────────────────────────────

describe('CacheManager: set + get (hit)', () => {
  bench('set then get', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.set('key', { data: 'value' });
    await cache.get('key');
  });
});

describe('CacheManager: get (miss)', () => {
  bench('get non-existent key', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.get('nonexistent');
  });
});

describe('CacheManager: getOrSet', () => {
  bench('getOrSet (miss → factory)', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.getOrSet('key', async () => ({ computed: true }));
  });

  bench('getOrSet (hit → skip factory)', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.set('key', { data: 'cached' });
    await cache.getOrSet('key', async () => { throw new Error('should not run'); });
  });
});

describe('CacheManager: mset + mget', () => {
  bench('mset 10 keys', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    const entries = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      value: { i },
    }));
    await cache.mset(entries);
  });

  bench('mget 10 keys (all hit)', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    for (let i = 0; i < 10; i++) {
      await cache.set(`k${i}`, { i });
    }
    await cache.mget(Array.from({ length: 10 }, (_, i) => `k${i}`));
  });
});

describe('CacheManager: delete', () => {
  bench('delete existing key', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.set('key', 'value');
    await cache.delete('key');
  });
});

describe('CacheManager: has', () => {
  bench('has (hit)', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.set('key', 'value');
    await cache.has('key');
  });

  bench('has (miss)', async () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    await cache.has('missing');
  });
});

describe('CacheManager: getStats', () => {
  bench('getStats', () => {
    const cache = new CacheManager({ provider: CacheProvider.MEMORY, ttl: 60000 });
    cache.getStats();
  });
});

// ─── Bulkhead ────────────────────────────────────────────────────────────────

describe('Bulkhead: execute (under limit)', () => {
  bench('single execute', async () => {
    const bh = new Bulkhead({ name: 'bench-bh', maxConcurrent: 10 });
    await bh.execute(async () => 42);
  });
});

describe('Bulkhead: execute (parallel within limit)', () => {
  bench('5 parallel (limit=10)', async () => {
    const bh = new Bulkhead({ name: 'bench-bh-par', maxConcurrent: 10 });
    await Promise.all(
      Array.from({ length: 5 }, () => bh.execute(async () => 42)),
    );
  });
});

describe('Bulkhead: getState', () => {
  bench('getState', () => {
    const bh = new Bulkhead({ name: 'bench-bh-state', maxConcurrent: 10 });
    bh.getState();
  });
});

// ─── Deadline / Timeout Budget ───────────────────────────────────────────────

describe('Deadline: creation', () => {
  bench('create deadline (5s)', () => {
    new Deadline({ timeoutMs: 5000 });
  });
});

describe('Deadline: remainingMs', () => {
  bench('check remaining', () => {
    const d = new Deadline({ timeoutMs: 5000 });
    d.remainingMs;
  });
});

describe('Deadline: isExpired', () => {
  bench('check expiry (not expired)', () => {
    const d = new Deadline({ timeoutMs: 50000 });
    d.isExpired;
  });
});

describe('Deadline: toHeaders', () => {
  bench('serialize to headers', () => {
    const d = new Deadline({ timeoutMs: 5000 });
    d.toHeaders();
  });
});

describe('Deadline: fromHeaders', () => {
  bench('parse from headers', () => {
    Deadline.fromHeaders({
      'x-Faultless-deadline': '5000',
      'x-Faultless-deadline-id': 'deadline-1',
      'x-Faultless-deadline-remaining': '4500',
      'x-Faultless-deadline-source': 'CLIENT',
      'x-Faultless-deadline-cascade': '0',
    });
  });
});

describe('Deadline: createDownstream', () => {
  bench('create downstream deadline', () => {
    const parent = new Deadline({ timeoutMs: 5000 });
    parent.createDownstream({ bufferMs: 100 });
  });
});

describe('Deadline: race', () => {
  bench('race with fast promise', async () => {
    const d = new Deadline({ timeoutMs: 5000 });
    await d.race(Promise.resolve(42));
  });
});

describe('TimeoutBudget: create', () => {
  bench('create deadline via budget', () => {
    const budget = new TimeoutBudget();
    budget.create({ timeoutMs: 5000 });
  });
});

describe('TimeoutBudget: getRemainingBudget', () => {
  bench('get remaining budget', () => {
    const budget = new TimeoutBudget();
    budget.create({ timeoutMs: 5000 });
    budget.getRemainingBudget();
  });
});

describe('TimeoutBudget: isExhausted', () => {
  bench('check if exhausted (not exhausted)', () => {
    const budget = new TimeoutBudget();
    budget.create({ timeoutMs: 50000 });
    budget.isExhausted();
  });
});

describe('TimeoutBudget: cleanup', () => {
  bench('cleanup expired deadlines', () => {
    const budget = new TimeoutBudget();
    budget.create({ timeoutMs: 1 }); // immediate expire
    budget.cleanup();
  });
});
