const STORAGE_KEY = 'arcane:dismissed-alerts:v1';

type DismissedAlertsStore = {
  schemaVersion: 1;
  items: Record<string, number>;
};

function readStore(): DismissedAlertsStore {
  if (typeof window === 'undefined') {
    return { schemaVersion: 1, items: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, items: {} };
    const parsed = JSON.parse(raw) as Partial<DismissedAlertsStore>;
    if (parsed.schemaVersion !== 1 || typeof parsed.items !== 'object' || !parsed.items) {
      return { schemaVersion: 1, items: {} };
    }
    return { schemaVersion: 1, items: parsed.items };
  } catch {
    return { schemaVersion: 1, items: {} };
  }
}

function writeStore(store: DismissedAlertsStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function isAnnouncementDismissedLocally(alertId: string, contentVersion: number): boolean {
  const store = readStore();
  const dismissedVersion = store.items[alertId];
  return dismissedVersion != null && dismissedVersion >= contentVersion;
}

export function saveAnnouncementDismissedLocally(alertId: string, contentVersion: number): void {
  const store = readStore();
  const prev = store.items[alertId] ?? 0;
  store.items[alertId] = Math.max(prev, contentVersion);
  writeStore(store);
}

export function mergeServerDismissals(
  serverItems: Array<{ announcementId: string; contentVersion: number }>
): void {
  if (!serverItems.length) return;
  const store = readStore();
  for (const item of serverItems) {
    const prev = store.items[item.announcementId] ?? 0;
    store.items[item.announcementId] = Math.max(prev, item.contentVersion);
  }
  writeStore(store);
}
