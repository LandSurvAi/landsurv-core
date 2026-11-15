import type { AgentType } from '../types.ts';

/**
 * Free CAD policy
 *
 * One place for the trial's mode, limits, blocked capabilities, and agent
 * classification. The UI, App.tsx, and export components should ask this file
 * rather than re-implementing the rules.
 */

export type CadEntryMode = 'unset' | 'free' | 'business';
export type FreeCadAgentAccess = 'metered' | 'blocked';

export const FREE_CAD_PROMPT_LIMIT = 20;
export const FREE_CAD_DEED_LIMIT = 5;
export const CAD_ENTRY_MODE_STORAGE_KEY = 'landsurv_cad_entry_mode_v1';

export type FreeCadFeature =
  | 'dxf-export'
  | 'tin-export'
  | 'c3d'
  | 'pdf-export'
  | 'print'
  | 'deed'
  | 'tin-create'
  | 'clipboard-project-data';

export interface FreeCadFeatureRule {
  allowed: boolean;
  notice: string;
}

/**
 * The trial is a full workspace trial. Drawing, editing, surfaces, exports,
 * printing, project files, and every agent are available; only assistant
 * inference is metered by the 20-prompt lifetime allowance.
 */
export const FREE_CAD_FEATURE_RULES: Record<FreeCadFeature, FreeCadFeatureRule> = {
  'dxf-export': {
    allowed: true,
    notice: 'DXF export is included in Free CAD.',
  },
  'tin-export': {
    allowed: true,
    notice: 'Surface export is included in Free CAD.',
  },
  c3d: {
    allowed: true,
    notice: 'Civil 3D tools are available; a Civil 3D connection still needs its own subscription.',
  },
  'pdf-export': {
    allowed: true,
    notice: 'Print-ready sheets are included in Free CAD.',
  },
  print: {
    allowed: true,
    notice: 'Printing is included in Free CAD.',
  },
  deed: {
    allowed: true,
    notice: 'Free CAD includes up to 5 deed prompts.',
  },
  'tin-create': {
    allowed: true,
    notice: 'Surface creation is included in Free CAD.',
  },
  'clipboard-project-data': {
    allowed: true,
    notice: 'Copying project data is included in Free CAD.',
  },
};

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readCadEntryMode(): CadEntryMode {
  const storage = safeStorage();
  if (!storage) return 'unset';
  try {
    const raw = storage.getItem(CAD_ENTRY_MODE_STORAGE_KEY);
    if (raw === 'free' || raw === 'business' || raw === 'unset') return raw;
  } catch {
    /* non-fatal */
  }
  return 'unset';
}

export function writeCadEntryMode(mode: CadEntryMode): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(CAD_ENTRY_MODE_STORAGE_KEY, mode);
  } catch {
    /* non-fatal */
  }
}

export function isFreeCadMode(): boolean {
  return readCadEntryMode() === 'free';
}

/**
 * Every agent uses the same 20-prompt allowance during Free CAD. There is no
 * separate agent allow-list; specialized tools remain available.
 */
export function getFreeCadAgentAccess(_agent: AgentType | null | undefined): FreeCadAgentAccess {
  return 'metered';
}

export function getBlockedAgentNotice(agent: AgentType | null | undefined): string {
  const label = agent ? String(agent).replace(/_/g, ' ').toLowerCase() : 'that agent';
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} is not available in this workspace.`;
}

export function freeCadAllows(feature: FreeCadFeature): boolean {
  if (!isFreeCadMode()) return true;
  return FREE_CAD_FEATURE_RULES[feature]?.allowed !== false;
}

export function freeCadFeatureNotice(feature: FreeCadFeature): string {
  return FREE_CAD_FEATURE_RULES[feature]?.notice
    ?? 'Included in Free CAD.';
}

/**
 * Guard for UI components that do not receive the App shell's callbacks.
 * Dispatches the same redirect event the App listens for, then returns false.
 * All current rules are open, so this remains a compatibility guard for future
 * restrictions rather than a normal free-mode path.
 */
export function freeCadGuard(feature: FreeCadFeature): boolean {
  if (!isFreeCadMode()) return true;
  if (FREE_CAD_FEATURE_RULES[feature]?.allowed !== false) return true;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('landsurv:free-cad-blocked', {
        detail: { feature, notice: freeCadFeatureNotice(feature) },
      }));
    }
  } catch {
    /* non-fatal */
  }
  return false;
}

/** Test/support helper. */
export function clearCadEntryModeForTests(): void {
  const storage = safeStorage();
  try {
    storage?.removeItem(CAD_ENTRY_MODE_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}
