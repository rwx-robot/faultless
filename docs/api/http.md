# @Faultless/http

> HTTP 服务器包：基于 Fastify 的高性能 HTTP 服务器，支持装饰器路由、中间件链、拦截器、管道、异常过滤器和健康检查。

## 安装

```bash
pnpm add @Faultless/http
```

## 模块导出

```typescript
import {
  // 服务器
  HttpServer, createServer, HttpServerOptions,

  // 路由
  Router, createRouter,

  // 装饰器
  Controller, Get, Post, Put, Delete, Patch, Options, Head, All,
  Param, Body, Query, Headers, Session, Req, Res, Next,
  UseGuards, UseInterceptors, UsePipes, UseFilters, UseMiddleware,
  HttpCode, Header, Redirect, Render,

  // 中间件
  corsMiddleware, helmetMiddleware, requestIdMiddleware, loggingMiddleware,
  timeoutMiddleware, createRetryMiddleware, createRateLimitMiddlewareFromLimiter,
  createCircuitBreakerMiddlewareFromBreaker, registerDefaultMiddlewares,

  // 守卫/拦截器/管道/过滤器
  createAuthGuard, createRoleGuard, createApiKeyGuard,
  createLoggingInterceptor, createTransformInterceptor, createCacheInterceptor,
  createValidationPipe, createParseIntPipe, createParseFloatPipe,
  createParseBoolPipe, createParseArrayPipe, createDefaultValuePipe,
  createAllExceptionsFilter, createNotFoundFilter, createValidationFilter,

  // 请求/响应工具
  getRequestId, getUser, setUser, getRequestIp, getBearerToken,
  setCookie, getCookie, clearCookie, redirect, json, text, html, file, stream,
  sendSuccess, sendError, sendPaginated, sendNoContent, sendCreated, sendOk,

  // HTTP 客户端
  HttpClient, HttpClientFactory, createHttpClientFactory,
  HttpClientOptions, RequestOptions, ClientResponse,

  // 健康检查
  HealthCheckService, createHealthCheckService, HealthCheckOptions,

  // 类型
  MiddlewareFunction, GuardFunction, InterceptorFunction, PipeFunction,
  FilterFunction, RouteMetadata, ControllerMetadata,
} from '@Faultless/http';
```

## HttpServer

```typescript
class HttpServer {
  constructor(options: HttpServerOptions);
  getApp(): FastifyInstance;
  getOptions(): HttpServerOptions;
  addRoute(route: RouteOptions): void;
  addMiddleware(middleware: MiddlewareFunction): void;
  addGuard(guard: GuardFunction): void;
  addInterceptor(interceptor: InterceptorFunction): void;
  addPipe(name: string, pipe: PipeFunction): void;
  addFilter(filter: FilterFunction): void;
  listen(): Promise<void>;
  close(): Promise<void>;
  ready(): Promise<void>;
  decorateRequest<T>(name: string, decorator: T): void;
  decorateReply<T>(name: string, decorator: T): void;
  registerPlugin(plugin: FastifyPluginAsync | FastifyPluginSync, options?: any): void;
}
```

### 配置选项

```typescript
interface HttpServerOptions {
  port: number;
  host?: string;              // 默认 '0.0.0.0'
  https?: { key: string; cert: string };
  logger?: boolean | object;
  trustProxy?: boolean;       // 默认 true
  bodyLimit?: number;         // 默认 1MB
  keepAliveTimeout?: number;  // 默认 5000ms
}
```

### 使用示例

```typescript
const server = new HttpServer({ port: 3000 });

// 添加路由
server.addRoute({
  method: 'GET',
  url: '/hello',
  handler: async (request, reply) => {
    return { message: 'Hello World' };
  },
});

// 添加中间件
server.addMiddleware(corsMiddleware);
server.addMiddleware(helmetMiddleware);

// 启动
await server.listen();
```

## Router

