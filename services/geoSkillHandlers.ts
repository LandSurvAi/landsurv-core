// services/geoSkillHandlers.ts
// CACP skill handlers for Geospatial AI (SamGeo & SAM-Road).
// Listens for `geo_extract_features` and `geo_extract_roads` commands,
// runs dual-mode inference (Local Desktop Worker vs. Cloud Run),
// and places vectorized linework onto the CAD canvas.

import { useEffect, useRef } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType, type SurveyLine, type PointList, type Settings } from '../types';
import { geoAiService, type BoundingBox } from './geoAiService';
import { extractAuthoritativeRoads, synthesizeDrivewayToHouse, projectBboxToWgs84 } from './roadExtractionService';
import { fetchOsmBuildings } from './osmBuildingsService';

export interface UseGeoSkillsOptions {
  settings: Settings;
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  setPointLists?: React.Dispatch<React.SetStateAction<PointList[]>>;
  pointListsRef: React.MutableRefObject<PointList[]>;
  logActionToFieldbook: (msg: string) => void;
  canvas2dRef?: React.RefObject<any>;
}

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string
): AgentResponse {
  return {
    requestId: msg.id,
    from: AgentType.CIVIL_DRAFTER,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

/** Render visible background map overlay tiles to a composite offscreen canvas. */
function renderMapTilesToOffscreenCanvas(
  tiles: Array<{ image: CanvasImageSource; bbox: [number, number, number, number] }>,
  bounds: BoundingBox,
  width = 1024,
  height = 1024
): HTMLCanvasElement | null {
  if (!tiles || tiles.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);

  const spanE = Math.max(bounds.maxX - bounds.minX, 1.0);
  const spanN = Math.max(bounds.maxY - bounds.minY, 1.0);

  for (const t of tiles) {
    if (!t.image || !t.bbox) continue;
    const [tMinE, tMinN, tMaxE, tMaxN] = t.bbox;
    const x0 = ((tMinE - bounds.minX) / spanE) * width;
    const x1 = ((tMaxE - bounds.minX) / spanE) * width;
    const yTop = ((bounds.maxY - tMaxN) / spanN) * height; // North up -> Y down
    const yBottom = ((bounds.maxY - tMinN) / spanN) * height;
    const w = x1 - x0;
    const h = yBottom - yTop;
    if (w > 0 && h > 0) {
      try {
        ctx.drawImage(t.image, x0, yTop, w, h);
      } catch (e) {
        console.warn('[geoSkillHandlers] draw map tile failed:', e);
      }
    }
  }

  return canvas;
}

/** Compute an approximate bounding box from visible project points. */
function getProjectBoundingBox(pointLists: PointList[]): BoundingBox | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const list of pointLists) {
    if (list.isVisible === false) continue;
    for (const pt of list.points) {
      const x = typeof pt.easting === 'number' ? pt.easting : (pt as any).x;
      const y = typeof pt.northing === 'number' ? pt.northing : (pt as any).y;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count < 2) return undefined;
  // Pad bounding box by 25% to capture driveway entrance and street connection
  const padX = Math.max(30, (maxX - minX) * 0.25);
  const padY = Math.max(30, (maxY - minY) * 0.25);
  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}

/** Resolves bounding box from survey points, falling back to current active canvas viewport. */
function getTargetBoundingBox(
  pointLists: PointList[],
  canvas2dRef?: React.RefObject<any>
): BoundingBox {
  const ptBox = getProjectBoundingBox(pointLists);
  if (ptBox) return ptBox;

  const viewBbox = canvas2dRef?.current?.getViewportBboxWorld?.();
  if (viewBbox && Number.isFinite(viewBbox.minX) && Number.isFinite(viewBbox.maxX) && viewBbox.maxX > viewBbox.minX) {
    return {
      minX: viewBbox.minX,
      maxX: viewBbox.maxX,
      minY: viewBbox.minY,
      maxY: viewBbox.maxY,
    };
  }

  return { minX: 1000, minY: 1000, maxX: 1200, maxY: 1200 };
}

export function useGeoSkills({
  settings,
  setLines,
  setPointLists,
  pointListsRef,
  logActionToFieldbook,
  canvas2dRef,
}: UseGeoSkillsOptions): void {
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // -----------------------------------------------------------------------
    // Handler: geo_extract_features (SamGeo)
    // -----------------------------------------------------------------------
    const unsubFeatures = interAgentComm.onCommand('geo_extract_features', async (message: AgentMessage) => {
      const data = message.data || {};
      const featureType = String(data.featureType || 'driveway').toLowerCase();
      const prompt = data.prompt ? String(data.prompt) : undefined;
      const targetLayer = String(data.targetLayer || (featureType === 'building' ? 'L-BLD-AI' : 'L-DRIVEWAY'));
      const confidenceThreshold = typeof data.confidenceThreshold === 'number' ? data.confidenceThreshold : 0.35;
      const reqRoadWidth = typeof data.roadWidthFt === 'number' && data.roadWidthFt > 0 ? data.roadWidthFt : undefined;

      const fallbackBbox = getTargetBoundingBox(pointListsRef.current, canvas2dRef);
      const bounds = {
        minE: fallbackBbox.minX,
        maxE: fallbackBbox.maxX,
        minN: fallbackBbox.minY,
        maxN: fallbackBbox.maxY,
      };
      const currentSettings = settingsRef.current;
      const mode = currentSettings.geoAiMode ?? 'local';
      const localEndpoint = currentSettings.localGeoAiEndpoint || 'http://127.0.0.1:8765';
      const includeRoad = data.includeRoad === true;

      // Composite visible map overlay tiles for computer vision and optical self-checking (1280x1280 resolution)
      const tiles = canvas2dRef?.current?.getMapOverlayTiles?.() ?? [];
      const offscreenCanvas = renderMapTilesToOffscreenCanvas(tiles, fallbackBbox, 1280, 1280);
      const imageBase64 = offscreenCanvas ? offscreenCanvas.toDataURL('image/jpeg', 0.85) : undefined;

      // 1. Authoritative GIS & Corridor Synthesis Pipeline for Driveways
      if (featureType === 'driveway') {
        try {
          const allPts = pointListsRef.current.flatMap(l => l.points);
          const roadRes = await extractAuthoritativeRoads({
            bounds,
            projectEpsg: currentSettings.projection?.epsg,
            defaultRoadWidthFt: reqRoadWidth,
            existingPoints: allPts,
            canvas: offscreenCanvas,
          });

          // If includeRoad requested, place road lines on canvas
          if (includeRoad && roadRes.lines.length > 0) {
            setLines(prev => [...prev, ...roadRes.lines]);
            logActionToFieldbook(`Civil Drafter: Extracted authoritative road corridor onto layer "C-ROAD-CNTR".`);
          }

          // Locate house building footprint via OSM if WGS84 bbox is valid
          let buildingCentroid: { x: number; y: number } | undefined;
          const wgs84Bbox = projectBboxToWgs84(bounds, currentSettings.projection?.epsg);
          if (wgs84Bbox) {
            try {
              const bResult = await fetchOsmBuildings(
                wgs84Bbox,
                currentSettings.projection?.epsg ?? undefined,
                { timeoutMs: 3500 }
              );
              if (bResult.buildings.length > 0) {
                const largest = bResult.buildings.reduce((prev, curr) => (curr.area > prev.area ? curr : prev));
                buildingCentroid = largest.centroid;
              }
            } catch (bErr) {
              console.warn('[geoSkillHandlers] OSM building fetch fallback:', bErr);
            }
          }

          const dwRes = synthesizeDrivewayToHouse({
            roadEdges: roadRes.roadEdges,
            controlPoints: allPts,
            bounds,
            drivewayWidthFt: 14,
            buildingCentroid,
            clLayer: 'L-DRIVEWAY-CL',
            edgeLayer: targetLayer,
          });

          if (dwRes.lines.length > 0) {
            setLines(prev => [...prev, ...dwRes.lines]);
            logActionToFieldbook(
              `Civil Drafter: Synthesized driveway corridor from road frontage to building on layer "${targetLayer}".`
            );
            return respond(message, true, {
              success: true,
              featureCount: 1,
              targetLayer,
              engine: 'corridor-synthesis',
              message: `Successfully synthesized driveway corridor from road frontage to building on layer "${targetLayer}".`,
            });
          }
        } catch (synthErr) {
          console.warn('[geoSkillHandlers] Corridor synthesis fallback:', synthErr);
        }
      }

      // 2. Machine Learning / Computer Vision Pipeline (SamGeo / Local Daemon)
      const controlPoints = pointListsRef.current
        .filter(l => l.isVisible !== false)
        .flatMap(l => l.points)
        .map(p => ({
          easting: typeof p.easting === 'number' ? p.easting : (p as any).x,
          northing: typeof p.northing === 'number' ? p.northing : (p as any).y,
          description: p.description,
        }))
        .filter(p => typeof p.easting === 'number' && typeof p.northing === 'number');

      try {
        const result = await geoAiService.extractFeatures(
          {
            featureType,
            prompt,
            targetLayer,
            confidenceThreshold,
            bbox: fallbackBbox,
            imageBase64,
            canvas: offscreenCanvas ?? undefined,
            controlPoints,
          },
          {
            mode,
            localEndpoint,
            fallbackBbox,
          }
        );

        if (!result.success || result.features.length === 0) {
          return respond(message, false, undefined, 'No vector features could be extracted for the requested area.');
        }

        // Convert polygon coordinates into SurveyLine segments
        const newSurveyLines: SurveyLine[] = [];
        for (const feature of result.features) {
          const polylineId = feature.id || `poly-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const coords = feature.coordinates;
          if (coords.length < 2) continue;

          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];
            newSurveyLines.push({
              id: `line-${polylineId}-${i}`,
              from: `${polylineId}-${i}`,
              to: `${polylineId}-${i + 1}`,
              fromPt: { x: p1.x, y: p1.y, z: p1.z ?? 0 },
              toPt: { x: p2.x, y: p2.y, z: p2.z ?? 0 },
              layer: targetLayer,
              color: featureType === 'driveway' ? '#38bdf8' : '#e879f9',
              polylineId,
              lineType: 'CONTINUOUS',
            });
          }
        }

        if (newSurveyLines.length > 0) {
          setLines(prev => [...prev, ...newSurveyLines]);
        }

        const engineLabel = result.engine === 'local' ? 'Local SamGeo Worker' : result.engine === 'cloud' ? 'Cloud Run' : 'Client Vision Analysis';
        logActionToFieldbook(
          `Civil Drafter: Extracted ${result.featureCount} ${featureType}(s) onto layer "${targetLayer}" (${engineLabel}).`
        );

        return respond(message, true, {
          success: true,
          featureCount: result.featureCount,
          targetLayer,
          engine: result.engine,
          message: `Successfully extracted and drew ${result.featureCount} ${featureType}(s) on layer "${targetLayer}".`,
        });
      } catch (err: any) {
        return respond(message, false, undefined, err.message || 'Geospatial feature extraction failed.');
      }
    });

    // -----------------------------------------------------------------------
    // Handler: geo_extract_roads (SAM-Road / Authoritative OSM)
    // -----------------------------------------------------------------------
    const unsubRoads = interAgentComm.onCommand('geo_extract_roads', async (message: AgentMessage) => {
      const data = message.data || {};
      const targetLayer = String(data.targetLayer || 'C-ROAD-CNTR');
      const simplifyTolerance = typeof data.simplifyTolerance === 'number' ? data.simplifyTolerance : 1.0;
      const reqWidth = typeof data.roadWidthFt === 'number' && data.roadWidthFt > 0 ? data.roadWidthFt : (typeof data.widthFt === 'number' && data.widthFt > 0 ? data.widthFt : undefined);

      const fallbackBbox = getTargetBoundingBox(pointListsRef.current, canvas2dRef);
      const currentSettings = settingsRef.current;
      const mode = currentSettings.geoAiMode ?? 'local';
      const localEndpoint = currentSettings.localGeoAiEndpoint || 'http://127.0.0.1:8765';

      // Composite visible map overlay tiles for computer vision and optical self-checking (1280x1280 resolution)
      const tiles = canvas2dRef?.current?.getMapOverlayTiles?.() ?? [];
      const offscreenCanvas = renderMapTilesToOffscreenCanvas(tiles, fallbackBbox, 1280, 1280);
      const imageBase64 = offscreenCanvas ? offscreenCanvas.toDataURL('image/jpeg', 0.85) : undefined;

      // 1. First try authoritative OpenStreetMap extraction
      try {
        const roadResult = await extractAuthoritativeRoads({
          bounds: fallbackBbox,
          projectEpsg: currentSettings.projection?.epsg,
          defaultRoadWidthFt: reqWidth,
          existingPoints: pointListsRef.current.flatMap(l => l.points),
          clLayer: targetLayer,
          canvas: offscreenCanvas,
        });

        if (roadResult.lines.length > 0) {
          setLines(prev => [...prev, ...roadResult.lines]);
          const roadNameLabel = roadResult.roadNames.length > 0 ? roadResult.roadNames.join(', ') : 'road corridor';
          logActionToFieldbook(
            `Civil Drafter: Extracted authoritative road corridor (${roadNameLabel}) onto layer "${targetLayer}".`
          );
          return respond(message, true, {
            success: true,
            roadSegmentCount: roadResult.roadCenterlines.length,
            intersectionCount: 1,
            targetLayer,
            engine: 'osm-authoritative',
            message: `Extracted authoritative ${roadNameLabel} onto layer "${targetLayer}".`,
          });
        }
      } catch (osmErr) {
        console.warn('[geoSkillHandlers] OSM road extraction fallback:', osmErr);
      }

      // 2. Machine learning / vision fallback (SAM-Road)
      try {
        const result = await geoAiService.extractRoadNetwork(
          {
            targetLayer,
            simplifyTolerance,
            bbox: fallbackBbox,
            imageBase64,
            canvas: offscreenCanvas ?? undefined,
          },
          {
            mode,
            localEndpoint,
            fallbackBbox,
          }
        );

        if (!result.success || result.roads.length === 0) {
          return respond(message, false, undefined, 'No road network could be extracted for the requested area.');
        }

        const newRoadLines: SurveyLine[] = [];
        for (const road of result.roads) {
          const polylineId = road.id || `road-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const coords = road.coordinates;
          if (coords.length < 2) continue;

          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i + 1];
            newRoadLines.push({
              id: `line-${polylineId}-${i}`,
              from: `${polylineId}-${i}`,
              to: `${polylineId}-${i + 1}`,
              fromPt: { x: p1.x, y: p1.y, z: p1.z ?? 0 },
              toPt: { x: p2.x, y: p2.y, z: p2.z ?? 0 },
              layer: targetLayer,
              color: '#facc15',
              polylineId,
              lineType: 'CENTERLINE',
            });
          }
        }

        if (newRoadLines.length > 0) {
          setLines(prev => [...prev, ...newRoadLines]);
        }

        const engineLabel = result.engine === 'local' ? 'Local SAM-Road Worker' : result.engine === 'cloud' ? 'Cloud Run' : 'Client Vision Analysis';
        logActionToFieldbook(
          `Civil Drafter: Extracted ${result.roadSegmentCount} road centerline(s) onto layer "${targetLayer}" (${engineLabel}).`
        );

        return respond(message, true, {
          success: true,
          roadSegmentCount: result.roadSegmentCount,
          intersectionCount: result.intersectionCount,
          targetLayer,
          engine: result.engine,
          message: `Extracted ${result.roadSegmentCount} road centerline(s) on layer "${targetLayer}".`,
        });
      } catch (err: any) {
        return respond(message, false, undefined, err.message || 'Road network extraction failed.');
      }
    });

    return () => {
      unsubFeatures();
      unsubRoads();
    };
  }, [setLines, pointListsRef, logActionToFieldbook, canvas2dRef]);
}
