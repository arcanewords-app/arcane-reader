import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { AnalysisResult } from '../engine/types/agent.js';
import type { PipelineResult } from '../engine/types/pipeline.js';
import { TranslationPipeline } from '../engine/pipeline/translation-pipeline.js';
import type { Chapter, Project, ProjectWithChapterList } from '../storage/database.js';

const { getCachedAnalysisResult, setCachedAnalysisResult, openaiCreate } = vi.hoisted(() => ({
  getCachedAnalysisResult: vi.fn(),
  setCachedAnalysisResult: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./analysisCache.js', () => ({
  getCachedAnalysisResult: (...args: unknown[]) => getCachedAnalysisResult(...args),
  setCachedAnalysisResult: (...args: unknown[]) => setCachedAnalysisResult(...args),
  analysisResultCacheKey: vi.fn(),
  invalidateAnalysisForChapter: vi.fn(),
  invalidateAnalysisForProject: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => openaiCreate(...args),
      },
    };
  },
}));

import {
  analyzeChaptersBatch,
  chunkTextForTranslation,
  clearAgentCache,
  createPipeline,
  detectCharacters,
  exportAgentState,
  getAgentForProject,
  getNameDeclensions,
  getStageModel,
  resolveEffectiveLanguagePair,
  translateChapterWithPipeline,
  translateSimple,
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

function makeChapter(overrides: Partial<Chapter> = {}): Chapter & { originalText: string } {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Chapter 1',
    status: 'pending',
    originalText: 'Hero walks into town.',
    translatedText: '',
    paragraphs: [],
    ...overrides,
  } as Chapter & { originalText: string };
}

function emptyAnalysis(chapterNumber = 1): AnalysisResult {
  return {
    chapterNumber,
    foundCharacters: [{ name: 'Hero', isNew: true, context: 'opening' }],
    foundLocations: [],
    foundTerms: [],
    chapterSummary: 'Hero arrives.',
    keyEvents: ['arrival'],
    mood: 'neutral',
    glossaryUpdate: {
      newCharacters: [
        {
          originalName: 'Hero',
          translatedName: 'Герой',
          gender: 'male',
          description: 'Protagonist',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: true,
          declensions: {
            nominative: 'Герой',
            genitive: 'Героя',
            dative: 'Герою',
            accusative: 'Героя',
            instrumental: 'Героем',
            prepositional: 'Герое',
          },
        },
      ],
      newLocations: [],
      newTerms: [],
      updatedCharacters: [],
      updatedLocations: [],
      updatedTerms: [],
    },
  };
}

