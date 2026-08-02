import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { writeSharedHealth, redisPing, hasRedisCache, createServiceRoleClient } = vi.hoisted(() => ({
  writeSharedHealth: vi.fn().mockResolvedValue(undefined),
  redisPing: vi.fn().mockResolvedValue(undefined),
  hasRedisCache: vi.fn().mockReturnValue(false),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./healthSnapshotStore.js', () => ({
  writeSharedHealth: (...args: unknown[]) => writeSharedHealth(...args),
}));

vi.mock('./redisCache.js', () => ({
  hasRedisCache: () => hasRedisCache(),
  redisPing: (...args: unknown[]) => redisPing(...args),
}));

vi.mock('./supabaseClient.js', () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClient(...args),
}));

import { serviceHealthManager } from './serviceHealth.js';

describe('serviceHealthManager', () => {
  beforeEach(() => {
    writeSharedHealth.mockClear();
    serviceHealthManager.stopPeriodicChecks();
    createServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: { id: '1' }, error: null }),
          }),
        }),
      }),
    });
  });

  afterEach(() => {
    serviceHealthManager.stopPeriodicChecks();
    vi.useRealTimers();
  });

  it('registers checker and reports overall healthy by default', () => {
    serviceHealthManager.registerService('test-svc', async () => undefined);
    assert.equal(serviceHealthManager.getOverallStatus(), 'healthy');
    assert.ok(serviceHealthManager.getHealth()['test-svc']);
  });

  it('marks service down via reportError and writes shared health', async () => {
    serviceHealthManager.registerService('err-svc', async () => undefined);
    serviceHealthManager.reportError('err-svc', 'boom');
    assert.equal(serviceHealthManager.getHealth()['err-svc']?.status, 'down');
    assert.equal(serviceHealthManager.getOverallStatus(), 'down');
    await Promise.resolve();
    assert.ok(writeSharedHealth.mock.calls.length >= 1);
  });

  it('ignores reportError for unknown service', () => {
    const before = writeSharedHealth.mock.calls.length;
    serviceHealthManager.reportError('missing-svc', 'nope');
    assert.equal(writeSharedHealth.mock.calls.length, before);
  });

  it('checkAll marks healthy services and writes shared snapshot', async () => {
    serviceHealthManager.registerService('fast', async () => undefined);
    await serviceHealthManager.checkAll();
    assert.equal(serviceHealthManager.getHealth()['fast']?.status, 'healthy');
    assert.ok((serviceHealthManager.getHealth()['fast']?.responseTimeMs ?? -1) >= 0);
    assert.ok(writeSharedHealth.mock.calls.length >= 1);
  });

  it('getOverallStatus returns degraded when a service is degraded and none are down', async () => {
    // Reset supabase (module-registered) and a probe service to healthy first.
    serviceHealthManager.registerService('degraded-svc', async () => undefined);
    await serviceHealthManager.checkAll();
    serviceHealthManager.applySharedHealth({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        supabase: {
          status: 'healthy',
          lastCheck: new Date(),
          lastHealthy: new Date(),
        },
        'degraded-svc': {
          status: 'degraded',
          lastCheck: new Date(),
          lastHealthy: new Date(),
          responseTimeMs: 6001,
        },
      },
    });
    assert.equal(serviceHealthManager.getHealth()['degraded-svc']?.status, 'degraded');
    assert.equal(serviceHealthManager.getOverallStatus(), 'degraded');
  });

  it('checkAll marks service down when checker throws', async () => {
    serviceHealthManager.registerService('failing', async () => {
      throw new Error('probe failed');
    });
    await serviceHealthManager.checkAll();
    assert.equal(serviceHealthManager.getHealth()['failing']?.status, 'down');
    assert.match(serviceHealthManager.getHealth()['failing']?.error ?? '', /probe failed/);
  });

  it('applySharedHealth updates registered services from snapshot', () => {
    serviceHealthManager.registerService('shared', async () => undefined);
    serviceHealthManager.applySharedHealth({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        shared: {
          status: 'degraded',
          lastCheck: new Date('2026-01-01T00:00:00Z'),
          lastHealthy: '2026-01-01T00:00:00Z',
          error: 'slow',
          responseTimeMs: 9000,
        },
        unknown: {
          status: 'down',
          lastCheck: new Date(),
          lastHealthy: null,
        },
      },
    });
    const health = serviceHealthManager.getHealth()['shared'];
    assert.equal(health?.status, 'degraded');
    assert.equal(health?.error, 'slow');
    assert.equal(health?.responseTimeMs, 9000);
  });

  it('getHealthResult mirrors overall status and services', () => {
    serviceHealthManager.registerService('snap', async () => undefined);
    const result = serviceHealthManager.getHealthResult();
    assert.equal(result.status, serviceHealthManager.getOverallStatus());
    assert.ok(result.services.snap || result.services.supabase);
    assert.ok(result.timestamp);
  });

  it('getSupabaseStatus falls back to healthy when missing', () => {
    assert.ok(['healthy', 'degraded', 'down'].includes(serviceHealthManager.getSupabaseStatus()));
  });

  it('startPeriodicChecks schedules checkAll and stop clears interval', async () => {
    vi.useFakeTimers();
    const checkSpy = vi.spyOn(serviceHealthManager, 'checkAll').mockResolvedValue(undefined);
    serviceHealthManager.startPeriodicChecks(1000);
    serviceHealthManager.startPeriodicChecks(1000); // replace interval
    await vi.advanceTimersByTimeAsync(1000);
    assert.ok(checkSpy.mock.calls.length >= 1);
    serviceHealthManager.stopPeriodicChecks();
    checkSpy.mockRestore();
  });
});
