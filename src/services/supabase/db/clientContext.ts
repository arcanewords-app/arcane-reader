/**
 * Supabase client resolution — extracted from supabaseDatabase for testability.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { validateToken } from '../../../utils/tokenValidation.js';
import { createClientWithToken } from '../../supabaseClient.js';

export interface ResolveClientOptions {
  token?: string;
  useServiceRole?: boolean;
}

/**
 * Pick anon+JWT client or service-role client based on options.
 * Throws when token is required but missing/invalid.
 */
export async function resolveSupabaseClient(
  options: ResolveClientOptions
): Promise<SupabaseClient> {
  if (options.useServiceRole === true) {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    return createServiceRoleClient();
  }

  if (!options.token) {
    throw new Error('Token required for user-scoped Supabase client');
  }

  validateToken(options.token);
  return createClientWithToken(options.token);
}
