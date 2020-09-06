import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { getLogger } from '@faultless/log';

const logger = getLogger('metrics:exporter');

export interface MetricsExporterOptions {
  port?: number;
  host?: string;
  path?: string;
  jsonPath?: string;
}

export class MetricsExporter extends EventEmitter {
  private server: Server | null = null;
  private collectors: Array<() => Promise<string>> = [];
  private jsonCollectors: Array<() => Promise<Record<string, unknown>>> = [];
  private options: MetricsExporterOptions;
  private isRunning = false;

  constructor(options: MetricsExporterOptions = {}) {
    super();
    this.options = {
      port: 9091,
      host: '0.0.0.0',
      path: '/metrics',
      jsonPath: '/metrics/json',
      ...options,
    };
  }

  addCollector(collector: () => Promise<string>): void {
    this.collectors.push(collector);
  }

  addJsonCollector(collector: () => Promise<Record<string, unknown>>): void {
    this.jsonCollectors.push(collector);
  }

  removeCollector(index: number): boolean {
    if (index >= 0 && index < this.collectors.length) {
      this.collectors.splice(index, 1);
      return true;
    }
    return false;
  }

  removeJsonCollector(index: number): boolean {
    if (index >= 0 && index < this.jsonCollectors.length) {
      this.jsonCollectors.splice(index, 1);
      return true;
    }
    return false;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Metrics exporter is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          logger.error('Error handling metrics request', (error as Error).message);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });

      this.server.on('error', (error) => {
        logger.error('Metrics server error', error.message);
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.options.port, this.options.host, () => {
        this.isRunning = true;
        logger.info('Metrics exporter started', {
          port: this.options.port,
          host: this.options.host,
        });
        this.emit('started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        logger.info('Metrics exporter stopped');
        this.emit('stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '';

    if (url === this.options.path) {
      await this.handlePrometheusMetrics(req, res);
    } else if (url === this.options.jsonPath) {
      await this.handleJsonMetrics(req, res);
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  private async handlePrometheusMetrics(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const metrics = await this.collectPrometheusMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.statusCode = 200;
    res.end(metrics);
  }

  private async handleJsonMetrics(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const metrics = await this.collectJsonMetrics();
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(metrics, null, 2));
  }

  private async collectPrometheusMetrics(): Promise<string> {
    const results = await Promise.allSettled(
      this.collectors.map(collector => collector())
    );

    const metrics = results
      .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
      .map(result => result.value);

    return metrics.join('\n');
  }

  private async collectJsonMetrics(): Promise<Record<string, unknown>> {
    const results = await Promise.allSettled(
      this.jsonCollectors.map(collector => collector())
    );

    const metrics: Record<string, unknown> = {};
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        metrics[`collector_${i}`] = result.value;
      } else {
        metrics[`collector_${i}`] = { error: result.reason?.message ?? 'Unknown error' };
      }
    }

    return metrics;
  }

  getPort(): number {
    return this.options.port ?? 9091;
  }

  isExporterRunning(): boolean {
    return this.isRunning;
  }

  getCollectorCount(): number {
    return this.collectors.length;
  }

  getJsonCollectorCount(): number {
    return this.jsonCollectors.length;
  }
}

export function createMetricsExporter(options?: MetricsExporterOptions): MetricsExporter {
  return new MetricsExporter(options);
}
