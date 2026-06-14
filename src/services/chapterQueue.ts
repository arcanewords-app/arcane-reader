/**
 * BullMQ queues for chapter processing (analysis, translate).
 * Uses Redis (REDIS_URL) - separate from Upstash REST used by job stores.
 */

import { Queue } from 'bullmq';
import type { TranslationStages } from '../config/tokenLimits.js';

const QUEUE_NAME_ANALYSIS = 'chapter-analysis';
const QUEUE_NAME_TRANSLATE = 'chapter-translate';

export interface AnalysisJobPayload {
  jobId: string;
  projectId: string;
  userId: string;
  estimatedTokens: number;
  chapterIds: string[];
  /** Ephemeral override; when set, engine uses this pair instead of project default. */
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface TranslateJobPayload {
  jobId: string;
  projectId: string;
  userId: string;
  estimatedTokens: number;
  chapterIds: string[];
  stages: TranslationStages;
  translateOnlyEmpty: boolean;
  translateChapterTitles?: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface BullConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: object;
}

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  return url && (url.startsWith('redis://') || url.startsWith('rediss://')) ? url : null;
}

/**
 * Parse REDIS_URL into connection options for BullMQ.
 * BullMQ uses its own ioredis; we pass options to avoid version mismatch.
 */
export function getBullConnectionOptions(): BullConnectionOptions {
  const url = getRedisUrl();
  if (!url) {
    throw new Error(
      'REDIS_URL or UPSTASH_REDIS_URL required for BullMQ. Use redis:// or rediss:// format.'
    );
  }
  const parsed = new URL(url);
  const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
  const password = parsed.password || undefined;
  const username = parsed.username && parsed.username !== 'default' ? parsed.username : undefined;
  return {
    host: parsed.hostname,
    port,
    password,
    username,
    ...(parsed.protocol === 'rediss:' && { tls: {} }),
  };
}

/**
 * Check if BullMQ/Redis is available (REDIS_URL set and valid format).
 */
export function isBullAvailable(): boolean {
  return getRedisUrl() !== null;
}

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: false,
  attempts: 1,
};

let analysisQueue: Queue<AnalysisJobPayload> | null = null;
let translateQueue: Queue<TranslateJobPayload> | null = null;

export function getChapterAnalysisQueue(): Queue<AnalysisJobPayload> {
  if (!analysisQueue) {
    analysisQueue = new Queue<AnalysisJobPayload>(QUEUE_NAME_ANALYSIS, {
      connection: getBullConnectionOptions(),
      defaultJobOptions,
    });
  }
  return analysisQueue;
}

export function getChapterTranslateQueue(): Queue<TranslateJobPayload> {
  if (!translateQueue) {
    translateQueue = new Queue<TranslateJobPayload>(QUEUE_NAME_TRANSLATE, {
      connection: getBullConnectionOptions(),
      defaultJobOptions,
    });
  }
  return translateQueue;
}

export async function addAnalysisJob(payload: AnalysisJobPayload): Promise<void> {
  const queue = getChapterAnalysisQueue();
  await queue.add('analysis', payload, { jobId: payload.jobId });
}

export async function addTranslateJob(payload: TranslateJobPayload): Promise<void> {
  const queue = getChapterTranslateQueue();
  await queue.add('translate', payload, { jobId: payload.jobId });
}
