# Faultless 快速入门指南

---

## 1. 简介

### 什么是 Faultless

Faultless 是一个基于 TypeScript 的 Node.js 微服务框架，灵感来自现代微服务架构设计。它提供从 HTTP 服务到完整微服务治理的全栈解决方案，采用装饰器驱动的模块化架构，内置依赖注入、中间件、熔断器、限流、服务发现等能力。

### 为什么选择 Faultless

- **开箱即用** — 一条命令启动生产级 HTTP 服务，无需手动组装中间件
- **装饰器驱动** — 使用 `@Controller`、`@Injectable`、`@Get` 等装饰器声明式定义路由和服务
- **内置依赖注入** — 完整的 IoC 容器，支持单例、请求级、瞬态三种作用域
- **微服务全家桶** — 熔断器、限流器、服务发现、分布式追踪、指标监控，一套代码搞定
- **类型安全** — 全量 TypeScript 编写，编辑器自动补全，编译时捕获错误
- **生产就绪** — 优雅关闭、健康检查、配置加密、结构化日志，开箱可上生产

### 核心特性一览

| 能力 | 包 | 说明 |
|------|------|------|
| HTTP 服务 | `@Faultless/http` | 基于 Fastify 的高性能服务器，装饰器路由 |
| 核心工具 | `@Faultless/core` | 装饰器、DI 容器、生命周期、错误处理 |
| 配置管理 | `@Faultless/config` | 多源加载、加密、远程配置、版本管理 |
| 结构化日志 | `@Faultless/log` | 基于 Pino，采样、异步写入、日志聚合 |
| 熔断器 | `@Faultless/breaker` | 三态熔断（Closed → Open → Half-Open） |
| 限流器 | `@Faultless/limit` | 5 种算法：固定窗口、滑动窗口、令牌桶、漏桶等 |
| 数据校验 | `@Faultless/validation` | 基于装饰器的验证系统 |
| 缓存 | `@Faultless/cache` | 多级缓存（内存 + Redis），Cache-Aside 模式 |
| 数据存储 | `@Faultless/store` | SQL（PostgreSQL/MySQL）和 MongoDB |
| 认证授权 | `@Faultless/auth` | JWT、密码哈希、角色权限、API Key |
| 分布式追踪 | `@Faultless/tracing` | OpenTelemetry，Jaeger/Zipkin/OTLP 导出 |
| 指标监控 | `@Faultless/metrics` | Prometheus/StatsD，Counter/Gauge/Histogram |
| RPC 框架 | `@Faultless/rpc` | gRPC 服务端/客户端，Protobuf |
| API 网关 | `@Faultless/gateway` | 路由匹配、请求转换、插件系统 |
| 消息队列 | `@Faultless/queue` | Redis/RabbitMQ/Kafka 多后端 |

---

## 2. 环境准备

### Node.js 版本要求

```bash
node -v  # 需要 >= 20.0.0
```

### 包管理器

推荐使用 pnpm（版本 >= 9.0.0）：

```bash
# 安装 pnpm（如果尚未安装）
npm install -g pnpm

# 验证版本
pnpm -v
```

---

## 3. 安装

创建项目并安装核心依赖：

```bash
mkdir my-Faultless-app && cd my-Faultless-app
pnpm init
pnpm add @Faultless/core @Faultless/http
pnpm add -D typescript tsx @types/node
```

初始化 TypeScript 配置：

```bash
npx tsc --init --target ES2022 --module ESNext --moduleResolution bundler --strict true --esModuleInterop true --skipLibCheck true --outDir dist --rootDir src
```

创建目录结构：

```bash
mkdir -p src
```

在 `package.json` 中添加启动脚本：

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

## 4. 你的第一个 API

### 4.1 Hello World

创建 `src/index.ts`：

