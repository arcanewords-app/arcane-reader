import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Glossary } from '../types/glossary.js';
import { GlossaryManager } from './glossary-manager.js';

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
});
