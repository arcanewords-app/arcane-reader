import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockUserFrom, mockServiceFrom, mockGetUserById } = vi.hoisted(() => ({
  mockUserFrom: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockGetUserById: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockUserFrom })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import {
  countPendingCatalogTranslationRequests,
  createCatalogTranslationRequest,
  deleteCatalogTranslationRequestAdmin,
  ensureProfileForAuthUser,
  getCatalogTranslationRequestById,
  listCatalogTranslationRequestsAdmin,
  listCatalogTranslationRequestsByUser,
  updateCatalogTranslationRequestAdmin,
} from './catalogBoard.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'insert',
    'update',
    'delete',
    'order',
    'limit',
    'single',
    'maybeSingle',
    'or',
    'range',
    'neq',
    'in',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const requestRow = {
  id: 'req-1',
  user_id: 'user-1',
  title: 'New novel',
  author_name: 'Author',
  source_language: 'en',
  target_language: 'ru',
  comment: null,
  source_url: null,
  status: 'pending',
  admin_notes: null,
  linked_publication_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('ensureProfileForAuthUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when profile already exists', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: { id: 'user-1' },
        error: null,
      })
    );

    await ensureProfileForAuthUser('user-1');
    assert.equal(mockGetUserById.mock.calls.length, 0);
  });

  it('creates profile when missing for auth user', async () => {
    const profileCheckChain = chainable({ data: null, error: null });
    const insertChain = chainable({ data: null, error: null });
    let serviceCall = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCall += 1;
      return serviceCall === 1 ? profileCheckChain : insertChain;
    });
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    await ensureProfileForAuthUser('user-1');
    assert.equal(insertChain.insert.mock.calls.length, 1);
    const payload = insertChain.insert.mock.calls[0]?.[0] as { id: string; email: string };
    assert.equal(payload.id, 'user-1');
    assert.equal(payload.email, 'user@example.com');
  });
});

describe('countPendingCatalogTranslationRequests', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns pending request count for user', async () => {
    mockUserFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 2,
      })
    );

    const count = await countPendingCatalogTranslationRequests('user-1', 'token');
    assert.equal(count, 2);
  });

  it('throws when count query fails', async () => {
    mockUserFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'count fail' },
      })
    );

    await assert.rejects(
      () => countPendingCatalogTranslationRequests('user-1', 'token'),
      /Failed to count catalog translation requests/
    );
  });
});

describe('createCatalogTranslationRequest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts pending request when profile exists and under pending limit', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: { id: 'user-1' },
        error: null,
      })
    );
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertChain = chainable({
      data: requestRow,
      error: null,
    });
    let userCalls = 0;
    mockUserFrom.mockImplementation(() => {
      userCalls += 1;
      return userCalls === 1 ? countChain : insertChain;
    });

    const result = await createCatalogTranslationRequest('user-1', 'token', {
      title: 'New novel',
      targetLanguage: 'ru',
    });

    assert.equal(result.id, 'req-1');
    assert.equal(result.status, 'pending');
  });

  it('throws PENDING_LIMIT when user has too many pending requests', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: { id: 'user-1' },
        error: null,
      })
    );
    mockUserFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
        count: 5,
      })
    );

    await assert.rejects(
      () =>
        createCatalogTranslationRequest('user-1', 'token', {
          title: 'Another',
          targetLanguage: 'ru',
        }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PENDING_LIMIT');
        return true;
      }
    );
  });

  it('throws when insert fails', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: { id: 'user-1' },
        error: null,
      })
    );
    const countChain = chainable({ data: null, error: null, count: 0 });
    const insertChain = chainable({
      data: null,
      error: { message: 'insert fail' },
    });
    let userCalls = 0;
    mockUserFrom.mockImplementation(() => {
      userCalls += 1;
      return userCalls === 1 ? countChain : insertChain;
    });

    await assert.rejects(
      () =>
        createCatalogTranslationRequest('user-1', 'token', {
          title: 'New novel',
          targetLanguage: 'ru',
        }),
      /Failed to create catalog translation request/
    );
  });
});

describe('listCatalogTranslationRequestsByUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps user catalog translation requests', async () => {
    mockUserFrom.mockReturnValue(
      chainable({
        data: [requestRow],
        error: null,
      })
    );

    const list = await listCatalogTranslationRequestsByUser('user-1', 'token');
    assert.equal(list.length, 1);
    assert.equal(list[0]?.title, 'New novel');
    assert.equal(list[0]?.targetLanguage, 'ru');
  });

  it('throws when list query fails', async () => {
    mockUserFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'list fail' },
      })
    );

    await assert.rejects(
      () => listCatalogTranslationRequestsByUser('user-1', 'token'),
      /Failed to list catalog translation requests/
    );
  });
});

describe('getCatalogTranslationRequestById', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when request not found', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );

    const request = await getCatalogTranslationRequestById('missing');
    assert.equal(request, null);
  });

  it('maps request row by id', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: requestRow,
        error: null,
      })
    );

    const request = await getCatalogTranslationRequestById('req-1');
    assert.equal(request?.id, 'req-1');
    assert.equal(request?.title, 'New novel');
  });

  it('throws when query fails', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'get fail' },
      })
    );

    await assert.rejects(
      () => getCatalogTranslationRequestById('req-1'),
      /Failed to get catalog translation request/
    );
  });
});

describe('listCatalogTranslationRequestsAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no requests match', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: [],
        error: null,
      })
    );

    const list = await listCatalogTranslationRequestsAdmin();
    assert.deepEqual(list, []);
    assert.equal(mockGetUserById.mock.calls.length, 0);
  });

  it('maps admin requests with user email', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: [requestRow],
        error: null,
      })
    );
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    const list = await listCatalogTranslationRequestsAdmin({ status: 'pending' });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.userEmail, 'user@example.com');
    assert.equal(list[0]?.status, 'pending');
  });

  it('throws when admin list query fails', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'admin list fail' },
      })
    );

    await assert.rejects(
      () => listCatalogTranslationRequestsAdmin(),
      /Failed to list admin catalog translation requests/
    );
  });
});

describe('updateCatalogTranslationRequestAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when request not found', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await updateCatalogTranslationRequestAdmin('missing', { status: 'accepted' });
    assert.equal(result, null);
  });

  it('updates request status and returns admin view with email', async () => {
    const updateChain = chainable({
      data: { ...requestRow, status: 'accepted' },
      error: null,
    });
    mockServiceFrom.mockReturnValue(updateChain);
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    const result = await updateCatalogTranslationRequestAdmin('req-1', { status: 'accepted' });
    assert.equal(result?.status, 'accepted');
    assert.equal(result?.userEmail, 'user@example.com');
    assert.equal(updateChain.update.mock.calls.length, 1);
  });

  it('returns existing request without update when patch is empty', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: requestRow,
        error: null,
      })
    );
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    const result = await updateCatalogTranslationRequestAdmin('req-1', {});
    assert.equal(result?.id, 'req-1');
    assert.equal(mockServiceFrom.mock.calls[0]?.[0], 'catalog_translation_requests');
  });
});

describe('deleteCatalogTranslationRequestAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when request not found', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const deleted = await deleteCatalogTranslationRequestAdmin('missing');
    assert.equal(deleted, false);
  });

  it('throws DELETE_FORBIDDEN for pending request', async () => {
    mockServiceFrom.mockReturnValue(
      chainable({
        data: { id: 'req-1', status: 'pending' },
        error: null,
      })
    );

    await assert.rejects(
      () => deleteCatalogTranslationRequestAdmin('req-1'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'DELETE_FORBIDDEN');
        return true;
      }
    );
  });

  it('deletes rejected request and returns true', async () => {
    const fetchChain = chainable({
      data: { id: 'req-1', status: 'rejected' },
      error: null,
    });
    const deleteChain = chainable({ data: null, error: null });
    let serviceCall = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceCall += 1;
      return serviceCall === 1 ? fetchChain : deleteChain;
    });

    const deleted = await deleteCatalogTranslationRequestAdmin('req-1');
    assert.equal(deleted, true);
    assert.equal(deleteChain.delete.mock.calls.length, 1);
  });
});
