import 'reflect-metadata';
import { Cli, prompt, generateProject, parseApiFile, generateFromApiFile } from '@faultless/cli';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const cli = new Cli('10.0.0');

  // Register commands
  cli.command('init', 'Initialize a new nofault project', [
    { name: 'name', description: 'Project name', type: 'string', required: true },
    { name: 'type', description: 'Project type (monolith/microservice/monorepo)', type: 'string', default: 'monolith' },
    { name: 'dir', description: 'Output directory', type: 'string', default: '.' },
  ], async (args, options) => {
    const name = options.name || await prompt('Project name');
    const type = options.type || await prompt('Project type (monolith/microservice/monorepo)', 'monolith');
    const dir = options.dir || '.';

    await generateProject({
      name,
      description: '',
      author: '',
      version: '1.0.0',
      type: type as any,
      features: [],
    }, dir);
  });

  cli.command('api', 'Generate API handler and logic from .api file', [
    { name: 'file', description: 'API file path', type: 'string', required: true },
    { name: 'output', description: 'Output directory', type: 'string', default: './internal' },
  ], async (args, options) => {
    const file = options.file;
    const output = options.output || './internal';

    generateFromApiFile(file, output);
  });

  cli.command('model', 'Generate model from database', [
    { name: 'table', description: 'Table name', type: 'string', required: true },
    { name: 'db', description: 'Database connection string', type: 'string' },
  ], async (args, options) => {
    console.log(`Generating model for table: ${options.table}`);
    console.log('Database connection:', options.db || 'default');
    // TODO: Implement database model generation
  });

  cli.command('swagger', 'Generate Swagger documentation', [
    { name: 'file', description: 'API file path', type: 'string', required: true },
    { name: 'output', description: 'Output directory', type: 'string', default: './docs' },
  ], async (args, options) => {
    console.log(`Generating Swagger for: ${options.file}`);
    console.log('Output:', options.output);
    // TODO: Implement Swagger generation
  });

  cli.command('docker', 'Generate Dockerfile and docker-compose.yml', [
    { name: 'name', description: 'Service name', type: 'string', required: true },
    { name: 'port', description: 'Service port', type: 'number', default: 8888 },
  ], async (args, options) => {
    console.log(`Generating Docker files for: ${options.name}`);
    console.log('Port:', options.port);
    // TODO: Implement Docker generation
  });

  // Run CLI
  await cli.run();
}

main().catch(console.error);