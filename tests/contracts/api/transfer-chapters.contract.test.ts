import { describe, expect, it } from 'vitest';
import { transferChaptersBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('transferChaptersBodySchema contract', () => {
  it('accepts a valid transfer chapters fixture', () => {
    const parsed = transferChaptersBodySchema.safeParse(
      loadFixture('transfer-chapters.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects empty chapterIds array', () => {
    const parsed = transferChaptersBodySchema.safeParse(
      loadFixture('transfer-chapters.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
