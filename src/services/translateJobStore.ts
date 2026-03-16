import { Redis } from '@upstash/redis';

export type TranslateJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type TranslateChapterStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface TranslateJobChapter {
  chapterId: string;
  title: string;
  status: TranslateChapterStatus;
  tokensUsed?: number;
  tokensByStage?: {
    analysis?: number;
    translation?: number;
    editing?: number;
  };
  duration?: number;
}

export interface TranslateJobState {
  jobId: string;
  projectId: string;
  userId: string;
  status: TranslateJobStatus;
  current: number;
  total: number;
  currentChapterTitle?: string;
  /** Chunk progress within current chapter (for polling backoff reset) */
  currentChapterChunksDone?: number;
  currentChapterTotalChunks?: number;
  chapters: TranslateJobChapter[];
  totalTokensUsed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
  cancelRequested: boolean;
}

export interface TranslateJobStore {
  createJob(job: TranslateJobState): Promise<void>;
  getJob(jobId: string): Promise<TranslateJobState | null>;
  updateJob(jobId: string, patch: Partial<TranslateJobState>): Promise<TranslateJobState | null>;
  requestCancel(jobId: string): Promise<void>;
  isCancelRequested(jobId: string): Promise<boolean>;
  cancelJob(jobId: string): Promise<TranslateJobState | null>;
  deleteJob(jobId: string): Promise<void>;
  setTtl(jobId: string, seconds: number): Promise<void>;
  addToProjectIndex(projectId: string, jobId: string): Promise<void>;
  removeFromProjectIndex(projectId: string, jobId: string): Promise<void>;
  listByProject(projectId: string): Promise<TranslateJobState[]>;
}

function getRedisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function translateJobKey(jobId: string): string {
  return `translate_job:${jobId}`;
}

function translateJobCancelKey(jobId: string): string {
  return `translate_job_cancel:${jobId}`;
}

function projectTranslateJobsKey(projectId: string): string {
  return `project:translate_jobs:${projectId}`;
}

function hasJobChanged(current: TranslateJobState, next: TranslateJobState): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}

class RedisTranslateJobStore implements TranslateJobStore {
  private readonly updateLocks = new Map<string, Promise<void>>();

  constructor(private readonly redis: Redis) {}

  private async withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.updateLocks.get(jobId) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.updateLocks.set(jobId, queued);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.updateLocks.get(jobId) === queued) {
        this.updateLocks.delete(jobId);
      }
    }
  }

  async createJob(job: TranslateJobState): Promise<void> {
    await this.redis.set(translateJobKey(job.jobId), job);
    await this.redis.del(translateJobCancelKey(job.jobId));
  }

  async getJob(jobId: string): Promise<TranslateJobState | null> {
    const value = await this.redis.get<TranslateJobState>(translateJobKey(jobId));
    return value ?? null;
  }

  async updateJob(jobId: string, patch: Partial<TranslateJobState>): Promise<TranslateJobState | null> {
    return this.withJobLock(jobId, async () => {
      const current = await this.getJob(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      if (!hasJobChanged(current, next)) {
        return current;
      }
      await this.redis.set(translateJobKey(jobId), next);
      return next;
    });
  }

  async requestCancel(jobId: string): Promise<void> {
    await this.redis.set(translateJobCancelKey(jobId), '1');
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    const value = await this.redis.get<string | number | boolean>(translateJobCancelKey(jobId));
    if (value === '1' || value === 1 || value === true) return true;
    const job = await this.getJob(jobId);
    return job?.cancelRequested === true;
  }

  async cancelJob(jobId: string): Promise<TranslateJobState | null> {
    const current = await this.getJob(jobId);
    if (!current) return null;
    if (
      current.status === 'completed' ||
      current.status === 'error' ||
      current.status === 'canceled'
    ) {
      return current;
    }
    await this.requestCancel(jobId);
    return { ...current, cancelRequested: true };
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.redis.del(translateJobKey(jobId));
    await this.redis.del(translateJobCancelKey(jobId));
  }

  async setTtl(jobId: string, seconds: number): Promise<void> {
    await this.redis.expire(translateJobKey(jobId), seconds);
    await this.redis.expire(translateJobCancelKey(jobId), seconds);
  }

  async addToProjectIndex(projectId: string, jobId: string): Promise<void> {
    await this.redis.sadd(projectTranslateJobsKey(projectId), jobId);
  }

  async removeFromProjectIndex(projectId: string, jobId: string): Promise<void> {
    await this.redis.srem(projectTranslateJobsKey(projectId), jobId);
  }

  async listByProject(projectId: string): Promise<TranslateJobState[]> {
    const jobIds = await this.redis.smembers(projectTranslateJobsKey(projectId));
    const jobs: TranslateJobState[] = [];
    for (const id of jobIds) {
      const job = await this.getJob(id);
      if (job) {
        jobs.push(job);
      } else {
        await this.removeFromProjectIndex(projectId, id);
      }
    }
    return jobs.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
  }
}

