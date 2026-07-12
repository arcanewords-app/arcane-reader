import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_READER_SETTINGS,
  getReaderSettings,
  mergeParagraphsToText,
  parseTextToParagraphs,
} from './text-utils.js';
import type { Paragraph, ProjectSettings, ReaderSettings } from './types.js';

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
});
