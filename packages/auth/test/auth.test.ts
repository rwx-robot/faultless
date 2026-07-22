import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  JwtService,
  PasswordService,
  RoleService,
  ApiKeyService,
  createAuthMiddleware,
  createRoleMiddleware,
  createPermissionMiddleware,
  createApiKeyMiddleware,
  UserPayload,
} from '../src';

describe('JwtService', () => {
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({
      secret: 'test-secret',
      expiresIn: '1h',
    });
  });

  it('should sign and verify token', () => {
    const payload: UserPayload = { sub: 'user1', email: 'test@example.com', roles: ['user'] };
    const token = jwtService.sign(payload);
    
    const verified = jwtService.verify<UserPayload>(token);
    expect(verified.sub).toBe('user1');
    expect(verified.email).toBe('test@example.com');
    expect(verified.roles).toEqual(['user']);
  });

  it('should generate token pair', () => {
    const payload: UserPayload = { sub: 'user1', email: 'test@example.com' };
    const tokenPair = jwtService.generateTokenPair(payload);
    
    expect(tokenPair.accessToken).toBeDefined();
    expect(tokenPair.refreshToken).toBeDefined();
    expect(tokenPair.expiresIn).toBeGreaterThan(0);
    expect(tokenPair.tokenType).toBe('Bearer');
  });

  it('should refresh token', () => {
    const payload: UserPayload = { sub: 'user1', email: 'test@example.com' };
    const tokenPair = jwtService.generateTokenPair(payload);
    
    const newTokenPair = jwtService.refreshToken(tokenPair.refreshToken!);
    expect(newTokenPair.accessToken).toBeDefined();
    expect(newTokenPair.refreshToken).toBeDefined();
  });

  it('should decode token without verification', () => {
    const payload: UserPayload = { sub: 'user1', email: 'test@example.com' };
    const token = jwtService.sign(payload);
    
    const decoded = jwtService.decode<UserPayload>(token);
    expect(decoded).toBeDefined();
    expect(decoded?.sub).toBe('user1');
  });

  it('should throw on invalid token', () => {
    expect(() => jwtService.verify('invalid-token')).toThrow();
  });
});

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService(10);
  });

  it('should hash password', async () => {
    const hash = await passwordService.hash('password123');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('password123');
  });

  it('should compare password correctly', async () => {
    const hash = await passwordService.hash('password123');
    
    const valid = await passwordService.compare('password123', hash);
    expect(valid).toBe(true);
    
    const invalid = await passwordService.compare('wrongpassword', hash);
    expect(invalid).toBe(false);
  });

  it('should generate random token', () => {
    const token = passwordService.generateToken(32);
    expect(token).toHaveLength(32);
    expect(/^[a-zA-Z0-9]+$/.test(token)).toBe(true);
  });
});

