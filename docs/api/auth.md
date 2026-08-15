# @Faultless/auth

> 认证授权包：提供 JWT 签发/验证、密码哈希、角色权限管理、API Key 管理及配套中间件。

## 安装

```bash
pnpm add @Faultless/auth
```

依赖：`jsonwebtoken`、`bcryptjs`

## 模块导出

```typescript
import {
  // JWT 服务
  JwtService, JwtConfig, UserPayload, JwtToken,

  // 密码服务
  PasswordService,

  // 角色服务
  RoleService, Role,

  // API Key 服务
  ApiKeyService,

  // 中间件
  createAuthMiddleware,
  createRoleMiddleware,
  createPermissionMiddleware,
  createApiKeyMiddleware,
} from '@Faultless/auth';
```

## JwtService

```typescript
@Injectable()
class JwtService {
  constructor(config: JwtConfig);

  sign(payload: UserPayload, options?: jwt.SignOptions): string;
  verify<T = UserPayload>(token: string): T;
  decode<T = UserPayload>(token: string): T | null;
  generateTokenPair(payload: UserPayload): JwtToken;
  refreshToken(refreshToken: string): JwtToken;
}
```

### 配置选项

```typescript
interface JwtConfig {
  secret: string;              // JWT 签名密钥
  expiresIn?: string | number; // 默认 '24h'
  issuer?: string;             // 签发者
  audience?: string;           // 受众
}

interface JwtToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;       // 秒
  tokenType: string;       // 'Bearer'
}

interface UserPayload {
  sub: string;             // 用户 ID
  email?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: any;      // 自定义字段
}
```

### 使用示例

```typescript
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET,
  expiresIn: '24h',
  issuer: 'my-app',
});

// 签发令牌
const token = jwtService.sign({
  sub: 'user-123',
  email: 'john@example.com',
  roles: ['admin'],
});

// 验证令牌
const payload = jwtService.verify<UserPayload>(token);
console.log(payload.sub); // 'user-123'

// 生成令牌对（访问令牌 + 刷新令牌）
const tokens = jwtService.generateTokenPair({
  sub: 'user-123',
  email: 'john@example.com',
});
// => { accessToken, refreshToken, expiresIn: 86400, tokenType: 'Bearer' }

// 刷新令牌
const newTokens = jwtService.refreshToken(tokens.refreshToken);
```

## PasswordService

```typescript
@Injectable()
class PasswordService {
  constructor(saltRounds?: number); // 默认 10

  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
  generateToken(length?: number): string; // 默认 32 字符
}
```

### 使用示例

```typescript
const passwordService = new PasswordService(12);

// 哈希密码
const hashedPassword = await passwordService.hash('my-password');
// => '$2a$12$...'

// 验证密码
const isValid = await passwordService.compare('my-password', hashedPassword);
// => true

// 生成随机令牌（可用于密码重置）
const resetToken = passwordService.generateToken(64);
// => 'aB3xY7...'
```

## RoleService

```typescript
@Injectable()
class RoleService {
  createRole(name: string, permissions: string[]): void;
  getRole(name: string): Role | undefined;
  getAllRoles(): Role[];
  deleteRole(name: string): boolean;
  hasPermission(roleName: string, permission: string): boolean;
  userHasPermission(userRoles: string[], permission: string): boolean;
}

interface Role {
  name: string;
  permissions: string[];
}
```

### 使用示例

```typescript
const roleService = new RoleService();

// 创建角色
roleService.createRole('admin', ['users:read', 'users:write', 'users:delete', '*']);
roleService.createRole('editor', ['posts:read', 'posts:write']);
roleService.createRole('viewer', ['posts:read']);

// 检查权限
roleService.hasPermission('admin', 'users:delete'); // true
roleService.hasPermission('editor', 'users:delete'); // false

// 检查用户权限（用户有多个角色）
roleService.userHasPermission(['editor', 'viewer'], 'posts:write'); // true
roleService.userHasPermission(['viewer'], 'posts:write'); // false

// 通配符权限
roleService.hasPermission('admin', 'anything'); // true（因为 admin 有 '*'）
```

