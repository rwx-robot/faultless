import 'reflect-metadata';
import type { Constructor, DynamicModule, Provider } from './types';

const METADATA_KEYS = {
  MODULE: 'nofault:module',
  CONTROLLER: 'nofault:controller',
  PROVIDER: 'nofault:provider',
  INJECTABLE: 'nofault:injectable',
  INJECT: 'nofault:inject',
  OPTIONAL: 'nofault:optional',
  GLOBAL: 'nofault:global',
  MIDDLEWARE: 'nofault:middleware',
  GUARD: 'nofault:guard',
  INTERCEPTOR: 'nofault:interceptor',
  PIPE: 'nofault:pipe',
  FILTER: 'nofault:filter',
  ROUTE: 'nofault:route',
  PARAM: 'nofault:param',
  BODY: 'nofault:body',
  QUERY: 'nofault:query',
  PARAMS: 'nofault:params',
  HEADERS: 'nofault:headers',
  SESSION: 'nofault:session',
  REQ: 'nofault:req',
  RES: 'nofault:res',
  NEXT: 'nofault:next',
} as const;

export type MetadataKey = keyof typeof METADATA_KEYS;

// Metadata cache using WeakMap for O(1) lookups
// Key: target object -> Value: Map<propertyKey, Map<metadataKey, value>>
const metadataCache = new WeakMap<object, Map<string | symbol, Map<string, unknown>>>();
const metadataKeyCache = new WeakMap<object, Map<string, unknown>>();

export function getMetadataKey(key: MetadataKey): string {
  return METADATA_KEYS[key];
}

export function defineMetadata(metadataKey: string, metadataValue: unknown, target: object, propertyKey?: string | symbol): void {
  Reflect.defineMetadata(metadataKey, metadataValue, target, propertyKey);
  // Invalidate cache on write
  if (propertyKey !== undefined) {
    let propMap = metadataCache.get(target);
    if (!propMap) {
      propMap = new Map();
      metadataCache.set(target, propMap);
    }
    let metaMap = propMap.get(propertyKey);
    if (!metaMap) {
      metaMap = new Map();
      propMap.set(propertyKey, metaMap);
    }
    metaMap.set(metadataKey, metadataValue);
  } else {
    let metaMap = metadataKeyCache.get(target);
    if (!metaMap) {
      metaMap = new Map();
      metadataKeyCache.set(target, metaMap);
    }
    metaMap.set(metadataKey, metadataValue);
  }
}

export function getMetadata(metadataKey: string, target: object, propertyKey?: string | symbol): unknown {
  // Check cache first
  if (propertyKey !== undefined) {
    const propMap = metadataCache.get(target);
    if (propMap) {
      const metaMap = propMap.get(propertyKey);
      if (metaMap?.has(metadataKey)) {
        return metaMap.get(metadataKey);
      }
    }
  } else {
    const metaMap = metadataKeyCache.get(target);
    if (metaMap?.has(metadataKey)) {
      return metaMap.get(metadataKey);
    }
  }
  // Fall back to Reflect and cache the result
  const value = Reflect.getMetadata(metadataKey, target, propertyKey);
  if (value !== undefined) {
    defineMetadata(metadataKey, value, target, propertyKey);
  }
  return value;
}

export function getOwnMetadata(metadataKey: string, target: object, propertyKey?: string | symbol): unknown {
  return Reflect.getOwnMetadata(metadataKey, target, propertyKey);
}

export function hasMetadata(metadataKey: string, target: object, propertyKey?: string | symbol): boolean {
  // Check cache first
  if (propertyKey !== undefined) {
    const propMap = metadataCache.get(target);
    if (propMap) {
      const metaMap = propMap.get(propertyKey);
      if (metaMap?.has(metadataKey)) {
        return true;
      }
    }
  } else {
    const metaMap = metadataKeyCache.get(target);
    if (metaMap?.has(metadataKey)) {
      return true;
    }
  }
  return Reflect.hasMetadata(metadataKey, target, propertyKey);
}

export function hasOwnMetadata(metadataKey: string, target: object, propertyKey?: string | symbol): boolean {
  return Reflect.hasOwnMetadata(metadataKey, target, propertyKey);
}

export function deleteMetadata(metadataKey: string, target: object, propertyKey?: string | symbol): boolean {
  // Invalidate cache
  if (propertyKey !== undefined) {
    const propMap = metadataCache.get(target);
    propMap?.get(propertyKey)?.delete(metadataKey);
  } else {
    metadataKeyCache.get(target)?.delete(metadataKey);
  }
  return Reflect.deleteMetadata(metadataKey, target, propertyKey);
}

export interface ModuleOptions {
  imports?: Array<Constructor | DynamicModule>;
  controllers?: Constructor[];
  providers?: Array<Constructor | Provider>;
  exports?: Array<Constructor | string | symbol>;
  global?: boolean;
}

