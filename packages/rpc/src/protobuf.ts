import * as protobuf from 'protobufjs';
import { Injectable } from '@faultless/core';

/**
 * Proto Schema
 */
export interface ProtoSchema {
  name: string;
  package: string;
  messages: ProtoMessage[];
  services: ProtoService[];
  enums: ProtoEnum[];
}

/**
 * Proto Message
 */
export interface ProtoMessage {
  name: string;
  fields: ProtoField[];
}

/**
 * Proto Field
 */
export interface ProtoField {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
  optional: boolean;
  oneof?: string;
}

/**
 * Proto Service
 */
export interface ProtoService {
  name: string;
  methods: ProtoMethod[];
}

/**
 * Proto Method
 */
export interface ProtoMethod {
  name: string;
  requestType: string;
  responseType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

/**
 * Proto Enum
 */
export interface ProtoEnum {
  name: string;
  values: Record<string, number>;
}

/**
 * Protobuf Helper
 *
 * Provides:
 * - Proto file loading
 * - Message encoding/decoding
 * - Schema parsing
 * - Type generation
 * - Validation
 */
@Injectable()
export class ProtobufHelper {
  private root: protobuf.Root | null = null;
  private schemas = new Map<string, ProtoSchema>();

  /**
   * Load proto file
   */
  async loadFile(path: string): Promise<protobuf.Root> {
    this.root = await protobuf.load(path);
    return this.root;
  }

  /**
   * Load proto from string
   */
  loadFromString(content: string): protobuf.Root {
    const parsed = protobuf.parse(content);
    this.root = parsed.root as protobuf.Root;
    return this.root;
  }

  /**
   * Parse schema from loaded proto
   */
  parseSchema(): ProtoSchema | null {
    if (!this.root) return null;

    const schema: ProtoSchema = {
      name: this.root.name || 'unknown',
      package: this.root.package || '',
      messages: [],
      services: [],
      enums: [],
    };

    // Parse messages recursively
    const parseNested = (namespace: protobuf.Namespace) => {
      namespace.nestedArray.forEach(nested => {
        if (nested instanceof protobuf.Type) {
          schema.messages.push(this.parseMessage(nested));
        } else if (nested instanceof protobuf.Service) {
          schema.services.push(this.parseService(nested));
        } else if (nested instanceof protobuf.Enum) {
          schema.enums.push(this.parseEnum(nested));
        } else if (nested instanceof protobuf.Namespace) {
          parseNested(nested);
        }
      });
    };

    parseNested(this.root);

    return schema;
  }

  /**
   * Parse message
   */
  private parseMessage(type: protobuf.Type): ProtoMessage {
    const message: ProtoMessage = {
      name: type.name,
      fields: [],
    };

    type.fieldsArray.forEach(field => {
      message.fields.push({
        name: field.name,
        type: field.type.name,
        number: field.id,
        repeated: field.repeated,
        optional: field.optional,
        oneof: field.oneof?.name,
      });
    });

    return message;
  }

  /**
   * Parse service
   */
  private parseService(service: protobuf.Service): ProtoService {
    const svc: ProtoService = {
      name: service.name,
      methods: [],
    };

    Object.entries(service.methods).forEach(([name, method]) => {
      svc.methods.push({
        name,
        requestType: method.requestType.name,
        responseType: method.responseType.name,
        clientStreaming: method.requestStream,
        serverStreaming: method.responseStream,
      });
    });

    return svc;
  }

  /**
   * Parse enum
   */
  private parseEnum(enumType: protobuf.Enum): ProtoEnum {
    return {
      name: enumType.name,
      values: enumType.values,
    };
  }

  /**
   * Encode message
   */
  encode<T>(typeName: string, message: T): Buffer {
    if (!this.root) throw new Error('Proto not loaded');

    const type = this.root.lookupType(typeName);
    const errMsg = type.verify(message);
    if (errMsg) throw new Error(`Verification failed: ${errMsg}`);

    const buffer = type.encode(type.create(message as any)).finish();
    return Buffer.from(buffer);
  }

  /**
   * Decode message
   */
  decode<T>(typeName: string, buffer: Buffer): T {
    if (!this.root) throw new Error('Proto not loaded');

    const type = this.root.lookupType(typeName);
    return type.decode(buffer) as unknown as T;
  }

  /**
   * Create message instance
   */
  create<T>(typeName: string, properties?: Partial<T>): T {
    if (!this.root) throw new Error('Proto not loaded');

    const type = this.root.lookupType(typeName);
    return type.create(properties as any) as T;
  }

  /**
   * Verify message
   */
  verify<T>(typeName: string, message: T): string | null {
    if (!this.root) throw new Error('Proto not loaded');

    const type = this.root.lookupType(typeName);
    return type.verify(message);
  }

  /**
   * Get type
   */
  getType(typeName: string): protobuf.Type {
    if (!this.root) throw new Error('Proto not loaded');
    return this.root.lookupType(typeName);
  }

  /**
   * Get service
   */
  getService(serviceName: string): protobuf.Service {
    if (!this.root) throw new Error('Proto not loaded');
    return this.root.lookupService(serviceName);
  }

  /**
   * Get enum
   */
  getEnum(enumName: string): protobuf.Enum {
    if (!this.root) throw new Error('Proto not loaded');
    return this.root.lookupEnum(enumName);
  }
}

export function createProtobufHelper(): ProtobufHelper {
  return new ProtobufHelper();
}

/**
 * Proto to JSON Schema converter
 */
export function protoToJsonSchema(schema: ProtoSchema): any {
  const definitions: Record<string, any> = {};

  schema.messages.forEach(msg => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    msg.fields.forEach(field => {
      let jsonType: string;

      switch (field.type) {
        case 'string':
          jsonType = 'string';
          break;
        case 'int32':
        case 'int64':
        case 'uint32':
        case 'uint64':
        case 'float':
        case 'double':
          jsonType = 'number';
          break;
        case 'bool':
          jsonType = 'boolean';
          break;
        default:
          jsonType = 'object';
      }

      properties[field.name] = {
        type: jsonType,
        description: `Field number: ${field.number}`,
      };

      if (!field.optional) {
        required.push(field.name);
      }
    });

    definitions[msg.name] = {
      type: 'object',
      properties,
      required,
    };
  });

  return {
    definitions,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };
}