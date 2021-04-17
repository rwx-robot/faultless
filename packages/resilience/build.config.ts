import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/index'],
  declaration: true,
  clean: true,
  outDir: 'dist',
  format: ['cjs', 'esm'],
  rollup: {
    emitCJS: true,
    esbuild: {
      tsconfigRaw: JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
        },
      }),
    },
  },
});