import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Application } from 'express';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../shared/multerCompat.js', () => ({
  asUploadMiddleware: (mw: unknown) => mw,
}));

vi.mock('./handlers/publicationRouteHandlers.js', () => ({
  handleUploadCover: vi.fn(),
  handleDeleteCover: vi.fn(),
  handleUpdateProjectMetadata: vi.fn(),
  handleExportProject: vi.fn(),
  handleExportDownload: vi.fn(),
  handleBuildPublicationExports: vi.fn(),
  handleUpdatePublicationDisplaySettings: vi.fn(),
  handlePublicationDownload: vi.fn(),
  handleListPublicEntities: vi.fn(),
  handleGetPublicEntity: vi.fn(),
  handleListNews: vi.fn(),
  handleGetNewsPost: vi.fn(),
  handleGetActiveAnnouncement: vi.fn(),
  handleDismissAnnouncement: vi.fn(),
  handleListPublications: vi.fn(),
  handleGetPublication: vi.fn(),
  handleGetPublicationChapters: vi.fn(),
  handleGetPublicationChapter: vi.fn(),
  handleGetPublicationGlossary: vi.fn(),
  handleGetReadProgress: vi.fn(),
  handleReportPublication: vi.fn(),
  handleCreatePublicationQuote: vi.fn(),
  handleGetPublicationRatingStatus: vi.fn(),
  handleUpsertPublicationRating: vi.fn(),
  handleDeletePublicationRating: vi.fn(),
  handleUpsertReadProgress: vi.fn(),
  handleResetReadProgress: vi.fn(),
  handleMarkChapterRead: vi.fn(),
  handleUpdateReadingPosition: vi.fn(),
  handlePublishProject: vi.fn(),
  handleUnpublishProject: vi.fn(),
  handleGetUserPublications: vi.fn(),
  handleGetProjectPublication: vi.fn(),
}));

import { registerPublicationRoutes } from './publications.js';

describe('registerPublicationRoutes', () => {
  it('registers publication, news, and project publish routes', () => {
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

    registerPublicationRoutes(app, { uploadImage: { single: () => vi.fn() } } as never);

    assert.ok(methods.includes('GET /api/publications'));
    assert.ok(methods.includes('GET /api/news'));
    assert.ok(methods.includes('POST /api/projects/:projectId/publish'));
    assert.ok(methods.includes('POST /api/publications/:id/quotes'));
    assert.ok(methods.includes('PATCH /api/publications/:id/read-progress'));
    assert.ok(methods.length >= 25);
  });
});
