import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { installAuthMocks } from '../helpers/mockAuth.js';
import { installRedisCacheMocks } from '../helpers/mockRedis.js';
import { bootTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  getAdminProjectCard: vi.fn(),
  updateAdminProjectCard: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.js', () => installAuthMocks({ defaultRole: 'author' }));
vi.mock('../../../src/services/redisCache.js', () => installRedisCacheMocks());
vi.mock('../../../src/services/supabase/domains/admin.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getAdminProjectCard: (...args: unknown[]) => mocks.getAdminProjectCard(...args),
    updateAdminProjectCard: (...args: unknown[]) => mocks.updateAdminProjectCard(...args),
  };
});

const PROJECT_ID = '302c72e4-1788-49a7-8317-98075b9d6372';

describe('admin project card (integration)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  beforeEach(() => {
    mocks.getAdminProjectCard.mockReset();
    mocks.updateAdminProjectCard.mockReset();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).patch(`/api/admin/projects/${PROJECT_ID}/card`).send({
      description: 'Moderated',
    });
    expect(res.status).toBe(401);
    expect(mocks.updateAdminProjectCard).not.toHaveBeenCalled();
  });

  it('returns 403 for an author', async () => {
    const res = await request(app)
      .patch(`/api/admin/projects/${PROJECT_ID}/card`)
      .set('Authorization', 'Bearer test-token')
      .send({ description: 'Moderated' });
    expect(res.status).toBe(403);
    expect(mocks.updateAdminProjectCard).not.toHaveBeenCalled();
  });

  it('lets an admin patch reach the card service', async () => {
    mocks.updateAdminProjectCard.mockResolvedValue({
      id: PROJECT_ID,
      userId: 'owner-1',
      publicationId: null,
      publicationSlug: null,
      description: 'Moderated',
    });

    const res = await request(app)
      .patch(`/api/admin/projects/${PROJECT_ID}/card`)
      .set('Authorization', 'Bearer test-token')
      .set('X-Test-Role', 'admin')
      .send({ description: 'Moderated' });

    expect(res.status).toBe(200);
    expect(mocks.updateAdminProjectCard).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ description: 'Moderated' })
    );
  });
});
