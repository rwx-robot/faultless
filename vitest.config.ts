import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const packagesDir = resolve(__dirname, 'packages');

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
  '@faultless/cli': resolve(packagesDir, 'cli/src/index.ts'),
  '@faultless/governance': resolve(packagesDir, 'governance/src/index.ts'),
  '@faultless/concurrency': resolve(packagesDir, 'concurrency/src/index.ts'),
  '@faultless/bloom': resolve(packagesDir, 'bloom/src/index.ts'),
  '@faultless/retry': resolve(packagesDir, 'retry/src/index.ts'),
  '@faultless/circuit-breaker': resolve(packagesDir, 'circuit-breaker/src/index.ts'),
  '@faultless/collection': resolve(packagesDir, 'collection/src/index.ts'),
  '@faultless/fx': resolve(packagesDir, 'fx/src/index.ts'),
  '@faultless/mr': resolve(packagesDir, 'mr/src/index.ts'),
  '@faultless/stream': resolve(packagesDir, 'stream/src/index.ts'),
  '@faultless/event': resolve(packagesDir, 'event/src/index.ts'),
  '@faultless/worker': resolve(packagesDir, 'worker/src/index.ts'),
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

export default defineConfig({
  esbuild: false,
  plugins: [esbuildDecoratorsFix()],
  resolve: {
    alias: packageAliases,
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
});