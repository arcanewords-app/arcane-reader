import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { Project } from '../../../storage/database.js';

const { mockFrom, mockRpc, mockValidateToken, mockServiceFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockValidateToken: vi.fn(),
  mockServiceFrom: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
  supabase: {
    from: mockFrom,
  },
  createServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
}));

const {
  mockLoadChaptersForProject,
  mockLoadChaptersForProjectLightweight,
  mockLoadGlossaryForProject,
  mockLoadParagraphsForChapterIds,
  mockRenumberChapters,
  mockLoadGlossaryForProjectPublic,
} = vi.hoisted(() => ({
  mockLoadChaptersForProject: vi.fn().mockResolvedValue([]),
  mockLoadChaptersForProjectLightweight: vi.fn().mockResolvedValue([]),
  mockLoadGlossaryForProject: vi.fn().mockResolvedValue([]),
  mockLoadParagraphsForChapterIds: vi.fn().mockResolvedValue(new Map()),
  mockRenumberChapters: vi.fn().mockResolvedValue(undefined),
  mockLoadGlossaryForProjectPublic: vi.fn().mockResolvedValue([]),
}));

vi.mock('../loaders.js', () => ({
  loadChaptersForProject: (...args: unknown[]) => mockLoadChaptersForProject(...args),
  loadChaptersForProjectLightweight: (...args: unknown[]) =>
    mockLoadChaptersForProjectLightweight(...args),
  loadGlossaryForProject: (...args: unknown[]) => mockLoadGlossaryForProject(...args),
  loadParagraphsForChapterIds: (...args: unknown[]) => mockLoadParagraphsForChapterIds(...args),
  loadGlossaryForProjectPublic: (...args: unknown[]) => mockLoadGlossaryForProjectPublic(...args),
}));

vi.mock('../../storage.js', () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  extractPathFromUrl: vi.fn(() => null),
  generateUniqueFilename: vi.fn(() => 'cover.jpg'),
  getPublicUrl: vi.fn(() => 'https://example.com/cover.jpg'),
}));

vi.mock('./chapters.js', () => ({
  renumberChapters: (...args: unknown[]) => mockRenumberChapters(...args),
}));

import {
  assertCanAddProject,
  bulkDeleteChapters,
  cloneProject,
  countProjectsByUser,
  createProject,
  deleteProject,
  duplicateChaptersInProject,
  getAllProjects,
  getAllProjectsLightweight,
  getChapterStatusRow,
  getChaptersSummary,
  getProject,
  getProjectFull,
  getProjectFullForRecovery,
  getReaderSettings,
  getUserReaderSettings,
  resetStuckChapters,
  resetStuckChaptersForRecovery,
  transferChaptersFromProject,
  updateProject,
  updateReaderSettings,
  updateUserReaderSettings,
  verifyChapterAccess,
} from './projects.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  const methods = [
    'select',
    'eq',
    'order',
    'in',
    'update',
    'single',
    'insert',
    'delete',
    'upsert',
    'maybeSingle',
    'limit',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

function mockProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'novel',
    settings: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    metadata: {},
    source_language: 'en',
    target_language: 'ru',
    ...overrides,
  };
}

describe('assertCanAddProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows admin without counting projects', async () => {
    await assertCanAddProject('user-1', 'admin', 'token');
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('throws PROJECT_LIMIT when at role cap', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 10,
      })
    );
    await assert.rejects(
      () => assertCanAddProject('user-1', 'author', 'token'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PROJECT_LIMIT');
        return true;
      }
    );
  });

  it('allows author when under role cap', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 3,
      })
    );
    await assertCanAddProject('user-1', 'author', 'token');
    assert.equal(mockFrom.mock.calls.length, 1);
  });
});

describe('getAllProjects', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when user has no projects', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );
    const result = await getAllProjects('user-1', 'token');
    assert.deepEqual(result, []);
    assert.equal(mockLoadChaptersForProject.mock.calls.length, 0);
  });

  it('maps project rows with chapters and glossary from loaders', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [mockProjectRow({ id: 'proj-a' }), mockProjectRow({ id: 'proj-b', name: 'Second' })],
        error: null,
      })
    );
    mockLoadChaptersForProject.mockImplementation(async (projectId: string) => [
      { id: `ch-${projectId}`, number: 1, title: 'Ch1', status: 'pending', paragraphs: [] },
    ]);
    mockLoadGlossaryForProject.mockImplementation(async (projectId: string) => [
      { id: `g-${projectId}`, type: 'term', original: 'foo' },
    ]);

    const result = await getAllProjects('user-1', 'token');
    assert.equal(result.length, 2);
    assert.equal(result[0]?.id, 'proj-a');
    assert.equal(result[0]?.chapters.length, 1);
    assert.equal(result[0]?.glossary.length, 1);
    assert.equal(result[1]?.id, 'proj-b');
    assert.equal(mockLoadChaptersForProject.mock.calls.length, 2);
    assert.equal(mockLoadGlossaryForProject.mock.calls.length, 2);
  });

  it('throws when projects query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db fail' },
      })
    );
    await assert.rejects(() => getAllProjects('user-1', 'token'), /Failed to get projects/);
  });
});

