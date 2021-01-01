import * as grpc from '@grpc/grpc-js';
import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'rpc:connection-pool' });

/**
 * Connection Pool Options
 */
export interface ConnectionPoolOptions {
  target: string;
  minConnections?: number;
  maxConnections?: number;
  idleTimeoutMs?: number;
  maxLifetimeMs?: number;
  retry?: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
  healthCheck?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
}

/**
 * Connection State
 */
export enum ConnectionState {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  CLOSED = 'CLOSED',
  UNHEALTHY = 'UNHEALTHY',
}

/**
 * Connection Info
 */
export interface ConnectionInfo {
  id: string;
  state: ConnectionState;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

/**
 * Connection Pool
 * - Min/max connection limits
 * - Idle connection recycling
 * - Connection health checks
 * - Lifetime limits
 * - Connection statistics
 */
@Injectable()
export class ConnectionPool {
  private options: ConnectionPoolOptions;
  private connections: Map<string, {
    channel: grpc.Channel;
    info: ConnectionInfo;
  }> = new Map();
  private idleTimeout?: NodeJS.Timeout;

  constructor(options: ConnectionPoolOptions) {
    this.options = {
      minConnections: 2,
      maxConnections: 10,
      idleTimeoutMs: 60000,
      maxLifetimeMs: 300000,
      ...options,
    };

    // Start idle connection cleanup
    this.idleTimeout = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.options.idleTimeoutMs! / 2);

    // Initialize minimum connections
    this.initializePool();
  }

  /**
   * Initialize pool with minimum connections
   */
  private async initializePool(): Promise<void> {
    for (let i = 0; i < this.options.minConnections!; i++) {
      await this.createConnection();
    }
  }

  /**
   * Get connection from pool
   */
  async acquire(): Promise<{ channel: grpc.Channel; release: () => void }> {
    // Find idle connection
    for (const [id, conn] of this.connections.entries()) {
      if (conn.info.state === ConnectionState.IDLE) {
        conn.info.state = ConnectionState.BUSY;
        conn.info.lastUsedAt = Date.now();
        conn.info.useCount++;

        return {
          channel: conn.channel,
          release: () => this.release(id),
        };
      }
    }

    // Create new connection if under limit
    if (this.connections.size < this.options.maxConnections!) {
      const { id, channel } = await this.createConnection();
      const conn = this.connections.get(id)!;
      conn.info.state = ConnectionState.BUSY;
      conn.info.lastUsedAt = Date.now();
      conn.info.useCount++;

      return {
        channel,
        release: () => this.release(id),
      };
    }

    // Wait for connection to become available
    return new Promise((resolve) => {
      const check = () => {
        for (const [id, conn] of this.connections.entries()) {
          if (conn.info.state === ConnectionState.IDLE) {
            conn.info.state = ConnectionState.BUSY;
            conn.info.lastUsedAt = Date.now();
            conn.info.useCount++;

            resolve({
              channel: conn.channel,
              release: () => this.release(id),
            });
            return;
          }
        }
        setTimeout(check, 10);
      };
      check();
    });
  }

  /**
   * Release connection back to pool
   */
  release(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.info.state = ConnectionState.IDLE;
      conn.info.lastUsedAt = Date.now();
    }
  }

  /**
   * Create new connection
   */
  private async createConnection(): Promise<{ id: string; channel: grpc.Channel }> {
    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const credentials = grpc.credentials.createInsecure();
    const channel = new grpc.Channel(
      this.options.target,
      credentials,
      {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 5000,
      }
    );

    this.connections.set(id, {
      channel,
      info: {
        id,
        state: ConnectionState.IDLE,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        useCount: 0,
      },
    });

    logger.debug('Connection created', { id, target: this.options.target });
    return { id, channel };
  }

  /**
   * Cleanup idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleTimeout = this.options.idleTimeoutMs!;
    const maxLifetime = this.options.maxLifetimeMs!;

    for (const [id, conn] of this.connections.entries()) {
      const isIdle = conn.info.state === ConnectionState.IDLE;
      const isExpiredIdle = isIdle && (now - conn.info.lastUsedAt) > idleTimeout;
      const isExpiredLifetime = (now - conn.info.createdAt) > maxLifetime;

      if ((isExpiredIdle && this.connections.size > this.options.minConnections!) || isExpiredLifetime) {
        this.closeConnection(id);
      }
    }
  }

  /**
   * Close connection
   */
  private closeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.channel.close();
      conn.info.state = ConnectionState.CLOSED;
      this.connections.delete(id);
      logger.debug('Connection closed', { id });
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.idleTimeout) {
      clearInterval(this.idleTimeout);
    }

    for (const [id] of this.connections.entries()) {
      this.closeConnection(id);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    idle: number;
    busy: number;
    closed: number;
    connections: ConnectionInfo[];
  } {
    let idle = 0;
    let busy = 0;
    let closed = 0;
    const connections: ConnectionInfo[] = [];

    for (const conn of this.connections.values()) {
      switch (conn.info.state) {
        case ConnectionState.IDLE:
          idle++;
          break;
        case ConnectionState.BUSY:
          busy++;
          break;
        case ConnectionState.CLOSED:
          closed++;
          break;
      }
      connections.push({ ...conn.info });
    }

    return {
      total: this.connections.size,
      idle,
      busy,
      closed,
      connections,
    };
  }

  /**
   * Scale pool
   */
  async scale(targetSize: number): Promise<void> {
    const currentSize = this.connections.size;

    if (targetSize > currentSize) {
      // Scale up
      const toAdd = Math.min(targetSize - currentSize, this.options.maxConnections! - currentSize);
      for (let i = 0; i < toAdd; i++) {
        await this.createConnection();
      }
    } else if (targetSize < currentSize) {
      // Scale down - close idle connections first
      const toRemove = currentSize - targetSize;
      let removed = 0;

      for (const [id, conn] of this.connections.entries()) {
        if (removed >= toRemove) break;
        if (conn.info.state === ConnectionState.IDLE) {
          this.closeConnection(id);
          removed++;
        }
      }

      // If still need to remove, close busy connections
      if (removed < toRemove) {
        for (const [id, conn] of this.connections.entries()) {
          if (removed >= toRemove) break;
          if (conn.info.state === ConnectionState.BUSY) {
            this.closeConnection(id);
            removed++;
          }
        }
      }
    }
  }
}

/**
 * Create connection pool
 */
export function createConnectionPool(options: ConnectionPoolOptions): ConnectionPool {
  return new ConnectionPool(options);
}

/**
 * Connection Pool Manager - manages multiple pools
 */
export class ConnectionPoolManager {
  private pools = new Map<string, ConnectionPool>();

  /**
   * Get or create pool
   */
  getOrCreate(name: string, options: ConnectionPoolOptions): ConnectionPool {
    if (!this.pools.has(name)) {
      this.pools.set(name, createConnectionPool(options));
    }
    return this.pools.get(name)!;
  }

  /**
   * Get pool
   */
  get(name: string): ConnectionPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Remove pool
   */
  async remove(name: string): Promise<boolean> {
    const pool = this.pools.get(name);
    if (pool) {
      await pool.close();
      return this.pools.delete(name);
    }
    return false;
  }

  /**
   * Get all stats
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    this.pools.forEach((pool, name) => {
      stats[name] = pool.getStats();
    });
    return stats;
  }

  /**
   * Close all pools
   */
  async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.close();
    }
    this.pools.clear();
  }
}

export const connectionPoolManager = new ConnectionPoolManager();