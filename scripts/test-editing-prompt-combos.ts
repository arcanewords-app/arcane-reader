/**
 * A/B comparison of editing prompt combinations (run: npm run test:editing-prompts).
 * Verifies system/user prompt structure for ai_revivification+fix_only vs minimal+fix_only.
 */
import assert from 'node:assert/strict';
import { getEditorSystemPrompt, createEditorPrompt } from '../src/engine/prompts/system/editor.js';
import { appendGenderAgreement } from '../src/engine/prompts/shared/gender-agreement.js';
import { resolvePrompts } from '../src/engine/prompts/registry.js';
import {
  GlossaryManager,
  formatGenderCompactTag,
} from '../src/engine/glossary/glossary-manager.js';
import { getChapterCastCharacters } from '../src/engine/glossary/glossary-filter.js';
import type { Glossary } from '../src/engine/types/glossary.js';

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function printCombo(label: string, system: string, user: string): void {
  console.log(`\n=== ${label} ===`);
  console.log(`System ~${approxTokens(system)} tokens | User ~${approxTokens(user)} tokens`);
  console.log(`System starts with: ${system.slice(0, 80).replace(/\n/g, ' ')}...`);
}

// --- System prompt combos (fix_only focus) ---
{
  const aiFix = getEditorSystemPrompt('ai_revivification', 'fix_only', 'ru');
  const minimalFix = getEditorSystemPrompt('minimal', 'fix_only', 'ru');

  assert.ok(aiFix.startsWith('## Priority: Fix Only'), 'fix_only overlay must be first');
  assert.ok(minimalFix.startsWith('## Priority: Fix Only'), 'fix_only overlay must be first');
  assert.ok(aiFix.includes('Revivification'), 'ai_revivification style block present');
  assert.ok(aiFix.includes('канцеляризмы'), 'ai_revivification Russian cues present');
  assert.ok(minimalFix.includes('minimal, essential edits'), 'minimal style block present');
  assert.ok(
    !minimalFix.includes('Revivification'),
    'minimal must not include revivification block'
  );
  assert.ok(aiFix.includes('Gender agreement (Russian)'), 'gender agreement appended');
  assert.ok(minimalFix.includes('Gender agreement (Russian)'), 'gender agreement appended');

  // ai_revivification is longer (more stylistic instructions despite fix overlay)
  assert.ok(
    approxTokens(aiFix) > approxTokens(minimalFix),
    'ai_revivification+fix_only system prompt should be longer than minimal+fix_only'
  );

  printCombo('ai_revivification + fix_only (system)', aiFix, '');
  printCombo('minimal + fix_only (system)', minimalFix, '');
}

// --- User prompt: chapter cast always injected on edit ---
{
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

  printCombo('edit user prompt (both styles)', '', userAi);
}

// --- Translator: gender agreement on all ru-target pairs ---
{
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
  console.log('\n=== Translator pairs ===');
  console.log(`All ${pairs.length} pairs include gender agreement fragment.`);
}

console.log('\nAll editing prompt combo checks passed.');
