import type { VisionSurvey } from '../utils/civilDrafterVision.ts';
import type { SynthesisQaReport } from '../utils/synthesisVerification.ts';
import type { RoadTakeReport } from '../utils/roadTakeReview.ts';
import type { GimbalRoadInspection, RoadMathModel } from '../utils/gimbalRoadModel.ts';
import type { RoadAcceptanceResult } from '../utils/roadRetakeLoop.ts';
import type { SurveyLine } from '../types.ts';

export interface GimbalVisionSnapshot {
  isScanning: boolean;
  survey: VisionSurvey | null;
  qa: SynthesisQaReport | null;
  roadReview: RoadTakeReport | null;
  mathModel: RoadMathModel | null;
  gimbalInspection: GimbalRoadInspection | null;
  inspectionSurvey: VisionSurvey | null;
  targetSurvey: VisionSurvey | null;
  isInspecting: boolean;
  acceptance: RoadAcceptanceResult<SurveyLine> | null;
}

const EMPTY_SNAPSHOT: GimbalVisionSnapshot = {
  isScanning: false,
  survey: null,
  qa: null,
  roadReview: null,
  mathModel: null,
  gimbalInspection: null,
  inspectionSurvey: null,
  targetSurvey: null,
  isInspecting: false,
  acceptance: null,
};

let snapshot: GimbalVisionSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

export const gimbalVisionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): GimbalVisionSnapshot {
    return snapshot;
  },
  update(patch: Partial<GimbalVisionSnapshot>): void {
    let changed = false;
    for (const key of Object.keys(patch) as Array<keyof GimbalVisionSnapshot>) {
      if (patch[key] !== undefined && patch[key] !== snapshot[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  },
  reset(): void {
    snapshot = EMPTY_SNAPSHOT;
    for (const listener of listeners) listener();
  },
};
