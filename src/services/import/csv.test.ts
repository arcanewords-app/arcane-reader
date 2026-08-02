import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses standard title,text rows', async () => {
    const csv = 'title,text\nChapter 1,Hello world\nChapter 2,Second chapter\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.format, 'csv');
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0]?.title, 'Chapter 1');
    assert.equal(result.chapters[0]?.content, 'Hello world');
    assert.equal(result.chapters[1]?.number, 2);
  });

  it('strips BOM and skips empty text rows with warning', async () => {
    const csv = '\uFEFFtitle,text\nKeep,Body\nSkip,\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0]?.title, 'Keep');
    assert.ok(result.warnings?.some((w) => /Пропущено/.test(w)));
  });

  it('parses content-only column with auto titles', async () => {
    const csv = 'content\nFirst body\nSecond body\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0]?.title, 'Глава 1');
    assert.equal(result.chapters[1]?.content, 'Second body');
    assert.ok(result.warnings?.some((w) => /без колонки title/.test(w)));
  });

  it('parses single arbitrary column', async () => {
    const csv = 'paragraph\nOnly column text\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0]?.content, 'Only column text');
    assert.ok(result.warnings?.some((w) => /одна колонка/.test(w)));
  });

  it('parses no-header rows using last column as content', async () => {
    const csv = 'Intro,Once upon a time\nClimax,The end\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0]?.title, 'Intro');
    assert.equal(result.chapters[0]?.content, 'Once upon a time');
    assert.ok(result.warnings?.some((w) => /без заголовка/.test(w)));
  });

  it('returns error for header-only csv', async () => {
    const result = await parseCsv(Buffer.from('title,text\n', 'utf-8'));
    assert.equal(result.chapters.length, 0);
    assert.ok(result.errors?.length);
  });

  it('supports multiline quoted fields', async () => {
    const csv = 'title,text\n"Ch 1","Line one\nLine two"\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.chapters.length, 1);
    assert.match(result.chapters[0]?.content ?? '', /Line one/);
    assert.match(result.chapters[0]?.content ?? '', /Line two/);
  });
});
