import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { ImportJobState } from './importJobStore.js';

const { mockRedis, MockRedis } = vi.hoisted(() => {
  const store = new Map<string, unknown>();

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
    _reset() {
      store.clear();
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

function sampleJob(id: string, overrides: Partial<ImportJobState> = {}): ImportJobState {
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
    ...overrides,
  };
}

describe('createImportJobStoreFromEnv (memory)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getStore() {
    const { createImportJobStoreFromEnv } = await import('./importJobStore.js');
    return createImportJobStoreFromEnv();
  }

  it('createJob and getJob round-trip', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-1'));
    const job = await store.getJob('imp-1');
    assert.equal(job?.jobId, 'imp-1');
  });

  it('updateJob patches state', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-2'));
    const updated = await store.updateJob('imp-2', { status: 'processing', current: 1 });
    assert.equal(updated?.status, 'processing');
    assert.equal(updated?.current, 1);
  });

  it('updateJob returns null for missing job', async () => {
    const store = await getStore();
    assert.equal(await store.updateJob('missing', { status: 'error' }), null);
  });

  it('cancelJob requests cancel for active import', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-3', { status: 'processing' }));
    const canceled = await store.cancelJob('imp-3');
    assert.equal(canceled?.cancelRequested, true);
    assert.equal(await store.isCancelRequested('imp-3'), true);
  });

  it('cancelJob does not change completed job', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-4', { status: 'completed' }));
    const canceled = await store.cancelJob('imp-4');
    assert.equal(canceled?.status, 'completed');
    assert.equal(canceled?.cancelRequested, false);
  });

  it('deleteJob removes job from memory store', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-5'));
    await store.deleteJob('imp-5');
    assert.equal(await store.getJob('imp-5'), null);
  });
});

describe('createImportJobStoreFromEnv (redis)', () => {
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
    const { createImportJobStoreFromEnv } = await import('./importJobStore.js');
    return createImportJobStoreFromEnv();
  }

  it('instantiates Redis when credentials are present', async () => {
    await getStore();
    assert.equal(MockRedis.mock.calls.length, 1);
  });

  it('createJob stores state in redis', async () => {
    const store = await getStore();
    const job = sampleJob('imp-redis');
    await store.createJob(job);
    assert.equal(mockRedis.set.mock.calls.length, 1);
    assert.deepEqual(await store.getJob('imp-redis'), job);
  });

  it('requestCancel persists cancel flag', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-cancel'));
    await store.requestCancel('imp-cancel');
    assert.equal(await store.isCancelRequested('imp-cancel'), true);
  });

  it('setTtl expires job and cancel keys', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-ttl'));
    await store.setTtl('imp-ttl', 600);
    assert.equal(mockRedis.expire.mock.calls.length, 2);
  });

  it('updateJob returns current when patch is a no-op', async () => {
    const store = await getStore();
    const job = sampleJob('imp-noop', { status: 'processing', current: 2 });
    await store.createJob(job);
    const updated = await store.updateJob('imp-noop', { status: 'processing', current: 2 });
    assert.deepEqual(updated, job);
  });

  it('updateJob returns null for missing redis job', async () => {
    const store = await getStore();
    assert.equal(await store.updateJob('missing', { status: 'error' }), null);
  });

  it('isCancelRequested accepts numeric and boolean redis flags', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-flag'));
    await mockRedis.set('import_job_cancel:imp-flag', 1);
    assert.equal(await store.isCancelRequested('imp-flag'), true);
    await mockRedis.set('import_job_cancel:imp-flag', true);
    assert.equal(await store.isCancelRequested('imp-flag'), true);
  });

  it('cancelJob short-circuits terminal statuses and deleteJob clears keys', async () => {
    const store = await getStore();
    await store.createJob(sampleJob('imp-done', { status: 'error' }));
    const canceled = await store.cancelJob('imp-done');
    assert.equal(canceled?.status, 'error');
    assert.equal(canceled?.cancelRequested, false);

    await store.createJob(sampleJob('imp-del'));
    await store.requestCancel('imp-del');
    await store.deleteJob('imp-del');
    assert.equal(await store.getJob('imp-del'), null);
    assert.equal(await store.isCancelRequested('imp-del'), false);
  });
});

describe('createImportJobStoreFromEnv (memory ttl/cancel edges)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('setTtl eventually deletes memory job and cancelJob skips completed', async () => {
    vi.useFakeTimers();
    const { createImportJobStoreFromEnv } = await import('./importJobStore.js');
    const store = createImportJobStoreFromEnv();
    await store.createJob(sampleJob('imp-mem-ttl'));
    await store.setTtl('imp-mem-ttl', 1);
    await store.setTtl('imp-mem-ttl', 1);
    vi.advanceTimersByTime(1000);
    assert.equal(await store.getJob('imp-mem-ttl'), null);

    await store.createJob(sampleJob('imp-mem-canceled', { status: 'canceled' }));
    const canceled = await store.cancelJob('imp-mem-canceled');
    assert.equal(canceled?.status, 'canceled');
    vi.useRealTimers();
  });
});
