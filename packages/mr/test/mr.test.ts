import { describe, it, expect, vi } from 'vitest';
import { mapReduce, parallel, series, waterfall } from '../src';

describe('mapReduce', () => {
  it('should map and reduce items in parallel', async () => {
    const result = await mapReduce(
      [1, 2, 3, 4, 5],
      async (n) => n * 2,
      (acc, val) => acc + val
    );
    expect(result).toBe(30); // 2 + 4 + 6 + 8 + 10
  });

  it('should respect concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const result = await mapReduce(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return n * 2;
      },
      (acc, val) => acc + val,
      { concurrency: 2 }
    );

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(result).toBe(42); // 2 + 4 + 6 + 8 + 10 + 12
  });

  it('should throw on empty items', async () => {
    await expect(
      mapReduce(
        [],
        async (n) => n,
        (acc, val) => acc + val
      )
    ).rejects.toThrow('mapReduce requires at least one item');
  });

  it('should handle single item', async () => {
    const result = await mapReduce(
      [5],
      async (n) => n * 2,
      (acc, val) => acc + val
    );
    expect(result).toBe(10);
  });
});

describe('parallel', () => {
  it('should execute functions concurrently', async () => {
    const order: number[] = [];

    const results = await parallel(
      async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
        return 1;
      },
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(2);
        return 2;
      },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(3);
        return 3;
      }
    );

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([3, 2, 1]); // Fastest finishes first
  });

  it('should handle empty array', async () => {
    const results = await parallel();
    expect(results).toEqual([]);
  });

  it('should propagate errors', async () => {
    await expect(
      parallel(
        async () => 1,
        async () => {
          throw new Error('Failed');
        },
        async () => 3
      )
    ).rejects.toThrow('Failed');
  });
});

describe('series', () => {
  it('should execute functions sequentially', async () => {
    const order: number[] = [];

    const results = await series(
      async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
        return 1;
      },
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(2);
        return 2;
      },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(3);
        return 3;
      }
    );

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]); // Sequential order
  });

  it('should handle empty array', async () => {
    const results = await series();
    expect(results).toEqual([]);
  });

  it('should stop on first error', async () => {
    const fn2 = vi.fn();

    await expect(
      series(
        async () => 1,
        async () => {
          throw new Error('Failed');
        },
        fn2
      )
    ).rejects.toThrow('Failed');

    expect(fn2).not.toHaveBeenCalled();
  });
});

describe('waterfall', () => {
  it('should chain functions sequentially', async () => {
    const result = await waterfall(
      async () => 1,
      async (n) => n + 1,
      async (n) => n * 2,
      async (n) => n + 3
    );
    expect(result).toBe(7); // ((1 + 1) * 2) + 3 = 7
  });

  it('should handle async functions', async () => {
    const result = await waterfall(
      async () => 'hello',
      async (s) => {
        await new Promise((r) => setTimeout(r, 10));
        return (s as string).toUpperCase();
      },
      async (s) => `${s} world`
    );
    expect(result).toBe('HELLO world');
  });

  it('should handle single function', async () => {
    const result = await waterfall(async () => 42);
    expect(result).toBe(42);
  });
});
