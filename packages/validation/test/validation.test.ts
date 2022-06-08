import { describe, it, expect } from 'vitest';
import {
  validate,
  validateOrThrow,
  Required,
  MinLength,
  MaxLength,
  Min,
  Max,
  Email,
  Pattern,
  Validate,
  IsDate,
  IsPositive,
  IsNegative,
  IsIn,
  Matches,
  IsUrl,
  IsUUID,
  IsJSON,
  IsCreditCard,
  IsPhoneNumber,
  IsIP,
} from '../src/validation';

class TestModel {
  @Required()
  name!: string;

  @Email()
  email!: string;

  @MinLength(3)
  username!: string;

  @MaxLength(50)
  bio!: string;

  @Min(0)
  age!: number;

  @Max(150)
  maxAge!: number;

  @Pattern(/^\d{3}$/)
  code!: string;
}

class NewValidatorsModel {
  @IsDate()
  birthDate!: any;

  @IsPositive()
  positiveNum!: number;

  @IsNegative()
  negativeNum!: number;

  @IsIn(['admin', 'user', 'guest'])
  role!: string;

  @IsUrl()
  website!: string;

  @IsUUID()
  id!: string;

  @IsJSON()
  metadata!: string;

  @IsCreditCard()
  cardNumber!: string;

  @IsPhoneNumber()
  phone!: string;

  @IsIP(4)
  ipv4!: string;

  @IsIP(6)
  ipv6!: string;
}

describe('Validation Decorators', () => {
  describe('Required', () => {
    it('should pass for non-empty values', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.isValid).toBe(true);
    });

    it('should fail for empty string', () => {
      const model = new TestModel();
      model.name = '';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.rule === 'required')).toBe(true);
    });
  });

  describe('Email', () => {
    it('should pass for valid email', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'user@example.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.filter(e => e.rule === 'email')).toHaveLength(0);
    });

    it('should fail for invalid email', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'not-an-email';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'email')).toBe(true);
    });
  });

  describe('MinLength / MaxLength', () => {
    it('should pass for valid length', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abcdef';
      model.bio = 'short';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'minLength')).toBe(false);
      expect(result.errors.some(e => e.rule === 'maxLength')).toBe(false);
    });

    it('should fail for too short', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'ab';
      model.bio = 'short';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'minLength')).toBe(true);
    });
  });

  describe('Min / Max', () => {
    it('should pass for valid range', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'min')).toBe(false);
      expect(result.errors.some(e => e.rule === 'max')).toBe(false);
    });

    it('should fail for negative age', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = -5;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'min')).toBe(true);
    });
  });

  describe('Pattern', () => {
    it('should pass for matching pattern', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '123';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'pattern')).toBe(false);
    });

    it('should fail for non-matching pattern', () => {
      const model = new TestModel();
      model.name = 'test';
      model.email = 'a@b.com';
      model.username = 'abc';
      model.bio = 'hello';
      model.age = 25;
      model.maxAge = 100;
      model.code = '1234';

      const result = validate(model);
      expect(result.errors.some(e => e.rule === 'pattern')).toBe(true);
    });
  });

  describe('Custom Validate', () => {
    it('should pass custom validation', () => {
      class CustomModel {
        @Validate((v) => v > 10)
        value!: number;
      }

      const model = new CustomModel();
      model.value = 15;
      const result = validate(model);
      expect(result.isValid).toBe(true);
    });

    it('should fail custom validation', () => {
      class CustomModel {
        @Validate((v) => v > 10)
        value!: number;
      }

      const model = new CustomModel();
      model.value = 5;
      const result = validate(model);
      expect(result.isValid).toBe(false);
    });
  });
});

