import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Character, Glossary, Location, Term } from '../types/glossary.js';
import {
  filterGlossaryByChapter,
  filterGlossaryForChunk,
  getChapterCastCharacters,
} from './glossary-filter.js';

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

  it('defaults to source match mode', () => {
    const result = filterGlossaryForChunk('只见张三丰走来', zhGlossary);
    assert.equal(result.characters.length, 1);
    assert.equal(result.characters[0].originalName, '张三丰');
  });

  it('returns empty collections for blank text without dropping glossary identity', () => {
    const empty = filterGlossaryForChunk('', zhGlossary, 'source');
    const whitespace = filterGlossaryForChunk('   ', zhGlossary, 'source');
    assert.equal(empty.novelId, 'test');
    assert.equal(empty.characters.length, 0);
    assert.equal(empty.locations.length, 0);
    assert.equal(empty.terms.length, 0);
    assert.equal(whitespace.characters.length, 0);
  });

  it('source mode: matches character aliases when the original name is absent', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'Elizabeth Bennet',
          translatedName: 'Элизабет',
          declensions: emptyDeclensions,
          gender: 'female',
          description: '',
          aliases: ['Lizzy'],
          firstAppearance: 1,
          isMainCharacter: true,
        },
      ],
    });
    const result = filterGlossaryForChunk('Lizzy walked into the room', glossary, 'source');
    assert.equal(result.characters.length, 1);
    const originalOnly = filterGlossaryForChunk('Darcy walked into the room', glossary, 'source');
    assert.equal(originalOnly.characters.length, 0);
  });

  it('source mode: matches Latin names case-insensitively', () => {
    const glossary = makeGlossary({
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
          isMainCharacter: true,
        },
      ],
    });
    const result = filterGlossaryForChunk('harry potter appeared', glossary, 'source');
    assert.equal(result.characters.length, 1);
  });

  it('source mode: matches first word of a multi-word Latin name', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'Severus Snape',
          translatedName: 'Северус Снейп',
          declensions: emptyDeclensions,
          gender: 'male',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const result = filterGlossaryForChunk('Severus entered the dungeon', glossary, 'source');
    assert.equal(result.characters.length, 1);
  });

  it('source mode: does not treat a single-letter first name as a word-boundary fallback', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'A Player',
          translatedName: 'Игрок',
          declensions: emptyDeclensions,
          gender: 'unknown',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const result = filterGlossaryForChunk('A storm gathered over the hills', glossary, 'source');
    assert.equal(result.characters.length, 0);
  });

  it('source mode: matches names that need regex escaping', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'Mr. Darcy',
          translatedName: 'Мистер Дарси',
          declensions: emptyDeclensions,
          gender: 'male',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const result = filterGlossaryForChunk('Mr. Darcy arrived late', glossary, 'source');
    assert.equal(result.characters.length, 1);
    const falsePositive = filterGlossaryForChunk('MrX Darcy arrived late', glossary, 'source');
    assert.equal(falsePositive.characters.length, 0);
  });

  it('ignores whitespace-only original names', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: '   ',
          translatedName: 'Пусто',
          declensions: emptyDeclensions,
          gender: 'unknown',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });
    const result = filterGlossaryForChunk('anything goes here', glossary, 'source');
    assert.equal(result.characters.length, 0);
  });

  it('target mode: ignores empty declension forms', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c1',
          originalName: 'Alice',
          translatedName: 'Алиса',
          declensions: {
            nominative: 'Алиса',
            genitive: '',
            dative: '   ',
            accusative: 'Алису',
            instrumental: '',
            prepositional: '',
          },
          gender: 'female',
          description: '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: true,
        },
      ],
    });
    const hit = filterGlossaryForChunk('Он увидел Алису у реки.', glossary, 'target');
    assert.equal(hit.characters.length, 1);
    const miss = filterGlossaryForChunk('Пустая строка не должна матчиться.', glossary, 'target');
    assert.equal(miss.characters.length, 0);
  });
});

function makeCharacter(overrides: Partial<Character> & Pick<Character, 'id' | 'originalName'>): Character {
  return {
    translatedName: overrides.translatedName ?? overrides.originalName,
    declensions: emptyDeclensions,
    gender: 'unknown',
    description: '',
    aliases: [],
    firstAppearance: 1,
    isMainCharacter: false,
    ...overrides,
  };
}

function makeLocation(overrides: Partial<Location> & Pick<Location, 'id' | 'originalName'>): Location {
  return {
    translatedName: overrides.translatedName ?? overrides.originalName,
    description: '',
    type: 'other',
    ...overrides,
  };
}

function makeTerm(overrides: Partial<Term> & Pick<Term, 'id' | 'originalTerm'>): Term {
  return {
    translatedTerm: overrides.translatedTerm ?? overrides.originalTerm,
    category: 'other',
    description: '',
    ...overrides,
  };
}

describe('filterGlossaryByChapter', () => {
  it('keeps entries with no chapter data and drops those mentioned elsewhere', () => {
    const glossary = makeGlossary({
      characters: [
        makeCharacter({ id: 'legacy', originalName: 'Legacy', mentionedInChapters: undefined }),
        makeCharacter({ id: 'empty', originalName: 'Empty', mentionedInChapters: [] }),
        makeCharacter({ id: 'here', originalName: 'Here', mentionedInChapters: [2, 5] }),
        makeCharacter({ id: 'other', originalName: 'Other', mentionedInChapters: [1] }),
      ],
      locations: [
        makeLocation({ id: 'keep-loc', originalName: 'KeepLoc', mentionedInChapters: [2] }),
        makeLocation({ id: 'drop-loc', originalName: 'DropLoc', mentionedInChapters: [9] }),
      ],
      terms: [
        makeTerm({ id: 'keep-term', originalTerm: 'KeepTerm', mentionedInChapters: [2] }),
        makeTerm({ id: 'drop-term', originalTerm: 'DropTerm', mentionedInChapters: [4] }),
      ],
    });

    const result = filterGlossaryByChapter(glossary, 2);
    assert.deepEqual(
      result.characters.map((c) => c.id),
      ['legacy', 'empty', 'here']
    );
    assert.deepEqual(
      result.locations.map((l) => l.id),
      ['keep-loc']
    );
    assert.deepEqual(
      result.terms.map((t) => t.id),
      ['keep-term']
    );
  });
});

describe('getChapterCastCharacters', () => {
  it('orders main characters first, then earlier firstAppearance, and applies cap', () => {
    const glossary = makeGlossary({
      characters: [
        makeCharacter({
          id: 'late-side',
          originalName: 'Late',
          firstAppearance: 4,
          isMainCharacter: false,
          mentionedInChapters: [1],
        }),
        makeCharacter({
          id: 'early-side',
          originalName: 'Early',
          firstAppearance: 1,
          isMainCharacter: false,
          mentionedInChapters: [1],
        }),
        makeCharacter({
          id: 'main',
          originalName: 'Main',
          firstAppearance: 8,
          isMainCharacter: true,
          mentionedInChapters: [1],
        }),
        makeCharacter({
          id: 'other-chapter',
          originalName: 'Elsewhere',
          firstAppearance: 1,
          isMainCharacter: true,
          mentionedInChapters: [9],
        }),
      ],
    });

    const ordered = getChapterCastCharacters(glossary, 1);
    assert.deepEqual(
      ordered.map((c) => c.id),
      ['main', 'early-side', 'late-side']
    );

    const capped = getChapterCastCharacters(glossary, 1, 2);
    assert.deepEqual(
      capped.map((c) => c.id),
      ['main', 'early-side']
    );
  });
});