describe('getAllProjectsLightweight', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when user has no projects', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );
    const result = await getAllProjectsLightweight('user-1', 'token');
    assert.deepEqual(result, []);
  });

  it('maps project rows with counts from rpc and glossary', async () => {
    const projectsChain = chainable({
      data: [mockProjectRow()],
      error: null,
    });
    const glossaryChain = chainable({
      data: [{ project_id: 'proj-1' }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return projectsChain;
      if (table === 'glossary_entries') return glossaryChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: [{ project_id: 'proj-1', total_count: 5, translated_count: 2 }],
      error: null,
    });

    const result = await getAllProjectsLightweight('user-1', 'token');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'proj-1');
    assert.equal(result[0]?.chapterCount, 5);
    assert.equal(result[0]?.translatedCount, 2);
    assert.equal(result[0]?.glossaryCount, 1);
  });

  it('throws when projects query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'projects fail' },
      })
    );
    await assert.rejects(
      () => getAllProjectsLightweight('user-1', 'token'),
      /Failed to get projects/
    );
  });

  it('throws when chapter counts RPC fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [mockProjectRow()],
        error: null,
      })
    );
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc fail' },
    });
    await assert.rejects(
      () => getAllProjectsLightweight('user-1', 'token'),
      /Failed to get chapter counts/
    );
  });

  it('throws when glossary count query fails', async () => {
    const projectsChain = chainable({
      data: [mockProjectRow()],
      error: null,
    });
    const glossaryChain = chainable({
      data: null,
      error: { message: 'glossary fail' },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return projectsChain;
      if (table === 'glossary_entries') return glossaryChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: [{ project_id: 'proj-1', total_count: 1, translated_count: 0 }],
      error: null,
    });
    await assert.rejects(
      () => getAllProjectsLightweight('user-1', 'token'),
      /Failed to get glossary counts/
    );
  });
});

describe('verifyChapterAccess', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when chapter belongs to user project', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'ch-1' },
        error: null,
      })
    );
    const ok = await verifyChapterAccess('proj-1', 'ch-1', 'user-1', 'token');
    assert.equal(ok, true);
  });

  it('returns false on query error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const ok = await verifyChapterAccess('proj-1', 'ch-1', 'user-1', 'token');
    assert.equal(ok, false);
  });
});

describe('resetStuckChapters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no translating chapters', async () => {
    const selectChain = chainable({ data: [], error: null });
    mockFrom.mockReturnValue(selectChain);
    const count = await resetStuckChapters('token', 'proj-1');
    assert.equal(count, 0);
  });

  it('resets chapters stuck longer than timeout', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const selectChain = chainable({
      data: [
        {
          id: 'ch-stuck',
          project_id: 'proj-1',
          status: 'translating',
          translation_meta: null,
          updated_at: old,
        },
      ],
      error: null,
    });
    const updateChain = chainable({ data: null, error: null });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });

    const count = await resetStuckChapters('token', 'proj-1');
    assert.equal(count, 1);
    assert.equal(updateChain.update.mock.calls.length, 1);
  });

  it('throws when stuck chapters query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'select fail' },
      })
    );
    await assert.rejects(
      () => resetStuckChapters('token', 'proj-1'),
      /Failed to get stuck chapters/
    );
  });

  it('throws when reset update fails', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const selectChain = chainable({
      data: [
        {
          id: 'ch-stuck',
          project_id: 'proj-1',
          status: 'translating',
          translation_meta: null,
          updated_at: old,
        },
      ],
      error: null,
    });
    const updateChain = chainable({ data: null, error: { message: 'update fail' } });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });
    await assert.rejects(
      () => resetStuckChapters('token', 'proj-1'),
      /Failed to reset stuck chapters/
    );
  });

  it('uses translation_meta.translatedAt for stuck detection', async () => {
    const oldTranslatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const selectChain = chainable({
      data: [
        {
          id: 'ch-meta-stuck',
          project_id: 'proj-1',
          status: 'translating',
          translation_meta: { translatedAt: oldTranslatedAt },
          updated_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    const updateChain = chainable({ data: null, error: null });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });
    const count = await resetStuckChapters('token', 'proj-1');
    assert.equal(count, 1);
  });

  it('does not reset recently updated translating chapters', async () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'ch-recent',
            project_id: 'proj-1',
            status: 'translating',
            translation_meta: null,
            updated_at: recent,
          },
        ],
        error: null,
      })
    );
    const count = await resetStuckChapters('token', 'proj-1');
    assert.equal(count, 0);
  });
});

describe('getReaderSettings', () => {
  it('delegates to storage getReaderSettings with defaults', () => {
    const project = {
      id: 'p1',
      settings: {},
    } as Project;
    const settings = getReaderSettings(project);
    assert.ok(settings.fontSize >= 14);
    assert.ok(settings.lineHeight >= 1.4);
  });
});

describe('countProjectsByUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns project count from head query', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 3,
      })
    );
    const count = await countProjectsByUser('user-1', 'token');
    assert.equal(count, 3);
  });

  it('throws when count query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db error' },
      })
    );
    await assert.rejects(() => countProjectsByUser('user-1', 'token'), /Failed to count projects/);
  });
});

describe('createProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts project and returns transformed result', async () => {
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertChain = chainable({
      data: mockProjectRow({ name: 'New Novel' }),
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? countChain : insertChain;
    });

    const project = await createProject({ name: 'New Novel' }, 'user-1', 'token');
    assert.equal(project.name, 'New Novel');
    assert.deepEqual(project.chapters, []);
    assert.equal(insertChain.insert.mock.calls.length, 1);
  });

  it('throws PROJECT_LIMIT when user is at cap', async () => {
    const countChain = chainable({ data: null, error: null, count: 10 });
    mockFrom.mockReturnValue(countChain);
    await assert.rejects(
      () => createProject({ name: 'Blocked' }, 'user-1', 'token'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PROJECT_LIMIT');
        return true;
      }
    );
  });

  it('throws when insert fails', async () => {
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertChain = chainable({
      data: null,
      error: { message: 'insert fail' },
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? countChain : insertChain;
    });
    await assert.rejects(
      () => createProject({ name: 'New' }, 'user-1', 'token'),
      /Failed to create project/
    );
  });
});

