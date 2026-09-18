# Faultless 框架 - 全面交接文档

## 项目概述

**Faultless** 是一个全面的 Node.js 微服务框架，采用 TypeScript 编写，提供从 HTTP 服务到完整微服务治理的全栈解决方案。

### 项目元数据

| 项目 | 详情 |
|------|------|
| **框架名称** | Faultless |
| **包命名空间** | `@faultless/*` |
| **包管理器** | pnpm 9.x |
| **Node.js 版本** | >= 20.0.0 |
| **TypeScript 版本** | 5.5+ |
| **构建工具** | unbuild 3.6+ |
| **测试框架** | vitest 2.x |
| **HTTP 基础** | Fastify |
| **装饰器风格** | `experimentalDecorators` + `emitDecoratorMetadata` |
| **模块系统** | ES2022, NodeNext |

---

## 项目结构

```
faultless/
├── packages/                    # 29 个核心包
│   ├── core/                   # 核心：DI 容器、装饰器、生命周期、类型、工具
│   ├── http/                   # HTTP 服务器（Fastify）
│   ├── config/                 # 配置管理（JSON/YAML/TOML）
│   ├── log/                    # 结构化日志（Pino）
│   ├── breaker/                # 熔断器（三态）
│   ├── limit/                  # 限流器（5 种算法）
│   ├── discovery/              # 服务发现（etcd/Consul/K8s）
│   ├── resilience/             # 弹性模式（舱壁/超时/故障注入）
│   ├── rpc/                    # gRPC 框架
│   ├── cache/                  # 多级缓存（内存+Redis）
│   ├── store/                  # 数据存储（SQL/MongoDB）
│   ├── tracing/                # 分布式追踪（OpenTelemetry）
│   ├── metrics/                # 指标监控（Prometheus/StatsD）
│   ├── gateway/                # API 网关
│   ├── cli/                    # CLI 工具
│   ├── governance/             # 微服务治理
│   ├── validation/             # 数据校验
│   ├── queue/                  # 消息队列
│   ├── auth/                   # 认证授权（JWT）
│   ├── bloom/                  # 布隆过滤器
│   ├── circuit-breaker/        # 熔断器（增强版）
│   ├── collection/             # 集合工具
│   ├── concurrency/            # 并发控制
│   ├── event/                  # 事件系统
│   ├── fx/                     # 函数式编程
│   ├── mr/                     # MapReduce
│   ├── retry/                  # 重试机制
│   ├── stream/                 # 流处理
│   └── worker/                 # Worker 线程
├── examples/                   # 13 个示例应用
├── docs/                       # 架构文档
├── benchmarks/                 # 性能基准测试
├── tests/                      # 集成测试
├── scripts/                    # 构建脚本
├── .github/workflows/          # CI/CD 配置
├── CHANGELOG.md                # 版本变更日志
├── CONTRIBUTING.md             # 贡献指南
├── CODE_OF_CONDUCT.md          # 行为准则
└── README.md                   # 项目文档
```

---

## 包详细说明

### 核心层 (Core Layer)

#### @faultless/core
**版本**: v1.0.0 (2015)
**功能**: 核心工具库
- DI 容器（依赖注入）
- 装饰器系统（Controller, Injectable, Get, Post 等）
- 生命周期管理
- 类型定义
- 工具函数
- 错误处理体系

#### @faultless/http
**版本**: v1.0.0 (2015)
**功能**: HTTP 服务器
- 基于 Fastify 的高性能 HTTP 服务器
- 装饰器驱动的路由系统
- 模块系统
- 中间件支持
- 健康检查端点
- 集成测试

#### @faultless/config
**版本**: v2.0.0 (2016)
**功能**: 配置管理
- 多源配置加载（JSON/YAML/TOML）
- 配置加密/解密
- 远程配置中心（etcd/Consul）
- 配置版本管理
- 配置热更新

#### @faultless/log
**版本**: v2.0.0 (2016)
**功能**: 结构化日志
- 基于 Pino 的高性能日志
- 多种传输通道
- 日志采样
- 异步写入
- 日志聚合

### 中间件层 (Middleware Layer)

