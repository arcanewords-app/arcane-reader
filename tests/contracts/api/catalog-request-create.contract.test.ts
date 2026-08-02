import { describe, expect, it } from 'vitest';
import { catalogTranslationRequestCreateSchema } from '../../../src/api/schemas/catalogRequests.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('catalogTranslationRequestCreateSchema contract', () => {
  it('accepts a valid create body fixture', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse(
      loadFixture('catalog-request-create.valid.json')
    );
    expect(parsed.success).toBe(true);
  });
});
