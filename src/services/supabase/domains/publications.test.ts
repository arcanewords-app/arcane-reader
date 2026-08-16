import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockGetProject, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetProject: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock('../../supabaseClient.js', () => ({
  supabase: { from: mockFrom },
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock('./projects.js', () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import {
  assertOwnedActiveTranslatorPseudonym,
  countActiveTranslatorPseudonymsForUser,
  countPublicationsUsingEntity,
  createOrUpdatePublication,
  createPublicEntity,
  createTranslatorPseudonymForUser,
  deletePublicEntity,
  getGlossaryForPublication,
  getPublicationById,
  getPublicationByProjectId,
  getPublicationBySlugOrId,
  getPublicationChapterContent,
  getPublicationWithChapters,
  getPublicEntityById,
  getTranslatorPseudonymForUser,
  getUserPublications,
  hideTranslatorPseudonymForUser,
  listPublicEntities,
  listPublicEntitiesByIds,
  listPublicationsPublic,
  listTranslatorPseudonymsForUser,
  syncPublicationTranslationStatus,
  unpublishProject,
  updatePublicationDisplaySettings,
  updatePublicationExportPaths,
  updatePublicEntity,
  updateTranslatorPseudonymForUser,
} from './publications.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'in',
    'contains',
    'order',
    'range',
    'single',
    'ilike',
    'neq',
    'not',
    'or',
    'maybeSingle',
    'insert',
    'update',
    'delete',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const pubRow = {
  id: 'pub-1',
  project_id: 'proj-1',
  status: 'published',
  title: 'Novel',
  description: null,
  cover_image_url: null,
  author_display: 'Author',
  translator_display: 'Translator',
  source_language: 'en',
  target_language: 'ru',
  published_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  slug: 'novel-slug',
  translated_chapter_count: 3,
};

describe('listPublicationsPublic', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps published rows from view', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [pubRow],
        error: null,
      })
    );
    const list = await listPublicationsPublic({ limit: 10, offset: 0 });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, 'pub-1');
    assert.equal(list[0]?.translatedChapterCount, 3);
  });

  it('throws when list query fails without fallback trigger', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'permission denied for table' },
      })
    );
    await assert.rejects(() => listPublicationsPublic(), /Failed to list publications/);
  });

  it('falls back to publications table when view is missing', async () => {
    const viewChain = chainable({
      data: null,
      error: { message: 'relation "publications_list_with_counts" does not exist' },
    });
    const fallbackChain = chainable({
      data: [pubRow],
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? viewChain : fallbackChain;
    });

    const list = await listPublicationsPublic({ limit: 10, offset: 0 });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, 'pub-1');
  });
});

describe('getPublicationBySlugOrId', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads by slug for non-uuid input', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: pubRow,
        error: null,
      })
    );
    const pub = await getPublicationBySlugOrId('novel-slug');
    assert.equal(pub?.slug, 'novel-slug');
  });

  it('returns null when slug publication not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const pub = await getPublicationBySlugOrId('missing-slug');
    assert.equal(pub, null);
  });

  it('throws when slug lookup fails with non-not-found error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'db fail' },
      })
    );
    await assert.rejects(() => getPublicationBySlugOrId('bad-slug'), /Failed to get publication/);
  });

  it('delegates uuid to getPublicationById', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: pubRow,
        error: null,
      })
    );
    const pub = await getPublicationBySlugOrId('00000000-0000-4000-8000-000000000001');
    assert.equal(pub?.id, 'pub-1');
  });
});

describe('getPublicationById', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for unpublished status', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { ...pubRow, status: 'draft' },
        error: null,
      })
    );
    const pub = await getPublicationById('pub-1');
    assert.equal(pub, null);
  });

  it('returns null on PGRST116', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const pub = await getPublicationById('missing');
    assert.equal(pub, null);
  });
});

