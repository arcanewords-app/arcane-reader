import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
  supabase: { from: mockFrom },
}));

import { CHAPTER_LOAD_BATCH, POSTGREST_MAX_ROWS } from '../../shared/cacheContract.js';
import {
  getGlossaryCountForProject,
  getProjectForPublicationExport,
  loadChaptersForProject,
  loadChaptersForProjectLightweight,
  loadGlossaryForProject,
  loadParagraphsForChapter,
  loadParagraphsForChapterIds,
} from './loaders.js';

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'range', 'in', 'not', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const chapterRow = {
  id: 'ch-1',
  project_id: 'proj-1',
  number: 1,
  title: 'Chapter 1',
  translated_title: null,
  original_text: 'Hello world.',
  translated_text: null,
  translated_chunks: null,
  status: 'pending',
  translation_meta: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const paragraphRow = {
  id: 'p-1',
  chapter_id: 'ch-1',
  index: 0,
  original_text: 'Hello world.',
  translated_text: null,
  status: 'pending',
  edited_at: null,
  edited_by: null,
};

describe('loadChaptersForProjectLightweight', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when project has no chapters', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );
    const chapters = await loadChaptersForProjectLightweight('proj-1', 'token');
    assert.deepEqual(chapters, []);
  });

  it('maps chapter list items from rows', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'ch-1',
            number: 1,
            title: 'Chapter 1',
            translated_title: null,
            status: 'pending',
            translation_meta: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      })
    );
    const chapters = await loadChaptersForProjectLightweight('proj-1', 'token');
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0]?.number, 1);
    assert.equal(chapters[0]?.title, 'Chapter 1');
  });

  it('throws when chapter query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db error' },
      })
    );
    await assert.rejects(
      () => loadChaptersForProjectLightweight('proj-1', 'token'),
      /Failed to load chapters/
    );
  });

  it('paginates when first batch is full', async () => {
    const fullBatch = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({
      id: `ch-${i}`,
      number: i + 1,
      title: `Chapter ${i + 1}`,
      translated_title: null,
      status: 'pending',
      translation_meta: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));
    const tailBatch = [
      {
        id: 'ch-last',
        number: POSTGREST_MAX_ROWS + 1,
        title: 'Final Chapter',
        translated_title: null,
        status: 'pending',
        translation_meta: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return chainable({
        data: call === 1 ? fullBatch : tailBatch,
        error: null,
      });
    });

    const chapters = await loadChaptersForProjectLightweight('proj-1', 'token');
    assert.equal(chapters.length, POSTGREST_MAX_ROWS + 1);
    assert.equal(chapters[POSTGREST_MAX_ROWS]?.title, 'Final Chapter');
  });
});

describe('loadGlossaryForProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when project has no glossary entries', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const entries = await loadGlossaryForProject('proj-1', 'token');
    assert.deepEqual(entries, []);
  });

  it('maps glossary rows to domain entries', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'g1',
            project_id: 'proj-1',
            type: 'character',
            original: 'Alice',
            translated: 'Алиса',
            gender: 'female',
            mentioned_in_chapters: [1],
            image_urls: [],
          },
        ],
        error: null,
      })
    );

    const entries = await loadGlossaryForProject('proj-1', 'token');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.original, 'Alice');
    assert.equal(entries[0]?.translated, 'Алиса');
    assert.deepEqual(entries[0]?.mentionedInChapters, [1]);
  });

  it('throws when glossary query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'glossary fail' },
      })
    );
    await assert.rejects(
      () => loadGlossaryForProject('proj-1', 'token'),
      /Failed to load glossary/
    );
  });

  it('maps multiple entries preserving order', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'g1',
            project_id: 'proj-1',
            type: 'character',
            original: 'Alice',
            translated: 'Алиса',
            gender: 'female',
            mentioned_in_chapters: [],
            image_urls: [],
          },
          {
            id: 'g2',
            project_id: 'proj-1',
            type: 'location',
            original: 'Town',
            translated: 'Город',
            gender: null,
            mentioned_in_chapters: [],
            image_urls: [],
          },
        ],
        error: null,
      })
    );

    const entries = await loadGlossaryForProject('proj-1', 'token');
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.original, 'Alice');
    assert.equal(entries[1]?.type, 'location');
  });
});

describe('getGlossaryCountForProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns count from head query', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 7,
      })
    );

    const count = await getGlossaryCountForProject('proj-1');
    assert.equal(count, 7);
  });

  it('returns 0 on query error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db error' },
      })
    );

    const count = await getGlossaryCountForProject('proj-1');
    assert.equal(count, 0);
  });

  it('returns 0 when count is null', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    assert.equal(await getGlossaryCountForProject('proj-1'), 0);
  });
});

