import * as fs from 'fs';
import * as path from 'path';

/**
 * Project Config
 */
export interface ProjectConfig {
  name: string;
  description: string;
  author: string;
  version: string;
  type: 'monolith' | 'microservice' | 'monorepo';
  features: string[];
}

/**
 * Create directory
 */
export function createDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write file
 */
export function writeFile(filePath: string, content: string): void {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Generate package.json
 */
export function generatePackageJson(config: ProjectConfig): string {
  return JSON.stringify({
    name: config.name,
    version: config.version,
    description: config.description,
    author: config.author,
    private: true,
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      test: 'vitest run',
    },
    dependencies: {
      '@faultless/http': 'workspace:*',
      '@faultless/core': 'workspace:*',
      '@faultless/config': 'workspace:*',
      '@faultless/log': 'workspace:*',
      'reflect-metadata': '^0.2.2',
    },
    devDependencies: {
      typescript: '^5.4.0',
      vitest: '^1.0.0',
      tsx: '^4.7.0',
      '@types/node': '^20.0.0',
    },
  }, null, 2);
}

/**
 * Generate tsconfig.json
 */
export function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      declaration: true,
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      composite: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2);
}

/**
 * Generate main file
 */
export function generateMainFile(config: ProjectConfig): string {
  return `import 'reflect-metadata';
import { Controller, Get, Post, Body, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';

@Injectable()
class AppController {
  @Get('ping')
  ping() {
    return { message: 'pong' };
  }
}

@Module({
  controllers: [AppController],
  providers: [],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '8888', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);
`;
}

/**
 * Generate config file
 */
export function generateConfigFile(config: ProjectConfig): string {
  return `name: ${config.name}
host: 0.0.0.0
port: 8888
maxConnections: 10000
timeout: 30000

log:
  mode: console
  level: info
`;
}

/**
 * Generate project
 */
export function generateProject(config: ProjectConfig, outputDir: string): void {
  console.log(`Generating project: ${config.name}`);

  // Create directories
  createDir(path.join(outputDir, 'src'));
  createDir(path.join(outputDir, 'etc'));
  createDir(path.join(outputDir, 'internal'));
  createDir(path.join(outputDir, 'internal', 'config'));
  createDir(path.join(outputDir, 'internal', 'handler'));
  createDir(path.join(outputDir, 'internal', 'logic'));
  createDir(path.join(outputDir, 'internal', 'svc'));
  createDir(path.join(outputDir, 'internal', 'types'));

  // Generate files
  writeFile(path.join(outputDir, 'package.json'), generatePackageJson(config));
  writeFile(path.join(outputDir, 'tsconfig.json'), generateTsConfig());
  writeFile(path.join(outputDir, 'src', 'index.ts'), generateMainFile(config));
  writeFile(path.join(outputDir, 'etc', 'app.yaml'), generateConfigFile(config));

  console.log(`Project generated successfully in ${outputDir}`);
}