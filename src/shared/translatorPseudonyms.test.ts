import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  canAssignTranslatorEntity,
  isOwnedActiveTranslatorPseudonym,
  MAX_TRANSLATOR_PSEUDONYMS_PER_USER,
  createPseudonymLimitError,
  shouldAutoAssignSolePseudonym,
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

  it('lets an admin assign any active translator', () => {
    const catalog = {
      kind: 'translator' as const,
      ownerUserId: null,
      entityStatus: 'active' as const,
    };
    const foreign = {
      kind: 'translator' as const,
      ownerUserId: 'other',
      entityStatus: 'active' as const,
    };
    assert.equal(canAssignTranslatorEntity(catalog, userId, 'admin'), true);
    assert.equal(canAssignTranslatorEntity(foreign, userId, 'admin'), true);
    assert.equal(canAssignTranslatorEntity(foreign, userId, 'author'), false);
    assert.equal(
      canAssignTranslatorEntity(
        { kind: 'translator', ownerUserId: userId, entityStatus: 'blocked' },
        userId,
        'admin'
      ),
      false
    );
  });

  it('auto-assigns the sole pseudonym except when an admin already picked a translator', () => {
    assert.equal(
      shouldAutoAssignSolePseudonym({
        isAdmin: false,
        translatorSelected: false,
        translatorOwned: false,
        ownedPseudonymCount: 1,
      }),
      true
    );
    assert.equal(
      shouldAutoAssignSolePseudonym({
        isAdmin: true,
        translatorSelected: true,
        translatorOwned: false,
        ownedPseudonymCount: 1,
      }),
      false
    );
    assert.equal(
      shouldAutoAssignSolePseudonym({
        isAdmin: false,
        translatorSelected: true,
        translatorOwned: true,
        ownedPseudonymCount: 1,
      }),
      false
    );
    assert.equal(
      shouldAutoAssignSolePseudonym({
        isAdmin: true,
        translatorSelected: false,
        translatorOwned: false,
        ownedPseudonymCount: 2,
      }),
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
