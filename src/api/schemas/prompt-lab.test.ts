import { describe, expect, it } from 'vitest';
import {
  promptLabCurrentQuerySchema,
  promptLabEvaluateBodySchema,
  promptLabGlossaryImportSchema,
  promptLabPreviewBodySchema,
  promptLabPromptBodySchema,
  promptLabRunBodySchema,
  promptLabRunPatchSchema,
  promptLabTextBodySchema,
} from './prompt-lab.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('promptLabCurrentQuerySchema', () => {
  it('rejects invalid stage', () => {
    const parsed = promptLabCurrentQuerySchema.safeParse({
      stage: 'summarize',
      source: 'en',
      target: 'ru',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.stage).toBeDefined();
    }
  });

  it('rejects unsupported language', () => {
    const parsed = promptLabCurrentQuerySchema.safeParse({
      stage: 'translate',
      source: 'ja',
      target: 'ru',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.source).toBeDefined();
    }
  });

  it('normalizes editing focus alias', () => {
    const parsed = promptLabCurrentQuerySchema.safeParse({
      stage: 'edit',
      source: 'en',
      target: 'ru',
      focus: 'fix_problems',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.focus).toBe('fix_only');
    }
  });
});

describe('promptLabPreviewBodySchema', () => {
  it('requires stage and languages', () => {
    const parsed = promptLabPreviewBodySchema.safeParse({ sourceText: 'Hello' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.stage).toBeDefined();
      expect(parsed.error.flatten().fieldErrors.sourceLanguage).toBeDefined();
      expect(parsed.error.flatten().fieldErrors.targetLanguage).toBeDefined();
    }
  });

  it('rejects invalid glossary entry type', () => {
    const parsed = promptLabPreviewBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      sourceText: 'Hello',
      glossarySnapshot: [{ type: 'spell', original: 'Alice' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('promptLabRunBodySchema', () => {
  it('rejects temperature above max', () => {
    const parsed = promptLabRunBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      sourceText: 'Hello',
      temperature: 5,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.temperature).toBeDefined();
    }
  });

  it('rejects invalid reasoningEffort', () => {
    const parsed = promptLabRunBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      sourceText: 'Hello',
      reasoningEffort: 'extreme',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.reasoningEffort).toBeDefined();
    }
  });

  it('maps legacy execution mode aliases', () => {
    const parsed = promptLabRunBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      sourceText: 'Hello',
      translateExecutionMode: 'enhanced',
      editExecutionMode: 'standard',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.translateExecutionMode).toBe('one_shot');
      expect(parsed.data.editExecutionMode).toBe('chunked');
    }
  });

  it('rejects translateLeadingContextParagraphs above max', () => {
    const parsed = promptLabRunBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      sourceText: 'Hello',
      translateLeadingContextParagraphs: 10,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.translateLeadingContextParagraphs).toBeDefined();
    }
  });
});

describe('promptLabRunPatchSchema', () => {
  it('rejects blank displayName', () => {
    const parsed = promptLabRunPatchSchema.safeParse({ displayName: '   ' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.displayName).toBeDefined();
    }
  });
});

describe('promptLabEvaluateBodySchema', () => {
  it('rejects non-uuid run ids', () => {
    const parsed = promptLabEvaluateBodySchema.safeParse({
      leftRunId: 'bad',
      rightRunId: VALID_UUID,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.leftRunId).toBeDefined();
    }
  });

  it('rejects invalid compare mode', () => {
    const parsed = promptLabEvaluateBodySchema.safeParse({
      leftRunId: VALID_UUID,
      rightRunId: VALID_UUID,
      leftMode: 'draft',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.leftMode).toBeDefined();
    }
  });
});

describe('promptLabTextBodySchema', () => {
  it('rejects blank title', () => {
    const parsed = promptLabTextBodySchema.safeParse({
      title: '',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      content: 'Text',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.title).toBeDefined();
    }
  });
});

describe('promptLabPromptBodySchema', () => {
  it('rejects empty systemPrompt', () => {
    const parsed = promptLabPromptBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      name: 'Custom prompt',
      systemPrompt: '',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.systemPrompt).toBeDefined();
    }
  });

  it('rejects invalid origin', () => {
    const parsed = promptLabPromptBodySchema.safeParse({
      stage: 'translate',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      name: 'Custom prompt',
      systemPrompt: 'You are a translator.',
      origin: 'imported',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.origin).toBeDefined();
    }
  });
});

describe('promptLabGlossaryImportSchema', () => {
  it('rejects empty content', () => {
    const parsed = promptLabGlossaryImportSchema.safeParse({ content: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.content).toBeDefined();
    }
  });
});
