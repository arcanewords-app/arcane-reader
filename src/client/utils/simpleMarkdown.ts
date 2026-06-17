import DOMPurify from 'dompurify';

/**
 * Minimal markdown → HTML for news body (headings, lists, links, paragraphs).
 */
export function renderSimpleMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
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

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h3>${inline(trimmed.slice(2))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li>${inline(trimmed.slice(2))}</li>`);
      continue;
    }

    closeList();
    htmlParts.push(`<p>${inline(trimmed)}</p>`);
  }

  closeList();

  const html = htmlParts.join('');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'p', 'ul', 'li', 'a', 'strong', 'em', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
