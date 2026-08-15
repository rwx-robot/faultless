import { bench, describe, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { HttpServer, createServer } from '@faultless/http';
import type { RouteOptions } from '@faultless/http';

const PORT = 0;
const ITERATIONS = 1000;

// ─── Raw Fastify baseline ────────────────────────────────────────────────────
let rawApp: ReturnType<typeof Fastify>;
let rawAddress: string;

// ─── Faultless HttpServer ──────────────────────────────────────────────────────
let FaultlessServer: HttpServer;
let FaultlessAddress: string;

function makeBody() {
  return JSON.stringify({ ok: true, ts: Date.now() });
}

beforeAll(async () => {
  // Raw Fastify
  rawApp = Fastify({ logger: false, disableRequestLogging: true });
  rawApp.get('/ping', async () => ({ pong: true }));
  rawApp.get('/echo', async (req) => ({ query: req.query }));
  rawApp.post('/echo', async (req) => req.body);
  rawApp.get('/json', async () => ({
    users: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `user-${i}` })),
  }));
  await rawApp.listen({ port: 0, host: '127.0.0.1' });
  rawAddress = (rawApp.server.address() as any).address === '::1'
    ? `http://[::1]:${(rawApp.server.address() as any).port}`
    : `http://127.0.0.1:${(rawApp.server.address() as any).port}`;

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
  const addr = FaultlessServer.getApp().server.address() as any;
  FaultlessAddress = addr.address === '::1'
    ? `http://[::1]:${addr.port}`
    : `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await rawApp?.close();
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

// ─── Benchmark suites ────────────────────────────────────────────────────────

describe('HTTP GET /ping', () => {
  bench('raw Fastify', async () => {
    await httpGet(`${rawAddress}/ping`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/ping`);
  });
});

describe('HTTP GET /json (50 objects payload)', () => {
  bench('raw Fastify', async () => {
    await httpGet(`${rawAddress}/json`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/json`);
  });
});

describe('HTTP POST /echo', () => {
  const body = makeBody();

  bench('raw Fastify', async () => {
    await httpPost(`${rawAddress}/echo`, body);
  });

  bench('Faultless HttpServer', async () => {
    await httpPost(`${FaultlessAddress}/echo`, body);
  });
});

describe('HTTP GET /echo?foo=bar', () => {
  bench('raw Fastify', async () => {
    await httpGet(`${rawAddress}/echo?foo=bar`);
  });

  bench('Faultless HttpServer', async () => {
    await httpGet(`${FaultlessAddress}/echo?foo=bar`);
  });
});

describe('Concurrent GET /ping (10 parallel)', () => {
  bench('raw Fastify', async () => {
    await Promise.all(Array.from({ length: 10 }, () => httpGet(`${rawAddress}/ping`)));
  });

  bench('Faultless HttpServer', async () => {
    await Promise.all(Array.from({ length: 10 }, () => httpGet(`${FaultlessAddress}/ping`)));
  });
});

describe('Concurrent GET /ping (50 parallel)', () => {
  bench('raw Fastify', async () => {
    await Promise.all(Array.from({ length: 50 }, () => httpGet(`${rawAddress}/ping`)));
  });

  bench('Faultless HttpServer', async () => {
    await Promise.all(Array.from({ length: 50 }, () => httpGet(`${FaultlessAddress}/ping`)));
  });
});
