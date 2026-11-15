/**
 * Dev-only clean-session reset.
 *
 * The DevOps launcher opens a new tab with app storage cleared. localStorage is
 * shared across tabs, so this helper runs before the new tab is pointed at the
 * app and keeps only explicitly selected local-only preferences.
 */

export interface ClearLocalAppStateOptions {
  /** localStorage keys to copy back after the wipe, e.g. local DevOps preferences. */
  preserveKeys?: readonly string[];
}

export function clearLocalAppState({ preserveKeys = [] }: ClearLocalAppStateOptions = {}): void {
  if (typeof window === 'undefined') return;

  const preserved: Array<[string, string]> = [];
  for (const key of preserveKeys) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) preserved.push([key, value]);
    } catch {
      /* storage unavailable */
    }
  }

  try {
    window.localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }

  for (const [key, value] of preserved) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }
}
