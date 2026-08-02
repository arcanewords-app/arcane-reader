import { describe, expect, it } from 'vitest';
import { projectAiReplaceBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectAiReplaceBodySchema contract', () => {
  it('accepts a valid ai replace fixture', () => {
    const parsed = projectAiReplaceBodySchema.safeParse(
      loadFixture('project-ai-replace.valid.json')
    );
    expect(parsed.success).toBe(true);
  });
});
