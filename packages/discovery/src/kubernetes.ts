import { ServiceInstance } from './service-registry';

export interface KubernetesConfig {
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  watch?: boolean;
  resyncPeriod?: number;
}

export interface KubernetesService {
  name: string;
  namespace: string;
  clusterIP: string;
  ports: ServicePort[];
  selector: Record<string, string>;
}

export interface ServicePort {
  name: string;
  protocol: string;
  port: number;
  targetPort: number | string;
  nodePort?: number;
}

export interface Endpoints {
  name: string;
  namespace: string;
  subsets: EndpointSubset[];
}

export interface EndpointSubset {
  addresses: EndpointAddress[];
  notReadyAddresses: EndpointAddress[];
  ports: EndpointPort[];
}

export interface EndpointAddress {
  ip: string;
  hostname?: string;
  nodeName?: string;
  targetRef?: {
    kind: string;
    name: string;
    namespace: string;
    uid: string;
  };
}

export interface EndpointPort {
  name: string;
  protocol: string;
  port: number;
}

export class KubernetesClient {
  private client: any;
  private coreV1: any;

  constructor(config?: any) {
    try {
      const k8s = require('@kubernetes/client-node');
      const kc = new k8s.KubeConfig();
      if (config) {
        kc.loadFromOptions(config);
      } else {
        kc.loadFromDefault();
      }
      this.coreV1 = kc.makeApiClient(k8s.CoreV1Api);
    } catch {
      throw new Error('@kubernetes/client-node not installed. Run: pnpm add @kubernetes/client-node');
    }
  }

  async listServices(namespace: string, labelSelector?: string): Promise<KubernetesService[]> {
    const response = await this.coreV1.listNamespacedService(namespace, undefined, undefined, undefined, labelSelector);
    return response.body.items.map((item: any) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      clusterIP: item.spec.clusterIP,
      ports: (item.spec.ports ?? []).map((p: any) => ({
        name: p.name,
        protocol: p.protocol,
        port: p.port,
        targetPort: p.targetPort,
        nodePort: p.nodePort,
      })),
      selector: item.spec.selector ?? {},
    }));
  }

  async watchServices(namespace: string, labelSelector: string, callback: (services: KubernetesService[]) => void): Promise<any> {
    const watch = new (require('@kubernetes/client-node')).Watch();
    const request = this.coreV1.listNamespacedService(namespace, undefined, undefined, undefined, labelSelector);
    return watch.watch(
      `/api/v1/namespaces/${namespace}/services`,
      { labelSelector },
      (event: any) => {
        const services = [event.object].map((item: any) => ({
          name: item.metadata.name,
          namespace: item.metadata.namespace,
          clusterIP: item.spec.clusterIP,
          ports: (item.spec.ports ?? []).map((p: any) => ({
            name: p.name,
            protocol: p.protocol,
            port: p.port,
            targetPort: p.targetPort,
            nodePort: p.nodePort,
          })),
          selector: item.spec.selector ?? {},
        }));
        callback(services);
      },
      (error: any) => {
        console.error('Watch error:', error);
      }
    );
  }

  async listEndpoints(namespace: string, labelSelector?: string): Promise<Endpoints[]> {
    const response = await this.coreV1.listNamespacedEndpoints(namespace, undefined, undefined, undefined, labelSelector);
    return response.body.items.map((item: any) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      subsets: (item.subsets ?? []).map((subset: any) => ({
        addresses: (subset.addresses ?? []).map((addr: any) => ({
          ip: addr.ip,
          hostname: addr.hostname,
          nodeName: addr.nodeName,
          targetRef: addr.targetRef,
        })),
        notReadyAddresses: (subset.notReadyAddresses ?? []).map((addr: any) => ({
          ip: addr.ip,
          hostname: addr.hostname,
          nodeName: addr.nodeName,
          targetRef: addr.targetRef,
        })),
        ports: (subset.ports ?? []).map((port: any) => ({
          name: port.name,
          protocol: port.protocol,
          port: port.port,
        })),
      })),
    }));
  }

  async watchEndpoints(namespace: string, name: string, callback: (endpoints: Endpoints) => void): Promise<any> {
    const watch = new (require('@kubernetes/client-node')).Watch();
    return watch.watch(
      `/api/v1/namespaces/${namespace}/endpoints`,
      { fieldSelector: `metadata.name=${name}` },
      (event: any) => {
        const endpoints: Endpoints = {
          name: event.object.metadata.name,
          namespace: event.object.metadata.namespace,
          subsets: (event.object.subsets ?? []).map((subset: any) => ({
            addresses: (subset.addresses ?? []).map((addr: any) => ({
              ip: addr.ip,
              hostname: addr.hostname,
              nodeName: addr.nodeName,
              targetRef: addr.targetRef,
            })),
            notReadyAddresses: (subset.notReadyAddresses ?? []).map((addr: any) => ({
              ip: addr.ip,
              hostname: addr.hostname,
              nodeName: addr.nodeName,
              targetRef: addr.targetRef,
            })),
            ports: (subset.ports ?? []).map((port: any) => ({
              name: port.name,
              protocol: port.protocol,
              port: port.port,
            })),
          })),
        };
        callback(endpoints);
      },
      (error: any) => {
        console.error('Watch error:', error);
      }
    );
  }

  async getPods(namespace: string, labelSelector?: string): Promise<any[]> {
    const response = await this.coreV1.listNamespacedPod(namespace, undefined, undefined, undefined, labelSelector);
    return response.body.items;
  }

  async getNodes(): Promise<any[]> {
    const response = await this.coreV1.listNode();
    return response.body.items;
  }
}

