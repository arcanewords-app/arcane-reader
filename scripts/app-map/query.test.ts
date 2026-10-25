import { describe, expect, it } from 'vitest';
import {
  apiPathMatches,
  formatScreen,
  screenPathMatches,
  visualForScreen,
  visualHrefForHtml,
  visualHrefForViewport,
} from './query.js';
import type { AppMap } from './types.js';

const map: AppMap = {
  generatedBy: 'npm run docs:app-map',
  product: { name: 'Arcane Reader', tagline: 'test' },
  areas: [],
  roles: [],
  spines: { guest: [], user: [], author: [], admin: [] },
  warnings: [],
  shell: { calls: [], navigatesTo: [] },
  screens: [
    {
      path: '/p/:publicationId',
      component: 'PublicationPage',
      file: 'src/client/pages/PublicationPage.tsx',
      access: 'guest',
      areaId: 'reading',
      title: 'Public publication page',
      navigatesTo: ['/'],
      calls: [
        {
          clientFn: 'getPublicationWithChapters',
          method: 'GET',
          path: '/api/publications/:id/chapters',
          callers: ['src/client/pages/PublicationPage.tsx'],
        },
      ],
    },
    {
      path: '/',
      component: 'CatalogPage',
      file: 'src/client/pages/HomePage.tsx',
      access: 'guest',
      areaId: 'catalog',
      title: 'Main catalog',
      navigatesTo: [],
      calls: [],
    },
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/api/publications/:publicationId/chapters',
      handler: 'handleGetPublicationChapters',
      handlerFile: 'src/api/routes/handlers/publicationRouteHandlers.ts',
      services: ['supabaseDatabase.listPublicationChapters'],
      tags: [],
    },
  ],
};

describe('app map query', () => {
  it('matches a concrete publication url to the screen pattern', () => {
    expect(screenPathMatches('/p/abc', '/p/:publicationId')).toBe(true);
    expect(screenPathMatches('/p', '/p/:publicationId')).toBe(false);
  });

  it('matches an API prefix and a renamed param', () => {
    expect(apiPathMatches('/api/publications', '/api/publications/:id/chapters')).toBe(true);
    expect(
      apiPathMatches('/api/publications/:id/chapters', '/api/publications/:publicationId/chapters')
    ).toBe(true);
    expect(apiPathMatches('/api/projects', '/api/publications/:id')).toBe(false);
  });

  it('prints the screen, its neighbor, and the handler without the neighbor calls', () => {
    const text = formatScreen(map, '/p/abc');
    expect(text).toContain('/p/:publicationId');
    expect(text).toContain('/ — Main catalog');
    expect(text).toContain('handleGetPublicationChapters');
    expect(text).toContain('guest-publication-desktop.png');
    expect(text).not.toContain('CatalogPage');
  });

  it('points a news article at its desktop shell and leaves legal pages without one', () => {
    expect(visualForScreen('/news/:slugOrId')).toContain('guest-news-article-desktop.png');
    expect(visualHrefForHtml('/news/:slugOrId')).toBe(
      '../../../tests/e2e/specs/guest.visual.spec.ts-snapshots/guest-news-article-desktop.png'
    );
    expect(visualHrefForViewport('/news/:slugOrId', 'phone')).toBe(
      '../../../tests/e2e/specs/guest.visual.spec.ts-snapshots/guest-news-article-phone.png'
    );
    expect(visualHrefForViewport('/news/:slugOrId', 'tablet')).toContain(
      'guest-news-article-tablet.png'
    );
    expect(visualHrefForViewport('/contact', 'phone')).toBeNull();
    expect(visualForScreen('/contact')).toBe('none');
    expect(visualForScreen('/privacy')).toBe('none');
    expect(visualForScreen('/admin/projects')).toBe('none');
  });
});
