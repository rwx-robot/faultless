import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, HttpServer } from '@faultless/http';
import {
  JwtService,
  PasswordService,
  RoleService,
  ApiKeyService,
  UserPayload,
} from '@faultless/auth';
import {
  createAuthGuard,
  createRoleGuard,
  createApiKeyGuard,
} from '@faultless/http';

describe('HTTP + Auth Integration', () => {
  let server: HttpServer;
  let jwtService: JwtService;
  let passwordService: PasswordService;
  let roleService: RoleService;
  let apiKeyService: ApiKeyService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret-key', expiresIn: '1h' });
    passwordService = new PasswordService(4);
    roleService = new RoleService();
    apiKeyService = new ApiKeyService();

    roleService.createRole('admin', ['users:read', 'users:write', 'users:delete']);
    roleService.createRole('user', ['users:read']);
    roleService.createRole('moderator', ['users:read', 'users:write']);

    server = createServer({ port: 0, logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('JWT Authentication Flow', () => {
    it('should complete full register → login → access protected route flow', async () => {
      const password = 'securePass123!';
      const hash = await passwordService.hash(password);

      server.addRoute({
        method: 'POST',
        url: '/auth/register',
        handler: async (request, reply) => {
          const body = request.body as any;
          const userHash = await passwordService.hash(body.password);
          const tokens = jwtService.generateTokenPair({
            sub: 'user-1',
            email: body.email,
            roles: ['user'],
          });
          reply.send({ userId: 'user-1', ...tokens });
        },
      });

      server.addRoute({
        method: 'POST',
        url: '/auth/login',
        handler: async (request, reply) => {
          const body = request.body as { email: string; password: string };
          const valid = await passwordService.compare(body.password, hash);
          if (!valid) {
            reply.status(401).send({ error: 'Invalid credentials' });
            return;
          }
          const tokens = jwtService.generateTokenPair({
            sub: 'user-1',
            email: body.email,
            roles: ['user'],
          });
          reply.send(tokens);
        },
      });

      server.addRoute({
        method: 'GET',
        url: '/profile',
        preHandler: [createAuthGuard({ secret: 'test-secret-key' })],
        handler: async (request, reply) => {
          reply.send({ user: (request as any).user });
        },
      });

      await server.ready();

      // Step 1: Register
      const registerResponse = await server.getApp().inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'test@example.com', password },
      });
      expect(registerResponse.statusCode).toBe(200);
      const registerBody = JSON.parse(registerResponse.payload);
      expect(registerBody.accessToken).toBeDefined();
      expect(registerBody.refreshToken).toBeDefined();

      // Step 2: Login
      const loginResponse = await server.getApp().inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'test@example.com', password },
      });
      expect(loginResponse.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResponse.payload);
      expect(loginBody.accessToken).toBeDefined();

      // Step 3: Access protected route
      const profileResponse = await server.getApp().inject({
        method: 'GET',
        url: '/profile',
        headers: { authorization: `Bearer ${loginBody.accessToken}` },
      });
      expect(profileResponse.statusCode).toBe(200);
      const profileBody = JSON.parse(profileResponse.payload);
      expect(profileBody.user.sub).toBe('user-1');
      expect(profileBody.user.email).toBe('test@example.com');
    });

    it('should reject access to protected route without token', async () => {
      server.addRoute({
        method: 'GET',
        url: '/protected',
        preHandler: [createAuthGuard({ secret: 'test-secret-key' })],
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject access with expired token', async () => {
      const shortLivedJwt = new JwtService({ secret: 'test-secret-key', expiresIn: '0s' });

      server.addRoute({
        method: 'GET',
        url: '/protected',
        preHandler: [createAuthGuard({ secret: 'test-secret-key' })],
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();

      const token = shortLivedJwt.sign({ sub: 'user-1', roles: ['user'] });
      await new Promise(r => setTimeout(r, 10));

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject access with wrong secret', async () => {
      const wrongSecretJwt = new JwtService({ secret: 'wrong-secret', expiresIn: '1h' });

      server.addRoute({
        method: 'GET',
        url: '/protected',
        preHandler: [createAuthGuard({ secret: 'test-secret-key' })],
        handler: async (request, reply) => {
          reply.send({ ok: true });
        },
      });

      await server.ready();

      const token = wrongSecretJwt.sign({ sub: 'user-1', roles: ['user'] });

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Role-Based Authorization', () => {
    beforeEach(() => {
      server.addRoute({
        method: 'GET',
        url: '/admin/dashboard',
        preHandler: [
          createAuthGuard({ secret: 'test-secret-key' }),
          createRoleGuard(['admin']),
        ],
        handler: async (request, reply) => {
          reply.send({ dashboard: 'admin-data' });
        },
      });

      server.addRoute({
        method: 'GET',
        url: '/users/list',
        preHandler: [
          createAuthGuard({ secret: 'test-secret-key' }),
          createRoleGuard(['admin', 'moderator']),
        ],
        handler: async (request, reply) => {
          reply.send({ users: [] });
        },
      });

      server.addRoute({
        method: 'GET',
        url: '/public',
        handler: async (request, reply) => {
          reply.send({ public: true });
        },
      });
    });

    it('should allow admin to access admin route', async () => {
      await server.ready();

      const token = jwtService.sign({ sub: 'admin-1', roles: ['admin'] });
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/admin/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ dashboard: 'admin-data' });
    });

    it('should deny regular user from admin route', async () => {
      await server.ready();

      const token = jwtService.sign({ sub: 'user-1', roles: ['user'] });
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/admin/dashboard',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow moderator to access multi-role route', async () => {
      await server.ready();

      const token = jwtService.sign({ sub: 'mod-1', roles: ['moderator'] });
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/users/list',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny user without matching role from multi-role route', async () => {
      await server.ready();

      const token = jwtService.sign({ sub: 'user-1', roles: ['user'] });
      const response = await server.getApp().inject({
        method: 'GET',
        url: '/users/list',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should access public route without auth', async () => {
      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/public',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('API Key Authentication', () => {
    let validApiKey: string;

    beforeEach(() => {
      validApiKey = apiKeyService.generateApiKey('service-user', ['data:read', 'data:write']);

      server.addRoute({
        method: 'GET',
        url: '/api/data',
        preHandler: [
          createApiKeyGuard(
            new Map([
              [validApiKey, { name: 'service-user', roles: ['data:read'] }],
            ])
          ),
        ],
        handler: async (request, reply) => {
          reply.send({ data: 'sensitive-data' });
        },
      });

      server.addRoute({
        method: 'POST',
        url: '/api/data',
        preHandler: [
          createApiKeyGuard(
            new Map([
              [validApiKey, { name: 'service-user', roles: ['data:read', 'data:write'] }],
            ])
          ),
        ],
        handler: async (request, reply) => {
          reply.send({ created: true });
        },
      });
    });

    it('should allow access with valid API key', async () => {
      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/api/data',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ data: 'sensitive-data' });
    });

    it('should reject access without API key', async () => {
      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/api/data',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject access with invalid API key', async () => {
      await server.ready();

      const response = await server.getApp().inject({
        method: 'GET',
        url: '/api/data',
        headers: { 'x-api-key': 'nf_invalidkey1234567890123456789012345678901234' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow POST with valid API key', async () => {
      await server.ready();

      const response = await server.getApp().inject({
        method: 'POST',
        url: '/api/data',
        headers: { 'x-api-key': validApiKey },
        payload: { value: 'new-data' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token pair', async () => {
      const payload: UserPayload = { sub: 'user-1', email: 'test@example.com', roles: ['user'] };
      const initialTokens = jwtService.generateTokenPair(payload);

      const newTokens = jwtService.refreshToken(initialTokens.refreshToken!);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();

      const decoded = jwtService.verify<UserPayload>(newTokens.accessToken);
      expect(decoded.sub).toBe('user-1');
    });

    it('should reject refresh with invalid refresh token', () => {
      expect(() => jwtService.refreshToken('invalid-token')).toThrow();
    });

    it('should accept access token as refresh token (both are valid JWTs)', async () => {
      const payload: UserPayload = { sub: 'user-1', email: 'test@example.com' };
      const tokens = jwtService.generateTokenPair(payload);

      // Access token is also a valid JWT, so refreshToken will accept it
      // This tests that the refresh mechanism works with any valid token
      const newTokens = jwtService.refreshToken(tokens.accessToken);
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
    });

    it('should maintain user claims through refresh cycle', async () => {
      const payload: UserPayload = {
        sub: 'user-1',
        email: 'test@example.com',
        roles: ['admin', 'user'],
        permissions: ['read', 'write'],
      };

      let currentTokens = jwtService.generateTokenPair(payload);

      for (let i = 0; i < 3; i++) {
        currentTokens = jwtService.refreshToken(currentTokens.refreshToken!);
        const decoded = jwtService.verify<UserPayload>(currentTokens.accessToken);
        expect(decoded.sub).toBe('user-1');
        expect(decoded.roles).toEqual(['admin', 'user']);
        expect(decoded.permissions).toEqual(['read', 'write']);
      }
    });
  });
});
