# 工具 API

> CLI 脚手架、参数校验、消息队列，提供开发和运维工具支持。

## 安装

```bash
pnpm add @Faultless/cli @Faultless/validation @Faultless/queue
```

## CLI 工具 (@Faultless/cli)

### Cli

```typescript
class Cli {
  constructor(version?: string);  // 默认 '10.0.0'
  command(name: string, description: string, options?: CliOption[], action?: CliAction): void;
  parseArgs(argv: string[]): ParsedArgs;
  run(argv?: string[]): Promise<void>;
  printHelp(): void;
}
```

### 配置

```typescript
interface CliCommand {
  name: string;
  description: string;
  options?: CliOption[];
  action: (args: any, options: any) => Promise<void>;
}

interface CliOption {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number';
  default?: any;
  required?: boolean;
  alias?: string;  // 短选项，如 '-p'
}

interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, any>;
}
```

### 使用示例

```typescript
import { Cli } from '@Faultless/cli';

const cli = new Cli('1.0.0');

cli.command('serve', '启动 HTTP 服务器', [
  { name: 'port', description: '监听端口', type: 'number', default: 3000, alias: 'p' },
  { name: 'host', description: '监听地址', type: 'string', default: '0.0.0.0' },
  { name: 'env', description: '运行环境', type: 'string', default: 'development' },
], async (args, options) => {
  console.log(`Starting server on ${options.host}:${options.port}`);
  // 启动服务器逻辑...
});

cli.command('migrate', '运行数据库迁移', [
  { name: 'version', description: '目标版本', type: 'string', required: true },
  { name: 'dry-run', description: '仅预览不执行', type: 'boolean', default: false },
], async (args, options) => {
  if (options['dry-run']) {
    console.log('Dry run mode');
  }
  // 迁移逻辑...
});

cli.command('seed', '填充测试数据', [], async (args, options) => {
  // 填充逻辑...
});

// 运行
await cli.run();
```

### 交互式提示

```typescript
import { prompt, confirm } from '@Faultless/cli';

// 文本输入
const name = await prompt('请输入项目名称', 'my-project');

// 确认提示
const shouldContinue = await confirm('是否继续？', true);
// => true/false
```

### 命令行参数解析

```typescript
import { Cli } from '@Faultless/cli';

const cli = new Cli();
const { command, args, options } = cli.parseArgs([
  'node', 'app.js', 'serve', '--port', '8080', '--env', 'production'
]);

// command = 'serve'
// args = []
// options = { port: '8080', env: 'production' }
```

## 参数校验 (@Faultless/validation)

### 装饰器校验

```typescript
import {
  Required, MinLength, MaxLength, Min, Max,
  Email, Pattern, Validate,
  validate, validateOrThrow,
} from '@Faultless/validation';
```

### 校验装饰器

```typescript
class CreateUserDto {
  @Required('用户名不能为空')
  name!: string;

  @Required('邮箱不能为空')
  @Email('邮箱格式不正确')
  email!: string;

  @Required('密码不能为空')
  @MinLength(8, '密码至少 8 个字符')
  @MaxLength(100, '密码最多 100 个字符')
  password!: string;

  @Min(0, '年龄不能小于 0')
  @Max(150, '年龄不能大于 150')
  age!: number;

  @Pattern(/^\+?[\d\s-]+$/, '手机号格式不正确')
  phone!: string;

  @Validate(
    (value) => typeof value === 'string' && value.startsWith('NF-'),
    'ID 必须以 NF- 开头'
  )
  customId!: string;
}
```

### 执行校验

