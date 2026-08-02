import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockCreateClientWithToken: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockTransformList: vi.fn((row: Record<string, unknown>) => ({
    id: row.id,
    number: row.number,
    title: row.title,
  })),
  mockTransformChapter: vi.fn((row: Record<string, unknown>, paragraphs: unknown[] = []) => ({
    id: row.id,
    number: row.number,
    title: row.title,
    paragraphs,
    translatedText: row.translated_text ?? '',
    translatedChunks: row.translated_chunks ?? [],
  })),
  mockTransformParagraph: vi.fn((row: Record<string, unknown>) => ({
    id: row.id,
    index: row.index,
    originalText: 'o',
    translatedText: row.translated_text ?? '',
  })),
  mockTransformGlossary: vi.fn((row: Record<string, unknown>) => ({
    id: row.id,
    original: row.original,
  })),
  mockTransformProject: vi.fn(
    (row: Record<string, unknown>, chapters: unknown[], glossary: unknown[]) => ({
      id: row.id,
      chapters,
      glossary,
    })
  ),
  mockGroup: vi.fn((rows: Array<{ chapter_id: string }>) => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.chapter_id) ?? [];
      list.push(row);
      map.set(row.chapter_id, list);
    }
    return map;
  }),
  mockAutoSync: vi.fn((paras: Array<{ id: string; index: number }>) =>
    paras.map((p) => ({ ...p, translatedText: `synced-${p.id}`, status: 'completed' }))
  ),
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: { from: (...args: unknown[]) => mocks.mockSupabaseFrom(...args) },
  createClientWithToken: (...args: unknown[]) => mocks.mockCreateClientWithToken(...args),
  createServiceRoleClient: (...args: unknown[]) => mocks.mockCreateServiceRoleClient(...args),
}));

vi.mock('../supabaseTransforms.js', () => ({
  transformChapterFromDB: mocks.mockTransformChapter,
  transformChapterListItemFromDB: mocks.mockTransformList,
  transformGlossaryEntryFromDB: mocks.mockTransformGlossary,
  transformParagraphFromDB: mocks.mockTransformParagraph,
  transformProjectFromDB: mocks.mockTransformProject,
}));

vi.mock('../paragraphLoader.js', () => ({
  groupParagraphRowsByChapterId: mocks.mockGroup,
}));

vi.mock('./pure/chapterSync.js', () => ({
  autoSyncChunksToParagraphs: mocks.mockAutoSync,
}));

vi.mock('../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POSTGREST_MAX_ROWS } from '../../shared/cacheContract.js';
import {
  getGlossaryCountForProject,
  getProjectForPublicationExport,
  loadChaptersForProject,
  loadChaptersForProjectLightweight,
  loadChaptersForProjectWithServiceRole,
  loadGlossaryForProject,
  loadGlossaryForProjectPublic,
  loadParagraphsForChapter,
  loadParagraphsForChapterIds,
} from './loaders.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of ['select', 'eq', 'order', 'range', 'in', 'single', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  return chain;
}

