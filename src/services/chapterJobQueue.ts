/**
 * In-process job queue for chapter processing (analysis, translate).
 * One active job per user; additional jobs wait in queue.
 */

export type ChapterJobType = 'analysis' | 'translate';

interface QueuedJob {
  jobId: string;
  type: ChapterJobType;
  runFn: () => Promise<void>;
}

const userQueues = new Map<string, QueuedJob[]>();
const userActive = new Map<string, boolean>();

function processNext(userId: string): void {
  if (userActive.get(userId)) return;
  const queue = userQueues.get(userId);
  if (!queue || queue.length === 0) {
    userQueues.delete(userId);
    userActive.delete(userId);
    return;
  }

  const job = queue.shift()!;
  if (queue.length === 0) {
    userQueues.delete(userId);
  }

  userActive.set(userId, true);
  job
    .runFn()
    .finally(() => {
      userActive.set(userId, false);
      processNext(userId);
    });
}

/**
 * Enqueue a chapter job. If no job is running for the user, starts immediately.
 */
export function enqueueChapterJob(
  userId: string,
  jobId: string,
  type: ChapterJobType,
  runFn: () => Promise<void>
): void {
  const job: QueuedJob = { jobId, type, runFn };
  const queue = userQueues.get(userId);
  if (queue) {
    queue.push(job);
  } else {
    userQueues.set(userId, [job]);
  }
  processNext(userId);
}
