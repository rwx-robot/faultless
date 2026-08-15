import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApplication } from '@faultless/http';
import { InMemoryServiceRegistry, createInMemoryRegistry } from '@faultless/discovery';
import { createLoadBalancer, LoadBalancerStrategy, RoundRobinLoadBalancer, WeightedRoundRobinLoadBalancer, LeastConnectionsLoadBalancer, P2CLoadBalancer, ConsistentHashLoadBalancer, RandomLoadBalancer, IPHashLoadBalancer } from '@faultless/discovery';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { ServiceInstance } from '@faultless/discovery';

describe('v4-discovery-lb example', () => {
  let app: any;
  let registry: InMemoryServiceRegistry;

  beforeEach(() => {
    registry = createInMemoryRegistry();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Service Registry', () => {
    it('should register and deregister services', async () => {
      const instance = await registry.register({
        name: 'test-service',
        address: 'localhost',
        port: 3000,
        metadata: { version: '1.0.0' },
      });

      expect(instance.id).toBeDefined();
      expect(instance.name).toBe('test-service');
      expect(instance.address).toBe('localhost');
      expect(instance.port).toBe(3000);

      const instances = registry.listInstances('test-service');
      expect(instances).toHaveLength(1);

      await registry.deregister(instance.id);
      const instancesAfter = registry.listInstances('test-service');
      expect(instancesAfter).toHaveLength(0);
    });

    it('should list all services', async () => {
      await registry.register({ name: 'service-a', address: 'localhost', port: 3001 });
      await registry.register({ name: 'service-b', address: 'localhost', port: 3002 });
      await registry.register({ name: 'service-a', address: 'localhost', port: 3003 });

      const services = registry.listAllServices();
      expect(services).toContain('service-a');
      expect(services).toContain('service-b');
      expect(services).toHaveLength(2);
    });

    it('should heartbeat instances', async () => {
      const instance = await registry.register({ name: 'heartbeat-service', address: 'localhost', port: 3000 });
      const originalHeartbeat = instance.lastHeartbeat;

      await new Promise(resolve => setTimeout(resolve, 10));
      await registry.heartbeat(instance.id);

      const updated = registry.getInstance(instance.id);
      expect(updated!.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
    });
  });

  describe('Load Balancers', () => {
    const createTestInstances = (): ServiceInstance[] => [
      { id: 'svc-1', name: 'api', address: 'localhost', port: 3001, metadata: { weight: '2' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
      { id: 'svc-2', name: 'api', address: 'localhost', port: 3002, metadata: { weight: '1' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
      { id: 'svc-3', name: 'api', address: 'localhost', port: 3003, metadata: { weight: '1' }, tags: [], registeredAt: new Date(), lastHeartbeat: new Date() },
    ];

    const mockDiscovery = (instances: ServiceInstance[]) => ({
      getInstances: () => instances,
      watch: (cb: (instances: ServiceInstance[]) => void) => {
        cb(instances);
        return () => {};
      },
    });

    it('round-robin should distribute evenly', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'round-robin' });

      const picks: string[] = [];
      for (let i = 0; i < 9; i++) {
        const picked = await lb.pick();
        picks.push(picked!.id);
      }

      const counts = picks.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {} as Record<string, number>);
      expect(counts['svc-1']).toBe(3);
      expect(counts['svc-2']).toBe(3);
      expect(counts['svc-3']).toBe(3);
    });

    it('weighted-round-robin should respect weights', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'weighted-round-robin' });

      const picks: string[] = [];
      for (let i = 0; i < 8; i++) {
        const picked = await lb.pick();
        picks.push(picked!.id);
      }

      const counts = picks.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {} as Record<string, number>);
      expect(counts['svc-1']).toBeGreaterThan(counts['svc-2']);
      expect(counts['svc-1']).toBeGreaterThan(counts['svc-3']);
    });

    it('least-connections should pick least busy', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'least-connections' });

      await lb.pick(); // svc-1
      await lb.pick(); // svc-1
      await lb.pick(); // svc-2

      const picked = await lb.pick();
      expect(picked!.id).toBe('svc-3'); // least connections (0)
    });

    it('p2c should pick between two random', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'p2c' });

      const picked = await lb.pick();
      expect(instances.map(i => i.id)).toContain(picked!.id);
    });

    it('consistent-hash should consistently map keys', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'consistent-hash' });

      const picks1 = await Promise.all(Array(10).fill(null).map(() => lb.pick('user-123')));
      const picks2 = await Promise.all(Array(10).fill(null).map(() => lb.pick('user-123')));

      const firstId = picks1[0]!.id;
      expect(picks1.every(p => p!.id === firstId)).toBe(true);
      expect(picks2.every(p => p!.id === firstId)).toBe(true);
    });

    it('random should pick randomly', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'random' });

      const picked = await lb.pick();
      expect(instances.map(i => i.id)).toContain(picked!.id);
    });

    it('ip-hash should consistently map IPs', async () => {
      const instances = createTestInstances();
      const lb = createLoadBalancer({ name: 'api', discovery: mockDiscovery(instances), strategy: 'ip-hash' });

      const picked1 = await lb.pick('192.168.1.1');
      const picked2 = await lb.pick('192.168.1.1');
      const picked3 = await lb.pick('192.168.1.2');

      expect(picked1!.id).toBe(picked2!.id);
    });
  });

  describe('Integration', () => {
    it('should run application with discovery', async () => {
      @Injectable()
      class TestService {
        findAll() { return [{ id: '1', name: 'Test' }]; }
      }

      @Controller('test')
      class TestController {
        constructor(private service: TestService) {}
        @Get() findAll() { return this.service.findAll(); }
      }

      @Module({ controllers: [TestController], providers: [TestService] })
      class TestModule {}

      app = await createApplication({ modules: [TestModule], serverOptions: { port: 0, logger: false } });
      await app.listen();

      const response = await app.getServer().getApp().inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual([{ id: '1', name: 'Test' }]);
    });
  });
});