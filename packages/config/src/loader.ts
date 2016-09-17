import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'js-yaml';
import { parse as parseToml } from 'toml';
import {
  AppConfig,
  ConfigSource,
  ConfigLoaderOptions,
  ConfigSchema,
  ConfigProperty,
  ConfigChangeEvent,
  ConfigChangeListener,
} from './config';

export class ConfigLoader extends EventEmitter {
  private sources: ConfigSource[];
  private schema?: ConfigSchema;
  private validateOnLoad: boolean;
  private watchForChanges: boolean;
  private currentConfig: AppConfig;
  private watchers: Array<() => void> = [];
  private loaded = false;

  constructor(options: ConfigLoaderOptions) {
    super();
    this.sources = options.sources.sort((a, b) => b.priority - a.priority);
    this.schema = options.schema;
    this.validateOnLoad = options.validateOnLoad ?? true;
    this.watchForChanges = options.watchForChanges ?? false;
    this.currentConfig = this.getDefaultConfig();
  }

  private getDefaultConfig(): AppConfig {
    return {
      app: {
        name: 'nofault-app',
        version: '0.0.0',
        env: 'development',
        port: 3000,
        host: '0.0.0.0',
      },
    };
  }

  async load(): Promise<AppConfig> {
    const merged: Record<string, unknown> = {};

    for (const source of this.sources) {
      try {
        const config = await source.load();
        this.deepMerge(merged, config);
      } catch (error) {
        this.emit('error', new Error(`Failed to load config from ${source.name}: ${error}`));
      }
    }

    this.currentConfig = this.applyDefaults(merged as Partial<AppConfig>);

    if (this.validateOnLoad && this.schema) {
      this.validate(this.currentConfig);
    }

    if (this.watchForChanges) {
      this.startWatching();
    }

    this.loaded = true;
    this.emit('loaded', this.currentConfig);

    return this.currentConfig;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        this.deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else {
        target[key] = sourceValue;
      }
    }
  }

  private applyDefaults(config: Partial<AppConfig>): AppConfig {
    return this.deepMergeConfig(this.getDefaultConfig(), config as Record<string, unknown>);
  }

  private deepMergeConfig<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = this.deepMergeConfig(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
    return result;
  }

  private validate(config: AppConfig): void {
    if (!this.schema) return;

    const errors: string[] = [];
    this.validateObject(config as Record<string, unknown>, this.schema, '', errors);

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  private validateObject(
    obj: Record<string, unknown>,
    schema: ConfigSchema,
    prefix: string,
    errors: string[]
  ): void {
    if (schema.required) {
      for (const requiredKey of schema.required) {
        if (!(requiredKey in obj)) {
          errors.push(`${prefix}${requiredKey} is required`);
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      const propSchema = schema.properties?.[key];
      if (!propSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`${prefix}${key} is not allowed`);
        }
        continue;
      }

      const fullKey = prefix ? `${prefix}.${key}` : key;
      this.validateValue(value, propSchema, fullKey, errors);
    }
  }

  private validateValue(
    value: unknown,
    schema: ConfigProperty,
    key: string,
    errors: string[]
  ): void {
    if (value === null || value === undefined) {
      return;
    }

    const type = Array.isArray(value) ? 'array' : typeof value;
    if (type !== schema.type) {
      errors.push(`${key}: expected ${schema.type}, got ${type}`);
      return;
    }

    if (schema.type === 'string') {
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${key}: value must be one of ${schema.enum.join(', ')}`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value as string)) {
        errors.push(`${key}: value does not match pattern ${schema.pattern}`);
      }
      if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
        errors.push(`${key}: invalid email format`);
      }
    }

    if (schema.type === 'number') {
      if (schema.minimum !== undefined && (value as number) < schema.minimum) {
        errors.push(`${key}: value must be >= ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && (value as number) > schema.maximum) {
        errors.push(`${key}: value must be <= ${schema.maximum}`);
      }
    }

    if (schema.type === 'array' && schema.items) {
      for (let i = 0; i < (value as unknown[]).length; i++) {
        this.validateValue((value as unknown[])[i], schema.items, `${key}[${i}]`, errors);
      }
    }

    if (schema.type === 'object' && schema.properties) {
      this.validateObject(value as Record<string, unknown>, {
        type: 'object',
        properties: schema.properties,
        required: Object.keys(schema.properties).filter(k => schema.properties![k].default === undefined),
      }, key, errors);
    }
  }

  private startWatching(): void {
    for (const source of this.sources) {
      if (source.watch) {
        const unwatch = source.watch((newConfig) => {
          this.handleConfigChange(source.name, newConfig);
        });
        this.watchers.push(unwatch);
      }
    }
  }

  private handleConfigChange(sourceName: string, newConfig: Record<string, unknown>): void {
    const oldConfig = { ...this.currentConfig };
    const merged = { ...oldConfig };
    this.deepMerge(merged, newConfig);
    this.currentConfig = merged as AppConfig;

    const changes = this.detectChanges(oldConfig as Record<string, unknown>, this.currentConfig as Record<string, unknown>);
    for (const change of changes) {
      this.emit('change', {
        ...change,
        source: sourceName,
        timestamp: new Date(),
      });
    }
  }

  private detectChanges(oldObj: Record<string, unknown>, newObj: Record<string, unknown>, prefix = ''): ConfigChangeEvent[] {
    const changes: ConfigChangeEvent[] = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const oldValue = oldObj[key];
      const newValue = newObj[key];

      if (oldValue === undefined && newValue !== undefined) {
        changes.push({ key: fullKey, oldValue: undefined, newValue, source: '', timestamp: new Date() });
      } else if (oldValue !== undefined && newValue === undefined) {
        changes.push({ key: fullKey, oldValue, newValue: undefined, source: '', timestamp: new Date() });
      } else if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue && newValue) {
        changes.push(...this.detectChanges(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, fullKey));
      } else if (oldValue !== newValue) {
        changes.push({ key: fullKey, oldValue, newValue, source: '', timestamp: new Date() });
      }
    }

    return changes;
  }

  onChange(listener: ConfigChangeListener): () => void {
    this.on('change', listener);
    return () => this.off('change', listener);
  }

  getConfig(): AppConfig {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.currentConfig;
  }

  get<T>(key: string): T {
    const keys = key.split('.');
    let value: unknown = this.getConfig();

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        throw new Error(`Config key not found: ${key}`);
      }
    }

    return value as T;
  }

  async reload(): Promise<AppConfig> {
    return this.load();
  }

  stopWatching(): void {
    for (const unwatch of this.watchers) {
      unwatch();
    }
    this.watchers = [];
  }

  async destroy(): Promise<void> {
    this.stopWatching();
    this.removeAllListeners();
  }
}

