import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockRpc, mockValidateToken } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockValidateToken: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
}));

const mockLoadParagraphsForChapter = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../loaders.js', () => ({
  loadParagraphsForChapter: (...args: unknown[]) => mockLoadParagraphsForChapter(...args),
}));

import {
  addChapter,
  deleteChapter,
  getChapter,
  importChaptersBatch,
  markChaptersAsTranslatedBatch,
  renumberChapters,
  updateChapter,
  updateChapterNumber,
  updateChaptersOrder,
} from './chapters.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'order',
    'limit',
    'single',
    'update',
    'delete',
    'insert',
    'in',
  ]) {
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
  original_text: 'Hello.',
  translated_text: null,
  translated_chunks: null,
  status: 'pending',
  translation_meta: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const paragraphFixture = {
  id: 'p-1',
  index: 0,
  originalText: 'Hello.',
  translatedText: undefined,
  status: 'pending' as const,
};

describe('getChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when chapter not found (PGRST116)', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const chapter = await getChapter('proj-1', 'missing', 'token');
    assert.equal(chapter, undefined);
  });

  it('throws when chapter query fails with non-not-found error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'XX000', message: 'db fail' },
      })
    );

    await assert.rejects(() => getChapter('proj-1', 'ch-1', 'token'), /Failed to get chapter/);
  });

  it('returns chapter with paragraphs from loader', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: chapterRow,
        error: null,
      })
    );
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    const chapter = await getChapter('proj-1', 'ch-1', 'token');
    assert.equal(chapter?.id, 'ch-1');
    assert.equal(chapter?.paragraphs.length, 1);
    assert.equal(mockLoadParagraphsForChapter.mock.calls[0]?.[0], 'ch-1');
  });

  it('downgrades completed chapter to partial when coverage is incomplete', async () => {
    const completedRow = { ...chapterRow, status: 'completed' };
    const chapterSelectChain = chainable({ data: completedRow, error: null });
    const statusUpdateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? chapterSelectChain : statusUpdateChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([
      {
        ...paragraphFixture,
        translatedText: 'Привет.',
        status: 'translated',
      },
      {
        id: 'p-2',
        index: 1,
        originalText: 'World.',
        translatedText: undefined,
        status: 'pending',
      },
    ]);

    const chapter = await getChapter('proj-1', 'ch-1', 'token');
    assert.equal(chapter?.status, 'partial');
    assert.equal(statusUpdateChain.update.mock.calls.length, 1);
  });

  it('returns undefined when chapter row is missing despite no error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    const chapter = await getChapter('proj-1', 'ch-1', 'token');
    assert.equal(chapter, undefined);
  });
});

describe('addChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when project not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const chapter = await addChapter('proj-1', { title: 'New', originalText: 'Text' }, 'token');
    assert.equal(chapter, undefined);
  });

  it('creates chapter with paragraphs and reloads', async () => {
    const projectChain = chainable({ data: { id: 'proj-1', name: 'Novel' }, error: null });
    const maxNumberChain = chainable({ data: { number: 2 }, error: null });
    const insertChapterChain = chainable({
      data: { ...chapterRow, id: 'ch-new', number: 3, title: 'New' },
      error: null,
    });
    const insertParagraphChain = chainable({ data: null, error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects') return fromCall === 1 ? projectChain : projectUpdateChain;
      if (table === 'chapters' && fromCall === 2) return maxNumberChain;
      if (table === 'chapters') return insertChapterChain;
      if (table === 'paragraphs') return insertParagraphChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    const chapter = await addChapter(
      'proj-1',
      { title: 'New', originalText: 'Hello.\n\nWorld.' },
      'token'
    );
    assert.equal(chapter?.id, 'ch-new');
    assert.equal(chapter?.number, 3);
    assert.equal(insertParagraphChain.insert.mock.calls.length, 1);
  });

  it('throws when chapter insert fails', async () => {
    const projectChain = chainable({ data: { id: 'proj-1', name: 'Novel' }, error: null });
    const maxNumberChain = chainable({ data: null, error: null });
    const insertChapterChain = chainable({
      data: null,
      error: { message: 'insert fail' },
    });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects') return projectChain;
      if (table === 'chapters' && fromCall === 2) return maxNumberChain;
      return insertChapterChain;
    });

    await assert.rejects(
      () => addChapter('proj-1', { title: 'New', originalText: 'Text' }, 'token'),
      /Failed to create chapter/
    );
  });

  it('rolls back chapter when paragraph insert fails', async () => {
    const projectChain = chainable({ data: { id: 'proj-1', name: 'Novel' }, error: null });
    const maxNumberChain = chainable({ data: null, error: null });
    const insertChapterChain = chainable({
      data: { ...chapterRow, id: 'ch-new' },
      error: null,
    });
    const insertParagraphChain = chainable({
      data: null,
      error: { message: 'paragraph fail' },
    });
    const deleteChapterChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects') return projectChain;
      if (table === 'chapters' && fromCall === 2) return maxNumberChain;
      if (table === 'chapters' && fromCall === 3) return insertChapterChain;
      if (table === 'paragraphs') return insertParagraphChain;
      if (table === 'chapters') return deleteChapterChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });

    await assert.rejects(
      () => addChapter('proj-1', { title: 'New', originalText: 'Hello.' }, 'token'),
      /Failed to create paragraphs/
    );
    assert.equal(deleteChapterChain.delete.mock.calls.length, 1);
  });
});