```typescript
import 'reflect-metadata';
import { Controller, Get, Module } from '@Faultless/core';
import { runApplication } from '@Faultless/http';

@Controller('hello')
class HelloController {
  @Get()
  sayHello() {
    return { message: 'Hello from Faultless!' };
  }
}

@Module({
  controllers: [HelloController],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);
```

启动服务：

```bash
pnpm dev
```

测试接口：

```bash
curl http://localhost:3000/hello
# 返回: {"message":"Hello from Faultless!"}
```

### 4.2 完整 CRUD 示例

下面是一个包含用户增删改查的完整示例：

```typescript
import 'reflect-metadata';
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query,
  Module, Injectable,
} from '@Faultless/core';
import { runApplication } from '@Faultless/http';
import { createLogger } from '@Faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'my-api' });

// ========== 数据层（模拟数据库） ==========

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

// ========== 服务层 ==========

@Injectable()
class UserService {
  private users = new Map<string, User>();

  constructor() {
    // 初始化示例数据
    this.users.set('1', {
      id: '1',
      name: '张三',
      email: 'zhangsan@example.com',
      createdAt: new Date().toISOString(),
    });
    this.users.set('2', {
      id: '2',
      name: '李四',
      email: 'lisi@example.com',
      createdAt: new Date().toISOString(),
    });
  }

  findAll(page = 1, limit = 10): { data: User[]; total: number; page: number; limit: number } {
    const all = Array.from(this.users.values());
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);
    return { data, total: all.length, page, limit };
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  create(input: { name: string; email: string }): User {
    const id = String(this.users.size + 1);
    const user: User = {
      id,
      name: input.name,
      email: input.email,
      createdAt: new Date().toISOString(),
    };
    this.users.set(id, user);
    logger.info('User created', { id, name: user.name });
    return user;
  }

  update(id: string, input: { name?: string; email?: string }): User | null {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...input };
    this.users.set(id, updated);
    logger.info('User updated', { id });
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.users.delete(id);
    if (deleted) logger.info('User deleted', { id });
    return deleted;
  }
}

// ========== 控制器层 ==========

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = parseInt(page ?? '1', 10);
    const l = parseInt(limit ?? '10', 10);
    return this.userService.findAll(p, l);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    const user = this.userService.findById(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    return user;
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    if (!body.name || !body.email) {
      throw new Error('name and email are required');
    }
    return this.userService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; email?: string }) {
    const user = this.userService.update(id, body);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    return user;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const deleted = this.userService.delete(id);
    if (!deleted) {
      throw new Error(`User ${id} not found`);
    }
    return { success: true };
  }
}

// ========== 健康检查 ==========

@Controller('health')
class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

// ========== 模块定义 ==========

@Module({
  controllers: [UsersController, HealthController],
  providers: [UserService],
})
class AppModule {}

// ========== 启动应用 ==========

async function main() {
  logger.info('Starting application...');
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);
```

### 4.3 测试接口

```bash
# 获取用户列表（支持分页）
curl http://localhost:3000/users?page=1&limit=10

# 根据 ID 获取用户
curl http://localhost:3000/users/1

# 创建用户
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"王五","email":"wangwu@example.com"}'

# 更新用户
curl -X PUT http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"张三丰"}'

# 删除用户
curl -X DELETE http://localhost:3000/users/1

# 健康检查
curl http://localhost:3000/health
```

### 4.4 输入校验（使用 Pipe）

```typescript
import { NofaultError } from '@Faultless/core';

// 简单的校验 Pipe
function createValidationPipe() {
  return async (value: any, metadata: any) => {
    if (metadata.data === 'body' && value) {
      if (!value.name || typeof value.name !== 'string') {
        throw new NofaultError('name is required and must be a string', 'VALIDATION_ERROR', 400);
      }
      if (!value.email || !value.email.includes('@')) {
        throw new NofaultError('email is required and must be valid', 'VALIDATION_ERROR', 400);
      }
    }
    return value;
  };
}

// 在控制器中使用
@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Post()
  @UsePipes(createValidationPipe())
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}
```

