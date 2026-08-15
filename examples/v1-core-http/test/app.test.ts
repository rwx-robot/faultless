import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApplication } from '@faultless/http';
import { Controller, Get, Post, Body, Param, Module, Injectable, Inject } from '@faultless/core';

describe('v1-core-http example', () => {
  let app: any;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should handle GET /health', async () => {
    @Controller('health')
    class HealthController {
      @Get()
      check() {
        return { status: 'ok' };
      }
    }

    @Module({ controllers: [HealthController] })
    class TestModule {}

    app = await createApplication({
      modules: [TestModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const response = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ status: 'ok' });
  });

  it('should handle CRUD operations', async () => {
    @Injectable()
    class ItemService {
      private items = new Map<string, { id: string; name: string }>();

      findAll() {
        return Array.from(this.items.values());
      }

      findById(id: string) {
        return this.items.get(id);
      }

      create(item: { name: string }) {
        const id = String(this.items.size + 1);
        const newItem = { id, ...item };
        this.items.set(id, newItem);
        return newItem;
      }
    }

    @Controller('items')
    class ItemsController {
      constructor(@Inject(ItemService) private service: ItemService) {}

      @Get()
      findAll() {
        return this.service.findAll();
      }

      @Get(':id')
      findById(@Param('id') id: string) {
        return this.service.findById(id);
      }

      @Post()
      create(@Body() body: { name: string }) {
        return this.service.create(body);
      }
    }

    @Module({ controllers: [ItemsController], providers: [ItemService] })
    class ItemsModule {}

    app = await createApplication({
      modules: [ItemsModule],
      serverOptions: { port: 0, logger: false },
    });

    await app.listen();

    const createResponse = await app.getServer().getApp().inject({
      method: 'POST',
      url: '/items',
      payload: { name: 'Test Item' },
    });

    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.payload);
    expect(created.id).toBe('1');
    expect(created.name).toBe('Test Item');

    const listResponse = await app.getServer().getApp().inject({
      method: 'GET',
      url: '/items',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(JSON.parse(listResponse.payload)).toHaveLength(1);
  });
});