import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
}));

vi.mock('../services/redisCache.js', () => ({
  buildRedisKey: (...parts: string[]) => parts.join(':'),
  redisDelMany: vi.fn(),
  redisDelByPattern: vi.fn(),
  redisGetJson: vi.fn(),
  redisSetJson: vi.fn(),
}));

vi.mock('../services/healthSnapshotStore.js', () => ({
  readSharedHealth: vi.fn().mockResolvedValue(null),
  shouldAwaitRecoveryProbe: vi.fn().mockReturnValue(false),
}));

vi.mock('../services/serviceHealth.js', () => ({
  serviceHealthManager: {
    getHealthResult: vi.fn().mockReturnValue({ status: 'ok', services: {} }),
    getSupabaseStatus: vi.fn().mockReturnValue('ok'),
    applySharedHealth: vi.fn(),
    checkAll: vi.fn().mockResolvedValue(undefined),
  },
}));

import type { ImportJobState } from '../services/importJobStore.js';
import type { AnalysisJobState } from '../services/analysisJobStore.js';
import type { TranslateJobState } from '../services/translateJobStore.js';
import type { Project } from '../storage/database.js';
import { redisDelByPattern, redisDelMany } from '../services/redisCache.js';
import {
  clearTranslationProgress,
  decodeMultipartFilename,
  effectiveJobLanguageFields,
  generateAnalysisJobId,
  generateImportJobId,
  generateTranslateJobId,
  getTranslationProgress,
  invalidateAnnouncementCaches,
  invalidateNewsCaches,
  invalidatePublicationCaches,
  invalidatePublicationListCaches,
  invalidatePublicEntitiesCaches,
  invalidateUserProjectCaches,
  isLanguagePairOverride,
  publicationCacheKey,
  publicationsListCacheKey,
  sanitizeFilename,
  setTranslationProgress,
  toPublicAnalysisJob,
  toPublicImportJob,
  toPublicTranslateJob,
  translationCancelKey,
  userProjectCacheKey,
  warnLanguageOverrideWithGlossary,
} from './routeHelpers.js';

function mockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    glossary: [],
    ...overrides,
  } as Project;
}

function mockImportJob(overrides: Partial<ImportJobState> = {}): ImportJobState {
  return {
    jobId: 'imp_1',
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'processing',
    phase: 'parsing',
    format: 'epub',
    filename: 'book.epub',
    current: 2,
    total: 10,
    warnings: [],
    errors: [],
    chapters: [{ number: 1, title: 'Ch1' }],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: null,
    cancelRequested: false,
    ...overrides,
  };
}

