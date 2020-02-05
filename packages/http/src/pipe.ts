import { UsePipes } from './decorators';
import { PipeFunction, PipeMetadata } from './types';

export { UsePipes } from './decorators';

export interface NestPipe {
  transform(value: any, metadata: PipeMetadata): Promise<any> | any;
}

export abstract class BasePipe implements NestPipe {
  abstract transform(value: any, metadata: PipeMetadata): Promise<any> | any;
}

export function createPipe(transform: (value: any, metadata: PipeMetadata) => any): new () => NestPipe {
  return class implements NestPipe {
    async transform(value: any, metadata: PipeMetadata): Promise<any> {
      return transform(value, metadata);
    }
  };
}

// Optimized pipe composition - avoids async/await when all pipes are synchronous
export function composePipes(...pipes: PipeFunction[]): PipeFunction {
  // Check if all pipes are synchronous
  const isSync = pipes.every(pipe => {
    const result = pipe({}, {} as any);
    return !(result instanceof Promise);
  });
  
  if (isSync) {
    // Fast path: synchronous pipes
    return (value, metadata) => {
      let result = value;
      for (const pipe of pipes) {
        result = pipe(result, metadata) as any;
      }
      return result;
    };
  }
  
  // Slow path: async pipes
  return async (value, metadata) => {
    let result = value;
    for (const pipe of pipes) {
      result = await pipe(result, metadata);
    }
    return result;
  };
}