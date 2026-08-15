# @Faultless/core

> 核心包：提供基础类型定义、工具函数、错误体系、装饰器元数据、生命周期管理和依赖注入容器。

## 安装

```bash
pnpm add @Faultless/core
```

## 模块导出

```typescript
import {
  // 类型
  Constructor, Factory, ServiceIdentifier, DynamicModule, Provider, InjectionToken,
  LifecycleHook, HealthCheckResult, HealthIndicator, LogLevel, LogEntry,
  RetryOptions, TimeoutOptions, CircuitBreakerOptions, RateLimitOptions, CacheOptions,
  DatabaseOptions, RedisOptions, AuthOptions, QueueOptions, GatewayOptions,
  CLICommand, CLIArgument, CLIOption,

  // 工具函数
  generateId, generateRequestId, generateTraceId, generateSpanId,
  hashString, sleep, retry, timeout, TimeoutError,
  deepMerge, omit, pick, isPlainObject,
  flattenObject, unflattenObject, parseEnvValue, maskSensitive,
  formatBytes, formatDuration, chunkArray, uniqueArray, groupBy,

  // 错误类
  NofaultError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError,
  ConflictError, TooManyRequestsError, InternalServerError, ServiceUnavailableError,
  GatewayTimeoutError, CircuitBreakerOpenError, RateLimitExceededError,
  ConfigurationError, DependencyError, SerializationError, DeserializationError,
  isNofaultError, isRetryableError,

  // 装饰器
  Module, Global, Injectable, Controller, Middleware, Guard, Interceptor, Pipe, Filter,
  Inject, Optional, Get, Post, Put, Delete, Patch, Options, Head, All,
  UseGuards, UseInterceptors, UsePipes, UseFilters, UseMiddleware, SetMetadata,
  getRouteMetadata, getControllerPrefix, isController, isProvider, isModule,

  // 生命周期
  LifecycleManager, lifecycleManager, ServiceContainer, serviceContainer,
  createServiceIdentifier, bootstrap, shutdown,
} from '@Faultless/core';
```

## 核心类型

### Constructor

```typescript
type Constructor<T = unknown> = new (...args: unknown[]) => T;
```

类构造函数类型，用于 DI 和装饰器。

### ServiceIdentifier

```typescript
interface ServiceIdentifier<T = unknown> {
  name: string;
  symbol?: symbol;
}
```

服务标识符，支持名称和 Symbol 两种方式定位服务。

### Provider

```typescript
interface Provider<T = unknown> {
  provide: Constructor<T> | string | symbol;
  useClass?: Constructor<T>;
  useValue?: T;
  useFactory?: Factory<T>;
  inject?: Array<Constructor | string | symbol>;
}
```

服务提供者，支持类实例、值、工厂三种注入方式。

### DynamicModule

```typescript
interface DynamicModule extends ModuleMetadata {
  module: Constructor;
  global?: boolean;
}
```

动态模块，支持运行时配置模块依赖。

### LifecycleHook

```typescript
interface LifecycleHook {
  onModuleInit?(): void | Promise<void>;
  onApplicationBootstrap?(): void | Promise<void>;
  onModuleDestroy?(): void | Promise<void>;
  beforeApplicationShutdown?(): void | Promise<void>;
  onApplicationShutdown?(): void | Promise<void>;
}
```

生命周期钩子，模块可在各阶段执行初始化/清理逻辑。

## 工具函数

### ID 生成

```typescript
// 生成带前缀的唯一 ID
generateId('user_'); // => 'user_lk3j2x8a...'

// 生成请求 ID
generateRequestId(); // => 'req_lk3j2x8a...'

// 生成追踪 ID
generateTraceId(); // => 'trace_lk3j2x8a...'

// 生成 Span ID
generateSpanId(); // => 'a1b2c3d4e5f6...'
```

### 重试与超时

```typescript
// 带指数退避的重试
await retry(
  async () => await fetchData(),
  {
    retries: 3,
    delay: 100,
    backoff: 'exponential',
    maxDelay: 5000,
    retryable: (error) => error.code === 'ECONNRESET',
  }
);

// 超时控制
await timeout(fetch('https://api.example.com'), 5000, '请求超时');
```

### 对象工具

```typescript
// 深度合并
deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 } });
// => { a: 1, b: { c: 2, d: 3 } }

// 选择/排除字段
omit({ a: 1, b: 2, c: 3 }, ['b']); // => { a: 1, c: 3 }
pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // => { a: 1, c: 3 }

// 对象扁平化/反扁平化
flattenObject({ a: { b: 1, c: 2 } }); // => { 'a.b': 1, 'a.c': 2 }
unflattenObject({ 'a.b': 1 }); // => { a: { b: 1 } }

// 敏感数据脱敏
maskSensitive({ password: '123', name: 'John' });
// => { password: '***MASKED***', name: 'John' }
```

### 数组工具

```typescript
chunkArray([1, 2, 3, 4, 5], 2); // => [[1, 2], [3, 4], [5]]
uniqueArray([1, 2, 2, 3, 3]); // => [1, 2, 3]
groupBy([{ type: 'a', v: 1 }, { type: 'a', v: 2 }, { type: 'b', v: 3 }], i => i.type);
// => { a: [{type:'a',v:1}, {type:'a',v:2}], b: [{type:'b',v:3}] }
```

## 错误体系

所有错误继承自 `NofaultError`，包含统一的错误码和 HTTP 状态码。

```typescript
class NofaultError extends Error {
  readonly code: string;        // 业务错误码
  readonly statusCode: number;  // HTTP 状态码
  readonly details?: Record<string, unknown>;
  readonly timestamp: Date;
  readonly requestId?: string;

  toJSON(): object; // 序列化为标准错误响应
}
```

