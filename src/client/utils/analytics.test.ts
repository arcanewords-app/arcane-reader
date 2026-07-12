import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { mockOnCLS, mockOnINP, mockOnLCP } = vi.hoisted(() => ({
  mockOnCLS: vi.fn(),
  mockOnINP: vi.fn(),
  mockOnLCP: vi.fn(),
}));

vi.mock('web-vitals', () => ({
  onCLS: (...args: unknown[]) => mockOnCLS(...args),
  onINP: (...args: unknown[]) => mockOnINP(...args),
  onLCP: (...args: unknown[]) => mockOnLCP(...args),
}));

function makeWindow() {
  const dataLayer: unknown[] = [];
  const listeners: Record<string, (e: Event) => void> = {};
  const windowStub = {
    dataLayer,
    addEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
      listeners[event] = handler;
    }),
    removeEventListener: vi.fn(),
    dispatchRouteChange: (url: string) => {
      listeners['arcane:route-change']?.(
        new CustomEvent('arcane:route-change', { detail: { url } })
      );
    },
  };
  return { windowStub, dataLayer, listeners };
}

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('document', {
      title: 'Arcane Reader',
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => ({ async: true, src: '' })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('initWebVitals registers CLS, INP, and LCP handlers', async () => {
    vi.stubGlobal('window', {});
    const { initWebVitals } = await import('./analytics.js');
    initWebVitals();
    assert.equal(mockOnCLS.mock.calls.length, 1);
    assert.equal(mockOnINP.mock.calls.length, 1);
    assert.equal(mockOnLCP.mock.calls.length, 1);
  });

  it('initGA configures measurement id once', async () => {
    const { windowStub, dataLayer } = makeWindow();
    vi.stubGlobal('window', windowStub);
    const { initGA } = await import('./analytics.js');
    initGA('G-TEST');
    initGA('G-TEST');
    assert.equal(dataLayer.filter((c) => Array.isArray(c) && c[0] === 'js').length, 1);
    assert.ok(dataLayer.some((c) => Array.isArray(c) && c[0] === 'config' && c[1] === 'G-TEST'));
  });

  it('trackPageView sends page_view after init', async () => {
    const { windowStub, dataLayer } = makeWindow();
    vi.stubGlobal('window', windowStub);
    const { initGA, trackPageView } = await import('./analytics.js');
    initGA('G-TEST');
    trackPageView('/projects', 'Projects');
    const pageView = dataLayer.find(
      (c) => Array.isArray(c) && c[0] === 'event' && c[1] === 'page_view'
    );
    assert.ok(pageView);
    assert.deepEqual((pageView as unknown[])[2], {
      page_path: '/projects',
      page_title: 'Projects',
    });
  });

  it('trackEvent is no-op before initGA', async () => {
    const { windowStub, dataLayer } = makeWindow();
    vi.stubGlobal('window', windowStub);
    const { trackEvent } = await import('./analytics.js');
    trackEvent('test_event', { foo: 'bar' });
    assert.equal(dataLayer.length, 0);
  });

  it('tracks announcement lifecycle events', async () => {
    const { windowStub, dataLayer } = makeWindow();
    vi.stubGlobal('window', windowStub);
    const { initGA, trackAnnouncementView, trackAnnouncementCtaClick, trackAnnouncementDismiss } =
      await import('./analytics.js');
    initGA('G-TEST');
    const alert = { id: 'a1', variant: 'info', contentVersion: 2 };
    trackAnnouncementView(alert);
    trackAnnouncementCtaClick({ ...alert, ctaUrl: '/news' });
    trackAnnouncementDismiss(alert);
    assert.ok(dataLayer.some((c) => Array.isArray(c) && c[1] === 'announcement_view'));
    assert.ok(dataLayer.some((c) => Array.isArray(c) && c[1] === 'announcement_cta_click'));
    assert.ok(dataLayer.some((c) => Array.isArray(c) && c[1] === 'announcement_dismiss'));
  });

  it('setupRouteChangeListener tracks page view on route change', async () => {
    const { windowStub, dataLayer } = makeWindow();
    vi.stubGlobal('window', windowStub);
    const { initGA, setupRouteChangeListener } = await import('./analytics.js');
    initGA('G-TEST');
    setupRouteChangeListener();
    windowStub.dispatchRouteChange('/projects?tab=1');
    assert.ok(dataLayer.some((c) => Array.isArray(c) && c[0] === 'event' && c[1] === 'page_view'));
  });
});