### 4.5 全局异常过滤器

```typescript
import { NofaultError } from '@Faultless/core';
import { FastifyRequest, FastifyReply } from 'fastify';

function createExceptionFilter() {
  return async (exception: any, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    if (exception instanceof NofaultError) {
      reply.status(exception.statusCode).send({
        error: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
        timestamp: exception.timestamp.toISOString(),
      });
      return;
    }

    // 未知错误返回 500
    reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      requestId,
      timestamp: new Date().toISOString(),
    });
  };
}
```

---

## 5. 核心概念

### 5.1 控制器与路由

使用 `@Controller` 装饰器定义控制器，`@Get`、`@Post`、`@Put`、`@Delete` 等装饰器定义路由：

```typescript
@Controller('articles')  // 路由前缀: /articles
class ArticlesController {
  @Get()                  // GET /articles
  findAll() {}

  @Get(':id')             // GET /articles/:id
  findOne(@Param('id') id: string) {}

  @Post()                 // POST /articles
  create(@Body() body: any) {}

  @Put(':id')             // PUT /articles/:id
  update(@Param('id') id: string, @Body() body: any) {}

  @Delete(':id')          // DELETE /articles/:id
  remove(@Param('id') id: string) {}
}
```

**参数装饰器：**

| 装饰器 | 说明 | 示例 |
|--------|------|------|
| `@Param('name')` | 路径参数 | `/users/:id` 中的 `id` |
| `@Body()` | 请求体 | POST/PUT 的 JSON body |
| `@Query('name')` | 查询参数 | `?page=1&limit=10` |
| `@Headers('name')` | 请求头 | `Authorization` 等 |
| `@Req()` | 原始请求对象 | Fastify request |
| `@Res()` | 原始响应对象 | Fastify reply |

### 5.2 依赖注入（DI）

使用 `@Injectable()` 标记服务，`@Module` 的 `providers` 数组注册服务，框架自动注入：

```typescript
@Injectable()
class EmailService {
  async send(to: string, subject: string, body: string) {
    // 发送邮件逻辑
  }
}

@Injectable()
class UserService {
  // EmailService 会被自动注入
  constructor(private emailService: EmailService) {}

  async register(data: { name: string; email: string }) {
    const user = { id: Date.now().toString(), ...data };
    await this.emailService.send(data.email, 'Welcome!', `Hello ${data.name}`);
    return user;
  }
}

@Module({
  controllers: [UsersController],
  providers: [UserService, EmailService],  // 注册服务
})
class AppModule {}
```

**DI 作用域：**

```typescript
// 单例（默认）— 全局共享一个实例
@Injectable({ scope: 'singleton' })
class ConfigService {}

// 请求级 — 每个请求创建一个新实例
@Injectable({ scope: 'request' })
class RequestContext {}

// 瞬态 — 每次注入都创建新实例
@Injectable({ scope: 'transient' })
class IdGenerator {}
```

### 5.3 模块系统

使用 `@Module` 组织应用结构，支持模块导入和导出：

```typescript
@Module({
  controllers: [UsersController],
  providers: [UserService, EmailService],
  exports: [UserService],  // 导出给其他模块使用
})
class UserModule {}

@Module({
  controllers: [OrdersController],
  providers: [OrderService],
})
class OrderModule {}

@Module({
  imports: [UserModule, OrderModule],  // 导入其他模块
  controllers: [DashboardController],
  providers: [DashboardService],
})
class AppModule {}
```

### 5.4 中间件

中间件在请求处理管线中执行，可用于日志、认证、CORS 等：

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

// 自定义日志中间件
const requestLogger = async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>) => {
  const start = Date.now();
  console.log(`→ ${request.method} ${request.url}`);

  await next();  // 调用 next() 继续执行管线

  const duration = Date.now() - start;
  console.log(`← ${request.method} ${request.url} ${reply.statusCode} (${duration}ms)`);
};

