/**
 * Keyed replay diffs.
 *
 * Geometry and other entity collections are stored as keyed deltas between
 * keyframes. Every entity must expose a stable string or numeric `id`; channel
 * serializers are responsible for adding one when the domain entity uses a
 * different identifier.
 */

import type { JsonValue, ReplayKeyedDelta } from './v2';
import { stableStringify } from './stable';

export type ReplayDiffErrorCode =
  | 'duplicate-id'
  | 'missing-id'
  | 'missing-value'
  | 'invalid-entity';

export class ReplayDiffError extends Error {
  readonly code: ReplayDiffErrorCode;

  constructor(code: ReplayDiffErrorCode, message: string) {
    super(message);
    this.name = 'ReplayDiffError';
    this.code = code;
  }
}

/** Above this fraction of changed entities, a whole-array replace is smaller. */
export const KEYED_DIFF_REPLACE_RATIO = 0.3;
/** Hard cap on deltas for one flush. */
export const KEYED_DIFF_REPLACE_LIMIT = 2_000;

const requireId = (id: string): void => {
  if (typeof id !== 'string' || id.length === 0) {
    throw new ReplayDiffError('missing-id', 'A keyed replay entity is missing a stable id.');
  }
};

/**
 * Return keyed deltas, or null when the caller should record a whole-array
 * replace. Deltas are emitted in next-array order for adds/updates, then in
 * previous-array order for removes. Keyed collections are treated as sets:
 * `applyKeyedDeltas` never reorders existing entities.
 */
export const diffKeyedArray = <T>(
  previous: readonly T[],
  next: readonly T[],
  idOf: (entity: T) => string,
  serialize: (entity: T) => JsonValue,
): ReplayKeyedDelta[] | null => {
  const before = new Map<string, { value: JsonValue; text: string }>();
  const after = new Map<string, { value: JsonValue; text: string }>();

  for (const entity of previous) {
    const id = idOf(entity);
    requireId(id);
    if (before.has(id)) {
      throw new ReplayDiffError('duplicate-id', `Duplicate keyed entity id "${id}".`);
    }
    const value = serialize(entity);
    before.set(id, { value, text: stableStringify(value) });
  }

  for (const entity of next) {
    const id = idOf(entity);
    requireId(id);
    if (after.has(id)) {
      throw new ReplayDiffError('duplicate-id', `Duplicate keyed entity id "${id}".`);
    }
    const value = serialize(entity);
    after.set(id, { value, text: stableStringify(value) });
  }

  const deltas: ReplayKeyedDelta[] = [];
  let changed = 0;

  for (const entity of next) {
    const id = idOf(entity);
    const current = after.get(id);
    if (!current) continue;
    const prior = before.get(id);
    if (!prior) {
      deltas.push({ action: 'add', id, value: current.value });
      changed += 1;
    } else if (prior.text !== current.text) {
      deltas.push({ action: 'update', id, value: current.value });
      changed += 1;
    }
  }

  for (const entity of previous) {
    const id = idOf(entity);
    if (!after.has(id)) {
      deltas.push({ action: 'remove', id });
      changed += 1;
    }
  }

  if (changed > KEYED_DIFF_REPLACE_LIMIT) return null;
  const denominator = Math.max(previous.length, next.length);
  if (denominator > 0 && changed / denominator > KEYED_DIFF_REPLACE_RATIO) return null;
  return deltas;
};

/**
 * Apply keyed deltas to an entity array.
 *
 * `add` upserts in place, `update` on a missing id is a no-op (the diff writer
 * always emits an add first), and `remove` on a missing id is a no-op.
 */
export const applyKeyedDeltas = <T>(
  current: readonly T[],
  deltas: readonly ReplayKeyedDelta[],
  idOf: (entity: T) => string,
  deserialize: (value: JsonValue) => T,
): T[] => {
  const next = [...current];

  for (const delta of deltas) {
    const index = next.findIndex(entity => idOf(entity) === delta.id);
    if (delta.action === 'remove') {
      if (index !== -1) next.splice(index, 1);
      continue;
    }

    if (delta.value === undefined) {
      throw new ReplayDiffError('missing-value', `Keyed ${delta.action} for "${delta.id}" has no value.`);
    }
    const entity = deserialize(delta.value);

    if (delta.action === 'add') {
      if (index === -1) next.push(entity);
      else next[index] = entity;
    } else if (index !== -1) {
      next[index] = entity;
    }
  }

  return next;
};

/** Read the stable id from a serialized keyed entity. */
export const entityId = (value: JsonValue): string => {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ReplayDiffError('invalid-entity', 'A keyed replay entity must be an object.');
  }
  const id = value.id;
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  throw new ReplayDiffError('missing-id', 'A keyed replay entity is missing an id.');
};

/** Apply serialized keyed deltas to a serialized channel value. */
export const applyJsonKeyedDeltas = (
  current: JsonValue | undefined,
  deltas: readonly ReplayKeyedDelta[],
): JsonValue[] => {
  const base = current === undefined ? [] : current;
  if (!Array.isArray(base)) {
    throw new ReplayDiffError('invalid-entity', 'A keyed replay channel must contain an array.');
  }
  return applyKeyedDeltas(base, deltas, entityId, value => value);
};