const entityRow = {
  id: 'ent-1',
  kind: 'author',
  name: 'Jane Author',
  description: 'Bio',
  photo_url: null,
  created_by: 'user-1',
  owner_user_id: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('listPublicEntities', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps active entity rows', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [entityRow],
        error: null,
      })
    );
    const list = await listPublicEntities({ kind: 'author', search: 'Jane' });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.name, 'Jane Author');
    assert.equal(list[0]?.kind, 'author');
  });

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'list fail' },
      })
    );
    await assert.rejects(() => listPublicEntities(), /Failed to list public entities/);
  });
});

describe('listPublicEntitiesByIds', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty ids', async () => {
    const list = await listPublicEntitiesByIds([]);
    assert.deepEqual(list, []);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('maps active entity rows by ids', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [entityRow],
        error: null,
      })
    );
    const list = await listPublicEntitiesByIds(['ent-1']);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, 'ent-1');
    assert.equal(list[0]?.name, 'Jane Author');
  });

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'batch fail' },
      })
    );
    await assert.rejects(
      () => listPublicEntitiesByIds(['ent-1']),
      /Failed to list public entities by ids/
    );
  });
});

describe('countActiveTranslatorPseudonymsForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns count for active translator pseudonyms', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 2,
      })
    );
    const count = await countActiveTranslatorPseudonymsForUser('user-1');
    assert.equal(count, 2);
  });

  it('throws when count query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'count fail' },
      })
    );
    await assert.rejects(
      () => countActiveTranslatorPseudonymsForUser('user-1'),
      /Failed to count translator pseudonyms/
    );
  });
});

describe('getPublicationWithChapters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when publication not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const result = await getPublicationWithChapters('missing-slug');
    assert.equal(result, null);
  });

  it('returns chapters and glossary count for published publication', async () => {
    const pubChain = chainable({ data: pubRow, error: null });
    const chaptersChain = chainable({
      data: [{ id: 'ch-1', number: 1, title: 'One', translated_title: 'Один' }],
      error: null,
    });
    const translatedChain = chainable({ data: [{ id: 'ch-1' }], error: null });
    const glossaryCountChain = chainable({ data: null, error: null, count: 4 });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) return pubChain;
      if (call === 2) return chaptersChain;
      if (call === 3) return translatedChain;
      return glossaryCountChain;
    });

    const result = await getPublicationWithChapters('novel-slug');
    assert.equal(result?.publication.id, 'pub-1');
    assert.equal(result?.chapters.length, 1);
    assert.equal(result?.chapters[0]?.hasTranslation, true);
    assert.equal(result?.chapters[0]?.title, 'Один');
    assert.equal(result?.glossaryCount, 4);
  });
});

describe('createPublicEntity', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts and maps created entity', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: entityRow,
        error: null,
      })
    );
    const entity = await createPublicEntity(
      { kind: 'author', name: 'Jane Author', description: 'Bio' },
      'token'
    );
    assert.equal(entity.id, 'ent-1');
    assert.equal(entity.name, 'Jane Author');
    assert.equal(entity.kind, 'author');
  });

  it('throws when insert fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'insert fail' },
      })
    );
    await assert.rejects(
      () => createPublicEntity({ kind: 'author', name: 'Jane' }, 'token'),
      /Failed to create public entity/
    );
  });
});

describe('getPublicEntityById', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when entity not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    const entity = await getPublicEntityById('missing');
    assert.equal(entity, null);
  });

  it('maps entity row by id', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: entityRow,
        error: null,
      })
    );
    const entity = await getPublicEntityById('ent-1');
    assert.equal(entity?.id, 'ent-1');
    assert.equal(entity?.name, 'Jane Author');
  });

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'get fail' },
      })
    );
    await assert.rejects(() => getPublicEntityById('ent-1'), /Failed to get public entity/);
  });
});