// 注册为全局中间件
await runApplication({
  modules: [AppModule],
  serverOptions: {
    port: 3000,
    middleware: [requestLogger],
  },
});
```

### 5.5 Guards（守卫）

守卫用于路由级别的访问控制，决定请求是否被允许：

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

// JWT 认证守卫
const authGuard = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }
  // 验证 token 逻辑...
  return true;
};

// 角色守卫
const roleGuard = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      reply.status(403).send({ error: 'Forbidden' });
      return false;
    }
    return true;
  };
};

// 在控制器上使用守卫
@UseGuards(authGuard)
@Controller('admin')
class AdminController {
  @Get('settings')
  @UseGuards(roleGuard(['admin']))
  getSettings() {
    return { settings: {} };
  }
}
```

### 5.6 Interceptors（拦截器）

拦截器在请求/响应前后执行，可用于日志记录、缓存、转换响应格式：

```typescript
// 响应转换拦截器 — 统一包装响应格式
const transformInterceptor = async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<any>) => {
  const result = await next();

  if (result !== undefined && !reply.sent) {
    return { code: 0, data: result, message: 'success' };
  }
  return result;
};

// 缓存拦截器
const cacheInterceptor = async (request: FastifyRequest, reply: FastifyReply, next: () => Promise<any>) => {
  if (request.method !== 'GET') return next();

  const cacheKey = `${request.url}:${JSON.stringify(request.query)}`;
  const cached = cacheStore.get(cacheKey);

  if (cached) {
    reply.header('X-Cache', 'HIT');
    return cached;
  }

  const result = await next();
  if (result) cacheStore.set(cacheKey, result, 60000);
  reply.header('X-Cache', 'MISS');
  return result;
};

// 使用拦截器
@UseInterceptors(transformInterceptor)
@Controller('users')
class UsersController {}
```

### 5.7 Pipes（管道）

管道用于输入数据的转换和校验：

```typescript
// 整数转换管道
const ParseIntPipe = async (value: string) => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new NofaultError('Expected integer', 'VALIDATION_ERROR', 400);
  }
  return parsed;
};

// 使用管道
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  // id 已经是 number 类型
  return this.userService.findById(String(id));
}
```

### 5.8 Filters（过滤器）

过滤器用于全局异常处理：

```typescript
import { NofaultError } from '@Faultless/core';

// 全局异常过滤器
const allExceptionsFilter = async (exception: any, request: FastifyRequest, reply: FastifyReply) => {
  const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

  if (exception instanceof NofaultError) {
    reply.status(exception.statusCode).send({
      error: exception.code,
      message: exception.message,
      requestId,
    });
    return;
  }

  reply.status(500).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    requestId,
  });
};

// 注册过滤器
await runApplication({
  modules: [AppModule],
  serverOptions: {
    port: 3000,
    filters: [allExceptionsFilter],
  },
});
```

---

## 6. 配置管理

### 6.1 基本配置

Faultless 支持多种配置源，按优先级从低到高加载：

```typescript
import { ConfigLoader, createFileSource, createEnvSource } from '@Faultless/config';

const configLoader = new ConfigLoader({
  sources: [
    createFileSource('./config/default.json', 0),      // 基础配置
    createFileSource(`./config/${env}.json`, 10),        // 环境覆盖
    createEnvSource('APP_', 100),                        // 环境变量（最高优先级）
  ],
  watchForChanges: env !== 'production',  // 开发环境自动热更新
});

await configLoader.load();
const config = configLoader.getConfig();
```

### 6.2 配置文件示例

`config/default.json`：

```json
{
  "app": {
    "name": "my-api",
    "version": "1.0.0",
    "env": "development",
    "port": 3000,
    "host": "0.0.0.0"
  },
  "database": {
    "type": "POSTGRESQL",
    "host": "localhost",
    "port": 5432,
    "database": "mydb",
    "username": "postgres",
    "password": "secret"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

### 6.3 配置加密

敏感配置可以加密存储：

```typescript
import { encryptConfig, decryptConfig, createEncryption } from '@Faultless/config';

