import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Glossary } from '../types/glossary.js';
import { filterGlossaryForChunk } from './glossary-filter.js';

const emptyDeclensions = {
  nominative: '',
  genitive: '',
  dative: '',
  accusative: '',
  instrumental: '',
  prepositional: '',
};

function makeGlossary(
  overrides: Partial<Pick<Glossary, 'characters' | 'locations' | 'terms'>> = {}
): Glossary {
  return {
    novelId: 'test',
    version: 1,
    lastUpdated: new Date(),
    characters: overrides.characters ?? [],
    locations: overrides.locations ?? [],
    terms: overrides.terms ?? [],
  };
}

describe('filterGlossaryForChunk', () => {
  const zhGlossary = makeGlossary({
    characters: [
      {
        id: 'c1',
        originalName: '张三丰',
        translatedName: 'Сан Фэнцзы',
        declensions: {
          nominative: 'Сан Фэнцзы',
          genitive: 'Сана Фэнцзы',
          dative: 'Сану Фэнцзы',
          accusative: 'Сана Фэнцзы',
          instrumental: 'Саном Фэнцзы',
          prepositional: 'Сане Фэнцзы',
        },
        gender: 'male',
        description: '',
        aliases: [],
        firstAppearance: 1,
        isMainCharacter: true,
      },
    ],
    locations: [
      {
        id: 'l1',
        originalName: '青云门',
        translatedName: 'Секта Цинъюнь',
        description: '',
        type: 'other',
      },
    ],
    terms: [
      {
        id: 't1',
        originalTerm: '筑基',
        translatedTerm: 'Создание основы',
        category: 'other',
        description: '',
      },
    ],
  });

  it('source mode: matches CJK original in Chinese text', () => {
    const result = filterGlossaryForChunk('只见张三丰走来', zhGlossary, 'source');
    assert.equal(result.characters.length, 1);
    assert.equal(result.characters[0].originalName, '张三丰');
  });

  it('source mode: matches CJK term and location in Chinese text', () => {
    const result = filterGlossaryForChunk('他突破筑基，回到青云门', zhGlossary, 'source');
    assert.equal(result.terms.length, 1);
    assert.equal(result.locations.length, 1);
  });

  it('source mode: does not false-match unrelated Latin text', () => {
    const enGlossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'Harry Potter',
          translatedName: 'Гарри Поттер',
          declensions: emptyDeclensions,
          gender: 'male',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const noMatch = filterGlossaryForChunk('Harriet went home', enGlossary, 'source');
    assert.equal(noMatch.characters.length, 0);
    const match = filterGlossaryForChunk('Harry went to Hogwarts', enGlossary, 'source');
    assert.equal(match.characters.length, 1);
    const fullName = filterGlossaryForChunk('Harry Potter appeared', enGlossary, 'source');
    assert.equal(fullName.characters.length, 1);
  });

  it('source mode: matches Korean Hangul without word boundaries', () => {
    const koGlossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: '김철수',
          translatedName: 'Ким Чхольсу',
          declensions: emptyDeclensions,
          gender: 'male',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const result = filterGlossaryForChunk('그때 김철수가 말했다', koGlossary, 'source');
    assert.equal(result.characters.length, 1);
  });

  it('target mode: matches translated name in Russian text', () => {
    const result = filterGlossaryForChunk('Вдали появился Сан Фэнцзы.', zhGlossary, 'target');
    assert.equal(result.characters.length, 1);
  });

  it('target mode: matches declension form in Russian text', () => {
    const result = filterGlossaryForChunk(
      'Он встретился с Сана Фэнцзы у ворот.',
      zhGlossary,
      'target'
    );
    assert.equal(result.characters.length, 1);
  });

  it('target mode: matches translated term and location, not CJK originals', () => {
    const result = filterGlossaryForChunk(
      'После Создание основы он вернулся в Секта Цинъюнь.',
      zhGlossary,
      'target'
    );
    assert.equal(result.terms.length, 1);
    assert.equal(result.locations.length, 1);
    assert.equal(result.characters.length, 0);
  });

  it('target mode: does not match CJK originals in Russian text', () => {
    const result = filterGlossaryForChunk('张三丰 пришёл', zhGlossary, 'target');
    assert.equal(result.characters.length, 0);
  });

  it('skips single-character references in substring mode', () => {
    const glossary = makeGlossary({
      terms: [
        {
          id: 't1',
          originalTerm: '门',
          translatedTerm: 'X',
          category: 'other',
          description: '',
        },
      ],
    });
    const result = filterGlossaryForChunk('入门修炼', glossary, 'source');
    assert.equal(result.terms.length, 0);
  });
});
