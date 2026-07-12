import { describe, expect, it } from 'vitest';
import { buildAnalysisChapterUpdate } from './analysisUpdate.js';
import type { Chapter } from '../../../storage/database.js';

describe('buildAnalysisChapterUpdate', () => {
  it('preserves completed status and merges token meta', () => {
    const existing = {
      status: 'completed',
      translationMeta: {
        tokensUsed: 100,
        tokensByStage: { analysis: 50, translation: 50, editing: 0 },
        translatedAt: '2026-01-01T00:00:00Z',
        source: 'import',
      },
    } as unknown as Chapter;

    const update = buildAnalysisChapterUpdate({
      existingChapter: existing,
      chResult: { tokensUsed: 200 },
      totalDuration: 5000,
      analysisModel: 'gpt-test',
      nowIso: '2026-06-01T12:00:00Z',
    });

    expect(update.status).toBe('completed');
    expect(update.translationMeta.tokensUsed).toBe(200);
    expect(update.translationMeta.tokensByStage?.analysis).toBe(200);
    expect(update.translationMeta.tokensByStage?.translation).toBe(50);
    expect(update.translationMeta.lastAnalysisAt).toBe('2026-06-01T12:00:00Z');
    expect(update.translationMeta.source).toBe('import');
  });

  it('sets analyzed status for pending chapter', () => {
    const update = buildAnalysisChapterUpdate({
      existingChapter: { status: 'pending' } as Chapter,
      chResult: { tokensUsed: 10 },
      totalDuration: 100,
      analysisModel: 'm',
    });
    expect(update.status).toBe('analyzed');
  });
});
