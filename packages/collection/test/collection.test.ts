import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Cache,
  Ring,
  EnhancedSet,
  Queue,
  Stack,
  PriorityQueue,
} from '../src/index';

// ─── Cache ──────────────────────────────────────────────────────────────────

describe('Cache', () => {
  let cache: Cache<string, number>;

  beforeEach(() => {
    cache = new Cache<string, number>({ maxEntries: 3, ttl: 1000 });
  });

  it('should set and get values', () => {
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should respect maxEntries by evicting oldest', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // evicts 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
  });

  it('should expire entries after ttl', async () => {
    const c = new Cache<string, number>({ ttl: 50 });
    c.set('x', 10);
    expect(c.get('x')).toBe(10);
    await new Promise((r) => setTimeout(r, 80));
    expect(c.get('x')).toBeUndefined();
  });

  it('should support per-key ttl override', async () => {
    const c = new Cache<string, number>({ ttl: 5000 });
    c.set('short', 1, 50);
    c.set('long', 2, 5000);
    await new Promise((r) => setTimeout(r, 80));
    expect(c.get('short')).toBeUndefined();
    expect(c.get('long')).toBe(2);
  });

  it('should delete entries', () => {
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should report has correctly', () => {
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should report size excluding expired', async () => {
    const c = new Cache<string, number>({ ttl: 50 });
    c.set('a', 1);
    c.set('b', 2);
    expect(c.size).toBe(2);
    await new Promise((r) => setTimeout(r, 80));
    expect(c.size).toBe(0);
  });

  it('should return entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    const entries = cache.entries();
    expect(entries).toEqual(
      expect.arrayContaining([
        ['a', 1],
        ['b', 2],
      ]),
    );
  });

  it('should emit expired event', async () => {
    const c = new Cache<string, number>({ ttl: 50 });
    const spy = vi.fn();
    c.on('expired', spy);
    c.set('x', 42);
    await new Promise((r) => setTimeout(r, 80));
    c.get('x'); // trigger expiry check
    expect(spy).toHaveBeenCalledWith('x', 42);
  });
});

// ─── Ring ───────────────────────────────────────────────────────────────────

describe('Ring', () => {
  it('should add and retrieve items', () => {
    const ring = new Ring<number>(3);
    ring.add(1);
    ring.add(2);
    ring.add(3);
    expect(ring.get(0)).toBe(1);
    expect(ring.get(1)).toBe(2);
    expect(ring.get(2)).toBe(3);
  });

  it('should overwrite oldest when full', () => {
    const ring = new Ring<number>(3);
    ring.add(1);
    ring.add(2);
    ring.add(3);
    ring.add(4); // overwrites 1
    expect(ring.toArray()).toEqual([2, 3, 4]);
  });

  it('should return undefined for out-of-bounds', () => {
    const ring = new Ring<number>(3);
    ring.add(1);
    expect(ring.get(-1)).toBeUndefined();
    expect(ring.get(1)).toBeUndefined();
  });

  it('should report size and capacity', () => {
    const ring = new Ring<number>(5);
    expect(ring.capacity).toBe(5);
    expect(ring.size).toBe(0);
    ring.add(1);
    ring.add(2);
    expect(ring.size).toBe(2);
  });

  it('should clear the buffer', () => {
    const ring = new Ring<number>(3);
    ring.add(1);
    ring.add(2);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.toArray()).toEqual([]);
  });

  it('should throw for non-positive capacity', () => {
    expect(() => new Ring<number>(0)).toThrow('Capacity must be positive');
    expect(() => new Ring<number>(-1)).toThrow('Capacity must be positive');
  });
});

// ─── EnhancedSet ────────────────────────────────────────────────────────────

describe('EnhancedSet', () => {
  it('should add and check items', () => {
    const set = new EnhancedSet<number>();
    set.add(1);
    expect(set.has(1)).toBe(true);
    expect(set.has(2)).toBe(false);
  });

  it('should delete items', () => {
    const set = new EnhancedSet<number>();
    set.add(1);
    expect(set.delete(1)).toBe(true);
    expect(set.has(1)).toBe(false);
  });

  it('should compute union', () => {
    const a = new EnhancedSet([1, 2, 3]);
    const b = new EnhancedSet([3, 4, 5]);
    const u = a.union(b);
    expect(u.toArray()).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  });

  it('should compute intersection', () => {
    const a = new EnhancedSet([1, 2, 3]);
    const b = new EnhancedSet([2, 3, 4]);
    const i = a.intersection(b);
    expect(i.toArray()).toEqual(expect.arrayContaining([2, 3]));
  });

  it('should compute difference', () => {
    const a = new EnhancedSet([1, 2, 3]);
    const b = new EnhancedSet([2, 3, 4]);
    const d = a.difference(b);
    expect(d.toArray()).toEqual([1]);
  });

  it('should compute symmetricDifference', () => {
    const a = new EnhancedSet([1, 2, 3]);
    const b = new EnhancedSet([3, 4, 5]);
    const sd = a.symmetricDifference(b);
    expect(sd.toArray()).toEqual(expect.arrayContaining([1, 2, 4, 5]));
  });

  it('should check isSubsetOf', () => {
    const a = new EnhancedSet([1, 2]);
    const b = new EnhancedSet([1, 2, 3]);
    expect(a.isSubsetOf(b)).toBe(true);
    expect(b.isSubsetOf(a)).toBe(false);
  });

  it('should check isSupersetOf', () => {
    const a = new EnhancedSet([1, 2, 3]);
    const b = new EnhancedSet([1, 2]);
    expect(a.isSupersetOf(b)).toBe(true);
    expect(b.isSupersetOf(a)).toBe(false);
  });

  it('should report size', () => {
    const set = new EnhancedSet([1, 2, 3]);
    expect(set.size).toBe(3);
  });
});