```typescript
class Router {
  constructor(app: FastifyInstance);
  registerController(controller: any): void;
  addGlobalPipe(name: string, pipe: PipeFunction): void;
  getRegisteredControllers(): string[];
  getControllerMetadata(name: string): ControllerMetadata | undefined;
}
```

### 使用示例

```typescript
import { Router } from '@Faultless/http';

@Controller('/users')
class UserController {
  @Get('/')
  findAll() {
    return [{ id: 1, name: 'John' }];
  }

  @Get('/:id')
  findOne(@Param('id') id: string) {
    return { id, name: 'John' };
  }

  @Post('/')
  create(@Body() body: CreateUserDto) {
    return { id: Date.now(), ...body };
  }
}

const router = createRouter(server.getApp());
router.registerController(new UserController());
```

## 装饰器

### 控制器装饰器

```typescript
@Controller('/users')          // 设置路由前缀
@HttpCode(200)                 // 设置默认响应码
@Header('X-Custom', 'value')   // 设置响应头
@Redirect('/login', 302)       // 重定向
@Render('template')            // 渲染模板
class UserController { ... }
```

### 路由装饰器

```typescript
@Get('/users')            // GET /users
@Get('/:id')              // GET /users/:id
@Post('/users')           // POST /users
@Put('/users/:id')        // PUT /users/:id
@Delete('/users/:id')     // DELETE /users/:id
@Patch('/users/:id')      // PATCH /users/:id
@Options('/users')        // OPTIONS /users
@Head('/users')           // HEAD /users
@All('/users')            // 所有方法
```

### 参数装饰器

```typescript
@Get('/search')
async search(
  @Param('id') id: string,           // 路径参数
  @Query('q') query: string,         // 查询参数
  @Body() body: CreateUserDto,       // 请求体
  @Headers('authorization') auth: string,  // 请求头
  @Session('user') session: any,     // Session
  @Req() request: FastifyRequest,    // 原始请求
  @Res() reply: FastifyReply,        // 原始响应
  @Next() next: () => Promise<void>, // 下一个处理器
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

## 中间件

### 内置中间件

```typescript
// CORS 中间件
server.addMiddleware(corsMiddleware);

// 安全头中间件
server.addMiddleware(helmetMiddleware);

// 请求 ID 中间件
server.addMiddleware(requestIdMiddleware);

// 日志中间件
server.addMiddleware(loggingMiddleware);

// 超时中间件
server.addMiddleware(timeoutMiddleware(30000));

// 重试中间件
server.addMiddleware(createRetryMiddleware({ retries: 3, delay: 100 }));

// 限流中间件
server.addMiddleware(createRateLimitMiddlewareFromLimiter({
  name: 'api',
  windowMs: 60000,
  max: 100,
}));

// 熔断中间件
server.addMiddleware(createCircuitBreakerMiddlewareFromBreaker({
  name: 'api',
  threshold: 5,
  timeout: 30000,
  resetTimeout: 10000,
}));
```

### 一键注册默认中间件

```typescript
import { registerDefaultMiddlewares } from '@Faultless/http';

registerDefaultMiddlewares(server.getApp(), {
  cors: true,
  helmet: true,
  requestId: true,
  logging: true,
  rateLimit: { name: 'global', windowMs: 60000, max: 1000 },
  circuitBreaker: { name: 'global', threshold: 5, timeout: 30000, resetTimeout: 10000 },
  timeout: 30000,
  retry: { retries: 3, delay: 100 },
});
```

## 守卫 (Guards)

```typescript
// JWT 认证守卫
const authGuard = createAuthGuard({
  secret: 'your-jwt-secret',
  algorithms: ['HS256'],
});

// 角色守卫
const roleGuard = createRoleGuard(['admin', 'superadmin']);

// API Key 守卫
const apiKeys = new Map([
  ['key123', { name: 'MyApp', roles: ['user'] }],
]);
const apiKeyGuard = createApiKeyGuard(apiKeys);
```

## 拦截器 (Interceptors)

```typescript
// 日志拦截器
const loggingInterceptor = createLoggingInterceptor();

