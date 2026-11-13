import { useEffect, useSyncExternalStore } from 'react';
import type { PointList } from '../types';
import { roadLinkRegistry } from '../services/roadLinkRegistry';

/**
 * Keeps generated station points bidirectionally linked to the RoadObject that
 * owns their baseline. Stationing skills and the automatic CL station marker
 * effect create the associations; this hook stamps the road object id and keeps
 * the registry's point-id cache in sync as points are regenerated or removed.
 *
 * It runs after either side changes, so a road object created later still
 * adopts station points that already exist on its baseline.
 */
export function useRoadObjectPointLinks(
  pointLists: PointList[],
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>,
): void {
  const roads = useSyncExternalStore(
    roadLinkRegistry.subscribe,
    roadLinkRegistry.getSnapshot,
    roadLinkRegistry.getSnapshot,
  );

  useEffect(() => {
    if (roads.length === 0) return;

    const roadByBaseline = new Map(roads.map(road => [road.baselineId, road]));
    let changed = false;
    const nextPointLists = pointLists.map(list => {
      let listChanged = false;
      const points = list.points.map(point => {
        const association = point.parametricAssociation;
        if (association?.kind !== 'centerline-station-point') return point;

        const road = roadByBaseline.get(association.sourceId);
        if (!road || association.roadObjectId === road.id) return point;

        listChanged = true;
        changed = true;
        return {
          ...point,
          parametricAssociation: { ...association, roadObjectId: road.id },
        };
      });
      return listChanged ? { ...list, points } : list;
    });

    if (changed) setPointLists(nextPointLists);

    const allPoints = (changed ? nextPointLists : pointLists).flatMap(list => list.points);
    const pointNumbers = new Set(allPoints.map(point => point.pointNumber));

    for (const road of roads) {
      const linkedPoints = allPoints.filter(point => {
        const association = point.parametricAssociation;
        return (
          association?.kind === 'centerline-station-point' &&
          association.sourceId === road.baselineId &&
          association.roadObjectId === road.id
        );
      });
      if (linkedPoints.length === 0) continue;

      // Keep existing linked road-model points that are still present, even if
      // they predate point-level associations.
      const retainedPointIds = road.linework.pointIds.filter(id => pointNumbers.has(id));
      const pointIds = [
        ...new Set([
          ...linkedPoints.map(point => point.pointNumber),
          ...retainedPointIds,
        ]),
      ];
      roadLinkRegistry.syncPointLinks(road.id, pointIds);
    }
  }, [pointLists, roads, setPointLists]);
}
