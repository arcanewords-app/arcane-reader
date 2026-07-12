import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import {
  addGlossaryEntry,
  deleteGlossaryEntriesBulk,
  deleteGlossaryEntry,
  getGlossaryEntry,
  importGlossaryEntriesBatch,
} from './glossary.js';

function chainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'single', 'update', 'delete', 'in']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('getGlossaryEntry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null on error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const entry = await getGlossaryEntry('proj-1', 'g1', 'token');
    assert.equal(entry, null);
  });

  it('maps row to glossary entry', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          id: 'g1',
          project_id: 'proj-1',
          type: 'character',
          original: 'Alice',
          translated: 'Алиса',
          gender: 'female',
          mentioned_in_chapters: [],
          image_urls: [],
        },
        error: null,
      })
    );
    const entry = await getGlossaryEntry('proj-1', 'g1', 'token');
    assert.equal(entry?.original, 'Alice');
    assert.equal(entry?.translated, 'Алиса');
  });
});

describe('importGlossaryEntriesBatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const result = await importGlossaryEntriesBatch('proj-1', [], 'token');
    assert.deepEqual(result, []);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('inserts entries and returns mapped glossary entries', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return chainable({ data: { id: 'proj-1' }, error: null });
      }
      if (table === 'glossary_entries') {
        return chainable({
          data: [
            {
              id: 'g1',
              project_id: 'proj-1',
              type: 'character',
              original: 'Bob',
              translated: 'Боб',
              gender: 'male',
              mentioned_in_chapters: [],
              image_urls: [],
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const entries = [
      {
        type: 'character' as const,
        original: 'Bob',
        translated: 'Боб',
        gender: 'male' as const,
        mentionedInChapters: [],
        imageUrls: [],
      },
    ];

    const result = await importGlossaryEntriesBatch('proj-1', entries, 'token');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.original, 'Bob');
    assert.equal(result[0]?.translated, 'Боб');
    assert.ok(mockFrom.mock.calls.some(([table]) => table === 'glossary_entries'));
  });

  it('returns empty array when project not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const result = await importGlossaryEntriesBatch(
      'proj-missing',
      [
        {
          type: 'character',
          original: 'X',
          translated: 'X',
          mentionedInChapters: [],
          imageUrls: [],
        },
      ],
      'token'
    );
    assert.deepEqual(result, []);
  });

  it('throws when batch insert fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return chainable({ data: { id: 'proj-1' }, error: null });
      }
      if (table === 'glossary_entries') {
        return chainable({
          data: null,
          error: { message: 'insert fail' },
        });
      }
      return chainable({ data: null, error: null });
    });

    await assert.rejects(
      () =>
        importGlossaryEntriesBatch(
          'proj-1',
          [
            {
              type: 'character',
              original: 'Bob',
              translated: 'Боб',
              mentionedInChapters: [],
              imageUrls: [],
            },
          ],
          'token'
        ),
      /Failed to import glossary batch/
    );
  });
});

const glossaryEntryInput = {
  type: 'character' as const,
  original: 'Carol',
  translated: 'Кэрол',
  gender: 'female' as const,
  mentionedInChapters: [],
  imageUrls: [],
};

const glossaryRow = {
  id: 'g2',
  project_id: 'proj-1',
  type: 'character',
  original: 'Carol',
  translated: 'Кэрол',
  gender: 'female',
  mentioned_in_chapters: [],
  image_urls: [],
};

describe('addGlossaryEntry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when project not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'not found' },
      })
    );
    const entry = await addGlossaryEntry('proj-missing', glossaryEntryInput, 'token');
    assert.equal(entry, undefined);
  });

  it('inserts entry and returns mapped glossary entry', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return chainable({ data: { id: 'proj-1' }, error: null });
      }
      if (table === 'glossary_entries') {
        return chainable({ data: glossaryRow, error: null });
      }
      return chainable({ data: null, error: null });
    });

    const entry = await addGlossaryEntry('proj-1', glossaryEntryInput, 'token');
    assert.equal(entry?.original, 'Carol');
    assert.equal(entry?.translated, 'Кэрол');
  });
});

describe('deleteGlossaryEntry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true after deleting entry', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: null,
      })
    );
    const ok = await deleteGlossaryEntry('proj-1', 'g1', 'token');
    assert.equal(ok, true);
  });
});

describe('deleteGlossaryEntriesBulk', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 for empty entry ids', async () => {
    const count = await deleteGlossaryEntriesBulk('proj-1', [], 'token');
    assert.equal(count, 0);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('returns deleted count from bulk delete', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ id: 'g1' }, { id: 'g2' }],
        error: null,
      })
    );
    const count = await deleteGlossaryEntriesBulk('proj-1', ['g1', 'g2'], 'token');
    assert.equal(count, 2);
  });
});
