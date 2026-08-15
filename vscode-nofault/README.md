# Faultless Framework - VS Code Extension

VS Code extension for the Faultless framework with scaffolding commands, TypeScript snippets, and syntax highlighting.

## Features

### Commands

| Command | Description |
|---------|-------------|
| `Faultless: New Project` | Scaffold a new Faultless project with folder structure |
| `Faultless: Generate Controller` | Create a controller with CRUD routes |
| `Faultless: Generate Service` | Create a service with CRUD methods |
| `Faultless: Generate Model` | Create a model with fields |
| `Faultless: Start Dev Server` | Run `Faultless dev` in terminal |
| `Faultless: Build Project` | Run `Faultless build` in terminal |
| `Faultless: Run Tests` | Run `Faultless test` in terminal |

### Snippets

| Prefix | Description |
|--------|-------------|
| `nf-controller` | Controller with CRUD routes |
| `nf-service` | Service with CRUD methods |
| `nf-model` | Model with fields |
| `nf-middleware` | Middleware class |
| `nf-guard` | Guard for route protection |
| `nf-interceptor` | Interceptor |
| `nf-pipe` | Pipe for data transformation |
| `nf-filter` | Exception filter |
| `nf-route` | Route decorator |
| `nf-app` | App bootstrap |

### Syntax Highlighting

Syntax highlighting for `.Faultless` files with support for:
- Decorators (`@Controller`, `@Get`, `@Post`, etc.)
- TypeScript keywords and types
- Route parameters (`:id`)
- Strings, comments, and numeric literals

## Installation

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Install from VSIX" and select the command
4. Choose the `Faultless-vscode-0.1.0.vsix` file

Or install from source:

```bash
cd vscode-Faultless
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

## Usage

### Create a Project

1. Open a folder in VS Code
2. Press `Cmd+Shift+P` and type "Faultless: New Project"
3. Enter a project name
4. A new project with folder structure is created

### Generate Files

1. Press `Cmd+Shift+P` and type "Faultless: Generate Controller"
2. Enter a PascalCase name (e.g., `User`)
3. The file is created in `src/controllers/` and opened

### Use Snippets

In any TypeScript file, type the prefix and press Tab:

```
nf-controller  → Full controller with CRUD routes
nf-service     → Full service with CRUD methods
nf-model       → Model with fields
```

## Requirements

- VS Code 1.85.0+
- Node.js 18+

## License

MIT
