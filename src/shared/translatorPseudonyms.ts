import type { PublicEntity } from '../storage/types.js';
import { isAtLeastRole, type UserRole } from '../types/roles.js';

export const MAX_TRANSLATOR_PSEUDONYMS_PER_USER = 3;

export const TRANSLATOR_PSEUDONYM_LIMIT_CODE = 'PSEUDONYM_LIMIT';
export const INVALID_TRANSLATOR_PSEUDONYM_CODE = 'INVALID_TRANSLATOR_PSEUDONYM';

export function isActiveTranslatorEntity<T extends Pick<PublicEntity, 'kind' | 'entityStatus'>>(
  entity: T | null | undefined
): entity is T {
  return (
    entity != null && entity.kind === 'translator' && (entity.entityStatus ?? 'active') === 'active'
  );
}

export function isOwnedActiveTranslatorPseudonym(
  entity: Pick<PublicEntity, 'kind' | 'ownerUserId' | 'entityStatus'> | null | undefined,
  userId: string
): boolean {
  return isActiveTranslatorEntity(entity) && entity.ownerUserId === userId;
}

/** Admin may assign any active translator. Other roles may assign only their own pseudonym. */
export function canAssignTranslatorEntity(
  entity: Pick<PublicEntity, 'kind' | 'ownerUserId' | 'entityStatus'> | null | undefined,
  userId: string,
  role: UserRole
): boolean {
  if (!isActiveTranslatorEntity(entity)) return false;
  if (isAtLeastRole(role, 'admin')) return true;
  return entity.ownerUserId === userId;
}

/**
 * Opening publish should fill a missing translator from the user's only pseudonym.
 * An admin who already picked a catalog translator must keep that choice.
 */
export function shouldAutoAssignSolePseudonym(options: {
  isAdmin: boolean;
  translatorSelected: boolean;
  translatorOwned: boolean;
  ownedPseudonymCount: number;
}): boolean {
  if (options.ownedPseudonymCount !== 1) return false;
  if (options.translatorOwned) return false;
  if (options.isAdmin && options.translatorSelected) return false;
  return true;
}

export function createPseudonymLimitError(
  current: number
): Error & { code: string; limit: number; current: number } {
  const err = new Error('Translator pseudonym limit reached') as Error & {
    code: string;
    limit: number;
    current: number;
  };
  err.code = TRANSLATOR_PSEUDONYM_LIMIT_CODE;
  err.limit = MAX_TRANSLATOR_PSEUDONYMS_PER_USER;
  err.current = current;
  return err;
}

export function createInvalidTranslatorPseudonymError(): Error & { code: string } {
  const err = new Error('Invalid translator pseudonym') as Error & { code: string };
  err.code = INVALID_TRANSLATOR_PSEUDONYM_CODE;
  return err;
}
