import { describe, it, expect, vi } from 'vitest';
import {
  corsMiddleware,
  requestIdMiddleware,
  CorsOptions,
  RequestIdOptions,
} from '../src/middleware';
import type { MiddlewareFunction } from '../src/types';

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
  };

  return Object.defineProperty(reply, 'headers', { get: () => state.headers }) as any &
    { _state: typeof state };
}

describe('CORS Middleware', () => {
  it('should set default CORS headers (allow all)', async () => {
    const middleware = corsMiddleware();
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(reply.headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(reply.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(next).toHaveBeenCalled();
  });

  it('should restrict origin to a specific string', async () => {
    const middleware = corsMiddleware({ origin: 'https://allowed.com' });
    const request = createMockRequest({ headers: { origin: 'https://other.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Origin']).toBe('https://allowed.com');
  });

  it('should restrict origin to an array', async () => {
    const middleware = corsMiddleware({
      origin: ['https://a.com', 'https://b.com'],
    });
    const request = createMockRequest({ headers: { origin: 'https://b.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Origin']).toBe('https://b.com');
  });

  it('should return first origin if request origin not in array', async () => {
    const middleware = corsMiddleware({
      origin: ['https://a.com', 'https://b.com'],
    });
    const request = createMockRequest({ headers: { origin: 'https://c.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Origin']).toBe('https://a.com');
  });

  it('should use function-based origin resolution', async () => {
    const middleware = corsMiddleware({
      origin: (origin) => origin.endsWith('.trusted.com'),
    });
    const request = createMockRequest({ headers: { origin: 'https://sub.trusted.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Origin']).toBe(true);
  });

  it('should return 204 for OPTIONS preflight by default', async () => {
    const middleware = corsMiddleware();
    const request = createMockRequest({ method: 'OPTIONS', headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    // preflightContinue is false by default, so next should NOT be called
    expect(next).not.toHaveBeenCalled();
  });

  it('should continue to next for OPTIONS when preflightContinue is true', async () => {
    const middleware = corsMiddleware({ preflightContinue: true });
    const request = createMockRequest({ method: 'OPTIONS', headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set custom optionsSuccessStatus', async () => {
    const middleware = corsMiddleware({ optionsSuccessStatus: 200 });
    const request = createMockRequest({ method: 'OPTIONS', headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should set maxAge header', async () => {
    const middleware = corsMiddleware({ maxAge: 3600 });
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Max-Age']).toBe('3600');
  });

  it('should set exposedHeaders', async () => {
    const middleware = corsMiddleware({ exposedHeaders: ['X-Custom', 'X-Another'] });
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Expose-Headers']).toBe('X-Custom, X-Another');
  });

  it('should set custom methods', async () => {
    const middleware = corsMiddleware({ methods: ['GET', 'POST'] });
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Methods']).toBe('GET, POST');
  });

  it('should disable credentials', async () => {
    const middleware = corsMiddleware({ credentials: false });
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Credentials']).toBe('false');
  });

  it('should set custom allowedHeaders', async () => {
    const middleware = corsMiddleware({ allowedHeaders: ['X-Custom'] });
    const request = createMockRequest({ headers: { origin: 'https://example.com' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['Access-Control-Allow-Headers']).toBe('X-Custom');
  });
});

describe('Request ID Middleware', () => {
  it('should generate a request ID if none provided', async () => {
    const middleware = requestIdMiddleware();
    const request = createMockRequest({ headers: {} });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).toMatch(/^req_/);
    expect((request as any).requestId).toMatch(/^req_/);
    expect(next).toHaveBeenCalled();
  });

  it('should use provided request ID from header', async () => {
    const middleware = requestIdMiddleware();
    const request = createMockRequest({ headers: { 'x-request-id': 'my-id-123' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).toBe('my-id-123');
    expect((request as any).requestId).toBe('my-id-123');
  });

  it('should use custom header name', async () => {
    const middleware = requestIdMiddleware({ header: 'x-correlation-id' });
    const request = createMockRequest({ headers: { 'x-correlation-id': 'corr-456' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).toBe('corr-456');
    expect((request as any).requestId).toBe('corr-456');
  });

  it('should use custom generator', async () => {
    const middleware = requestIdMiddleware({
      generator: () => 'custom-id-789',
    });
    const request = createMockRequest({ headers: {} });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).toBe('custom-id-789');
  });

  it('should reject untrusted request IDs', async () => {
    const middleware = requestIdMiddleware({
      trusted: (req) => false,
    });
    const request = createMockRequest({ headers: { 'x-request-id': 'untrusted-id' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).not.toBe('untrusted-id');
    expect(reply.headers['X-Request-ID']).toMatch(/^req_/);
  });

  it('should accept trusted request IDs', async () => {
    const middleware = requestIdMiddleware({
      trusted: (req) => true,
    });
    const request = createMockRequest({ headers: { 'x-request-id': 'trusted-id' } });
    const reply = createMockReply();
    const next = vi.fn();

    await middleware(request, reply, next);

    expect(reply.headers['X-Request-ID']).toBe('trusted-id');
  });
});