export type { Constructor, DynamicModule, Provider } from './types';

export function Module(options: ModuleOptions): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.MODULE, options, target);
    return target;
  };
}

export function Global(): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.GLOBAL, true, target);
    return target;
  };
}

export function Injectable(options?: { scope?: 'singleton' | 'request' | 'transient' }): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.INJECTABLE, options ?? { scope: 'singleton' }, target);
    return target;
  };
}

export function Controller(prefix?: string): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.CONTROLLER, { prefix: prefix ?? '' }, target);
    return target;
  };
}

export function Middleware(): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.MIDDLEWARE, true, target);
    return target;
  };
}

export function Guard(): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.GUARD, true, target);
    return target;
  };
}

export function Interceptor(): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.INTERCEPTOR, true, target);
    return target;
  };
}

export function Pipe(): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.PIPE, true, target);
    return target;
  };
}

export function Filter(...exceptions: Constructor[]): any {
  return (target: Constructor) => {
    defineMetadata(METADATA_KEYS.FILTER, exceptions, target);
    return target;
  };
}

export function Inject(token?: Constructor | string | symbol): ParameterDecorator & PropertyDecorator {
  return (target: object, propertyKey?: string | symbol, parameterIndex?: number) => {
    if (parameterIndex !== undefined) {
      const existing = getMetadata(METADATA_KEYS.INJECT, target, 'parameters') as Array<Constructor | string | symbol> || [];
      existing[parameterIndex] = token ?? (propertyKey as string | symbol);
      defineMetadata(METADATA_KEYS.INJECT, existing, target, 'parameters');
    } else if (propertyKey) {
      defineMetadata(METADATA_KEYS.INJECT, token ?? propertyKey, target, propertyKey);
    }
  };
}

export function Optional(): ParameterDecorator & PropertyDecorator {
  return (target: object, propertyKey?: string | symbol, parameterIndex?: number) => {
    if (parameterIndex !== undefined) {
      const existing = getMetadata(METADATA_KEYS.OPTIONAL, target, 'parameters') as number[] || [];
      existing.push(parameterIndex);
      defineMetadata(METADATA_KEYS.OPTIONAL, existing, target, 'parameters');
    } else if (propertyKey) {
      defineMetadata(METADATA_KEYS.OPTIONAL, true, target, propertyKey);
    }
  };
}

export const Get = createMethodDecorator('GET');
export const Post = createMethodDecorator('POST');
export const Put = createMethodDecorator('PUT');
export const Delete = createMethodDecorator('DELETE');
export const Patch = createMethodDecorator('PATCH');
export const Options = createMethodDecorator('OPTIONS');
export const Head = createMethodDecorator('HEAD');
export const All = createMethodDecorator('ALL');

function createMethodDecorator(method: string): MethodDecorator & ((path?: string) => MethodDecorator) {
  const applyRoute = (path: string): MethodDecorator => {
    return (target: object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<unknown>) => {
      const routes = getMetadata(METADATA_KEYS.ROUTE, target.constructor) as RouteMetadata[] || [];
      routes.push({ method, path, handler: propertyKey as string });
      defineMetadata(METADATA_KEYS.ROUTE, routes, target.constructor);
      return descriptor;
    };
  };

  const handler = function (pathOrTarget?: string | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<unknown>) {
    if (pathOrTarget === undefined || typeof pathOrTarget === 'string') {
      return applyRoute(pathOrTarget ?? '');
    }
    return applyRoute('')(pathOrTarget, propertyKey!, descriptor!);
  } as MethodDecorator & ((path?: string) => MethodDecorator);

  return Object.assign(handler, { withPath: applyRoute });
}

export interface RouteMetadata {
  method: string;
  path: string;
  handler: string;
}

export function Param(name?: string): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.PARAM, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, name, type: 'param' });
    defineMetadata(METADATA_KEYS.PARAM, params, target, propertyKey!);
  };
}

export function Body(): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.BODY, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, type: 'body' });
    defineMetadata(METADATA_KEYS.BODY, params, target, propertyKey!);
  };
}

export function Query(name?: string): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.QUERY, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, name, type: 'query' });
    defineMetadata(METADATA_KEYS.QUERY, params, target, propertyKey!);
  };
}

export function Headers(name?: string): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.HEADERS, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, name, type: 'headers' });
    defineMetadata(METADATA_KEYS.HEADERS, params, target, propertyKey!);
  };
}

export function Session(name?: string): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.SESSION, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, name, type: 'session' });
    defineMetadata(METADATA_KEYS.SESSION, params, target, propertyKey!);
  };
}

export function Req(): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.REQ, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, type: 'req' });
    defineMetadata(METADATA_KEYS.REQ, params, target, propertyKey!);
  };
}

