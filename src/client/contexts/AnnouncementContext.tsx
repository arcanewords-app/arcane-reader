import { createContext } from 'preact';
import { useContext, useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { api } from '../api/client';
import { authService, AUTH_CHANGED_EVENT } from '../services/authService';
import type { ActiveAnnouncement } from '../types';
import {
  isAnnouncementDismissedLocally,
  saveAnnouncementDismissedLocally,
} from '../utils/dismissedAlerts';

const POLL_INTERVAL_MS = 300_000;

type AnnouncementContextValue = {
  alert: ActiveAnnouncement | null;
  dismiss: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

export function AnnouncementProvider({ children }: { children: preact.ComponentChildren }) {
  const [alert, setAlert] = useState<ActiveAnnouncement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyLocalDismissFilter = useCallback((candidate: ActiveAnnouncement | null) => {
    if (!candidate) return null;
    if (isAnnouncementDismissedLocally(candidate.id, candidate.contentVersion)) {
      return null;
    }
    return candidate;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const candidate = await api.getActiveAnnouncement();
      setAlert(applyLocalDismissFilter(candidate));
    } catch {
      setAlert(null);
    }
  }, [applyLocalDismissFilter]);

  const dismiss = useCallback(async () => {
    if (!alert) return;
    const { id, contentVersion } = alert;
    saveAnnouncementDismissedLocally(id, contentVersion);
    setAlert(null);

    if (authService.getCachedUser()) {
      try {
        await api.dismissAnnouncement(id, contentVersion);
      } catch {
        // local dismiss already applied
      }
    }
  }, [alert]);

  useEffect(() => {
    refresh();

    const handleAuthChange = () => {
      refresh();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);

    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [refresh]);

  return (
    <AnnouncementContext.Provider value={{ alert, dismiss, refresh }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncement(): AnnouncementContextValue {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) {
    throw new Error('useAnnouncement must be used within AnnouncementProvider');
  }
  return ctx;
}
