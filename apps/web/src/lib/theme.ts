export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'fh.theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

const CHANGED = 'fh-theme';

/** For useSyncExternalStore: calls back whenever the theme changes, from anywhere. */
export function subscribeTheme(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGED));
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}
