import proj4 from 'proj4';
import { initProjections } from '../utils/projections.ts';
import { SurveyPoint, SurveyLine, GisFeature, Settings } from '../types.ts';

/**
 * GIS Service
 * Handles parsing, processing, and querying of GIS data (GeoJSON).
 */

export class GisService {

    /**
     * Ensure proj4 knows the requested target CRS. initProjections() only
     * registers a subset of real EPSG codes; when the session holds a code
     * that isn't registered (e.g. an authoritative 22xx/65xx State Plane code
     * from an external service), fall back to WGS84 rather than silently
     * dropping every coordinate.
     */
    private static resolveTargetEpsg(requested: number): { epsg: number; fellBack: boolean } {
        initProjections();
        const key = `EPSG:${requested}`;
        if (proj4.defs(key)) return { epsg: requested, fellBack: false };
        console.warn(`[GisService] EPSG:${requested} is not registered — plotting in WGS84 instead.`);
        return { epsg: 4326, fellBack: true };
    }

    /**
     * Parses GeoJSON content into internal GisFeatures and displayable SurveyPoints/Lines.
     * @param geoJsonContent The parsed JSON object of the GeoJSON file.
     * @param settings Current application settings (for projection).
     * @param existingPointNumbers Set of existing point numbers to avoid collisions.
     */
    static parseGeoJson(
        geoJsonContent: any,
        settings: Settings,
        existingPointNumbers: Set<string>
    ): { features: GisFeature[], points: SurveyPoint[], lines: SurveyLine[] } {

        if (!settings.projection.epsg) {
            throw new Error("A State Plane projection must be selected in Settings to plot GIS data.");
        }

        const { epsg: targetEpsg, fellBack } = GisService.resolveTargetEpsg(settings.projection.epsg);

        console.log('[GisService] parseGeoJson called with:', {
            hasContent: !!geoJsonContent,
            contentType: geoJsonContent?.type,
            featureCount: geoJsonContent?.features?.length || 0,
            projection: settings.projection.epsg
        });

        const features: GisFeature[] = [];
        const points: SurveyPoint[] = [];
        const lines: SurveyLine[] = [];
        let pointCounter = 1;
        
        // Helper to generate unique point numbers
        const getNextPointNumber = () => {
            // Use a random suffix to ensure uniqueness across multiple imports
            const suffix = Math.random().toString(36).substr(2, 5).toUpperCase();
            let pointNumber = `GIS-${pointCounter++}-${suffix}`;
            while (existingPointNumbers.has(pointNumber)) {
                pointNumber = `GIS-${pointCounter++}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
            }
            existingPointNumbers.add(pointNumber);
            return pointNumber;
        };

        // Helper to project coordinates
        const project = (coords: number[]): {easting: number, northing: number} | null => {
            if (!coords || coords.length < 2) {
                console.warn('[GisService] Invalid coordinate:', coords);
                return null;
            }
            
            // Check if coordinates look like WGS84 (Lat/Lon)
            // Longitude: -180 to 180, Latitude: -90 to 90
            const isLikelyWgs84 = Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90;

            if (!isLikelyWgs84) {
                // Assume already projected (e.g. State Plane)
                // GeoJSON uses [x, y] order, which maps to [easting, northing]
                return { easting: coords[0], northing: coords[1] };
            }

            try {
                // GeoJSON is always WGS84 (EPSG:4326)
                const [easting, northing] = proj4('EPSG:4326', `EPSG:${targetEpsg}`, coords);
                
                // Check for NaN or Infinity
                if (!isFinite(easting) || !isFinite(northing)) {
                    console.error("Projection resulted in non-finite coordinates:", easting, northing);
                    return null;
                }
                
                return { easting, northing };
            } catch (e) {
                console.error("Coordinate projection failed for:", coords, e);
                return null;
            }
        };

        // Helper to process a single geometry path (LineString or Polygon ring)
        const processPath = (path: number[][], props: any, geomType: string, isClosed: boolean): { pointIds: string[], lineIds: string[] } => {
            const pathPointIds: string[] = [];
            const pathLineIds: string[] = [];
            const pathPoints: SurveyPoint[] = [];

            console.log(`[GisService] processPath: ${geomType}, ${isClosed ? 'closed' : 'open'}, ${path.length} coords`);

            for (const coord of path) {
                const projected = project(coord);
                if (!projected) {
                    console.warn('[GisService] Failed to project coordinate:', coord);
                    continue;
                }

                // Create a new point for each coordinate
                // No deduplication across features - each feature keeps its own points
                const pointNumber = getNextPointNumber();
                const point: SurveyPoint = {
                    pointNumber,
                    northing: projected.northing,
                    easting: projected.easting,
                    elevation: coord[2] || 0,
                    description: props.description || props.name || `GIS ${geomType}`,
                };
                points.push(point);
                pathPoints.push(point);
                pathPointIds.push(pointNumber);
            }

            console.log(`[GisService] Created ${pathPoints.length} points from path`);

            for (let i = 0; i < pathPoints.length - 1; i++) {
                // Check if start and end are same point (zero length line)
                if (pathPoints[i].pointNumber === pathPoints[i+1].pointNumber) continue;

                const line: SurveyLine = { 
                    id: `GIS-L-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    from: pathPoints[i].pointNumber, 
                    to: pathPoints[i + 1].pointNumber 
                };
                lines.push(line);
                if (line.id) pathLineIds.push(line.id);
            }
            
            if (isClosed && pathPoints.length > 2) {
                 // Check if start and end are same point
                if (pathPoints[pathPoints.length - 1].pointNumber !== pathPoints[0].pointNumber) {
                    const line: SurveyLine = { 
                        id: `GIS-L-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        from: pathPoints[pathPoints.length - 1].pointNumber, 
                        to: pathPoints[0].pointNumber 
                    };
                    lines.push(line);
                    if (line.id) pathLineIds.push(line.id);
                }
            }

            console.log(`[GisService] Created ${pathLineIds.length} lines from path`);

            return { pointIds: pathPointIds, lineIds: pathLineIds };
        };

        // Recursive function to process geometries
        const processGeometry = (geom: any, props: any): { pointIds: string[], lineIds: string[] } => {
            const result = { pointIds: [] as string[], lineIds: [] as string[] };
            
            if (!geom || !geom.type || !geom.coordinates) return result;

            switch (geom.type) {
                case 'Point': {
                    const projected = project(geom.coordinates);
                    if (projected) {
                        const pointNumber = getNextPointNumber();
                        points.push({
                            pointNumber,
                            northing: projected.northing,
                            easting: projected.easting,
                            elevation: geom.coordinates[2] || 0,
                            description: props.description || props.name || 'GIS Point',
                        });
                        result.pointIds.push(pointNumber);
                    }
                    break;
                }
                case 'MultiPoint':
                    geom.coordinates.forEach((coord: number[]) => {
                        const subResult = processGeometry({ type: 'Point', coordinates: coord }, props);
                        result.pointIds.push(...subResult.pointIds);
                    });
                    break;
                case 'LineString': {
                    const subResult = processPath(geom.coordinates, props, 'Line', false);
                    result.pointIds.push(...subResult.pointIds);
                    result.lineIds.push(...subResult.lineIds);
                    break;
                }
                case 'MultiLineString':
                    geom.coordinates.forEach((line: number[][]) => {
                        const subResult = processPath(line, props, 'Line', false);
                        result.pointIds.push(...subResult.pointIds);
                        result.lineIds.push(...subResult.lineIds);
                    });
                    break;
                case 'Polygon':
                    // First ring is outer, subsequent are inner holes. All are closed.
                    geom.coordinates.forEach((ring: number[][]) => {
                        const subResult = processPath(ring, props, 'Polygon', true);
                        result.pointIds.push(...subResult.pointIds);
                        result.lineIds.push(...subResult.lineIds);
                    });
                    break;
                case 'MultiPolygon':
                    geom.coordinates.forEach((polygon: number[][][]) => {
                        polygon.forEach((ring: number[][]) => {
                            const subResult = processPath(ring, props, 'Polygon', true);
                            result.pointIds.push(...subResult.pointIds);
                            result.lineIds.push(...subResult.lineIds);
                        });
                    });
                    break;
                case 'GeometryCollection':
                    if (geom.geometries && Array.isArray(geom.geometries)) {
                        geom.geometries.forEach((g: any) => {
                            const subResult = processGeometry(g, props);
                            result.pointIds.push(...subResult.pointIds);
                            result.lineIds.push(...subResult.lineIds);
                        });
                    }
                    break;
            }
            return result;
        };

        // Main processing loop
        const processFeature = (feature: any) => {
            if (!feature || feature.type !== 'Feature' || !feature.geometry) {
                console.warn('[GisService] Skipping invalid feature:', feature);
                return;
            }
            
            console.log('[GisService] Processing feature:', {
                geomType: feature.geometry.type,
                hasProps: !!feature.properties,
                props: feature.properties
            });
            
            const props = feature.properties || {};
            const { pointIds, lineIds } = processGeometry(feature.geometry, props);

            features.push({
                id: feature.id || `GIS-F-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: feature.geometry.type,
                geometry: feature.geometry,
                properties: props,
                displayPointIds: pointIds,
                displayLineIds: lineIds
            });
        };

        if (geoJsonContent.type === 'FeatureCollection' && Array.isArray(geoJsonContent.features)) {
            console.log('[GisService] Processing FeatureCollection with', geoJsonContent.features.length, 'features');
            geoJsonContent.features.forEach(processFeature);
        } else if (geoJsonContent.type === 'Feature') {
            console.log('[GisService] Processing single Feature');
            processFeature(geoJsonContent);
        } else {
            console.log('[GisService] Processing raw geometry');
            // Raw geometry
            processFeature({ type: 'Feature', geometry: geoJsonContent, properties: {} });
        }

        if (fellBack && features.length > 0 && points.length === 0) {
            // Safety net — should not happen now that resolveTargetEpsg falls
            // back to 4326, but never return an empty result silently.
            console.warn('[GisService] projection fallback active; verify canvas CRS labeling.');
        }

        console.log('[GisService] parseGeoJson complete:', {
            featuresCount: features.length,
            pointsCount: points.length,
            linesCount: lines.length
        });

        return { features, points, lines };
    }

