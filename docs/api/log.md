# @Faultless/log

> 日志系统包：结构化日志、多传输通道、采样策略、异步写入、敏感信息脱敏。

## 安装

```bash
pnpm add @Faultless/log
```

## 模块导出

```typescript
import {
  // Logger
  Logger, createLogger, getLogger, defaultLogger, LoggerOptions,

  // 传输通道
  Transport, ConsoleTransport, FileTransport, RotatingFileTransport, HttpTransport,
  TransportOptions,

  // 格式化器
  LogFormatter, JSONFormatter, PrettyFormatter, SimpleFormatter, LogfmtFormatter,
  createFormatter,

  // 日志级别
  getLevelValue, isLevelEnabled,

  // 采样
  LogSampler, createSampler, AlwaysSampler, NeverSampler, ProbabilisticSampler,
  RateSampler, LevelSampler,

  // 结构化日志
  StructuredLogEntry, LogAggregator, InMemoryLogAggregator,
  AsyncWriter, BufferedAsyncWriter, BatchedHttpWriter,
} from '@Faultless/log';
```

## Logger

```typescript
class Logger extends EventEmitter {
  constructor(options?: LoggerOptions);

  fatal(message: string, context?: string, metadata?: Record<string, unknown>): void;
  error(message: string, context?: string, metadata?: Record<string, unknown>): void;
  warn(message: string, context?: string, metadata?: Record<string, unknown>): void;
  info(message: string, context?: string, metadata?: Record<string, unknown>): void;
  debug(message: string, context?: string, metadata?: Record<string, unknown>): void;
  trace(message: string, context?: string, metadata?: Record<string, unknown>): void;
  logWithLevel(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): void;

  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  child(context: string, metadata?: Record<string, unknown>): Logger;
  setFormatter(formatter: LogFormatter): void;
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;
  setDefaultContext(context: string): void;
  setDefaultMetadata(metadata: Record<string, unknown>): void;

  enableStructuredFields(extractor?: (entry: LogEntry) => any[]): void;
  disableStructuredFields(): void;
  setSampler(sampler: LogSampler): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
```

### 配置选项

```typescript
interface LoggerOptions {
  level?: LogLevel;                  // 默认 'info'
  format?: 'json' | 'pretty' | 'simple' | 'logfmt' | LogFormatter;
  transports?: Transport[];
  defaultContext?: string;            // 默认上下文名
  defaultMetadata?: Record<string, unknown>;
  redactKeys?: string[];             // 脱敏字段名
  sampler?: LogSampler | 'always' | 'never' | 'probabilistic' | 'level' | 'rate';
  samplerOptions?: { rate?: number; maxPerSecond?: number };
  asyncWrite?: boolean;
  asyncWriteOptions?: { bufferSize?: number; flushInterval?: number };
  structuredFields?: boolean;
  serviceName?: string;
  environment?: string;
  version?: string;
}
```

### 基本使用

```typescript
import { createLogger } from '@Faultless/log';

// 创建 logger
const logger = createLogger({
  level: 'info',
  format: 'json',
  defaultContext: 'app',
  serviceName: 'my-service',
  environment: 'production',
});

// 记录日志
logger.info('Server started', 'http', { port: 3000 });
logger.error('Database connection failed', 'database', { host: 'localhost' });

// 子 logger
const dbLogger = logger.child('database', { host: 'localhost' });
dbLogger.info('Connected');
// => {"level":"info","message":"Connected","context":"database","metadata":{"host":"localhost"},...}
```

### 快捷函数

```typescript
import { getLogger } from '@Faultless/log';

// 获取默认 logger 的子 logger
const logger = getLogger('http');
logger.info('Request received');

// 获取默认 logger
const defaultLog = getLogger();
defaultLog.info('Global event');
```

## 日志级别

| 级别 | 值 | 说明 |
|------|-----|------|
| `fatal` | 0 | 致命错误，进程即将退出 |
| `error` | 1 | 错误，需要立即处理 |
| `warn` | 2 | 警告，可能有问题 |
| `info` | 3 | 一般信息（默认） |
| `debug` | 4 | 调试信息 |
| `trace` | 5 | 追踪信息 |

