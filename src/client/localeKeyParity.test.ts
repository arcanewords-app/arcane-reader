import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import be from './locales/be.json';
import en from './locales/en.json';
import pl from './locales/pl.json';
import ru from './locales/ru.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(...leafKeys(child, path));
  }
  return keys;
}

describe('locale key parity', () => {
  const ruKeys = leafKeys(ru).sort();

  for (const [name, locale] of [
    ['en', en],
    ['be', be],
    ['pl', pl],
  ] as const) {
    it(`${name} leaf keys match ru`, () => {
      assert.deepEqual(leafKeys(locale).sort(), ruKeys);
    });
  }
});
