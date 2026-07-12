import { describe, expect, it } from 'vitest';
import {
  adminTranslationRequestUpdateSchema,
  adminTranslationRequestsListQuerySchema,
  catalogTranslationRequestCreateSchema,
} from './catalogRequests.js';

describe('catalogTranslationRequestCreateSchema', () => {
  it('rejects title shorter than 2 characters', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'A',
      targetLanguage: 'ru',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it('rejects unsupported target language', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'Novel',
      targetLanguage: 'fr',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.targetLanguage).toBeDefined();
    }
  });

  it('rejects invalid sourceUrl', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'Novel',
      targetLanguage: 'ru',
      sourceUrl: 'not-a-url',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.sourceUrl).toBeDefined();
    }
  });

  it('rejects comment shorter than 5 characters when provided', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'Novel',
      targetLanguage: 'ru',
      comment: 'hi',
    });
    expect(parsed.success).toBe(false);
  });

  it('maps empty optional fields to undefined', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'Novel Title',
      targetLanguage: 'be',
      authorName: '   ',
      comment: '',
      sourceUrl: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.authorName).toBeUndefined();
      expect(parsed.data.comment).toBeUndefined();
      expect(parsed.data.sourceUrl).toBeUndefined();
    }
  });

  it('accepts valid payload with optional fields', () => {
    const parsed = catalogTranslationRequestCreateSchema.safeParse({
      title: 'Novel',
      authorName: 'Author',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      comment: 'Please add this title',
      sourceUrl: 'https://example.com/novel',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.targetLanguage).toBe('ru');
      expect(parsed.data.comment).toBe('Please add this title');
    }
  });
});

describe('adminTranslationRequestsListQuerySchema', () => {
  it('rejects invalid status enum', () => {
    const parsed = adminTranslationRequestsListQuerySchema.safeParse({ status: 'open' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.status).toBeDefined();
    }
  });

  it('rejects limit above max', () => {
    const parsed = adminTranslationRequestsListQuerySchema.safeParse({ limit: 101 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.limit).toBeDefined();
    }
  });

  it('coerces string limit and offset', () => {
    const parsed = adminTranslationRequestsListQuerySchema.safeParse({
      limit: '25',
      offset: '10',
      status: 'pending',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(25);
      expect(parsed.data.offset).toBe(10);
      expect(parsed.data.status).toBe('pending');
    }
  });
});

describe('adminTranslationRequestUpdateSchema', () => {
  it('rejects invalid status', () => {
    const parsed = adminTranslationRequestUpdateSchema.safeParse({ status: 'deleted' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.status).toBeDefined();
    }
  });

  it('maps blank adminNotes to null', () => {
    const parsed = adminTranslationRequestUpdateSchema.safeParse({ adminNotes: '   ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.adminNotes).toBeNull();
    }
  });

  it('maps empty linkedPublicationId to null', () => {
    const parsed = adminTranslationRequestUpdateSchema.safeParse({
      linkedPublicationId: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.linkedPublicationId).toBeNull();
    }
  });

  it('rejects non-uuid linkedPublicationId', () => {
    const parsed = adminTranslationRequestUpdateSchema.safeParse({
      linkedPublicationId: 'not-a-uuid',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.linkedPublicationId).toBeDefined();
    }
  });
});
