import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
  buildBookSchema,
  buildBreadcrumbSchema,
  buildNewsArticleSchema,
  resolveDocumentTitle,
  resolveMetaImageUrl,
  resolveStaticPageMetaFields,
  staticDocumentTitle,
} from './pageMetaCore.js';

describe('pageMetaCore', () => {
  it('resolves absolute image urls and falls back to site icon', () => {
    assert.equal(
      resolveMetaImageUrl('https://cdn.example/cover.jpg', 'https://arcane.example'),
      'https://cdn.example/cover.jpg'
    );
    assert.equal(
      resolveMetaImageUrl('/relative.png', 'https://arcane.example'),
      'https://arcane.example/arcane_icon.png'
    );
    assert.equal(
      resolveMetaImageUrl(null, 'https://arcane.example'),
      'https://arcane.example/arcane_icon.png'
    );
  });

  it('resolves document titles for book, chapter, and news', () => {
    assert.equal(resolveDocumentTitle({ title: 'My Novel' }), 'My Novel — читать онлайн | Arcane');
    assert.equal(
      resolveDocumentTitle({ title: 'Ch 1 — My Novel', isChapter: true }),
      'Ch 1 — My Novel — Arcane'
    );
    assert.match(
      resolveDocumentTitle({ title: 'Release notes', schemaType: 'news' }),
      /Release notes/
    );
    assert.equal(staticDocumentTitle('About'), 'About | Arcane');
  });

  it('builds NewsArticle schema with optional dates', () => {
    const schema = buildNewsArticleSchema({
      title: 'Hello',
      description: 'Summary',
      url: 'https://arcane.example/news/hello',
      image: 'https://arcane.example/arcane_icon.png',
      origin: 'https://arcane.example',
      datePublished: '2026-01-01',
      dateModified: '2026-01-02',
    });
    assert.equal(schema['@type'], 'NewsArticle');
    assert.equal(schema.datePublished, '2026-01-01');
    assert.equal(schema.dateModified, '2026-01-02');
    assert.deepEqual(schema.publisher, {
      '@type': 'Organization',
      name: 'Arcane',
      url: 'https://arcane.example',
    });
  });

  it('builds Book schema with optional people and pages', () => {
    const minimal = buildBookSchema({
      title: 'Novel',
      description: 'Desc',
      url: 'https://arcane.example/p/n',
      image: 'https://arcane.example/arcane_icon.png',
    });
    assert.equal(minimal.author, undefined);
    assert.equal(minimal.numberOfPages, undefined);

    const full = buildBookSchema({
      title: 'Novel',
      description: 'Desc',
      url: 'https://arcane.example/p/n',
      image: 'https://cdn.example/c.jpg',
      authorDisplay: 'Author',
      translatorDisplay: 'Translator',
      targetLanguage: 'ru',
      numberOfPages: 12,
    });
    assert.deepEqual(full.author, { '@type': 'Person', name: 'Author' });
    assert.deepEqual(full.translator, { '@type': 'Person', name: 'Translator' });
    assert.equal(full.inLanguage, 'ru');
    assert.equal(full.numberOfPages, 12);
  });

  it('builds breadcrumb schema positions', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Catalog', url: 'https://arcane.example/catalog' },
      { name: 'Novel', url: 'https://arcane.example/p/n' },
    ]);
    assert.equal(schema['@type'], 'BreadcrumbList');
    const items = schema.itemListElement as Array<{ position: number; name: string }>;
    assert.equal(items.length, 2);
    assert.equal(items[0]!.position, 1);
    assert.equal(items[1]!.name, 'Novel');
  });

  it('resolves static page meta fields and catalog canonical', () => {
    assert.equal(resolveStaticPageMetaFields('/not-a-page'), null);
    const about = resolveStaticPageMetaFields('/about');
    assert.ok(about);
    assert.ok(about!.title.length > 0);
    assert.equal(about!.canonicalPath, '/about');

    const catalog = resolveStaticPageMetaFields('/catalog');
    assert.equal(catalog?.canonicalPath, '/');

    const override = resolveStaticPageMetaFields('/unknown', {
      title: 'Custom',
      description: 'Desc',
      canonicalPath: '/custom',
    });
    assert.deepEqual(override, {
      title: 'Custom',
      description: 'Desc',
      pageUrlPath: '/unknown',
      canonicalPath: '/custom',
    });

    assert.ok(DEFAULT_PAGE_TITLE.includes('Arcane'));
    assert.ok(DEFAULT_PAGE_DESCRIPTION.length > 20);
  });
});
