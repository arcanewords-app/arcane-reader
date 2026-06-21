export const TRANSLATION_STATUSES = ['in_progress', 'complete', 'abandoned'] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export function isTranslationStatus(value: unknown): value is TranslationStatus {
  return typeof value === 'string' && (TRANSLATION_STATUSES as readonly string[]).includes(value);
}

/** Normalize legacy project metadata boolean to enum (or null). */
export function translationStatusFromMetadata(
  metadata:
    | {
        translationStatus?: TranslationStatus | null;
        isCompleteWork?: boolean;
      }
    | null
    | undefined
): TranslationStatus | null {
  if (!metadata) return null;
  if (isTranslationStatus(metadata.translationStatus)) {
    return metadata.translationStatus;
  }
  if (metadata.isCompleteWork === true) return 'complete';
  return null;
}