describe('deleteProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes owned project and returns true', async () => {
    const deleteChain = chainable({ data: null, error: null });
    mockFrom.mockReturnValue(deleteChain);
    const ok = await deleteProject('proj-1', 'user-1', 'token');
    assert.equal(ok, true);
    assert.equal(deleteChain.delete.mock.calls.length, 1);
  });

  it('throws when delete fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'forbidden' },
      })
    );
    await assert.rejects(
      () => deleteProject('proj-1', 'user-1', 'token'),
      /Failed to delete project/
    );
  });
});

describe('getProjectFull', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined on query error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const project = await getProjectFull('missing', 'user-1', 'token');
    assert.equal(project, undefined);
    assert.equal(mockLoadChaptersForProject.mock.calls.length, 0);
  });

  it('loads full chapters and glossary via loaders', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: mockProjectRow(),
        error: null,
      })
    );
    mockLoadChaptersForProject.mockResolvedValue([
      {
        id: 'ch-full',
        number: 1,
        title: 'Full',
        status: 'completed',
        paragraphs: [{ id: 'p-1', index: 0, originalText: 'Hi', status: 'translated' }],
      },
    ]);
    mockLoadGlossaryForProject.mockResolvedValue([
      { id: 'g-full', type: 'term', original: 'term' },
    ]);

    const project = await getProjectFull('proj-1', 'user-1', 'token');
    assert.equal(project?.id, 'proj-1');
    assert.equal(project?.chapters.length, 1);
    assert.equal(project?.chapters[0]?.paragraphs.length, 1);
    assert.equal(project?.glossary.length, 1);
    assert.equal(mockLoadChaptersForProject.mock.calls[0]?.[0], 'proj-1');
    assert.equal(mockLoadGlossaryForProject.mock.calls[0]?.[0], 'proj-1');
  });
});

describe('getProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when project not found (PGRST116)', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const project = await getProject('missing', 'user-1', 'token');
    assert.equal(project, undefined);
    assert.equal(mockLoadChaptersForProjectLightweight.mock.calls.length, 0);
  });

  it('loads project via loaders after resetStuckChapters', async () => {
    const projectRow = mockProjectRow();
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([
      { id: 'ch-1', number: 1, title: 'Ch1', status: 'pending', paragraphs: [] },
    ]);
    mockLoadGlossaryForProject.mockResolvedValue([{ id: 'g-1', type: 'term', original: 'foo' }]);

    const project = await getProject('proj-1', 'user-1', 'token');
    assert.equal(project?.id, 'proj-1');
    assert.equal(project?.chapters.length, 1);
    assert.equal(project?.glossary.length, 1);
    assert.equal(mockLoadChaptersForProjectLightweight.mock.calls[0]?.[0], 'proj-1');
  });

  it('throws when project query fails with non-PGRST116 error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db fail' },
      })
    );
    await assert.rejects(() => getProject('proj-1', 'user-1', 'token'), /Failed to get project/);
  });

  it('returns undefined when project row is absent without error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    const project = await getProject('proj-1', 'user-1', 'token');
    assert.equal(project, undefined);
  });
});

describe('updateProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when project not found (PGRST116)', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const result = await updateProject('missing', { name: 'Renamed' }, 'user-1', 'token');
    assert.equal(result, undefined);
  });

  it('throws when update fails with non-PGRST116 error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db fail' },
      })
    );
    await assert.rejects(
      () => updateProject('proj-1', { name: 'X' }, 'user-1', 'token'),
      /Failed to update project/
    );
  });

  it('returns undefined when useServiceRole without reloading project', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: mockProjectRow({ name: 'Svc Updated' }),
        error: null,
      })
    );

    const result = await updateProject('proj-1', { name: 'Svc Updated' }, 'user-1', 'token', {
      useServiceRole: true,
    });

    assert.equal(result, undefined);
    assert.equal(mockValidateToken.mock.calls.length, 0);
    assert.equal(mockLoadChaptersForProjectLightweight.mock.calls.length, 0);
  });

  it('reloads project via getProject after successful update', async () => {
    const updateChain = chainable({ data: mockProjectRow({ name: 'Renamed' }), error: null });
    const projectChain = chainable({ data: mockProjectRow({ name: 'Renamed' }), error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return updateChain;
      if (table === 'projects' && fromCall === 2) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    const result = await updateProject('proj-1', { name: 'Renamed' }, 'user-1', 'token');
    assert.equal(result?.name, 'Renamed');
    assert.equal(updateChain.update.mock.calls.length, 1);
    assert.equal(mockLoadChaptersForProjectLightweight.mock.calls.length, 1);
  });
});

describe('getChapterStatusRow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null on query error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const row = await getChapterStatusRow('proj-1', 'ch-missing', 'token');
    assert.equal(row, null);
  });

  it('returns status and updated_at row', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { status: 'translating', updated_at: '2026-03-01T12:00:00Z' },
        error: null,
      })
    );
    const row = await getChapterStatusRow('proj-1', 'ch-1', 'token');
    assert.deepEqual(row, {
      status: 'translating',
      updated_at: '2026-03-01T12:00:00Z',
    });
  });

  it('returns null when data is missing despite no error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    const row = await getChapterStatusRow('proj-1', 'ch-1', 'token');
    assert.equal(row, null);
  });

  it('applies defaults when status and updated_at are missing', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {},
        error: null,
      })
    );
    const row = await getChapterStatusRow('proj-1', 'ch-1', 'token');
    assert.equal(row?.status, 'pending');
    assert.ok(row?.updated_at);
  });
});

