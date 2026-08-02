/**
 * Freeze GET /api/status response shape against client SystemStatus.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadFixture } from '../helpers/loadFixture.js';

/** Wire shape mirrored from `src/client/types` SystemStatus. */
const systemStatusContractSchema = z.object({
  version: z.string(),
  ready: z.boolean(),
  ai: z.object({
    provider: z.string().nullable(),
    model: z.string(),
    configured: z.boolean(),
  }),
  config: z.object({
    valid: z.boolean(),
    errors: z.array(z.string()),
  }),
  storage: z.string(),
  maxFileSizeBytes: z.number().int().positive().optional(),
});

describe('API status response contract', () => {
  it('accepts a valid SystemStatus-shaped fixture', () => {
    const parsed = systemStatusContractSchema.safeParse(loadFixture('status-response.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects missing ai block', () => {
    const fixture = loadFixture('status-response.valid.json') as Record<string, unknown>;
    const { ai: _ai, ...rest } = fixture;
    const parsed = systemStatusContractSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });
});
