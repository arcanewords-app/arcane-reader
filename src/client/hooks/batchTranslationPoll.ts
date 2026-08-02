import { api } from '../api/client';

export const INITIAL_POLL_MS = 1500;
export const MAX_POLL_MS = 12000;
export const MAX_POLL_ATTEMPTS = 90; // ~5 min with backoff

export type PollChapterResult = {
  success: boolean;
  cancelled?: boolean;
  partial?: boolean;
  error?: string;
};

/**
 * Poll chapter status until translation completes or errors.
 * Uses lightweight status endpoint and exponential backoff.
 */
export async function pollChapterUntilDone(
  projectId: string,
  chapterId: string,
  isCancelled: () => boolean,
  t: (key: string) => string
): Promise<PollChapterResult> {
  let delayMs = INITIAL_POLL_MS;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (isCancelled()) {
      return { success: false, cancelled: true, error: t('projectInfo.errorCanceled') };
    }
    try {
      const { status } = await api.getChapterStatus(projectId, chapterId);
      if (status === 'completed' || status === 'analyzed' || status === 'draft') {
        return { success: true };
      }
      if (status === 'partial') {
        return { success: true, partial: true };
      }
      if (status === 'error') {
        return { success: false, error: t('projectInfo.errorTranslation') };
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, MAX_POLL_MS);
    } catch (err) {
      console.error('Poll error:', err);
      return { success: false, error: t('projectInfo.errorStatusCheck') };
    }
  }
  return { success: false, error: t('projectInfo.errorTimeout') };
}
