import { describe, expect, it } from 'vitest';
import {
  adminNewsListQuerySchema,
  announcementCreateSchema,
  announcementDismissSchema,
  announcementUpdateSchema,
  newsCreateSchema,
  newsListQuerySchema,
  newsTranslateSchema,
  newsTranslationPatchSchema,
  newsUpdateSchema,
  announcementTranslationPatchSchema,
} from './news.js';

describe('newsListQuerySchema', () => {
  it('rejects invalid category', () => {
    const parsed = newsListQuerySchema.safeParse({ category: 'breaking' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.category).toBeDefined();
    }
  });

  it('rejects limit above max', () => {
    const parsed = newsListQuerySchema.safeParse({ limit: 200 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.limit).toBeDefined();
    }
  });

  it('coerces numeric query params', () => {
    const parsed = newsListQuerySchema.safeParse({ limit: '20', offset: '5', category: 'update' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(20);
      expect(parsed.data.offset).toBe(5);
      expect(parsed.data.category).toBe('update');
      expect(parsed.data.locale).toBe('ru');
    }
  });

  it('rejects an unknown locale', () => {
    const parsed = newsListQuerySchema.safeParse({ locale: 'de' });
    expect(parsed.success).toBe(false);
  });
});

describe('adminNewsListQuerySchema', () => {
  it('rejects invalid status', () => {
    const parsed = adminNewsListQuerySchema.safeParse({ status: 'live' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.status).toBeDefined();
    }
  });
});

describe('newsCreateSchema', () => {
  it('rejects blank title', () => {
    const parsed = newsCreateSchema.safeParse({
      title: '   ',
      summary: 'Summary text',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it('rejects blank summary', () => {
    const parsed = newsCreateSchema.safeParse({
      title: 'Launch',
      summary: '',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.summary).toBeDefined();
    }
  });

  it('rejects invalid category', () => {
    const parsed = newsCreateSchema.safeParse({
      title: 'Launch',
      summary: 'Short summary',
      category: 'invalid',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.category).toBeDefined();
    }
  });

  it('rejects invalid slug format', () => {
    expect(() =>
      newsCreateSchema.parse({
        title: 'Launch',
        summary: 'Short summary',
        slug: 'Bad Slug!',
      })
    ).toThrow('Invalid slug');
  });

  it('defaults body and category when omitted', () => {
    const parsed = newsCreateSchema.safeParse({
      title: 'Launch',
      summary: 'Short summary',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.body).toBe('');
      expect(parsed.data.category).toBe('other');
      expect(parsed.data.slug).toBeNull();
    }
  });

  it('accepts valid slug', () => {
    const parsed = newsCreateSchema.safeParse({
      title: 'Launch',
      summary: 'Short summary',
      slug: 'launch-2026',
      body: 'Body text',
      category: 'feature',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slug).toBe('launch-2026');
      expect(parsed.data.category).toBe('feature');
    }
  });
});

describe('newsUpdateSchema', () => {
  it('rejects invalid status', () => {
    const parsed = newsUpdateSchema.safeParse({ status: 'hidden' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.status).toBeDefined();
    }
  });

  it('maps empty slug to null', () => {
    const parsed = newsUpdateSchema.safeParse({ slug: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slug).toBeNull();
    }
  });

  it('rejects a ready translation without title', () => {
    const parsed = newsTranslationPatchSchema.safeParse({
      locale: 'en',
      title: ' ',
      summary: 'Summary',
      body: '',
      status: 'ready',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects Russian as a jsonb translation locale', () => {
    const parsed = newsTranslateSchema.safeParse({ locale: 'ru' });
    expect(parsed.success).toBe(false);
  });

  it('accepts an English draft patch', () => {
    const parsed = newsUpdateSchema.safeParse({
      translation: {
        locale: 'en',
        title: 'Hello',
        summary: 'Short',
        body: 'Body',
        status: 'draft',
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('announcementCreateSchema', () => {
  it('rejects invalid variant', () => {
    const parsed = announcementCreateSchema.safeParse({ variant: 'loud' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.variant).toBeDefined();
    }
  });

  it('rejects invalid minRole', () => {
    const parsed = announcementCreateSchema.safeParse({ minRole: 'superuser' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.minRole).toBeDefined();
    }
  });

  it('rejects invalid datetime for startsAt', () => {
    const parsed = announcementCreateSchema.safeParse({ startsAt: 'not-a-date' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.startsAt).toBeDefined();
    }
  });

  it('rejects priority outside bounds', () => {
    const parsed = announcementCreateSchema.safeParse({ priority: 200 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.priority).toBeDefined();
    }
  });

  it('defaults variant, minRole, and priority', () => {
    const parsed = announcementCreateSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.variant).toBe('info');
      expect(parsed.data.minRole).toBe('guest');
      expect(parsed.data.priority).toBe(0);
      expect(parsed.data.isActive).toBe(true);
    }
  });
});

describe('announcementUpdateSchema', () => {
  it('accepts one alert translation without a content version', () => {
    const parsed = announcementUpdateSchema.safeParse({
      translation: { locale: 'pl', message: 'Cześć', ctaLabel: 'Dalej' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contentVersion).toBeUndefined();
    }
  });

  it('rejects an alert translation for Russian', () => {
    const parsed = announcementTranslationPatchSchema.safeParse({
      locale: 'ru',
      message: 'Привет',
      ctaLabel: '',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects contentVersion below 1', () => {
    const parsed = announcementUpdateSchema.safeParse({ contentVersion: 0 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.contentVersion).toBeDefined();
    }
  });
});

describe('announcementDismissSchema', () => {
  it('requires positive contentVersion', () => {
    const parsed = announcementDismissSchema.safeParse({ contentVersion: 0 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.contentVersion).toBeDefined();
    }
  });

  it('coerces string contentVersion', () => {
    const parsed = announcementDismissSchema.safeParse({ contentVersion: '3' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contentVersion).toBe(3);
    }
  });
});
