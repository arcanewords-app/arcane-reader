import { describe, expect, it } from 'vitest';
import { projectCloneBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectCloneBodySchema contract', () => {
  it('accepts a valid clone body fixture', () => {
    const parsed = projectCloneBodySchema.safeParse(loadFixture('project-clone.valid.json'));
    expect(parsed.success).toBe(true);
  });
});
