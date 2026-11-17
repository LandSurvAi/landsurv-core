/**
 * Region detection and regional presets for the Gulf-first rollout.
 *
 * Detection is advisory: it never rewrites an existing project. Callers must
 * use `regionPresetForNewProject` (or check `shouldOfferRegionPreset`) before
 * applying metric units or a local CRS.
 */
import type { LinearUnit } from './linearUnits.ts';

export type RegionCode = 'AE' | 'SA' | 'US' | 'GLOBAL';

export type RegionDetectionSource = 'explicit' | 'timezone' | 'locale' | 'default';

export type BillingCurrency = 'AED' | 'USD';

export interface RegionCrsOption {
  epsg: number;
  name: string;
  /** Short label shown in onboarding. */
  label: string;
  /** proj4 string when the CRS is bundled client-side. */
  proj4?: string | null;
}

export interface RegionConfig {
  code: RegionCode;
  name: string;
  nameAr: string;
  currency: BillingCurrency;
  /** BCP-47 locale used for English-language UI formatting. */
  locale: string;
  /** VAT rate as a decimal (0.05 = 5%). */
  vatRate: number;
  /** Gulf consumer prices are advertised VAT-inclusive. */
  vatInclusive: boolean;
  linearUnit: LinearUnit;
  timeZones: readonly string[];
  localePrefixes: readonly string[];
  /** Survey authority responsible for the national grid, when known. */
  crsAuthority: string | null;
  crsOptions: readonly RegionCrsOption[];
}

export const AED_PER_USD = 3.6725;

/** Dubai Local Transverse Mercator (Dubai Municipality Survey Department). */
export const DUBAI_LOCAL_TM_PROJ4 =
  '+proj=tmerc +lat_0=0 +lon_0=55.3333333333333 +k=1 +x_0=500000 +y_0=0 +datum=WGS84 +units=m +no_defs';

export const REGIONS: Record<RegionCode, RegionConfig> = {
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    nameAr: 'الإمارات العربية المتحدة',
    currency: 'AED',
    locale: 'en-AE',
    vatRate: 0.05,
    vatInclusive: true,
    linearUnit: 'meter',
    timeZones: ['Asia/Dubai', 'Asia/Muscat'],
    localePrefixes: ['ar-AE', 'en-AE'],
    crsAuthority: 'Dubai Municipality Survey Department (geodesy@dm.gov.ae)',
    crsOptions: [
      {
        epsg: 3997,
        name: 'Dubai Local TM',
        label: 'Dubai — Local TM (EPSG:3997)',
        proj4: DUBAI_LOCAL_TM_PROJ4,
      },
      {
        epsg: 32640,
        name: 'WGS 84 / UTM zone 40N',
        label: 'UAE — UTM 40N (EPSG:32640)',
      },
      {
        epsg: 32639,
        name: 'WGS 84 / UTM zone 39N',
        label: 'Abu Dhabi / west — UTM 39N (EPSG:32639)',
      },
    ],
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    nameAr: 'المملكة العربية السعودية',
    currency: 'USD',
    locale: 'en-US',
    vatRate: 0.15,
    vatInclusive: true,
    linearUnit: 'meter',
    timeZones: ['Asia/Riyadh'],
    localePrefixes: ['ar-SA', 'en-SA'],
    crsAuthority: 'General Authority for Survey and Geospatial Information (GEOSA)',
    crsOptions: [
      {
        epsg: 32639,
        name: 'WGS 84 / UTM zone 39N',
        label: 'Saudi Arabia — UTM 39N (EPSG:32639)',
      },
      {
        epsg: 32640,
        name: 'WGS 84 / UTM zone 40N',
        label: 'Saudi Arabia — UTM 40N (EPSG:32640)',
      },
    ],
  },
  US: {
    code: 'US',
    name: 'United States',
    nameAr: 'الولايات المتحدة',
    currency: 'USD',
    locale: 'en-US',
    vatRate: 0,
    vatInclusive: false,
    linearUnit: 'usSurveyFoot',
    timeZones: [],
    localePrefixes: ['en-US'],
    crsAuthority: null,
    crsOptions: [],
  },
  GLOBAL: {
    code: 'GLOBAL',
    name: 'International',
    nameAr: 'دولي',
    currency: 'USD',
    locale: 'en-US',
    vatRate: 0,
    vatInclusive: false,
    linearUnit: 'meter',
    timeZones: [],
    localePrefixes: [],
    crsAuthority: null,
    crsOptions: [],
  },
};

export interface RegionDetection {
  region: RegionCode;
  source: RegionDetectionSource;
}

/** Accept `AE`, `ae`, `ar-AE`, `United Arab Emirates`, etc. */
export function normalizeRegionCode(value: unknown): RegionCode | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper === 'AE' || upper === 'SA' || upper === 'US' || upper === 'GLOBAL') {
    return upper as RegionCode;
  }

  const normalized = raw.toLowerCase().replace(/_/g, '-');
  if (normalized === 'uae' || normalized === 'united arab emirates' || normalized === 'dubai') return 'AE';
  if (normalized === 'ksa' || normalized === 'saudi' || normalized === 'saudi arabia' || normalized === 'riyadh') return 'SA';
  if (normalized === 'usa' || normalized === 'united states' || normalized === 'america') return 'US';
  if (normalized === 'international' || normalized === 'world' || normalized === 'worldwide') return 'GLOBAL';

  if (normalized.endsWith('-ae')) return 'AE';
  if (normalized.endsWith('-sa')) return 'SA';
  if (normalized.endsWith('-us')) return 'US';
  return null;
}

