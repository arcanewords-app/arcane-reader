import { describe, expect, it } from 'vitest';
import { translationRequestInterestUpdateSchema } from '../../../src/api/schemas/translationRequestBoard.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('translationRequestInterestUpdateSchema contract', () => {
  it('accepts a valid interest update fixture', () => {
    const parsed = translationRequestInterestUpdateSchema.safeParse(
      loadFixture('interest-update.valid.json')
    );
    expect(parsed.success).toBe(true);
  });
});
