import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ping: vi.fn(),
  scan: vi.fn(),
  Redis: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(...args: unknown[]) {
      redisMocks.Redis(...args);
    }
    get = redisMocks.get;
    set = redisMocks.set;
    del = redisMocks.del;
    ping = redisMocks.ping;
    scan = redisMocks.scan;
  },
}));

describe('redisCache', () => {
  const prevUrl = process.env.KV_REST_API_URL;
  const prevToken = process.env.KV_REST_API_TOKEN;
  const prevUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.resetModules();
    redisMocks.get.mockReset();
    redisMocks.set.mockReset();
    redisMocks.del.mockReset();
    redisMocks.ping.mockReset();
    redisMocks.scan.mockReset();
    redisMocks.Redis.mockReset();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = prevUrl;
    if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = prevToken;
    if (prevUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUpstashUrl;
    if (prevUpstashToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevUpstashToken;
  });

  it('hasRedisCache is false and helpers no-op without env', async () => {
    const mod = await import('./redisCache.js');
    assert.equal(mod.hasRedisCache(), false);
    assert.equal(await mod.redisGetJson('k'), null);
    await mod.redisSetJson('k', { a: 1 }, 10);
    await mod.redisDelMany(['k']);
    assert.equal(await mod.redisDelByPattern('v1:*'), 0);
    await assert.rejects(() => mod.redisPing(), /Redis not configured/);
  });

  it('uses Redis when REST env is set', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    redisMocks.get.mockResolvedValue({ ok: true });
    redisMocks.set.mockResolvedValue('OK');
    redisMocks.del.mockResolvedValue(1);
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.scan.mockResolvedValueOnce([0, ['v1:a', 'v1:b']]).mockResolvedValueOnce([0, []]);

    const mod = await import('./redisCache.js');
    assert.equal(mod.hasRedisCache(), true);
    assert.deepEqual(await mod.redisGetJson<{ ok: boolean }>('k'), { ok: true });
    await mod.redisSetJson('k', { ok: true }, 30);
    assert.deepEqual(redisMocks.set.mock.calls[0]?.slice(0, 2), ['k', { ok: true }]);
    await mod.redisDelMany(['k1', 'k2']);
    assert.equal(redisMocks.del.mock.calls[0]?.length, 2);
    await mod.redisPing();
    assert.equal(await mod.redisDelByPattern('v1:*'), 2);
    assert.ok(mod.buildRedisKey('pub', 'x').includes('pub'));
  });

  it('redisPing rejects unexpected responses', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    redisMocks.ping.mockResolvedValue('NOPE');
    const mod = await import('./redisCache.js');
    await assert.rejects(() => mod.redisPing(), /unexpected response/);
  });
});
