import { describe, expect, it } from 'vitest';
import { getBoostySupportUrl } from './supportLinks.js';

describe('getBoostySupportUrl', () => {
  it('stays disabled while donations are turned off', () => {
    expect(getBoostySupportUrl()).toBeUndefined();
  });
});
