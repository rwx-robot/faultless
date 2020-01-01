/**
 * Bloom Filter implementation for memory-efficient set membership testing.
 * Uses multiple hash functions and a bit array for probabilistic membership.
 */

/**
 * Calculates the optimal number of hash functions for a given false positive rate.
 * @param items - Expected number of items
 * @param fpRate - Desired false positive rate (0-1)
 * @returns Optimal number of hash functions
 */
function optimalHashFunctions(items: number, fpRate: number): number {
  return Math.ceil(Math.log(1 / fpRate) * Math.LOG2E);
}

/**
 * Calculates the optimal bit array size for given parameters.
 * @param items - Expected number of items
 * @param fpRate - Desired false positive rate (0-1)
 * @returns Optimal bit array size
 */
function optimalBits(items: number, fpRate: number): number {
  return Math.ceil((-items * Math.log(fpRate)) / (Math.LN2 * Math.LN2));
}

/**
 * Hash function using FNV-1a algorithm.
 * @param value - String to hash
 * @param seed - Hash seed
 * @returns 32-bit hash value
 */
function fnv1aHash(value: string, seed: number): number {
  let hash = seed ^ 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Second hash function for double hashing.
 * @param value - String to hash
 * @param seed - Hash seed
 * @returns 32-bit hash value
 */
function fnv1aHash2(value: string, seed: number): number {
  let hash = seed ^ 0x62b821d8;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

export interface BloomFilterOptions {
  /** Expected number of items to store */
  expectedItems: number;
  /** Desired false positive rate (0-1, default: 0.01) */
  falsePositiveRate?: number;
}

export interface SerializedBloomFilter {
  type: 'BloomFilter' | 'CountingBloomFilter';
  bits: number;
  hashFunctions: number;
  size: number;
  data: number[];
  countingData?: number[];
}

/**
 * Memory-efficient Bloom Filter implementation.
 * Supports add, has, and mightContain operations.
 */
export class BloomFilter {
  protected readonly bits: number;
  protected readonly hashFunctions: number;
  protected readonly expectedItems: number;
  protected readonly falsePositiveRate: number;
  protected readonly data: Uint32Array;
  protected _size: number = 0;

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    if (expectedItems <= 0) {
      throw new Error('Expected items must be positive');
    }
    if (falsePositiveRate <= 0 || falsePositiveRate >= 1) {
      throw new Error('False positive rate must be between 0 and 1 (exclusive)');
    }

    this.expectedItems = expectedItems;
    this.falsePositiveRate = falsePositiveRate;
    this.bits = optimalBits(expectedItems, falsePositiveRate);
    this.hashFunctions = optimalHashFunctions(expectedItems, falsePositiveRate);

    // Allocate Uint32 array (round up to nearest 32 bits)
    this.data = new Uint32Array(Math.ceil(this.bits / 32));
  }

  /**
   * Add an item to the Bloom Filter.
   * @param item - String item to add
   */
  add(item: string): void {
    const { index, bit } = this.getIndices(item);
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = (index + i * bit) % this.bits;
      const arrayIndex = Math.floor(bitIndex / 32);
      const bitOffset = bitIndex % 32;
      this.data[arrayIndex] |= (1 << bitOffset) >>> 0;
    }
    this._size++;
  }

  /**
   * Check if an item might be in the Bloom Filter.
   * Returns false if definitely not in the set.
   * Returns true if probably in the set (may be false positive).
   * @param item - String item to check
   * @returns true if item might be in the filter, false if definitely not
   */
  has(item: string): boolean {
    const { index, bit } = this.getIndices(item);
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = (index + i * bit) % this.bits;
      const arrayIndex = Math.floor(bitIndex / 32);
      const bitOffset = bitIndex % 32;
      if ((this.data[arrayIndex] & ((1 << bitOffset) >>> 0)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Alias for has() - Check if an item might be in the Bloom Filter.
   * @param item - String item to check
   * @returns true if item might be in the filter, false if definitely not
   */
  mightContain(item: string): boolean {
    return this.has(item);
  }

  /**
   * Get the number of items added to the filter.
   */
  get size(): number {
    return this._size;
  }

  /**
   * Get the size of the bit array.
   */
  getBits(): number {
    return this.bits;
  }

  /**
   * Get the number of hash functions used.
   */
  getHashFunctions(): number {
    return this.hashFunctions;
  }

  /**
   * Get the expected false positive rate.
   */
  getFalsePositiveRate(): number {
    return this.falsePositiveRate;
  }

  /**
   * Serialize the Bloom Filter to a portable format.
   * @returns Serialized representation
   */
  serialize(): SerializedBloomFilter {
    return {
      type: 'BloomFilter',
      bits: this.bits,
      hashFunctions: this.hashFunctions,
      size: this._size,
      data: Array.from(this.data),
    };
  }

  /**
   * Deserialize a Bloom Filter from a serialized format.
   * @param serialized - Serialized Bloom Filter data
   * @returns Restored Bloom Filter instance
   */
  static deserialize(serialized: SerializedBloomFilter): BloomFilter {
    const filter = new BloomFilter(1); // Dummy constructor
    (filter as any).bits = serialized.bits;
    (filter as any).hashFunctions = serialized.hashFunctions;
    (filter as any)._size = serialized.size;
    (filter as any).data = new Uint32Array(serialized.data);
    return filter;
  }

  /**
   * Calculate bit indices for an item using double hashing.
   */
  protected getIndices(item: string): { index: number; bit: number } {
    const index = fnv1aHash(item, 0x9747b28c) % this.bits;
    const bit = fnv1aHash2(item, 0x1b873593) % this.bits;
    return { index, bit };
  }
}

/**
 * Counting Bloom Filter that supports deletion operations.
 * Uses counters instead of bits, with each counter requiring 4 bits.
 */
export class CountingBloomFilter extends BloomFilter {
  protected readonly counters: Uint8Array;
  protected readonly maxCounterValue = 15; // 4-bit counter max

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    super(expectedItems, falsePositiveRate);
    // Each counter is 4 bits, so we need bits/2 bytes
    this.counters = new Uint8Array(Math.ceil(this.bits / 2));
  }

  /**
   * Add an item to the Counting Bloom Filter.
   * @param item - String item to add
   */
  add(item: string): void {
    const { index, bit } = this.getIndices(item);
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = (index + i * bit) % this.bits;
      this.incrementCounter(bitIndex);
    }
    this._size++;
  }

  /**
   * Remove an item from the Counting Bloom Filter.
   * Note: Removal may affect other items in the filter.
   * @param item - String item to remove
   * @returns true if the item was removed, false if it wasn't in the filter
   */
  remove(item: string): boolean {
    if (!this.has(item)) {
      return false;
    }

    const { index, bit } = this.getIndices(item);
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = (index + i * bit) % this.bits;
      this.decrementCounter(bitIndex);
    }
    this._size--;
    return true;
  }

  /**
   * Serialize the Counting Bloom Filter to a portable format.
   * @returns Serialized representation
   */
  serialize(): SerializedBloomFilter {
    return {
      type: 'CountingBloomFilter',
      bits: this.bits,
      hashFunctions: this.hashFunctions,
      size: this._size,
      data: Array.from(super.serialize().data),
      countingData: Array.from(this.counters),
    };
  }

  /**
   * Deserialize a Counting Bloom Filter from a serialized format.
   * @param serialized - Serialized Counting Bloom Filter data
   * @returns Restored Counting Bloom Filter instance
   */
  static deserialize(serialized: SerializedBloomFilter): CountingBloomFilter {
    const filter = new CountingBloomFilter(1); // Dummy constructor
    (filter as any).bits = serialized.bits;
    (filter as any).hashFunctions = serialized.hashFunctions;
    (filter as any)._size = serialized.size;
    (filter as any).data = new Uint32Array(serialized.data);
    if (serialized.countingData) {
      (filter as any).counters = new Uint8Array(serialized.countingData);
    }
    return filter;
  }

  /**
   * Increment a counter at a given bit index.
   */
  private incrementCounter(bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 2);
    const isHighNibble = bitIndex % 2 === 0;
    const currentValue = this.getCounterValue(byteIndex, isHighNibble);
    if (currentValue < this.maxCounterValue) {
      this.setCounterValue(byteIndex, isHighNibble, currentValue + 1);
    }
    // Update the bit array to reflect non-zero counter
    const arrayIndex = Math.floor(bitIndex / 32);
    const bitOffset = bitIndex % 32;
    this.data[arrayIndex] |= (1 << bitOffset) >>> 0;
  }

  /**
   * Decrement a counter at a given bit index.
   */
  private decrementCounter(bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 2);
    const isHighNibble = bitIndex % 2 === 0;
    const currentValue = this.getCounterValue(byteIndex, isHighNibble);
    if (currentValue > 0) {
      this.setCounterValue(byteIndex, isHighNibble, currentValue - 1);
      // Update the bit array if counter is now zero
      if (currentValue - 1 === 0) {
        const arrayIndex = Math.floor(bitIndex / 32);
        const bitOffset = bitIndex % 32;
        this.data[arrayIndex] &= ~((1 << bitOffset) >>> 0);
      }
    }
  }

  /**
   * Get counter value at a given byte and nibble position.
   */
  private getCounterValue(byteIndex: number, isHighNibble: boolean): number {
    const byte = this.counters[byteIndex];
    return isHighNibble ? (byte >> 4) & 0x0f : byte & 0x0f;
  }

  /**
   * Set counter value at a given byte and nibble position.
   */
  private setCounterValue(byteIndex: number, isHighNibble: boolean, value: number): void {
    const byte = this.counters[byteIndex];
    if (isHighNibble) {
      this.counters[byteIndex] = (byte & 0x0f) | ((value & 0x0f) << 4);
    } else {
      this.counters[byteIndex] = (byte & 0xf0) | (value & 0x0f);
    }
  }
}

export { optimalHashFunctions, optimalBits, fnv1aHash, fnv1aHash2 };
