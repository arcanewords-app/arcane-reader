import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatScraperChapterSaveTitle, parseScraperChapterJson } from './scraperChapter.js';

describe('parseScraperChapterJson', () => {
  it('parses scraper-console chapter shape', () => {
    const chapter = parseScraperChapterJson({
      number: 1036,
      title: '第一百四十八章 众人之力',
      content: '第1035章众人之力\n\n“正义”女士没有放弃。',
      sourceUrl: 'https://example.com/book/144332/1036.html',
      sourceAdapterId: 'bqg',
      scrapedAt: '2026-06-15T23:03:00.603Z',
    });
    assert.equal(chapter.number, 1036);
    assert.match(chapter.content, /“正义”女士没有放弃/);
  });

  it('rejects raw BQG API JSON with txt field', () => {
    assert.throws(
      () =>
        parseScraperChapterJson({
          id: 144332,
          chaptername: 'Chapter',
          txt: 'body',
        }),
      /scraper-console chapter file/
    );
  });

  it('rejects missing content', () => {
    assert.throws(
      () => parseScraperChapterJson({ number: 1, title: 'T', content: '' }),
      /Invalid scraper chapter file/
    );
  });
});

describe('formatScraperChapterSaveTitle', () => {
  it('combines number and title', () => {
    assert.equal(
      formatScraperChapterSaveTitle({ number: 1036, title: ' 第一百四十八章 ' }),
      '1036 — 第一百四十八章'
    );
  });
});
