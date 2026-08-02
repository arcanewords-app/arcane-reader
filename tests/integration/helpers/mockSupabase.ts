/**
 * Shared Supabase domain stubs for mock-integration tests.
 * Use with vi.mock on domain modules and/or supabaseDatabase facade.
 */

import { vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

const mocks = {
  listPublicationsPublic: vi.fn(),
  getPublicationBySlugOrId: vi.fn(),
  listPublishedNewsPosts: vi.fn(),
  getPublishedNewsPostByIdOrSlug: vi.fn(),
  getAllProjectsLightweight: vi.fn(),
  resetStuckChapters: vi.fn(),
  getProject: vi.fn(),
  verifyChapterAccess: vi.fn(),
  getChapter: vi.fn(),
  updateChapter: vi.fn(),
  getProjectFullForRecovery: vi.fn(),
  resetStuckChaptersForRecovery: vi.fn(),
  addGlossaryEntry: vi.fn(),
  updateGlossaryEntry: vi.fn(),
  getGlossaryEntry: vi.fn(),
  updateReadProgress: vi.fn(),
  upsertPublicationRating: vi.fn(),
} as const satisfies Record<string, MockFn>;

export type SupabaseMockName = keyof typeof mocks;

export function getSupabaseMock<K extends SupabaseMockName>(name: K): (typeof mocks)[K] {
  return mocks[name];
}

export function resetMocks(): void {
  for (const fn of Object.values(mocks)) {
    fn.mockReset();
  }

  mocks.listPublicationsPublic.mockResolvedValue([]);
  mocks.getPublicationBySlugOrId.mockResolvedValue(null);
  mocks.listPublishedNewsPosts.mockResolvedValue([]);
  mocks.getPublishedNewsPostByIdOrSlug.mockResolvedValue(null);
  mocks.getAllProjectsLightweight.mockResolvedValue([]);
  mocks.resetStuckChapters.mockResolvedValue(0);
  mocks.getProject.mockResolvedValue(null);
  mocks.verifyChapterAccess.mockResolvedValue(false);
  mocks.getChapter.mockResolvedValue(null);
  mocks.updateChapter.mockResolvedValue(true);
  mocks.getProjectFullForRecovery.mockResolvedValue(null);
  mocks.resetStuckChaptersForRecovery.mockResolvedValue(undefined);
  mocks.addGlossaryEntry.mockResolvedValue(undefined);
  mocks.updateGlossaryEntry.mockResolvedValue(undefined);
  mocks.getGlossaryEntry.mockResolvedValue(null);
  mocks.updateReadProgress.mockResolvedValue({ lastReadChapterNumber: 0 });
  mocks.upsertPublicationRating.mockResolvedValue({ score: 1, average: 1, count: 1 });
}

/** Defaults applied once at load; call resetMocks() in beforeEach. */
resetMocks();

/**
 * Overlay for `vi.mock('.../supabaseDatabase.js', async (importOriginal) => ...)`.
 */
export function createSupabaseDatabaseOverlay(): Record<string, MockFn> {
  return { ...mocks };
}

/**
 * Overlay for publications domain (handlers via supabaseDatabase re-exports).
 */
export function createPublicationsDomainOverlay(): Record<string, MockFn> {
  return {
    listPublicationsPublic: mocks.listPublicationsPublic,
    getPublicationBySlugOrId: mocks.getPublicationBySlugOrId,
  };
}

export function createNewsDomainOverlay(): Record<string, MockFn> {
  return {
    listPublishedNewsPosts: mocks.listPublishedNewsPosts,
    getPublishedNewsPostByIdOrSlug: mocks.getPublishedNewsPostByIdOrSlug,
  };
}

export function createProjectsDomainOverlay(): Record<string, MockFn> {
  return {
    getAllProjectsLightweight: mocks.getAllProjectsLightweight,
    resetStuckChapters: mocks.resetStuckChapters,
    getProject: mocks.getProject,
    verifyChapterAccess: mocks.verifyChapterAccess,
    getProjectFullForRecovery: mocks.getProjectFullForRecovery,
    resetStuckChaptersForRecovery: mocks.resetStuckChaptersForRecovery,
  };
}

export function createChaptersDomainOverlay(): Record<string, MockFn> {
  return {
    getChapter: mocks.getChapter,
    updateChapter: mocks.updateChapter,
  };
}

export function createGlossaryDomainOverlay(): Record<string, MockFn> {
  return {
    addGlossaryEntry: mocks.addGlossaryEntry,
    updateGlossaryEntry: mocks.updateGlossaryEntry,
    getGlossaryEntry: mocks.getGlossaryEntry,
  };
}

export function createReaderProgressDomainOverlay(): Record<string, MockFn> {
  return {
    updateReadProgress: mocks.updateReadProgress,
  };
}

export function createPublicationRatingsDomainOverlay(): Record<string, MockFn> {
  return {
    upsertPublicationRating: mocks.upsertPublicationRating,
  };
}
