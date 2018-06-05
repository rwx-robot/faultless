import { Controller, Get, Module } from '@faultless/core';
import { HealthCheckService, createHealthCheckService } from './health-check';
import { HealthIndicator } from '@faultless/core';

@Controller('health')
export class HealthController {
  constructor(private healthCheckService: HealthCheckService) {}

  @Get()
  async check() {
    return this.healthCheckService.checkHealth();
  }

  @Get('ready')
  async ready() {
    return this.healthCheckService.checkReadiness();
  }

  @Get('live')
  async live() {
    return this.healthCheckService.checkLiveness();
  }
}

export interface HealthModuleOptions {
  path?: string;
  includeDetails?: boolean;
  timeout?: number;
  indicators?: HealthIndicator[];
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}) {
    const healthCheckService = createHealthCheckService({
      path: options.path,
      includeDetails: options.includeDetails,
      timeout: options.timeout,
    });

    if (options.indicators) {
      for (const indicator of options.indicators) {
        healthCheckService.registerIndicator(indicator);
      }
    }

    return {
      module: HealthModule,
      providers: [
        { provide: 'HEALTH_CHECK_SERVICE', useValue: healthCheckService },
      ],
      controllers: [HealthController],
      exports: ['HEALTH_CHECK_SERVICE'],
    };
  }
}

export { HealthCheckService, createHealthCheckService } from './health-check';
export { MemoryHealthIndicator, DiskHealthIndicator, DatabaseHealthIndicator, RedisHealthIndicator, HttpHealthIndicator, CustomHealthIndicator } from './health-indicator';