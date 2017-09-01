import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { AppConfig } from './config';

export interface ConfigVersion {
  version: number;
  config: AppConfig;
  timestamp: Date;
  author?: string;
  message?: string;
  hash: string;
}

export interface VersionStorage {
  save(version: ConfigVersion): Promise<void>;
  load(version: number): Promise<ConfigVersion | null>;
  list(): Promise<ConfigVersion[]>;
  delete(version: number): Promise<void>;
  getLatest(): Promise<ConfigVersion | null>;
}

export class MemoryVersionStorage implements VersionStorage {
  private versions: Map<number, ConfigVersion> = new Map();
  private currentVersion = 0;

  async save(version: ConfigVersion): Promise<void> {
    this.versions.set(version.version, version);
    if (version.version > this.currentVersion) {
      this.currentVersion = version.version;
    }
  }

  async load(version: number): Promise<ConfigVersion | null> {
    return this.versions.get(version) ?? null;
  }

  async list(): Promise<ConfigVersion[]> {
    return Array.from(this.versions.values()).sort((a, b) => b.version - a.version);
  }

  async delete(version: number): Promise<void> {
    this.versions.delete(version);
  }

  async getLatest(): Promise<ConfigVersion | null> {
    if (this.currentVersion === 0) return null;
    return this.versions.get(this.currentVersion) ?? null;
  }

  getNextVersion(): number {
    return this.currentVersion + 1;
  }
}

export class FileVersionStorage implements VersionStorage {
  private filePath: string;
  private cache: Map<number, ConfigVersion> = new Map();
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      for (const v of data.versions || []) {
        this.cache.set(v.version, { ...v, timestamp: new Date(v.timestamp) });
      }
      this.loaded = true;
    } catch {
      this.loaded = true;
    }
  }

  private async persist(): Promise<void> {
    const fs = await import('fs/promises');
    const versions = Array.from(this.cache.values());
    await fs.writeFile(this.filePath, JSON.stringify({ versions }, null, 2), 'utf-8');
  }

  async save(version: ConfigVersion): Promise<void> {
    await this.ensureLoaded();
    this.cache.set(version.version, version);
    await this.persist();
  }

  async load(version: number): Promise<ConfigVersion | null> {
    await this.ensureLoaded();
    return this.cache.get(version) ?? null;
  }

  async list(): Promise<ConfigVersion[]> {
    await this.ensureLoaded();
    return Array.from(this.cache.values()).sort((a, b) => b.version - a.version);
  }

  async delete(version: number): Promise<void> {
    await this.ensureLoaded();
    this.cache.delete(version);
    await this.persist();
  }

  async getLatest(): Promise<ConfigVersion | null> {
    await this.ensureLoaded();
    const versions = Array.from(this.cache.values());
    if (versions.length === 0) return null;
    return versions.sort((a, b) => b.version - a.version)[0];
  }
}

export interface ConfigVersionManagerOptions {
  storage: VersionStorage;
  maxVersions?: number;
  autoCleanup?: boolean;
}

export class ConfigVersionManager extends EventEmitter {
  private storage: VersionStorage;
  private maxVersions: number;
  private autoCleanup: boolean;
  private currentConfig: AppConfig | null = null;
  private currentVersion = 0;

  constructor(options: ConfigVersionManagerOptions) {
    super();
    this.storage = options.storage;
    this.maxVersions = options.maxVersions ?? 50;
    this.autoCleanup = options.autoCleanup ?? true;
  }

  async initialize(): Promise<void> {
    const latest = await this.storage.getLatest();
    if (latest) {
      this.currentVersion = latest.version;
      this.currentConfig = latest.config;
    }
  }

  async createVersion(
    config: AppConfig,
    author?: string,
    message?: string
  ): Promise<ConfigVersion> {
    const version = (await this.storage.getLatest())?.version ?? 0;
    const newVersion = version + 1;
    const hash = this.computeHash(config);

    const configVersion: ConfigVersion = {
      version: newVersion,
      config: JSON.parse(JSON.stringify(config)),
      timestamp: new Date(),
      author,
      message,
      hash,
    };

    await this.storage.save(configVersion);
    this.currentVersion = newVersion;
    this.currentConfig = config;

    if (this.autoCleanup) {
      await this.cleanup();
    }

    this.emit('versionCreated', configVersion);
    return configVersion;
  }

  async rollback(version: number): Promise<AppConfig | null> {
    const target = await this.storage.load(version);
    if (!target) {
      throw new Error(`Version ${version} not found`);
    }

    const newVersion = (await this.storage.getLatest())?.version ?? 0;
    const rollbackVersion: ConfigVersion = {
      version: newVersion + 1,
      config: JSON.parse(JSON.stringify(target.config)),
      timestamp: new Date(),
      author: 'system',
      message: `Rollback to version ${version}`,
      hash: this.computeHash(target.config),
    };

    await this.storage.save(rollbackVersion);
    this.currentVersion = rollbackVersion.version;
    this.currentConfig = rollbackVersion.config;

    this.emit('rollback', { fromVersion: this.currentVersion - 1, toVersion: version, config: target.config });
    return target.config;
  }

  async getVersion(version: number): Promise<ConfigVersion | null> {
    return this.storage.load(version);
  }

  async listVersions(): Promise<ConfigVersion[]> {
    return this.storage.list();
  }

  async getCurrentConfig(): Promise<AppConfig | null> {
    return this.currentConfig;
  }

  async getCurrentVersion(): Promise<number> {
    return this.currentVersion;
  }

  async diff(versionA: number, versionB: number): Promise<ConfigDiff[]> {
    const [configA, configB] = await Promise.all([
      this.storage.load(versionA),
      this.storage.load(versionB),
    ]);

    if (!configA || !configB) {
      throw new Error('One or both versions not found');
    }

    return this.computeDiff(configA.config as Record<string, unknown>, configB.config as Record<string, unknown>);
  }

  private async cleanup(): Promise<void> {
    const versions = await this.storage.list();
    if (versions.length > this.maxVersions) {
      const toDelete = versions.slice(this.maxVersions);
      for (const v of toDelete) {
        await this.storage.delete(v.version);
      }
    }
  }

  private computeHash(config: AppConfig): string {
    return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
  }

  private computeDiff(objA: Record<string, unknown>, objB: Record<string, unknown>, prefix = ''): ConfigDiff[] {
    const diffs: ConfigDiff[] = [];
    const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);

    for (const key of allKeys) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const valA = objA[key];
      const valB = objB[key];

      if (valA === undefined) {
        diffs.push({ path: fullKey, type: 'added', newValue: valB });
      } else if (valB === undefined) {
        diffs.push({ path: fullKey, type: 'removed', oldValue: valA });
      } else if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null && !Array.isArray(valA) && !Array.isArray(valB)) {
        diffs.push(...this.computeDiff(valA as Record<string, unknown>, valB as Record<string, unknown>, fullKey));
      } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        diffs.push({ path: fullKey, type: 'modified', oldValue: valA, newValue: valB });
      }
    }

    return diffs;
  }
}

export interface ConfigDiff {
  path: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: unknown;
  newValue?: unknown;
}

export function createVersionManager(options: ConfigVersionManagerOptions): ConfigVersionManager {
  return new ConfigVersionManager(options);
}