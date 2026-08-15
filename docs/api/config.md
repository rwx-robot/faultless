# @Faultless/config

> 配置管理包：支持多源配置加载、热更新监听、敏感配置加密、配置版本控制和远程配置中心集成。

## 安装

```bash
pnpm add @Faultless/config
```

## 模块导出

```typescript
import {
  // 配置类型
  AppConfig, ConfigSource, ConfigLoaderOptions, ConfigSchema, ConfigProperty,
  ConfigChangeEvent, ConfigChangeListener,

  // 配置加载器
  ConfigLoader,
  createFileSource, createEnvSource,

  // 配置监听
  ConfigWatcher, createFileWatcher, createDirectoryWatcher,

  // 配置加密
  ConfigEncryption, EncryptedConfig, EncryptionOptions,
  createEncryption, encryptConfig, decryptConfig,

  // 远程配置
  RemoteConfigClient, RemoteConfigSource, RemoteConfigOptions,
  EtcdConfigClient, ConsulConfigClient, CustomConfigClient,
  createRemoteConfigClient, createRemoteConfigSource,

  // 版本控制
  ConfigVersion, ConfigVersionManager, VersionStorage,
  MemoryVersionStorage, FileVersionStorage,
  createVersionManager,
} from '@Faultless/config';
```

## AppConfig

```typescript
interface AppConfig {
  app: {
    name: string;
    version: string;
    env: 'development' | 'staging' | 'production';
    port: number;
    host: string;
  };
  database?: DatabaseOptions;
  redis?: RedisOptions;
  discovery?: ServiceDiscoveryOptions;
  tracing?: TracingOptions;
  metrics?: MetricsOptions;
  auth?: AuthOptions;
  queue?: QueueOptions;
  gateway?: GatewayOptions;
  custom?: Record<string, unknown>;
}
```

## ConfigLoader

```typescript
class ConfigLoader extends EventEmitter {
  constructor(options: ConfigLoaderOptions);
  load(): Promise<AppConfig>;
  getConfig(): AppConfig;
  get<T>(key: string): T;
  onChange(listener: ConfigChangeListener): () => void;
  reload(): Promise<AppConfig>;
  stopWatching(): void;
  destroy(): Promise<void>;
}
```

### 配置源

```typescript
interface ConfigSource {
  name: string;
  priority: number;  // 越大优先级越高
  load(): Promise<Record<string, unknown>> | Record<string, unknown>;
  watch?(callback: (config: Record<string, unknown>) => void): () => void;
}
```

### 使用示例

```typescript
import { ConfigLoader, createFileSource, createEnvSource } from '@Faultless/config';

const loader = new ConfigLoader({
  sources: [
    createFileSource('./config/default.json', 0),    // 低优先级
    createFileSource('./config/production.json', 50), // 中优先级
    createEnvSource('APP_', 100),                     // 高优先级（环境变量）
  ],
  validateOnLoad: true,
  watchForChanges: true,
});

// 加载配置
const config = await loader.load();

// 获取嵌套配置
const dbHost = loader.get<string>('database.host');
const jwtSecret = loader.get<string>('auth.jwtSecret');

// 监听配置变更
const unsubscribe = loader.onChange((event) => {
  console.log(`Config changed: ${event.key}`);
  console.log(`Old: ${event.oldValue}, New: ${event.newValue}`);
  console.log(`Source: ${event.source}`);
});

// 重新加载
await loader.reload();

// 停止监听
loader.stopWatching();
```

### 文件源支持格式

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| JSON | `.json` | 标准 JSON |
| YAML | `.yaml`, `.yml` | YAML 格式 |
| TOML | `.toml` | TOML 格式 |

### 环境变量源

```typescript
// APP_DATABASE_HOST=localhost => config.database.host = 'localhost'
// APP_PORT=3000 => config.port = 3000
const envSource = createEnvSource('APP_', 100);

// 自动解析类型：true/false/null/undefined/number/JSON
```

## 配置校验

```typescript
const schema: ConfigSchema = {
  type: 'object',
  properties: {
    app: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        env: { type: 'string', enum: ['development', 'staging', 'production'] },
      },
      required: ['name', 'port', 'env'],
    },
    database: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1 },
        database: { type: 'string' },
      },
    },
  },
  required: ['app'],
};

const loader = new ConfigLoader({
  sources: [...],
  schema,
  validateOnLoad: true,  // 加载时自动校验
});
```

## ConfigWatcher

```typescript
class ConfigWatcher extends EventEmitter {
  constructor(source: ConfigSource, options?: WatcherOptions);
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

interface WatcherOptions {
  interval?: number;     // 检查间隔 (ms)，默认 5000
  persistent?: boolean;  // 是否保持进程活跃，默认 true
}
```

### 使用示例

