import { useEffect, useRef } from 'react';
import { AgentType, type Centerline, type RoadCorridorRun, type SurveyLine, type SurveyPoint, type TinSurface } from '../types';
import { interAgentComm } from '../services/InterAgentCommunication';
import { roadLinkRegistry } from '../services/roadLinkRegistry';

interface UseRoadObjectLiveLinksArgs {
  centerlines: Centerline[];
  points: SurveyPoint[];
  lines: SurveyLine[];
  tinSurfaces: TinSurface[];
  roadCorridors: RoadCorridorRun[];
  enabled: boolean;
}

/**
 * Watches the inputs covered by a RoadObject's signature and silently asks the
 * Roading Agent to refresh linked profiles/sections when they drift.
 */
export function useRoadObjectLiveLinks({
  centerlines,
  points,
  lines,
  tinSurfaces,
  roadCorridors,
  enabled,
}: UseRoadObjectLiveLinksArgs): void {
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      const context = { centerlines, points, lines, tinSurfaces, roadCorridors };
      for (const road of roadLinkRegistry.list()) {
        if (road.status === 'refreshing' || road.status === 'needs-input' || road.status === 'broken') continue;
        if (inFlight.current.has(road.id)) continue;
        const signature = roadLinkRegistry.buildInputSignature(road, context);
        if (road.computedInputSignature === signature) continue;
        inFlight.current.add(road.id);
        roadLinkRegistry.beginExtraction(road.id);
        void interAgentComm
          .askPeer(AgentType.ROADING_AGENT, 'road_object_refresh', {
            roadObjectId: road.id,
            reason: 'live-input-change',
          })
          .catch(() => {
            roadLinkRegistry.failExtraction(road.id, 'Road link refresh failed.');
          })
          .finally(() => {
            inFlight.current.delete(road.id);
          });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [centerlines, points, lines, tinSurfaces, roadCorridors, enabled]);
}
