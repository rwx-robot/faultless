import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ServiceMesh,
  createServiceMesh,
  ConfigCenter,
  createConfigCenter,
} from '@faultless/governance';

describe('v11-governance example', () => {
  describe('Service Mesh', () => {
    let mesh: ServiceMesh;

    beforeEach(() => {
      mesh = createServiceMesh();
    });

    it('should register service', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const service = mesh.getService('service-1');
      expect(service).toBeDefined();
      expect(service!.name).toBe('test-service');
    });

    it('should deregister service', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const deleted = mesh.deregisterService('service-1');
      expect(deleted).toBe(true);
      expect(mesh.getService('service-1')).toBeUndefined();
    });

    it('should get services by name', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      mesh.registerService({
        id: 'service-2',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3001,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const services = mesh.getServicesByName('test-service');
      expect(services).toHaveLength(2);
    });

    it('should get healthy services', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      mesh.registerService({
        id: 'service-2',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3001,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'DOWN',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const healthy = mesh.getHealthyServices();
      expect(healthy).toHaveLength(1);
      expect(healthy[0].id).toBe('service-1');
    });

    it('should update service status', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      mesh.updateServiceStatus('service-1', 'DOWN');
      const service = mesh.getService('service-1');
      expect(service!.status).toBe('DOWN');
    });

    it('should send heartbeat', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const success = mesh.heartbeat('service-1');
      expect(success).toBe(true);
    });

    it('should get stats', () => {
      mesh.registerService({
        id: 'service-1',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3000,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'UP',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      mesh.registerService({
        id: 'service-2',
        name: 'test-service',
        host: '127.0.0.1',
        port: 3001,
        protocol: 'http',
        version: '1.0.0',
        metadata: {},
        status: 'DOWN',
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      });

      const stats = mesh.getStats();
      expect(stats.totalServices).toBe(2);
      expect(stats.healthyServices).toBe(1);
      expect(stats.unhealthyServices).toBe(1);
    });
  });

  describe('Config Center', () => {
    let configCenter: ConfigCenter;

    beforeEach(() => {
      configCenter = createConfigCenter();
    });

    it('should set config', () => {
      configCenter.set('key1', 'value1');
      expect(configCenter.get('key1')).toBe('value1');
    });

    it('should get config', () => {
      configCenter.set('key1', 'value1');
      const value = configCenter.get('key1');
      expect(value).toBe('value1');
    });

    it('should get default value', () => {
      const value = configCenter.get('nonexistent', 'default');
      expect(value).toBe('default');
    });

    it('should delete config', () => {
      configCenter.set('key1', 'value1');
      const deleted = configCenter.delete('key1');
      expect(deleted).toBe(true);
      expect(configCenter.get('key1')).toBeUndefined();
    });

    it('should check config exists', () => {
      configCenter.set('key1', 'value1');
      expect(configCenter.has('key1')).toBe(true);
      expect(configCenter.has('nonexistent')).toBe(false);
    });

    it('should get all config', () => {
      configCenter.set('key1', 'value1');
      configCenter.set('key2', 'value2');

      const all = configCenter.getAll();
      expect(all.key1).toBe('value1');
      expect(all.key2).toBe('value2');
    });

    it('should notify listeners', () => {
      let notifiedValue: any;
      configCenter.addListener('key1', (value) => {
        notifiedValue = value;
      });

      configCenter.set('key1', 'new-value');
      expect(notifiedValue).toBe('new-value');
    });

    it('should get stats', () => {
      configCenter.set('key1', 'value1');
      configCenter.set('key2', 'value2');

      const stats = configCenter.getStats();
      expect(stats.totalConfigs).toBe(2);
    });
  });
});