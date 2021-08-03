import { describe, it, expect, vi } from 'vitest';
import { EventBus, EventSource } from '../src';

describe('EventBus', () => {
  interface TestEvents {
    'user:created': { id: string; name: string };
    'user:deleted': { id: string };
    error: Error;
  }

  it('should register and emit events', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();

    bus.on('user:created', handler);
    bus.emit('user:created', { id: '1', name: 'John' });

    expect(handler).toHaveBeenCalledWith({ id: '1', name: 'John' });
  });

  it('should unregister handlers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();

    bus.on('user:created', handler);
    bus.off('user:created', handler);
    bus.emit('user:created', { id: '1', name: 'John' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle once handlers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();

    bus.once('user:created', handler);
    bus.emit('user:created', { id: '1', name: 'John' });
    bus.emit('user:created', { id: '2', name: 'Jane' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should count listeners', () => {
    const bus = new EventBus<TestEvents>();

    expect(bus.listenerCount('user:created')).toBe(0);
    expect(bus.hasListeners('user:created')).toBe(false);

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('user:created', handler1);
    bus.on('user:created', handler2);

    expect(bus.listenerCount('user:created')).toBe(2);
    expect(bus.hasListeners('user:created')).toBe(true);
  });

  it('should get event names', () => {
    const bus = new EventBus<TestEvents>();

    bus.on('user:created', vi.fn());
    bus.on('error', vi.fn());

    const names = bus.eventNames();
    expect(names).toContain('user:created');
    expect(names).toContain('error');
  });

  it('should clear all handlers', () => {
    const bus = new EventBus<TestEvents>();

    bus.on('user:created', vi.fn());
    bus.on('user:deleted', vi.fn());

    bus.clear();

    expect(bus.listenerCount('user:created')).toBe(0);
    expect(bus.listenerCount('user:deleted')).toBe(0);
  });

  it('should handle multiple handlers for same event', () => {
    const bus = new EventBus<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('user:created', handler1);
    bus.on('user:created', handler2);

    bus.emit('user:created', { id: '1', name: 'John' });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });
});

describe('EventSource', () => {
  it('should add clients', () => {
    const sse = new EventSource();
    const mockRes = {
      write: vi.fn(),
      flush: vi.fn(),
    };

    sse.addClient(mockRes);

    expect(sse.clientCount).toBe(1);
    expect(mockRes.write).toHaveBeenCalledWith(
      expect.stringContaining('event: connected')
    );
  });

  it('should broadcast to all clients', () => {
    const sse = new EventSource();
    const mockRes1 = { write: vi.fn() };
    const mockRes2 = { write: vi.fn() };

    sse.addClient(mockRes1);
    sse.addClient(mockRes2);

    sse.broadcast('message', { text: 'Hello' });

    expect(mockRes1.write).toHaveBeenCalledWith(
      expect.stringContaining('event: message')
    );
    expect(mockRes2.write).toHaveBeenCalledWith(
      expect.stringContaining('event: message')
    );
  });

  it('should send is alias for broadcast', () => {
    const sse = new EventSource();
    const mockRes = { write: vi.fn() };

    sse.addClient(mockRes);
    sse.send('test', { data: 123 });

    expect(mockRes.write).toHaveBeenCalledWith(
      expect.stringContaining('event: test')
    );
  });

  it('should send to specific client', () => {
    const sse = new EventSource();
    const mockRes1 = { write: vi.fn() };
    const mockRes2 = { write: vi.fn() };

    sse.addClient(mockRes1);
    sse.addClient(mockRes2);

    const clientIds = sse.getClientIds();
    sse.sendTo(clientIds[0], 'private', { data: 'only for you' });

    expect(mockRes1.write).toHaveBeenCalledWith(
      expect.stringContaining('event: private')
    );
    expect(mockRes2.write).not.toHaveBeenCalledWith(
      expect.stringContaining('event: private')
    );
  });

  it('should remove clients', () => {
    const sse = new EventSource();
    const mockRes = { write: vi.fn() };

    sse.addClient(mockRes);
    const clientId = sse.getClientIds()[0];

    expect(sse.clientCount).toBe(1);

    sse.removeClient(clientId);
    expect(sse.clientCount).toBe(0);
  });

  it('should close all clients', () => {
    const sse = new EventSource();
    const mockRes1 = { write: vi.fn() };
    const mockRes2 = { write: vi.fn() };

    sse.addClient(mockRes1);
    sse.addClient(mockRes2);

    sse.closeAll();

    expect(sse.clientCount).toBe(0);
    expect(mockRes1.write).toHaveBeenCalledWith(
      expect.stringContaining('event: closed')
    );
  });

  it('should handle send errors gracefully', () => {
    const sse = new EventSource();
    let writeCount = 0;
    const mockRes = {
      write: vi.fn(() => {
        writeCount++;
        // Throw on second write (the broadcast)
        if (writeCount > 1) {
          throw new Error('Connection closed');
        }
      }),
    };

    sse.addClient(mockRes);
    expect(sse.clientCount).toBe(1);

    // Should not throw, should handle error
    sse.broadcast('test', { data: 1 });

    // Client should be removed on error
    expect(sse.clientCount).toBe(0);
  });
});
