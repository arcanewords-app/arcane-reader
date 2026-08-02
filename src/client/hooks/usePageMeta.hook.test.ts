/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
} from '../utils/pageMetaCore.js';
import { usePageMeta } from './usePageMeta.js';

describe('usePageMeta', () => {
  afterEach(() => {
    document.title = DEFAULT_PAGE_TITLE;
    document
      .querySelectorAll(
        'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[data-arcane-jsonld]'
      )
      .forEach((el) => el.remove());
  });

  it('sets document title and meta tags when meta is provided', () => {
    renderHook(() =>
      usePageMeta({
        title: 'Test Novel',
        description: 'A test description',
        authorDisplay: 'Author A',
        translatorDisplay: 'Translator B',
        targetLanguage: 'ru',
      })
    );

    expect(document.title).toContain('Test Novel');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'A test description'
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Test Novel'
    );
    expect(document.querySelector('script[data-arcane-jsonld="book"]')?.textContent).toContain(
      'Test Novel'
    );
  });

  it('restores defaults on unmount', () => {
    const { unmount } = renderHook(() =>
      usePageMeta({
        title: 'Temporary Title',
        description: 'Temporary description',
      })
    );

    expect(document.title).toContain('Temporary Title');
    unmount();

    expect(document.title).toBe(DEFAULT_PAGE_TITLE);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      DEFAULT_PAGE_DESCRIPTION
    );
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(
      DEFAULT_OG_DESCRIPTION
    );
    expect(document.querySelector('script[data-arcane-jsonld="book"]')).toBeNull();
  });

  it('does nothing when meta is null', () => {
    document.title = 'unchanged';
    renderHook(() => usePageMeta(null));
    expect(document.title).toBe('unchanged');
  });
});
