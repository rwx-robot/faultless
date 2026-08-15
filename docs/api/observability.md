# 可观测性 API

> 链路追踪和指标监控，帮助理解分布式系统中的请求流转和服务健康状态。

## 安装

```bash
pnpm add @Faultless/tracing @Faultless/metrics
```

## 链路追踪 (@Faultless/tracing)

### TracingService

```typescript
@Injectable()
class TracingService {
  constructor(options: TracingOptions);
  initialize(): Promise<void>;
  startSpan(name: string, attributes?: SpanAttributes): Span;
  withSpan<T>(name: string, fn: (span: Span) => Promise<T>, attributes?: SpanAttributes): Promise<T>;
  getCurrentContext(): SpanContext | null;
  addEvent(name: string, attributes?: SpanAttributes): void;
  setAttribute(key: string, value: string | number | boolean): void;
  getTraceId(): string | undefined;
  createPropagationHeaders(): Record<string, string>;
  extractContextFromHeaders(headers: Record<string, string>): Context;
  shutdown(): Promise<void>;
}
```

### 配置

```typescript
interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;       // 默认 '1.0.0'
  environment?: string;          // 默认 NODE_ENV
  exporter: TraceExporterType;
  endpoint?: string;
  sampleRate?: number;           // 默认 1.0 (100%)
  propagation?: 'tracecontext' | 'baggage' | 'b3' | 'xray';
  instruments?: {
    http?: boolean;              // 默认 true
    grpc?: boolean;              // 默认 true
    database?: boolean;
    cache?: boolean;
  };
}

enum TraceExporterType {
  JAEGER = 'JAEGER',
  ZIPKIN = 'ZIPKIN',
  OTLP = 'OTLP',
  CONSOLE = 'CONSOLE',
}
```

### 使用示例

```typescript
import { createTracingService, TraceExporterType } from '@Faultless/tracing';

const tracing = createTracingService({
  serviceName: 'user-service',
  serviceVersion: '1.0.0',
  environment: 'production',
  exporter: TraceExporterType.JAEGER,
  endpoint: 'http://localhost:14268/api/traces',
  sampleRate: 0.1,  // 10% 采样率
});

await tracing.start();

// 手动创建 Span
const span = tracing.startSpan('process-order', {
  'order.id': orderId,
  'order.amount': 100,
});

try {
  await processOrder(orderId);
  span.setStatus({ code: 1 }); // OK
} catch (error) {
  span.setStatus({ code: 2, message: error.message }); // ERROR
  span.recordException(error);
  throw error;
} finally {
  span.end();
}

// 使用 withSpan 自动管理 Span 生命周期
const result = await tracing.withSpan('fetch-user', async (span) => {
  span.setAttribute('user.id', userId);
  return await userService.findById(userId);
});

// 获取当前 traceId（用于日志关联）
const traceId = tracing.getTraceId();

// 创建传播头（用于跨服务传递上下文）
const headers = tracing.createPropagationHeaders();
// => { 'traceparent': '00-abc123-def456-01' }
```

### HTTP 中间件

```typescript
import { createTracingMiddleware } from '@Faultless/tracing';

const tracingMiddleware = createTracingMiddleware(tracing);
server.addMiddleware(tracingMiddleware);

// 自动为每个请求创建 Span
// Span 名称: "GET /users"
// 属性: http.method, http.url, http.status_code, http.user_agent
```

### 方法装饰器

```typescript
import { Traced } from '@Faultless/tracing';

class OrderService {
  @Traced('create-order')
  async createOrder(order: Order) {
    // 自动创建名为 "create-order" 的 Span
    return await this.db.insert(order);
  }

  @Traced()  // 自动使用 "OrderService.processPayment" 作为 Span 名
  async processPayment(orderId: string) {
    // ...
  }
}
```

## 指标监控 (@Faultless/metrics)

### MetricsService

```typescript
@Injectable()
class MetricsService {
  constructor(options: MetricsOptions);
  initialize(): Promise<void>;

  // 创建指标
  createCounter(name: string, help: string, labels?: string[]): Counter;
  createGauge(name: string, help: string, labels?: string[]): Gauge;
  createHistogram(name: string, help: string, buckets?: number[], labels?: string[]): Histogram;
  createSummary(name: string, help: string, percentiles?: number[], labels?: string[]): Summary;

  // 操作指标
  incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;
  decrementGauge(name: string, labels?: Record<string, string>, value?: number): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void;
  observeSummary(name: string, value: number, labels?: Record<string, string>): void;

  // 查询
  getMetrics(): Promise<string>;
  getMetricValue(name: string): Promise<any>;
  shutdown(): Promise<void>;
}
```

