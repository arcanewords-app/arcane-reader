import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJsonDeduped } = vi.hoisted(() => ({
  mockFetchJsonDeduped: vi.fn(),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

import { projectsApi } from './projects.js';

describe('projectsApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getProjects calls fetchJsonDeduped with projects endpoint', async () => {
    const items = [{ id: 'proj-1', name: 'Novel' }];
    mockFetchJsonDeduped.mockResolvedValue(items);

    const result = await projectsApi.getProjects();
    assert.deepEqual(result, items);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects');
  });

  it('getProject calls fetchJsonDeduped with project id path', async () => {
    const project = { id: 'proj-1', name: 'Novel', chapters: [] };
    mockFetchJsonDeduped.mockResolvedValue(project);

    const result = await projectsApi.getProject('proj-1');
    assert.deepEqual(result, project);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/projects/proj-1');
  });
});
