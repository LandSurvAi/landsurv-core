import type { DeedSummary, DeedTractSummary } from '../types.ts';

/** One row returned by the deed parser in `descriptionsFound`. */
export interface DescriptionsFoundItem {
  tractId?: string;
  label?: string;
  tractName?: string;
  page?: number;
  sourcePage?: number;
  extracted?: boolean;
  reason?: string;
  snippet?: string;
  textSnippet?: string;
}

export interface BuildDescriptionsSummaryOptions {
  fileName?: string;
  baseSummary?: DeedSummary | null;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turn a parser result into the same DeedSummary shape used by the upload
 * summary card. The A2UI surface can then show selectable rows, pending/source
 * notes, text-editor links, and per-tract extract actions in one place.
 */
export function buildDeedSummaryFromDescriptions(
  items: DescriptionsFoundItem[],
  options: BuildDescriptionsSummaryOptions = {},
): DeedSummary {
  const base = options.baseSummary;
  const existing = base?.tracts ?? [];
  const seen = new Map<string, number>();

  const tracts: DeedTractSummary[] = items.map((item, index) => {
    const requestedId = clean(item.tractId) || clean(item.tractName) || clean(item.label) || `Tract ${index + 1}`;
    const occurrence = (seen.get(requestedId) ?? 0) + 1;
    seen.set(requestedId, occurrence);
    const tractId = occurrence === 1 ? requestedId : `${requestedId} (${occurrence})`;
    const prior = existing.find(tract => tract.tractId === requestedId) ?? existing[index];

    return {
      tractId,
      tractName: clean(item.label) || clean(item.tractName) || prior?.tractName,
      sourcePage: item.page ?? item.sourcePage ?? prior?.sourcePage,
      snippet: clean(item.snippet) || clean(item.textSnippet) || prior?.snippet,
      grantor: prior?.grantor,
      grantee: prior?.grantee,
      parcelId: prior?.parcelId,
      acreage: prior?.acreage,
      reason: clean(item.reason),
    };
  });

  return {
    fileName: clean(options.fileName) || base?.fileName || 'Uploaded deed',
    owner: base?.owner,
    grantor: base?.grantor,
    parcelId: base?.parcelId,
    book: base?.book,
    page: base?.page,
    tracts,
  };
}

/**
 * True when a deed parser response contains enough geometry for the boundary
 * pipeline to create a file. A `descriptionsFound` list on its own is not
 * geometry: the extraction attempt is over and any in-flight spinner must be
 * released so the description returns to a pending / needs-source state.
 */
export function hasParsedBoundaryGeometry(parsed: {
  points?: unknown;
  lines?: unknown;
  descriptionsFound?: unknown;
}): boolean {
  return (
    Array.isArray(parsed.points) && parsed.points.length > 0 &&
    Array.isArray(parsed.lines) && parsed.lines.length > 0
  );
}
