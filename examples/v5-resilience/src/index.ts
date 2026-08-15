import 'reflect-metadata';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';
import { createApplication, runApplication } from '@faultless/http';
import { createLogger } from '@faultless/log';
import {
  Bulkhead,
  createBulkhead,
  Deadline,
  FaultInjectionEngine,
  createFaultInjectionEngine,
  FaultScenarios,
  SmartRetryEngine,
  createSmartRetryEngine,
  RetryStrategy,
  bulkheadRegistry,
} from '@faultless/resilience';
import { CircuitBreaker, createCircuitBreaker } from '@faultless/breaker';

const logger = createLogger({ level: 'info', serviceName: 'v5-resilience-example' });

// Initialize engines
const faultEngine = createFaultInjectionEngine();
const retryEngine = createSmartRetryEngine({
  strategy: RetryStrategy.EXPONENTIAL,
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  circuitBreakerAware: true,
});

@Injectable()
class PaymentService {
  private bulkhead: Bulkhead;
  private circuitBreaker: CircuitBreaker;
  private callCount = 0;

  constructor() {
    this.bulkhead = createBulkhead({
      name: 'payment-service',
      maxConcurrent: 5,
      maxQueued: 10,
      timeoutMs: 10000,
    });

    this.circuitBreaker = createCircuitBreaker({
      name: 'payment-gateway',
      threshold: 5,
      resetTimeout: 30000,
    });

    bulkheadRegistry.getOrCreate('payment-service', {
      maxConcurrent: 5,
      maxQueued: 10,
    });
  }

  async processPayment(amount: number): Promise<{ success: boolean; transactionId: string }> {
    return this.bulkhead.execute(async () => {
      this.callCount++;
      logger.info('Processing payment', { amount, callCount: this.callCount });

      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate occasional failures (10%)
      if (Math.random() < 0.1) {
        throw new Error('Payment gateway timeout');
      }

      return {
        success: true,
        transactionId: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
    });
  }

  getBulkheadState() {
    return this.bulkhead.getState();
  }
}

@Injectable()
class OrderService {
  private retryEngine: SmartRetryEngine;

  constructor(private paymentService: PaymentService) {
    this.retryEngine = createSmartRetryEngine({
      strategy: RetryStrategy.EXPONENTIAL,
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 5000,
      circuitBreakerAware: true,
    });
  }

  async createOrder(order: { userId: string; items: string[]; amount: number }) {
    const deadline = Deadline.fromHeaders({}, 5000);

    const result = await this.retryEngine.execute(
      async () => {
        return this.paymentService.processPayment(order.amount);
      },
      {
        path: '/payment',
        method: 'POST',
        circuitBreaker: (this.paymentService as any).circuitBreaker,
        deadline: deadline,
      }
    );

    return {
      order: {
        id: `order-${Date.now()}`,
        ...order,
        payment: result.result,
      },
      retryInfo: {
        attempts: result.attempts.length,
        totalDurationMs: result.totalDurationMs,
      },
    };
  }
}

@Controller('payment')
class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('process')
  async processPayment(@Body() body: { amount: number }) {
    return this.paymentService.processPayment(body.amount);
  }

  @Get('status')
  getPaymentStatus() {
    return {
      bulkhead: this.paymentService.getBulkheadState(),
      circuitBreaker: 'payment-gateway',
    };
  }
}

@Controller('orders')
class OrdersController {
  constructor(private orderService: OrderService) {}

  @Post()
  async createOrder(@Body() body: { userId: string; items: string[]; amount: number }) {
    return this.orderService.createOrder(body);
  }
}

@Controller('faults')
class FaultsController {
  constructor(private faultEngine: FaultInjectionEngine) {}

  @Get('stats')
  getStats() {
    return this.faultEngine.getStats();
  }

  @Get('history')
  getHistory() {
    return this.faultEngine.getHistory();
  }

  @Post('register')
  registerFault(@Body() body: { id: string; type: string; condition?: any; config: any }) {
    this.faultEngine.register(body.id, body as any);
    return { success: true };
  }

  @Post('clear')
  clearFaults() {
    this.faultEngine.clear();
    return { success: true };
  }
}

@Controller('resilience')
class ResilienceController {
  @Get('bulkheads')
  getBulkheads() {
    return bulkheadRegistry.getAllStates();
  }

  @Get('health')
  async getHealth() {
    const bulkheads = bulkheadRegistry.getAllStates();
    const faults = faultEngine.getStats();

    return {
      bulkheads,
      faultInjection: faults,
      healthy: Object.values(bulkheads).every(b => b.state !== 'OPEN'),
    };
  }
}

@Controller('timeout')
class TimeoutController {
  @Get('demo')
  async timeoutDemo() {
    const deadline = Deadline.fromHeaders({}, 1000);
    const downstream = deadline.createDownstream({ bufferMs: 100 });

    return {
      original: deadline.getState(),
      downstream: downstream.getState(),
      remainingBudget: downstream.remainingMs,
    };
  }
}

@Module({
  controllers: [
    PaymentController,
    OrdersController,
    FaultsController,
    ResilienceController,
    TimeoutController,
  ],
  providers: [PaymentService, OrderService],
})
class AppModule {}

async function main() {
  // Register some fault injection scenarios
  faultEngine.register('latency-test', FaultScenarios.latency500ms());
  faultEngine.register('error-test', FaultScenarios.errorOnApi());
  faultEngine.register('timeout-test', FaultScenarios.timeout30Percent());

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