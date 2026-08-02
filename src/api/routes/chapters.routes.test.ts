import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Application } from 'express';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('./handlers/chapterRouteHandlers.js', () => ({
  handleGetChapterStatus: vi.fn(),
  handleGetChapter: vi.fn(),
  handleDeleteChapter: vi.fn(),
  handleDuplicateChapters: vi.fn(),
  handleBulkDeleteChapters: vi.fn(),
  handleCancelTranslation: vi.fn(),
  handleSyncTranslation: vi.fn(),
  handleUploadTranslation: vi.fn(),
  handleMarkAsTranslated: vi.fn(),
  handleMarkAsTranslatedBatch: vi.fn(),
  handleChapterCritic: vi.fn(),
  handleGetChapterStats: vi.fn(),
  handleUpdateChapterTitle: vi.fn(),
  handleUpdateChapterNumber: vi.fn(),
  handleUpdateChapterStatus: vi.fn(),
  handleUpdateChaptersOrder: vi.fn(),
  handleUpdateParagraph: vi.fn(),
  createHandleAnalyzeBatch: () => vi.fn(),
  createHandleListProjectJobs: () => vi.fn(),
  createHandleGetAnalysisJobStatus: () => vi.fn(),
  createHandleCancelAnalysisJob: () => vi.fn(),
  createHandleTranslateBatch: () => vi.fn(),
  createHandleGetTranslateJobStatus: () => vi.fn(),
  createHandleCancelTranslateJob: () => vi.fn(),
  createHandleTranslateChapter: () => vi.fn(),
}));

import { registerChapterRoutes } from './chapters.js';

describe('registerChapterRoutes', () => {
  it('registers chapter CRUD and job status routes', () => {
    const methods: string[] = [];
    const app = {
      get(path: string) {
        methods.push(`GET ${path}`);
        return app;
      },
      post(path: string) {
        methods.push(`POST ${path}`);
        return app;
      },
      put(path: string) {
        methods.push(`PUT ${path}`);
        return app;
      },
      patch(path: string) {
        methods.push(`PATCH ${path}`);
        return app;
      },
      delete(path: string) {
        methods.push(`DELETE ${path}`);
        return app;
      },
    } as unknown as Application;

    registerChapterRoutes(app, {} as never);

    assert.ok(methods.includes('GET /api/projects/:projectId/chapters/:chapterId'));
    assert.ok(methods.includes('POST /api/projects/:projectId/chapters/analyze-batch'));
    assert.ok(methods.includes('POST /api/projects/:projectId/chapters/translate-batch'));
    assert.ok(methods.length >= 15);
  });
});
