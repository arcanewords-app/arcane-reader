/**
 * Convert text block markers to HTML and sanitize for safe rendering
 * Markers format: {{block:type-id}}content{{/block:type-id}}
 */

import DOMPurify from 'dompurify';
import type { TextBlockType } from '../types';

const BLOCK_MARKER_REGEX = /\{\{block:([\w-]+)\}\}([\s\S]*?)\{\{\/block:\1\}\}/g;

const ALLOWED_TAGS = ['aside', 'section', 'div', 'span', 'blockquote', 'p', 'br', 'em', 'strong'];
const ALLOWED_ATTR = ['class'];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert block markers to HTML and sanitize with DOMPurify.
 * When blockTypes is empty or no markers present, returns escaped plain text (backward compatible).
 */
export function renderTextWithBlocks(text: string, blockTypes: TextBlockType[] = []): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const enabledTypes = blockTypes.filter((bt) => bt.enabled);
  if (enabledTypes.length === 0 || !text.includes('{{block:')) {
    return escapeHtml(text);
  }

  const typeMap = new Map(enabledTypes.map((bt) => [bt.id.toLowerCase(), bt]));
  const parts: string[] = [];
  let lastIndex = 0;
  const re = new RegExp(BLOCK_MARKER_REGEX.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    parts.push(escapeHtml(text.slice(lastIndex, m.index)));
    const typeId = m[1];
    const content = m[2];
    const bt = typeMap.get(typeId.toLowerCase());
    if (bt) {
      const tag = bt.htmlTag;
      const cls = bt.cssClass ? ` class="${bt.cssClass.replace(/"/g, '&quot;')}"` : '';
      parts.push(`<${tag}${cls}>${escapeHtml(content)}</${tag}>`);
    } else {
      parts.push(escapeHtml(content));
    }
    lastIndex = re.lastIndex;
  }
  parts.push(escapeHtml(text.slice(lastIndex)));
  const html = parts.join('');

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, 'br'],
    ALLOWED_ATTR,
  });
  return sanitized.replace(/\n/g, '<br>');
}
