import { FastifyRequest, FastifyReply } from 'fastify';
import { UseGuards } from './decorators';
import { GuardFunction } from './types';

export { UseGuards } from './decorators';

export interface GuardOptions {
  message?: string;
}

export interface NestGuard {
  canActivate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> | boolean;
}

export abstract class BaseGuard implements NestGuard {
  abstract canActivate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> | boolean;
}

export function createGuard(canActivate: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean> | boolean): new () => NestGuard {
  return class implements NestGuard {
    async canActivate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
      return canActivate(request, reply);
    }
  };
}

// Optimized guard composition - avoids async/await when all guards are synchronous
export function composeGuards(...guards: GuardFunction[]): GuardFunction {
  // Check if all guards are synchronous
  const isSync = guards.every(guard => {
    // Test if guard returns a non-promise value
    const result = guard({} as any, {} as any);
    return !(result instanceof Promise);
  });
  
  if (isSync) {
    // Fast path: synchronous guards
    return (request, reply) => {
      for (const guard of guards) {
        const result = guard(request, reply);
        // We know it's not a promise due to isSync check
        if (result === false || (result as any) === false) {
          return false;
        }
      }
      return true;
    };
  }
  
  // Slow path: async guards
  return async (request, reply) => {
    for (const guard of guards) {
      const result = await guard(request, reply);
      if (!result) {
        return false;
      }
    }
    return true;
  };
}