// 加密配置
const encrypted = encryptConfig(
  { database: { password: 'my-secret-password' } },
  process.env.CONFIG_ENCRYPTION_KEY!
);

// 写入文件后，运行时解密
const decrypted = decryptConfig(encrypted, process.env.CONFIG_ENCRYPTION_KEY!);
// decrypted.database.password === 'my-secret-password'
```

### 6.4 环境变量

环境变量按 `APP_` 前缀自动映射：

```bash
# 以下环境变量会覆盖配置中的对应字段
APP_APP__PORT=8080
APP_DATABASE__HOST=db.example.com
APP_DATABASE__PASSWORD=prod-secret
```

---

## 7. 数据库集成

### 7.1 SQL（PostgreSQL/MySQL）

```typescript
import { SqlStore, SqlDatabaseType } from '@Faultless/store';

const store = new SqlStore({
  type: SqlDatabaseType.POSTGRESQL,
  host: process.env.DB_HOST ?? 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  password: process.env.DB_PASSWORD!,
  maxConnections: 10,
});

await store.connect();

// 查询
const result = await store.query<{ id: number; name: string }>(
  'SELECT * FROM users WHERE id = $1',
  [1]
);

// 事务
await store.transaction(async (trx) => {
  await trx.query('INSERT INTO orders (user_id, total) VALUES ($1, $2)', [1, 100]);
  await trx.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [100, 1]);
});
```

### 7.2 MongoDB

```typescript
import { MongoStore } from '@Faultless/store';

const mongo = new MongoStore({
  uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017',
  database: 'mydb',
  maxPoolSize: 10,
});

await mongo.connect();

// CRUD 操作
const user = await mongo.findOne<{ _id: string; name: string }>('users', { name: '张三' });

await mongo.insertOne('users', { name: '王五', email: 'wangwu@example.com' });

await mongo.updateOne('users', { name: '张三' }, { $set: { email: 'new@example.com' } });

// 聚合
const stats = await mongo.aggregate('orders', [
  { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },
]);
```

### 7.3 缓存

```typescript
import { CacheManager, CacheProvider, createCacheManager } from '@Faultless/cache';

// 内存缓存
const cache = createCacheManager({
  provider: CacheProvider.MEMORY,
  ttl: 60000,        // 默认 TTL 60 秒
  prefix: 'app:',    // key 前缀
  max: 1000,         // 最大条目数
});

// 基本操作
await cache.set('user:1', { id: '1', name: '张三' }, 30000);
const user = await cache.get<{ id: string; name: string }>('user:1');
await cache.delete('user:1');

// Cache-Aside 模式
const product = await cache.getOrSet(
  'product:42',
  async () => {
    // 缓存未命中时从数据库加载
    return await db.query('SELECT * FROM products WHERE id = $1', [42]);
  },
  30000
);

// 批量操作
await cache.mset([
  { key: 'user:1', value: user1, ttl: 30000 },
  { key: 'user:2', value: user2, ttl: 30000 },
]);
const users = await cache.mget(['user:1', 'user:2', 'user:3']);

// 查看缓存统计
const stats = cache.getStats();
console.log(`命中率: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## 8. 认证授权

### 8.1 JWT 认证

```typescript
import { JwtService, PasswordService, createAuthMiddleware } from '@Faultless/auth';

// 初始化 JWT 服务
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET ?? 'your-secret-key',
  expiresIn: '24h',
});

const passwordService = new PasswordService(10); // bcrypt rounds

// 注册
const hashedPassword = await passwordService.hash('mypassword');
const tokenPair = jwtService.generateTokenPair({
  sub: userId,
  email: user.email,
  roles: user.roles,
});
// 返回: { accessToken, refreshToken }

// 验证密码
const isValid = await passwordService.compare('mypassword', hashedPassword);

