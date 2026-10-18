import { describe, expect, it } from 'vitest';
import type { TextBlockType } from '../types';
import { getCustomBlockPreview, LITRPG_PRESET } from './text-block-presets.js';

function block(overrides: Partial<TextBlockType>): TextBlockType {
  return {
    id: 'custom',
    name: 'Custom',
    description: 'Custom block',
    htmlTag: 'div',
    cssClass: 'custom',
    isInline: false,
    enabled: true,
    ...overrides,
  };
}

describe('getCustomBlockPreview', () => {
  it('wraps a block sample in the configured tag and class', () => {
    expect(getCustomBlockPreview(block({}))).toBe(
      '<div class="custom">Пример текста в блоке. Вторая строка.</div>'
    );
    expect(LITRPG_PRESET.length).toBeGreaterThan(0);
  });

  it('uses the inline sample and omits an empty class', () => {
    expect(getCustomBlockPreview(block({ htmlTag: 'span', cssClass: '', isInline: true }))).toBe(
      '<span>Пример выделенного текста</span>'
    );
  });
});
