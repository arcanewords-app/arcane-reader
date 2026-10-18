import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  declineFirstName,
  declineNameRu,
  detectGenderFromRussianName,
  translateAndDeclineName,
  transliterateEnToRu,
} from './declension-ru.js';

describe('declineNameRu', () => {
  it('declines Russian male first name to genitive', () => {
    const d = declineFirstName('Иван', 'male');
    assert.ok(d.nominative.length > 0);
    assert.ok(d.genitive.length > 0);
    assert.notEqual(d.nominative, d.genitive);
    assert.match(d.genitive, /Ивана/i);
  });

  it('declines Russian female first name', () => {
    const d = declineFirstName('Мария', 'female');
    assert.ok(d.nominative.includes('Мария'));
    assert.ok(d.genitive.length > 0);
  });

  it('declines first and last name together', () => {
    const d = declineNameRu('Иван', 'male', 'Петров');
    assert.ok(d.nominative.includes('Иван'));
    assert.ok(d.nominative.includes('Петров'));
    assert.ok(d.genitive.length > d.nominative.length - 2);
  });

  it('treats an unknown gender as androgynous and keeps the original when declension throws', () => {
    const declined = declineNameRu('???', 'unknown');
    assert.ok(declined.nominative.length > 0);
  });

  it('detects gender from common Russian endings', () => {
    assert.equal(detectGenderFromRussianName('Анна'), 'female');
    assert.equal(detectGenderFromRussianName('Любовь'), 'female');
    assert.equal(detectGenderFromRussianName('Игорь'), 'male');
    assert.equal(detectGenderFromRussianName('Иван'), 'male');
  });

  it('uses a known translation, a digraph, and leaves unknown characters', () => {
    assert.equal(transliterateEnToRu('John'), 'Джон');
    assert.equal(transliterateEnToRu('Sh'), 'Ш');
    assert.match(transliterateEnToRu('A1'), /а1/i);
  });

  it('translates a known name and declines an unknown one with an explicit gender', () => {
    const known = translateAndDeclineName('Anna');
    assert.equal(known.translatedName, 'Анна');
    assert.equal(known.gender, 'female');
    assert.ok(known.declensions.genitive.length > 0);

    const unknown = translateAndDeclineName('Zed', 'male');
    assert.equal(unknown.gender, 'male');
    assert.ok(unknown.translatedName.length > 0);
  });

  it('returns all six cases', () => {
    const d = declineFirstName('Анна', 'female');
    for (const key of [
      'nominative',
      'genitive',
      'dative',
      'accusative',
      'instrumental',
      'prepositional',
    ] as const) {
      assert.ok(d[key].length > 0, `missing ${key}`);
    }
  });
});
