import * as grpc from '@grpc/grpc-js';
import { Injectable, NoFaultError } from '@faultless/core';
import { createLogger } from '@faultless/log';

const logger = createLogger({ level: 'info', serviceName: 'rpc:auth' });

/**
 * Auth Token Provider
 */
export interface TokenProvider {
  getToken(): string | Promise<string>;
  refreshToken?(): Promise<string>;
  isExpired?(): boolean;
}

/**
 * Auth Interceptor Options
 */
export interface AuthInterceptorOptions {
  tokenProvider: TokenProvider;
  metadataKey?: string;
  excludeMethods?: string[];
}

/**
 * Service-to-Service Authentication
 * - Token-based authentication (JWT, API Key)
 * - Automatic token refresh
 * - Metadata-based auth headers
 * - Method-level exclusion
 * - Token validation
 */
@Injectable()
export class RpcAuth {
  private tokenProvider?: TokenProvider;

  constructor(options?: { tokenProvider?: TokenProvider }) {
    this.tokenProvider = options?.tokenProvider;
  }

  /**
   * Set token provider
   */
  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider;
  }

  /**
   * Create auth interceptor for client
   */
  createClientInterceptor(options: AuthInterceptorOptions): grpc.Interceptor {
    const metadataKey = options.metadataKey ?? 'authorization';
    const excludeMethods = new Set(options.excludeMethods ?? []);

    return (options, next) => {
      return async (call, metadata, sendNext) => {
        // Skip excluded methods
        if (!excludeMethods.has(call.method)) {
          const token = await options.tokenProvider.getToken();
          metadata.set(metadataKey, `Bearer ${token}`);
        }

        await next()(call, metadata, sendNext);
      };
    };
  }

  /**
   * Create auth middleware for server
   */
  createServerMiddleware(options?: {
    validateToken?: (token: string) => Promise<boolean>;
    excludeMethods?: string[];
    metadataKey?: string;
  }) {
    const metadataKey = options?.metadataKey ?? 'authorization';
    const excludeMethods = new Set(options?.excludeMethods ?? []);

    return async (call: grpc.ServerCall, next: () => Promise<void>) => {
      // Skip excluded methods
      const method = call.getPath();
      if (excludeMethods.has(method)) {
        await next();
        return;
      }

      // Extract token from metadata
      const metadata = call.metadata;
      const authHeader = metadata.get(metadataKey);

      if (!authHeader || authHeader.length === 0) {
        throw new NoFaultError('AUTH_MISSING', 'Missing authentication token', 16); // UNAUTHENTICATED
      }

      const token = (authHeader[0] as string).replace('Bearer ', '');

      // Validate token
      if (options?.validateToken) {
        const isValid = await options.validateToken(token);
        if (!isValid) {
          throw new NoFaultError('AUTH_INVALID', 'Invalid authentication token', 16); // UNAUTHENTICATED
        }
      }

      await next();
    };
  }

  /**
   * Validate JWT token format
   */
  validateJwtFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3;
  }

  /**
   * Extract JWT payload
   */
  extractJwtPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  /**
   * Check if JWT is expired
   */
  isJwtExpired(token: string): boolean {
    const payload = this.extractJwtPayload(token);
    if (!payload?.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }
}

/**
 * Create RPC auth
 */
export function createRpcAuth(options?: { tokenProvider?: TokenProvider }): RpcAuth {
  return new RpcAuth(options);
}

/**
 * Simple token provider
 */
export class SimpleTokenProvider implements TokenProvider {
  private token: string;
  private tokenGetter?: () => string | Promise<string>;

  constructor(tokenOrGetter: string | (() => string | Promise<string>)) {
    if (typeof tokenOrGetter === 'string') {
      this.token = tokenOrGetter;
    } else {
      this.tokenGetter = tokenOrGetter;
      this.token = '';
    }
  }

  async getToken(): Promise<string> {
    if (this.tokenGetter) {
      this.token = await this.tokenGetter();
    }
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }
}

/**
 * JWT Token Provider with refresh
 */
export class JwtTokenProvider implements TokenProvider {
  private token: string;
  private refreshTokenValue?: string;
  private refreshCallback?: (refreshToken: string) => Promise<{ token: string; refreshToken?: string }>;
  private tokenGetter: () => Promise<string>;

  constructor(options: {
    token: string;
    refreshToken?: string;
    refreshCallback?: (refreshToken: string) => Promise<{ token: string; refreshToken?: string }>;
    tokenGetter?: () => Promise<string>;
  }) {
    this.token = options.token;
    this.refreshTokenValue = options.refreshToken;
    this.refreshCallback = options.refreshCallback;
    this.tokenGetter = options.tokenGetter ?? (async () => this.token);
  }

  async getToken(): Promise<string> {
    this.token = await this.tokenGetter();
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  async refreshToken(): Promise<string> {
    if (!this.refreshCallback || !this.refreshTokenValue) {
      throw new Error('No refresh callback or refresh token');
    }

    const result = await this.refreshCallback(this.refreshTokenValue);
    this.token = result.token;
    if (result.refreshToken) {
      this.refreshTokenValue = result.refreshToken;
    }

    return this.token;
  }

  isExpired(): boolean {
    try {
      const parts = this.token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const now = Math.floor(Date.now() / 1000);
      return payload.exp < now;
    } catch {
      return false;
    }
  }
}