describe('New Validation Decorators', () => {
  describe('IsDate', () => {
    it('should pass for valid Date object', () => {
      const model = new NewValidatorsModel();
      model.birthDate = new Date('2000-01-01');
      model.positiveNum = 1;
      model.negativeNum = -1;
      model.role = 'admin';
      model.website = 'https://example.com';
      model.id = '550e8400-e29b-41d4-a716-446655440000';
      model.metadata = '{"key":"value"}';
      model.cardNumber = '4111111111111111';
      model.phone = '+1 555 123 4567';
      model.ipv4 = '192.168.1.1';
      model.ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

      const result = validate(model);
      expect(result.errors.filter(e => e.rule === 'isDate')).toHaveLength(0);
    });

    it('should pass for date string', () => {
      class M {
        @IsDate()
        d!: any;
      }
      const m = new M();
      m.d = '2024-01-01';
      const result = validate(m);
      expect(result.isValid).toBe(true);
    });

    it('should fail for invalid date', () => {
      class M {
        @IsDate()
        d!: any;
      }
      const m = new M();
      m.d = 'not-a-date';
      const result = validate(m);
      expect(result.isValid).toBe(false);
    });
  });

  describe('IsPositive / IsNegative', () => {
    it('should pass for positive number', () => {
      class M {
        @IsPositive()
        v!: number;
      }
      const m = new M();
      m.v = 42;
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for zero (not positive)', () => {
      class M {
        @IsPositive()
        v!: number;
      }
      const m = new M();
      m.v = 0;
      expect(validate(m).isValid).toBe(false);
    });

    it('should pass for negative number', () => {
      class M {
        @IsNegative()
        v!: number;
      }
      const m = new M();
      m.v = -5;
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for zero (not negative)', () => {
      class M {
        @IsNegative()
        v!: number;
      }
      const m = new M();
      m.v = 0;
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsIn', () => {
    it('should pass for allowed value', () => {
      class M {
        @IsIn(['a', 'b', 'c'])
        v!: string;
      }
      const m = new M();
      m.v = 'b';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for disallowed value', () => {
      class M {
        @IsIn(['a', 'b', 'c'])
        v!: string;
      }
      const m = new M();
      m.v = 'd';
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsUrl', () => {
    it('should pass for valid URL', () => {
      class M {
        @IsUrl()
        v!: string;
      }
      const m = new M();
      m.v = 'https://example.com/path';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid URL', () => {
      class M {
        @IsUrl()
        v!: string;
      }
      const m = new M();
      m.v = 'not-a-url';
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsUUID', () => {
    it('should pass for valid UUID', () => {
      class M {
        @IsUUID()
        v!: string;
      }
      const m = new M();
      m.v = '550e8400-e29b-41d4-a716-446655440000';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid UUID', () => {
      class M {
        @IsUUID()
        v!: string;
      }
      const m = new M();
      m.v = 'not-a-uuid';
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsJSON', () => {
    it('should pass for valid JSON string', () => {
      class M {
        @IsJSON()
        v!: string;
      }
      const m = new M();
      m.v = '{"key":"value"}';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid JSON string', () => {
      class M {
        @IsJSON()
        v!: string;
      }
      const m = new M();
      m.v = '{invalid json}';
      expect(validate(m).isValid).toBe(false);
    });

    it('should fail for non-string', () => {
      class M {
        @IsJSON()
        v!: any;
      }
      const m = new M();
      m.v = 123;
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsCreditCard', () => {
    it('should pass for valid Visa number', () => {
      class M {
        @IsCreditCard()
        v!: string;
      }
      const m = new M();
      m.v = '4111111111111111';
      expect(validate(m).isValid).toBe(true);
    });

    it('should pass for card with spaces', () => {
      class M {
        @IsCreditCard()
        v!: string;
      }
      const m = new M();
      m.v = '4111 1111 1111 1111';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid card number', () => {
      class M {
        @IsCreditCard()
        v!: string;
      }
      const m = new M();
      m.v = '1234567890';
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsPhoneNumber', () => {
    it('should pass for valid phone number', () => {
      class M {
        @IsPhoneNumber()
        v!: string;
      }
      const m = new M();
      m.v = '+1 (555) 123-4567';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid phone number', () => {
      class M {
        @IsPhoneNumber()
        v!: string;
      }
      const m = new M();
      m.v = 'not-a-phone';
      expect(validate(m).isValid).toBe(false);
    });
  });

  describe('IsIP', () => {
    it('should pass for valid IPv4', () => {
      class M {
        @IsIP(4)
        v!: string;
      }
      const m = new M();
      m.v = '192.168.1.1';
      expect(validate(m).isValid).toBe(true);
    });

    it('should fail for invalid IPv4', () => {
      class M {
        @IsIP(4)
        v!: string;
      }
      const m = new M();
      m.v = '256.1.1.1';
      expect(validate(m).isValid).toBe(false);
    });

    it('should pass for valid IPv6', () => {
      class M {
        @IsIP(6)
        v!: string;
      }
      const m = new M();
      m.v = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      expect(validate(m).isValid).toBe(true);
    });

    it('should pass for any IP when no version specified', () => {
      class M {
        @IsIP()
        v!: string;
      }
      const m = new M();
      m.v = '192.168.1.1';
      expect(validate(m).isValid).toBe(true);
    });
  });
});

describe('validateOrThrow', () => {
  it('should throw on invalid', () => {
    class M {
      @Required()
      name!: string;
    }
    const m = new M();
    m.name = '';
    expect(() => validateOrThrow(m)).toThrow();
  });

  it('should not throw on valid', () => {
    class M {
      @Required()
      name!: string;
    }
    const m = new M();
    m.name = 'valid';
    expect(() => validateOrThrow(m)).not.toThrow();
  });
});
