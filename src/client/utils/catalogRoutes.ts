export type CatalogFilter = 'all' | 'mine';

export interface CatalogEntityFilter {
  author?: string;
  translator?: string;
  tag?: string;
}

export interface CatalogUrlState {
  filter: CatalogFilter;
  entityFilter: CatalogEntityFilter;
}

export function parseCatalogFilterFromUrl(): CatalogFilter {
  if (typeof window === 'undefined') return 'all';
  const params = new URLSearchParams(window.location.search);
  return params.get('filter') === 'mine' ? 'mine' : 'all';
}

export function parseCatalogEntityFilterFromUrl(): CatalogEntityFilter {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const author = params.get('author') || undefined;
  const translator = params.get('translator') || undefined;
  const tag = params.get('tag') || undefined;
  return { author, translator, tag };
}

export function parseCatalogUrlState(): CatalogUrlState {
  return {
    filter: parseCatalogFilterFromUrl(),
    entityFilter: parseCatalogEntityFilterFromUrl(),
  };
}

export function isCatalogPath(pathname: string): boolean {
  return pathname === '/catalog' || pathname === '/';
}

/** Preserves `/` vs `/catalog` on in-catalog navigation; defaults to `/catalog` from other pages. */
export function getCatalogBasePath(pathname?: string): string {
  if (pathname !== undefined) {
    if (pathname === '/') return '/';
    if (pathname === '/catalog') return '/catalog';
    return '/catalog';
  }
  if (typeof window === 'undefined') return '/catalog';
  const path = window.location.pathname;
  if (path === '/') return '/';
  if (path === '/catalog') return '/catalog';
  return '/catalog';
}

/** Guests and non-authors cannot use the mine tab — strip from URL and state. */
export function sanitizeCatalogUrlStateForAuth(
  state: CatalogUrlState,
  isAuthor: boolean
): CatalogUrlState {
  if (isAuthor || state.filter !== 'mine') return state;
  return { ...state, filter: 'all' };
}

export function buildCatalogUrl(
  filter: CatalogFilter,
  entityFilter: CatalogEntityFilter,
  basePath?: string
): string {
  const base = getCatalogBasePath(basePath);
  const params = new URLSearchParams();
  if (filter === 'mine') params.set('filter', 'mine');
  if (entityFilter.author) params.set('author', entityFilter.author);
  if (entityFilter.translator) params.set('translator', entityFilter.translator);
  if (entityFilter.tag) params.set('tag', entityFilter.tag);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function buildCatalogUrlFromState(state: CatalogUrlState, basePath?: string): string {
  return buildCatalogUrl(state.filter, state.entityFilter, basePath);
}

export function buildCatalogEntityFilterUrl(
  entityKind: 'author' | 'translator' | 'tag',
  entityId: string,
  basePath?: string
): string {
  const entityFilter: CatalogEntityFilter = {};
  if (entityKind === 'author') entityFilter.author = entityId;
  else if (entityKind === 'translator') entityFilter.translator = entityId;
  else entityFilter.tag = entityId;
  return buildCatalogUrl('all', entityFilter, basePath);
}
