/**
 * BullMQ Worker for chapter jobs (analysis, translate).
 * Processes jobs from chapter-analysis and chapter-translate queues.
 */

import { Worker } from 'bullmq';
import { getBullConnectionOptions, isBullAvailable } from './chapterQueue.js';
import type { AnalysisJobPayload, TranslateJobPayload } from './chapterQueue.js';
import { runAnalysisJob } from './jobs/runAnalysisJob.js';
import { runTranslateJob } from './jobs/runTranslateJob.js';
import { logger } from '../logger.js';

const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 min
const STALLED_INTERVAL_MS = 60 * 1000; // 1 min
const MAX_STALLED_COUNT = 2;

const BULL_ANALYSIS_CONCURRENCY = parseInt(process.env.BULL_ANALYSIS_CONCURRENCY ?? '3', 10);
const BULL_TRANSLATE_CONCURRENCY = parseInt(process.env.BULL_TRANSLATE_CONCURRENCY ?? '3', 10);

function isJobStoreRedisAvailable(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url && token);
}

let analysisWorker: Worker<AnalysisJobPayload> | null = null;
let translateWorker: Worker<TranslateJobPayload> | null = null;

export function startChapterWorkers(): void {
  if (!isBullAvailable()) {
    logger.warn('REDIS_URL not set; chapter workers will not start');
    return;
  }

  if (!isJobStoreRedisAvailable()) {
    const msg =
      'KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) are required for the worker. ' +
      'Job stores use Redis to share state between server and worker; without it, job cancellation and status will not work.';
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(msg);
      return;
    }
    logger.error(msg);
    process.exit(1);
  }

  const connection = getBullConnectionOptions();

  analysisWorker = new Worker<AnalysisJobPayload>(
    'chapter-analysis',
    async (job) => {
      await runAnalysisJob(job.data);
    },
    {
      connection,
      concurrency: Math.max(1, BULL_ANALYSIS_CONCURRENCY),
      lockDuration: LOCK_DURATION_MS,
      stalledInterval: STALLED_INTERVAL_MS,
      maxStalledCount: MAX_STALLED_COUNT,
    }
  );

  translateWorker = new Worker<TranslateJobPayload>(
    'chapter-translate',
    async (job) => {
      await runTranslateJob(job.data);
    },
    {
      connection,
      concurrency: Math.max(1, BULL_TRANSLATE_CONCURRENCY),
      lockDuration: LOCK_DURATION_MS,
      stalledInterval: STALLED_INTERVAL_MS,
      maxStalledCount: MAX_STALLED_COUNT,
    }
  );

  const handleError = (err: Error, workerName: string) => {
    logger.error({ err, worker: workerName }, `${workerName} worker error`);
  };

  analysisWorker.on('error', (err) => handleError(err, 'analysis'));
  translateWorker.on('error', (err) => handleError(err, 'translate'));

  analysisWorker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, err }, 'Analysis job failed');
  });
  translateWorker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, err }, 'Translate job failed');
  });

  logger.info(
    {
      analysisConcurrency: BULL_ANALYSIS_CONCURRENCY,
      translateConcurrency: BULL_TRANSLATE_CONCURRENCY,
    },
    'Chapter workers started (analysis, translate)'
  );
}

export async function closeChapterWorkers(): Promise<void> {
  if (analysisWorker) {
    await analysisWorker.close();
    analysisWorker = null;
  }
  if (translateWorker) {
    await translateWorker.close();
    translateWorker = null;
  }
  logger.info('Chapter workers closed');
}
