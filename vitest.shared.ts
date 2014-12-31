import { resolve } from 'path';
import type { InlineConfig } from 'vitest/config';

const packagesDir = resolve(__dirname, 'packages');

export function getWorkspaceAliases(): Record<string, string> {
  return {
    '@faultless/core': resolve(packagesDir, 'core/src/index.ts'),
    '@faultless/http': resolve(packagesDir, 'http/src/index.ts'),
    '@faultless/config': resolve(packagesDir, 'config/src/index.ts'),
    '@faultless/log': resolve(packagesDir, 'log/src/index.ts'),
    '@faultless/cli': resolve(packagesDir, 'cli/src/index.ts'),
    '@faultless/cache': resolve(packagesDir, 'cache/src/index.ts'),
    '@faultless/store': resolve(packagesDir, 'store/src/index.ts'),
    '@faultless/breaker': resolve(packagesDir, 'breaker/src/index.ts'),
    '@faultless/limit': resolve(packagesDir, 'limit/src/index.ts'),
    '@faultless/resilience': resolve(packagesDir, 'resilience/src/index.ts'),
    '@faultless/discovery': resolve(packagesDir, 'discovery/src/index.ts'),
    '@faultless/validation': resolve(packagesDir, 'validation/src/index.ts'),
    '@faultless/queue': resolve(packagesDir, 'queue/src/index.ts'),
    '@faultless/tracing': resolve(packagesDir, 'tracing/src/index.ts'),
    '@faultless/metrics': resolve(packagesDir, 'metrics/src/index.ts'),
    '@faultless/gateway': resolve(packagesDir, 'gateway/src/index.ts'),
    '@faultless/governance': resolve(packagesDir, 'governance/src/index.ts'),
    '@faultless/rpc': resolve(packagesDir, 'rpc/src/index.ts'),
    '@faultless/auth': resolve(packagesDir, 'auth/src/index.ts'),
    '@faultless/bloom': resolve(packagesDir, 'bloom/src/index.ts'),
    '@faultless/retry': resolve(packagesDir, 'retry/src/index.ts'),
    '@faultless/circuit-breaker': resolve(packagesDir, 'circuit-breaker/src/index.ts'),
  };
}

export function getExampleVitestConfig(): InlineConfig {
  return {
    resolve: {
      alias: getWorkspaceAliases(),
    },
  };
}
