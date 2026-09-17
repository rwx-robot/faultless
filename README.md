<!-- Faultless -->

<div align="center">

<!-- Logo placeholder -->

# Faultless

**A Node.js microservice framework inspired by modern microservice architecture**

[![npm version](https://img.shields.io/npm/v/@Faultless/core.svg)](https://www.npmjs.com/package/@Faultless/core)
[![license](https://img.shields.io/npm/l/@Faultless/core.svg)](https://github.com/Faultless-framework/Faultless/blob/main/LICENSE)
[![build](https://img.shields.io/github/actions/workflow/status/Faultless-framework/Faultless/ci.yml?branch=main)](https://github.com/Faultless-framework/Faultless/actions)
[![coverage](https://img.shields.io/codecov/c/github/Faultless-framework/Faultless)](https://codecov.io/gh/Faultless-framework/Faultless)

</div>

---

## 特性概览

Faultless 是一个全面的 Node.js 微服务框架，采用 TypeScript 编写，提供从 HTTP 服务到完整微服务治理的全栈解决方案。

### 核心能力

- **HTTP 服务** — 基于 Fastify 的高性能 HTTP 服务器，支持装饰器、模块系统、依赖注入
- **配置管理** — 多源配置加载（JSON/YAML/TOML），支持加密、远程配置中心、版本管理
- **结构化日志** — 基于 Pino 的高性能日志系统，支持采样、异步写入、日志聚合
- **熔断器** — 三态熔断器（Closed → Open → Half-Open），支持降级和指标收集
- **限流** — 5 种限流算法（固定窗口、滑动窗口、令牌桶、漏桶、滑动窗口日志）
- **服务发现** — 支持 etcd、Consul、Kubernetes，7 种负载均衡策略
- **弹性模式** — 舱壁隔离、超时预算、故障注入、智能重试
- **RPC 框架** — gRPC 服务端/客户端，Protobuf 支持，连接池管理
- **缓存系统** — 多级缓存（内存 + Redis），支持 Cache-Aside 模式
- **数据存储** — SQL（PostgreSQL/MySQL）和 MongoDB 集成，事务支持
- **分布式追踪** — OpenTelemetry 集成，支持 Jaeger/Zipkin/OTLP 导出
- **指标监控** — Prometheus 和 StatsD 集成，Counter/Gauge/Histogram/Summary
- **API 网关** — 路由匹配、请求/响应转换、插件系统
- **CLI 工具** — 项目脚手架、API 代码生成、模型生成
- **微服务治理** — 服务网格、配置中心、健康监控仪表盘
- **数据校验** — 基于装饰器的数据验证
- **消息队列** — Redis/RabbitMQ/Kafka 多后端支持
- **认证授权** — JWT 认证、密码哈希、角色权限控制、API Key 管理

---

## 快速开始

### 安装

```bash
# 使用 pnpm（推荐）
pnpm add @Faultless/core @Faultless/http @Faultless/config @Faultless/log

# 或使用 npm
npm install @Faultless/core @Faultless/http @Faultless/config @Faultless/log
```

### 基本用法

```typescript
import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@Faultless/core';
import { createApplication, runApplication } from '@Faultless/http';

// 1. 定义服务
@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string; email: string }>();

  constructor() {
    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
  }

  findAll() {
    return Array.from(this.users.values());
  }

  findById(id: string) {
    return this.users.get(id);
  }

  create(user: { name: string; email: string }) {
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    return newUser;
  }
}

// 2. 定义控制器
@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

// 3. 定义模块
@Module({
  controllers: [UsersController],
  providers: [UserService],
})
class AppModule {}

// 4. 启动应用
async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: 3000,
      host: '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);
```

### 运行

```bash
npx tsx src/index.ts
```

测试接口：
- `GET /users` — 获取用户列表
- `GET /users/:id` — 根据 ID 获取用户
- `POST /users` — 创建用户

---

## 包概览

Faultless 由 **19 个独立包** 组成，覆盖微服务开发的各个方面：

| 包名 | 版本 | 描述 |
|------|------|------|
| `@Faultless/core` | v1.0.0 | 核心工具：装饰器、依赖注入容器、生命周期管理、错误处理 |
| `@Faultless/http` | v1.0.0 | HTTP 服务器框架：基于 Fastify，路由、中间件、健康检查 |
| `@Faultless/config` | v2.0.0 | 配置管理：多源加载、加密、远程配置、版本管理 |
| `@Faultless/log` | v2.0.0 | 结构化日志：传输器、格式化、采样、异步写入 |
| `@Faultless/breaker` | v3.0.0 | 熔断器：三态模型、降级、Prometheus 指标 |
| `@Faultless/limit` | v3.0.0 | 限流器：5 种算法、Redis 存储、中间件集成 |
| `@Faultless/discovery` | v4.0.0 | 服务发现：etcd/Consul/K8s、注册中心、负载均衡 |
| `@Faultless/resilience` | v5.0.0 | 弹性模式：舱壁隔离、超时预算、故障注入、智能重试 |
| `@Faultless/rpc` | v6.0.0 | RPC 框架：gRPC 服务端/客户端、Protobuf、连接池 |
| `@Faultless/cache` | v7.0.0 | 缓存系统：内存缓存、Redis、多级缓存 |
| `@Faultless/store` | v7.0.0 | 数据存储：SQL（PostgreSQL/MySQL）、MongoDB |
| `@Faultless/tracing` | v8.0.0 | 分布式追踪：OpenTelemetry、Jaeger/Zipkin/OTLP 导出 |
| `@Faultless/metrics` | v8.0.0 | 指标监控：Prometheus、StatsD、Counter/Gauge/Histogram |
| `@Faultless/gateway` | v9.0.0 | API 网关：路由匹配、请求转换、插件系统 |
| `@Faultless/cli` | v10.0.0 | CLI 工具：项目脚手架、API/模型代码生成 |
| `@Faultless/governance` | v11.0.0 | 微服务治理：服务网格、配置中心、健康监控 |
| `@Faultless/validation` | v12.0.0 | 数据校验：基于装饰器的验证系统 |
| `@Faultless/queue` | v12.0.0 | 消息队列：Redis/RabbitMQ/Kafka 多后端 |
| `@Faultless/auth` | v13.0.0 | 认证授权：JWT、密码哈希、角色权限、API Key |

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (Application)                       │
│   Controllers  ←→  Services  ←→  Providers  ←→  Middleware      │
├─────────────────────────────────────────────────────────────────┤
│                        网关层 (Gateway)                          │
│   @Faultless/gateway  — 路由匹配 / 转换 / 插件                     │
├─────────────────────────────────────────────────────────────────┤
│                      HTTP / RPC 层                               │
│   @Faultless/http (Fastify)    @Faultless/rpc (gRPC)               │
├─────────────────────────────────────────────────────────────────┤
│                     中间件层 (Middleware)                         │
│   @Faultless/breaker  @Faultless/limit  @Faultless/validation        │
├─────────────────────────────────────────────────────────────────┤
│                      服务层 (Service)                            │
│   @Faultless/discovery  @Faultless/rpc  @Faultless/resilience        │
├─────────────────────────────────────────────────────────────────┤
│                     数据层 (Data)                                │
│   @Faultless/cache  @Faultless/store  @Faultless/queue                │
├─────────────────────────────────────────────────────────────────┤
│                   可观测性层 (Observability)                     │
│   @Faultless/tracing  @Faultless/metrics  @Faultless/log             │
├─────────────────────────────────────────────────────────────────┤
│                     运维层 (Operations)                          │
│   @Faultless/cli  @Faultless/governance  @Faultless/config           │
├─────────────────────────────────────────────────────────────────┤
│                     核心层 (Core)                                │
│   @Faultless/core  — 装饰器 / DI / 生命周期 / 类型 / 工具          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 版本历史

| 版本 | 年份 | 核心特性 |
|------|------|----------|
| **v1.0.0** | 2015 | 核心 HTTP 服务器，模块系统，依赖注入，装饰器 |
| **v2.0.0** | 2016 | 配置加密，远程配置源（etcd/Consul），配置版本管理，结构化日志，日志采样 |
| **v3.0.0** | 2017 | 熔断器（三态），限流器（5 种算法），中间件增强，健康检查，重试机制 |
| **v4.0.0** | 2018 | 服务发现（etcd/Consul/K8s），客户端负载均衡（P2C/一致性哈希等 7 种策略） |
| **v5.0.0** | 2019 | 舱壁隔离，超时预算与截止时间传播，故障注入引擎，智能重试引擎 |
| **v6.0.0** | 2020 | gRPC 服务端/客户端，Protobuf 加载，RPC 认证，连接池管理 |
| **v7.0.0** | 2021 | 多级缓存（内存 + Redis），SQL/MongoDB 存储，事务支持 |
| **v8.0.0** | 2022 | OpenTelemetry 分布式追踪，Prometheus/StatsD 指标监控 |
| **v9.0.0** | 2023 | API 网关，路由匹配（精确/前缀/正则），请求/响应转换，插件系统 |
| **v10.0.0** | 2024 | CLI 工具，项目脚手架，API 定义解析器，代码生成 |
| **v11.0.0** | 2025 | 微服务治理，服务网格，配置中心，健康监控仪表盘 |
| **v12.0.0** | 2026 | 完整特性对齐，数据校验，消息队列 |
| **v13.0.0** | 2026 | 认证授权：JWT、密码哈希、角色权限、API Key 管理 |

---

## 贡献指南

欢迎参与 Faultless 的开发！请遵循以下步骤：

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/Faultless-framework/Faultless.git
cd Faultless

# 安装依赖
pnpm install

# 构建所有包
pnpm run build:all

# 运行测试
pnpm run test:all

# 代码检查
pnpm run lint:all
```

### 项目结构

```
Faultless/
├── packages/           # 核心包
│   ├── core/          # 核心工具
│   ├── http/          # HTTP 服务器
│   ├── config/        # 配置管理
│   ├── log/           # 日志系统
│   ├── breaker/       # 熔断器
│   ├── limit/         # 限流器
│   ├── discovery/     # 服务发现
│   ├── resilience/    # 弹性模式
│   ├── rpc/           # RPC 框架
│   ├── cache/         # 缓存系统
│   ├── store/         # 数据存储
│   ├── tracing/       # 分布式追踪
│   ├── metrics/       # 指标监控
│   ├── gateway/       # API 网关
│   ├── cli/           # CLI 工具
│   ├── governance/    # 微服务治理
│   ├── validation/    # 数据校验
│   ├── queue/         # 消息队列
│   └── auth/          # 认证授权
├── examples/           # 示例应用
├── docs/               # 架构文档
└── scripts/            # 构建脚本
```

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat: 新增功能`
- `fix: 修复 Bug`
- `docs: 文档更新`
- `style: 代码格式`
- `refactor: 重构`
- `test: 测试`
- `chore: 构建/工具变更`

### 发布流程

```bash
# 补丁版本
pnpm run version:patch

# 次要版本
pnpm run version:minor

# 主要版本
pnpm run version:major
```

---

## 许可证

[MIT License](LICENSE) © 2015-2026 Faultless team
