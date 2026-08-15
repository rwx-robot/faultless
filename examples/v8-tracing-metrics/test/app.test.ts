import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TracingService,
  createTracingService,
  TraceExporterType,
} from '@faultless/tracing';
import {
  MetricsService,
  createMetricsService,
  MetricsProviderType,
} from '@faultless/metrics';

describe('v8-tracing-metrics example', () => {
  describe('TracingService', () => {
    let tracing: TracingService;

    beforeEach(() => {
      tracing = createTracingService({
        serviceName: 'test-service',
        exporter: TraceExporterType.CONSOLE,
        sampleRate: 1.0,
      });
    });

    afterEach(async () => {
      await tracing.shutdown();
    });

    it('should create tracing service', () => {
      expect(tracing).toBeDefined();
    });

    it('should start and end span', async () => {
      await tracing.initialize();

      const span = tracing.startSpan('test-span');
      expect(span).toBeDefined();

      span.end();
    });

    it('should execute function within span', async () => {
      await tracing.initialize();

      const result = await tracing.withSpan('test-span', async (span) => {
        return 'result';
      });

      expect(result).toBe('result');
    });

    it('should record exceptions', async () => {
      await tracing.initialize();

      await expect(
        tracing.withSpan('test-span', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should get trace ID', async () => {
      await tracing.initialize();

      await tracing.withSpan('test-span', async () => {
        const traceId = tracing.getTraceId();
        expect(traceId).toBeDefined();
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      });
    });

    it('should create propagation headers', async () => {
      await tracing.initialize();

      await tracing.withSpan('test-span', async () => {
        const headers = tracing.createPropagationHeaders();
        expect(headers).toBeDefined();
      });
    });
  });

  describe('MetricsService', () => {
    let metrics: MetricsService;

    beforeEach(() => {
      metrics = createMetricsService({
        provider: MetricsProviderType.PROMETHEUS,
        prefix: 'test_',
        collectDefaultMetrics: false,
        prometheus: { port: 9091, path: '/metrics' },
      });
    });

    afterEach(async () => {
      await metrics.shutdown();
    });

    it('should create metrics service', () => {
      expect(metrics).toBeDefined();
    });

    it('should create and increment counter', async () => {
      await metrics.initialize();

      const counter = metrics.createCounter('test_counter', 'Test counter', ['status']);
      expect(counter).toBeDefined();

      metrics.incrementCounter('test_counter', { status: 'success' });
      metrics.incrementCounter('test_counter', { status: 'error' });
    });

    it('should create and set gauge', async () => {
      await metrics.initialize();

      const gauge = metrics.createGauge('test_gauge', 'Test gauge');
      expect(gauge).toBeDefined();

      metrics.setGauge('test_gauge', 100);
      metrics.decrementGauge('test_gauge', 10);
    });

    it('should create and observe histogram', async () => {
      await metrics.initialize();

      const histogram = metrics.createHistogram('test_histogram', 'Test histogram', undefined, ['status']);
      expect(histogram).toBeDefined();

      metrics.observeHistogram('test_histogram', 0.5, { status: 'success' });
      metrics.observeHistogram('test_histogram', 1.0, { status: 'success' });
    });

    it('should create and observe summary', async () => {
      await metrics.initialize();

      const summary = metrics.createSummary('test_summary', 'Test summary', undefined, ['status']);
      expect(summary).toBeDefined();

      metrics.observeSummary('test_summary', 0.5, { status: 'success' });
      metrics.observeSummary('test_summary', 1.0, { status: 'success' });
    });

    it('should get metrics as string', async () => {
      await metrics.initialize();

      const metricsString = await metrics.getMetrics();
      expect(typeof metricsString).toBe('string');
    });
  });

  describe('Integration', () => {
    it('should work together', async () => {
      const tracing = createTracingService({
        serviceName: 'integration-test',
        exporter: TraceExporterType.CONSOLE,
      });

      const metrics = createMetricsService({
        provider: MetricsProviderType.PROMETHEUS,
        prefix: 'integration_',
        collectDefaultMetrics: false,
        prometheus: { port: 9092, path: '/metrics' },
      });

      await tracing.initialize();
      await metrics.initialize();

      // Create metrics
      const counter = metrics.createCounter('requests', 'Total requests', ['method']);

      // Execute with tracing
      await tracing.withSpan('handle-request', async (span) => {
        metrics.incrementCounter('requests', { method: 'GET' });
        return 'done';
      });

      // Get metrics
      const metricsString = await metrics.getMetrics();
      expect(metricsString).toContain('integration_requests');

      await tracing.shutdown();
      await metrics.shutdown();
    });
  });
});