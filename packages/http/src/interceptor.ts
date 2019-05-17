import { FastifyRequest, FastifyReply } from 'fastify';

export interface NestInterceptor {
  intercept(request: FastifyRequest, reply: FastifyReply, next: () => Promise<any>): Promise<any>;
}

export abstract class BaseInterceptor implements NestInterceptor {
  abstract intercept(request: FastifyRequest, reply: FastifyReply, next: () => Promise<any>): Promise<any>;
}

export interface NestMiddleware {
  use(request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> | void;
}

export abstract class BaseMiddleware implements NestMiddleware {
  abstract use(request: FastifyRequest, reply: FastifyReply, next: () => Promise<void>): Promise<void> | void;
}

export function isNestInterceptor(obj: any): obj is NestInterceptor {
  return obj && typeof obj.intercept === 'function';
}

export function isNestMiddleware(obj: any): obj is NestMiddleware {
  return obj && typeof obj.use === 'function';
}