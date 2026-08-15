import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GrpcServer,
  createGrpcServer,
  GrpcClient,
  createGrpcClient,
  ProtoLoader,
  protoLoader,
  ProtobufHelper,
  createProtobufHelper,
  RpcAuth,
  createRpcAuth,
  SimpleTokenProvider,
  JwtTokenProvider,
  ConnectionPool,
  createConnectionPool,
  connectionPoolManager,
} from '@faultless/rpc';

describe('v6-rpc-grpc example', () => {
  describe('ProtoLoader', () => {
    it('should load proto file', async () => {
      const loader = new ProtoLoader();
      // Note: This would need an actual proto file to test
      expect(loader).toBeDefined();
    });
  });

  describe('ProtobufHelper', () => {
    let helper: ProtobufHelper;

    beforeEach(() => {
      helper = createProtobufHelper();
    });

    it('should load proto from string', () => {
      const proto = `
        syntax = "proto3";
        package test;
        message TestMessage {
          string id = 1;
          string name = 2;
        }
      `;
      const root = helper.loadFromString(proto);
      expect(root).toBeDefined();
    });

    it('should encode and decode message', () => {
      const proto = `
        syntax = "proto3";
        package test;
        message TestMessage {
          string id = 1;
          string name = 2;
        }
      `;
      helper.loadFromString(proto);

      const message = { id: '1', name: 'test' };
      const buffer = helper.encode('test.TestMessage', message);
      const decoded = helper.decode('test.TestMessage', buffer);

      expect(decoded).toEqual(message);
    });

    it('should create message instance', () => {
      const proto = `
        syntax = "proto3";
        package test;
        message TestMessage {
          string id = 1;
          string name = 2;
        }
      `;
      helper.loadFromString(proto);

      const message = helper.create('test.TestMessage', { id: '1' });
      // protobufjs create doesn't include default values for missing fields
      expect(message).toEqual({ id: '1' });
    });

    it('should verify message', () => {
      const proto = `
        syntax = "proto3";
        package test;
        message TestMessage {
          string id = 1;
          string name = 2;
        }
      `;
      helper.loadFromString(proto);

      const validMessage = { id: '1', name: 'test' };
      const result = helper.verify('test.TestMessage', validMessage);
      expect(result).toBeNull();
    });

    it('should parse schema', () => {
      const proto = `
        syntax = "proto3";
        package test;
        message User {
          string id = 1;
          string name = 2;
        }
        message GetUserRequest {
          string id = 1;
        }
        service UserService {
          rpc GetUser (GetUserRequest) returns (User);
        }
        enum Status {
          UNKNOWN = 0;
          ACTIVE = 1;
        }
      `;
      helper.loadFromString(proto);

      const schema = helper.parseSchema();
      expect(schema).not.toBeNull();
      expect(schema!.messages.length).toBe(2); // User + GetUserRequest
      expect(schema!.services.length).toBe(1);
      expect(schema!.enums.length).toBe(1);
    });
  });

  describe('RpcAuth', () => {
    let auth: RpcAuth;

    beforeEach(() => {
      auth = createRpcAuth();
    });

    it('should validate JWT format', () => {
      const validJwt = 'header.payload.signature';
      const invalidJwt = 'invalid';

      expect(auth.validateJwtFormat(validJwt)).toBe(true);
      expect(auth.validateJwtFormat(invalidJwt)).toBe(false);
    });

    it('should extract JWT payload', () => {
      const payload = { sub: '123', name: 'John', exp: 9999999999 };
      const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

      const extracted = auth.extractJwtPayload(token);
      expect(extracted).toEqual(payload);
    });

    it('should check JWT expiration', () => {
      const expiredPayload = { exp: 1000000000 }; // Already expired
      const validPayload = { exp: 9999999999 };

      const expiredToken = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.signature`;
      const validToken = `header.${Buffer.from(JSON.stringify(validPayload)).toString('base64')}.signature`;

      expect(auth.isJwtExpired(expiredToken)).toBe(true);
      expect(auth.isJwtExpired(validToken)).toBe(false);
    });
  });

  describe('SimpleTokenProvider', () => {
    it('should return static token', async () => {
      const provider = new SimpleTokenProvider('my-token');
      const token = await provider.getToken();
      expect(token).toBe('my-token');
    });

    it('should return token from getter', async () => {
      let tokenValue = 'initial';
      const provider = new SimpleTokenProvider(async () => tokenValue);

      expect(await provider.getToken()).toBe('initial');

      tokenValue = 'updated';
      expect(await provider.getToken()).toBe('updated');
    });

    it('should allow setting token', async () => {
      const provider = new SimpleTokenProvider('initial');
      provider.setToken('updated');
      expect(await provider.getToken()).toBe('updated');
    });
  });

  describe('JwtTokenProvider', () => {
    it('should check token expiration', () => {
      const expiredToken = `header.${Buffer.from(JSON.stringify({ exp: 1000000000 })).toString('base64')}.signature`;
      const validToken = `header.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64')}.signature`;

      const provider = new JwtTokenProvider({ token: expiredToken });
      expect(provider.isExpired()).toBe(true);

      provider.setToken(validToken);
      expect(provider.isExpired()).toBe(false);
    });
  });

  describe('ConnectionPool', () => {
    let pool: ConnectionPool;

    afterEach(async () => {
      if (pool) {
        await pool.close();
      }
    });

    it('should create pool with stats', async () => {
      pool = createConnectionPool({
        target: 'localhost:50051',
        minConnections: 2,
        maxConnections: 5,
      });

      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = pool.getStats();
      expect(stats.total).toBe(2);
      expect(stats.idle).toBe(2);
    });

    it('should track connection states', async () => {
      pool = createConnectionPool({
        target: 'localhost:50051',
        minConnections: 1,
        maxConnections: 3,
      });

      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = pool.getStats();
      expect(stats.connections.length).toBe(1);
      expect(stats.connections[0].state).toBe('IDLE');
    });
  });

  describe('ConnectionPoolManager', () => {
    afterEach(async () => {
      await connectionPoolManager.closeAll();
    });

    it('should manage multiple pools', () => {
      const pool1 = connectionPoolManager.getOrCreate('pool1', {
        target: 'localhost:50051',
      });

      const pool2 = connectionPoolManager.getOrCreate('pool2', {
        target: 'localhost:50052',
      });

      expect(connectionPoolManager.get('pool1')).toBe(pool1);
      expect(connectionPoolManager.get('pool2')).toBe(pool2);
    });

    it('should get all stats', () => {
      connectionPoolManager.getOrCreate('stats-pool1', { target: 'localhost:50051' });
      connectionPoolManager.getOrCreate('stats-pool2', { target: 'localhost:50052' });

      const allStats = connectionPoolManager.getAllStats();
      expect(Object.keys(allStats)).toContain('stats-pool1');
      expect(Object.keys(allStats)).toContain('stats-pool2');
    });
  });

  describe('GrpcServer', () => {
    let server: GrpcServer;

    afterEach(async () => {
      if (server) {
        await server.stop();
      }
    });

    it('should create server', () => {
      server = createGrpcServer({ port: 50051 });
      expect(server).toBeDefined();
    });

    it('should track registered services', () => {
      server = createGrpcServer({ port: 50051 });
      const services = server.getServices();
      expect(services).toEqual([]);
    });
  });

  describe('GrpcClient', () => {
    let client: GrpcClient;

    afterEach(async () => {
      if (client) {
        await client.close();
      }
    });

    it('should create client', () => {
      client = createGrpcClient({ target: 'localhost:50051' });
      expect(client).toBeDefined();
      expect(client.getTarget()).toBe('localhost:50051');
    });

    it('should create client with connection pool', () => {
      client = createGrpcClient({
        target: 'localhost:50051',
        connectionPool: {
          minConnections: 2,
          maxConnections: 5,
          idleTimeoutMs: 60000,
        },
      });
      expect(client).toBeDefined();
    });
  });
});