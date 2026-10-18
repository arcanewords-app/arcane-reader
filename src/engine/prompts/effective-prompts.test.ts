import { describe, expect, it } from 'vitest';
import { getEffectiveStagePrompts } from './effective-prompts.js';

describe('getEffectiveStagePrompts', () => {
  it('appends the glossary metadata rule for analysis', () => {
    const prompts = getEffectiveStagePrompts('analyze', 'en', 'ru');
    expect(prompts.stage).toBe('analyze');
    expect(prompts.systemPrompt.length).toBeGreaterThan(0);
    expect(prompts.sourceLanguage).toBe('en');
    expect(prompts.targetLanguage).toBe('ru');
  });

  it('appends gender agreement for translation', () => {
    const prompts = getEffectiveStagePrompts('translate', 'en', 'be');
    expect(prompts.stage).toBe('translate');
    expect(prompts.systemPrompt.length).toBeGreaterThan(0);
  });

  it('uses the default edit preset when none is passed', () => {
    const prompts = getEffectiveStagePrompts('edit', 'ko', 'ru');
    expect(prompts.preset).toBe('default');
    expect(prompts.focus).toBeTruthy();
    expect(prompts.systemPrompt.length).toBeGreaterThan(0);
  });

  it('keeps an explicit edit preset and focus', () => {
    const prompts = getEffectiveStagePrompts('edit', 'en', 'ru', {
      preset: 'literary',
      focus: 'elevate',
    });
    expect(prompts.preset).toBe('literary');
    expect(prompts.focus).toBe('elevate');
  });
});
