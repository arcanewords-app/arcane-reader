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

export function buildCatalogUrl(filter: CatalogFilter, entityFilter: CatalogEntityFilter): string {
  const params = new URLSearchParams();
  if (filter === 'mine') params.set('filter', 'mine');
  if (entityFilter.author) params.set('author', entityFilter.author);
  if (entityFilter.translator) params.set('translator', entityFilter.translator);
  if (entityFilter.tag) params.set('tag', entityFilter.tag);
  const q = params.toString();
  return q ? `/catalog?${q}` : '/catalog';
}

export function buildCatalogUrlFromState(state: CatalogUrlState): string {
  return buildCatalogUrl(state.filter, state.entityFilter);
}
