import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';

const { redisGetJson, redisSetJson } = vi.hoisted(() => ({
  redisGetJson: vi.fn(),
  redisSetJson: vi.fn(),
}));

vi.mock('./redisCache.js', () => ({
  buildRedisKey: (prefix: string) => `v1:${prefix}`,
  redisGetJson: (...args: unknown[]) => redisGetJson(...args),
  redisSetJson: (...args: unknown[]) => redisSetJson(...args),
}));

import {
  readSharedHealth,
  shouldAwaitRecoveryProbe,
  writeSharedHealth,
} from './healthSnapshotStore.js';

describe('healthSnapshotStore', () => {
  beforeEach(() => {
    redisGetJson.mockReset();
    redisSetJson.mockReset();
  });

  it('readSharedHealth and writeSharedHealth use redis helpers', async () => {
    redisGetJson.mockResolvedValue({ status: 'healthy', services: {}, timestamp: 't' });
    redisSetJson.mockResolvedValue(undefined);
    const read = await readSharedHealth();
    assert.equal(read?.status, 'healthy');
    await writeSharedHealth({ status: 'down', services: {}, timestamp: 't2' });
    assert.equal(redisSetJson.mock.calls.length, 1);
  });

  it('shouldAwaitRecoveryProbe only when stale and supabase down', () => {
    assert.equal(shouldAwaitRecoveryProbe(true, 'down'), true);
    assert.equal(shouldAwaitRecoveryProbe(true, 'healthy'), false);
    assert.equal(shouldAwaitRecoveryProbe(false, 'down'), false);
  });
});
