import type { CanvasHatch, SurveyLine } from '../types.ts';

/** True when a line/hatch belongs to the requested generated block. */
export function belongsToGeneration(
  entity: { contourGenId?: string; generationId?: string },
  generationId: string,
): boolean {
  return entity.contourGenId === generationId || entity.generationId === generationId;
}

/**
 * Collect every selectable member of a generated block. Contours use their
 * existing `contourGenId`; FEMA/soils outputs use the shared `generationId`.
 */
export function collectGenerationEntityIds(
  lines: SurveyLine[],
  hatches: CanvasHatch[],
  generationId: string,
): { lineIds: Set<string>; hatchIds: Set<string> } {
  const lineIds = new Set<string>();
  for (const line of lines) {
    if (line.hidden || !belongsToGeneration(line, generationId)) continue;
    lineIds.add(line.id || `${line.from}-${line.to}`);
  }

  const hatchIds = new Set<string>();
  for (const hatch of hatches) {
    if (hatch.hidden || hatch.generationId !== generationId) continue;
    hatchIds.add(hatch.id);
  }

  return { lineIds, hatchIds };
}
