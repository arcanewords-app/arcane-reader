import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { filterGlossaryForChunk } from '../glossary/glossary-filter.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import type { Glossary } from '../types/glossary.js';

function makeZhRuGlossary(): Glossary {
  return {
    novelId: 'test',
    version: 1,
    lastUpdated: new Date(),
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
  };
}

describe('stage prompt flow', () => {
  const glossary = makeZhRuGlossary();

  it('Translate path: source chunk matches CJK originals', () => {
    const filtered = filterGlossaryForChunk('只见张三丰突破筑基', glossary, 'source');
    assert.equal(filtered.characters.length, 1);
    assert.equal(filtered.terms.length, 1);

    const prompt = new GlossaryManager(filtered).toPromptText({ targetLanguageLabel: 'Russian' });
    assert.ok(prompt.includes('张三丰 → Сан Фэнцзы'));
    assert.ok(prompt.includes('筑基 → Создание основы'));
    assert.ok(prompt.includes('→'));
  });

  it('Edit path: translated chunk matches Russian forms', () => {
    const filtered = filterGlossaryForChunk(
      'Сан Фэнцзы достиг Создание основы в Секта Цинъюнь.',
      glossary,
      'target'
    );
    assert.equal(filtered.characters.length, 1);
    assert.equal(filtered.terms.length, 1);
    assert.equal(filtered.locations.length, 1);

    const prompt = new GlossaryManager(filtered).toEditPromptText({
      targetLanguageLabel: 'Russian',
    });
    assert.ok(prompt.includes('Сан Фэнцзы'));
    assert.ok(!prompt.includes('张三丰'));
    assert.ok(!prompt.includes('→'));
  });

  it('cast format differs by stage', () => {
    const chars = glossary.characters;
    const translateCast = GlossaryManager.toCastPromptText(chars);
    const editCast = GlossaryManager.toEditCastPromptText(chars);

    assert.ok(translateCast.includes('张三丰 → Сан Фэнцзы'));
    assert.ok(editCast.includes('Сан Фэнцзы [m]'));
    assert.ok(!editCast.includes('→'));
    assert.ok(!editCast.includes('张三丰'));
  });
});
