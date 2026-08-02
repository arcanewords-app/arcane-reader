import { describe, expect, it } from 'vitest';
import { paragraphBulkUpdateBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('paragraphBulkUpdateBodySchema contract', () => {
  it('accepts a valid bulk update fixture', () => {
    const parsed = paragraphBulkUpdateBodySchema.safeParse(
      loadFixture('paragraph-bulk-update.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects empty updates array', () => {
    const parsed = paragraphBulkUpdateBodySchema.safeParse(
      loadFixture('paragraph-bulk-update.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
