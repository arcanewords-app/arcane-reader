import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildCatalogUrl,
  buildCatalogUrlFromState,
  getCatalogBasePath,
  parseCatalogEntityFilterFromUrl,
  parseCatalogFilterFromUrl,
  parseCatalogUrlState,
  sanitizeCatalogUrlStateForAuth,
} from './catalogRoutes.js';
import { buildProfileUrl, parseProfileTabFromUrl } from './profileRoutes.js';
import {
  buildChapterEditorUrl,
  buildProjectPageUrl,
  parseChapterEditorQueryFromUrl,
  parseProjectSearchFromUrl,
} from './projectRoutes.js';
import {
  buildPublicationPageUrl,
  parsePublicationChapterQueryFromUrl,
  sanitizePublicationChapterQueryForAuth,
} from './publicationRoutes.js';
import {
  buildReadingChapterUrl,
  parseReadingParagraphFromUrl,
  resolveReadingParagraphIndex,
} from './readingRoutes.js';

function withWindowSearch(search: string, fn: () => void) {
  const prev = globalThis.window;
  // @ts-expect-error test shim
  globalThis.window = {
    location: { pathname: '/test', search, href: `http://localhost/test${search}` },
  };
  try {
    fn();
  } finally {
    globalThis.window = prev;
  }
}

function withPathAndSearch(pathname: string, search: string, fn: () => void) {
  const prev = globalThis.window;
  // @ts-expect-error test shim
  globalThis.window = {
    location: { pathname, search, href: `http://localhost${pathname}${search}` },
  };
  try {
    fn();
  } finally {
    globalThis.window = prev;
  }
}

describe('profileRoutes', () => {
  it('omits default tab from URL', () => {
    assert.equal(buildProfileUrl('reading'), '/profile');
    assert.equal(buildProfileUrl('settings'), '/profile?tab=settings');
  });

  it('round-trips tab query', () => {
    withWindowSearch('?tab=settings', () => {
      assert.equal(parseProfileTabFromUrl(), 'settings');
      assert.equal(buildProfileUrl(parseProfileTabFromUrl()), '/profile?tab=settings');
    });
  });
});

describe('publicationRoutes', () => {
  it('omits default filter values', () => {
    withPathAndSearch('/p/my-book', '', () => {
      assert.equal(
        buildPublicationPageUrl('my-book', parsePublicationChapterQueryFromUrl()),
        '/p/my-book'
      );
    });
  });

  it('round-trips non-default filters', () => {
    withPathAndSearch('/p/slug', '?q=foo&translation=all&read=unread&order=desc', () => {
      const parsed = parsePublicationChapterQueryFromUrl();
      assert.equal(parsed.q, 'foo');
      assert.equal(parsed.translation, 'all');
      assert.equal(parsed.read, 'unread');
      assert.equal(parsed.order, 'desc');
      assert.equal(
        buildPublicationPageUrl('slug', parsed),
        '/p/slug?q=foo&translation=all&read=unread&order=desc'
      );
    });
  });

  it('strips guest read filter', () => {
    const query = {
      q: '',
      translation: 'translated' as const,
      read: 'unread' as const,
      order: 'asc' as const,
    };
    const sanitized = sanitizePublicationChapterQueryForAuth(query, false);
    assert.equal(sanitized.read, 'all');
  });
});

describe('projectRoutes', () => {
  it('omits empty project search', () => {
    assert.equal(buildProjectPageUrl('p1'), '/projects/p1');
    assert.equal(buildProjectPageUrl('p1', 'term'), '/projects/p1?search=term');
  });

  it('round-trips chapter editor query', () => {
    withPathAndSearch('/projects/p1/chapters/c1', '?search=foo&paragraph=uuid-1', () => {
      const parsed = parseChapterEditorQueryFromUrl();
      assert.equal(parsed.search, 'foo');
      assert.equal(parsed.paragraph, 'uuid-1');
      assert.equal(
        buildChapterEditorUrl('p1', 'c1', parsed),
        '/projects/p1/chapters/c1?search=foo&paragraph=uuid-1'
      );
    });
  });

  it('parses project search from URL', () => {
    withPathAndSearch('/projects/p1', '?search=hello', () => {
      assert.equal(parseProjectSearchFromUrl(), 'hello');
    });
  });
});

describe('catalogRoutes', () => {
  it('omits default catalog filter on /catalog base', () => {
    assert.equal(buildCatalogUrl('all', {}, '/catalog'), '/catalog');
    assert.equal(
      buildCatalogUrl('mine', { author: 'a1' }, '/catalog'),
      '/catalog?filter=mine&author=a1'
    );
  });

  it('preserves / base path for in-catalog navigation', () => {
    assert.equal(buildCatalogUrl('mine', {}, '/'), '/?filter=mine');
    assert.equal(buildCatalogUrl('all', {}, '/'), '/');
  });

  it('round-trips catalog state on /catalog', () => {
    withPathAndSearch('/catalog', '?filter=mine&tag=t1', () => {
      const state = parseCatalogUrlState();
      assert.equal(state.filter, 'mine');
      assert.equal(state.entityFilter.tag, 't1');
      assert.equal(buildCatalogUrlFromState(state), '/catalog?filter=mine&tag=t1');
    });
    withPathAndSearch('/catalog', '', () => {
      assert.equal(parseCatalogFilterFromUrl(), 'all');
      const entity = parseCatalogEntityFilterFromUrl();
      assert.equal(entity.author, undefined);
      assert.equal(entity.translator, undefined);
      assert.equal(entity.tag, undefined);
    });
  });

  it('strips guest mine filter', () => {
    const state = { filter: 'mine' as const, entityFilter: {} };
    const sanitized = sanitizeCatalogUrlStateForAuth(state, false);
    assert.equal(sanitized.filter, 'all');
  });

  it('getCatalogBasePath preserves / vs /catalog', () => {
    assert.equal(getCatalogBasePath('/'), '/');
    assert.equal(getCatalogBasePath('/catalog'), '/catalog');
    assert.equal(getCatalogBasePath('/projects'), '/catalog');
  });
});

describe('readingRoutes', () => {
  it('omits paragraph index <= 0', () => {
    assert.equal(
      buildReadingChapterUrl({
        isPublicationMode: true,
        publicationPath: 'book',
        chapterId: 'ch1',
      }),
      '/p/book/chapters/ch1/reading'
    );
    assert.equal(
      buildReadingChapterUrl({
        isPublicationMode: true,
        publicationPath: 'book',
        chapterId: 'ch1',
        paragraphIndex: 5,
      }),
      '/p/book/chapters/ch1/reading?paragraph=5'
    );
  });

  it('parses numeric paragraph index', () => {
    withPathAndSearch('/p/book/chapters/ch1/reading', '?paragraph=3', () => {
      assert.equal(parseReadingParagraphFromUrl(), 3);
    });
    withPathAndSearch('/p/book/chapters/ch1/reading', '?paragraph=abc', () => {
      assert.equal(parseReadingParagraphFromUrl(), undefined);
    });
  });

  it('resolves auth API vs URL paragraph priority', () => {
    assert.equal(
      resolveReadingParagraphIndex({
        isAuthenticated: true,
        urlHasParagraph: true,
        urlParagraphIndex: 7,
        apiChapterId: 'ch1',
        currentChapterId: 'ch1',
        apiParagraphIndex: 2,
      }),
      7
    );
    assert.equal(
      resolveReadingParagraphIndex({
        isAuthenticated: true,
        urlHasParagraph: false,
        apiChapterId: 'ch1',
        currentChapterId: 'ch1',
        apiParagraphIndex: 2,
      }),
      2
    );
  });
});
