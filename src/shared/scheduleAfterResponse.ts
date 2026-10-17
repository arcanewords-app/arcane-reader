import { waitUntil } from '@vercel/functions';
import { logger } from '../logger.js';

/**
 * Keep work alive after the HTTP response.
 * On Vercel the instance freezes when the response ends unless the promise is passed to waitUntil.
 * Locally and in tests the task runs on the next tick so it does not depend on the Vercel package.
 */
export function scheduleAfterResponse(task: () => Promise<unknown>): void {
  const run = (): Promise<unknown> =>
    Promise.resolve()
      .then(task)
      .catch((err: unknown) => {
        logger.error({ err, event: 'after_response.failed' }, 'Background task failed');
      });

  if (process.env.VERCEL) {
    waitUntil(run());
    return;
  }

  setImmediate(() => {
    void run();
  });
}
