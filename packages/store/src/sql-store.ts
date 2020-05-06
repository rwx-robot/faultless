import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'store:sql' });

/**
 * SQL Database Type
 */
export enum SqlDatabaseType {
  POSTGRESQL = 'POSTGRESQL',
  MYSQL = 'MYSQL',
}

/**
 * SQL Store Options
 */
export interface SqlStoreOptions {
  type: SqlDatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

/**
 * Query Result
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
  command: string;
  duration: number;
}

/**
 * Transaction
 */
export interface Transaction {
  query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * SQL Store
 * - Connection pooling
 * - Query builder
 * - Transaction support
 * - Prepared statements
 * - Model mapping
 */
@Injectable()
export class SqlStore {
  private options: SqlStoreOptions;
  private pool: any;
  private connected = false;

  constructor(options: SqlStoreOptions) {
    this.options = {
      maxConnections: 10,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      ...options,
    };
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    try {
      if (this.options.type === SqlDatabaseType.POSTGRESQL) {
        const { Pool } = await import('pg');
        this.pool = new Pool({
          host: this.options.host,
          port: this.options.port,
          database: this.options.database,
          user: this.options.username,
          password: this.options.password,
          ssl: this.options.ssl,
          max: this.options.maxConnections,
          idleTimeoutMillis: this.options.idleTimeoutMs,
          connectionTimeoutMillis: this.options.connectionTimeoutMs,
        });
      } else if (this.options.type === SqlDatabaseType.MYSQL) {
        const mysql = await import('mysql2/promise');
        this.pool = await mysql.createPool({
          host: this.options.host,
          port: this.options.port,
          database: this.options.database,
          user: this.options.username,
          password: this.options.password,
          ssl: this.options.ssl ? {} : undefined,
          connectionLimit: this.options.maxConnections,
          idleTimeout: this.options.idleTimeoutMs,
        });
      }

      this.connected = true;
      logger.info('SQL store connected', {
        type: this.options.type,
        host: this.options.host,
        database: this.options.database,
      });
    } catch (error) {
      logger.error('Failed to connect to SQL database', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Execute query
   */
  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected) throw new Error('SQL store not connected');

    const start = Date.now();
    let result: any;

    if (this.options.type === SqlDatabaseType.POSTGRESQL) {
      result = await this.pool.query(sql, params);
    } else {
      const [rows, fields] = await this.pool.execute(sql, params);
      result = { rows, rowCount: (rows as any[]).length, command: 'SELECT' };
    }

    const duration = Date.now() - start;
    logger.debug('Query executed', { sql: sql.substring(0, 100), duration, rowCount: result.rowCount });

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      command: result.command,
      duration,
    };
  }

  /**
   * Get one row
   */
  async queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Insert and return ID
   */
  async insert<T>(sql: string, params?: any[]): Promise<T> {
    const result = await this.query<T>(sql, params);
    return result.rows[0];
  }

  /**
   * Update/Delete
   */
  async execute(sql: string, params?: any[]): Promise<number> {
    const result = await this.query(sql, params);
    return result.rowCount;
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<Transaction> {
    if (!this.connected) throw new Error('SQL store not connected');

    const client = await this.pool.connect();
    await client.query('BEGIN');

    return {
      query: async <T>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const start = Date.now();
        const result = await client.query(sql, params);
        return {
          rows: result.rows,
          rowCount: result.rowCount,
          command: result.command,
          duration: Date.now() - start,
        };
      },
      commit: async () => {
        await client.query('COMMIT');
        client.release();
      },
      rollback: async () => {
        await client.query('ROLLBACK');
        client.release();
      },
    };
  }

  /**
   * Execute in transaction
   */
  async transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    const trx = await this.beginTransaction();
    try {
      const result = await fn(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get pool stats
   */
  getStats(): { connected: boolean; type: string; host: string } {
    return {
      connected: this.connected,
      type: this.options.type,
      host: this.options.host,
    };
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }
}

/**
 * Create SQL store
 */
export function createSqlStore(options: SqlStoreOptions): SqlStore {
  return new SqlStore(options);
}

/**
 * Model decorator for TypeORM-style entities
 */
export function Entity(tableName: string) {
  return function (constructor: Function) {
    (constructor as any).__tableName__ = tableName;
  };
}

/**
 * Column decorator
 */
export function Column(options?: { name?: string; type?: string; primary?: boolean }) {
  return function (target: any, propertyKey: string) {
    if (!target.__columns__) {
      target.__columns__ = [];
    }
    target.__columns__.push({
      propertyKey,
      name: options?.name ?? propertyKey,
      type: options?.type ?? 'text',
      primary: options?.primary ?? false,
    });
  };
}

/**
 * PrimaryColumn decorator
 */
export function PrimaryColumn(name?: string) {
  return Column({ name, primary: true });
}