import { SetMetadata } from '@faultless/core';

export const CONTROLLER_PREFIX = 'controller:prefix';
export const ROUTE_ARGS = 'route:args';
export const ROUTE_PATH = 'route:path';
export const ROUTE_METHOD = 'route:method';

export function Controller(prefix?: string): ClassDecorator {
  return SetMetadata(CONTROLLER_PREFIX, prefix ?? '');
}

export function Get(path?: string): MethodDecorator {
  return createMethodDecorator('GET', path);
}

export function Post(path?: string): MethodDecorator {
  return createMethodDecorator('POST', path);
}

export function Put(path?: string): MethodDecorator {
  return createMethodDecorator('PUT', path);
}

export function Delete(path?: string): MethodDecorator {
  return createMethodDecorator('DELETE', path);
}

export function Patch(path?: string): MethodDecorator {
  return createMethodDecorator('PATCH', path);
}

export function Options(path?: string): MethodDecorator {
  return createMethodDecorator('OPTIONS', path);
}

export function Head(path?: string): MethodDecorator {
  return createMethodDecorator('HEAD', path);
}

export function All(path?: string): MethodDecorator {
  return createMethodDecorator('ALL', path);
}

function createMethodDecorator(method: string, path?: string): MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>) => {
    SetMetadata(ROUTE_METHOD, method)(target, propertyKey, descriptor);
    SetMetadata(ROUTE_PATH, path ?? '')(target, propertyKey, descriptor);
    return descriptor;
  };
}

export function Param(name?: string): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'param', name });
  };
}

export function Body(): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'body' });
  };
}

export function Query(name?: string): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'query', name });
  };
}

export function Headers(name?: string): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'headers', name });
  };
}

export function Session(name?: string): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'session', name });
  };
}

export function Req(): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'req' });
  };
}

export function Res(): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'res' });
  };
}

export function Next(): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
    addParamMetadata(target, propertyKey, parameterIndex, { type: 'next' });
  };
}

function addParamMetadata(
  target: Object,
  propertyKey: string | symbol,
  parameterIndex: number,
  metadata: { type: string; name?: string }
): void {
  const existing = Reflect.getMetadata(ROUTE_ARGS, target, propertyKey) as Array<{ index: number; type: string; name?: string }> || [];
  existing.push({ index: parameterIndex, ...metadata });
  Reflect.defineMetadata(ROUTE_ARGS, existing, target, propertyKey);
}

export function UseGuards(...guards: any[]): MethodDecorator & ClassDecorator {
  return SetMetadata('guards', guards);
}

export function UseInterceptors(...interceptors: any[]): MethodDecorator & ClassDecorator {
  return SetMetadata('interceptors', interceptors);
}

export function UsePipes(...pipes: any[]): MethodDecorator & ClassDecorator {
  return SetMetadata('pipes', pipes);
}

export function UseFilters(...filters: any[]): MethodDecorator & ClassDecorator {
  return SetMetadata('filters', filters);
}

export function UseMiddleware(...middlewares: any[]): MethodDecorator & ClassDecorator {
  return SetMetadata('middlewares', middlewares);
}

export function HttpCode(statusCode: number): MethodDecorator {
  return SetMetadata('httpCode', statusCode);
}

export function Header(name: string, value: string): MethodDecorator {
  return SetMetadata('header', { name, value });
}

export function Redirect(url: string, statusCode = 302): MethodDecorator {
  return SetMetadata('redirect', { url, statusCode });
}

export function Render(template: string): MethodDecorator {
  return SetMetadata('render', template);
}