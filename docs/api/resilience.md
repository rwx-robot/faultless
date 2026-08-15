# @Faultless/resilience

> 弹性组件包：熔断器、限流器、缓存管理、舱壁隔离、智能重试，提升微服务的可靠性和容错能力。

## 安装

```bash
pnpm add @Faultless/breaker @Faultless/limit @Faultless/cache @Faultless/store @Faultless/resilience
```

## 熔断器 (@Faultless/breaker)

### CircuitBreaker

```typescript
class CircuitBreaker extends EventEmitter {
  constructor(config: CircuitBreakerConfig);
  getState(): CircuitBreakerState;
  getStats(): CircuitBreakerStats;
  execute<T>(operation: () => Promise<T>): Promise<T>;
  reset(): void;
  forceOpen(): void;
  forceClosed(): void;
  getName(): string;
}
```

#### 状态

| 状态 | 说明 |
|------|------|
| `CLOSED` | 正常状态，请求正常通过 |
| `OPEN` | 熔断状态，拒绝所有请求 |
| `HALF_OPEN` | 半开状态，允许少量请求试探 |

#### 配置

```typescript
interface CircuitBreakerConfig {
  name: string;
  threshold: number;        // 失败次数阈值，达到后打开熔断器
  timeout: number;          // 熔断器打开持续时间 (ms)
  resetTimeout: number;     // 半开状态到关闭的超时 (ms)
  fallback?: (error: Error) => Promise<any> | any;
  isFailure?: (error: Error) => boolean;
  onStateChange?: (state: CircuitBreakerState, previousState: CircuitBreakerState) => void;
}
```

#### 使用示例

```typescript
import { createCircuitBreaker } from '@Faultless/breaker';

const breaker = createCircuitBreaker({
  name: 'user-service',
  threshold: 5,         // 5 次失败后打开
  timeout: 30000,       // 30 秒后尝试恢复
  resetTimeout: 10000,  // 半开后 10 秒内成功则关闭
  fallback: async (error) => {
    return { message: 'Service temporarily unavailable' };
  },
  onStateChange: (state, prev) => {
    console.log(`Circuit breaker: ${prev} -> ${state}`);
  },
});

try {
  const result = await breaker.execute(async () => {
    return await fetchUserData(userId);
  });
} catch (error) {
  // 熔断器打开时会触发 fallback 或抛出错误
}
```

#### CircuitBreakerRegistry

```typescript
import { circuitBreakerRegistry } from '@Faultless/breaker';

// 注册表管理多个熔断器
const breaker = circuitBreakerRegistry.getOrCreate({
  name: 'user-service',
  threshold: 5,
  timeout: 30000,
  resetTimeout: 10000,
});

// 获取所有熔断器状态
const allStats = circuitBreakerRegistry.getAllStats();
// => { 'user-service': { state: 'closed', failures: 0, ... }, ... }

// 重置所有
circuitBreakerRegistry.resetAll();
```

## 限流器 (@Faultless/limit)

### RateLimiter

```typescript
class RateLimiter extends EventEmitter {
  constructor(config: RateLimitConfig);
  consume(key: string, cost?: number): Promise<RateLimitResult>;
  get(key: string): Promise<RateLimitResult | null>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
  getConfig(): RateLimitConfig;
  updateConfig(config: Partial<RateLimitConfig>): void;
}
```

#### 配置

```typescript
interface RateLimitConfig {
  name: string;
  windowMs: number;            // 时间窗口 (ms)
  max: number;                 // 窗口内最大请求数
  store?: RateLimitStore;      // 存储后端
  keyPrefix?: string;          // 键前缀
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: (result: RateLimitResult) => void;
}
```

#### 使用示例

```typescript
import { createRateLimiter } from '@Faultless/limit';

const limiter = createRateLimiter({
  name: 'api',
  windowMs: 60000,  // 1 分钟窗口
  max: 100,         // 最多 100 请求
});

// 消费配额
const result = await limiter.consume('user-123');
if (!result.allowed) {
  throw new TooManyRequestsError('Rate limit exceeded', result.resetTime);
}
// result: { allowed: true, limit: 100, remaining: 99, resetTime: Date, total: 1 }

// 检查当前状态
const status = await limiter.get('user-123');

// 重置
await limiter.reset('user-123');
```

#### 存储选项

```typescript
// 内存存储（默认，适合单实例）
import { MemoryRateLimitStore } from '@Faultless/limit';
const store = new MemoryRateLimitStore();

// Redis 存储（适合分布式）
import { RedisRateLimitStore } from '@Faultless/limit';
const store = new RedisRateLimitStore({
  host: 'localhost',
  port: 6379,
});
```

## 缓存管理 (@Faultless/cache)

### CacheManager

```typescript
@Injectable()
class CacheManager {
  constructor(options: CacheOptions);
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;
  mdel(keys: string[]): Promise<number>;
  clear(): Promise<void>;
  getStats(): CacheStats;
  close(): Promise<void>;
}
```

#### 配置

```typescript
interface CacheOptions {
  provider: CacheProvider;
  ttl?: number;          // 默认 TTL (ms)，默认 60000
  prefix?: string;       // 键前缀，默认 'Faultless:'
  serialize?: boolean;   // 序列化，默认 true
  max?: number;          // 最大条目数，默认 1000
}
```

#### 使用示例

