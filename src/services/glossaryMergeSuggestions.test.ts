import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { GlossaryEntry } from '../storage/database.js';
import { suggestGlossaryMerges } from './glossaryMergeSuggestions.js';

const { mockCreate, MockOpenAI } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  }
  return { mockCreate, MockOpenAI };
});

vi.mock('openai', () => ({
  default: MockOpenAI,
}));

vi.mock('../logger.js', () => ({
  logger: { error: vi.fn() },
}));

function entry(
  id: string,
  type: GlossaryEntry['type'],
  overrides: Partial<GlossaryEntry> = {}
): GlossaryEntry {
  return {
    id,
    type,
    original: `orig-${id}`,
    translated: `trans-${id}`,
    ...overrides,
  };
}

describe('suggestGlossaryMerges', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when glossary has fewer than two entries', async () => {
    const result = await suggestGlossaryMerges([entry('e1', 'character')], { apiKey: 'key' });
    assert.deepEqual(result, []);
    assert.equal(mockCreate.mock.calls.length, 0);
  });

  it('returns validated suggestions from LLM response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                {
                  entryIds: ['c1', 'c2'],
                  reason: 'Same character: full name and nickname',
                  suggestedPrimaryId: 'c1',
                },
              ],
            }),
          },
        },
      ],
    });

    const glossary = [
      entry('c1', 'character', { original: 'Alexander', translated: 'Александр' }),
      entry('c2', 'character', { original: 'Sasha', translated: 'Саша' }),
    ];

    const result = await suggestGlossaryMerges(glossary, { apiKey: 'key', model: 'gpt-4.1-mini' });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0]?.entryIds, ['c1', 'c2']);
    assert.equal(result[0]?.reason, 'Same character: full name and nickname');
    assert.equal(result[0]?.suggestedPrimaryId, 'c1');
    assert.equal(mockCreate.mock.calls[0]?.[0]?.model, 'gpt-4.1-mini');
  });

  it('filters suggestions with mixed entry types or unknown ids', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { entryIds: ['c1', 'l1'], reason: 'Mixed types' },
                { entryIds: ['c1', 'missing'], reason: 'Unknown id' },
                { entryIds: ['c1'], reason: 'Too few ids' },
              ],
            }),
          },
        },
      ],
    });

    const glossary = [entry('c1', 'character'), entry('c2', 'character'), entry('l1', 'location')];

    const result = await suggestGlossaryMerges(glossary, { apiKey: 'key' });
    assert.deepEqual(result, []);
  });

  it('returns empty array when LLM call fails', async () => {
    mockCreate.mockRejectedValue(new Error('network down'));

    const result = await suggestGlossaryMerges(
      [entry('c1', 'character'), entry('c2', 'character')],
      { apiKey: 'key' }
    );
    assert.deepEqual(result, []);
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });

    const result = await suggestGlossaryMerges(
      [entry('c1', 'character'), entry('c2', 'character')],
      { apiKey: 'key' }
    );
    assert.deepEqual(result, []);
  });
});
