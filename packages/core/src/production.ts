import { EventEmitter } from 'events';
import { GracefulShutdown, ShutdownEvent } from './shutdown';

export interface ProductionOptions {
  serviceName: string;
  version?: string;
  environment?: string;
  port?: number;
  shutdownTimeout?: number;
  healthCheckPort?: number;
  metricsPort?: number;
}

export interface ProductionHealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>;
  timestamp: string;
  uptime: number;
}

export interface MetricsExporter {
  addCollector(collector: () => Promise<string>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface HealthCheckManager {
  register(name: string, check: () => Promise<{
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>): void;
  check(): Promise<ProductionHealthCheckResult>;
  isHealthy(): Promise<boolean>;
}

export interface StructuredLogger {
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}

export class ProductionReadyServer extends EventEmitter {
  private options: ProductionOptions;
  private shutdown: GracefulShutdown;
  private healthCheckManager: HealthCheckManager;
  private metricsExporter: MetricsExporter;
  private logger: StructuredLogger;
  private isStarted = false;

  constructor(options: ProductionOptions) {
    super();
    this.options = options;

    this.shutdown = new GracefulShutdown(options.shutdownTimeout ?? 30000);

    this.healthCheckManager = {
      checks: new Map(),
      register: (name: string, check: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message?: string; duration?: number }>) => {
        (this.healthCheckManager as any).checks.set(name, check);
      },
      check: async (): Promise<ProductionHealthCheckResult> => {
        const checks: ProductionHealthCheckResult['checks'] = {};
        let overallStatus: ProductionHealthCheckResult['status'] = 'healthy';

        for (const [name, checkFn] of (this.healthCheckManager as any).checks) {
          try {
            const start = Date.now();
            const result = await checkFn();
            checks[name] = { ...result, duration: Date.now() - start };

            if (result.status === 'fail') {
              overallStatus = 'unhealthy';
            } else if (result.status === 'warn' && overallStatus === 'healthy') {
              overallStatus = 'degraded';
            }
          } catch (error) {
            checks[name] = {
              status: 'fail',
              message: error instanceof Error ? error.message : String(error),
            };
            overallStatus = 'unhealthy';
          }
        }

        return {
          status: overallStatus,
          checks,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        };
      },
      isHealthy: async (): Promise<boolean> => {
        const result = await (this.healthCheckManager as any).check();
        return result.status === 'healthy';
      },
    } as HealthCheckManager;

    this.metricsExporter = {
      collectors: [],
      addCollector: (collector: () => Promise<string>) => {
        (this.metricsExporter as any).collectors.push(collector);
      },
      start: async () => {
        // Placeholder for actual HTTP server
      },
      stop: async () => {
        // Placeholder for actual HTTP server
      },
    } as MetricsExporter;

    this.logger = {
      info: (message: string, context?: Record<string, any>) => {
        console.log(JSON.stringify({
          level: 'info',
          message,
          context,
          serviceName: options.serviceName,
          timestamp: new Date().toISOString(),
        }));
      },
      warn: (message: string, context?: Record<string, any>) => {
        console.warn(JSON.stringify({
          level: 'warn',
          message,
          context,
          serviceName: options.serviceName,
          timestamp: new Date().toISOString(),
        }));
      },
      error: (message: string, error?: Error, context?: Record<string, any>) => {
        console.error(JSON.stringify({
          level: 'error',
          message,
          error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
          context,
          serviceName: options.serviceName,
          timestamp: new Date().toISOString(),
        }));
      },
      debug: (message: string, context?: Record<string, any>) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(JSON.stringify({
            level: 'debug',
            message,
            context,
            serviceName: options.serviceName,
            timestamp: new Date().toISOString(),
          }));
        }
      },
    };

    this.setupShutdownHandlers();
    this.setupDefaultHealthChecks();
  }

  private setupShutdownHandlers(): void {
    this.shutdown.on('start', (event: ShutdownEvent) => {
      this.logger.info('Shutdown started', { timestamp: event.timestamp });
    });

    this.shutdown.on('service', (event: ShutdownEvent) => {
      this.logger.info(`Shutting down service: ${event.service}`, { timestamp: event.timestamp });
    });

    this.shutdown.on('complete', (event: ShutdownEvent) => {
      this.logger.info('Shutdown completed', { timestamp: event.timestamp });
    });

    this.shutdown.on('timeout', (event: ShutdownEvent) => {
      this.logger.error('Shutdown timeout exceeded', event.error, { timestamp: event.timestamp });
    });
  }

  private setupDefaultHealthChecks(): void {
    this.healthCheckManager.register('process', async () => {
      return {
        status: 'pass',
        message: 'Process is running',
      };
    });

    this.healthCheckManager.register('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const usageRatio = heapUsedMB / heapTotalMB;

      if (usageRatio > 0.9) {
        return {
          status: 'fail',
          message: `Memory usage critical: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`,
        };
      } else if (usageRatio > 0.7) {
        return {
          status: 'warn',
          message: `Memory usage high: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`,
        };
      }

      return {
        status: 'pass',
        message: `Memory usage normal: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`,
      };
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    this.logger.info('Starting production server', {
      serviceName: this.options.serviceName,
      version: this.options.version,
      environment: this.options.environment,
    });

    await this.metricsExporter.start();
    this.shutdown.start();
    this.isStarted = true;

    this.logger.info('Production server started', {
      port: this.options.port,
      healthCheckPort: this.options.healthCheckPort,
      metricsPort: this.options.metricsPort,
    });

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info('Stopping production server');

    await this.metricsExporter.stop();
    await this.shutdown.shutdown();

    this.isStarted = false;
    this.logger.info('Production server stopped');
    this.emit('stopped');
  }

  getHealthCheck(): HealthCheckManager {
    return this.healthCheckManager;
  }

  getMetrics(): MetricsExporter {
    return this.metricsExporter;
  }

  getLogger(): StructuredLogger {
    return this.logger;
  }

  isServerStarted(): boolean {
    return this.isStarted;
  }

  getOptions(): ProductionOptions {
    return { ...this.options };
  }
}

export function createProductionServer(options: ProductionOptions): ProductionReadyServer {
  return new ProductionReadyServer(options);
}
