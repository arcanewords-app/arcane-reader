import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listTranslationRequestsBoard: vi.fn(),
  createTranslationRequestInterest: vi.fn(),
  updateTranslationRequestInterestMe: vi.fn(),
  withdrawTranslationRequestInterest: vi.fn(),
  handleServiceError: vi.fn(() => false),
}));

vi.mock('../../../services/supabaseDatabase.js', () => ({
  listTranslationRequestsBoard: (...args: unknown[]) => mocks.listTranslationRequestsBoard(...args),
  createTranslationRequestInterest: (...args: unknown[]) =>
    mocks.createTranslationRequestInterest(...args),
  updateTranslationRequestInterestMe: (...args: unknown[]) =>
    mocks.updateTranslationRequestInterestMe(...args),
  withdrawTranslationRequestInterest: (...args: unknown[]) =>
    mocks.withdrawTranslationRequestInterest(...args),
}));

vi.mock('../../../middleware/serviceHealth.js', () => ({
  handleServiceError: mocks.handleServiceError,
}));

import {
  handleListTranslationRequestBoard,
  handleCreateTranslationRequestInterest,
  handleUpdateTranslationRequestInterestMe,
  handleWithdrawTranslationRequestInterest,
} from './translationRequestBoardHandlers.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TRANSLATOR_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd42991';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    sent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send() {
      this.sent = true;
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', role: 'author' as const },
    token: 'bearer-token',
    params: { id: VALID_UUID },
    body: {},
    query: {},
    log: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  };
}

