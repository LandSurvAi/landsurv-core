import type { GisFeature } from '../types.ts';

export interface MetadataEntry {
  key: string;
  label: string;
  value: string;
}

const FIELD_LABELS: Record<string, string> = {
  owner: 'Owner',
  'owner name': 'Owner',
  ownername: 'Owner',
  owner1: 'Owner 1',
  owner2: 'Owner 2',
  taxpayer: 'Owner',
  'primary owner': 'Owner',
  'parcel id': 'Parcel ID',
  parcelid: 'Parcel ID',
  parcel: 'Parcel ID',
  pin: 'Parcel ID',
  taxpin: 'Parcel ID',
  'parcel num': 'Parcel ID',
  'parcel number': 'Parcel ID',
  'parcel no': 'Parcel ID',
  book: 'Book',
  'deed book': 'Book',
  deedbook: 'Book',
  'book no': 'Book',
  'book number': 'Book',
  booknum: 'Book',
  booknumber: 'Book',
  dbook: 'Book',
  bk: 'Book',
  page: 'Page',
  'deed page': 'Page',
  deedpage: 'Page',
  'page no': 'Page',
  'page number': 'Page',
  pagenum: 'Page',
  pagenumber: 'Page',
  dpage: 'Page',
  pg: 'Page',
  'book page': 'Book/Page',
  'book/page': 'Book/Page',
  'deed reference': 'Book/Page',
  deedref: 'Book/Page',
  huc8: 'HUC8',
  huc10: 'HUC10',
  huc12: 'HUC12',
  name: 'Name',
  zonename: 'Zone',
  'zone name': 'Zone',
};

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function metadataFieldLabel(key: string): string {
  return FIELD_LABELS[normalizeKey(key)] ?? key;
}

export function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map(item => formatMetadataValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function metadataEntries(properties?: Record<string, unknown> | null): MetadataEntry[] {
  return Object.entries(properties ?? {}).map(([key, value]) => ({
    key,
    label: metadataFieldLabel(key),
    value: formatMetadataValue(value),
  }));
}

export function metadataFeatureName(
  feature: Pick<GisFeature, 'properties'>,
  index = 0,
): string {
  const properties = feature.properties ?? {};
  for (const key of [
    'NAME', 'name', 'NAME_LONG', 'LABEL', 'label', 'ZONENAME', 'ZONE_NAME',
    'HUC12', 'HUC10', 'HUC8', 'DISTRICT_NAME', 'DISTRICT', 'COUNTY_NAME',
    'COUNTY', 'PARCEL_ID', 'parcel_id', 'PARCELID', 'TITLE', 'title',
  ]) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `Feature ${index + 1}`;
}

/** Resolve GIS features whose generated linework is part of the selection. */
export function gisFeaturesForSelectedLines(
  features: GisFeature[] | undefined,
  selectedLineIds: Iterable<string>,
): GisFeature[] {
  if (!features?.length) return [];
  const ids = new Set(selectedLineIds);
  if (ids.size === 0) return [];
  return features.filter(feature =>
    (feature.displayLineIds ?? []).some(id => ids.has(id)),
  );
}
