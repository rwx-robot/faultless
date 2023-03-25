import { Injectable } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'tracing' });

/**
 * Trace Exporter Type
 */
export enum TraceExporterType {
  JAEGER = 'JAEGER',
  ZIPKIN = 'ZIPKIN',
  OTLP = 'OTLP',
  CONSOLE = 'CONSOLE',
}

/**
 * Tracing Options
 */
export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  exporter: TraceExporterType;
  endpoint?: string;
  sampleRate?: number;
  propagation?: 'tracecontext' | 'baggage' | 'b3' | 'xray';
  instruments?: {
    http?: boolean;
    grpc?: boolean;
    database?: boolean;
    cache?: boolean;
  };
}

/**
 * Span Context
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

/**
 * Span Attributes
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean;
}

/**
 * Tracing Service
 * - OpenTelemetry integration
 * - Multiple exporter support (Jaeger, Zipkin, OTLP)
 * - HTTP/gRPC instrumentation
 * - Custom span creation
 * - Context propagation
 * - Sampling strategies
 */
@Injectable()
export class TracingService {
  private options: TracingOptions;
  private tracer: any;
  private provider: any;
  private initialized = false;

  constructor(options: TracingOptions) {
    this.options = {
      serviceVersion: '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      sampleRate: 1.0,
      propagation: 'tracecontext',
      instruments: {
        http: true,
        grpc: true,
      },
      ...options,
    };
  }

  /**
   * Initialize tracing
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
      const { Resource } = await import('@opentelemetry/resources');
      const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');

      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.options.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.options.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.options.environment,
      });

      // Create provider
      this.provider = new NodeTracerProvider({ resource });

      // Configure sampler
      const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-base');
      this.provider.addSpanProcessor(
        new (await import('@opentelemetry/sdk-trace-base')).BatchSpanProcessor(
          await this.createExporter()
        )
      );

      // Register provider
      this.provider.register();

      // Get tracer
      this.tracer = this.provider.getTracer(this.options.serviceName);

      // Setup instrumentations
      if (this.options.instruments?.http) {
        await this.setupHttpInstrumentation();
      }
      if (this.options.instruments?.grpc) {
        await this.setupGrpcInstrumentation();
      }

      this.initialized = true;
      logger.info('Tracing initialized', {
        serviceName: this.options.serviceName,
        exporter: this.options.exporter,
        sampleRate: this.options.sampleRate,
      });
    } catch (error) {
      logger.error('Failed to initialize tracing', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Create exporter based on type
   */
  private async createExporter(): Promise<any> {
    switch (this.options.exporter) {
      case TraceExporterType.JAEGER: {
        const { JaegerExporter } = await import('@opentelemetry/exporter-jaeger');
        return new JaegerExporter({
          endpoint: this.options.endpoint ?? 'http://localhost:14268/api/traces',
        });
      }
      case TraceExporterType.ZIPKIN: {
        const { ZipkinExporter } = await import('@opentelemetry/exporter-zipkin');
        return new ZipkinExporter({
          url: this.options.endpoint ?? 'http://localhost:9411/api/v2/spans',
        });
      }
      case TraceExporterType.OTLP: {
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');
        return new OTLPTraceExporter({
          url: this.options.endpoint ?? 'http://localhost:4317',
        });
      }
      case TraceExporterType.CONSOLE:
      default: {
        const { ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-base');
        return new ConsoleSpanExporter();
      }
    }
  }

  /**
   * Setup HTTP instrumentation
   */
  private async setupHttpInstrumentation(): Promise<void> {
    try {
      const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
      const instrumentation = new HttpInstrumentation();
      this.provider.registerInstrumentations({ instrumentations: [instrumentation] });
    } catch (error) {
      logger.warn('Failed to setup HTTP instrumentation', { error: (error as Error).message });
    }
  }

  /**
   * Setup gRPC instrumentation
   */
  private async setupGrpcInstrumentation(): Promise<void> {
    try {
      const { GrpcInstrumentation } = await import('@opentelemetry/instrumentation-grpc');
      const instrumentation = new GrpcInstrumentation();
      this.provider.registerInstrumentations({ instrumentations: [instrumentation] });
    } catch (error) {
      logger.warn('Failed to setup gRPC instrumentation', { error: (error as Error).message });
    }
  }

  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: SpanAttributes): any {
    if (!this.tracer) {
      throw new Error('Tracing not initialized');
    }

    return this.tracer.startSpan(name, { attributes });
  }

  /**
   * Execute function within a span
   */
  async withSpan<T>(
    name: string,
    fn: (span: any) => Promise<T>,
    attributes?: SpanAttributes
  ): Promise<T> {
    const { context, trace } = require('@opentelemetry/api');
    const span = this.startSpan(name, attributes);
    
    // Set the span as active in the context
    const ctx = trace.setSpan(context.active(), span);
    
    try {
      const result = await context.with(ctx, async () => {
        return await fn(span);
      });
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: (error as Error).message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get current span context
   */
  getCurrentContext(): SpanContext | null {
    const { trace, context } = require('@opentelemetry/api');
    const span = trace.getSpan(context.active());
    if (!span) return null;

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: SpanAttributes): void {
    const { trace, context } = require('@opentelemetry/api');
    const span = trace.getSpan(context.active());
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Set attribute on current span
   */
  setAttribute(key: string, value: string | number | boolean): void {
    const { trace, context } = require('@opentelemetry/api');
    const span = trace.getSpan(context.active());
    if (span) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Get trace ID for logging
   */
  getTraceId(): string | undefined {
    const ctx = this.getCurrentContext();
    return ctx?.traceId;
  }

  /**
   * Create propagation headers
   */
  createPropagationHeaders(): Record<string, string> {
    const { trace, context, propagation } = require('@opentelemetry/api');
    const span = trace.getSpan(context.active());
    if (!span) return {};

    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);
    return headers;
  }

  /**
   * Extract context from headers
   */
  extractContextFromHeaders(headers: Record<string, string>): any {
    const { context, propagation } = require('@opentelemetry/api');
    return propagation.extract(context.active(), headers);
  }

  /**
   * Shutdown tracing
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      this.initialized = false;
    }
  }
}

/**
 * Create tracing service
 */
export function createTracingService(options: TracingOptions): TracingService {
  return new TracingService(options);
}

/**
 * Tracing Middleware for HTTP
 */
export function createTracingMiddleware(tracing: TracingService) {
  return async (request: any, reply: any, next: () => Promise<void>) => {
    const span = tracing.startSpan(`${request.method} ${request.url}`, {
      'http.method': request.method,
      'http.url': request.url,
      'http.user_agent': request.headers['user-agent'] ?? '',
    });

    try {
      await next();
      span.setAttribute('http.status_code', reply.statusCode);
      span.setStatus({ code: 1 });
    } catch (error) {
      span.setStatus({ code: 2, message: (error as Error).message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Tracing Decorator for methods
 */
export function Traced(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tracing = (this as any).__tracing__;
      if (!tracing) {
        return originalMethod.apply(this, args);
      }

      const spanName = name ?? `${target.constructor.name}.${propertyKey}`;
      return tracing.withSpan(spanName, async (span: any) => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}