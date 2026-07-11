import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { declineFirstName, declineNameRu } from './declension-ru.js';

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
