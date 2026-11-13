import type { A2UIProjectLocationSnapshot, ProjectLocationCluster } from '../types.ts';

const STATE_NAMES_BY_ABBR: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalize a state name or USPS abbreviation for the zoning pickers. */
export function stateNameForZoning(raw?: string | null): string {
  const cleaned = cleanText(raw).replace(/\.$/, '');
  if (!cleaned) return '';
  const byAbbr = STATE_NAMES_BY_ABBR[cleaned.toUpperCase()];
  if (byAbbr) return byAbbr;
  return Object.values(STATE_NAMES_BY_ABBR).find(
    name => name.toLowerCase() === cleaned.toLowerCase(),
  ) ?? cleaned;
}

export interface ProjectZoningSeed {
  state: string;
  county: string;
  municipality: string;
  /** 1-based cluster index, useful for labeling the selected site. */
  clusterIndex?: number;
  label?: string;
  source: 'project-location';
}

/** The pieces of a Census/Nominatim result the zoning intake needs. */
export interface ProjectZoningGeocode {
  state?: string | null;
  county?: string | null;
  place?: string | null;
  label?: string | null;
}

/** Build an editable zoning seed from a reverse-geocoded jurisdiction. */
export function projectZoningSeedFromGeocode(
  geocode: ProjectZoningGeocode | null | undefined,
  label?: string | null,
): ProjectZoningSeed | null {
  if (!geocode) return null;
  const state = stateNameForZoning(geocode.state);
  const county = cleanText(geocode.county).replace(/\s+county$/i, '').trim();
  const municipality = cleanText(geocode.place).replace(/\s+(township|borough|city|town|village)$/i, '').trim();

  if (!state && !county && !municipality) return null;
  return {
    state,
    county,
    municipality,
    label:
      cleanText(label) ||
      cleanText(geocode.label) ||
      [municipality, county, state].filter(Boolean).join(', '),
    source: 'project-location',
  };
}

function clusterSeed(cluster: ProjectLocationCluster): ProjectZoningSeed | null {
  const jurisdiction = cluster.jurisdiction;
  if (!jurisdiction || jurisdiction.status === 'unavailable') return null;

  const seed = projectZoningSeedFromGeocode(jurisdiction, jurisdiction.label || cluster.label);
  if (!seed) return null;
  return { ...seed, clusterIndex: cluster.index };
}

/**
 * Pick the best resolved project cluster for zoning intake. A complete
 * state/county/municipality match wins; otherwise the first partially resolved
 * cluster is still useful because every field remains editable.
 */
export function projectLocationZoningSeed(
  snapshot: A2UIProjectLocationSnapshot | null | undefined,
): ProjectZoningSeed | null {
  const clusters = snapshot?.clusterSet?.clusters ?? [];
  const ranked = clusters
    .map((cluster, order) => {
      const seed = clusterSeed(cluster);
      if (!seed) return null;
      const completeness =
        (seed.state ? 1 : 0) +
        (seed.county ? 2 : 0) +
        (seed.municipality ? 4 : 0) +
        (cluster.jurisdiction?.source === 'census-geocoder' ? 1 : 0);
      return { seed, order, completeness };
    })
    .filter((entry): entry is { seed: ProjectZoningSeed; order: number; completeness: number } => !!entry)
    .sort((a, b) => b.completeness - a.completeness || a.order - b.order);

  return ranked[0]?.seed ?? null;
}

/**
 * Resolve a zoning seed from the project location. Point clusters are already
 * reverse-geocoded by the LSAI project-location service, so they win. When the
 * project only has a drawn inclusion boundary (AOI), reverse-geocode the
 * bbox centre so zoning research can still start from location alone.
 */
export async function resolveProjectLocationZoningSeed(
  snapshot: A2UIProjectLocationSnapshot | null | undefined,
  reverseGeocode: (latitude: number, longitude: number) => Promise<ProjectZoningGeocode | null>,
): Promise<ProjectZoningSeed | null> {
  const cluster = projectLocationZoningSeed(snapshot);
  if (cluster?.state && cluster.county && cluster.municipality) return cluster;

  const aoi = snapshot?.inclusionArea;
  const bbox = aoi?.bboxWgs84;
  if (!bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return cluster;

  const [west, south, east, north] = bbox;
  if (!(east > west) || !(north > south)) return cluster;

  const geocode = await reverseGeocode((south + north) / 2, (west + east) / 2);
  const aoiSeed = projectZoningSeedFromGeocode(
    geocode,
    aoi?.name ? `${aoi.name} (project AOI)` : 'Project AOI',
  );
  if (!cluster) return aoiSeed;
  if (!aoiSeed) return cluster;

  // A partially resolved cluster (often state-only from the project CRS) is
  // improved by the AOI geocode without losing the cluster provenance.
  return {
    state: cluster.state || aoiSeed.state,
    county: cluster.county || aoiSeed.county,
    municipality: cluster.municipality || aoiSeed.municipality,
    clusterIndex: cluster.clusterIndex,
    label: cluster.label || aoiSeed.label,
    source: 'project-location',
  };
}