// 刷新 token
const newTokens = jwtService.refreshToken(refreshToken);

// 添加全局认证中间件
await runApplication({
  modules: [AppModule],
  serverOptions: {
    port: 3000,
    middleware: [
      createAuthMiddleware(jwtService),
    ],
  },
});
```

### 8.2 API Key 认证

```typescript
import { ApiKeyService } from '@Faultless/auth';

const apiKeyService = new ApiKeyService();

// 生成 API Key
const apiKey = apiKeyService.generateApiKey(userId, ['posts:read', 'posts:write']);

// 验证 API Key
const keyInfo = apiKeyService.validateApiKey(apiKey);

// 获取用户的所有 API Key
const keys = apiKeyService.getUserApiKeys(userId);
```

### 8.3 角色权限控制

```typescript
import { RoleService } from '@Faultless/auth';

const roleService = new RoleService();

// 定义角色和权限
roleService.createRole('admin', [
  'users:read', 'users:write', 'users:delete',
  'posts:read', 'posts:write', 'posts:delete',
]);
roleService.createRole('editor', ['posts:read', 'posts:write']);
roleService.createRole('viewer', ['posts:read']);

// 在守卫中使用
const roleGuard = (requiredPermission: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      reply.status(401).send({ error: 'Unauthorized' });
      return false;
    }

    const hasPermission = roleService.hasPermission(user.role, requiredPermission);
    if (!hasPermission) {
      reply.status(403).send({ error: 'Forbidden' });
      return false;
    }
    return true;
  };
};
```

---

## 9. 生产部署

### 9.1 优雅关闭

`runApplication` 已内置优雅关闭处理，自动监听 `SIGTERM` 和 `SIGINT` 信号：

```typescript
import { runApplication } from '@Faultless/http';

await runApplication({
  modules: [AppModule],
  serverOptions: { port: 3000 },
});

// 自动行为:
// 1. 收到 SIGTERM/SIGINT
// 2. 停止接收新请求
// 3. 等待现有请求完成
// 4. 关闭数据库连接、缓存等
// 5. 退出进程
```

如需自定义关闭逻辑，使用 `HttpApplication`：

```typescript
import { createApplication } from '@Faultless/http';

const app = await createApplication({
  modules: [AppModule],
  serverOptions: { port: 3000 },
});

await app.listen();

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await app.close();
  process.exit(0);
});
```

### 9.2 健康检查

内置健康检查模块，支持自定义健康指标：

```typescript
import { HealthModule, MemoryHealthIndicator, CustomHealthIndicator } from '@Faultless/http';

@Module({
  imports: [
    HealthModule.forRoot({
      includeDetails: true,
      timeout: 5000,
      indicators: [
        // 内存健康检查 — 堆使用超过 80% 报警
        new MemoryHealthIndicator({ heapUsedThreshold: 0.8 }),
        // 自定义健康检查 — 检查数据库连接
        new CustomHealthIndicator({
          name: 'database',
          check: async () => {
            try {
              await store.query('SELECT 1');
              return { status: 'ok' as const, details: { connected: true } };
            } catch {
              return { status: 'error' as const, details: { connected: false } };
            }
          },
        }),
      ],
    }),
  ],
})
class AppModule {}
```

访问健康检查端点：

```bash
# 存活探针
curl http://localhost:3000/health/live

# 就绪探针
curl http://localhost:3000/health/ready

# 完整健康状态
curl http://localhost:3000/health
```

### 9.3 结构化日志

```typescript
import { createLogger } from '@Faultless/log';

const logger = createLogger({
  level: 'info',
  serviceName: 'my-api',
  structuredFields: true,
});

