import { describe, expect, it } from 'vitest';
import { translationStatusSchema } from '../../../src/api/schemas/publications.js';
import { TRANSLATION_STATUSES } from '../../../src/shared/translation-status.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('translation status shared contract', () => {
  it('freezes TRANSLATION_STATUSES against publications Zod enum', () => {
    const fixture = loadFixture('translation-statuses.json') as { statuses: string[] };
    expect(fixture.statuses).toEqual([...TRANSLATION_STATUSES]);
    expect([...translationStatusSchema.options]).toEqual([...TRANSLATION_STATUSES]);
    for (const status of fixture.statuses) {
      expect(translationStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});