describe('translationRequestBoardHandlers', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.handleServiceError.mockReturnValue(false);
  });

  describe('handleListTranslationRequestBoard', () => {
    it('returns board list for valid query', async () => {
      mocks.listTranslationRequestsBoard.mockResolvedValue({ items: [], total: 0 });
      const res = mockRes();

      await handleListTranslationRequestBoard(
        mockReq({ query: { status: 'pending', limit: '10', offset: '0' } }) as never,
        res as never
      );

      assert.deepEqual(res.body, { items: [], total: 0 });
      expect(mocks.listTranslationRequestsBoard).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          status: 'pending',
          limit: 10,
          offset: 0,
        })
      );
    });

    it('returns 401 when user is missing', async () => {
      const res = mockRes();
      await handleListTranslationRequestBoard(mockReq({ user: undefined }) as never, res as never);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    });

    it('returns 400 for invalid query', async () => {
      const res = mockRes();
      await handleListTranslationRequestBoard(
        mockReq({ query: { status: 'invalid-status' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Validation failed');
    });

    it('returns 503 when handleServiceError handles infrastructure failure', async () => {
      mocks.handleServiceError.mockReturnValue(true);
      mocks.listTranslationRequestsBoard.mockRejectedValue(new Error('supabase down'));
      const res = mockRes();

      await handleListTranslationRequestBoard(mockReq() as never, res as never);

      expect(mocks.handleServiceError).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      mocks.listTranslationRequestsBoard.mockRejectedValue(new Error('boom'));
      const res = mockRes();

      await handleListTranslationRequestBoard(mockReq() as never, res as never);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to list translation requests' });
    });
  });

  describe('handleCreateTranslationRequestInterest', () => {
    it('returns 201 with created interest', async () => {
      mocks.createTranslationRequestInterest.mockResolvedValue({ id: 'interest-1' });
      const res = mockRes();

      await handleCreateTranslationRequestInterest(
        mockReq({ body: { translatorEntityId: TRANSLATOR_UUID } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { id: 'interest-1' });
      expect(mocks.createTranslationRequestInterest).toHaveBeenCalledWith(
        VALID_UUID,
        'user-1',
        'bearer-token',
        TRANSLATOR_UUID
      );
    });

    it('returns 401 when user is missing', async () => {
      const res = mockRes();
      await handleCreateTranslationRequestInterest(
        mockReq({ user: undefined, body: { translatorEntityId: TRANSLATOR_UUID } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 for invalid body', async () => {
      const res = mockRes();
      await handleCreateTranslationRequestInterest(
        mockReq({ body: { translatorEntityId: 'not-a-uuid' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
      assert.equal((res.body as { error: string }).error, 'Validation failed');
    });

    it('maps INTEREST_EXISTS to 409', async () => {
      const err = new Error('exists') as Error & { code: string };
      err.code = 'INTEREST_EXISTS';
      mocks.createTranslationRequestInterest.mockRejectedValue(err);
      const res = mockRes();

      await handleCreateTranslationRequestInterest(
        mockReq({ body: { translatorEntityId: TRANSLATOR_UUID } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body, { error: 'Interest already exists', code: 'INTEREST_EXISTS' });
    });

    it('maps NOT_FOUND to 404', async () => {
      const err = new Error('missing') as Error & { code: string };
      err.code = 'NOT_FOUND';
      mocks.createTranslationRequestInterest.mockRejectedValue(err);
      const res = mockRes();

      await handleCreateTranslationRequestInterest(
        mockReq({ body: { translatorEntityId: TRANSLATOR_UUID } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Translation request not found' });
    });

    it('returns 500 on unexpected error', async () => {
      mocks.createTranslationRequestInterest.mockRejectedValue(new Error('boom'));
      const res = mockRes();

      await handleCreateTranslationRequestInterest(
        mockReq({ body: { translatorEntityId: TRANSLATOR_UUID } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to create interest' });
    });
  });

  describe('handleUpdateTranslationRequestInterestMe', () => {
    it('returns updated interest json', async () => {
      mocks.updateTranslationRequestInterestMe.mockResolvedValue({
        id: 'interest-1',
        status: 'working',
      });
      const res = mockRes();

      await handleUpdateTranslationRequestInterestMe(
        mockReq({ body: { status: 'working' } }) as never,
        res as never
      );

      assert.deepEqual(res.body, { id: 'interest-1', status: 'working' });
    });

    it('returns 404 when interest not found', async () => {
      mocks.updateTranslationRequestInterestMe.mockResolvedValue(null);
      const res = mockRes();

      await handleUpdateTranslationRequestInterestMe(
        mockReq({ body: { status: 'interested' } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Interest not found' });
    });

    it('returns 401 when user is missing', async () => {
      const res = mockRes();
      await handleUpdateTranslationRequestInterestMe(
        mockReq({ user: undefined, body: { status: 'interested' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 for invalid body', async () => {
      const res = mockRes();
      await handleUpdateTranslationRequestInterestMe(
        mockReq({ body: { status: 'invalid' } }) as never,
        res as never
      );
      assert.equal(res.statusCode, 400);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.updateTranslationRequestInterestMe.mockRejectedValue(new Error('boom'));
      const res = mockRes();

      await handleUpdateTranslationRequestInterestMe(
        mockReq({ body: { status: 'interested' } }) as never,
        res as never
      );

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to update interest' });
    });
  });

  describe('handleWithdrawTranslationRequestInterest', () => {
    it('returns 204 when interest withdrawn', async () => {
      mocks.withdrawTranslationRequestInterest.mockResolvedValue(true);
      const res = mockRes();

      await handleWithdrawTranslationRequestInterest(mockReq() as never, res as never);

      assert.equal(res.statusCode, 204);
      assert.equal(res.sent, true);
    });

    it('returns 404 when interest not found', async () => {
      mocks.withdrawTranslationRequestInterest.mockResolvedValue(false);
      const res = mockRes();

      await handleWithdrawTranslationRequestInterest(mockReq() as never, res as never);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Interest not found' });
    });

    it('returns 401 when user is missing', async () => {
      const res = mockRes();
      await handleWithdrawTranslationRequestInterest(
        mockReq({ user: undefined }) as never,
        res as never
      );
      assert.equal(res.statusCode, 401);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.withdrawTranslationRequestInterest.mockRejectedValue(new Error('boom'));
      const res = mockRes();

      await handleWithdrawTranslationRequestInterest(mockReq() as never, res as never);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to withdraw interest' });
    });
  });
});
