import { describe, expect, it } from 'vitest';
import { projectSearchQuerySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('projectSearchQuerySchema contract', () => {
  it('accepts a valid search query fixture with string booleans', () => {
    const parsed = projectSearchQuerySchema.safeParse(
      loadFixture('project-search-query.valid.json')
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.caseSensitive).toBe(true);
      expect(parsed.data.wholeWord).toBe(false);
      expect(parsed.data.limit).toBe(50);
    }
  });

  it('rejects unknown field enum', () => {
    const parsed = projectSearchQuerySchema.safeParse(
      loadFixture('project-search-query.invalid-field.json')
    );
    expect(parsed.success).toBe(false);
  });
});
