import { describe, expect, it } from 'vitest';
import { projectRenameBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectRenameBodySchema contract', () => {
  it('accepts a valid rename body fixture', () => {
    const parsed = projectRenameBodySchema.safeParse(loadFixture('project-rename.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects empty name', () => {
    const parsed = projectRenameBodySchema.safeParse(
      loadFixture('project-rename.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
