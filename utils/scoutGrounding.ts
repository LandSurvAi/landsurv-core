/**
 * scoutGrounding — "ground Scout in reality."
 *
 * The project cluster's jurisdiction is a hint, never the authority. Scout
 * grounds every run to the AOI itself:
 *
 *   1. reverse-geocode the AOI centre and four corners (Census first,
 *      OpenStreetMap fallback);
 *   2. compare the result with the project hint and any cached choice;
 *   3. if the footprint touches two states, ask once and cache the answer;
 *   4. reject candidates that belong to another jurisdiction unless their
 *      geometry actually clips the AOI;
 *   5. exempt national/federal layers from the state gate, but never from the
 *      AOI feature-count check.
 *
 * The cache is intentionally small and localStorage-backed. It is keyed by a
 * rounded AOI so panning by a few feet does not trigger another geocode, while
 * a project that moves to another county (or state) is resolved again.
 */

import type {
  ScoutJurisdictionResolution,
  ScoutRejectReason,
} from '../types.ts';
import { reverseGeocodeUs } from './reverseGeocode.ts';

export const SCOUT_GROUNDING_VERSION = 1;
export const SCOUT_GROUNDING_CACHE_KEY = 'scout.grounding.v1';

const STATE_ABBRS: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY',
};

const ABBR_STATES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBRS).map(([name, abbr]) => [abbr, name]),
);

export function stateAbbrForName(state: string | undefined | null): string | undefined {
  const raw = String(state ?? '').trim();
  if (!raw) return undefined;
  if (STATE_ABBRS[raw]) return STATE_ABBRS[raw];
  if (ABBR_STATES[raw.toUpperCase()]) return raw.toUpperCase();
  const match = Object.keys(STATE_ABBRS).find(
    name => name.toLowerCase() === raw.toLowerCase(),
  );
  return match ? STATE_ABBRS[match] : undefined;
}

export function stateNameForAbbr(abbr: string | undefined | null): string | undefined {
  return ABBR_STATES[String(abbr ?? '').trim().toUpperCase()];
}

export interface ScoutGroundingCandidate {
  label: string;
  url: string;
  provider: string;
  state?: string;
  county?: string;
  extent?: [number, number, number, number];
}

export interface ScoutGroundingDecision {
  decision: 'accepted' | 'accepted_federal' | 'accepted_neighbor_clip' | 'accepted_ranked' | 'rejected';
  reason?: ScoutRejectReason;
  message: string;
}

export interface ScoutJurisdictionOption {
  state: string;
  stateAbbr?: string;
  county?: string;
  label: string;
  reason: string;
}

export interface ResolveScoutJurisdictionResult {
  resolution: ScoutJurisdictionResolution;
  ambiguous: boolean;
  options: ScoutJurisdictionOption[];
}

export interface ResolveScoutJurisdictionOptions {
  state?: string;
  county?: string;
  explicit?: { state: string; county?: string };
  projectKey?: string;
  signal?: AbortSignal;
  /** Tests and offline callers can skip the network and use the hint. */
  skipNetwork?: boolean;
}

interface GroundingCacheEntry {
  resolution: ScoutJurisdictionResolution;
  aoiKey: string;
}

type GroundingCache = Record<string, GroundingCacheEntry>;

function readCache(): GroundingCache {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SCOUT_GROUNDING_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as GroundingCache : {};
  } catch {
    return {};
  }
}

function writeCache(cache: GroundingCache): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCOUT_GROUNDING_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    /* private mode / quota — grounding still works for this run */
  }
}

