declare namespace Reflect {
  function defineMetadata(metadataKey: unknown, metadataValue: unknown, target: object, propertyKey?: string | symbol): void;
  function getMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): unknown;
  function getOwnMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): unknown;
  function hasMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): boolean;
  function hasOwnMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): boolean;
  function deleteMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): boolean;
}