// 响应转换拦截器
const transformInterceptor = createTransformInterceptor();
// 自动包装: { data: result, success: true }

// 缓存拦截器
const cache = new Map<string, { value: any; expires: number }>();
const cacheInterceptor = createCacheInterceptor(cache);
// 仅缓存 GET 请求，TTL 60s
```

## 管道 (Pipes)

```typescript
// 验证管道（需 class-validator）
const validationPipe = createValidationPipe();

// 类型转换管道
const parseIntPipe = createParseIntPipe();
const parseFloatPipe = createParseFloatPipe();
const parseBoolPipe = createParseBoolPipe();
const parseArrayPipe = createParseArrayPipe(',');  // 按逗号分隔

// 默认值管道
const defaultPipe = createDefaultValuePipe('N/A');

// 自定义转换管道
const trimPipe = createTransformPipe((value) => {
  if (typeof value === 'string') return value.trim();
  return value;
});
```

## 过滤器 (Filters)

```typescript
// 全局异常过滤器
const allExceptionsFilter = createAllExceptionsFilter();

// 404 过滤器
const notFoundFilter = createNotFoundFilter();

// 校验错误过滤器
const validationFilter = createValidationFilter();
```

## 请求/响应工具

```typescript
import { getRequestId, getUser, json, sendSuccess, sendPaginated } from '@Faultless/http';

// 获取请求 ID
const requestId = getRequestId(request);

// 获取认证用户
const user = getUser<UserPayload>(request);

// JSON 响应
json(reply, { data: 'hello' });

// 标准成功响应
sendSuccess(reply, { id: 1, name: 'John' });
sendCreated(reply, { id: 1 });

// 分页响应
sendPaginated(reply, users, total, page, limit);
// => { success: true, data: [...], pagination: { total, page, limit, pages }, timestamp }

// 无内容响应
sendNoContent(reply);
```

## HTTP 客户端

```typescript
import { HttpClient, HttpClientFactory } from '@Faultless/http';

const factory = createHttpClientFactory(server.getApp());

const userClient = factory.createClient('user-service', {
  serviceName: 'user-service',
  resolver: { type: 'static', endpoints: ['localhost:3001'], serviceName: 'user-service' },
  circuitBreaker: { enabled: true, threshold: 5, timeout: 30000, resetTimeout: 10000 },
  rateLimit: { enabled: true, windowMs: 60000, max: 100 },
  retry: { retries: 3, delay: 100, backoff: 'exponential' },
  timeout: 5000,
});

await userClient.start();

// 发送请求
const response = await userClient.get<User[]>('/users');
const created = await userClient.post<User>('/users', { name: 'John' });
const updated = await userClient.put<User>('/users/1', { name: 'Jane' });
const deleted = await userClient.delete('/users/1');

await userClient.stop();
```

## 健康检查

```typescript
import { HealthCheckService, createHealthCheckService } from '@Faultless/http';

const healthCheck = createHealthCheckService({
  path: '/health',
  includeDetails: true,
  timeout: 5000,
});

// 注册健康指标
healthCheck.registerIndicator({
  name: 'database',
  isHealthy: async () => ({
    status: 'ok',
    timestamp: new Date(),
  }),
});

healthCheck.registerIndicator({
  name: 'redis',
  isHealthy: async () => ({
    status: 'ok',
    timestamp: new Date(),
  }),
});

// 执行健康检查
const health = await healthCheck.checkHealth();
// => { status: 'ok', timestamp, checks: { database: {...}, redis: {...} }, uptime: 123.456 }

// 就绪检查（Kubernetes）
const ready = await healthCheck.checkReadiness();
// => { ready: boolean, checks: {...} }

// 存活检查
const alive = await healthCheck.checkLiveness();
// => { alive: true }
```
