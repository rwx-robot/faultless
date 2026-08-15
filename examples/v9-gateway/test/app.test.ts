import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ApiGateway,
  createApiGateway,
  RouteMatchType,
  GatewayPlugin,
} from '@faultless/gateway';

describe('v9-gateway example', () => {
  let gateway: ApiGateway;

  beforeEach(() => {
    gateway = createApiGateway();
  });

  describe('Route Management', () => {
    it('should add route', () => {
      gateway.addRoute({
        id: 'test-route',
        name: 'Test Route',
        match: {
          type: RouteMatchType.EXACT,
          path: '/api/test',
          methods: ['GET'],
        },
        upstream: {
          name: 'test-service',
          target: 'http://localhost:3001',
        },
      });

      const routes = gateway.getRoutes();
      expect(routes).toHaveLength(1);
      expect(routes[0].id).toBe('test-route');
    });

    it('should remove route', () => {
      gateway.addRoute({
        id: 'test-route',
        name: 'Test Route',
        match: { type: RouteMatchType.EXACT, path: '/api/test' },
        upstream: { name: 'test-service', target: 'http://localhost:3001' },
      });

      const removed = gateway.removeRoute('test-route');
      expect(removed).toBe(true);
      expect(gateway.getRoutes()).toHaveLength(0);
    });

    it('should get stats', () => {
      gateway.addRoute({
        id: 'route1',
        name: 'Route 1',
        match: { type: RouteMatchType.EXACT, path: '/api/1' },
        upstream: { name: 'service1', target: 'http://localhost:3001' },
      });

      const stats = gateway.getStats();
      expect(stats.routes).toBe(1);
      expect(stats.plugins).toBe(0);
    });
  });

  describe('Route Matching', () => {
    beforeEach(() => {
      gateway.addRoute({
        id: 'exact-route',
        name: 'Exact Route',
        match: {
          type: RouteMatchType.EXACT,
          path: '/api/users',
          methods: ['GET'],
        },
        upstream: { name: 'user-service', target: 'http://localhost:3001' },
      });

      gateway.addRoute({
        id: 'prefix-route',
        name: 'Prefix Route',
        match: {
          type: RouteMatchType.PREFIX,
          path: '/api/users/',
        },
        upstream: { name: 'user-service', target: 'http://localhost:3001' },
      });

      gateway.addRoute({
        id: 'regex-route',
        name: 'Regex Route',
        match: {
          type: RouteMatchType.REGEX,
          path: '^/api/products/\\d+$',
        },
        upstream: { name: 'product-service', target: 'http://localhost:3002' },
      });
    });

    it('should match exact route', () => {
      const route = gateway.matchRoute('GET', '/api/users');
      expect(route).not.toBeNull();
      expect(route!.id).toBe('exact-route');
    });

    it('should match prefix route', () => {
      const route = gateway.matchRoute('GET', '/api/users/123');
      expect(route).not.toBeNull();
      expect(route!.id).toBe('prefix-route');
    });

    it('should match regex route', () => {
      const route = gateway.matchRoute('GET', '/api/products/456');
      expect(route).not.toBeNull();
      expect(route!.id).toBe('regex-route');
    });

    it('should not match wrong method', () => {
      const route = gateway.matchRoute('POST', '/api/users');
      expect(route).toBeNull();
    });

    it('should not match no route', () => {
      const route = gateway.matchRoute('GET', '/api/nonexistent');
      expect(route).toBeNull();
    });
  });

  describe('Request Transform', () => {
    it('should add header', async () => {
      gateway.addRoute({
        id: 'transform-route',
        name: 'Transform Route',
        match: { type: RouteMatchType.EXACT, path: '/api/test' },
        upstream: { name: 'test-service', target: 'http://localhost:3001' },
        transforms: {
          request: [
            { type: 'add-header', name: 'X-Custom', value: 'test-value' },
          ],
        },
      });

      const request = {
        method: 'GET',
        path: '/api/test',
        headers: {},
        query: {},
      };

      const transformed = await gateway.transformRequest(
        request,
        gateway.getRoutes()[0]
      );

      expect(transformed.headers['X-Custom']).toBe('test-value');
    });

    it('should remove header', async () => {
      gateway.addRoute({
        id: 'transform-route',
        name: 'Transform Route',
        match: { type: RouteMatchType.EXACT, path: '/api/test' },
        upstream: { name: 'test-service', target: 'http://localhost:3001' },
        transforms: {
          request: [
            { type: 'remove-header', name: 'Authorization' },
          ],
        },
      });

      const request = {
        method: 'GET',
        path: '/api/test',
        headers: { Authorization: 'Bearer token' },
        query: {},
      };

      const transformed = await gateway.transformRequest(
        request,
        gateway.getRoutes()[0]
      );

      expect(transformed.headers['Authorization']).toBeUndefined();
    });

    it('should rewrite path', async () => {
      gateway.addRoute({
        id: 'rewrite-route',
        name: 'Rewrite Route',
        match: { type: RouteMatchType.PREFIX, path: '/api/v1' },
        upstream: { name: 'api-service', target: 'http://localhost:3001' },
        transforms: {
          request: [
            { type: 'rewrite-path', pattern: '^/api/v1', replacement: '/api' },
          ],
        },
      });

      const request = {
        method: 'GET',
        path: '/api/v1/users',
        headers: {},
        query: {},
      };

      const transformed = await gateway.transformRequest(
        request,
        gateway.getRoutes()[0]
      );

      expect(transformed.path).toBe('/api/users');
    });
  });

  describe('Plugin System', () => {
    it('should register plugin', () => {
      const plugin: GatewayPlugin = {
        name: 'test-plugin',
        enabled: true,
        onRequest: async () => {},
      };

      gateway.registerPlugin(plugin);
      const stats = gateway.getStats();
      expect(stats.plugins).toBe(1);
    });

    it('should execute plugin hooks', async () => {
      let hookCalled = false;

      const plugin: GatewayPlugin = {
        name: 'test-plugin',
        enabled: true,
        onRequest: async () => {
          hookCalled = true;
        },
      };

      gateway.registerPlugin(plugin);
      await gateway.executePlugins('onRequest', {}, {});
      expect(hookCalled).toBe(true);
    });

    it('should skip disabled plugins', async () => {
      let hookCalled = false;

      const plugin: GatewayPlugin = {
        name: 'test-plugin',
        enabled: false,
        onRequest: async () => {
          hookCalled = true;
        },
      };

      gateway.registerPlugin(plugin);
      await gateway.executePlugins('onRequest', {}, {});
      expect(hookCalled).toBe(false);
    });
  });
});