describe('cloneProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when source project not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await cloneProject('missing', 'user-1', 'token');
    assert.equal(result, undefined);
    assert.equal(mockLoadChaptersForProject.mock.calls.length, 0);
  });

  it('throws PROJECT_LIMIT when clone would exceed cap', async () => {
    const projectChain = chainable({ data: mockProjectRow(), error: null });
    const countChain = chainable({ data: null, error: null, count: 10 });
    let projectCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`);
      projectCall += 1;
      return projectCall === 1 ? projectChain : countChain;
    });
    mockLoadChaptersForProject.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    await assert.rejects(
      () => cloneProject('proj-1', 'user-1', 'token'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PROJECT_LIMIT');
        return true;
      }
    );
  });

  it('clones project with chapters and returns reloaded project', async () => {
    const sourceChapter = {
      id: 'ch-src',
      number: 1,
      title: 'Chapter 1',
      translatedTitle: undefined,
      originalText: 'Hello.',
      translatedText: 'Привет.',
      translatedChunks: null,
      status: 'completed' as const,
      translationMeta: null,
      criticReport: null,
      paragraphs: [
        {
          id: 'p-1',
          index: 0,
          originalText: 'Hello.',
          translatedText: 'Привет.',
          status: 'translated' as const,
        },
      ],
    };
    const newProjectRow = mockProjectRow({ id: 'proj-clone', name: 'Test (копия)' });
    const projectSelectChain = chainable({ data: mockProjectRow(), error: null });
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertProjectChain = chainable({ data: newProjectRow, error: null });
    const insertChapterChain = chainable({ data: { id: 'ch-new' }, error: null });
    const insertParagraphChain = chainable({ data: null, error: null });
    const chaptersForCountChain = chainable({ data: [{ id: 'ch-new' }], error: null });
    const paragraphCountChain = chainable({ data: null, error: null, count: 1 });
    const projectReloadChain = chainable({ data: newProjectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const counters = { projects: 0, chapters: 0, paragraphs: 0 };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        counters.projects += 1;
        if (counters.projects === 1) return projectSelectChain;
        if (counters.projects === 2) return countChain;
        if (counters.projects === 3) return insertProjectChain;
        return projectReloadChain;
      }
      if (table === 'chapters') {
        counters.chapters += 1;
        if (counters.chapters === 1) return insertChapterChain;
        if (counters.chapters === 2) return chaptersForCountChain;
        return stuckSelectChain;
      }
      if (table === 'paragraphs') {
        counters.paragraphs += 1;
        if (counters.paragraphs === 1) return insertParagraphChain;
        return paragraphCountChain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockLoadChaptersForProject.mockResolvedValue([sourceChapter]);
    mockLoadGlossaryForProject.mockResolvedValue([]);
    mockLoadChaptersForProjectLightweight.mockResolvedValue([
      { id: 'ch-new', number: 1, title: 'Chapter 1', status: 'completed', paragraphs: [] },
    ]);

    const result = await cloneProject('proj-1', 'user-1', 'token');
    assert.equal(result?.id, 'proj-clone');
    assert.equal(result?.chapters.length, 1);
  });
});

describe('transferChaptersFromProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when source project not found', async () => {
    const missingChain = chainable({ data: null, error: null });
    const targetChain = chainable({
      data: { id: 'target', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    let projectCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        projectCall += 1;
        return projectCall === 1 ? missingChain : targetChain;
      }
      return chainable({ data: null, error: null });
    });

    const result = await transferChaptersFromProject('target', 'user-1', 'token', {
      sourceProjectId: 'missing',
      chapterIds: ['ch-1'],
    });
    assert.equal(result, undefined);
  });

  it('throws SAME_PROJECT when source equals target', async () => {
    await assert.rejects(
      () =>
        transferChaptersFromProject('proj-1', 'user-1', 'token', {
          sourceProjectId: 'proj-1',
          chapterIds: ['ch-1'],
        }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'SAME_PROJECT');
        return true;
      }
    );
  });

  it('throws TARGET_LANGUAGE_MISMATCH when languages differ', async () => {
    const sourceChain = chainable({
      data: { id: 'src', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const targetChain = chainable({
      data: { id: 'target', source_language: 'en', target_language: 'en' },
      error: null,
    });
    let projectCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`);
      projectCall += 1;
      return projectCall === 1 ? sourceChain : targetChain;
    });

    await assert.rejects(
      () =>
        transferChaptersFromProject('target', 'user-1', 'token', {
          sourceProjectId: 'src',
          chapterIds: ['ch-1'],
        }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'TARGET_LANGUAGE_MISMATCH');
        return true;
      }
    );
  });

  it('throws INVALID_CHAPTER_IDS when source chapters missing', async () => {
    const sourceChain = chainable({
      data: { id: 'src', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const targetChain = chainable({
      data: { id: 'target', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const chaptersChain = chainable({ data: [], error: null });
    let projectCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        projectCall += 1;
        return projectCall <= 2 ? (projectCall === 1 ? sourceChain : targetChain) : chaptersChain;
      }
      if (table === 'chapters') return chaptersChain;
      throw new Error(`unexpected table ${table}`);
    });

    await assert.rejects(
      () =>
        transferChaptersFromProject('target', 'user-1', 'token', {
          sourceProjectId: 'src',
          chapterIds: ['ch-missing'],
        }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'INVALID_CHAPTER_IDS');
        return true;
      }
    );
  });

  it('transfers chapters and returns result summary', async () => {
    const sourceChain = chainable({
      data: { id: 'src', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const targetChain = chainable({
      data: { id: 'target', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const sourceChaptersChain = chainable({
      data: [
        {
          id: 'ch-src',
          number: 1,
          title: 'Chapter 1',
          translated_title: null,
          original_text: 'Hello.',
          translated_text: 'Привет.',
          translated_chunks: null,
          status: 'completed',
          translation_meta: null,
          critic_report: null,
        },
      ],
      error: null,
    });
    const targetNumbersChain = chainable({ data: [{ number: 2 }], error: null });
    const insertChapterChain = chainable({ data: { id: 'ch-new' }, error: null });
    const insertParagraphChain = chainable({ data: null, error: null });
    const paragraphCountChain = chainable({ data: null, error: null, count: 1 });
    const projectUpdateChain = chainable({ data: null, error: null });
    let projectCall = 0;
    let chaptersCall = 0;
    let paragraphsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        projectCall += 1;
        if (projectCall <= 2) return projectCall === 1 ? sourceChain : targetChain;
        return projectUpdateChain;
      }
      if (table === 'chapters') {
        chaptersCall += 1;
        if (chaptersCall === 1) return sourceChaptersChain;
        if (chaptersCall === 2) return targetNumbersChain;
        return insertChapterChain;
      }
      if (table === 'paragraphs') {
        paragraphsCall += 1;
        return paragraphsCall === 1 ? insertParagraphChain : paragraphCountChain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockLoadParagraphsForChapterIds.mockResolvedValue(
      new Map([
        [
          'ch-src',
          [
            {
              id: 'p-1',
              index: 0,
              originalText: 'Hello.',
              translatedText: 'Привет.',
              status: 'translated',
            },
          ],
        ],
      ])
    );

    const result = await transferChaptersFromProject('target', 'user-1', 'token', {
      sourceProjectId: 'src',
      chapterIds: ['ch-src'],
    });
    assert.equal(result?.chaptersTransferred, 1);
    assert.equal(result?.chapterNumberMap[1], 3);
  });

  it('transfers chapters with glossary when includeGlossary is true', async () => {
    const sourceChain = chainable({
      data: { id: 'src', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const targetChain = chainable({
      data: { id: 'target', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const sourceChaptersChain = chainable({
      data: [
        {
          id: 'ch-src',
          number: 1,
          title: 'Chapter 1',
          translated_title: null,
          original_text: 'Hello.',
          translated_text: 'Привет.',
          translated_chunks: null,
          status: 'completed',
          translation_meta: null,
          critic_report: null,
        },
      ],
      error: null,
    });
    const targetNumbersChain = chainable({ data: [], error: null });
    const insertChapterChain = chainable({ data: { id: 'ch-new' }, error: null });
    const insertParagraphChain = chainable({ data: null, error: null });
    const paragraphCountChain = chainable({ data: null, error: null, count: 0 });
    const glossaryInsertChain = chainable({ data: [{ id: 'g-new' }], error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let projectCall = 0;
    let chaptersCall = 0;
    let paragraphsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        projectCall += 1;
        if (projectCall <= 2) return projectCall === 1 ? sourceChain : targetChain;
        return projectUpdateChain;
      }
      if (table === 'chapters') {
        chaptersCall += 1;
        if (chaptersCall === 1) return sourceChaptersChain;
        if (chaptersCall === 2) return targetNumbersChain;
        return insertChapterChain;
      }
      if (table === 'paragraphs') {
        paragraphsCall += 1;
        return paragraphsCall === 1 ? paragraphCountChain : insertParagraphChain;
      }
      if (table === 'glossary_entries') {
        return glossaryInsertChain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockLoadParagraphsForChapterIds.mockResolvedValue(new Map());
    mockLoadGlossaryForProject
      .mockResolvedValueOnce([
        { id: 'g-src', type: 'term', original: 'magic', translated: 'магия' },
      ])
      .mockResolvedValueOnce([]);

    const result = await transferChaptersFromProject('target', 'user-1', 'token', {
      sourceProjectId: 'src',
      chapterIds: ['ch-src'],
      includeGlossary: true,
    });
    assert.equal(result?.chaptersTransferred, 1);
    assert.equal(result?.glossaryAdded, 1);
    assert.equal(result?.glossarySkipped, 0);
  });
});

describe('bulkDeleteChapters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 for empty chapter id list', async () => {
    const selectChain = chainable({ data: [], error: null });
    const deleteChain = chainable({ data: null, error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === 'chapters' && call === 1) return selectChain;
      if (table === 'chapters' && call === 2) return deleteChain;
      if (table === 'projects') return projectUpdateChain;
      throw new Error(`unexpected table ${table} call ${call}`);
    });

    const count = await bulkDeleteChapters('proj-1', [], 'token');
    assert.equal(count, 0);
    assert.equal(mockRenumberChapters.mock.calls.length, 1);
  });

  it('deletes chapters, renumbers, and returns deleted count', async () => {
    const selectChain = chainable({
      data: [{ id: 'ch-1' }, { id: 'ch-2' }],
      error: null,
    });
    const deleteChain = chainable({ data: null, error: null });
    const projectUpdateChain = chainable({ data: null, error: null });
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === 'chapters' && call === 1) return selectChain;
      if (table === 'chapters' && call === 2) return deleteChain;
      if (table === 'projects') return projectUpdateChain;
      throw new Error(`unexpected table ${table} call ${call}`);
    });

    const count = await bulkDeleteChapters('proj-1', ['ch-1', 'ch-2'], 'token');
    assert.equal(count, 2);
    assert.equal(deleteChain.delete.mock.calls.length, 1);
    assert.deepEqual(mockRenumberChapters.mock.calls[0], ['proj-1', 'token']);
  });

  it('throws when chapter verification query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'verify fail' },
      })
    );
    await assert.rejects(
      () => bulkDeleteChapters('proj-1', ['ch-1'], 'token'),
      /Failed to verify chapters/
    );
  });

  it('throws INVALID_CHAPTER_IDS when not all ids belong to project', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'ch-1' }],
        error: null,
      })
    );
    await assert.rejects(
      () => bulkDeleteChapters('proj-1', ['ch-1', 'ch-2'], 'token'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'INVALID_CHAPTER_IDS');
        return true;
      }
    );
  });

  it('throws when delete query fails', async () => {
    const selectChain = chainable({ data: [{ id: 'ch-1' }], error: null });
    const deleteChain = chainable({ data: null, error: { message: 'delete fail' } });
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === 'chapters' && call === 1) return selectChain;
      if (table === 'chapters') return deleteChain;
      throw new Error(`unexpected table ${table} call ${call}`);
    });
    await assert.rejects(
      () => bulkDeleteChapters('proj-1', ['ch-1'], 'token'),
      /Failed to delete chapters/
    );
  });
});

