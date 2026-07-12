import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  declineName,
  detectDeclensionPattern,
  transliterateToRussian,
  translateName,
} from './declension.js';

describe('declension', () => {
  it('detectDeclensionPattern classifies Russian-style names', () => {
    assert.equal(detectDeclensionPattern('Иван', 'male'), 'masculine-consonant');
    assert.equal(detectDeclensionPattern('Мария', 'female'), 'feminine-ya');
  });

  it('declineName returns genitive for Russian male name', () => {
    const forms = declineName('Иван', 'male');
    assert.ok(forms.genitive.length > 0);
  });

  it('transliterateToRussian maps common Latin names', () => {
    assert.equal(transliterateToRussian('Ivan'), 'Иван');
  });

  it('translateName uses common dictionary when available', () => {
    const result = translateName('John', 'male');
    assert.ok(result.translatedName.length > 0);
    assert.ok(result.declensions.nominative.length > 0);
  });
});