function richAnalysis(chapterNumber = 1): AnalysisResult {
  return {
    chapterNumber,
    foundCharacters: [
      { name: 'Hero', isNew: true, context: 'opening' },
      { name: 'Harry', isNew: true, context: 'short form' },
      { name: 'Merlin', isNew: false, context: 'known' },
      { name: 'X', isNew: true, context: 'too short' },
    ],
    foundLocations: [
      { name: 'Town', isNew: true, context: 'place' },
      { name: 'Castle', isNew: false, context: 'known place' },
    ],
    foundTerms: [
      { term: 'Mana', isNew: true, context: 'magic' },
      { term: 'Qi', isNew: false, context: 'known term' },
    ],
    chapterSummary: 'Hero arrives.',
    keyEvents: ['arrival'],
    mood: 'neutral',
    glossaryUpdate: {
      newCharacters: [
        {
          originalName: 'Hero',
          translatedName: 'Герой',
          gender: 'male',
          description: 'Protagonist',
          aliases: [],
          firstAppearance: chapterNumber,
          isMainCharacter: true,
          declensions: {
            nominative: 'Герой',
            genitive: 'Героя',
            dative: 'Герою',
            accusative: 'Героя',
            instrumental: 'Героем',
            prepositional: 'Герое',
          },
        },
        {
          originalName: 'Harry',
          translatedName: 'Гарри',
          gender: 'male',
          description: 'Short form dup',
          aliases: [],
          firstAppearance: chapterNumber,
          isMainCharacter: false,
          declensions: {
            nominative: 'Гарри',
            genitive: 'Гарри',
            dative: 'Гарри',
            accusative: 'Гарри',
            instrumental: 'Гарри',
            prepositional: 'Гарри',
          },
        },
      ],
      newLocations: [
        {
          originalName: 'Town',
          translatedName: 'Город',
          description: 'A town',
          type: 'city',
          firstAppearance: chapterNumber,
        },
      ],
      newTerms: [
        {
          originalTerm: 'Mana',
          translatedTerm: 'Мана',
          description: 'Magic power',
          category: 'magic',
          firstAppearance: chapterNumber,
        },
      ],
      updatedCharacters: [
        {
          id: 'char-merlin',
          originalName: 'Merlin',
          description: 'Updated wizard',
          translatedName: 'Мерлин',
        },
        { id: 'orphan-char', description: 'no original' },
      ],
      updatedLocations: [
        {
          id: 'loc-castle',
          originalName: 'Castle',
          description: 'Updated castle',
          translatedName: 'Замок',
        },
      ],
      updatedTerms: [
        {
          id: 'term-qi',
          originalTerm: 'Qi',
          description: 'Updated qi',
          translatedTerm: 'Ци',
          category: 'energy',
        },
      ],
    },
  };
}

function projectWithExistingGlossary(): ProjectWithChapterList {
  return makeProject({
    glossary: [
      {
        id: 'char-harry',
        type: 'character',
        original: 'Harry Potter',
        translated: 'Гарри Поттер',
        gender: 'male',
        description: '',
        mentionedInChapters: [1],
      },
      {
        id: 'char-merlin',
        type: 'character',
        original: 'Merlin',
        translated: 'Мерлин',
        gender: 'male',
        description: 'Wizard',
        mentionedInChapters: [1],
      },
      {
        id: 'loc-castle',
        type: 'location',
        original: 'Castle',
        translated: 'Замок',
        description: 'Old',
        mentionedInChapters: [1],
      },
      {
        id: 'term-qi',
        type: 'term',
        original: 'Qi',
        translated: 'Ци',
        description: 'Old',
        mentionedInChapters: [1],
      },
    ],
  });
}

function mockPipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  const analysis = emptyAnalysis();
  return {
    chapterNumber: 1,
    originalText: 'Hero walks into town.',
    stage1: {
      stage: 'analyze',
      success: true,
      tokensUsed: 10,
      duration: 1,
      data: analysis,
    },
    stage2: {
      stage: 'translate',
      success: true,
      tokensUsed: 20,
      duration: 1,
      data: {
        originalText: 'Hero walks into town.',
        translatedText: 'Герой входит в город.',
        chunkResults: [
          {
            chunkId: 'c0',
            original: 'Hero walks into town.',
            translated: 'Герой входит в город.',
          },
        ],
      },
    },
    stage3: {
      stage: 'edit',
      success: true,
      tokensUsed: 5,
      duration: 1,
      data: { finalText: 'Герой входит в город.', changes: [] },
    },
    finalTranslation: 'Герой входит в город.',
    totalTokensUsed: 35,
    totalDuration: 3,
    updatedContext: getAgentForProject(makeProject()).getContext(),
    ...overrides,
  };
}

