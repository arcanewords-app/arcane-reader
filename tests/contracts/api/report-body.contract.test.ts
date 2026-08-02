import { describe, expect, it } from 'vitest';
import { reportBodySchema } from '../../../src/api/schemas/publications.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('reportBodySchema contract', () => {
  it('accepts a valid report body fixture', () => {
    const parsed = reportBodySchema.safeParse(loadFixture('report-body.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects blank description', () => {
    const parsed = reportBodySchema.safeParse(loadFixture('report-body.invalid-empty.json'));
    expect(parsed.success).toBe(false);
  });
});
