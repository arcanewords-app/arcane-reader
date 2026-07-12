import { describe, expect, it } from 'vitest';
import { getCached, setCached } from './memoryCache.js';

describe('memoryCache', () => {
  it('returns null for missing or expired entries', () => {
    const map = new Map<string, { data: string; ts: number }>();
    expect(getCached(map, 'missing', 1000)).toBeNull();

    setCached(map, 'key', 'value');
    const entry = map.get('key')!;
    entry.ts = Date.now() - 2000;
    expect(getCached(map, 'key', 1000)).toBeNull();
  });

  it('returns fresh cached data', () => {
    const map = new Map<string, { data: string; ts: number }>();
    setCached(map, 'key', 'value');
    expect(getCached(map, 'key', 60_000)).toBe('value');
  });
});
