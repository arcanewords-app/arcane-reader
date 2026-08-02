import { serviceHealthManager } from '../../../src/services/serviceHealth.js';

export function markSupabaseDown(message = 'integration test: supabase down'): void {
  serviceHealthManager.reportError('supabase', message);
}

export function markSupabaseHealthy(): void {
  const now = new Date();
  serviceHealthManager.applySharedHealth({
    status: 'healthy',
    timestamp: now.toISOString(),
    services: {
      supabase: {
        name: 'supabase',
        status: 'healthy',
        lastCheck: now,
        lastHealthy: now,
        error: undefined,
      },
    },
  });
}
