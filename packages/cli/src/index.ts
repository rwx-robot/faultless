export * from './cli';
export * from './project';
export * from './api';

// Auto-create CLI for direct invocation
import { createCli } from './cli';
const cli = createCli();
cli.run();