describe('getUserReaderSettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null on query error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const settings = await getUserReaderSettings('user-1', 'token');
    assert.equal(settings, null);
  });

  it('returns clamped reader settings from stored row', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          settings: {
            fontFamily: 'serif',
            fontSize: 30,
            lineHeight: 1.8,
            colorScheme: 'dark',
          },
        },
        error: null,
      })
    );
    const settings = await getUserReaderSettings('user-1', 'token');
    assert.equal(settings?.fontSize, 24);
    assert.equal(settings?.lineHeight, 1.8);
    assert.equal(settings?.colorScheme, 'dark');
  });

  it('returns null when settings is not an object', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { settings: 'invalid' },
        error: null,
      })
    );
    const settings = await getUserReaderSettings('user-1', 'token');
    assert.equal(settings, null);
  });

  it('maps legacy font family and scales paragraphSpacing above 2', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          settings: {
            fontFamily: 'sans',
            fontSize: 16,
            lineHeight: 1.6,
            paragraphSpacing: 32,
            customBg: '#111111',
            customText: '#eeeeee',
          },
        },
        error: null,
      })
    );
    const settings = await getUserReaderSettings('user-1', 'token');
    assert.equal(settings?.fontFamily, 'roboto');
    assert.equal(settings?.paragraphSpacing, 2);
    assert.equal(settings?.customBg, '#111111');
    assert.equal(settings?.customText, '#eeeeee');
  });
});

