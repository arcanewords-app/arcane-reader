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
  return parseSupportUrl(import.meta.env.VITE_SUPPORT_BOOSTY_URL);
}
