import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { paginationQuerySchema, optionalUrlSchema, uuidSchema } from './common.js';
import {
  chapterIdsBodySchema,
  chapterTranslateBodySchema,
  chapterTitleBodySchema,
} from './chapters.js';

describe('api/schemas/common', () => {
  it('uuidSchema accepts valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(uuidSchema.parse(id), id);
  });

  it('uuidSchema rejects invalid UUID', () => {
    assert.throws(() => uuidSchema.parse('not-a-uuid'));
  });

  it('paginationQuerySchema coerces string numbers', () => {
    const parsed = paginationQuerySchema.parse({ limit: '25', offset: '0' });
    assert.equal(parsed.limit, 25);
    assert.equal(parsed.offset, 0);
  });

  it('paginationQuerySchema rejects limit above max', () => {
    assert.throws(() => paginationQuerySchema.parse({ limit: 500 }));
  });

  it('optionalUrlSchema maps empty string to undefined', () => {
    assert.equal(optionalUrlSchema.parse(''), undefined);
    assert.equal(optionalUrlSchema.parse('https://example.com'), 'https://example.com');
  });
});

describe('api/schemas/chapters', () => {
  it('chapterIdsBodySchema requires at least one chapter id', () => {
    assert.throws(() => chapterIdsBodySchema.parse({ chapterIds: [] }));
    const ok = chapterIdsBodySchema.parse({ chapterIds: ['ch-1'] });
    assert.deepEqual(ok.chapterIds, ['ch-1']);
  });

  it('chapterTranslateBodySchema accepts stages union', () => {
    const all = chapterTranslateBodySchema.parse({ stages: 'all' });
    assert.equal(all.stages, 'all');
    const subset = chapterTranslateBodySchema.parse({
      stages: ['translation', 'editing'],
    });
    assert.deepEqual(subset.stages, ['translation', 'editing']);
  });

  it('chapterTitleBodySchema rejects blank title', () => {
    assert.throws(() => chapterTitleBodySchema.parse({ title: '   ' }));
  });
});
