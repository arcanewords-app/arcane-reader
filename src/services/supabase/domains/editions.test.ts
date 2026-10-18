import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, createClientWithToken, createServiceRoleClient } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  return {
    mockFrom,
    createClientWithToken: vi.fn(() => ({ from: mockFrom })),
    createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
  };
});

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken,
  createServiceRoleClient,
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import { validateToken } from '../../../utils/tokenValidation.js';
import {
  createProjectEdition,
  editionChapterTranslatedText,
  listChapterEditionStates,
  listGlossaryTranslationForms,
  listProjectEditionLanguages,
  listPublicationEditions,
  loadChapterEditionRow,
  loadParagraphTranslations,
  upsertChapterEdition,
  upsertGlossaryTranslation,
  upsertGlossaryTranslations,
  upsertParagraphTranslations,
} from './editions.js';

function queryResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of [
    'select',
    'eq',
    'limit',
    'maybeSingle',
    'single',
    'insert',
    'in',
    'upsert',
    'order',
  ]) {
    chain[method] = vi.fn(self);
  }
  chain.then = (resolve: (value: typeof result) => void, reject?: (reason: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const missingRelation = { code: 'PGRST205', message: 'chapter_editions does not exist' };

describe('edition domain queries', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists edition languages and treats a missing table as none', async () => {
    mockFrom.mockReturnValue(
      queryResult({ data: [{ target_language: 'be' }, { target_language: 'pl' }], error: null })
    );
    assert.deepEqual(await listProjectEditionLanguages('p1', 'token'), ['be', 'pl']);

    mockFrom.mockReturnValue(queryResult({ data: null, error: null }));
    assert.deepEqual(await listProjectEditionLanguages('p1', 'token'), []);

    mockFrom.mockReturnValue(queryResult({ data: null, error: missingRelation }));
    assert.deepEqual(await listProjectEditionLanguages('p1', 'token'), []);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'db down' } }));
    await assert.rejects(
      () => listProjectEditionLanguages('p1', 'token'),
      /Failed to list editions: db down/
    );
  });

  it('uses the service-role client when asked', async () => {
    mockFrom.mockReturnValue(queryResult({ data: [], error: null }));
    await listProjectEditionLanguages('p1', 'token', { useServiceRole: true });
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(validateToken).not.toHaveBeenCalled();
  });

  it('creates an edition or returns the existing row on a unique conflict', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return queryResult({
          data: { id: 'p1', source_language: null, target_language: null },
          error: null,
        });
      }
      return queryResult({ data: null, error: null });
    });
    assert.deepEqual(await createProjectEdition('p1', 'be', 'token'), { targetLanguage: 'be' });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return queryResult({
          data: { id: 'p1', source_language: 'en', target_language: 'ru' },
          error: null,
        });
      }
      return queryResult({ data: null, error: { code: '23505', message: 'duplicate' } });
    });
    assert.deepEqual(await createProjectEdition('p1', 'be', 'token'), { targetLanguage: 'be' });
  });

  it('rejects a missing project, the primary language, an unsupported pair, and other insert errors', async () => {
    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'missing' } }));
    await assert.rejects(() => createProjectEdition('p1', 'be', 'token'), /Project not found/);

    mockFrom.mockReturnValue(
      queryResult({
        data: { id: 'p1', source_language: 'en', target_language: 'ru' },
        error: null,
      })
    );
    await assert.rejects(
      () => createProjectEdition('p1', 'ru', 'token'),
      /matches the primary target/
    );

    await assert.rejects(
      () => createProjectEdition('p1', 'ja', 'token'),
      /Unsupported translation language pair/
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return queryResult({
          data: { id: 'p1', source_language: 'en', target_language: 'ru' },
          error: null,
        });
      }
      return queryResult({ data: null, error: { code: '42501', message: 'denied' } });
    });
    await assert.rejects(
      () => createProjectEdition('p1', 'be', 'token'),
      /Failed to create edition: denied/
    );
  });

  it('maps chapter edition rows and skips a missing table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return queryResult({ data: [], error: null });
      return queryResult({ data: null, error: { message: 'unused' } });
    });
    assert.equal((await listChapterEditionStates('p1', 'be', 'token')).size, 0);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'chapters down' } }));
    await assert.rejects(
      () => listChapterEditionStates('p1', 'be', 'token'),
      /Failed to list chapters/
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return queryResult({ data: [{ id: 'ch-1' }], error: null });
      return queryResult({ data: null, error: missingRelation });
    });
    assert.equal((await listChapterEditionStates('p1', 'be', 'token')).size, 0);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return queryResult({ data: [{ id: 'ch-1' }, { id: 'ch-2' }], error: null });
      }
      return queryResult({
        data: [
          { chapter_id: 'ch-1', status: 'completed', translated_title: '  One  ' },
          { chapter_id: 'ch-2', status: 'pending', translated_title: '   ' },
        ],
        error: null,
      });
    });
    const states = await listChapterEditionStates('p1', 'be', 'token');
    assert.deepEqual(states.get('ch-1'), {
      status: 'completed',
      translatedTitle: 'One',
      hasTranslation: true,
    });
    assert.equal(states.get('ch-2')?.hasTranslation, false);
    assert.equal(states.get('ch-2')?.translatedTitle, undefined);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return queryResult({ data: [{ id: 'ch-1' }], error: null });
      return queryResult({ data: null, error: { message: 'editions down' } });
    });
    await assert.rejects(
      () => listChapterEditionStates('p1', 'be', 'token'),
      /Failed to list chapter editions/
    );
  });

  it('saves a chapter edition and paragraph translations', async () => {
    const client = { from: mockFrom } as never;
    mockFrom.mockReturnValue(queryResult({ data: null, error: null }));
    await upsertChapterEdition(client, 'ch-1', 'be', {
      status: 'draft',
      translatedTitle: 'Title',
      translationMeta: { model: 'test' },
    });
    await upsertChapterEdition(client, 'ch-1', 'be', {});
    await upsertParagraphTranslations(client, 'be', []);
    await upsertParagraphTranslations(client, 'be', [
      {
        id: 'p1',
        index: 0,
        originalText: 'src',
        translatedText: 'tgt',
        status: 'translated',
        editedAt: '2026-01-01',
        editedBy: 'user',
      },
    ]);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'write failed' } }));
    await assert.rejects(
      () => upsertChapterEdition(client, 'ch-1', 'be', {}),
      /Failed to save chapter edition/
    );
    await assert.rejects(
      () =>
        upsertParagraphTranslations(client, 'be', [
          { id: 'p1', index: 0, originalText: 'src', status: 'pending' },
        ]),
      /Failed to save paragraph translations/
    );
  });

  it('loads paragraph translations and a chapter edition row', async () => {
    const client = { from: mockFrom } as never;
    assert.equal((await loadParagraphTranslations(client, [], 'be')).size, 0);

    mockFrom.mockReturnValue(queryResult({ data: null, error: missingRelation }));
    assert.equal((await loadParagraphTranslations(client, ['p1'], 'be')).size, 0);
    assert.equal(await loadChapterEditionRow(client, 'ch-1', 'be'), null);

    mockFrom.mockReturnValue(
      queryResult({
        data: [{ paragraph_id: 'p1', translated_text: null, status: null }],
        error: null,
      })
    );
    const loaded = await loadParagraphTranslations(client, ['p1'], 'be');
    assert.deepEqual(loaded.get('p1'), { translatedText: undefined, status: 'pending' });

    mockFrom.mockReturnValue(queryResult({ data: null, error: null }));
    assert.equal(await loadChapterEditionRow(client, 'ch-1', 'be'), null);

    mockFrom.mockReturnValue(
      queryResult({ data: { status: 'partial', translated_title: '  Be  ' }, error: null })
    );
    assert.deepEqual(await loadChapterEditionRow(client, 'ch-1', 'be'), {
      status: 'partial',
      translatedTitle: 'Be',
    });

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'read failed' } }));
    await assert.rejects(
      () => loadParagraphTranslations(client, ['p1'], 'be'),
      /Failed to load paragraph translations/
    );
    await assert.rejects(
      () => loadChapterEditionRow(client, 'ch-1', 'be'),
      /Failed to load chapter edition/
    );
  });

  it('lists publication editions and ignores a missing or failed table', async () => {
    assert.equal((await listPublicationEditions([])).size, 0);
    expect(createServiceRoleClient).not.toHaveBeenCalled();

    mockFrom.mockReturnValue(queryResult({ data: null, error: missingRelation }));
    assert.equal((await listPublicationEditions(['pub-1'])).size, 0);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'timeout' } }));
    assert.equal((await listPublicationEditions(['pub-1'])).size, 0);

    mockFrom.mockReturnValue(
      queryResult({
        data: [
          { publication_id: 'pub-1', target_language: 'be', translation_status: null },
          { publication_id: 'pub-1', target_language: 'en', translation_status: 'experimental' },
        ],
        error: null,
      })
    );
    const editions = await listPublicationEditions(['pub-1']);
    assert.deepEqual(editions.get('pub-1'), [
      { language: 'be', translationStatus: null },
      { language: 'en', translationStatus: 'experimental' },
    ]);
  });

  it('joins translated paragraph text for an edition chapter', async () => {
    mockFrom.mockReturnValue(queryResult({ data: [], error: { message: 'nope' } }));
    assert.equal(await editionChapterTranslatedText('ch-1', 'be'), '');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'paragraphs') {
        return queryResult({
          data: [
            { id: 'p1', index: 0 },
            { id: 'p2', index: 1 },
          ],
          error: null,
        });
      }
      return queryResult({
        data: [
          { paragraph_id: 'p1', translated_text: '  Hello  ', status: 'completed' },
          { paragraph_id: 'p2', translated_text: '   ', status: 'pending' },
        ],
        error: null,
      });
    });
    assert.equal(await editionChapterTranslatedText('ch-1', 'be'), 'Hello');
  });

  it('loads and saves glossary translation forms', async () => {
    mockFrom.mockReturnValue(queryResult({ data: null, error: missingRelation }));
    assert.equal((await listGlossaryTranslationForms('p1', 'be', 'token')).size, 0);

    mockFrom.mockReturnValue(
      queryResult({
        data: [
          { glossary_entry_id: 'g1', translated: 'меч', declensions: { nominative: 'меч' } },
          { glossary_entry_id: 'g2', translated: null, declensions: null },
        ],
        error: null,
      })
    );
    const forms = await listGlossaryTranslationForms('p1', 'be', 'token', { useServiceRole: true });
    assert.equal(forms.get('g1')?.translated, 'меч');
    assert.deepEqual(forms.get('g1')?.declensions, { nominative: 'меч' });
    assert.equal(forms.get('g2')?.translated, '');
    assert.equal(forms.get('g2')?.declensions, undefined);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'glossary down' } }));
    await assert.rejects(
      () => listGlossaryTranslationForms('p1', 'be', 'token'),
      /Failed to load glossary translations/
    );

    const client = { from: mockFrom } as never;
    mockFrom.mockReturnValue(queryResult({ data: null, error: null }));
    await upsertGlossaryTranslation(client, 'g1', 'be', { translated: 'меч', declensions: null });
    await upsertGlossaryTranslations('token', 'be', []);
    await upsertGlossaryTranslations('token', 'be', [
      { entryId: 'g1', translated: 'меч' },
      { entryId: 'g2', translated: '', declensions: null },
    ]);

    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'save failed' } }));
    await assert.rejects(
      () => upsertGlossaryTranslation(client, 'g1', 'be', { translated: 'меч' }),
      /Failed to save glossary translation:/
    );
    await assert.rejects(
      () => upsertGlossaryTranslations('token', 'be', [{ entryId: 'g1', translated: 'меч' }]),
      /Failed to save glossary translations/
    );
  });
});