const translatorRow = {
  id: 'ent-t1',
  kind: 'translator',
  name: 'Translator Alias',
  description: null,
  photo_url: null,
  created_by: 'user-1',
  owner_user_id: 'user-1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('listTranslatorPseudonymsForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps active translator pseudonyms for user', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [translatorRow],
        error: null,
      })
    );
    const list = await listTranslatorPseudonymsForUser('user-1');
    assert.equal(list.length, 1);
    assert.equal(list[0]?.name, 'Translator Alias');
    assert.equal(list[0]?.kind, 'translator');
  });

  it('includes hidden pseudonyms when includeHidden is true', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ ...translatorRow, status: 'blocked' }],
        error: null,
      })
    );
    const list = await listTranslatorPseudonymsForUser('user-1', { includeHidden: true });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.entityStatus, 'blocked');
  });

  it('throws when list query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'list fail' },
      })
    );
    await assert.rejects(
      () => listTranslatorPseudonymsForUser('user-1'),
      /Failed to list translator pseudonyms/
    );
  });
});

describe('getUserPublications', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps user publications from view with chapter counts', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [pubRow],
        error: null,
      })
    );
    const list = await getUserPublications('user-1', 'token');
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, 'pub-1');
    assert.equal(list[0]?.translatedChapterCount, 3);
  });

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'user pubs fail' },
      })
    );
    await assert.rejects(
      () => getUserPublications('user-1', 'token'),
      /Failed to get user publications/
    );
  });
});

describe('unpublishProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when publication is unpublished', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { id: 'pub-1' },
        error: null,
      })
    );
    const ok = await unpublishProject('proj-1', 'user-1', 'token');
    assert.equal(ok, true);
  });

  it('returns false when publication not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const ok = await unpublishProject('proj-1', 'user-1', 'token');
    assert.equal(ok, false);
  });

  it('throws on other update errors', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'update fail' },
      })
    );
    await assert.rejects(
      () => unpublishProject('proj-1', 'user-1', 'token'),
      /Failed to unpublish/
    );
  });
});

const projectFixture = {
  id: 'proj-1',
  name: 'My Novel',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  metadata: { title: 'Meta Title' },
  chapters: [],
  glossary: [],
};

