import { ServiceInstance } from './service-registry';
import { ServiceDiscovery, createServiceDiscovery, DiscoveryOptions } from './service-discovery';
import { LoadBalancer, createLoadBalancer, LoadBalancerOptions, LoadBalancerStrategy } from './load-balancer';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('discovery:resolver');

export interface ResolverOptions {
  discovery: DiscoveryOptions;
  loadBalancer?: {
    strategy?: LoadBalancerStrategy;
    healthCheck?: boolean;
  };
  refreshInterval?: number;
}

export interface ResolvedEndpoint {
  address: string;
  port: number;
  metadata?: Record<string, string>;
  instance: ServiceInstance;
}

export class Resolver {
  private discovery: ServiceDiscovery;
  private loadBalancer: LoadBalancer;
  private refreshTimer?: NodeJS.Timeout;
  private resolving = false;

  constructor(private options: ResolverOptions) {
    this.discovery = createServiceDiscovery(options.discovery);
    this.loadBalancer = createLoadBalancer({
      name: options.discovery.serviceName,
      discovery: this.discovery,
      strategy: options.loadBalancer?.strategy,
    });
  }

  async start(): Promise<void> {
    await this.discovery.start();
    this.startRefresh();
    logger.info(`Resolver started for ${this.options.discovery.serviceName}`);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    await this.discovery.stop();
    logger.info(`Resolver stopped for ${this.options.discovery.serviceName}`);
  }

  async resolve(key?: string): Promise<ResolvedEndpoint | null> {
    const instance = await this.loadBalancer.pick(key);
    if (!instance) return null;

    return {
      address: instance.address,
      port: instance.port,
      metadata: instance.metadata,
      instance,
    };
  }

  async resolveAll(): Promise<ResolvedEndpoint[]> {
    const instances = await this.loadBalancer.pickAll();
    return instances.map(instance => ({
      address: instance.address,
      port: instance.port,
      metadata: instance.metadata,
      instance,
    }));
  }

  getLoadBalancer(): LoadBalancer {
    return this.loadBalancer;
  }

  getDiscovery(): ServiceDiscovery {
    return this.discovery;
  }

  setLoadBalancerStrategy(strategy: LoadBalancerStrategy): void {
    this.loadBalancer.setStrategy(strategy);
  }

  private startRefresh(): void {
    const interval = this.options.refreshInterval ?? 10000;
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, interval);
    this.refreshTimer.unref?.();
  }

  private async refresh(): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    try {
      // Discovery automatically updates via watch
    } finally {
      this.resolving = false;
    }
  }
}

export class ResolverRegistry {
  private resolvers: Map<string, Resolver> = new Map();

  create(serviceName: string, options: ResolverOptions): Resolver {
    if (this.resolvers.has(serviceName)) {
      throw new Error(`Resolver for ${serviceName} already exists`);
    }
    const resolver = new Resolver(options);
    this.resolvers.set(serviceName, resolver);
    return resolver;
  }

  get(serviceName: string): Resolver | undefined {
    return this.resolvers.get(serviceName);
  }

  getOrCreate(serviceName: string, options: ResolverOptions): Resolver {
    let resolver = this.resolvers.get(serviceName);
    if (!resolver) {
      resolver = this.create(serviceName, options);
    }
    return resolver;
  }

  remove(serviceName: string): boolean {
    return this.resolvers.delete(serviceName);
  }

  async stopAll(): Promise<void> {
    for (const resolver of this.resolvers.values()) {
      await resolver.stop();
    }
    this.resolvers.clear();
  }

  getAll(): Resolver[] {
    return Array.from(this.resolvers.values());
  }
}

export const resolverRegistry = new ResolverRegistry();

export function createResolver(serviceName: string, options: ResolverOptions): Resolver {
  return resolverRegistry.getOrCreate(serviceName, options);
}

export interface Target {
  scheme: string;
  serviceName: string;
  path?: string;
  params?: Record<string, string>;
}

export function parseTarget(target: string): Target {
  const url = new URL(target);
  return {
    scheme: url.protocol.replace(':', ''),
    serviceName: url.hostname,
    path: url.pathname,
    params: Object.fromEntries(url.searchParams),
  };
}

export function buildTarget(target: Target): string {
  const url = new URL(`${target.scheme}://${target.serviceName}`);
  if (target.path) url.pathname = target.path;
  for (const [key, value] of Object.entries(target.params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export interface ResolverBuilder {
  build(target: Target): Promise<Resolver>;
  scheme: string;
}

export class DirectResolverBuilder implements ResolverBuilder {
  scheme = 'direct';

  async build(target: Target): Promise<Resolver> {
    const options: ResolverOptions = {
      discovery: {
        type: 'static',
        endpoints: [],
        serviceName: target.serviceName,
      },
      loadBalancer: {
        strategy: 'round-robin',
      },
    };
    return createResolver(target.serviceName, options);
  }
}

export class EtcdResolverBuilder implements ResolverBuilder {
  scheme = 'etcd';

  async build(target: Target): Promise<Resolver> {
    const endpoints = target.params?.['endpoints']?.split(',') ?? ['localhost:2379'];
    const options: ResolverOptions = {
      discovery: {
        type: 'etcd',
        endpoints,
        serviceName: target.serviceName,
        namespace: target.params?.['namespace'],
      },
      loadBalancer: {
        strategy: (target.params?.['lb'] as LoadBalancerStrategy) ?? 'p2c',
      },
    };
    return createResolver(target.serviceName, options);
  }
}

export class ConsulResolverBuilder implements ResolverBuilder {
  scheme = 'consul';

  async build(target: Target): Promise<Resolver> {
    const endpoints = target.params?.['endpoints']?.split(',') ?? ['localhost:8500'];
    const options: ResolverOptions = {
      discovery: {
        type: 'consul',
        endpoints,
        serviceName: target.serviceName,
      },
      loadBalancer: {
        strategy: (target.params?.['lb'] as LoadBalancerStrategy) ?? 'p2c',
      },
    };
    return createResolver(target.serviceName, options);
  }
}

export class KubernetesResolverBuilder implements ResolverBuilder {
  scheme = 'kubernetes';

  async build(target: Target): Promise<Resolver> {
    const options: ResolverOptions = {
      discovery: {
        type: 'kubernetes',
        endpoints: [],
        serviceName: target.serviceName,
        namespace: target.params?.['namespace'] ?? 'default',
      },
      loadBalancer: {
        strategy: (target.params?.['lb'] as LoadBalancerStrategy) ?? 'p2c',
      },
    };
    return createResolver(target.serviceName, options);
  }
}

export const resolverBuilders: Map<string, ResolverBuilder> = new Map([
  ['direct', new DirectResolverBuilder()],
  ['etcd', new EtcdResolverBuilder()],
  ['consul', new ConsulResolverBuilder()],
  ['kubernetes', new KubernetesResolverBuilder()],
]);

export function registerResolverBuilder(builder: ResolverBuilder): void {
  resolverBuilders.set(builder.scheme, builder);
}

export function getResolverBuilder(scheme: string): ResolverBuilder | undefined {
  return resolverBuilders.get(scheme);
}

export async function createResolverFromTarget(target: string): Promise<Resolver> {
  const parsed = parseTarget(target);
  const builder = resolverBuilders.get(parsed.scheme);
  if (!builder) {
    throw new Error(`No resolver builder for scheme: ${parsed.scheme}`);
  }
  return builder.build(parsed);
}