export function createFileSource(filePath: string, priority = 0): ConfigSource {
  const ext = path.extname(filePath).toLowerCase();

  const parse = (content: string): Record<string, unknown> => {
    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        return parseYaml(content);
      case '.toml':
        return parseToml(content);
      default:
        throw new Error(`Unsupported config file format: ${ext}`);
    }
  };

  return {
    name: `file:${filePath}`,
    priority,
    load() {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return parse(content);
    },
    watch(callback) {
      if (!fs.existsSync(filePath)) return () => {};

      let lastConfig = {};
      const watcher = fs.watch(filePath, () => {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const config = parse(content);
          if (JSON.stringify(config) !== JSON.stringify(lastConfig)) {
            lastConfig = config;
            callback(config);
          }
        } catch {
          // Ignore parse errors during watch
        }
      });

      return () => watcher.close();
    },
  };
}

export function createEnvSource(prefix = '', priority = 100): ConfigSource {
  return {
    name: 'env',
    priority,
    load() {
      const config: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix) && value !== undefined) {
          const configKey = key.slice(prefix.length).toLowerCase().replace(/_/g, '.');
          setNestedValue(config, configKey, value);
        }
      }

      return config;
    },
  };
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: string): void {
  const parts = key.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = parseEnvValue(value);
}

function parseEnvValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}