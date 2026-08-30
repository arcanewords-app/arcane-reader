export const TINY_CHAPTER_TEXT =
  'The wizard walked to the old stone tower.\n\nSnow fell quietly on the steps.';

export const TINY_CHAPTER_TITLE = 'E2E tiny chapter';

export function projectIdFromUrl(url: string): string {
  const match = url.match(/\/projects\/([0-9a-f-]{36})/i);
  if (!match?.[1]) {
    throw new Error(`No project UUID in URL: ${url}`);
  }
  return match[1];
}
