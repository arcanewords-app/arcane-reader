/**
 * Updates document head for static public pages on SPA navigation.
 * Direct loads rely on SSR in server.ts; this hook keeps meta in sync after in-app routing.
 */

import { useEffect } from 'preact/hooks';
import {
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
  resolveStaticPageMetaFields,
  staticDocumentTitle,
} from '../utils/pageMetaCore.js';

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

export interface StaticPageMetaOptions {
  /** Override title (e.g. i18n); falls back to STATIC_PAGE_META[pathname] */
  title?: string;
  description?: string;
  /** Canonical URL; defaults to origin + pathname (catalog → /) */
  canonicalPath?: string;
}

/**
 * Apply SEO meta for a static route pathname (e.g. `/about`, `/news`).
 */
export function useStaticPageMeta(pathname: string, options?: StaticPageMetaOptions | null): void {
  useEffect(() => {
    const fields = resolveStaticPageMetaFields(pathname, options);
    if (!fields) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pageUrl = `${origin}${fields.pageUrlPath}`;
    const canonicalUrl = `${origin}${fields.canonicalPath}`;
    const img = `${origin}/arcane_icon.png`;

    document.title = staticDocumentTitle(fields.title);
    setMeta('name', 'description', fields.description);
    setMeta('property', 'og:title', fields.title);
    setMeta('property', 'og:description', fields.description);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:url', pageUrl);
    setCanonical(canonicalUrl);
    setMeta('name', 'twitter:title', fields.title);
    setMeta('name', 'twitter:description', fields.description);
    setMeta('name', 'twitter:image', img);

    return () => {
      document.title = DEFAULT_PAGE_TITLE;
      setMeta('name', 'description', DEFAULT_PAGE_DESCRIPTION);
      setCanonical(typeof window !== 'undefined' ? window.location.href : canonicalUrl);
      setMeta('property', 'og:title', DEFAULT_PAGE_TITLE);
      setMeta('property', 'og:description', DEFAULT_OG_DESCRIPTION);
      setMeta('property', 'og:image', img);
      setMeta('property', 'og:url', typeof window !== 'undefined' ? window.location.href : pageUrl);
      setMeta('name', 'twitter:title', DEFAULT_PAGE_TITLE);
      setMeta('name', 'twitter:description', DEFAULT_OG_DESCRIPTION);
      setMeta('name', 'twitter:image', img);
    };
  }, [pathname, options?.title, options?.description, options?.canonicalPath]);
}
