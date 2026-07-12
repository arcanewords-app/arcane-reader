import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { mockChangeLanguage } = vi.hoisted(() => ({
  mockChangeLanguage: vi.fn(),
}));

vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn(),
    changeLanguage: (...args: unknown[]) => mockChangeLanguage(...args),
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {},
}));

import { APP_LOCALE_KEY, SUPPORTED_LOCALES, getSavedLocaleSync, setSavedLocale } from './i18n.js';

describe('i18n constants', () => {
  it('exposes supported locales and storage key', () => {
    assert.deepEqual(SUPPORTED_LOCALES, ['ru', 'en', 'be']);
    assert.equal(APP_LOCALE_KEY, 'app.locale');
  });
});

describe('getSavedLocaleSync', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns saved locale from localStorage', () => {
    storage.set(APP_LOCALE_KEY, 'en');
    assert.equal(getSavedLocaleSync(), 'en');
  });

  it('migrates legacy pl locale to en', () => {
    storage.set(APP_LOCALE_KEY, 'pl');
    assert.equal(getSavedLocaleSync(), 'en');
    assert.equal(storage.get(APP_LOCALE_KEY), 'en');
  });

  it('falls back to browser locale when nothing saved', () => {
    vi.stubGlobal('navigator', { language: 'be-BY', languages: ['be-BY'] });
    assert.equal(getSavedLocaleSync(), 'be');
  });

  it('defaults to ru for unsupported browser locale', () => {
    vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] });
    assert.equal(getSavedLocaleSync(), 'ru');
  });
});

describe('setSavedLocale', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    mockChangeLanguage.mockClear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists locale and updates html lang', () => {
    setSavedLocale('en');
    assert.equal(storage.get(APP_LOCALE_KEY), 'en');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(mockChangeLanguage.mock.calls[0]?.[0], 'en');
  });
});
