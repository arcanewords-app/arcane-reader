import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from './novel-agent.js';
import type { AnalysisResult } from '../types/agent.js';

function makeAgent() {
  return NovelAgent.create({
    novelId: 'novel-1',
    title: 'Test Novel',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
}

function sampleAnalysis(chapterNumber: number): AnalysisResult {
  return {
    chapterNumber,
    foundCharacters: [{ name: 'Hero', isNew: true, context: 'main' }],
    foundLocations: [{ name: 'Castle', isNew: true }],
    foundTerms: [{ term: 'blade', isNew: true, category: 'item' }],
    chapterSummary: `Chapter ${chapterNumber} summary`,
    keyEvents: ['Hero enters'],
    mood: 'hopeful',
    styleNotes: 'Fast pacing',
    glossaryUpdate: {
      newCharacters: [
        {
          originalName: 'Hero',
          translatedName: 'Герой',
          declensions: {
            nominative: 'Герой',
            genitive: 'Героя',
            dative: 'Герою',
            accusative: 'Героя',
            instrumental: 'Героем',
            prepositional: 'Герое',
          },
          gender: 'male',
          description: 'protagonist',
          aliases: [],
          firstAppearance: chapterNumber,
          isMainCharacter: true,
        },
      ],
      newLocations: [
        {
          originalName: 'Castle',
          translatedName: 'Замок',
          type: 'building',
          description: 'fortress',
        },
      ],
      newTerms: [
        {
          originalTerm: 'blade',
          translatedTerm: 'клинок',
          category: 'item',
          description: 'weapon',
        },
      ],
      updatedCharacters: [],
      updatedLocations: [],
      updatedTerms: [],
    },
  };
}

describe('NovelAgent', () => {
  it('create initializes glossary and language pair', () => {
    const agent = makeAgent();
    const ctx = agent.getContext();
    assert.equal(ctx.sourceLanguage, 'en');
    assert.equal(ctx.targetLanguage, 'ru');
    assert.deepEqual(ctx.glossary.characters, []);
  });

  it('round-trips JSON state', () => {
    const agent = makeAgent();
    agent.recordChapterTranslation({
      chapterNumber: 1,
      summary: 'Intro',
      keyEvents: ['meet hero'],
      activeCharacters: ['Hero'],
      location: 'Village',
    });
    const restored = NovelAgent.fromJSON(agent.toJSON());
    assert.equal(restored.getContext().previousChapters.length, 1);
  });

  it('applyAnalysisResult adds glossary entries and updates context', () => {
    const agent = makeAgent();
    agent.applyAnalysisResult(sampleAnalysis(1));

    assert.equal(agent.glossary.characters.length, 1);
    assert.equal(agent.glossary.locations.length, 1);
    assert.equal(agent.glossary.terms.length, 1);
    assert.equal(agent.findCharacter('Hero')?.translatedName, 'Герой');
    assert.equal(agent.getContext().currentContext.activeCharacters[0], 'Hero');
    assert.ok(agent.styleProfile.writingStyle.includes('Fast pacing'));
  });

  it('updateGlossary updates existing character by id', () => {
    const agent = makeAgent();
    agent.applyAnalysisResult(sampleAnalysis(1));
    const hero = agent.findCharacter('Hero');
    assert.ok(hero);

    agent.updateGlossary({
      newCharacters: [],
      newLocations: [],
      newTerms: [],
      updatedCharacters: [{ id: hero!.id, description: 'Seasoned warrior' }],
      updatedLocations: [],
      updatedTerms: [],
    });

    assert.equal(agent.findCharacter('Hero')?.description, 'Seasoned warrior');
    assert.ok(agent.glossary.version >= 2);
  });

  it('applyBatchAnalysisResults merges glossary and records each chapter', () => {
    const agent = makeAgent();
    agent.applyBatchAnalysisResults([sampleAnalysis(1), sampleAnalysis(2)]);

    assert.equal(agent.glossary.characters.length, 1);
    assert.equal(agent.chapterCount, 2);
    assert.equal(agent.getContext().previousChapters.length, 2);
  });

  it('limits previousChapters context to last five entries', () => {
    const agent = makeAgent();
    for (let i = 1; i <= 7; i += 1) {
      agent.recordChapterTranslation({
        chapterNumber: i,
        summary: `Summary ${i}`,
        keyEvents: [],
        activeCharacters: [],
        location: '',
      });
    }

    assert.equal(agent.chapterCount, 7);
    assert.equal(agent.getContext().previousChapters.length, 5);
    assert.equal(agent.getContext().previousChapters[0]?.chapterNumber, 3);
    assert.equal(agent.getContext().previousChapters[4]?.chapterNumber, 7);
  });

  it('setStyleProfile merges style fields', () => {
    const agent = makeAgent();
    agent.setStyleProfile({ tone: 'dark', dialogueStyle: 'sharp' });
    assert.equal(agent.styleProfile.tone, 'dark');
    assert.equal(agent.styleProfile.dialogueStyle, 'sharp');
  });

  it('findLocation and findTerm resolve by original name', () => {
    const agent = makeAgent();
    agent.applyAnalysisResult(sampleAnalysis(1));
    assert.equal(agent.findLocation('Castle')?.translatedName, 'Замок');
    assert.equal(agent.findTerm('blade')?.translatedTerm, 'клинок');
  });
});
