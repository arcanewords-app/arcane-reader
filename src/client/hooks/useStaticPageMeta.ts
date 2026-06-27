/**
 * Updates document head for static public pages on SPA navigation.
 * Direct loads rely on SSR in server.ts; this hook keeps meta in sync after in-app routing.
 */

import { useEffect } from 'preact/hooks';
import { STATIC_PAGE_META, staticPageDocumentTitle } from '../../shared/staticPageMeta';

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
    const base = STATIC_PAGE_META[pathname];
    if (!base && !options?.title) return;

    const title = options?.title ?? base?.title ?? DEFAULT_TITLE;
    const description = options?.description ?? base?.description ?? DEFAULT_DESCRIPTION;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pageUrl = `${origin}${pathname}`;
    const canonicalPath = options?.canonicalPath ?? (pathname === '/catalog' ? '/' : pathname);
    const canonicalUrl = `${origin}${canonicalPath}`;
    const img = `${origin}/arcane_icon.png`;

    document.title = staticPageDocumentTitle(title);
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:url', pageUrl);
    setCanonical(canonicalUrl);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', img);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('name', 'description', DEFAULT_DESCRIPTION);
      setCanonical(typeof window !== 'undefined' ? window.location.href : canonicalUrl);
      setMeta('property', 'og:title', DEFAULT_TITLE);
      setMeta(
        'property',
        'og:description',
        'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн.'
      );
      setMeta('property', 'og:image', img);
      setMeta('property', 'og:url', typeof window !== 'undefined' ? window.location.href : pageUrl);
      setMeta('name', 'twitter:title', DEFAULT_TITLE);
      setMeta(
        'name',
        'twitter:description',
        'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн.'
      );
      setMeta('name', 'twitter:image', img);
    };
  }, [pathname, options?.title, options?.description, options?.canonicalPath]);
}
