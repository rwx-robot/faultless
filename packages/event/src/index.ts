/**
 * @faultless/event
 * Event utilities for Node.js
 *
 * Provides type-safe event handling:
 * - EventBus: Type-safe event emitter
 * - EventSource: Server-Sent Events (SSE) handler
 */

// ============================================================================
// EventBus - Type-safe event emitter
// ============================================================================

type EventHandler<T> = (data: T) => void;

/**
 * A type-safe event emitter that ensures event names and data types match.
 *
 * @example
 * ```typescript
 * interface Events {
 *   'user:created': { id: string; name: string };
 *   'user:deleted': { id: string };
 *   'error': Error;
 * }
 *
 * const bus = new EventBus<Events>();
 *
 * bus.on('user:created', (data) => {
 *   console.log(data.id, data.name); // Fully typed
 * });
 *
 * bus.emit('user:created', { id: '1', name: 'John' }); // Type checked
 * ```
 */
export class EventBus<T extends Record<string, any>> {
  private _handlers = new Map<string, Set<EventHandler<any>>>();

  /**
   * Register an event handler.
   */
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const handlers = this._handlers.get(event as string) || new Set();
    handlers.add(handler);
    this._handlers.set(event as string, handlers);
  }

  /**
   * Unregister an event handler.
   */
  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const handlers = this._handlers.get(event as string);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._handlers.delete(event as string);
      }
    }
  }

  /**
   * Emit an event with data.
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const handlers = this._handlers.get(event as string);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  /**
   * Register a one-time event handler.
   */
  once<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const wrapper: EventHandler<T[K]> = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Remove all handlers for all events.
   */
  clear(): void {
    this._handlers.clear();
  }

  /**
   * Get the number of handlers for an event.
   */
  listenerCount<K extends keyof T>(event: K): number {
    return this._handlers.get(event as string)?.size ?? 0;
  }

  /**
   * Check if an event has any handlers.
   */
  hasListeners<K extends keyof T>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Get all registered event names.
   */
  eventNames(): (keyof T)[] {
    return Array.from(this._handlers.keys()) as (keyof T)[];
  }
}

// ============================================================================
// EventSource - Server-Sent Events (SSE)
// ============================================================================

interface SSEClient {
  id: string;
  response: SSELikeResponse;
}

interface SSELikeResponse {
  write: (data: string) => void;
  flush?: () => void;
}

/**
 * Server-Sent Events (SSE) handler for managing multiple clients.
 *
 * @example
 * ```typescript
 * import { EventSource } from '@faultless/event';
 *
 * const sse = new EventSource();
 *
 * // In your HTTP handler:
 * app.get('/events', (req, res) => {
 *   sse.addClient(res);
 * });
 *
 * // Broadcast events to all connected clients:
 * sse.broadcast('message', { text: 'Hello everyone!' });
 * sse.send('user:joined', { userId: '123' }); // alias for broadcast
 * ```
 */
export class EventSource {
  private _clients: Map<string, SSEClient> = new Map();
  private _idCounter = 0;

  /**
   * Add a new SSE client connection.
   */
  addClient(res: SSELikeResponse): void {
    const id = `client-${++this._idCounter}`;

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ id })}\n\n`);

    const client: SSEClient = { id, response: res };
    this._clients.set(id, client);
  }

  /**
   * Send an event to all connected clients.
   */
  send(event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [id, client] of this._clients) {
      try {
        client.response.write(message);
        client.response.flush?.();
      } catch {
        // Client disconnected, remove it
        this._clients.delete(id);
      }
    }
  }

  /**
   * Broadcast is an alias for send - sends to all clients.
   */
  broadcast(event: string, data: any): void {
    this.send(event, data);
  }

  /**
   * Send a message with a custom ID.
   */
  sendTo(clientId: string, event: string, data: any): boolean {
    const client = this._clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(message);
      client.response.flush?.();
      return true;
    } catch {
      this._clients.delete(clientId);
      return false;
    }
  }

  /**
   * Get the number of connected clients.
   */
  get clientCount(): number {
    return this._clients.size;
  }

  /**
   * Get all connected client IDs.
   */
  getClientIds(): string[] {
    return Array.from(this._clients.keys());
  }

  /**
   * Remove a specific client.
   */
  removeClient(clientId: string): boolean {
    return this._clients.delete(clientId);
  }

  /**
   * Close all client connections.
   */
  closeAll(): void {
    for (const [id, client] of this._clients) {
      try {
        client.response.write(`event: closed\ndata: {}\n\n`);
      } catch {
        // Ignore errors on close
      }
    }
    this._clients.clear();
  }
}
