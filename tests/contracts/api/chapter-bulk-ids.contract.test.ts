import { describe, expect, it } from 'vitest';
import { chapterBulkIdsBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterBulkIdsBodySchema contract', () => {
  it('accepts a valid bulk ids fixture', () => {
    const parsed = chapterBulkIdsBodySchema.safeParse(
      loadFixture('chapter-bulk-ids.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects empty chapterIds array', () => {
    const parsed = chapterBulkIdsBodySchema.safeParse(
      loadFixture('chapter-bulk-ids.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