describe('loadChaptersForProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when project has no chapters', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const chapters = await loadChaptersForProject('proj-1', 'token');
    assert.deepEqual(chapters, []);
  });

  it('maps chapters with paragraphs grouped by chapter id', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return chainable({
        data: call === 1 ? [chapterRow] : [paragraphRow],
        error: null,
      });
    });

    const chapters = await loadChaptersForProject('proj-1', 'token');
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0]?.id, 'ch-1');
    assert.equal(chapters[0]?.paragraphs.length, 1);
    assert.equal(chapters[0]?.paragraphs[0]?.originalText, 'Hello world.');
  });

  it('throws when chapter query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'chapter fail' },
      })
    );

    await assert.rejects(
      () => loadChaptersForProject('proj-1', 'token'),
      /Failed to load chapters/
    );
  });

  it('throws when paragraph query fails', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return chainable({
        data: call === 1 ? [chapterRow] : null,
        error: call === 1 ? null : { message: 'paragraph fail' },
      });
    });

    await assert.rejects(
      () => loadChaptersForProject('proj-1', 'token'),
      /Failed to load paragraphs/
    );
  });

  it('paginates chapter batches when first batch is full', async () => {
    const fullBatch = Array.from({ length: CHAPTER_LOAD_BATCH }, (_, i) => ({
      ...chapterRow,
      id: `ch-${i}`,
      number: i + 1,
      title: `Chapter ${i + 1}`,
    }));
    const tailChapter = {
      ...chapterRow,
      id: 'ch-last',
      number: CHAPTER_LOAD_BATCH + 1,
      title: 'Final Chapter',
    };

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return chainable({ data: fullBatch, error: null });
      }
      if (call === 2) {
        return chainable({ data: [], error: null });
      }
      if (call === 3) {
        return chainable({ data: [tailChapter], error: null });
      }
      return chainable({ data: [], error: null });
    });

    const chapters = await loadChaptersForProject('proj-1', 'token');
    assert.equal(chapters.length, CHAPTER_LOAD_BATCH + 1);
    assert.equal(chapters[CHAPTER_LOAD_BATCH]?.title, 'Final Chapter');
  });
});

describe('loadParagraphsForChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when chapter has no paragraphs', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const paragraphs = await loadParagraphsForChapter('ch-1', 'token');
    assert.deepEqual(paragraphs, []);
  });

  it('maps paragraph rows ordered by index', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          paragraphRow,
          {
            ...paragraphRow,
            id: 'p-2',
            index: 1,
            original_text: 'Second paragraph.',
          },
        ],
        error: null,
      })
    );

    const paragraphs = await loadParagraphsForChapter('ch-1', 'token');
    assert.equal(paragraphs.length, 2);
    assert.equal(paragraphs[0]?.index, 0);
    assert.equal(paragraphs[1]?.originalText, 'Second paragraph.');
  });

  it('throws when paragraph query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'paragraph fail' },
      })
    );

    await assert.rejects(
      () => loadParagraphsForChapter('ch-1', 'token'),
      /Failed to load paragraphs/
    );
  });

  it('paginates when first batch is full', async () => {
    const fullBatch = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({
      ...paragraphRow,
      id: `p-${i}`,
      index: i,
      original_text: `Paragraph ${i}`,
    }));
    const tailBatch = [
      {
        ...paragraphRow,
        id: 'p-last',
        index: POSTGREST_MAX_ROWS,
        original_text: 'Final paragraph.',
      },
    ];

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return chainable({
        data: call === 1 ? fullBatch : tailBatch,
        error: null,
      });
    });

    const paragraphs = await loadParagraphsForChapter('ch-1', 'token');
    assert.equal(paragraphs.length, POSTGREST_MAX_ROWS + 1);
    assert.equal(paragraphs[POSTGREST_MAX_ROWS]?.originalText, 'Final paragraph.');
  });
});

describe('loadParagraphsForChapterIds', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map for empty chapter ids', async () => {
    const client = { from: mockFrom } as never;
    const result = await loadParagraphsForChapterIds(client, []);
    assert.deepEqual([...result.entries()], []);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('groups paragraphs by chapter id and sorts by index', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { ...paragraphRow, chapter_id: 'ch-2', id: 'p-2a', index: 1 },
          { ...paragraphRow, chapter_id: 'ch-1', id: 'p-1b', index: 1 },
          { ...paragraphRow, chapter_id: 'ch-1', id: 'p-1a', index: 0 },
        ],
        error: null,
      })
    );

    const client = { from: mockFrom } as never;
    const result = await loadParagraphsForChapterIds(client, ['ch-1', 'ch-2']);
    assert.equal(result.get('ch-1')?.length, 2);
    assert.equal(result.get('ch-1')?.[0]?.id, 'p-1a');
    assert.equal(result.get('ch-2')?.[0]?.id, 'p-2a');
  });

  it('throws when paragraph query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'paragraph fail' },
      })
    );
    const client = { from: mockFrom } as never;
    await assert.rejects(
      () => loadParagraphsForChapterIds(client, ['ch-1']),
      /Failed to load paragraphs/
    );
  });

  it('paginates when first batch is full', async () => {
    const fullBatch = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({
      ...paragraphRow,
      chapter_id: 'ch-1',
      id: `p-${i}`,
      index: i,
    }));
    const tailBatch = [
      {
        ...paragraphRow,
        chapter_id: 'ch-1',
        id: 'p-last',
        index: POSTGREST_MAX_ROWS,
      },
    ];
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return chainable({
        data: call === 1 ? fullBatch : tailBatch,
        error: null,
      });
    });
    const client = { from: mockFrom } as never;
    const result = await loadParagraphsForChapterIds(client, ['ch-1']);
    assert.equal(result.get('ch-1')?.length, POSTGREST_MAX_ROWS + 1);
  });
});

describe('getProjectForPublicationExport', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when project query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const project = await getProjectForPublicationExport('proj-missing');
    assert.equal(project, null);
  });
});
