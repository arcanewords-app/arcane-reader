import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseText } from './txt.js';

describe('parseText', () => {
  it('treats entire buffer as one chapter', async () => {
    const body = 'Once upon a time.\n\nIn a land far away.';
    const result = await parseText(Buffer.from(body, 'utf-8'), 'story.txt');
    assert.equal(result.format, 'txt');
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0]?.content, body);
    assert.equal(result.chapters[0]?.number, 1);
  });

  it('derives title from filename without extension', async () => {
    const result = await parseText(Buffer.from('Body', 'utf-8'), 'Prologue.txt');
    assert.equal(result.chapters[0]?.title, 'Prologue');
  });

  it('strips leading chapter numbers from filename', async () => {
    const result = await parseText(Buffer.from('Body', 'utf-8'), '01_Opening Scene.txt');
    assert.equal(result.chapters[0]?.title, 'Opening Scene');
  });

  it('falls back to default title when filename is only numbers', async () => {
    const result = await parseText(Buffer.from('Body', 'utf-8'), '12.txt');
    assert.equal(result.chapters[0]?.title, 'Глава 1');
  });
});
