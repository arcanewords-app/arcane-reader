import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  toBoardTranslationRequest,
  transformCatalogTranslationRequestFromDB,
  assertRequestOpenForBoard,
} from './catalog.js';

describe('catalog transforms', () => {
  it('transformCatalogTranslationRequestFromDB maps row', () => {
    const req = transformCatalogTranslationRequestFromDB({
      id: 'r1',
      user_id: 'u1',
      title: 'Book',
      author_name: 'Author',
      source_language: 'en',
      target_language: 'ru',
      comment: null,
      source_url: null,
      status: 'pending',
      admin_notes: null,
      linked_publication_id: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    assert.equal(req.title, 'Book');
    assert.equal(req.userId, 'u1');
  });

  it('toBoardTranslationRequest filters withdrawn interests', () => {
    const board = toBoardTranslationRequest(
      {
        id: 'r1',
        user_id: 'u1',
        title: 'T',
        author_name: null,
        source_language: 'en',
        target_language: 'ru',
        comment: null,
        source_url: null,
        status: 'pending',
        admin_notes: null,
        linked_publication_id: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      [
        {
          id: 'i1',
          requestId: 'r1',
          userId: 'u2',
          translatorEntityId: 'te1',
          translatorName: 'Translator',
          projectId: null,
          status: 'withdrawn',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'i2',
          requestId: 'r1',
          userId: 'u3',
          translatorEntityId: 'te2',
          translatorName: 'Active',
          projectId: null,
          status: 'interested',
          createdAt: '',
          updatedAt: '',
        },
      ],
      'u3'
    );
    assert.equal(board.interestCount, 1);
    assert.equal(board.myInterest?.id, 'i2');
  });

  it('assertRequestOpenForBoard throws REQUEST_CLOSED for rejected', () => {
    assert.throws(
      () =>
        assertRequestOpenForBoard({
          id: 'r1',
          userId: 'u1',
          title: 'T',
          authorName: null,
          sourceLanguage: null,
          targetLanguage: 'ru',
          comment: null,
          sourceUrl: null,
          status: 'rejected',
          adminNotes: null,
          linkedPublicationId: null,
          createdAt: '',
          updatedAt: '',
        }),
      (err: Error & { code?: string }) => err.code === 'REQUEST_CLOSED'
    );
  });
});