describe('updateUserReaderSettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('merges updates and upserts clamped settings', async () => {
    const selectChain = chainable({
      data: {
        settings: {
          fontFamily: 'serif',
          fontSize: 16,
          lineHeight: 1.6,
          colorScheme: 'light',
        },
      },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : upsertChain;
    });

    const settings = await updateUserReaderSettings('user-1', { fontSize: 10 }, 'token');
    assert.equal(settings.fontSize, 14);
    assert.equal(upsertChain.upsert.mock.calls.length, 1);
    const upsertPayload = upsertChain.upsert.mock.calls[0]?.[0] as {
      user_id: string;
      settings: { fontSize: number };
    };
    assert.equal(upsertPayload.user_id, 'user-1');
    assert.equal(upsertPayload.settings.fontSize, 14);
  });

  it('throws when upsert fails', async () => {
    const selectChain = chainable({ data: null, error: { message: 'not found' } });
    const upsertChain = chainable({ data: null, error: { message: 'upsert fail' } });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : upsertChain;
    });
    await assert.rejects(
      () => updateUserReaderSettings('user-1', { fontSize: 16 }, 'token'),
      /Failed to update user reader settings/
    );
  });
});

describe('getChaptersSummary', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when project not found for user', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const summary = await getChaptersSummary('proj-1', 'user-1', 'token');
    assert.deepEqual(summary, []);
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('returns chapter summaries from RPC batches', async () => {
    const projectChain = chainable({ data: { id: 'proj-1' }, error: null });
    mockFrom.mockReturnValue(projectChain);
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'ch-1',
          number: 1,
          title: 'Chapter 1',
          translated_title: null,
          status: 'completed',
          translation_meta: null,
          paragraph_count: 5,
          translated_paragraph_count: 5,
        },
      ],
      error: null,
    });

    const summary = await getChaptersSummary('proj-1', 'user-1', 'token');
    assert.equal(summary.length, 1);
    assert.equal(summary[0]?.id, 'ch-1');
    assert.equal(summary[0]?.isFullyTranslated, true);
  });

  it('throws when RPC batch fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: { id: 'proj-1' }, error: null }));
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc fail' },
    });
    await assert.rejects(
      () => getChaptersSummary('proj-1', 'user-1', 'token'),
      /Failed to get chapters/
    );
  });

  it('maps partial and draft statuses with translated title trim', async () => {
    mockFrom.mockReturnValue(chainable({ data: { id: 'proj-1' }, error: null }));
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'ch-partial',
          number: 1,
          title: 'Chapter 1',
          translated_title: '  Глава 1  ',
          status: 'partial',
          translation_meta: { lastAnalysisAt: '2026-01-01T00:00:00Z' },
          paragraph_count: 3,
          translated_paragraph_count: 2,
        },
        {
          id: 'ch-draft',
          number: 2,
          title: 'Chapter 2',
          translated_title: null,
          status: 'draft',
          translation_meta: null,
          paragraph_count: 2,
          translated_paragraph_count: 2,
        },
        {
          id: 'ch-error',
          number: 3,
          title: 'Chapter 3',
          translated_title: null,
          status: 'error',
          translation_meta: null,
          paragraph_count: 1,
          translated_paragraph_count: 1,
        },
      ],
      error: null,
    });

    const summary = await getChaptersSummary('proj-1', 'user-1', 'token');
    assert.equal(summary.length, 3);
    assert.equal(summary[0]?.translatedTitle, 'Глава 1');
    assert.equal(summary[0]?.hasTranslation, true);
    assert.equal(summary[0]?.isFullyTranslated, false);
    assert.equal(summary[1]?.status, 'draft');
    assert.equal(summary[1]?.isFullyTranslated, true);
    assert.equal(summary[2]?.hasTranslation, false);
  });

  it('paginates RPC batches until partial page', async () => {
    mockFrom.mockReturnValue(chainable({ data: { id: 'proj-1' }, error: null }));
    const fullBatch = Array.from({ length: 1000 }, (_, i) => ({
      id: `ch-${i}`,
      number: i + 1,
      title: `Chapter ${i + 1}`,
      translated_title: null,
      status: 'pending',
      translation_meta: null,
      paragraph_count: 0,
      translated_paragraph_count: 0,
    }));
    mockRpc.mockResolvedValueOnce({ data: fullBatch, error: null }).mockResolvedValueOnce({
      data: [
        {
          id: 'ch-last',
          number: 1001,
          title: 'Last',
          translated_title: null,
          status: 'pending',
          translation_meta: null,
          paragraph_count: 0,
          translated_paragraph_count: 0,
        },
      ],
      error: null,
    });

    const summary = await getChaptersSummary('proj-1', 'user-1', 'token');
    assert.equal(summary.length, 1001);
    assert.equal(mockRpc.mock.calls.length, 2);
    assert.equal(mockRpc.mock.calls[1]?.[1]?.p_offset, 1000);
  });
});

