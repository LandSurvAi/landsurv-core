/**
 * soilLimitationsService — state E&S-manual soil-limitation charts.
 *
 * Pennsylvania is the first supported state. The chart itself is Table E.1 from
 * the PA DEP Erosion and Sediment Pollution Control Program Manual
 * (386-2134-001). The Scout downloads and parses the manual on its first find,
 * then caches the parsed matrix; this module adds a browser cache in front of
 * that so a project only pays the PDF cost once.
 *
 * The report builder lives in `soilLimitationsReport.ts`; this module owns the
 * chart contract, soil-series matching, and the resolutions taken from the
 * E&S manual limitations/resolutions list.
 */

export type SoilLimitationKey =
  | 'cutbanks_cave'
  | 'corrosive_concrete_uncoated_steel'
  | 'droughty'
  | 'easily_erodible'
  | 'flooding'
  | 'seasonal_high_water_table'
  | 'hydric_inclusions'
  | 'low_strength_landslide_prone'
  | 'slow_percolation'
  | 'piping'
  | 'poor_topsoil_source'
  | 'frost_action'
  | 'shrink_swell'
  | 'potential_sinkhole'
  | 'ponding'
  | 'wetness';

export interface SoilLimitationColumn {
  key: SoilLimitationKey;
  label: string;
  shortLabel: string;
}

export interface SoilLimitationRecord {
  name: string;
  limitations: Partial<Record<SoilLimitationKey, string>>;
}

export interface SoilLimitationsChart {
  state: 'PA';
  source: string;
  manual: string;
  table: string;
  tableTitle: string;
  limitations: SoilLimitationColumn[];
  soils: Record<string, SoilLimitationRecord>;
  count: number;
  pages?: number[];
  notes?: string[];
  fetchedAt?: string | null;
  cached?: boolean;
  cacheSource?: string;
}

/**
 * Resolutions are selected per limitation from the E&S manual limitations /
 * resolutions list. Several limitations intentionally share one resolution;
 * the report builder de-duplicates the resulting list.
 */
export const SOIL_LIMITATION_RESOLUTIONS: Record<SoilLimitationKey, string> = {
  cutbanks_cave:
    'Proper care and safe practices (such as shoring) shall be utilized during deep excavations and trenching operations to avoid cave-ins.',
  corrosive_concrete_uncoated_steel:
    'Protect all underground pipes, conduits and tanks against corrosion and deterioration through use of coatings and sealants.',
  droughty:
    'Utilize appropriate measures to control dust during excavation, including possible wetting down during dry periods in areas of droughty soils.',
  easily_erodible:
    'Control erosion by utilizing measures depicted on this plan.',
  flooding:
    'Reduce complications during times of seasonal high water table and flooding through appropriate use of drainage facilities during construction.',
  seasonal_high_water_table:
    'If encountered in areas of pavement or structures, remove any soils demonstrating hydric properties and replace with stone or other suitable materials during construction.',
  hydric_inclusions:
    'If encountered in areas of pavement or structures, remove any soils demonstrating hydric properties and replace with stone or other suitable materials during construction.',
  low_strength_landslide_prone:
    "Resolve soil strength issues and landslide concerns by testing in areas where structural characteristics are required, replacing or reinforcing existing soils in accordance with the engineer's recommendations, and utilizing matting/reinforcement in areas of steep slopes at final grading.",
  slow_percolation:
    'Conduct infiltration testing in any areas relying on infiltration.',
  piping:
    'Remove any soils resulting in piping under pavement and other structural areas and replace with stone or other suitable soils during construction.',
  poor_topsoil_source:
    'Consider soils testing in areas of topsoil return to identify appropriate soil amendments.',
  frost_action:
    'Address frost prevention measures and shrink/swell limitations through architectural and structural design and pavement specifications.',
  shrink_swell:
    'Address frost prevention measures and shrink/swell limitations through architectural and structural design and pavement specifications.',
  potential_sinkhole:
    'Consider geological testing and/or eliminate stormwater facilities and other structural improvements having potential adverse impacts in areas of potential sinkhole activity.',
  ponding:
    'Reduce complications of ponding and wetness through appropriate use of drainage facilities during construction.',
  wetness:
    'Reduce complications of ponding and wetness through appropriate use of drainage facilities during construction.',
};

const CHART_STORAGE_KEY = 'landsurv:soil-limitations:PA:v1';
const SCOUT_TOOL_URL = '/api/scout/tools/fetch_soil_limitations';
const BUNDLED_CHART_URL = '/data/pa-es-soil-limitations.json';

/** Canonical lookup key; mirrors `normalize_soil_name` in the Scout parser. */
export function normalizeSoilName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function limitationValueLabel(key: SoilLimitationKey, value: string | undefined): string {
  if (key === 'corrosive_concrete_uncoated_steel') {
    switch ((value || 'X').toUpperCase()) {
      case 'C':
        return 'Concrete only';
      case 'S':
        return 'Uncoated steel only';
      case 'C/S':
        return 'Concrete and uncoated steel';
      default:
        return 'Concrete and uncoated steel';
    }
  }
  return value === 'X' || !value ? '' : value;
}

function chartFromUnknown(value: unknown): SoilLimitationsChart | null {
  if (!value || typeof value !== 'object') return null;
  const chart = value as Partial<SoilLimitationsChart>;
  if (
    chart.state !== 'PA' ||
    typeof chart.count !== 'number' ||
    chart.count < 100 ||
    !chart.soils ||
    typeof chart.soils !== 'object' ||
    !Array.isArray(chart.limitations)
  ) {
    return null;
  }
  return chart as SoilLimitationsChart;
}

