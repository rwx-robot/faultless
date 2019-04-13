export interface RateLimitStore {
  increment(key: string, cost: number, windowMs: number, now: number): Promise<{ total: number; resetTime: number }>;
  get(key: string, windowStart: number, now: number): Promise<{ total: number; resetTime: number } | null>;
  decrement(key: string, cost: number): Promise<void>;
  delete?(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private data: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref?.();
  }

  async increment(key: string, cost: number, windowMs: number, now: number): Promise<{ total: number; resetTime: number }> {
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    let entry = this.data.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime };
      this.data.set(key, entry);
    }

    entry.count += cost;
    return { total: entry.count, resetTime };
  }

  async get(key: string, windowStart: number, now: number): Promise<{ total: number; resetTime: number } | null> {
    const entry = this.data.get(key);
    if (!entry || entry.resetTime <= now) {
      return null;
    }
    return { total: entry.count, resetTime: entry.resetTime };
  }

  async decrement(key: string, cost: number): Promise<void> {
    const entry = this.data.get(key);
    if (entry) {
      entry.count = Math.max(0, entry.count - cost);
      if (entry.count === 0) {
        this.data.delete(key);
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async resetAll(): Promise<void> {
    this.data.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.data.entries()) {
      if (entry.resetTime <= now) {
        this.data.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.data.clear();
  }
}

export interface RedisRateLimitStoreOptions {
  client: any;
  prefix?: string;
  luaScript?: string;
}

export class RedisRateLimitStore implements RateLimitStore {
  private client: any;
  private prefix: string;

  constructor(options: RedisRateLimitStoreOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? 'ratelimit:';
  }

  async increment(key: string, cost: number, windowMs: number, now: number): Promise<{ total: number; resetTime: number }> {
    const prefixedKey = `${this.prefix}${key}`;
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    const luaScript = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local cost = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])
      
      local current = redis.call('GET', key)
      if current then
        local data = cjson.decode(current)
        if data.reset_time > now then
          data.count = data.count + cost
          redis.call('SET', key, cjson.encode(data), 'PX', data.reset_time - now)
          return {data.count, data.reset_time}
        end
      end
      
      local new_data = {count = cost, reset_time = now + window_ms}
      redis.call('SET', key, cjson.encode(new_data), 'PX', window_ms)
      return {cost, now + window_ms}
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [prefixedKey],
        arguments: [windowStart, cost, now, windowMs],
      });
      return { total: result[0], resetTime: result[1] };
    } catch (error) {
      const pipeline = this.client.multi();
      pipeline.incrby(prefixedKey, cost);
      pipeline.pexpire(prefixedKey, windowMs);
      const results = await pipeline.exec();
      return { total: results[0], resetTime: now + windowMs };
    }
  }

  async get(key: string, windowStart: number, now: number): Promise<{ total: number; resetTime: number } | null> {
    const prefixedKey = `${this.prefix}${key}`;
    const data = await this.client.get(prefixedKey);
    if (!data) return null;

    const parsed = JSON.parse(data);
    if (parsed.reset_time <= now) {
      return null;
    }
    return { total: parsed.count, resetTime: parsed.reset_time };
  }

  async decrement(key: string, cost: number): Promise<void> {
    const prefixedKey = `${this.prefix}${key}`;
    await this.client.decrby(prefixedKey, cost);
  }

  async resetAll(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

export class ClusterRateLimitStore implements RateLimitStore {
  private stores: RateLimitStore[];
  private currentIndex = 0;

  constructor(stores: RateLimitStore[]) {
    this.stores = stores;
  }

  async increment(key: string, cost: number, windowMs: number, now: number): Promise<{ total: number; resetTime: number }> {
    const store = this.stores[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.stores.length;
    return store.increment(key, cost, windowMs, now);
  }

  async get(key: string, windowStart: number, now: number): Promise<{ total: number; resetTime: number } | null> {
    for (const store of this.stores) {
      const result = await store.get(key, windowStart, now);
      if (result) return result;
    }
    return null;
  }

  async decrement(key: string, cost: number): Promise<void> {
    await Promise.all(this.stores.map(s => s.decrement(key, cost)));
  }

  async resetAll(): Promise<void> {
    await Promise.all(this.stores.map(s => s.resetAll()));
  }
}

export function createStore(type: 'memory' | 'redis' | 'cluster', options?: any): RateLimitStore {
  switch (type) {
    case 'memory':
      return new MemoryRateLimitStore();
    case 'redis':
      return new RedisRateLimitStore(options);
    case 'cluster':
      return new ClusterRateLimitStore(options.stores);
    default:
      return new MemoryRateLimitStore();
  }
}