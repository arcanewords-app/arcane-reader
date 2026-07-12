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

describe('api/schemas/publications', () => {
  it('reportBodySchema requires chapterId and description', async () => {
    const { reportBodySchema } = await import('./publications.js');
    const ok = reportBodySchema.parse({ chapterId: 'ch-1', description: 'Typo' });
    assert.equal(ok.chapterId, 'ch-1');
    assert.throws(() => reportBodySchema.parse({ chapterId: '', description: 'x' }));
  });
});

describe('api/schemas/admin', () => {
  it('publicEntityCreateSchema validates kind and name', async () => {
    const { publicEntityCreateSchema } = await import('./admin.js');
    const ok = publicEntityCreateSchema.parse({ kind: 'author', name: 'Jane' });
    assert.equal(ok.kind, 'author');
    assert.throws(() => publicEntityCreateSchema.parse({ kind: 'author', name: '' }));
  });
});

describe('api/schemas/glossary', () => {
  it('glossaryMergeBodySchema requires at least two entry ids', async () => {
    const { glossaryMergeBodySchema } = await import('./glossary.js');
    assert.throws(() => glossaryMergeBodySchema.parse({ entryIds: ['a'] }));
    const ok = glossaryMergeBodySchema.parse({ entryIds: ['a', 'b'] });
    assert.deepEqual(ok.entryIds, ['a', 'b']);
  });

  it('glossaryCreateBodySchema requires original', async () => {
    const { glossaryCreateBodySchema } = await import('./glossary.js');
    const ok = glossaryCreateBodySchema.parse({ original: 'Alice' });
    assert.equal(ok.type, 'term');
    assert.throws(() => glossaryCreateBodySchema.parse({ original: '' }));
  });
});

describe('api/schemas/auth', () => {
  it('loginBodySchema requires email and password', async () => {
    const { loginBodySchema } = await import('./auth.js');
    const ok = loginBodySchema.parse({ email: 'a@b.com', password: 'secret' });
    assert.equal(ok.email, 'a@b.com');
    assert.throws(() => loginBodySchema.parse({ email: 'bad', password: 'x' }));
  });
});

describe('api/schemas/user', () => {
  it('tokenUsageHistoryQuerySchema coerces days', async () => {
    const { tokenUsageHistoryQuerySchema } = await import('./user.js');
    const ok = tokenUsageHistoryQuerySchema.parse({ days: '7' });
    assert.equal(ok.days, 7);
  });
});
