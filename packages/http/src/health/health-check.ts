import { EventEmitter } from 'events';
import { HealthCheckResult, HealthIndicator } from '@faultless/core';
import { getLogger } from '@faultless/log';

const logger = getLogger('health:health-check');

export interface EnhancedHealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>;
  timestamp: string;
  uptime: number;
}

export interface HealthCheckManagerOptions {
  timeout?: number;
  interval?: number;
  degradeThreshold?: number;
}

export class HealthCheckManager extends EventEmitter {
  private checks: Map<string, () => Promise<{
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>> = new Map();
  private options: HealthCheckManagerOptions;
  private lastResult: EnhancedHealthCheckResult | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(options: HealthCheckManagerOptions = {}) {
    super();
    this.options = {
      timeout: 5000,
      degradeThreshold: 0.5,
      ...options,
    };
  }

  register(name: string, check: () => Promise<{
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>): void {
    if (this.checks.has(name)) {
      logger.warn(`Health check ${name} already registered, replacing`);
    }
    this.checks.set(name, check);
    logger.info(`Health check registered: ${name}`);
  }

  unregister(name: string): boolean {
    const result = this.checks.delete(name);
    if (result) {
      logger.info(`Health check unregistered: ${name}`);
    }
    return result;
  }

  async check(): Promise<EnhancedHealthCheckResult> {
    const startTime = Date.now();
    const checks: EnhancedHealthCheckResult['checks'] = {};
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    for (const [name, checkFn] of this.checks) {
      try {
        const checkStart = Date.now();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout);
        });

        const result = await Promise.race([checkFn(), timeoutPromise]);
        const duration = Date.now() - checkStart;

        checks[name] = {
          ...result,
          duration,
        };

        if (result.status === 'pass') {
          passCount++;
        } else if (result.status === 'fail') {
          failCount++;
        } else {
          warnCount++;
        }
      } catch (error) {
        checks[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : String(error),
        };
        failCount++;
      }
    }

    const totalChecks = passCount + failCount + warnCount;
    let overallStatus: EnhancedHealthCheckResult['status'] = 'healthy';

    if (failCount > 0) {
      overallStatus = 'unhealthy';
    } else if (totalChecks > 0 && warnCount / totalChecks >= (this.options.degradeThreshold ?? 0.5)) {
      overallStatus = 'degraded';
    }

    const result: EnhancedHealthCheckResult = {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    this.lastResult = result;
    this.emit('check', result);

    return result;
  }

  async isHealthy(): Promise<boolean> {
    const result = await this.check();
    return result.status === 'healthy';
  }

  getLastResult(): EnhancedHealthCheckResult | null {
    return this.lastResult;
  }

  startPeriodicCheck(interval?: number): void {
    const checkInterval = interval ?? this.options.interval;
    if (!checkInterval) {
      throw new Error('Check interval must be specified for periodic health checks');
    }

    this.stopPeriodicCheck();
    this.intervalTimer = setInterval(async () => {
      try {
        await this.check();
      } catch (error) {
        logger.error('Periodic health check failed', (error as Error).message);
      }
    }, checkInterval);

    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  stopPeriodicCheck(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  hasCheck(name: string): boolean {
    return this.checks.has(name);
  }

  clear(): void {
    this.checks.clear();
    this.lastResult = null;
  }
}

export function createHealthCheckManager(options?: HealthCheckManagerOptions): HealthCheckManager {
  return new HealthCheckManager(options);
}

export interface HealthCheckOptions {
  path?: string;
  includeDetails?: boolean;
  timeout?: number;
}

export class HealthCheckService {
  private indicators: Map<string, HealthIndicator> = new Map();
  private options: HealthCheckOptions;

  constructor(options: HealthCheckOptions = {}) {
    this.options = {
      path: '/health',
      includeDetails: true,
      timeout: 5000,
      ...options,
    };
  }

  registerIndicator(indicator: HealthIndicator): void {
    if (this.indicators.has(indicator.name)) {
      logger.warn(`Health indicator ${indicator.name} already registered, replacing`);
    }
    this.indicators.set(indicator.name, indicator);
  }

  unregisterIndicator(name: string): boolean {
    return this.indicators.delete(name);
  }

  async checkHealth(): Promise<{
    status: 'ok' | 'error' | 'degraded';
    timestamp: Date;
    checks: Record<string, HealthCheckResult>;
    uptime: number;
    version?: string;
  }> {
    const startTime = Date.now();
    const checks: Record<string, HealthCheckResult> = {};
    let overallStatus: 'ok' | 'error' | 'degraded' = 'ok';

    for (const [name, indicator] of this.indicators) {
      try {
        const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout);
        });

        const result = await Promise.race([indicator.isHealthy(), timeoutPromise]);
        checks[name] = result;

        if (result.status === 'error') {
          overallStatus = 'error';
        } else if (result.status === 'degraded' && overallStatus === 'ok') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        checks[name] = {
          status: 'error',
          details: { error: error instanceof Error ? error.message : String(error) },
          timestamp: new Date(),
        };
        overallStatus = 'error';
      }
    }

    const duration = Date.now() - startTime;

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks: this.options.includeDetails ? checks : {},
      uptime: process.uptime(),
      version: process.env.npm_package_version,
    };
  }

  async checkReadiness(): Promise<{
    ready: boolean;
    checks: Record<string, HealthCheckResult>;
  }> {
    const health = await this.checkHealth();
    return {
      ready: health.status !== 'error',
      checks: health.checks,
    };
  }

  async checkLiveness(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  getRegisteredIndicators(): string[] {
    return Array.from(this.indicators.keys());
  }

  getOptions(): HealthCheckOptions {
    return { ...this.options };
  }
}

export function createHealthCheckService(options?: HealthCheckOptions): HealthCheckService {
  return new HealthCheckService(options);
}