/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isMobileViewport, MOBILE_MAX_PX, TABLET_MAX_PX } from './viewport.js';

describe('viewport', () => {
  it('exports breakpoint constants', () => {
    assert.equal(MOBILE_MAX_PX, 767);
    assert.equal(TABLET_MAX_PX, 1023);
  });

  it('isMobileViewport uses innerWidth threshold', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    assert.equal(isMobileViewport(), true);
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    assert.equal(isMobileViewport(), false);
  });
});
