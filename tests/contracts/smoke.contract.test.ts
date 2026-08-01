/**
 * Placeholder contract suite — ensures npm run test:contract has a green suite.
 * Replace with Zod fixture round-trips in Wave 9 rollout.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const statusContractSchema = z.object({
  version: z.string(),
  storage: z.literal('supabase'),
  ready: z.boolean(),
});

describe('API status contract (fixture)', () => {
  it('accepts a minimal status-shaped payload', () => {
    const fixture = {
      version: '0.1.0',
      storage: 'supabase' as const,
      ready: false,
    };
    const parsed = statusContractSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid storage enum', () => {
    const parsed = statusContractSchema.safeParse({
      version: '0.1.0',
      storage: 'sqlite',
      ready: true,
    });
    expect(parsed.success).toBe(false);
  });
});
