import type { ProjectionSetting, ProjectLocationClusterSet } from '../types.ts';
import { detectProjectionForCoordinates, type DetectedProjection } from './autoProjection.ts';
import { projectionStates, projectionZones } from './projections.ts';

export interface ProjectionChoice {
  projection: ProjectionSetting;
  label: string;
}

export interface ProjectionRecommendation extends DetectedProjection {
  clusterIndex: number;
  jurisdictionLabel: string | null;
}

/** Map a built-in State Plane EPSG code back to the Settings projection shape. */
export function projectionSettingForEpsg(epsg: number): ProjectionChoice | null {
  if (!Number.isFinite(epsg)) return null;
  for (const [code, zones] of Object.entries(projectionZones)) {
    const zone = zones.find(candidate => candidate.epsg === epsg);
    if (!zone) continue;
    const state = projectionStates.find(candidate => candidate.code === code)?.name ?? code;
    return {
      projection: { state, zoneName: zone.name, epsg },
      label: `${state} · ${zone.name} (EPSG:${epsg})`,
    };
  }
  return null;
}

/** Resolve a user phrase like "Ohio South" or "PA North" to a built-in zone. */
export function projectionFromText(text: string): ProjectionChoice | null {
  const lower = String(text ?? '').toLowerCase();
  if (!lower.trim()) return null;

  const explicitEpsg = /\bepsg\s*:?\s*([2-9]\d{3,4})\b/i.exec(text);
  if (explicitEpsg) {
    const found = projectionSettingForEpsg(Number(explicitEpsg[1]));
    if (found) return found;
  }

  for (const state of projectionStates) {
    const stateMentioned =
      lower.includes(state.name.toLowerCase()) ||
      new RegExp(`\\b${state.code.toLowerCase()}\\b`).test(lower);
    if (!stateMentioned) continue;

    const zones = projectionZones[state.code] ?? [];
    const zone = zones.find(candidate => lower.includes(candidate.name.toLowerCase()));
    if (zone) {
      return {
        projection: { state: state.name, zoneName: zone.name, epsg: zone.epsg },
        label: `${state.name} · ${zone.name} (EPSG:${zone.epsg})`,
      };
    }
    if (zones.length === 1) {
      return {
        projection: { state: state.name, zoneName: zones[0].name, epsg: zones[0].epsg },
        label: `${state.name} · ${zones[0].name} (EPSG:${zones[0].epsg})`,
      };
    }
  }
  return null;
}

/**
 * Pick the State Plane zone that best fits the first georeferenced point
 * cluster. Uses the cluster's resolved state when available, otherwise lets
 * the detector reverse-geocode the cluster centre.
 */
export async function recommendProjectionForClusters(
  set: ProjectLocationClusterSet,
): Promise<ProjectionRecommendation | null> {
  for (const cluster of set.clusters) {
    const centre = cluster.estimate.centerWgs84;
    if (!centre) continue;
    try {
      const detected = await detectProjectionForCoordinates(
        centre.latitude,
        centre.longitude,
        { stateName: cluster.jurisdiction?.state ?? null },
      );
      return {
        ...detected,
        clusterIndex: cluster.index,
        jurisdictionLabel: cluster.jurisdiction?.label ?? null,
      };
    } catch {
      // Try the next cluster; a cluster without a usable centre should not
      // block the recommendation for the rest of the project.
    }
  }
  return null;
}
