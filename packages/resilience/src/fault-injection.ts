import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'resilience:fault-injection' });

/**
 * Fault Type
 */
export enum FaultType {
  LATENCY = 'LATENCY',       // Inject artificial delay
  ERROR = 'ERROR',           // Inject error responses
  TIMEOUT = 'TIMEOUT',       // Force timeout
  PARTIAL_RESPONSE = 'PARTIAL', // Return partial response
  DROP_CONNECTION = 'DROP',   // Drop connection
  REJECT = 'REJECT',         // Reject with specific status
  CORRUPT = 'CORRUPT',       // Corrupt response data
}

/**
 * Fault Condition
 */
export interface FaultCondition {
  path?: string;              // Path pattern (regex)
  method?: string;            // HTTP method
  headers?: Record<string, string>; // Header match
  percentage?: number;        // Probability (0-100)
  times?: number;             // Max occurrences
  since?: number;             // Start timestamp
  until?: number;             // End timestamp
}

/**
 * Fault Definition
 */
export interface FaultDefinition {
  type: FaultType;
  condition?: FaultCondition;
  config: FaultConfig;
  enabled?: boolean;
}

/**
 * Fault Config
 */
export interface FaultConfig {
  latencyMs?: number;
  statusCode?: number;
  errorMessage?: string;
  responseBody?: any;
  percentage?: number;
}

/**
 * Injected Fault Info
 */
export interface InjectedFault {
  id: string;
  type: FaultType;
  injectedAt: number;
  path: string;
  method: string;
}

/**
 * Fault Injection Engine
 * - Latency injection (artificial delays)
 * - Error injection (custom error responses)
 * - Timeout injection (force timeouts)
 * - Partial response injection
 * - Connection dropping
 * - Request rejection
 * - Response corruption
 * Supports:
 * - Conditional activation (path, method, headers)
 * - Percentage-based activation
 * - Time-based activation
 * - Occurrence limits
 * - Real-time enable/disable
 */
@Injectable()
export class FaultInjectionEngine {
  private faults: Map<string, FaultDefinition & { enabled: boolean; count: number }> = new Map();
  private injectedHistory: InjectedFault[] = [];

  /**
   * Register a fault
   */
  register(id: string, fault: FaultDefinition): void {
    this.faults.set(id, {
      ...fault,
      enabled: fault.enabled ?? true,
      count: 0,
    });
    logger.debug('Fault registered', { id, type: fault.type });
  }

  /**
   * Unregister a fault
   */
  unregister(id: string): boolean {
    return this.faults.delete(id);
  }

  /**
   * Enable/disable a fault
   */
  setEnabled(id: string, enabled: boolean): void {
    const fault = this.faults.get(id);
    if (fault) {
      fault.enabled = enabled;
    }
  }

  /**
   * Clear all faults
   */
  clear(): void {
    this.faults.clear();
    this.injectedHistory = [];
  }

