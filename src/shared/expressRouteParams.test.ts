import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { queryParam, requireRouteParam, routeParam } from './expressRouteParams.js';

describe('routeParam', () => {
  it('returns string as-is', () => {
    assert.equal(routeParam('abc'), 'abc');
  });

  it('returns first element of array', () => {
    assert.equal(routeParam(['first', 'second']), 'first');
  });

  it('returns undefined for undefined', () => {
    assert.equal(routeParam(undefined), undefined);
  });
});

describe('requireRouteParam', () => {
  it('returns string when present', () => {
    assert.equal(requireRouteParam('id-1'), 'id-1');
  });

  it('throws when missing', () => {
    assert.throws(() => requireRouteParam(undefined), /Missing route param/);
    assert.throws(() => requireRouteParam([], 'chapterId'), /Missing route chapterId/);
  });
});

describe('queryParam', () => {
  it('coerces string and array values', () => {
    assert.equal(queryParam('x'), 'x');
    assert.equal(queryParam(['a', 'b']), 'a');
    assert.equal(queryParam(42), undefined);
    assert.equal(queryParam(undefined), undefined);
  });
});
