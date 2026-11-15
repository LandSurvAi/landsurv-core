import type { Centerline, JobInfo, PointList, Settings, SurveyLine } from '../types.ts';

/**
 * Free CAD draft autosave
 *
 * The trial promises local persistence without a production file export. This
 * is a deliberately small snapshot of the project-defining state, not the full
 * .lsvz archive (which remains available through the explicit Save action).
 */

const DRAFT_KEY = 'landsurv_free_cad_draft_v1';

export interface FreeCadDraft {
  version: 1;
  savedAt: string;
  fingerprintId?: string;
  pointLists: PointList[];
  lines: SurveyLine[];
  centerlines: Centerline[];
  settings: Settings;
  jobInfo: JobInfo;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveFreeCadDraft(draft: FreeCadDraft): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadFreeCadDraft(): FreeCadDraft | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FreeCadDraft>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.pointLists) || !Array.isArray(parsed.lines)) {
      return null;
    }
    return parsed as FreeCadDraft;
  } catch {
    return null;
  }
}

export function clearFreeCadDraft(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced save; the caller supplies a fresh snapshot when the timer fires. */
export function scheduleFreeCadDraftSave(getDraft: () => FreeCadDraft | null, delayMs = 2000): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const draft = getDraft();
    if (draft) saveFreeCadDraft(draft);
  }, Math.max(250, delayMs));
}

export function cancelScheduledFreeCadDraftSave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = null;
}