describe('translateChapterWithPipeline', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
    vi.restoreAllMocks();
  });

  it('returns translated text from mocked pipeline', async () => {
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult()
    );

    const result = await translateChapterWithPipeline(baseConfig, makeProject(), makeChapter(), {
      stages: 'all',
      skipAnalysis: false,
    });

    assert.equal(result.translatedText, 'Герой входит в город.');
    assert.equal(result.tokensUsed, 35);
    assert.equal(result.tokensByStage?.translation, 20);
    assert.ok((result.glossaryUpdates?.length ?? 0) >= 1);
  });

  it('throws when chapter has no original text', async () => {
    await assert.rejects(
      () =>
        translateChapterWithPipeline(
          baseConfig,
          makeProject(),
          makeChapter({ originalText: '   ' }),
          {
            stages: ['translation'],
          }
        ),
      /no original text/
    );
  });

  it('throws when pipeline returns empty translation', async () => {
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult({ finalTranslation: '' })
    );

    await assert.rejects(
      () =>
        translateChapterWithPipeline(baseConfig, makeProject(), makeChapter(), {
          stages: ['translation'],
        }),
      /Translation failed|empty/
    );
  });
});

describe('analyzeChaptersBatch', () => {
  beforeEach(() => {
    getCachedAnalysisResult.mockReset();
    setCachedAnalysisResult.mockReset();
    getCachedAnalysisResult.mockResolvedValue(null);
    setCachedAnalysisResult.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearAgentCache('proj-1');
    vi.restoreAllMocks();
  });

  it('orchestrates parallel analysis and returns glossary updates', async () => {
    const analysis = emptyAnalysis(1);
    vi.spyOn(TranslationPipeline.prototype, 'analyzeChaptersParallel').mockImplementation(
      async (chapters, options) => {
        const chapter = chapters[0]!;
        options?.onChapterComplete?.(chapter.id, chapter.number, {
          success: true,
          tokensUsed: 12,
        });
        return {
          results: [
            {
              chapterNumber: 1,
              success: true,
              data: analysis,
              tokensUsed: 12,
              duration: 2,
            },
          ],
          totalTokensUsed: 12,
          totalDuration: 2,
          updatedContext: getAgentForProject(makeProject()).getContext(),
        };
      }
    );

    const progress: Array<{ chapterId: string; success: boolean }> = [];
    const result = await analyzeChaptersBatch(baseConfig, makeProject(), [makeChapter()], {
      useCache: false,
      analysisConcurrency: 1,
      onProgress: (chapterId, prog) => {
        progress.push({ chapterId, success: prog.success });
      },
    });

    assert.equal(result.chapterResults.length, 1);
    assert.equal(result.chapterResults[0]?.success, true);
    assert.equal(result.totalTokensUsed, 12);
    assert.ok(result.glossaryUpdates.some((e) => e.original === 'Hero'));
    assert.equal(progress[0]?.chapterId, 'ch-1');
    assert.equal(setCachedAnalysisResult.mock.calls.length, 1);
  });

  it('uses cached analysis and skips pipeline for cache hits', async () => {
    getCachedAnalysisResult.mockResolvedValue({
      chapterNumber: 1,
      data: emptyAnalysis(1),
      tokensUsed: 7,
    });
    const parallelSpy = vi.spyOn(TranslationPipeline.prototype, 'analyzeChaptersParallel');

    const result = await analyzeChaptersBatch(baseConfig, makeProject(), [makeChapter()], {
      useCache: true,
    });

    assert.equal(result.chapterResults[0]?.success, true);
    assert.equal(result.totalTokensUsed, 7);
    assert.equal(parallelSpy.mock.calls.length, 0);
  });

  it('merges locations, terms, updates and records failed chapters', async () => {
    const project = projectWithExistingGlossary();
    const analysis = richAnalysis(1);
    vi.spyOn(TranslationPipeline.prototype, 'analyzeChaptersParallel').mockResolvedValue({
      results: [
        {
          chapterNumber: 1,
          success: true,
          data: analysis,
          tokensUsed: 15,
          duration: 2,
        },
        {
          chapterNumber: 2,
          success: false,
          error: 'boom',
          tokensUsed: 0,
          duration: 1,
        },
      ],
      totalTokensUsed: 15,
      totalDuration: 3,
      updatedContext: getAgentForProject(project).getContext(),
    });

    const result = await analyzeChaptersBatch(
      baseConfig,
      project,
      [
        makeChapter({ id: 'ch-1', number: 1 }),
        makeChapter({ id: 'ch-2', number: 2, originalText: 'Second chapter text.' }),
      ],
      { useCache: false }
    );

    assert.ok(result.glossaryUpdates.some((e) => e.type === 'character' && e.original === 'Hero'));
    assert.ok(result.glossaryUpdates.some((e) => e.type === 'location' && e.original === 'Town'));
    assert.ok(result.glossaryUpdates.some((e) => e.type === 'term' && e.original === 'Mana'));
    // Batch path does not short-form-filter new entries (unlike translateChapterWithPipeline).
    assert.ok(result.glossaryUpdates.some((e) => e.original === 'Harry'));
    assert.ok(result.glossaryUpdatesExisting.some((u) => u.id === 'char-merlin'));
    assert.ok(result.glossaryUpdatesExisting.some((u) => u.id === 'loc-castle'));
    assert.ok(result.glossaryUpdatesExisting.some((u) => u.id === 'term-qi'));
    assert.equal(result.chapterResults.length, 2);
    assert.equal(result.chapterResults.find((r) => r.chapterId === 'ch-2')?.success, false);
    assert.ok(
      (result.chapterResults.find((r) => r.chapterId === 'ch-1')?.glossaryAppearanceEntryIds
        .length ?? 0) > 0
    );
  });

  it('skips chapters with empty original text when useCache is false', async () => {
    const parallelSpy = vi
      .spyOn(TranslationPipeline.prototype, 'analyzeChaptersParallel')
      .mockResolvedValue({
        results: [],
        totalTokensUsed: 0,
        totalDuration: 0,
        updatedContext: getAgentForProject(makeProject()).getContext(),
      });

    const result = await analyzeChaptersBatch(
      baseConfig,
      makeProject(),
      [makeChapter({ originalText: '   ' })],
      { useCache: false }
    );

    assert.equal(result.chapterResults.length, 0);
    assert.equal(parallelSpy.mock.calls.length, 0);
  });
});

