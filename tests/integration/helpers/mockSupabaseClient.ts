/**
 * Supabase client stub for profile update integration tests.
 */

import { vi } from 'vitest';

export const supabaseClientMocks = {
  single: vi.fn(),
  createClientWithToken: vi.fn(),
};

export function resetSupabaseClientMocks(): void {
  supabaseClientMocks.single.mockReset();
  supabaseClientMocks.createClientWithToken.mockReset();

  supabaseClientMocks.single.mockResolvedValue({
    data: { avatar_url: null },
    error: null,
  });

  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: supabaseClientMocks.single,
  };

  supabaseClientMocks.createClientWithToken.mockReturnValue({
    from: vi.fn(() => chain),
  });
}

resetSupabaseClientMocks();

export function installSupabaseClientMocks() {
  return {
    supabase: {},
    createClientWithToken: supabaseClientMocks.createClientWithToken,
    createServiceRoleClient: vi.fn(),
  };
}
