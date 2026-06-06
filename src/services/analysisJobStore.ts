import { Redis } from '@upstash/redis';

export type AnalysisJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type AnalysisChapterStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface AnalysisJobChapter {
  chapterId: string;
  title: string;
  status: AnalysisChapterStatus;
  tokensUsed?: number;
}

export interface AnalysisJobState {
  jobId: string;
  projectId: string;
  userId: string;
  status: AnalysisJobStatus;
  current: number;
  total: number;
  currentChapterTitle?: string;
  chapters: AnalysisJobChapter[];
  totalTokensUsed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
  cancelRequested: boolean;
  /** Reserved tokens for release on completion/error/cancel */
  estimatedTokens?: number;
  /** Effective language pair for this job (project default or override). */
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface AnalysisJobStore {
  createJob(job: AnalysisJobState): Promise<void>;
  getJob(jobId: string): Promise<AnalysisJobState | null>;
  updateJob(jobId: string, patch: Partial<AnalysisJobState>): Promise<AnalysisJobState | null>;
  requestCancel(jobId: string): Promise<void>;
  isCancelRequested(jobId: string): Promise<boolean>;
  cancelJob(jobId: string): Promise<AnalysisJobState | null>;
  deleteJob(jobId: string): Promise<void>;
  setTtl(jobId: string, seconds: number): Promise<void>;
  addToProjectIndex(projectId: string, jobId: string): Promise<void>;
  removeFromProjectIndex(projectId: string, jobId: string): Promise<void>;
  listByProject(projectId: string): Promise<AnalysisJobState[]>;
  hasActiveJobForUser(userId: string): Promise<boolean>;
  setUserActiveJob(userId: string, jobId: string): Promise<void>;
  clearUserActiveJob(userId: string, jobId: string): Promise<void>;
}

function getRedisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function analysisJobKey(jobId: string): string {
  return `analysis_job:${jobId}`;
}

function analysisJobCancelKey(jobId: string): string {
  return `analysis_job_cancel:${jobId}`;
}

function projectAnalysisJobsKey(projectId: string): string {
  return `project:analysis_jobs:${projectId}`;
}

function userActiveAnalysisKey(userId: string): string {
  return `user:active_analysis:${userId}`;
}

function hasJobChanged(current: AnalysisJobState, next: AnalysisJobState): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}

class RedisAnalysisJobStore implements AnalysisJobStore {
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

  async createJob(job: AnalysisJobState): Promise<void> {
    await this.redis.set(analysisJobKey(job.jobId), job);
    await this.redis.del(analysisJobCancelKey(job.jobId));
  }

  async getJob(jobId: string): Promise<AnalysisJobState | null> {
    const value = await this.redis.get<AnalysisJobState>(analysisJobKey(jobId));
    return value ?? null;
  }

