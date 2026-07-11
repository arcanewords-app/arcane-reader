export type ProfileTab = 'reading' | 'settings' | 'profile';

const VALID_TABS = new Set<ProfileTab>(['reading', 'settings', 'profile']);

const DEFAULT_TAB: ProfileTab = 'reading';

export function isProfileTab(value: string | null): value is ProfileTab {
  return value != null && VALID_TABS.has(value as ProfileTab);
}

export function parseProfileTabFromUrl(): ProfileTab {
  if (typeof window === 'undefined') return DEFAULT_TAB;
  const tab = new URLSearchParams(window.location.search).get('tab');
  return isProfileTab(tab) ? tab : DEFAULT_TAB;
}

/** Returns raw tab query value (may be invalid). */
export function getRawProfileTabFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('tab');
}

export function buildProfileUrl(tab: ProfileTab): string {
  if (tab === DEFAULT_TAB) return '/profile';
  const params = new URLSearchParams();
  params.set('tab', tab);
  return `/profile?${params.toString()}`;
}