describe('updateChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when chapter not found (PGRST116)', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const chapter = await updateChapter('proj-1', 'missing', { title: 'New' }, 'token');
    assert.equal(chapter, undefined);
  });

  it('throws when chapter update fails with non-not-found error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'XX000', message: 'update fail' },
      })
    );

    await assert.rejects(
      () => updateChapter('proj-1', 'ch-1', { title: 'New' }, 'token'),
      /Failed to update chapter/
    );
  });

  it('updates chapter fields and reloads paragraphs', async () => {
    const updateChain = chainable({
      data: { ...chapterRow, title: 'Updated title' },
      error: null,
    });
    const projectUpdateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? updateChain : projectUpdateChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    const chapter = await updateChapter('proj-1', 'ch-1', { title: 'Updated title' }, 'token');
    assert.equal(chapter?.title, 'Updated title');
    assert.equal(mockLoadParagraphsForChapter.mock.calls.length, 1);
  });

  it('updates paragraph translations when paragraphs provided', async () => {
    const updateChain = chainable({ data: chapterRow, error: null });
    const paragraphUpdateChain = chainable({ data: null, error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      if (fromCall === 1) return updateChain;
      if (fromCall === 2) return paragraphUpdateChain;
      return projectUpdateChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([
      {
        ...paragraphFixture,
        translatedText: 'Привет.',
        status: 'translated',
      },
    ]);

    const chapter = await updateChapter(
      'proj-1',
      'ch-1',
      {
        paragraphs: [
          {
            ...paragraphFixture,
            translatedText: 'Привет.',
            status: 'translated',
          },
        ],
      },
      'token'
    );

    assert.equal(paragraphUpdateChain.update.mock.calls.length, 1);
    assert.equal(chapter?.paragraphs[0]?.translatedText, 'Привет.');
  });
});

describe('deleteChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when chapter not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const deleted = await deleteChapter('proj-1', 'missing', 'token');
    assert.equal(deleted, false);
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('deletes chapter, renumbers, and updates project', async () => {
    const getChain = chainable({ data: chapterRow, error: null });
    const deleteChain = chainable({ data: null, error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      if (fromCall === 1) return getChain;
      if (fromCall === 2) return deleteChain;
      return projectUpdateChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const deleted = await deleteChapter('proj-1', 'ch-1', 'token');
    assert.equal(deleted, true);
    assert.equal(deleteChain.delete.mock.calls.length, 1);
    assert.equal(mockRpc.mock.calls[0]?.[0], 'renumber_chapters_atomic');
  });

  it('throws when delete query fails', async () => {
    const getChain = chainable({ data: chapterRow, error: null });
    const deleteChain = chainable({
      data: null,
      error: { message: 'delete fail' },
    });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? getChain : deleteChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    await assert.rejects(
      () => deleteChapter('proj-1', 'ch-1', 'token'),
      /Failed to delete chapter/
    );
  });
});

describe('renumberChapters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls renumber_chapters_atomic RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await renumberChapters('proj-1', 'token');
    assert.equal(mockRpc.mock.calls[0]?.[0], 'renumber_chapters_atomic');
    assert.deepEqual(mockRpc.mock.calls[0]?.[1], { p_project_id: 'proj-1' });
  });

  it('throws when RPC fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc fail' },
    });

    await assert.rejects(() => renumberChapters('proj-1', 'token'), /Failed to renumber chapters/);
  });
});

