import { describe, expect, it } from 'vitest';
import { announcementDismissSchema } from '../../../src/api/schemas/news.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('announcementDismissSchema contract', () => {
  it('accepts a valid dismiss body fixture', () => {
    const parsed = announcementDismissSchema.safeParse(
      loadFixture('announcement-dismiss.valid.json')
    );
    expect(parsed.success).toBe(true);
  });
});
