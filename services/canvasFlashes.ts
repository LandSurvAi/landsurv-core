/**
 * Canvas flashes.
 *
 * A flash is a deliberately tiny interaction surface that appears beside the
 * canvas cursor: one or two inputs, a short hint, or a quick confirmation.
 * "Flash" is the internal name only — nothing in the UI labels itself that way.
 *
 * The bus mirrors `a2uiSurfaces.ts`: callers can open a flash from anywhere
 * without threading props through App, and the canvas-mounted CanvasFlashLayer
 * renders it. Pointer coordinates are remembered cheaply on every canvas move,
 * so opening a flash does not need a reference to the drawing surface.
 */

import type { A2UIInputFieldType, A2UIInputFormSpec } from '../types.ts';

export type CanvasFlashFieldType = 'text' | 'number' | 'select' | 'checkbox';

export interface CanvasFlashField {
  id: string;
  label: string;
  type?: CanvasFlashFieldType;
  placeholder?: string;
  unit?: string;
  required?: boolean;
  options?: string[];
  defaultChecked?: boolean;
}

export interface CanvasFlashAnchor {
  x: number;
  y: number;
}

export interface CanvasFlashInput {
  /** Stable identity. Re-opening the same id replaces the open surface. */
  id: string;
  /** One tiny context line, a few words at most. */
  title?: string;
  /** One short helpful line shown while the user types. */
  hint?: string;
  submitLabel?: string;
  fields: CanvasFlashField[];
  /** Optional 1-click choice buttons for follow-up questions. */
  options?: string[];
  /** At least one of these field-id groups must be complete. */
  requireOneOf?: string[][];
  onSubmit: (message: string) => void;
}

export type CanvasFlashTone = 'info' | 'success' | 'error';

export interface CanvasFlashMessage {
  id: string;
  text: string;
  tone: CanvasFlashTone;
}

export interface CanvasFlashState {
  input: CanvasFlashInput | null;
  message: CanvasFlashMessage | null;
  anchor: CanvasFlashAnchor | null;
}

const DEFAULT_MESSAGE_TTL_MS = 2600;
const MIN_MESSAGE_TTL_MS = 800;
const MAX_MESSAGE_TTL_MS = 8000;

class CanvasFlashBus {
  private state: CanvasFlashState = { input: null, message: null, anchor: null };
  private listeners = new Set<() => void>();
  private pointer: CanvasFlashAnchor | null = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  /** Non-notifying pointer memory for canvas move handlers. */
  rememberPointer(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pointer = { x, y };
  }

  openInput(input: CanvasFlashInput): void {
    this.state = {
      input,
      message: this.state.message,
      anchor: this.pointer ?? this.state.anchor,
    };
    this.emit();
  }

  closeInput(id?: string): void {
    if (!this.state.input || (id && this.state.input.id !== id)) return;
    this.state = { ...this.state, input: null };
    this.emit();
  }

  showMessage(
    text: string,
    options: { tone?: CanvasFlashTone; ttlMs?: number; anchor?: CanvasFlashAnchor } = {},
  ): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.messageTimer) clearTimeout(this.messageTimer);

    const message: CanvasFlashMessage = {
      id: `canvas-flash-message-${Date.now()}-${++this.sequence}`,
      text: trimmed,
      tone: options.tone ?? 'info',
    };
    this.state = {
      ...this.state,
      message,
      anchor: options.anchor ?? this.pointer ?? this.state.anchor,
    };
    this.emit();

    const ttl = Math.min(
      MAX_MESSAGE_TTL_MS,
      Math.max(MIN_MESSAGE_TTL_MS, options.ttlMs ?? DEFAULT_MESSAGE_TTL_MS),
    );
    this.messageTimer = setTimeout(() => {
      if (!this.state.message || this.state.message.id !== message.id) return;
      this.messageTimer = null;
      this.state = { ...this.state, message: null };
      this.emit();
    }, ttl);
  }

  clearMessage(): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    if (!this.state.message) return;
    this.state = { ...this.state, message: null };
    this.emit();
  }

  closeAll(): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    if (!this.state.input && !this.state.message) return;
    this.state = { ...this.state, input: null, message: null };
    this.emit();
  }

  /** Test/teardown reset: forgets the pointer as well as any open content. */
  reset(): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    this.pointer = null;
    this.state = { input: null, message: null, anchor: null };
    this.emit();
  }

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = (): CanvasFlashState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* a broken flash must never take the canvas down */
      }
    }
  }
}

export const canvasFlashBus = new CanvasFlashBus();

export function rememberCanvasPointer(x: number, y: number): void {
  canvasFlashBus.rememberPointer(x, y);
}

export function openCanvasFlashInput(input: CanvasFlashInput): void {
  canvasFlashBus.openInput(input);
}

export function closeCanvasFlashInput(id?: string): void {
  canvasFlashBus.closeInput(id);
}

export function flashCanvasMessage(
  text: string,
  options?: { tone?: CanvasFlashTone; ttlMs?: number; anchor?: CanvasFlashAnchor },
): void {
  canvasFlashBus.showMessage(text, options);
}

const FLASH_FIELD_TYPES: Record<A2UIInputFieldType, CanvasFlashFieldType> = {
  text: 'text',
  number: 'number',
  textarea: 'text',
  select: 'select',
  checkbox: 'checkbox',
};

/**
 * A flash is the short path for a quick value, not a replacement for a full
 * form. Keep it to one or two plain fields (for example a replacement point
 * number plus its description); choices, checkboxes, and longer forms stay in
 * Quick Thought and the chat.
 */
export function canMirrorInputFormAsFlash(form: A2UIInputFormSpec): boolean {
  if (form.fields.length === 0 || form.fields.length > 2) return false;
  return form.fields.every(field => {
    const type = field.type ?? 'text';
    return type === 'text' || type === 'number' || type === 'textarea';
  });
}

/**
 * Mirror an agent's typed input request as a tiny surface beside the cursor.
 * The full chat form stays in place as the durable record; this is only the
 * short path to typing the values where the user is already working.
 */
export function openCanvasFlashForInputForm(options: {
  form: A2UIInputFormSpec;
  onSubmit: (message: string) => void;
  id?: string;
}): void {
  const { form } = options;
  const fields = form.fields.map(field => ({
    id: field.id,
    label: field.label,
    type: FLASH_FIELD_TYPES[field.type ?? 'text'],
    placeholder: field.placeholder,
    unit: field.unit,
    required: field.required,
    options: field.options,
    defaultChecked: field.defaultChecked,
  }));
  if (fields.length === 0) return;

  canvasFlashBus.openInput({
    id: options.id ?? `input-form:${fields.map(field => field.id).join('|')}`,
    title: form.title,
    hint: form.description,
    submitLabel: form.submitLabel,
    fields,
    requireOneOf: form.requireOneOf,
    onSubmit: options.onSubmit,
  });
}

/**
 * Open a cursor-anchored flash for a follow-up question with clickable choices.
 */
export function openCanvasFlashForOptions(options: {
  id?: string;
  title?: string;
  hint?: string;
  options: string[];
  onSelect: (option: string) => void;
}): void {
  const choices = options.options.map(opt => opt.trim()).filter(Boolean);
  if (choices.length === 0) return;

  canvasFlashBus.openInput({
    id: options.id ?? `options:${choices.join('|')}`,
    title: options.title,
    hint: options.hint,
    fields: [],
    options: choices,
    onSubmit: options.onSelect,
  });
}
