import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  mergeAlertTranslation,
  mergeNewsTranslation,
  resolveAlertCopy,
  resolveNewsLocale,
} from './newsLocale.js';

const post = {
  title: 'Русский заголовок',
  summary: 'Русское описание',
  body: 'Русский текст',
  primaryLocale: 'ru',
  translations: {
    en: {
      title: 'English title',
      summary: 'English summary',
      body: 'English body',
      status: 'ready',
    },
    be: {
      title: 'Чарновак',
      summary: '',
      body: 'Цела',
      status: 'draft',
    },
    pl: {
      title: '',
      summary: 'Opis',
      body: '',
      status: 'ready',
    },
  },
};

describe('resolveNewsLocale', () => {
  it('returns the ready locale as a whole document', () => {
    const resolved = resolveNewsLocale(post, 'en');
    assert.equal(resolved.fellBack, false);
    assert.equal(resolved.locale, 'en');
    assert.equal(resolved.title, 'English title');
    assert.equal(resolved.body, 'English body');
  });

  it('falls back to Russian when the locale is still a draft', () => {
    const resolved = resolveNewsLocale(post, 'be');
    assert.equal(resolved.fellBack, true);
    assert.equal(resolved.locale, 'ru');
    assert.equal(resolved.title, 'Русский заголовок');
    assert.equal(resolved.body, 'Русский текст');
  });

  it('falls back when a ready locale is missing title or summary', () => {
    const resolved = resolveNewsLocale(post, 'pl');
    assert.equal(resolved.fellBack, true);
    assert.equal(resolved.title, 'Русский заголовок');
  });

  it('falls back when the locale key is missing', () => {
    const resolved = resolveNewsLocale({ ...post, translations: {} }, 'en');
    assert.equal(resolved.fellBack, true);
    assert.equal(resolved.summary, 'Русское описание');
  });

  it('does not mark the primary locale as a fallback', () => {
    const resolved = resolveNewsLocale(post, 'ru');
    assert.equal(resolved.fellBack, false);
    assert.equal(resolved.locale, 'ru');
    assert.equal(resolved.title, 'Русский заголовок');
  });
});

describe('resolveAlertCopy', () => {
  it('uses the locale message and CTA when present', () => {
    const copy = resolveAlertCopy({
      message: 'Русский баннер',
      ctaLabel: 'Подробнее',
      translations: { en: { message: 'English banner', ctaLabel: 'Details' } },
      requestedLocale: 'en',
      newsSummary: 'English summary',
    });
    assert.equal(copy.message, 'English banner');
    assert.equal(copy.ctaLabel, 'Details');
    assert.equal(copy.fellBack, false);
  });

  it('falls back to the Russian message instead of mixing in a translated summary', () => {
    const copy = resolveAlertCopy({
      message: 'Русский баннер',
      ctaLabel: 'Подробнее',
      translations: {},
      requestedLocale: 'en',
      newsSummary: 'English summary',
      newsSummaryFellBack: false,
    });
    assert.equal(copy.message, 'Русский баннер');
    assert.equal(copy.ctaLabel, 'Подробнее');
    assert.equal(copy.fellBack, true);
  });

  it('borrows the already resolved summary when the alert has no message', () => {
    const ready = resolveAlertCopy({
      message: null,
      ctaLabel: null,
      translations: {},
      requestedLocale: 'en',
      newsSummary: 'English summary',
      newsSummaryFellBack: false,
    });
    assert.equal(ready.message, 'English summary');
    assert.equal(ready.fellBack, false);

    const fallback = resolveAlertCopy({
      message: '  ',
      ctaLabel: 'Подробнее',
      translations: { be: { message: '', ctaLabel: 'Далей' } },
      requestedLocale: 'be',
      newsSummary: 'Русское описание',
      newsSummaryFellBack: true,
    });
    assert.equal(fallback.message, 'Русское описание');
    assert.equal(fallback.fellBack, true);
  });
});

describe('merge helpers', () => {
  it('merges one news locale without dropping the others', () => {
    const merged = mergeNewsTranslation(
      { en: { title: 'Old', summary: 'S', body: '', status: 'draft' } },
      { locale: 'be', title: 'Новы', summary: 'Апісанне', body: 'Тэкст', status: 'ready' }
    );
    assert.equal((merged.en as { title: string }).title, 'Old');
    assert.equal((merged.be as { status: string }).status, 'ready');
  });

  it('merges one alert locale', () => {
    const merged = mergeAlertTranslation(
      { en: { message: 'Hi', ctaLabel: 'Go' } },
      { locale: 'pl', message: 'Cześć', ctaLabel: 'Dalej' }
    );
    assert.equal((merged.en as { message: string }).message, 'Hi');
    assert.equal((merged.pl as { ctaLabel: string }).ctaLabel, 'Dalej');
  });
});
