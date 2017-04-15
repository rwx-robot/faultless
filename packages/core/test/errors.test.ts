import { describe, it, expect } from 'vitest';
import {
  NofaultError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  CircuitBreakerOpenError,
  RateLimitExceededError,
  ConfigurationError,
  DependencyError,
  SerializationError,
  DeserializationError,
  isNofaultError,
  isRetryableError,
} from '../src/errors';

describe('errors', () => {
  describe('NofaultError', () => {
    it('should create error with all properties', () => {
      const error = new NofaultError('Test error', 'TEST_ERROR', 400, { detail: 'info' }, 'req_123');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ detail: 'info' });
      expect(error.requestId).toBe('req_123');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to JSON', () => {
      const error = new NofaultError('Test', 'CODE', 500, { foo: 'bar' }, 'req_1');
      const json = error.toJSON();
      expect(json).toEqual({
        name: 'NofaultError',
        message: 'Test',
        code: 'CODE',
        statusCode: 500,
        details: { foo: 'bar' },
        timestamp: error.timestamp.toISOString(),
        requestId: 'req_1',
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid field', 'email', { isEmail: 'must be email' }, 'req_1');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('email');
      expect(error.constraints).toEqual({ isEmail: 'must be email' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with identifier', () => {
      const error = new NotFoundError('User', '123', 'req_1');
      expect(error.message).toBe("User with identifier '123' not found");
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ resource: 'User', identifier: '123' });
    });

    it('should create not found error without identifier', () => {
      const error = new NotFoundError('User', undefined, 'req_1');
      expect(error.message).toBe('User not found');
      expect(error.details).toEqual({ resource: 'User', identifier: undefined });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error', () => {
      const error = new UnauthorizedError('Invalid token', 'req_1');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('should use default message', () => {
      const error = new UnauthorizedError(undefined, 'req_1');
      expect(error.message).toBe('Unauthorized');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error', () => {
      const error = new ForbiddenError('Access denied', 'req_1');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource exists', 'req_1');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('TooManyRequestsError', () => {
    it('should create rate limit error', () => {
      const error = new TooManyRequestsError('Too many', 60, 'req_1');
      expect(error.code).toBe('TOO_MANY_REQUESTS');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('InternalServerError', () => {
    it('should create internal server error', () => {
      const error = new InternalServerError('Something broke', 'req_1');
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Down for maintenance', 30, 'req_1');
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.retryAfter).toBe(30);
    });
  });

  describe('GatewayTimeoutError', () => {
    it('should create gateway timeout error', () => {
      const error = new GatewayTimeoutError('Upstream timeout', 'req_1');
      expect(error.code).toBe('GATEWAY_TIMEOUT');
      expect(error.statusCode).toBe(504);
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('should create circuit breaker error', () => {
      const resetTime = new Date('2024-01-01');
      const error = new CircuitBreakerOpenError('Open', resetTime, 'req_1');
      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(error.statusCode).toBe(503);
      expect(error.resetTime).toBe(resetTime);
    });
  });

  describe('RateLimitExceededError', () => {
    it('should create rate limit exceeded error', () => {
      const resetTime = new Date('2024-01-01');
      const error = new RateLimitExceededError(100, 0, resetTime, 'req_1');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
      expect(error.resetTime).toBe(resetTime);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Invalid config', 'req_1');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('DependencyError', () => {
    it('should create dependency error', () => {
      const error = new DependencyError('DB connection failed', 'postgres', 'req_1');
      expect(error.code).toBe('DEPENDENCY_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.dependency).toBe('postgres');
    });
  });

  describe('SerializationError', () => {
    it('should create serialization error', () => {
      const error = new SerializationError('Cannot serialize', 'req_1');
      expect(error.code).toBe('SERIALIZATION_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('DeserializationError', () => {
    it('should create deserialization error', () => {
      const error = new DeserializationError('Cannot parse JSON', 'req_1');
      expect(error.code).toBe('DESERIALIZATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('isNofaultError', () => {
    it('should return true for NofaultError subclasses', () => {
      expect(isNofaultError(new ValidationError('test'))).toBe(true);
      expect(isNofaultError(new NotFoundError('test'))).toBe(true);
      expect(isNofaultError(new InternalServerError())).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isNofaultError(new Error('test'))).toBe(false);
      expect(isNofaultError({})).toBe(false);
      expect(isNofaultError(null)).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryableError(new ServiceUnavailableError())).toBe(true);
      expect(isRetryableError(new GatewayTimeoutError())).toBe(true);
      expect(isRetryableError(new CircuitBreakerOpenError())).toBe(true);
      expect(isRetryableError(new TooManyRequestsError())).toBe(true);
      expect(isRetryableError(new DependencyError('fail', 'db'))).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new ValidationError('test'))).toBe(false);
      expect(isRetryableError(new NotFoundError('test'))).toBe(false);
      expect(isRetryableError(new UnauthorizedError())).toBe(false);
      expect(isRetryableError(new ForbiddenError())).toBe(false);
      expect(isRetryableError(new InternalServerError())).toBe(false);
    });

    it('should return false for non-NofaultErrors', () => {
      expect(isRetryableError(new Error('test'))).toBe(false);
    });
  });
});