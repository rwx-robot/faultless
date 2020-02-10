import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'store:mongo' });

/**
 * MongoDB Store Options
 */
export interface MongoStoreOptions {
  uri: string;
  database: string;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  waitQueueTimeoutMS?: number;
  serverSelectionTimeoutMS?: number;
}

/**
 * Mongo Document
 */
export interface MongoDocument {
  _id?: any;
  [key: string]: any;
}

/**
 * Mongo Store
 * - Connection pooling
 * - CRUD operations
 * - Aggregation pipeline
 * - Bulk operations
 */
@Injectable()
export class MongoStore {
  private options: MongoStoreOptions;
  private client: any;
  private db: any;
  private connected = false;

  constructor(options: MongoStoreOptions) {
    this.options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      ...options,
    };
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      this.client = new MongoClient(this.options.uri, {
        maxPoolSize: this.options.maxPoolSize,
        minPoolSize: this.options.minPoolSize,
        maxIdleTimeMS: this.options.maxIdleTimeMS,
        waitQueueTimeoutMS: this.options.waitQueueTimeoutMS,
        serverSelectionTimeoutMS: this.options.serverSelectionTimeoutMS,
      });

      await this.client.connect();
      this.db = this.client.db(this.options.database);
      this.connected = true;

      logger.info('MongoDB connected', {
        database: this.options.database,
      });
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get collection
   */
  collection<T extends MongoDocument>(name: string): any {
    if (!this.connected) throw new Error('MongoDB not connected');
    return this.db.collection<T>(name);
  }

  /**
   * Find one document
   */
  async findOne<T extends MongoDocument>(
    collection: string,
    filter: any
  ): Promise<T | null> {
    const col = this.collection<T>(collection);
    return await col.findOne(filter);
  }

  /**
   * Find many documents
   */
  async find<T extends MongoDocument>(
    collection: string,
    filter?: any,
    options?: { limit?: number; skip?: number; sort?: any }
  ): Promise<T[]> {
    const col = this.collection<T>(collection);
    let cursor = col.find(filter ?? {});

    if (options?.sort) cursor = cursor.sort(options.sort);
    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    return await cursor.toArray();
  }

  /**
   * Insert one document
   */
  async insertOne<T extends MongoDocument>(
    collection: string,
    document: Omit<T, '_id'>
  ): Promise<T> {
    const col = this.collection<T>(collection);
    const result = await col.insertOne(document);
    return { _id: result.insertedId, ...document } as T;
  }

  /**
   * Insert many documents
   */
  async insertMany<T extends MongoDocument>(
    collection: string,
    documents: Array<Omit<T, '_id'>>
  ): Promise<T[]> {
    const col = this.collection<T>(collection);
    const result = await col.insertMany(documents);
    return documents.map((doc, i) => ({
      _id: result.insertedIds[i],
      ...doc,
    })) as T[];
  }

  /**
   * Update one document
   */
  async updateOne<T extends MongoDocument>(
    collection: string,
    filter: any,
    update: any
  ): Promise<boolean> {
    const col = this.collection<T>(collection);
    const result = await col.updateOne(filter, update);
    return result.modifiedCount > 0;
  }

  /**
   * Update many documents
   */
  async updateMany<T extends MongoDocument>(
    collection: string,
    filter: any,
    update: any
  ): Promise<number> {
    const col = this.collection<T>(collection);
    const result = await col.updateMany(filter, update);
    return result.modifiedCount;
  }

  /**
   * Delete one document
   */
  async deleteOne<T extends MongoDocument>(
    collection: string,
    filter: any
  ): Promise<boolean> {
    const col = this.collection<T>(collection);
    const result = await col.deleteOne(filter);
    return result.deletedCount > 0;
  }

  /**
   * Delete many documents
   */
  async deleteMany<T extends MongoDocument>(
    collection: string,
    filter: any
  ): Promise<number> {
    const col = this.collection<T>(collection);
    const result = await col.deleteMany(filter);
    return result.deletedCount;
  }

  /**
   * Count documents
   */
  async count<T extends MongoDocument>(
    collection: string,
    filter?: any
  ): Promise<number> {
    const col = this.collection<T>(collection);
    return await col.countDocuments(filter ?? {});
  }

  /**
   * Aggregate pipeline
   */
  async aggregate<T extends MongoDocument>(
    collection: string,
    pipeline: any[]
  ): Promise<T[]> {
    const col = this.collection<T>(collection);
    const cursor = col.aggregate(pipeline);
    return await cursor.toArray();
  }

  /**
   * Bulk write
   */
  async bulkWrite<T extends MongoDocument>(
    collection: string,
    operations: any[]
  ): Promise<{ insertedCount: number; modifiedCount: number; deletedCount: number }> {
    const col = this.collection<T>(collection);
    const result = await col.bulkWrite(operations);
    return {
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
    };
  }

  /**
   * Create index
   */
  async createIndex(
    collection: string,
    index: any,
    options?: any
  ): Promise<string> {
    const col = this.collection(collection);
    return await col.createIndex(index, options);
  }

  /**
   * Drop collection
   */
  async dropCollection(collection: string): Promise<boolean> {
    try {
      await this.db.dropCollection(collection);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List collections
   */
  async listCollections(): Promise<string[]> {
    const collections = await this.db.listCollections().toArray();
    return collections.map((c: any) => c.name);
  }

  /**
   * Get stats
   */
  getStats(): { connected: boolean; database: string } {
    return {
      connected: this.connected,
      database: this.options.database,
    };
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.connected = false;
    }
  }
}

/**
 * Create MongoDB store
 */
export function createMongoStore(options: MongoStoreOptions): MongoStore {
  return new MongoStore(options);
}

/**
 * Document decorator
 */
export function Collection(name: string) {
  return function (constructor: Function) {
    (constructor as any).__collection__ = name;
  };
}