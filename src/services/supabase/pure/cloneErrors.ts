/**
 * Clone/transfer error factories — extracted from supabaseDatabase for unit testing.
 */

export function createCloneIncompleteError(
  expected: number,
  actual: number
): Error & {
  code: 'CLONE_INCOMPLETE';
  expected: number;
  actual: number;
} {
  const err = new Error(
    `Clone incomplete: expected ${expected} paragraphs, got ${actual}`
  ) as Error & { code: 'CLONE_INCOMPLETE'; expected: number; actual: number };
  err.code = 'CLONE_INCOMPLETE';
  err.expected = expected;
  err.actual = actual;
  return err;
}

export function createSameProjectError(): Error & { code: 'SAME_PROJECT' } {
  const err = new Error('Source and target project must differ') as Error & {
    code: 'SAME_PROJECT';
  };
  err.code = 'SAME_PROJECT';
  return err;
}

export function createTargetLanguageMismatchError(): Error & { code: 'TARGET_LANGUAGE_MISMATCH' } {
  const err = new Error('Target language must match between projects') as Error & {
    code: 'TARGET_LANGUAGE_MISMATCH';
  };
  err.code = 'TARGET_LANGUAGE_MISMATCH';
  return err;
}

export function createInvalidChapterIdsError(): Error & { code: 'INVALID_CHAPTER_IDS' } {
  const err = new Error('One or more chapters do not belong to the source project') as Error & {
    code: 'INVALID_CHAPTER_IDS';
  };
  err.code = 'INVALID_CHAPTER_IDS';
  return err;
}

export function createTransferIncompleteError(
  expected: number,
  actual: number
): Error & { code: 'TRANSFER_INCOMPLETE'; expected: number; actual: number } {
  const err = new Error(
    `Transfer incomplete: expected ${expected} paragraphs, got ${actual}`
  ) as Error & { code: 'TRANSFER_INCOMPLETE'; expected: number; actual: number };
  err.code = 'TRANSFER_INCOMPLETE';
  err.expected = expected;
  err.actual = actual;
  return err;
}

export function remapMentionedInChapters(
  mentioned: number[] | undefined,
  chapterNumberMap: Map<number, number>
): number[] | undefined {
  if (!mentioned?.length) return mentioned;
  return mentioned.map((n) => chapterNumberMap.get(n) ?? n);
}
