/** Shared sample entities for integration tests. */

export const TEST_USER_ID = 'test-user-id';

export function samplePublication(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pub-1',
    slug: 'sample-pub',
    title: 'Sample Publication',
    status: 'published',
    projectId: 'proj-1',
    ...overrides,
  };
}

export function sampleNewsPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'news-1',
    slug: 'hello-wave',
    title: 'Hello Wave',
    summary: 'Summary',
    body: 'Body',
    category: 'update',
    status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function sampleProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    userId: TEST_USER_ID,
    title: 'Test Project',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    settings: {},
    glossary: [],
    chapters: [],
    ...overrides,
  };
}

export function sampleChapter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Chapter 1',
    status: 'pending',
    originalText: 'Hello world. This is sample chapter text for translation wiring.',
    translatedText: '',
    paragraphs: [],
    ...overrides,
  };
}
