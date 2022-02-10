import 'reflect-metadata';

/**
 * Validation Rule
 */
export interface ValidationRule {
  type: string;
  params?: any;
  message?: string;
  custom?: (value: any) => boolean;
}

/**
 * Validation Error
 */
export interface ValidationError {
  property: string;
  rule: string;
  message: string;
  value: any;
}

/**
 * Validation Result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Required decorator
 */
export function Required(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'required', message: message || `${propertyKey} is required` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * MinLength decorator
 */
export function MinLength(min: number, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'minLength', params: min, message: message || `${propertyKey} must be at least ${min} characters` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * MaxLength decorator
 */
export function MaxLength(max: number, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'maxLength', params: max, message: message || `${propertyKey} must be at most ${max} characters` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Min decorator
 */
export function Min(min: number, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'min', params: min, message: message || `${propertyKey} must be at least ${min}` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Max decorator
 */
export function Max(max: number, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'max', params: max, message: message || `${propertyKey} must be at most ${max}` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Email decorator
 */
export function Email(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'email', message: message || `${propertyKey} must be a valid email` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Pattern decorator
 */
export function Pattern(pattern: RegExp, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'pattern', params: pattern, message: message || `${propertyKey} must match pattern` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Custom validation decorator
 */
export function Validate(custom: (value: any) => boolean, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'custom', custom, message: message || `${propertyKey} is invalid` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Date decorator - validates value is a valid Date
 */
export function IsDate(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isDate', message: message || `${propertyKey} must be a valid date` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Positive number decorator
 */
export function IsPositive(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isPositive', message: message || `${propertyKey} must be a positive number` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Negative number decorator
 */
export function IsNegative(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isNegative', message: message || `${propertyKey} must be a negative number` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * IsIn decorator - validates value is in allowed values
 */
export function IsIn(values: any[], message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isIn', params: values, message: message || `${propertyKey} must be one of: ${values.join(', ')}` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Matches decorator - validates value matches a regex pattern
 */
export function Matches(pattern: RegExp, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'matches', params: pattern, message: message || `${propertyKey} must match pattern ${pattern}` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * URL decorator - validates value is a valid URL
 */
export function IsUrl(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isUrl', message: message || `${propertyKey} must be a valid URL` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * UUID decorator - validates value is a valid UUID
 */
export function IsUUID(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isUUID', message: message || `${propertyKey} must be a valid UUID` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * JSON decorator - validates value is valid JSON string
 */
export function IsJSON(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isJSON', message: message || `${propertyKey} must be valid JSON` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Credit card decorator - validates value is a valid credit card number
 */
export function IsCreditCard(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isCreditCard', message: message || `${propertyKey} must be a valid credit card number` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Phone number decorator - validates value is a phone number format
 */
export function IsPhoneNumber(message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({ type: 'isPhoneNumber', message: message || `${propertyKey} must be a valid phone number` });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * IP address decorator - validates value is a valid IP address
 */
export function IsIP(version?: 4 | 6, message?: string) {
  return function (target: any, propertyKey: string) {
    const rules = getValidationRules(target, propertyKey);
    rules.push({
      type: 'isIP',
      params: version,
      message: message || `${propertyKey} must be a valid${version ? ` IPv${version}` : ''} IP address`,
    });
    setValidationRules(target, propertyKey, rules);
  };
}

/**
 * Get validation rules for property
 */
function getValidationRules(target: any, propertyKey: string): ValidationRule[] {
  const key = `__validationRules_${propertyKey}`;
  if (!target[key]) {
    target[key] = [];
  }
  return target[key];
}

/**
 * Set validation rules for property
 */
function setValidationRules(target: any, propertyKey: string, rules: ValidationRule[]): void {
  const key = `__validationRules_${propertyKey}`;
  target[key] = rules;
}

/**
 * Validate object
 */
export function validate(obj: any): ValidationResult {
  const errors: ValidationError[] = [];
  const prototype = Object.getPrototypeOf(obj);

  for (const key of Object.keys(obj)) {
    const rules: ValidationRule[] = prototype[`__validationRules_${key}`] || [];

    for (const rule of rules) {
      const value = obj[key];
      let isValid = true;

      switch (rule.type) {
        case 'required':
          isValid = value !== undefined && value !== null && value !== '';
          break;
        case 'minLength':
          isValid = typeof value === 'string' && value.length >= rule.params;
          break;
        case 'maxLength':
          isValid = typeof value === 'string' && value.length <= rule.params;
          break;
        case 'min':
          isValid = typeof value === 'number' && value >= rule.params;
          break;
        case 'max':
          isValid = typeof value === 'number' && value <= rule.params;
          break;
        case 'email':
          isValid = typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          break;
        case 'pattern':
          isValid = typeof value === 'string' && rule.params.test(value);
          break;
        case 'custom':
          isValid = rule.custom ? rule.custom(value) : true;
          break;
        case 'isDate': {
          const date = value instanceof Date ? value : new Date(value);
          isValid = !isNaN(date.getTime());
          break;
        }
        case 'isPositive':
          isValid = typeof value === 'number' && value > 0;
          break;
        case 'isNegative':
          isValid = typeof value === 'number' && value < 0;
          break;
        case 'isIn':
          isValid = rule.params.includes(value);
          break;
        case 'matches':
          isValid = typeof value === 'string' && rule.params.test(value);
          break;
        case 'isUrl':
          isValid = typeof value === 'string' && /^https?:\/\/.+/.test(value);
          break;
        case 'isUUID':
          isValid = typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
          break;
        case 'isJSON':
          if (typeof value !== 'string') {
            isValid = false;
          } else {
            try {
              JSON.parse(value);
              isValid = true;
            } catch {
              isValid = false;
            }
          }
          break;
        case 'isCreditCard': {
          const cc = (typeof value === 'string' ? value : '').replace(/[\s-]/g, '');
          isValid = /^\d{13,19}$/.test(cc) && luhnCheck(cc);
          break;
        }
        case 'isPhoneNumber':
          isValid = typeof value === 'string' && /^\+?[\d\s\-().]{7,20}$/.test(value);
          break;
        case 'isIP': {
          const version = rule.params;
          if (typeof value !== 'string') {
            isValid = false;
          } else if (version === 4) {
            isValid = /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every(o => {
              const n = parseInt(o, 10);
              return n >= 0 && n <= 255;
            });
          } else if (version === 6) {
            isValid = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(value);
          } else {
            isValid = /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(value);
          }
          break;
        }
      }

      if (!isValid) {
        errors.push({
          property: key,
          rule: rule.type,
          message: rule.message || `${key} is invalid`,
          value,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate and throw if invalid
 */
export function validateOrThrow(obj: any): void {
  const result = validate(obj);
  if (!result.isValid) {
    throw new Error(result.errors.map(e => e.message).join(', '));
  }
}

function luhnCheck(card: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = card.length - 1; i >= 0; i--) {
    let n = parseInt(card[i], 10);
    if (isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}