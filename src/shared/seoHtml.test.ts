import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'vitest';
import { escapeHtml, escapeMetaContent, resolveIndexPath } from './seoHtml.js';

describe('seoHtml', () => {
  it('escapeHtml escapes HTML special characters', () => {
    assert.equal(escapeHtml('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('escapeMetaContent escapes quotes and angle brackets', () => {
    assert.equal(escapeMetaContent('Title "Arcane"'), 'Title &quot;Arcane&quot;');
  });

  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolveIndexPath prefers client index when present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-html-'));
    tmpDirs.push(root);
    const clientPath = path.join(root, 'client');
    const publicPath = path.join(root, 'public');
    fs.mkdirSync(clientPath);
    fs.mkdirSync(publicPath);
    fs.writeFileSync(path.join(clientPath, 'index.html'), '<html></html>');
    assert.equal(resolveIndexPath(clientPath, publicPath), path.join(clientPath, 'index.html'));
  });
});
