import { describe, expect, it } from 'vitest';
import { glossaryCreateBodySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryCreateBodySchema contract', () => {
  it('accepts a valid create body fixture', () => {
    const parsed = glossaryCreateBodySchema.safeParse(loadFixture('glossary-create.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const parsed = glossaryCreateBodySchema.safeParse(
      loadFixture('glossary-create.invalid-type.json')
    );
    expect(parsed.success).toBe(false);
  });
});
