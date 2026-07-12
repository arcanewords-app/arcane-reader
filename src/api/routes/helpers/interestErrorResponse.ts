import type { Response } from 'express';

export function interestErrorResponse(error: unknown, res: Response): boolean {
  const code = (error as Error & { code?: string }).code;
  if (code === 'NOT_FOUND') {
    res.status(404).json({ error: 'Translation request not found' });
    return true;
  }
  if (code === 'SELF_ASSIGN') {
    res
      .status(409)
      .json({ error: 'Cannot take your own translation request', code: 'SELF_ASSIGN' });
    return true;
  }
  if (code === 'REQUEST_CLOSED') {
    res.status(409).json({ error: 'Translation request is not open', code: 'REQUEST_CLOSED' });
    return true;
  }
  if (code === 'INTEREST_EXISTS') {
    res.status(409).json({ error: 'Interest already exists', code: 'INTEREST_EXISTS' });
    return true;
  }
  if (code === 'INVALID_TRANSLATOR') {
    res.status(400).json({ error: 'Invalid translator entity', code: 'INVALID_TRANSLATOR' });
    return true;
  }
  if (code === 'INVALID_TRANSLATOR_PSEUDONYM') {
    res.status(400).json({
      error: 'Invalid translator pseudonym',
      code: 'INVALID_TRANSLATOR_PSEUDONYM',
    });
    return true;
  }
  return false;
}
