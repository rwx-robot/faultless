import { FastifyRequest, FastifyReply } from 'fastify';
import { UseFilters } from './decorators';
import { FilterFunction } from './types';

export { UseFilters } from './decorators';

export interface NestFilter {
  catch(exception: any, request: FastifyRequest, reply: FastifyReply): Promise<void> | void;
}

export abstract class BaseFilter implements NestFilter {
  abstract catch(exception: any, request: FastifyRequest, reply: FastifyReply): Promise<void> | void;
}

export function createFilter(catchFn: (exception: any, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void): new () => NestFilter {
  return class implements NestFilter {
    async catch(exception: any, request: FastifyRequest, reply: FastifyReply): Promise<void> {
      return catchFn(exception, request, reply);
    }
  };
}

export function composeFilters(...filters: FilterFunction[]): FilterFunction {
  return async (exception, request, reply) => {
    for (const filter of filters) {
      await filter(exception, request, reply);
    }
  };
}