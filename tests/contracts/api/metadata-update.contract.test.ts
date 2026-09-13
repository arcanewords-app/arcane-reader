import { describe, expect, it } from 'vitest';
import { metadataUpdateBodySchema } from '../../../src/api/schemas/projects.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('metadataUpdateBodySchema contract', () => {
  it('accepts a valid metadata update fixture', () => {
    const parsed = metadataUpdateBodySchema.safeParse(loadFixture('metadata-update.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-object metadata payload', () => {
    const parsed = metadataUpdateBodySchema.safeParse(
      loadFixture('metadata-update.invalid-shape.json')
    );
    expect(parsed.success).toBe(false);
  });
});
