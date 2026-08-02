import { describe, expect, it } from 'vitest';
import { glossaryUpdateBodySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryUpdateBodySchema contract', () => {
  it('accepts a valid partial update fixture', () => {
    const parsed = glossaryUpdateBodySchema.safeParse(loadFixture('glossary-update.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const parsed = glossaryUpdateBodySchema.safeParse(
      loadFixture('glossary-update.invalid-type.json')
    );
    expect(parsed.success).toBe(false);
  });
});
