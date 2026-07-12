import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Glossary } from '../types/glossary.js';
import { GlossaryManager, formatGenderCompactTag } from './glossary-manager.js';

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

describe('GlossaryManager edit prompt formatting', () => {
  const zhRuGlossary = makeGlossary({
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
        description: 'elder',
        aliases: [],
        firstAppearance: 1,
        isMainCharacter: true,
      },
      {
        id: 'c2',
        originalName: '李明',
        translatedName: 'Ли Мин',
        declensions: {
          nominative: 'Ли Мин',
          genitive: 'Ли Мин',
          dative: 'Ли Мин',
          accusative: 'Ли Мин',
          instrumental: 'Ли Мин',
          prepositional: 'Ли Мин',
        },
        gender: 'female',
        description: '',
        aliases: [],
        firstAppearance: 1,
        isMainCharacter: false,
      },
    ],
    locations: [
      {
        id: 'l1',
        originalName: '青云门',
        translatedName: 'Секта Цинъюнь',
        description: 'sect',
        type: 'other',
      },
    ],
    terms: [
      {
        id: 't1',
        originalTerm: '筑基',
        translatedTerm: 'Создание основы',
        category: 'other',
        description: 'cultivation',
      },
    ],
  });

  it('toEditPromptText: target forms only, no source script', () => {
    const text = new GlossaryManager(zhRuGlossary).toEditPromptText({
      targetLanguageLabel: 'Russian',
    });
    assert.ok(text.includes('Canonical **Russian** forms'));
    assert.ok(text.includes('Сан Фэнцзы [male]'));
    assert.ok(text.includes('род.: Сана Фэнцзы'));
    assert.ok(text.includes('Секта Цинъюнь'));
    assert.ok(text.includes('Создание основы'));
    assert.ok(!text.includes('张三丰'));
    assert.ok(!text.includes('筑基'));
    assert.ok(!text.includes('→'));
  });

  it('toEditPromptText: omits declension line when all cases match nominative', () => {
    const text = new GlossaryManager(zhRuGlossary).toEditPromptText();
    const liMinLine = text.split('\n').find((line) => line.includes('Ли Мин'));
    assert.ok(liMinLine);
    assert.ok(!liMinLine!.includes('род.'));
  });

  it('toEditCastPromptText: translated names only', () => {
    const castText = GlossaryManager.toEditCastPromptText(zhRuGlossary.characters);
    assert.ok(castText.includes('Ли Мин [f]'));
    assert.ok(castText.includes('Сан Фэнцзы [m]'));
    assert.ok(!castText.includes('李明'));
    assert.ok(!castText.includes('→'));
  });

  it('toPromptText regression: bilingual source → target', () => {
    const text = new GlossaryManager(zhRuGlossary).toPromptText({
      targetLanguageLabel: 'Russian',
    });
    assert.ok(text.includes('张三丰 → Сан Фэнцзы'));
    assert.ok(text.includes('筑基 → Создание основы'));
  });

  it('toCastPromptText regression: bilingual cast for translate', () => {
    const castText = GlossaryManager.toCastPromptText(zhRuGlossary.characters);
    assert.ok(castText.includes('李明 → Ли Мин [f]'));
  });

  it('addCharacter increases glossary and can round-trip to prompt', () => {
    const manager = new GlossaryManager(makeGlossary());
    manager.addCharacter({
      originalName: '王五',
      translatedName: 'Ван У',
      gender: 'male',
      description: 'side character',
      isMainCharacter: false,
    });
    assert.equal(manager.characterCount, 1);
    const text = manager.toPromptText({ targetLanguageLabel: 'Russian' });
    assert.ok(text.includes('王五 → Ван У'));
  });
});

