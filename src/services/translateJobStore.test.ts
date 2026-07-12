import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { TranslateJobState } from './translateJobStore.js';

const { mockRedis, MockRedis } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();

  const mockRedis = {
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
      return keys.length;
    }),
    expire: vi.fn(async () => 1),
    sadd: vi.fn(async (key: string, member: string) => {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      set.add(member);
      return 1;
    }),
    srem: vi.fn(async (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return 1;
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    _reset() {
      store.clear();
      sets.clear();
      vi.clearAllMocks();
    },
  };

  const MockRedis = vi.fn(function MockRedis() {
    return mockRedis;
  });

  return { mockRedis, MockRedis };
});

vi.mock('@upstash/redis', () => ({
  Redis: MockRedis,
}));

function makeJob(overrides: Partial<TranslateJobState> = {}): TranslateJobState {
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

describe('createTranslateJobStoreFromEnv (memory)', () => {
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
    const { createTranslateJobStoreFromEnv } = await import('./translateJobStore.js');
    return createTranslateJobStoreFromEnv();
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
  });

  it('updateJob returns null when job is missing', async () => {
    const store = await getStore();
    assert.equal(await store.updateJob('missing', { status: 'processing' }), null);
  });

  it('cancelJob sets cancelRequested for active job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    const canceled = await store.cancelJob('job-1');
    assert.equal(canceled?.cancelRequested, true);
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('cancelJob leaves completed job unchanged', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'completed' }));
    const canceled = await store.cancelJob('job-1');
    assert.equal(canceled?.status, 'completed');
    assert.equal(canceled?.cancelRequested, false);
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

  it('hasActiveJobForUser is false when active job is canceled', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'canceled' }));
    await store.setUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), false);
  });

  it('hasActiveJobForUser is true for queued job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'queued' }));
    await store.setUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);
  });

  it('updateJob returns same state when patch does not change job', async () => {
    const store = await getStore();
    const job = makeJob();
    await store.createJob(job);
    const updated = await store.updateJob('job-1', { status: 'queued' });
    assert.deepEqual(updated, job);
  });

  it('deleteJob removes job from memory store', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.deleteJob('job-1');
    assert.equal(await store.getJob('job-1'), null);
  });

  it('clearUserActiveJob ignores mismatched job id', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    await store.setUserActiveJob('user-1', 'job-1');
    await store.clearUserActiveJob('user-1', 'other-job');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);
  });

  it('cancelJob returns null when job missing', async () => {
    const store = await getStore();
    assert.equal(await store.cancelJob('missing'), null);
  });

  it('isCancelRequested reads cancelRequested flag on job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ cancelRequested: true, status: 'processing' }));
    assert.equal(await store.isCancelRequested('job-1'), true);
  });
});

describe('createTranslateJobStoreFromEnv (redis)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mockRedis._reset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getStore() {
    const { createTranslateJobStoreFromEnv } = await import('./translateJobStore.js');
    return createTranslateJobStoreFromEnv();
  }

  it('persists jobs through redis get and set', async () => {
    const store = await getStore();
    const job = makeJob({ status: 'processing', currentChapterTitle: 'Ch1' });
    await store.createJob(job);

    assert.equal(mockRedis.set.mock.calls.length, 1);
    assert.deepEqual(await store.getJob('job-1'), job);
  });

  it('isCancelRequested reads redis cancel flag', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.requestCancel('job-1');
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('setTtl calls expire on job and cancel keys', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.setTtl('job-1', 3600);
    assert.equal(mockRedis.expire.mock.calls.length, 2);
  });

  it('clearUserActiveJob deletes user mapping when job id matches', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.setUserActiveJob('user-1', 'job-1');
    await store.clearUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), false);
  });

  it('deleteJob removes redis keys', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.deleteJob('job-1');
    assert.equal(await store.getJob('job-1'), null);
    assert.ok(mockRedis.del.mock.calls.length >= 1);
  });

  it('cancelJob leaves error job unchanged', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'error' }));
    const result = await store.cancelJob('job-1');
    assert.equal(result?.status, 'error');
    assert.equal(result?.cancelRequested, false);
  });

  it('cancelJob leaves completed job unchanged', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'completed' }));
    const result = await store.cancelJob('job-1');
    assert.equal(result?.cancelRequested, false);
  });

  it('updateJob returns unchanged job without redis set', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'queued' }));
    mockRedis.set.mockClear();
    const updated = await store.updateJob('job-1', { status: 'queued' });
    assert.equal(updated?.status, 'queued');
    assert.equal(mockRedis.set.mock.calls.length, 0);
  });

  it('listByProject removes stale index entries', async () => {
    const store = await getStore();
    await store.addToProjectIndex('proj-1', 'missing-job');
    const list = await store.listByProject('proj-1');
    assert.deepEqual(list, []);
    assert.equal(mockRedis.srem.mock.calls.length, 1);
  });

  it('hasActiveJobForUser is true for processing job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    await store.setUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);
  });

  it('isCancelRequested reads cancel flag from job state', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ cancelRequested: true, status: 'processing' }));
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('clearUserActiveJob no-op when job id differs', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    await store.setUserActiveJob('user-1', 'job-1');
    await store.clearUserActiveJob('user-1', 'other');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);
  });
});
