export type CatalogFilter = 'all' | 'mine';
export type CatalogSort = 'rating' | null;

export interface CatalogEntityFilter {
  author?: string;
  translator?: string;
  tag?: string;
}

export interface CatalogUrlState {
  filter: CatalogFilter;
  entityFilter: CatalogEntityFilter;
  sort: CatalogSort;
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
  if (typeof window === 'undefined') {
    return { filter: 'all', entityFilter: {}, sort: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    filter: parseCatalogFilterFromUrl(),
    entityFilter: parseCatalogEntityFilterFromUrl(),
    sort: params.get('sort') === 'rating' ? 'rating' : null,
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
  return buildCatalogUrlFromState({ filter, entityFilter, sort: null }, basePath);
}

export function buildCatalogUrlFromState(state: CatalogUrlState, basePath?: string): string {
  const base = getCatalogBasePath(basePath);
  const params = new URLSearchParams();
  if (state.filter === 'mine') params.set('filter', 'mine');
  if (state.entityFilter.author) params.set('author', state.entityFilter.author);
  if (state.entityFilter.translator) params.set('translator', state.entityFilter.translator);
  if (state.entityFilter.tag) params.set('tag', state.entityFilter.tag);
  if (state.sort === 'rating') params.set('sort', 'rating');
  const q = params.toString();
  return q ? `${base}?${q}` : base;
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
  return buildCatalogUrlFromState({ filter: 'all', entityFilter, sort: null }, basePath);
}