describe('translateChapterWithPipeline branches', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
    vi.restoreAllMocks();
  });

  it('returns cancelled partial result with glossary from stage 1', async () => {
    const project = projectWithExistingGlossary();
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult({
        cancelled: true,
        finalTranslation: '',
        stage1: {
          stage: 'analyze',
          success: true,
          tokensUsed: 11,
          duration: 1,
          data: richAnalysis(1),
        },
        stage2: {
          stage: 'translate',
          success: false,
          tokensUsed: 0,
          duration: 0,
          data: {
            originalText: 'Hero walks into town.',
            translatedText: '',
            chunkResults: [],
          },
        },
        totalTokensUsed: 11,
      })
    );

    const result = await translateChapterWithPipeline(baseConfig, project, makeChapter(), {
      stages: 'all',
    });

    assert.equal(result.cancelled, true);
    assert.equal(result.translatedText, '');
    assert.equal(result.tokensUsed, 11);
    assert.ok((result.glossaryUpdates?.length ?? 0) >= 1);
    assert.ok((result.glossaryUpdatesExisting?.length ?? 0) >= 1);
    assert.ok((result.glossaryAppearanceEntryIds?.length ?? 0) >= 1);
  });

  it('allows empty final translation for analysis-only stages', async () => {
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult({
        finalTranslation: '',
        stage2: {
          stage: 'translate',
          success: false,
          tokensUsed: 0,
          duration: 0,
          data: {
            originalText: 'Hero walks into town.',
            translatedText: '',
            chunkResults: [],
          },
        },
        totalTokensUsed: 9,
      })
    );

    const result = await translateChapterWithPipeline(baseConfig, makeProject(), makeChapter(), {
      stages: ['analysis'],
    });

    assert.equal(result.translatedText, '');
    assert.equal(result.tokensByStage?.analysis, 10);
    assert.equal(result.tokensByStage?.translation, 0);
  });

  it('throws when analysis-only stage fails', async () => {
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult({
        finalTranslation: '',
        stage1: {
          stage: 'analyze',
          success: false,
          tokensUsed: 0,
          duration: 1,
          error: 'model timeout',
          data: undefined as unknown as AnalysisResult,
        },
      })
    );

    await assert.rejects(
      () =>
        translateChapterWithPipeline(baseConfig, makeProject(), makeChapter(), {
          stages: ['analysis'],
        }),
      /Analysis failed: model timeout/
    );
  });

  it('passes editing-only existing translation and reports failed chunk index', async () => {
    const translateSpy = vi
      .spyOn(TranslationPipeline.prototype, 'translateChapter')
      .mockResolvedValue(
        mockPipelineResult({
          stage2: {
            stage: 'translate',
            success: true,
            tokensUsed: 20,
            duration: 1,
            data: {
              originalText: 'Hero walks into town.',
              translatedText: 'Герой входит в город.',
              chunkResults: [
                {
                  chunkId: 'c0',
                  original: 'Hero walks into town.',
                  translated: '[ERROR] rate limit',
                },
                {
                  chunkId: 'c1',
                  original: 'More text.',
                  translated: 'Ещё текст.',
                },
              ],
            },
          },
        })
      );

    const project = makeProject({
      settings: {
        temperatureByStage: { analysis: 0.2, translation: 0.3, editing: 0.4 },
        includeTextBlockTypesInTranslation: true,
        textBlockTypes: [
          {
            id: 'note',
            name: 'Note',
            description: '',
            enabled: true,
            htmlTag: 'aside',
            cssClass: 'note',
            isInline: false,
          },
          {
            id: 'off',
            name: 'Off',
            description: '',
            enabled: false,
            htmlTag: 'div',
            cssClass: '',
            isInline: false,
          },
        ],
        customInstructions: 'Keep formal tone',
        editingStylePreset: 'literary',
      } as Project['settings'],
    });

    const result = await translateChapterWithPipeline(baseConfig, project, makeChapter(), {
      stages: ['editing'],
      existingTranslatedText: 'Existing draft.',
      onProgress: () => undefined,
    });

    const opts = translateSpy.mock.calls[0]?.[2] as {
      runStages?: string[];
      existingTranslatedTextForEdit?: string;
      textBlockTypes?: unknown[];
      customInstructions?: string;
    };
    assert.deepEqual(opts.runStages, ['editing']);
    assert.equal(opts.existingTranslatedTextForEdit, 'Existing draft.');
    assert.equal(opts.customInstructions, 'Keep formal tone');
    assert.equal(opts.textBlockTypes?.length, 1);
    assert.equal(result.failedChunkIndex, 0);
    assert.equal(result.chunksCount, 2);
  });

  it('extracts full glossary updates including short-form filter on success path', async () => {
    const project = projectWithExistingGlossary();
    vi.spyOn(TranslationPipeline.prototype, 'translateChapter').mockResolvedValue(
      mockPipelineResult({
        stage1: {
          stage: 'analyze',
          success: true,
          tokensUsed: 10,
          duration: 1,
          data: richAnalysis(1),
        },
      })
    );

    const result = await translateChapterWithPipeline(baseConfig, project, makeChapter(), {
      stages: ['analysis', 'translation'],
      skipAnalysis: false,
    });

    assert.ok(result.glossaryUpdates?.some((e) => e.original === 'Hero'));
    assert.ok(result.glossaryUpdates?.some((e) => e.type === 'location'));
    assert.ok(result.glossaryUpdates?.some((e) => e.type === 'term'));
    assert.equal(
      result.glossaryUpdates?.some((e) => e.original === 'Harry'),
      false
    );
    assert.ok(result.glossaryUpdatesExisting?.some((u) => u.id === 'char-merlin'));
    assert.ok((result.glossaryAppearanceEntryIds?.length ?? 0) >= 1);
    assert.equal(result.tokensByStage?.analysis, 10);
    assert.equal(result.tokensByStage?.editing, undefined);
  });
});

