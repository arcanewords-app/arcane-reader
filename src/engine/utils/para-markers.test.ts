import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  injectParagraphMarkers,
  isSeparatorParagraph,
  normalizeLabSourceText,
  textHasParagraphMarkers,
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

  it('preserves text that already has paragraph markers', () => {
    const marked = injectParagraphMarkers('Alpha.\n\nBeta.');
    const out = normalizeLabSourceText(marked);
    assert.equal(out, marked);
  });
});
