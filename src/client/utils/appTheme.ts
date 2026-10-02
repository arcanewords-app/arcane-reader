export const APP_THEME_KEY = 'app.theme';
export type AppTheme = 'dark' | 'light';

export function isAppTheme(value: string | null): value is AppTheme {
  return value === 'dark' || value === 'light';
}

/** Saved choice, or dark when unset. Does not follow the OS color scheme. */
export function readAppTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(APP_THEME_KEY);
    if (isAppTheme(saved)) return saved;
  } catch {
    // Private mode or blocked storage: keep the dark default.
  }
  return 'dark';
}

/** Light sets `data-theme`; dark removes it so `:root` tokens stay in effect. */
export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function setAppTheme(theme: AppTheme): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(APP_THEME_KEY, theme);
    } catch {
      // Ignore storage failures; the attribute still updates for this view.
    }
  }
  applyAppTheme(theme);
}

export function toggleAppTheme(current: AppTheme): AppTheme {
  const next: AppTheme = current === 'light' ? 'dark' : 'light';
  setAppTheme(next);
  return next;
}
