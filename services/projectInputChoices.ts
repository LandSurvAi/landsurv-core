/**
 * Project-backed choices for A2UI input forms.
 *
 * Forms are built from model prose and skill payloads that do not know what is
 * loaded in the drawing. This store lets the app publish the names that already
 * exist in the file, so a free-text "Surface name" field can offer the loaded
 * TIN surfaces as a dropdown in chat, Quick Thought, and the cursor flash.
 */

import type { A2UIInputField } from '../types.ts';

export interface ProjectInputChoices {
  surfaceNames: string[];
}

const EMPTY_CHOICES: ProjectInputChoices = { surfaceNames: [] };

let state: ProjectInputChoices = EMPTY_CHOICES;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a broken form must never take the canvas down */
    }
  }
}

/** Publish the TIN surface names currently loaded in the project file. */
export function setProjectSurfaceNames(names: readonly string[]): void {
  const next = Array.from(
    new Set(names.map(name => name.trim()).filter(name => name.length > 0)),
  );
  const unchanged =
    next.length === state.surfaceNames.length &&
    next.every((name, index) => name === state.surfaceNames[index]);
  if (unchanged) return;

  state = { surfaceNames: next };
  emit();
}

export function getProjectInputChoices(): ProjectInputChoices {
  return state;
}

export function subscribeProjectInputChoices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test/teardown reset. */
export function resetProjectInputChoices(): void {
  if (state.surfaceNames.length === 0) return;
  state = EMPTY_CHOICES;
  emit();
}

export const projectInputChoices = {
  subscribe: subscribeProjectInputChoices,
  getSnapshot: getProjectInputChoices,
};

const SURFACE_FIELD_RE = /\b(?:surface|tin)\b/i;
const NON_CHOICE_FIELD_RE =
  /\b(?:area|elevation|volume|slope|count|spacing|interval|offset|grade|thickness)\b/i;

/**
 * True for an open text field that asks for a surface by name. Number fields
 * and fields with explicit model-supplied choices are left untouched.
 */
export function isSurfaceNameField(
  field: Pick<A2UIInputField, 'id' | 'label' | 'type' | 'options'>,
): boolean {
  if (field.options && field.options.length > 0) return false;
  if ((field.type ?? 'text') !== 'text') return false;
  const label = `${field.id} ${field.label}`;
  return SURFACE_FIELD_RE.test(label) && !NON_CHOICE_FIELD_RE.test(label);
}
