import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const queueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'job-1' }));

vi.mock('bullmq', () => {
  class Queue {
    add = queueAdd;
    constructor(
      public name: string,
      public opts: unknown
    ) {}
  }
  return { Queue };
});

describe('chapterQueue', () => {
  const prevRedis = process.env.REDIS_URL;
  const prevUpstash = process.env.UPSTASH_REDIS_URL;

  beforeEach(() => {
    vi.resetModules();
    queueAdd.mockClear();
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_URL;
  });

  afterEach(() => {
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
    if (prevUpstash === undefined) delete process.env.UPSTASH_REDIS_URL;
    else process.env.UPSTASH_REDIS_URL = prevUpstash;
  });

  it('isBullAvailable is false without redis url', async () => {
    const mod = await import('./chapterQueue.js');
    assert.equal(mod.isBullAvailable(), false);
    assert.throws(() => mod.getBullConnectionOptions(), /REDIS_URL or UPSTASH_REDIS_URL/);
  });

  it('parses redis and rediss connection options', async () => {
    process.env.REDIS_URL = 'rediss://user:secret@redis.example:6380/0';
    const mod = await import('./chapterQueue.js');
    assert.equal(mod.isBullAvailable(), true);
    const opts = mod.getBullConnectionOptions();
    assert.equal(opts.host, 'redis.example');
    assert.equal(opts.port, 6380);
    assert.equal(opts.password, 'secret');
    assert.equal(opts.username, 'user');
    assert.deepEqual(opts.tls, {});
  });

  it('defaults port and omits default username', async () => {
    process.env.UPSTASH_REDIS_URL = 'redis://default:pw@localhost';
    const mod = await import('./chapterQueue.js');
    const opts = mod.getBullConnectionOptions();
    assert.equal(opts.port, 6379);
    assert.equal(opts.username, undefined);
    assert.equal(opts.password, 'pw');
    assert.equal(opts.tls, undefined);
  });

  it('addAnalysisJob and addTranslateJob enqueue with jobId', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const mod = await import('./chapterQueue.js');
    await mod.addAnalysisJob({
      jobId: 'a1',
      projectId: 'p1',
      userId: 'u1',
      userRole: 'author',
      estimatedTokens: 10,
      chapterIds: ['c1'],
    });
    await mod.addTranslateJob({
      jobId: 't1',
      projectId: 'p1',
      userId: 'u1',
      userRole: 'author',
      estimatedTokens: 20,
      chapterIds: ['c1'],
      stages: 'all',
      translateOnlyEmpty: false,
    });
    assert.equal(queueAdd.mock.calls.length, 2);
    assert.equal(queueAdd.mock.calls[0]?.[0], 'analysis');
    assert.deepEqual(queueAdd.mock.calls[0]?.[2], { jobId: 'a1' });
    assert.equal(queueAdd.mock.calls[1]?.[0], 'translate');
    assert.deepEqual(queueAdd.mock.calls[1]?.[2], { jobId: 't1' });
  });
});
