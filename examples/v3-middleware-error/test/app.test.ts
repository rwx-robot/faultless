import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApplication } from '@faultless/http';
import { CircuitBreaker, createCircuitBreaker } from '@faultless/breaker';
import { RateLimiter, createRateLimiter } from '@faultless/limit';
import { MemoryHealthIndicator, CustomHealthIndicator } from '@faultless/http';
import { Controller, Get, Post, Body, Param, Module, Injectable } from '@faultless/core';

describe('v3-middleware-error example', () => {
  let app: any;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Circuit Breaker', () => {
    it('should create circuit breaker and track state', async () => {
      const breaker = createCircuitBreaker({
        name: 'test-breaker',
        threshold: 3,
        timeout: 1000,
        resetTimeout: 1000,
      });

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failures).toBe(0);

      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow('fail');

      expect(breaker.getStats().failures).toBe(1);
    });

    it('should open after threshold failures', async () => {
      const breaker = createCircuitBreaker({
        name: 'test-breaker-2',
        threshold: 2,
        timeout: 1000,
        resetTimeout: 1000,
      });

      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow('fail');
      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow('fail');

      expect(breaker.getState()).toBe('open');
    });

    it('should use fallback when open', async () => {
      const breaker = createCircuitBreaker({
        name: 'test-breaker-3',
        threshold: 1,
        timeout: 1000,
        resetTimeout: 1000,
        fallback: async (error) => ({ fallback: true, error: error.message }),
      });

      await breaker.execute(async () => { throw new Error('fail'); });
      const result = await breaker.execute(async () => { throw new Error('fail'); });

      expect(result).toEqual({ fallback: true, error: 'fail' });
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = createCircuitBreaker({
        name: 'test-breaker-4',
        threshold: 1,
        timeout: 1000,
        resetTimeout: 50,
      });

      await breaker.execute(async () => { throw new Error('fail'); });
      expect(breaker.getState()).toBe('open');

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(breaker.getState()).toBe('half_open');

      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Rate Limiter', () => {
    it('should create rate limiter and track requests', async () => {
      const limiter = createRateLimiter({
        name: 'test-limiter',
        windowMs: 60000,
        max: 5,
      });

      for (let i = 0; i < 5; i++) {
        const result = await limiter.consume('test-key');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      const result = await limiter.consume('test-key');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after window', async () => {
      const limiter = createRateLimiter({
        name: 'test-limiter-2',
        windowMs: 50,
        max: 2,
      });

      await limiter.consume('test-key');
      await limiter.consume('test-key');
      const result = await limiter.consume('test-key');
      expect(result.allowed).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));

      const result2 = await limiter.consume('test-key');
      expect(result2.allowed).toBe(true);
    });

    it('should support different keys independently', async () => {
      const limiter = createRateLimiter({
        name: 'test-limiter-3',
        windowMs: 60000,
        max: 2,
      });

      await limiter.consume('key1');
      await limiter.consume('key1');
      const result1 = await limiter.consume('key1');
      expect(result1.allowed).toBe(false);

      const result2 = await limiter.consume('key2');
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Health Checks', () => {
    it('should check memory health', async () => {
      const indicator = new MemoryHealthIndicator({ heapUsedThreshold: 0.9 });
      const result = await indicator.isHealthy();

      expect(result.status).toBe('ok');
      expect(result.details).toHaveProperty('heapUsed');
      expect(result.details).toHaveProperty('heapTotal');
    });

    it('should check custom health', async () => {
      const indicator = new CustomHealthIndicator({
        name: 'test',
        check: async () => ({
          status: 'ok',
          details: { custom: true },
          timestamp: new Date(),
        }),
      });

      const result = await indicator.isHealthy();
      expect(result.status).toBe('ok');
      expect(result.details.custom).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should run full application with circuit breaker and rate limiting', async () => {
      @Injectable()
      class TestService {
        private breaker = createCircuitBreaker({
          name: 'integration-test',
          threshold: 2,
          resetTimeout: 1000,
        });

        async callWithBreaker(shouldFail: boolean) {
          return this.breaker.execute(async () => {
            if (shouldFail) throw new Error('Service error');
            return { success: true };
          });
        }

        getBreakerStats() {
          return this.breaker.getStats();
        }
      }

      @Controller('test')
      class TestController {
        constructor(private service: TestService) {}

        @Get('success')
        async success() {
          return this.service.callWithBreaker(false);
        }

        @Get('fail')
        async fail() {
          return this.service.callWithBreaker(true);
        }

        @Get('breaker-stats')
        breakerStats() {
          return this.service.getBreakerStats();
        }
      }

      @Module({
        controllers: [TestController],
        providers: [TestService],
      })
      class TestModule {}

      app = await createApplication({
        modules: [TestModule],
        serverOptions: { port: 0, logger: false },
      });

      await app.listen();

      // Successful call
      const successResponse = await app.getServer().getApp().inject({
        method: 'GET',
        url: '/test/success',
      });
      expect(successResponse.statusCode).toBe(200);

      // Failed calls to trigger circuit breaker
      await app.getServer().getApp().inject({ method: 'GET', url: '/test/fail' });
      await app.getServer().getApp().inject({ method: 'GET', url: '/test/fail' });

      const statsResponse = await app.getServer().getApp().inject({
        method: 'GET',
        url: '/test/breaker-stats',
      });
      const stats = JSON.parse(statsResponse.payload);
      expect(stats.state).toBe('open');
    });

    it('should enforce rate limits', async () => {
      @Injectable()
      class RateLimitService {
        private limiter = createRateLimiter({
          name: 'integration-ratelimit',
          windowMs: 60000,
          max: 3,
        });

        async consume(key: string) {
          return this.limiter.consume(key);
        }
      }

      @Controller('ratelimit')
      class RateLimitController {
        constructor(private service: RateLimitService) {}

        @Get('consume')
        async consume(@Param('key') key: string) {
          return this.service.consume(key);
        }
      }

      @Module({
        controllers: [RateLimitController],
        providers: [RateLimitService],
      })
      class RateLimitModule {}

      app = await createApplication({
        modules: [RateLimitModule],
        serverOptions: { port: 0, logger: false },
      });

      await app.listen();

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const response = await app.getServer().getApp().inject({
          method: 'GET',
          url: '/ratelimit/consume?key=test',
        });
        expect(response.statusCode).toBe(200);
      }

      // 4th request should be rate limited
      const limitedResponse = await app.getServer().getApp().inject({
        method: 'GET',
        url: '/ratelimit/consume?key=test',
      });
      expect(limitedResponse.statusCode).toBe(429);
    });
  });
});