export interface RateLimitAlgorithm {
  consume(key: string, cost: number, limit: number, windowMs: number): Promise<{
    allowed: boolean;
    remaining: number;
    total: number;
    resetTime: number;
  }>;
  get(key: string): Promise<{
    remaining: number;
    total: number;
    resetTime: number;
  } | null>;
  reset(key: string): Promise<void>;
}

export class FixedWindowAlgorithm implements RateLimitAlgorithm {
  private windows: Map<string, { count: number; windowStart: number }> = new Map();

  async consume(key: string, cost: number, limit: number, windowMs: number) {
    const now = Date.now();
    const windowStart = now - (now % windowMs);
    const resetTime = windowStart + windowMs;

    let window = this.windows.get(key);
    if (!window || window.windowStart !== windowStart) {
      window = { count: 0, windowStart };
      this.windows.set(key, window);
    }

    window.count += cost;
    const allowed = window.count <= limit;
    const remaining = Math.max(0, limit - window.count);

    return {
      allowed,
      remaining,
      total: window.count,
      resetTime,
    };
  }

  async get(key: string) {
    const window = this.windows.get(key);
    if (!window) return null;

    const now = Date.now();
    const windowMs = 60000;
    const windowStart = now - (now % windowMs);
    const resetTime = windowStart + windowMs;

    if (window.windowStart !== windowStart) {
      return null;
    }

    return {
      remaining: Math.max(0, 100 - window.count),
      total: window.count,
      resetTime,
    };
  }

  async reset(key: string) {
    this.windows.delete(key);
  }
}

export class SlidingWindowAlgorithm implements RateLimitAlgorithm {
  private requests: Map<string, number[]> = new Map();

  async consume(key: string, cost: number, limit: number, windowMs: number) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    let timestamps = this.requests.get(key) ?? [];
    timestamps = timestamps.filter(t => t > windowStart);
    timestamps.push(...Array(cost).fill(now));
    this.requests.set(key, timestamps);

    const total = timestamps.length;
    const allowed = total <= limit;
    const remaining = Math.max(0, limit - total);

    return { allowed, remaining, total, resetTime };
  }

  async get(key: string) {
    const timestamps = this.requests.get(key);
    if (!timestamps || timestamps.length === 0) return null;

    const now = Date.now();
    const windowMs = 60000;
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    const validTimestamps = timestamps.filter(t => t > windowStart);
    const total = validTimestamps.length;

    return {
      remaining: Math.max(0, 100 - total),
      total,
      resetTime,
    };
  }

  async reset(key: string) {
    this.requests.delete(key);
  }
}

export class TokenBucketAlgorithm implements RateLimitAlgorithm {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  async consume(key: string, cost: number, limit: number, windowMs: number) {
    const now = Date.now();
    const refillRate = limit / (windowMs / 1000);
    const resetTime = now + windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const timePassed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(limit, bucket.tokens + timePassed * refillRate);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= cost;
    if (allowed) {
      bucket.tokens -= cost;
    }

    const remaining = Math.max(0, Math.floor(bucket.tokens));
    const total = limit - remaining;

    return { allowed, remaining, total, resetTime };
  }

  async get(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;

    const now = Date.now();
    const windowMs = 60000;
    const refillRate = 100 / (windowMs / 1000);
    const resetTime = now + windowMs;

    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokens = Math.min(100, bucket.tokens + timePassed * refillRate);

    return {
      remaining: Math.floor(tokens),
      total: 100 - Math.floor(tokens),
      resetTime,
    };
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }
}

export class LeakyBucketAlgorithm implements RateLimitAlgorithm {
  private buckets: Map<string, { level: number; lastLeak: number }> = new Map();

  async consume(key: string, cost: number, limit: number, windowMs: number) {
    const now = Date.now();
    const leakRate = limit / (windowMs / 1000);
    const resetTime = now + windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { level: 0, lastLeak: now };
      this.buckets.set(key, bucket);
    }

    const timePassed = (now - bucket.lastLeak) / 1000;
    bucket.level = Math.max(0, bucket.level - timePassed * leakRate);
    bucket.lastLeak = now;

    const allowed = bucket.level + cost <= limit;
    if (allowed) {
      bucket.level += cost;
    }

    const remaining = Math.max(0, limit - bucket.level);
    const total = limit - remaining;

    return { allowed, remaining, total, resetTime };
  }

  async get(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;

    const now = Date.now();
    const windowMs = 60000;
    const leakRate = 100 / (windowMs / 1000);
    const resetTime = now + windowMs;

    const timePassed = (now - bucket.lastLeak) / 1000;
    const level = Math.max(0, bucket.level - timePassed * leakRate);

    return {
      remaining: Math.max(0, 100 - level),
      total: level,
      resetTime,
    };
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }
}

export class SlidingWindowLogAlgorithm implements RateLimitAlgorithm {
  private logs: Map<string, { timestamp: number; count: number }[]> = new Map();

  async consume(key: string, cost: number, limit: number, windowMs: number) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    let logs = this.logs.get(key) ?? [];
    logs = logs.filter(l => l.timestamp > windowStart);

    const currentCount = logs.reduce((sum, l) => sum + l.count, 0);
    const allowed = currentCount + cost <= limit;

    if (allowed) {
      logs.push({ timestamp: now, count: cost });
      this.logs.set(key, logs);
    }

    const total = currentCount + (allowed ? cost : 0);
    const remaining = Math.max(0, limit - total);

    return { allowed, remaining, total, resetTime };
  }

  async get(key: string) {
    const logs = this.logs.get(key);
    if (!logs || logs.length === 0) return null;

    const now = Date.now();
    const windowMs = 60000;
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    const validLogs = logs.filter(l => l.timestamp > windowStart);
    const total = validLogs.reduce((sum, l) => sum + l.count, 0);

    return {
      remaining: Math.max(0, 100 - total),
      total,
      resetTime,
    };
  }

  async reset(key: string) {
    this.logs.delete(key);
  }
}

export function createAlgorithm(type: 'fixed' | 'sliding' | 'token-bucket' | 'leaky-bucket' | 'sliding-log'): RateLimitAlgorithm {
  switch (type) {
    case 'fixed':
      return new FixedWindowAlgorithm();
    case 'sliding':
      return new SlidingWindowAlgorithm();
    case 'token-bucket':
      return new TokenBucketAlgorithm();
    case 'leaky-bucket':
      return new LeakyBucketAlgorithm();
    case 'sliding-log':
      return new SlidingWindowLogAlgorithm();
    default:
      return new FixedWindowAlgorithm();
  }
}