describe('updateReaderSettings', () => {
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
    const settings = await updateReaderSettings('missing', { fontSize: 16 }, 'user-1', 'token');
    assert.equal(settings, undefined);
  });

  it('throws when settings update fails', async () => {
    const projectRow = mockProjectRow({
      settings: { reader: { fontSize: 16, lineHeight: 1.6 } },
    });
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const updateChain = chainable({ data: null, error: { message: 'update fail' } });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      if (table === 'projects' && fromCall === 3) return updateChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    await assert.rejects(
      () => updateReaderSettings('proj-1', { fontSize: 18 }, 'user-1', 'token'),
      /Failed to update reader settings/
    );
  });

  it('clamps fontSize to minimum 14', async () => {
    const projectRow = mockProjectRow({
      settings: { reader: { fontSize: 16, lineHeight: 1.6 } },
    });
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const updateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      if (table === 'projects' && fromCall === 3) return updateChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    const settings = await updateReaderSettings('proj-1', { fontSize: 8 }, 'user-1', 'token');
    assert.equal(settings?.fontSize, 14);
    assert.equal(updateChain.update.mock.calls.length, 1);
  });

  it('clamps fontSize to maximum 24', async () => {
    const projectRow = mockProjectRow({
      settings: { reader: { fontSize: 16, lineHeight: 1.6 } },
    });
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const updateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      if (table === 'projects' && fromCall === 3) return updateChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    const settings = await updateReaderSettings('proj-1', { fontSize: 40 }, 'user-1', 'token');
    assert.equal(settings?.fontSize, 24);
  });

  it('clamps lineHeight to valid range', async () => {
    const projectRow = mockProjectRow({
      settings: { reader: { fontSize: 16, lineHeight: 1.6 } },
    });
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const updateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      if (table === 'projects' && fromCall === 3) return updateChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    const settings = await updateReaderSettings('proj-1', { lineHeight: 0.5 }, 'user-1', 'token');
    assert.equal(settings?.lineHeight, 1.4);
  });

  it('clamps paragraphSpacing and containerWidth', async () => {
    const projectRow = mockProjectRow({
      settings: {
        reader: { fontSize: 16, lineHeight: 1.6, paragraphSpacing: 1, containerWidth: 80 },
      },
    });
    const projectChain = chainable({ data: projectRow, error: null });
    const stuckSelectChain = chainable({ data: [], error: null });
    const updateChain = chainable({ data: null, error: null });
    let fromCall = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCall += 1;
      if (table === 'projects' && fromCall === 1) return projectChain;
      if (table === 'chapters') return stuckSelectChain;
      if (table === 'projects' && fromCall === 3) return updateChain;
      throw new Error(`unexpected table ${table} call ${fromCall}`);
    });
    mockLoadChaptersForProjectLightweight.mockResolvedValue([]);
    mockLoadGlossaryForProject.mockResolvedValue([]);

    const settings = await updateReaderSettings(
      'proj-1',
      { paragraphSpacing: 5, containerWidth: 120 },
      'user-1',
      'token'
    );
    assert.equal(settings?.paragraphSpacing, 2);
    assert.equal(settings?.containerWidth, 100);
  });
});

describe('resetStuckChaptersForRecovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('force-resets specified chapter ids without timeout', async () => {
    const selectChain = chainable({
      data: [{ id: 'ch-force' }],
      error: null,
    });
    const updateChain = chainable({ data: null, error: null });
    let call = 0;
    mockServiceFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });

    const count = await resetStuckChaptersForRecovery('proj-1', ['ch-force']);
    assert.equal(count, 1);
  });

  it('returns 0 when no stuck chapters in timeout mode', async () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockServiceFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'ch-recent',
            translation_meta: null,
            updated_at: recent,
          },
        ],
        error: null,
      })
    );
    const count = await resetStuckChaptersForRecovery('proj-1');
    assert.equal(count, 0);
  });

  it('throws when recovery select fails', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'select fail' },
      })
    );
    await assert.rejects(
      () => resetStuckChaptersForRecovery('proj-1', ['ch-1']),
      /Failed to get stuck chapters for recovery/
    );
  });

  it('resets stuck chapters in timeout mode without explicit ids', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const selectChain = chainable({
      data: [
        {
          id: 'ch-stuck',
          translation_meta: null,
          updated_at: old,
        },
      ],
      error: null,
    });
    const updateChain = chainable({ data: null, error: null });
    let call = 0;
    mockServiceFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });

    const count = await resetStuckChaptersForRecovery('proj-1');
    assert.equal(count, 1);
  });

  it('throws when recovery update fails', async () => {
    const selectChain = chainable({ data: [{ id: 'ch-force' }], error: null });
    const updateChain = chainable({ data: null, error: { message: 'update fail' } });
    let call = 0;
    mockServiceFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? selectChain : updateChain;
    });
    await assert.rejects(
      () => resetStuckChaptersForRecovery('proj-1', ['ch-force']),
      /Failed to reset stuck chapters/
    );
  });
});

