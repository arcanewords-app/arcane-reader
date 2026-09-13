import type { Request, Response } from 'express';
import { isInvocationAbortError } from '../shared/invocationAbort.js';

/**
 * Swallow client-disconnect / AbortSignal errors so they are not reported as 500.
 * The client is usually already gone; 499 is the conventional "client closed request".
 */
export function handleLlmAbort(err: unknown, req: Request, res: Response): boolean {
  if (!isInvocationAbortError(err)) return false;
  req.log?.info({ event: 'llm.aborted' }, 'LLM request aborted');
  if (!res.headersSent) {
    res.status(499).end();
  }
  return true;
}
