import type { BoundaryFile, DeedTractSummary } from '../types.ts';

/**
 * Boundary files that belong to the deed summary currently being viewed.
 *
 * Tract ids like "Main Parcel" and "Tract 1" repeat across documents, so the
 * id alone is not a safe join key after a second deed is uploaded. Files made
 * before `sourceDeedName` existed remain usable as a legacy fallback, but only
 * when no boundary file has been tagged for another deed.
 */
export function boundaryFilesForDeed(
  files: BoundaryFile[],
  deedFileName?: string,
): BoundaryFile[] {
  const key = deedFileName?.trim().toLowerCase();
  if (!key) return files;

  const taggedForThisDeed = files.filter(
    file => file.sourceDeedName?.trim().toLowerCase() === key,
  );
  if (taggedForThisDeed.length > 0) return taggedForThisDeed;

  const hasAnyTaggedDeed = files.some(file => Boolean(file.sourceDeedName?.trim()));
  if (hasAnyTaggedDeed) return [];

  // Legacy sessions created before boundary files remembered their source deed.
  return files;
}

export function findBoundaryFileForTract(
  files: BoundaryFile[],
  tract: DeedTractSummary,
  deedFileName?: string,
): BoundaryFile | undefined {
  const candidates = boundaryFilesForDeed(files, deedFileName);
  const bySource = candidates.find(file => file.sourceTractId === tract.tractId);
  if (bySource) return bySource;

  const tractKey = tract.tractId.toLowerCase();
  const byName = candidates.find(file => file.name.toLowerCase().includes(tractKey));
  if (byName) return byName;

  // Legacy/manual single-description deeds may not carry a sourceTractId.
  // Never let one tagged file claim every summary row.
  if (
    candidates.length === 1
    && !candidates[0].sourceTractId
    && candidates[0].calls.some(call => Boolean(call.bearing && call.distance))
  ) {
    return candidates[0];
  }

  return undefined;
}
