import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getChapterCastCharacters } from '../glossary/glossary-filter.js';
import { GlossaryManager, formatGenderCompactTag } from '../glossary/glossary-manager.js';
import { appendGenderAgreement } from '../prompts/shared/gender-agreement.js';
import { resolvePrompts } from '../prompts/registry.js';
import { createEditorPrompt, getEditorSystemPrompt } from '../prompts/system/editor.js';
import type { Glossary } from '../types/glossary.js';

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe('editing prompt combos', () => {
  it('fix_only overlay is first for ai_revivification and minimal presets', () => {
    const aiFix = getEditorSystemPrompt('ai_revivification', 'fix_only', 'ru');
    const minimalFix = getEditorSystemPrompt('minimal', 'fix_only', 'ru');

    assert.ok(aiFix.startsWith('## Priority: Fix Only'));
    assert.ok(minimalFix.startsWith('## Priority: Fix Only'));
    assert.ok(aiFix.includes('Revivification'));
    assert.ok(aiFix.includes('канцеляризмы'));
    assert.ok(minimalFix.includes('minimal, essential edits'));
    assert.ok(!minimalFix.includes('Revivification'));
    assert.ok(aiFix.includes('Gender agreement (Russian)'));
    assert.ok(minimalFix.includes('Gender agreement (Russian)'));
    assert.ok(
      approxTokens(aiFix) > approxTokens(minimalFix),
      'ai_revivification+fix_only system prompt should be longer than minimal+fix_only'
    );
  });

  it('edit user prompt injects chapter cast and target-only glossary', () => {
    const glossary: Glossary = {
      novelId: 'n1',
      version: 1,
      lastUpdated: new Date(),
      characters: [
        {
          id: 'c1',
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
          description: 'protagonist',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: true,
          mentionedInChapters: [1],
        },
        {
          id: 'c2',
          originalName: '张伟',
          translatedName: 'Чжан Вэй',
          declensions: {
            nominative: 'Чжан Вэй',
            genitive: 'Чжан Вэй',
            dative: 'Чжан Вэй',
            accusative: 'Чжан Вэй',
            instrumental: 'Чжан Вэй',
            prepositional: 'Чжан Вэй',
          },
          gender: 'male',
          description: 'rival',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
          mentionedInChapters: [1],
        },
      ],
      locations: [],
      terms: [],
    };

    const castChars = getChapterCastCharacters(glossary, 1);
    const castText = GlossaryManager.toEditCastPromptText(castChars);
    assert.equal(castChars.length, 2);
    assert.ok(castText.includes('Ли Мин [f]'));
    assert.ok(castText.includes('Чжан Вэй [m]'));
    assert.ok(!castText.includes('李明 →'));
    assert.equal(formatGenderCompactTag('unknown'), '?');

    const editGlossaryText = new GlossaryManager(glossary).toEditPromptText({
      targetLanguageLabel: 'Russian',
    });
    assert.ok(!editGlossaryText.includes('李明'));
    assert.ok(editGlossaryText.includes('Ли Мин'));

    const sampleTranslation = 'Она встала и посмотрела на него.';
    const userAi = createEditorPrompt(
      sampleTranslation,
      editGlossaryText,
      undefined,
      undefined,
      'Russian',
      castText
    );
    const userMinimal = createEditorPrompt(
      sampleTranslation,
      editGlossaryText,
      undefined,
      undefined,
      'Russian',
      castText
    );

    assert.ok(userAi.includes('Chapter cast (gender tags)'));
    assert.ok(userAi.includes('[f]'));
    assert.ok(userAi.includes('Reference Glossary'));
    assert.ok(userAi.includes('Ли Мин [female]'));
    assert.equal(
      userAi,
      userMinimal,
      'user prompt same for both styles when preset differs only in system'
    );
  });

  it('translator prompts include gender agreement for all ru/be pairs', () => {
    const pairs = [
      ['en', 'ru'],
      ['ko', 'ru'],
      ['zh', 'ru'],
      ['en', 'be'],
      ['ko', 'be'],
      ['zh', 'be'],
      ['ru', 'be'],
    ] as const;

    for (const [source, target] of pairs) {
      const bundle = resolvePrompts('translate', source, target);
      const system = appendGenderAgreement(bundle.systemPrompt, target);
      const fragment =
        target === 'be' ? 'Gender agreement (Belarusian)' : 'Gender agreement (Russian)';
      assert.ok(
        system.includes(fragment),
        `${source}-${target} translator must include gender rules`
      );
    }
  });
});
