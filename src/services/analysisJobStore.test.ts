import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { AnalysisJobState } from './analysisJobStore.js';

function makeJob(overrides: Partial<AnalysisJobState> = {}): AnalysisJobState {
  return {
    jobId: 'job-1',
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'queued',
    current: 0,
    total: 1,
    chapters: [],
    totalTokensUsed: 0,
    errors: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: null,
    cancelRequested: false,
    ...overrides,
  };
}

describe('createAnalysisJobStoreFromEnv (memory)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getStore() {
    const { createAnalysisJobStoreFromEnv } = await import('./analysisJobStore.js');
    return createAnalysisJobStoreFromEnv();
  }

  it('createJob and getJob round-trip', async () => {
    const store = await getStore();
    const job = makeJob();
    await store.createJob(job);
    const loaded = await store.getJob('job-1');
    assert.deepEqual(loaded, job);
  });

  it('updateJob merges patch and returns updated state', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    const updated = await store.updateJob('job-1', { status: 'processing', current: 1 });
    assert.equal(updated?.status, 'processing');
    assert.equal(updated?.current, 1);
    const loaded = await store.getJob('job-1');
    assert.equal(loaded?.status, 'processing');
  });

  it('cancelJob sets cancelRequested for active job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    const canceled = await store.cancelJob('job-1');
    assert.equal(canceled?.cancelRequested, true);
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('listByProject returns jobs indexed for project', async () => {
    const store = await getStore();
    const jobA = makeJob({ jobId: 'job-a', startedAt: '2026-01-01T00:00:00Z' });
    const jobB = makeJob({ jobId: 'job-b', startedAt: '2026-01-02T00:00:00Z' });
    await store.createJob(jobA);
    await store.createJob(jobB);
    await store.addToProjectIndex('proj-1', 'job-a');
    await store.addToProjectIndex('proj-1', 'job-b');

    const list = await store.listByProject('proj-1');
    assert.equal(list.length, 2);
    assert.equal(list[0]?.jobId, 'job-a');
    assert.equal(list[1]?.jobId, 'job-b');
  });
});