describe('loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadChaptersForProjectLightweight', () => {
    it('paginates until a short page and maps rows', async () => {
      const page1 = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({
        id: `c${i}`,
        number: i + 1,
        title: `Ch ${i + 1}`,
      }));
      const page2 = [{ id: 'last', number: POSTGREST_MAX_ROWS + 1, title: 'Last' }];
      const from = vi
        .fn()
        .mockReturnValueOnce(chainable({ data: page1, error: null }))
        .mockReturnValueOnce(chainable({ data: page2, error: null }));
      mocks.mockCreateClientWithToken.mockReturnValue({ from });

      const result = await loadChaptersForProjectLightweight('proj-1', 'tok');
      assert.equal(result.length, POSTGREST_MAX_ROWS + 1);
      assert.equal(result.at(-1)?.id, 'last');
    });

    it('stops on empty page and throws on query error', async () => {
      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: [], error: null })),
      });
      assert.deepEqual(await loadChaptersForProjectLightweight('proj-1', 'tok'), []);

      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'boom' } })),
      });
      await assert.rejects(() => loadChaptersForProjectLightweight('proj-1', 'tok'), /boom/);
    });
  });

  describe('loadParagraphsForChapterIds / loadParagraphsForChapter', () => {
    it('returns empty map for empty chapter ids', async () => {
      const map = await loadParagraphsForChapterIds({ from: vi.fn() } as never, []);
      assert.equal(map.size, 0);
    });

    it('paginates paragraphs and sorts by index', async () => {
      const client = {
        from: vi
          .fn()
          .mockReturnValueOnce(
            chainable({
              data: [
                { id: 'p2', chapter_id: 'c1', index: 2, translated_text: 'b' },
                { id: 'p1', chapter_id: 'c1', index: 1, translated_text: 'a' },
              ],
              error: null,
            })
          )
          .mockReturnValueOnce(chainable({ data: [], error: null })),
      };
      const map = await loadParagraphsForChapterIds(client as never, ['c1', 'c2']);
      assert.equal(map.get('c1')?.length, 2);
      assert.equal(map.get('c1')?.[0]?.index, 1);
      assert.deepEqual(map.get('c2'), []);
    });

    it('throws when paragraph query fails', async () => {
      const client = {
        from: vi.fn(() => chainable({ data: null, error: { message: 'para fail' } })),
      };
      await assert.rejects(() => loadParagraphsForChapterIds(client as never, ['c1']), /para fail/);
    });

    it('loads single-chapter paragraphs with token client', async () => {
      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() =>
          chainable({
            data: [{ id: 'p1', index: 0, translated_text: 'x' }],
            error: null,
          })
        ),
      });
      const paras = await loadParagraphsForChapter('c1', 'tok');
      assert.equal(paras.length, 1);
    });

    it('uses service role when requested', async () => {
      mocks.mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: [], error: null })),
      });
      assert.deepEqual(await loadParagraphsForChapter('c1', null, true), []);
    });
  });

  describe('glossary loaders', () => {
    it('loadGlossaryForProject maps entries and handles empty/error', async () => {
      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() =>
          chainable({
            data: [{ id: 'g1', original: 'A' }],
            error: null,
          })
        ),
      });
      assert.equal((await loadGlossaryForProject('p1', 'tok')).length, 1);

      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: [], error: null })),
      });
      assert.deepEqual(await loadGlossaryForProject('p1', 'tok'), []);

      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'gfail' } })),
      });
      await assert.rejects(() => loadGlossaryForProject('p1', 'tok'), /gfail/);
    });

    it('public glossary and count helpers use service role', async () => {
      mocks.mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() =>
          chainable({
            data: [{ id: 'g1', original: 'A' }],
            error: null,
          })
        ),
      });
      assert.equal((await loadGlossaryForProjectPublic('p1')).length, 1);

      mocks.mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: null, count: 3 })),
      });
      assert.equal(await getGlossaryCountForProject('p1'), 3);

      mocks.mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'x' }, count: null })),
      });
      assert.equal(await getGlossaryCountForProject('p1'), 0);
    });
  });

  describe('full chapter loaders', () => {
    it('loadChaptersForProject loads chapters without auto-recovery', async () => {
      const chapterRow = {
        id: 'c1',
        number: 1,
        title: 'One',
        translated_text: '',
        translated_chunks: [],
      };
      const from = vi
        .fn()
        .mockReturnValueOnce(chainable({ data: [chapterRow], error: null }))
        .mockReturnValueOnce(chainable({ data: [], error: null }));
      mocks.mockCreateClientWithToken.mockReturnValue({ from });

      const chapters = await loadChaptersForProject('proj-1', 'tok');
      assert.equal(chapters.length, 1);
      assert.equal(chapters[0]!.id, 'c1');
    });

    it('loadChaptersForProject auto-recovers empty paragraph translations from chunks', async () => {
      const chapterRow = {
        id: 'c1',
        number: 1,
        title: 'One',
        translated_text: 'full',
        translated_chunks: ['chunk-a'],
      };
      mocks.mockTransformChapter.mockImplementation(
        (row: Record<string, unknown>, paragraphs: unknown[] = []) => ({
          id: row.id,
          number: row.number,
          title: row.title,
          paragraphs,
          translatedText: String(row.translated_text ?? ''),
          translatedChunks: (row.translated_chunks as string[]) ?? [],
        })
      );
      mocks.mockGroup.mockReturnValue(
        new Map([
          [
            'c1',
            [
              {
                id: 'p1',
                chapter_id: 'c1',
                index: 0,
                translated_text: '',
              },
            ],
          ],
        ])
      );
      mocks.mockTransformParagraph.mockImplementation((row: Record<string, unknown>) => ({
        id: row.id,
        index: row.index ?? 0,
        originalText: 'o',
        translatedText: row.translated_text ?? '',
      }));

      const from = vi.fn((table: string) => {
        if (table === 'chapters') {
          return chainable({ data: [chapterRow], error: null });
        }
        if (table === 'paragraphs') {
          return chainable({
            data: [{ id: 'p1', chapter_id: 'c1', index: 0, translated_text: 'synced-p1' }],
            error: null,
          });
        }
        return chainable({ data: null, error: null });
      });
      mocks.mockCreateClientWithToken.mockReturnValue({ from });

      const chapters = await loadChaptersForProject('proj-1', 'tok');
      assert.equal(chapters.length, 1);
      assert.equal(mocks.mockAutoSync.mock.calls.length, 1);
      assert.ok(from.mock.calls.some((c) => c[0] === 'paragraphs'));
    });

    it('loadChaptersForProject throws on chapter query error', async () => {
      mocks.mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'ch fail' } })),
      });
      await assert.rejects(() => loadChaptersForProject('proj-1', 'tok'), /ch fail/);
    });

    it('loadChaptersForProjectWithServiceRole maps batches', async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(
          chainable({
            data: [{ id: 'c1', number: 1, title: 'One' }],
            error: null,
          })
        )
        .mockReturnValueOnce(chainable({ data: [], error: null }));
      mocks.mockCreateServiceRoleClient.mockReturnValue({ from });

      const chapters = await loadChaptersForProjectWithServiceRole('proj-1');
      assert.equal(chapters.length, 1);
    });

    it('getProjectForPublicationExport returns null when project missing or throws', async () => {
      mocks.mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'missing' } })),
      });
      assert.equal(await getProjectForPublicationExport('missing'), null);

      mocks.mockCreateServiceRoleClient.mockImplementation(() => {
        throw new Error('client boom');
      });
      assert.equal(await getProjectForPublicationExport('proj-1'), null);
    });
  });
});