```typescript
import { createCacheManager, CacheProvider } from '@Faultless/cache';

const cache = createCacheManager({
  provider: CacheProvider.MEMORY,
  ttl: 300000,  // 5 分钟
  prefix: 'user:',
});

// 基本操作
await cache.set('profile:123', { id: 123, name: 'John' });
const profile = await cache.get<{ id: number; name: string }>('profile:123');
await cache.delete('profile:123');

// Cache-Aside 模式
const user = await cache.getOrSet(
  `user:${userId}`,
  async () => await userService.findById(userId),
  300000  // 5 分钟 TTL
);

// 批量操作
await cache.mset([
  { key: 'user:1', value: { id: 1 }, ttl: 60000 },
  { key: 'user:2', value: { id: 2 }, ttl: 60000 },
]);
const users = await cache.mget(['user:1', 'user:2']);

// 统计
const stats = cache.getStats();
// => { hits: 100, misses: 10, sets: 50, deletes: 5, hitRate: 0.909, size: 45 }
```

### MultiLevelCache

```typescript
import { createMultiLevelCache, CacheProvider } from '@Faultless/cache';

const multiCache = createMultiLevelCache({
  l1: { provider: CacheProvider.MEMORY, max: 1000, ttl: 60000 },      // L1: 内存
  l2: { provider: CacheProvider.REDIS, ttl: 300000, redis: {           // L2: Redis
    host: 'localhost', port: 6379,
  }},
});

// 自动 L1 -> L2 查找
const data = await multiCache.get('key');

// 写入自动同步到 L1 和 L2
await multiCache.set('key', value, 300000);
```

### 缓存装饰器

```typescript
import { Cached, CacheInvalidate } from '@Faultless/cache';

class UserService {
  @Cached({ key: 'user', ttl: 300000 })
  async findById(id: string) {
    return await db.query('SELECT * FROM users WHERE id = $1', [id]);
  }

  @CacheInvalidate('user')
  async update(id: string, data: Partial<User>) {
    return await db.query('UPDATE users SET ... WHERE id = $1', [id]);
  }
}
```

## 舱壁隔离 (@Faultless/resilience)

### Bulkhead

```typescript
class Bulkhead {
  constructor(options: BulkheadOptions);
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): BulkheadStateInfo;
  reset(): void;
  close(): void;
}
```

#### 配置

```typescript
interface BulkheadOptions {
  name: string;
  maxConcurrent?: number;        // 最大并发数，默认 10
  maxQueued?: number;            // 最大排队数，默认 0
  timeoutMs?: number;            // 执行超时 (ms)，默认 30000
  degradationThreshold?: number; // 降级阈值 (%), 默认 80
  queueTimeoutMs?: number;       // 排队超时 (ms)，默认 5000
  onStateChange?: (state: BulkheadState) => void;
  onRejection?: (error: FaultlessError) => void;
}
```

#### 使用示例

```typescript
import { createBulkhead } from '@Faultless/resilience';

const bulkhead = createBulkhead({
  name: 'payment-service',
  maxConcurrent: 5,     // 最多 5 个并发请求
  maxQueued: 10,        // 最多排队 10 个
  queueTimeoutMs: 5000, // 排队超过 5 秒拒绝
  onStateChange: (state) => {
    console.log(`Bulkhead state: ${state}`);
  },
});

try {
  const result = await bulkhead.execute(async () => {
    return await processPayment(orderId);
  });
} catch (error) {
  if (error.code === 'BULKHEAD_REJECTED') {
    // 舱壁已满
  }
}

// 查看状态
const state = bulkhead.getState();
// => { state: 'CLOSED', running: 2, queued: 0, maxConcurrent: 5, ... }
```

## 智能重试 (@Faultless/resilience)

### SmartRetryEngine

```typescript
class SmartRetryEngine {
  constructor(defaultPolicy?: Partial<RetryPolicy>);
  registerEndpoint(config: EndpointRetryConfig): void;
  getPolicy(path: string, method?: string): RetryPolicy;
  execute<T>(fn: () => Promise<T>, options: {...}): Promise<RetryResult<T>>;
}
```

#### 重试策略

| 策略 | 说明 |
|------|------|
| `FIXED` | 固定延迟 |
| `EXPONENTIAL` | 指数退避 |
| `LINEAR` | 线性退避 |
| `FIBONACCI` | 斐波那契退避 |
| `DECORRELATED` | 去相关抖动 |

#### 使用示例

```typescript
import { createSmartRetryEngine, RetryStrategy } from '@Faultless/resilience';

const retryEngine = createSmartRetryEngine({
  strategy: RetryStrategy.EXPONENTIAL,
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  jitterMs: 0.5,
  retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'],
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  respectRetryAfter: true,
  circuitBreakerAware: true,
});

// 为特定端点注册策略
retryEngine.registerEndpoint({
  path: '/api/payment',
  method: 'POST',
  policy: {
    strategy: RetryStrategy.EXPONENTIAL,
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
  },
});

// 执行带重试
const result = await retryEngine.execute(
  async () => await fetchData(),
  {
    path: '/api/data',
    method: 'GET',
    circuitBreaker: breaker,
    onRetry: (attempt) => {
      console.log(`Retry #${attempt.attempt} after ${attempt.delayMs}ms`);
    },
  }
);

if (!result.success) {
  console.log('All retries failed:', result.attempts);
}
```
