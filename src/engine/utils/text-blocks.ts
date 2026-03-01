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
