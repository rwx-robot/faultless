import { describe, it, expect, vi } from 'vitest';
import {
  compressionMiddleware,
  requestLoggerMiddleware,
  securityHeadersMiddleware,
  responseTimeMiddleware,
  timeoutMiddleware,
  sizeLimitMiddleware,
} from '../src/middleware';

function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    url: '/test',
    headers: {},
    raw: {},
    ...overrides,
  } as any;
}

function createMockReply() {
  const state = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    sent: false,
  };

  const reply = {
    header: (key: string, value: string) => { state.headers[key] = value; return reply; },
    status: (code: number) => { state.statusCode = code; return reply; },
    send: () => { state.sent = true; return reply; },
    raw: null as any,
  };

  return Object.defineProperty(reply, 'headers', { get: () => state.headers }) as any &
    { _state: typeof state };
}

describe('Compression Middleware', () => {
  it('should call next when accept-encoding does not match', async () => {
    const middleware = compressionMiddleware({ algorithm: 'gzip' });
    const request = createMockRequest({ headers: { 'accept-encoding': 'deflate' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when accept-encoding contains gzip', async () => {
    const middleware = compressionMiddleware({ algorithm: 'gzip' });
    const request = createMockRequest({ headers: { 'accept-encoding': 'gzip, deflate' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should use default options', async () => {
    const middleware = compressionMiddleware();
    const request = createMockRequest({ headers: { 'accept-encoding': 'gzip' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should work with deflate algorithm', async () => {
    const middleware = compressionMiddleware({ algorithm: 'deflate' });
    const request = createMockRequest({ headers: { 'accept-encoding': 'deflate' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should work with br algorithm', async () => {
    const middleware = compressionMiddleware({ algorithm: 'br' });
    const request = createMockRequest({ headers: { 'accept-encoding': 'br' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('Request Logger Middleware', () => {
  it('should call next and log at info level', async () => {
    const middleware = requestLoggerMiddleware({ level: 'info' });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip excluded paths', async () => {
    const middleware = requestLoggerMiddleware({ excludePaths: ['/health', '/metrics'] });
    const request = createMockRequest({ url: '/health/check' });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should log slow requests as warning', async () => {
    const middleware = requestLoggerMiddleware({ slowThreshold: 10 });
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should use debug level when specified', async () => {
    const middleware = requestLoggerMiddleware({ level: 'debug' });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should use warn level when specified', async () => {
    const middleware = requestLoggerMiddleware({ level: 'warn' });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should strip query string from path for exclusion check', async () => {
    const middleware = requestLoggerMiddleware({ excludePaths: ['/api'] });
    const request = createMockRequest({ url: '/api?key=value' });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('Security Headers Middleware', () => {
  it('should set all security headers by default', async () => {
    const middleware = securityHeadersMiddleware();
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(reply.headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(reply.headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(reply.headers['Content-Security-Policy']).toBe("default-src 'self'");
    expect(reply.headers['X-Frame-Options']).toBe('DENY');
    expect(reply.headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(next).toHaveBeenCalled();
  });

  it('should allow disabling content security policy', async () => {
    const middleware = securityHeadersMiddleware({ contentSecurityPolicy: false });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Content-Security-Policy']).toBeUndefined();
    expect(reply.headers['X-Frame-Options']).toBe('DENY');
  });

  it('should allow disabling HSTS', async () => {
    const middleware = securityHeadersMiddleware({ hsts: false });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('should allow disabling noSniff', async () => {
    const middleware = securityHeadersMiddleware({ noSniff: false });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Content-Type-Options']).toBeUndefined();
  });

  it('should allow disabling xssFilter', async () => {
    const middleware = securityHeadersMiddleware({ xssFilter: false });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-XSS-Protection']).toBeUndefined();
  });

  it('should always set frame-options and referrer-policy', async () => {
    const middleware = securityHeadersMiddleware({
      contentSecurityPolicy: false,
      hsts: false,
      noSniff: false,
      xssFilter: false,
    });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Frame-Options']).toBe('DENY');
    expect(reply.headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('Response Time Middleware', () => {
  it('should set X-Response-Time header', async () => {
    const middleware = responseTimeMiddleware();
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Response-Time']).toBeDefined();
    expect(reply.headers['X-Response-Time']).toMatch(/^\d+\.\d+ms$/);
    expect(next).toHaveBeenCalled();
  });

  it('should measure actual processing time', async () => {
    const middleware = responseTimeMiddleware();
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    await middleware(request, reply, next);

    const duration = parseFloat(reply.headers['X-Response-Time']);
    expect(duration).toBeGreaterThanOrEqual(10);
  });

  it('should call next exactly once', async () => {
    const middleware = responseTimeMiddleware();
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('Timeout Middleware', () => {
  it('should call next when it completes before timeout', async () => {
    const middleware = timeoutMiddleware({ timeout: 1000 });
    const request = createMockRequest();
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should throw NofaultError when timeout exceeded', async () => {
    const middleware = timeoutMiddleware({ timeout: 10 });
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await expect(middleware(request, reply, next)).rejects.toThrow('Request timeout');
  });

  it('should use custom error message', async () => {
    const middleware = timeoutMiddleware({ timeout: 10, message: 'Custom timeout message' });
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await expect(middleware(request, reply, next)).rejects.toThrow('Custom timeout message');
  });

  it('should use default message when not specified', async () => {
    const middleware = timeoutMiddleware({ timeout: 10 });
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await expect(middleware(request, reply, next)).rejects.toThrow('Request timeout');
  });

  it('should propagate non-timeout errors', async () => {
    const middleware = timeoutMiddleware({ timeout: 1000 });
    const request = createMockRequest();
    const reply = createMockReply();

    const next = vi.fn(async () => {
      throw new Error('Some other error');
    });

    await expect(middleware(request, reply, next)).rejects.toThrow('Some other error');
  });
});

describe('Size Limit Middleware', () => {
  it('should allow requests within size limit', async () => {
    const middleware = sizeLimitMiddleware({ limit: '1mb' });
    const request = createMockRequest({ headers: { 'content-length': '500000' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject requests exceeding size limit', async () => {
    const middleware = sizeLimitMiddleware({ limit: '1kb' });
    const request = createMockRequest({ headers: { 'content-length': '2000' } });
    const reply = createMockReply();
    const next = vi.fn();

    await expect(middleware(request, reply, next)).rejects.toThrow('Request body too large');
  });

  it('should parse kb units', async () => {
    const middleware = sizeLimitMiddleware({ limit: '10kb' });
    const request = createMockRequest({ headers: { 'content-length': '10240' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should parse mb units', async () => {
    const middleware = sizeLimitMiddleware({ limit: '5mb' });
    const request = createMockRequest({ headers: { 'content-length': '5242880' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should parse gb units', async () => {
    const middleware = sizeLimitMiddleware({ limit: '1gb' });
    const request = createMockRequest({ headers: { 'content-length': '1073741824' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should parse bytes (b) units', async () => {
    const middleware = sizeLimitMiddleware({ limit: '500b' });
    const request = createMockRequest({ headers: { 'content-length': '500' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should handle missing content-length header', async () => {
    const middleware = sizeLimitMiddleware({ limit: '1kb' });
    const request = createMockRequest({ headers: {} });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should throw with correct error code', async () => {
    const middleware = sizeLimitMiddleware({ limit: '100b' });
    const request = createMockRequest({ headers: { 'content-length': '200' } });
    const reply = createMockReply();
    const next = vi.fn();

    try {
      await middleware(request, reply, next);
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(error.statusCode).toBe(413);
    }
  });
});
