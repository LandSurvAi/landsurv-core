/**
 * Scout animation preference.
 *
 * The animated command-bar mascot is opt-in: a missing or false flag means the
 * trail is not mounted at all. Persisted per browser (like the reduce-motion
 * preference) so it survives reloads without requiring a session save.
 */

export const SCOUT_ANIMATION_STORAGE_KEY = 'landsurv_scout_animation';
export const SCOUT_ANIMATION_EVENT = 'landsurv:scout-animation-change';

export function isScoutAnimationEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SCOUT_ANIMATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setScoutAnimationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.localStorage.setItem(SCOUT_ANIMATION_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(SCOUT_ANIMATION_STORAGE_KEY);
    }
  } catch {
    // Private mode / blocked storage: the in-session event still applies.
  }
  window.dispatchEvent(new CustomEvent(SCOUT_ANIMATION_EVENT, { detail: enabled }));
}