```typescript
const dto = new CreateUserDto();
dto.name = '';
dto.email = 'invalid-email';
dto.password = '123';
dto.age = -1;

const result = validate(dto);
// => {
//   isValid: false,
//   errors: [
//     { property: 'name', rule: 'required', message: '用户名不能为空', value: '' },
//     { property: 'email', rule: 'email', message: '邮箱格式不正确', value: 'invalid-email' },
//     { property: 'password', rule: 'minLength', message: '密码至少 8 个字符', value: '123' },
//     { property: 'age', rule: 'min', message: '年龄不能小于 0', value: -1 },
//   ]
// }

// 或者直接抛出错误
validateOrThrow(dto);
// => Error: 用户不能为空, 邮箱格式不正确, 密码至少 8 个字符, 年龄不能小于 0
```

### 自定义校验规则

```typescript
import { ValidationRule } from '@Faultless/validation';

// 在装饰器中使用自定义函数
class OrderDto {
  @Validate(
    (value) => {
      if (typeof value !== 'object' || value === null) return false;
      const items = value.items;
      return Array.isArray(items) && items.length > 0;
    },
    '订单必须包含至少一个商品'
  )
  items!: OrderItem[];
}
```

## 消息队列 (@Faultless/queue)

### MessageQueue

```typescript
@Injectable()
class MessageQueue {
  constructor(options: QueueOptions);
  publish<T>(topic: string, data: T): Promise<QueueMessage<T>>;
  subscribe<T>(topic: string, handler: MessageHandler<T>, concurrency?: number): void;
  getStats(): QueueStats;
}
```

### 配置

```typescript
interface QueueOptions {
  type: QueueType;
  connection?: string;
  maxRetries?: number;          // 默认 3
  retryDelayMs?: number;        // 默认 1000
  visibilityTimeoutMs?: number; // 默认 30000
}

enum QueueType {
  REDIS = 'redis',
  RABBITMQ = 'rabbitmq',
  KAFKA = 'kafka',
  IN_MEMORY = 'in-memory',
}

interface QueueMessage<T = any> {
  id: string;
  topic: string;
  data: T;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface QueueStats {
  topics: number;
  totalMessages: number;
  pendingMessages: number;
  processingMessages: number;
  completedMessages: number;
  failedMessages: number;
}
```

### 使用示例

```typescript
import { createMessageQueue, QueueType } from '@Faultless/queue';

// 内存队列（测试用）
const queue = createMessageQueue({
  type: QueueType.IN_MEMORY,
  maxRetries: 3,
  retryDelayMs: 1000,
});

// 发布消息
await queue.publish('order.created', {
  orderId: '123',
  userId: 'user-1',
  amount: 99.99,
});

// 订阅消息
queue.subscribe('order.created', async (message) => {
  console.log(`Processing order: ${message.data.orderId}`);
  await processOrder(message.data);
}, 3);  // 并发数 3

// 查看统计
const stats = queue.getStats();
// => { topics: 1, totalMessages: 10, pendingMessages: 2, ... }
```

### 重试机制

```typescript
// 消息失败后自动重试（指数退避）
queue.subscribe('order.process', async (message) => {
  try {
    await processPayment(message.data);
  } catch (error) {
    // 如果未超过 maxRetries，消息会自动重新入队
    // 重试延迟: retryDelayMs * 2^(retryCount - 1)
    throw error;
  }
});
```

### Redis 队列

```typescript
const queue = createMessageQueue({
  type: QueueType.REDIS,
  connection: 'redis://localhost:6379',
  maxRetries: 5,
  retryDelayMs: 2000,
  visibilityTimeoutMs: 60000,
});

// Redis 使用 List 实现队列
// 支持持久化和分布式消费
```

### RabbitMQ 队列

```typescript
const queue = createMessageQueue({
  type: QueueType.RABBITMQ,
  connection: 'amqp://localhost:5672',
  maxRetries: 3,
});

// RabbitMQ 使用 AMQP 协议
// 支持确认机制、死信队列、消息持久化
```

### Kafka 队列

```typescript
const queue = createMessageQueue({
  type: QueueType.KAFKA,
  connection: 'localhost:9092',
  maxRetries: 3,
});

// Kafka 使用 Topic 分区
// 支持消费者组、偏移量管理、消息回放
```
