import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('nofault.new', () => createProject()),
    vscode.commands.registerCommand('nofault.generate.controller', () => generateFile('controller')),
    vscode.commands.registerCommand('nofault.generate.service', () => generateFile('service')),
    vscode.commands.registerCommand('nofault.generate.model', () => generateFile('model')),
    vscode.commands.registerCommand('nofault.dev', () => runTask('dev')),
    vscode.commands.registerCommand('nofault.build', () => runTask('build')),
    vscode.commands.registerCommand('nofault.test', () => runTask('test'))
  );
}

async function createProject() {
  const name = await vscode.window.showInputBox({
    prompt: 'Project name',
    placeHolder: 'my-nofault-app',
    validateInput: (value) => /^[a-z0-9-]+$/.test(value) ? null : 'Use lowercase letters, numbers, and hyphens only'
  });
  if (!name) return;

  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) {
    vscode.window.showErrorMessage('Open a folder first');
    return;
  }

  const projectPath = path.join(ws, name);
  if (fs.existsSync(projectPath)) {
    vscode.window.showErrorMessage(`Folder "${name}" already exists`);
    return;
  }

  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'src', 'controllers'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'src', 'services'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'src', 'models'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'src', 'middleware'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'src', 'guards'), { recursive: true });

  const pkgJson = {
    name,
    version: '0.1.0',
    scripts: {
      dev: 'nofault dev',
      build: 'nofault build',
      test: 'nofault test'
    },
    dependencies: {
      nofault: '^0.1.0'
    }
  };
  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(pkgJson, null, 2));

  const mainFile = `import { App } from 'nofault';

const app = new App();

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
`;
  fs.writeFileSync(path.join(projectPath, 'src', 'index.ts'), mainFile);

  vscode.window.showInformationMessage(`NoFault project "${name}" created`);
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
}

async function generateFile(type: 'controller' | 'service' | 'model') {
  const name = await vscode.window.showInputBox({
    prompt: `${type.charAt(0).toUpperCase() + type.slice(1)} name`,
    placeHolder: `user`,
    validateInput: (value) => /^[A-Z][a-zA-Z0-9]*$/.test(value) ? null : 'Use PascalCase (e.g., User, Product)'
  });
  if (!name) return;

  const folder = type === 'controller' ? 'controllers' : type === 'service' ? 'services' : 'models';
  const dir = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'src', folder);
  fs.mkdirSync(dir, { recursive: true });

  const fileName = `${name.toLowerCase()}.${type}.ts`;
  const filePath = path.join(dir, fileName);

  if (fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`${fileName} already exists`);
    return;
  }

  const templates: Record<string, string> = {
    controller: `import { Controller, Get, Post, Put, Delete } from 'nofault';

@Controller('${name.toLowerCase()}')
export class ${name}Controller {
  @Get('/')
  findAll() {
    return { data: [] };
  }

  @Get('/:id')
  findOne(id: string) {
    return { data: {} };
  }

  @Post('/')
  create(body: any) {
    return { data: body };
  }

  @Put('/:id')
  update(id: string, body: any) {
    return { data: body };
  }

  @Delete('/:id')
  remove(id: string) {
    return { success: true };
  }
}
`,
    service: `import { Injectable } from 'nofault';

@Injectable()
export class ${name}Service {
  async findAll() {
    return [];
  }

  async findOne(id: string) {
    return null;
  }

  async create(data: any) {
    return data;
  }

  async update(id: string, data: any) {
    return data;
  }

  async remove(id: string) {
    return true;
  }
}
`,
    model: `import { Model, Field } from 'nofault';

@Model('${name.toLowerCase()}')
export class ${name} {
  @Field({ primary: true })
  id: string = '';

  @Field()
  createdAt: Date = new Date();

  @Field()
  updatedAt: Date = new Date();
}
`
  };

  fs.writeFileSync(filePath, templates[type]);
  const doc = await vscode.workspace.openTextDocument(filePath);
  vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(`${name}${type.charAt(0).toUpperCase() + type.slice(1)} created`);
}

async function runTask(task: string) {
  const terminal = vscode.window.createTerminal(`nofault ${task}`);
  terminal.show();
  terminal.sendText(`npx nofault ${task}`);
}

export function deactivate() {}