## 传输通道 (Transports)

### ConsoleTransport

```typescript
const consoleTransport = new ConsoleTransport({
  level: 'info',
  formatter: new PrettyFormatter(),
});
```

### FileTransport

```typescript
const fileTransport = new FileTransport({
  level: 'info',
  filename: '/var/log/app.log',
  formatter: new JSONFormatter(),
});
```

### RotatingFileTransport

```typescript
const rotatingTransport = new RotatingFileTransport({
  level: 'info',
  filename: '/var/log/app.log',
  maxSize: '10m',       // 单文件最大 10MB
  maxFiles: 5,          // 保留 5 个文件
  compress: true,       // 压缩旧文件
});
```

### HttpTransport

```typescript
const httpTransport = new HttpTransport({
  level: 'error',
  endpoint: 'https://log-collector.example.com/logs',
  batchSize: 100,
  flushInterval: 5000,
});
```

### 组合传输

```typescript
const logger = createLogger({
  level: 'debug',
  transports: [
    new ConsoleTransport({ level: 'debug', formatter: new PrettyFormatter() }),
    new FileTransport({ level: 'info', filename: '/var/log/app.log' }),
    new RotatingFileTransport({
      level: 'warn',
      filename: '/var/log/warn.log',
      maxSize: '5m',
      maxFiles: 3,
    }),
  ],
});
```

## 格式化器 (Formatters)

| 格式化器 | 输出示例 |
|----------|----------|
| `JSONFormatter` | `{"level":"info","message":"hello","timestamp":"..."}` |
| `PrettyFormatter` | `[INFO] 2024-01-01T00:00:00.000Z [context] hello` |
| `SimpleFormatter` | `info: hello` |
| `LogfmtFormatter` | `level=info msg=hello timestamp=...` |

```typescript
import { createFormatter } from '@Faultless/log';

// 使用字符串创建
const formatter = createFormatter('pretty');

// 自定义格式化器
class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `[${entry.level.toUpperCase()}] ${entry.message}`;
  }
}
```

## 采样策略 (Samplers)

```typescript
// 始终采样（默认）
const always = new AlwaysSampler();

// 从不采样
const never = new NeverSampler();

// 概率采样（10%）
const probabilistic = createSampler('probabilistic', { rate: 0.1 });

// 速率采样（每秒最多 100 条）
const rate = createSampler('rate', { maxPerSecond: 100 });

// 级别采样（仅 warn 及以上）
const level = createSampler('level');

const logger = createLogger({
  sampler: probabilistic,
  samplerOptions: { rate: 0.1 },
});
```

## 异步写入

```typescript
const logger = createLogger({
  asyncWrite: true,
  asyncWriteOptions: {
    bufferSize: 100,      // 缓冲 100 条日志
    flushInterval: 1000,  // 每秒刷新一次
  },
  transports: [
    new FileTransport({ level: 'info', filename: '/var/log/app.log' }),
  ],
});

// 异步写入不阻塞主线程
logger.info('This is async');

// 手动刷新
await logger.flush();

// 关闭（刷新所有缓冲）
await logger.close();
```

## 敏感信息脱敏

```typescript
const logger = createLogger({
  redactKeys: ['password', 'secret', 'token', 'key', 'authorization', 'cookie'],
});

logger.info('User login', 'auth', {
  email: 'john@example.com',
  password: 'my-secret-password',
  token: 'abc123',
});
// => {"level":"info","message":"User login","metadata":{"email":"john@example.com","password":"[REDACTED]","token":"[REDACTED]"},...}
```

## 结构化日志

```typescript
const logger = createLogger({
  structuredFields: true,
  serviceName: 'my-service',
  environment: 'production',
  version: '1.0.0',
});

logger.info('Request processed', 'http', { method: 'GET', path: '/users' });
// => 自动添加 service_name, environment, version 等字段
```

## 日志聚合器

```typescript
import { InMemoryLogAggregator } from '@Faultless/log';

const aggregator = new InMemoryLogAggregator();
const logger = createLogger({ aggregator });

logger.info('Event 1');
logger.info('Event 2');

// 获取聚合的日志
const entries = aggregator.getEntries();
```
