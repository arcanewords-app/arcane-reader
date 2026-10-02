import { describe, expect, it } from 'vitest';
import { newsTranslateSchema, newsUpdateSchema } from '../../../src/api/schemas/news.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('news translation contract', () => {
  it('accepts a translate body for a non-primary locale', () => {
    const parsed = newsTranslateSchema.safeParse(loadFixture('news-translate.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('accepts a single-locale patch on news update', () => {
    const parsed = newsUpdateSchema.safeParse(loadFixture('news-translation-patch.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects translating into Russian', () => {
    const parsed = newsTranslateSchema.safeParse({ locale: 'ru' });
    expect(parsed.success).toBe(false);
  });
});
