import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import {
  deletePublicationRating,
  getPublicationRatingStatus,
  PublicationRatingError,
  upsertPublicationRating,
} from './publicationRatings.js';

const jwt = 'header.payload.signature';

const mockGetPublicationById = vi.fn();
const mockGetReadProgress = vi.fn();
const mockFrom = vi.fn();
const mockCreateClientWithToken = vi.fn();

vi.mock('./publications.js', () => ({
  getPublicationById: (...args: unknown[]) => mockGetPublicationById(...args),
}));

vi.mock('./readerProgress.js', () => ({
  getReadProgress: (...args: unknown[]) => mockGetReadProgress(...args),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: (...args: unknown[]) => mockCreateClientWithToken(...args),
}));

function chain(result: { data?: unknown; error?: unknown }) {
  const c = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => c),
    single: vi.fn(() => Promise.resolve(result)),
    delete: vi.fn(() => c),
  };
  return c;
}

describe('getPublicationRatingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClientWithToken.mockReturnValue({ from: mockFrom });
  });

  it('returns guest when no user', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'p1', userId: 'owner' });
    const status = await getPublicationRatingStatus('p1', null, null);
    assert.equal(status.eligibility, 'guest');
  });

  it('returns owner when user owns publication', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'p1', userId: 'u1' });
    const status = await getPublicationRatingStatus('p1', 'u1', jwt);
    assert.equal(status.eligibility, 'owner');
  });

  it('returns not_read without progress', async () => {
    mockGetPublicationById.mockResolvedValue({ id: 'p1', userId: 'owner' });
    mockGetReadProgress.mockResolvedValue({
      lastReadChapterNumber: 0,
    });
    const status = await getPublicationRatingStatus('p1', 'u2', jwt);
    assert.equal(status.eligibility, 'not_read');
  });
});

describe('upsertPublicationRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClientWithToken.mockReturnValue({ from: mockFrom });
    mockGetPublicationById.mockResolvedValue({ id: 'p1', userId: 'owner' });
    mockGetReadProgress.mockResolvedValue({
      lastReadChapterNumber: 2,
    });
  });

  it('rejects invalid score', async () => {
    await assert.rejects(() => upsertPublicationRating('p1', 'u2', 6, jwt), /integer from 1 to 5/);
  });

  it('rejects owner', async () => {
    await assert.rejects(
      () => upsertPublicationRating('p1', 'owner', 5, jwt),
      (err: unknown) => err instanceof PublicationRatingError && err.code === 'OWN_WORK'
    );
  });

  it('upserts when eligible', async () => {
    const ratingsChain = chain({ data: { score: 4 }, error: null });
    ratingsChain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    mockFrom.mockReturnValue(ratingsChain);
    const result = await upsertPublicationRating('p1', 'u2', 4, jwt);
    assert.equal(result.score, 4);
    assert.equal(mockFrom.mock.calls[0]?.[0], 'publication_ratings');
  });
});

describe('deletePublicationRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClientWithToken.mockReturnValue({ from: mockFrom });
    mockGetPublicationById.mockResolvedValue({ id: 'p1', userId: 'owner' });
    mockGetReadProgress.mockResolvedValue({
      lastReadChapterNumber: 2,
    });
  });

  it('deletes when eligible', async () => {
    const ratingsChain = chain({ data: null, error: null });
    ratingsChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { score: 3 }, error: null }));
    mockFrom.mockReturnValue(ratingsChain);
    await deletePublicationRating('p1', 'u2', jwt);
    assert.equal(mockFrom.mock.calls[0]?.[0], 'publication_ratings');
  });
});
