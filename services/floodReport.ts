/**
 * floodReport — turn fetched FEMA NFHL areas + BFE linework into a plain-text
 * flood-zone summary (for review/exhibit records) and a compact block that can
 * be appended to a plan sheet's titleblock notes.
 *
 * Screening-level only: the report states its source and tells the reader to
 * verify against the effective FIRM panel. It is not a flood determination.
 */

import type { MapAreaFeature } from '../types.ts';

export interface FloodReportInput {
  areas: MapAreaFeature[];
  zoneCounts: Record<string, number>;
  featureCount: number;
  bfeCount?: number;
  bfeDatum?: string | null;
  bfeError?: string | null;
  projectName?: string;
  generatedAt?: Date;
}

export interface FloodReportRow {
  /** FEMA zone code, e.g. AE / X / VE. */
  zone: string;
  /** Zone subtype from ZONE_SUBTY, e.g. "0.2 PCT ANNUAL CHANCE FLOOD HAZARD". */
  subtype: string;
  /** Special Flood Hazard Area flag when FEMA supplies SFHA_TF. */
  sfha: 'Yes' | 'No' | 'n/a';
  /** Formatted static BFE range for this zone row, or a dash. */
  bfe: string;
  /** Total polygon area in acres (project units assumed to be feet). */
  acres: number;
  /** Number of FEMA polygons represented by this row. */
  polygons: number;
}

const SQ_FT_PER_ACRE = 43_560;

function zoneKey(zone: string, subtype: string): string {
  return `${zone}|${subtype}`;
}

function formatAcres(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  if (value >= 100) return value.toFixed(0);
  return value.toFixed(2);
}

function formatBfeRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null && Math.abs(max - min) > 0.05) {
    return `${min.toFixed(1)}–${max.toFixed(1)} ft`;
  }
  return `${(min ?? max)!.toFixed(1)} ft`;
}

/**
 * Aggregate the fetched areas by FEMA zone + subtype, carrying SFHA flags,
 * acreage, and the static BFE range reported on each polygon.
 */
export function summarizeFloodZones(
  areas: MapAreaFeature[],
  zoneCounts: Record<string, number> = {},
): FloodReportRow[] {
  type Acc = {
    zone: string;
    subtype: string;
    sfha: boolean | undefined;
    bfeMin: number | null;
    bfeMax: number | null;
    areaSqFt: number;
    polygons: number;
  };
  const acc = new Map<string, Acc>();

  for (const area of areas) {
    const zone = String(area.attributes?.zone ?? 'UNKNOWN').toUpperCase();
    const subtype = String(area.attributes?.subtype ?? '').trim();
    const key = zoneKey(zone, subtype);
    let row = acc.get(key);
    if (!row) {
      row = { zone, subtype, sfha: undefined, bfeMin: null, bfeMax: null, areaSqFt: 0, polygons: 0 };
      acc.set(key, row);
    }
    row.polygons += 1;
    row.areaSqFt += Number(area.areaSqFt) > 0 ? Number(area.areaSqFt) : 0;
    const sfha = area.attributes?.sfha;
    if (typeof sfha === 'boolean') row.sfha = (row.sfha ?? false) || sfha;
    const bfeRaw = Number(area.attributes?.bfe);
    if (Number.isFinite(bfeRaw) && bfeRaw > 0) {
      row.bfeMin = row.bfeMin === null ? bfeRaw : Math.min(row.bfeMin, bfeRaw);
      row.bfeMax = row.bfeMax === null ? bfeRaw : Math.max(row.bfeMax, bfeRaw);
    }
  }

  const rows: FloodReportRow[] = [];
  for (const row of acc.values()) {
    rows.push({
      zone: row.zone,
      subtype: row.subtype,
      sfha: row.sfha === undefined ? 'n/a' : row.sfha ? 'Yes' : 'No',
      bfe: formatBfeRange(row.bfeMin, row.bfeMax),
      acres: row.areaSqFt / SQ_FT_PER_ACRE,
      polygons: row.polygons,
    });
  }

  // Fall back to the fetch-level zone tally when polygon metadata is absent
  // (e.g. a session restored without areas).
  if (rows.length === 0) {
    for (const [zone, count] of Object.entries(zoneCounts)) {
      rows.push({
        zone: zone.toUpperCase(),
        subtype: '',
        sfha: 'n/a',
        bfe: '—',
        acres: 0,
        polygons: count,
      });
    }
  }

  return rows.sort((a, b) => a.zone.localeCompare(b.zone) || a.subtype.localeCompare(b.subtype));
}

