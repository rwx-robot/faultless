import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader, createFileSource, createEnvSource } from '../src/loader';
import { defaultConfigSchema } from '../src/schema';

describe('ConfigLoader', () => {
  let tempDir: string;
  let configFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nofault-config-'));
    configFile = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load config from file', async () => {
    fs.writeFileSync(configFile, JSON.stringify({
      app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' },
      database: { host: 'localhost', port: 5432 },
    }));

    const loader = new ConfigLoader({
      sources: [createFileSource(configFile)],
    });

    const config = await loader.load();

    expect(config.app.name).toBe('test');
    expect(config.app.port).toBe(3000);
    expect(config.database?.host).toBe('localhost');
  });

  it('should merge multiple sources with priority', async () => {
    const file1 = path.join(tempDir, 'config1.json');
    const file2 = path.join(tempDir, 'config2.json');

    fs.writeFileSync(file1, JSON.stringify({ app: { port: 3000 }, feature: { enabled: true } }));
    fs.writeFileSync(file2, JSON.stringify({ app: { port: 4000 }, feature: { debug: true } }));

    const loader = new ConfigLoader({
      sources: [
        createFileSource(file1, 10),
        createFileSource(file2, 20),
      ],
    });

    const config = await loader.load();

    expect(config.app.port).toBe(4000);
    expect(config.feature.enabled).toBe(true);
    expect(config.feature.debug).toBe(true);
  });

  it('should apply defaults', async () => {
    const loader = new ConfigLoader({
      sources: [],
    });

    const config = await loader.load();

    expect(config.app.name).toBe('nofault-app');
    expect(config.app.env).toBe('development');
    expect(config.app.port).toBe(3000);
  });

  it('should validate against schema', async () => {
    fs.writeFileSync(configFile, JSON.stringify({
      app: { name: 'test', version: '1.0.0', env: 'invalid', port: 3000, host: 'localhost' },
    }));

    const loader = new ConfigLoader({
      sources: [createFileSource(configFile)],
      schema: defaultConfigSchema,
      validateOnLoad: true,
    });

    await expect(loader.load()).rejects.toThrow('Configuration validation failed');
  });

  it('should skip validation when disabled', async () => {
    fs.writeFileSync(configFile, JSON.stringify({
      app: { name: 'test', version: '1.0.0', env: 'invalid', port: 3000, host: 'localhost' },
    }));

    const loader = new ConfigLoader({
      sources: [createFileSource(configFile)],
      schema: defaultConfigSchema,
      validateOnLoad: false,
    });

    const config = await loader.load();
    expect(config.app.env).toBe('invalid');
  });

  it('should get nested config values', async () => {
    fs.writeFileSync(configFile, JSON.stringify({
      app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' },
      database: { host: 'localhost', port: 5432 },
    }));

    const loader = new ConfigLoader({
      sources: [createFileSource(configFile)],
    });

    await loader.load();

    expect(loader.get('app.name')).toBe('test');
    expect(loader.get('database.port')).toBe(5432);
  });

  it('should throw for missing key', async () => {
    const loader = new ConfigLoader({ sources: [] });
    await loader.load();

    expect(() => loader.get('missing.key')).toThrow('Config key not found');
  });

  it('should emit loaded event', async () => {
    fs.writeFileSync(configFile, JSON.stringify({
      app: { name: 'test', version: '1.0.0', env: 'development', port: 3000, host: 'localhost' },
    }));

    const loader = new ConfigLoader({
      sources: [createFileSource(configFile)],
    });

    const loadedSpy = vi.fn();
    loader.on('loaded', loadedSpy);

    await loader.load();

    expect(loadedSpy).toHaveBeenCalled();
  });

  it('should detect config changes when watching', async () => {
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

  it('should load env vars', async () => {
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

  it('should parse env values correctly', async () => {
    process.env['APP_DEBUG'] = 'true';
    process.env['APP_COUNT'] = '42';
    process.env['APP_RATIO'] = '3.14';
    process.env['APP_TAGS'] = '["a","b"]';
    process.env['APP_NULL'] = 'null';

    const loader = new ConfigLoader({
      sources: [createEnvSource('APP_', 100)],
    });

    const config = await loader.load();

    expect(config.app.debug).toBe(true);
    expect(config.app.count).toBe(42);
    expect(config.app.ratio).toBe(3.14);
    expect(config.app.tags).toEqual(['a', 'b']);
    expect(config.app.null).toBeNull();

    delete process.env['APP_DEBUG'];
    delete process.env['APP_COUNT'];
    delete process.env['APP_RATIO'];
    delete process.env['APP_TAGS'];
    delete process.env['APP_NULL'];
  });
});