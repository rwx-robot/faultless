import { bench, describe } from 'vitest';
import { Once, Semaphore as Limit, ConcurrentMap as Map, AtomicCounter as Atomic } from '@faultless/concurrency';

// ─── Once ────────────────────────────────────────────────────────────────────

describe('Once: do (first call)', () => {
  bench('synchronous function', async () => {
    const once = new Once();
    await once.do(() => {});
  });

  bench('async function', async () => {
    const once = new Once();
    await once.do(async () => {});
  });
});

describe('Once: do (already done)', () => {
  bench('skip when already executed', async () => {
    const once = new Once();
    await once.do(() => {});
    await once.do(() => {}); // no-op
  });
});

describe('Once: isDone', () => {
  bench('check after execution', () => {
    const once = new Once();
    once.do(() => {});
    once.isDone();
  });
});

// ─── Limit (Semaphore) ──────────────────────────────────────────────────────

describe('Limit: acquire/release (under limit)', () => {
  bench('acquire + release (capacity=10)', async () => {
    const limit = new Limit(10);
    await limit.acquire();
    limit.release();
  });
});

describe('Limit: guard (under limit)', () => {
  bench('guard with sync fn', async () => {
    const limit = new Limit(10);
    await limit.guard(() => 42);
  });
});

describe('Limit: guard (at capacity, queued)', () => {
  bench('guard with queue pressure', async () => {
    const limit = new Limit(1);
    await limit.guard(async () => {
      // Parallel call will queue
      const p = limit.guard(() => 1);
      limit.release(); // but we release in guard's finally
      await p;
    });
  });
});

// ─── Map ─────────────────────────────────────────────────────────────────────

describe('Map: set + get', () => {
  bench('set and get (string key)', () => {
    const map = new Map<string, number>();
    map.set('key', 42);
    map.get('key');
  });

  bench('set and get (number key)', () => {
    const map = new Map<number, string>();
    map.set(123, 'value');
    map.get(123);
  });
});

describe('Map: load (cached)', () => {
  bench('load with existing key', async () => {
    const map = new Map<string, number>();
    map.set('cached', 99);
    await map.load('cached', () => 42);
  });
});

describe('Map: load (miss → loader)', () => {
  bench('load with miss (loader called)', async () => {
    const map = new Map<string, number>();
    await map.load('new', () => 42);
  });
});

describe('Map: has + delete + size', () => {
  const map = new Map<string, number>();
  for (let i = 0; i < 100; i++) {
    map.set(`k${i}`, i);
  }

  bench('has check', () => {
    map.has('k50');
  });

  bench('delete', () => {
    map.delete('k50');
    map.set('k50', 50); // re-insert
  });

  bench('size', () => {
    map.size;
  });
});

// ─── Atomic ──────────────────────────────────────────────────────────────────

describe('Atomic: get + set', () => {
  bench('get', () => {
    const a = new Atomic(42);
    a.get();
  });

  bench('set', () => {
    const a = new Atomic(0);
    a.set(99);
  });
});

describe('Atomic: add / inc / dec', () => {
  bench('add(5)', () => {
    const a = new Atomic(0);
    a.add(5);
  });

  bench('inc', () => {
    const a = new Atomic(0);
    a.inc();
  });

  bench('dec', () => {
    const a = new Atomic(0);
    a.dec();
  });
});

describe('Atomic: cas', () => {
  bench('successful cas', () => {
    const a = new Atomic(0);
    a.cas(0, 1);
  });

  bench('failed cas', () => {
    const a = new Atomic(0);
    a.cas(999, 1);
  });
});

// ─── Channel ─────────────────────────────────────────────────────────────────

describe('Channel: buffered send/receive', () => {
  bench('send + receive (buffer=1)', async () => {
    const ch = new Channel<number>(1);
    await ch.send(42);
    await ch.receive();
    ch.close();
  });
});

describe('Channel: unbuffered send/receive', () => {
  bench('send + receive (buffer=0, concurrent)', async () => {
    const ch = new Channel<number>(0);
    const sendPromise = ch.send(42);
    const recvPromise = ch.receive();
    await Promise.all([sendPromise, recvPromise]);
    ch.close();
  });
});

describe('Channel: close', () => {
  bench('close with no waiters', () => {
    const ch = new Channel<number>(1);
    ch.close();
  });
});
