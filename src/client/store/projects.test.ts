import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { mockGetProjects, mockGetProject } = vi.hoisted(() => ({
  mockGetProjects: vi.fn(),
  mockGetProject: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  api: {
    getProjects: (...args: unknown[]) => mockGetProjects(...args),
    getProject: (...args: unknown[]) => mockGetProject(...args),
  },
}));

import {
  clearCache,
  getProject,
  loadProjects,
  projectsByType,
  projectsCache,
  projectsError,
  projectsLoading,
  projectsWithMetadata,
  updateProjectCache,
} from './projects.js';

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Novel',
    type: 'book',
    chapterCount: 2,
    translatedCount: 1,
    glossaryCount: 0,
    updatedAt: '2026-07-12T00:00:00Z',
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Novel',
    type: 'book',
    chapters: [
      { id: 'ch-1', number: 1, status: 'completed' },
      { id: 'ch-2', number: 2, status: 'pending' },
    ],
    glossary: [{ id: 'g1' }],
    settings: { originalReadingMode: true },
    metadata: { author: 'Alice' },
    updatedAt: '2026-07-12T12:00:00Z',
    ...overrides,
  };
}

describe('loadProjects', () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  it('populates projectsCache on success', async () => {
    const items = [makeListItem()];
    mockGetProjects.mockResolvedValue(items);

    await loadProjects();

    assert.deepEqual(projectsCache.value, items);
    assert.equal(projectsLoading.value, false);
    assert.equal(projectsError.value, null);
  });

  it('sets projectsError on failure', async () => {
    mockGetProjects.mockRejectedValue(new Error('network down'));

    await loadProjects();

    assert.deepEqual(projectsCache.value, []);
    assert.equal(projectsError.value, 'network down');
    assert.equal(projectsLoading.value, false);
  });
});

describe('getProject and updateProjectCache', () => {
  beforeEach(() => {
    clearCache();
    projectsCache.value = [makeListItem()];
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  it('returns project and syncs list item counts', async () => {
    mockGetProject.mockResolvedValue(makeProject());

    const project = await getProject('proj-1');

    assert.equal(project?.id, 'proj-1');
    assert.equal(projectsCache.value[0]?.chapterCount, 2);
    assert.equal(projectsCache.value[0]?.translatedCount, 1);
    assert.equal(projectsCache.value[0]?.glossaryCount, 1);
    assert.equal(projectsCache.value[0]?.originalReadingMode, true);
  });

  it('returns null when API fails', async () => {
    mockGetProject.mockRejectedValue(new Error('not found'));
    const project = await getProject('proj-1');
    assert.equal(project, null);
  });

  it('updateProjectCache updates list item without API call', () => {
    updateProjectCache(makeProject({ name: 'Renamed' }));
    assert.equal(projectsCache.value[0]?.name, 'Renamed');
    assert.equal(mockGetProject.mock.calls.length, 0);
  });
});

describe('computed selectors', () => {
  beforeEach(() => {
    clearCache();
    projectsCache.value = [
      makeListItem({ id: 'p1', type: 'book', metadata: { author: 'A' } }),
      makeListItem({ id: 'p2', type: 'text' }),
      makeListItem({ id: 'p3', type: undefined }),
    ];
  });

  afterEach(() => {
    clearCache();
  });

  it('projectsWithMetadata filters items with metadata', () => {
    assert.equal(projectsWithMetadata.value.length, 1);
    assert.equal(projectsWithMetadata.value[0]?.id, 'p1');
  });

  it('projectsByType splits books and texts', () => {
    assert.equal(projectsByType.value.books.length, 1);
    assert.equal(projectsByType.value.texts.length, 2);
  });
});

describe('clearCache', () => {
  it('resets projectsCache and internal project map', async () => {
    projectsCache.value = [makeListItem()];
    mockGetProject.mockResolvedValue(makeProject());
    await getProject('proj-1');

    clearCache();

    assert.deepEqual(projectsCache.value, []);
    const second = await getProject('proj-1');
    assert.equal(second?.id, 'proj-1');
    assert.equal(mockGetProject.mock.calls.length, 2);
  });
});
