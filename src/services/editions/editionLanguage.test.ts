import { describe, expect, it, vi } from 'vitest';
import {
  blankGlossaryTranslations,
  overlayChapterListItem,
  resolveRequestedEdition,
} from './editionLanguage.js';
import { loadGlossaryForEdition } from './loadGlossaryForEdition.js';

vi.mock('../supabase/loaders.js', () => ({
  loadGlossaryForProject: vi.fn(async () => [
    {
      id: 'g1',
      projectId: 'p1',
      original: 'sword',
      translated: 'меч',
      declensions: { nom: 'меч' },
      mentions: 2,
    },
  ]),
  loadGlossaryForProjectPublic: vi.fn(async () => []),
}));

describe('edition language helpers', () => {
  it('treats a missing or primary language as the current columns', () => {
    expect(resolveRequestedEdition(undefined, 'ru')).toBeUndefined();
    expect(resolveRequestedEdition('ru', 'ru')).toBeUndefined();
    expect(resolveRequestedEdition('be', 'ru')).toBe('be');
  });

  it('does not mark a second language completed because the primary chapter is', () => {
    const overlaid = overlayChapterListItem(
      {
        id: 'ch-1',
        projectId: 'p1',
        number: 1,
        title: 'One',
        status: 'completed',
        hasTranslation: true,
        translationMeta: {
          tokensUsed: 0,
          duration: 0,
          model: 'test',
          translatedAt: '2026-01-01',
          lastAnalysisAt: '2026-01-01',
        },
      },
      undefined
    );
    expect(overlaid.status).toBe('pending');
    expect(overlaid.hasTranslation).toBe(false);
    expect(overlaid.translationMeta?.lastAnalysisAt).toBe('2026-01-01');
  });

  it('clears translated forms for a second language and leaves the primary list', async () => {
    const primary = await loadGlossaryForEdition('p1', 'ru', 'tok', 'ru');
    expect(primary[0]?.translated).toBe('меч');
    expect(primary[0]?.declensions).toEqual({ nom: 'меч' });

    const edition = await loadGlossaryForEdition('p1', 'be', 'tok', 'ru');
    expect(edition[0]?.original).toBe('sword');
    expect(edition[0]?.translated).toBe('');
    expect(edition[0]?.declensions).toBeUndefined();
    expect(blankGlossaryTranslations(primary)[0]?.translated).toBe('');
    expect(primary[0]?.translated).toBe('меч');
  });
});
