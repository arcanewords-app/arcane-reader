import { describe, expect, it } from 'vitest';
import { chapterStatusBodySchema } from '../../../src/api/schemas/chapters.js';
import type { ChapterStatus } from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

const CLIENT_CHAPTER_STATUSES: ChapterStatus[] = [
  'pending',
  'translating',
  'analyzed',
  'draft',
  'partial',
  'completed',
  'error',
];

describe('chapter status client ↔ server contract', () => {
  it('freezes statuses against Zod enum and client union', () => {
    const fixture = loadFixture('chapter-statuses.json') as { statuses: string[] };
    expect(fixture.statuses).toEqual([...chapterStatusBodySchema.shape.status.options]);
    expect(fixture.statuses).toEqual(CLIENT_CHAPTER_STATUSES);
  });
});
