import { useMemo, useSyncExternalStore } from 'react';

export const TIMELINE_ENABLED_KEY = 'landsurv.timeline.enabled.v1';
export const TIMELINE_VISIBLE_KEY = 'landsurv.timeline.visible.v1';

export interface TimelineVisibilityState {
  enabled: boolean;
  visible: boolean;
}

export interface TimelineVisibilityApi extends TimelineVisibilityState {
  enable: () => void;
  disable: () => void;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
}

function readEnabled(): boolean {
  try {
    // Timeline is opt-in. Only an explicit stored true enables it; a missing
    // value keeps existing and new users on the unmanaged drawing workflow.
    return window.localStorage.getItem(TIMELINE_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function readVisible(): boolean {
  try {
    return window.localStorage.getItem(TIMELINE_VISIBLE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readState(): TimelineVisibilityState {
  if (typeof window === 'undefined') return { enabled: false, visible: true };
  return { enabled: readEnabled(), visible: readVisible() };
}

let snapshot: TimelineVisibilityState = readState();
const listeners = new Set<() => void>();

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The in-memory snapshot still works when storage is unavailable.
  }
}

function notify(): void {
  snapshot = readState();
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => listeners.delete(listener);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== TIMELINE_ENABLED_KEY && event.key !== TIMELINE_VISIBLE_KEY) return;
    snapshot = readState();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): TimelineVisibilityState {
  return snapshot;
}

export function enableTimeline(): void {
  write(TIMELINE_ENABLED_KEY, 'true');
  // Re-enabling should always reveal the dock, even if it was hidden before.
  write(TIMELINE_VISIBLE_KEY, 'true');
  notify();
}

export function disableTimeline(): void {
  write(TIMELINE_ENABLED_KEY, 'false');
  notify();
}

export function setTimelineVisible(visible: boolean): void {
  write(TIMELINE_VISIBLE_KEY, String(visible));
  notify();
}

export function toggleTimelineVisible(): void {
  setTimelineVisible(!snapshot.visible);
}

export function useTimelineVisibility(): TimelineVisibilityApi {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => ({
    ...state,
    enable: enableTimeline,
    disable: disableTimeline,
    setVisible: setTimelineVisible,
    toggleVisible: toggleTimelineVisible,
  }), [state]);
}

/** Reset the module cache when a test clears localStorage between cases. */
export function resetTimelineVisibilityForTests(): void {
  try {
    window.localStorage.removeItem(TIMELINE_ENABLED_KEY);
    window.localStorage.removeItem(TIMELINE_VISIBLE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  notify();
}