export function Res(): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.RES, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, type: 'res' });
    defineMetadata(METADATA_KEYS.RES, params, target, propertyKey!);
  };
}

export function Next(): ParameterDecorator {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const params = getMetadata(METADATA_KEYS.NEXT, target, propertyKey!) as ParamMetadata[] || [];
    params.push({ index: parameterIndex, type: 'next' });
    defineMetadata(METADATA_KEYS.NEXT, params, target, propertyKey!);
  };
}

export interface ParamMetadata {
  index: number;
  name?: string;
  type: 'param' | 'body' | 'query' | 'headers' | 'session' | 'req' | 'res' | 'next';
}

export function UseGuards(...guards: Constructor[]): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    const metadataKey = propertyKey ? METADATA_KEYS.GUARD : METADATA_KEYS.GUARD;
    const existing = getMetadata(metadataKey, target, propertyKey) as Constructor[] || [];
    defineMetadata(metadataKey, [...existing, ...guards], target, propertyKey);
    return descriptor ?? target;
  };
}

export function UseInterceptors(...interceptors: Constructor[]): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    const existing = getMetadata(METADATA_KEYS.INTERCEPTOR, target, propertyKey) as Constructor[] || [];
    defineMetadata(METADATA_KEYS.INTERCEPTOR, [...existing, ...interceptors], target, propertyKey);
    return descriptor ?? target;
  };
}

export function UsePipes(...pipes: Constructor[]): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    const existing = getMetadata(METADATA_KEYS.PIPE, target, propertyKey) as Constructor[] || [];
    defineMetadata(METADATA_KEYS.PIPE, [...existing, ...pipes], target, propertyKey);
    return descriptor ?? target;
  };
}

export function UseFilters(...filters: Constructor[]): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    const existing = getMetadata(METADATA_KEYS.FILTER, target, propertyKey) as Constructor[] || [];
    defineMetadata(METADATA_KEYS.FILTER, [...existing, ...filters], target, propertyKey);
    return descriptor ?? target;
  };
}

export function UseMiddleware(...middlewares: Constructor[]): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    const existing = getMetadata(METADATA_KEYS.MIDDLEWARE, target, propertyKey) as Constructor[] || [];
    defineMetadata(METADATA_KEYS.MIDDLEWARE, [...existing, ...middlewares], target, propertyKey);
    return descriptor ?? target;
  };
}

export function SetMetadata(key: string, value: unknown): any {
  return (target: object, propertyKey?: string | symbol, descriptor?: any) => {
    defineMetadata(key, value, target, propertyKey);
    return descriptor ?? target;
  };
}

export function getRouteMetadata(target: Constructor): RouteMetadata[] {
  return (getMetadata(METADATA_KEYS.ROUTE, target) as RouteMetadata[]) || [];
}

export function getControllerPrefix(target: Constructor): string {
  const metadata = getMetadata(METADATA_KEYS.CONTROLLER, target) as { prefix: string } | undefined;
  return metadata?.prefix ?? '';
}

export function isController(target: Constructor): boolean {
  return hasMetadata(METADATA_KEYS.CONTROLLER, target);
}

export function isProvider(target: Constructor): boolean {
  return hasMetadata(METADATA_KEYS.INJECTABLE, target);
}

export function isModule(target: Constructor): boolean {
  return hasMetadata(METADATA_KEYS.MODULE, target);
}

export function getModuleMetadata(target: Constructor): ModuleOptions | undefined {
  return getMetadata(METADATA_KEYS.MODULE, target) as ModuleOptions | undefined;
}

export function getInjectableOptions(target: Constructor): { scope: 'singleton' | 'request' | 'transient' } | undefined {
  return getMetadata(METADATA_KEYS.INJECTABLE, target) as { scope: 'singleton' | 'request' | 'transient' } | undefined;
}

export function getInjectTokens(target: Constructor): Array<Constructor | string | symbol> {
  return (getMetadata(METADATA_KEYS.INJECT, target, 'parameters') as Array<Constructor | string | symbol>) || [];
}

export function getOptionalParams(target: Constructor): number[] {
  return (getMetadata(METADATA_KEYS.OPTIONAL, target, 'parameters') as number[]) || [];
}

export function getParamMetadata(target: Constructor, propertyKey: string | symbol): ParamMetadata[] {
  const proto = target.prototype;
  return [
    ...((getMetadata(METADATA_KEYS.PARAM, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.BODY, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.QUERY, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.HEADERS, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.SESSION, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.REQ, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.RES, proto, propertyKey) as ParamMetadata[]) || []),
    ...((getMetadata(METADATA_KEYS.NEXT, proto, propertyKey) as ParamMetadata[]) || []),
  ].sort((a, b) => a.index - b.index);
}