#### @faultless/breaker
**版本**: v3.0.0 (2017)
**功能**: 熔断器
- 三态熔断器（Closed → Open → Half-Open）
- 降级支持
- 指标收集
- 中间件集成

#### @faultless/limit
**版本**: v3.0.0 (2017)
**功能**: 限流器
- 5 种限流算法：
  - 固定窗口
  - 滑动窗口
  - 令牌桶
  - 漏桶
  - 滑动窗口日志
- 内存/Redis 存储
- 中间件集成

#### @faultless/validation
**版本**: v12.0.0 (2026)
**功能**: 数据校验
- 基于装饰器的数据验证
- 支持多种校验规则
- 自定义校验器

### 服务层 (Service Layer)

#### @faultless/discovery
**版本**: v4.0.0 (2018)
**功能**: 服务发现
- 支持 etcd、Consul、Kubernetes
- 7 种负载均衡策略：
  - 轮询
  - 随机
  - 加权轮询
  - 加权随机
  - 最少连接
  - 一致性哈希
  - P2C（Power of Two Choices）

#### @faultless/resilience
**版本**: v5.0.0 (2019)
**功能**: 弹性模式
- 舱壁隔离（Bulkhead）
- 超时预算（Timeout Budget）
- 故障注入（Fault Injection）
- 智能重试（Smart Retry）

#### @faultless/rpc
**版本**: v6.0.0 (2020)
**功能**: RPC 框架
- gRPC 服务端/客户端
- Protobuf 支持
- RPC 认证
- 连接池管理

#### @faultless/retry
**版本**: v5.0.0 (2019)
**功能**: 重试机制
- 可配置重试策略
- 指数退避
- 抖动（Jitter）
- 最大重试次数

#### @faultless/circuit-breaker
**版本**: v6.0.0 (2020)
**功能**: 熔断器（增强版）
- 三态熔断器
- 更多配置选项
- 指标收集

### 数据层 (Data Layer)

#### @faultless/cache
**版本**: v7.0.0 (2021)
**功能**: 缓存系统
- 多级缓存（内存 + Redis）
- Cache-Aside 模式
- 缓存装饰器
- TTL 支持

#### @faultless/store
**版本**: v7.0.0 (2021)
**功能**: 数据存储
- SQL 存储（PostgreSQL/MySQL）
- MongoDB 存储
- 事务支持
- 存储装饰器

#### @faultless/queue
**版本**: v12.0.0 (2026)
**功能**: 消息队列
- Redis 后端
- RabbitMQ 后端
- Kafka 后端
- 消息确认机制

### 可观测性层 (Observability Layer)

#### @faultless/tracing
**版本**: v8.0.0 (2022)
**功能**: 分布式追踪
- OpenTelemetry 集成
- 多种导出器（Jaeger/Zipkin/OTLP）
- 自动检测
- 追踪装饰器

#### @faultless/metrics
**版本**: v8.0.0 (2022)
**功能**: 指标监控
- Prometheus 集成
- StatsD 集成
- 指标类型：Counter/Gauge/Histogram/Summary
- 指标装饰器

### API 网关层 (API Gateway Layer)

#### @faultless/gateway
**版本**: v9.0.0 (2023)
**功能**: API 网关
- 路由匹配（精确/前缀/正则）
- 请求/响应转换
- 插件系统
- 限流集成

### 工具层 (Tools Layer)

#### @faultless/cli
**版本**: v10.0.0 (2024)
**功能**: CLI 工具
- 项目脚手架
- API 定义解析器
- 代码生成
- 模型生成

#### @faultless/governance
**版本**: v11.0.0 (2025)
**功能**: 微服务治理
- 服务网格
- 配置中心
- 健康监控仪表盘

#### @faultless/auth
**版本**: v13.0.0 (2026)
**功能**: 认证授权
- JWT 认证
- 密码哈希（bcrypt）
- 角色权限控制
- API Key 管理

### 工具包 (Utility Packages)

#### @faultless/bloom
**版本**: v6.0.0 (2020)
**功能**: 布隆过滤器
- 概率型数据结构
- 用于快速判断元素是否存在

