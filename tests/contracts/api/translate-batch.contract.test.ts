import { describe, expect, it } from 'vitest';
import { translateBatchBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('translateBatchBodySchema contract', () => {
  it('accepts a valid batch body fixture', () => {
    const parsed = translateBatchBodySchema.safeParse(loadFixture('translate-batch.valid.json'));
    expect(parsed.success).toBe(true);
  });
});
