import { describe, expect, it } from 'vitest';
import {
  announcementMinRoles,
  announcementVariants,
  newsCategories,
  newsStatuses,
} from '../../../src/api/schemas/news.js';
import type {
  AnnouncementMinRole,
  AnnouncementVariant,
  NewsCategory,
  NewsStatus,
} from '../../../src/client/types/index.js';
import { loadFixture } from '../helpers/loadFixture.js';

/** Client-side enum values (must stay in sync with `src/client/types`). */
const CLIENT_NEWS_CATEGORIES: NewsCategory[] = ['feature', 'discount', 'update', 'other'];
const CLIENT_NEWS_STATUSES: NewsStatus[] = ['draft', 'published', 'archived'];
const CLIENT_ANNOUNCEMENT_VARIANTS: AnnouncementVariant[] = ['info', 'promo', 'neutral'];
const CLIENT_ANNOUNCEMENT_MIN_ROLES: AnnouncementMinRole[] = [
  'guest',
  'user',
  'author',
  'author_plus',
  'super_author',
  'admin',
];

describe('news enums client ↔ server contract', () => {
  const fixture = loadFixture('news-enums.json') as {
    categories: string[];
    statuses: string[];
    variants: string[];
    minRoles: string[];
  };

  it('freezes categories against Zod and client types', () => {
    expect(fixture.categories).toEqual([...newsCategories]);
    expect(fixture.categories).toEqual(CLIENT_NEWS_CATEGORIES);
  });

  it('freezes statuses against Zod and client types', () => {
    expect(fixture.statuses).toEqual([...newsStatuses]);
    expect(fixture.statuses).toEqual(CLIENT_NEWS_STATUSES);
  });

  it('freezes announcement variants against Zod and client types', () => {
    expect(fixture.variants).toEqual([...announcementVariants]);
    expect(fixture.variants).toEqual(CLIENT_ANNOUNCEMENT_VARIANTS);
  });

  it('freezes announcement minRoles against Zod and client types', () => {
    expect(fixture.minRoles).toEqual([...announcementMinRoles]);
    expect(fixture.minRoles).toEqual(CLIENT_ANNOUNCEMENT_MIN_ROLES);
  });
});
