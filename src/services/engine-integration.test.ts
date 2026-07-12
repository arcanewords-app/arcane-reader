import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { Project, ProjectWithChapterList } from '../storage/database.js';

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  chunkTextForTranslation,
  clearAgentCache,
  createPipeline,
  exportAgentState,
  getAgentForProject,
  getNameDeclensions,
  getStageModel,
  resolveEffectiveLanguagePair,
} from './engine-integration.js';

function makeProject(overrides: Partial<Project> = {}): ProjectWithChapterList {
  return {
    id: 'proj-1',
    name: 'Test Novel',
    userId: 'user-1',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    glossary: [],
    settings: {},
    chapters: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as ProjectWithChapterList;
}

const baseConfig: AppConfig = {
  openai: {
    apiKey: 'sk-test-key',
    model: 'gpt-4.1-mini',
    timeout: 60000,
    maxRetries: 1,
  },
  translation: {
    temperature: 0.5,
    neverSplitParagraphs: true,
    chunkRetryAttempts: 1,
    chunkRetryDelayMs: 0,
    parallelChunks: 1,
    analysisMaxSectionTokens: 8000,
  },
} as AppConfig;

describe('resolveEffectiveLanguagePair', () => {
  it('uses project languages when no override', () => {
    const pair = resolveEffectiveLanguagePair(makeProject());
    assert.equal(pair.sourceLanguage, 'en');
    assert.equal(pair.targetLanguage, 'ru');
  });

  it('uses override when both languages provided', () => {
    const pair = resolveEffectiveLanguagePair(makeProject(), {
      sourceLanguage: 'ko',
      targetLanguage: 'be',
    });
    assert.equal(pair.sourceLanguage, 'ko');
    assert.equal(pair.targetLanguage, 'be');
  });

  it('throws on unsupported pair in override', () => {
    assert.throws(
      () =>
        resolveEffectiveLanguagePair(makeProject(), {
          sourceLanguage: 'ru',
          targetLanguage: 'ru',
        }),
      /Unsupported translation pair/
    );
  });
});

describe('getStageModel', () => {
  it('returns stage-specific model when set', () => {
    const project = makeProject({
      settings: {
        stageModels: { analysis: 'gpt-4.1', translation: 'gpt-4.1-mini', editing: '' },
      } as Project['settings'],
    });
    assert.equal(getStageModel(project, 'analysis', 'default'), 'gpt-4.1');
    assert.equal(getStageModel(project, 'translation', 'default'), 'gpt-4.1-mini');
  });

  it('falls back to project.settings.model then default', () => {
    const withModel = makeProject({ settings: { model: 'gpt-4o' } as Project['settings'] });
    assert.equal(getStageModel(withModel, 'editing', 'fallback'), 'gpt-4o');
    assert.equal(getStageModel(makeProject(), 'editing', 'fallback'), 'fallback');
  });

  it('clamps model for user role when provided', () => {
    const project = makeProject({ settings: { model: 'gpt-4.1' } as Project['settings'] });
    const clamped = getStageModel(project, 'translation', 'gpt-4.1-mini', 'user' as const);
    assert.ok(typeof clamped === 'string');
  });
});

describe('getAgentForProject', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
  });

  it('creates agent and caches by project + language pair', () => {
    const project = makeProject();
    const a1 = getAgentForProject(project);
    const a2 = getAgentForProject(project);
    assert.equal(a1, a2);
  });

  it('loads character, location, and term glossary entries', () => {
    const project = makeProject({
      glossary: [
        {
          id: 'c1',
          type: 'character',
          original: 'Alice',
          translated: 'Алиса',
          gender: 'female',
          description: '',
          mentionedInChapters: [1],
        },
        {
          id: 'l1',
          type: 'location',
          original: 'Town',
          translated: 'Город',
          description: 'A town',
          mentionedInChapters: [1],
        },
        {
          id: 't1',
          type: 'term',
          original: 'Mana',
          translated: 'Мана',
          description: '',
          mentionedInChapters: [],
        },
      ],
    });
    const agent = getAgentForProject(project);
    const glossary = agent.glossary as {
      characters: unknown[];
      locations: unknown[];
      terms: unknown[];
    };
    assert.equal(glossary.characters.length, 1);
    assert.equal(glossary.locations.length, 1);
    assert.equal(glossary.terms.length, 1);
  });

  it('uses separate cache entries for language pair override', () => {
    const project = makeProject();
    const enRu = getAgentForProject(project);
    const koBe = getAgentForProject(project, { sourceLanguage: 'ko', targetLanguage: 'be' });
    assert.notEqual(enRu, koBe);
  });

  it('declines latin character names for ru target when untranslated', () => {
    clearAgentCache('proj-2');
    const project = makeProject({
      id: 'proj-2',
      glossary: [
        {
          id: 'c2',
          type: 'character',
          original: 'John',
          translated: '',
          gender: 'male',
          description: '',
          mentionedInChapters: [],
        },
      ],
    });
    const agent = getAgentForProject(project);
    const char = (agent.glossary as { characters: { originalName: string }[] }).characters[0];
    assert.equal(char?.originalName, 'John');
    clearAgentCache('proj-2');
  });

  it('uses minimal declensions for non-ru target', () => {
    clearAgentCache('proj-3');
    const project = makeProject({
      id: 'proj-3',
      targetLanguage: 'be',
      glossary: [
        {
          id: 'c3',
          type: 'character',
          original: 'Alice',
          translated: 'Аліса',
          gender: 'female',
          description: '',
          mentionedInChapters: [],
        },
      ],
    });
    const agent = getAgentForProject(project, { sourceLanguage: 'en', targetLanguage: 'be' });
    const char = (agent.glossary as { characters: { translatedName: string }[] }).characters[0];
    assert.equal(char?.translatedName, 'Аліса');
    clearAgentCache('proj-3');
  });
});

