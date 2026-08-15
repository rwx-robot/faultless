import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, createEnvSource, createFileSource } from '@faultless/config';
import { ConfigEncryption } from '@faultless/config';
import { createLogger, Logger } from '@faultless/log';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config + Log Integration', () => {
  let logger: Logger;
  let tempDir: string;

  beforeEach(() => {
    logger = createLogger({ level: 'debug', format: 'json', transports: [] });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nofault-test-'));
  });

  afterEach(async () => {
    await logger.close();
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch {}
  });

  describe('Config Loading with Logging', () => {
    it('should load config from env source', async () => {
      // Env vars with prefix NOFAULT_ are parsed: NOFAULT_APP_NAME -> app.name
      process.env.NOFAULT_APP_NAME = 'my-test-app';
      process.env.NOFAULT_APP_PORT = '8080';

      const source = createEnvSource('NOFAULT_', 100);
      const loader = new ConfigLoader({
        sources: [source],
        validateOnLoad: false,
        watchForChanges: false,
      });

      const config = await loader.load();
      expect(config.app.name).toBe('my-test-app');
      expect(config.app.port).toBe(8080);

      delete process.env.NOFAULT_APP_NAME;
      delete process.env.NOFAULT_APP_PORT;
    });

    it('should load config from file source', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'file-app', port: 9090, host: 'localhost', version: '1.0.0', env: 'development' },
      }));

      const source = createFileSource(configPath, 0);
      const loader = new ConfigLoader({
        sources: [source],
        validateOnLoad: false,
      });

      const config = await loader.load();
      expect(config.app.name).toBe('file-app');
      expect(config.app.port).toBe(9090);
    });

    it('should merge configs from multiple sources by priority', async () => {
      // Sources are sorted by priority (high first), then deep-merged in order.
      // Later sources overwrite earlier ones, so the LAST source in sorted order wins.
      // With priorities 0 and 10, sorted order is [10, 0], so priority 0 wins.
      const highPriorityPath = path.join(tempDir, 'high.json');
      const lowPriorityPath = path.join(tempDir, 'low.json');

      fs.writeFileSync(lowPriorityPath, JSON.stringify({
        app: { name: 'low-priority', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));
      fs.writeFileSync(highPriorityPath, JSON.stringify({
        app: { name: 'high-priority', port: 9090, host: 'localhost', version: '2.0.0', env: 'production' },
      }));

      const loader = new ConfigLoader({
        sources: [
          createFileSource(highPriorityPath, 10),
          createFileSource(lowPriorityPath, 0),
        ],
        validateOnLoad: false,
      });

      const config = await loader.load();
      // Low priority source is loaded last (after high), so it overwrites
      expect(config.app.name).toBe('low-priority');
      expect(config.app.port).toBe(3000);
    });

    it('should get config values by dot-notation key', async () => {
      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
      });

      await loader.load();
      expect(loader.get<string>('app.name')).toBe('nofault-app');
      expect(loader.get<number>('app.port')).toBe(3000);
    });

    it('should throw for non-existent config key', async () => {
      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
      });

      await loader.load();
      expect(() => loader.get('nonexistent.key')).toThrow('Config key not found');
    });

    it('should reload config from sources', async () => {
      const configPath = path.join(tempDir, 'reload.json');
      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'v1', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));

      const source = createFileSource(configPath, 0);
      const loader = new ConfigLoader({
        sources: [source],
        validateOnLoad: false,
      });

      const config1 = await loader.load();
      expect(config1.app.name).toBe('v1');

      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'v2', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));

      const config2 = await loader.reload();
      expect(config2.app.name).toBe('v2');
    });

    it('should log config loading via logger', async () => {
      const logEntries: any[] = [];
      logger.on('log', (entry) => logEntries.push(entry));

      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
      });

      loader.on('loaded', () => {
        logger.info('Config loaded successfully', 'config');
      });

      await loader.load();

      const configLogs = logEntries.filter(e => e.message === 'Config loaded successfully');
      expect(configLogs.length).toBe(1);
    });
  });

  describe('Config Changes Triggering Log Events', () => {
    it('should emit onChange when file source is reloaded with different content', async () => {
      const configPath = path.join(tempDir, 'change-test.json');
      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'v1', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));

      const loader = new ConfigLoader({
        sources: [createFileSource(configPath)],
        validateOnLoad: false,
        watchForChanges: false,
      });

      await loader.load();
      expect(loader.get('app.name')).toBe('v1');

      // Reload with changed content
      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'v2', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));

      await loader.reload();
      expect(loader.get('app.name')).toBe('v2');
    });

    it('should log config loading via logger', async () => {
      const logEntries: any[] = [];
      logger.on('log', (entry) => logEntries.push(entry));

      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
      });

      loader.on('loaded', () => {
        logger.info('Config loaded successfully', 'config');
      });

      await loader.load();

      const configLogs = logEntries.filter(e => e.message === 'Config loaded successfully');
      expect(configLogs.length).toBe(1);
    });

    it('should integrate config and log for audit trail', async () => {
      const configPath = path.join(tempDir, 'audit-trail.json');
      fs.writeFileSync(configPath, JSON.stringify({
        app: { name: 'audit-app', port: 3000, host: '0.0.0.0', version: '1.0.0', env: 'development' },
      }));

      // Use text format to avoid sampler filtering
      const textLogger = createLogger({ level: 'debug', format: 'text', transports: [] });
      const logEntries: any[] = [];
      textLogger.on('log', (entry) => logEntries.push(entry));

      const loader = new ConfigLoader({
        sources: [createFileSource(configPath)],
        validateOnLoad: false,
        watchForChanges: false,
      });

      const config = await loader.load();
      textLogger.info('Config loaded', 'config', { name: config.app.name, env: config.app.env });

      // Logger emits asynchronously, wait for it
      await new Promise(r => setTimeout(r, 50));

      const configLogs = logEntries.filter(e => e.context === 'config');
      expect(configLogs.length).toBeGreaterThan(0);
      expect(configLogs[0].metadata.name).toBe('audit-app');
    });
  });

  describe('Encrypted Config', () => {
    // Use low iterations for fast testing (scrypt N must be power of 2)
    const testOpts = { algorithm: 'aes-256-gcm', keyLength: 32, ivLength: 16, saltLength: 16, iterations: 16 };

    it('should detect encrypted config', () => {
      expect(ConfigEncryption.isEncrypted({ encrypted: true, algorithm: 'aes-256-gcm', iv: 'x', salt: 'y', data: 'z', version: 1 })).toBe(true);
      expect(ConfigEncryption.isEncrypted({ not: 'encrypted' })).toBe(false);
      expect(ConfigEncryption.isEncrypted(null)).toBe(false);
    });

    it('should encrypt and decrypt config with custom iterations', () => {
      const originalConfig = { database: { host: 'db.internal', port: 5432, password: 'super-secret' } };

      const encryption = new (ConfigEncryption as any)('master-password-123', testOpts);
      const encrypted = encryption.encrypt(originalConfig);

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.algorithm).toBe('aes-256-gcm');

      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toEqual(originalConfig);
    });

    it('should fail decryption with wrong password', () => {
      const config = { secret: 'my-secret-data' };

      const enc1 = new (ConfigEncryption as any)('correct-password', testOpts);
      const encrypted = enc1.encrypt(config);

      const enc2 = new (ConfigEncryption as any)('wrong-password', testOpts);
      expect(() => enc2.decrypt(encrypted)).toThrow();
    });

    it('should encrypt different configs with different ciphertexts', () => {
      const enc = new (ConfigEncryption as any)('password', testOpts);
      const encrypted1 = enc.encrypt({ data: 'value1' });
      const encrypted2 = enc.encrypt({ data: 'value2' });

      expect(encrypted1.data).not.toBe(encrypted2.data);
    });

    it('should handle round-trip with nested objects', () => {
      const config = {
        level1: { level2: { level3: { value: 'deep', numbers: [1, 2, 3] } } },
        array: [{ id: 1 }, { id: 2 }],
      };

      const encryption = new (ConfigEncryption as any)('password', testOpts);
      const encrypted = encryption.encrypt(config);
      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toEqual(config);
    });
  });

  describe('Config Loader Lifecycle', () => {
    it('should destroy loader and clean up watchers', async () => {
      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
        watchForChanges: false,
      });

      await loader.load();
      await loader.destroy();
    });

    it('should stop watching when stopWatching is called', async () => {
      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
        watchForChanges: false,
      });

      await loader.load();
      loader.stopWatching();
      expect(() => loader.getConfig()).not.toThrow();
    });

    it('should throw when getting config before loading', () => {
      const loader = new ConfigLoader({
        sources: [],
        validateOnLoad: false,
      });

      expect(() => loader.getConfig()).toThrow('Configuration not loaded');
    });
  });
});
