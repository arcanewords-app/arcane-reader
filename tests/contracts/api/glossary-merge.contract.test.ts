import { describe, expect, it } from 'vitest';
import { glossaryMergeBodySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryMergeBodySchema contract', () => {
  it('accepts a valid merge body fixture', () => {
    const parsed = glossaryMergeBodySchema.safeParse(loadFixture('glossary-merge.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects fewer than two entry ids', () => {
    const parsed = glossaryMergeBodySchema.safeParse(
      loadFixture('glossary-merge.invalid-one.json')
    );
    expect(parsed.success).toBe(false);
  });
});
