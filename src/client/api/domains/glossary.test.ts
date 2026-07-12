import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJson } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

import { glossaryApi } from './glossary.js';

describe('glossaryApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getGlossary calls fetchJson with project glossary endpoint', async () => {
    const entries = [{ id: 'g1', original: 'Alice', translated: 'Алиса' }];
    mockFetchJson.mockResolvedValue(entries);

    const result = await glossaryApi.getGlossary('proj-1');
    assert.deepEqual(result, entries);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/projects/proj-1/glossary');
  });

  it('addGlossary calls fetchJson with POST body', async () => {
    const entry = {
      type: 'character' as const,
      original: 'Bob',
      translated: 'Боб',
      gender: 'male' as const,
      mentionedInChapters: [],
      imageUrls: [],
    };
    const created = { id: 'g2', ...entry };
    mockFetchJson.mockResolvedValue(created);

    const result = await glossaryApi.addGlossary('proj-1', entry);
    assert.deepEqual(result, created);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/projects/proj-1/glossary');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'POST');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.body, JSON.stringify(entry));
  });

  it('deleteGlossaryEntry calls fetchJson with DELETE', async () => {
    mockFetchJson.mockResolvedValue({ success: true });

    const result = await glossaryApi.deleteGlossaryEntry('proj-1', 'g1');
    assert.deepEqual(result, { success: true });
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/projects/proj-1/glossary/g1');
    assert.equal(mockFetchJson.mock.calls[0]?.[1]?.method, 'DELETE');
  });
});
