/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
} from '../utils/pageMetaCore.js';
import { useStaticPageMeta } from './useStaticPageMeta.js';

describe('useStaticPageMeta', () => {
  afterEach(() => {
    document.title = DEFAULT_PAGE_TITLE;
    document
      .querySelectorAll(
        'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]'
      )
      .forEach((el) => el.remove());
  });

  it('sets document title and description for a static pathname', () => {
    renderHook(() => useStaticPageMeta('/about'));

    expect(document.title.length).toBeGreaterThan(0);
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content')
    ).toBeTruthy();
    expect(
      document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    ).toBeTruthy();
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain(
      '/about'
    );
  });

  it('applies custom title and description from options', () => {
    renderHook(() =>
      useStaticPageMeta('/custom', {
        title: 'Custom Title',
        description: 'Custom description',
        canonicalPath: '/custom',
      })
    );

    expect(document.title).toContain('Custom Title');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Custom description'
    );
  });

  it('restores defaults on unmount', () => {
    const { unmount } = renderHook(() => useStaticPageMeta('/about', { title: 'Temporary About' }));

    expect(document.title).toContain('Temporary About');
    unmount();

    expect(document.title).toBe(DEFAULT_PAGE_TITLE);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      DEFAULT_PAGE_DESCRIPTION
    );
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(
      DEFAULT_OG_DESCRIPTION
    );
  });
});
