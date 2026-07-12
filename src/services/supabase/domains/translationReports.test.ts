import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockGetPublicationById, mockGetPublicationByProjectId } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetPublicationById: vi.fn(),
  mockGetPublicationByProjectId: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('./publications.js', () => ({
  getPublicationById: (...args: unknown[]) => mockGetPublicationById(...args),
  getPublicationByProjectId: (...args: unknown[]) => mockGetPublicationByProjectId(...args),
}));

import {
  createTranslationReport,
  deleteTranslationReport,
  getTranslationReportsByProject,
  getTranslationReportsCountByProject,
  updateTranslationReportStatus,
} from './translationReports.js';

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    in: vi.fn(() => chain),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return chain;
}

describe('createTranslationReport', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when publication not found', async () => {
    mockGetPublicationById.mockResolvedValue(null);
    await assert.rejects(
      () =>
        createTranslationReport({
          publicationId: 'pub-1',
          chapterId: 'ch-1',
          description: 'valid description',
        }),
      /Publication not found/
    );
  });

  it('throws when description is too short', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'ch-1', number: 1, title: 'Ch1' },
        error: null,
      })
    );
    await assert.rejects(
      () =>
        createTranslationReport({
          publicationId: 'pub-1',
          chapterId: 'ch-1',
          description: 'hi',
        }),
      /at least 5 characters/
    );
  });

  it('throws when chapter is not found', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );

    await assert.rejects(
      () =>
        createTranslationReport({
          publicationId: 'pub-1',
          chapterId: 'missing',
          description: 'valid description',
        }),
      /Chapter not found/
    );
  });

  it('throws when description exceeds max length', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'ch-1', number: 1, title: 'Ch1' },
        error: null,
      })
    );

    await assert.rejects(
      () =>
        createTranslationReport({
          publicationId: 'pub-1',
          chapterId: 'ch-1',
          description: 'x'.repeat(5001),
        }),
      /must not exceed 5000 characters/
    );
  });

  it('throws when insert fails', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
    const chapterChain = chainable({
      data: { id: 'ch-1', number: 1, title: 'Ch1' },
      error: null,
    });
    const insertChain = chainable({
      data: null,
      error: { message: 'insert failed' },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return chapterChain;
      if (table === 'translation_reports') return insertChain;
      throw new Error(`unexpected table ${table}`);
    });

    await assert.rejects(
      () =>
        createTranslationReport({
          publicationId: 'pub-1',
          chapterId: 'ch-1',
          description: 'valid description',
        }),
      /Failed to create translation report/
    );
  });

  it('inserts report when publication and chapter are valid', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
    const chapterChain = chainable({
      data: { id: 'ch-1', number: 1, title: 'Ch1' },
      error: null,
    });
    const insertChain = chainable({
      data: { id: 'report-1' },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return chapterChain;
      if (table === 'translation_reports') return insertChain;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTranslationReport({
      publicationId: 'pub-1',
      chapterId: 'ch-1',
      description: '  typo in paragraph 3  ',
      reporterUserId: 'user-1',
    });

    assert.equal(result.id, 'report-1');
    assert.equal(insertChain.insert.mock.calls.length, 1);
  });
});

describe('getTranslationReportsCountByProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when project has no publication', async () => {
    mockGetPublicationByProjectId.mockResolvedValue(null);
    const count = await getTranslationReportsCountByProject('proj-1', 'user-1', 'token');
    assert.equal(count, 0);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('returns pending count from service role client', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 7,
      })
    );
    const count = await getTranslationReportsCountByProject('proj-1', 'user-1', 'token');
    assert.equal(count, 7);
  });

  it('returns 0 when count query errors', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'count failed' },
      })
    );
    const count = await getTranslationReportsCountByProject('proj-1', 'user-1', 'token');
    assert.equal(count, 0);
  });
});

describe('updateTranslationReportStatus', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when project has no publication', async () => {
    mockGetPublicationByProjectId.mockResolvedValue(null);
    await assert.rejects(
      () => updateTranslationReportStatus('proj-1', 'report-1', 'user-1', 'token', 'reviewed'),
      /Project or publication not found/
    );
  });

  it('updates report status when publication and report exist', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    const fetchChain = chainable({
      data: { id: 'report-1' },
      error: null,
    });
    const updateChain = chainable({
      data: null,
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'translation_reports') throw new Error(`unexpected table ${table}`);
      call += 1;
      return call === 1 ? fetchChain : updateChain;
    });

    await updateTranslationReportStatus('proj-1', 'report-1', 'user-1', 'token', 'resolved');
    assert.equal(updateChain.update.mock.calls.length, 1);
  });

  it('throws when report not found', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    await assert.rejects(
      () => updateTranslationReportStatus('proj-1', 'missing', 'user-1', 'token', 'reviewed'),
      /Report not found or access denied/
    );
  });
});

describe('deleteTranslationReport', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when project has no publication', async () => {
    mockGetPublicationByProjectId.mockResolvedValue(null);
    await assert.rejects(
      () => deleteTranslationReport('proj-1', 'report-1', 'user-1', 'token'),
      /Project or publication not found/
    );
  });

  it('deletes report when publication and report exist', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    const fetchChain = chainable({
      data: { id: 'report-1' },
      error: null,
    });
    const deleteChain = chainable({
      data: null,
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'translation_reports') throw new Error(`unexpected table ${table}`);
      call += 1;
      return call === 1 ? fetchChain : deleteChain;
    });

    await deleteTranslationReport('proj-1', 'report-1', 'user-1', 'token');
    assert.equal(deleteChain.delete.mock.calls.length, 1);
  });

  it('throws when report not found', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );

    await assert.rejects(
      () => deleteTranslationReport('proj-1', 'missing', 'user-1', 'token'),
      /Report not found or access denied/
    );
  });
});

describe('getTranslationReportsByProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when project has no publication', async () => {
    mockGetPublicationByProjectId.mockResolvedValue(null);
    const rows = await getTranslationReportsByProject('proj-1', 'user-1', 'token');
    assert.deepEqual(rows, []);
  });

  it('returns empty array when no reports exist', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const rows = await getTranslationReportsByProject('proj-1', 'user-1', 'token');
    assert.deepEqual(rows, []);
  });

  it('enriches reports with chapter number and title', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    const reportsChain = chainable({
      data: [
        {
          id: 'report-1',
          publication_id: 'pub-1',
          chapter_id: 'ch-1',
          description: 'Typo in paragraph 2',
          reporter_user_id: 'user-2',
          status: 'pending',
          created_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    });
    const chaptersChain = chainable({
      data: [{ id: 'ch-1', number: 3, title: 'Chapter Three' }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'translation_reports') return reportsChain;
      if (table === 'chapters') return chaptersChain;
      throw new Error(`unexpected table ${table}`);
    });

    const rows = await getTranslationReportsByProject('proj-1', 'user-1', 'token');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.chapterNumber, 3);
    assert.equal(rows[0]?.chapterTitle, 'Chapter Three');
  });

  it('returns empty array when list query errors', async () => {
    mockGetPublicationByProjectId.mockResolvedValue({ id: 'pub-1' });
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'list failed' },
      })
    );

    const rows = await getTranslationReportsByProject('proj-1', 'user-1', 'token');
    assert.deepEqual(rows, []);
  });
});
