import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { syncEditedMarkersToParagraphs, syncTranslationJSONToParagraphs } from './paragraphSync.js';
import type { Paragraph } from '../storage/types.js';

const PARA_A = '0226e941-e174-461d-8945-9503b50aa761';
const PARA_B = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';

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
  };
}

describe('syncEditedMarkersToParagraphs', () => {
  it('merges duplicate marker blocks for same paragraph id (Test bel regression)', () => {
    const part1 = 'A'.repeat(1992);
    const part2 = 'B'.repeat(345);

    const parsed = [
      { id: PARA_A, text: 'Short para A.' },
      { id: PARA_B, text: part1 },
      { id: PARA_B, text: part2 },
    ];

    const originals = [
      makeParagraph(PARA_A, 0, 'x'.repeat(2000)),
      makeParagraph(PARA_B, 1, 'y'.repeat(2500)),
    ];

    const result = syncEditedMarkersToParagraphs(originals, parsed);
    const paraB = result.find((p) => p.id === PARA_B);
    assert.ok(paraB?.translatedText);
    assert.equal(paraB.translatedText, `${part1}\n\n${part2}`);
    assert.equal(paraB.translatedText.length, 1992 + 2 + 345);
    assert.equal(paraB.status, 'edited');
  });

  it('leaves separator paragraphs unchanged', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph('sep', 1, '***')];
    const parsed = [{ id: PARA_A, text: 'Привет' }];
    const result = syncEditedMarkersToParagraphs(originals, parsed);
    assert.equal(result[0]?.translatedText, 'Привет');
    assert.equal(result[1]?.translatedText, undefined);
    assert.equal(result[1]?.originalText, '***');
  });

  it('keeps paragraph when id missing from parsed edits', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Source only')];
    const result = syncEditedMarkersToParagraphs(originals, []);
    assert.equal(result[0]?.translatedText, undefined);
    assert.equal(result[0]?.status, 'pending');
  });
});

describe('syncTranslationJSONToParagraphs', () => {
  it('maps translated JSON rows by paragraph id', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph(PARA_B, 1, 'World')];
    const result = syncTranslationJSONToParagraphs(originals, {
      paragraphs: [
        { id: PARA_A, translated: 'Привет' },
        { id: PARA_B, translated: 'Мир' },
      ],
    });
    assert.equal(result[0]?.translatedText, 'Привет');
    assert.equal(result[0]?.status, 'translated');
    assert.equal(result[1]?.translatedText, 'Мир');
  });

  it('returns empty array when originals empty', () => {
    assert.deepEqual(
      syncTranslationJSONToParagraphs([], { paragraphs: [{ id: 'x', translated: 'y' }] }),
      []
    );
  });

  it('returns originals when JSON has no paragraphs', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hi')];
    const result = syncTranslationJSONToParagraphs(originals, { paragraphs: [] });
    assert.equal(result, originals);
  });

  it('preserves existing translation in partial mode', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello', 'Existing'),
      makeParagraph(PARA_B, 1, 'World'),
    ];
    const result = syncTranslationJSONToParagraphs(
      originals,
      { paragraphs: [{ id: PARA_B, translated: 'Мир' }] },
      true
    );
    assert.equal(result[0]?.translatedText, 'Existing');
    assert.equal(result[1]?.translatedText, 'Мир');
  });

  it('merges duplicate ids in JSON like marker sync', () => {
    const originals = [makeParagraph(PARA_B, 0, 'Long source')];
    const result = syncTranslationJSONToParagraphs(originals, {
      paragraphs: [
        { id: PARA_B, translated: 'Part one' },
        { id: PARA_B, translated: 'Part two' },
      ],
    });
    assert.equal(result[0]?.translatedText, 'Part one\n\nPart two');
  });
});
