/**
 * Lightweight unit checks for language pair helpers (run: npx tsx scripts/test-language-pair.ts).
 */
import assert from 'node:assert/strict';
import { analysisResultCacheKey } from '../src/services/analysisCache.js';
import { isProjectLanguagePairLocked } from '../src/services/projectLanguagePair.js';
import { resolveEffectiveLanguagePair } from '../src/services/engine-integration.js';
import type { Project } from '../src/storage/database.js';

function mockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'text',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    settings: {},
    glossary: [],
    chapters: [{ id: 'ch-1', number: 1, title: 'Ch1', status: 'pending' }],
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as Project;
}

// analysisResultCacheKey includes language pair
{
  const keyA = analysisResultCacheKey('p1', 'c1', { sourceLanguage: 'en', targetLanguage: 'ru' });
  const keyB = analysisResultCacheKey('p1', 'c1', { sourceLanguage: 'ko', targetLanguage: 'ru' });
  assert.notEqual(keyA, keyB, 'cache keys must differ by source language');
  assert.ok(keyA.includes('en'), 'cache key should contain source language');
  assert.ok(keyB.includes('ko'), 'cache key should contain ko source');
}

// resolveEffectiveLanguagePair: project default
{
  const project = mockProject({ sourceLanguage: 'zh', targetLanguage: 'ru' });
  const pair = resolveEffectiveLanguagePair(project);
  assert.equal(pair.sourceLanguage, 'zh');
  assert.equal(pair.targetLanguage, 'ru');
}

// resolveEffectiveLanguagePair: override
{
  const project = mockProject({ sourceLanguage: 'ko', targetLanguage: 'ru' });
  const pair = resolveEffectiveLanguagePair(project, {
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
  assert.equal(pair.sourceLanguage, 'en');
  assert.equal(pair.targetLanguage, 'ru');
}

// isProjectLanguagePairLocked
{
  assert.equal(isProjectLanguagePairLocked(mockProject()), false);
  assert.equal(
    isProjectLanguagePairLocked(
      mockProject({ glossary: [{ id: 'g1' } as Project['glossary'][0]] })
    ),
    true
  );
  assert.equal(
    isProjectLanguagePairLocked(
      mockProject({
        chapters: [{ id: 'ch-1', number: 1, title: 'Ch1', status: 'analyzed' }],
      })
    ),
    true
  );
}

console.log('language-pair unit checks: OK');
