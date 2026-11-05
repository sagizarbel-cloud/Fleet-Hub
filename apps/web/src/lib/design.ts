import type { Design } from '@fleet-hub/shared';

/** The site's design (2026-11-05): Yard signage by default, today's look kept as "classic". */
const STORAGE_KEY = 'fh.design';
const CHANGED = 'fh-design';

export function currentDesign(): Design {
  return document.documentElement.dataset.design === 'classic' ? 'classic' : 'yard';
}

/** For useSyncExternalStore: calls back whenever the design changes, from anywhere. */
export function subscribeDesign(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}

export function setDesign(design: Design) {
  document.documentElement.dataset.design = design;
  window.dispatchEvent(new Event(CHANGED));
  try {
    localStorage.setItem(STORAGE_KEY, design);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}