class MemoryTranslateJobStore implements TranslateJobStore {
  private readonly jobs = new Map<string, TranslateJobState>();
  private readonly projectIndex = new Map<string, Set<string>>();
  private readonly cancelFlags = new Map<string, boolean>();
  private readonly ttlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly updateLocks = new Map<string, Promise<void>>();

  private async withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.updateLocks.get(jobId) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.updateLocks.set(jobId, queued);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.updateLocks.get(jobId) === queued) {
        this.updateLocks.delete(jobId);
      }
    }
  }

  async createJob(job: TranslateJobState): Promise<void> {
    this.jobs.set(job.jobId, job);
    this.cancelFlags.delete(job.jobId);
  }

  async getJob(jobId: string): Promise<TranslateJobState | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async updateJob(jobId: string, patch: Partial<TranslateJobState>): Promise<TranslateJobState | null> {
    return this.withJobLock(jobId, async () => {
      const current = this.jobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      if (!hasJobChanged(current, next)) {
        return current;
      }
      this.jobs.set(jobId, next);
      return next;
    });
  }

  async requestCancel(jobId: string): Promise<void> {
    this.cancelFlags.set(jobId, true);
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    if (this.cancelFlags.get(jobId) === true) return true;
    return this.jobs.get(jobId)?.cancelRequested === true;
  }

  async cancelJob(jobId: string): Promise<TranslateJobState | null> {
    const current = this.jobs.get(jobId);
    if (!current) return null;
    if (
      current.status === 'completed' ||
      current.status === 'error' ||
      current.status === 'canceled'
    ) {
      return current;
    }
    await this.requestCancel(jobId);
    return { ...current, cancelRequested: true };
  }

  async deleteJob(jobId: string): Promise<void> {
    const tid = this.ttlTimers.get(jobId);
    if (tid) {
      clearTimeout(tid);
      this.ttlTimers.delete(jobId);
    }
    this.jobs.delete(jobId);
    this.cancelFlags.delete(jobId);
  }

  async setTtl(jobId: string, seconds: number): Promise<void> {
    const existing = this.ttlTimers.get(jobId);
    if (existing) clearTimeout(existing);
    const job = this.jobs.get(jobId);
    const projectId = job?.projectId;
    const tid = setTimeout(() => {
      this.jobs.delete(jobId);
      this.cancelFlags.delete(jobId);
      this.ttlTimers.delete(jobId);
      if (projectId) {
        const set = this.projectIndex.get(projectId);
        if (set) {
          set.delete(jobId);
          if (set.size === 0) this.projectIndex.delete(projectId);
        }
      }
    }, seconds * 1000);
    this.ttlTimers.set(jobId, tid);
  }

  async addToProjectIndex(projectId: string, jobId: string): Promise<void> {
    let set = this.projectIndex.get(projectId);
    if (!set) {
      set = new Set();
      this.projectIndex.set(projectId, set);
    }
    set.add(jobId);
  }

  async removeFromProjectIndex(projectId: string, jobId: string): Promise<void> {
    const set = this.projectIndex.get(projectId);
    if (set) {
      set.delete(jobId);
      if (set.size === 0) this.projectIndex.delete(projectId);
    }
  }

  async listByProject(projectId: string): Promise<TranslateJobState[]> {
    const set = this.projectIndex.get(projectId);
    if (!set) return [];
    const jobs: TranslateJobState[] = [];
    for (const id of set) {
      const job = this.jobs.get(id);
      if (job) jobs.push(job);
    }
    return jobs.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
  }
}

let singletonStore: TranslateJobStore | null = null;

export function createTranslateJobStoreFromEnv(): TranslateJobStore {
  if (singletonStore) return singletonStore;
  const env = getRedisEnv();
  if (!env) {
    singletonStore = new MemoryTranslateJobStore();
    return singletonStore;
  }
  singletonStore = new RedisTranslateJobStore(
    new Redis({
      url: env.url,
      token: env.token,
    })
  );
  return singletonStore;
}