// 使用
logger.info('User created', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', { host: 'db.example.com', error: err.message });
logger.warn('Rate limit approaching', { ip: '1.2.3.4', count: 95 });
```

### 9.4 熔断器与限流

防止级联故障和滥用：

```typescript
import { createCircuitBreaker } from '@Faultless/breaker';
import { createRateLimiter } from '@Faultless/limit';

// 熔断器 — 连续失败 5 次后打开，30 秒后尝试恢复
const breaker = createCircuitBreaker({
  name: 'external-api',
  threshold: 5,
  timeout: 30000,
  resetTimeout: 10000,
  fallback: async (error) => ({ data: 'degraded response', error: true }),
});

const result = await breaker.execute(async () => {
  return await fetchExternalApi();
});

// 限流器 — 每分钟最多 100 次请求
const limiter = createRateLimiter({
  name: 'api-rate-limit',
  windowMs: 60000,
  max: 100,
});

await limiter.consume('user:123'); // 检查是否超限
```

### 9.5 分布式追踪

```typescript
import { createTracingService, createTracingMiddleware, TraceExporterType } from '@Faultless/tracing';
import { Traced } from '@Faultless/tracing';

const tracing = createTracingService({
  serviceName: 'my-api',
  exporter: TraceExporterType.OTLP,  // 或 JAEGER, ZIPKIN, CONSOLE
  sampleRate: 1.0,
});

await tracing.initialize();

// 在方法上添加 @Traced 自动追踪
@Injectable()
class UserService {
  @Traced('UserService.findById')
  async findById(id: string) {
    // 自动记录调用链路
    return await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
  }
}

// 注册追踪中间件
await runApplication({
  modules: [AppModule],
  serverOptions: {
    port: 3000,
    middleware: [createTracingMiddleware(tracing)],
  },
});
```

---

## 10. 下一步

### 文档

- [API 文档](./api/README.md) — 各包的完整 API 参考
- [架构文档](./architecture/) — 框架设计理念与版本演进
- [核心模块](./api/core.md) — 装饰器、DI 容器、生命周期
- [HTTP 模块](./api/http.md) — 路由、中间件、健康检查
- [配置模块](./api/config.md) — 配置加载与加密
- [认证模块](./api/auth.md) — JWT、API Key、RBAC
- [日志模块](./api/log.md) — 结构化日志
- [熔断与限流](./api/resilience.md) — 熔断器、限流器
- [可观测性](./api/observability.md) — 追踪与指标
- [微服务](./api/microservices.md) — 服务发现与 RPC

### 示例项目

项目根目录的 `examples/` 文件夹包含完整的示例应用：

| 示例 | 说明 |
|------|------|
| `v1-core-http` | 核心 HTTP 服务，CRUD 操作 |
| `v2-config-log` | 配置管理与结构化日志 |
| `v3-middleware-error` | 中间件、熔断器、限流器、健康检查 |
| `v4-discovery-lb` | 服务发现与负载均衡 |
| `v5-resilience` | 弹性模式：舱壁隔离、超时预算、重试 |
| `v6-rpc-grpc` | gRPC 服务端与客户端 |
| `v7-cache-store` | 多级缓存与数据存储 |
| `v8-tracing-metrics` | 分布式追踪与指标监控 |
| `v9-gateway` | API 网关 |
| `v10-cli` | CLI 工具与代码生成 |
| `v11-governance` | 微服务治理 |
| `v13-auth` | 认证授权完整示例 |

### 完整安装命令

```bash
# 最小安装（仅 HTTP 服务）
pnpm add @Faultless/core @Faultless/http

# 完整安装（HTTP + 配置 + 日志）
pnpm add @Faultless/core @Faultless/http @Faultless/config @Faultless/log

# 微服务全家桶
pnpm add @Faultless/core @Faultless/http @Faultless/config @Faultless/log \
  @Faultless/breaker @Faultless/limit @Faultless/cache @Faultless/store \
  @Faultless/auth @Faultless/tracing @Faultless/metrics @Faultless/resilience
```

### 社区与支持

- GitHub: https://github.com/Faultless-framework/Faultless
- 问题反馈: https://github.com/Faultless-framework/Faultless/issues
- 许可证: MIT
