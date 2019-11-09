import { ModuleMetadata, DynamicModule, Constructor, Provider } from '@faultless/core';
import { ApplicationModule } from './types';

export interface HttpModuleMetadata extends ModuleMetadata {
  imports?: Array<Constructor | DynamicModule>;
  controllers?: Constructor[];
  providers?: Provider[];
  exports?: Array<Constructor | string | symbol>;
}

export function Module(metadata: HttpModuleMetadata): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata('module', metadata, target);
  };
}

export function Global(): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata('global', true, target);
  };
}

export function getModuleMetadata(target: Function): HttpModuleMetadata | undefined {
  return Reflect.getMetadata('module', target) as HttpModuleMetadata | undefined;
}

export function isModule(target: any): boolean {
  return Reflect.hasMetadata('module', target);
}

export function isGlobal(target: any): boolean {
  return Reflect.getMetadata('global', target) === true;
}

export type { HttpModuleMetadata as ModuleMetadata };
export type { ApplicationModule };
