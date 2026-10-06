import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { adminProjectCardPatchSchema } from './admin.js';

describe('adminProjectCardPatchSchema', () => {
  it('keeps description and a translator id', () => {
    const parsed = adminProjectCardPatchSchema.parse({
      description: '  Moderated  ',
      translatorEntityId: '9823610f-a4d5-4407-9691-4b27508ef679',
    });
    assert.equal(parsed.description, 'Moderated');
    assert.equal(parsed.translatorEntityId, '9823610f-a4d5-4407-9691-4b27508ef679');
  });

  it('turns an empty description into null', () => {
    const parsed = adminProjectCardPatchSchema.parse({ description: '   ' });
    assert.equal(parsed.description, null);
  });

  it('rejects a field outside the allowlist', () => {
    const parsed = adminProjectCardPatchSchema.safeParse({
      description: 'ok',
      metadata: { title: 'freeform' },
    });
    assert.equal(parsed.success, false);
  });
});
