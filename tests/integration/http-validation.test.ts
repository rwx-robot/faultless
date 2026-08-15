import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, HttpServer } from '@faultless/http';
import { validate, validateOrThrow } from '@faultless/validation';
import {
  Required,
  MinLength,
  MaxLength,
  Min,
  Max,
  Email,
  Pattern,
  Validate,
} from '@faultless/validation';

class CreateUserDto {
  @Required('Name is required')
  name!: string;

  @Required('Email is required')
  @Email('Invalid email format')
  email!: string;

  @Required('Password is required')
  @MinLength(8, 'Password must be at least 8 characters')
  @MaxLength(100, 'Password must be at most 100 characters')
  password!: string;

  @Min(0, 'Age must be non-negative')
  @Max(150, 'Age must be at most 150')
  age?: number;
}

class CreateUserDtoWithPattern {
  @Required()
  @Pattern(/^[A-Z]{3}-\d{4}$/, 'Must match format ABC-1234')
  code!: string;
}

class CreateUserDtoWithCustom {
  @Required()
  @Validate(
    (value) => typeof value === 'string' && value.startsWith('NF-'),
    'Must start with NF-'
  )
  serviceId!: string;
}

describe('HTTP + Validation Integration', () => {
  let server: HttpServer;

  beforeEach(() => {
    server = createServer({ port: 0, logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Request Validation with Decorators', () => {
    it('should validate a valid user creation request', () => {
      const dto = new CreateUserDto();
      dto.name = 'John Doe';
      dto.email = 'john@example.com';
      dto.password = 'securePass123!';
      dto.age = 30;

      const result = validate(dto);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject request with missing required fields', () => {
      const dto = new CreateUserDto();
      dto.name = '';
      dto.email = '';
      dto.password = '';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should reject invalid email format', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'not-an-email';
      dto.password = 'password123';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const emailError = result.errors.find(e => e.property === 'email');
      expect(emailError).toBeDefined();
      expect(emailError?.rule).toBe('email');
    });

    it('should reject password shorter than minimum length', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'john@example.com';
      dto.password = 'short';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const passwordError = result.errors.find(e => e.property === 'password');
      expect(passwordError).toBeDefined();
      expect(passwordError?.rule).toBe('minLength');
    });

    it('should reject age below minimum', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'john@example.com';
      dto.password = 'password123';
      dto.age = -5;

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const ageError = result.errors.find(e => e.property === 'age');
      expect(ageError).toBeDefined();
      expect(ageError?.rule).toBe('min');
    });

    it('should reject age above maximum', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'john@example.com';
      dto.password = 'password123';
      dto.age = 200;

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const ageError = result.errors.find(e => e.property === 'age');
      expect(ageError).toBeDefined();
      expect(ageError?.rule).toBe('max');
    });

    it('should validateOrThrow on invalid data', () => {
      const dto = new CreateUserDto();
      dto.name = '';
      dto.email = '';

      expect(() => validateOrThrow(dto)).toThrow();
    });

    it('should not throw on valid data', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'john@example.com';
      dto.password = 'securePass123!';

      expect(() => validateOrThrow(dto)).not.toThrow();
    });
  });

  describe('Query Parameters, Body, Headers Validation', () => {
    it('should validate required query parameters', async () => {
      server.addRoute({
        method: 'GET',
        url: '/search',
        handler: async (request, reply) => {
          const query = request.query as any;
          if (!query.q || typeof query.q !== 'string') {
            reply.status(400).send({ error: 'Missing required query parameter: q' });
            return;
          }
          if (query.limit && (isNaN(Number(query.limit)) || Number(query.limit) < 1)) {
            reply.status(400).send({ error: 'Invalid limit parameter' });
            return;
          }
          reply.send({ query: query.q, limit: Number(query.limit) || 10 });
        },
      });

      await server.ready();

      // Valid query
      const validResponse = await server.getApp().inject({
        method: 'GET',
        url: '/search?q=test&limit=5',
      });
      expect(validResponse.statusCode).toBe(200);
      expect(JSON.parse(validResponse.payload)).toEqual({ query: 'test', limit: 5 });

      // Missing required query
      const invalidResponse = await server.getApp().inject({
        method: 'GET',
        url: '/search',
      });
      expect(invalidResponse.statusCode).toBe(400);
    });

    it('should validate request body in POST handler', async () => {
      server.addRoute({
        method: 'POST',
        url: '/items',
        handler: async (request, reply) => {
          const body = request.body as any;
          if (!body.name || typeof body.name !== 'string' || body.name.length < 1) {
            reply.status(400).send({ error: 'Name is required' });
            return;
          }
          if (body.price !== undefined && (typeof body.price !== 'number' || body.price < 0)) {
            reply.status(400).send({ error: 'Price must be a non-negative number' });
            return;
          }
          reply.send({ id: '1', ...body });
        },
      });

      await server.ready();

      // Valid body
      const validResponse = await server.getApp().inject({
        method: 'POST',
        url: '/items',
        payload: { name: 'Widget', price: 9.99 },
      });
      expect(validResponse.statusCode).toBe(200);

      // Invalid body - missing name
      const invalidResponse = await server.getApp().inject({
        method: 'POST',
        url: '/items',
        payload: { price: 9.99 },
      });
      expect(invalidResponse.statusCode).toBe(400);

      // Invalid body - negative price
      const negativePriceResponse = await server.getApp().inject({
        method: 'POST',
        url: '/items',
        payload: { name: 'Widget', price: -5 },
      });
      expect(negativePriceResponse.statusCode).toBe(400);
    });

    it('should validate custom headers', async () => {
      server.addRoute({
        method: 'GET',
        url: '/versioned',
        handler: async (request, reply) => {
          const apiVersion = request.headers['x-api-version'] as string;
          if (!apiVersion) {
            reply.status(400).send({ error: 'Missing X-API-Version header' });
            return;
          }
          if (!/^\d+\.\d+\.\d+$/.test(apiVersion)) {
            reply.status(400).send({ error: 'Invalid API version format' });
            return;
          }
          reply.send({ version: apiVersion });
        },
      });

      await server.ready();

      // Valid header
      const validResponse = await server.getApp().inject({
        method: 'GET',
        url: '/versioned',
        headers: { 'x-api-version': '1.2.3' },
      });
      expect(validResponse.statusCode).toBe(200);
      expect(JSON.parse(validResponse.payload)).toEqual({ version: '1.2.3' });

      // Missing header
      const missingResponse = await server.getApp().inject({
        method: 'GET',
        url: '/versioned',
      });
      expect(missingResponse.statusCode).toBe(400);

      // Invalid header format
      const invalidResponse = await server.getApp().inject({
        method: 'GET',
        url: '/versioned',
        headers: { 'x-api-version': 'invalid' },
      });
      expect(invalidResponse.statusCode).toBe(400);
    });
  });

  describe('Custom Validators', () => {
    it('should validate pattern decorator', () => {
      const dto = new CreateUserDtoWithPattern();
      dto.code = 'ABC-1234';

      const result = validate(dto);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid pattern match', () => {
      const dto = new CreateUserDtoWithPattern();
      dto.code = 'invalid-code';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const codeError = result.errors.find(e => e.property === 'code');
      expect(codeError).toBeDefined();
      expect(codeError?.rule).toBe('pattern');
    });

    it('should validate custom validator function', () => {
      const dto = new CreateUserDtoWithCustom();
      dto.serviceId = 'NF-service-001';

      const result = validate(dto);
      expect(result.isValid).toBe(true);
    });

    it('should reject when custom validator fails', () => {
      const dto = new CreateUserDtoWithCustom();
      dto.serviceId = 'INVALID-service-001';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const serviceIdError = result.errors.find(e => e.property === 'serviceId');
      expect(serviceIdError).toBeDefined();
      expect(serviceIdError?.rule).toBe('custom');
      expect(serviceIdError?.message).toBe('Must start with NF-');
    });

    it('should validate multiple rules on the same field', () => {
      const dto = new CreateUserDto();
      dto.name = 'John';
      dto.email = 'john@example.com';
      dto.password = 'ab'; // Too short

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      const passwordErrors = result.errors.filter(e => e.property === 'password');
      expect(passwordErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('should return all validation errors, not just the first', () => {
      const dto = new CreateUserDto();
      dto.name = '';
      dto.email = 'invalid-email';
      dto.password = 'ab';

      const result = validate(dto);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const properties = result.errors.map(e => e.property);
      expect(properties).toContain('name');
      expect(properties).toContain('email');
      expect(properties).toContain('password');
    });
  });

  describe('HTTP Route Integration with Validation', () => {
    it('should combine validation decorators with route handlers', async () => {
      server.addRoute({
        method: 'POST',
        url: '/users',
        handler: async (request, reply) => {
          const body = request.body as any;
          const dto = new CreateUserDto();
          dto.name = body.name;
          dto.email = body.email;
          dto.password = body.password;
          dto.age = body.age;

          const result = validate(dto);
          if (!result.isValid) {
            reply.status(400).send({
              error: 'VALIDATION_ERROR',
              details: result.errors.map(e => ({
                property: e.property,
                rule: e.rule,
                message: e.message,
              })),
            });
            return;
          }

          reply.status(201).send({ id: '1', name: dto.name, email: dto.email });
        },
      });

      await server.ready();

      // Valid request
      const validResponse = await server.getApp().inject({
        method: 'POST',
        url: '/users',
        payload: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securePass123!',
          age: 25,
        },
      });
      expect(validResponse.statusCode).toBe(201);

      // Invalid request
      const invalidResponse = await server.getApp().inject({
        method: 'POST',
        url: '/users',
        payload: {
          name: '',
          email: 'invalid',
          password: '123',
        },
      });
      expect(invalidResponse.statusCode).toBe(400);
      const body = JSON.parse(invalidResponse.payload);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details.length).toBeGreaterThan(0);
    });
  });
});
