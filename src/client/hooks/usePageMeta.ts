/**
 * Updates document head (title, meta tags) for publication and news pages.
 * Needed because SPA client-side navigation never reloads the document —
 * the server only gets a request on direct load/refresh.
 */

import { useEffect } from 'preact/hooks';
import {
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
  buildBookSchema,
  buildBreadcrumbSchema,
  buildNewsArticleSchema,
  resolveDocumentTitle,
  resolveMetaImageUrl,
  type BreadcrumbItem,
  type PageMetaInput,
} from '../utils/pageMetaCore.js';

export type { BreadcrumbItem };
export type PageMeta = PageMetaInput;

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

function upsertJsonLd(key: string, schema: Record<string, unknown>): void {
  let jsonLdEl = document.querySelector(`script[data-arcane-jsonld="${key}"]`);
  if (!jsonLdEl) {
    jsonLdEl = document.createElement('script');
    jsonLdEl.setAttribute('type', 'application/ld+json');
    jsonLdEl.setAttribute('data-arcane-jsonld', key);
    document.head.appendChild(jsonLdEl);
  }
  jsonLdEl.textContent = JSON.stringify(schema);
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
    const img = resolveMetaImageUrl(meta.imageUrl, origin);

    document.title = resolveDocumentTitle(meta);
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
      upsertJsonLd(
        jsonLdKey,
        buildNewsArticleSchema({
          title: meta.title,
          description: meta.description,
          url,
          image: img,
          origin,
          datePublished: meta.datePublished,
          dateModified: meta.dateModified,
        })
      );
    } else {
      upsertJsonLd(
        jsonLdKey,
        buildBookSchema({
          title: meta.title,
          description: meta.description,
          url,
          image: img,
          authorDisplay: meta.authorDisplay,
          translatorDisplay: meta.translatorDisplay,
          targetLanguage: meta.targetLanguage,
          numberOfPages: meta.numberOfPages,
        })
      );
    }

    if (meta.breadcrumbs && meta.breadcrumbs.length > 0) {
      upsertJsonLd('breadcrumb', buildBreadcrumbSchema(meta.breadcrumbs));
    }

    return () => {
      document.title = DEFAULT_PAGE_TITLE;
      setMeta('name', 'description', DEFAULT_PAGE_DESCRIPTION);
      setCanonical(typeof window !== 'undefined' ? window.location.href : url);
      setMeta('property', 'og:title', DEFAULT_PAGE_TITLE);
      setMeta('property', 'og:description', DEFAULT_OG_DESCRIPTION);
      setMeta('property', 'og:image', `${origin}/arcane_icon.png`);
      setMeta('property', 'og:url', typeof window !== 'undefined' ? window.location.href : url);
      setMeta('name', 'twitter:title', DEFAULT_PAGE_TITLE);
      setMeta('name', 'twitter:description', DEFAULT_OG_DESCRIPTION);
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
