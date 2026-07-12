import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isSupportedFormat, parseFile } from './index.js';
import { parseText } from './txt.js';
import { parseCsv } from './csv.js';

describe('import index', () => {
  it('isSupportedFormat recognizes known extensions', () => {
    assert.equal(isSupportedFormat('book.epub'), true);
    assert.equal(isSupportedFormat('book.fb2'), true);
    assert.equal(isSupportedFormat('chapters.csv'), true);
    assert.equal(isSupportedFormat('notes.txt'), true);
    assert.equal(isSupportedFormat('archive.zip'), false);
  });

  it('parseFile routes txt to text parser', async () => {
    const result = await parseFile(Buffer.from('Hello world', 'utf-8'), '01_intro.txt');
    assert.equal(result.format, 'txt');
    assert.equal(result.chapters.length, 1);
    assert.match(result.chapters[0]?.content ?? '', /Hello/);
  });

  it('parseFile rejects unknown extension', async () => {
    await assert.rejects(() => parseFile(Buffer.from('x'), 'file.doc'), /Неподдерживаемый/);
  });
});

describe('parseText', () => {
  it('uses filename as chapter title', async () => {
    const result = await parseText(Buffer.from('Body', 'utf-8'), '01_Prologue.txt');
    assert.equal(result.chapters[0]?.title, 'Prologue');
  });
});

describe('parseCsv', () => {
  it('parses title,text rows', async () => {
    const csv = 'title,text\nChapter 1,Hello\nChapter 2,World\n';
    const result = await parseCsv(Buffer.from(csv, 'utf-8'));
    assert.equal(result.format, 'csv');
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0]?.title, 'Chapter 1');
  });

  it('returns error for empty csv data', async () => {
    const result = await parseCsv(Buffer.from('title,text\n', 'utf-8'));
    assert.ok(result.errors?.length);
    assert.equal(result.chapters.length, 0);
  });
});
