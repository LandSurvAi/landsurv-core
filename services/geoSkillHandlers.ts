// services/geoSkillHandlers.ts
// CACP skill handlers for Geospatial AI (SamGeo & SAM-Road).
// Listens for `geo_extract_features` and `geo_extract_roads` commands,
// runs dual-mode inference (Local Desktop Worker vs. Cloud Run),
// and places vectorized linework onto the CAD canvas.

import { useEffect, useRef } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType, type SurveyLine, type PointList, type Settings } from '../types';
import { geoAiService, type BoundingBox } from './geoAiService';

export interface UseGeoSkillsOptions {
  settings: Settings;
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  pointListsRef: React.MutableRefObject<PointList[]>;
  logActionToFieldbook: (msg: string) => void;
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
  // Pad bounding box by 10%
  const padX = Math.max(10, (maxX - minX) * 0.1);
  const padY = Math.max(10, (maxY - minY) * 0.1);
  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}

export function useGeoSkills({
  settings,
  setLines,
  pointListsRef,
  logActionToFieldbook,
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

      const fallbackBbox = getProjectBoundingBox(pointListsRef.current);
      const currentSettings = settingsRef.current;
      const mode = currentSettings.geoAiMode ?? 'local';
      const localEndpoint = currentSettings.localGeoAiEndpoint || 'http://127.0.0.1:8765';

      try {
        const result = await geoAiService.extractFeatures(
          {
            featureType,
            prompt,
            targetLayer,
            confidenceThreshold,
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

        const engineLabel = result.engine === 'local' ? 'Local Desktop Worker' : result.engine === 'cloud' ? 'Cloud Run' : 'Spatial Synthesis';
        logActionToFieldbook(
          `Civil Drafter: Extracted ${result.featureCount} ${featureType}(s) onto layer "${targetLayer}" via SamGeo (${engineLabel}).`
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
    // Handler: geo_extract_roads (SAM-Road)
    // -----------------------------------------------------------------------
    const unsubRoads = interAgentComm.onCommand('geo_extract_roads', async (message: AgentMessage) => {
      const data = message.data || {};
      const targetLayer = String(data.targetLayer || 'C-ROAD-CNTR');
      const simplifyTolerance = typeof data.simplifyTolerance === 'number' ? data.simplifyTolerance : 1.0;

      const fallbackBbox = getProjectBoundingBox(pointListsRef.current);
      const currentSettings = settingsRef.current;
      const mode = currentSettings.geoAiMode ?? 'local';
      const localEndpoint = currentSettings.localGeoAiEndpoint || 'http://127.0.0.1:8765';

      try {
        const result = await geoAiService.extractRoadNetwork(
          {
            targetLayer,
            simplifyTolerance,
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

        const engineLabel = result.engine === 'local' ? 'Local Desktop Worker' : result.engine === 'cloud' ? 'Cloud Run' : 'Spatial Synthesis';
        logActionToFieldbook(
          `Civil Drafter: Extracted ${result.roadSegmentCount} road centerline(s) onto layer "${targetLayer}" via SAM-Road (${engineLabel}).`
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
  }, [setLines, pointListsRef, logActionToFieldbook]);
}
