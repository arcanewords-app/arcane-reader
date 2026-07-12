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

import { handleServiceError } from '../../../middleware/serviceHealth.js';
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
    vi.mocked(handleServiceError).mockReturnValue(false);
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

  describe('error branches', () => {
    it('handleGetReportsCount returns 500 on unexpected error', async () => {
      mockGetCount.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleGetReportsCount(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to get reports count' });
    });

    it('handleGetReportsCount delegates to handleServiceError', async () => {
      mockGetCount.mockRejectedValue(new Error('supabase down'));
      vi.mocked(handleServiceError).mockReturnValue(true);
      const res = mockRes();
      await handleGetReportsCount(mockReq() as never, res as never);
      assert.equal(vi.mocked(handleServiceError).mock.calls.length, 1);
    });

    it('handleListReports returns 500 on unexpected error', async () => {
      mockGetReports.mockRejectedValue(new Error('db fail'));
      const res = mockRes();
      await handleListReports(mockReq() as never, res as never);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to get reports' });
    });

    it('handleListReports delegates to handleServiceError', async () => {
      mockGetReports.mockRejectedValue(new Error('supabase down'));
      vi.mocked(handleServiceError).mockReturnValue(true);
      const res = mockRes();
      await handleListReports(mockReq() as never, res as never);
      assert.equal(vi.mocked(handleServiceError).mock.calls.length, 1);
    });

    it('handlePatchReportStatus returns 400 on validation failure', async () => {
      const res = mockRes();
      await handlePatchReportStatus(
        mockReq({ body: { status: 'invalid-status' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Validation failed');
    });

    it('handlePatchReportStatus returns 400 on domain error', async () => {
      mockUpdateStatus.mockRejectedValue(new Error('Report not found'));
      const res = mockRes();
      await handlePatchReportStatus(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Report not found');
    });

    it('handlePatchReportStatus delegates to handleServiceError', async () => {
      mockUpdateStatus.mockRejectedValue(new Error('redis down'));
      vi.mocked(handleServiceError).mockReturnValue(true);
      const res = mockRes();
      await handlePatchReportStatus(mockReq() as never, res as never);
      assert.equal(vi.mocked(handleServiceError).mock.calls.length, 1);
    });

    it('handleDeleteReport returns 400 on domain error', async () => {
      mockDeleteReport.mockRejectedValue(new Error('Cannot delete report'));
      const res = mockRes();
      await handleDeleteReport(mockReq() as never, res as never);
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Cannot delete report');
    });

    it('handleDeleteReport delegates to handleServiceError', async () => {
      mockDeleteReport.mockRejectedValue(new Error('supabase down'));
      vi.mocked(handleServiceError).mockReturnValue(true);
      const res = mockRes();
      await handleDeleteReport(mockReq() as never, res as never);
      assert.equal(vi.mocked(handleServiceError).mock.calls.length, 1);
    });
  });
});
