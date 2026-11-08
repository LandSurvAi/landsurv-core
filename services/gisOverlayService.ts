/**
 * Convert a live ArcGIS/GeoJSON layer into canvas linework.
 *
 * GIS map layers can contain thousands of vertices. Turning each vertex into a
 * SurveyPoint would pollute the point list, so district/stream/boundary layers
 * are projected directly into lightweight SurveyLine segments instead. They
 * still live on their own CAD layer and can be hidden, exported, and queried.
 */

import proj4 from 'proj4';
import type { GisFeature, SurveyLine } from '../types.ts';
import { initProjections } from '../utils/projections.ts';
import { registerBundledCrs } from '../utils/crs/registry.ts';

interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

interface GeoJsonFeatureLike {
  id?: string;
  type?: string;
  geometry?: GeoJsonGeometry | null;
  properties?: Record<string, unknown>;
}

interface GeoJsonCollectionLike {
  type?: string;
  features?: GeoJsonFeatureLike[];
}

export interface GisOverlayResult {
  layerName: string;
  featureCount: number;
  lines: SurveyLine[];
  features: GisFeature[];
  /** Human-readable names found in the layer (county, district, zone, etc.). */
  names: string[];
  /** Project-coordinate extent of the drawn linework. */
  bbox: [number, number, number, number] | null;
}

const NAME_KEYS = [
  'NAME', 'name', 'NAME_LONG', 'LABEL', 'label', 'ZONENAME', 'ZONE_NAME',
  'DISTRICT', 'DISTRICT_NAME', 'COUNTY', 'COUNTY_NAME', 'STATE_NAME',
  'FULLNAME', 'FULL_NAME', 'TITLE', 'title',
];

function featureName(properties: Record<string, unknown>): string | null {
  for (const key of NAME_KEYS) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function gisOverlayLayerName(topic: string): string {
  const clean = String(topic ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `GIS-${clean || 'LIVE-LAYER'}`;
}

/**
 * Project a GeoJSON FeatureCollection into SurveyLine segments on one layer.
 * Points are preserved in the returned GisFeature metadata but are not added
 * to the survey point list.
 */
export function buildGisOverlay(
  geoJson: GeoJsonCollectionLike,
  projectEpsg: number | null | undefined,
  topic: string,
): GisOverlayResult {
  if (!projectEpsg || !Number.isFinite(projectEpsg)) {
    throw new Error('A project EPSG is required before plotting a live GIS layer.');
  }

  initProjections();
  const key = `EPSG:${projectEpsg}`;
  if (!proj4.defs(key)) registerBundledCrs(projectEpsg);

  const layerName = gisOverlayLayerName(topic);
  const lines: SurveyLine[] = [];
  const features: GisFeature[] = [];
  const names: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const projectPoint = (coord: unknown): { x: number; y: number } | null => {
    if (!Array.isArray(coord) || coord.length < 2) return null;
    const x = Number(coord[0]);
    const y = Number(coord[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    try {
      const [easting, northing] = proj4('EPSG:4326', key, [x, y]);
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
      minX = Math.min(minX, easting); minY = Math.min(minY, northing);
      maxX = Math.max(maxX, easting); maxY = Math.max(maxY, northing);
      return { x: easting, y: northing };
    } catch {
      return null;
    }
  };

  const addPath = (path: unknown, featureIndex: number, pathIndex: number, close: boolean) => {
    if (!Array.isArray(path)) return;
    const points = path
      .map(projectPoint)
      .filter((p): p is { x: number; y: number } => !!p);
    if (points.length < 2) return;

    const polylineId = `${layerName}-${featureIndex}-${pathIndex}`;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      lines.push({
        id: `${polylineId}-${i}`,
        from: '',
        to: '',
        fromPt: { x: a.x, y: a.y, z: 0 },
        toPt: { x: b.x, y: b.y, z: 0 },
        layer: layerName,
        polylineId,
      });
    }
    if (close) {
      const a = points[points.length - 1];
      const b = points[0];
      if (a.x !== b.x || a.y !== b.y) {
        lines.push({
          id: `${polylineId}-close`,
          from: '',
          to: '',
          fromPt: { x: a.x, y: a.y, z: 0 },
          toPt: { x: b.x, y: b.y, z: 0 },
          layer: layerName,
          polylineId,
        });
      }
    }
  };

  const walkGeometry = (
    geometry: GeoJsonGeometry | null | undefined,
    featureIndex: number,
    pathBase = 0,
  ): number => {
    if (!geometry?.type) return pathBase;
    switch (geometry.type) {
      case 'LineString':
        addPath(geometry.coordinates, featureIndex, pathBase, false);
        return pathBase + 1;
      case 'MultiLineString': {
        const paths = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        paths.forEach((path, i) => addPath(path, featureIndex, pathBase + i, false));
        return pathBase + paths.length;
      }
      case 'Polygon': {
        const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        rings.forEach((ring, i) => addPath(ring, featureIndex, pathBase + i, true));
        return pathBase + rings.length;
      }
      case 'MultiPolygon': {
        let next = pathBase;
        const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        polygons.forEach((polygon) => {
          if (!Array.isArray(polygon)) return;
          polygon.forEach((ring) => {
            addPath(ring, featureIndex, next++, true);
          });
        });
        return next;
      }
      case 'GeometryCollection': {
        let next = pathBase;
        for (const child of geometry.geometries ?? []) {
          next = walkGeometry(child, featureIndex, next);
        }
        return next;
      }
      default:
        // Points and multipoints are retained as feature metadata only.
        return pathBase;
    }
  };

  const inputFeatures = Array.isArray(geoJson?.features) ? geoJson.features : [];
  inputFeatures.forEach((feature, index) => {
    if (!feature || feature.type !== 'Feature' || !feature.geometry) return;
    const properties = feature.properties ?? {};
    const name = featureName(properties);
    if (name && !names.includes(name)) names.push(name);
    const before = lines.length;
    walkGeometry(feature.geometry, index);
    const featureLines = lines.slice(before);
    features.push({
      // Prefix with the CAD layer so a repeated request can replace its own
      // features instead of duplicating them in the GIS feature list.
      id: `${layerName}-${String(feature.id ?? `feature-${index}`)}`,
      type: feature.geometry.type as GisFeature['type'],
      geometry: feature.geometry,
      properties,
      displayLineIds: featureLines.map(line => line.id).filter((id): id is string => !!id),
    });
  });

  return {
    layerName,
    featureCount: features.length,
    lines,
    features,
    names: names.slice(0, 40),
    bbox: Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
      ? [minX, minY, maxX, maxY]
      : null,
  };
}
