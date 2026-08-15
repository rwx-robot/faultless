import { defineConfig, UserConfig } from 'vitest/config';
import { resolve } from 'path';

const packagesDir = resolve(__dirname, '../packages');

const packageAliases: Record<string, string> = {
  '@faultless/core': resolve(packagesDir, 'core/src/index.ts'),
  '@faultless/http': resolve(packagesDir, 'http/src/index.ts'),
  '@faultless/config': resolve(packagesDir, 'config/src/index.ts'),
  '@faultless/log': resolve(packagesDir, 'log/src/index.ts'),
  '@faultless/validation': resolve(packagesDir, 'validation/src/index.ts'),
  '@faultless/breaker': resolve(packagesDir, 'breaker/src/index.ts'),
  '@faultless/cache': resolve(packagesDir, 'cache/src/index.ts'),
  '@faultless/store': resolve(packagesDir, 'store/src/index.ts'),
  '@faultless/discovery': resolve(packagesDir, 'discovery/src/index.ts'),
  '@faultless/tracing': resolve(packagesDir, 'tracing/src/index.ts'),
  '@faultless/metrics': resolve(packagesDir, 'metrics/src/index.ts'),
  '@faultless/limit': resolve(packagesDir, 'limit/src/index.ts'),
  '@faultless/queue': resolve(packagesDir, 'queue/src/index.ts'),
  '@faultless/auth': resolve(packagesDir, 'auth/src/index.ts'),
  '@faultless/rpc': resolve(packagesDir, 'rpc/src/index.ts'),
  '@faultless/gateway': resolve(packagesDir, 'gateway/src/index.ts'),
  '@faultless/resilience': resolve(packagesDir, 'resilience/src/index.ts'),
};

function esbuildDecoratorsFix() {
  return {
    name: 'esbuild-decorators-fix',
    async transform(code: string, id: string) {
      if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
      if (id.includes('node_modules')) return null;

      const { transform } = await import('esbuild');
      const result = await transform(code, {
        loader: 'ts',
        target: 'es2022',
        format: 'esm',
        sourcefile: id,
        tsconfigRaw: JSON.stringify({
          compilerOptions: {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            useDefineForClassFields: false,
          },
        }),
      });
      return { code: result.code, map: result.map };
    },
  };
}

export function getExampleVitestConfig(extraAliases: Record<string, string> = {}): UserConfig {
  return {
    esbuild: false,
    plugins: [esbuildDecoratorsFix()],
    resolve: {
      alias: {
        ...packageAliases,
        ...extraAliases,
      },
    },
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      globals: true,
    },
  };
}
