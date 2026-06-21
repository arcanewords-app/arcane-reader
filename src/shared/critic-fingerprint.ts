import { createHash } from 'node:crypto';

export function buildCriticFingerprintPayload(translatedTexts: string[]): string {
  return translatedTexts.join('\x1f');
}

export function hashCriticFingerprintPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function computeCriticContentFingerprintFromTexts(translatedTexts: string[]): string {
  return hashCriticFingerprintPayload(buildCriticFingerprintPayload(translatedTexts));
}
