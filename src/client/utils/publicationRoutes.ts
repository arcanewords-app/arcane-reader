export type PublicationTranslationFilter = 'translated' | 'all' | 'untranslated';
export type PublicationReadFilter = 'all' | 'unread' | 'read';
export type PublicationChapterOrder = 'asc' | 'desc';

export interface PublicationChapterListQuery {
  q: string;
  translation: PublicationTranslationFilter;
  read: PublicationReadFilter;
  order: PublicationChapterOrder;
}

export const DEFAULT_PUBLICATION_CHAPTER_QUERY: PublicationChapterListQuery = {
  q: '',
  translation: 'translated',
  read: 'all',
  order: 'asc',
};

function isTranslationFilter(value: string | null): value is PublicationTranslationFilter {
  return value === 'translated' || value === 'all' || value === 'untranslated';
}

function isReadFilter(value: string | null): value is PublicationReadFilter {
  return value === 'all' || value === 'unread' || value === 'read';
}

/** Publication catalog page `/p/:id` — not chapter reading. */
export function isPublicationCatalogPath(pathname: string): boolean {
  return /^\/p\/[^/]+$/.test(pathname);
}

export function getPublicationPathFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/p\/([^/]+)$/);
  return match ? match[1] : null;
}

export function parsePublicationChapterQueryFromUrl(): PublicationChapterListQuery {
  if (typeof window === 'undefined') return { ...DEFAULT_PUBLICATION_CHAPTER_QUERY };
  const params = new URLSearchParams(window.location.search);
  const translation = params.get('translation');
  const read = params.get('read');
  const order = params.get('order');
  return {
    q: params.get('q') ?? '',
    translation: isTranslationFilter(translation) ? translation : 'translated',
    read: isReadFilter(read) ? read : 'all',
    order: order === 'desc' ? 'desc' : 'asc',
  };
}

/** Guests cannot use read/unread filters — strip from query for URL and state. */
export function sanitizePublicationChapterQueryForAuth(
  query: PublicationChapterListQuery,
  isAuthenticated: boolean
): PublicationChapterListQuery {
  if (isAuthenticated || query.read === 'all') return query;
  return { ...query, read: 'all' };
}

export function buildPublicationPageUrl(
  publicationPath: string,
  query: PublicationChapterListQuery
): string {
  const params = new URLSearchParams();
  const q = query.q.trim();
  if (q) params.set('q', q);
  if (query.translation !== 'translated') params.set('translation', query.translation);
  if (query.read !== 'all') params.set('read', query.read);
  if (query.order !== 'asc') params.set('order', query.order);
  const qs = params.toString();
  return qs ? `/p/${publicationPath}?${qs}` : `/p/${publicationPath}`;
}
