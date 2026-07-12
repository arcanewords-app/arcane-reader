import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Glossary } from '../types/glossary.js';
import { AnalyzeStage } from './stage-1-analyze.js';
import { createMockProvider } from '../test-helpers/mock-llm-provider.js';

function makeExistingGlossary(): Glossary {
  return {
    novelId: 'novel-1',
    version: 1,
    lastUpdated: new Date(),
    characters: [
      {
        id: 'char-existing',
        originalName: 'Alice',
        translatedName: 'Алиса',
        declensions: {
          nominative: 'Алиса',
          genitive: 'Алисы',
          dative: 'Алисе',
          accusative: 'Алису',
          instrumental: 'Алисой',
          prepositional: 'Алисе',
        },
        gender: 'female',
        description: 'heroine',
        aliases: [],
        firstAppearance: 1,
        isMainCharacter: true,
      },
    ],
    locations: [],
    terms: [],
  };
}

describe('AnalyzeStage', () => {
  it('returns analysis result from mocked completeJSON', async () => {
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          characters: [{ name: 'Bob', suggestedTranslation: 'Боб', gender: 'male' }],
          locations: [{ name: 'Forest', suggestedTranslation: 'Лес', type: 'region' }],
          terms: [{ term: 'sword', suggestedTranslation: 'меч', category: 'item' }],
          chapterSummary: 'Hero enters the forest.',
          keyEvents: ['Bob appears'],
          mood: 'tense',
        },
        tokensUsed: { prompt: 10, completion: 20, total: 30 },
      }),
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Short chapter text.', {
      chapterNumber: 1,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.chapterNumber, 1);
    assert.equal(result.data?.foundCharacters[0]?.name, 'Bob');
    assert.equal(result.data?.glossaryUpdate.newCharacters[0]?.gender, 'male');
    assert.equal(result.data?.glossaryUpdate.newLocations[0]?.type, 'region');
    assert.equal(result.data?.glossaryUpdate.newTerms[0]?.category, 'item');
  });

  it('returns failure when completeJSON throws', async () => {
    const provider = createMockProvider({
      completeJSON: async () => {
        throw new Error('LLM rate limit exceeded');
      },
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Chapter text.', {
      chapterNumber: 2,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /rate limit/);
    assert.equal(result.tokensUsed, 0);
  });

  it('marks characters in existing glossary as not new', async () => {
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          characters: [{ name: 'Alice', suggestedTranslation: 'Алиса', gender: 'f' }],
          chapterSummary: 'Alice returns.',
        },
        tokensUsed: { prompt: 5, completion: 5, total: 10 },
      }),
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Alice walked in.', {
      chapterNumber: 3,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      existingGlossary: makeExistingGlossary(),
      maxSectionTokens: 0,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.foundCharacters[0]?.isNew, false);
    assert.equal(result.data?.glossaryUpdate.newCharacters.length, 0);
    assert.equal(result.data?.glossaryUpdate.updatedCharacters.length, 0);
  });

  it('maps updatedCharacters for existing glossary entries', async () => {
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          updatedCharacters: [
            {
              originalName: 'Alice',
              description: 'Updated heroine bio',
              suggestedTranslation: 'Алиса В.',
            },
          ],
          chapterSummary: 'Character update.',
        },
        tokensUsed: { prompt: 5, completion: 5, total: 10 },
      }),
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Alice speaks.', {
      chapterNumber: 4,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      existingGlossary: makeExistingGlossary(),
      maxSectionTokens: 0,
    });

    assert.equal(result.success, true);
    const updated = result.data?.glossaryUpdate.updatedCharacters ?? [];
    assert.equal(updated.length, 1);
    assert.equal(updated[0]?.id, 'char-existing');
    assert.equal(updated[0]?.description, 'Updated heroine bio');
    assert.equal(updated[0]?.translatedName, 'Алиса В.');
  });

  it('merges chunked section results when text exceeds maxSectionTokens', async () => {
    const provider = createMockProvider({
      completeJSON: async (_messages, callIndex = 0) => ({
        data: {
          characters: [
            {
              name: `Char-${callIndex + 1}`,
              suggestedTranslation: `Перс-${callIndex + 1}`,
            },
          ],
          chapterSummary: `Part ${callIndex + 1}.`,
          keyEvents: [`event-${callIndex + 1}`],
        },
        tokensUsed: { prompt: 5, completion: 5, total: 10 },
      }),
    });

    const paragraph = 'Word '.repeat(120);
    const longText = Array.from({ length: 8 }, (_, i) => `${paragraph} section-${i}.`).join('\n\n');
    const stage = new AnalyzeStage(provider);
    const result = await stage.execute(longText, {
      chapterNumber: 5,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 50,
    });

    assert.equal(result.success, true);
    assert.ok(provider.getCallCounts().completeJSON >= 2);
    assert.ok((result.data?.foundCharacters.length ?? 0) >= 2);
    assert.ok(result.data?.chapterSummary.includes('Part 1'));
    assert.ok(result.data?.chapterSummary.includes('Part 2'));
    assert.ok((result.data?.keyEvents.length ?? 0) >= 2);
  });

  it('throws when provider is missing completeJSON at construction', () => {
    const broken = {
      name: 'broken',
      model: 'test',
      complete: async () => ({
        content: '',
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        finishReason: 'stop' as const,
        model: 'test',
      }),
      isAvailable: async () => true,
      estimateTokens: () => 0,
    };

    assert.throws(
      () =>
        new AnalyzeStage(broken as unknown as import('../interfaces/llm-provider.js').ILLMProvider),
      /missing completeJSON/
    );
  });

  it('throws when provider is undefined at construction', () => {
    assert.throws(
      () =>
        new AnalyzeStage(
          undefined as unknown as import('../interfaces/llm-provider.js').ILLMProvider
        ),
      /provider is required/
    );
  });

  it('normalizes gender aliases and creates new glossary entries', async () => {
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          characters: [
            { name: 'Bob', suggestedTranslation: 'Боб', gender: 'masculine', role: 'protagonist' },
          ],
          locations: [{ name: 'Town', suggestedTranslation: 'Город', type: 'town' }],
          terms: [{ term: 'spell', suggestedTranslation: 'заклинание', category: 'spell' }],
        },
        tokensUsed: { prompt: 5, completion: 5, total: 10 },
      }),
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Bob cast a spell in town.', {
      chapterNumber: 6,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.glossaryUpdate.newCharacters[0]?.gender, 'male');
    assert.equal(result.data?.glossaryUpdate.newCharacters[0]?.isMainCharacter, true);
    assert.equal(result.data?.glossaryUpdate.newLocations[0]?.type, 'city');
    assert.equal(result.data?.glossaryUpdate.newTerms[0]?.category, 'magic');
  });

  it('maps updated terms for existing glossary entries', async () => {
    const existing = makeExistingGlossary();
    existing.terms = [
      {
        id: 'term-1',
        originalTerm: 'sword',
        translatedTerm: 'меч',
        category: 'item',
        description: 'old',
        mentionedInChapters: [1],
      },
    ];
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          updatedTerms: [
            {
              originalTerm: 'sword',
              description: 'Legendary blade',
              suggestedTranslation: 'клинок',
              category: 'item',
            },
          ],
        },
        tokensUsed: { prompt: 5, completion: 5, total: 10 },
      }),
    });

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('The sword gleams.', {
      chapterNumber: 7,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      existingGlossary: existing,
      maxSectionTokens: 0,
    });

    const updated = result.data?.glossaryUpdate.updatedTerms ?? [];
    assert.equal(updated.length, 1);
    assert.equal(updated[0]?.id, 'term-1');
    assert.equal(updated[0]?.translatedTerm, 'клинок');
  });

  it('returns empty analysis for blank LLM payload', async () => {
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {},
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      }),
    });
    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Short.', {
      chapterNumber: 8,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
    });
    assert.equal(result.success, true);
    assert.equal(result.data?.foundCharacters.length, 0);
    assert.equal(result.data?.chapterSummary, '');
  });

  it('uses prompt overrides when provided', async () => {
    let capturedMessages: { role: string; content: string }[] = [];
    const provider = createMockProvider({
      completeJSON: async (messages) => {
        capturedMessages = messages.map((m) => ({ role: m.role, content: m.content }));
        return {
          data: { chapterSummary: 'ok' },
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
        };
      },
    });
    const stage = new AnalyzeStage(provider);
    await stage.execute('Text.', {
      chapterNumber: 9,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
      systemPromptOverride: 'custom-system',
      userPromptOverride: 'custom-user',
    });
    assert.equal(capturedMessages[0]?.content, 'custom-system');
    assert.equal(capturedMessages[1]?.content, 'custom-user');
  });
});
