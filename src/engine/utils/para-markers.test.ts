import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  injectParagraphMarkers,
  isSeparatorParagraph,
  normalizeLabSourceText,
  normalizeLabTranslatedText,
  prepareTranslateSourceText,
  splitTextToParagraphContents,
  textHasParagraphMarkers,
  textToDisplayParagraphs,
  collectExpectedParagraphMarkerIds,
  filterJsonParagraphsToChunk,
  tryParseTranslationParagraphsJson,
  mergeJsonParagraphsToMarkedText,
} from './para-markers.js';

describe('isSeparatorParagraph', () => {
  it('detects asterisk and dash separators', () => {
    assert.equal(isSeparatorParagraph('***'), true);
    assert.equal(isSeparatorParagraph('---'), true);
    assert.equal(isSeparatorParagraph('Hello world'), false);
  });
});

describe('normalizeLabSourceText', () => {
  it('returns empty-ish input unchanged', () => {
    assert.equal(normalizeLabSourceText(''), '');
    assert.equal(normalizeLabSourceText('   '), '   ');
  });

  it('normalizes CRLF and injects auto markers', () => {
    const input = 'First para.\r\n\r\nSecond para.';
    const out = normalizeLabSourceText(input);
    assert.ok(textHasParagraphMarkers(out));
    assert.match(out, /--para:auto_0--First para\./);
    assert.match(out, /--para:auto_1--Second para\./);
  });

  it('drops separator-only paragraphs before injecting markers', () => {
    const input = 'One.\n\n***\n\nTwo.';
    const out = normalizeLabSourceText(input);
    assert.equal(out.split('--para:').length - 1, 2);
    assert.match(out, /--para:auto_0--One\./);
    assert.match(out, /--para:auto_1--Two\./);
    assert.doesNotMatch(out, /\*\*\*/);
  });

  it('re-splits partial single marker with internal blank lines', () => {
    const input =
      '--para:auto_0--第1035章众人之力\n\n“正义”女士没有放弃。\n\n“魔术师”女士竭力对抗着。';
    const out = normalizeLabSourceText(input);
    assert.equal(out.split('--para:').length - 1, 3);
    assert.match(out, /--para:auto_0--第1035章众人之力/);
    assert.match(out, /--para:auto_1--“正义”女士没有放弃。/);
    assert.match(out, /--para:auto_2--“魔术师”女士竭力对抗着。/);
  });

  it('re-creates markers for well-formed multi-marker text', () => {
    const marked = injectParagraphMarkers('Alpha.\n\nBeta.');
    const out = normalizeLabSourceText(marked);
    assert.equal(out.split('--para:').length - 1, 2);
    assert.match(out, /--para:auto_0--Alpha\./);
    assert.match(out, /--para:auto_1--Beta\./);
  });
});

describe('prepareTranslateSourceText', () => {
  it('is an alias for normalizeLabSourceText and is idempotent on marked text', () => {
    const plain = 'First.\n\nSecond.';
    const once = prepareTranslateSourceText(plain);
    const twice = prepareTranslateSourceText(once);
    assert.equal(once, twice);
    assert.equal(once.split('--para:').length - 1, 2);
  });
});

describe('textToDisplayParagraphs', () => {
  it('splits partial marker text by blank lines for display', () => {
    const input = '--para:auto_0--One.\n\nTwo.\n\nThree.';
    const paras = textToDisplayParagraphs(input);
    assert.equal(paras.length, 3);
    assert.equal(paras[0]?.text, 'One.');
    assert.equal(paras[2]?.text, 'Three.');
  });
});

describe('splitTextToParagraphContents', () => {
  it('strips markers before splitting', () => {
    const contents = splitTextToParagraphContents('--para:auto_0--A\n\nB');
    assert.deepEqual(contents, ['A', 'B']);
  });
});

