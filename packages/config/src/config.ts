import { DatabaseOptions, RedisOptions, ServiceDiscoveryOptions, TracingOptions, MetricsOptions, AuthOptions, QueueOptions, GatewayOptions } from '@faultless/core';

export interface AppConfig {
  app: {
    name: string;
    version: string;
    env: 'development' | 'staging' | 'production';
    port: number;
    host: string;
  };
  database?: DatabaseOptions;
  redis?: RedisOptions;
  discovery?: ServiceDiscoveryOptions;
  tracing?: TracingOptions;
  metrics?: MetricsOptions;
  auth?: AuthOptions;
  queue?: QueueOptions;
  gateway?: GatewayOptions;
  custom?: Record<string, unknown>;
}

export interface ConfigSource {
  name: string;
  priority: number;
  load(): Promise<Record<string, unknown>> | Record<string, unknown>;
  watch?(callback: (config: Record<string, unknown>) => void): () => void;
}

export interface ConfigLoaderOptions {
  sources: ConfigSource[];
  schema?: ConfigSchema;
  validateOnLoad?: boolean;
  watchForChanges?: boolean;
}

export interface ConfigSchema {
  type: 'object';
  properties: Record<string, ConfigProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: ConfigProperty;
  properties?: Record<string, ConfigProperty>;
  required?: string[];
  additionalProperties?: boolean | ConfigProperty;
}

export interface ConfigChangeEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  source: string;
  timestamp: Date;
}

export type ConfigChangeListener = (event: ConfigChangeEvent) => void;