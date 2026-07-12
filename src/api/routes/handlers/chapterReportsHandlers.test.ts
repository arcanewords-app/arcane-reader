import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockGetCount, mockGetReports, mockUpdateStatus, mockDeleteReport, mockRedisDelMany } =
  vi.hoisted(() => ({
    mockGetCount: vi.fn(),
    mockGetReports: vi.fn(),
    mockUpdateStatus: vi.fn(),
    mockDeleteReport: vi.fn(),
    mockRedisDelMany: vi.fn(),
  }));

vi.mock('../../../services/supabase/domains/translationReports.js', () => ({
  getTranslationReportsCountByProject: (...args: unknown[]) => mockGetCount(...args),
  getTranslationReportsByProject: (...args: unknown[]) => mockGetReports(...args),
  updateTranslationReportStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  deleteTranslationReport: (...args: unknown[]) => mockDeleteReport(...args),
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: vi.fn(() => false),
}));

vi.mock('../../../services/redisCache.js', () => ({
  redisDelMany: (...args: unknown[]) => mockRedisDelMany(...args),
}));

vi.mock('../../routeHelpers.js', () => ({
  projectReportsCountCacheKey: (projectId: string) => `reports-count:${projectId}`,
}));

import {
  handleDeleteReport,
  handleGetReportsCount,
  handleListReports,
  handlePatchReportStatus,
} from './chapterReportsHandlers.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1' },
    token: 'bearer-token',
    params: { id: 'proj-1', reportId: 'rep-1' },
    body: { status: 'reviewed' },
    log: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  };
}

describe('chapterReportsHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handleGetReportsCount returns count json', async () => {
    mockGetCount.mockResolvedValue(5);
    const res = mockRes();
    await handleGetReportsCount(mockReq() as never, res as never);
    assert.deepEqual(res.body, { count: 5 });
  });

  it('handleListReports returns reports array', async () => {
    mockGetReports.mockResolvedValue([{ id: 'rep-1' }]);
    const res = mockRes();
    await handleListReports(mockReq() as never, res as never);
    assert.equal((res.body as unknown[]).length, 1);
  });

  it('handlePatchReportStatus updates and invalidates cache', async () => {
    mockUpdateStatus.mockResolvedValue(undefined);
    const res = mockRes();
    await handlePatchReportStatus(mockReq() as never, res as never);
    assert.deepEqual(res.body, { success: true });
    assert.equal(mockRedisDelMany.mock.calls.length, 1);
  });

  it('handleDeleteReport deletes and invalidates cache', async () => {
    mockDeleteReport.mockResolvedValue(undefined);
    const res = mockRes();
    await handleDeleteReport(mockReq() as never, res as never);
    assert.deepEqual(res.body, { success: true });
  });
});
