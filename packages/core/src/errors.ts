// Error code cache for fast lookup
const errorCodeCache = new Map<string, { statusCode: number; name: string }>();

// Pre-cache common error codes
errorCodeCache.set('VALIDATION_ERROR', { statusCode: 400, name: 'ValidationError' });
errorCodeCache.set('NOT_FOUND', { statusCode: 404, name: 'NotFoundError' });
errorCodeCache.set('UNAUTHORIZED', { statusCode: 401, name: 'UnauthorizedError' });
errorCodeCache.set('FORBIDDEN', { statusCode: 403, name: 'ForbiddenError' });
errorCodeCache.set('CONFLICT', { statusCode: 409, name: 'ConflictError' });
errorCodeCache.set('TOO_MANY_REQUESTS', { statusCode: 429, name: 'TooManyRequestsError' });
errorCodeCache.set('INTERNAL_SERVER_ERROR', { statusCode: 500, name: 'InternalServerError' });
errorCodeCache.set('SERVICE_UNAVAILABLE', { statusCode: 503, name: 'ServiceUnavailableError' });
errorCodeCache.set('BAD_REQUEST', { statusCode: 400, name: 'BadRequestError' });

export class NofaultError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly requestId?: string;
  
  // Lazy stack trace - only captured when accessed
  private _stack?: string;
  private _captureStackTrace: boolean;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: Record<string, unknown>,
    requestId?: string,
    captureStackTrace = true
  ) {
    super(message);
    this.name = 'NofaultError';
    this.code = code;
    
    // Use cached status code if available, otherwise use provided or default
    const cached = errorCodeCache.get(code);
    this.statusCode = statusCode ?? cached?.statusCode ?? 500;
    if (cached && !statusCode) {
      this.name = cached.name;
    }
    
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;
    this._captureStackTrace = captureStackTrace;

    Object.setPrototypeOf(this, NofaultError.prototype);
  }

  // Lazy stack trace - only capture when accessed
  get stack(): string {
    if (this._stack === undefined && this._captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
      this._stack = super.stack;
    }
    return this._stack ?? '';
  }

  set stack(value: string) {
    this._stack = value;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
    };
  }
}

export class ValidationError extends NofaultError {
  public readonly field?: string;
  public readonly constraints?: Record<string, string>;