/** Full report for the Flood Agent panel (copy / download). */
export function buildFloodZoneReport(input: FloodReportInput): string {
  const rows = summarizeFloodZones(input.areas, input.zoneCounts);
  const generatedAt = input.generatedAt ?? new Date();
  const lines: string[] = [];

  lines.push('FEMA FLOOD ZONE REPORT');
  lines.push('=====================');
  if (input.projectName) lines.push(`Project:   ${input.projectName}`);
  lines.push(`Generated: ${generatedAt.toLocaleString()}`);
  lines.push('Source:    FEMA National Flood Hazard Layer (NFHL)');
  lines.push(`Polygons:  ${input.featureCount}`);
  if (input.bfeCount) {
    lines.push(`BFE lines: ${input.bfeCount}${input.bfeDatum ? ` (${input.bfeDatum})` : ''}`);
  }
  if (input.bfeError && input.bfeCount === 0) {
    lines.push(`BFE note:  ${input.bfeError}`);
  }
  lines.push('');

  if (rows.length === 0) {
    lines.push('No flood-zone polygons are loaded. Fetch a FEMA area first.');
  } else {
    lines.push('ZONE SUMMARY');
    lines.push('------------');
    for (const row of rows) {
      const sfha = row.sfha === 'n/a' ? '' : `  SFHA: ${row.sfha}`;
      lines.push(
        `Zone ${row.zone}${row.subtype ? ` — ${row.subtype}` : ''}  ` +
        `(${row.polygons} polygon${row.polygons === 1 ? '' : 's'}, ${formatAcres(row.acres)} ac)` +
        sfha,
      );
      if (row.bfe !== '—') lines.push(`  Static BFE: ${row.bfe}${input.bfeDatum ? ` ${input.bfeDatum}` : ''}`);
    }
  }

  lines.push('');
  lines.push('NOTES');
  lines.push('-----');
  lines.push('- Static BFE values come from the NFHL flood-zone polygon attributes;');
  lines.push('  the FEMA-BFE layer carries the mapped Base Flood Elevation lines.');
  lines.push('- Zone X shaded denotes the 0.2% annual-chance (500-year) hazard.');
  lines.push('- Verify all elevations and zone limits against the effective FIRM');
  lines.push('  panel for the project community before design or permitting.');
  lines.push('- This summary is a screening aid, not a flood determination or');
  lines.push('  elevation certificate.');

  return lines.join('\n');
}

/** Short block suitable for a plan sheet titleblock NOTES field. */
export function buildFloodSheetNotes(input: FloodReportInput): string {
  const rows = summarizeFloodZones(input.areas, input.zoneCounts);
  const parts: string[] = ['FEMA NFHL FLOOD ZONES'];

  for (const row of rows) {
    const bits = [`ZONE ${row.zone}`];
    if (row.subtype) bits.push(row.subtype);
    if (row.sfha === 'Yes') bits.push('SFHA');
    if (row.bfe !== '—') bits.push(`BFE ${row.bfe}`);
    parts.push(bits.join(' — '));
  }

  if (input.bfeCount) {
    parts.push(
      `BFE LINES PLOTTED: ${input.bfeCount}${input.bfeDatum ? ` (${input.bfeDatum})` : ''}`,
    );
  }
  parts.push('SOURCE: FEMA NFHL. VERIFY AGAINST EFFECTIVE FIRM PANEL.');
  parts.push('SCREENING AID ONLY — NOT A FLOOD DETERMINATION.');

  return parts.join('\n');
}
