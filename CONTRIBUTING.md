# Contributing to Faultless

Thank you for your interest in contributing to Faultless! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

We adopt the [Contributor Covenant](https://www.contributor-covenant.org/) as our Code of Conduct. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) to understand expected behavior.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch
4. Make your changes
5. Submit a pull request

## Development Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 8
- TypeScript >= 5.3

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/faultless.git
cd faultless

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

### Project Structure

```
faultless/
├── packages/
│   ├── core/          # Core framework library
│   ├── http/          # HTTP server module
│   ├── config/        # Configuration management
│   ├── log/           # Structured logging
│   ├── validation/    # Request validation
│   ├── cache/         # Caching module
│   ├── store/         # Data store abstraction
│   ├── rpc/           # RPC framework
│   ├── gateway/       # API Gateway
│   ├── auth/          # Authentication & Authorization
│   └── ...
├── examples/          # Example applications
├── docs/              # Documentation
├── tests/             # Integration tests
└── benchmarks/        # Performance benchmarks
```

## Contributing Guidelines

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Create a new issue with a clear title and description
3. Include minimal reproduction steps
4. Specify Node.js and pnpm versions
5. Add relevant labels

### Suggesting Features

1. Check existing issues and discussions
2. Create a new issue with "feature request" label
3. Describe the problem and proposed solution
4. Include use cases and examples

### Contributing Code

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes following code style guidelines
4. Add or update tests as needed
5. Update documentation if required
6. Submit a pull request

## Pull Request Process

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/faultless.git
   cd faultless
   ```

2. **Create Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

3. **Make Changes**
   - Follow code style guidelines
   - Add tests for new functionality
   - Update documentation

4. **Run Checks**
   ```bash
   pnpm run lint
   pnpm run test
   pnpm run build
   ```

5. **Commit Changes**
   ```bash
   git commit -m "feat(module): add new feature"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**
```
feat(auth): add JWT refresh token support
fix(cache): resolve memory leak in LRU eviction
docs(http): update middleware examples
refactor(core): improve dependency injection
test(store): add transaction rollback tests
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties
- Avoid `any` type; use `unknown` when necessary
- Use meaningful variable and function names

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Trailing commas in multi-line structures
- Max line length: 100 characters

### Linting

```bash
# Run linter
pnpm run lint

# Auto-fix issues
pnpm run lint:fix
```

## Testing

### Unit Tests

```bash
# Run all tests
pnpm run test

# Run specific package tests
pnpm run test --filter=@faultless/core

# Run with coverage
pnpm run test:coverage
```

### Integration Tests

```bash
# Run integration tests
pnpm run test:integration
```

### Writing Tests

- Use `vitest` as test runner
- Follow AAA pattern (Arrange, Act, Assert)
- Use descriptive test names
- Mock external dependencies
- Aim for 80%+ code coverage

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`

## Documentation

### Code Documentation

- Use JSDoc for public APIs
- Include examples in documentation
- Document complex algorithms
- Keep documentation up-to-date

### README Updates

- Update package README for new features
- Add usage examples
- Include API reference
- Update version compatibility matrix

### API Documentation

- Generate API docs from JSDoc
- Include request/response examples
- Document error codes and handling

## Community

### Getting Help

- GitHub Issues for bugs and features
- GitHub Discussions for questions
- Discord for real-time chat
- Stack Overflow for Q&A

### Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Annual contributor appreciation

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Faultless!