describe('duplicateChaptersInProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws INVALID_CHAPTER_IDS when chapters are missing in same project', async () => {
    const projectChain = chainable({
      data: { id: 'proj-1', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const emptyChaptersChain = chainable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return projectChain;
      if (table === 'chapters') return emptyChaptersChain;
      throw new Error(`unexpected table ${table}`);
    });

    await assert.rejects(
      () => duplicateChaptersInProject('proj-1', 'user-1', 'token', ['ch-missing']),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'INVALID_CHAPTER_IDS');
        return true;
      }
    );
  });

  it('duplicates chapters within same project', async () => {
    const projectChain = chainable({
      data: { id: 'proj-1', source_language: 'en', target_language: 'ru' },
      error: null,
    });
    const sourceChaptersChain = chainable({
      data: [
        {
          id: 'ch-src',
          number: 1,
          title: 'Chapter 1',
          translated_title: null,
          original_text: 'Hello.',
          translated_text: 'Привет.',
          translated_chunks: null,
          status: 'completed',
          translation_meta: null,
          critic_report: null,
        },
      ],
      error: null,
    });
    const targetNumbersChain = chainable({ data: [{ number: 1 }], error: null });
    const insertChapterChain = chainable({ data: { id: 'ch-dup' }, error: null });
    const insertParagraphChain = chainable({ data: null, error: null });
    const paragraphCountChain = chainable({ data: null, error: null, count: 1 });
    const projectUpdateChain = chainable({ data: null, error: null });
    let projectCall = 0;
    let chaptersCall = 0;
    let paragraphsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        projectCall += 1;
        return projectCall <= 2 ? projectChain : projectUpdateChain;
      }
      if (table === 'chapters') {
        chaptersCall += 1;
        if (chaptersCall === 1) return sourceChaptersChain;
        if (chaptersCall === 2) return targetNumbersChain;
        return insertChapterChain;
      }
      if (table === 'paragraphs') {
        paragraphsCall += 1;
        return paragraphsCall === 1 ? insertParagraphChain : paragraphCountChain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockLoadParagraphsForChapterIds.mockResolvedValue(
      new Map([
        [
          'ch-src',
          [
            {
              id: 'p-1',
              index: 0,
              originalText: 'Hello.',
              translatedText: 'Привет.',
              status: 'translated',
            },
          ],
        ],
      ])
    );

    const result = await duplicateChaptersInProject('proj-1', 'user-1', 'token', ['ch-src']);
    assert.equal(result?.chaptersTransferred, 1);
    assert.equal(result?.chapterNumberMap[1], 2);
  });
});

describe('getProjectFullForRecovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when project not found', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const project = await getProjectFullForRecovery('proj-1', 'user-1', ['ch-1']);
    assert.equal(project, null);
  });

  it('loads project with chapters and glossary via service role', async () => {
    const projectChain = chainable({
      data: mockProjectRow(),
      error: null,
    });
    const chaptersChain = chainable({
      data: [
        {
          id: 'ch-1',
          number: 1,
          title: 'Chapter 1',
          paragraphs: [
            {
              id: 'p-1',
              index: 0,
              original_text: 'Hello.',
              translated_text: 'Привет.',
              status: 'translated',
            },
          ],
        },
      ],
      error: null,
    });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'projects') return projectChain;
      if (table === 'chapters') return chaptersChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockLoadGlossaryForProjectPublic.mockResolvedValue([
      { id: 'g-1', type: 'term', original: 'foo' },
    ]);

    const project = await getProjectFullForRecovery('proj-1', 'user-1', ['ch-1']);
    assert.equal(project?.id, 'proj-1');
    assert.equal(project?.chapters.length, 1);
    assert.equal(project?.glossary.length, 1);
    assert.equal(mockLoadGlossaryForProjectPublic.mock.calls[0]?.[0], 'proj-1');
  });

  it('returns null when service role query throws', async () => {
    mockServiceFrom.mockImplementation(() => {
      throw new Error('service down');
    });
    const project = await getProjectFullForRecovery('proj-1', 'user-1', ['ch-1']);
    assert.equal(project, null);
  });
});

describe('createProject metadata', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('includes metadata in insert payload', async () => {
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertChain = chainable({
      data: mockProjectRow({ metadata: { authors: ['Test Author'] } }),
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? countChain : insertChain;
    });

    const project = await createProject(
      { name: 'With Meta', metadata: { authors: ['Test Author'] } },
      'user-1',
      'token'
    );
    assert.deepEqual((project.metadata as { authors?: string[] })?.authors, ['Test Author']);
    const insertPayload = insertChain.insert.mock.calls[0]?.[0] as { metadata?: unknown };
    assert.deepEqual(insertPayload.metadata, { authors: ['Test Author'] });
  });
});

describe('resetStuckChapters without token', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses default supabase client when token is empty', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }));
    const count = await resetStuckChapters('');
    assert.equal(count, 0);
    assert.equal(mockFrom.mock.calls.length, 1);
  });
});
