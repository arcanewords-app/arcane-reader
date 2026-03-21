/**
 * Service Health Manager
 *
 * Extensible manager for monitoring external service health (Supabase, etc.).
 * Supports periodic pinging, status tracking, and degradation detection.
 */

import { createServiceRoleClient } from './supabaseClient.js';
import { hasRedisCache, redisPing } from './redisCache.js';
import { logger } from '../logger.js';

export type ServiceStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastCheck: Date;
  lastHealthy: Date | null;
  error?: string;
  responseTimeMs?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down';
  services: Record<string, Omit<ServiceHealth, 'name'> & { name?: string }>;
  timestamp: string;
}

type ServiceChecker = () => Promise<void>;

const DEGRADED_THRESHOLD_MS = 5000;

class ServiceHealthManagerImpl {
  private services = new Map<string, ServiceHealth>();
  private checkers = new Map<string, ServiceChecker>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  registerService(name: string, checker: ServiceChecker): void {
    this.services.set(name, {
      name,
      status: 'healthy',
      lastCheck: new Date(0),
      lastHealthy: new Date(),
    });
    this.checkers.set(name, checker);
  }

  getHealth(): Record<string, ServiceHealth> {
    const result: Record<string, ServiceHealth> = {};
    for (const [name, health] of this.services) {
      result[name] = { ...health };
    }
    return result;
  }

  getOverallStatus(): ServiceStatus {
    const statuses = Array.from(this.services.values()).map((s) => s.status);
    if (statuses.some((s) => s === 'down')) return 'down';
    if (statuses.some((s) => s === 'degraded')) return 'degraded';
    return 'healthy';
  }

  getHealthResult(): HealthCheckResult {
    const services: Record<string, Omit<ServiceHealth, 'name'> & { name?: string }> = {};
    for (const [name, health] of this.services) {
      services[name] = {
        ...health,
        name,
      };
    }
    return {
      status: this.getOverallStatus(),
      services,
      timestamp: new Date().toISOString(),
    };
  }

  reportError(serviceName: string, error: string): void {
    const existing = this.services.get(serviceName);
    if (!existing) return;

    const updated: ServiceHealth = {
      ...existing,
      status: 'down',
      lastCheck: new Date(),
      error,
      responseTimeMs: undefined,
    };
    this.services.set(serviceName, updated);
    logger.warn({ service: serviceName, error }, 'Service health: reported error');
  }

  async checkAll(): Promise<void> {
    for (const [name, checker] of this.checkers) {
      await this.checkService(name, checker);
    }
  }

  private async checkService(name: string, checker: ServiceChecker): Promise<void> {
    const existing = this.services.get(name);
    if (!existing) return;

    const start = Date.now();
    try {
      await checker();
      const elapsed = Date.now() - start;

      const newStatus: ServiceStatus = elapsed > DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy';

      const updated: ServiceHealth = {
        ...existing,
        status: newStatus,
        lastCheck: new Date(),
        lastHealthy: new Date(),
        error: undefined,
        responseTimeMs: elapsed,
      };
      this.services.set(name, updated);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const updated: ServiceHealth = {
        ...existing,
        status: 'down',
        lastCheck: new Date(),
        error: errorMessage,
        responseTimeMs: undefined,
      };
      this.services.set(name, updated);
      logger.warn({ service: name, err }, 'Service health check failed');
    }
  }

  startPeriodicChecks(intervalMs: number): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(() => {
      this.checkAll().catch((err) => {
        logger.error({ err }, 'Service health periodic check failed');
      });
    }, intervalMs);
    logger.info({ intervalMs }, 'Service health periodic checks started');
  }

  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Service health periodic checks stopped');
    }
  }
}

export const serviceHealthManager = new ServiceHealthManagerImpl();

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

/**
 * Supabase health checker: simple query to verify DB connectivity.
 * Uses Promise.race with timeout to avoid hanging 60+ s when Supabase is unresponsive.
 */
async function checkSupabase(): Promise<void> {
  const client = createServiceRoleClient();
  const queryPromise = (async () => {
    const { error } = await client.from('projects').select('id').limit(1).maybeSingle();
    if (error) throw new Error(error.message);
  })();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT_MS);
  });
  await Promise.race([queryPromise, timeoutPromise]);
}

// Register Supabase as the first service
serviceHealthManager.registerService('supabase', checkSupabase);

/**
 * Redis health checker: ping to verify connectivity.
 * Only registered when Redis is configured.
 */
async function checkRedis(): Promise<void> {
  await redisPing();
}

if (hasRedisCache()) {
  serviceHealthManager.registerService('redis', checkRedis);
}
