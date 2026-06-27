/**
 * Updates document head (title, meta tags) for publication and news pages.
 * Needed because SPA client-side navigation never reloads the document —
 * the server only gets a request on direct load/refresh.
 */

import { useEffect } from 'preact/hooks';
import { staticPageDocumentTitle } from '../../shared/staticPageMeta';

const DEFAULT_TITLE = 'Arcane — Переводчик новелл';
const DEFAULT_DESCRIPTION =
  'Arcane — библиотека переводов новелл на русский и беларусский. Читайте и скачивайте переводы онлайн. Переводчик с AI и глоссарием. Импорт EPUB, FB2, TXT.';

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url: string): void {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface PageMeta {
  title: string;
  description: string;
  imageUrl?: string | null;
  /** Chapter page uses shorter title suffix */
  isChapter?: boolean;
  /** Publication Book schema (default) or NewsArticle when 'news' */
  schemaType?: 'book' | 'news';
  /** For JSON-LD Book schema */
  authorDisplay?: string | null;
  translatorDisplay?: string | null;
  targetLanguage?: string;
  numberOfPages?: number;
  /** For JSON-LD NewsArticle */
  datePublished?: string | null;
  dateModified?: string;
  /** For JSON-LD BreadcrumbList */
  breadcrumbs?: BreadcrumbItem[];
}

/**
 * Updates document.title and meta tags (description, og:*, twitter:*).
 * On unmount, restores defaults so catalog/home shows correct meta.
 */
export function usePageMeta(meta: PageMeta | null): void {
  useEffect(() => {
    if (!meta) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const img =
      meta.imageUrl && meta.imageUrl.startsWith('http')
        ? meta.imageUrl
        : `${origin}/arcane_icon.png`;

    const titleSuffix = meta.isChapter
      ? ' — Arcane'
      : meta.schemaType === 'news'
        ? ''
        : ' — читать онлайн | Arcane';
    document.title =
      meta.schemaType === 'news'
        ? staticPageDocumentTitle(meta.title)
        : `${meta.title}${titleSuffix}`;
    setMeta('name', 'description', meta.description);
    setMeta('property', 'og:title', meta.title);
    setMeta('property', 'og:description', meta.description);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:url', url);
    setCanonical(url);
    setMeta('name', 'twitter:title', meta.title);
    setMeta('name', 'twitter:description', meta.description);
    setMeta('name', 'twitter:image', img);

    const schemaType = meta.schemaType ?? 'book';
    const jsonLdKey = schemaType === 'news' ? 'news' : 'book';

    if (schemaType === 'news') {
      const articleSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: meta.title,
        description: meta.description,
        url,
        image: img,
        publisher: {
          '@type': 'Organization',
          name: 'Arcane',
          url: origin,
        },
        ...(meta.dateModified && { dateModified: meta.dateModified }),
        ...(meta.datePublished && { datePublished: meta.datePublished }),
      };
      let jsonLdEl = document.querySelector(`script[data-arcane-jsonld="${jsonLdKey}"]`);
      if (!jsonLdEl) {
        jsonLdEl = document.createElement('script');
        jsonLdEl.setAttribute('type', 'application/ld+json');
        jsonLdEl.setAttribute('data-arcane-jsonld', jsonLdKey);
        document.head.appendChild(jsonLdEl);
      }
      jsonLdEl.textContent = JSON.stringify(articleSchema);
    } else {
      const bookSchema = {
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: meta.title,
        description: meta.description,
        url,
        image: img,
        ...(meta.authorDisplay && { author: { '@type': 'Person', name: meta.authorDisplay } }),
        ...(meta.translatorDisplay && {
          translator: { '@type': 'Person', name: meta.translatorDisplay },
        }),
        ...(meta.targetLanguage && { inLanguage: meta.targetLanguage }),
        ...(meta.numberOfPages != null &&
          meta.numberOfPages > 0 && { numberOfPages: meta.numberOfPages }),
      };
      let jsonLdEl = document.querySelector(`script[data-arcane-jsonld="${jsonLdKey}"]`);
      if (!jsonLdEl) {
        jsonLdEl = document.createElement('script');
        jsonLdEl.setAttribute('type', 'application/ld+json');
        jsonLdEl.setAttribute('data-arcane-jsonld', jsonLdKey);
        document.head.appendChild(jsonLdEl);
      }
      jsonLdEl.textContent = JSON.stringify(bookSchema);
    }

    if (meta.breadcrumbs && meta.breadcrumbs.length > 0) {
      const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: meta.breadcrumbs.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      };
      let breadcrumbEl = document.querySelector('script[data-arcane-jsonld="breadcrumb"]');
      if (!breadcrumbEl) {
        breadcrumbEl = document.createElement('script');
        breadcrumbEl.setAttribute('type', 'application/ld+json');
        breadcrumbEl.setAttribute('data-arcane-jsonld', 'breadcrumb');
        document.head.appendChild(breadcrumbEl);
      }
      breadcrumbEl.textContent = JSON.stringify(breadcrumbSchema);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('name', 'description', DEFAULT_DESCRIPTION);
      setCanonical(typeof window !== 'undefined' ? window.location.href : url);
      setMeta('property', 'og:title', DEFAULT_TITLE);
      setMeta(
        'property',
        'og:description',
        'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн.'
      );
      setMeta('property', 'og:image', `${origin}/arcane_icon.png`);
      setMeta('property', 'og:url', typeof window !== 'undefined' ? window.location.href : url);
      setMeta('name', 'twitter:title', DEFAULT_TITLE);
      setMeta(
        'name',
        'twitter:description',
        'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн.'
      );
      setMeta('name', 'twitter:image', `${origin}/arcane_icon.png`);
      const bookEl = document.querySelector('script[data-arcane-jsonld="book"]');
      if (bookEl) bookEl.remove();
      const newsEl = document.querySelector('script[data-arcane-jsonld="news"]');
      if (newsEl) newsEl.remove();
      const breadcrumbEl = document.querySelector('script[data-arcane-jsonld="breadcrumb"]');
      if (breadcrumbEl) breadcrumbEl.remove();
    };
  }, [
    meta?.title,
    meta?.description,
    meta?.imageUrl,
    meta?.schemaType,
    meta?.authorDisplay,
    meta?.translatorDisplay,
    meta?.targetLanguage,
    meta?.numberOfPages,
    meta?.datePublished,
    meta?.dateModified,
    meta?.breadcrumbs,
  ]);
}
