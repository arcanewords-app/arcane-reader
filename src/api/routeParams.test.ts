import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  adminUserRoleParamsSchema,
  announcementIdParamSchema,
  entityIdParamSchema,
  idOrSlugParamSchema,
  idParamSchema,
  importJobParamsSchema,
  newsIdParamSchema,
  projectChapterParamsSchema,
  projectIdOnlyParamSchema,
  projectIdParamSchema,
  promptLabIdParamSchema,
  publicationChapterParamsSchema,
  publicationIdParamSchema,
  targetProjectParamsSchema,
} from './routeParams.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('routeParams schemas', () => {
  it('idParamSchema accepts UUID', () => {
    assert.deepEqual(idParamSchema.parse({ id: UUID }), { id: UUID });
  });

  it('projectChapterParamsSchema requires projectId and chapterId', () => {
    assert.deepEqual(projectChapterParamsSchema.parse({ projectId: UUID, chapterId: UUID2 }), {
      projectId: UUID,
      chapterId: UUID2,
    });
    assert.throws(() => projectChapterParamsSchema.parse({ projectId: UUID }));
  });

  it('publicationChapterParamsSchema uses id and chapterId', () => {
    assert.deepEqual(publicationChapterParamsSchema.parse({ id: UUID, chapterId: UUID2 }), {
      id: UUID,
      chapterId: UUID2,
    });
  });

  it('idOrSlugParamSchema accepts opaque slug', () => {
    assert.deepEqual(idOrSlugParamSchema.parse({ idOrSlug: 'my-post-slug' }), {
      idOrSlug: 'my-post-slug',
    });
  });

  it('importJobParamsSchema accepts jobId slug', () => {
    assert.deepEqual(importJobParamsSchema.parse({ id: UUID, jobId: 'imp_abc' }), {
      id: UUID,
      jobId: 'imp_abc',
    });
  });

  it('rejects invalid UUID in param schemas', () => {
    assert.throws(() => projectIdParamSchema.parse({ id: 'bad' }));
    assert.throws(() => newsIdParamSchema.parse({ id: 'bad' }));
    assert.throws(() => entityIdParamSchema.parse({ id: 'bad' }));
    assert.throws(() => adminUserRoleParamsSchema.parse({ id: 'bad' }));
    assert.throws(() => announcementIdParamSchema.parse({ id: 'bad' }));
    assert.throws(() => projectIdOnlyParamSchema.parse({ projectId: 'bad' }));
    assert.throws(() => targetProjectParamsSchema.parse({ targetProjectId: 'bad' }));
    assert.throws(() => promptLabIdParamSchema.parse({ id: '' }));
  });

  it('publicationIdParamSchema accepts UUID', () => {
    assert.deepEqual(publicationIdParamSchema.parse({ id: UUID }), { id: UUID });
  });
});
