declare module 'etcd3' {
  export class Etcd3 {
    constructor(options: any);
    get(key: string): any;
    put(key: string): any;
    getAll(): any;
    watch(): any;
    close(): Promise<void>;
  }
}

declare module 'consul' {
  export default function consul(options: any): any;
}
