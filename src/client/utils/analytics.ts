import { onCLS, onINP, onLCP } from 'web-vitals';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let gaInitialized = false;

export type ReadingAnalyticsMode = 'public' | 'author';

function sendWebVitalsToGA(metric: {
  name: string;
  value: number;
  id: string;
  delta: number;
}): void {
  if (!window.gtag || !gaInitialized) return;
  const value = metric.name === 'CLS' ? Math.round(metric.value * 1000) : Math.round(metric.value);
  window.gtag('event', metric.name, {
    event_category: 'Web Vitals',
    value,
    event_label: metric.id,
    non_interaction: true,
  });
}

export function initWebVitals(): void {
  if (typeof window === 'undefined') return;
  onCLS(sendWebVitalsToGA);
  onINP(sendWebVitalsToGA);
  onLCP(sendWebVitalsToGA);
}

export function initGA(measurementId: string): void {
  if (gaInitialized || typeof window === 'undefined') return;
  gaInitialized = true;

  if (import.meta.env.DEV) {
    console.info('[analytics] GA4 initialized', measurementId);
  }

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
    send_page_view: false,
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

export function trackReadingStart(params: {
  mode: ReadingAnalyticsMode;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
  chapterNumber: number;
}): void {
  trackEvent('reading_start', {
    mode: params.mode,
    publication_id: params.publicationId,
    project_id: params.projectId,
    chapter_id: params.chapterId,
    chapter_number: params.chapterNumber,
  });
}

export function trackChapterComplete(params: {
  mode: ReadingAnalyticsMode;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
  chapterNumber: number;
}): void {
  trackEvent('chapter_complete', {
    mode: params.mode,
    publication_id: params.publicationId,
    project_id: params.projectId,
    chapter_id: params.chapterId,
    chapter_number: params.chapterNumber,
  });
}

export function trackReadingEngagement(params: {
  mode: ReadingAnalyticsMode;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
  scrollPercent: number;
}): void {
  trackEvent('scroll_depth', {
    mode: params.mode,
    publication_id: params.publicationId,
    project_id: params.projectId,
    chapter_id: params.chapterId,
    scroll_percent: params.scrollPercent,
  });
}

export function trackAnnouncementView(alert: {
  id: string;
  variant: string;
  contentVersion: number;
}): void {
  trackEvent('announcement_view', {
    announcement_id: alert.id,
    variant: alert.variant,
    content_version: alert.contentVersion,
  });
}

export function trackAnnouncementCtaClick(alert: {
  id: string;
  variant: string;
  contentVersion: number;
  ctaUrl: string;
}): void {
  trackEvent('announcement_cta_click', {
    announcement_id: alert.id,
    variant: alert.variant,
    content_version: alert.contentVersion,
    cta_url: alert.ctaUrl,
  });
}

export function trackAnnouncementDismiss(alert: {
  id: string;
  variant: string;
  contentVersion: number;
}): void {
  trackEvent('announcement_dismiss', {
    announcement_id: alert.id,
    variant: alert.variant,
    content_version: alert.contentVersion,
  });
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
