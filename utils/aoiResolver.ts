/**
 * aoiResolver — determines the Area Of Interest for GIS data connectors.
 *
 * Every external-data agent (parcels, flood, soils, structures, static maps,
 * AutoDraft) needs a WGS84 bounding box. Historically each panel required the
 * user to draw an inclusion boundary or type a location description first.
 * This module resolves the AOI automatically through a confidence cascade:
 *
 *   1. `inclusion`   — user-drawn inclusion boundary (highest confidence)
 *   2. `shrinkwrap`  — auto convex hull of the loaded survey points
 *   3. `point_extent`— raw point bbox + margin (degenerate hulls, <3 points)
 *   4. `geocode`     — Nominatim lookup of the job address / municipality
 *
 * All returned bboxes are [xmin, ymin, xmax, ymax] in WGS84 lon/lat.
 */

import type { SurveyPoint, SurveyLine } from '../types.ts';
import { convexHull } from './cogoLib/area.ts';
import { reprojectBbox } from '../services/esriRestClient.ts';

export type AoiSource = 'inclusion' | 'shrinkwrap' | 'point_extent' | 'geocode';

export interface AoiResult {
  /** WGS84 [xmin, ymin, xmax, ymax] (west, south, east, north). */
  bboxWgs84: [number, number, number, number];
  /** How the AOI was derived. */
  source: AoiSource;
  /** high: user-drawn / dense hull · medium: sparse extent · low: geocoded */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable one-liner for phase logs / pre-flight display. */
  summary: string;
  /** Hull vertices in project coordinates (shrinkwrap source only). */
  hullProjected?: Array<{ easting: number; northing: number }>;
}

export interface AoiResolverInput {
  points: SurveyPoint[];
  lines: SurveyLine[];
  /** Project coordinate system EPSG (State Plane etc.). Required to convert
   *  projected geometry to WGS84 — without it only geocoding can work. */
  projectEpsg?: number | null;
  /** Free-text location (job address, "municipality, county, state") used as
   *  the geocode fallback. */
  locationText?: string;
  /** Margin applied around projected extents, in project units (default 200 —
   *  ~200 ft for US State Plane). */
  marginProjected?: number;
  /** Margin applied around geocoded bboxes, in degrees (default 0.002 ≈ 200 m). */
  marginDegrees?: number;
}

/** Compute the projected bbox of a point set: [xmin, ymin, xmax, ymax]. */
function pointBbox(pts: Array<{ easting: number; northing: number }>): [number, number, number, number] | null {
  if (pts.length === 0) return null;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.easting) || !Number.isFinite(p.northing)) continue;
    if (p.easting < xmin) xmin = p.easting;
    if (p.easting > xmax) xmax = p.easting;
    if (p.northing < ymin) ymin = p.northing;
    if (p.northing > ymax) ymax = p.northing;
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return null;
  return [xmin, ymin, xmax, ymax];
}

function expand(bbox: [number, number, number, number], margin: number): [number, number, number, number] {
  return [bbox[0] - margin, bbox[1] - margin, bbox[2] + margin, bbox[3] + margin];
}

/** Geocode free text via Nominatim → WGS84 bbox. Exported for pre-flight use. */
export async function geocodeLocationText(text: string, marginDegrees = 0.002): Promise<[number, number, number, number]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty location text');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'LandSurv.ai/1.0' },
      signal: ctl.signal,
    });
    if (!resp.ok) throw new Error(`Geocoding failed: ${resp.statusText}`);
    const arr = await resp.json() as Array<{ boundingbox: string[]; lat: string; lon: string }>;
    if (!arr || arr.length === 0) throw new Error(`No location found for "${trimmed}"`);
    const hit = arr[0];
    const [south, north, west, east] = hit.boundingbox.map(Number);
    return expand([west, south, east, north], marginDegrees);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve the AOI through the cascade. Throws only when EVERY strategy is
 * exhausted (no points, no inclusion, no EPSG, no/failed geocode).
 */
export async function resolveAoi(input: AoiResolverInput): Promise<AoiResult> {
  const {
    points, lines, projectEpsg, locationText,
    marginProjected = 200, marginDegrees = 0.002,
  } = input;

  const epsg = projectEpsg ?? undefined;

  // ── 1. Inclusion boundary ──────────────────────────────────────────────
  if (epsg) {
    const byNumber = new Map(points.map(p => [p.pointNumber, p]));
    const inclusionVerts: Array<{ easting: number; northing: number }> = [];
    for (const l of lines) {
      if (l.type !== 'inclusion') continue;
      if (l.fromPt) inclusionVerts.push({ easting: l.fromPt.x, northing: l.fromPt.y });
      else if (l.from && byNumber.has(l.from)) {
        const p = byNumber.get(l.from)!;
        inclusionVerts.push({ easting: p.easting, northing: p.northing });
      }
      if (l.toPt) inclusionVerts.push({ easting: l.toPt.x, northing: l.toPt.y });
      else if (l.to && byNumber.has(l.to)) {
        const p = byNumber.get(l.to)!;
        inclusionVerts.push({ easting: p.easting, northing: p.northing });
      }
    }
    const bbox = pointBbox(inclusionVerts);
    if (bbox) {
      const wgs = await reprojectBbox(expand(bbox, marginProjected), epsg, 4326);
      if (wgs) {
        return {
          bboxWgs84: wgs,
          source: 'inclusion',
          confidence: 'high',
          summary: `User inclusion boundary (${inclusionVerts.length} vertices) + ${marginProjected} unit margin`,
        };
      }
    }
  }

  // ── 2. Auto-shrinkwrap hull of survey points ───────────────────────────
  const usable = points.filter(p => Number.isFinite(p.easting) && Number.isFinite(p.northing));
  if (epsg && usable.length >= 3) {
    const hull = convexHull(usable.map(p => ({ easting: p.easting, northing: p.northing })));
    const bbox = pointBbox(hull);
    if (bbox && hull.length >= 3 && (bbox[2] - bbox[0]) > 0 && (bbox[3] - bbox[1]) > 0) {
      const wgs = await reprojectBbox(expand(bbox, marginProjected), epsg, 4326);
      if (wgs) {
        return {
          bboxWgs84: wgs,
          source: 'shrinkwrap',
          confidence: 'high',
          summary: `Auto-shrinkwrap of ${usable.length} points (${hull.length}-vertex hull) + ${marginProjected} unit margin`,
          hullProjected: hull,
        };
      }
    }
  }

  // ── 3. Raw point extent ────────────────────────────────────────────────
  if (epsg && usable.length > 0) {
    const bbox = pointBbox(usable);
    if (bbox) {
      // Degenerate (single point / collinear) extents still work once the
      // margin is applied.
      const wgs = await reprojectBbox(expand(bbox, Math.max(marginProjected, 100)), epsg, 4326);
      if (wgs) {
        return {
          bboxWgs84: wgs,
          source: 'point_extent',
          confidence: 'medium',
          summary: `Extent of ${usable.length} point(s) + margin`,
        };
      }
    }
  }

  // ── 4. Geocode job location ────────────────────────────────────────────
  if (locationText && locationText.trim()) {
    const bbox = await geocodeLocationText(locationText, marginDegrees);
    return {
      bboxWgs84: bbox,
      source: 'geocode',
      confidence: 'low',
      summary: `Geocoded "${locationText.trim()}" via Nominatim`,
    };
  }

  throw new Error(
    'Cannot resolve an area of interest: no inclusion boundary, no survey points ' +
    '(or no projection EPSG configured), and no job address/municipality to geocode.'
  );
}
