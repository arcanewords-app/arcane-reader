/**
 * Job polling helpers — extracted from chapters routes.
 */

import type { Response } from 'express';

export function setJobPollingNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

export interface OwnedJobLike {
  userId: string;
  projectId: string;
}

export function isJobOwnedByUser(
  job: OwnedJobLike | null | undefined,
  userId: string,
  projectId: string
): job is OwnedJobLike {
  return !!job && job.userId === userId && job.projectId === projectId;
}