describe('GlossaryManager CRUD and utilities', () => {
  it('createEmpty starts with zero entries', () => {
    const manager = GlossaryManager.createEmpty('novel-empty');
    assert.equal(manager.characterCount, 0);
    assert.equal(manager.locationCount, 0);
    assert.equal(manager.termCount, 0);
    assert.equal(manager.getData().novelId, 'novel-empty');
  });

  it('addLocation and addTerm dedupe by original name/term', () => {
    const manager = new GlossaryManager(makeGlossary());
    const loc1 = manager.addLocation({
      originalName: 'Tokyo',
      translatedName: 'Токио',
      type: 'city',
    });
    const loc2 = manager.addLocation({
      originalName: 'Tokyo',
      translatedName: 'Токио',
      type: 'city',
    });
    const term1 = manager.addTerm({
      originalTerm: 'ki',
      translatedTerm: 'ки',
      category: 'magic',
    });
    const term2 = manager.addTerm({
      originalTerm: 'ki',
      translatedTerm: 'ки',
      category: 'magic',
    });

    assert.equal(loc1.id, loc2.id);
    assert.equal(term1.id, term2.id);
    assert.equal(manager.locationCount, 1);
    assert.equal(manager.termCount, 1);
  });

  it('findCharacter resolves aliases case-insensitively', () => {
    const manager = new GlossaryManager(makeGlossary());
    const character = manager.addCharacter({
      originalName: 'John Smith',
      translatedName: 'Джон Смит',
      gender: 'male',
      aliases: ['Johnny'],
    });
    assert.equal(manager.findCharacter('johnny')?.id, character.id);
  });

  it('updateCharacter recalculates declensions when translated name changes', () => {
    const manager = new GlossaryManager(makeGlossary());
    const character = manager.addCharacter({
      originalName: 'Ivan',
      translatedName: 'Иван',
      gender: 'male',
    });
    const updated = manager.updateCharacter(character.id, { translatedName: 'Пётр' });
    assert.ok(updated);
    assert.notEqual(updated!.declensions.nominative, 'Иван');
    assert.equal(updated!.declensions.nominative, updated!.translatedName);
  });

  it('getCharacterInCase returns declined form', () => {
    const manager = new GlossaryManager(makeGlossary());
    manager.addCharacter({
      originalName: 'Maria',
      translatedName: 'Мария',
      gender: 'female',
    });
    const genitive = manager.getCharacterInCase('Maria', 'genitive');
    assert.ok(genitive);
    assert.notEqual(genitive, 'Мария');
  });

  it('applyUpdate adds characters, locations, and terms from analysis payload', () => {
    const manager = new GlossaryManager(makeGlossary());
    manager.applyUpdate({
      newCharacters: [
        {
          originalName: 'Sidekick',
          translatedName: 'Помощник',
          declensions: {
            nominative: 'Помощник',
            genitive: 'Помощника',
            dative: 'Помощнику',
            accusative: 'Помощника',
            instrumental: 'Помощником',
            prepositional: 'Помощнике',
          },
          gender: 'neutral',
          description: '',
          aliases: [],
          firstAppearance: 2,
          isMainCharacter: false,
        },
      ],
      newLocations: [
        {
          originalName: 'Harbor',
          translatedName: 'Гавань',
          type: 'other',
          description: '',
        },
      ],
      newTerms: [
        {
          originalTerm: 'spell',
          translatedTerm: 'заклинание',
          category: 'magic',
          description: '',
        },
      ],
      updatedCharacters: [],
      updatedLocations: [],
      updatedTerms: [],
    });

    assert.equal(manager.characterCount, 1);
    assert.equal(manager.locationCount, 1);
    assert.equal(manager.termCount, 1);
  });

  it('findCharacterByName matches original, translated, or alias', () => {
    const glossary = makeGlossary({
      characters: [
        {
          id: 'c-alias',
          originalName: '王五',
          translatedName: 'Ван У',
          declensions: {
            nominative: 'Ван У',
            genitive: 'Ван У',
            dative: 'Ван У',
            accusative: 'Ван У',
            instrumental: 'Ван У',
            prepositional: 'Ван У',
          },
          gender: 'male',
          description: '',
          aliases: ['Wu'],
          firstAppearance: 1,
          isMainCharacter: false,
        },
      ],
    });

    assert.equal(GlossaryManager.findCharacterByName(glossary, 'ван у')?.id, 'c-alias');
    assert.equal(GlossaryManager.findCharacterByName(glossary, 'Wu')?.id, 'c-alias');
  });

  it('round-trips JSON via fromJSON and toJSON', () => {
    const manager = new GlossaryManager(makeGlossary());
    manager.addCharacter({
      originalName: 'Anna',
      translatedName: 'Анна',
      gender: 'female',
    });
    const restored = GlossaryManager.fromJSON(manager.toJSON());
    assert.equal(restored.characterCount, 1);
    assert.equal(restored.findCharacter('Anna')?.translatedName, 'Анна');
  });

  it('toPromptText compact:false includes descriptions', () => {
    const manager = new GlossaryManager(makeGlossary());
    manager.addCharacter({
      originalName: 'Guide',
      translatedName: 'Гид',
      gender: 'neutral',
      description: 'mentor role',
    });
    const text = manager.toPromptText({ compact: false, targetLanguageLabel: 'Russian' });
    assert.ok(text.includes('mentor role'));
  });

  it('formatGenderCompactTag maps gender enum to compact tags', () => {
    assert.equal(formatGenderCompactTag('male'), 'm');
    assert.equal(formatGenderCompactTag('female'), 'f');
    assert.equal(formatGenderCompactTag('neutral'), 'n');
    assert.equal(formatGenderCompactTag('unknown'), '?');
  });
});