describe('translateSimple / detectCharacters', () => {
  beforeEach(() => {
    openaiCreate.mockReset();
  });

  it('translateSimple returns model text and token usage', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'Перевод' } }],
      usage: { total_tokens: 42 },
    });

    const result = await translateSimple(baseConfig, 'Hello', [
      {
        id: 'c1',
        type: 'character',
        original: 'Alice',
        translated: 'Алиса',
        description: 'heroine',
        mentionedInChapters: [],
      },
      {
        id: 'l1',
        type: 'location',
        original: 'Town',
        translated: 'Город',
        description: '',
        mentionedInChapters: [],
      },
      {
        id: 't1',
        type: 'term',
        original: 'Mana',
        translated: 'Мана',
        description: '',
        mentionedInChapters: [],
      },
    ]);

    assert.equal(result.text, 'Перевод');
    assert.equal(result.tokensUsed, 42);
    assert.equal(openaiCreate.mock.calls.length, 1);
  });

  it('detectCharacters parses characters array from JSON response', async () => {
    openaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              characters: [{ name: 'Bob', gender: 'male', context: 'intro' }],
            }),
          },
        },
      ],
    });

    const result = await detectCharacters(baseConfig, 'Bob enters.');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'Bob');
  });

  it('detectCharacters returns empty array on invalid JSON', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });

    const result = await detectCharacters(baseConfig, 'text');
    assert.deepEqual(result, []);
  });
});