    /**
     * Generates a context summary of the GIS data for the AI agent.
     * Includes statistics and a sample of features with their properties.
     */
    static getGisContext(features: GisFeature[]): string {
        if (!features || features.length === 0) return "No GIS features loaded.";

        const totalFeatures = features.length;
        const typeCounts: Record<string, number> = {};
        const propertyStats: Record<string, { uniqueValues: Set<any>, valueCounts: Record<string, number> }> = {};

        features.forEach(f => {
            // Count types
            typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;

            // Analyze properties
            Object.entries(f.properties).forEach(([key, value]) => {
                if (!propertyStats[key]) {
                    propertyStats[key] = { uniqueValues: new Set(), valueCounts: {} };
                }
                const strVal = String(value);
                propertyStats[key].uniqueValues.add(value);
                propertyStats[key].valueCounts[strVal] = (propertyStats[key].valueCounts[strVal] || 0) + 1;
            });
        });

        let context = `GIS Data Summary:\n`;
        context += `- Total Features: ${totalFeatures}\n`;
        context += `- Feature Types: ${Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
        
        context += `\nProperty Statistics:\n`;
        Object.entries(propertyStats).forEach(([key, stats]) => {
            const uniqueCount = stats.uniqueValues.size;
            context += `- ${key}: ${uniqueCount} unique values.`;
            
            if (uniqueCount <= 10) {
                const values = Array.from(stats.uniqueValues).join(', ');
                context += ` Values: [${values}]\n`;
            } else {
                // Top 5 most common
                const sorted = Object.entries(stats.valueCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                const topValues = sorted.map(([v, c]) => `${v} (${c})`).join(', ');
                context += ` Top values: ${topValues}...\n`;
            }
        });

        context += `\nSample Features (First 20):\n`;
        features.slice(0, 20).forEach((f, i) => {
            // Truncate long property values for the sample
            const shortProps: any = {};
            Object.entries(f.properties).forEach(([k, v]) => {
                const s = String(v);
                shortProps[k] = s.length > 50 ? s.substring(0, 47) + '...' : v;
            });
            context += `${i + 1}. Type: ${f.type}, Props: ${JSON.stringify(shortProps)}\n`;
        });

        return context;
    }

    /**
     * Filters features based on a property query.
     * Simple implementation: checks if any property value contains the query string.
     */
    static searchFeatures(features: GisFeature[], query: string): GisFeature[] {
        const lowerQuery = query.toLowerCase();
        return features.filter(f => {
            return Object.values(f.properties).some(val => 
                String(val).toLowerCase().includes(lowerQuery)
            );
        });
    }
}
