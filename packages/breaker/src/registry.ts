import { CircuitBreaker, CircuitBreakerState, circuitBreakerRegistry, createCircuitBreaker } from './circuit-breaker';
import type { CircuitBreakerConfig } from './circuit-breaker';
import { CircuitBreakerMiddlewareManager, createCircuitBreakerMiddleware, createCircuitBreakerMiddlewareManager } from './circuit-breaker-middleware';
import type { CircuitBreakerRouteConfig } from './circuit-breaker-middleware';
import { CircuitBreakerMetricsCollector, createCircuitBreakerMetrics, instrumentCircuitBreaker } from './metrics';
import type { CircuitBreakerMetrics } from './metrics';
import { Registry } from 'prom-client';

export interface BreakerModuleOptions {
  metrics?: {
    enabled: boolean;
    registry?: Registry;
    prefix?: string;
  };
  defaultConfig?: Partial<CircuitBreakerConfig>;
}

export class BreakerModule {
  private registry: CircuitBreakerRegistry;
  private middlewareManager: CircuitBreakerMiddlewareManager;
  private metricsCollector?: CircuitBreakerMetricsCollector;
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(options: BreakerModuleOptions = {}) {
    this.registry = circuitBreakerRegistry;
    this.middlewareManager = createCircuitBreakerMiddlewareManager();
    this.defaultConfig = options.defaultConfig ?? {};

    if (options.metrics?.enabled) {
      this.metricsCollector = new CircuitBreakerMetricsCollector(
        options.metrics.registry,
        options.metrics.prefix
      );
    }
  }

  createBreaker(config: CircuitBreakerConfig): CircuitBreaker {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const breaker = this.registry.getOrCreate(mergedConfig);

    if (this.metricsCollector) {
      this.metricsCollector.registerBreaker(breaker);
    }

    return breaker;
  }

  getBreaker(name: string): CircuitBreaker | undefined {
    return this.registry.get(name);
  }

  registerRoute(config: CircuitBreakerRouteConfig): void {
    this.middlewareManager.registerRoute(config);
  }

  getMiddleware() {
    return this.middlewareManager.getMiddleware();
  }

  getMiddlewareManager(): CircuitBreakerMiddlewareManager {
    return this.middlewareManager;
  }

  getMetricsCollector(): CircuitBreakerMetricsCollector | undefined {
    return this.metricsCollector;
  }

  getAllStats(): Record<string, any> {
    return this.registry.getAllStats();
  }

  getMiddlewareStats(): Record<string, any> {
    return this.middlewareManager.getAllStats();
  }

  resetAll(): void {
    this.registry.resetAll();
    this.middlewareManager.resetAll();
  }

  getRegistry(): CircuitBreakerRegistry {
    return this.registry;
  }
}

export function createBreakerModule(options?: BreakerModuleOptions): BreakerModule {
  return new BreakerModule(options);
}

export { CircuitBreaker, CircuitBreakerState, circuitBreakerRegistry, createCircuitBreaker } from './circuit-breaker';
export type { CircuitBreakerConfig } from './circuit-breaker';
export { CircuitBreakerMiddlewareManager, createCircuitBreakerMiddleware, createCircuitBreakerMiddlewareManager } from './circuit-breaker-middleware';
export type { CircuitBreakerRouteConfig } from './circuit-breaker-middleware';
export { CircuitBreakerMetricsCollector, createCircuitBreakerMetrics, instrumentCircuitBreaker } from './metrics';
export type { CircuitBreakerMetrics } from './metrics';
export type { Registry } from 'prom-client';