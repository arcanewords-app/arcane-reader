import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildChapterCriticJsonSchema,
  buildChapterCriticUserPrompt,
  getChapterCriticSystemPrompt,
  numberParagraphsForCritic,
} from './critic.js';

describe('getChapterCriticSystemPrompt', () => {
  it('includes target language display name and maxIssues', () => {
    const prompt = getChapterCriticSystemPrompt({ targetLanguage: 'ru', maxIssues: 5 });
    assert.match(prompt, /Russian/);
    assert.match(prompt, /up to \*\*5\*\* issues/);
    assert.match(prompt, /0-based/);
  });

  it('uses Belarusian label for be target', () => {
    const prompt = getChapterCriticSystemPrompt({ targetLanguage: 'be', maxIssues: 3 });
    assert.match(prompt, /Belarusian/);
    assert.match(prompt, /up to \*\*3\*\* issues/);
  });
});

describe('buildChapterCriticUserPrompt', () => {
  it('embeds numbered source and translation', () => {
    const user = buildChapterCriticUserPrompt({
      numberedSource: '[¶1] Hello',
      numberedTranslation: '[¶1] Привет',
    });
    assert.match(user, /\[¶1\] Hello/);
    assert.match(user, /\[¶1\] Привет/);
    assert.match(user, /Review the translation/);
  });

  it('uses (none) when glossary is missing or blank', () => {
    const noGlossary = buildChapterCriticUserPrompt({
      numberedSource: 'a',
      numberedTranslation: 'b',
    });
    assert.match(noGlossary, /\(none\)/);

    const blankGlossary = buildChapterCriticUserPrompt({
      numberedSource: 'a',
      numberedTranslation: 'b',
      glossaryText: '   \n  ',
    });
    assert.match(blankGlossary, /\(none\)/);
  });

  it('trims and includes glossary text when provided', () => {
    const user = buildChapterCriticUserPrompt({
      numberedSource: 'a',
      numberedTranslation: 'b',
      glossaryText: '  Hero: Герой  ',
    });
    assert.match(user, /Hero: Герой/);
    assert.doesNotMatch(user, /\(none\)/);
  });
});

describe('numberParagraphsForCritic', () => {
  it('returns empty string for no paragraphs', () => {
    assert.equal(numberParagraphsForCritic([]), '');
  });

  it('numbers paragraphs 1-based with blank line separators', () => {
    const numbered = numberParagraphsForCritic(['First', 'Second']);
    assert.equal(numbered, '[¶1] First\n\n[¶2] Second');
  });
});

describe('buildChapterCriticJsonSchema', () => {
  it('sets issues.maxItems from maxIssues', () => {
    const schema = buildChapterCriticJsonSchema(7) as {
      properties: { issues: { maxItems: number; items: { properties: Record<string, unknown> } } };
    };
    assert.equal(schema.properties.issues.maxItems, 7);
  });

  it('defines required issue fields and dimension/severity enums', () => {
    const schema = buildChapterCriticJsonSchema(1) as {
      properties: {
        issues: {
          items: {
            required: string[];
            properties: {
              dimension: { enum: string[] };
              severity: { enum: string[] };
            };
          };
        };
      };
      required: string[];
    };
    const issue = schema.properties.issues.items;
    assert.deepEqual(issue.required, ['paragraphIndex', 'dimension', 'severity', 'description']);
    assert.deepEqual(issue.properties.dimension.enum, ['accuracy', 'fluency', 'glossary', 'style']);
    assert.deepEqual(issue.properties.severity.enum, ['CRITICAL', 'MAJOR', 'MINOR']);
    assert.deepEqual(schema.required, ['summary', 'strengths', 'issues']);
  });
});