describe('importChaptersBatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const result = await importChaptersBatch('proj-1', [], 'token');
    assert.deepEqual(result, []);
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('maps RPC import_chapters_batch response', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          source_index: 0,
          chapter_id: 'ch-new',
          number: 1,
          title: 'Chapter 1',
          paragraphs_count: 3,
        },
      ],
      error: null,
    });

    const result = await importChaptersBatch(
      'proj-1',
      [{ title: 'Chapter 1', originalText: 'Para one.\n\nPara two.' }],
      'token'
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]?.chapterId, 'ch-new');
    assert.equal(result[0]?.paragraphsCount, 3);
    assert.equal(mockRpc.mock.calls[0]?.[0], 'import_chapters_batch');
  });

  it('throws when RPC fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'import fail' },
    });
    await assert.rejects(
      () => importChaptersBatch('proj-1', [{ title: 'Chapter 1', originalText: 'Text' }], 'token'),
      /Failed to import chapters batch/
    );
  });
});

describe('markChaptersAsTranslatedBatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty summary for empty chapter ids', async () => {
    const result = await markChaptersAsTranslatedBatch('proj-1', [], 'token');
    assert.equal(result.summary.total, 0);
    assert.deepEqual(result.results, []);
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('maps RPC batch results into summary', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { chapter_id: 'ch-1', status: 'success' },
        { chapter_id: 'ch-2', status: 'skipped', reason: 'already translated' },
      ],
      error: null,
    });

    const result = await markChaptersAsTranslatedBatch('proj-1', ['ch-1', 'ch-2'], 'token');
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.success, 1);
    assert.equal(result.summary.skipped, 1);
    assert.equal(result.results[1]?.reason, 'already translated');
  });

  it('throws when RPC fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'mark fail' },
    });
    await assert.rejects(
      () => markChaptersAsTranslatedBatch('proj-1', ['ch-1'], 'token'),
      /mark fail/
    );
  });
});

describe('updateChaptersOrder', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when chapters query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'load fail' },
      })
    );
    await assert.rejects(
      () => updateChaptersOrder('proj-1', ['ch-1'], 'token'),
      /Failed to get chapters/
    );
  });

  it('throws when ordered ids length mismatches', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-1' }, { id: 'ch-2' }],
        error: null,
      })
    );
    await assert.rejects(
      () => updateChaptersOrder('proj-1', ['ch-1'], 'token'),
      /Ordered ids length does not match/
    );
  });

  it('throws when ordered ids do not match current chapters', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-1' }, { id: 'ch-2' }],
        error: null,
      })
    );
    await assert.rejects(
      () => updateChaptersOrder('proj-1', ['ch-1', 'ch-3'], 'token'),
      /Ordered ids do not match current chapter ids/
    );
  });

  it('calls reorder_chapters RPC for valid order', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-1' }, { id: 'ch-2' }],
        error: null,
      })
    );
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateChaptersOrder('proj-1', ['ch-2', 'ch-1'], 'token');
    assert.equal(mockRpc.mock.calls[0]?.[0], 'reorder_chapters');
  });

  it('throws when reorder RPC fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-1' }],
        error: null,
      })
    );
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'reorder fail' },
    });
    await assert.rejects(() => updateChaptersOrder('proj-1', ['ch-1'], 'token'), /reorder fail/);
  });
});

describe('updateChapterNumber', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when chapter not in project', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-other', number: 1 }],
        error: null,
      })
    );
    const chapter = await updateChapterNumber('proj-1', 'ch-missing', 1, 'token');
    assert.equal(chapter, undefined);
  });

  it('throws when new number is out of range', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { id: 'ch-1', number: 1 },
          { id: 'ch-2', number: 2 },
        ],
        error: null,
      })
    );
    await assert.rejects(
      () => updateChapterNumber('proj-1', 'ch-1', 5, 'token'),
      /Номер главы должен быть от 1 до 2/
    );
  });

  it('returns current chapter when number unchanged', async () => {
    const chaptersChain = chainable({
      data: [
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
      ],
      error: null,
    });
    const chapterSelectChain = chainable({ data: chapterRow, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? chaptersChain : chapterSelectChain;
    });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    const chapter = await updateChapterNumber('proj-1', 'ch-1', 1, 'token');
    assert.equal(chapter?.id, 'ch-1');
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('reorders chapter via RPC when number changes', async () => {
    const chaptersChain = chainable({
      data: [
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
      ],
      error: null,
    });
    const orderSelectChain = chainable({
      data: [{ id: 'ch-1' }, { id: 'ch-2' }],
      error: null,
    });
    const chapterSelectChain = chainable({ data: chapterRow, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall += 1;
      if (fromCall === 1) return chaptersChain;
      if (fromCall === 2) return orderSelectChain;
      return chapterSelectChain;
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockLoadParagraphsForChapter.mockResolvedValue([paragraphFixture]);

    const chapter = await updateChapterNumber('proj-1', 'ch-1', 2, 'token');
    assert.equal(chapter?.id, 'ch-1');
    assert.equal(mockRpc.mock.calls[0]?.[0], 'reorder_chapters');
  });
});
