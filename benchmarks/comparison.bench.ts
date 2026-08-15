import { bench, describe, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import Express from 'express';
import { HttpServer, createServer } from '@faultless/http';
import type { RouteOptions } from '@faultless/http';

const PORT = 0;

// ─── Framework Instances ────────────────────────────────────────────────────

let rawFastify: ReturnType<typeof Fastify>;
let rawExpress: ReturnType<typeof Express>;
let FaultlessServer: HttpServer;

let fastifyAddress: string;
let expressAddress: string;
let FaultlessAddress: string;

function makeBody() {
  return JSON.stringify({ ok: true, ts: Date.now() });
}

beforeAll(async () => {
  // Raw Fastify (baseline)
  rawFastify = Fastify({ logger: false, disableRequestLogging: true });
  rawFastify.get('/ping', async () => ({ pong: true }));
  rawFastify.get('/echo', async (req) => ({ query: req.query }));
  rawFastify.post('/echo', async (req) => req.body);
  rawFastify.get('/json', async () => ({
    users: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `user-${i}` })),
  }));
  await rawFastify.listen({ port: 0, host: '127.0.0.1' });
  const fastifyAddr = rawFastify.server.address() as any;
  fastifyAddress = fastifyAddr.address === '::1'
    ? `http://[::1]:${fastifyAddr.port}`
    : `http://127.0.0.1:${fastifyAddr.port}`;

  // Raw Express (baseline)
  rawExpress = Express();
  rawExpress.use(Express.json());
  rawExpress.get('/ping', (req, res) => res.json({ pong: true }));
  rawExpress.get('/echo', (req, res) => res.json({ query: req.query }));
  rawExpress.post('/echo', (req, res) => res.json(req.body));
  rawExpress.get('/json', (req, res) => {
    res.json({
      users: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `user-${i}` })),
    });
  });
  await new Promise<void>((resolve) => {
    const server = rawExpress.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      expressAddress = addr.address === '::1'
        ? `http://[::1]:${addr.port}`
        : `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Faultless HttpServer
  FaultlessServer = createServer({ port: 0, host: '127.0.0.1', logger: false });
  FaultlessServer.addRoute({
    method: 'GET',
    url: '/ping',
    handler: async () => ({ pong: true }),
  } as RouteOptions);
  FaultlessServer.addRoute({
    method: 'GET',
    url: '/echo',
    handler: async (req: any) => ({ query: req.query }),
  } as RouteOptions);
  FaultlessServer.addRoute({
    method: 'POST',
    url: '/echo',
    handler: async (req: any) => req.body,
  } as RouteOptions);
  FaultlessServer.addRoute({
    method: 'GET',
    url: '/json',
    handler: async () => ({
      users: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `user-${i}` })),
    }),
  } as RouteOptions);
  await FaultlessServer.listen();
  const FaultlessAddr = FaultlessServer.getApp().server.address() as any;
  FaultlessAddress = FaultlessAddr.address === '::1'
    ? `http://[::1]:${FaultlessAddr.port}`
    : `http://127.0.0.1:${FaultlessAddr.port}`;
});

afterAll(async () => {
  await rawFastify?.close();
  if (rawExpress) {
    await new Promise<void>((resolve) => {
      rawExpress.close(() => resolve());
    });
  }
  await FaultlessServer?.close();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function httpGet(url: string) {
  const res = await fetch(url);
  await res.json();
}

async function httpPost(url: string, body: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  await res.json();
}

// ─── Benchmark Suites ────────────────────────────────────────────────────────

describe('HTTP GET /ping - Framework Comparison', () => {
  bench('Fastify (raw)', async () => {
    await httpGet(`${fastifyAddress}/ping`);
  });

  bench('Express (raw)', async () => {
    await httpGet(`${expressAddress}/ping`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/ping`);
  });
});

describe('HTTP GET /json (50 objects) - Framework Comparison', () => {
  bench('Fastify (raw)', async () => {
    await httpGet(`${fastifyAddress}/json`);
  });

  bench('Express (raw)', async () => {
    await httpGet(`${expressAddress}/json`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/json`);
  });
});

describe('HTTP POST /echo - Framework Comparison', () => {
  const body = makeBody();

  bench('Fastify (raw)', async () => {
    await httpPost(`${fastifyAddress}/echo`, body);
  });

  bench('Express (raw)', async () => {
    await httpPost(`${expressAddress}/echo`, body);
  });

  bench('Faultless HttpServer', async () => {
    await httpPost(`${FaultlessAddress}/echo`, body);
  });
});

describe('Concurrent GET /ping (10 parallel) - Framework Comparison', () => {
  bench('Fastify (raw)', async () => {
    await Promise.all(Array.from({ length: 10 }, () => httpGet(`${fastifyAddress}/ping`)));
  });

  bench('Express (raw)', async () => {
    await Promise.all(Array.from({ length: 10 }, () => httpGet(`${expressAddress}/ping`)));
  });

  bench('Faultless HttpServer', async () => {
    await Promise.all(Array.from({ length: 10 }, () => httpGet(`${FaultlessAddress}/ping`)));
  });
});

describe('Concurrent GET /ping (50 parallel) - Framework Comparison', () => {
  bench('Fastify (raw)', async () => {
    await Promise.all(Array.from({ length: 50 }, () => httpGet(`${fastifyAddress}/ping`)));
  });

  bench('Express (raw)', async () => {
    await Promise.all(Array.from({ length: 50 }, () => httpGet(`${expressAddress}/ping`)));
  });

  bench('Faultless HttpServer', async () => {
    await Promise.all(Array.from({ length: 50 }, () => httpGet(`${FaultlessAddress}/ping`)));
  });
});

describe('Route Matching - Framework Comparison', () => {
  bench('Fastify (raw)', async () => {
    await httpGet(`${fastifyAddress}/echo?foo=bar&baz=qux`);
  });

  bench('Express (raw)', async () => {
    await httpGet(`${expressAddress}/echo?foo=bar&baz=qux`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/echo?foo=bar&baz=qux`);
  });
});
