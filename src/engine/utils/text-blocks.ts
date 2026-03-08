/**
 * Text block marker validation and parsing (server-side)
 * Markers format: {{block:type-id}}content{{/block:type-id}}
 */

import type { TextBlockType } from '../types/common.js';
import { log } from '../logger.js';

const BLOCK_MARKER_REGEX = /\{\{block:([\w-]+)\}\}([\s\S]*?)\{\{\/block:\1\}\}/g;
const OPEN_MARKER_REGEX = /\{\{block:([\w-]+)\}\}/g;
const CLOSE_MARKER_REGEX = /\{\{\/block:([\w-]+)\}\}/g;

export interface ValidateBlockMarkersResult {
  valid: boolean;
  warnings: string[];
  cleaned: string;
}

/**
 * Validate block markers in text: check pairing and allowed types.
 * Removes invalid/unknown markers, returns cleaned text.
 */
export function validateBlockMarkers(
  text: string,
  allowedTypes: string[]
): ValidateBlockMarkersResult {
  const warnings: string[] = [];
  const allowedSet = new Set(allowedTypes.map((t) => t.toLowerCase()));

  // Find all open markers
  const openMatches: { type: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  const openRe = new RegExp(OPEN_MARKER_REGEX.source, 'g');
  while ((m = openRe.exec(text)) !== null) {
    openMatches.push({ type: m[1], index: m.index });
  }

  // Find all close markers
  const closeMatches: { type: string; index: number }[] = [];
  const closeRe = new RegExp(CLOSE_MARKER_REGEX.source, 'g');
  while ((m = closeRe.exec(text)) !== null) {
    closeMatches.push({ type: m[1], index: m.index });
  }

  // Check for unpaired markers
  if (openMatches.length !== closeMatches.length) {
    warnings.push(
      `Unpaired block markers: ${openMatches.length} open, ${closeMatches.length} close`
    );
  }

  // Check for unknown types
  for (const { type } of openMatches) {
    if (!allowedSet.has(type.toLowerCase())) {
      warnings.push(`Unknown block type "${type}" will be removed`);
    }
  }

  // Build cleaned text: remove invalid markers, keep valid ones
  let cleaned = text;

  // Remove unknown type markers (both open and close)
  const unknownTypes = [
    ...new Set(openMatches.map((x) => x.type).filter((t) => !allowedSet.has(t.toLowerCase()))),
  ];
  for (const type of unknownTypes) {
    cleaned = cleaned.replace(new RegExp(`\\{\\{block:${escapeRegex(type)}\\}\\}`, 'g'), '');
    cleaned = cleaned.replace(new RegExp(`\\{\\{/block:${escapeRegex(type)}\\}\\}`, 'g'), '');
  }

  // For unpaired markers we log only; full removal would require stack-based parsing
  if (warnings.length > 0) {
    log.warn(`Text block marker validation warnings: ${warnings.join('; ')}`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    cleaned,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip all block markers from text, returning plain text.
 */
export function stripBlockMarkers(text: string): string {
  return text
    .replace(BLOCK_MARKER_REGEX, '$2')
    .replace(OPEN_MARKER_REGEX, '')
    .replace(CLOSE_MARKER_REGEX, '');
}

/**
 * Convert block markers to HTML (for export or server-side rendering).
 * Used when client is not available (e.g. EPUB export).
 */
export function convertMarkersToHtml(text: string, blockTypes: TextBlockType[]): string {
  const typeMap = new Map(blockTypes.map((bt) => [bt.id.toLowerCase(), bt]));
  const parts: string[] = [];
  let lastIndex = 0;
  const re = new RegExp(BLOCK_MARKER_REGEX.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // Escape and add text before this match
    parts.push(escapeHtml(text.slice(lastIndex, m.index)));
    const typeId = m[1];
    const content = m[2];
    const bt = typeMap.get(typeId.toLowerCase());
    if (bt?.enabled) {
      const tag = bt.htmlTag;
      const cls = bt.cssClass ? ` class="${escapeAttr(bt.cssClass)}"` : '';
      parts.push(`<${tag}${cls}>${escapeHtml(content)}</${tag}>`);
    } else {
      parts.push(escapeHtml(content));
    }
    lastIndex = re.lastIndex;
  }
  parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Get the stack of unclosed block markers after processing text.
 * Used to detect when a segment has unmatched {{block:X}} (needs merge with next).
 */
function getBlockMarkerStack(text: string): string[] {
  const stack: string[] = [];
  const matches: { pos: number; type: 'open' | 'close'; id: string }[] = [];
  let m: RegExpExecArray | null;
  const openRe = new RegExp(OPEN_MARKER_REGEX.source, 'g');
  while ((m = openRe.exec(text)) !== null) {
    matches.push({ pos: m.index, type: 'open', id: m[1].toLowerCase() });
  }
  const closeRe = new RegExp(CLOSE_MARKER_REGEX.source, 'g');
  while ((m = closeRe.exec(text)) !== null) {
    matches.push({ pos: m.index, type: 'close', id: m[1].toLowerCase() });
  }
  matches.sort((a, b) => a.pos - b.pos);
  for (const { type, id } of matches) {
    if (type === 'open') {
      stack.push(id);
    } else if (stack.length > 0 && stack[stack.length - 1] === id) {
      stack.pop();
    }
  }
  return stack;
}

/**
 * Split text by paragraph boundaries but merge segments that contain unclosed block markers.
 * When translator splits a {{block:X}}...{{/block:X}} across paragraphs, this merges them
 * so the block is rendered correctly.
 */
export function mergeSegmentsWithUnclosedBlocks(
  text: string,
  splitRe: RegExp = /\n\s*\n/
): string[] {
  const normalized = text.replace(/\r\n|\r/g, '\n');
  let segments = normalized
    .split(splitRe)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return [];
  if (
    segments.length === 1 &&
    normalized.includes('\n') &&
    /[\u2014\u2013\u2012\u2015\u2212-]/.test(normalized)
  ) {
    segments = normalized
      .split(/\n(?=\s*[\u2014\u2013\u2012\u2015\u2212\-])/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) return [];
  }
  const result: string[] = [];
  let i = 0;
  while (i < segments.length) {
    let merged = segments[i];
    let stack = getBlockMarkerStack(merged);
    while (stack.length > 0 && i + 1 < segments.length) {
      i++;
      merged += '\n\n' + segments[i];
      stack = getBlockMarkerStack(merged);
    }
    result.push(merged);
    i++;
  }
  return result;
}
