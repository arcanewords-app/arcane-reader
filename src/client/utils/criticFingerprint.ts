import type { Paragraph } from '../types';

/** SHA-256 hex digest of paragraph translated texts (matches server critic fingerprint). */
export async function computeCriticContentFingerprint(paragraphs: Paragraph[]): Promise<string> {
  const sorted = [...paragraphs].sort((a, b) => a.index - b.index);
  const payload = sorted.map((p) => p.translatedText ?? '').join('\x1f');
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
