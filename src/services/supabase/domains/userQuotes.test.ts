/** @vitest-environment node */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';

const { mockCreateClientWithToken, mockCreateServiceRoleClient, mockGetPublicationById } =
  vi.hoisted(() => ({
    mockCreateClientWithToken: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetPublicationById: vi.fn(),
  }));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: (...args: unknown[]) => mockCreateClientWithToken(...args),
  createServiceRoleClient: (...args: unknown[]) => mockCreateServiceRoleClient(...args),
}));

vi.mock('./publications.js', () => ({
  getPublicationById: (...args: unknown[]) => mockGetPublicationById(...args),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import {
  USER_QUOTES_MAX_COUNT,
  UserQuoteError,
  createUserQuote,
  deleteUserQuote,
  listUserQuotes,
} from './userQuotes.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of ['select', 'eq', 'order', 'insert', 'delete', 'single', 'maybeSingle']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  return chain;
}

const quoteInput = {
  publicationId: 'pub-1',
  chapterId: 'ch-1',
  chapterNumber: 1,
  quoteText: '  memorable line  ',
  startParagraph: 0,
  startOffset: 0,
  endParagraph: 0,
  endOffset: 10,
};

describe('userQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UserQuoteError exposes code', () => {
    const error = new UserQuoteError('Quote limit reached', 'LIMIT_REACHED');
    assert.equal(error.code, 'LIMIT_REACHED');
    assert.equal(error.name, 'UserQuoteError');
    assert.equal(USER_QUOTES_MAX_COUNT, 500);
  });

  describe('createUserQuote', () => {
    it('rejects missing publication', async () => {
      mockGetPublicationById.mockResolvedValue(null);
      await assert.rejects(
        () => createUserQuote('u1', 'tok', quoteInput),
        (err: unknown) => err instanceof UserQuoteError && err.code === 'NOT_FOUND'
      );
    });

    it('rejects empty or too-long quote text', async () => {
      mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      await assert.rejects(
        () => createUserQuote('u1', 'tok', { ...quoteInput, quoteText: '   ' }),
        (err: unknown) => err instanceof UserQuoteError && err.code === 'VALIDATION'
      );
      await assert.rejects(
        () => createUserQuote('u1', 'tok', { ...quoteInput, quoteText: 'x'.repeat(2001) }),
        (err: unknown) => err instanceof UserQuoteError && err.code === 'VALIDATION'
      );
    });

    it('rejects missing chapter under publication project', async () => {
      mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      const serviceFrom = vi.fn(() => chainable({ data: null, error: { message: 'nope' } }));
      mockCreateServiceRoleClient.mockReturnValue({ from: serviceFrom });
      await assert.rejects(
        () => createUserQuote('u1', 'tok', quoteInput),
        (err: unknown) => err instanceof UserQuoteError && err.code === 'NOT_FOUND'
      );
    });

    it('rejects when quote limit reached', async () => {
      mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: { id: 'ch-1' }, error: null })),
      });
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: null, count: USER_QUOTES_MAX_COUNT })),
      });
      await assert.rejects(
        () => createUserQuote('u1', 'tok', quoteInput),
        (err: unknown) => err instanceof UserQuoteError && err.code === 'LIMIT_REACHED'
      );
    });

    it('creates quote and returns id', async () => {
      mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: { id: 'ch-1' }, error: null })),
      });
      const userFrom = vi.fn();
      userFrom
        .mockReturnValueOnce(chainable({ data: null, error: null, count: 1 }))
        .mockReturnValueOnce(chainable({ data: { id: 'q1' }, error: null }));
      mockCreateClientWithToken.mockReturnValue({ from: userFrom });

      const result = await createUserQuote('u1', 'tok', quoteInput);
      assert.deepEqual(result, { id: 'q1' });
    });

    it('throws when count or insert fails', async () => {
      mockGetPublicationById.mockResolvedValue({ id: 'pub-1', projectId: 'proj-1' });
      mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn(() => chainable({ data: { id: 'ch-1' }, error: null })),
      });
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'count fail' } })),
      });
      await assert.rejects(() => createUserQuote('u1', 'tok', quoteInput), /count user quotes/);

      mockCreateClientWithToken.mockReturnValue({
        from: vi
          .fn()
          .mockReturnValueOnce(chainable({ data: null, error: null, count: 0 }))
          .mockReturnValueOnce(chainable({ data: null, error: { message: 'insert fail' } })),
      });
      await assert.rejects(() => createUserQuote('u1', 'tok', quoteInput), /create quote/);
    });
  });

  describe('listUserQuotes', () => {
    it('maps published quotes and filters unpublished', async () => {
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() =>
          chainable({
            data: [
              {
                id: 'q1',
                publication_id: 'pub-1',
                chapter_id: 'ch-1',
                chapter_number: 2,
                quote_text: 'line',
                start_paragraph: 0,
                start_offset: 0,
                end_paragraph: 0,
                end_offset: 4,
                created_at: '2026-01-01T00:00:00Z',
                publications: {
                  title: 'Novel',
                  slug: 'novel',
                  cover_image_url: null,
                  status: 'published',
                },
              },
              {
                id: 'q2',
                publication_id: 'pub-2',
                chapter_id: 'ch-2',
                chapter_number: 1,
                quote_text: 'hidden',
                start_paragraph: 0,
                start_offset: 0,
                end_paragraph: 0,
                end_offset: 1,
                created_at: '2026-01-02T00:00:00Z',
                publications: {
                  title: 'Draft',
                  slug: null,
                  cover_image_url: null,
                  status: 'draft',
                },
              },
            ],
            error: null,
          })
        ),
      });

      const items = await listUserQuotes('u1', 'tok');
      assert.equal(items.length, 1);
      assert.equal(items[0]!.id, 'q1');
      assert.equal(items[0]!.publicationTitle, 'Novel');
      assert.equal(items[0]!.chapterNumber, 2);
    });

    it('returns empty array when data is null and throws on error', async () => {
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: null })),
      });
      assert.deepEqual(await listUserQuotes('u1', 'tok'), []);

      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'list fail' } })),
      });
      await assert.rejects(() => listUserQuotes('u1', 'tok'), /list user quotes/);
    });
  });

  describe('deleteUserQuote', () => {
    it('returns true when row deleted and false when missing', async () => {
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: { id: 'q1' }, error: null })),
      });
      assert.equal(await deleteUserQuote('u1', 'tok', 'q1'), true);

      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: null })),
      });
      assert.equal(await deleteUserQuote('u1', 'tok', 'missing'), false);
    });

    it('throws on delete error', async () => {
      mockCreateClientWithToken.mockReturnValue({
        from: vi.fn(() => chainable({ data: null, error: { message: 'del fail' } })),
      });
      await assert.rejects(() => deleteUserQuote('u1', 'tok', 'q1'), /delete quote/);
    });
  });
});
