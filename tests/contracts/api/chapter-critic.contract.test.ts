import { describe, expect, it } from 'vitest';
import { chapterCriticBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterCriticBodySchema contract', () => {
  it('accepts a valid critic body fixture', () => {
    const parsed = chapterCriticBodySchema.safeParse(loadFixture('chapter-critic.valid.json'));
    expect(parsed.success).toBe(true);
  });
});
