export type Constructor<T = unknown> = new (...args: unknown[]) => T;

export interface AsyncConstructor<T = unknown> {
  new (...args: unknown[]): Promise<T>;
}

export type Factory<T> = () => T | Promise<T>;

export interface ServiceIdentifier<T = unknown> {
  name: string;
  symbol?: symbol;
}

export interface ModuleMetadata {
  imports?: Array<Constructor | DynamicModule | Promise<DynamicModule>>;
  controllers?: Constructor[];
  providers?: Array<Constructor | Provider>;
  exports?: Array<Constructor | string | symbol>;
}

export interface DynamicModule extends ModuleMetadata {
  module: Constructor;
  global?: boolean;
}

export interface Provider<T = unknown> {
  provide: Constructor<T> | string | symbol;
  useClass?: Constructor<T>;
  useValue?: T;
  useFactory?: Factory<T>;
  inject?: Array<Constructor | string | symbol>;
}

export interface InjectionToken<T = unknown> {
  token: string | symbol;
  description?: string;
}

export interface LifecycleHook {
  onModuleInit?(): void | Promise<void>;
  onApplicationBootstrap?(): void | Promise<void>;
  onModuleDestroy?(): void | Promise<void>;
  beforeApplicationShutdown?(): void | Promise<void>;
  onApplicationShutdown?(): void | Promise<void>;
}

export interface HealthCheckResult {
  status: 'ok' | 'error' | 'degraded';
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface HealthIndicator {
  name: string;
  isHealthy(): Promise<HealthCheckResult>;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryOptions {
  retries: number;
  delay: number;
  backoff?: 'constant' | 'exponential' | 'linear';
  maxDelay?: number;
  retryable?: (error: Error) => boolean;
}

export interface TimeoutOptions {
  timeout: number;
  message?: string;
}

export interface CircuitBreakerOptions {
  threshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (context: unknown) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface CacheOptions {
  ttl: number;
  maxSize?: number;
  keyPrefix?: string;
}

export interface DatabaseOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  poolSize?: number;
}

export interface RedisOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  sentinel?: {
    masterName: string;
    sentinels: Array<{ host: string; port: number }>;
  };
  cluster?: boolean;
}

export interface ServiceDiscoveryOptions {
  type: 'etcd' | 'consul' | 'kubernetes' | 'static';
  endpoints: string[];
  serviceName: string;
  ttl?: number;
  metadata?: Record<string, string>;
}

export interface TracingOptions {
  serviceName: string;
  exporter: 'otlp' | 'zipkin' | 'jaeger' | 'console';
  endpoint?: string;
  samplingRate?: number;
}

export interface MetricsOptions {
  prefix?: string;
  defaultLabels?: Record<string, string>;
  pushGateway?: string;
  interval?: number;
}

export interface AuthOptions {
  jwtSecret: string;
  jwtExpiry: string;
  refreshExpiry: string;
  issuer?: string;
  audience?: string;
}

export interface QueueOptions {
  type: 'rabbitmq' | 'kafka' | 'redis';
  connection: Record<string, unknown>;
  defaultQueue?: string;
}

export interface GatewayOptions {
  port: number;
  host?: string;
  routes: GatewayRoute[];
  middlewares?: GatewayMiddleware[];
}

export interface GatewayRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  target: string;
  timeout?: number;
  retries?: number;
  auth?: boolean;
  rateLimit?: RateLimitOptions;
}

export interface GatewayMiddleware {
  name: string;
  handler: (request: unknown, response: unknown, next: () => void) => void;
}

export interface CLICommand {
  name: string;
  description: string;
  arguments?: CLIArgument[];
  options?: CLIOption[];
  action: (args: Record<string, unknown>, options: Record<string, unknown>) => Promise<void>;
}

export interface CLIArgument {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
}

export interface CLIOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
  required?: boolean;
}