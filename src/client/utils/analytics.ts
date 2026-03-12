declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let gaInitialized = false;

export function initGA(measurementId: string): void {
  if (gaInitialized || typeof window === 'undefined') return;
  gaInitialized = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.gtag('config', measurementId, {
    anonymize_ip: true,
    cookie_flags: 'SameSite=None;Secure',
  });
}

export function trackPageView(path: string, title?: string): void {
  if (!window.gtag || !gaInitialized) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!window.gtag || !gaInitialized) return;

  window.gtag('event', name, params);
}

export function setupRouteChangeListener(): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<{ url: string }>;
    const url = customEvent.detail?.url ?? '';
    const path = url.split('?')[0] || '/';
    trackPageView(path);
  };

  window.addEventListener('arcane:route-change', handler);
  return () => window.removeEventListener('arcane:route-change', handler);
}
