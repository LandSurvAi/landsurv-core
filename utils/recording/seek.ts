/**
 * Deterministic replay frame resolution.
 *
 * State at time T is the latest full keyframe at or before T, followed by every
 * later patch keyframe up to T, followed by changes in (lastFrame.t, T]. The
 * frame cache is only an optimization: every result is reproducible from the
 * arrays alone, so seeking backwards can never leak forward state.
 */

import type {
  JsonValue,
  ReplayChange,
  ReplayKeyframe,
} from './v2';
import {
  applyJsonKeyedDeltas,
  ReplayDiffError,
} from './diff';

export type ReplayChannelMap = Record<string, JsonValue>;

export interface ResolvedReplayState {
  sourceTimeMs: number;
  keyframeId: string | null;
  frameTimeMs: number | null;
  channels: ReplayChannelMap;
  changeCount: number;
}

export type ReplaySeekErrorCode =
  | 'no-keyframes'
  | 'no-base-keyframe'
  | 'duplicate-keyframe'
  | 'invalid-keyframe'
  | 'invalid-change'
  | 'invalid-time'
  | 'invalid-channel';

export class ReplaySeekError extends Error {
  readonly code: ReplaySeekErrorCode;

  constructor(code: ReplaySeekErrorCode, message: string) {
    super(message);
    this.name = 'ReplaySeekError';
    this.code = code;
  }
}

export interface ReplaySeekIndexOptions {
  /** Number of resolved keyframe states retained. Defaults to 8. */
  frameCacheSize?: number;
}

export interface ReplaySeekIndex {
  readonly keyframes: readonly ReplayKeyframe[];
  readonly changes: readonly ReplayChange[];
  readonly firstFullTimeMs: number;
  readonly lastKeyframeTimeMs: number;
  resolve: (sourceTimeMs: number) => ResolvedReplayState;
}

const compareFrames = (a: ReplayKeyframe, b: ReplayKeyframe): number => {
  if (a.t !== b.t) return a.t - b.t;
  if (a.kind !== b.kind) return a.kind === 'full' ? -1 : 1;
  return a.id.localeCompare(b.id);
};

const validateFrames = (keyframes: readonly ReplayKeyframe[]): void => {
  if (keyframes.length === 0) {
    throw new ReplaySeekError('no-keyframes', 'A recording has no keyframes.');
  }

  const ids = new Set<string>();
  for (const frame of keyframes) {
    if (!Number.isFinite(frame.t) || frame.t < 0) {
      throw new ReplaySeekError('invalid-keyframe', `Keyframe "${frame.id}" has an invalid time.`);
    }
    if (typeof frame.id !== 'string' || frame.id.length === 0) {
      throw new ReplaySeekError('invalid-keyframe', 'A keyframe is missing an id.');
    }
    if (ids.has(frame.id)) {
      throw new ReplaySeekError('duplicate-keyframe', `Duplicate keyframe id "${frame.id}".`);
    }
    if (frame.kind !== 'full' && frame.kind !== 'patch') {
      throw new ReplaySeekError('invalid-keyframe', `Keyframe "${frame.id}" has an invalid kind.`);
    }
    if (frame.channels === null || typeof frame.channels !== 'object' || Array.isArray(frame.channels)) {
      throw new ReplaySeekError('invalid-keyframe', `Keyframe "${frame.id}" has invalid channels.`);
    }
    for (const entry of Object.values(frame.channels)) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ReplaySeekError('invalid-keyframe', `Keyframe "${frame.id}" has an invalid channel entry.`);
      }
    }
    ids.add(frame.id);
  }

  const first = [...keyframes].sort(compareFrames)[0];
  if (first?.kind !== 'full') {
    throw new ReplaySeekError('no-base-keyframe', 'Playback requires a full keyframe first.');
  }
};

const validateChanges = (changes: readonly ReplayChange[]): void => {
  for (const change of changes) {
    if (!Number.isFinite(change.t) || change.t < 0) {
      throw new ReplaySeekError('invalid-change', 'A replay change has an invalid time.');
    }
    if (!Number.isFinite(change.seq)) {
      throw new ReplaySeekError('invalid-change', 'A replay change has an invalid sequence number.');
    }
    if (typeof change.ch !== 'string' || change.ch.length === 0) {
      throw new ReplaySeekError('invalid-change', 'A replay change is missing a channel id.');
    }
    if (change.op === 'replace') {
      if (!Object.prototype.hasOwnProperty.call(change, 'v')) {
        throw new ReplaySeekError('invalid-change', `Replace change for "${change.ch}" has no value.`);
      }
    } else if (change.op === 'keyed') {
      if (!Array.isArray(change.deltas)) {
        throw new ReplaySeekError('invalid-change', `Keyed change for "${change.ch}" has no deltas.`);
      }
    } else {
      throw new ReplaySeekError('invalid-change', 'A replay change has an unknown operation.');
    }
  }
};