## ApiKeyService

```typescript
@Injectable()
class ApiKeyService {
  generateApiKey(userId: string, permissions?: string[]): string;
  validateApiKey(key: string): { valid: boolean; userId?: string; permissions?: string[] };
  deleteApiKey(key: string): boolean;
  getUserApiKeys(userId: string): string[];
}
```

### 使用示例

```typescript
const apiKeyService = new ApiKeyService();

// 生成 API Key
const apiKey = apiKeyService.generateApiKey('user-123', ['read', 'write']);
// => 'nf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

// 验证 API Key
const result = apiKeyService.validateApiKey(apiKey);
// => { valid: true, userId: 'user-123', permissions: ['read', 'write'] }

// 获取用户的所有 API Key
const keys = apiKeyService.getUserApiKeys('user-123');
// => ['nf_xxx...']

// 删除 API Key
apiKeyService.deleteApiKey(apiKey); // true
```

## 中间件

### 认证中间件

```typescript
import { createAuthMiddleware } from '@Faultless/auth';

const jwtService = new JwtService({ secret: 'my-secret' });
const authMiddleware = createAuthMiddleware(jwtService);

// 使用
server.addMiddleware(authMiddleware);
```

请求头格式：`Authorization: Bearer <token>`

### 角色授权中间件

```typescript
import { createRoleMiddleware } from '@Faultless/auth';

// 需要 admin 或 superadmin 角色
const adminMiddleware = createRoleMiddleware(roleService, 'admin', 'superadmin');

// 使用
server.addMiddleware(authMiddleware);    // 先认证
server.addMiddleware(adminMiddleware);   // 再授权
```

### 权限授权中间件

```typescript
import { createPermissionMiddleware } from '@Faultless/auth';

// 需要 users:write 权限
const writeMiddleware = createPermissionMiddleware(roleService, 'users:write');

server.addMiddleware(authMiddleware);
server.addMiddleware(writeMiddleware);
```

### API Key 认证中间件

```typescript
import { createApiKeyMiddleware } from '@Faultless/auth';

const apiKeyMiddleware = createApiKeyMiddleware(apiKeyService);

// 使用（适用于外部 API 调用）
server.addMiddleware(apiKeyMiddleware);
```

请求头格式：`X-Api-Key: <api-key>`

## 完整认证流程示例

```typescript
import { JwtService, PasswordService, RoleService, createAuthMiddleware, createRoleMiddleware } from '@Faultless/auth';

const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
const passwordService = new PasswordService();
const roleService = new RoleService();

// 初始化角色
roleService.createRole('admin', ['*']);
roleService.createRole('user', ['profile:read', 'profile:write']);

// 注册
app.post('/register', async (req, reply) => {
  const { email, password } = req.body;
  const hashedPassword = await passwordService.hash(password);
  const user = await userService.create({ email, password: hashedPassword });
  const tokens = jwtService.generateTokenPair({ sub: user.id, email, roles: ['user'] });
  return reply.send(tokens);
});

// 登录
app.post('/login', async (req, reply) => {
  const { email, password } = req.body;
  const user = await userService.findByEmail(email);
  if (!user || !(await passwordService.compare(password, user.password))) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }
  const tokens = jwtService.generateTokenPair({ sub: user.id, email, roles: user.roles });
  return reply.send(tokens);
});

// 受保护的路由
app.addHook('preHandler', createAuthMiddleware(jwtService));
app.get('/profile', async (req) => req.user);

// 管理员路由
app.addHook('preHandler', createAuthMiddleware(jwtService));
app.addHook('preHandler', createRoleMiddleware(roleService, 'admin'));
app.get('/admin/users', async () => userService.findAll());
```
