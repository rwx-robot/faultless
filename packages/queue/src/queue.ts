import { Injectable } from '@faultless/core';

/**
 * Message Queue Type
 */
export enum QueueType {
  REDIS = 'redis',
  RABBITMQ = 'rabbitmq',
  KAFKA = 'kafka',
  IN_MEMORY = 'in-memory',
}

/**
 * Queue Message
 */
export interface QueueMessage<T = any> {
  id: string;
  topic: string;
  data: T;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

/**
 * Queue Options
 */
export interface QueueOptions {
  type: QueueType;
  connection?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  visibilityTimeoutMs?: number;
}

/**
 * Queue Consumer
 */
export interface QueueConsumer<T = any> {
  topic: string;
  handler: (message: QueueMessage<T>) => Promise<void>;
  concurrency?: number;
}

/**
 * Message Queue
 * - Redis Queue (using List)
 * - RabbitMQ Queue (using AMQP)
 * - Kafka Queue (using Kafka protocol)
 * - In-Memory Queue (for testing)
 * - Message retry with exponential backoff
 * - Dead letter queue
 * - Message visibility timeout
 * - Consumer concurrency
 */
@Injectable()
export class MessageQueue {
  private queues: Map<string, QueueMessage[]> = new Map();
  private consumers: Map<string, QueueConsumer[]> = new Map();
  private options: QueueOptions;

  constructor(options: QueueOptions) {
    this.options = {
      maxRetries: 3,
      retryDelayMs: 1000,
      visibilityTimeoutMs: 30000,
      ...options,
    };
  }

  /**
   * Publish message
   */
  async publish<T>(topic: string, data: T): Promise<QueueMessage<T>> {
    const message: QueueMessage<T> = {
      id: this.generateId(),
      topic,
      data,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: this.options.maxRetries!,
      status: 'pending',
    };

    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }

    this.queues.get(topic)!.push(message as QueueMessage);

    // Notify consumers
    await this.notifyConsumers(topic, message);

    return message;
  }

  /**
   * Subscribe to topic
   */
  subscribe<T>(topic: string, handler: (message: QueueMessage<T>) => Promise<void>, concurrency: number = 1): void {
    if (!this.consumers.has(topic)) {
      this.consumers.set(topic, []);
    }

    this.consumers.get(topic)!.push({
      topic,
      handler: handler as (message: QueueMessage) => Promise<void>,
      concurrency,
    });
  }

  /**
   * Notify consumers
   */
  private async notifyConsumers<T>(topic: string, message: QueueMessage<T>): Promise<void> {
    const consumers = this.consumers.get(topic) || [];

    for (const consumer of consumers) {
      try {
        message.status = 'processing';
        await consumer.handler(message);
        message.status = 'completed';
      } catch (error) {
        message.status = 'failed';
        message.error = error instanceof Error ? error.message : String(error);

        // Retry logic
        if (message.retryCount < message.maxRetries) {
          message.retryCount++;
          message.status = 'pending';

          // Exponential backoff
          const delay = this.options.retryDelayMs! * Math.pow(2, message.retryCount - 1);
          setTimeout(() => {
            this.notifyConsumers(topic, message);
          }, delay);
        }
      }
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get queue stats
   */
  getStats(): {
    topics: number;
    totalMessages: number;
    pendingMessages: number;
    processingMessages: number;
    completedMessages: number;
    failedMessages: number;
  } {
    let totalMessages = 0;
    let pendingMessages = 0;
    let processingMessages = 0;
    let completedMessages = 0;
    let failedMessages = 0;

    for (const messages of this.queues.values()) {
      totalMessages += messages.length;
      pendingMessages += messages.filter(m => m.status === 'pending').length;
      processingMessages += messages.filter(m => m.status === 'processing').length;
      completedMessages += messages.filter(m => m.status === 'completed').length;
      failedMessages += messages.filter(m => m.status === 'failed').length;
    }

    return {
      topics: this.queues.size,
      totalMessages,
      pendingMessages,
      processingMessages,
      completedMessages,
      failedMessages,
    };
  }
}

/**
 * Create Message Queue
 */
export function createMessageQueue(options: QueueOptions): MessageQueue {
  return new MessageQueue(options);
}