import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { CircuitBreaker, CircuitBreakerState } from './circuit-breaker';

export interface CircuitBreakerMetrics {
  state: Gauge;
  totalRequests: Counter;
  successes: Counter;
  failures: Counter;
  rejections: Counter;
  latency: Histogram;
}

export function createCircuitBreakerMetrics(registry: Registry, prefix = 'circuit_breaker'): CircuitBreakerMetrics {
  const state = new Gauge({
    name: `${prefix}_state`,
    help: 'Circuit breaker state (0=closed, 1=half_open, 2=open)',
    labelNames: ['name'],
    registers: [registry],
  });

  const totalRequests = new Counter({
    name: `${prefix}_total_requests`,
    help: 'Total number of requests',
    labelNames: ['name'],
    registers: [registry],
  });

  const successes = new Counter({
    name: `${prefix}_successes`,
    help: 'Number of successful requests',
    labelNames: ['name'],
    registers: [registry],
  });

  const failures = new Counter({
    name: `${prefix}_failures`,
    help: 'Number of failed requests',
    labelNames: ['name'],
    registers: [registry],
  });

  const rejections = new Counter({
    name: `${prefix}_rejections`,
    help: 'Number of rejected requests (circuit open)',
    labelNames: ['name'],
    registers: [registry],
  });

  const latency = new Histogram({
    name: `${prefix}_latency_seconds`,
    help: 'Request latency in seconds',
    labelNames: ['name', 'result'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { state, totalRequests, successes, failures, rejections, latency };
}

export function instrumentCircuitBreaker(
  breaker: CircuitBreaker,
  metrics: CircuitBreakerMetrics
): () => void {
  const name = breaker.getName();

  const updateMetrics = () => {
    const stats = breaker.getStats();

    metrics.state.set({ name }, stateToNumber(stats.state));
    metrics.totalRequests.inc({ name }, stats.totalRequests);
    metrics.successes.inc({ name }, stats.successes);
    metrics.failures.inc({ name }, stats.failures);
  };

  const handleSuccess = (duration: number) => {
    metrics.latency.observe({ name, result: 'success' }, duration / 1000);
    updateMetrics();
  };

  const handleFailure = (duration: number) => {
    metrics.latency.observe({ name, result: 'failure' }, duration / 1000);
    updateMetrics();
  };

  const handleRejection = () => {
    metrics.rejections.inc({ name });
    updateMetrics();
  };

  const handleStateChange = ({ state }: { state: CircuitBreakerState }) => {
    metrics.state.set({ name }, stateToNumber(state));
  };

  breaker.on('success', ({ state }) => handleSuccess(0));
  breaker.on('failure', () => handleFailure(0));
  breaker.on('stateChange', handleStateChange);

  return () => {
    breaker.off('success', handleSuccess);
    breaker.off('failure', handleFailure);
    breaker.off('stateChange', handleStateChange);
  };
}

function stateToNumber(state: CircuitBreakerState): number {
  switch (state) {
    case CircuitBreakerState.CLOSED:
      return 0;
    case CircuitBreakerState.HALF_OPEN:
      return 1;
    case CircuitBreakerState.OPEN:
      return 2;
    default:
      return -1;
  }
}

export class CircuitBreakerMetricsCollector {
  private registry: Registry;
  private metrics: CircuitBreakerMetrics;
  private collectors: Map<string, () => void> = new Map();

  constructor(registry?: Registry, prefix = 'circuit_breaker') {
    this.registry = registry ?? new Registry();
    this.metrics = createCircuitBreakerMetrics(this.registry, prefix);
  }

  registerBreaker(breaker: CircuitBreaker): void {
    if (this.collectors.has(breaker.getName())) {
      return;
    }

    const cleanup = instrumentCircuitBreaker(breaker, this.metrics);
    this.collectors.set(breaker.getName(), cleanup);
  }

  unregisterBreaker(name: string): void {
    const cleanup = this.collectors.get(name);
    if (cleanup) {
      cleanup();
      this.collectors.delete(name);
    }
  }

  getRegistry(): Registry {
    return this.registry;
  }

  getMetrics(): CircuitBreakerMetrics {
    return this.metrics;
  }
}