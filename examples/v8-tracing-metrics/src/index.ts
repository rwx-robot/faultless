import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  TracingService,
  createTracingService,
  TraceExporterType,
  createTracingMiddleware,
  Traced,
} from '@faultless/tracing';
import {
  MetricsService,
  createMetricsService,
  MetricsProviderType,
  createMetricsMiddleware,
  Metrics,
} from '@faultless/metrics';

const logger = createLogger({ level: 'info', serviceName: 'v8-tracing-metrics' });

// Initialize tracing
const tracing = createTracingService({
  serviceName: 'v8-example',
  exporter: TraceExporterType.CONSOLE,
  sampleRate: 1.0,
  instruments: { http: true },
});

// Initialize metrics
const metrics = createMetricsService({
  provider: MetricsProviderType.PROMETHEUS,
  prefix: 'nofault_',
  defaultLabels: { app: 'v8-example' },
  prometheus: { port: 9090, path: '/metrics' },
});

// Create custom metrics
const httpRequestDuration = metrics.createHistogram('http_request_duration_seconds', 'HTTP request duration', [0.1, 0.5, 1, 2, 5], ['method', 'route']);
const httpRequestTotal = metrics.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'route']);
const activeConnections = metrics.createGauge('active_connections', 'Active connections');

@Injectable()
class UserService {
  private users = new Map<string, { id: string; name: string; email: string }>();

  constructor() {
    this.users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
    this.users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });
  }

  @Traced('UserService.findById')
  @Metrics('user_find_by_id')
  async findById(id: string): Promise<{ id: string; name: string; email: string } | null> {
    return this.users.get(id) ?? null;
  }

  @Traced('UserService.list')
  @Metrics('user_list')
  async list(): Promise<Array<{ id: string; name: string; email: string }>> {
    return Array.from(this.users.values());
  }

  @Traced('UserService.create')
  @Metrics('user_create')
  async create(user: { name: string; email: string }): Promise<{ id: string; name: string; email: string }> {
    const id = String(this.users.size + 1);
    const newUser = { id, ...user };
    this.users.set(id, newUser);
    return newUser;
  }
}

@Controller('users')
class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  async list() {
    return this.userService.list();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  async create(@Body() body: { name: string; email: string }) {
    return this.userService.create(body);
  }
}

@Controller('tracing')
class TracingController {
  @Get('context')
  getTraceContext() {
    return tracing.getCurrentContext();
  }

  @Get('headers')
  getPropagationHeaders() {
    return tracing.createPropagationHeaders();
  }
}

@Controller('metrics')
class MetricsController {
  @Get()
  async getMetrics() {
    return metrics.getMetrics();
  }

  @Get('active')
  getActiveConnections() {
    return { active: activeConnections };
  }
}

@Module({
  controllers: [UsersController, TracingController, MetricsController],
  providers: [UserService],
})
class AppModule {}

async function main() {
  // Initialize tracing and metrics
  await tracing.initialize();
  await metrics.initialize();

  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
      middleware: [
        createTracingMiddleware(tracing),
        createMetricsMiddleware(metrics),
      ],
    },
  });
}

main().catch(console.error);