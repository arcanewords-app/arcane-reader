import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  groupIssuesByParagraph,
  normalizeCriticResult,
  normalizeIssues,
} from './evaluation-normalize.js';

describe('evaluation-normalize', () => {
  it('normalizeIssues maps raw rows with defaults', () => {
    const issues = normalizeIssues([
      { paragraphIndex: 2, dimension: 'GLOSSARY', severity: 'major', description: 'term' },
      { text: 'fallback text' },
    ]);
    assert.equal(issues.length, 2);
    assert.deepEqual(issues[0], {
      paragraphIndex: 2,
      dimension: 'glossary',
      severity: 'MAJOR',
      description: 'term',
    });
    assert.equal(issues[1].paragraphIndex, 0);
    assert.equal(issues[1].dimension, 'accuracy');
    assert.equal(issues[1].severity, 'MINOR');
    assert.equal(issues[1].description, 'fallback text');
  });

  it('normalizeIssues returns empty array for non-array input', () => {
    assert.deepEqual(normalizeIssues(null), []);
    assert.deepEqual(normalizeIssues('bad'), []);
  });

  it('normalizeCriticResult wraps summary, strengths, issues', () => {
    const result = normalizeCriticResult({
      summary: 'ok',
      strengths: 'flow',
      issues: [{ paragraphIndex: 0, description: 'x' }],
    });
    assert.equal(result.summary, 'ok');
    assert.equal(result.strengths, 'flow');
    assert.equal(result.issues.length, 1);
  });

  it('groupIssuesByParagraph buckets by index and sends out-of-range to -1', () => {
    const issues = normalizeIssues([
      { paragraphIndex: 0, description: 'a' },
      { paragraphIndex: 1, description: 'b' },
      { paragraphIndex: 99, description: 'general' },
    ]);
    const map = groupIssuesByParagraph(issues, 2);
    assert.equal(map.get(0)?.length, 1);
    assert.equal(map.get(1)?.length, 1);
    assert.equal(map.get(-1)?.length, 1);
    assert.equal(map.get(-1)?.[0].description, 'general');
  });
});
