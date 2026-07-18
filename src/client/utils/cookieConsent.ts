const STORAGE_KEY = 'arcane:cookie-consent';

export const REJECT_REPROMPT_DAYS = 30;
export const REJECT_REPROMPT_MS = REJECT_REPROMPT_DAYS * 24 * 60 * 60 * 1000;
export const CONSENT_POLICY_VERSION = 1;

export type ConsentStatus = 'accepted' | 'rejected';

export type ConsentRecord = {
  status: ConsentStatus;
  at: string;
  policyVersion: number;
};

function isRejectExpired(at: string, now = Date.now()): boolean {
  const elapsed = now - new Date(at).getTime();
  return elapsed >= REJECT_REPROMPT_MS;
}

export function parseConsentRecord(raw: string | null): ConsentRecord | null {
  if (!raw) return null;

  if (raw === 'accepted' || raw === 'rejected') {
    return {
      status: raw,
      at: new Date().toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.status !== 'accepted' && parsed.status !== 'rejected') return null;
    if (!parsed.at || typeof parsed.at !== 'string') return null;
    return {
      status: parsed.status,
      at: parsed.at,
      policyVersion: parsed.policyVersion ?? CONSENT_POLICY_VERSION,
    };
  } catch {
    return null;
  }
}

function readConsentRecord(): ConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const record = parseConsentRecord(raw);
    if (!record) return null;

    if (raw === 'accepted' || raw === 'rejected') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    }

    return record;
  } catch {
    return null;
  }
}

export function getConsent(): ConsentStatus | null {
  const record = readConsentRecord();
  if (!record) return null;
  if (record.status === 'rejected' && isRejectExpired(record.at)) return null;
  return record.status;
}

export function setConsent(value: ConsentStatus): void {
  if (typeof window === 'undefined') return;
  const record: ConsentRecord = {
    status: value,
    at: new Date().toISOString(),
    policyVersion: CONSENT_POLICY_VERSION,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
}

export function clearConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
