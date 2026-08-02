import { describe, expect, it } from 'vitest';
import { glossaryBulkDeleteBodySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryBulkDeleteBodySchema contract', () => {
  it('accepts a valid bulk delete fixture', () => {
    const parsed = glossaryBulkDeleteBodySchema.safeParse(
      loadFixture('glossary-bulk-delete.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects empty entryIds array', () => {
    const parsed = glossaryBulkDeleteBodySchema.safeParse(
      loadFixture('glossary-bulk-delete.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
