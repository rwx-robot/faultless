/**
 * @faultless/stream
 * Stream utilities for Node.js
 *
 * Provides a helper class for working with Node.js streams:
 * - StreamHelper: Unified interface for readable, writable, and transform streams
 * - Pipe, collect, map, filter, reduce operations
 */

import { Readable, Writable, Transform, PassThrough } from 'node:stream';

// ============================================================================
// StreamHelper - Unified stream utilities
// ============================================================================

/**
 * A helper class that wraps Node.js streams and provides
 * convenient methods for common stream operations.
 *
 * @example
 * ```typescript
 * import { StreamHelper } from '@faultless/stream';
 * import { createReadStream } from 'node:fs';
 *
 * // Collect all data from a readable stream
 * const helper = StreamHelper.fromReadable(createReadStream('data.txt'));
 * const data = await helper.collect();
 *
 * // Pipe and transform
 * const result = await StreamHelper.fromReadable(source)
 *   .map(chunk => chunk.toString().toUpperCase())
 *   .filter(chunk => chunk.length > 0)
 *   .pipe(destination);
 * ```
 */
export class StreamHelper {
  private _stream: Readable | Writable | Transform;

  private constructor(stream: Readable | Writable | Transform) {
    this._stream = stream;
  }

  /**
   * Create a StreamHelper from a readable stream.
   */
  static fromReadable(stream: Readable): StreamHelper {
    return new StreamHelper(stream);
  }

  /**
   * Create a StreamHelper from a writable stream.
   */
  static fromWritable(stream: Writable): StreamHelper {
    return new StreamHelper(stream);
  }

  /**
   * Create a StreamHelper from a transform stream.
   */
  static fromTransform(stream: Transform): StreamHelper {
    return new StreamHelper(stream);
  }

  /**
   * Pipe data to a writable destination.
   */
  pipe(dest: Writable): StreamHelper {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot pipe from a non-readable stream');
    }
    this._stream.pipe(dest);
    return this;
  }

  /**
   * Collect all data from a readable stream into an array.
   */
  async collect(): Promise<any[]> {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot collect from a non-readable stream');
    }

    const chunks: any[] = [];
    for await (const chunk of this._stream) {
      chunks.push(chunk);
    }
    return chunks;
  }

  /**
   * Collect all data as a single buffer/string.
   */
  async collectRaw(): Promise<Buffer> {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot collect from a non-readable stream');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of this._stream) {
      chunks.push(
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      );
    }
    return Buffer.concat(chunks);
  }

  /**
   * Map each chunk through a transformation function.
   * Returns a new StreamHelper with a Transform stream.
   */
  map<T>(fn: (chunk: any) => T): StreamHelper {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot map from a non-readable stream');
    }

    const transform = new Transform({
      objectMode: true,
      transform(chunk: any, encoding: BufferEncoding, callback) {
        try {
          const result = fn(chunk);
          callback(null, result);
        } catch (error) {
          callback(error as Error);
        }
      },
    });

    this._stream.pipe(transform);
    return new StreamHelper(transform);
  }

  /**
   * Filter chunks through a predicate function.
   * Returns a new StreamHelper with a Transform stream.
   */
  filter(fn: (chunk: any) => boolean): StreamHelper {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot filter from a non-readable stream');
    }

    const transform = new Transform({
      objectMode: true,
      transform(chunk: any, encoding: BufferEncoding, callback) {
        try {
          if (fn(chunk)) {
            callback(null, chunk);
          } else {
            callback(); // Skip this chunk
          }
        } catch (error) {
          callback(error as Error);
        }
      },
    });

    this._stream.pipe(transform);
    return new StreamHelper(transform);
  }

  /**
   * Reduce all chunks to a single value.
   */
  async reduce<T>(
    fn: (acc: T, chunk: any) => T,
    initial: T
  ): Promise<T> {
    if (!this.isReadable(this._stream)) {
      throw new Error('Cannot reduce from a non-readable stream');
    }

    let accumulator = initial;
    for await (const chunk of this._stream) {
      accumulator = fn(accumulator, chunk);
    }
    return accumulator;
  }

  /**
   * Get the underlying stream.
   */
  get stream(): Readable | Writable | Transform {
    return this._stream;
  }

  /**
   * Check if the underlying stream is readable.
   */
  get isReadableStream(): boolean {
    return this.isReadable(this._stream);
  }

  /**
   * Check if the underlying stream is writable.
   */
  get isWritableStream(): boolean {
    return this.isWritable(this._stream);
  }

  /**
   * Check if the underlying stream is a transform stream.
   */
  get isTransformStream(): boolean {
    return this._stream instanceof Transform;
  }

  private isReadable(stream: Readable | Writable | Transform): stream is Readable {
    return stream instanceof Readable;
  }

  private isWritable(stream: Readable | Writable | Transform): stream is Writable {
    return stream instanceof Writable;
  }
}

// ============================================================================
// StreamFactory - Create stream helpers from various sources
// ============================================================================

/**
 * Factory class for creating StreamHelper instances from various sources.
 */
export class StreamFactory {
  /**
   * Create a readable stream from an array of values.
   */
  static fromArray<T>(items: T[]): StreamHelper {
    const readable = new Readable({
      objectMode: true,
      read() {
        for (const item of items) {
          this.push(item);
        }
        this.push(null);
      },
    });
    return StreamHelper.fromReadable(readable);
  }

  /**
   * Create a readable stream from a string.
   */
  static fromString(content: string): StreamHelper {
    const readable = new Readable({
      read() {
        this.push(content);
        this.push(null);
      },
    });
    return StreamHelper.fromReadable(readable);
  }

  /**
   * Create a writable stream that collects all data.
   */
  static collector(): StreamHelper & { result: Promise<any[]> } {
    const collected: any[] = [];
    let resolve: (value: any[]) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<any[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const writable = new Writable({
      objectMode: true,
      write(chunk: any, encoding: BufferEncoding, callback) {
        try {
          collected.push(chunk);
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      final(callback) {
        resolve(collected);
        callback();
      },
    });

    const helper = StreamHelper.fromWritable(writable);
    return Object.assign(helper, { result: promise });
  }

  /**
   * Create a pass-through transform stream.
   */
  static passthrough(): StreamHelper {
    return StreamHelper.fromTransform(new PassThrough());
  }
}
