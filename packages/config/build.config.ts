import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/index'],
  declaration: true,
  clean: true,
  outDir: 'dist',
  format: 'esm',
  rollup: {
    emitCJS: true,
  },
  externals: ['etcd3', 'consul'],
  failOnWarn: false,
});
