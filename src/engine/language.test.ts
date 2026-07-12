import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  assertSupportedPair,
  isLatinScriptName,
  isSupportedPair,
  languageDisplayName,
  parseProjectLanguage,
  parseProjectLanguagePair,
  sourcesForTarget,
} from './language.js';

describe('language', () => {
  it('parseProjectLanguage falls back for invalid values', () => {
    assert.equal(parseProjectLanguage('en', 'source'), 'en');
    assert.equal(parseProjectLanguage('ja', 'source'), 'en');
    assert.equal(parseProjectLanguage('fr', 'target'), 'ru');
  });

  it('parseProjectLanguagePair validates supported pairs', () => {
    const pair = parseProjectLanguagePair('ko', 'ru');
    assert.deepEqual(pair, { sourceLanguage: 'ko', targetLanguage: 'ru' });
    assert.throws(() => parseProjectLanguagePair('ru', 'ru'));
  });

  it('isSupportedPair and assertSupportedPair', () => {
    assert.equal(isSupportedPair('ru', 'be'), true);
    assert.equal(isSupportedPair('en', 'en'), false);
    assert.throws(() => assertSupportedPair('en', 'en'));
  });

  it('sourcesForTarget filters by target language', () => {
    assert.deepEqual(sourcesForTarget('ru'), ['en', 'ko', 'zh']);
    assert.deepEqual(sourcesForTarget('be'), ['en', 'ko', 'zh', 'ru']);
  });

  it('languageDisplayName returns human label', () => {
    assert.equal(languageDisplayName('be'), 'Belarusian');
  });

  it('isLatinScriptName detects Latin-only names', () => {
    assert.equal(isLatinScriptName('Alice'), true);
    assert.equal(isLatinScriptName('Алиса'), false);
  });
});
