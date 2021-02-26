import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'metrics' });

/**
 * Metrics Provider Type
 */
export enum MetricsProviderType {
  PROMETHEUS = 'PROMETHEUS',
  STATSD = 'STATSD',
  CONSOLE = 'CONSOLE',
}

/**
 * Metrics Options
 */
export interface MetricsOptions {
  provider: MetricsProviderType;
  prefix?: string;
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
  prometheus?: {
    port?: number;
    path?: string;
  };
  statsd?: {
    host: string;
    port: number;
    prefix?: string;
  };
}

/**
 * Metric Types
 */
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  SUMMARY = 'SUMMARY',
}

/**
 * Metrics Service
 * - Prometheus integration
 * - StatsD support
 * - Counter, Gauge, Histogram, Summary
 * - HTTP metrics endpoint
 * - Custom labels
 */
@Injectable()
export class MetricsService {
  private options: MetricsOptions;
  private registry: any;
  private metrics = new Map<string, any>();
  private server: any;
  private initialized = false;
  private promClient: {
    Counter: any;
    Gauge: any;
    Histogram: any;
    Summary: any;
  } | null = null;

  constructor(options: MetricsOptions) {
    this.options = {
      prefix: 'nofault_',
      collectDefaultMetrics: true,
      ...options,
    };
  }

  /**
   * Initialize metrics
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (this.options.provider === MetricsProviderType.PROMETHEUS) {
        await this.initializePrometheus();
      } else if (this.options.provider === MetricsProviderType.STATSD) {
        await this.initializeStatsD();
      }

      this.initialized = true;
      logger.info('Metrics initialized', {
        provider: this.options.provider,
        prefix: this.options.prefix,
      });
    } catch (error) {
      logger.error('Failed to initialize metrics', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Initialize Prometheus
   */
  private async initializePrometheus(): Promise<void> {
    const { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } = await import('prom-client');

    this.promClient = { Counter, Gauge, Histogram, Summary };
    this.registry = new Registry();

    if (this.options.collectDefaultMetrics) {
      collectDefaultMetrics({ register: this.registry, prefix: this.options.prefix });
    }

    // Add default labels
    if (this.options.defaultLabels) {
      this.registry.setDefaultLabels(this.options.defaultLabels);
    }

    // Start HTTP server for metrics endpoint
    const http = require('http');
    const port = this.options.prometheus?.port ?? 9090;
    const path = this.options.prometheus?.path ?? '/metrics';

    this.server = http.createServer(async (req: any, res: any) => {
      if (req.url === path) {
        res.setHeader('Content-Type', this.registry.contentType);
        res.end(await this.registry.metrics());
      } else {
        res.statusCode = 404;
        res.end();
      }
    });

    this.server.listen(port, () => {
      logger.info('Prometheus metrics server started', { port, path });
    });
  }

  /**
   * Initialize StatsD
   */
  private async initializeStatsD(): Promise<void> {
    const StatsD = (await import('hot-shots')).default;
    this.registry = new StatsD({
      host: this.options.statsd?.host ?? 'localhost',
      port: this.options.statsd?.port ?? 8125,
      prefix: this.options.statsd?.prefix ?? this.options.prefix,
    });
  }

  /**
   * Create counter
   */
  createCounter(name: string, help: string, labels?: string[]): any {
    const metricName = `${this.options.prefix}${name}`;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      const counter = new this.promClient!.Counter({
        name: metricName,
        help,
        labelNames: labels ?? [],
        registers: [this.registry],
      });
      this.metrics.set(name, counter);
      return counter;
    }

