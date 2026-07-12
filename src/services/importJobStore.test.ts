import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

vi.stubEnv('KV_REST_API_URL', '');
vi.stubEnv('KV_REST_API_TOKEN', '');

import { createImportJobStoreFromEnv } from './importJobStore.js';
import type { ImportJobState } from './importJobStore.js';

function sampleJob(id: string): ImportJobState {
  return {
    jobId: id,
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'queued',
    phase: 'parsing',
    format: 'epub',
    filename: 'book.epub',
    current: 0,
    total: 1,
    warnings: [],
    errors: [],
    chapters: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: null,
    cancelRequested: false,
  };
}

describe('importJobStore memory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('createJob and getJob round-trip', async () => {
    const store = createImportJobStoreFromEnv();
    await store.createJob(sampleJob('imp-1'));
    const job = await store.getJob('imp-1');
    assert.equal(job?.jobId, 'imp-1');
  });

  it('updateJob patches state', async () => {
    const store = createImportJobStoreFromEnv();
    await store.createJob(sampleJob('imp-2'));
    const updated = await store.updateJob('imp-2', { status: 'processing', current: 1 });
    assert.equal(updated?.status, 'processing');
    assert.equal(updated?.current, 1);
  });
});
