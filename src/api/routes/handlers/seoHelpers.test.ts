import assert from 'node:assert/strict';
import type { Request } from 'express';
import { describe, it } from 'vitest';
import { staticPageDocumentTitle } from '../../../shared/staticPageMeta.js';
import {
  getPublicBaseUrl,
  injectBreadcrumbJsonLd,
  injectOrganizationJsonLd,
  injectPublicationJsonLd,
  injectPublicationMeta,
  injectStaticPageMeta,
} from './seoHelpers.js';

function mockRequest(opts: {
  protocol?: string;
  host?: string;
  xForwardedProto?: string;
  xForwardedHost?: string;
}): Request {
  const headers: Record<string, string | undefined> = {};
  if (opts.xForwardedProto !== undefined) headers['x-forwarded-proto'] = opts.xForwardedProto;
  if (opts.xForwardedHost !== undefined) headers['x-forwarded-host'] = opts.xForwardedHost;
  if (opts.host !== undefined) headers['host'] = opts.host;

  return {
    protocol: opts.protocol !== undefined ? opts.protocol : 'http',
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

/** Minimal index.html skeleton matching production meta layout. */
function sampleIndexHtml(): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <title>Default Title</title>
    <meta name="description" content="default description" />
    <meta property="og:title" content="OG Default" />
    <meta property="og:description" content="OG default description" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://old.example/arcane_icon.png" />
    <meta name="twitter:title" content="TW Default" />
    <meta name="twitter:description" content="TW default description" />
    <meta name="twitter:image" content="https://old.example/arcane_icon.png" />
  </head>
  <body><div id="app"></div></body>
</html>`;
}

function extractJsonLd(html: string): unknown[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return scripts.map((m) => JSON.parse(m[1]!));
}

describe('getPublicBaseUrl', () => {
  const cases: Array<{ name: string; req: Parameters<typeof mockRequest>[0]; expected: string }> = [
    {
      name: 'uses x-forwarded-proto and x-forwarded-host (first value when comma-separated)',
      req: {
        xForwardedProto: 'https, http',
        xForwardedHost: 'arcane.example, internal.local',
        protocol: 'http',
        host: 'ignored.local',
      },
      expected: 'https://arcane.example',
    },
    {
      name: 'falls back to req.protocol and host when forwarded headers absent',
      req: { protocol: 'http', host: 'localhost:3000' },
      expected: 'http://localhost:3000',
    },
    {
      name: 'falls back to https and localhost when protocol and host missing',
      req: { protocol: '' },
      expected: 'https://localhost',
    },
    {
      name: 'trims whitespace on forwarded headers',
      req: { xForwardedProto: ' https ', xForwardedHost: ' arcane.example ' },
      expected: 'https://arcane.example',
    },
  ];

  for (const { name, req, expected } of cases) {
    it(name, () => {
      assert.equal(getPublicBaseUrl(mockRequest(req)), expected);
    });
  }
});

describe('injectPublicationMeta', () => {
  const pageUrl = 'https://arcane.example/p/my-novel';
  const baseOpts = {
    title: 'My Novel',
    description: 'A great story',
    imageUrl: 'https://cdn.example/cover.jpg' as string | null,
    pageUrl,
  };

  const publicationCases: Array<{
    name: string;
    opts: typeof baseOpts & { isChapter?: boolean };
    assert: (html: string) => void;
  }> = [
    {
      name: 'sets publication title suffix and meta tags',
      opts: baseOpts,
      assert: (html) => {
        assert.match(html, /<title>My Novel — читать онлайн \| Arcane<\/title>/);
        assert.match(html, /<meta name="description" content="A great story" \/>/);
        assert.match(html, /<meta property="og:title" content="My Novel" \/>/);
        assert.match(html, /<meta property="og:description" content="A great story" \/>/);
        assert.match(
          html,
          /<meta property="og:image" content="https:\/\/cdn\.example\/cover\.jpg" \/>/
        );
        assert.match(
          html,
          /<meta property="og:url" content="https:\/\/arcane\.example\/p\/my-novel" \/>/
        );
        assert.match(html, /<meta name="twitter:title" content="My Novel" \/>/);
        assert.match(
          html,
          /<link rel="canonical" href="https:\/\/arcane\.example\/p\/my-novel" \/>/
        );
      },
    },
    {
      name: 'uses chapter title suffix when isChapter is true',
      opts: { ...baseOpts, isChapter: true },
      assert: (html) => {
        assert.match(html, /<title>My Novel — Arcane<\/title>/);
      },
    },
    {
      name: 'falls back to origin icon when imageUrl is null',
      opts: { ...baseOpts, imageUrl: null },
      assert: (html) => {
        assert.match(
          html,
          /<meta property="og:image" content="https:\/\/arcane\.example\/arcane_icon\.png" \/>/
        );
      },
    },
  ];

  for (const { name, opts, assert: assertHtml } of publicationCases) {
    it(name, () => {
      assertHtml(injectPublicationMeta(sampleIndexHtml(), opts));
    });
  }
});

describe('injectStaticPageMeta', () => {
  const pageUrl = 'https://arcane.example/catalog';
  const cases: Array<{
    name: string;
    opts: {
      title: string;
      description: string;
      pageUrl: string;
      canonicalUrl?: string;
    };
    assert: (html: string) => void;
  }> = [
    {
      name: 'sets document title, description, og tags, and default canonical',
      opts: {
        title: 'Каталог переводов — Arcane',
        description: 'Browse translations',
        pageUrl,
      },
      assert: (html) => {
        const docTitle = staticPageDocumentTitle('Каталог переводов — Arcane');
        assert.match(
          html,
          new RegExp(`<title>${docTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/title>`)
        );
        assert.match(html, /<meta name="description" content="Browse translations" \/>/);
        assert.match(html, /<meta property="og:title" content="Каталог переводов — Arcane" \/>/);
        assert.match(
          html,
          /<meta property="og:image" content="https:\/\/arcane\.example\/arcane_icon\.png" \/>/
        );
        assert.match(html, /<link rel="canonical" href="https:\/\/arcane\.example\/catalog" \/>/);
      },
    },
    {
      name: 'uses canonicalUrl override when provided',
      opts: {
        title: 'Каталог переводов — Arcane',
        description: 'Browse translations',
        pageUrl,
        canonicalUrl: 'https://arcane.example/',
      },
      assert: (html) => {
        assert.match(html, /<link rel="canonical" href="https:\/\/arcane\.example\/" \/>/);
        assert.doesNotMatch(
          html,
          /<link rel="canonical" href="https:\/\/arcane\.example\/catalog" \/>/
        );
      },
    },
    {
      name: 'appends Arcane suffix when title omits brand',
      opts: {
        title: 'Контакты',
        description: 'Contact us',
        pageUrl: 'https://arcane.example/contact',
      },
      assert: (html) => {
        assert.match(html, /<title>Контакты \| Arcane<\/title>/);
      },
    },
  ];

  for (const { name, opts, assert: assertHtml } of cases) {
    it(name, () => {
      assertHtml(injectStaticPageMeta(sampleIndexHtml(), opts));
    });
  }
});

describe('injectOrganizationJsonLd', () => {
  it('injects Organization and WebSite JSON-LD before closing head', () => {
    const baseUrl = 'https://arcane.example/';
    const html = injectOrganizationJsonLd(sampleIndexHtml(), baseUrl);
    const schemas = extractJsonLd(html);

    assert.equal(schemas.length, 2);
    assert.deepEqual(schemas[0], {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Arcane',
      url: baseUrl,
      description: 'Arcane — библиотека переводов новелл. Переводчик с AI и глоссарием. EPUB, FB2.',
    });
    assert.deepEqual(schemas[1], {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Arcane',
      url: baseUrl,
      description:
        'Библиотека переводов новелл. Читайте и скачивайте переводы онлайн. Переводчик с AI.',
    });
    assert.match(html, /<script type="application\/ld\+json">[\s\S]*<\/script>\s*<\/head>/);
  });
});

describe('injectBreadcrumbJsonLd', () => {
  const baseOpts = {
    baseUrl: 'https://arcane.example',
    catalogUrl: 'https://arcane.example/catalog',
    publicationName: 'My Novel',
    publicationUrl: 'https://arcane.example/p/my-novel',
  };

  const cases: Array<{
    name: string;
    opts: typeof baseOpts & { chapterName?: string; chapterUrl?: string };
    expectedPositions: number;
    lastItemName?: string;
  }> = [
    {
      name: 'publication breadcrumb has catalog and publication',
      opts: baseOpts,
      expectedPositions: 2,
    },
    {
      name: 'chapter breadcrumb adds third list item',
      opts: {
        ...baseOpts,
        chapterName: 'Chapter 1',
        chapterUrl: 'https://arcane.example/p/my-novel/chapters/ch1/reading',
      },
      expectedPositions: 3,
      lastItemName: 'Chapter 1',
    },
  ];

  for (const { name, opts, expectedPositions, lastItemName } of cases) {
    it(name, () => {
      const html = injectBreadcrumbJsonLd(sampleIndexHtml(), opts);
      const [breadcrumb] = extractJsonLd(html) as Array<{
        '@type': string;
        itemListElement: Array<{ position: number; name: string; item: string }>;
      }>;

      assert.equal(breadcrumb['@type'], 'BreadcrumbList');
      assert.equal(breadcrumb.itemListElement.length, expectedPositions);
      assert.equal(breadcrumb.itemListElement[0]!.name, 'Каталог');
      assert.equal(breadcrumb.itemListElement[1]!.name, 'My Novel');
      if (lastItemName) {
        assert.equal(breadcrumb.itemListElement[2]!.name, lastItemName);
      }
    });
  }
});

describe('injectPublicationJsonLd', () => {
  it('injects minimal Book schema with defaults', () => {
    const html = injectPublicationJsonLd(sampleIndexHtml(), {
      title: 'My Novel',
      description: 'A great story',
      url: 'https://arcane.example/p/my-novel',
      imageUrl: null,
      authorDisplay: null,
      translatorDisplay: null,
      targetLanguage: 'ru',
    });

    const [book] = extractJsonLd(html) as Array<Record<string, unknown>>;
    assert.equal(book['@type'], 'Book');
    assert.equal(book.name, 'My Novel');
    assert.equal(book.description, 'A great story');
    assert.equal(book.url, 'https://arcane.example/p/my-novel');
    assert.equal(book.image, 'https://arcane.example/arcane_icon.png');
    assert.equal(book.inLanguage, 'ru');
    assert.equal(book.author, undefined);
    assert.equal(book.translator, undefined);
    assert.equal(book.numberOfPages, undefined);
  });
});
