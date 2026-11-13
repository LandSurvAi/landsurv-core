/**
 * roadAcceptanceRecord.ts
 *
 * Compact, image-free audit record for one road acceptance run. Persisted in
 * the .lsvz manifest so reopening a project shows how the road was accepted
 * (or why it was committed unverified) without carrying base64 frames.
 */

import type { RoadAcceptanceRecord, RoadAcceptanceTurnRecord, SurveyLine } from '../types';
import { createEmptyVerdict } from './roadAcceptanceGates';
import type { RoadAcceptanceResult } from './roadRetakeLoop';
import type { RoadMathModel } from './gimbalRoadModel';
import type { RoadTakeReport } from './roadTakeReview';
import type { DraftLineLike } from './synthesisVerification';

export const ROAD_ACCEPTANCE_RECORD_LIMIT = 20;

export interface BuildRoadAcceptanceRecordArgs {
  result: RoadAcceptanceResult<DraftLineLike>;
  model: RoadMathModel;
  agent: 'CIVIL_DRAFTER' | 'ROADING_AGENT';
  requestText: string;
  widthDecision?: RoadAcceptanceRecord['widthDecision'];
  now?: number;
}

function toTurnRecord(turn: RoadAcceptanceResult<DraftLineLike>['turns'][number]): RoadAcceptanceTurnRecord {
  return {
    turn: turn.turn,
    source: turn.source,
    gatesPassed: turn.gatesPassed,
    gatesApplicable: turn.gatesApplicable,
    score: turn.score,
    coveragePct: turn.coveragePct,
    widthDriftFt: turn.widthDriftFt,
    verdict: turn.verdict,
    redDefects: [...turn.redDefects],
    criticVerdict: turn.criticVerdict,
    criticConfidence: turn.criticConfidence,
    frameLabels: [...turn.frameLabels],
  };
}

export function buildRoadAcceptanceRecord(
  args: BuildRoadAcceptanceRecordArgs,
): RoadAcceptanceRecord {
  const createdAt = args.now ?? Date.now();
  const id = `ra-${new Date(createdAt).toISOString().replace(/[:.]/g, '-')}`;
  return {
    id,
    createdAt,
    agent: args.agent,
    requestText: args.requestText,
    passOne: {
      corridors: args.model.corridors.length,
      sections: args.model.sections,
      totalLengthFt: args.model.totalLengthFt,
      medianWidthFt: args.model.widthFt,
    },
    tolerances: args.result.verdict.corridorTolerances.map(tolerance => ({ ...tolerance })),
    turns: args.result.turns.map(toTurnRecord),
    committedTurn: args.result.bestTurn,
    bestTurn: args.result.bestTurn,
    verified: args.result.verified,
    confirmationRegressed: args.result.confirmationRegressed,
    verdict: args.result.verdict,
    remainingDefects: args.result.remainingDefects.map(defect => defect.detail),
    widthDecision: args.widthDecision ?? args.result.widthDecision,
    widthTargets: args.result.widthTargets,
  };
}

const EMPTY_REPORT: RoadTakeReport = {
  status: 'clean',
  takes: 0,
  scoreBefore: 100,
  scoreAfter: 100,
  defectsFound: 0,
  defectsCorrected: 0,
  featuresAudited: 0,
  repairs: [],
  remaining: [],
  grounding: { osmWays: 0, parcelSegments: 0, supportedFeatures: 0, unsupportedFeatures: 0 },
  durationMs: 0,
};

/** Rebuild the HUD result from the image-free audit snapshot on .lsvz load. */
export function acceptanceResultFromRecord(
  record: RoadAcceptanceRecord,
): RoadAcceptanceResult<SurveyLine> {
  const verdict = record.verdict ?? createEmptyVerdict(
    'This saved road acceptance record predates the gate snapshot.',
  );
  return {
    lines: [],
    report: EMPTY_REPORT,
    verified: record.verified,
    verdict,
    turns: record.turns,
    turnsUsed: record.turns.length,
    bestTurn: record.bestTurn ?? record.committedTurn,
    remainingDefects: verdict.gates.filter(gate =>
      gate.applicable && !gate.passed && gate.severity === 'red',
    ),
    confirmationRegressed: record.confirmationRegressed ?? false,
    widthDecision: record.widthDecision,
    widthTargets: record.widthTargets,
  };
}

/** Keep the newest records only; the manifest must not grow forever. */
export function pruneRoadAcceptanceRecords(
  records: RoadAcceptanceRecord[],
  limit = ROAD_ACCEPTANCE_RECORD_LIMIT,
): RoadAcceptanceRecord[] {
  if (records.length <= limit) return records;
  return records.slice(records.length - limit);
}
