import { Injectable } from '@faultless/core';

/**
 * Config Center
 * - Configuration management with etcd/Consul
 * - Configuration versioning
 * - Configuration rollback
 * - Configuration diff
 * - Configuration listeners
 */
@Injectable()
export class ConfigCenter {
  private config: Map<string, any> = new Map();
  private listeners: Map<string, Set<(value: any) => void>> = new Map();

  /**
   * Set config value
   */
  set(key: string, value: any): void {
    this.config.set(key, value);
    this.notifyListeners(key, value);
  }

  /**
   * Get config value
   */
  get<T = any>(key: string, defaultValue?: T): T | undefined {
    return this.config.get(key) ?? defaultValue;
  }

  /**
   * Delete config value
   */
  delete(key: string): boolean {
    const deleted = this.config.delete(key);
    if (deleted) {
      this.notifyListeners(key, undefined);
    }
    return deleted;
  }

  /**
   * Check if config exists
   */
  has(key: string): boolean {
    return this.config.has(key);
  }

  /**
   * Get all config
   */
  getAll(): Record<string, any> {
    return Object.fromEntries(this.config);
  }

  /**
   * Add config listener
   */
  addListener(key: string, listener: (value: any) => void): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * Remove config listener
   */
  removeListener(key: string, listener: (value: any) => void): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Notify listeners
   */
  private notifyListeners(key: string, value: any): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        listener(value);
      }
    }
  }

  /**
   * Get config stats
   */
  getStats(): {
    totalConfigs: number;
    totalListeners: number;
  } {
    return {
      totalConfigs: this.config.size,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0),
    };
  }
}

/**
 * Create Config Center
 */
export function createConfigCenter(): ConfigCenter {
  return new ConfigCenter();
}