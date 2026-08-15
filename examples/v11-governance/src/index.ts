import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  ServiceMesh,
  createServiceMesh,
  createConfigCenter,
} from '@faultless/governance';

const logger = createLogger({ level: 'info', serviceName: 'v11-governance' });

// Create service mesh
const mesh = createServiceMesh({
  enabled: true,
  sidecarEnabled: true,
  mutualTlsEnabled: true,
  rateLimitingEnabled: true,
  circuitBreakerEnabled: true,
  loadBalancingStrategy: 'p2c',
});

// Register services
mesh.registerService({
  id: 'user-service-1',
  name: 'user-service',
  host: '127.0.0.1',
  port: 3001,
  protocol: 'http',
  version: '1.0.0',
  metadata: { region: 'us-east-1', zone: 'us-east-1a' },
  status: 'UP',
  registeredAt: new Date(),
  lastHeartbeat: new Date(),
  healthCheck: {
    path: '/health',
    intervalMs: 10000,
  },
});

mesh.registerService({
  id: 'user-service-2',
  name: 'user-service',
  host: '127.0.0.1',
  port: 3002,
  protocol: 'http',
  version: '1.0.0',
  metadata: { region: 'us-east-1', zone: 'us-east-1b' },
  status: 'UP',
  registeredAt: new Date(),
  lastHeartbeat: new Date(),
  healthCheck: {
    path: '/health',
    intervalMs: 10000,
  },
});

mesh.registerService({
  id: 'order-service-1',
  name: 'order-service',
  host: '127.0.0.1',
  port: 4001,
  protocol: 'http',
  version: '1.0.0',
  metadata: { region: 'us-east-1', zone: 'us-east-1a' },
  status: 'UP',
  registeredAt: new Date(),
  lastHeartbeat: new Date(),
  healthCheck: {
    path: '/health',
    intervalMs: 10000,
  },
});

// Create config center
const configCenter = createConfigCenter();

// Set some configs
configCenter.set('user-service.maxConnections', 1000);
configCenter.set('user-service.timeout', 30000);
configCenter.set('order-service.maxConnections', 500);
configCenter.set('order-service.timeout', 15000);

// Add config listener
configCenter.addListener('user-service.maxConnections', (value) => {
  logger.info('Config changed', { key: 'user-service.maxConnections', value });
});

@Injectable()
class GovernanceController {
  @Get('mesh/stats')
  getMeshStats() {
    return mesh.getStats();
  }

  @Get('mesh/config')
  getMeshConfig() {
    return mesh.getConfig();
  }

  @Get('mesh/services')
  getAllServices() {
    return mesh.getAllServices();
  }

  @Get('mesh/services/:name')
  getServicesByName(@Param('name') name: string) {
    return mesh.getServicesByName(name);
  }

  @Get('mesh/healthy')
  getHealthyServices() {
    return mesh.getHealthyServices();
  }

  @Post('mesh/services/:id/heartbeat')
  heartbeat(@Param('id') id: string) {
    return { success: mesh.heartbeat(id) };
  }

  @Post('mesh/services/:id/status')
  updateStatus(@Param('id') id: string, @Body() body: any) {
    mesh.updateServiceStatus(id, body.status);
    return { success: true };
  }

  @Get('config')
  getAllConfig() {
    return configCenter.getAll();
  }

  @Get('config/:key')
  getConfig(@Param('key') key: string) {
    return { value: configCenter.get(key) };
  }

  @Post('config/:key')
  setConfig(@Param('key') key: string, @Body() body: any) {
    configCenter.set(key, body.value);
    return { success: true };
  }

  @Get('config/stats')
  getConfigStats() {
    return configCenter.getStats();
  }
}

@Module({
  controllers: [GovernanceController],
  providers: [],
})
class AppModule {}

async function main() {
  await runApplication({
    modules: [AppModule],
    serverOptions: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logger: { level: 'info' },
    },
  });
}

main().catch(console.error);