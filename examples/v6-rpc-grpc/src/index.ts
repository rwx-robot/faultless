import 'reflect-metadata';
import { Controller, Get, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  GrpcServer,
  createGrpcServer,
  GrpcClient,
  createGrpcClient,
  ProtobufHelper,
  createProtobufHelper,
  RpcAuth,
  createRpcAuth,
  ConnectionPool,
  createConnectionPool,
} from '@faultless/rpc';

const logger = createLogger({ level: 'info', serviceName: 'v6-rpc-example' });

// In-memory user store
const users = new Map<string, { id: string; name: string; email: string; createdAt: string }>();
users.set('1', { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() });
users.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date().toISOString() });

// gRPC Service Implementation
const userServiceImplementation = {
  getUser: async (call: any, callback: any) => {
    const { id } = call.request;
    const user = users.get(id);
    if (!user) {
      callback({
        code: 5, // NOT_FOUND
        message: `User ${id} not found`,
      });
      return;
    }
    callback(null, user);
  },

  listUsers: async (call: any, callback: any) => {
    const { page = 1, pageSize = 10 } = call.request;
    const allUsers = Array.from(users.values());
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedUsers = allUsers.slice(start, end);

    callback(null, {
      users: paginatedUsers,
      total: allUsers.length,
    });
  },

  createUser: async (call: any, callback: any) => {
    const { name, email } = call.request;
    const id = String(users.size + 1);
    const user = {
      id,
      name,
      email,
      createdAt: new Date().toISOString(),
    };
    users.set(id, user);
    callback(null, user);
  },

  streamUsers: async (call: any) => {
    const { count = 5 } = call.request;
    const allUsers = Array.from(users.values());

    for (let i = 0; i < Math.min(count, allUsers.length); i++) {
      call.write(allUsers[i]);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    call.end();
  },
};

@Injectable()
class RpcController {
  private grpcServer: GrpcServer;
  private grpcClient: GrpcClient;
  private protobufHelper: ProtobufHelper;
  private auth: RpcAuth;
  private connectionPool: ConnectionPool;

  constructor() {
    this.protobufHelper = createProtobufHelper();
    this.auth = createRpcAuth();
    this.connectionPool = createConnectionPool({
      target: 'localhost:50051',
      minConnections: 2,
      maxConnections: 5,
    });

    this.grpcServer = createGrpcServer({
      port: 50051,
      host: '0.0.0.0',
      maxReceiveMessageLength: 4 * 1024 * 1024,
    });

    this.grpcClient = createGrpcClient({
      target: 'localhost:50051',
      connectionPool: {
        minConnections: 2,
        maxConnections: 5,
        idleTimeoutMs: 60000,
      },
    });
  }

  async startServer() {
    // Load proto file
    const protoPath = './proto/user.proto';
    await this.grpcServer.addServiceFromProto(protoPath, 'userservice.UserService', userServiceImplementation);
    await this.grpcServer.start();
    logger.info('gRPC server started on port 50051');
  }

  async testClient() {
    try {
      // Test GetUser
      const user = await this.grpcClient.unary('/userservice.UserService/GetUser', { id: '1' });
      logger.info('GetUser result', { user });

      // Test ListUsers
      const users = await this.grpcClient.unary('/userservice.UserService/ListUsers', { page: 1, pageSize: 10 });
      logger.info('ListUsers result', { users });

      // Test CreateUser
      const newUser = await this.grpcClient.unary('/userservice.UserService/CreateUser', {
        name: 'Bob Wilson',
        email: 'bob@example.com',
      });
      logger.info('CreateUser result', { user: newUser });

      return {
        getUser: user,
        listUsers: users,
        createUser: newUser,
      };
    } catch (error) {
      logger.error('Client test failed', { error: (error as Error).message });
      throw error;
    }
  }

  getServerStatus() {
    return {
      address: this.grpcServer.getAddress(),
      services: this.grpcServer.getServices().length,
      connectionPool: this.connectionPool.getStats(),
    };
  }

  async stopServer() {
    await this.grpcServer.stop();
    await this.grpcClient.close();
    await this.connectionPool.close();
  }
}

@Controller('rpc')
class RpcStatusController {
  constructor(private rpcController: RpcController) {}

  @Get('status')
  getStatus() {
    return this.rpcController.getServerStatus();
  }

  @Get('test')
  async testClient() {
    return this.rpcController.testClient();
  }
}

@Module({
  controllers: [RpcStatusController],
  providers: [RpcController],
})
class AppModule {}

async function main() {
  const rpcController = new RpcController();

  try {
    // Start gRPC server
    await rpcController.startServer();

    // Start HTTP server for status
    await runApplication({
      modules: [AppModule],
      serverOptions: {
        port: parseInt(process.env.PORT ?? '3000', 10),
        host: process.env.HOST ?? '0.0.0.0',
        logger: { level: 'info' },
      },
    });
  } catch (error) {
    logger.error('Failed to start', { error: (error as Error).message });
    process.exit(1);
  }
}

main().catch(console.error);