import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { runWithConcurrency, runWithConcurrencyResilient } from './concurrency.js';

describe('runWithConcurrency', () => {
  it('returns empty array for empty input', async () => {
    const result = await runWithConcurrency([], 2, async () => 1);
    assert.deepEqual(result, []);
  });

  it('runs items with limited concurrency preserving order', async () => {
    const result = await runWithConcurrency([1, 2, 3], 2, async (n) => n * 2);
    assert.deepEqual(result, [2, 4, 6]);
  });
});

describe('runWithConcurrencyResilient', () => {
  it('captures per-item failures without aborting batch', async () => {
    const result = await runWithConcurrencyResilient([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    assert.equal(result[0]?.success, true);
    assert.equal(result[1]?.success, false);
    assert.equal(result[2]?.success, true);
  });

  it('throws Cancelled when isCancelled returns true', async () => {
    await assert.rejects(
      () =>
        runWithConcurrencyResilient([1, 2, 3], 1, async (n) => n, {
          isCancelled: () => true,
        }),
      /Cancelled/
    );
  });
});
