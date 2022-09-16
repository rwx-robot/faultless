import { ServiceInstance } from './service-registry';
import { createLogger, getLogger } from '@faultless/log';

const logger = getLogger('discovery:load-balancer');

export interface LoadBalancerOptions {
  name: string;
  discovery: any;
  strategy?: LoadBalancerStrategy;
  healthCheck?: boolean;
  healthCheckInterval?: number;
}

export type LoadBalancerStrategy = 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'p2c' | 'consistent-hash' | 'random' | 'ip-hash';

export interface LoadBalancer {
  pick(key?: string): Promise<ServiceInstance | null>;
  pickAll(): Promise<ServiceInstance[]>;
  addInstance(instance: ServiceInstance): void;
  removeInstance(instanceId: string): void;
  updateInstances(instances: ServiceInstance[]): void;
  getStrategy(): LoadBalancerStrategy;
  setStrategy(strategy: LoadBalancerStrategy): void;
}

export abstract class BaseLoadBalancer implements LoadBalancer {
  protected instances: ServiceInstance[] = [];
  protected strategy: LoadBalancerStrategy;
  protected name: string;
  protected currentIndex = 0;
  protected connectionCounts: Map<string, number> = new Map();

  constructor(options: LoadBalancerOptions) {
    this.name = options.name;
    this.strategy = options.strategy ?? 'round-robin';
    
    if (options.discovery) {
      this.updateInstances(options.discovery.getInstances());
      options.discovery.watch((instances) => this.updateInstances(instances));
    }
  }

  abstract pick(key?: string): Promise<ServiceInstance | null>;

  async pickAll(): Promise<ServiceInstance[]> {
    return this.getHealthyInstances();
  }

  addInstance(instance: ServiceInstance): void {
    if (!this.instances.find(i => i.id === instance.id)) {
      this.instances.push(instance);
      logger.debug(`Instance added to ${this.name}`, { id: instance.id });
    }
  }

  removeInstance(instanceId: string): void {
    const index = this.instances.findIndex(i => i.id === instanceId);
    if (index !== -1) {
      this.instances.splice(index, 1);
      this.connectionCounts.delete(instanceId);
      logger.debug(`Instance removed from ${this.name}`, { id: instanceId });
    }
  }

  updateInstances(instances: ServiceInstance[]): void {
    this.instances = instances.filter(i => i.name === this.name);
    logger.debug(`Instances updated for ${this.name}`, { count: this.instances.length });
  }

  getStrategy(): LoadBalancerStrategy {
    return this.strategy;
  }

  setStrategy(strategy: LoadBalancerStrategy): void {
    this.strategy = strategy;
    logger.info(`Load balancer ${this.name} strategy changed to ${strategy}`);
  }

  protected getHealthyInstances(): ServiceInstance[] {
    return this.instances.filter(i => this.isHealthy(i));
  }

  protected isHealthy(instance: ServiceInstance): boolean {
    return true;
  }

  protected incrementConnections(instanceId: string): void {
    const count = this.connectionCounts.get(instanceId) ?? 0;
    this.connectionCounts.set(instanceId, count + 1);
  }

  protected decrementConnections(instanceId: string): void {
    const count = this.connectionCounts.get(instanceId) ?? 0;
    if (count > 0) {
      this.connectionCounts.set(instanceId, count - 1);
    }
  }

  protected getConnectionCount(instanceId: string): number {
    return this.connectionCounts.get(instanceId) ?? 0;
  }
}

export class RoundRobinLoadBalancer extends BaseLoadBalancer {
  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;

    const instance = healthy[this.currentIndex % healthy.length];
    this.currentIndex = (this.currentIndex + 1) % healthy.length;
    
    this.incrementConnections(instance.id);
    return instance;
  }
}

export class WeightedRoundRobinLoadBalancer extends BaseLoadBalancer {
  private weights: Map<string, number> = new Map();
  private currentWeights: Map<string, number> = new Map();

  constructor(options: LoadBalancerOptions) {
    super(options);
    this.initializeWeights();
  }

  private initializeWeights(): void {
    for (const instance of this.instances) {
      const weight = instance.metadata?.['weight'] ? parseInt(instance.metadata['weight'], 10) : 1;
      this.weights.set(instance.id, weight);
      this.currentWeights.set(instance.id, 0);
    }
  }

  updateInstances(instances: ServiceInstance[]): void {
    super.updateInstances(instances);
    this.initializeWeights();
  }

  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;

    let selected: ServiceInstance | null = null;
    let maxWeight = -1;
    let totalWeight = 0;

    for (const instance of healthy) {
      const weight = this.weights.get(instance.id) ?? 1;
      const currentWeight = (this.currentWeights.get(instance.id) ?? 0) + weight;
      this.currentWeights.set(instance.id, currentWeight);
      totalWeight += weight;

      if (currentWeight > maxWeight) {
        maxWeight = currentWeight;
        selected = instance;
      }
    }

    if (selected) {
      this.currentWeights.set(selected.id, (this.currentWeights.get(selected.id) ?? 0) - totalWeight);
      this.incrementConnections(selected.id);
    }

    return selected;
  }
}

export class LeastConnectionsLoadBalancer extends BaseLoadBalancer {
  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;

    let selected = healthy[0];
    let minConnections = this.getConnectionCount(selected.id);

