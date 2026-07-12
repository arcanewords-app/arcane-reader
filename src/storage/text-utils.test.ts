import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_READER_SETTINGS,
  getChapterStats,
  getReaderSettings,
  LEGACY_FONT_MAP,
  mergeParagraphsToText,
  parseTextToParagraphs,
} from './text-utils.js';
import type { Chapter, Paragraph, ProjectSettings, ReaderSettings } from './types.js';

describe('getReaderSettings', () => {
  it('returns defaults when reader settings missing', () => {
    const settings = getReaderSettings({ settings: {} as ProjectSettings });
    assert.deepEqual(settings, DEFAULT_READER_SETTINGS);
  });

  it('maps legacy font family keys', () => {
    const settings = getReaderSettings({
      settings: {
        reader: {
          fontFamily: 'literary',
          fontSize: 18,
        } as unknown as ReaderSettings,
      } as ProjectSettings,
    });
    assert.equal(settings.fontFamily, 'default');
    assert.equal(settings.fontSize, 18);
  });

  it('normalizes oversized paragraphSpacing from px values', () => {
    const settings = getReaderSettings({
      settings: {
        reader: {
          paragraphSpacing: 16,
        } as unknown as ReaderSettings,
      } as ProjectSettings,
    });
    assert.equal(settings.paragraphSpacing, 1);
  });

  it('preserves paragraphSpacing when already in rem range', () => {
    const settings = getReaderSettings({
      settings: {
        reader: {
          paragraphSpacing: 1.5,
        } as unknown as ReaderSettings,
      } as ProjectSettings,
    });
    assert.equal(settings.paragraphSpacing, 1.5);
  });

  it('maps all legacy font family keys', () => {
    for (const [legacy, mapped] of Object.entries(LEGACY_FONT_MAP)) {
      const settings = getReaderSettings({
        settings: {
          reader: { fontFamily: legacy } as unknown as ReaderSettings,
        } as ProjectSettings,
      });
      assert.equal(settings.fontFamily, mapped);
    }
  });

  it('includes customBg and customText when present', () => {
    const settings = getReaderSettings({
      settings: {
        reader: {
          customBg: '#111111',
          customText: '#eeeeee',
        } as unknown as ReaderSettings,
      } as ProjectSettings,
    });
    assert.equal(settings.customBg, '#111111');
    assert.equal(settings.customText, '#eeeeee');
  });
});

describe('parseTextToParagraphs', () => {
  it('splits on blank lines and filters separators', () => {
    const paragraphs = parseTextToParagraphs('First para.\n\nSecond para.\n\n---\n\nThird para.');
    assert.equal(paragraphs.length, 3);
    assert.equal(paragraphs[0]?.index, 0);
    assert.equal(paragraphs[0]?.originalText, 'First para.');
    assert.equal(paragraphs[2]?.originalText, 'Third para.');
    assert.equal(paragraphs[0]?.status, 'pending');
  });

  it('returns empty array for whitespace-only input', () => {
    assert.deepEqual(parseTextToParagraphs('   \n\n   '), []);
  });

  it('returns single paragraph for text without blank lines', () => {
    const paragraphs = parseTextToParagraphs('Only one block.');
    assert.equal(paragraphs.length, 1);
    assert.equal(paragraphs[0]?.originalText, 'Only one block.');
  });
});

describe('mergeParagraphsToText', () => {
  it('joins translated text in index order', () => {
    const paragraphs: Paragraph[] = [
      {
        id: 'p2',
        index: 1,
        originalText: 'B',
        translatedText: 'Beta',
        status: 'translated',
      },
      {
        id: 'p1',
        index: 0,
        originalText: 'A',
        translatedText: 'Alpha',
        status: 'translated',
      },
    ];
    const text = mergeParagraphsToText(paragraphs, 'translatedText');
    assert.equal(text, 'Alpha\n\nBeta');
  });

  it('skips empty translated paragraphs', () => {
    const paragraphs: Paragraph[] = [
      {
        id: 'p1',
        index: 0,
        originalText: 'A',
        translatedText: 'Alpha',
        status: 'translated',
      },
      {
        id: 'p2',
        index: 1,
        originalText: 'B',
        translatedText: '',
        status: 'pending',
      },
    ];
    const text = mergeParagraphsToText(paragraphs);
    assert.equal(text, 'Alpha');
  });

  it('merges originalText when field is originalText', () => {
    const paragraphs: Paragraph[] = [
      { id: 'p1', index: 0, originalText: 'Hello', status: 'pending' },
      { id: 'p2', index: 1, originalText: 'World', status: 'pending' },
    ];
    assert.equal(mergeParagraphsToText(paragraphs, 'originalText'), 'Hello\n\nWorld');
  });

  it('returns empty string when all paragraphs are empty for field', () => {
    const paragraphs: Paragraph[] = [{ id: 'p1', index: 0, originalText: 'A', status: 'pending' }];
    assert.equal(mergeParagraphsToText(paragraphs, 'translatedText'), '');
  });
});

describe('getChapterStats', () => {
  it('returns zeros for chapter without paragraphs', () => {
    const stats = getChapterStats({ paragraphs: [] } as unknown as Chapter);
    assert.deepEqual(stats, {
      total: 0,
      pending: 0,
      translated: 0,
      edited: 0,
      approved: 0,
      progress: 0,
    });
  });

  it('computes progress from paragraph statuses', () => {
    const chapter = {
      paragraphs: [
        { id: 'p1', index: 0, originalText: 'A', status: 'translated' },
        { id: 'p2', index: 1, originalText: 'B', status: 'pending' },
        { id: 'p3', index: 2, originalText: 'C', status: 'approved' },
        { id: 'p4', index: 3, originalText: 'D', status: 'edited' },
      ],
    } as Chapter;
    const stats = getChapterStats(chapter);
    assert.equal(stats.total, 4);
    assert.equal(stats.pending, 1);
    assert.equal(stats.translated, 1);
    assert.equal(stats.edited, 1);
    assert.equal(stats.approved, 1);
    assert.equal(stats.progress, 75);
  });
});