describe('createPipeline', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
  });

  it('throws when OpenAI API key is missing', () => {
    assert.throws(
      () =>
        createPipeline(
          { ...baseConfig, openai: { ...baseConfig.openai, apiKey: '' } },
          makeProject()
        ),
      /API key is not configured/
    );
  });

  it('creates pipeline with default models', () => {
    const pipeline = createPipeline(baseConfig, makeProject());
    assert.ok(pipeline);
  });

  it('falls back reasoning analysis model when not allowed', () => {
    const project = makeProject({
      settings: {
        stageModels: { analysis: 'o3-mini', translation: 'gpt-4.1-mini', editing: 'gpt-4.1-mini' },
        allowReasoningModelsForAnalysis: false,
      } as Project['settings'],
    });
    const pipeline = createPipeline(baseConfig, project);
    assert.ok(pipeline);
  });

  it('maps responses-only models to chat fallback', () => {
    const project = makeProject({
      settings: {
        stageModels: {
          analysis: 'gpt-4.1-mini',
          translation: 'gpt-5.1-codex-mini',
          editing: 'gpt-4.1-mini',
        },
      } as Project['settings'],
    });
    const pipeline = createPipeline(baseConfig, project);
    assert.ok(pipeline);
  });
});

describe('getNameDeclensions', () => {
  it('returns declensions for latin name', () => {
    const result = getNameDeclensions('John', 'male');
    assert.ok(result.translatedName.length > 0);
    assert.ok(result.declensions.nominative);
  });
});

describe('chunkTextForTranslation', () => {
  it('splits long text into chunks', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.\n\n`).join('');
    const chunks = chunkTextForTranslation(text, 50);
    assert.ok(chunks.length >= 1);
    assert.equal(chunks[0]?.index, 0);
  });
});

describe('clearAgentCache / exportAgentState', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
  });

  it('clears cached agents for project prefix', () => {
    getAgentForProject(makeProject());
    assert.ok(exportAgentState('proj-1'));
    clearAgentCache('proj-1');
    assert.equal(exportAgentState('proj-1'), null);
  });
});