```typescript
import { createFileWatcher, createDirectoryWatcher } from '@Faultless/config';

// 监听单个文件
const watcher = createFileWatcher('./config.json', { interval: 3000 });
watcher.on('change', (event) => {
  console.log('Config file changed:', event);
});
watcher.start();

// 监听目录
const dirWatcher = createDirectoryWatcher('./config/', { interval: 5000 });
dirWatcher.on('change', (event) => {
  console.log('Config directory changed:', event);
});
dirWatcher.start();
```

## 配置加密

```typescript
class ConfigEncryption {
  constructor(password: string, options?: EncryptionOptions);
  encrypt(config: Record<string, unknown>): EncryptedConfig;
  decrypt(encryptedConfig: EncryptedConfig): Record<string, unknown>;
  static isEncrypted(config: unknown): config is EncryptedConfig;
}
```

### 配置选项

```typescript
interface EncryptionOptions {
  algorithm?: string;     // 默认 'aes-256-gcm'
  keyLength?: number;     // 默认 32
  ivLength?: number;      // 默认 16
  saltLength?: number;    // 默认 16
  iterations?: number;    // 默认 100000
}
```

### 使用示例

```typescript
import { encryptConfig, decryptConfig, createEncryption } from '@Faultless/config';

// 加密配置
const encrypted = encryptConfig(
  { database: { password: 'my-secret' } },
  'master-password'
);
// => { encrypted: true, algorithm: 'aes-256-gcm', iv: '...', salt: '...', data: '...', version: 1 }

// 解密配置
const decrypted = decryptConfig(encrypted, 'master-password');
// => { database: { password: 'my-secret' } }

// 检测是否已加密
ConfigEncryption.isEncrypted(encrypted); // true
```

## 远程配置

```typescript
interface RemoteConfigClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConfig(key: string): Promise<string | null>;
  watchConfig(key: string, callback: (value: string | null) => void): Promise<() => void>;
  listKeys(prefix: string): Promise<string[]>;
}
```

### etcd 配置

```typescript
import { createRemoteConfigSource } from '@Faultless/config';

const etcdSource = createRemoteConfigSource(
  'etcd-config',
  100,
  {
    type: 'etcd',
    endpoints: ['localhost:2379'],
    namespace: '/myapp/config',
    username: 'root',
    password: 'secret',
  },
  '/myapp/config'  // key 前缀
);

const loader = new ConfigLoader({
  sources: [etcdSource],
  watchForChanges: true,  // 自动监听 etcd 变更
});

await loader.load();
```

### Consul 配置

```typescript
const consulSource = createRemoteConfigSource(
  'consul-config',
  100,
  {
    type: 'consul',
    endpoints: ['localhost:8500'],
    namespace: 'myapp/config',
    password: 'consul-token',
  },
  'myapp/config'
);
```

### 自定义远程配置

```typescript
const customSource = createRemoteConfigSource(
  'custom-config',
  100,
  {
    type: 'custom',
    customFetcher: async (key) => {
      const response = await fetch(`https://config-api.example.com/${key}`);
      return response.ok ? response.text() : null;
    },
    customWatcher: async (key, callback) => {
      // 实现 WebSocket 或轮询监听
      const interval = setInterval(async () => {
        const value = await fetchConfig(key);
        callback(value);
      }, 5000);
      return () => clearInterval(interval);
    },
  }
);
```

## 配置版本控制

```typescript
class ConfigVersionManager extends EventEmitter {
  constructor(options: ConfigVersionManagerOptions);
  initialize(): Promise<void>;
  createVersion(config: AppConfig, author?: string, message?: string): Promise<ConfigVersion>;
  rollback(version: number): Promise<AppConfig | null>;
  getVersion(version: number): Promise<ConfigVersion | null>;
  listVersions(): Promise<ConfigVersion[]>;
  getCurrentConfig(): Promise<AppConfig | null>;
  getCurrentVersion(): Promise<number>;
  diff(versionA: number, versionB: number): Promise<ConfigDiff[]>;
}
```

### 使用示例

```typescript
import { createVersionManager, MemoryVersionStorage } from '@Faultless/config';

const versionManager = createVersionManager({
  storage: new MemoryVersionStorage(),
  maxVersions: 50,
  autoCleanup: true,
});

await versionManager.initialize();

// 创建新版本
const v1 = await versionManager.createVersion(config, 'admin', 'Initial config');
const v2 = await versionManager.createVersion(updatedConfig, 'admin', 'Update DB config');

// 查看版本历史
const versions = await versionManager.listVersions();
// => [{ version: 2, ... }, { version: 1, ... }]

// 比较版本差异
const diffs = await versionManager.diff(1, 2);
// => [{ path: 'database.host', type: 'modified', oldValue: 'old-host', newValue: 'new-host' }]

// 回滚
await versionManager.rollback(1);
```