#### @faultless/collection
**版本**: v6.0.0 (2020)
**功能**: 集合工具
- 常用数据结构
- 集合操作

#### @faultless/concurrency
**版本**: v6.0.0 (2020)
**功能**: 并发控制
- 信号量
- 互斥锁
- 读写锁

#### @faultless/event
**版本**: v6.0.0 (2020)
**功能**: 事件系统
- 事件发射器
- 事件监听
- 事件过滤

#### @faultless/fx
**版本**: v6.0.0 (2020)
**功能**: 函数式编程
- 函数组合
- 柯里化
- 惰性求值

#### @faultless/mr
**版本**: v6.0.0 (2020)
**功能**: MapReduce
- 分布式计算
- 数据并行处理

#### @faultless/stream
**版本**: v6.0.0 (2020)
**功能**: 流处理
- 流式数据处理
- 背压处理

#### @faultless/worker
**版本**: v6.0.0 (2020)
**功能**: Worker 线程
- 多线程处理
- 任务队列

---

## 版本历史

| 版本 | 年份 | 核心特性 | 包数量 |
|------|------|----------|--------|
| v1.0.0 | 2015 | 核心 HTTP 服务器，模块系统，依赖注入，装饰器 | 2 |
| v2.0.0 | 2016 | 配置加密，远程配置源，配置版本管理，结构化日志，日志采样 | 4 |
| v3.0.0 | 2017 | 熔断器（三态），限流器（5 种算法），中间件增强，健康检查，重试机制 | 6 |
| v4.0.0 | 2018 | 服务发现（etcd/Consul/K8s），客户端负载均衡（7 种策略） | 7 |
| v5.0.0 | 2019 | 舱壁隔离，超时预算与截止时间传播，故障注入引擎，智能重试引擎 | 10 |
| v6.0.0 | 2020 | gRPC 服务端/客户端，Protobuf 加载，RPC 认证，连接池管理 | 19 |
| v7.0.0 | 2021 | 多级缓存（内存 + Redis），SQL/MongoDB 存储，事务支持 | 21 |
| v8.0.0 | 2022 | OpenTelemetry 分布式追踪，Prometheus/StatsD 指标监控 | 23 |
| v9.0.0 | 2023 | API 网关，路由匹配（精确/前缀/正则），请求/响应转换，插件系统 | 24 |
| v10.0.0 | 2024 | CLI 工具，项目脚手架，API 定义解析器，代码生成 | 25 |
| v11.0.0 | 2025 | 微服务治理，服务网格，配置中心，健康监控仪表盘 | 26 |
| v12.0.0 | 2026 | 完整特性对齐，数据校验，消息队列 | 28 |
| v13.0.0 | 2026 | 认证授权：JWT、密码哈希、角色权限、API Key 管理 | 29 |

---

## 开发环境设置

### 前置条件

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Git

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Faultless-framework/Faultless.git
cd Faultless

# 2. 安装依赖
pnpm install

# 3. 构建所有包
pnpm run build:all

# 4. 运行测试
pnpm run test:all

# 5. 代码检查
pnpm run lint:all
```

### 开发命令

```bash
# 构建所有包
pnpm run build:all

# 运行所有测试
pnpm run test:all

# 运行代码检查
pnpm run lint:all

# 运行示例
pnpm run examples:run

# 生成变更日志
pnpm run changelog

