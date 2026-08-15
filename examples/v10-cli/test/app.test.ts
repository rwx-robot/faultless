import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cli, prompt, confirm, generateProject, parseApiFile } from '@faultless/cli';

describe('v10-cli example', () => {
  let cli: Cli;

  beforeEach(() => {
    cli = new Cli('10.0.0');
  });

  describe('CLI', () => {
    it('should register command', () => {
      cli.command('test', 'Test command');
      const commands = cli['commands'];
      expect(commands.has('test')).toBe(true);
    });

    it('should parse arguments', () => {
      const argv = ['node', 'nofault', 'init', '--name', 'my-app', '--type', 'monolith'];
      const result = cli.parseArgs(argv);

      expect(result.command).toBe('init');
      expect(result.args).toHaveLength(0);
      expect(result.options.name).toBe('my-app');
      expect(result.options.type).toBe('monolith');
    });

    it('should parse options with =', () => {
      const argv = ['node', 'nofault', 'init', '--name=my-app'];
      const result = cli.parseArgs(argv);

      expect(result.options.name).toBe('my-app');
    });

    it('should parse boolean options', () => {
      const argv = ['node', 'nofault', 'init', '--help'];
      const result = cli.parseArgs(argv);

      expect(result.options.help).toBe(true);
    });
  });

  describe('Project Generation', () => {
    it('should generate package.json', () => {
      const packageJson = generateProject({
        name: 'test-app',
        description: 'Test application',
        author: 'Test Author',
        version: '1.0.0',
        type: 'monolith',
        features: [],
      }, '/tmp/test-app');

      // Check if package.json was created
      const fs = require('fs');
      const packageJsonPath = '/tmp/test-app/package.json';
      expect(fs.existsSync(packageJsonPath)).toBe(true);
    });

    it('should generate tsconfig.json', () => {
      generateProject({
        name: 'test-app',
        description: 'Test application',
        author: 'Test Author',
        version: '1.0.0',
        type: 'monolith',
        features: [],
      }, '/tmp/test-app-tsconfig');

      const fs = require('fs');
      const tsconfigPath = '/tmp/test-app-tsconfig/tsconfig.json';
      expect(fs.existsSync(tsconfigPath)).toBe(true);
    });
  });

  describe('API Parsing', () => {
    it('should parse API file', () => {
      const apiContent = `
info(
  title = "User API"
  description = "User management API"
  version = "1.0.0"
  author = "Test Author"
)

import("common-types")

types(
  User {
    id string
    name string
    email string optional
  }

  CreateUserRequest {
    name string
    email string
  }

  CreateUserResponse {
    id string
    message string
  }
)

routes(
  GET /users User ListUsersHandler
  POST /users CreateUserRequest CreateUserResponse CreateUserHandler
)

service(
  UserAPI {
    prefix /api/v1
  }
)
`;

      // Write to temp file
      const fs = require('fs');
      const tempFile = '/tmp/test-api.api';
      fs.writeFileSync(tempFile, apiContent);

      const definition = parseApiFile(tempFile);

      expect(definition.info.title).toBe('User API');
      expect(definition.info.description).toBe('User management API');
      expect(definition.info.version).toBe('1.0.0');
      expect(definition.info.author).toBe('Test Author');
      expect(definition.types).toHaveLength(3);
      expect(definition.routes).toHaveLength(2);
    });
  });
});