import { createContext } from 'preact';
import { useContext, useState, useCallback } from 'preact/hooks';
import { getConsent, setConsent, clearConsent, type ConsentStatus } from '../utils/cookieConsent';

type CookieConsentContextValue = {
  consent: ConsentStatus | null;
  hasDecided: boolean;
  acceptConsent: () => void;
  rejectConsent: () => void;
  resetConsent: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: preact.ComponentChildren }) {
  const [consent, setConsentState] = useState<ConsentStatus | null>(() => getConsent());

  const acceptConsent = useCallback(() => {
    setConsent('accepted');
    setConsentState('accepted');
  }, []);

  const rejectConsent = useCallback(() => {
    setConsent('rejected');
    setConsentState('rejected');
  }, []);

  const resetConsent = useCallback(() => {
    clearConsent();
    setConsentState(null);
  }, []);

  const hasDecided = consent !== null;

  const value: CookieConsentContextValue = {
    consent,
    hasDecided,
    acceptConsent,
    rejectConsent,
    resetConsent,
  };

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }
  return ctx;
}
