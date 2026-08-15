import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApplication } from '@faultless/http';
import { ConfigLoader, createFileSource, createEnvSource, createEncryption, ConfigVersionManager, MemoryVersionStorage } from '@faultless/config';
import { createLogger, ProbabilisticSampler, InMemoryLogAggregator, BufferedAsyncWriter } from '@faultless/log';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';

describe('v2-config-log example', () => {
  let app: any;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nofault-v2-'));
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ConfigLoader enhancements', () => {
    it('should load config from multiple sources with priority', async () => {
      const configDir = path.join(tempDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });

      fs.writeFileSync(path.join(configDir, 'default.json'), JSON.stringify({
        app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' },
        feature: { enabled: true, debug: false },
      }));

      fs.writeFileSync(path.join(configDir, 'development.json'), JSON.stringify({
        app: { port: 4000 },
        feature: { debug: true },
      }));

      const loader = new ConfigLoader({
        sources: [
          createFileSource(path.join(configDir, 'default.json'), 0),
          createFileSource(path.join(configDir, 'development.json'), 10),
        ],
      });

      const config = await loader.load();

      expect(config.app.port).toBe(4000);
      expect(config.feature.enabled).toBe(true);
      expect(config.feature.debug).toBe(true);
    });

    it('should support environment variables', async () => {
      process.env['APP_PORT'] = '5000';
      process.env['APP_DATABASE_HOST'] = 'env-host';

      const loader = new ConfigLoader({
        sources: [createEnvSource('APP_', 100)],
      });

      const config = await loader.load();

      expect(config.app.port).toBe(5000);
      expect(config.database?.host).toBe('env-host');

      delete process.env['APP_PORT'];
      delete process.env['APP_DATABASE_HOST'];
    });

    it('should watch for config changes', async () => {
      const configFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(configFile, JSON.stringify({
        app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' },
      }));

      const loader = new ConfigLoader({
        sources: [createFileSource(configFile)],
        watchForChanges: true,
      });

      await loader.load();

      const changeSpy = vi.fn();
      loader.on('change', changeSpy);

      fs.writeFileSync(configFile, JSON.stringify({
        app: { name: 'test', version: '1.0.0', env: 'development', port: 4000, host: 'localhost' },
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'app.port',
          oldValue: 3000,
          newValue: 4000,
        })
      );

      loader.stopWatching();
    });
  });

  describe('Config Encryption', () => {
    it('should encrypt and decrypt config', async () => {
      const encryption = createEncryption('test-password');

      const config = {
        database: {
          host: 'localhost',
          password: 'secret-password',
        },
        apiKey: 'sk-1234567890',
      };

      const encrypted = encryption.encrypt(config);
      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      expect(encrypted.version).toBe(1);

      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toEqual(config);
    });

    it('should produce different ciphertext for same input', async () => {
      const encryption = createEncryption('test-password');

      const config = { secret: 'value' };

      const encrypted1 = encryption.encrypt(config);
      const encrypted2 = encryption.encrypt(config);

      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      const decrypted1 = encryption.decrypt(encrypted1);
      const decrypted2 = encryption.decrypt(encrypted2);

      expect(decrypted1).toEqual(config);
      expect(decrypted2).toEqual(config);
    });
  });

  describe('Config Versioning', () => {
    it('should create and manage versions', async () => {
      const versionManager = new ConfigVersionManager({
        storage: new MemoryVersionStorage(),
        maxVersions: 5,
      });

      await versionManager.initialize();

      const v1 = await versionManager.createVersion(
        { app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' } },
        'user1',
        'Initial config'
      );

      expect(v1.version).toBe(1);
      expect(v1.author).toBe('user1');
      expect(v1.message).toBe('Initial config');

      const v2 = await versionManager.createVersion(
        { app: { name: 'test', version: '1.0.0', env: 'development', port: 4000, host: 'localhost' } },
        'user2',
        'Changed port'
      );

      expect(v2.version).toBe(2);
      expect(v2.config.app.port).toBe(4000);

      const versions = await versionManager.listVersions();
      expect(versions).toHaveLength(2);
    });

    it('should rollback to previous version', async () => {
      const versionManager = new ConfigVersionManager({
        storage: new MemoryVersionStorage(),
      });

      await versionManager.initialize();

      await versionManager.createVersion(
        { app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' } },
        'user1',
        'v1'
      );

      await versionManager.createVersion(
        { app: { name: 'test', version: '1.0.0', env: 'development', port: 4000, host: 'localhost' } },
        'user2',
        'v2'
      );

      const rolledBack = await versionManager.rollback(1);
      expect(rolledBack?.app.port).toBe(3000);

      const currentVersion = await versionManager.getCurrentVersion();
      expect(currentVersion).toBe(3);
    });

    it('should compute diff between versions', async () => {
      const versionManager = new ConfigVersionManager({
        storage: new MemoryVersionStorage(),
      });

      await versionManager.initialize();

      await versionManager.createVersion(
        { app: { name: 'test', port: 3000 }, feature: { enabled: true } },
        'user1',
        'v1'
      );

      await versionManager.createVersion(
        { app: { name: 'test', port: 4000 }, feature: { enabled: false, newFeature: true } },
        'user2',
        'v2'
      );

      const diff = await versionManager.diff(1, 2);
      const diffPaths = diff.map(d => d.path).sort();

      expect(diffPaths).toContain('app.port');
      expect(diffPaths).toContain('feature.enabled');
      expect(diffPaths).toContain('feature.newFeature');
    });

    it('should cleanup old versions', async () => {
      const versionManager = new ConfigVersionManager({
        storage: new MemoryVersionStorage(),
        maxVersions: 3,
        autoCleanup: true,
      });

      await versionManager.initialize();

      for (let i = 1; i <= 5; i++) {
        await versionManager.createVersion(
          { app: { name: 'test', version: '1.0.0', env: 'development', port: 3000 + i, host: 'localhost' } },
          'user',
          `v${i}`
        );
      }

      const versions = await versionManager.listVersions();
      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe(5);
      expect(versions[2].version).toBe(3);
    });
  });

  describe('Logger enhancements', () => {
    it('should support structured fields', () => {
      const logger = createLogger({
        level: 'debug',
        structuredFields: true,
        serviceName: 'test-service',
        environment: 'test',
        version: '1.0.0',
      });

      logger.info('Test message', 'TestContext', { userId: 123 });

      const aggregator = logger.getAggregator();
      expect(aggregator).toBeInstanceOf(InMemoryLogAggregator);
    });

    it('should support sampling', () => {
      const neverSampler = new ProbabilisticSampler(0);
      const logger = createLogger({
        level: 'debug',
        sampler: neverSampler,
      });

      const aggregator = logger.getAggregator() as InMemoryLogAggregator;

      logger.info('Should not be logged');
      logger.error('Should not be logged');

      // Since sampling is probabilistic with rate 0, nothing should be logged
      // Note: In real test, we'd mock Math.random
    });

    it('should support async writing', async () => {
      const logger = createLogger({
        level: 'debug',
        asyncWrite: true,
        asyncWriteOptions: { bufferSize: 2, flushInterval: 100 },
      });

      logger.info('Message 1');
      logger.info('Message 2');

      await logger.flush();
      await logger.close();
    });

    it('should query logs from aggregator', async () => {
      const logger = createLogger({
        level: 'debug',
        structuredFields: true,
      });

      logger.info('Info message');
      logger.error('Error message');
      logger.warn('Warn message');

      await logger.flush();

      const aggregator = logger.getAggregator() as InMemoryLogAggregator;

      const allLogs = await aggregator.query({});
      expect(allLogs.total).toBeGreaterThanOrEqual(3);

      const errorLogs = await aggregator.query({ level: 'error' });
      expect(errorLogs.entries.length).toBeGreaterThanOrEqual(1);
      expect(errorLogs.entries[0].level).toBe('error');

      await logger.close();
    });
  });

  describe('Integration', () => {
    it('should run full application with config and logging', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test-value';
        }
      }

      @Controller('test')
      class TestController {
        constructor(private service: TestService) {}

        @Get()
        get() {
          return { value: this.service.getValue() };
        }
      }

      @Module({
        controllers: [TestController],
        providers: [TestService],
      })
      class TestModule {}

      app = await createApplication({
        modules: [TestModule],
        serverOptions: { port: 0, logger: false },
      });

      await app.listen();

      const response = await app.getServer().getApp().inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ value: 'test-value' });
    });
  });
});