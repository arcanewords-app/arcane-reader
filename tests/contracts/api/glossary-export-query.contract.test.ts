import { describe, expect, it } from 'vitest';
import { glossaryExportQuerySchema } from '../../../src/api/schemas/glossary.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('glossaryExportQuerySchema contract', () => {
  it('accepts a valid export query fixture', () => {
    const parsed = glossaryExportQuerySchema.safeParse(
      loadFixture('glossary-export-query.valid.json')
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.format).toBe('csv');
    }
  });
});
