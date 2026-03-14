import { Redis } from '@upstash/redis';

export type ImportJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type ImportJobPhase = 'parsing' | 'saving' | 'finalizing' | null;

export interface ImportJobState {
  jobId: string;
  projectId: string;
  userId: string;
  status: ImportJobStatus;
  phase: ImportJobPhase;
  format: 'epub' | 'fb2' | 'csv';
  filename: string;
  current: number;
  total: number;
  currentChapterTitle?: string;
  warnings: string[];
  errors: string[];
  chapters: Array<{ number: number; title: string }>;
  startedAt: string;
  finishedAt: string | null;
  cancelRequested: boolean;
}

export interface ImportJobStore {
  createJob(job: ImportJobState): Promise<void>;
  getJob(jobId: string): Promise<ImportJobState | null>;
  updateJob(jobId: string, patch: Partial<ImportJobState>): Promise<ImportJobState | null>;
  requestCancel(jobId: string): Promise<void>;
  isCancelRequested(jobId: string): Promise<boolean>;
  cancelJob(jobId: string): Promise<ImportJobState | null>;
  deleteJob(jobId: string): Promise<void>;
  setTtl(jobId: string, seconds: number): Promise<void>;
}

function getRedisEnv():
  | { url: string; token: string }
  | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function importJobKey(jobId: string): string {
  return `import_job:${jobId}`;
}

function importJobCancelKey(jobId: string): string {
  return `import_job_cancel:${jobId}`;
}

class RedisImportJobStore implements ImportJobStore {
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

  async createJob(job: ImportJobState): Promise<void> {
    await this.redis.set(importJobKey(job.jobId), job);
    await this.redis.del(importJobCancelKey(job.jobId));
  }

  async getJob(jobId: string): Promise<ImportJobState | null> {
    const value = await this.redis.get<ImportJobState>(importJobKey(jobId));
    return value ?? null;
  }

  async updateJob(jobId: string, patch: Partial<ImportJobState>): Promise<ImportJobState | null> {
    return this.withJobLock(jobId, async () => {
      const current = await this.getJob(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      await this.redis.set(importJobKey(jobId), next);
      return next;
    });
  }

  async requestCancel(jobId: string): Promise<void> {
    await this.redis.set(importJobCancelKey(jobId), '1');
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    const value = await this.redis.get<string | number | boolean>(importJobCancelKey(jobId));
    if (value === '1' || value === 1 || value === true) return true;
    const job = await this.getJob(jobId);
    return job?.cancelRequested === true;
  }

  async cancelJob(jobId: string): Promise<ImportJobState | null> {
    const current = await this.getJob(jobId);
    if (!current) return null;
    if (current.status === 'completed' || current.status === 'error' || current.status === 'canceled') {
      return current;
    }
    await this.requestCancel(jobId);
    return { ...current, cancelRequested: true };
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.redis.del(importJobKey(jobId));
    await this.redis.del(importJobCancelKey(jobId));
  }

  async setTtl(jobId: string, seconds: number): Promise<void> {
    await this.redis.expire(importJobKey(jobId), seconds);
    await this.redis.expire(importJobCancelKey(jobId), seconds);
  }
}

class MemoryImportJobStore implements ImportJobStore {
  private readonly jobs = new Map<string, ImportJobState>();
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

  async createJob(job: ImportJobState): Promise<void> {
    this.jobs.set(job.jobId, job);
    this.cancelFlags.delete(job.jobId);
  }

  async getJob(jobId: string): Promise<ImportJobState | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async updateJob(jobId: string, patch: Partial<ImportJobState>): Promise<ImportJobState | null> {
    return this.withJobLock(jobId, async () => {
      const current = this.jobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
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

  async cancelJob(jobId: string): Promise<ImportJobState | null> {
    const current = this.jobs.get(jobId);
    if (!current) return null;
    if (current.status === 'completed' || current.status === 'error' || current.status === 'canceled') {
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
    const tid = setTimeout(() => {
      this.jobs.delete(jobId);
      this.cancelFlags.delete(jobId);
      this.ttlTimers.delete(jobId);
    }, seconds * 1000);
    this.ttlTimers.set(jobId, tid);
  }
}

let singletonStore: ImportJobStore | null = null;

export function createImportJobStoreFromEnv(): ImportJobStore {
  if (singletonStore) return singletonStore;
  const env = getRedisEnv();
  if (!env) {
    singletonStore = new MemoryImportJobStore();
    return singletonStore;
  }
  singletonStore = new RedisImportJobStore(
    new Redis({
      url: env.url,
      token: env.token,
    })
  );
  return singletonStore;
}

