import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOwnedActiveTranslatorPseudonym,
  MAX_TRANSLATOR_PSEUDONYMS_PER_USER,
  createPseudonymLimitError,
} from './translatorPseudonyms.js';

describe('translatorPseudonyms', () => {
  const userId = 'user-1';

  it('accepts owned active translator pseudonym', () => {
    assert.equal(
      isOwnedActiveTranslatorPseudonym(
        { kind: 'translator', ownerUserId: userId, entityStatus: 'active' },
        userId
      ),
      true
    );
  });

  it('rejects blocked pseudonym', () => {
    assert.equal(
      isOwnedActiveTranslatorPseudonym(
        { kind: 'translator', ownerUserId: userId, entityStatus: 'blocked' },
        userId
      ),
      false
    );
  });

  it('rejects foreign or wrong kind', () => {
    assert.equal(
      isOwnedActiveTranslatorPseudonym(
        { kind: 'translator', ownerUserId: 'other', entityStatus: 'active' },
        userId
      ),
      false
    );
    assert.equal(
      isOwnedActiveTranslatorPseudonym(
        { kind: 'author', ownerUserId: userId, entityStatus: 'active' },
        userId
      ),
      false
    );
  });

  it('creates limit error with code', () => {
    const err = createPseudonymLimitError(3);
    assert.equal(err.code, 'PSEUDONYM_LIMIT');
    assert.equal(err.limit, MAX_TRANSLATOR_PSEUDONYMS_PER_USER);
    assert.equal(err.current, 3);
  });
});