  constructor(
    message: string,
    field?: string,
    constraints?: Record<string, string>,
    requestId?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, constraints }, requestId);
    this.field = field;
    this.constraints = constraints;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends NofaultError {
  constructor(resource: string, identifier?: string, requestId?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { resource, identifier }, requestId);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends NofaultError {
  constructor(message = 'Unauthorized', requestId?: string) {
    super(message, 'UNAUTHORIZED', 401, undefined, requestId);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends NofaultError {
  constructor(message = 'Forbidden', requestId?: string) {
    super(message, 'FORBIDDEN', 403, undefined, requestId);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends NofaultError {
  constructor(message: string, requestId?: string) {
    super(message, 'CONFLICT', 409, undefined, requestId);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class TooManyRequestsError extends NofaultError {
  public readonly retryAfter?: number;

  constructor(message = 'Too many requests', retryAfter?: number, requestId?: string) {
    super(message, 'TOO_MANY_REQUESTS', 429, { retryAfter }, requestId);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

export class InternalServerError extends NofaultError {
  constructor(message = 'Internal server error', requestId?: string) {
    super(message, 'INTERNAL_SERVER_ERROR', 500, undefined, requestId);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

export class ServiceUnavailableError extends NofaultError {
  public readonly retryAfter?: number;

  constructor(message = 'Service temporarily unavailable', retryAfter?: number, requestId?: string) {
    super(message, 'SERVICE_UNAVAILABLE', 503, { retryAfter }, requestId);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class GatewayTimeoutError extends NofaultError {
  constructor(message = 'Gateway timeout', requestId?: string) {
    super(message, 'GATEWAY_TIMEOUT', 504, undefined, requestId);
    Object.setPrototypeOf(this, GatewayTimeoutError.prototype);
  }
}

export class CircuitBreakerOpenError extends NofaultError {
  public readonly resetTime?: Date;

  constructor(message = 'Circuit breaker is open', resetTime?: Date, requestId?: string) {
    super(message, 'CIRCUIT_BREAKER_OPEN', 503, { resetTime }, requestId);
    this.resetTime = resetTime;
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

export class RateLimitExceededError extends NofaultError {
  public readonly limit: number;
  public readonly remaining: number;
  public readonly resetTime: Date;

  constructor(limit: number, remaining: number, resetTime: Date, requestId?: string) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, { limit, remaining, resetTime }, requestId);
    this.limit = limit;
    this.remaining = remaining;
    this.resetTime = resetTime;
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

export class ConfigurationError extends NofaultError {
  constructor(message: string, requestId?: string) {
    super(message, 'CONFIGURATION_ERROR', 500, undefined, requestId);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class DependencyError extends NofaultError {
  public readonly dependency: string;

  constructor(message: string, dependency: string, requestId?: string) {
    super(message, 'DEPENDENCY_ERROR', 500, { dependency }, requestId);
    this.dependency = dependency;
    Object.setPrototypeOf(this, DependencyError.prototype);
  }
}

export class SerializationError extends NofaultError {
  constructor(message: string, requestId?: string) {
    super(message, 'SERIALIZATION_ERROR', 500, undefined, requestId);
    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

export class DeserializationError extends NofaultError {
  constructor(message: string, requestId?: string) {
    super(message, 'DESERIALIZATION_ERROR', 400, undefined, requestId);
    Object.setPrototypeOf(this, DeserializationError.prototype);
  }
}

export class BadRequestError extends NofaultError {
  constructor(message = 'Bad request', requestId?: string) {
    super(message, 'BAD_REQUEST', 400, undefined, requestId);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class RequestTimeoutError extends NofaultError {
  constructor(message = 'Request timeout', requestId?: string) {
    super(message, 'REQUEST_TIMEOUT', 408, undefined, requestId);
    Object.setPrototypeOf(this, RequestTimeoutError.prototype);
  }
}

export class NotAcceptableError extends NofaultError {
  constructor(message = 'Not acceptable', requestId?: string) {
    super(message, 'NOT_ACCEPTABLE', 406, undefined, requestId);
    Object.setPrototypeOf(this, NotAcceptableError.prototype);
  }
}

export class GoneError extends NofaultError {
  constructor(message = 'Resource gone', requestId?: string) {
    super(message, 'GONE', 410, undefined, requestId);
    Object.setPrototypeOf(this, GoneError.prototype);
  }
}

export class PayloadTooLargeError extends NofaultError {
  constructor(message = 'Payload too large', requestId?: string) {
    super(message, 'PAYLOAD_TOO_LARGE', 413, undefined, requestId);
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export class UnsupportedMediaTypeError extends NofaultError {
  constructor(message = 'Unsupported media type', requestId?: string) {
    super(message, 'UNSUPPORTED_MEDIA_TYPE', 415, undefined, requestId);
    Object.setPrototypeOf(this, UnsupportedMediaTypeError.prototype);
  }
}

export class UnprocessableEntityError extends NofaultError {
  constructor(message = 'Unprocessable entity', details?: Record<string, unknown>, requestId?: string) {
    super(message, 'UNPROCESSABLE_ENTITY', 422, details, requestId);
    Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
  }
}

export class LockedError extends NofaultError {
  constructor(message = 'Resource locked', requestId?: string) {
    super(message, 'LOCKED', 423, undefined, requestId);
    Object.setPrototypeOf(this, LockedError.prototype);
  }
}

export class FailedDependencyError extends NofaultError {
  constructor(message = 'Failed dependency', requestId?: string) {
    super(message, 'FAILED_DEPENDENCY', 424, undefined, requestId);
    Object.setPrototypeOf(this, FailedDependencyError.prototype);
  }
}

export class PreconditionFailedError extends NofaultError {
  constructor(message = 'Precondition failed', requestId?: string) {
    super(message, 'PRECONDITION_FAILED', 412, undefined, requestId);
    Object.setPrototypeOf(this, PreconditionFailedError.prototype);
  }
}

export class RequestHeaderFieldsTooLargeError extends NofaultError {
  constructor(message = 'Request header fields too large', requestId?: string) {
    super(message, 'REQUEST_HEADER_FIELDS_TOO_LARGE', 431, undefined, requestId);
    Object.setPrototypeOf(this, RequestHeaderFieldsTooLargeError.prototype);
  }
}

export class MethodNotAllowedError extends NofaultError {
  constructor(message = 'Method not allowed', requestId?: string) {
    super(message, 'METHOD_NOT_ALLOWED', 405, undefined, requestId);
    Object.setPrototypeOf(this, MethodNotAllowedError.prototype);
  }
}

export class NotExtendedError extends NofaultError {
  constructor(message = 'Not extended', requestId?: string) {
    super(message, 'NOT_EXTENDED', 510, undefined, requestId);
    Object.setPrototypeOf(this, NotExtendedError.prototype);
  }
}

export class NetworkAuthenticationRequiredError extends NofaultError {
  constructor(message = 'Network authentication required', requestId?: string) {
    super(message, 'NETWORK_AUTHENTICATION_REQUIRED', 511, undefined, requestId);
    Object.setPrototypeOf(this, NetworkAuthenticationRequiredError.prototype);
  }
}

export function isNofaultError(error: unknown): error is NofaultError {
  return error instanceof NofaultError;
}

export function isRetryableError(error: unknown): boolean {
  if (!isNofaultError(error)) return false;

  const retryableCodes = [
    'SERVICE_UNAVAILABLE',
    'GATEWAY_TIMEOUT',
    'CIRCUIT_BREAKER_OPEN',
    'TOO_MANY_REQUESTS',
    'DEPENDENCY_ERROR',
  ];

  return retryableCodes.includes(error.code);
}