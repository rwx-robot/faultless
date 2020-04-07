import { describe, it, expect, beforeEach } from 'vitest';
import {
  BloomFilter,
  CountingBloomFilter,
  optimalHashFunctions,
  optimalBits,
  fnv1aHash,
  fnv1aHash2,
} from '../src/index';

describe('bloom', () => {
  describe('BloomFilter', () => {
    let filter: BloomFilter;

    beforeEach(() => {
      filter = new BloomFilter(1000, 0.01);
    });

    describe('constructor', () => {
      it('should create a bloom filter with default false positive rate', () => {
        const f = new BloomFilter(100);
        expect(f.getFalsePositiveRate()).toBe(0.01);
        expect(f.getHashFunctions()).toBeGreaterThan(0);
        expect(f.getBits()).toBeGreaterThan(0);
      });

      it('should create a bloom filter with custom false positive rate', () => {
        const f = new BloomFilter(1000, 0.001);
        expect(f.getFalsePositiveRate()).toBe(0.001);
      });

      it('should throw error for invalid expected items', () => {
        expect(() => new BloomFilter(0)).toThrow('Expected items must be positive');
        expect(() => new BloomFilter(-1)).toThrow('Expected items must be positive');
      });

      it('should throw error for invalid false positive rate', () => {
        expect(() => new BloomFilter(100, 0)).toThrow('False positive rate must be between 0 and 1');
        expect(() => new BloomFilter(100, 1)).toThrow('False positive rate must be between 0 and 1');
        expect(() => new BloomFilter(100, -0.1)).toThrow('False positive rate must be between 0 and 1');
        expect(() => new BloomFilter(100, 1.1)).toThrow('False positive rate must be between 0 and 1');
      });
    });

    describe('add()', () => {
      it('should add items to the filter', () => {
        filter.add('hello');
        filter.add('world');
        expect(filter.size).toBe(2);
      });

      it('should handle duplicate additions', () => {
        filter.add('hello');
        filter.add('hello');
        expect(filter.size).toBe(2); // size counts additions, not unique items
      });

      it('should handle empty strings', () => {
        filter.add('');
        expect(filter.size).toBe(1);
      });

      it('should handle special characters', () => {
        filter.add('!@#$%^&*()');
        filter.add('中文测试');
        filter.add('🔥');
        expect(filter.size).toBe(3);
      });
    });

    describe('has()', () => {
      it('should return true for added items', () => {
        filter.add('hello');
        filter.add('world');
        expect(filter.has('hello')).toBe(true);
        expect(filter.has('world')).toBe(true);
      });

      it('should return false for items not added', () => {
        expect(filter.has('hello')).toBe(false);
        expect(filter.has('test')).toBe(false);
      });

      it('should handle empty strings', () => {
        filter.add('');
        expect(filter.has('')).toBe(true);
      });

      it('should have low false positive rate', () => {
        // Add some items
        for (let i = 0; i < 100; i++) {
          filter.add(`item-${i}`);
        }

        // Check for items that weren't added
        let falsePositives = 0;
        const testCount = 1000;
        for (let i = 0; i < testCount; i++) {
          if (filter.has(`nonexistent-${i}`)) {
            falsePositives++;
          }
        }

        // False positive rate should be close to 1% (with some margin)
        expect(falsePositives / testCount).toBeLessThan(0.05);
      });
    });

    describe('mightContain()', () => {
      it('should be an alias for has()', () => {
        filter.add('hello');
        expect(filter.mightContain('hello')).toBe(filter.has('hello'));
        expect(filter.mightContain('world')).toBe(filter.has('world'));
      });
    });

    describe('getters', () => {
      it('should return correct size', () => {
        expect(filter.size).toBe(0);
        filter.add('test');
        expect(filter.size).toBe(1);
      });

      it('should return correct bits count', () => {
        expect(filter.getBits()).toBeGreaterThan(0);
      });

      it('should return correct hash functions count', () => {
        expect(filter.getHashFunctions()).toBeGreaterThan(0);
      });
    });

    describe('serialize() and deserialize()', () => {
      it('should round-trip serialize and deserialize', () => {
        filter.add('hello');
        filter.add('world');
        filter.add('test');

        const serialized = filter.serialize();
        expect(serialized.type).toBe('BloomFilter');
        expect(serialized.size).toBe(3);

        const deserialized = BloomFilter.deserialize(serialized);
        expect(deserialized.has('hello')).toBe(true);
        expect(deserialized.has('world')).toBe(true);
        expect(deserialized.has('test')).toBe(true);
        expect(deserialized.has('missing')).toBe(false);
      });

      it('should preserve filter properties', () => {
        const serialized = filter.serialize();
        const deserialized = BloomFilter.deserialize(serialized);
        expect(deserialized.getBits()).toBe(filter.getBits());
        expect(deserialized.getHashFunctions()).toBe(filter.getHashFunctions());
      });
    });
  });

  describe('CountingBloomFilter', () => {
    let filter: CountingBloomFilter;

    beforeEach(() => {
      filter = new CountingBloomFilter(1000, 0.01);
    });

    describe('constructor', () => {
      it('should create a counting bloom filter', () => {
        expect(filter).toBeInstanceOf(CountingBloomFilter);
        expect(filter.getFalsePositiveRate()).toBe(0.01);
      });
    });

    describe('add()', () => {
      it('should add items to the filter', () => {
        filter.add('hello');
        filter.add('world');
        expect(filter.size).toBe(2);
      });

      it('should handle multiple additions of same item', () => {
        filter.add('hello');
        filter.add('hello');
        expect(filter.size).toBe(2);
        expect(filter.has('hello')).toBe(true);
      });
    });

    describe('remove()', () => {
      it('should remove an item from the filter', () => {
        filter.add('hello');
        filter.add('world');
        expect(filter.has('hello')).toBe(true);

        const removed = filter.remove('hello');
        expect(removed).toBe(true);
        // Note: has() may still return true due to counter behavior
        // This is a known limitation of counting bloom filters
      });

      it('should return false when removing non-existent item', () => {
        filter.add('hello');
        const removed = filter.remove('world');
        expect(removed).toBe(false);
      });

      it('should handle multiple additions and removals', () => {
        filter.add('hello');
        filter.add('hello');
        filter.add('hello');
        filter.remove('hello');
        filter.remove('hello');
        // After removing 2 of 3, should still "have" the item
        expect(filter.has('hello')).toBe(true);
      });
    });

    describe('serialize() and deserialize()', () => {
      it('should round-trip serialize and deserialize', () => {
        filter.add('hello');
        filter.add('world');

        const serialized = filter.serialize();
        expect(serialized.type).toBe('CountingBloomFilter');
        expect(serialized.countingData).toBeDefined();

        const deserialized = CountingBloomFilter.deserialize(serialized);
        expect(deserialized.has('hello')).toBe(true);
        expect(deserialized.has('world')).toBe(true);
      });
    });
  });

  describe('utility functions', () => {
    describe('optimalHashFunctions()', () => {
      it('should return positive number of hash functions', () => {
        const count = optimalHashFunctions(1000, 0.01);
        expect(count).toBeGreaterThan(0);
      });

      it('should return more hash functions for lower false positive rate', () => {
        const count1 = optimalHashFunctions(1000, 0.1);
        const count2 = optimalHashFunctions(1000, 0.01);
        expect(count2).toBeGreaterThan(count1);
      });
    });

    describe('optimalBits()', () => {
      it('should return positive bit count', () => {
        const bits = optimalBits(1000, 0.01);
        expect(bits).toBeGreaterThan(0);
      });

      it('should return more bits for lower false positive rate', () => {
        const bits1 = optimalBits(1000, 0.1);
        const bits2 = optimalBits(1000, 0.01);
        expect(bits2).toBeGreaterThan(bits1);
      });
    });

    describe('fnv1aHash()', () => {
      it('should produce consistent hashes', () => {
        const hash1 = fnv1aHash('hello', 0);
        const hash2 = fnv1aHash('hello', 0);
        expect(hash1).toBe(hash2);
      });

      it('should produce different hashes for different inputs', () => {
        const hash1 = fnv1aHash('hello', 0);
        const hash2 = fnv1aHash('world', 0);
        expect(hash1).not.toBe(hash2);
      });

      it('should produce different hashes for different seeds', () => {
        const hash1 = fnv1aHash('hello', 0);
        const hash2 = fnv1aHash('hello', 1);
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('fnv1aHash2()', () => {
      it('should produce consistent hashes', () => {
        const hash1 = fnv1aHash2('hello', 0);
        const hash2 = fnv1aHash2('hello', 0);
        expect(hash1).toBe(hash2);
      });

      it('should produce different hashes than fnv1aHash', () => {
        const hash1 = fnv1aHash('hello', 0);
        const hash2 = fnv1aHash2('hello', 0);
        expect(hash1).not.toBe(hash2);
      });
    });
  });

  describe('performance', () => {
    it('should handle large number of items efficiently', () => {
      const largeFilter = new BloomFilter(100000, 0.001);
      const startTime = Date.now();

      // Add 10000 items
      for (let i = 0; i < 10000; i++) {
        largeFilter.add(`item-${i}`);
      }

      // Check for existing items
      for (let i = 0; i < 1000; i++) {
        largeFilter.has(`item-${i}`);
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
      expect(largeFilter.size).toBe(10000);
    });
  });
});
