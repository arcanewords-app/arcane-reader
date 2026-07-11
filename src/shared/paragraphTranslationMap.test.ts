import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildParagraphTranslationMap,
  detectSuspectTruncations,
  getDuplicateParagraphKeys,
  hasDuplicateParagraphKeys,
  normalizeParagraphKey,
} from './paragraphTranslationMap.js';

describe('normalizeParagraphKey', () => {
  it('strips --para:…-- wrapper', () => {
    assert.equal(
      normalizeParagraphKey('--para:e03cdd57-48d5-4b35-82eb-e98e224d6270--'),
      'e03cdd57-48d5-4b35-82eb-e98e224d6270'
    );
  });

  it('returns bare uuid unchanged', () => {
    assert.equal(
      normalizeParagraphKey('e03cdd57-48d5-4b35-82eb-e98e224d6270'),
      'e03cdd57-48d5-4b35-82eb-e98e224d6270'
    );
  });
});

describe('hasDuplicateParagraphKeys', () => {
  it('detects duplicate marker ids', () => {
    const id = '--para:e03cdd57-48d5-4b35-82eb-e98e224d6270--';
    assert.equal(hasDuplicateParagraphKeys([{ id }, { id: 'other' }, { id }]), true);
  });

  it('returns false when ids are unique', () => {
    assert.equal(hasDuplicateParagraphKeys([{ id: 'a' }, { id: 'b' }]), false);
  });
});

describe('getDuplicateParagraphKeys', () => {
  it('lists ids that appear more than once', () => {
    const dup = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
    assert.deepEqual(
      getDuplicateParagraphKeys([
        { id: `--para:${dup}--` },
        { id: `--para:${dup}--` },
        { id: '--para:other--' },
      ]),
      [dup]
    );
  });
});

describe('buildParagraphTranslationMap', () => {
  it('concatenates duplicate ids preserving order (Test bel regression)', () => {
    const paraB = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
    const part1 = 'A'.repeat(1992);
    const part2 = 'B'.repeat(345);

    const { map, mergedDuplicates } = buildParagraphTranslationMap([
      { id: `--para:${paraB}--`, text: part1 },
      { id: `--para:${paraB}--`, text: part2 },
    ]);

    assert.equal(map.get(paraB), `${part1}\n\n${part2}`);
    assert.equal(map.get(paraB)!.length, 1992 + 2 + 345);
    assert.deepEqual(mergedDuplicates, [{ paragraphId: paraB, partsCount: 2 }]);
  });

  it('normalizes mixed id formats to same key', () => {
    const id = 'abc-123';
    const { map } = buildParagraphTranslationMap([
      { id: `--para:${id}--`, text: 'First.' },
      { id, text: 'Second.' },
    ]);
    assert.equal(map.get(id), 'First.\n\nSecond.');
  });
});

describe('detectSuspectTruncations', () => {
  it('flags short translation vs long original', () => {
    const original = 'x'.repeat(200);
    const translated = 'y'.repeat(50);
    const suspects = detectSuspectTruncations([
      { id: 'p1', originalText: original, translatedText: translated },
    ]);
    assert.equal(suspects.length, 1);
    assert.equal(suspects[0]?.paragraphId, 'p1');
    assert.ok(suspects[0]!.ratio < 0.55);
  });

  it('ignores separator paragraphs and short originals', () => {
    assert.deepEqual(
      detectSuspectTruncations([
        { id: 's', originalText: '***', translatedText: '*' },
        { id: 'short', originalText: 'Hi', translatedText: 'X' },
      ]),
      []
    );
  });
});
