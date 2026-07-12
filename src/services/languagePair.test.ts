import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { analysisResultCacheKey } from './analysisCache.js';
import {
  clearAgentCache,
  getAgentForProject,
  resolveEffectiveLanguagePair,
} from './engine-integration.js';
import { isProjectLanguagePairLocked } from './projectLanguagePair.js';
import type { Project } from '../storage/database.js';
import type { Chapter } from '../storage/types.js';

function minimalChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'Ch1',
    originalText: '',
    paragraphs: [],
    status: 'pending',
    ...overrides,
  };
}

function mockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'text',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    settings: {},
    glossary: [],
    chapters: [minimalChapter()],
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as Project;
}

describe('language pair helpers', () => {
  afterEach(() => {
    clearAgentCache('proj-1');
  });

  it('getAgentForProject caches agent per project and language pair', () => {
    const project = mockProject({ sourceLanguage: 'en', targetLanguage: 'ru' });
    const first = getAgentForProject(project);
    const second = getAgentForProject(project);
    assert.equal(first, second);

    const koOverride = getAgentForProject(project, {
      sourceLanguage: 'ko',
      targetLanguage: 'ru',
    });
    assert.notEqual(first, koOverride);
  });

  it('analysisResultCacheKey differs by source language', () => {
    const keyA = analysisResultCacheKey('p1', 'c1', { sourceLanguage: 'en', targetLanguage: 'ru' });
    const keyB = analysisResultCacheKey('p1', 'c1', { sourceLanguage: 'ko', targetLanguage: 'ru' });
    assert.notEqual(keyA, keyB);
    assert.ok(keyA.includes('en'));
    assert.ok(keyB.includes('ko'));
  });

  it('resolveEffectiveLanguagePair uses project default', () => {
    const project = mockProject({ sourceLanguage: 'zh', targetLanguage: 'ru' });
    const pair = resolveEffectiveLanguagePair(project);
    assert.equal(pair.sourceLanguage, 'zh');
    assert.equal(pair.targetLanguage, 'ru');
  });

  it('resolveEffectiveLanguagePair accepts ephemeral override', () => {
    const project = mockProject({ sourceLanguage: 'ko', targetLanguage: 'ru' });
    const pair = resolveEffectiveLanguagePair(project, {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.equal(pair.sourceLanguage, 'en');
    assert.equal(pair.targetLanguage, 'ru');
  });

  it('isProjectLanguagePairLocked is false for empty project', () => {
    assert.equal(isProjectLanguagePairLocked(mockProject()), false);
  });

  it('isProjectLanguagePairLocked is true when glossary has entries', () => {
    assert.equal(
      isProjectLanguagePairLocked(
        mockProject({ glossary: [{ id: 'g1' } as Project['glossary'][0]] })
      ),
      true
    );
  });

  it('isProjectLanguagePairLocked is true when chapter is not pending', () => {
    assert.equal(
      isProjectLanguagePairLocked(
        mockProject({
          chapters: [minimalChapter({ status: 'analyzed' })],
        })
      ),
      true
    );
  });
});
