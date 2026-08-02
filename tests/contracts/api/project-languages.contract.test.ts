import { describe, expect, it } from 'vitest';
import { projectLanguagesBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectLanguagesBodySchema contract', () => {
  it('accepts a valid language pair fixture', () => {
    const parsed = projectLanguagesBodySchema.safeParse(
      loadFixture('project-languages.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects unsupported pair with valid enum members', () => {
    const parsed = projectLanguagesBodySchema.safeParse(
      loadFixture('project-languages.invalid-pair.json')
    );
    expect(parsed.success).toBe(false);
  });
});
