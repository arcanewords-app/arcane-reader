import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import {
  isHealthExemptPath,
  isPublicReadRoute,
  resolveSupabaseStatusForBreaker,
} from './healthCircuitBreaker.js';

describe('healthCircuitBreaker', () => {
  it('isHealthExemptPath covers status and health', () => {
    assert.equal(isHealthExemptPath('/status'), true);
    assert.equal(isHealthExemptPath('/health'), true);
    assert.equal(isHealthExemptPath('/projects'), false);
  });

  it('isPublicReadRoute allows only GET public surfaces', () => {
    assert.equal(isPublicReadRoute('GET', '/news'), true);
    assert.equal(isPublicReadRoute('GET', '/news/slug'), true);
    assert.equal(isPublicReadRoute('GET', '/announcements/active'), true);
    assert.equal(isPublicReadRoute('GET', '/publications'), true);
    assert.equal(isPublicReadRoute('GET', '/publications/x'), true);
    assert.equal(isPublicReadRoute('GET', '/public/entities'), true);
    assert.equal(isPublicReadRoute('GET', '/public/entities/1'), true);
    assert.equal(isPublicReadRoute('POST', '/news'), false);
    assert.equal(isPublicReadRoute('GET', '/projects'), false);
  });

  it('resolveSupabaseStatusForBreaker prefers shared snapshot', async () => {
    const status = await resolveSupabaseStatusForBreaker(
      () => 'healthy',
      async () => ({
        status: 'down',
        timestamp: new Date().toISOString(),
        services: {
          supabase: {
            status: 'down',
            lastCheck: new Date(),
            lastHealthy: null,
          },
        },
      })
    );
    assert.equal(status, 'down');
  });

  it('resolveSupabaseStatusForBreaker falls back to local status', async () => {
    const local = vi.fn(() => 'degraded' as const);
    const status = await resolveSupabaseStatusForBreaker(local, async () => null);
    assert.equal(status, 'degraded');
    assert.equal(local.mock.calls.length, 1);
  });
});
