/**
 * Default text block type presets for special formatting
 * Used when loading presets in project settings
 */

import type { TextBlockType } from '../types';

/** Preview samples for each block type - shown in settings UI */
export const BLOCK_PREVIEW_SAMPLES: Record<string, { html: string; isInline?: boolean }> = {
  'system-message': {
    html: '<div class="system-message">Level Up! Сила +5. Новый навык: <strong>Удар молнии</strong></div>',
    isInline: false,
  },
  note: {
    html: '<section class="note">Дорогой друг, надеюсь это письмо застанет тебя в добром здравии. Я пишу из далёких земель...</section>',
    isInline: false,
  },
  notification: {
    html: 'Он подошёл ближе, и <span class="notification">подсказка: нажми E для взаимодействия</span> мелькнула перед глазами.',
    isInline: true,
  },
  skill: {
    html: 'Маг произнёс заклинание и призвал <span class="skill">Огненный шар</span>, который устремился к врагу.',
    isInline: true,
  },
  'inner-voice': {
    html: '<div class="inner-voice">Надо бы проверить, что там за шум. Хотя... может, лучше не лезть?</div>',
    isInline: false,
  },
  letter: {
    html: '<section class="letter">Уважаемый господин, в ответ на ваше обращение от 15-го числа...</section>',
    isInline: false,
  },
};

/** Style presets for custom block types - pick one to inherit visual style */
export const STYLE_PRESET_IDS = [
  'system-message',
  'note',
  'notification',
  'skill',
  'inner-voice',
] as const;

/** Generate preview HTML for custom block types. Use cssClass from a style preset for consistent look. */
export function getCustomBlockPreview(bt: TextBlockType): string {
  const sample = bt.isInline
    ? 'Пример выделенного текста'
    : 'Пример текста в блоке. Вторая строка.';
  const tag = bt.htmlTag;
  const cls = bt.cssClass ? ` class="${bt.cssClass}"` : '';
  return `<${tag}${cls}>${sample}</${tag}>`;
}

/** Built-in text block types (LitRPG / game-like novels) */
export const DEFAULT_TEXT_BLOCK_TYPES: TextBlockType[] = [
  {
    id: 'system-message',
    name: 'System Message',
    description:
      'Game system notifications, stat updates, level-ups, quest updates, system prompts',
    htmlTag: 'div',
    cssClass: 'system-message',
    isInline: false,
    icon: '📢',
    enabled: true,
  },
  {
    id: 'note',
    name: 'Note / Letter',
    description: 'Letters, notes, book excerpts, documents within the story',
    htmlTag: 'section',
    cssClass: 'note',
    isInline: false,
    icon: '📝',
    enabled: true,
  },
  {
    id: 'notification',
    name: 'Notification',
    description: 'Inline notifications, tooltips, pop-up hints within text',
    htmlTag: 'span',
    cssClass: 'notification',
    isInline: true,
    icon: '💬',
    enabled: true,
  },
  {
    id: 'skill',
    name: 'Skill / Spell',
    description: 'Skill names, spell names, ability names (inline highlight)',
    htmlTag: 'span',
    cssClass: 'skill',
    isInline: true,
    icon: '⚡',
    enabled: true,
  },
  {
    id: 'inner-voice',
    name: 'Inner Voice',
    description: "Character's inner thoughts, internal monologue (distinct from narrative)",
    htmlTag: 'div',
    cssClass: 'inner-voice',
    isInline: false,
    icon: '💭',
    enabled: true,
  },
];

/** LitRPG preset - all game-related blocks enabled */
export const LITRPG_PRESET: TextBlockType[] = DEFAULT_TEXT_BLOCK_TYPES;

/** Epistolary preset - focus on letters and documents */
export const EPISTOLARY_PRESET: TextBlockType[] = [
  {
    id: 'note',
    name: 'Note / Letter',
    description: 'Letters, notes, book excerpts, documents within the story',
    htmlTag: 'section',
    cssClass: 'note',
    isInline: false,
    icon: '📝',
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
];
