import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  applyBatchAbortError,
  applySingleChapterResult,
  applySingleChapterTranslating,
  buildInitialChapterProgress,
  buildTranslationRequestBody,
  createEmptyBatchProgress,
  isOnlyAnalysisStages,
  markChunkChaptersTranslating,
  resolveBatchStartErrorMessage,
  shouldBreakOnTokenLimit,
  shouldContinueOnConflict,
} from './batchTranslationCore.js';

describe('batchTranslationCore', () => {
  it('builds initial chapter progress and empty batch shell', () => {
    const chapters = buildInitialChapterProgress([
      { id: 'c1', title: 'One', status: 'pending' },
      { id: 'c2', title: 'Two', status: 'error' },
    ]);
    assert.equal(chapters[0]!.status, 'pending');
    assert.equal(chapters[1]!.status, 'error');
    const progress = createEmptyBatchProgress('translate', chapters);
    assert.equal(progress.mode, 'translate');
    assert.equal(progress.total, 2);
    assert.equal(progress.completed, 0);
  });

  it('builds translation request body from options', () => {
    assert.deepEqual(buildTranslationRequestBody({ translateOnlyEmpty: true }), {
      translateOnlyEmpty: true,
    });
    assert.deepEqual(
      buildTranslationRequestBody({
        paragraphIds: ['p1'],
        translateOnlyEmpty: true,
        stages: 'all',
        languagePair: { sourceLanguage: 'en', targetLanguage: 'ru' },
        translateChapterTitles: false,
      }),
      {
        paragraphIds: ['p1'],
        stages: 'all',
        languagePair: { sourceLanguage: 'en', targetLanguage: 'ru' },
        translateChapterTitles: false,
      }
    );
  });

  it('detects analysis-only stages', () => {
    assert.equal(isOnlyAnalysisStages(['analysis']), true);
    assert.equal(isOnlyAnalysisStages(['analysis', 'translate']), false);
    assert.equal(isOnlyAnalysisStages('all'), false);
  });

  it('marks chunk chapters translating and applies abort errors', () => {
    const base = createEmptyBatchProgress('mark-translated', [
      { chapterId: 'c1', title: 'One', status: 'pending' },
      { chapterId: 'c2', title: 'Two', status: 'completed' },
      { chapterId: 'c3', title: 'Three', status: 'pending' },
    ]);
    const translating = markChunkChaptersTranslating(base, ['c1', 'c3'], 'chunk 1-2');
    assert.equal(translating.chapters[0]!.status, 'translating');
    assert.equal(translating.chapters[1]!.status, 'completed');
    assert.equal(translating.currentChapter, 'chunk 1-2');

    const failed = applyBatchAbortError(translating, 'boom');
    assert.equal(failed.chapters[0]!.status, 'error');
    assert.equal(failed.chapters[0]!.reason, 'boom');
    assert.equal(failed.chapters[2]!.reason, 'boom');
    assert.equal(failed.chapters[1]!.status, 'completed');
    assert.equal(failed.errors, 2);

    const pendingFail = applyBatchAbortError(base, 'later');
    assert.equal(pendingFail.chapters[0]!.reason, 'not_processed');
  });

  it('applies single-chapter translating and result outcomes', () => {
    const base = createEmptyBatchProgress('translate', [
      { chapterId: 'c1', title: 'One', status: 'pending' },
    ]);
    const translating = applySingleChapterTranslating(base, { id: 'c1', title: 'One' }, 0);
    assert.equal(translating.current, 1);
    assert.equal(translating.chapters[0]!.status, 'translating');

    const completed = applySingleChapterResult(translating, {
      chapterId: 'c1',
      success: true,
      tokensUsed: 10,
      duration: 5,
      glossaryEntries: 1,
      totalGlossaryEntries: 1,
    });
    assert.equal(completed.completed, 1);
    assert.equal(completed.totalTokens, 10);

    const partial = applySingleChapterResult(translating, {
      chapterId: 'c1',
      success: true,
      partial: true,
      tokensUsed: 3,
    });
    assert.equal(partial.completed, 0);
    assert.equal(partial.errors, 1);
    assert.equal(partial.chapters[0]!.status, 'partial');

    const cancelled = applySingleChapterResult(translating, {
      chapterId: 'c1',
      success: false,
      cancelled: true,
    });
    assert.equal(cancelled.chapters[0]!.status, 'pending');

    const errored = applySingleChapterResult(translating, {
      chapterId: 'c1',
      success: false,
    });
    assert.equal(errored.errors, 1);
    assert.equal(errored.chapters[0]!.status, 'error');
  });

  it('resolves batch start errors and status helpers', () => {
    assert.equal(
      resolveBatchStartErrorMessage({ data: { message: 'queue down' } }, 'fallback'),
      'queue down'
    );
    assert.equal(resolveBatchStartErrorMessage({ data: { error: 'bad' } }, 'fallback'), 'bad');
    assert.equal(resolveBatchStartErrorMessage(new Error('boom'), 'fallback'), 'boom');
    assert.equal(resolveBatchStartErrorMessage('x', 'fallback'), 'fallback');
    assert.equal(shouldBreakOnTokenLimit(429), true);
    assert.equal(shouldBreakOnTokenLimit(500), false);
    assert.equal(shouldContinueOnConflict(409), true);
    assert.equal(shouldContinueOnConflict(400), false);
  });
});
