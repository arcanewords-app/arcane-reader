import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from './novel-agent.js';

describe('NovelAgent', () => {
  it('create initializes glossary and language pair', () => {
    const agent = NovelAgent.create({
      novelId: 'novel-1',
      title: 'Test Novel',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    const ctx = agent.getContext();
    assert.equal(ctx.sourceLanguage, 'en');
    assert.equal(ctx.targetLanguage, 'ru');
    assert.deepEqual(ctx.glossary.characters, []);
  });

  it('round-trips JSON state', () => {
    const agent = NovelAgent.create({
      novelId: 'novel-1',
      title: 'Test Novel',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
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
});
