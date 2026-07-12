import { describe, expect, it } from 'vitest';
import { isPreferAsync } from './preferAsync.js';

describe('isPreferAsync', () => {
  it('detects Prefer: respond-async header', () => {
    expect(
      isPreferAsync({
        get: (name) => (name === 'Prefer' ? 'respond-async' : undefined),
      })
    ).toBe(true);
  });

  it('detects async query param', () => {
    expect(
      isPreferAsync({
        get: () => undefined,
        query: { async: '1' },
      })
    ).toBe(true);
    expect(
      isPreferAsync({
        get: () => undefined,
        query: { async: 'true' },
      })
    ).toBe(true);
  });

  it('returns false when sync', () => {
    expect(
      isPreferAsync({
        get: () => undefined,
        query: {},
      })
    ).toBe(false);
  });
});