describe('RoleService', () => {
  let roleService: RoleService;

  beforeEach(() => {
    roleService = new RoleService();
  });

  it('should create and get role', () => {
    roleService.createRole('admin', ['users:read', 'users:write']);
    
    const role = roleService.getRole('admin');
    expect(role).toBeDefined();
    expect(role?.name).toBe('admin');
    expect(role?.permissions).toEqual(['users:read', 'users:write']);
  });

  it('should get all roles', () => {
    roleService.createRole('admin', ['*']);
    roleService.createRole('user', ['posts:read']);
    
    const roles = roleService.getAllRoles();
    expect(roles).toHaveLength(2);
  });

  it('should delete role', () => {
    roleService.createRole('temp', []);
    
    const deleted = roleService.deleteRole('temp');
    expect(deleted).toBe(true);
    
    const role = roleService.getRole('temp');
    expect(role).toBeUndefined();
  });

  it('should check permission', () => {
    roleService.createRole('admin', ['users:read', 'users:write', '*']);
    
    expect(roleService.hasPermission('admin', 'users:read')).toBe(true);
    expect(roleService.hasPermission('admin', 'posts:read')).toBe(true); // wildcard
    expect(roleService.hasPermission('user', 'users:read')).toBe(false);
  });

  it('should check user permissions', () => {
    roleService.createRole('admin', ['users:read', 'users:write']);
    roleService.createRole('user', ['posts:read']);
    
    expect(roleService.userHasPermission(['admin'], 'users:read')).toBe(true);
    expect(roleService.userHasPermission(['user'], 'users:read')).toBe(false);
    expect(roleService.userHasPermission(['admin', 'user'], 'posts:read')).toBe(true);
  });
});

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;

  beforeEach(() => {
    apiKeyService = new ApiKeyService();
  });

  it('should generate API key', () => {
    const key = apiKeyService.generateApiKey('user1', ['posts:read']);
    expect(key).toMatch(/^nf_/);
    expect(key).toHaveLength(51); // 'nf_' + 48 chars
  });

  it('should validate API key', () => {
    const key = apiKeyService.generateApiKey('user1', ['posts:read']);
    
    const result = apiKeyService.validateApiKey(key);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe('user1');
    expect(result.permissions).toEqual(['posts:read']);
  });

  it('should return invalid for unknown key', () => {
    const result = apiKeyService.validateApiKey('nf_invalid');
    expect(result.valid).toBe(false);
  });

  it('should delete API key', () => {
    const key = apiKeyService.generateApiKey('user1');
    
    const deleted = apiKeyService.deleteApiKey(key);
    expect(deleted).toBe(true);
    
    const result = apiKeyService.validateApiKey(key);
    expect(result.valid).toBe(false);
  });

  it('should get user API keys', () => {
    apiKeyService.generateApiKey('user1');
    apiKeyService.generateApiKey('user1');
    apiKeyService.generateApiKey('user2');
    
    const keys = apiKeyService.getUserApiKeys('user1');
    expect(keys).toHaveLength(2);
  });
});

describe('Middlewares', () => {
  let jwtService: JwtService;
  let roleService: RoleService;
  let apiKeyService: ApiKeyService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    roleService = new RoleService();
    roleService.createRole('admin', ['*']);
    roleService.createRole('user', ['posts:read']);
    apiKeyService = new ApiKeyService();
  });

  describe('createAuthMiddleware', () => {
    it('should reject request without auth header', async () => {
      const middleware = createAuthMiddleware(jwtService);
      const request = { headers: {} };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept valid token', async () => {
      const middleware = createAuthMiddleware(jwtService);
      const payload: UserPayload = { sub: 'user1', email: 'test@example.com' };
      const token = jwtService.sign(payload);
      
      const request = { headers: { authorization: `Bearer ${token}` } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(next).toHaveBeenCalled();
      expect((request as any).user).toBeDefined();
    });
  });

  describe('createRoleMiddleware', () => {
    it('should reject user without required role', async () => {
      const middleware = createRoleMiddleware(roleService, 'admin');
      const request = { user: { sub: 'user1', roles: ['user'] } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept user with required role', async () => {
      const middleware = createRoleMiddleware(roleService, 'admin');
      const request = { user: { sub: 'user1', roles: ['admin'] } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createPermissionMiddleware', () => {
    it('should reject user without required permission', async () => {
      const middleware = createPermissionMiddleware(roleService, 'users:write');
      const request = { user: { sub: 'user1', roles: ['user'] } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept user with required permission', async () => {
      const middleware = createPermissionMiddleware(roleService, 'posts:read');
      const request = { user: { sub: 'user1', roles: ['user'] } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createApiKeyMiddleware', () => {
    it('should reject request without API key', async () => {
      const middleware = createApiKeyMiddleware(apiKeyService);
      const request = { headers: {} };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept valid API key', async () => {
      const middleware = createApiKeyMiddleware(apiKeyService);
      const key = apiKeyService.generateApiKey('user1', ['posts:read']);
      
      const request = { headers: { 'x-api-key': key } };
      const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      const next = vi.fn();

      await middleware(request, reply, next);
      expect(next).toHaveBeenCalled();
      expect((request as any).userId).toBe('user1');
    });
  });
});