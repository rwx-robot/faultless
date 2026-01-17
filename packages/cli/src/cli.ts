import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync, spawn } from 'child_process';

/**
 * CLI Command
 */
export interface CliCommand {
  name: string;
  description: string;
  options?: CliOption[];
  action: (args: any, options: any) => Promise<void>;
}

/**
 * CLI Option
 */
export interface CliOption {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number';
  default?: any;
  required?: boolean;
  alias?: string;
}

/**
 * CLI
 */
export class Cli {
  private commands: Map<string, CliCommand> = new Map();
  private version: string;

  constructor(version: string = '10.0.0') {
    this.version = version;
  }

  /**
   * Register command
   */
  command(name: string, description: string, options?: CliOption[], action?: (args: any, options: any) => Promise<void>): void {
    this.commands.set(name, {
      name,
      description,
      options,
      action: action || (async () => {}),
    });
  }

  /**
   * Parse arguments
   */
  parseArgs(argv: string[]): { command: string | null; args: string[]; options: Record<string, any> } {
    const args: string[] = [];
    const options: Record<string, any> = {};
    let command: string | null = null;
    let i = 2;

    while (i < argv.length) {
      const arg = argv[i];

      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        if (value !== undefined) {
          options[key] = value;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          options[key] = argv[i + 1];
          i++;
        } else {
          options[key] = true;
        }
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        options[key] = true;
      } else if (!command) {
        command = arg;
      } else {
        args.push(arg);
      }

      i++;
    }

