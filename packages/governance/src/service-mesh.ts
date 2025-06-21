import { Injectable } from '@faultless/core';

/**
 * Service Instance
 */
export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  version: string;
  metadata: Record<string, string>;
  status: 'UP' | 'DOWN' | 'MAINTENANCE';
  registeredAt: Date;
  lastHeartbeat: Date;
  healthCheck?: {
    path: string;
    intervalMs: number;
  };
}

/**
 * Service Mesh Configuration
 */
export interface ServiceMeshConfig {
  enabled: boolean;
  sidecarEnabled: boolean;
  mutualTlsEnabled: boolean;
  rateLimitingEnabled: boolean;
  circuitBreakerEnabled: boolean;
  loadBalancingStrategy: string;
}

/**
 * Service Mesh
 * - Service-to-service communication
 * - Mutual TLS encryption
 * - Circuit breaker integration
 * - Rate limiting integration
 * - Load balancing integration
 * - Health checks
 */
@Injectable()
export class ServiceMesh {
  private services: Map<string, ServiceInstance> = new Map();
  private config: ServiceMeshConfig;

  constructor(config?: Partial<ServiceMeshConfig>) {
    this.config = {
      enabled: true,
      sidecarEnabled: true,
      mutualTlsEnabled: true,
      rateLimitingEnabled: true,
      circuitBreakerEnabled: true,
      loadBalancingStrategy: 'p2c',
      ...config,
    };
  }

  /**
   * Register service
   */
  registerService(instance: ServiceInstance): void {
    this.services.set(instance.id, instance);
    console.log('Service registered:', instance.id, instance.name);
  }

  /**
   * Deregister service
   */
  deregisterService(id: string): boolean {
    const deleted = this.services.delete(id);
    if (deleted) {
      console.log('Service deregistered:', id);
    }
    return deleted;
  }

  /**
   * Get service by ID
   */
  getService(id: string): ServiceInstance | undefined {
    return this.services.get(id);
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  /**
   * Get services by name
   */
  getServicesByName(name: string): ServiceInstance[] {
    return this.getAllServices().filter(s => s.name === name);
  }

  /**
   * Get healthy services
   */
  getHealthyServices(name?: string): ServiceInstance[] {
    const services = name ? this.getServicesByName(name) : this.getAllServices();
    return services.filter(s => s.status === 'UP');
  }

  /**
   * Update service status
   */
  updateServiceStatus(id: string, status: ServiceInstance['status']): void {
    const service = this.services.get(id);
    if (service) {
      service.status = status;
      service.lastHeartbeat = new Date();
    }
  }

  /**
   * Send heartbeat
   */
  heartbeat(id: string): boolean {
    const service = this.services.get(id);
    if (service) {
      service.lastHeartbeat = new Date();
      return true;
    }
    return false;
  }

  /**
   * Check service health
   */
  async checkServiceHealth(id: string): Promise<boolean> {
    const service = this.services.get(id);
    if (!service) return false;

    // Check if heartbeat is recent
    const heartbeatAge = Date.now() - service.lastHeartbeat.getTime();
    if (heartbeatAge > 30000) {
      service.status = 'DOWN';
      return false;
    }

    // Check if maintenance
    if (service.status === 'MAINTENANCE') {
      return false;
    }

    return true;
  }

  /**
   * Get mesh config
   */
  getConfig(): ServiceMeshConfig {
    return { ...this.config };
  }

  /**
   * Get mesh stats
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    maintenanceServices: number;
  } {
    const services = this.getAllServices();
    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'UP').length,
      unhealthyServices: services.filter(s => s.status === 'DOWN').length,
      maintenanceServices: services.filter(s => s.status === 'MAINTENANCE').length,
    };
  }
}

/**
 * Create Service Mesh
 */
export function createServiceMesh(config?: Partial<ServiceMeshConfig>): ServiceMesh {
  return new ServiceMesh(config);
}