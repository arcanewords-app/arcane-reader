import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  transformAnnouncementFromDB,
  transformNewsPostFromDB,
  type AnnouncementAlertRow,
  type NewsPostRow,
} from './news.js';

const newsRow: NewsPostRow = {
  id: 'post-1',
  slug: 'release-notes',
  title: 'Release',
  summary: 'Summary',
  body: 'Body',
  category: 'feature',
  status: 'published',
  primary_locale: 'ru',
  translations: { en: { title: 'Release' } },
  published_at: '2026-01-01T00:00:00Z',
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

const announcementRow: AnnouncementAlertRow = {
  id: 'ann-1',
  news_post_id: 'post-1',
  message: 'Welcome',
  cta_label: 'Read more',
  cta_url: '/news/release-notes',
  variant: 'info',
  min_role: 'user',
  starts_at: '2026-01-01T00:00:00Z',
  ends_at: null,
  is_active: true,
  priority: 10,
  content_version: 2,
  dismissible: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

describe('transformNewsPostFromDB', () => {
  it('maps snake_case columns to camelCase fields', () => {
    const post = transformNewsPostFromDB(newsRow);
    assert.equal(post.id, 'post-1');
    assert.equal(post.primaryLocale, 'ru');
    assert.deepEqual(post.translations, { en: { title: 'Release' } });
    assert.equal(post.publishedAt, '2026-01-01T00:00:00Z');
  });

  it('defaults translations to empty object when null', () => {
    const post = transformNewsPostFromDB({ ...newsRow, translations: null });
    assert.deepEqual(post.translations, {});
  });
});

describe('transformAnnouncementFromDB', () => {
  it('maps announcement row fields', () => {
    const alert = transformAnnouncementFromDB(announcementRow);
    assert.equal(alert.id, 'ann-1');
    assert.equal(alert.newsPostId, 'post-1');
    assert.equal(alert.ctaLabel, 'Read more');
    assert.equal(alert.minRole, 'user');
    assert.equal(alert.contentVersion, 2);
    assert.equal(alert.dismissible, true);
  });
});