function readBrowserCache(): SoilLimitationsChart | null {
  try {
    const raw = window.localStorage.getItem(CHART_STORAGE_KEY);
    if (!raw) return null;
    const parsed = chartFromUnknown(JSON.parse(raw));
    return parsed ? { ...parsed, cached: true, cacheSource: 'localStorage' } : null;
  } catch {
    return null;
  }
}

function writeBrowserCache(chart: SoilLimitationsChart): void {
  try {
    window.localStorage.setItem(CHART_STORAGE_KEY, JSON.stringify({
      ...chart,
      cached: true,
      cacheSource: 'localStorage',
    }));
  } catch {
    /* a full/disabled localStorage must not break the report */
  }
}

export interface FetchSoilLimitationsOptions {
  state?: 'PA';
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

/**
 * Return the PA E&S limitations chart. Resolution order:
 *   1. browser cache (from an earlier first find)
 *   2. Scout live fetch (downloads/parses/caches on the server on first use)
 *   3. bundled copy of the parsed Table E.1 (offline / Scout-unconfigured)
 */
export async function fetchSoilLimitationsChart(
  options: FetchSoilLimitationsOptions = {},
): Promise<SoilLimitationsChart> {
  const state = options.state ?? 'PA';

  if (!options.forceRefresh) {
    const cached = readBrowserCache();
    if (cached) return cached;
  }

  let scoutError: unknown = null;
  try {
    const response = await fetch(SCOUT_TOOL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scout-session': `soils-${Date.now().toString(36)}`,
      },
      body: JSON.stringify({
        state,
        force_refresh: options.forceRefresh === true,
      }),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Scout HTTP ${response.status}`);
    }
    const body = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = body.content?.find(part => part.type === 'text')?.text ?? '';
    if (!text || text.startsWith('ERROR:')) {
      throw new Error(text || 'Scout returned no limitations chart.');
    }
    const chart = chartFromUnknown(JSON.parse(text));
    if (!chart) throw new Error('Scout returned a malformed limitations chart.');
    writeBrowserCache(chart);
    return chart;
  } catch (error) {
    scoutError = error;
  }

  try {
    const response = await fetch(BUNDLED_CHART_URL, { signal: options.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const chart = chartFromUnknown(await response.json());
    if (!chart) throw new Error('bundled chart is malformed');
    writeBrowserCache(chart);
    return {
      ...chart,
      cached: true,
      cacheSource: 'bundled',
      notes: [
        ...(chart.notes ?? []),
        scoutError instanceof Error
          ? `Scout chart unavailable (${scoutError.message}); using the bundled Table E.1 extract.`
          : 'Using the bundled Table E.1 extract.',
      ],
    };
  } catch (bundledError) {
    const scoutMessage = scoutError instanceof Error ? scoutError.message : String(scoutError);
    throw new Error(
      `Could not obtain the PA E&S limitations chart. Scout: ${scoutMessage}. ` +
      `Bundled chart: ${bundledError instanceof Error ? bundledError.message : String(bundledError)}.`,
    );
  }
}

export interface SoilSeriesMatch {
  record: SoilLimitationRecord;
  matchedName: string;
  /** How the record was found; useful for report transparency. */
  method: 'component' | 'map-unit' | 'partial' | 'none';
}

/**
 * Match an SSURGO map unit to a Table E.1 series row. SSURGO's dominant
 * component name is the strongest match; fall back to the map-unit name's
 * pre-comma portion, then to progressively shorter word prefixes.
 */
export function matchSoilSeries(
  chart: SoilLimitationsChart,
  mapUnitName: string,
  componentName?: string,
): SoilSeriesMatch {
  const normalizedChart = chart.soils;
  const direct = (value: string | undefined, method: SoilSeriesMatch['method']): SoilSeriesMatch | null => {
    const normalized = normalizeSoilName(value || '');
    if (!normalized) return null;
    const record = normalizedChart[normalized];
    return record ? { record, matchedName: record.name, method } : null;
  };

  const byComponent = direct(componentName, 'component');
  if (byComponent) return byComponent;

  const baseName = (mapUnitName || '').split(',')[0].trim();
  const byMapUnit = direct(baseName, 'map-unit');
  if (byMapUnit) return byMapUnit;

  const words = normalizeSoilName(baseName).split(' ').filter(Boolean);
  for (let length = words.length - 1; length >= 1; length--) {
    const candidate = words.slice(0, length).join(' ');
    const record = normalizedChart[candidate];
    if (record) {
      return { record, matchedName: record.name, method: 'partial' };
    }
  }

  // Last resort: a chart name embedded in the map-unit name, longest first.
  const padded = ` ${normalizeSoilName(mapUnitName)} `;
  const embedded = Object.keys(normalizedChart)
    .filter(key => key.includes(' ') && padded.includes(` ${key} `))
    .sort((a, b) => b.length - a.length)[0];
  if (embedded) {
    const record = normalizedChart[embedded];
    return { record, matchedName: record.name, method: 'partial' };
  }

  return {
    record: {
      name: componentName?.trim() || baseName || mapUnitName || 'Unknown soil',
      limitations: {},
    },
    matchedName: '',
    method: 'none',
  };
}
