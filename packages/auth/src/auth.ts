import 'reflect-metadata';
import { Injectable } from '@faultless/core';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

/**
 * JWT 配置
 */
export interface JwtConfig {
  secret: string;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

/**
 * 用户载荷
 */
export interface UserPayload {
  sub: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: any;
}

/**
 * JWT 令牌
 */
export interface JwtToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * 认证结果
 */
export interface AuthResult {
  success: boolean;
  user?: UserPayload;
  error?: string;
}

/**
 * 角色
 */
export interface Role {
  name: string;
  permissions: string[];
}

/**
 * JWT 服务
 */
@Injectable()
export class JwtService {
  private config: JwtConfig;

  constructor(config: JwtConfig) {
    this.config = {
      expiresIn: '24h',
      ...config,
    };
  }

  /**
   * 签发令牌
   */
  sign(payload: UserPayload, options?: jwt.SignOptions): string {
    const signOptions: jwt.SignOptions = {
      expiresIn: this.config.expiresIn,
      ...options,
    };
    
    if (this.config.issuer) {
      signOptions.issuer = this.config.issuer;
    }
    
    if (this.config.audience) {
      signOptions.audience = this.config.audience;
    }
    
    return jwt.sign(payload, this.config.secret, signOptions);
  }

  /**
   * 验证令牌
   */
  verify<T = UserPayload>(token: string): T {
    const verifyOptions: jwt.VerifyOptions = {};
    
    if (this.config.issuer) {
      verifyOptions.issuer = this.config.issuer;
    }
    
    if (this.config.audience) {
      verifyOptions.audience = this.config.audience;
    }
    
    return jwt.verify(token, this.config.secret, verifyOptions) as T;
  }

  /**
   * 解码令牌（不验证）
   */
  decode<T = UserPayload>(token: string): T | null {
    return jwt.decode(token) as T | null;
  }

  /**
   * 生成令牌对
   */
  generateTokenPair(payload: UserPayload): JwtToken {
    const accessToken = this.sign(payload);
    const refreshToken = this.sign(payload, { expiresIn: '7d' });

    const decoded = this.decode<{ exp?: number }>(accessToken);
    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * 刷新令牌
   */
  refreshToken(refreshToken: string): JwtToken {
    const payload = this.verify<UserPayload>(refreshToken);
    // Strip token-specific fields before re-signing
    const { exp, iat, nbf, ...cleanPayload } = payload as any;
    return this.generateTokenPair(cleanPayload);
  }
}

/**
 * 密码服务
 */
@Injectable()
export class PasswordService {
  private readonly saltRounds: number;

  constructor(saltRounds: number = 10) {
    this.saltRounds = saltRounds;
  }

  /**
   * 哈希密码
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * 验证密码
   */
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * 生成随机令牌
   */
  generateToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

/**
 * 角色服务
 */
@Injectable()
export class RoleService {
  private roles: Map<string, Role> = new Map();

  /**
   * 创建角色
   */
  createRole(name: string, permissions: string[]): void {
    this.roles.set(name, { name, permissions });
  }

  /**
   * 获取角色
   */
  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  /**
   * 获取所有角色
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * 删除角色
   */
  deleteRole(name: string): boolean {
    return this.roles.delete(name);
  }

  /**
   * 检查角色权限
   */
  hasPermission(roleName: string, permission: string): boolean {
    const role = this.roles.get(roleName);
    if (!role) return false;
    return role.permissions.includes(permission) || role.permissions.includes('*');
  }

  /**
   * 检查用户权限
   */
  userHasPermission(userRoles: string[], permission: string): boolean {
    return userRoles.some(roleName => this.hasPermission(roleName, permission));
  }
}

/**
 * API Key 服务
 */
@Injectable()
export class ApiKeyService {
  private apiKeys: Map<string, { key: string; userId: string; permissions: string[]; createdAt: Date }> = new Map();

  /**
   * 生成 API Key
   */
  generateApiKey(userId: string, permissions: string[] = []): string {
    const key = `nf_${Array.from({ length: 48 }, () => 
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36))
    ).join('')}`;
    
    this.apiKeys.set(key, {
      key,
      userId,
      permissions,
      createdAt: new Date(),
    });

    return key;
  }

  /**
   * 验证 API Key
   */
  validateApiKey(key: string): { valid: boolean; userId?: string; permissions?: string[] } {
    const record = this.apiKeys.get(key);
    if (!record) {
      return { valid: false };
    }
    return {
      valid: true,
      userId: record.userId,
      permissions: record.permissions,
    };
  }

  /**
   * 删除 API Key
   */
  deleteApiKey(key: string): boolean {
    return this.apiKeys.delete(key);
  }

  /**
   * 获取用户的所有 API Keys
   */
  getUserApiKeys(userId: string): string[] {
    return Array.from(this.apiKeys.values())
      .filter(record => record.userId === userId)
      .map(record => record.key);
  }
}

/**
 * 认证中间件
 */
export function createAuthMiddleware(jwtService: JwtService) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      reply.code(401).send({ error: 'Authorization header missing' });
      return;
    }

    const [type, token] = authHeader.split(' ');
    
    if (type !== 'Bearer' || !token) {
      reply.code(401).send({ error: 'Invalid authorization format' });
      return;
    }

    try {
      const payload = jwtService.verify<UserPayload>(token);
      request.user = payload;
      await next();
    } catch (error) {
      reply.code(401).send({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * 角色授权中间件
 */
export function createRoleMiddleware(roleService: RoleService, ...requiredRoles: string[]) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const user = request.user as UserPayload;
    
    if (!user) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const userRoles = user.roles || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      reply.code(403).send({ error: 'Insufficient permissions' });
      return;
    }

    await next();
  };
}

/**
 * 权限授权中间件
 */
export function createPermissionMiddleware(roleService: RoleService, requiredPermission: string) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const user = request.user as UserPayload;
    
    if (!user) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const userRoles = user.roles || [];
    const hasPermission = roleService.userHasPermission(userRoles, requiredPermission);

    if (!hasPermission) {
      reply.code(403).send({ error: `Missing permission: ${requiredPermission}` });
      return;
    }

    await next();
  };
}

/**
 * API Key 认证中间件
 */
export function createApiKeyMiddleware(apiKeyService: ApiKeyService) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const apiKey = request.headers['x-api-key'];
    
    if (!apiKey) {
      reply.code(401).send({ error: 'API key missing' });
      return;
    }

    const result = apiKeyService.validateApiKey(apiKey);
    
    if (!result.valid) {
      reply.code(401).send({ error: 'Invalid API key' });
      return;
    }

    request.userId = result.userId;
    request.permissions = result.permissions;
    await next();
  };
}