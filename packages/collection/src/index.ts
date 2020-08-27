import { EventEmitter } from 'events';

// ─── Cache (TTL + LRU Cache) ──────────────────────────────────────────────

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxEntries?: number;
  ttl?: number;
}

export class Cache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly defaultTTL: number;
  private readonly emitter = new EventEmitter();
  
  // LRU tracking
  private accessOrder: K[] = [];
  private accessIndex = new Map<K, number>();

  constructor(options?: CacheOptions) {
    this.maxEntries = options?.maxEntries ?? Infinity;
    this.defaultTTL = options?.ttl ?? 300_000; // 5 minutes
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.delete(key);
      this.emitter.emit('expired', key, entry.value);
      return undefined;
    }
    
    // Update LRU tracking
    entry.lastAccessed = now;
    this.touchKey(key);
    
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const now = Date.now();
    
    if (this.store.has(key)) {
      // Update existing entry
      const entry = this.store.get(key)!;
      entry.value = value;
      entry.expiresAt = now + (ttl ?? this.defaultTTL);
      entry.lastAccessed = now;
      this.touchKey(key);
      return;
    }
    
    // Evict if at capacity
    if (this.store.size >= this.maxEntries) {
      this.evictLRU();
    }
    
    const expiresAt = now + (ttl ?? this.defaultTTL);
    this.store.set(key, { value, expiresAt, lastAccessed: now });
    this.addToAccessOrder(key);
  }

  delete(key: K): boolean {
    const existed = this.store.delete(key);
    if (existed) {
      this.removeFromAccessOrder(key);
    }
    return existed;
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.store.clear();
    this.accessOrder = [];
    this.accessIndex.clear();
  }

  get size(): number {
    this.evictExpired();
    return this.store.size;
  }

  entries(): [K, V][] {
    this.evictExpired();
    const result: [K, V][] = [];
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now <= entry.expiresAt) {
        result.push([key, entry.value]);
      }
    }
    return result;
  }

  on(event: 'expired', listener: (key: K, value: V) => void): void {
    this.emitter.on(event, listener);
  }

  private touchKey(key: K): void {
    const idx = this.accessIndex.get(key);
    if (idx !== undefined) {
      // Move to end (most recently used)
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(key);
      this.accessIndex.set(key, this.accessOrder.length - 1);
      // Rebuild index for simplicity (can be optimized further)
      this.rebuildIndex();
    }
  }

  private addToAccessOrder(key: K): void {
    this.accessOrder.push(key);
    this.accessIndex.set(key, this.accessOrder.length - 1);
  }

  private removeFromAccessOrder(key: K): void {
    const idx = this.accessIndex.get(key);
    if (idx !== undefined) {
      this.accessOrder.splice(idx, 1);
      this.accessIndex.delete(key);
      this.rebuildIndex();
    }
  }

  private rebuildIndex(): void {
    this.accessIndex.clear();
    for (let i = 0; i < this.accessOrder.length; i++) {
      this.accessIndex.set(this.accessOrder[i], i);
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        this.removeFromAccessOrder(key);
        this.emitter.emit('expired', key, entry.value);
      }
    }
  }

  private evictLRU(): void {
    // Find least recently used key
    for (const key of this.accessOrder) {
      if (this.store.has(key)) {
        this.delete(key);
        return;
      }
    }
  }
}

// ─── Ring (Ring Buffer) ─────────────────────────────────────────────────────

// Optimized Ring buffer with TypedArray support for numeric types
export class Ring<T> {
  private readonly buffer: (T | undefined)[];
  private readonly cap: number;
  private head = 0;
  private _size = 0;
  
  // TypedArray optimization for numeric types
  private typedBuffer?: Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
  private isTyped = false;

  constructor(capacity: number, useTypedArray = false) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.cap = capacity;
    
