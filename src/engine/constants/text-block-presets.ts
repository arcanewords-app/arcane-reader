/**
 * Default text block types for export (server-side).
 * Mirrors client presets for EPUB/FB2 conversion when project has no custom types.
 */

import type { TextBlockType } from '../types/common.js';

/** Built-in text block types - used when project has no textBlockTypes configured */
export const DEFAULT_TEXT_BLOCK_TYPES: TextBlockType[] = [
  {
    id: 'system-message',
    name: 'System Message',
    description: 'Game system notifications, stat updates, level-ups',
    htmlTag: 'div',
    cssClass: 'system-message',
    isInline: false,
    icon: '📢',
    enabled: true,
  },
  {
    id: 'note',
    name: 'Note / Letter',
    description: 'Letters, notes, book excerpts, documents',
    htmlTag: 'section',
    cssClass: 'note',
    isInline: false,
    icon: '📝',
    enabled: true,
  },
  {
    id: 'notification',
    name: 'Notification',
    description: 'Inline notifications, tooltips, pop-up hints',
    htmlTag: 'span',
    cssClass: 'notification',
    isInline: true,
    icon: '💬',
    enabled: true,
  },
  {
    id: 'skill',
    name: 'Skill / Spell',
    description: 'Skill names, spell names, ability names',
    htmlTag: 'span',
    cssClass: 'skill',
    isInline: true,
    icon: '⚡',
    enabled: true,
  },
  {
    id: 'inner-voice',
    name: 'Inner Voice',
    description: "Character's inner thoughts, internal monologue",
    htmlTag: 'div',
    cssClass: 'inner-voice',
    isInline: false,
    icon: '💭',
    enabled: true,
  },
  {
    id: 'letter',
    name: 'Letter',
    description: 'Letters, documents within story',
    htmlTag: 'section',
    cssClass: 'letter',
    isInline: false,
    icon: '📝',
    enabled: true,
  },
];