describe('routeHelpers pure functions', () => {
  afterEach(() => {
    clearTranslationProgress('proj-1', 'ch-1');
    vi.clearAllMocks();
  });

  it('translationCancelKey joins project and chapter ids', () => {
    assert.equal(translationCancelKey('p1', 'c1'), 'p1:c1');
  });

  it('translation progress store round-trips', () => {
    setTranslationProgress('proj-1', 'ch-1', {
      chunksDone: 3,
      totalChunks: 10,
      stage: 'translate',
    });
    assert.deepEqual(getTranslationProgress('proj-1', 'ch-1'), {
      chunksDone: 3,
      totalChunks: 10,
      stage: 'translate',
    });
    clearTranslationProgress('proj-1', 'ch-1');
    assert.equal(getTranslationProgress('proj-1', 'ch-1'), undefined);
  });

  it('cache key builders include namespace segments', () => {
    assert.match(userProjectCacheKey('u1', 'p1'), /u1/);
    assert.match(userProjectCacheKey('u1', 'p1'), /p1/);
    assert.match(publicationCacheKey('pub-1'), /pub-1/);
    const listKey = publicationsListCacheKey({
      limit: 20,
      offset: 0,
      orderBy: 'updated',
      orderAsc: false,
    });
    assert.match(listKey, /20/);
  });

  it('job id generators use known prefixes', () => {
    assert.match(generateImportJobId(), /^imp_/);
    assert.match(generateAnalysisJobId(), /^ana_/);
    assert.match(generateTranslateJobId(), /^trl_/);
  });

  it('toPublicImportJob computes progress and strips sensitive fields', () => {
    const pub = toPublicImportJob(mockImportJob());
    assert.equal(pub.progress, 20);
    assert.equal(pub.jobId, 'imp_1');
    assert.equal('projectId' in pub, false);
    const compact = toPublicImportJob(mockImportJob(), { compact: true });
    assert.deepEqual(compact.chapters, []);
  });

  it('toPublicTranslateJob and toPublicAnalysisJob compute progress', () => {
    const translateJob = {
      jobId: 'trl_1',
      projectId: 'p1',
      userId: 'u1',
      status: 'processing',
      current: 1,
      total: 4,
      chapters: [],
      errors: [],
      startedAt: '2026-01-01T00:00:00Z',
      finishedAt: null,
      totalTokensUsed: 0,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      cancelRequested: false,
    } as TranslateJobState;
    assert.equal(toPublicTranslateJob(translateJob).progress, 25);

    const analysisJob = {
      jobId: 'ana_1',
      projectId: 'p1',
      userId: 'u1',
      status: 'processing',
      current: 3,
      total: 3,
      chapters: [],
      errors: [],
      startedAt: '2026-01-01T00:00:00Z',
      finishedAt: null,
      totalTokensUsed: 0,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      cancelRequested: false,
    } as AnalysisJobState;
    assert.equal(toPublicAnalysisJob(analysisJob).progress, 100);
  });

  it('isLanguagePairOverride detects override vs project defaults', () => {
    const project = mockProject();
    assert.equal(isLanguagePairOverride(project, undefined), false);
    assert.equal(
      isLanguagePairOverride(project, { sourceLanguage: 'en', targetLanguage: 'ru' }),
      false
    );
    assert.equal(
      isLanguagePairOverride(project, { sourceLanguage: 'ko', targetLanguage: 'ru' }),
      true
    );
  });

  it('effectiveJobLanguageFields resolves override', () => {
    const project = mockProject();
    assert.deepEqual(effectiveJobLanguageFields(project), {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.deepEqual(
      effectiveJobLanguageFields(project, { sourceLanguage: 'zh', targetLanguage: 'be' }),
      { sourceLanguage: 'zh', targetLanguage: 'be' }
    );
  });

  it('decodeMultipartFilename decodes latin1 mojibake', () => {
    const latin1 = Buffer.from('книга.epub', 'utf8').toString('latin1');
    assert.equal(decodeMultipartFilename(latin1), 'книга.epub');
  });

  it('sanitizeFilename transliterates cyrillic and strips unsafe chars', () => {
    assert.equal(sanitizeFilename('Моя книга.pdf'), 'Moya_kniga.pdf');
    assert.equal(sanitizeFilename('bad<>name.txt'), 'badname.txt');
    assert.equal(sanitizeFilename(''), 'export');
  });

  it('invalidateUserProjectCaches deletes user keys with optional project key', async () => {
    await invalidateUserProjectCaches('u1', 'p1');
    assert.equal(vi.mocked(redisDelMany).mock.calls.length, 1);
    const keys = vi.mocked(redisDelMany).mock.calls[0]?.[0] as string[];
    assert.equal(keys.length, 2);
    assert.match(keys[0]!, /u1/);
    assert.match(keys[1]!, /p1/);
  });

  it('invalidatePublicationCaches deletes publication keys and optional chapter pattern', async () => {
    await invalidatePublicationCaches('pub-slug', 'pub-id');
    assert.equal(vi.mocked(redisDelMany).mock.calls.length, 1);
    assert.equal(vi.mocked(redisDelByPattern).mock.calls.length, 1);
  });

  it('invalidatePublicationListCaches deletes list pattern', async () => {
    await invalidatePublicationListCaches();
    assert.equal(vi.mocked(redisDelByPattern).mock.calls.length, 1);
  });

  it('invalidatePublicEntitiesCaches includes entity id when provided', async () => {
    await invalidatePublicEntitiesCaches('entity-1');
    const keys = vi.mocked(redisDelMany).mock.calls[0]?.[0] as string[];
    assert.equal(keys.length, 5);
    assert.match(keys[4]!, /entity-1/);
  });

  it('invalidateNewsCaches deletes patterns and optional post key', async () => {
    await invalidateNewsCaches('post-slug');
    assert.equal(vi.mocked(redisDelByPattern).mock.calls.length, 2);
    assert.equal(vi.mocked(redisDelMany).mock.calls.length, 1);
  });

  it('invalidateAnnouncementCaches deletes announcement pattern', async () => {
    await invalidateAnnouncementCaches();
    assert.equal(vi.mocked(redisDelByPattern).mock.calls.length, 1);
  });

  it('warnLanguageOverrideWithGlossary logs when override with glossary', () => {
    const warn = vi.fn();
    const req = { log: { warn } };
    const project = mockProject({
      glossary: [{ id: 'g1', type: 'term', original: 'x', translated: 'y' } as never],
    });
    warnLanguageOverrideWithGlossary(req as never, project, {
      sourceLanguage: 'ko',
      targetLanguage: 'ru',
    });
    assert.equal(warn.mock.calls.length, 1);
  });

  it('warnLanguageOverrideWithGlossary is silent without override or glossary', () => {
    const warn = vi.fn();
    const req = { log: { warn } };
    warnLanguageOverrideWithGlossary(req as never, mockProject(), undefined);
    assert.equal(warn.mock.calls.length, 0);
  });
});
