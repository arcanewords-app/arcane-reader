import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppMap } from './extract.js';
import {
  featureTitle,
  joinUrlParts,
  parseRouteDescriptions,
  roleAtLeast,
  segmentsMatch,
  shapeKey,
  splitMarkdownRow,
  splitPath,
} from './normalize.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('app map paths', () => {
  it('drops the query and names params from a template', () => {
    expect(
      joinUrlParts('/api/projects/', [
        { expr: 'projectId', literal: '/search?' },
        { expr: 'params', literal: '' },
      ])
    ).toBe('/api/projects/:projectId/search');
  });

  it('drops a trailing qs expression that is only the query string', () => {
    expect(
      joinUrlParts('/api/publications/', [
        { expr: 'id', literal: '/chapters' },
        { expr: 'qs', literal: '' },
      ])
    ).toBe('/api/publications/:id/chapters');
  });

  it('stops when the template expression builds a query string', () => {
    expect(joinUrlParts('/api/admin/news', [{ expr: "qs ? `?${qs}` : ''", literal: '' }])).toBe(
      '/api/admin/news'
    );
  });

  it('matches server and client params with different names', () => {
    expect(
      segmentsMatch(splitPath('/api/projects/:id'), splitPath('/api/projects/:projectId'))
    ).toBe(true);
    expect(shapeKey('get', '/api/projects/:id')).toBe(shapeKey('GET', '/api/projects/:projectId'));
    expect(segmentsMatch(splitPath('/projects'), splitPath('/projects/:projectId'))).toBe(false);
  });

  it('reads a route description, including escaped pipes', () => {
    const markdown = `
## Frontend Routes

| Path | Access | Component | Description |
|------|--------|-----------|-------------|
| \`/profile\` | user+ | ProfilePage | Profile: tabs. Query: \`a\` \\| \`b\` |

## API Routes
`;
    expect(
      splitMarkdownRow('| `/profile` | user+ | ProfilePage | Profile: tabs. Query: `a` \\| `b` |')
    ).toEqual(['`/profile`', 'user+', 'ProfilePage', 'Profile: tabs. Query: `a` | `b`']);
    expect(parseRouteDescriptions(markdown).get('/profile')).toContain('tabs');
    expect(featureTitle('Main catalog. Extra detail.', 'CatalogPage')).toBe('Main catalog');
  });

  it('lets a guest see only guest screens', () => {
    expect(roleAtLeast('guest', 'guest')).toBe(true);
    expect(roleAtLeast('author', 'guest')).toBe(false);
    expect(roleAtLeast('guest', 'author')).toBe(true);
  });
});

describe('committed app map', () => {
  it('matches a fresh extract — run npm run docs:app-map if this fails', () => {
    const fresh = buildAppMap(root);
    const committed = JSON.parse(
      readFileSync(join(root, 'docs/01-reference/app-map/app-map.json'), 'utf8')
    ) as unknown;
    expect(committed).toEqual(fresh);
  }, 60_000);
});