### 错误类层级

| 错误类 | 错误码 | HTTP 状态码 | 说明 |
|--------|--------|-------------|------|
| `ValidationError` | `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `NotFoundError` | `NOT_FOUND` | 404 | 资源不存在 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 | 未认证 |
| `ForbiddenError` | `FORBIDDEN` | 403 | 无权限 |
| `ConflictError` | `CONFLICT` | 409 | 资源冲突 |
| `TooManyRequestsError` | `TOO_MANY_REQUESTS` | 429 | 请求过多 |
| `InternalServerError` | `INTERNAL_SERVER_ERROR` | 500 | 服务器内部错误 |
| `ServiceUnavailableError` | `SERVICE_UNAVAILABLE` | 503 | 服务不可用 |
| `GatewayTimeoutError` | `GATEWAY_TIMEOUT` | 504 | 网关超时 |
| `CircuitBreakerOpenError` | `CIRCUIT_BREAKER_OPEN` | 503 | 熔断器打开 |
| `RateLimitExceededError` | `RATE_LIMIT_EXCEEDED` | 429 | 限流触发 |
| `ConfigurationError` | `CONFIGURATION_ERROR` | 500 | 配置错误 |
| `DependencyError` | `DEPENDENCY_ERROR` | 500 | 依赖服务错误 |
| `SerializationError` | `SERIALIZATION_ERROR` | 500 | 序列化错误 |
| `DeserializationError` | `DESERIALIZATION_ERROR` | 400 | 反序列化错误 |

```typescript
// 判断是否为 Faultless 错误
if (isNofaultError(error)) {
  console.log(error.code, error.statusCode);
}

// 判断是否可重试
if (isRetryableError(error)) {
  await retry(fn, options);
}
```

## 装饰器系统

### 模块装饰器

```typescript
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
  global: true,
})
class AppModule {}

@Global()
@Module({ ... })
class SharedModule {}
```

### 服务装饰器

```typescript
@Injectable({ scope: 'singleton' }) // 默认单例
class UserService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
}

// 可选依赖
@Injectable()
class NotificationService {
  constructor(@Inject('Logger') @Optional() private logger?: Logger) {}
}
```

### 控制器与路由装饰器

```typescript
@Controller('/users')
class UserController {
  @Get('/:id')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.userService.findById(id);
  }

  @Post('/')
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete('/:id')
  async remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
```

### 参数装饰器

```typescript
@Get('/search')
async search(
  @Query('q') query: string,
  @Query('page') page: number,
  @Headers('authorization') auth: string,
  @Req() request: FastifyRequest,
  @Res() reply: FastifyReply,
) { ... }
```

### 组合装饰器

```typescript
@UseGuards(AuthGuard, RoleGuard)
@UseInterceptors(LoggingInterceptor, TransformInterceptor)
@UsePipes(ValidationPipe)
@UseFilters(ExceptionFilter)
@UseMiddleware(CorsMiddleware)
@Controller('/admin')
class AdminController { ... }
```

## 生命周期管理

### LifecycleManager

```typescript
const lifecycle = new LifecycleManager();

// 注册模块
lifecycle.registerModule('database', {
  onModuleInit: async () => { await db.connect(); },
  onModuleDestroy: async () => { await db.disconnect(); },
});

// 注册健康检查
lifecycle.registerIndicator({
  name: 'database',
  isHealthy: async () => ({ status: 'ok', timestamp: new Date() }),
});

// 启动应用
await lifecycle.onModuleInit();
await lifecycle.onApplicationBootstrap();

// 关闭应用
await lifecycle.beforeApplicationShutdown();
await lifecycle.onApplicationShutdown();
await lifecycle.onModuleDestroy();

// 健康检查
const health = await lifecycle.checkHealth();
```

### bootstrap 快捷函数

```typescript
import { bootstrap, shutdown } from '@Faultless/core';

const container = await bootstrap([AppModule]);
// 应用已启动...

await shutdown();
```

## 依赖注入容器

### ServiceContainer

```typescript
const container = new ServiceContainer();

// 注册服务
container.register(
  { name: 'Logger' },
  new ConsoleLogger()
);

// 注册工厂
container.registerSingleton(
  { name: 'Database' },
  async () => new Database(config)
);

// 注册单例实例
container.registerInstance(
  { name: 'Config' },
  appConfig
);

// 获取服务
const logger = await container.get<Logger>({ name: 'Logger' });

// 检查是否存在
container.has({ name: 'Logger' }); // true

// 循环依赖检测
// container.get() 会自动检测循环依赖并抛出错误
```

### createServiceIdentifier

```typescript
const LoggerToken = createServiceIdentifier<Logger>('Logger');
// => { name: 'Logger', symbol: Symbol.for('Logger') }

container.register(LoggerToken, new ConsoleLogger());
const logger = await container.get(LoggerToken);
```

## 配置选项

### RetryOptions

```typescript
interface RetryOptions {
  retries: number;        // 最大重试次数
  delay: number;          // 初始延迟 (ms)
  backoff?: 'constant' | 'exponential' | 'linear';  // 退避策略
  maxDelay?: number;      // 最大延迟 (ms)
  retryable?: (error: Error) => boolean;  // 自定义可重试判断
}
```

### AuthOptions

```typescript
interface AuthOptions {
  jwtSecret: string;
  jwtExpiry: string;      // 如 '24h', '7d'
  refreshExpiry: string;
  issuer?: string;
  audience?: string;
}
```