describe('createOrUpdatePublication', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when project not found', async () => {
    mockGetProject.mockResolvedValue(undefined);
    await assert.rejects(
      () => createOrUpdatePublication('proj-1', 'user-1', 'token', { status: 'draft' }),
      /Project not found/
    );
  });

  it('inserts publication when none exists for project', async () => {
    mockGetProject.mockResolvedValue(projectFixture);
    const existingSelectChain = chainable({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const slugChain = chainable({ data: null, error: null });
    const insertChain = chainable({
      data: { ...pubRow, status: 'draft', project_id: 'proj-1', user_id: 'user-1' },
      error: null,
    });
    let pubCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'publications') throw new Error(`unexpected table ${table}`);
      pubCall += 1;
      if (pubCall === 1) return existingSelectChain;
      if (pubCall === 2) return slugChain;
      return insertChain;
    });

    const pub = await createOrUpdatePublication('proj-1', 'user-1', 'token', {
      status: 'draft',
      title: 'Custom Title',
    });
    assert.equal(pub.id, 'pub-1');
    assert.equal(insertChain.insert.mock.calls.length, 1);
  });

  it('updates existing publication', async () => {
    mockGetProject.mockResolvedValue(projectFixture);
    const existingSelectChain = chainable({
      data: { id: 'pub-1', published_at: null },
      error: null,
    });
    const slugChain = chainable({ data: null, error: null });
    const updateChain = chainable({
      data: { ...pubRow, status: 'published' },
      error: null,
    });
    let pubCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'publications') throw new Error(`unexpected table ${table}`);
      pubCall += 1;
      if (pubCall === 1) return existingSelectChain;
      if (pubCall === 2) return slugChain;
      return updateChain;
    });

    const pub = await createOrUpdatePublication('proj-1', 'user-1', 'token', {
      status: 'published',
    });
    assert.equal(pub.status, 'published');
    assert.equal(updateChain.update.mock.calls.length, 1);
  });

  it('throws when insert fails', async () => {
    mockGetProject.mockResolvedValue(projectFixture);
    const existingSelectChain = chainable({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const slugChain = chainable({ data: null, error: null });
    const insertChain = chainable({
      data: null,
      error: { message: 'insert fail' },
    });
    let pubCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'publications') throw new Error(`unexpected table ${table}`);
      pubCall += 1;
      if (pubCall === 1) return existingSelectChain;
      if (pubCall === 2) return slugChain;
      return insertChain;
    });

    await assert.rejects(
      () => createOrUpdatePublication('proj-1', 'user-1', 'token', { status: 'draft' }),
      /Failed to create publication/
    );
  });

  it('throws when update fails', async () => {
    mockGetProject.mockResolvedValue(projectFixture);
    const existingSelectChain = chainable({
      data: { id: 'pub-1', published_at: '2026-01-01T00:00:00Z' },
      error: null,
    });
    const slugChain = chainable({ data: null, error: null });
    const updateChain = chainable({
      data: null,
      error: { message: 'update fail' },
    });
    let pubCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'publications') throw new Error(`unexpected table ${table}`);
      pubCall += 1;
      if (pubCall === 1) return existingSelectChain;
      if (pubCall === 2) return slugChain;
      return updateChain;
    });

    await assert.rejects(
      () => createOrUpdatePublication('proj-1', 'user-1', 'token', { status: 'published' }),
      /Failed to update publication/
    );
  });

  it('resolves slug conflict by appending numeric suffix', async () => {
    mockGetProject.mockResolvedValue(projectFixture);
    const existingSelectChain = chainable({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const slugTakenChain = chainable({ data: { id: 'other-pub' }, error: null });
    const slugFreeChain = chainable({ data: null, error: null });
    const insertChain = chainable({
      data: { ...pubRow, status: 'draft', slug: 'my-novel-1' },
      error: null,
    });
    let pubCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'publications') throw new Error(`unexpected table ${table}`);
      pubCall += 1;
      if (pubCall === 1) return existingSelectChain;
      if (pubCall === 2) return slugTakenChain;
      if (pubCall === 3) return slugFreeChain;
      return insertChain;
    });

    const pub = await createOrUpdatePublication('proj-1', 'user-1', 'token', {
      status: 'draft',
      title: 'My Novel',
    });
    assert.equal(pub.slug, 'my-novel-1');
    assert.equal(insertChain.insert.mock.calls.length, 1);
  });
});

describe('getPublicationChapterContent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when publication not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );
    const content = await getPublicationChapterContent('missing', 'ch-1');
    assert.equal(content, null);
  });

  it('returns null when chapter has no translated text', async () => {
    const pubChain = chainable({ data: pubRow, error: null });
    const chapterChain = chainable({
      data: {
        id: 'ch-1',
        number: 1,
        title: 'Ch1',
        translated_title: null,
        translated_text: null,
      },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') return pubChain;
      if (table === 'chapters') return chapterChain;
      throw new Error(`unexpected table ${table}`);
    });

    const content = await getPublicationChapterContent('pub-1', 'ch-1');
    assert.equal(content, null);
  });

  it('returns chapter content with display title', async () => {
    const pubChain = chainable({ data: pubRow, error: null });
    const chapterChain = chainable({
      data: {
        id: 'ch-1',
        number: 1,
        title: 'Chapter One',
        translated_title: 'Глава 1',
        translated_text: 'Translated body',
      },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'publications') return pubChain;
      if (table === 'chapters') return chapterChain;
      throw new Error(`unexpected table ${table}`);
    });

    const content = await getPublicationChapterContent('pub-1', 'ch-1');
    assert.equal(content?.id, 'ch-1');
    assert.equal(content?.number, 1);
    assert.equal(content?.translatedText, 'Translated body');
    assert.equal(content?.title, 'Глава 1');
  });
});

