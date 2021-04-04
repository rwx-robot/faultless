import { describe, it, expect, beforeEach } from 'vitest';
import {
  Once,
  Semaphore,
  ConcurrentMap,
  AtomicCounter,
  Mutex,
  ReadWriteLock,
} from '../src';

describe('Once', () => {
  it('should execute function only once', async () => {
    const once = new Once();
    let count = 0;

    await once.run(() => { count++; });
    await once.run(() => { count++; });
    await once.run(() => { count++; });

    expect(count).toBe(1);
    expect(once.isDone).toBe(true);
  });

  it('should handle async functions', async () => {
    const once = new Once();
    let count = 0;

    await once.run(async () => {
      await new Promise(r => setTimeout(r, 10));
      count++;
    });

    expect(count).toBe(1);
  });

  it('should reset state', async () => {
    const once = new Once();
    let count = 0;

    await once.run(() => { count++; });
    expect(once.isDone).toBe(true);

    once.reset();
    expect(once.isDone).toBe(false);

    await once.run(() => { count++; });
    expect(count).toBe(2);
  });
});

describe('Semaphore', () => {
  it('should limit concurrency', async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await sem.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task()]);

    expect(maxRunning).toBe(2);
  });

  it('should run helper', async () => {
    const sem = new Semaphore(1);
    let executed = false;

    await sem.run(async () => {
      executed = true;
    });

    expect(executed).toBe(true);
  });

  it('should track active and waiting', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);

    const waiter = sem.acquire();
    expect(sem.waiting).toBe(1);

    sem.release();
    await waiter;

    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);
  });
});

describe('ConcurrentMap', () => {
  it('should get and set values', () => {
    const map = new ConcurrentMap<string, number>();
    map.set('a', 1);
    map.set('b', 2);

    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('should load atomically', async () => {
    const map = new ConcurrentMap<string, number>();
    let computeCount = 0;

    const loader = async () => {
      computeCount++;
      await new Promise(r => setTimeout(r, 10));
      return 42;
    };

    // Concurrent loads should only compute once
    const [a, b, c] = await Promise.all([
      map.load('key', loader),
      map.load('key', loader),
      map.load('key', loader),
    ]);

    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(computeCount).toBe(1);
  });

  it('should delete and clear', () => {
    const map = new ConcurrentMap<string, number>();
    map.set('a', 1);
    map.set('b', 2);

    map.delete('a');
    expect(map.has('a')).toBe(false);
    expect(map.size).toBe(1);

    map.clear();
    expect(map.size).toBe(0);
  });
});

describe('AtomicCounter', () => {
  it('should track value', () => {
    const counter = new AtomicCounter(0);
    expect(counter.value).toBe(0);

    counter.inc();
    expect(counter.value).toBe(1);

    counter.add(5);
    expect(counter.value).toBe(6);

    counter.dec();
    expect(counter.value).toBe(5);
  });

  it('should compare and swap', () => {
    const counter = new AtomicCounter(10);

    expect(counter.compareAndSwap(10, 20)).toBe(true);
    expect(counter.value).toBe(20);

    expect(counter.compareAndSwap(10, 30)).toBe(false);
    expect(counter.value).toBe(20);
  });

  it('should reset', () => {
    const counter = new AtomicCounter(0);
    counter.add(10);
    counter.reset();
    expect(counter.value).toBe(0);

    counter.reset(100);
    expect(counter.value).toBe(100);
  });
});

describe('Mutex', () => {
  it('should ensure mutual exclusion', async () => {
    const mutex = new Mutex();
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await mutex.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 10));
        running--;
      });
    };

    await Promise.all([task(), task(), task()]);

    expect(maxRunning).toBe(1);
  });

  it('should track lock state', async () => {
    const mutex = new Mutex();
    expect(mutex.isLocked).toBe(false);

    const release = await mutex.acquire();
    expect(mutex.isLocked).toBe(true);

    const waiter = mutex.acquire();
    expect(mutex.waiting).toBe(1);

    release();
    expect(mutex.waiting).toBe(0);

    await waiter;
    mutex.release();
    expect(mutex.isLocked).toBe(false);
  });
});

describe('ReadWriteLock', () => {
  it('should allow concurrent readers', async () => {
    const rwLock = new ReadWriteLock();
    let readers = 0;
    let maxReaders = 0;

    const read = async () => {
      await rwLock.readLock.acquire();
      readers++;
      maxReaders = Math.max(maxReaders, readers);
      await new Promise(r => setTimeout(r, 10));
      readers--;
      rwLock.readLock.release();
    };

    await Promise.all([read(), read(), read()]);

    expect(maxReaders).toBe(3);
  });

  it('should ensure exclusive writer', async () => {
    const rwLock = new ReadWriteLock();
    let running = 0;
    let maxRunning = 0;

    const write = async () => {
      await rwLock.writeLock.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      rwLock.writeLock.release();
    };

    await Promise.all([write(), write(), write()]);

    expect(maxRunning).toBe(1);
  });
});