### 配置

```typescript
interface MetricsOptions {
  provider: MetricsProviderType;
  prefix?: string;                    // 默认 'Faultless_'
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;    // 默认 true
  prometheus?: {
    port?: number;                    // 默认 9090
    path?: string;                    // 默认 '/metrics'
  };
  statsd?: {
    host: string;
    port: number;
    prefix?: string;
  };
}

enum MetricsProviderType {
  PROMETHEUS = 'PROMETHEUS',
  STATSD = 'STATSD',
  CONSOLE = 'CONSOLE',
}

enum MetricType {
  COUNTER = 'COUNTER',      // 只增不减
  GAUGE = 'GAUGE',          // 可增可减
  HISTOGRAM = 'HISTOGRAM',  // 分桶统计
  SUMMARY = 'SUMMARY',      // 分位数统计
}
```

### 使用示例

```typescript
import { createMetricsService, MetricsProviderType } from '@Faultless/metrics';

const metrics = createMetricsService({
  provider: MetricsProviderType.PROMETHEUS,
  prefix: 'myapp_',
  defaultLabels: { service: 'user-service', environment: 'production' },
  collectDefaultMetrics: true,
  prometheus: { port: 9090, path: '/metrics' },
});

await metrics.initialize();

// Counter - 递增计数器（如请求总数）
const httpRequests = metrics.createCounter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'route', 'status_code']
);

metrics.incrementCounter('http_requests_total', { method: 'GET', route: '/users', status_code: '200' });

// Gauge - 仪表盘（如当前连接数）
const activeConnections = metrics.createGauge(
  'active_connections',
  'Number of active connections'
);

metrics.setGauge('active_connections', 42);

// Histogram - 直方图（如请求延迟分布）
const requestDuration = metrics.createHistogram(
  'http_request_duration_seconds',
  'HTTP request duration',
  [0.1, 0.5, 1, 2, 5, 10],  // 桶边界
  ['method', 'route']
);

metrics.observeHistogram('http_request_duration_seconds', 0.25, { method: 'GET', route: '/users' });

// Summary - 摘要（如延迟分位数）
const responseTime = metrics.createSummary(
  'http_response_time_seconds',
  'HTTP response time',
  [0.5, 0.9, 0.99],  // 分位数
  ['method']
);

metrics.observeSummary('http_response_time_seconds', 0.15, { method: 'GET' });
```

### HTTP 中间件

```typescript
import { createMetricsMiddleware } from '@Faultless/metrics';

const metricsMiddleware = createMetricsMiddleware(metrics);
server.addMiddleware(metricsMiddleware);

// 自动记录:
// - http_request_duration_seconds (histogram)
// - http_requests_total (counter)
// 标签: method, route, status_code
```

### 方法装饰器

```typescript
import { Metrics } from '@Faultless/metrics';

class UserService {
  @Metrics('find_user')
  async findById(id: string) {
    // 自动记录:
    // - find_user_total (counter, 标签: status=success/error)
    // - find_user_duration_seconds (histogram)
    return await db.query('SELECT * FROM users WHERE id = $1', [id]);
  }

  @Metrics()  // 自动使用 "UserService.findAll" 作为指标名
  async findAll() {
    return await db.query('SELECT * FROM users');
  }
}
```

## 综合示例

```typescript
import { createTracingService, TraceExporterType } from '@Faultless/tracing';
import { createMetricsService, MetricsProviderType } from '@Faultless/metrics';

// 初始化追踪
const tracing = createTracingService({
  serviceName: 'order-service',
  exporter: TraceExporterType.OTLP,
  endpoint: 'http://jaeger:4317',
  sampleRate: 0.1,
});

// 初始化指标
const metrics = createMetricsService({
  provider: MetricsProviderType.PROMETHEUS,
  prefix: 'order_',
  defaultLabels: { service: 'order-service' },
});

await tracing.initialize();
await metrics.initialize();

// 在请求中使用
async function handleOrder(request: FastifyRequest, reply: FastifyReply) {
  const span = tracing.startSpan('handle-order');
  const start = Date.now();

  try {
    const order = await processOrder(request.body);
    span.setStatus({ code: 1 });
    metrics.incrementCounter('orders_total', { status: 'success' });
    return reply.send(order);
  } catch (error) {
    span.setStatus({ code: 2, message: error.message });
    metrics.incrementCounter('orders_total', { status: 'error' });
    throw error;
  } finally {
    span.end();
    metrics.observeHistogram('order_duration_seconds', (Date.now() - start) / 1000);
  }
}
```
