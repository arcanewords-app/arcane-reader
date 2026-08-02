import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const workerInstances: Array<{
    name: string;
    processor: (job: { data: unknown }) => Promise<void>;
    opts: Record<string, unknown>;
    handlers: Map<string, (...args: unknown[]) => void>;
    close: ReturnType<typeof vi.fn>;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  }> = [];

  class Worker {
    handlers = new Map<string, (...args: unknown[]) => void>();
    close = vi.fn(async () => undefined);
    on = (event: string, cb: (...args: unknown[]) => void) => {
      this.handlers.set(event, cb);
    };
    constructor(
      public name: string,
      public processor: (job: { data: unknown }) => Promise<void>,
      public opts: Record<string, unknown>
    ) {
      workerInstances.push(this);
    }
  }

  return {
    workerInstances,
    Worker,
    isBullAvailable: vi.fn(),
    getBullConnectionOptions: vi.fn(() => ({ host: 'localhost', port: 6379 })),
    runAnalysisJob: vi.fn(async () => undefined),
    runTranslateJob: vi.fn(async () => undefined),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('bullmq', () => ({ Worker: hoisted.Worker }));
vi.mock('./chapterQueue.js', () => ({
  isBullAvailable: hoisted.isBullAvailable,
  getBullConnectionOptions: hoisted.getBullConnectionOptions,
}));
vi.mock('./jobs/runAnalysisJob.js', () => ({ runAnalysisJob: hoisted.runAnalysisJob }));
vi.mock('./jobs/runTranslateJob.js', () => ({ runTranslateJob: hoisted.runTranslateJob }));
vi.mock('../logger.js', () => ({ logger: hoisted.logger }));

describe('chapterWorker', () => {
  const prev = {
    REDIS: process.env.REDIS_URL,
    KV_URL: process.env.KV_REST_API_URL,
    KV_TOKEN: process.env.KV_REST_API_TOKEN,
    UPSTASH_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    ANALYSIS: process.env.BULL_ANALYSIS_CONCURRENCY,
    TRANSLATE: process.env.BULL_TRANSLATE_CONCURRENCY,
  };

  beforeEach(() => {
    vi.resetModules();
    hoisted.workerInstances.length = 0;
    hoisted.isBullAvailable.mockReset().mockReturnValue(true);
    hoisted.runAnalysisJob.mockClear();
    hoisted.runTranslateJob.mockClear();
    hoisted.logger.warn.mockClear();
    hoisted.logger.error.mockClear();
    hoisted.logger.info.mockClear();
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 'token';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'test';
    process.env.BULL_ANALYSIS_CONCURRENCY = '2';
    process.env.BULL_TRANSLATE_CONCURRENCY = '4';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      const envKey =
        key === 'REDIS'
          ? 'REDIS_URL'
          : key === 'KV_URL'
            ? 'KV_REST_API_URL'
            : key === 'KV_TOKEN'
              ? 'KV_REST_API_TOKEN'
              : key === 'UPSTASH_URL'
                ? 'UPSTASH_REDIS_REST_URL'
                : key === 'UPSTASH_TOKEN'
                  ? 'UPSTASH_REDIS_REST_TOKEN'
                  : key === 'ANALYSIS'
                    ? 'BULL_ANALYSIS_CONCURRENCY'
                    : key === 'TRANSLATE'
                      ? 'BULL_TRANSLATE_CONCURRENCY'
                      : 'NODE_ENV';
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  });

  it('no-ops when Bull is unavailable', async () => {
    hoisted.isBullAvailable.mockReturnValue(false);
    const mod = await import('./chapterWorker.js');
    mod.startChapterWorkers();
    assert.equal(hoisted.workerInstances.length, 0);
    assert.match(String(hoisted.logger.warn.mock.calls[0]?.[0]), /REDIS_URL/);
  });

  it('warns and returns in non-production when job-store redis missing', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.NODE_ENV = 'development';
    const mod = await import('./chapterWorker.js');
    mod.startChapterWorkers();
    assert.equal(hoisted.workerInstances.length, 0);
    assert.match(String(hoisted.logger.warn.mock.calls[0]?.[0]), /KV_REST_API_URL/);
  });

  it('exits in production when job-store redis missing', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.NODE_ENV = 'production';
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const mod = await import('./chapterWorker.js');
    mod.startChapterWorkers();
    assert.equal(exitSpy.mock.calls[0]?.[0], 1);
    assert.equal(hoisted.logger.error.mock.calls.length, 1);
    exitSpy.mockRestore();
  });

  it('starts analysis/translate workers and runs processors', async () => {
    const mod = await import('./chapterWorker.js');
    mod.startChapterWorkers();
    assert.equal(hoisted.workerInstances.length, 2);
    const analysis = hoisted.workerInstances.find((w) => w.name === 'chapter-analysis');
    const translate = hoisted.workerInstances.find((w) => w.name === 'chapter-translate');
    assert.ok(analysis);
    assert.ok(translate);
    assert.equal(analysis!.opts.concurrency, 2);
    assert.equal(translate!.opts.concurrency, 4);

    await analysis!.processor({ data: { jobId: 'a1' } });
    await translate!.processor({ data: { jobId: 't1' } });
    assert.equal(hoisted.runAnalysisJob.mock.calls.length, 1);
    assert.equal(hoisted.runTranslateJob.mock.calls.length, 1);

    analysis!.handlers.get('error')?.(new Error('boom'));
    translate!.handlers.get('failed')?.({ id: 't1' }, new Error('fail'));
    assert.equal(hoisted.logger.error.mock.calls.length, 1);
    assert.equal(hoisted.logger.warn.mock.calls.length, 1);

    await mod.closeChapterWorkers();
    assert.equal(analysis!.close.mock.calls.length, 1);
    assert.equal(translate!.close.mock.calls.length, 1);
    assert.match(String(hoisted.logger.info.mock.calls.at(-1)?.[0] ?? ''), /closed/i);
  });

  it('closeChapterWorkers is safe when workers were never started', async () => {
    hoisted.isBullAvailable.mockReturnValue(false);
    const mod = await import('./chapterWorker.js');
    mod.startChapterWorkers();
    await mod.closeChapterWorkers();
    assert.match(String(hoisted.logger.info.mock.calls.at(-1)?.[0] ?? ''), /closed/i);
  });
});
