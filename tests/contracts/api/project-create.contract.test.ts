import { describe, expect, it } from 'vitest';
import { projectCreateBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectCreateBodySchema contract', () => {
  it('accepts a valid create body fixture', () => {
    const parsed = projectCreateBodySchema.safeParse(loadFixture('project-create.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unsupported language pair', () => {
    const parsed = projectCreateBodySchema.safeParse(
      loadFixture('project-create.invalid-pair.json')
    );
    expect(parsed.success).toBe(false);
  });
});