export function endpointsToInstances(endpoints: Endpoints, servicePorts: ServicePort[]): ServiceInstance[] {
  const instances: ServiceInstance[] = [];

  for (const subset of endpoints.subsets) {
    for (const address of subset.addresses) {
      for (const port of subset.ports) {
        const servicePort = servicePorts.find(p => p.name === port.name || p.port === port.port);
        instances.push({
          id: `${endpoints.name}-${address.ip}-${port.port}`,
          name: endpoints.name,
          address: address.ip,
          port: port.port,
          metadata: {
            namespace: endpoints.namespace,
            servicePort: servicePort?.name,
            targetPort: servicePort?.targetPort,
            nodeName: address.nodeName,
          },
          tags: [],
          registeredAt: new Date(),
          lastHeartbeat: new Date(),
        });
      }
    }
  }

  return instances;
}

export interface PodMetadata {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  ip: string;
  nodeName: string;
  phase: string;
}

export function extractPodMetadata(pod: any): PodMetadata {
  return {
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    labels: pod.metadata.labels ?? {},
    annotations: pod.metadata.annotations ?? {},
    ip: pod.status.podIP,
    nodeName: pod.spec.nodeName,
    phase: pod.status.phase,
  };
}

export interface IngressRule {
  host?: string;
  paths: IngressPath[];
}

export interface IngressPath {
  path: string;
  pathType: string;
  backend: {
    serviceName: string;
    servicePort: number | string;
  };
}

export function parseIngress(ingress: any): IngressRule[] {
  const rules: IngressRule[] = [];

  for (const rule of ingress.spec.rules ?? []) {
    const paths: IngressPath[] = [];
    for (const path of rule.http?.paths ?? []) {
      paths.push({
        path: path.path ?? '/',
        pathType: path.pathType ?? 'Prefix',
        backend: {
          serviceName: path.backend.service?.name ?? '',
          servicePort: path.backend.service?.port?.number ?? path.backend.service?.port?.name ?? 80,
        },
      });
    }
    rules.push({
      host: rule.host,
      paths,
    });
  }

  return rules;
}

export function createKubernetesDiscoveryClient(config?: any): KubernetesClient {
  return new KubernetesClient(config);
}