export function regionFromTimeZone(timeZone: string | null | undefined): RegionCode | null {
  if (!timeZone) return null;
  const normalized = timeZone.trim();
  for (const config of Object.values(REGIONS)) {
    if (config.timeZones.includes(normalized)) return config.code;
  }
  if (/^America\//.test(normalized)) return 'US';
  return null;
}

export function regionFromLocale(locale: string | null | undefined): RegionCode | null {
  if (!locale) return null;
  const normalized = locale.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;
  for (const config of Object.values(REGIONS)) {
    if (config.localePrefixes.some(prefix => normalized === prefix.toLowerCase() || normalized.startsWith(`${prefix.toLowerCase()}-`))) {
      return config.code;
    }
  }
  return null;
}

/**
 * Resolve the visitor's region. Precedence:
 *   1. explicit (stored choice / `?region=`)
 *   2. browser time zone
 *   3. browser locale
 *   4. US default (the existing product default)
 */
export function detectRegion(input: {
  explicit?: unknown;
  timeZone?: string | null;
  locale?: string | null;
} = {}): RegionDetection {
  const explicit = normalizeRegionCode(input.explicit);
  if (explicit) return { region: explicit, source: 'explicit' };

  const timeZone = input.timeZone !== undefined
    ? input.timeZone
    : (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
  const fromTimeZone = regionFromTimeZone(timeZone);
  if (fromTimeZone) return { region: fromTimeZone, source: 'timezone' };

  const locale = input.locale !== undefined
    ? input.locale
    : (typeof navigator !== 'undefined' ? navigator.language : null);
  const fromLocale = regionFromLocale(locale);
  if (fromLocale) return { region: fromLocale, source: 'locale' };

  return { region: 'US', source: 'default' };
}

export function getRegionConfig(region: RegionCode): RegionConfig {
  return REGIONS[region] || REGIONS.GLOBAL;
}

export interface RegionPreset {
  region: RegionCode;
  linearUnits: LinearUnit;
  currency: BillingCurrency;
  vatRate: number;
  vatInclusive: boolean;
  crsOptions: readonly RegionCrsOption[];
}

/**
 * A new-project preset. Returns null for US/global visitors and for any
 * project that already has a projection — existing work is never rewritten.
 */
export function regionPresetForNewProject(
  region: RegionCode,
  input: {
    hasExistingProject?: boolean;
    currentProjectionEpsg?: number | null;
  } = {},
): RegionPreset | null {
  if (input.hasExistingProject) return null;
  if (input.currentProjectionEpsg != null) return null;
  if (region !== 'AE' && region !== 'SA') return null;

  const config = getRegionConfig(region);
  return {
    region,
    linearUnits: config.linearUnit,
    currency: config.currency,
    vatRate: config.vatRate,
    vatInclusive: config.vatInclusive,
    crsOptions: config.crsOptions,
  };
}

export function shouldOfferRegionPreset(input: {
  region: RegionCode;
  hasExistingProject?: boolean;
  currentProjectionEpsg?: number | null;
}): boolean {
  return regionPresetForNewProject(input.region, input)?.region === input.region;
}

export function usdToAed(usd: number): number {
  return Math.round(usd * AED_PER_USD * 100) / 100;
}

export function aedToUsd(aed: number): number {
  return Math.round((aed / AED_PER_USD) * 100) / 100;
}

/**
 * Split a VAT-inclusive gross amount. Rounds net to cents first, then derives
 * VAT as the remainder so net + VAT always equals gross.
 */
export function vatBreakdown(gross: number, rate: number): { net: number; vat: number } {
  const safeGross = Math.round(gross * 100) / 100;
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  const net = Math.round((safeGross / (1 + safeRate)) * 100) / 100;
  return { net, vat: Math.round((safeGross - net) * 100) / 100 };
}

export function formatRegionMoney(
  amount: number,
  region: RegionCode,
  options: Intl.NumberFormatOptions = {},
): string {
  const config = getRegionConfig(region);
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    currencyDisplay: 'code',
    ...options,
  }).format(amount);
}

export const REGION_STORAGE_KEY = 'landsurv_region';

/** Read `?region=AE` (used by the Arabic landing-page CTAs). */
export function regionFromSearch(search: string): RegionCode | null {
  try {
    return normalizeRegionCode(new URLSearchParams(search).get('region'));
  } catch {
    return null;
  }
}

/**
 * Browser-facing detection: an explicit query parameter wins and is persisted,
 * then the saved preference, then timezone/locale. Safe in non-browser tests.
 */
export function detectBrowserRegion(): RegionDetection {
  if (typeof window === 'undefined') return detectRegion();

  const fromQuery = regionFromSearch(window.location.search);
  if (fromQuery) {
    try {
      localStorage.setItem(REGION_STORAGE_KEY, fromQuery);
    } catch {
      // Private mode: the current page still honors the query parameter.
    }
    return { region: fromQuery, source: 'explicit' };
  }

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(REGION_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  if (stored) return detectRegion({ explicit: stored });

  // Local development must not silently pretend to be in the Gulf. An explicit
  // query parameter or saved preference above still wins for QA.
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '') {
    return { region: 'US', source: 'default' };
  }

  return detectRegion();
}

/** Region code for a stored preference, falling back to detection. */
export function resolveStoredRegion(
  stored: unknown,
  fallback: RegionDetection = detectRegion(),
): RegionCode {
  return normalizeRegionCode(stored) || fallback.region;
}
