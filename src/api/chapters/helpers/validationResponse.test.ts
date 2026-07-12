import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validationFailedResponse } from './validationResponse.js';

describe('validationFailedResponse', () => {
  it('flattens Zod field errors', () => {
    const schema = z.object({ title: z.string().min(1), number: z.number().positive() });
    const parsed = schema.safeParse({ title: '', number: -1 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const body = validationFailedResponse(parsed.error);
      expect(body.error).toBe('Validation failed');
      expect(body.details).toHaveProperty('title');
      expect(body.details).toHaveProperty('number');
    }
  });
});
