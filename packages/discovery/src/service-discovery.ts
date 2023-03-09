import { EventEmitter } from 'events';
import { ServiceInstance } from './service-registry';
import { ServiceDiscoveryOptions } from '@faultless/core';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('discovery:discovery');

export interface DiscoveryOptions {
  type: 'etcd' | 'consul' | 'kubernetes' | 'static' | 'memory';
  endpoints: string[];
  serviceName: string;
  namespace?: string;
  ttl?: number;
  metadata?: Record<string, string>;
  username?: string;
  password?: string;
  tls?: {
    cert: string;
    key: string;
    ca?: string;
  };
}

export interface ServiceDiscovery {
  start(): Promise<void>;
  stop(): Promise<void>;
  getInstances(): ServiceInstance[];
  watch(callback: (instances: ServiceInstance[]) => void): () => void;
  on(event: 'change' | 'error', listener: (data: any) => void): this;
}

export abstract class BaseServiceDiscovery extends EventEmitter implements ServiceDiscovery {
  protected options: DiscoveryOptions;
  protected instances: ServiceInstance[] = [];
  protected watchers: Array<(instances: ServiceInstance[]) => void> = [];
  protected running = false;

  constructor(options: DiscoveryOptions) {
    super();
    this.options = options;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  getInstances(): ServiceInstance[] {
    return [...this.instances];
  }

  watch(callback: (instances: ServiceInstance[]) => void): () => void {
    this.watchers.push(callback);
    callback(this.instances);
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index !== -1) this.watchers.splice(index, 1);
    };
  }

  protected updateInstances(instances: ServiceInstance[]): void {
    this.instances = instances;
    for (const watcher of this.watchers) {
      try {
        watcher(instances);
      } catch (error) {
        logger.error('Watcher error', { error });
      }
    }
    this.emit('change', instances);
  }

  protected emitError(error: Error): void {
    this.emit('error', error);
  }
}

export class StaticServiceDiscovery extends BaseServiceDiscovery {
  private staticInstances: ServiceInstance[];

  constructor(options: DiscoveryOptions, staticInstances: ServiceInstance[]) {
    super(options);
    this.staticInstances = staticInstances;
  }

  async start(): Promise<void> {
    this.running = true;
    this.updateInstances(this.staticInstances);
    logger.info(`Static discovery started for ${this.options.serviceName}`, { count: this.staticInstances.length });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.updateInstances([]);
    logger.info(`Static discovery stopped for ${this.options.serviceName}`);
  }

  updateStaticInstances(instances: ServiceInstance[]): void {
    this.staticInstances = instances;
    if (this.running) {
      this.updateInstances(instances);
    }
  }
}

export class EtcdServiceDiscovery extends BaseServiceDiscovery {
  private client: any;
  private watcher: any;
  private prefix: string;

  constructor(options: DiscoveryOptions) {
    super(options);
    this.prefix = `/services/${options.namespace ?? 'default'}/${options.serviceName}`;
  }

  async start(): Promise<void> {
    try {
      const { Etcd3 } = await import('etcd3');
      this.client = new Etcd3({
        hosts: this.options.endpoints,
        auth: this.options.username ? { username: this.options.username, password: this.options.password } : undefined,
        tls: this.options.tls,
      });

      await this.refresh();
      this.watcher = this.client.watch().prefix(this.prefix).create();
      
      this.watcher.on('put', () => this.refresh());
      this.watcher.on('delete', () => this.refresh());

      this.running = true;
      logger.info(`Etcd discovery started for ${this.options.serviceName}`, { endpoints: this.options.endpoints });
    } catch (error) {
      logger.error('Failed to start etcd discovery', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.cancel();
    }
    if (this.client) {
      await this.client.close();
    }
    this.running = false;
    this.updateInstances([]);
    logger.info(`Etcd discovery stopped for ${this.options.serviceName}`);
  }

  private async refresh(): Promise<void> {
    try {
      const keys = await this.client.getAll().prefix(this.prefix).keys();
      const instances: ServiceInstance[] = [];

      for (const key of keys) {
        const value = await this.client.get(key).string();
        if (value) {
          try {
            const instance = JSON.parse(value) as ServiceInstance;
            instances.push(instance);
          } catch {
            // Skip invalid entries
          }
        }
      }

      this.updateInstances(instances);
    } catch (error) {
      this.emitError(error as Error);
    }
  }
}

export class ConsulServiceDiscovery extends BaseServiceDiscovery {
  private client: any;
  private pollTimer?: NodeJS.Timeout;
  private lastIndex = 0;

  constructor(options: DiscoveryOptions) {
    super(options);
  }

