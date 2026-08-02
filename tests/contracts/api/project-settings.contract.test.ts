import { describe, expect, it } from 'vitest';
import { projectSettingsBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectSettingsBodySchema contract', () => {
  it('accepts a valid settings body fixture', () => {
    const parsed = projectSettingsBodySchema.safeParse(loadFixture('project-settings.valid.json'));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.translateExecutionMode).toBe('chunked');
      expect(parsed.data.editExecutionMode).toBe('one_shot');
    }
  });
});
