/**
 * Pure helpers for client-side document meta / JSON-LD construction.
 */

import { STATIC_PAGE_META, staticPageDocumentTitle } from '../../shared/staticPageMeta.js';

export const DEFAULT_PAGE_TITLE = 'Arcane — Переводчик новелл';
export const DEFAULT_PAGE_DESCRIPTION =
  'Arcane — библиотека переводов новелл на русский и беларусский. Читайте и скачивайте переводы онлайн. Переводчик с AI и глоссарием. Импорт EPUB, FB2, TXT.';
export const DEFAULT_OG_DESCRIPTION =
  'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн.';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface PageMetaInput {
  title: string;
  description: string;
  imageUrl?: string | null;
  isChapter?: boolean;
  schemaType?: 'book' | 'news';
  authorDisplay?: string | null;
  translatorDisplay?: string | null;
  targetLanguage?: string;
  numberOfPages?: number;
  datePublished?: string | null;
  dateModified?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export function resolveMetaImageUrl(imageUrl: string | null | undefined, origin: string): string {
  if (imageUrl && imageUrl.startsWith('http')) return imageUrl;
  return `${origin}/arcane_icon.png`;
}

export function resolveDocumentTitle(
  meta: Pick<PageMetaInput, 'title' | 'isChapter' | 'schemaType'>
): string {
  if (meta.schemaType === 'news') {
    return staticPageDocumentTitle(meta.title);
  }
  const titleSuffix = meta.isChapter ? ' — Arcane' : ' — читать онлайн | Arcane';
  return `${meta.title}${titleSuffix}`;
}

export function buildNewsArticleSchema(input: {
  title: string;
  description: string;
  url: string;
  image: string;
  origin: string;
  datePublished?: string | null;
  dateModified?: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.title,
    description: input.description,
    url: input.url,
    image: input.image,
    publisher: {
      '@type': 'Organization',
      name: 'Arcane',
      url: input.origin,
    },
    ...(input.dateModified && { dateModified: input.dateModified }),
    ...(input.datePublished && { datePublished: input.datePublished }),
  };
}

export function buildBookSchema(input: {
  title: string;
  description: string;
  url: string;
  image: string;
  authorDisplay?: string | null;
  translatorDisplay?: string | null;
  targetLanguage?: string;
  numberOfPages?: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: input.title,
    description: input.description,
    url: input.url,
    image: input.image,
    ...(input.authorDisplay && { author: { '@type': 'Person', name: input.authorDisplay } }),
    ...(input.translatorDisplay && {
      translator: { '@type': 'Person', name: input.translatorDisplay },
    }),
    ...(input.targetLanguage && { inLanguage: input.targetLanguage }),
    ...(input.numberOfPages != null &&
      input.numberOfPages > 0 && { numberOfPages: input.numberOfPages }),
  };
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function resolveStaticPageMetaFields(
  pathname: string,
  options?: {
    title?: string;
    description?: string;
    canonicalPath?: string;
  } | null
): {
  title: string;
  description: string;
  pageUrlPath: string;
  canonicalPath: string;
} | null {
  const base = STATIC_PAGE_META[pathname];
  if (!base && !options?.title) return null;
  const title = options?.title ?? base?.title ?? DEFAULT_PAGE_TITLE;
  const description = options?.description ?? base?.description ?? DEFAULT_PAGE_DESCRIPTION;
  const canonicalPath = options?.canonicalPath ?? (pathname === '/catalog' ? '/' : pathname);
  return {
    title,
    description,
    pageUrlPath: pathname,
    canonicalPath,
  };
}

export function staticDocumentTitle(title: string): string {
  return staticPageDocumentTitle(title);
}