# 版本管理
pnpm run version:patch   # 补丁版本
pnpm run version:minor   # 次要版本
pnpm run version:major   # 主要版本
```

---

## 测试策略

### 单元测试

- 框架：vitest
- 覆盖率目标：80%+
- 测试文件位置：`packages/*/test/`

### 集成测试

- 测试套件：133 个测试
- 测试文件位置：`tests/integration/`
- 测试内容：
  - 缓存存储集成
  - 熔断器重试集成
  - 并发 HTTP 集成
  - 配置日志集成
  - HTTP 认证集成
  - HTTP 中间件集成
  - HTTP 校验集成

### 测试结果

| 测试类型 | 通过 | 失败 | 跳过 |
|----------|------|------|------|
| 单元测试 | 479 | 0 | 6 |
| 集成测试 | 133 | 0 | 0 |

**注意**: 6 个测试跳过是因为缺少外部依赖（fastify, prom-client, @opentelemetry/*）

---

## 构建和发布

### 构建系统

- 构建工具：unbuild
- 输出格式：ESM (.mjs) + CommonJS (.cjs) + 类型声明 (.d.ts)
- 构建命令：`npx unbuild packages/<package-name>`

### 发布流程

```bash
# 1. 确保所有测试通过
pnpm run test:all

# 2. 构建所有包
pnpm run build:all

# 3. 更新版本号
pnpm run version:patch  # 或 minor/major

# 4. 生成变更日志
pnpm run changelog

# 5. 提交更改
git add .
git commit -m "chore(release): v1.x.x"

# 6. 创建标签
git tag -a v1.x.x -m "Release v1.x.x"

# 7. 推送
git push origin main --tags
```

### npm 发布

```bash
# 发布单个包
cd packages/core
npm publish --access public

# 发布所有包
pnpm publish -r --access public
```

---

## CI/CD 配置

### GitHub Actions

文件位置：`.github/workflows/ci.yml`

### 工作流程

1. **测试阶段**
   - Node.js 20.x 和 22.x 矩阵测试
   - pnpm 安装
   - 代码检查
   - 类型检查
   - 构建
   - 单元测试
   - 覆盖率上传

2. **集成测试阶段**
   - Redis 服务容器
   - 集成测试运行

3. **构建阶段**
   - 构建所有包
   - 上传构建产物

4. **发布阶段**
   - 仅在 main 分支推送时触发
   - 版本检查
   - npm 发布

---

## 文档结构

### API 文档

位置：`docs/api/`

- `README.md` - API 概览
- `core.md` - 核心包文档
- `http.md` - HTTP 服务器文档
- `config.md` - 配置管理文档
- `log.md` - 日志系统文档
- `resilience.md` - 弹性组件文档
- `microservices.md` - 微服务文档
- `observability.md` - 可观测性文档
- `tools.md` - 工具文档
- `auth.md` - 认证授权文档

### 架构文档

位置：`docs/architecture/`

每个版本都有对应的架构文档：
- `v1.0.0.md` - v1.0.0 架构
- `v2.0.0.md` - v2.0.0 架构
- ...
- `v13.0.0-auth.md` - v13.0.0 认证授权架构

### 其他文档

- `CHANGELOG.md` - 版本变更日志
- `CONTRIBUTING.md` - 贡献指南
- `CODE_OF_CONDUCT.md` - 行为准则
- `REFACTOR-PLAN.md` - 重构计划
- `TODO.md` - 待办事项

---

## 示例应用

位置：`examples/`

| 示例 | 版本 | 功能 |
|------|------|------|
| v1-core-http | v1.0.0 | 核心 HTTP 服务器 |
| v2-config-log | v2.0.0 | 配置和日志 |
| v3-middleware-error | v3.0.0 | 中间件和错误处理 |
| v4-discovery-lb | v4.0.0 | 服务发现和负载均衡 |
| v5-resilience | v5.0.0 | 弹性模式 |
| v6-rpc-grpc | v6.0.0 | RPC 和 gRPC |
| v7-cache-store | v7.0.0 | 缓存和存储 |
| v8-tracing-metrics | v8.0.0 | 追踪和指标 |
| v9-gateway | v9.0.0 | API 网关 |
| v10-cli | v10.0.0 | CLI 工具 |
| v11-governance | v11.0.0 | 微服务治理 |
| v12-parity | v12.0.0 | 完整特性对齐 |
| v13-auth | v13.0.0 | 认证授权 |

---

## 性能基准测试

位置：`benchmarks/`

- `core.bench.ts` - 核心性能测试
- `http.bench.ts` - HTTP 性能测试
- `middleware.bench.ts` - 中间件性能测试
- `resilience.bench.ts` - 弹性组件性能测试
- `syncx.bench.ts` - 同步操作性能测试
- `comparison.bench.ts` - 对比测试
- `PERFORMANCE.md` - 性能报告

---

## Git 历史

### 统计信息

| 指标 | 值 |
|------|-----|
| 总提交数 | 9,904 |
| 版本标签 | 13 |
| 文件数量 | 360 |
| 包数量 | 29 |

### 年份分布

| 年份 | 提交数 | 版本 |
|------|--------|------|
| 2015 | 337 | v1.0.0 |
| 2016 | 672 | v2.0.0 |
| 2017 | 891 | v3.0.0 |
| 2018 | 1,004 | v4.0.0 |
| 2019 | 1,304 | v5.0.0 |
| 2020 | 1,339 | v6.0.0 |
| 2021 | 1,519 | v7.0.0 |
| 2022 | 1,340 | v8.0.0 |
| 2023 | 469 | v9.0.0 |
| 2024 | 191 | v10.0.0 |
| 2025 | 334 | v11.0.0 |
| 2026 | 504 | v12.0.0, v13.0.0 |

### 标签

```
v1.0.0, v2.0.0, v3.0.0, v4.0.0, v5.0.0, v6.0.0, v7.0.0,
v8.0.0, v9.0.0, v10.0.0, v11.0.0, v12.0.0, v13.0.0
```

---

## 已知问题和限制

### 测试跳过

以下测试因缺少外部依赖而跳过：

1. **packages/config/test/loader.test.ts**
   - 原因：缺少 `toml` 依赖
   - 解决方案：`pnpm add toml`

2. **packages/http/test/*.test.ts** (3 个文件)
   - 原因：缺少 `fastify` 依赖
   - 解决方案：`pnpm add fastify`

3. **packages/http/test/middleware-*.test.ts** (2 个文件)
   - 原因：缺少 `prom-client` 依赖
   - 解决方案：`pnpm add prom-client`

### 可选依赖

以下依赖是可选的，根据使用场景安装：

- `fastify` - HTTP 服务器
- `prom-client` - Prometheus 指标
- `@opentelemetry/*` - 分布式追踪
- `toml` - TOML 配置支持
- `ioredis` - Redis 客户端
- `pg` - PostgreSQL 客户端
- `mysql2` - MySQL 客户端
- `mongodb` - MongoDB 客户端

---

## 维护指南

### 日常维护

1. **依赖更新**
   ```bash
   pnpm update
   pnpm run build:all
   pnpm run test:all
   ```

2. **安全审计**
   ```bash
   pnpm audit
   ```

3. **代码检查**
   ```bash
   pnpm run lint:all
   ```

### 版本发布

1. **补丁版本**（Bug 修复）
   ```bash
   pnpm run version:patch
   pnpm run changelog
   git add .
   git commit -m "chore(release): v1.x.x"
   git tag -a v1.x.x -m "Release v1.x.x"
   git push origin main --tags
   ```

2. **次要版本**（新功能）
   ```bash
   pnpm run version:minor
   pnpm run changelog
   git add .
   git commit -m "chore(release): v1.x.0"
   git tag -a v1.x.0 -m "Release v1.x.0"
   git push origin main --tags
   ```

3. **主要版本**（破坏性变更）
   ```bash
   pnpm run version:major
   pnpm run changelog
   git add .
   git commit -m "chore(release): v2.0.0"
   git tag -a v2.0.0 -m "Release v2.0.0"
   git push origin main --tags
   ```

### 故障排查

1. **构建失败**
   - 检查 Node.js 版本 >= 20.0.0
   - 检查 pnpm 版本 >= 9.0.0
   - 清理缓存：`rm -rf node_modules && pnpm install`

2. **测试失败**
   - 检查外部依赖是否安装
   - 检查测试配置
   - 查看详细错误信息

3. **类型错误**
   - 运行类型检查：`pnpm run typecheck`
   - 检查 TypeScript 配置

---

## 联系方式

- **项目主页**: https://github.com/Faultless-framework/Faultless
- **问题反馈**: https://github.com/Faultless-framework/Faultless/issues
- **邮件**: team@faultless.dev

---

## 许可证

MIT License

---

## 致谢

感谢所有为 Faultless 框架做出贡献的开发者！

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-18
**维护者**: Faultless Team
