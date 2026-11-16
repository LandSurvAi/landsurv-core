/**
 * Effective-time composition.
 *
 * Original events are never rewritten. Trims, speed ranges, and chapter
 * retimes are composed into a set of segments that map source time to playback
 * time and back. Playback and export both call this module.
 */

import type { EditDocument, TrimRange } from './types';

export interface TimeSegment {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  rate: number;
}

export interface TimeMap {
  segments: TimeSegment[];
  sourceDurationMs: number;
  editedDurationMs: number;
  sourceToEffective: (sourceMs: number) => number;
  effectiveToSource: (effectiveMs: number) => number;
  isTrimmed: (sourceMs: number) => boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeTrims = (
  trims: TrimRange[] | undefined,
  sourceDurationMs: number,
): TrimRange[] => {
  const duration = Math.max(0, sourceDurationMs);
  const normalized = (trims ?? [])
    .map(trim => ({
      ...trim,
      startMs: clamp(Math.min(trim.startMs, trim.endMs), 0, duration),
      endMs: clamp(Math.max(trim.startMs, trim.endMs), 0, duration),
    }))
    .filter(trim => trim.endMs - trim.startMs > 0)
    .sort((a, b) => a.startMs - b.startMs);

  // Merge overlapping/adjacent trims so the segment builder never double-cuts.
  const merged: TrimRange[] = [];
  for (const trim of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && trim.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, trim.endMs);
    } else {
      merged.push({ ...trim });
    }
  }
  return merged;
};

const rateAt = (edits: EditDocument, sourceMs: number): number => {
  const rate = edits.speed
    .filter(range => sourceMs >= range.startMs && sourceMs < range.endMs)
    .reduce<number | null>((current, range) => {
      if (current === null) return range.rate;
      return range.rate;
    }, null);
  if (rate === null || !Number.isFinite(rate)) return 1;
  return clamp(rate, 0.25, 4);
};

/**
 * Build the effective timeline. Cutting happens first, then speed is applied
 * to the remaining intervals, then output times accumulate. Chapter retimes
 * are applied by the annotation layer, not here.
 */
export const buildTimeMap = (
  edits: EditDocument | undefined,
  sourceDurationMs: number,
): TimeMap => {
  const duration = Math.max(0, sourceDurationMs);
  const safeEdits: EditDocument = edits ?? {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    trims: [],
    speed: [],
    chapterRetimes: [],
  };
  const trims = normalizeTrims(safeEdits.trims, duration);

  // Collect every boundary where the trim set or the playback rate changes.
  const boundaries = new Set<number>([0, duration]);
  for (const trim of trims) {
    boundaries.add(trim.startMs);
    boundaries.add(trim.endMs);
  }
  for (const range of safeEdits.speed) {
    boundaries.add(clamp(range.startMs, 0, duration));
    boundaries.add(clamp(range.endMs, 0, duration));
  }
  const ordered = [...boundaries].sort((a, b) => a - b);

  const segments: TimeSegment[] = [];
  let outputStart = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (end - start <= 0) continue;
    if (trims.some(trim => start >= trim.startMs && end <= trim.endMs)) continue;

    const rate = rateAt(safeEdits, (start + end) / 2);
    const outputLength = (end - start) / rate;
    const previous = segments[segments.length - 1];
    if (previous && Math.abs(previous.rate - rate) < 1e-9 && Math.abs(previous.sourceEnd - start) < 1e-9) {
      previous.sourceEnd = end;
      outputStart += outputLength;
      continue;
    }
    segments.push({ sourceStart: start, sourceEnd: end, outputStart, rate });
    outputStart += outputLength;
  }

  const editedDurationMs = Math.max(0, outputStart);

  const sourceToEffective = (sourceMs: number): number => {
    const t = clamp(sourceMs, 0, duration);
    for (const segment of segments) {
      if (t >= segment.sourceStart && t <= segment.sourceEnd) {
        return segment.outputStart + (t - segment.sourceStart) / segment.rate;
      }
    }
    // Inside a trim: collapse to the end of the previous kept segment.
    let result = 0;
    for (const segment of segments) {
      if (segment.sourceEnd <= t) result = segment.outputStart + (segment.sourceEnd - segment.sourceStart) / segment.rate;
    }
    return result;
  };

  const effectiveToSource = (effectiveMs: number): number => {
    const t = clamp(effectiveMs, 0, editedDurationMs);
    if (segments.length === 0) return 0;
    for (const segment of segments) {
      const outputEnd = segment.outputStart + (segment.sourceEnd - segment.sourceStart) / segment.rate;
      if (t >= segment.outputStart && t <= outputEnd) {
        return segment.sourceStart + (t - segment.outputStart) * segment.rate;
      }
    }
    return segments[segments.length - 1].sourceEnd;
  };

  const isTrimmed = (sourceMs: number): boolean => {
    const t = clamp(sourceMs, 0, duration);
    return trims.some(trim => t > trim.startMs && t < trim.endMs);
  };

  return {
    segments,
    sourceDurationMs: duration,
    editedDurationMs,
    sourceToEffective,
    effectiveToSource,
    isTrimmed,
  };
};

/** Apply chapter retimes after source→effective mapping. */
export const effectiveChapterTime = (
  edits: EditDocument | undefined,
  timeMap: TimeMap,
  chapter: { id: string; atMs: number },
): number => {
  const retime = edits?.chapterRetimes.find(entry => entry.chapterId === chapter.id);
  if (retime) return clamp(retime.atMs, 0, timeMap.editedDurationMs);
  return clamp(timeMap.sourceToEffective(chapter.atMs), 0, timeMap.editedDurationMs);
};

export const formatReplayTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
