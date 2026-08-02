import { describe, expect, it } from 'vitest';
import { publicationsListQuerySchema } from '../../../src/api/schemas/publications.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('publicationsListQuerySchema contract', () => {
  it('accepts a valid list query fixture', () => {
    const parsed = publicationsListQuerySchema.safeParse(
      loadFixture('publications-list-query.valid.json')
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(20);
      expect(parsed.data.orderAsc).toBe(false);
    }
  });
});