  /**
   * Check if any fault should be injected for this request
   */
  async shouldInject(request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  }): Promise<FaultDefinition | null> {
    for (const [id, fault] of this.faults.entries()) {
      if (!fault.enabled) continue;

      // Check condition
      if (fault.condition && !this.matchCondition(fault.condition, request)) {
        continue;
      }

      // Check percentage
      const percentage = fault.condition?.percentage ?? fault.config.percentage ?? 100;
      if (Math.random() * 100 >= percentage) {
        continue;
      }

      // Check times limit
      if (fault.condition?.times && fault.count >= fault.condition.times) {
        continue;
      }

      // Check time window
      const now = Date.now();
      if (fault.condition?.since && now < fault.condition.since) continue;
      if (fault.condition?.until && now > fault.condition.until) continue;

      // Inject this fault
      fault.count++;
      this.injectedHistory.push({
        id,
        type: fault.type,
        injectedAt: now,
        path: request.path,
        method: request.method,
      });

      return fault;
    }

    return null;
  }

  /**
   * Apply fault to request/response
   */
  async applyFault(
    fault: FaultDefinition,
    request: any,
    reply: any,
    next: () => Promise<void>
  ): Promise<void> {
    switch (fault.type) {
      case FaultType.LATENCY:
        await this.applyLatency(fault.config);
        await next();
        break;

      case FaultType.ERROR:
        await this.applyError(reply, fault.config);
        break;

      case FaultType.TIMEOUT:
        await this.applyTimeout(fault.config);
        break;

      case FaultType.PARTIAL_RESPONSE:
        await this.applyPartialResponse(reply, fault.config);
        break;

      case FaultType.DROP_CONNECTION:
        await this.applyDropConnection(request);
        break;

      case FaultType.REJECT:
        await this.applyReject(reply, fault.config);
        break;

      case FaultType.CORRUPT:
        await this.applyCorrupt(reply, fault.config);
        break;

      default:
        await next();
    }
  }

  /**
   * Apply latency injection
   */
  private async applyLatency(config: FaultConfig): Promise<void> {
    const delay = config.latencyMs ?? 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Apply error injection
   */
  private async applyError(reply: any, config: FaultConfig): Promise<void> {
    const statusCode = config.statusCode ?? 500;
    const errorMessage = config.errorMessage ?? 'Injected error';

    reply.code(statusCode).send({
      error: errorMessage,
      fault: true,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Apply timeout injection
   */
  private async applyTimeout(config: FaultConfig): Promise<void> {
    const timeout = config.latencyMs ?? 30000;
    await new Promise(resolve => setTimeout(resolve, timeout));
  }

  /**
   * Apply partial response injection
   */
  private async applyPartialResponse(reply: any, config: FaultConfig): Promise<void> {
    reply.header('x-nofault-fault', 'partial-response');
    reply.code(200).send(config.responseBody ?? { partial: true });
  }

  /**
   * Apply connection drop
   */
  private async applyDropConnection(request: any): Promise<void> {
    request.destroy();
  }

  /**
   * Apply rejection
   */
  private async applyReject(reply: any, config: FaultConfig): Promise<void> {
    const statusCode = config.statusCode ?? 503;
    reply.code(statusCode).send({
      error: 'Service unavailable (fault injection)',
      fault: true,
    });
  }

  /**
   * Apply response corruption
   */
  private async applyCorrupt(reply: any, config: FaultConfig): Promise<void> {
    // Corrupt the response by appending garbage
    const originalSend = reply.send.bind(reply);
    reply.send = function(data: any) {
      const corrupted = typeof data === 'string'
        ? data + '\x00\x01\x02\x03'
        : { ...data, _corrupted: true };
      return originalSend(corrupted);
    };
  }

  /**
   * Match condition against request
   */
  private matchCondition(
    condition: FaultCondition,
    request: { path: string; method: string; headers: Record<string, string> }
  ): boolean {
    // Path pattern
    if (condition.path) {
      const regex = new RegExp(condition.path);
      if (!regex.test(request.path)) return false;
    }

    // Method
    if (condition.method && condition.method.toUpperCase() !== request.method.toUpperCase()) {
      return false;
    }

    // Headers
    if (condition.headers) {
      for (const [key, value] of Object.entries(condition.headers)) {
        if (request.headers[key.toLowerCase()] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get injection history
   */
  getHistory(): InjectedFault[] {
    return [...this.injectedHistory];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFaults: number;
    activeFaults: number;
    totalInjections: number;
    injectionsByType: Record<string, number>;
  } {
    const activeFaults = Array.from(this.faults.values()).filter(f => f.enabled).length;
    const injectionsByType: Record<string, number> = {};

    this.injectedHistory.forEach(injection => {
      injectionsByType[injection.type] = (injectionsByType[injection.type] || 0) + 1;
    });

    return {
      totalFaults: this.faults.size,
      activeFaults,
      totalInjections: this.injectedHistory.length,
      injectionsByType,
    };
  }
}

/**
 * Create fault injection engine
 */
export function createFaultInjectionEngine(): FaultInjectionEngine {
  return new FaultInjectionEngine();
}

/**
 * Fault Injection Middleware for HTTP
 */
export function createFaultInjectionMiddleware(engine?: FaultInjectionEngine) {
  const faultEngine = engine ?? createFaultInjectionEngine();

  return async (request: any, reply: any, next: () => Promise<void>) => {
    const fault = await faultEngine.shouldInject({
      path: request.url,
      method: request.method,
      headers: request.headers as Record<string, string>,
    });

    if (fault) {
      await faultEngine.applyFault(fault, request, reply, next);
      return;
    }

    await next();
  };
}

/**
 * Predefined fault scenarios for testing
 */
export const FaultScenarios = {
  /**
   * Inject 500ms latency on all requests
   */
  latency500ms: (): FaultDefinition => ({
    type: FaultType.LATENCY,
    config: { latencyMs: 500 },
  }),

  /**
   * Inject 500 error on /api/* paths
   */
  errorOnApi: (): FaultDefinition => ({
    type: FaultType.ERROR,
    condition: { path: '^/api/', percentage: 100 },
    config: { statusCode: 500, errorMessage: 'Injected server error' },
  }),

  /**
   * Timeout on 30% of requests
   */
  timeout30Percent: (): FaultDefinition => ({
    type: FaultType.TIMEOUT,
    condition: { percentage: 30 },
    config: { latencyMs: 30000 },
  }),

  /**
   * Reject with 503 on POST requests
   */
  rejectPost: (): FaultDefinition => ({
    type: FaultType.REJECT,
    condition: { method: 'POST', percentage: 100 },
    config: { statusCode: 503 },
  }),

  /**
   * Corrupt 10% of responses
   */
  corrupt10Percent: (): FaultDefinition => ({
    type: FaultType.CORRUPT,
    condition: { percentage: 10 },
    config: {},
  }),

  /**
   * Partial response on /users
   */
  partialUsers: (): FaultDefinition => ({
    type: FaultType.PARTIAL_RESPONSE,
    condition: { path: '^/users', percentage: 100 },
    config: { responseBody: { users: [], truncated: true } },
  }),
};