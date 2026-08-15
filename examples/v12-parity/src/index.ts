import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  Required,
  MinLength,
  MaxLength,
  Min,
  Max,
  Email,
  Pattern,
  validate,
  validateOrThrow,
  ValidationError,
} from '@faultless/validation';
import {
  createMessageQueue,
  QueueType,
} from '@faultless/queue';
import {
  ServiceMesh,
  createServiceMesh,
  ConfigCenter,
  createConfigCenter,
} from '@faultless/governance';

const logger = createLogger({ level: 'info', serviceName: 'v12-parity' });

// Create message queue
const queue = createMessageQueue({
  type: QueueType.IN_MEMORY,
  maxRetries: 3,
  retryDelayMs: 1000,
});

// Create service mesh
const mesh = createServiceMesh();

// Create config center
const configCenter = createConfigCenter();

// User model with validation
class User {
  @Required()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @Required()
  @Email()
  email!: string;

  @Required()
  @Min(18)
  @Max(120)
  age!: number;

  @Pattern(/^[A-Z]{2}\d{6}$/)
  studentId?: string;
}

// Subscribe to user events
queue.subscribe<{ userId: string; action: string }>('user-events', async (message) => {
  logger.info('Processing user event', { userId: message.data.userId, action: message.data.action });
  // Process event
});

@Injectable()
class ValidationController {
  @Post('validate/user')
  validateUser(@Body() body: any) {
    const user = new User();
    Object.assign(user, body);

    const result = validate(user);
    return result;
  }

  @Post('validate/or-throw')
  validateOrThrow(@Body() body: any) {
    const user = new User();
    Object.assign(user, body);

    validateOrThrow(user);
    return { success: true };
  }
}

@Injectable()
class QueueController {
  @Post('queue/publish')
  async publish(@Body() body: { topic: string; data: any }) {
    const message = await queue.publish(body.topic, body.data);
    return message;
  }

  @Get('queue/stats')
  getStats() {
    return queue.getStats();
  }
}

@Injectable()
class GovernanceController {
  @Get('mesh/stats')
  getMeshStats() {
    return mesh.getStats();
  }

  @Get('config/stats')
  getConfigStats() {
    return configCenter.getStats();
  }
}

@Module({
  controllers: [
    ValidationController,
    QueueController,
    GovernanceController,
  ],
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