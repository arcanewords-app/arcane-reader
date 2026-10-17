import { describe, expect, it } from 'vitest';
import { createEditionBodySchema } from '../../../src/api/schemas/projects.js';

describe('createEditionBodySchema contract', () => {
  it('accepts a second target language', () => {
    const parsed = createEditionBodySchema.safeParse({ targetLanguage: 'be' });
    expect(parsed.success).toBe(true);
  });

  it('rejects a language outside ru and be', () => {
    const parsed = createEditionBodySchema.safeParse({ targetLanguage: 'pl' });
    expect(parsed.success).toBe(false);
  });

  it('accepts lang as a chapter read query value', () => {
    const params = new URLSearchParams('lang=be&paragraph=abc');
    expect(params.get('lang')).toBe('be');
    expect(createEditionBodySchema.safeParse({ targetLanguage: params.get('lang') }).success).toBe(
      true
    );
  });
});
