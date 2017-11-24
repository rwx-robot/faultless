import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigSource, ConfigChangeEvent } from './config';

export interface WatcherOptions {
  interval?: number;
  persistent?: boolean;
}

export class ConfigWatcher extends EventEmitter {
  private source: ConfigSource;
  private options: WatcherOptions;
  private interval?: NodeJS.Timeout;
  private lastConfig: Record<string, unknown> = {};
  private running = false;

  constructor(source: ConfigSource, options: WatcherOptions = {}) {
    super();
    this.source = source;
    this.options = {
      interval: options.interval ?? 5000,
      persistent: options.persistent ?? true,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.lastConfig = this.source.load() as Record<string, unknown>;

    this.interval = setInterval(() => {
      this.check();
    }, this.options.interval);

    if (!this.options.persistent && this.interval.unref) {
      this.interval.unref();
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.running = false;
  }

  private async check(): Promise<void> {
    try {
      const currentConfig = (await this.source.load()) as Record<string, unknown>;
      const changes = this.detectChanges(this.lastConfig, currentConfig);

      if (changes.length > 0) {
        this.lastConfig = currentConfig;
        for (const change of changes) {
          this.emit('change', {
            ...change,
            source: this.source.name,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private detectChanges(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    prefix = ''
  ): ConfigChangeEvent[] {
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
      } else if (
        typeof oldValue === 'object' &&
        typeof newValue === 'object' &&
        oldValue !== null &&
        newValue !== null &&
        !Array.isArray(oldValue) &&
        !Array.isArray(newValue)
      ) {
        changes.push(
          ...this.detectChanges(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, fullKey)
        );
      } else if (oldValue !== newValue) {
        changes.push({ key: fullKey, oldValue, newValue, source: '', timestamp: new Date() });
      }
    }

    return changes;
  }

  isRunning(): boolean {
    return this.running;
  }
}

export function createFileWatcher(
  filePath: string,
  options: WatcherOptions = {}
): ConfigWatcher {
  const ext = path.extname(filePath).toLowerCase();

  const parse = (content: string): Record<string, unknown> => {
    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        const { parse: parseYaml } = require('yaml');
        return parseYaml(content);
      case '.toml':
        const { parse: parseToml } = require('toml');
        return parseToml(content);
      default:
        throw new Error(`Unsupported config file format: ${ext}`);
    }
  };

  const source: ConfigSource = {
    name: `file:${filePath}`,
    priority: 0,
    load() {
      if (!fs.existsSync(filePath)) return {};
      const content = fs.readFileSync(filePath, 'utf-8');
      return parse(content);
    },
  };

  return new ConfigWatcher(source, options);
}

export function createDirectoryWatcher(
  dirPath: string,
  options: WatcherOptions = {}
): ConfigWatcher {
  const source: ConfigSource = {
    name: `dir:${dirPath}`,
    priority: 0,
    load() {
      const config: Record<string, unknown> = {};

      if (!fs.existsSync(dirPath)) return config;

      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!['.json', '.yaml', '.yml', '.toml'].includes(ext)) continue;

        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let parsed: Record<string, unknown>;
        try {
          switch (ext) {
            case '.json':
              parsed = JSON.parse(content);
              break;
            case '.yaml':
            case '.yml':
              const { parse: parseYaml } = require('yaml');
              parsed = parseYaml(content);
              break;
            case '.toml':
              const { parse: parseToml } = require('toml');
              parsed = parseToml(content);
              break;
            default:
              continue;
          }

          const key = path.basename(file, ext);
          config[key] = parsed;
        } catch {
          // Ignore parse errors
        }
      }

      return config;
    },
  };

  return new ConfigWatcher(source, options);
}