/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
  APP_THEME_KEY,
  applyAppTheme,
  readAppTheme,
  setAppTheme,
  toggleAppTheme,
} from './appTheme.js';

describe('appTheme', () => {
  afterEach(() => {
    localStorage.removeItem(APP_THEME_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark and leaves the root attribute unset', () => {
    assert.equal(readAppTheme(), 'dark');
    applyAppTheme('dark');
    assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  });

  it('persists light and sets data-theme on the document element', () => {
    setAppTheme('light');
    assert.equal(localStorage.getItem(APP_THEME_KEY), 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(readAppTheme(), 'light');
  });

  it('toggles back to dark and removes the attribute', () => {
    setAppTheme('light');
    assert.equal(toggleAppTheme('light'), 'dark');
    assert.equal(localStorage.getItem(APP_THEME_KEY), 'dark');
    assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  });
});
