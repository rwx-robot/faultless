# Faultless API 文档

> 全面的 Node.js 微服务框架

## 包概览

| 包名 | 说明 | 文档 |
|------|------|------|
| `@Faultless/core` | 核心包：类型定义、工具函数、错误体系、装饰器、生命周期管理、依赖注入 | [core.md](./core.md) |
| `@Faultless/http` | HTTP 服务器：基于 Fastify，路由、中间件、拦截器、装饰器、健康检查 | [http.md](./http.md) |
| `@Faultless/auth` | 认证授权：JWT、密码哈希、角色管理、API Key | [auth.md](./auth.md) |
| `@Faultless/config` | 配置管理：多源加载、热更新、加密、版本控制、远程配置 | [config.md](./config.md) |
| `@Faultless/log` | 日志系统：结构化日志、多传输通道、采样、异步写入 | [log.md](./log.md) |
| `@Faultless/resilience` | 弹性组件：智能重试、舱壁隔离、超时预算、故障注入 | [resilience.md](./resilience.md) |
| `@Faultless/breaker` | 熔断器：三态熔断器、注册表、中间件集成 | [resilience.md](./resilience.md) |
| `@Faultless/limit` | 限流器：滑动窗口、内存/Redis 存储、中间件集成 | [resilience.md](./resilience.md) |
| `@Faultless/cache` | 缓存管理：内存缓存、多级缓存、装饰器 | [resilience.md](./resilience.md) |
| `@Faultless/store` | 数据存储：SQL（PostgreSQL/MySQL）、MongoDB | [resilience.md](./resilience.md) |
| `@Faultless/discovery` | 服务发现：etcd/consul/静态配置、负载均衡、解析器 | [microservices.md](./microservices.md) |
| `@Faultless/rpc` | RPC 通信：gRPC 服务器/客户端、连接池、Protobuf | [microservices.md](./microservices.md) |
| `@Faultless/gateway` | API 网关：路由转发、认证、限流、超时 | [microservices.md](./microservices.md) |
| `@Faultless/governance` | 治理组件：服务网格、配置中心 | [microservices.md](./microservices.md) |
| `@Faultless/tracing` | 链路追踪：OpenTelemetry、Jaeger/Zipkin/OTLP | [observability.md](./observability.md) |
| `@Faultless/metrics` | 指标监控：Prometheus/StatsD、Counter/Gauge/Histogram | [observability.md](./observability.md) |
| `@Faultless/cli` | CLI 工具：命令解析、交互式提示、项目脚手架 | [tools.md](./tools.md) |
| `@Faultless/validation` | 参数校验：装饰器驱动、自定义规则 | [tools.md](./tools.md) |
| `@Faultless/queue` | 消息队列：Redis/RabbitMQ/Kafka/内存、重试、死信队列 | [tools.md](./tools.md) |

## 快速开始

```bash
# 安装核心包
pnpm add @Faultless/core @Faultless/http

# 安装完整包
pnpm add @Faultless/core @Faultless/http @Faultless/auth @Faultless/config @Faultless/log
```

### 最小 HTTP 服务

```typescript
import { HttpServer } from '@Faultless/http';
import { Controller, Get, Post, Body, Param } from '@Faultless/http';

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
  create(@Body() body: { name: string }) {
    return { id: Date.now(), ...body };
  }
}

const server = new HttpServer({ port: 3000 });
server.addRoute({
  method: 'GET',
  url: '/users',
  handler: async (req, reply) => reply.send([{ id: 1, name: 'John' }]),
});
await server.listen();
```

## 包依赖关系

```
core (基础层)
├── log
├── config
├── auth
├── validation
├── breaker ← limit ← cache ← store
├── resilience (breaker + limit)
├── discovery
│   ├── rpc
│   ├── gateway
│   └── governance
├── http (core + log + breaker + limit + discovery)
├── tracing
├── metrics
├── cli
└── queue
```

## 环境要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- TypeScript >= 5.5.0
