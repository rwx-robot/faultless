import { bench, describe } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  corsMiddleware,
  helmetMiddleware,
  requestIdMiddleware,
  timeoutMiddleware,
  createAuthGuard,
  createRoleGuard,
  createLoggingInterceptor,
  createTransformInterceptor,
  createCacheInterceptor,
  createParseIntPipe,
  createParseFloatPipe,
  createParseBoolPipe,
  createParseArrayPipe,
  createDefaultValuePipe,
  createTransformPipe,
  createAllExceptionsFilter,
  createNotFoundFilter,
  createValidationFilter,
} from '@faultless/http';
import { composeGuards } from '@faultless/http';
import { composePipes } from '@faultless/http';
import { NofaultError, ValidationError, NotFoundError } from '@faultless/core';

// ─── Mock request / reply ────────────────────────────────────────────────────

function mockReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: 'GET',
    url: '/test',
    headers: {},
    query: {},
    params: {},
    body: null,
    ...overrides,
  } as unknown as FastifyRequest;
}

function mockReply(): FastifyReply {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let sent = false;

  return {
    headers,
    statusCode,
    sent,
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(data?: unknown) {
      sent = true;
      return this;
    },
  } as unknown as FastifyReply;
}

// ─── Middleware benchmarks ────────────────────────────────────────────────────

const cors = corsMiddleware();
const reqId = requestIdMiddleware();

describe('Middleware: corsMiddleware', () => {
  bench('single invocation', async () => {
    const req = mockReq();
    const reply = mockReply();
    await cors(req, reply, async () => {});
  });
});

describe('Middleware: helmetMiddleware', () => {
  bench('single invocation', async () => {
    const req = mockReq();
    const reply = mockReply();
    await helmetMiddleware(req, reply, async () => {});
  });
});

describe('Middleware: requestIdMiddleware', () => {
  bench('no existing header', async () => {
    const req = mockReq();
    const reply = mockReply();
    await reqId(req, reply, async () => {});
  });

  bench('with existing header', async () => {
    const req = mockReq({ headers: { 'x-request-id': 'existing-id' } });
    const reply = mockReply();
    await reqId(req, reply, async () => {});
  });
});

describe('Middleware: timeout (5s)', () => {
  const mw = timeoutMiddleware({ timeout: 5000 });

  bench('fast handler', async () => {
    const req = mockReq();
    const reply = mockReply();
    await mw(req, reply, async () => {});
  });
});

describe('Middleware pipeline: cors → helmet → requestId', () => {
  bench('3-middleware pipeline', async () => {
    const req = mockReq();
    const reply = mockReply();

    let called = 0;
    const next = async () => {
      called++;
    };

    await cors(req, reply, async () => {
      await helmetMiddleware(req, reply, async () => {
        await reqId(req, reply, next);
      });
    });
  });
});

// ─── Guard benchmarks ────────────────────────────────────────────────────────

describe('Guard: createRoleGuard (pass)', () => {
  const guard = createRoleGuard(['admin']);

  bench('authorized user', async () => {
    const req = mockReq() as any;
    req.user = { roles: ['admin', 'user'] };
    const reply = mockReply();
    await guard(req, reply);
  });
});

describe('Guard: composeGuards (2 guards, pass)', () => {
  const g1 = createRoleGuard(['admin']);
  const g2 = createRoleGuard(['admin']);
  const composed = composeGuards(g1, g2);

  bench('2 composed guards', async () => {
    const req = mockReq() as any;
    req.user = { roles: ['admin'] };
    const reply = mockReply();
    await composed(req, reply);
  });
});

// ─── Interceptor benchmarks ──────────────────────────────────────────────────

describe('Interceptor: createTransformInterceptor', () => {
  const interceptor = createTransformInterceptor();

  bench('transform response', async () => {
    const req = mockReq();
    const reply = mockReply();
    await interceptor(req, reply, async () => ({ data: 42 }));
  });
});

describe('Interceptor: createCacheInterceptor (miss)', () => {
  const cache = new Map<string, { value: any; expires: number }>();
  const interceptor = createCacheInterceptor(cache);

  bench('cache miss', async () => {
    const req = mockReq();
    const reply = mockReply();
    await interceptor(req, reply, async () => ({ data: 'fresh' }));
  });
});

describe('Interceptor: createCacheInterceptor (hit)', () => {
  const cache = new Map<string, { value: any; expires: number }>();
  cache.set('GET:/test:{}', { value: { data: 'cached' }, expires: Date.now() + 60000 });
  const interceptor = createCacheInterceptor(cache);

  bench('cache hit', async () => {
    const req = mockReq();
    const reply = mockReply();
    await interceptor(req, reply, async () => ({ data: 'fresh' }));
  });
});

// ─── Pipe benchmarks ─────────────────────────────────────────────────────────

describe('Pipe: createParseIntPipe', () => {
  const pipe = createParseIntPipe();

  bench('valid integer string', async () => {
    await pipe('42', {} as any);
  });
});

describe('Pipe: createParseArrayPipe', () => {
  const pipe = createParseArrayPipe();

  bench('comma-separated string', async () => {
    await pipe('a, b, c', {} as any);
  });
});

describe('Pipe: composePipes (3 pipes)', () => {
  const composed = composePipes(
    createDefaultValuePipe(0),
    createParseIntPipe(),
    createTransformPipe((v) => v * 2),
  );

  bench('3 composed pipes', async () => {
    await composed('21', {} as any);
  });
});

// ─── Filter benchmarks ───────────────────────────────────────────────────────

describe('Filter: createAllExceptionsFilter', () => {
  const filter = createAllExceptionsFilter();

  bench('NofaultError', async () => {
    const req = mockReq();
    const reply = mockReply();
    await filter(new NofaultError('test', 'TEST', 500), req, reply);
  });

  bench('plain Error', async () => {
    const req = mockReq();
    const reply = mockReply();
    await filter(new Error('plain'), req, reply);
  });
});

describe('Filter: createNotFoundFilter', () => {
  const filter = createNotFoundFilter();

  bench('NotFoundError match', async () => {
    const req = mockReq();
    const reply = mockReply();
    await filter(new NotFoundError('User', '1'), req, reply);
  });

  bench('non-matching error', async () => {
    const req = mockReq();
    const reply = mockReply();
    await filter(new NofaultError('test', 'TEST', 500), req, reply);
  });
});
