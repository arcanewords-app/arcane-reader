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
  mockRenumberChapters,
} = vi.hoisted(() => ({
  mockLoadChaptersForProject: vi.fn().mockResolvedValue([]),
  mockLoadChaptersForProjectLightweight: vi.fn().mockResolvedValue([]),
  mockLoadGlossaryForProject: vi.fn().mockResolvedValue([]),
  mockRenumberChapters: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../loaders.js', () => ({
  loadChaptersForProject: (...args: unknown[]) => mockLoadChaptersForProject(...args),
  loadChaptersForProjectLightweight: (...args: unknown[]) =>
    mockLoadChaptersForProjectLightweight(...args),
  loadGlossaryForProject: (...args: unknown[]) => mockLoadGlossaryForProject(...args),
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
  getAllProjects,
  getAllProjectsLightweight,
  getChapterStatusRow,
  getChaptersSummary,
  getProject,
  getProjectFull,
  getReaderSettings,
  getUserReaderSettings,
  resetStuckChapters,
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
});

describe('updateReaderSettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
});