    // StatsD/Console
    this.metrics.set(name, { type: MetricType.COUNTER, name: metricName, value: 0 });
    return this.metrics.get(name);
  }

  /**
   * Create gauge
   */
  createGauge(name: string, help: string, labels?: string[]): any {
    const metricName = `${this.options.prefix}${name}`;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      const gauge = new this.promClient!.Gauge({
        name: metricName,
        help,
        labelNames: labels ?? [],
        registers: [this.registry],
      });
      this.metrics.set(name, gauge);
      return gauge;
    }

    this.metrics.set(name, { type: MetricType.GAUGE, name: metricName, value: 0 });
    return this.metrics.get(name);
  }

  /**
   * Create histogram
   */
  createHistogram(name: string, help: string, buckets?: number[], labels?: string[]): any {
    const metricName = `${this.options.prefix}${name}`;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      const histogram = new this.promClient!.Histogram({
        name: metricName,
        help,
        buckets: buckets ?? [0.1, 0.5, 1, 2, 5, 10],
        labelNames: labels ?? [],
        registers: [this.registry],
      });
      this.metrics.set(name, histogram);
      return histogram;
    }

    this.metrics.set(name, { type: MetricType.HISTOGRAM, name: metricName, values: [] });
    return this.metrics.get(name);
  }

  /**
   * Create summary
   */
  createSummary(name: string, help: string, percentiles?: number[], labels?: string[]): any {
    const metricName = `${this.options.prefix}${name}`;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      const summary = new this.promClient!.Summary({
        name: metricName,
        help,
        percentiles: percentiles ?? [0.5, 0.9, 0.99],
        labelNames: labels ?? [],
        registers: [this.registry],
      });
      this.metrics.set(name, summary);
      return summary;
    }

    this.metrics.set(name, { type: MetricType.SUMMARY, name: metricName, values: [] });
    return this.metrics.get(name);
  }

  /**
   * Increment counter
   */
  incrementCounter(name: string, labels?: Record<string, string>, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      metric.inc(labels ?? {}, value);
    } else if (this.options.provider === MetricsProviderType.STATSD) {
      this.registry.increment(metric.name, value);
    }
  }

  /**
   * Decrement gauge
   */
  decrementGauge(name: string, labels?: Record<string, string>, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      metric.dec(labels ?? {}, value);
    } else if (this.options.provider === MetricsProviderType.STATSD) {
      this.registry.decrement(metric.name, value);
    }
  }

  /**
   * Set gauge
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      metric.set(labels ?? {}, value);
    } else if (this.options.provider === MetricsProviderType.STATSD) {
      this.registry.gauge(metric.name, value);
    }
  }

  /**
   * Observe histogram
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      metric.observe(labels ?? {}, value);
    } else if (this.options.provider === MetricsProviderType.STATSD) {
      this.registry.histogram(metric.name, value);
    }
  }

  /**
   * Observe summary
   */
  observeSummary(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      metric.observe(labels ?? {}, value);
    } else if (this.options.provider === MetricsProviderType.STATSD) {
      this.registry.timing(metric.name, value);
    }
  }

  /**
   * Get metrics as string
   */
  async getMetrics(): Promise<string> {
    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      return await this.registry.metrics();
    }
    return '';
  }

  /**
   * Get metric value
   */
  async getMetricValue(name: string): Promise<any> {
    if (this.options.provider === MetricsProviderType.PROMETHEUS) {
      return await this.registry.getSingleMetricAsString(name);
    }
    return this.metrics.get(name);
  }

  /**
   * Shutdown metrics
   */
  async shutdown(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
    this.initialized = false;
  }
}

/**
 * Create metrics service
 */
export function createMetricsService(options: MetricsOptions): MetricsService {
  return new MetricsService(options);
}

/**
 * Metrics Middleware for HTTP
 */
export function createMetricsMiddleware(metrics: MetricsService) {
  const httpRequestDuration = metrics.createHistogram('http_request_duration_seconds', 'HTTP request duration', [0.1, 0.5, 1, 2, 5], ['method', 'route', 'status_code']);
  const httpRequestTotal = metrics.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'route', 'status_code']);

  return async (request: any, reply: any, next: () => Promise<void>) => {
    const start = Date.now();

    try {
      await next();
    } finally {
      const duration = (Date.now() - start) / 1000;
      const labels = {
        method: request.method,
        route: request.url,
        status_code: String(reply.statusCode),
      };

      metrics.observeHistogram('http_request_duration_seconds', duration, labels);
      metrics.incrementCounter('http_requests_total', labels);
    }
  };
}

/**
 * Metrics Decorator for methods
 */
export function Metrics(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const metrics = (this as any).__metrics__;
      if (!metrics) {
        return originalMethod.apply(this, args);
      }

      const metricName = name ?? `${target.constructor.name}.${propertyKey}`;
      const start = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        metrics.incrementCounter(`${metricName}_total`, { status: 'success' });
        return result;
      } catch (error) {
        metrics.incrementCounter(`${metricName}_total`, { status: 'error' });
        throw error;
      } finally {
        const duration = (Date.now() - start) / 1000;
        metrics.observeHistogram(`${metricName}_duration_seconds`, duration);
      }
    };

    return descriptor;
  };
}