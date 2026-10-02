/**
 * Resolve published news and announcement copy for one requested app locale.
 * Primary-language text stays in table columns. Other locales live in jsonb
 * and are shown only when the whole document is ready.
 */

import { PRIMARY_CONTENT_LOCALE, isAppLocale } from '../../../shared/appLocales.js';
import type { NewsCategory, NewsStatus } from '../../../storage/database.js';
import { truncateAlertMessage } from './announcements.js';

export type NewsLocaleStatus = 'draft' | 'ready';

export interface NewsLocaleSource {
  title: string;
  summary: string;
  body: string;
  primaryLocale?: string | null;
  translations?: Record<string, unknown> | null;
}

export interface ResolvedNewsText {
  title: string;
  summary: string;
  body: string;
  locale: string;
  fellBack: boolean;
}

export interface NewsTranslationDraft {
  title: string;
  summary: string;
  body: string;
  status: NewsLocaleStatus;
}

export interface PublicNewsFields {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  body: string;
  category: NewsCategory;
  status: NewsStatus;
  publishedAt: string | null;
  fellBack: boolean;
  resolvedLocale: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readNewsTranslation(
  translations: Record<string, unknown> | null | undefined,
  locale: string
): NewsTranslationDraft | null {
  const entry = asRecord(translations?.[locale]);
  if (!entry) return null;
  const status = entry.status === 'ready' || entry.status === 'draft' ? entry.status : null;
  if (!status) return null;
  return {
    title: typeof entry.title === 'string' ? entry.title.trim() : '',
    summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
    body: typeof entry.body === 'string' ? entry.body : '',
    status,
  };
}

export function isReadyNewsTranslation(
  entry: NewsTranslationDraft | null
): entry is NewsTranslationDraft {
  return Boolean(
    entry && entry.status === 'ready' && entry.title.length > 0 && entry.summary.length > 0
  );
}

export function resolveNewsLocale(
  post: NewsLocaleSource,
  requestedLocale: string
): ResolvedNewsText {
  const primary = post.primaryLocale?.trim() || PRIMARY_CONTENT_LOCALE;
  const requested = isAppLocale(requestedLocale) ? requestedLocale : primary;
  const canonical: ResolvedNewsText = {
    title: post.title,
    summary: post.summary,
    body: post.body,
    locale: primary,
    fellBack: requested !== primary,
  };
  if (requested === primary) {
    return { ...canonical, fellBack: false };
  }
  const entry = readNewsTranslation(post.translations, requested);
  if (!isReadyNewsTranslation(entry)) return canonical;
  return {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    locale: requested,
    fellBack: false,
  };
}

export function mergeNewsTranslation(
  existing: Record<string, unknown> | null | undefined,
  entry: NewsTranslationDraft & { locale: string }
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [entry.locale]: {
      title: entry.title,
      summary: entry.summary,
      body: entry.body,
      status: entry.status,
    },
  };
}

export interface AlertCopySource {
  message: string | null;
  ctaLabel: string | null;
  translations?: Record<string, unknown> | null;
  requestedLocale: string;
  primaryLocale?: string | null;
  newsSummary?: string | null;
  newsSummaryFellBack?: boolean;
}

export interface ResolvedAlertCopy {
  message: string;
  ctaLabel: string | null;
  fellBack: boolean;
}

function readAlertTranslation(
  translations: Record<string, unknown> | null | undefined,
  locale: string
): { message: string; ctaLabel: string } | null {
  const entry = asRecord(translations?.[locale]);
  if (!entry) return null;
  const message = typeof entry.message === 'string' ? entry.message.trim() : '';
  const ctaLabel = typeof entry.ctaLabel === 'string' ? entry.ctaLabel.trim() : '';
  if (!message) return null;
  return { message, ctaLabel };
}

export function resolveAlertCopy(source: AlertCopySource): ResolvedAlertCopy {
  const primary = source.primaryLocale?.trim() || PRIMARY_CONTENT_LOCALE;
  const requested = isAppLocale(source.requestedLocale) ? source.requestedLocale : primary;
  const primaryCta = source.ctaLabel?.trim() || null;
  const primaryMessage = source.message?.trim() || '';

  if (requested !== primary) {
    const translated = readAlertTranslation(source.translations, requested);
    if (translated) {
      return {
        message: truncateAlertMessage(translated.message),
        ctaLabel: translated.ctaLabel || primaryCta,
        fellBack: false,
      };
    }
  }

  if (primaryMessage) {
    return {
      message: truncateAlertMessage(primaryMessage),
      ctaLabel: primaryCta,
      fellBack: requested !== primary,
    };
  }

  const summary = source.newsSummary?.trim() || '';
  return {
    message: summary ? truncateAlertMessage(summary) : '',
    ctaLabel: primaryCta,
    fellBack: requested !== primary && Boolean(source.newsSummaryFellBack),
  };
}

export function mergeAlertTranslation(
  existing: Record<string, unknown> | null | undefined,
  entry: { locale: string; message: string; ctaLabel: string }
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [entry.locale]: {
      message: entry.message,
      ctaLabel: entry.ctaLabel,
    },
  };
}

export function toPublicNewsPost(
  post: NewsLocaleSource & {
    id: string;
    slug: string | null;
    category: NewsCategory;
    status: NewsStatus;
    publishedAt: string | null;
  },
  requestedLocale: string
): PublicNewsFields {
  const resolved = resolveNewsLocale(post, requestedLocale);
  return {
    id: post.id,
    slug: post.slug,
    title: resolved.title,
    summary: resolved.summary,
    body: resolved.body,
    category: post.category,
    status: post.status,
    publishedAt: post.publishedAt,
    fellBack: resolved.fellBack,
    resolvedLocale: resolved.locale,
  };
}
