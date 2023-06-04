import { EventEmitter } from 'events';
import { ServiceDiscoveryOptions } from '@faultless/core';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('discovery:registry');

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  metadata?: Record<string, string>;
  tags?: string[];
  healthCheck?: HealthCheckConfig;
  registeredAt: Date;
  lastHeartbeat: Date;
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'grpc' | 'script';
  interval?: number;
  timeout?: number;
  path?: string;
  script?: string;
}

export interface RegistryOptions {
  name: string;
  address: string;
  port: number;
  metadata?: Record<string, string>;
  tags?: string[];
  healthCheck?: HealthCheckConfig;
  ttl?: number;
  heartbeatInterval?: number;
}

export interface ServiceRegistry {
  register(options: RegistryOptions): Promise<ServiceInstance>;
  deregister(instanceId: string): Promise<void>;
  heartbeat(instanceId: string): Promise<void>;
  getInstance(instanceId: string): ServiceInstance | undefined;
  listInstances(serviceName: string): ServiceInstance[];
  listAllServices(): string[];
  on(event: 'register' | 'deregister' | 'heartbeat', listener: (instance: ServiceInstance) => void): this;
}

export abstract class BaseServiceRegistry extends EventEmitter implements ServiceRegistry {
  protected instances: Map<string, ServiceInstance> = new Map();
  protected heartbeats: Map<string, NodeJS.Timeout> = new Map();

  abstract register(options: RegistryOptions): Promise<ServiceInstance>;
  abstract deregister(instanceId: string): Promise<void>;

  async heartbeat(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    instance.lastHeartbeat = new Date();
    this.emit('heartbeat', instance);
  }

  getInstance(instanceId: string): ServiceInstance | undefined {
    return this.instances.get(instanceId);
  }

  listInstances(serviceName: string): ServiceInstance[] {
    return Array.from(this.instances.values()).filter(i => i.name === serviceName);
  }

  listAllServices(): string[] {
    return [...new Set(Array.from(this.instances.values()).map(i => i.name))];
  }

  protected createInstance(options: RegistryOptions): ServiceInstance {
    const instance: ServiceInstance = {
      id: options.metadata?.['instanceId'] ?? `${options.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: options.name,
      address: options.address,
      port: options.port,
      metadata: options.metadata,
      tags: options.tags,
      healthCheck: options.healthCheck,
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
    };
    this.instances.set(instance.id, instance);
    return instance;
  }

  protected startHeartbeat(instanceId: string, interval: number): void {
    const existing = this.heartbeats.get(instanceId);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      try {
        await this.heartbeat(instanceId);
      } catch {
        this.stopHeartbeat(instanceId);
      }
    }, interval);

    timer.unref?.();
    this.heartbeats.set(instanceId, timer);
  }

  protected stopHeartbeat(instanceId: string): void {
    const timer = this.heartbeats.get(instanceId);
    if (timer) {
      clearInterval(timer);
      this.heartbeats.delete(instanceId);
    }
  }

  async shutdown(): Promise<void> {
    for (const instanceId of this.heartbeats.keys()) {
      this.stopHeartbeat(instanceId);
    }
    await this.deregisterAll();
  }

  protected async deregisterAll(): Promise<void> {
    for (const instanceId of this.instances.keys()) {
      await this.deregister(instanceId);
    }
  }
}

export class InMemoryServiceRegistry extends BaseServiceRegistry {
  async register(options: RegistryOptions): Promise<ServiceInstance> {
    const instance = this.createInstance(options);
    
    if (options.heartbeatInterval) {
      this.startHeartbeat(instance.id, options.heartbeatInterval);
    }

    logger.info(`Service registered: ${instance.name}`, { id: instance.id, address: instance.address, port: instance.port });
    this.emit('register', instance);
    return instance;
  }

  async deregister(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    this.stopHeartbeat(instanceId);
    this.instances.delete(instanceId);
    
    logger.info(`Service deregistered: ${instance.name}`, { id: instanceId });
    this.emit('deregister', instance);
  }
}

export function createInMemoryRegistry(): InMemoryServiceRegistry {
  return new InMemoryServiceRegistry();
}