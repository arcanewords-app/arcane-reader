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

vi.mock('./handlers/adminRouteHandlers.js', () => ({
  handleCreatePublicEntity: vi.fn(),
  handleUpdatePublicEntity: vi.fn(),
  handleDeletePublicEntity: vi.fn(),
  handleGetPublicEntityUsage: vi.fn(),
  handleListAdminNews: vi.fn(),
  handleCreateNewsPost: vi.fn(),
  handleGetAdminNewsPost: vi.fn(),
  handleUpdateNewsPost: vi.fn(),
  handleDeleteNewsPost: vi.fn(),
  handlePublishNewsPost: vi.fn(),
  handleTranslateNewsPost: vi.fn(),
  handleListAnnouncementAlerts: vi.fn(),
  handleCreateAnnouncementAlert: vi.fn(),
  handleCreateAnnouncementFromNews: vi.fn(),
  handleUpdateAnnouncementAlert: vi.fn(),
  handleDeleteAnnouncementAlert: vi.fn(),
  handleListAdminPublications: vi.fn(),
  handleUnpublishPublicationAdmin: vi.fn(),
  handleListAdminProjects: vi.fn(),
  handleUnpublishProjectAdmin: vi.fn(),
  handleDeleteProjectAdmin: vi.fn(),
  handleListAdminUsers: vi.fn(),
  handleUpdateUserRoleAdmin: vi.fn(),
  handleListAdminTranslationRequests: vi.fn(),
  handleUpdateAdminTranslationRequest: vi.fn(),
  handleDeleteAdminTranslationRequest: vi.fn(),
}));

import { registerAdminRoutes } from './admin.js';

describe('registerAdminRoutes', () => {
  it('registers admin entity, news, announcement, and user routes', () => {
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
      patch(path: string) {
        methods.push(`PATCH ${path}`);
        return app;
      },
      delete(path: string) {
        methods.push(`DELETE ${path}`);
        return app;
      },
    } as unknown as Application;

    registerAdminRoutes(app, { uploadImage: { single: () => vi.fn() } } as never);

    assert.ok(methods.includes('POST /api/admin/entities'));
    assert.ok(methods.includes('GET /api/admin/news'));
    assert.ok(methods.includes('GET /api/admin/announcements'));
    assert.ok(methods.includes('PATCH /api/admin/users/:id/role'));
    assert.ok(methods.includes('DELETE /api/admin/translation-requests/:id'));
    assert.ok(methods.length >= 20);
  });
});
