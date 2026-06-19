import DOMPurify from 'dompurify';

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'h2',
    'h3',
    'p',
    'ul',
    'ol',
    'li',
    'a',
    'strong',
    'em',
    'br',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'pre',
    'code',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
} as const;

/**
 * Minimal markdown → HTML for news body (headings, lists, tables, code, links).
 * Returns unsanitized HTML — use {@link renderSimpleMarkdown} in the UI.
 */
export function buildSimpleMarkdownHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  const codeLines: string[] = [];

  const closeList = () => {
    if (listType === 'ul') htmlParts.push('</ul>');
    if (listType === 'ol') htmlParts.push('</ol>');
    listType = null;
  };

  const inline = (text: string): string => {
    let out = escapeHtml(text);
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const safeUrl = String(url).trim();
      if (!/^https?:\/\//i.test(safeUrl) && !safeUrl.startsWith('/')) {
        return escapeHtml(label);
      }
      return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(label)}</a>`;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return out;
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    const code = escapeHtml(codeLines.join('\n'));
    htmlParts.push(`<pre><code>${code}</code></pre>`);
    codeLines.length = 0;
    inCodeBlock = false;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (trimmed.startsWith('```')) {
        flushCodeBlock();
        i += 1;
        continue;
      }
      codeLines.push(line);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      closeList();
      inCodeBlock = true;
      i += 1;
      continue;
    }

    if (!trimmed) {
      closeList();
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|')) {
      closeList();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      htmlParts.push(renderTable(tableLines, inline));
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      i += 1;
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        listType = 'ol';
      }
      htmlParts.push(`<li>${inline(orderedMatch[2])}</li>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        listType = 'ul';
      }
      htmlParts.push(`<li>${inline(trimmed.slice(2))}</li>`);
      i += 1;
      continue;
    }

    closeList();
    htmlParts.push(`<p>${inline(trimmed)}</p>`);
    i += 1;
  }

  flushCodeBlock();
  closeList();

  const html = htmlParts.join('');
  return html;
}

export function renderSimpleMarkdown(source: string): string {
  return DOMPurify.sanitize(buildSimpleMarkdownHtml(source), SANITIZE_OPTIONS);
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  let inner = trimmed;
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  if (inner.startsWith('|')) inner = inner.slice(1);
  return inner.split('|').map((c) => c.trim());
}

function isTableSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderTable(lines: string[], inline: (text: string) => string): string {
  if (lines.length === 0) return '';

  const rows = lines.map(parseTableCells).filter((cells) => cells.length > 0);
  if (rows.length === 0) return '';

  const header = rows[0];
  let bodyRows = rows.slice(1);
  if (bodyRows.length > 0 && isTableSeparatorRow(bodyRows[0])) {
    bodyRows = bodyRows.slice(1);
  }

  const headerHtml = header.map((c) => `<th>${inline(c)}</th>`).join('');
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('');

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
