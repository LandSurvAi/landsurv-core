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

function clusterSeed(cluster: ProjectLocationCluster): ProjectZoningSeed | null {
  const jurisdiction = cluster.jurisdiction;
  if (!jurisdiction || jurisdiction.status === 'unavailable') return null;

  const state = stateNameForZoning(jurisdiction.state);
  const county = cleanText(jurisdiction.county).replace(/\s+county$/i, '').trim();
  const municipality = cleanText(jurisdiction.place).replace(/\s+(township|borough|city|town|village)$/i, '').trim();

  if (!state && !county && !municipality) return null;
  return {
    state,
    county,
    municipality,
    clusterIndex: cluster.index,
    label: jurisdiction.label || cluster.label,
    source: 'project-location',
  };
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
