import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Query, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';

@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string; email: string }>();

  constructor() {
    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
    this.users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });
  }

  findAll() {
    return Array.from(this.users.values());
  }

  findById(id: string) {
    return this.users.get(id);
  }

  create(user: { name: string; email: string }) {
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    return newUser;
  }

  update(id: string, data: { name?: string; email?: string }) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }

  delete(id: string) {
    return this.users.delete(id);
  }
}

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    const user = this.userService.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

@Module({
  controllers: [UsersController, HealthController],
  providers: [UserService],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);