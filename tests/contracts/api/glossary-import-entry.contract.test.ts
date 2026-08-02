import { describe, expect, it } from 'vitest';
import { glossaryImportEntrySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryImportEntrySchema contract', () => {
  it('accepts a valid import entry fixture', () => {
    const parsed = glossaryImportEntrySchema.safeParse(
      loadFixture('glossary-import-entry.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const parsed = glossaryImportEntrySchema.safeParse(
      loadFixture('glossary-import-entry.invalid-type.json')
    );
    expect(parsed.success).toBe(false);
  });
});