    for (const instance of healthy) {
      const connections = this.getConnectionCount(instance.id);
      if (connections < minConnections) {
        minConnections = connections;
        selected = instance;
      }
    }

    this.incrementConnections(selected.id);
    return selected;
  }
}

export class P2CLoadBalancer extends BaseLoadBalancer {
  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;
    if (healthy.length === 1) {
      this.incrementConnections(healthy[0].id);
      return healthy[0];
    }

    const [a, b] = this.pickTwoRandom(healthy);
    const connectionsA = this.getConnectionCount(a.id);
    const connectionsB = this.getConnectionCount(b.id);

    const selected = connectionsA <= connectionsB ? a : b;
    this.incrementConnections(selected.id);
    return selected;
  }

  private pickTwoRandom<T>(array: T[]): [T, T] {
    const idx1 = Math.floor(Math.random() * array.length);
    let idx2 = Math.floor(Math.random() * (array.length - 1));
    if (idx2 >= idx1) idx2++;
    return [array[idx1], array[idx2]];
  }
}

export class ConsistentHashLoadBalancer extends BaseLoadBalancer {
  private ring: Map<number, ServiceInstance> = new Map();
  private virtualNodes = 160;
  private sortedHashes: number[] = [];

  constructor(options: LoadBalancerOptions) {
    super(options);
    this.rebuildRing();
  }

  updateInstances(instances: ServiceInstance[]): void {
    super.updateInstances(instances);
    this.rebuildRing();
  }

  private rebuildRing(): void {
    this.ring.clear();
    this.sortedHashes = [];

    for (const instance of this.instances) {
      const weight = instance.metadata?.['weight'] ? parseInt(instance.metadata['weight'], 10) : 1;
      const nodes = this.virtualNodes * weight;

      for (let i = 0; i < nodes; i++) {
        const hash = this.hash(`${instance.id}-${i}`);
        this.ring.set(hash, instance);
        this.sortedHashes.push(hash);
      }
    }

    this.sortedHashes.sort((a, b) => a - b);
  }

  private hash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  async pick(key?: string): Promise<ServiceInstance | null> {
    if (this.sortedHashes.length === 0) return null;

    const hash = this.hash(key ?? Math.random().toString());
    let idx = this.sortedHashes.findIndex(h => h >= hash);
    if (idx === -1) idx = 0;

    const instance = this.ring.get(this.sortedHashes[idx]);
    if (instance && this.isHealthy(instance)) {
      this.incrementConnections(instance.id);
      return instance;
    }

    for (let i = 0; i < this.sortedHashes.length; i++) {
      idx = (idx + 1) % this.sortedHashes.length;
      const candidate = this.ring.get(this.sortedHashes[idx]);
      if (candidate && this.isHealthy(candidate)) {
        this.incrementConnections(candidate.id);
        return candidate;
      }
    }

    return null;
  }
}

export class RandomLoadBalancer extends BaseLoadBalancer {
  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;

    const instance = healthy[Math.floor(Math.random() * healthy.length)];
    this.incrementConnections(instance.id);
    return instance;
  }
}

export class IPHashLoadBalancer extends BaseLoadBalancer {
  async pick(key?: string): Promise<ServiceInstance | null> {
    const healthy = this.getHealthyInstances();
    if (healthy.length === 0) return null;

    const ip = key ?? '127.0.0.1';
    const hash = this.hash(ip);
    const index = hash % healthy.length;
    const instance = healthy[index];
    
    this.incrementConnections(instance.id);
    return instance;
  }

  private hash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

export class LoadBalancerRegistry {
  private balancers: Map<string, LoadBalancer> = new Map();

  create(options: LoadBalancerOptions): LoadBalancer {
    if (this.balancers.has(options.name)) {
      throw new Error(`Load balancer ${options.name} already exists`);
    }

    const balancer = this.createBalancer(options);
    this.balancers.set(options.name, balancer);
    return balancer;
  }

  private createBalancer(options: LoadBalancerOptions): LoadBalancer {
    switch (options.strategy) {
      case 'round-robin':
        return new RoundRobinLoadBalancer(options);
      case 'weighted-round-robin':
        return new WeightedRoundRobinLoadBalancer(options);
      case 'least-connections':
        return new LeastConnectionsLoadBalancer(options);
      case 'p2c':
        return new P2CLoadBalancer(options);
      case 'consistent-hash':
        return new ConsistentHashLoadBalancer(options);
      case 'random':
        return new RandomLoadBalancer(options);
      case 'ip-hash':
        return new IPHashLoadBalancer(options);
      default:
        return new RoundRobinLoadBalancer(options);
    }
  }

  get(name: string): LoadBalancer | undefined {
    return this.balancers.get(name);
  }

  getOrCreate(options: LoadBalancerOptions): LoadBalancer {
    let balancer = this.balancers.get(options.name);
    if (!balancer) {
      balancer = this.create(options);
    }
    return balancer;
  }

  remove(name: string): boolean {
    return this.balancers.delete(name);
  }

  getAll(): LoadBalancer[] {
    return Array.from(this.balancers.values());
  }
}

export const loadBalancerRegistry = new LoadBalancerRegistry();

export function createLoadBalancer(options: LoadBalancerOptions): LoadBalancer {
  return loadBalancerRegistry.getOrCreate(options);
}