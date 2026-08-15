import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
} from '@faultless/validation';
import {
  MessageQueue,
  createMessageQueue,
  QueueType,
} from '@faultless/queue';

describe('v12-parity example', () => {
  describe('Validation', () => {
    it('should validate required field', () => {
      class TestClass {
        @Required()
        name!: string;
      }

      const obj = new TestClass();
      obj.name = '';

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toBe('required');
    });

    it('should validate minLength', () => {
      class TestClass {
        @MinLength(3)
        name!: string;
      }

      const obj = new TestClass();
      obj.name = 'ab';

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('minLength');
    });

    it('should validate maxLength', () => {
      class TestClass {
        @MaxLength(5)
        name!: string;
      }

      const obj = new TestClass();
      obj.name = 'abcdef';

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('maxLength');
    });

    it('should validate min', () => {
      class TestClass {
        @Min(18)
        age!: number;
      }

      const obj = new TestClass();
      obj.age = 16;

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('min');
    });

    it('should validate max', () => {
      class TestClass {
        @Max(120)
        age!: number;
      }

      const obj = new TestClass();
      obj.age = 150;

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('max');
    });

    it('should validate email', () => {
      class TestClass {
        @Email()
        email!: string;
      }

      const obj = new TestClass();
      obj.email = 'invalid-email';

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('email');
    });

    it('should validate pattern', () => {
      class TestClass {
        @Pattern(/^[A-Z]{2}\d{6}$/)
        studentId!: string;
      }

      const obj = new TestClass();
      obj.studentId = 'invalid';

      const result = validate(obj);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].rule).toBe('pattern');
    });

    it('should pass valid data', () => {
      class TestClass {
        @Required()
        @MinLength(2)
        name!: string;

        @Email()
        email!: string;
      }

      const obj = new TestClass();
      obj.name = 'John';
      obj.email = 'john@example.com';

      const result = validate(obj);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should throw on invalid data', () => {
      class TestClass {
        @Required()
        name!: string;
      }

      const obj = new TestClass();
      obj.name = '';

      expect(() => validateOrThrow(obj)).toThrow();
    });
  });

  describe('Message Queue', () => {
    let queue: MessageQueue;

    beforeEach(() => {
      queue = createMessageQueue({
        type: QueueType.IN_MEMORY,
        maxRetries: 3,
        retryDelayMs: 100,
      });
    });

    it('should publish message', async () => {
      const message = await queue.publish('test-topic', { data: 'hello' });
      expect(message.id).toBeDefined();
      expect(message.topic).toBe('test-topic');
      expect(message.status).toBe('pending');
    });

    it('should subscribe to topic', async () => {
      let received = false;
      queue.subscribe('test-topic', async (message) => {
        received = true;
      });

      await queue.publish('test-topic', { data: 'hello' });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(received).toBe(true);
    });

    it('should get stats', async () => {
      await queue.publish('topic1', { data: 'hello' });
      await queue.publish('topic2', { data: 'world' });

      const stats = queue.getStats();
      expect(stats.topics).toBe(2);
      expect(stats.totalMessages).toBe(2);
    });
  });
});