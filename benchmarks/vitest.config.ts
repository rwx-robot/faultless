import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const packagesDir = resolve(__dirname, '..', 'packages');

const packageAliases: Record<string, string> = {
  '@faultless/core': resolve(packagesDir, 'core/src/index.ts'),
  '@faultless/http': resolve(packagesDir, 'http/src/index.ts'),
  '@faultless/config': resolve(packagesDir, 'config/src/index.ts'),
  '@faultless/log': resolve(packagesDir, 'log/src/index.ts'),
  '@faultless/syncx': resolve(packagesDir, 'syncx/src/index.ts'),
  '@faultless/concurrency': resolve(packagesDir, 'concurrency/src/index.ts'),
  '@faultless/collection': resolve(packagesDir, 'collection/src/index.ts'),
  '@faultless/breaker': resolve(packagesDir, 'breaker/src/index.ts'),
  '@faultless/limit': resolve(packagesDir, 'limit/src/index.ts'),
  '@faultless/cache': resolve(packagesDir, 'cache/src/index.ts'),
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

export default defineConfig({
  esbuild: false,
  plugins: [esbuildDecoratorsFix()],
  resolve: {
    alias: packageAliases,
  },
  test: {
    benchmark: {
      reporters: ['default'],
    },
  },
});
