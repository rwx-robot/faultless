import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../src';

describe('TaskQueue', () => {
  it('should execute tasks with concurrency limit', async () => {
    const queue = new TaskQueue(2);
    let running = 0;
    let maxRunning = 0;

    const task = async (data: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return data * 2;
    };

    const results = await Promise.all([
      queue.add(task, 1),
      queue.add(task, 2),
      queue.add(task, 3),
      queue.add(task, 4),
      queue.add(task, 5),
    ]);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should report size and running count', async () => {
    const queue = new TaskQueue(1);
    let resolveFirst: () => void;

    const firstTask = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    queue.add(async () => {
      await firstTask;
      return 1;
    }, null);

    expect(queue.running).toBe(1);

    queue.add(async () => 2, null);
    expect(queue.size).toBe(1);

    resolveFirst!();
    await new Promise((r) => setTimeout(r, 50));

    expect(queue.size).toBe(0);
    expect(queue.running).toBe(0);
  });

  it('should report idle state', async () => {
    const queue = new TaskQueue(1);

    expect(queue.idle).toBe(true);

    const task = queue.add(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    }, null);

    expect(queue.idle).toBe(false);

    await task;
    expect(queue.idle).toBe(true);
  });

  it('should clear pending tasks', async () => {
    const queue = new TaskQueue(1);
    let resolveFirst: () => void;

    const firstTask = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    queue.add(async () => {
      await firstTask;
      return 1;
    }, null);

    const pendingTask = queue.add(async () => 2, null);

    queue.clear();

    expect(queue.size).toBe(0);
    await expect(pendingTask).rejects.toThrow('TaskQueue cleared');

    resolveFirst!();
  });

  it('should handle task errors', async () => {
    const queue = new TaskQueue(1);

    await expect(
      queue.add(async () => {
        throw new Error('Task failed');
      }, null)
    ).rejects.toThrow('Task failed');
  });

  it('should allow changing concurrency', async () => {
    const queue = new TaskQueue(1);
    let running = 0;
    let maxRunning = 0;

    const task = async (data: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return data;
    };

    queue.concurrency = 3;

    const results = await Promise.all([
      queue.add(task, 1),
      queue.add(task, 2),
      queue.add(task, 3),
    ]);

    expect(results).toEqual([1, 2, 3]);
    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it('should emit task-complete events', async () => {
    const queue = new TaskQueue(1);
    let completeCount = 0;

    queue.on('task-complete', () => {
      completeCount++;
    });

    await queue.add(async () => 1, null);
    await queue.add(async () => 2, null);
    await queue.add(async () => 3, null);

    expect(completeCount).toBe(3);
  });
});
