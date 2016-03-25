import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface EncryptionOptions {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
  saltLength?: number;
  iterations?: number;
}

export interface EncryptedConfig {
  encrypted: boolean;
  algorithm: string;
  iv: string;
  salt: string;
  data: string;
  version: number;
}

const DEFAULT_OPTIONS: Required<EncryptionOptions> = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  saltLength: 16,
  iterations: 100000,
};

export class ConfigEncryption {
  private options: Required<EncryptionOptions>;
  private masterKey: Buffer;

  constructor(password: string, options: EncryptionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.masterKey = this.deriveKey(password);
  }

  private deriveKey(password: string): Buffer {
    const salt = randomBytes(this.options.saltLength);
    return scryptSync(password, salt, this.options.keyLength, { N: this.options.iterations });
  }

  encrypt(config: Record<string, unknown>): EncryptedConfig {
    const iv = randomBytes(this.options.ivLength);
    const cipher = createCipheriv(this.options.algorithm, this.masterKey, iv);

    const json = JSON.stringify(config);
    const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);

    let authTag: Buffer | undefined;
    if (this.options.algorithm.includes('gcm')) {
      authTag = (cipher as any).getAuthTag();
    }

    const salt = randomBytes(this.options.saltLength);

    return {
      encrypted: true,
      algorithm: this.options.algorithm,
      iv: iv.toString('base64'),
      salt: salt.toString('base64'),
      data: encrypted.toString('base64') + (authTag ? ':' + authTag.toString('base64') : ''),
      version: 1,
    };
  }

  decrypt(encryptedConfig: EncryptedConfig): Record<string, unknown> {
    if (!encryptedConfig.encrypted) {
      throw new Error('Config is not encrypted');
    }

    const iv = Buffer.from(encryptedConfig.iv, 'base64');
    const [encryptedData, authTagBase64] = encryptedConfig.data.split(':');
    const encrypted = Buffer.from(encryptedData, 'base64');
    const authTag = authTagBase64 ? Buffer.from(authTagBase64, 'base64') : undefined;

    const decipher = createDecipheriv(encryptedConfig.algorithm, this.masterKey, iv);

    if (authTag) {
      (decipher as any).setAuthTag(authTag);
    }

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  static isEncrypted(config: unknown): config is EncryptedConfig {
    return (
      typeof config === 'object' &&
      config !== null &&
      'encrypted' in config &&
      (config as Record<string, unknown>).encrypted === true
    );
  }
}

export function createEncryption(password: string, options?: EncryptionOptions): ConfigEncryption {
  return new ConfigEncryption(password, options);
}

export function encryptConfig(
  config: Record<string, unknown>,
  password: string,
  options?: EncryptionOptions
): EncryptedConfig {
  return new ConfigEncryption(password, options).encrypt(config);
}

export function decryptConfig(
  encryptedConfig: EncryptedConfig,
  password: string,
  options?: EncryptionOptions
): Record<string, unknown> {
  return new ConfigEncryption(password, options).decrypt(encryptedConfig);
}