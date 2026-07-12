import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { prepareProjectForExport, textToHtml } from './common.js';
import type { Chapter, Project } from '../../storage/database.js';

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 2,
    title: 'Original title',
    translatedTitle: 'Translated title',
    originalText: 'Hello world.',
    translatedText: 'Привет мир.',
    paragraphs: [],
    status: 'completed',
    ...overrides,
  };
}

function makeProject(chapters: Chapter[]): Project {
  return {
    id: 'proj-1',
    name: 'Test Novel',
    type: 'book',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapters,
    glossary: [],
    settings: {} as Project['settings'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('textToHtml', () => {
  it('returns empty paragraph for blank text', () => {
    assert.equal(textToHtml(''), '<p></p>');
    assert.equal(textToHtml('   '), '<p></p>');
  });

  it('wraps paragraphs and escapes HTML entities', () => {
    const html = textToHtml('First line\n\nSecond <tag> & "quote"');
    assert.match(html, /<p>First line<\/p>/);
    assert.match(html, /<p>Second &lt;tag&gt; &amp; &quot;quote&quot;<\/p>/);
  });

  it('prepends h1 when includeTitle is true', () => {
    const html = textToHtml('Body text', true, 'Chapter 1');
    assert.match(html, /<h1>Chapter 1<\/h1>/);
    assert.match(html, /<p>Body text<\/p>/);
  });

  it('escapes title in h1', () => {
    const html = textToHtml('Body', true, 'Title <unsafe>');
    assert.match(html, /<h1>Title &lt;unsafe&gt;<\/h1>/);
  });
});

describe('prepareProjectForExport', () => {
  it('includes only completed or draft chapters with translation', () => {
    const project = makeProject([
      makeChapter({ id: 'ch-done', number: 1, status: 'completed', translatedText: 'Done' }),
      makeChapter({ id: 'ch-draft', number: 2, status: 'draft', translatedText: 'Draft' }),
      makeChapter({ id: 'ch-pending', number: 3, status: 'pending', translatedText: 'Skip' }),
      makeChapter({
        id: 'ch-para',
        number: 4,
        status: 'completed',
        translatedText: '',
        paragraphs: [
          { id: 'p1', index: 0, originalText: 'A', translatedText: 'B', status: 'translated' },
        ],
      }),
    ]);

    const exported = prepareProjectForExport(project, 'Author Name');
    assert.equal(exported.chapters.length, 3);
    assert.deepEqual(
      exported.chapters.map((ch) => ch.number),
      [1, 2, 4]
    );
    assert.equal(exported.author, 'Author Name');
    assert.equal(exported.language, 'ru');
    assert.equal(exported.metadata?.totalChapters, 3);
  });

  it('uses default author and paragraph text when translatedText is empty', () => {
    const project = makeProject([
      makeChapter({
        id: 'ch-1',
        number: 1,
        status: 'completed',
        translatedText: '',
        paragraphs: [
          { id: 'p1', index: 0, originalText: 'One', translatedText: 'Один', status: 'translated' },
          { id: 'p2', index: 1, originalText: 'Two', translatedText: 'Два', status: 'translated' },
        ],
      }),
    ]);

    const exported = prepareProjectForExport(project);
    assert.equal(exported.author, 'Переведено Arcane');
    assert.equal(exported.chapters[0]?.textContent, 'Один\n\nДва');
    assert.match(exported.chapters[0]?.htmlContent ?? '', /<p>Один<\/p>/);
    assert.match(exported.chapters[0]?.htmlContent ?? '', /<h1>Translated title<\/h1>/);
  });

  it('picks latest translation metadata from chapters', () => {
    const project = makeProject([
      makeChapter({
        number: 1,
        status: 'completed',
        translatedText: 'A',
        translationMeta: {
          translatedAt: '2026-01-01T00:00:00Z',
          model: 'old-model',
          tokensUsed: 0,
          duration: 0,
        },
      }),
      makeChapter({
        number: 2,
        status: 'completed',
        translatedText: 'B',
        translationMeta: {
          translatedAt: '2026-02-01T00:00:00Z',
          model: 'new-model',
          tokensUsed: 0,
          duration: 0,
        },
      }),
    ]);

    const exported = prepareProjectForExport(project);
    assert.equal(exported.metadata?.model, 'new-model');
    assert.equal(exported.metadata?.translatedAt, '2026-02-01T00:00:00Z');
  });
});