    // For numeric types, use TypedArray for better performance
    if (useTypedArray) {
      // Default to Float64, can be specialized further
      this.typedBuffer = new Float64Array(capacity);
      this.isTyped = true;
      this.buffer = [];
    } else {
      this.buffer = new Array(capacity);
    }
  }

  add(item: T): void {
    if (this.isTyped && typeof item === 'number') {
      (this.typedBuffer as any)[this.head] = item;
    } else {
      this.buffer[this.head] = item;
    }
    this.head = (this.head + 1) % this.cap;
    if (this._size < this.cap) this._size++;
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    const actualIndex = (this.head - this._size + index + this.cap) % this.cap;
    
    if (this.isTyped) {
      return (this.typedBuffer as any)[actualIndex] as T;
    }
    return this.buffer[actualIndex];
  }

  toArray(): T[] {
    const result: T[] = [];
    
    if (this.isTyped) {
      // Optimized path for TypedArray
      const startIdx = (this.head - this._size + this.cap) % this.cap;
      for (let i = 0; i < this._size; i++) {
        const idx = (startIdx + i) % this.cap;
        result.push((this.typedBuffer as any)[idx]);
      }
    } else {
      const startIdx = (this.head - this._size + this.cap) % this.cap;
      for (let i = 0; i < this._size; i++) {
        const idx = (startIdx + i) % this.cap;
        result.push(this.buffer[idx]!);
      }
    }
    
    return result;
  }

  get size(): number {
    return this._size;
  }

  get capacity(): number {
    return this.cap;
  }

  clear(): void {
    if (this.isTyped) {
      this.typedBuffer!.fill(0);
    } else {
      this.buffer.fill(undefined);
    }
    this.head = 0;
    this._size = 0;
  }
  
  // Create optimized Ring buffers for numeric types
  static createInt8(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Int8Array(capacity);
    return ring;
  }
  
  static createUint8(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Uint8Array(capacity);
    return ring;
  }
  
  static createInt16(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Int16Array(capacity);
    return ring;
  }
  
  static createUint16(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Uint16Array(capacity);
    return ring;
  }
  
  static createInt32(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Int32Array(capacity);
    return ring;
  }
  
  static createUint32(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Uint32Array(capacity);
    return ring;
  }
  
  static createFloat32(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Float32Array(capacity);
    return ring;
  }
  
  static createFloat64(capacity: number): Ring<number> {
    const ring = new Ring<number>(capacity, true);
    (ring as any).typedBuffer = new Float64Array(capacity);
    return ring;
  }
}

// ─── EnhancedSet ────────────────────────────────────────────────────────────

export class EnhancedSet<T> {
  private readonly store: Set<T>;

  constructor(items?: T[]) {
    this.store = new Set(items);
  }

  add(item: T): void {
    this.store.add(item);
  }

  delete(item: T): boolean {
    return this.store.delete(item);
  }

  has(item: T): boolean {
    return this.store.has(item);
  }

  union(other: EnhancedSet<T>): EnhancedSet<T> {
    const result = new EnhancedSet<T>(this.toArray());
    for (const item of other.toArray()) {
      result.add(item);
    }
    return result;
  }

  intersection(other: EnhancedSet<T>): EnhancedSet<T> {
    const result = new EnhancedSet<T>();
    for (const item of this.store) {
      if (other.has(item)) result.add(item);
    }
    return result;
  }

  difference(other: EnhancedSet<T>): EnhancedSet<T> {
    const result = new EnhancedSet<T>();
    for (const item of this.store) {
      if (!other.has(item)) result.add(item);
    }
    return result;
  }

  symmetricDifference(other: EnhancedSet<T>): EnhancedSet<T> {
    const result = new EnhancedSet<T>();
    for (const item of this.store) {
      if (!other.has(item)) result.add(item);
    }
    for (const item of other.toArray()) {
      if (!this.store.has(item)) result.add(item);
    }
    return result;
  }

  isSubsetOf(other: EnhancedSet<T>): boolean {
    for (const item of this.store) {
      if (!other.has(item)) return false;
    }
    return true;
  }

  isSupersetOf(other: EnhancedSet<T>): boolean {
    return other.isSubsetOf(this);
  }

  toArray(): T[] {
    return Array.from(this.store);
  }

  get size(): number {
    return this.store.size;
  }
}

// ─── Queue (FIFO) ───────────────────────────────────────────────────────────

export class Queue<T> {
  private readonly items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items.length = 0;
  }
}

// ─── Stack (LIFO) ───────────────────────────────────────────────────────────

export class Stack<T> {
  private readonly items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items.length = 0;
  }
}

// ─── PriorityQueue ──────────────────────────────────────────────────────────

interface PQEntry<T> {
  item: T;
  priority: number;
}

export class PriorityQueue<T> {
  private readonly heap: PQEntry<T>[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator?: (a: T, b: T) => number) {
    this.comparator = comparator ?? ((a, b) => (a as any) - (b as any));
  }

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top.item;
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private compare(a: PQEntry<T>, b: PQEntry<T>): number {
    const d = a.priority - b.priority;
    return d !== 0 ? d : this.comparator(a.item, b.item);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[parent], this.heap[index]) <= 0) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}