describe('createPipeline settings branches', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
  });

  it('creates pipeline with text blocks, custom instructions, and codex-mini analysis fallback', () => {
    const project = makeProject({
      settings: {
        stageModels: {
          analysis: 'codex-mini-latest',
          translation: 'gpt-4.1-mini',
          editing: 'gpt-4.1-mini',
        },
        allowReasoningModelsForAnalysis: true,
        includeTextBlockTypesInTranslation: true,
        textBlockTypes: [
          {
            id: 'note',
            name: 'Note',
            description: '',
            enabled: true,
            htmlTag: 'aside',
            cssClass: 'note',
            isInline: false,
          },
        ],
        customInstructions: 'Be concise',
        temperatureByStage: { analysis: 0.1, translation: 0.2, editing: 0.3 },
      } as Project['settings'],
    });
    assert.ok(createPipeline(baseConfig, project, undefined, 'admin'));
  });
});

describe('getAgentForProject character loading branches', () => {
  afterEach(() => {
    clearAgentCache('proj-ru');
    clearAgentCache('proj-latin');
  });

  it('declines translated Russian names when declensions missing', () => {
    const project = makeProject({
      id: 'proj-ru',
      glossary: [
        {
          id: 'c1',
          type: 'character',
          original: 'Ivan',
          translated: 'Иван',
          gender: 'male',
          description: '',
          mentionedInChapters: [],
        },
      ],
    });
    const agent = getAgentForProject(project);
    const char = (agent.glossary as { characters: { translatedName: string }[] }).characters[0];
    assert.equal(char?.translatedName, 'Иван');
  });

  it('keeps original for non-latin untranslated character on ru target', () => {
    const project = makeProject({
      id: 'proj-latin',
      glossary: [
        {
          id: 'c1',
          type: 'character',
          original: 'Герой',
          translated: '',
          gender: 'male',
          description: '',
          mentionedInChapters: [],
        },
      ],
    });
    const agent = getAgentForProject(project);
    const char = (agent.glossary as { characters: { translatedName: string }[] }).characters[0];
    assert.equal(char?.translatedName, 'Герой');
  });
});
