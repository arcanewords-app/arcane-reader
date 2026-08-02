import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Application } from 'express';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('./handlers/projectRouteHandlers.js', () => ({
  handleBulkUpdateParagraphs: vi.fn(),
  handleCloneProject: vi.fn(),
  handleCreateProject: vi.fn(),
  handleDeleteProject: vi.fn(),
  handleGetChaptersSummary: vi.fn(),
  handleGetProject: vi.fn(),
  handleGetReaderSettings: vi.fn(),
  handleListProjects: vi.fn(),
  handleProjectAiReplace: vi.fn(),
  handleRenameProject: vi.fn(),
  handleSearchProject: vi.fn(),
  handleTransferChapters: vi.fn(),
  handleUpdateProjectLanguages: vi.fn(),
  handleUpdateProjectSettings: vi.fn(),
  handleUpdateReaderSettings: vi.fn(),
}));

import { registerProjectRoutes } from './projects.js';

describe('registerProjectRoutes', () => {
  it('registers project CRUD, search, and settings routes', () => {
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

    registerProjectRoutes(app, {} as never);

    assert.ok(methods.includes('GET /api/projects'));
    assert.ok(methods.includes('POST /api/projects'));
    assert.ok(methods.includes('GET /api/projects/:id/search'));
    assert.ok(methods.includes('PUT /api/projects/:id/languages'));
    assert.ok(methods.includes('POST /api/projects/:id/search/ai-replace'));
    assert.ok(methods.length >= 14);
  });
});
