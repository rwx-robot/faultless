import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricsExporter, createMetricsExporter } from '@faultless/metrics';

describe('MetricsExporter', () => {
  let exporter: MetricsExporter;

  beforeEach(() => {
    exporter = createMetricsExporter({ port: 0 });
  });

  afterEach(async () => {
    if (exporter.isExporterRunning()) {
      await exporter.stop();
    }
  });

  it('should create a metrics exporter', () => {
    expect(exporter).toBeInstanceOf(MetricsExporter);
  });

  it('should add collectors', () => {
    exporter.addCollector(async () => '# Metric 1');
    exporter.addCollector(async () => '# Metric 2');

    expect(exporter.getCollectorCount()).toBe(2);
  });

  it('should remove collectors', () => {
    exporter.addCollector(async () => '# Metric 1');
    exporter.addCollector(async () => '# Metric 2');

    expect(exporter.getCollectorCount()).toBe(2);

    exporter.removeCollector(0);

    expect(exporter.getCollectorCount()).toBe(1);
  });

  it('should not remove invalid collector index', () => {
    exporter.addCollector(async () => '# Metric 1');

    const result = exporter.removeCollector(5);

    expect(result).toBe(false);
    expect(exporter.getCollectorCount()).toBe(1);
  });

  it('should add JSON collectors', () => {
    exporter.addJsonCollector(async () => ({ metric1: 1 }));
    exporter.addJsonCollector(async () => ({ metric2: 2 }));

    expect(exporter.getJsonCollectorCount()).toBe(2);
  });

  it('should remove JSON collectors', () => {
    exporter.addJsonCollector(async () => ({ metric1: 1 }));
    exporter.addJsonCollector(async () => ({ metric2: 2 }));

    expect(exporter.getJsonCollectorCount()).toBe(2);

    exporter.removeJsonCollector(0);

    expect(exporter.getJsonCollectorCount()).toBe(1);
  });

  it('should start and stop the server', async () => {
    await exporter.start();

    expect(exporter.isExporterRunning()).toBe(true);

    await exporter.stop();

    expect(exporter.isExporterRunning()).toBe(false);
  });

  it('should emit started event', async () => {
    const startedHandler = vi.fn();
    exporter.on('started', startedHandler);

    await exporter.start();

    expect(startedHandler).toHaveBeenCalled();

    await exporter.stop();
  });

  it('should emit stopped event', async () => {
    const stoppedHandler = vi.fn();
    exporter.on('stopped', stoppedHandler);

    await exporter.start();
    await exporter.stop();

    expect(stoppedHandler).toHaveBeenCalled();
  });

  it('should throw error when starting twice', async () => {
    await exporter.start();

    await expect(exporter.start()).rejects.toThrow('already running');

    await exporter.stop();
  });

  it('should handle multiple stops gracefully', async () => {
    await exporter.start();
    await exporter.stop();
    await exporter.stop();

    expect(exporter.isExporterRunning()).toBe(false);
  });
});