    return { command, args, options };
  }

  /**
   * Run CLI
   */
  async run(argv: string[] = process.argv): Promise<void> {
    const { command, args, options } = this.parseArgs(argv);

    if (options.version || options.v) {
      console.log(`nofault CLI v${this.version}`);
      return;
    }

    if (options.help || options.h || !command) {
      this.printHelp();
      return;
    }

    const cmd = this.commands.get(command);
    if (!cmd) {
      console.error(`Unknown command: ${command}`);
      this.printHelp();
      return;
    }

    await cmd.action(args, options);
  }

  /**
   * Print help
   */
  printHelp(): void {
    console.log(`nofault CLI v${this.version}`);
    console.log('');
    console.log('Usage: nofault <command> [options]');
    console.log('');
    console.log('Commands:');
    for (const [name, cmd] of this.commands) {
      console.log(`  ${name.padEnd(20)} ${cmd.description}`);
    }
    console.log('');
    console.log('Options:');
    console.log('  --version, -v   Show version');
    console.log('  --help, -h      Show help');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCmd(cmd: string, args: string[], opts: { cwd?: string; stdio?: 'inherit' } = {}): void {
  const result = spawn(cmd, args, { stdio: opts.stdio ?? 'inherit', cwd: opts.cwd, shell: true });
  result.on('error', (err) => {
    console.error(`Failed to start ${cmd}: ${err.message}`);
    process.exit(1);
  });
  result.on('close', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
}

function fileExists(p: string): boolean {
  return fs.existsSync(p);
}

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeFileIfAbsent(filePath: string, content: string): void {
  if (!fileExists(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  created ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// Command: new
// ---------------------------------------------------------------------------

async function cmdNew(_args: string[], options: Record<string, any>): Promise<void> {
  const name = _args[0];
  if (!name) {
    console.error('Error: project name required\n  Usage: nofault new <name> [options]');
    process.exit(1);
  }

  const template = options.template || 'basic';
  const db = options.database || 'none';
  const cache = options.cache || 'none';
  const auth = options.auth || 'none';

  const dir = path.resolve(process.cwd(), name);
  if (fileExists(dir)) {
    console.error(`Error: directory "${name}" already exists`);
    process.exit(1);
  }

  console.log(`Creating project "${name}" (template=${template}, db=${db}, cache=${cache}, auth=${auth})`);

  // Directory skeleton
  const dirs = [
    'src/controllers',
    'src/services',
    'src/models',
    'src/middlewares',
    'src/config',
  ];
  if (db !== 'none') dirs.push('src/migrations');
  for (const d of dirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // package.json
  const deps: Record<string, string> = {
    '@faultless/core': 'workspace:*',
    '@faultless/http': 'workspace:*',
    'reflect-metadata': '^0.2.2',
  };
  if (db === 'postgres') deps['pg'] = '^8.0.0';
  if (db === 'mysql') deps['mysql2'] = '^3.0.0';
  if (db === 'mongo') deps['mongodb'] = '^6.0.0';
  if (cache === 'redis') deps['ioredis'] = '^5.0.0';
  if (auth === 'jwt') deps['jsonwebtoken'] = '^9.0.0';

  const pkg = {
    name,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'nofault dev',
      build: 'nofault build',
      start: 'node dist/index.js',
      test: 'nofault test',
    },
    dependencies: deps,
    devDependencies: {
      typescript: '^5.4.0',
      tsx: '^4.7.0',
      '@types/node': '^20.0.0',
    },
  };
  writeFileIfAbsent(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));

  // tsconfig.json
  const tsconfig = {
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
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };
  writeFileIfAbsent(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  // src/index.ts
  const imports: string[] = ["import 'reflect-metadata';", "import { Module, Injectable, Controller, Get } from '@faultless/core';", "import { createApplication, runApplication } from '@faultless/http';"];
  if (db !== 'none') imports.push(`import { DatabaseModule } from './config/database';`);
  if (auth !== 'none') imports.push(`import { AuthMiddleware } from './middlewares/auth';`);

  const mainContent = `${imports.join('\n')}

@Injectable()
class AppController {
  @Get('ping')
  ping() {
    return { message: 'pong', env: process.env.NODE_ENV ?? 'development' };
  }
}

const modules: any[] = [AppController];
${db !== 'none' ? "modules.push(DatabaseModule);" : ''}
${auth !== 'none' ? "modules.push(AuthMiddleware);" : ''}

@Module({ controllers: modules, providers: [] })
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);
`;
  writeFileIfAbsent(path.join(dir, 'src', 'index.ts'), mainContent);

  // config files
  if (db !== 'none') {
    const dbConfig = `export const database = {\n  type: '${db}',\n  host: process.env.DB_HOST ?? 'localhost',\n  port: parseInt(process.env.DB_PORT ?? '${db === 'postgres' ? '5432' : db === 'mysql' ? '3306' : '27017'}', 10),\n  name: process.env.DB_NAME ?? '${name}',\n  user: process.env.DB_USER ?? '',\n  password: process.env.DB_PASSWORD ?? '',\n};\n`;
    writeFileIfAbsent(path.join(dir, 'src', 'config', 'database.ts'), dbConfig);
  }
  if (cache !== 'none') {
    const cacheConfig = `export const cache = {\n  type: '${cache}',\n  host: process.env.REDIS_HOST ?? 'localhost',\n  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),\n};\n`;
    writeFileIfAbsent(path.join(dir, 'src', 'config', 'cache.ts'), cacheConfig);
  }
  if (auth !== 'none') {
    const authMiddleware = `import { Injectable, Middleware } from '@faultless/core';

@Injectable()
@Middleware()
export class AuthMiddleware {
  async handle(req: any, res: any, next: () => Promise<void>) {
    // TODO: implement ${auth} auth
    await next();
  }
}
`;
    writeFileIfAbsent(path.join(dir, 'src', 'middlewares', 'auth.ts'), authMiddleware);
  }

  console.log(`\nDone! Next steps:\n  cd ${name}\n  npm install\n  npm run dev`);
}

// ---------------------------------------------------------------------------
// Command: generate
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseFields(raw: string): { name: string; type: string }[] {
  if (!raw) return [];
  return raw.split(',').map((f) => {
    const [name, type] = f.split(':');
    return { name: name.trim(), type: (type ?? 'string').trim() };
  });
}

async function cmdGenerate(args: string[], options: Record<string, any>): Promise<void> {
  const [type, name] = args;
  if (!type || !name) {
    console.error('Error: type and name required\n  Usage: nofault generate <controller|service|model> <Name> [options]');
    process.exit(1);
  }

  const validTypes = ['controller', 'service', 'model'];
  if (!validTypes.includes(type)) {
    console.error(`Error: unknown type "${type}". Must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const srcDir = path.resolve('src');
  const lcName = name.charAt(0).toLowerCase() + name.slice(1);

  if (type === 'controller') {
    const methods = (options.methods || 'get,create').split(',');
    const resource = options.resource || lcName;
    const methodLines = methods.map((m: string) => {
      const trimmed = m.trim();
      switch (trimmed) {
        case 'get':
          return `  @Get('${resource}')\n  async findAll() {\n    return this.service.findAll();\n  }`;
        case 'getById':
          return `  @Get('${resource}/:id')\n  async findOne(@Param('id') id: string) {\n    return this.service.findOne(id);\n  }`;
        case 'create':
          return `  @Post('${resource}')\n  async create(@Body() body: any) {\n    return this.service.create(body);\n  }`;
        case 'update':
          return `  @Put('${resource}/:id')\n  async update(@Param('id') id: string, @Body() body: any) {\n    return this.service.update(id, body);\n  }`;
        case 'delete':
          return `  @Delete('${resource}/:id')\n  async remove(@Param('id') id: string) {\n    return this.service.remove(id);\n  }`;
        default:
          return `  // unknown method: ${trimmed}`;
      }
    }).join('\n\n');

    const content = `import { Injectable, Controller } from '@faultless/core';
import { Get, Post, Put, Delete, Body, Param } from '@faultless/http';
import { ${name}Service } from '../services/${lcName}.service';

@Injectable()
@Controller()
export class ${name}Controller {
  constructor(private readonly service: ${name}Service) {}

${methodLines}
}
`;
    writeFileIfAbsent(path.join(srcDir, 'controllers', `${lcName}.controller.ts`), content);
  }

  if (type === 'service') {
    const content = `import { Injectable } from '@faultless/core';

@Injectable()
export class ${name}Service {
  async findAll(): Promise<any[]> {
    // TODO: implement
    return [];
  }

  async findOne(id: string): Promise<any> {
    // TODO: implement
    return null;
  }

  async create(data: any): Promise<any> {
    // TODO: implement
    return data;
  }

  async update(id: string, data: any): Promise<any> {
    // TODO: implement
    return data;
  }

  async remove(id: string): Promise<void> {
    // TODO: implement
  }
}
`;
    writeFileIfAbsent(path.join(srcDir, 'services', `${lcName}.service.ts`), content);
  }

  if (type === 'model') {
    const fields = parseFields(options.fields || 'id:string');
    const fieldLines = fields.map((f) => `  ${f.name}: ${f.type};`).join('\n');
    const content = `export interface ${name} {
${fieldLines}
}
`;
    writeFileIfAbsent(path.join(srcDir, 'models', `${lcName}.model.ts`), content);
  }

  console.log(`Generated ${type}: ${name}`);
}

// ---------------------------------------------------------------------------
// Command: dev
// ---------------------------------------------------------------------------

async function cmdDev(_args: string[], options: Record<string, any>): Promise<void> {
  const port = options.port || '3000';
  const args: string[] = ['watch', 'src/index.ts'];

  console.log(`Starting dev server on port ${port}...`);
  const env = { ...process.env, PORT: port, NODE_ENV: 'development' };

  if (options.inspect) {
    args.unshift('--inspect');
  }

  const child = spawn('npx', ['tsx', ...args], {
    stdio: 'inherit',
    env,
    shell: true,
  });
  child.on('error', (err) => {
    console.error(`Failed to start dev server: ${err.message}`);
    process.exit(1);
  });
  child.on('close', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
}

// ---------------------------------------------------------------------------
// Command: build
// ---------------------------------------------------------------------------

async function cmdBuild(_args: string[], options: Record<string, any>): Promise<void> {
  console.log('Building for production...');

  const args: string[] = [];
  if (options.target) {
    args.push('--target', options.target);
  }

  const child = spawn('npx', ['tsc', ...args], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('error', (err) => {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  });
  child.on('close', (code) => {
    if (code !== 0) process.exit(code ?? 1);
    console.log('Build complete.');
  });
}

// ---------------------------------------------------------------------------
// Command: test
// ---------------------------------------------------------------------------

async function cmdTest(_args: string[], options: Record<string, any>): Promise<void> {
  const args: string[] = [];
  if (options.watch) args.push('--watch');
  if (options.coverage) args.push('--coverage');
  if (options.ui) args.push('--ui');
  if (_args.length) args.push(..._args);

  console.log('Running tests...');
  const child = spawn('npx', ['vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('error', (err) => {
    console.error(`Tests failed to start: ${err.message}`);
    process.exit(1);
  });
  child.on('close', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
}

// ---------------------------------------------------------------------------
// Command: db
// ---------------------------------------------------------------------------

async function cmdDb(args: string[], options: Record<string, any>): Promise<void> {
  const sub = args[0];
  if (!sub || !['migrate', 'seed', 'status'].includes(sub)) {
    console.error('Error: subcommand required\n  Usage: nofault db <migrate|seed|status> [options]');
    process.exit(1);
  }

  // Detect ORM
  let orm: 'prisma' | 'typeorm' | 'drizzle' | null = null;
  const cwd = process.cwd();
  if (fileExists(path.join(cwd, 'prisma', 'schema.prisma'))) orm = 'prisma';
  else if (fileExists(path.join(cwd, 'ormconfig.json')) || fileExists(path.join(cwd, 'typeorm.config.ts'))) orm = 'typeorm';
  else if (fileExists(path.join(cwd, 'drizzle.config.ts'))) orm = 'drizzle';

  if (sub === 'status') {
    if (orm === 'prisma') {
      runCmd('npx', ['prisma', 'migrate', 'status']);
    } else if (orm === 'typeorm') {
      console.log('TypeORM detected. Use: npx typeorm migration:show');
    } else if (orm === 'drizzle') {
      console.log('Drizzle detected. Use: npx drizzle-kit studio');
    } else {
      console.log('No ORM detected (no prisma/schema.prisma, ormconfig.json, or drizzle.config.ts found).');
    }
    return;
  }

  if (sub === 'migrate') {
    if (!orm) {
      console.error('Error: no supported ORM detected. Install prisma, typeorm, or drizzle.');
      process.exit(1);
    }

    if (options.down) {
      if (orm === 'prisma') runCmd('npx', ['prisma', 'migrate', 'down']);
      else if (orm === 'typeorm') runCmd('npx', ['typeorm', 'migration:revert']);
      else console.log('Drizzle: use drizzle-kit to manage migrations.');
      return;
    }

    // default: up
    if (orm === 'prisma') runCmd('npx', ['prisma', 'migrate', 'deploy']);
    else if (orm === 'typeorm') runCmd('npx', ['typeorm', 'migration:run']);
    else if (orm === 'drizzle') runCmd('npx', ['drizzle-kit', 'migrate']);
    return;
  }

  if (sub === 'seed') {
    const file = options.file || 'seed.ts';
    if (fileExists(path.join(cwd, file))) {
      runCmd('npx', ['tsx', file]);
    } else {
      console.error(`Error: seed file "${file}" not found`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Command: info
// ---------------------------------------------------------------------------

async function cmdInfo(_args: string[], options: Record<string, any>): Promise<void> {
  const lines: string[] = [];

  const add = (label: string, value: string) => {
    lines.push(`  ${label.padEnd(16)} ${value}`);
  };

  add('CLI', `v10.0.0`);
  add('Node', process.version);
  add('Platform', `${process.platform} ${process.arch}`);

  if (options.check) {
    // Check common tool availability
    const check = (cmd: string, label: string) => {
      try {
        const v = execSync(`${cmd} --version 2>&1`, { encoding: 'utf-8' }).trim().split('\n')[0];
        add(label, v);
      } catch {
        add(label, 'not found');
      }
    };
    check('node --version', 'Node');
    check('npm --version', 'npm');
    check('npx --version', 'npx');
    check('tsc --version', 'TypeScript');
    check('tsx --version', 'tsx');
    check('vitest --version', 'Vitest');

    // ORM
    const cwd = process.cwd();
    if (fileExists(path.join(cwd, 'prisma', 'schema.prisma'))) add('ORM', 'Prisma');
    else if (fileExists(path.join(cwd, 'ormconfig.json'))) add('ORM', 'TypeORM');
    else if (fileExists(path.join(cwd, 'drizzle.config.ts'))) add('ORM', 'Drizzle');
    else add('ORM', 'none detected');

    // Project
    if (fileExists(path.join(cwd, 'package.json'))) {
      try {
        const pkg = readJson(path.join(cwd, 'package.json'));
        add('Project', pkg.name ?? 'unknown');
      } catch { /* ignore */ }
    }
  }

  console.log('nofault environment info:\n');
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Register commands & export
// ---------------------------------------------------------------------------

export function createCli(version?: string): Cli {
  const cli = new Cli(version);

  cli.command('new', 'Create a new nofault project', [
    { name: 'template', description: 'Project template: basic|advanced|microservice', type: 'string', default: 'basic' },
    { name: 'database', description: 'Database: postgres|mysql|mongo|none', type: 'string', default: 'none' },
    { name: 'cache', description: 'Cache: redis|memory|none', type: 'string', default: 'none' },
    { name: 'auth', description: 'Auth: jwt|apikey|none', type: 'string', default: 'none' },
  ], cmdNew);

  cli.command('generate', 'Generate controller, service, or model', [
    { name: 'resource', description: 'Resource name for controller routes', type: 'string' },
    { name: 'methods', description: 'Comma-separated methods (get,getById,create,update,delete)', type: 'string', default: 'get,create' },
    { name: 'database', description: 'Database type for service generation', type: 'string' },
    { name: 'fields', description: 'Model fields as "name:type,name:type"', type: 'string' },
  ], cmdGenerate);

  cli.command('dev', 'Start development server', [
    { name: 'port', description: 'Port to listen on', type: 'string', default: '3000' },
    { name: 'watch', description: 'Enable file watching', type: 'boolean', default: true },
    { name: 'inspect', description: 'Enable Node.js inspector', type: 'boolean' },
  ], cmdDev);

  cli.command('build', 'Build for production', [
    { name: 'minify', description: 'Minify output', type: 'boolean' },
    { name: 'sourcemap', description: 'Generate source maps', type: 'boolean' },
    { name: 'target', description: 'Target runtime (node20, etc.)', type: 'string' },
  ], cmdBuild);

  cli.command('test', 'Run tests', [
    { name: 'coverage', description: 'Enable coverage reporting', type: 'boolean' },
    { name: 'watch', description: 'Run tests in watch mode', type: 'boolean' },
    { name: 'ui', description: 'Open test UI', type: 'boolean' },
  ], cmdTest);

  cli.command('db', 'Database operations (migrate, seed, status)', [
    { name: 'up', description: 'Run pending migrations', type: 'boolean' },
    { name: 'down', description: 'Rollback last migration', type: 'boolean' },
    { name: 'file', description: 'Seed file path', type: 'string', default: 'seed.ts' },
  ], cmdDb);

  cli.command('info', 'Show environment info', [
    { name: 'check', description: 'Check installed tools and dependencies', type: 'boolean' },
  ], cmdInfo);

  return cli;
}

/**
 * Interactive prompt
 */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question}${defaultValue ? ` (${defaultValue})` : ''}: `, (answer) => {
      rl.close();
      resolve(answer || defaultValue || '');
    });
  });
}

/**
 * Confirm prompt
 */
export async function confirm(question: string, defaultValue: boolean = true): Promise<boolean> {
  const answer = await prompt(`${question} (Y/n)`, defaultValue ? 'Y' : 'n');
  return answer.toLowerCase() === 'y';
}
