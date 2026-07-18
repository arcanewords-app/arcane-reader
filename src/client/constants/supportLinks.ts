/** Disabled: EU compliance — donations not allowed while user content may be pirated. */
const SUPPORT_DONATIONS_ENABLED = false;

function parseSupportUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('https://')) return undefined;
  try {
    return new URL(trimmed).href;
  } catch {
    return undefined;
  }
}

export function getBoostySupportUrl(): string | undefined {
  if (!SUPPORT_DONATIONS_ENABLED) return undefined;
  return parseSupportUrl(import.meta.env.VITE_SUPPORT_BOOSTY_URL);
}