describe('tryParseTranslationParagraphsJson', () => {
  it('unwraps translate JSON with paragraph markers', () => {
    const json = JSON.stringify({
      paragraphs: [
        { id: '--para:auto_0--', translated: 'Chapter title' },
        { id: '--para:auto_1--', translated: 'Second paragraph.' },
      ],
    });
    const out = tryParseTranslationParagraphsJson(json);
    assert.ok(out);
    assert.match(out!, /--para:auto_0--Chapter title/);
    assert.match(out!, /--para:auto_1--Second paragraph\./);
    assert.doesNotMatch(out!, /"paragraphs"/);
  });

  it('filters rows to chunk marker ids when chunkContent provided', () => {
    const chunk = '--para:auto_0--Source one.\n\n--para:auto_1--Source two.';
    const json = JSON.stringify({
      paragraphs: [
        { id: '--para:auto_0--', translated: 'One.' },
        { id: '--para:auto_1--', translated: 'Two.' },
        { id: '--para:auto_2--', translated: 'Extra.' },
      ],
    });
    const out = tryParseTranslationParagraphsJson(json, chunk);
    assert.ok(out);
    assert.equal(out!.split('--para:').length - 1, 2);
    assert.doesNotMatch(out!, /Extra\./);
  });

  it('returns null for plain text', () => {
    assert.equal(tryParseTranslationParagraphsJson('Hello.\n\nWorld.'), null);
  });

  it('unwraps many paragraphs (regression: long chapter JSON blob)', () => {
    const paras = Array.from({ length: 106 }, (_, i) => ({
      id: `--para:auto_${i}--`,
      translated: `Paragraph ${i}.`,
    }));
    const json = JSON.stringify({ paragraphs: paras });
    const out = tryParseTranslationParagraphsJson(json);
    assert.ok(out);
    assert.equal(out!.split('--para:').length - 1, 106);
    assert.match(out!, /--para:auto_105--Paragraph 105\./);
  });

  it('collapses duplicate ids in JSON unwrap', () => {
    const paraId = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
    const part1 = 'Part one.';
    const part2 = 'Part two.';
    const json = JSON.stringify({
      paragraphs: [
        { id: `--para:${paraId}--`, translated: part1 },
        { id: `--para:${paraId}--`, translated: part2 },
      ],
    });
    const out = tryParseTranslationParagraphsJson(json);
    assert.ok(out);
    assert.equal(out!.split('--para:').length - 1, 1);
    assert.match(out!, new RegExp(`${part1}\\n\\n${part2}`));
  });
});

describe('mergeJsonParagraphsToMarkedText', () => {
  it('collapses duplicate marker ids into one block', () => {
    const paraId = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
    const out = mergeJsonParagraphsToMarkedText([
      { id: `--para:${paraId}--`, translated: 'Alpha.' },
      { id: `--para:${paraId}--`, translated: 'Beta.' },
    ]);
    assert.equal(out.split('--para:').length - 1, 1);
    assert.match(out, /--para:e03cdd57-48d5-4b35-82eb-e98e224d6270--Alpha\.\n\nBeta\./);
  });
});

describe('normalizeLabTranslatedText', () => {
  it('unwraps JSON before marker normalization', () => {
    const json = JSON.stringify({
      paragraphs: [{ id: '--para:auto_0--', translated: 'Draft line.' }],
    });
    const out = normalizeLabTranslatedText(json);
    assert.equal(out, '--para:auto_0--Draft line.');
  });

  it('falls back to normalizeLabSourceText for plain draft', () => {
    const out = normalizeLabTranslatedText('Alpha.\n\nBeta.');
    assert.match(out, /--para:auto_0--Alpha\./);
    assert.match(out, /--para:auto_1--Beta\./);
  });
});

describe('filterJsonParagraphsToChunk', () => {
  it('keeps only marker ids present in chunk content', () => {
    const chunk =
      '--para:auto_5--Para five.\n\n--para:auto_6--Para six.\n\n--para:auto_7--Para seven.';
    const expected = collectExpectedParagraphMarkerIds(chunk);
    assert.equal(expected.size, 3);
    assert.ok(expected.has('--para:auto_5--'));

    const paras = Array.from({ length: 21 }, (_, i) => ({
      id: `--para:auto_${i}--`,
      translated: `Translation ${i}.`,
    }));

    const filtered = filterJsonParagraphsToChunk(paras, chunk);
    assert.equal(filtered.length, 3);
    assert.deepEqual(
      filtered.map((p) => p.id),
      ['--para:auto_5--', '--para:auto_6--', '--para:auto_7--']
    );
  });

  it('caps rows to paragraph count when chunk has no markers', () => {
    const chunk = 'Alpha.\n\nBeta.\n\nGamma.';
    const paras = [
      { translated: 'One.' },
      { translated: 'Two.' },
      { translated: 'Three.' },
      { translated: 'Four.' },
      { translated: 'Five.' },
    ];
    const filtered = filterJsonParagraphsToChunk(paras, chunk);
    assert.equal(filtered.length, 3);
  });
});
