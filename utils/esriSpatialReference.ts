/**
 * Resolve the EPSG code reported by an ArcGIS REST spatialReference object.
 *
 * ArcGIS services often use legacy or ESRI-internal WKIDs (102100, 102728,
 * 102729) instead of the EPSG codes the rest of the app uses. Some services
 * also report only WKT, which is common for older State Plane layers.
 */
export function esriSpatialReferenceWkid(sr: unknown): number | null {
  if (!sr || typeof sr !== 'object') return null;
  const record = sr as Record<string, unknown>;

  const numericWkid = Number(record.latestWkid ?? record.wkid);
  if (Number.isFinite(numericWkid) && numericWkid > 0) {
    return normalizeEsriWkid(numericWkid);
  }

  const wkt = typeof record.wkt === 'string'
    ? record.wkt
    : typeof record.latestWkt === 'string'
      ? record.latestWkt
      : '';
  if (!wkt) return null;

  const authority = wkt.match(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["'](\d+)["']\s*\]/i)
    ?? wkt.match(/ID\s*\[\s*["']EPSG["']\s*,\s*(\d+)\s*\]/i);
  if (authority) return normalizeEsriWkid(Number(authority[1]));

  // PASDA's northern Pennsylvania tile reports WKT without an EPSG authority.
  if (/Pennsylvania[_ ]North|StatePlane_Pennsylvania_North|State Plane.*Pennsylvania.*North/i.test(wkt)) {
    return 2271;
  }
  if (/Pennsylvania[_ ]South|StatePlane_Pennsylvania_South|State Plane.*Pennsylvania.*South/i.test(wkt)) {
    return 2272;
  }

  return null;
}

export function normalizeEsriWkid(wkid: number): number {
  switch (wkid) {
    case 102100:
    case 102113:
    case 900913:
      return 3857;
    case 102728:
      return 2271;
    case 102729:
      return 2272;
    default:
      return wkid;
  }
}