const readFrameChannels = (frame: ReplayKeyframe): ReplayChannelMap => {
  const channels: ReplayChannelMap = {};
  for (const [id, entry] of Object.entries(frame.channels)) {
    if (entry.v !== undefined) channels[id] = entry.v;
  }
  return channels;
};

export const createReplaySeekIndex = (
  keyframes: readonly ReplayKeyframe[],
  changes: readonly ReplayChange[],
  options?: ReplaySeekIndexOptions,
): ReplaySeekIndex => {
  validateFrames(keyframes);
  validateChanges(changes);

  const orderedFrames = [...keyframes].sort(compareFrames);
  const orderedChanges = changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => a.change.t - b.change.t || a.change.seq - b.change.seq || a.index - b.index)
    .map(entry => entry.change);

  const cacheSize = Math.max(1, Math.floor(options?.frameCacheSize ?? 8));
  const frameCache = new Map<number, ReplayChannelMap>();

  const touch = (index: number): ReplayChannelMap | undefined => {
    const cached = frameCache.get(index);
    if (cached === undefined) return undefined;
    frameCache.delete(index);
    frameCache.set(index, cached);
    return cached;
  };

  const store = (index: number, channels: ReplayChannelMap): void => {
    frameCache.delete(index);
    frameCache.set(index, channels);
    while (frameCache.size > cacheSize) {
      const oldest = frameCache.keys().next().value;
      if (oldest === undefined) break;
      frameCache.delete(oldest);
    }
  };

  const resolveFrameAt = (index: number): ReplayChannelMap => {
    const cached = touch(index);
    if (cached) return cached;

    let start = -1;
    let state: ReplayChannelMap = {};

    // Reuse the nearest earlier cached frame, if the LRU has one.
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const hit = touch(cursor);
      if (hit) {
        start = cursor;
        state = { ...hit };
        break;
      }
    }

    for (let cursor = start + 1; cursor <= index; cursor += 1) {
      const frame = orderedFrames[cursor];
      if (frame.kind === 'full') {
        state = readFrameChannels(frame);
      } else {
        for (const [id, entry] of Object.entries(frame.channels)) {
          if (entry.v !== undefined) state[id] = entry.v;
        }
      }
    }

    store(index, state);
    return state;
  };

  const lastFrameAtOrBefore = (t: number): number => {
    let low = 0;
    let high = orderedFrames.length - 1;
    let result = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (orderedFrames[middle].t <= t) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  };

  const firstChangeAfter = (t: number): number => {
    let low = 0;
    let high = orderedChanges.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (orderedChanges[middle].t <= t) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };

  const applyChange = (channels: ReplayChannelMap, change: ReplayChange): void => {
    if (change.op === 'replace') {
      channels[change.ch] = change.v;
      return;
    }

    try {
      channels[change.ch] = applyJsonKeyedDeltas(channels[change.ch], change.deltas);
    } catch (error) {
      if (error instanceof ReplayDiffError) {
        throw new ReplaySeekError(
          'invalid-channel',
          `Could not apply keyed change to "${change.ch}": ${error.message}`,
        );
      }
      throw error;
    }
  };

  const resolve = (sourceTimeMs: number): ResolvedReplayState => {
    if (!Number.isFinite(sourceTimeMs)) {
      throw new ReplaySeekError('invalid-time', 'Seek time must be a finite number.');
    }

    const t = Math.max(0, sourceTimeMs);
    const frameIndex = lastFrameAtOrBefore(t);
    if (frameIndex === -1) {
      return {
        sourceTimeMs: t,
        keyframeId: null,
        frameTimeMs: null,
        channels: {},
        changeCount: 0,
      };
    }

    const frame = orderedFrames[frameIndex];
    const channels = { ...resolveFrameAt(frameIndex) };
    let changeCount = 0;
    let changeIndex = firstChangeAfter(frame.t);

    while (changeIndex < orderedChanges.length) {
      const change = orderedChanges[changeIndex];
      if (change.t > t) break;
      applyChange(channels, change);
      changeCount += 1;
      changeIndex += 1;
    }

    return {
      sourceTimeMs: t,
      keyframeId: frame.id,
      frameTimeMs: frame.t,
      channels,
      changeCount,
    };
  };

  return {
    keyframes: orderedFrames,
    changes: orderedChanges,
    firstFullTimeMs: orderedFrames[0].t,
    lastKeyframeTimeMs: orderedFrames[orderedFrames.length - 1].t,
    resolve,
  };
};
