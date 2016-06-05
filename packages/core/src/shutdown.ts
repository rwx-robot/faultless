import { EventEmitter } from 'events';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  order: number;
}

export interface ShutdownEvent {
  type: 'start' | 'service' | 'complete' | 'timeout' | 'error';
  service?: string;
  error?: Error;
  timestamp: Date;
}

export class GracefulShutdown extends EventEmitter {
  private handlers: ShutdownHandler[] = [];
  private signalHandlers: Map<string, () => Promise<void>> = new Map();
  private timeout: number;
  private isShuttingDown = false;
  private orderCounter = 0;

  constructor(timeout: number = 30000) {
    super();
    this.timeout = timeout;
  }

  register(signal: string, handler: () => Promise<void>): void {
    const wrappedHandler = async () => {
      if (this.isShuttingDown) return;
      await this.shutdown();
    };

    this.signalHandlers.set(signal, wrappedHandler);
    process.on(signal, wrappedHandler);
  }

  registerService(name: string, shutdown: () => Promise<void>): void {
    this.handlers.push({
      name,
      handler: shutdown,
      order: this.orderCounter++,
    });
  }

  start(): void {
    this.register('SIGTERM', async () => {
      await this.shutdown();
    });

    this.register('SIGINT', async () => {
      await this.shutdown();
    });

    this.register('SIGHUP', async () => {
      await this.shutdown();
    });
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.emit('start', {
      type: 'start',
      timestamp: new Date(),
    } as ShutdownEvent);

    const sortedHandlers = [...this.handlers].sort((a, b) => b.order - a.order);

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Shutdown timeout exceeded'));
      }, this.timeout);
    });

    const shutdownPromise = this.executeShutdown(sortedHandlers);

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);

      this.emit('complete', {
        type: 'complete',
        timestamp: new Date(),
      } as ShutdownEvent);
    } catch (error) {
      this.emit('timeout', {
        type: 'timeout',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      } as ShutdownEvent);

      this.emit('error', {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      } as ShutdownEvent);

      process.exit(1);
    }
  }

  private async executeShutdown(handlers: ShutdownHandler[]): Promise<void> {
    for (const { name, handler } of handlers) {
      try {
        this.emit('service', {
          type: 'service',
          service: name,
          timestamp: new Date(),
        } as ShutdownEvent);

        await handler();
      } catch (error) {
        this.emit('error', {
          type: 'error',
          service: name,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        } as ShutdownEvent);
      }
    }
  }

  getRegisteredServices(): string[] {
    return this.handlers.map(h => h.name);
  }

  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  removeService(name: string): boolean {
    const initialLength = this.handlers.length;
    this.handlers = this.handlers.filter(h => h.name !== name);
    return this.handlers.length < initialLength;
  }

  clear(): void {
    this.handlers = [];
    this.orderCounter = 0;
  }

  destroy(): void {
    for (const [signal] of this.signalHandlers) {
      process.removeAllListeners(signal);
    }
    this.signalHandlers.clear();
    this.handlers = [];
    this.removeAllListeners();
  }
}

export function createGracefulShutdown(timeout?: number): GracefulShutdown {
  return new GracefulShutdown(timeout);
}
