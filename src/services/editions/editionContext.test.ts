import { describe, expect, it } from 'vitest';
import { currentEditionTarget, runWithEditionTarget } from './editionContext.js';

describe('editionContext', () => {
  it('has no target outside a run and exposes it inside the async tree', async () => {
    expect(currentEditionTarget()).toBeUndefined();
    await expect(
      runWithEditionTarget('be', async () => {
        expect(currentEditionTarget()).toBe('be');
        return 'done';
      })
    ).resolves.toBe('done');
    expect(currentEditionTarget()).toBeUndefined();
  });
});
