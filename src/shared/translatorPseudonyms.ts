import type { PublicEntity } from '../storage/types.js';

export const MAX_TRANSLATOR_PSEUDONYMS_PER_USER = 3;

export const TRANSLATOR_PSEUDONYM_LIMIT_CODE = 'PSEUDONYM_LIMIT';
export const INVALID_TRANSLATOR_PSEUDONYM_CODE = 'INVALID_TRANSLATOR_PSEUDONYM';

export function isOwnedActiveTranslatorPseudonym(
  entity: Pick<PublicEntity, 'kind' | 'ownerUserId' | 'entityStatus'> | null | undefined,
  userId: string
): boolean {
  return (
    entity != null &&
    entity.kind === 'translator' &&
    entity.ownerUserId === userId &&
    (entity.entityStatus ?? 'active') === 'active'
  );
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
