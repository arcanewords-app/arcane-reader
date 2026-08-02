import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Application } from 'express';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../shared/multerCompat.js', () => ({
  asUploadMiddleware: (mw: unknown) => mw,
}));

vi.mock('./handlers/glossaryRouteHandlers.js', () => ({
  handleGetGlossary: vi.fn(),
  handleExportGlossary: vi.fn(),
  handleImportGlossary: vi.fn(),
  handleCreateGlossaryEntry: vi.fn(),
  handleUpdateGlossaryEntry: vi.fn(),
  handleDeleteGlossaryEntry: vi.fn(),
  handleBulkDeleteGlossaryEntries: vi.fn(),
  createHandleSuggestGlossaryMerges: () => vi.fn(),
  handleMergeGlossaryEntries: vi.fn(),
  handleUploadGlossaryEntryImage: vi.fn(),
  handleDeleteGlossaryEntryImageByIndex: vi.fn(),
  handleDeleteGlossaryEntryImages: vi.fn(),
}));

import { registerGlossaryRoutes } from './glossary.js';

describe('registerGlossaryRoutes', () => {
  it('registers glossary CRUD, import/export, and image routes', () => {
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
      delete(path: string) {
        methods.push(`DELETE ${path}`);
        return app;
      },
    } as unknown as Application;

    registerGlossaryRoutes(app, {
      uploadGlossaryFile: { single: () => vi.fn() },
      uploadImage: { single: () => vi.fn() },
      openai: {},
    } as never);

    assert.ok(methods.includes('GET /api/projects/:id/glossary'));
    assert.ok(methods.includes('POST /api/projects/:id/glossary/import'));
    assert.ok(methods.includes('PUT /api/projects/:projectId/glossary/:entryId'));
    assert.ok(methods.length >= 10);
  });
});
