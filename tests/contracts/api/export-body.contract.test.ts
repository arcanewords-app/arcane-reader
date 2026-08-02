import { describe, expect, it } from 'vitest';
import { exportBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('exportBodySchema contract', () => {
  it('accepts a valid export body fixture', () => {
    const parsed = exportBodySchema.safeParse(loadFixture('export-body.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown format', () => {
    const parsed = exportBodySchema.safeParse(loadFixture('export-body.invalid-format.json'));
    expect(parsed.success).toBe(false);
  });
});
