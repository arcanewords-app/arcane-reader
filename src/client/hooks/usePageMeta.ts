/**
 * Updates document head (title, meta tags) for publication pages.
 * Needed because SPA client-side navigation never reloads the document —
 * the server only gets a request on direct load/refresh.
 */

import { useEffect } from 'preact/hooks';

const DEFAULT_TITLE = 'Arcane — Переводчик новелл';
const DEFAULT_DESCRIPTION =
  'Arcane — веб-интерфейс для перевода новелл с поддержкой глоссария и AI. Импорт EPUB, FB2, TXT.';

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export interface PageMeta {
  title: string;
  description: string;
  imageUrl?: string | null;
}

/**
 * Updates document.title and meta tags (description, og:*, twitter:*).
 * On unmount, restores defaults so catalog/home shows correct meta.
 */
export function usePageMeta(meta: PageMeta | null): void {
  useEffect(() => {
    if (!meta) return;

    const prevTitle = document.title;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const img =
      meta.imageUrl && meta.imageUrl.startsWith('http')
        ? meta.imageUrl
        : `${origin}/arcane_icon.png`;

    document.title = `${meta.title} — Arcane`;
    setMeta('name', 'description', meta.description);
    setMeta('property', 'og:title', meta.title);
    setMeta('property', 'og:description', meta.description);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:title', meta.title);
    setMeta('name', 'twitter:description', meta.description);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('name', 'description', DEFAULT_DESCRIPTION);
      setMeta('property', 'og:title', DEFAULT_TITLE);
      setMeta(
        'property',
        'og:description',
        'Веб-интерфейс для перевода новелл с AI и глоссарием. Импорт EPUB, FB2, TXT.'
      );
      setMeta('property', 'og:image', `${origin}/arcane_icon.png`);
      setMeta('property', 'og:url', typeof window !== 'undefined' ? window.location.href : url);
      setMeta('name', 'twitter:title', DEFAULT_TITLE);
      setMeta(
        'name',
        'twitter:description',
        'Веб-интерфейс для перевода новелл с AI и глоссарием.'
      );
    };
  }, [meta?.title, meta?.description, meta?.imageUrl]);
}
