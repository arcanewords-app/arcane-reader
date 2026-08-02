import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TRANSLATION_STATUSES } from '../../../src/shared/translation-status.js';
import { loadFixture } from '../helpers/loadFixture.js';

/** Same enum used by publications publishBodySchema.translationStatus. */
const publicationTranslationStatusSchema = z.enum(['in_progress', 'complete', 'abandoned']);

describe('translation status shared contract', () => {
  it('freezes TRANSLATION_STATUSES against publications Zod enum', () => {
    const fixture = loadFixture('translation-statuses.json') as { statuses: string[] };
    expect(fixture.statuses).toEqual([...TRANSLATION_STATUSES]);
    for (const status of fixture.statuses) {
      expect(publicationTranslationStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});
