import * as fs from 'fs';
import * as path from 'path';

/**
 * API Definition
 */
export interface ApiDefinition {
  info: {
    title: string;
    description: string;
    version: string;
    author: string;
  };
  imports: string[];
  types: TypeDefinition[];
  routes: RouteDefinition[];
  service: {
    name: string;
    groups: GroupDefinition[];
  };
}

/**
 * Type Definition
 */
export interface TypeDefinition {
  name: string;
  fields: FieldDefinition[];
}

/**
 * Field Definition
 */
export interface FieldDefinition {
  name: string;
  type: string;
  tag?: string;
  comment?: string;
  optional?: boolean;
}

/**
 * Route Definition
 */
export interface RouteDefinition {
  method: string;
  path: string;
  request: string;
  response: string;
  handler: string;
  group?: string;
}

/**
 * Group Definition
 */
export interface GroupDefinition {
  name: string;
  prefix: string;
  middlewares: string[];
}

/**
 * Parse API file
 */
export function parseApiFile(filePath: string): ApiDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseApiContent(content);
}

/**
 * Parse API content
 */
export function parseApiContent(content: string): ApiDefinition {
  const lines = content.split('\n');
  const definition: ApiDefinition = {
    info: {
      title: '',
      description: '',
      version: '1.0.0',
      author: '',
    },
    imports: [],
    types: [],
    routes: [],
    service: {
      name: '',
      groups: [],
    },
  };

  let currentSection: 'info' | 'imports' | 'types' | 'routes' | 'service' | null = null;
  let currentType: TypeDefinition | null = null;
  let currentGroup: GroupDefinition | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Section headers
    if (trimmed.startsWith('info(')) {
      currentSection = 'info';
      continue;
    }
    if (trimmed.startsWith('import(')) {
      currentSection = 'imports';
      continue;
    }
    if (trimmed.startsWith('types(')) {
      currentSection = 'types';
      continue;
    }
    if (trimmed.startsWith('routes(')) {
      currentSection = 'routes';
      continue;
    }
    if (trimmed.startsWith('service(')) {
      currentSection = 'service';
      continue;
    }

    // Parse based on section
    switch (currentSection) {
      case 'info':
        parseInfoLine(trimmed, definition.info);
        break;
      case 'imports':
        parseImportLine(trimmed, definition);
        break;
      case 'types':
        parseTypeLine(trimmed, definition, currentType);
        break;
      case 'routes':
        parseRouteLine(trimmed, definition);
        break;
      case 'service':
        parseServiceLine(trimmed, definition);
        break;
    }
  }

  return definition;
}

/**
 * Parse info line
 */
function parseInfoLine(line: string, info: ApiDefinition['info']): void {
  const match = line.match(/^(\w+)\s*=\s*["'](.+)["']$/);
  if (match) {
    const [, key, value] = match;
    switch (key.toLowerCase()) {
      case 'title':
        info.title = value;
        break;
      case 'description':
        info.description = value;
        break;
      case 'version':
        info.version = value;
        break;
      case 'author':
        info.author = value;
        break;
    }
  }
}

/**
 * Parse import line
 */
function parseImportLine(line: string, definition: ApiDefinition): void {
  const match = line.match(/^["'](.+)["']$/);
  if (match) {
    definition.imports.push(match[1]);
  }
}

/**
 * Parse type line
 */
function parseTypeLine(line: string, definition: ApiDefinition, currentType: TypeDefinition | null): void {
  // Type definition
  const typeMatch = line.match(/^(\w+)\s*\{$/);
  if (typeMatch) {
    currentType = {
      name: typeMatch[1],
      fields: [],
    };
    definition.types.push(currentType);
    return;
  }

  // Field definition
  const fieldMatch = line.match(/^(\w+)\s+(\w+)(?:\s+optional)?(?:\s+`(.+)`)?$/);
  if (fieldMatch && currentType) {
    currentType.fields.push({
      name: fieldMatch[1],
      type: fieldMatch[2],
      tag: fieldMatch[3],
    });
  }
}

/**
 * Parse route line
 */
function parseRouteLine(line: string, definition: ApiDefinition): void {
  const routeMatch = line.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)\s+(\w+)\s+(\w+)$/);
  if (routeMatch) {
    definition.routes.push({
      method: routeMatch[1],
      path: routeMatch[2],
      request: routeMatch[3],
      response: routeMatch[4],
      handler: routeMatch[4] + 'Handler',
    });
  }
}

/**
 * Parse service line
 */
function parseServiceLine(line: string, definition: ApiDefinition): void {
  const serviceMatch = line.match(/^(\w+)\s*\{$/);
  if (serviceMatch) {
    definition.service.name = serviceMatch[1];
  }

  const groupMatch = line.match(/^(\w+)\s*\{$/);
  if (groupMatch) {
    definition.service.groups.push({
      name: groupMatch[1],
      prefix: '/' + groupMatch[1],
      middlewares: [],
    });
  }
}

/**
 * Generate handler
 */
export function generateHandler(route: RouteDefinition): string {
  return `import { Injectable } from '@faultless/core';
import { Get, Post, Put, Delete, Patch, Body, Param, Query } from '@faultless/http';

@Injectable()
export class ${route.handler} {
  @${route.method}('${route.path}')
  async handle(@Body() body: any, @Param('id') id?: string, @Query('page') page?: number) {
    // TODO: Implement handler logic
    return { message: '${route.handler} called' };
  }
}
`;
}

/**
 * Generate logic
 */
export function generateLogic(route: RouteDefinition): string {
  return `import { Injectable } from '@faultless/core';

@Injectable()
export class ${route.handler}Logic {
  async execute(input: any): Promise<any> {
    // TODO: Implement business logic
    return { message: 'Logic executed' };
  }
}
`;
}

/**
 * Generate API handler file
 */
export function generateApiHandlerFile(definition: ApiDefinition): string {
  let content = '';

  for (const route of definition.routes) {
    content += generateHandler(route) + '\n';
  }

  return content;
}

/**
 * Generate API logic file
 */
export function generateApiLogicFile(definition: ApiDefinition): string {
  let content = '';

  for (const route of definition.routes) {
    content += generateLogic(route) + '\n';
  }

  return content;
}

/**
 * Generate from API file
 */
export function generateFromApiFile(apiFilePath: string, outputDir: string): void {
  const definition = parseApiFile(apiFilePath);
  const handlerFile = generateApiHandlerFile(definition);
  const logicFile = generateApiLogicFile(definition);

  fs.writeFileSync(path.join(outputDir, 'handlers.ts'), handlerFile);
  fs.writeFileSync(path.join(outputDir, 'logic.ts'), logicFile);

  console.log(`Generated handler and logic files from ${apiFilePath}`);
}