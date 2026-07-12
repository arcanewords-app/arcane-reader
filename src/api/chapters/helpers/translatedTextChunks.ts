/**
 * Split translated text into content chunks (excludes separator-only blocks).
 */

export function isSeparatorTextChunk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return /^[\s*\-_=~#]+$/.test(trimmed);
}

export function splitTranslatedTextToChunks(translatedText: string): string[] {
  return translatedText
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .filter((chunk) => !isSeparatorTextChunk(chunk));
}