export function clearScoutGroundingCache(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SCOUT_GROUNDING_CACHE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function bboxCentre(bbox: [number, number, number, number]): { latitude: number; longitude: number } {
  return {
    latitude: (bbox[1] + bbox[3]) / 2,
    longitude: (bbox[0] + bbox[2]) / 2,
  };
}

function aoiKey(bbox: [number, number, number, number], projectKey?: string): string {
  const centre = bboxCentre(bbox);
  return `${projectKey ?? 'project'}|${centre.latitude.toFixed(3)},${centre.longitude.toFixed(3)}`;
}

function samplePoints(bbox: [number, number, number, number]): Array<{ latitude: number; longitude: number }> {
  const [west, south, east, north] = bbox;
  const insetX = (east - west) * 0.12;
  const insetY = (north - south) * 0.12;
  return [
    bboxCentre(bbox),
    { latitude: south + insetY, longitude: west + insetX },
    { latitude: north - insetY, longitude: west + insetX },
    { latitude: south + insetY, longitude: east - insetX },
    { latitude: north - insetY, longitude: east - insetX },
  ];
}

function canonicalStateName(value: string | undefined | null): string | undefined {
  const abbr = stateAbbrForName(value);
  return abbr ? ABBR_STATES[abbr] : undefined;
}

function makeResolution(
  state: string,
  county: string | undefined,
  source: ScoutJurisdictionResolution['source'],
  confidence: ScoutJurisdictionResolution['confidence'],
  bbox: [number, number, number, number],
  sampledStates?: string[],
): ScoutJurisdictionResolution {
  const centre = bboxCentre(bbox);
  const canonical = canonicalStateName(state) ?? state;
  return {
    state: canonical,
    stateAbbr: stateAbbrForName(canonical),
    county: county?.replace(/\s+county$/i, '').trim() || undefined,
    source,
    confidence,
    aoiCentre: centre,
    sampledStates,
    decidedAt: Date.now(),
  };
}

/**
 * Resolve the AOI's jurisdiction. Never throws: a geocoder outage falls back
 * to the project hint with low confidence so the panel can say so.
 */
export async function resolveScoutJurisdiction(
  bbox: [number, number, number, number],
  options: ResolveScoutJurisdictionOptions = {},
): Promise<ResolveScoutJurisdictionResult> {
  if (!bbox.every(Number.isFinite)) {
    const fallback = makeResolution(
      options.state ?? 'Unknown',
      options.county,
      'cluster-fallback',
      'low',
      bbox,
    );
    return { resolution: fallback, ambiguous: false, options: [] };
  }

  const key = aoiKey(bbox, options.projectKey);

  if (options.explicit?.state) {
    const resolution = makeResolution(
      options.explicit.state,
      options.explicit.county ?? options.county,
      'user',
      'high',
      bbox,
    );
    const cache = readCache();
    cache[key] = { resolution, aoiKey: key };
    writeCache(cache);
    return { resolution, ambiguous: false, options: [] };
  }

  const cached = readCache()[key];
  if (cached?.resolution?.state) {
    return { resolution: cached.resolution, ambiguous: false, options: [] };
  }

  const samples = samplePoints(bbox);
  const outcomes: Array<{ point: { latitude: number; longitude: number }; state: string; county?: string }> = [];

  if (!options.skipNetwork) {
    const settled = await Promise.allSettled(
      samples.map(point => reverseGeocodeUs(point.latitude, point.longitude, options.signal)),
    );
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const state = canonicalStateName(result.value.state);
      if (!state) return;
      outcomes.push({
        point: samples[index],
        state,
        county: result.value.county,
      });
    });
  }

  const centre = bboxCentre(bbox);
  const centreOutcome = outcomes[0] ?? outcomes.find(outcome =>
    Math.abs(outcome.point.latitude - centre.latitude) < 1e-6
    && Math.abs(outcome.point.longitude - centre.longitude) < 1e-6,
  );
  const distinctStates = [...new Set(outcomes.map(outcome => outcome.state))];

  if (centreOutcome) {
    const resolution = makeResolution(
      centreOutcome.state,
      centreOutcome.county,
      'census',
      distinctStates.length > 1 ? 'medium' : 'high',
      bbox,
      distinctStates,
    );
    const cache = readCache();
    cache[key] = { resolution, aoiKey: key };
    writeCache(cache);

    const optionsByState: ScoutJurisdictionOption[] = distinctStates.map(state => {
      const outcome = outcomes.find(item => item.state === state);
      return {
        state,
        stateAbbr: stateAbbrForName(state),
        county: outcome?.county,
        label: [outcome?.county ? `${outcome.county} County` : null, state].filter(Boolean).join(', '),
        reason: state === centreOutcome.state
          ? 'The AOI centre is in this state.'
          : 'The AOI corner sample is in this state.',
      };
    });

    return {
      resolution,
      ambiguous: distinctStates.length > 1,
      options: optionsByState,
    };
  }

  const fallbackState = canonicalStateName(options.state);
  if (fallbackState) {
    const resolution = makeResolution(
      fallbackState,
      options.county,
      'cluster-fallback',
      'low',
      bbox,
    );
    const cache = readCache();
    cache[key] = { resolution, aoiKey: key };
    writeCache(cache);
    return { resolution, ambiguous: false, options: [] };
  }

  const unknown = makeResolution('Unknown', options.county, 'cluster-fallback', 'low', bbox);
  return { resolution: unknown, ambiguous: false, options: [] };
}

