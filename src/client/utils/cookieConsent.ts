const STORAGE_KEY = 'arcane:cookie-consent';

export type ConsentStatus = 'accepted' | 'rejected';

export function getConsent(): ConsentStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'accepted' || value === 'rejected') return value;
    return null;
  } catch {
    return null;
  }
}

export function setConsent(value: ConsentStatus): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage errors
  }
}
