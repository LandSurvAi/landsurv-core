/**
 * projectLocationService — the shared "where is this project?" answer.
 *
 * Owned by the LSAI Agent, consumed by every other agent through CACP. It
 * takes the cluster set produced by utils/projectClusters (pure geometry) and
 * resolves each cluster's state, county, and municipality through the Census
 * geocoder (with Nominatim fallback and the project CRS as a last resort).
 *
 * Results are cached by rounded centroid so panning, re-rendering, and repeated
 * agent questions do not hammer the geocoder. Resolved jurisdictions are also
 * written to the Project Knowledge Base under `project.location`, which is what
 * lets an unrelated agent answer "what county is this in?" instantly.
 */

import { AgentType } from '../types.ts';
import type {
  ProjectLocationCluster,
  ProjectLocationClusterSet,
  ProjectLocationJurisdiction,
} from '../types.ts';
import { inferJurisdictionFromEpsg, reverseGeocodeJurisdiction } from '../utils/projectJurisdiction.ts';
import { describeProjectLocationClusters } from '../utils/projectClusters.ts';
import { knowledgeBase } from './KnowledgeBase.ts';

const CACHE_PRECISION = 3;
const jurisdictionCache = new Map<string, ProjectLocationJurisdiction>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lon.toFixed(CACHE_PRECISION)}`;
}

/** Clear cached lookups so an offline first attempt can be retried. */
export function clearProjectLocationCache(): void {
  jurisdictionCache.clear();
}

function projectionFallback(
  epsg: number | null | undefined,
  error?: string,
  detail?: string,
): ProjectLocationJurisdiction {
  const guess = inferJurisdictionFromEpsg(epsg);
  if (guess) {
    return {
      state: guess.state,
      label: `${guess.state} (project CRS) — county and municipality need a geocode`,
      source: 'projection',
      status: 'resolved',
      error,
    };
  }
  return {
    label: detail ?? 'Location unavailable — set the project projection (EPSG) and retry.',
    source: 'unavailable',
    status: 'unavailable',
    error,
  };
}

/**
 * Resolve every cluster's jurisdiction. Never throws for a single failed
 * cluster: a cluster that cannot be geocoded falls back to the state named by
 * the project CRS so the user still gets a usable answer.
 */
export async function resolveProjectClusterLocations(
  set: ProjectLocationClusterSet,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<ProjectLocationClusterSet> {
  const { signal, force = false } = options;

  const clusters = await Promise.all(set.clusters.map(async (cluster): Promise<ProjectLocationCluster> => {
    const center = cluster.estimate.centerWgs84;
    if (!center) {
      return {
        ...cluster,
        jurisdiction: projectionFallback(
          set.epsg,
          undefined,
          'Projection is set but latitude/longitude could not be derived for this cluster.',
        ),
      };
    }

    const key = cacheKey(center.latitude, center.longitude);
    const cached = force ? undefined : jurisdictionCache.get(key);
    if (cached) return { ...cluster, jurisdiction: cached };

    try {
      const resolved = await reverseGeocodeJurisdiction(center.latitude, center.longitude, {
        aoiSource: 'point-cluster',
        signal,
      });
      if (!resolved) {
        throw new Error('No US jurisdiction was returned for this cluster centre.');
      }
      const jurisdiction: ProjectLocationJurisdiction = {
        state: resolved.state,
        county: resolved.county,
        place: resolved.place,
        placeType: resolved.placeType,
        label: resolved.label,
        source: resolved.source,
        status: 'resolved',
      };
      jurisdictionCache.set(key, jurisdiction);
      return { ...cluster, jurisdiction };
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const jurisdiction = projectionFallback(set.epsg, message);
      jurisdictionCache.set(key, jurisdiction);
      return { ...cluster, jurisdiction };
    }
  }));

  return { ...set, clusters, createdAt: Date.now() };
}

/**
 * Publish the resolved locations to the Project Knowledge Base so any agent
 * can retrieve the answer with a plain `kb_query` instead of re-geocoding.
 */
export function recordProjectLocationFacts(set: ProjectLocationClusterSet): number {
  if (set.clusters.length === 0) return 0;

  const subject = 'project.location';
  const source = AgentType.LSVZ_AGENT;
  const facts: Array<Parameters<typeof knowledgeBase.recordFact>[0]> = [
    {
      category: 'project',
      subject,
      predicate: 'cluster.count',
      value: set.clusters.length,
      source,
      confidence: 1,
      context: 'Derived from uploaded project points by the LSAI Agent.',
    },
    {
      category: 'project',
      subject,
      predicate: 'summary',
      value: describeProjectLocationClusters(set),
      source,
      confidence: 0.9,
      context: `EPSG:${set.epsg ?? 'unset'} · linkage ${set.linkageDistance} ft`,
    },
  ];

  for (const cluster of set.clusters) {
    const jurisdiction = cluster.jurisdiction;
    const prefix = `cluster.${cluster.index}`;
    if (jurisdiction?.label) {
      facts.push({
        category: 'project',
        subject,
        predicate: `${prefix}.jurisdiction`,
        value: jurisdiction.label,
        source,
        confidence: jurisdiction.status === 'resolved' ? 0.9 : 0.4,
        context: `${cluster.pointCount} points · ${cluster.label}`,
      });
    }
    if (jurisdiction?.state) {
      facts.push({ category: 'project', subject, predicate: `${prefix}.state`, value: jurisdiction.state, source, confidence: 0.9 });
    }
    if (jurisdiction?.county) {
      facts.push({ category: 'project', subject, predicate: `${prefix}.county`, value: jurisdiction.county, source, confidence: 0.9 });
    }
    if (jurisdiction?.place) {
      facts.push({ category: 'project', subject, predicate: `${prefix}.municipality`, value: jurisdiction.place, source, confidence: 0.9 });
    }
    if (cluster.estimate.centerWgs84) {
      facts.push({
        category: 'project',
        subject,
        predicate: `${prefix}.centre`,
        value: `${cluster.estimate.centerWgs84.latitude.toFixed(6)}, ${cluster.estimate.centerWgs84.longitude.toFixed(6)}`,
        units: 'deg',
        source,
        confidence: 1,
      });
    }
    if (cluster.estimate.bboxWgs84) {
      facts.push({
        category: 'project',
        subject,
        predicate: `${prefix}.bbox`,
        value: cluster.estimate.bboxWgs84.map(value => value.toFixed(6)).join(','),
        units: 'deg',
        source,
        confidence: 1,
      });
    }
    if (cluster.estimate.areaAcres > 0) {
      facts.push({
        category: 'project',
        subject,
        predicate: `${prefix}.area`,
        value: Number(cluster.estimate.areaAcres.toFixed(3)),
        units: 'ac',
        source,
        confidence: 0.8,
      });
    }
  }

  return knowledgeBase.recordFacts(facts);
}