  async updateJob(
    jobId: string,
    patch: Partial<AnalysisJobState>
  ): Promise<AnalysisJobState | null> {
    return this.withJobLock(jobId, async () => {
      const current = await this.getJob(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      if (!hasJobChanged(current, next)) {
        return current;
      }
      await this.redis.set(analysisJobKey(jobId), next);
      return next;
    });
  }

  async requestCancel(jobId: string): Promise<void> {
    await this.redis.set(analysisJobCancelKey(jobId), '1');
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    const value = await this.redis.get<string | number | boolean>(analysisJobCancelKey(jobId));
    if (value === '1' || value === 1 || value === true) return true;
    const job = await this.getJob(jobId);
    return job?.cancelRequested === true;
  }

  async cancelJob(jobId: string): Promise<AnalysisJobState | null> {
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
    await this.redis.del(analysisJobKey(jobId));
    await this.redis.del(analysisJobCancelKey(jobId));
  }

  async setTtl(jobId: string, seconds: number): Promise<void> {
    await this.redis.expire(analysisJobKey(jobId), seconds);
    await this.redis.expire(analysisJobCancelKey(jobId), seconds);
  }

  async addToProjectIndex(projectId: string, jobId: string): Promise<void> {
    await this.redis.sadd(projectAnalysisJobsKey(projectId), jobId);
  }

  async removeFromProjectIndex(projectId: string, jobId: string): Promise<void> {
    await this.redis.srem(projectAnalysisJobsKey(projectId), jobId);
  }

  async listByProject(projectId: string): Promise<AnalysisJobState[]> {
    const jobIds = await this.redis.smembers(projectAnalysisJobsKey(projectId));
    const jobs: AnalysisJobState[] = [];
    for (const id of jobIds) {
      const job = await this.getJob(id);
      if (job) {
        jobs.push(job);
      } else {
        await this.removeFromProjectIndex(projectId, id);
      }
    }
    return jobs.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }

  async hasActiveJobForUser(userId: string): Promise<boolean> {
    const jobId = await this.redis.get<string>(userActiveAnalysisKey(userId));
    if (!jobId) return false;
    const job = await this.getJob(jobId);
    return job !== null && (job.status === 'queued' || job.status === 'processing');
  }

  async setUserActiveJob(userId: string, jobId: string): Promise<void> {
    await this.redis.set(userActiveAnalysisKey(userId), jobId);
  }

  async clearUserActiveJob(userId: string, jobId: string): Promise<void> {
    const current = await this.redis.get<string>(userActiveAnalysisKey(userId));
    if (current === jobId) {
      await this.redis.del(userActiveAnalysisKey(userId));
    }
  }
}

class MemoryAnalysisJobStore implements AnalysisJobStore {
  private readonly jobs = new Map<string, AnalysisJobState>();
  private readonly projectIndex = new Map<string, Set<string>>();
  private readonly userActiveAnalysis = new Map<string, string>();
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

  async createJob(job: AnalysisJobState): Promise<void> {
    this.jobs.set(job.jobId, job);
    this.cancelFlags.delete(job.jobId);
  }

  async getJob(jobId: string): Promise<AnalysisJobState | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async updateJob(
    jobId: string,
    patch: Partial<AnalysisJobState>
  ): Promise<AnalysisJobState | null> {
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

  async cancelJob(jobId: string): Promise<AnalysisJobState | null> {
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
    const job = this.jobs.get(jobId);
    if (job) {
      this.clearUserActiveJob(job.userId, jobId);
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
      const j = this.jobs.get(jobId);
      if (j) this.clearUserActiveJob(j.userId, jobId);
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

  async listByProject(projectId: string): Promise<AnalysisJobState[]> {
    const set = this.projectIndex.get(projectId);
    if (!set) return [];
    const jobs: AnalysisJobState[] = [];
    for (const id of set) {
      const job = this.jobs.get(id);
      if (job) jobs.push(job);
    }
    return jobs.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }

  async hasActiveJobForUser(userId: string): Promise<boolean> {
    const jobId = this.userActiveAnalysis.get(userId);
    if (!jobId) return false;
    const job = this.jobs.get(jobId);
    return job !== undefined && (job.status === 'queued' || job.status === 'processing');
  }

  async setUserActiveJob(userId: string, jobId: string): Promise<void> {
    this.userActiveAnalysis.set(userId, jobId);
  }

  async clearUserActiveJob(userId: string, jobId: string): Promise<void> {
    if (this.userActiveAnalysis.get(userId) === jobId) {
      this.userActiveAnalysis.delete(userId);
    }
  }
}

let singletonStore: AnalysisJobStore | null = null;

export function createAnalysisJobStoreFromEnv(): AnalysisJobStore {
  if (singletonStore) return singletonStore;
  const env = getRedisEnv();
  if (!env) {
    singletonStore = new MemoryAnalysisJobStore();
    return singletonStore;
  }
  singletonStore = new RedisAnalysisJobStore(
    new Redis({
      url: env.url,
      token: env.token,
    })
  );
  return singletonStore;
}
