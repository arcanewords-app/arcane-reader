import { describe, expect, it } from 'vitest';
import { translationRequestBoardQuerySchema } from '../../../src/api/schemas/translationRequestBoard.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('translationRequestBoardQuerySchema contract', () => {
  it('accepts a valid board query fixture', () => {
    const parsed = translationRequestBoardQuerySchema.safeParse(
      loadFixture('translation-request-board-query.json')
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mine).toBe(false);
      expect(parsed.data.limit).toBe(25);
    }
  });
});
