import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { AnalysisJobState } from './analysisJobStore.js';

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

  it('updateJob returns null when job is missing', async () => {
    const store = await getStore();
    const updated = await store.updateJob('missing', { status: 'processing' });
    assert.equal(updated, null);
  });

  it('cancelJob sets cancelRequested for active job', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    const canceled = await store.cancelJob('job-1');
    assert.equal(canceled?.cancelRequested, true);
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('cancelJob leaves terminal job unchanged', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'completed', cancelRequested: false }));
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

  it('hasActiveJobForUser is true only for queued or processing jobs', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    await store.setUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);

    await store.updateJob('job-1', { status: 'completed' });
    assert.equal(await store.hasActiveJobForUser('user-1'), false);
  });

  it('clearUserActiveJob removes mapping only for matching job id', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ status: 'processing' }));
    await store.setUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);

    await store.clearUserActiveJob('user-1', 'job-other');
    assert.equal(await store.hasActiveJobForUser('user-1'), true);

    await store.clearUserActiveJob('user-1', 'job-1');
    assert.equal(await store.hasActiveJobForUser('user-1'), false);
  });
});

describe('createAnalysisJobStoreFromEnv (redis)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('KV_REST_API_URL', 'https://redis.test');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    mockRedis._reset();
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

  it('uses Redis client when env is configured', async () => {
    await getStore();
    assert.equal(MockRedis.mock.calls.length, 1);
    assert.deepEqual((MockRedis as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], {
      url: 'https://redis.test',
      token: 'token',
    });
  });

  it('createJob writes to redis and clears cancel flag', async () => {
    const store = await getStore();
    const job = makeJob();
    await store.createJob(job);

    assert.equal(mockRedis.set.mock.calls.length, 1);
    assert.equal(mockRedis.del.mock.calls.length, 1);
    assert.deepEqual(await store.getJob('job-1'), job);
  });

  it('requestCancel stores cancel flag in redis', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.requestCancel('job-1');
    assert.equal(await store.isCancelRequested('job-1'), true);
  });

  it('listByProject removes stale job ids from project index', async () => {
    const store = await getStore();
    await store.createJob(makeJob({ jobId: 'job-live' }));
    await store.addToProjectIndex('proj-1', 'job-live');
    await store.addToProjectIndex('proj-1', 'job-stale');

    const list = await store.listByProject('proj-1');
    assert.equal(list.length, 1);
    assert.equal(list[0]?.jobId, 'job-live');
    assert.equal(mockRedis.srem.mock.calls.length, 1);
  });

  it('deleteJob removes job and cancel keys', async () => {
    const store = await getStore();
    await store.createJob(makeJob());
    await store.requestCancel('job-1');
    await store.deleteJob('job-1');

    assert.equal(await store.getJob('job-1'), null);
    assert.ok(mockRedis.del.mock.calls.length >= 2);
  });
});
