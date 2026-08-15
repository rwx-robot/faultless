import 'reflect-metadata';
import { Controller, Get, Post, Delete, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  JwtService,
  PasswordService,
  RoleService,
  ApiKeyService,
  createAuthMiddleware,
  UserPayload,
} from '@faultless/auth';

const logger = createLogger({ level: 'info', serviceName: 'v13-auth' });

// 配置 JWT
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'nofault-secret-key',
  expiresIn: '24h',
});

// 配置密码服务
const passwordService = new PasswordService(10);

// 配置角色服务
const roleService = new RoleService();
roleService.createRole('admin', ['users:read', 'users:write', 'users:delete', 'posts:read', 'posts:write', 'posts:delete']);
roleService.createRole('user', ['users:read', 'posts:read', 'posts:write']);
roleService.createRole('guest', ['posts:read']);

// 配置 API Key 服务
const apiKeyService = new ApiKeyService();

// 模拟用户数据库
const users = new Map<string, { id: string; email: string; password: string; roles: string[] }>();

@Injectable()
class AuthController {
  @Post('auth/register')
  async register(@Body() body: { email: string; password: string }) {
    const { email, password } = body;

    // 检查用户是否已存在
    for (const user of users.values()) {
      if (user.email === email) {
        return { error: 'User already exists' };
      }
    }

    // 哈希密码
    const hashedPassword = await passwordService.hash(password);

    // 创建用户
    const userId = `user_${Date.now()}`;
    users.set(userId, {
      id: userId,
      email,
      password: hashedPassword,
      roles: ['user'],
    });

    // 生成令牌
    const tokenPair = jwtService.generateTokenPair({
      sub: userId,
      email,
      roles: ['user'],
    });

    logger.info('User registered', { userId, email });
    return tokenPair;
  }

  @Post('auth/login')
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;

    // 查找用户
    let foundUser = null;
    for (const user of users.values()) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      return { error: 'Invalid credentials' };
    }

    // 验证密码
    const isValid = await passwordService.compare(password, foundUser.password);
    if (!isValid) {
      return { error: 'Invalid credentials' };
    }

    // 生成令牌
    const tokenPair = jwtService.generateTokenPair({
      sub: foundUser.id,
      email: foundUser.email,
      roles: foundUser.roles,
    });

    logger.info('User logged in', { userId: foundUser.id, email });
    return tokenPair;
  }

  @Get('auth/profile')
  async getProfile(@Param('user') user: UserPayload) {
    return {
      id: user.sub,
      email: user.email,
      roles: user.roles,
    };
  }

  @Post('auth/refresh')
  async refreshToken(@Body() body: { refreshToken: string }) {
    try {
      const tokenPair = jwtService.refreshToken(body.refreshToken);
      return tokenPair;
    } catch (error) {
      return { error: 'Invalid refresh token' };
    }
  }

  @Post('auth/api-keys')
  async generateApiKey(@Param('user') user: UserPayload) {
    const apiKey = apiKeyService.generateApiKey(user.sub, ['posts:read']);
    return { apiKey };
  }

  @Get('auth/api-keys')
  async getApiKeys(@Param('user') user: UserPayload) {
    const keys = apiKeyService.getUserApiKeys(user.sub);
    return { apiKeys: keys };
  }
}

@Injectable()
class ProtectedController {
  @Get('protected/admin')
  async adminOnly() {
    return { message: 'Hello Admin!' };
  }

  @Get('protected/user')
  async userOnly() {
    return { message: 'Hello User!' };
  }

  @Get('protected/guest')
  async guestOnly() {
    return { message: 'Hello Guest!' };
  }

  @Get('protected/posts')
  async readPosts() {
    return { posts: ['Post 1', 'Post 2', 'Post 3'] };
  }

  @Post('protected/posts')
  async writePost(@Body() body: { title: string }) {
    return { message: `Post "${body.title}" created` };
  }

  @Delete('protected/posts/:id')
  async deletePost(@Param('id') id: string) {
    return { message: `Post ${id} deleted` };
  }
}

@Module({
  controllers: [AuthController, ProtectedController],
  providers: [],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
      middleware: [
        // 为需要认证的路由添加 JWT 中间件
        createAuthMiddleware(jwtService),
      ],
    },
  });
}

main().catch(console.error);