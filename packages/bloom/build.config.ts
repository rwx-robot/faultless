import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/index'],
  declaration: true,
  clean: true,
  outDir: 'dist',
  format: 'esm',
  failOnWarn: false,
  rollup: {
    emitCJS: true,
  },
});