export function isFederalGisSource(provider: string, label: string): boolean {
  if (provider === 'federal') return true;
  return /\b(?:usgs|fema|nfhl|ssurgo|3dep|national map|national hydrography|watershed boundary dataset|wbd)\b/i.test(label);
}

export function isNationalExtent(extent: [number, number, number, number] | undefined): boolean {
  if (!extent) return false;
  return Math.abs(extent[2] - extent[0]) > 20 || Math.abs(extent[3] - extent[1]) > 15;
}

export function extentsIntersect(
  a: [number, number, number, number],
  b: [number, number, number, number],
  pad = 0.001,
): boolean {
  return !(a[2] < b[0] - pad || a[0] > b[2] + pad || a[3] < b[1] - pad || a[1] > b[3] + pad);
}

function candidateStateAbbr(candidate: ScoutGroundingCandidate): string | undefined {
  const explicit = stateAbbrForName(candidate.state);
  if (explicit) return explicit;
  const text = `${candidate.label} ${candidate.url}`;
  const abbrMatch = text.match(/\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  if (abbrMatch) return stateAbbrForName(abbrMatch[0]);
  for (const [name, abbr] of Object.entries(STATE_ABBRS)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return abbr;
    }
  }
  return undefined;
}

/**
 * Decide whether a candidate belongs in this run. This is cheap and pure; the
 * caller still verifies AOI feature counts before showing a layer.
 */
export function candidateGroundingDecision(
  candidate: ScoutGroundingCandidate,
  resolution: ScoutJurisdictionResolution,
  bbox: [number, number, number, number],
): ScoutGroundingDecision {
  const resolvedAbbr = resolution.stateAbbr ?? stateAbbrForName(resolution.state);
  const candidateAbbr = candidateStateAbbr(candidate);
  const intersects = candidate.extent ? extentsIntersect(candidate.extent, bbox) : false;

  if (isFederalGisSource(candidate.provider, candidate.label)) {
    return {
      decision: 'accepted_federal',
      message: 'Federal/national layer — admitted on AOI coverage.',
    };
  }

  if (isNationalExtent(candidate.extent)) {
    return {
      decision: 'rejected',
      reason: 'national_extent',
      message: 'National-extent service cannot carry local identifiers at parcel scale.',
    };
  }

  if (candidateAbbr) {
    if (candidateAbbr === resolvedAbbr) {
      const countyKey = String(candidate.county ?? '').replace(/\s+county$/i, '').trim().toLowerCase();
      const resolvedCounty = String(resolution.county ?? '').trim().toLowerCase();
      if (countyKey && resolvedCounty && countyKey !== resolvedCounty) {
        return {
          decision: 'accepted_ranked',
          message: `Same state, different county (${candidate.county}); ranked below local sources.`,
        };
      }
      return {
        decision: 'accepted',
        message: 'Candidate is inside the grounded jurisdiction.',
      };
    }
    if (intersects) {
      return {
        decision: 'accepted_neighbor_clip',
        message: `Neighbor state (${ABBR_STATES[candidateAbbr] ?? candidateAbbr}) admitted because the layer clips the AOI.`,
      };
    }
    return {
      decision: 'rejected',
      reason: 'out_of_state',
      message: `Outside ${resolution.state}; the layer does not intersect this footprint.`,
    };
  }

  if (candidate.extent && !intersects) {
    return {
      decision: 'rejected',
      reason: 'no_extent_overlap',
      message: 'Service extent does not reach this footprint.',
    };
  }

  return {
    decision: 'accepted_neighbor_clip',
    message: 'Jurisdiction unconfirmed — AOI feature coverage decides.',
  };
}

/** Human-readable grounding summary for the panel and narration. */
export function describeScoutJurisdiction(resolution: ScoutJurisdictionResolution): string {
  const place = resolution.county
    ? `${resolution.county} County, ${resolution.state}`
    : resolution.state;
  return `${place} (${resolution.source.replace('-', ' ')} · ${resolution.confidence} confidence)`;
}
