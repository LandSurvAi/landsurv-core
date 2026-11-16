/**
 * Canonical JSON helpers for recording v2.
 *
 * Channel values must serialize identically regardless of object key order so
 * change detection, keyframe hashes, and seek comparisons stay deterministic.
 */

import type { JsonValue } from './v2';

const quote = (value: string): string => JSON.stringify(value) ?? '""';

export const stableStringify = (value: JsonValue): string => {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) ?? 'null' : 'null';
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${quote(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

export const jsonEqual = (a: JsonValue, b: JsonValue): boolean => stableStringify(a) === stableStringify(b);

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

/** 64-bit FNV-1a over canonical JSON. Diagnostic only; not a security hash. */
export const hashJson = (value: JsonValue): string => {
  const text = stableStringify(value);
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, '0');
};
