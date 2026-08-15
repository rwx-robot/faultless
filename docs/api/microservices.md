# 微服务 API

> 服务发现、RPC 通信、API 网关和治理组件，构建分布式微服务架构。

## 安装

```bash
pnpm add @Faultless/discovery @Faultless/rpc @Faultless/gateway @Faultless/governance
```

## 服务发现 (@Faultless/discovery)

### ServiceDiscovery

```typescript
// 支持的发现类型
type DiscoveryType = 'etcd' | 'consul' | 'kubernetes' | 'static';

interface ServiceDiscoveryOptions {
  type: DiscoveryType;
  endpoints: string[];
  serviceName: string;
  ttl?: number;
  metadata?: Record<string, string>;
}
```

### Resolver

```typescript
interface Resolver {
  start(): Promise<void>;
  stop(): Promise<void>;
  resolve(key?: string): Promise<ResolvedEndpoint | null>;
}

interface ResolvedEndpoint {
  address: string;
  port: number;
  metadata?: Record<string, string>;
}
```

### LoadBalancer

```typescript
// 负载均衡策略
type BalancerType = 'round-robin' | 'random' | 'weighted' | 'least-connections';
```

### 使用示例

```typescript
import { createResolver } from '@Faultless/discovery';

// 静态配置
const resolver = createResolver('user-service', {
  discovery: {
    type: 'static',
    endpoints: [
      { address: 'localhost', port: 3001 },
      { address: 'localhost', port: 3002 },
    ],
    serviceName: 'user-service',
  },
});

await resolver.start();

// 获取可用实例
const endpoint = await resolver.resolve();
// => { address: 'localhost', port: 3001 }

await resolver.stop();
```

## RPC 通信 (@Faultless/rpc)

### GrpcServer

```typescript
class GrpcServer {
  constructor(options: GrpcServerOptions);
  addService(service: any, implementation: any): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

### GrpcClient

```typescript
class GrpcClient<T> {
  constructor(options: GrpcClientOptions);
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  call<R>(method: string, request: R): Promise<R>;
}
```

### 连接池

```typescript
class GrpcConnectionPool {
  constructor(options: ConnectionPoolOptions);
  acquire(): Promise<GrpcClient>;
  release(client: GrpcClient): void;
  drain(): Promise<void>;
}
```

### 使用示例

```typescript
import { GrpcServer, GrpcClient } from '@Faultless/rpc';

// 服务端
const server = new GrpcServer({
  port: 50051,
  maxConnections: 100,
});

server.addService(userServiceProto, {
  async GetUser(request) {
    return await userService.findById(request.id);
  },
  async ListUsers(request) {
    return await userService.findAll(request.filter);
  },
});

await server.start();

// 客户端
const client = new GrpcClient({
  host: 'localhost:50051',
  timeout: 5000,
});

await client.connect();
const user = await client.call('GetUser', { id: '123' });
await client.disconnect();
```

## API 网关 (@Faultless/gateway)

### Gateway

```typescript
class Gateway {
  constructor(options: GatewayOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  addRoute(route: GatewayRoute): void;
  addMiddleware(middleware: GatewayMiddleware): void;
}
```

### 配置

```typescript
interface GatewayOptions {
  port: number;
  host?: string;
  routes: GatewayRoute[];
  middlewares?: GatewayMiddleware[];
}

interface GatewayRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  target: string;           // 目标服务地址
  timeout?: number;         // 超时 (ms)
  retries?: number;         // 重试次数
  auth?: boolean;           // 是否需要认证
  rateLimit?: RateLimitOptions;
}

interface GatewayMiddleware {
  name: string;
  handler: (request: unknown, response: unknown, next: () => void) => void;
}
```

### 使用示例

```typescript
import { Gateway } from '@Faultless/gateway';

const gateway = new Gateway({
  port: 8080,
  routes: [
    {
      path: '/api/users/:id',
      method: 'GET',
      target: 'http://user-service:3001',
      timeout: 5000,
      retries: 3,
      auth: true,
    },
    {
      path: '/api/orders',
      method: 'POST',
      target: 'http://order-service:3002',
      timeout: 10000,
      rateLimit: { windowMs: 60000, max: 100 },
    },
    {
      path: '/api/products',
      method: 'GET',
      target: 'http://product-service:3003',
      timeout: 3000,
    },
  ],
  middlewares: [
    {
      name: 'cors',
      handler: (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        next();
      },
    },
  ],
});

await gateway.start();
```

## 治理组件 (@Faultless/governance)

### ServiceMesh

```typescript
class ServiceMesh {
  constructor(options: ServiceMeshOptions);
  registerService(name: string, instance: ServiceInstance): Promise<void>;
  deregisterService(name: string, instanceId: string): Promise<void>;
  discoverService(name: string): Promise<ServiceInstance[]>;
  getHealthStatus(name: string): Promise<HealthStatus>;
}
```

### ConfigCenter

```typescript
class ConfigCenter {
  constructor(options: ConfigCenterOptions);
  getConfig(key: string): Promise<string>;
  setConfig(key: string, value: string): Promise<void>;
  watchConfig(key: string, callback: (value: string) => void): Promise<() => void>;
  deleteConfig(key: string): Promise<void>;
}
```

### 使用示例

```typescript
import { ServiceMesh, ConfigCenter } from '@Faultless/governance';

// 服务网格
const mesh = new ServiceMesh({
  type: 'consul',
  endpoints: ['localhost:8500'],
});

await mesh.registerService('user-service', {
  id: 'user-1',
  address: 'localhost',
  port: 3001,
  health: { http: '/health' },
  metadata: { version: '1.0.0' },
});

const instances = await mesh.discoverService('user-service');

// 配置中心
const configCenter = new ConfigCenter({
  type: 'etcd',
  endpoints: ['localhost:2379'],
  namespace: '/myapp/config',
});

const dbHost = await configCenter.getConfig('database.host');
await configCenter.setConfig('database.host', 'new-host');

const unwatch = await configCenter.watchConfig('feature-flags', (value) => {
  console.log('Feature flags updated:', value);
});
```
