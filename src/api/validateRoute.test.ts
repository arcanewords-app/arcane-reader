import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueryRecord, normalizeQueryValue } from './validateRoute.js';
import { z } from 'zod';

describe('validateRoute', () => {
  it('normalizeQueryValue picks first string from array', () => {
    assert.equal(normalizeQueryValue(['a', 'b']), 'a');
    assert.equal(normalizeQueryValue('x'), 'x');
    assert.equal(normalizeQueryValue(undefined), undefined);
  });

  it('normalizeQueryRecord flattens query object', () => {
    const flat = normalizeQueryRecord({ limit: '10', tag: ['a', 'b'] });
    assert.deepEqual(flat, { limit: '10', tag: 'a' });
  });

  it('Zod parses normalized query', () => {
    const schema = z.object({ limit: z.coerce.number().optional() });
    const parsed = schema.safeParse(normalizeQueryRecord({ limit: '5' }));
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.limit, 5);
  });
});
