import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { STATIC_PAGE_META, staticPageDocumentTitle } from './staticPageMeta.js';

describe('staticPageMeta', () => {
  it('defines meta for all public static routes', () => {
    for (const path of [
      '/',
      '/catalog',
      '/about',
      '/contact',
      '/privacy',
      '/terms',
      '/account-tiers',
      '/news',
    ]) {
      const meta = STATIC_PAGE_META[path];
      assert.ok(meta?.title, `missing title for ${path}`);
      assert.ok(meta?.description, `missing description for ${path}`);
    }
  });

  it('staticPageDocumentTitle appends suffix when Arcane absent', () => {
    assert.equal(staticPageDocumentTitle('Контакты'), 'Контакты | Arcane');
  });

  it('staticPageDocumentTitle leaves title unchanged when Arcane present', () => {
    assert.equal(
      staticPageDocumentTitle('Каталог переводов — Arcane'),
      'Каталог переводов — Arcane'
    );
  });
});
