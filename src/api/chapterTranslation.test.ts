import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
}));

vi.mock('../services/supabaseDatabase.js', () => ({
  addGlossaryEntry: vi.fn(),
  updateGlossaryEntry: vi.fn(),
  getGlossaryEntry: vi.fn(),
  updateChapter: vi.fn(),
  getChapter: vi.fn(),
}));

vi.mock('../middleware/tokenLimits.js', () => ({
  incrementTokenUsage: vi.fn(),
}));

vi.mock('../services/engine-integration.js', () => ({
  translateChapterWithPipeline: vi.fn(),
  getStageModel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import type { Paragraph } from '../storage/database.js';
import {
  logTranslationCoverageIfIncomplete,
  syncTranslationChunksToParagraphs,
  syncTranslationToParagraphs,
} from './chapterTranslation.js';

const PARA_A = '0226e941-e174-461d-8945-9503b50aa761';
const PARA_B = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
const PARA_SEP = 'sep-0000-0000-0000-000000000001';

function makeParagraph(
  id: string,
  index: number,
  originalText: string,
  translatedText?: string
): Paragraph {
  return {
    id,
    index,
    originalText,
    translatedText,
    status: translatedText ? 'translated' : 'pending',
  } as Paragraph;
}

describe('chapterTranslation sync helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncTranslationToParagraphs maps double-newline parts to empty paragraphs', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph(PARA_B, 1, 'World')];
    const result = syncTranslationToParagraphs(originals, 'Привет\n\nМир');
    assert.equal(result[0].translatedText, 'Привет');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationToParagraphs preserves existing translations unless replaceAll', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello', 'Existing'),
      makeParagraph(PARA_B, 1, 'World'),
    ];
    const result = syncTranslationToParagraphs(originals, 'Новый\n\nМир');
    assert.equal(result[0].translatedText, 'Existing');
    assert.equal(result[1].translatedText, 'Новый');

    const replaced = syncTranslationToParagraphs(originals, 'A\n\nB', { replaceAll: true });
    assert.equal(replaced[0].translatedText, 'A');
    assert.equal(replaced[1].translatedText, 'B');
  });

  it('syncTranslationToParagraphs skips separator paragraphs', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello'),
      makeParagraph(PARA_SEP, 1, '***'),
      makeParagraph(PARA_B, 2, 'World'),
    ];
    const result = syncTranslationToParagraphs(originals, 'A\n\nB');
    assert.equal(result[1].originalText, '***');
    assert.equal(result[1].translatedText, undefined);
    assert.equal(result[0].translatedText, 'A');
    assert.equal(result[2].translatedText, 'B');
  });

  it('syncTranslationToParagraphs returns originals unchanged for empty translation', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello')];
    const result = syncTranslationToParagraphs(originals, '   ');
    assert.deepEqual(result, originals);
  });

  it('syncTranslationChunksToParagraphs maps chunks to paragraphs', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph(PARA_B, 1, 'World')];
    const result = syncTranslationChunksToParagraphs(originals, ['Привет', 'Мир']);
    assert.equal(result[0].translatedText, 'Привет');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationChunksToParagraphs preserves existing in partial mode', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello', 'Keep'),
      makeParagraph(PARA_B, 1, 'World'),
    ];
    const result = syncTranslationChunksToParagraphs(originals, ['Мир'], true);
    assert.equal(result[0].translatedText, 'Keep');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationChunksToParagraphs merges excess chunks into last content paragraph', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello')];
    const result = syncTranslationChunksToParagraphs(originals, ['Part1', 'Part2']);
    assert.equal(result[0].translatedText, 'Part1\n\nPart2');
  });

  it('logTranslationCoverageIfIncomplete returns coverage and warns when incomplete', async () => {
    const { logger } = await import('../logger.js');
    const paragraphs = [makeParagraph(PARA_A, 0, 'Hello', 'Hi'), makeParagraph(PARA_B, 1, 'World')];
    const coverage = logTranslationCoverageIfIncomplete('proj-1', 'ch-1', paragraphs);
    assert.equal(coverage.isComplete, false);
    assert.equal(coverage.translatedCount, 1);
    expect(logger.warn).toHaveBeenCalled();
  });
});
