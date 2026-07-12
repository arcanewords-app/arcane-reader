import type { Response } from 'express';
import {
  TRANSLATOR_PSEUDONYM_LIMIT_CODE,
  INVALID_TRANSLATOR_PSEUDONYM_CODE,
} from '../../../shared/translatorPseudonyms.js';

export function translatorPseudonymErrorResponse(error: unknown, res: Response): boolean {
  const code = (error as Error & { code?: string }).code;
  if (code === TRANSLATOR_PSEUDONYM_LIMIT_CODE) {
    const e = error as Error & { limit?: number; current?: number };
    res.status(409).json({
      error: 'Translator pseudonym limit reached',
      code: TRANSLATOR_PSEUDONYM_LIMIT_CODE,
      limit: e.limit,
      current: e.current,
    });
    return true;
  }
  if (code === INVALID_TRANSLATOR_PSEUDONYM_CODE) {
    res.status(400).json({
      error: 'Invalid translator pseudonym',
      code: INVALID_TRANSLATOR_PSEUDONYM_CODE,
    });
    return true;
  }
  return false;
}
