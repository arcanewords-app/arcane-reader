import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { syncEditedMarkersToParagraphs } from './paragraphSync.js';
import type { Paragraph } from '../storage/types.js';

const PARA_A = '0226e941-e174-461d-8945-9503b50aa761';
const PARA_B = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';

function makeParagraph(id: string, index: number, originalText: string): Paragraph {
  return {
    id,
    index,
    originalText,
    status: 'pending',
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
  });

  it('parses marked text path via duplicate ids in parsed array', () => {
    const part1 = 'First segment.';
    const part2 = 'Second segment.';
    const originals = [makeParagraph(PARA_B, 0, 'Source text.')];
    const parsed = [
      { id: PARA_B, text: part1 },
      { id: PARA_B, text: part2 },
    ];
    const result = syncEditedMarkersToParagraphs(originals, parsed);
    assert.equal(result[0]?.translatedText, `${part1}\n\n${part2}`);
  });
});
