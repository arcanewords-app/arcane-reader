import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { resolveSupabaseClient } from './clientContext.js';

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ kind: 'user' })),
  createServiceRoleClient: vi.fn(() => ({ kind: 'service' })),
}));

describe('resolveSupabaseClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns service role client when useServiceRole is true', async () => {
    const client = await resolveSupabaseClient({ useServiceRole: true });
    assert.deepEqual(client, { kind: 'service' });
  });

  it('throws when token missing for user client', async () => {
    await assert.rejects(() => resolveSupabaseClient({}), /Token required/);
  });
});
