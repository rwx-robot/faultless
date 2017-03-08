import { ConfigSchema } from './config';

export const defaultConfigSchema: ConfigSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    app: {
      type: 'object',
      required: ['name', 'version', 'env', 'port', 'host'],
      properties: {
        name: { type: 'string', description: 'Application name' },
        version: { type: 'string', description: 'Application version' },
        env: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Environment',
        },
        port: { type: 'number', minimum: 1, maximum: 65535, description: 'HTTP port' },
        host: { type: 'string', description: 'HTTP host' },
      },
    },
    database: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        username: { type: 'string' },
        password: { type: 'string' },
        database: { type: 'string' },
        ssl: { type: 'boolean' },
        poolSize: { type: 'number', minimum: 1 },
      },
    },
    redis: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        password: { type: 'string' },
        db: { type: 'number', minimum: 0 },
        keyPrefix: { type: 'string' },
        sentinel: {
          type: 'object',
          properties: {
            masterName: { type: 'string' },
            sentinels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  port: { type: 'number' },
                },
              },
            },
          },
        },
        cluster: { type: 'boolean' },
      },
    },
    discovery: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['etcd', 'consul', 'kubernetes', 'static'],
        },
        endpoints: {
          type: 'array',
          items: { type: 'string' },
        },
        serviceName: { type: 'string' },
        ttl: { type: 'number' },
        metadata: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    },
    tracing: {
      type: 'object',
      properties: {
        serviceName: { type: 'string' },
        exporter: {
          type: 'string',
          enum: ['otlp', 'zipkin', 'jaeger', 'console'],
        },
        endpoint: { type: 'string' },
        samplingRate: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    metrics: {
      type: 'object',
      properties: {
        prefix: { type: 'string' },
        defaultLabels: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        pushGateway: { type: 'string' },
        interval: { type: 'number' },
      },
    },
    auth: {
      type: 'object',
      properties: {
        jwtSecret: { type: 'string' },
        jwtExpiry: { type: 'string' },
        refreshExpiry: { type: 'string' },
        issuer: { type: 'string' },
        audience: { type: 'string' },
      },
    },
    queue: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['rabbitmq', 'kafka', 'redis'],
        },
        connection: {
          type: 'object',
          additionalProperties: true,
        },
        defaultQueue: { type: 'string' },
      },
    },
    gateway: {
      type: 'object',
      properties: {
        port: { type: 'number', minimum: 1, maximum: 65535 },
        host: { type: 'string' },
        routes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
              },
              target: { type: 'string' },
              timeout: { type: 'number' },
              retries: { type: 'number' },
              auth: { type: 'boolean' },
              rateLimit: {
                type: 'object',
                properties: {
                  windowMs: { type: 'number' },
                  max: { type: 'number' },
                  keyGenerator: { type: 'string' },
                  skipSuccessfulRequests: { type: 'boolean' },
                  skipFailedRequests: { type: 'boolean' },
                },
              },
            },
          },
        },
        middlewares: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              handler: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export function createSchema(overrides: Partial<ConfigSchema> = {}): ConfigSchema {
  return {
    ...defaultConfigSchema,
    ...overrides,
    properties: {
      ...defaultConfigSchema.properties,
      ...overrides.properties,
    },
  };
}