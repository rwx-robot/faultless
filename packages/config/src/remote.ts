import { EventEmitter } from 'events';
import { ConfigSource, ConfigChangeEvent, AppConfig } from './config';

export interface RemoteConfigOptions {
  type: 'etcd' | 'consul' | 'nacos' | 'apollo' | 'custom';
  endpoints: string[];
  namespace?: string;
  group?: string;
  dataId?: string;
  timeout?: number;
  username?: string;
  password?: string;
  tls?: {
    cert: string;
    key: string;
    ca?: string;
  };
  customFetcher?: (key: string) => Promise<string | null>;
  customWatcher?: (key: string, callback: (value: string | null) => void) => Promise<() => void>;
}

export interface RemoteConfigClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConfig(key: string): Promise<string | null>;
  watchConfig(key: string, callback: (value: string | null) => void): Promise<() => void>;
  listKeys(prefix: string): Promise<string[]>;
}

export class EtcdConfigClient implements RemoteConfigClient {
  private client: any;
  private options: RemoteConfigOptions;
  private watchers: Map<string, () => void> = new Map();

  constructor(options: RemoteConfigOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    try {
      const { Etcd3 } = await import('etcd3');
      this.client = new Etcd3({
        hosts: this.options.endpoints,
        auth: this.options.username ? { username: this.options.username, password: this.options.password } : undefined,
        tls: this.options.tls,
      });
    } catch {
      throw new Error('etcd3 package not installed. Run: pnpm add etcd3');
    }
  }

  async disconnect(): Promise<void> {
    for (const unwatch of this.watchers.values()) {
      unwatch();
    }
    this.watchers.clear();
    if (this.client) {
      await this.client.close();
    }
  }

  async getConfig(key: string): Promise<string | null> {
    if (!this.client) await this.connect();
    try {
      const value = await this.client.get(key).string();
      return value ?? null;
    } catch {
      return null;
    }
  }

  async watchConfig(key: string, callback: (value: string | null) => void): Promise<() => void> {
    if (!this.client) await this.connect();

    const watcher = this.client.watch().key(key).create();
    watcher.on('put', (event: any) => {
      callback(event.kv?.value?.toString() ?? null);
    });
    watcher.on('delete', () => {
      callback(null);
    });

    const unwatch = () => watcher.cancel();
    this.watchers.set(key, unwatch);
    return unwatch;
  }

  async listKeys(prefix: string): Promise<string[]> {
    if (!this.client) await this.connect();
    const range = await this.client.getAll().prefix(prefix).keys();
    return range.map((k: any) => k.toString());
  }
}

export class ConsulConfigClient implements RemoteConfigClient {
  private client: any;
  private options: RemoteConfigOptions;

  constructor(options: RemoteConfigOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    try {
      const consul = await import('consul');
      this.client = consul({
        host: this.options.endpoints[0]?.split(':')[0] ?? 'localhost',
        port: parseInt(this.options.endpoints[0]?.split(':')[1] ?? '8500', 10),
        secure: !!this.options.tls,
        defaults: {
          token: this.options.password,
        },
      });
    } catch {
      throw new Error('consul package not installed. Run: pnpm add consul');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  async getConfig(key: string): Promise<string | null> {
    if (!this.client) await this.connect();
    try {
      const value = await this.client.kv.get(key);
      return value?.Value ? Buffer.from(value.Value, 'base64').toString() : null;
    } catch {
      return null;
    }
  }

  async watchConfig(key: string, callback: (value: string | null) => void): Promise<() => void> {
    if (!this.client) await this.connect();

    let index = 0;
    const poll = async () => {
      try {
        const value = await this.client.kv.get(key, { index, wait: '60s' });
        if (value && value.Value) {
          index = value.Index;
          callback(Buffer.from(value.Value, 'base64').toString());
        } else {
          callback(null);
        }
      } catch {
        callback(null);
      }
      setTimeout(poll, 1000);
    };
    poll();

    return () => {};
  }

  async listKeys(prefix: string): Promise<string[]> {
    if (!this.client) await this.connect();
    try {
      const keys = await this.client.kv.keys(prefix);
      return keys ?? [];
    } catch {
      return [];
    }
  }
}

export class CustomConfigClient implements RemoteConfigClient {
  private fetcher: (key: string) => Promise<string | null>;
  private watcher?: (key: string, callback: (value: string | null) => void) => Promise<() => void>;

  constructor(
    fetcher: (key: string) => Promise<string | null>,
    watcher?: (key: string, callback: (value: string | null) => void) => Promise<() => void>
  ) {
    this.fetcher = fetcher;
    this.watcher = watcher;
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async getConfig(key: string): Promise<string | null> {
    return this.fetcher(key);
  }

  async watchConfig(key: string, callback: (value: string | null) => void): Promise<() => void> {
    if (this.watcher) {
      return this.watcher(key, callback);
    }
    return () => {};
  }

  async listKeys(_prefix: string): Promise<string[]> {
    return [];
  }
}

export function createRemoteConfigClient(options: RemoteConfigOptions): RemoteConfigClient {
  switch (options.type) {
    case 'etcd':
      return new EtcdConfigClient(options);
    case 'consul':
      return new ConsulConfigClient(options);
    case 'custom':
      return new CustomConfigClient(
        options.customFetcher!,
        options.customWatcher
      );
    default:
      throw new Error(`Unsupported remote config type: ${options.type}`);
  }
}

export class RemoteConfigSource extends EventEmitter implements ConfigSource {
  public readonly name: string;
  public readonly priority: number;
  private client: RemoteConfigClient;
  private prefix: string;
  private connected = false;

  constructor(name: string, priority: number, client: RemoteConfigClient, prefix = '') {
    super();
    this.name = name;
    this.priority = priority;
    this.client = client;
    this.prefix = prefix;
  }

  async load(): Promise<Record<string, unknown>> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }

    const keys = await this.client.listKeys(this.prefix);
    const config: Record<string, unknown> = {};

    for (const key of keys) {
      const value = await this.client.getConfig(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          const relativeKey = key.replace(this.prefix, '').replace(/^\//, '');
          this.setNestedValue(config, relativeKey, parsed);
        } catch {
          const relativeKey = key.replace(this.prefix, '').replace(/^\//, '');
          this.setNestedValue(config, relativeKey, value);
        }
      }
    }

    return config;
  }

  watch(callback: (config: Record<string, unknown>) => void): () => void {
    const unwatchers: (() => void)[] = [];

    const loadAndNotify = async () => {
      const config = await this.load();
      callback(config);
    };

    this.client.listKeys(this.prefix).then(keys => {
      for (const key of keys) {
        this.client.watchConfig(key, async () => {
          await loadAndNotify();
        }).then(unwatch => unwatchers.push(unwatch));
      }
    });

    return () => {
      for (const unwatch of unwatchers) {
        unwatch();
      }
    };
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const parts = key.split('/');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.connected = false;
  }
}

export function createRemoteConfigSource(
  name: string,
  priority: number,
  options: RemoteConfigOptions,
  prefix = ''
): RemoteConfigSource {
  const client = createRemoteConfigClient(options);
  return new RemoteConfigSource(name, priority, client, prefix);
}