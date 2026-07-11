import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildSimpleMarkdownHtml } from './simpleMarkdown.js';

describe('buildSimpleMarkdownHtml', () => {
  it('renders ### as h3 not paragraph', () => {
    const html = buildSimpleMarkdownHtml('### Что где доступно\n\nТекст.');
    assert.match(html, /<h3>Что где доступно<\/h3>/);
    assert.doesNotMatch(html, /<p>###/);
  });

  it('renders GFM table with empty first header cell and bold in body', () => {
    const md = `### Таблица

| | Читатель | Автор |
|---|:---:|:---:|
| Чтение | ✓ | ✓ |
| **Токенов в день** | — | **50K** |`;

    const html = buildSimpleMarkdownHtml(md);
    assert.match(html, /<table>/);
    assert.match(html, /<thead><tr><th><\/th><th>Читатель<\/th>/);
    assert.match(html, /<strong>Токенов в день<\/strong>/);
    assert.match(html, /<strong>50K<\/strong>/);
    assert.doesNotMatch(html, /\|---\|/);
  });

  it('renders internal markdown links', () => {
    const html = buildSimpleMarkdownHtml('[Открыть →](/account-tiers)');
    assert.match(html, /<a href="\/account-tiers">Открыть →<\/a>/);
  });

  it('renders fenced code without treating pipes as table', () => {
    const md = `### Формат

\`\`\`csv
original,translated,type
Kim Dokja,Ким Докча,character
\`\`\`

| Колонка | Значения |
|---------|----------|
| original | да |`;

    const html = buildSimpleMarkdownHtml(md);
    assert.match(html, /<pre><code>original,translated,type/);
    assert.match(html, /<table>/);
    assert.match(html, /<th>Колонка<\/th>/);
  });

  it('renders ordered lists', () => {
    const html = buildSimpleMarkdownHtml('1. Первый\n2. Второй');
    assert.match(html, /<ol><li>Первый<\/li><li>Второй<\/li><\/ol>/);
  });
});
