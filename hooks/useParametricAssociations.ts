import { useEffect, useRef } from 'react';
import type { Centerline, PointList, SurveyLine } from '../types';
import { generateParallelOffsetLinesForCenterline } from '../services/roadingSkillHandlers';
import {
  centerlineGeometrySignature,
  regenerateCenterlineStationPoints,
  regenerateParametricAssociations,
} from '../services/parametricAssociations';

/**
 * Keeps baseline-associated geometry live.
 *
 * Centerline edits flow through the normal `setCenterlines` state, so this
 * watch point covers the PI editor, baseline drawing/continuation, stationing
 * chat, stationing tools, and session load. Only actual geometry changes
 * trigger a rebuild; renaming/reordering baselines is ignored.
 *
 * Linework and points are regenerated independently. Points normally live in
 * point lists, so the caller passes `setPointLists` rather than a flat points
 * setter.
 */
export function useParametricAssociations(
  centerlines: Centerline[],
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>,
  setPointLists?: React.Dispatch<React.SetStateAction<PointList[]>>,
): void {
  const signaturesRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const next = new Map(
      centerlines.map(cl => [cl.id, centerlineGeometrySignature(cl)]),
    );
    const previous = signaturesRef.current;
    signaturesRef.current = next;

    // First render only establishes the baseline signatures.
    if (!previous) return;

    let changed = previous.size !== next.size;
    if (!changed) {
      for (const [id, signature] of next) {
        if (previous.get(id) !== signature) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    setLines(lines =>
      regenerateParametricAssociations(
        centerlines,
        lines,
        generateParallelOffsetLinesForCenterline,
      ),
    );

    if (setPointLists) {
      setPointLists(lists => {
        let listsChanged = false;
        const updated = lists.map(list => {
          const points = regenerateCenterlineStationPoints(centerlines, list.points);
          if (points === list.points) return list;
          listsChanged = true;
          return { ...list, points };
        });
        return listsChanged ? updated : lists;
      });
    }
  }, [centerlines, setLines, setPointLists]);
}