  async start(): Promise<void> {
    try {
      const consul = await import('consul');
      this.client = consul({
        host: this.options.endpoints[0]?.split(':')[0] ?? 'localhost',
        port: parseInt(this.options.endpoints[0]?.split(':')[1] ?? '8500', 10),
        secure: !!this.options.tls,
        defaults: {
          token: this.options.password,
        },
      });

      await this.poll();
      this.running = true;
      logger.info(`Consul discovery started for ${this.options.serviceName}`, { endpoints: this.options.endpoints });
    } catch (error) {
      logger.error('Failed to start consul discovery', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.running = false;
    this.updateInstances([]);
    logger.info(`Consul discovery stopped for ${this.options.serviceName}`);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const services = await this.client.health.service({
        service: this.options.serviceName,
        passing: true,
        index: this.lastIndex,
        wait: '30s',
      });

      if (services && services.length > 0) {
        this.lastIndex = services[0].ModifyIndex;
        
        const instances: ServiceInstance[] = services.map((s: any) => ({
          id: s.Service.ID,
          name: s.Service.Service,
          address: s.Service.Address,
          port: s.Service.Port,
          metadata: s.Service.Meta,
          tags: s.Service.Tags,
          healthCheck: undefined,
          registeredAt: new Date(),
          lastHeartbeat: new Date(),
        }));

        this.updateInstances(instances);
      }
    } catch (error) {
      this.emitError(error as Error);
    } finally {
      if (this.running) {
        setImmediate(() => this.poll());
      }
    }
  }
}

export class KubernetesServiceDiscovery extends BaseServiceDiscovery {
  private k8sClient: any;
  private watcher: any;

  constructor(options: DiscoveryOptions) {
    super(options);
  }

  async start(): Promise<void> {
    try {
      const k8s = await import('@kubernetes/client-node');
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();

      this.k8sClient = k8s.Core_v1Api;

      await this.refresh();
      this.startWatch();

      this.running = true;
      logger.info(`Kubernetes discovery started for ${this.options.serviceName}`);
    } catch (error) {
      logger.error('Failed to start kubernetes discovery', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.abort();
    }
    this.running = false;
    this.updateInstances([]);
    logger.info(`Kubernetes discovery stopped for ${this.options.serviceName}`);
  }

  private async refresh(): Promise<void> {
    try {
      const endpoints = await this.k8sClient.listNamespacedEndpoints(
        this.options.namespace ?? 'default',
        undefined,
        undefined,
        undefined,
        `metadata.name=${this.options.serviceName}`
      );

      const instances: ServiceInstance[] = [];

      for (const ep of endpoints.body.items ?? []) {
        for (const subset of ep.subsets ?? []) {
          for (const address of subset.addresses ?? []) {
            for (const port of subset.ports ?? []) {
              instances.push({
                id: `${ep.metadata?.name}-${address.ip}-${port.port}`,
                name: ep.metadata?.name ?? this.options.serviceName,
                address: address.ip,
                port: port.port,
                metadata: ep.metadata?.labels,
                tags: [],
                healthCheck: undefined,
                registeredAt: new Date(),
                lastHeartbeat: new Date(),
              });
            }
          }
        }
      }

      this.updateInstances(instances);
    } catch (error) {
      this.emitError(error as Error);
    }
  }

  private async startWatch(): Promise<void> {
    const { Watch } = await import('@kubernetes/client-node');
    const watch = new Watch();
    this.watcher = watch.watch(
      `/api/v1/namespaces/${this.options.namespace ?? 'default'}/endpoints`,
      { fieldSelector: `metadata.name=${this.options.serviceName}` },
      (event: any) => {
        if (event.type === 'ADDED' || event.type === 'MODIFIED' || event.type === 'DELETED') {
          this.refresh();
        }
      },
      (error: any) => {
        this.emitError(error);
      }
    );
  }
}

export class MemoryServiceDiscovery extends BaseServiceDiscovery {
  private registry: any;

  constructor(options: DiscoveryOptions, registry: any) {
    super(options);
    this.registry = registry;
  }

  async start(): Promise<void> {
    this.running = true;
    
    this.registry.on('register', (instance: ServiceInstance) => {
      if (instance.name === this.options.serviceName) {
        this.refresh();
      }
    });

    this.registry.on('deregister', (instance: ServiceInstance) => {
      if (instance.name === this.options.serviceName) {
        this.refresh();
      }
    });

    await this.refresh();
    logger.info(`Memory discovery started for ${this.options.serviceName}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.updateInstances([]);
    logger.info(`Memory discovery stopped for ${this.options.serviceName}`);
  }

  private refresh(): void {
    const instances = this.registry.listInstances(this.options.serviceName);
    this.updateInstances(instances);
  }
}

export function createServiceDiscovery(options: DiscoveryOptions, extra?: { registry?: any; staticInstances?: ServiceInstance[] }): ServiceDiscovery {
  switch (options.type) {
    case 'etcd':
      return new EtcdServiceDiscovery(options);
    case 'consul':
      return new ConsulServiceDiscovery(options);
    case 'kubernetes':
      return new KubernetesServiceDiscovery(options);
    case 'static':
      return new StaticServiceDiscovery(options, extra?.staticInstances ?? []);
    case 'memory':
      return new MemoryServiceDiscovery(options, extra?.registry);
    default:
      throw new Error(`Unsupported discovery type: ${options.type}`);
  }
}