describe('syncPublicationTranslationStatus', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates translation status for owned publication', async () => {
    const updateChain = chainable({ data: null, error: null });
    mockFrom.mockReturnValue(updateChain);

    await syncPublicationTranslationStatus('proj-1', 'user-1', 'token', 'in_progress');

    assert.equal(updateChain.update.mock.calls.length, 1);
    const payload = updateChain.update.mock.calls[0]?.[0] as { translation_status: string };
    assert.equal(payload.translation_status, 'in_progress');
  });

  it('throws when sync update fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'sync fail' },
      })
    );
    await assert.rejects(
      () => syncPublicationTranslationStatus('proj-1', 'user-1', 'token', 'complete'),
      /Failed to sync publication translation status/
    );
  });
});

describe('assertOwnedActiveTranslatorPseudonym', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns entity when user owns active translator pseudonym', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: translatorRow,
        error: null,
      })
    );
    const entity = await assertOwnedActiveTranslatorPseudonym('user-1', 'ent-t1');
    assert.equal(entity.id, 'ent-t1');
  });

  it('throws INVALID_TRANSLATOR_PSEUDONYM when entity is not owned', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { ...translatorRow, owner_user_id: 'other-user' },
        error: null,
      })
    );
    await assert.rejects(
      () => assertOwnedActiveTranslatorPseudonym('user-1', 'ent-t1'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'INVALID_TRANSLATOR_PSEUDONYM');
        return true;
      }
    );
  });
});

describe('createTranslatorPseudonymForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws PSEUDONYM_LIMIT when user is at cap', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 3,
      })
    );
    await assert.rejects(
      () => createTranslatorPseudonymForUser('user-1', { name: 'Alias' }, 'token'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PSEUDONYM_LIMIT');
        return true;
      }
    );
  });

  it('inserts translator pseudonym when under limit', async () => {
    const countChain = chainable({ data: null, error: null, count: 1 });
    const insertChain = chainable({
      data: translatorRow,
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? countChain : insertChain;
    });

    const entity = await createTranslatorPseudonymForUser('user-1', { name: 'Alias' }, 'token');
    assert.equal(entity.name, 'Translator Alias');
    assert.equal(insertChain.insert.mock.calls.length, 1);
  });
});

describe('updatePublicEntity', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates and maps entity', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { ...entityRow, name: 'Updated Author' },
        error: null,
      })
    );
    const entity = await updatePublicEntity(
      'ent-1',
      { name: 'Updated Author', description: 'New bio' },
      'token'
    );
    assert.equal(entity.name, 'Updated Author');
  });

  it('throws when entity not found', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    await assert.rejects(
      () => updatePublicEntity('missing', { name: 'X' }, 'token'),
      /entity not found/
    );
  });

  it('throws when update fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'update fail' } }));
    await assert.rejects(
      () => updatePublicEntity('ent-1', { name: 'X' }, 'token'),
      /Failed to update public entity/
    );
  });
});

describe('deletePublicEntity', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes entity without error', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    await deletePublicEntity('ent-1', 'token');
    assert.equal(mockFrom.mock.calls[0]?.[0], 'public_entities');
  });

  it('throws when delete fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'delete fail' } }));
    await assert.rejects(
      () => deletePublicEntity('ent-1', 'token'),
      /Failed to delete public entity/
    );
  });
});

describe('getTranslatorPseudonymForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped translator when found', async () => {
    mockFrom.mockReturnValue(chainable({ data: translatorRow, error: null }));
    const entity = await getTranslatorPseudonymForUser('user-1', 'ent-t1');
    assert.equal(entity?.id, 'ent-t1');
  });

  it('returns null when missing', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    assert.equal(await getTranslatorPseudonymForUser('user-1', 'missing'), null);
  });
});

describe('updateTranslatorPseudonymForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates owned translator pseudonym', async () => {
    const getChain = chainable({ data: translatorRow, error: null });
    const updateChain = chainable({
      data: { ...translatorRow, name: 'New Alias' },
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? getChain : updateChain;
    });
    const entity = await updateTranslatorPseudonymForUser('user-1', 'ent-t1', {
      name: 'New Alias',
    });
    assert.equal(entity.name, 'New Alias');
  });

  it('throws when pseudonym not owned', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    await assert.rejects(
      () => updateTranslatorPseudonymForUser('user-1', 'missing', { name: 'X' }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'INVALID_TRANSLATOR_PSEUDONYM');
        return true;
      }
    );
  });
});

describe('hideTranslatorPseudonymForUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hides owned translator pseudonym', async () => {
    const getChain = chainable({ data: translatorRow, error: null });
    const hideChain = chainable({
      data: { ...translatorRow, status: 'blocked' },
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? getChain : hideChain;
    });
    const entity = await hideTranslatorPseudonymForUser('user-1', 'ent-t1');
    assert.equal(entity.entityStatus, 'blocked');
  });
});

describe('countPublicationsUsingEntity', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns usage count', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null, count: 7 }));
    assert.equal(await countPublicationsUsingEntity('ent-1'), 7);
  });

  it('throws when count query fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'count fail' } }));
    await assert.rejects(
      () => countPublicationsUsingEntity('ent-1'),
      /Failed to count entity usage/
    );
  });
});

describe('getGlossaryForPublication', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when publication missing', async () => {
    mockFrom.mockReturnValue(
      chainable({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    );
    assert.deepEqual(await getGlossaryForPublication('missing'), []);
  });

  it('loads glossary for published publication', async () => {
    const pubChain = chainable({ data: pubRow, error: null });
    const glossaryChain = chainable({
      data: [
        {
          id: 'g1',
          project_id: 'proj-1',
          type: 'character',
          original: 'Hero',
          translated: 'Герой',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? pubChain : glossaryChain;
    });
    const entries = await getGlossaryForPublication('pub-1');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.original, 'Hero');
  });
});

describe('updatePublicationExportPaths', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates export paths for owner', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    await updatePublicationExportPaths('pub-1', 'user-1', 'token', {
      epubStoragePath: 'a.epub',
      fb2StoragePath: 'b.fb2',
    });
    assert.equal(mockFrom.mock.calls[0]?.[0], 'publications');
  });

  it('throws when update fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'paths fail' } }));
    await assert.rejects(
      () => updatePublicationExportPaths('pub-1', 'user-1', 'token', { epubStoragePath: 'a' }),
      /Failed to update publication export paths/
    );
  });
});

describe('updatePublicationDisplaySettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates showGlossary setting', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }));
    await updatePublicationDisplaySettings('pub-1', 'user-1', 'token', { showGlossary: false });
    assert.equal(mockFrom.mock.calls[0]?.[0], 'publications');
  });

  it('throws when update fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'display fail' } }));
    await assert.rejects(
      () =>
        updatePublicationDisplaySettings('pub-1', 'user-1', 'token', {
          translationStatus: 'in_progress',
        }),
      /Failed to update publication display settings/
    );
  });
});

describe('getPublicationByProjectId', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns publication for project owner', async () => {
    mockFrom.mockReturnValue(chainable({ data: pubRow, error: null }));
    const pub = await getPublicationByProjectId('proj-1', 'user-1', 'token');
    assert.equal(pub?.id, 'pub-1');
  });

  it('returns null on PGRST116', async () => {
    mockFrom.mockReturnValue(
      chainable({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    );
    assert.equal(await getPublicationByProjectId('proj-1', 'user-1', 'token'), null);
  });

  it('uses service role client when requested', async () => {
    mockFrom.mockReturnValue(chainable({ data: pubRow, error: null }));
    const pub = await getPublicationByProjectId('proj-1', 'user-1', 'token', {
      useServiceRole: true,
    });
    assert.equal(pub?.id, 'pub-1');
  });
});
