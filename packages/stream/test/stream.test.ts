import { describe, it, expect } from 'vitest';
import { StreamHelper, StreamFactory } from '../src';
import { Readable, Writable, Transform, PassThrough } from 'node:stream';

describe('StreamHelper', () => {
  describe('fromReadable', () => {
    it('should create helper from readable stream', async () => {
      const readable = Readable.from([1, 2, 3]);
      const helper = StreamHelper.fromReadable(readable);

      expect(helper.isReadableStream).toBe(true);
      const data = await helper.collect();
      expect(data).toEqual([1, 2, 3]);
    });

    it('should pipe to writable stream', async () => {
      const readable = Readable.from(['a', 'b', 'c']);
      const chunks: string[] = [];
      const writable = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        },
      });

      const helper = StreamHelper.fromReadable(readable);
      helper.pipe(writable);

      await new Promise((r) => setTimeout(r, 50));
      expect(chunks).toEqual(['a', 'b', 'c']);
    });

    it('should map chunks', async () => {
      const readable = Readable.from([1, 2, 3]);
      const helper = StreamHelper.fromReadable(readable);
      const result = await helper.map((x) => x * 2).collect();
      expect(result).toEqual([2, 4, 6]);
    });

    it('should filter chunks', async () => {
      const readable = Readable.from([1, 2, 3, 4, 5]);
      const helper = StreamHelper.fromReadable(readable);
      const result = await helper.filter((x) => x % 2 === 0).collect();
      expect(result).toEqual([2, 4]);
    });

    it('should reduce chunks', async () => {
      const readable = Readable.from([1, 2, 3, 4, 5]);
      const helper = StreamHelper.fromReadable(readable);
      const sum = await helper.reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(15);
    });

    it('should collect raw buffer', async () => {
      const readable = Readable.from(['hello', ' ', 'world']);
      const helper = StreamHelper.fromReadable(readable);
      const buffer = await helper.collectRaw();
      expect(buffer.toString()).toBe('hello world');
    });

    it('should throw when piping non-readable', () => {
      const writable = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      const helper = StreamHelper.fromWritable(writable);
      expect(() => helper.pipe(new PassThrough())).toThrow('Cannot pipe from a non-readable stream');
    });
  });

  describe('fromWritable', () => {
    it('should create helper from writable stream', () => {
      const writable = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      const helper = StreamHelper.fromWritable(writable);

      expect(helper.isWritableStream).toBe(true);
    });

    it(' should throw when collecting from non-readable', async () => {
      const writable = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      const helper = StreamHelper.fromWritable(writable);
      await expect(helper.collect()).rejects.toThrow('Cannot collect from a non-readable stream');
    });
  });

  describe('fromTransform', () => {
    it('should create helper from transform stream', async () => {
      const transform = new PassThrough();
      const helper = StreamHelper.fromTransform(transform);

      expect(helper.isTransformStream).toBe(true);
    });
  });
});

describe('StreamFactory', () => {
  describe('fromArray', () => {
    it('should create readable from array', async () => {
      const helper = StreamFactory.fromArray([1, 2, 3]);
      const data = await helper.collect();
      expect(data).toEqual([1, 2, 3]);
    });

    it('should handle empty array', async () => {
      const helper = StreamFactory.fromArray([]);
      const data = await helper.collect();
      expect(data).toEqual([]);
    });
  });

  describe('fromString', () => {
    it('should create readable from string', async () => {
      const helper = StreamFactory.fromString('hello');
      const data = await helper.collectRaw();
      expect(data.toString()).toBe('hello');
    });
  });

  describe('collector', () => {
    it('should collect all written data', async () => {
      const collector = StreamFactory.collector();
      const writable = collector.stream as Writable;

      writable.write('a');
      writable.write('b');
      writable.write('c');
      writable.end();

      const result = await collector.result;
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });

  describe('passthrough', () => {
    it('should pass through data unchanged', async () => {
      const helper = StreamFactory.passthrough();
      const transform = helper.stream as Transform;

      const readable = Readable.from(['a', 'b', 'c']);
      readable.pipe(transform);

      const result = await helper.collect();
      // Buffers are returned, compare their string values
      expect(result.map((b) => b.toString())).toEqual(['a', 'b', 'c']);
    });
  });
});