// ─── Queue ──────────────────────────────────────────────────────────────────

describe('Queue', () => {
  it('should enqueue and dequeue in FIFO order', () => {
    const q = new Queue<string>();
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    expect(q.dequeue()).toBe('a');
    expect(q.dequeue()).toBe('b');
    expect(q.dequeue()).toBe('c');
  });

  it('should peek without removing', () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    expect(q.peek()).toBe(1);
    expect(q.size).toBe(2);
  });

  it('should report isEmpty', () => {
    const q = new Queue<number>();
    expect(q.isEmpty()).toBe(true);
    q.enqueue(1);
    expect(q.isEmpty()).toBe(false);
  });

  it('should return undefined when dequeue empty', () => {
    const q = new Queue<number>();
    expect(q.dequeue()).toBeUndefined();
  });

  it('should return toArray', () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    expect(q.toArray()).toEqual([1, 2]);
  });

  it('should clear', () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    q.clear();
    expect(q.size).toBe(0);
  });
});

// ─── Stack ──────────────────────────────────────────────────────────────────

describe('Stack', () => {
  it('should push and pop in LIFO order', () => {
    const s = new Stack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.pop()).toBe('c');
    expect(s.pop()).toBe('b');
    expect(s.pop()).toBe('a');
  });

  it('should peek without removing', () => {
    const s = new Stack<number>();
    s.push(1);
    s.push(2);
    expect(s.peek()).toBe(2);
    expect(s.size).toBe(2);
  });

  it('should report isEmpty', () => {
    const s = new Stack<number>();
    expect(s.isEmpty()).toBe(true);
    s.push(1);
    expect(s.isEmpty()).toBe(false);
  });

  it('should return undefined when pop empty', () => {
    const s = new Stack<number>();
    expect(s.pop()).toBeUndefined();
  });

  it('should return toArray', () => {
    const s = new Stack<number>();
    s.push(1);
    s.push(2);
    expect(s.toArray()).toEqual([1, 2]);
  });

  it('should clear', () => {
    const s = new Stack<number>();
    s.push(1);
    s.push(2);
    s.clear();
    expect(s.size).toBe(0);
  });
});

// ─── PriorityQueue ──────────────────────────────────────────────────────────

describe('PriorityQueue', () => {
  it('should dequeue in priority order', () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue('low', 10);
    pq.enqueue('high', 1);
    pq.enqueue('medium', 5);
    expect(pq.dequeue()).toBe('high');
    expect(pq.dequeue()).toBe('medium');
    expect(pq.dequeue()).toBe('low');
  });

  it('should peek without removing', () => {
    const pq = new PriorityQueue<number>();
    pq.enqueue(10, 10);
    pq.enqueue(1, 1);
    expect(pq.peek()).toBe(1);
    expect(pq.size).toBe(2);
  });

  it('should support custom comparator', () => {
    const pq = new PriorityQueue<string>(
      (a, b) => b.length - a.length, // longer string = higher priority
    );
    pq.enqueue('a', 1);
    pq.enqueue('bbb', 1);
    pq.enqueue('cc', 1);
    expect(pq.dequeue()).toBe('bbb');
    expect(pq.dequeue()).toBe('cc');
    expect(pq.dequeue()).toBe('a');
  });

  it('should report isEmpty', () => {
    const pq = new PriorityQueue<number>();
    expect(pq.isEmpty()).toBe(true);
    pq.enqueue(1, 1);
    expect(pq.isEmpty()).toBe(false);
  });

  it('should return undefined when dequeue empty', () => {
    const pq = new PriorityQueue<number>();
    expect(pq.dequeue()).toBeUndefined();
  });

  it('should handle large number of items', () => {
    const pq = new PriorityQueue<number>();
    const values = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 1000));
    for (const v of values) pq.enqueue(v, v);
    const sorted = [...values].sort((a, b) => a - b);
    for (const expected of sorted) {
      expect(pq.dequeue()).toBe(expected);
    }
  });
});
