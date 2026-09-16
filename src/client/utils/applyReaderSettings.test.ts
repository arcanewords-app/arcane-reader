/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { DEFAULT_READER_SETTINGS } from '../types';
import { applyReaderSettings, clearReaderSettings } from './applyReaderSettings.js';

describe('applyReaderSettings', () => {
  afterEach(() => {
    clearReaderSettings(document.documentElement);
  });

  it('sets container width, paper theme, and EB Garamond on the root', () => {
    applyReaderSettings(document.documentElement, {
      ...DEFAULT_READER_SETTINGS,
      containerWidth: 89,
      colorScheme: 'paper',
      fontFamily: 'eb_garamond',
      fontSize: 20,
      lineHeight: 1.6,
      paragraphSpacing: 0.5,
      textIndent: true,
      textAlign: 'justify',
    });

    const root = document.documentElement;
    assert.equal(root.style.getPropertyValue('--reader-container-width'), '89%');
    assert.equal(root.style.getPropertyValue('--reader-font-size'), '20px');
    assert.equal(root.style.getPropertyValue('--reader-line-height'), '1.6');
    assert.equal(root.style.getPropertyValue('--reader-paragraph-spacing'), '0.5em');
    assert.equal(root.getAttribute('data-reader-font'), 'eb_garamond');
    assert.equal(root.getAttribute('data-reader-theme'), 'paper');
    assert.equal(root.getAttribute('data-reader-indent'), 'true');
    assert.equal(root.getAttribute('data-reader-align'), 'justify');
  });

  it('applies custom colors only for the custom scheme', () => {
    applyReaderSettings(document.documentElement, {
      ...DEFAULT_READER_SETTINGS,
      colorScheme: 'custom',
      customBg: '#111111',
      customText: '#eeeeee',
    });

    assert.equal(document.documentElement.style.getPropertyValue('--reader-bg'), '#111111');
    assert.equal(document.documentElement.style.getPropertyValue('--reader-text'), '#eeeeee');

    applyReaderSettings(document.documentElement, {
      ...DEFAULT_READER_SETTINGS,
      colorScheme: 'paper',
    });

    assert.equal(document.documentElement.style.getPropertyValue('--reader-bg'), '');
    assert.equal(document.documentElement.style.getPropertyValue('--reader-text'), '');
  });

  it('clearReaderSettings removes vars and data attributes', () => {
    applyReaderSettings(document.documentElement, {
      ...DEFAULT_READER_SETTINGS,
      containerWidth: 50,
      colorScheme: 'paper',
      fontFamily: 'eb_garamond',
    });

    clearReaderSettings(document.documentElement);

    const root = document.documentElement;
    assert.equal(root.style.getPropertyValue('--reader-container-width'), '');
    assert.equal(root.getAttribute('data-reader-font'), null);
    assert.equal(root.getAttribute('data-reader-theme'), null);
    assert.equal(root.getAttribute('data-reader-indent'), null);
    assert.equal(root.getAttribute('data-reader-align'), null);
  });
});
