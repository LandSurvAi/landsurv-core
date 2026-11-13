/**
 * roadRetakeLoop.ts
 *
 * ROAD ACCEPTANCE LOOP
 * ────────────────────
 * The road drafting loop used to live inline in App.tsx with a hard cap of two
 * model redraws and a single aggregate score. This module owns the policy:
 *
 *   • up to 8 turns per road request (initial take + redraws + one confirmation)
 *   • gate count first, score second, so a gimmick score cannot displace a take
 *     that actually fixes more road properties
 *   • one confirmation redraw after the gates first pass; a regression keeps the
 *     verified incumbent
 *   • two consecutive no-improvement turns stop the loop (cost guard)
 *   • a budget-exhausted road commits the best take as UNVERIFIED, never as
 *     silently accepted
 *
 * The module is deliberately dependency-injected: App.tsx binds the chat,
 * frame capture, deterministic review and gate evaluation. That makes the
 * policy testable with fake models and keeps React state out of it.
 */

import type { DraftLineLike } from './synthesisVerification.ts';
import type { RoadTakeReport } from './roadTakeReview.ts';
import type { RoadMathModel } from './gimbalRoadModel.ts';
import {
  ROAD_GATE_IDS,
  createEmptyVerdict,
  detectWidthConflicts,
  formatRoadGateBrief,
  withGateResults,
  type RoadAcceptanceRequest,
  type RoadAcceptanceVerdict,
  type RoadGateId,
  type RoadGateResult,
  type RoadWidthConflict,
  type RoadWidthDecision,
  type RoadWidthResolution,
} from './roadAcceptanceGates.ts';

export const MAX_ROAD_TURNS = 8;
export const ROAD_STALL_LIMIT = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface RoadFrameImage {
  label: string;
  base64: string;
}

export interface RoadTurnRecord {
  turn: number;
  source: 'initial' | 'redraw' | 'confirmation';
  gatesPassed: number;
  gatesApplicable: number;
  score: number;
  coveragePct: number;
  widthDriftFt: number | null;
  verdict: 'pass' | 'reject' | 'no_geometry';
  redDefects: string[];
  criticVerdict?: 'accept' | 'reject' | 'uncertain' | 'unavailable';
  criticConfidence?: number;
  frameLabels: string[];
}

export interface RoadCriticDefect {
  gate: RoadGateId;
  stationFt?: number;
  severity?: 'red' | 'amber';
  detail: string;
}

export interface RoadCriticVerdict {
  verdict: 'accept' | 'reject' | 'uncertain';
  confidence: number;
  defects: RoadCriticDefect[];
}

export interface RoadRedrawRequest<T extends DraftLineLike> {
  turn: number;
  confirmation: boolean;
  prompt: string;
  frames: RoadFrameImage[];
  verdict: RoadAcceptanceVerdict | null;
  incumbentLines: T[];
}

export interface RoadCaptureRequest<T extends DraftLineLike = DraftLineLike> {
  turn: number;
  confirmation: boolean;
  verdict: RoadAcceptanceVerdict | null;
  currentLines: T[];
}

export interface RoadCriticRequest {
  turn: number;
  confirmation: boolean;
  verdict: RoadAcceptanceVerdict;
  frames: RoadFrameImage[];
  passOneModel: RoadMathModel;
}

export interface RoadAcceptanceResult<T extends DraftLineLike> {
  lines: T[];
  report: RoadTakeReport;
  verified: boolean;
  verdict: RoadAcceptanceVerdict;
  turns: RoadTurnRecord[];
  turnsUsed: number;
  bestTurn: number;
  remainingDefects: RoadGateResult[];
  confirmationRegressed: boolean;
  /** Present when the pass-1 model had two conflicting width clusters. */
  widthDecision?: RoadWidthDecision;
  widthTargets?: Record<string, number>;
}

export interface RoadLoopDeps<T extends DraftLineLike> {
  initialLines: T[];
  passOneModel: RoadMathModel;
  request?: RoadAcceptanceRequest;
  runReview(lines: T[]): { lines: T[]; report: RoadTakeReport };
  evaluateGates(lines: T[], context?: {
    widthTargets?: Record<string, number>;
    widthRanges?: Record<string, { minFt: number; maxFt: number }>;
  }): RoadAcceptanceVerdict;
  /** Pause before drawing and ask the user which width the corridor should hold. */
  resolveWidthConflict?(conflict: RoadWidthConflict): Promise<RoadWidthResolution | null>;
  redraw(request: RoadRedrawRequest<T>): Promise<T[] | null>;
  captureFrames?(request: RoadCaptureRequest<T>): Promise<RoadFrameImage[]>;
  reviewWithCritic?(request: RoadCriticRequest): Promise<RoadCriticVerdict | null>;
  onTurn?(record: RoadTurnRecord, verdict: RoadAcceptanceVerdict): void;
  shouldStop?(): boolean;
  maxTurns?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyReport(): RoadTakeReport {
  return {
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
}

function noGeometryRecord(turn: number, source: RoadTurnRecord['source']): RoadTurnRecord {
  return {
    turn,
    source,
    gatesPassed: 0,
    gatesApplicable: 0,
    score: 0,
    coveragePct: 0,
    widthDriftFt: null,
    verdict: 'no_geometry',
    redDefects: ['the redraw returned no usable geometry'],
    frameLabels: [],
  };
}

function redDefects(verdict: RoadAcceptanceVerdict): RoadGateResult[] {
  return verdict.gates.filter(gate => gate.applicable && !gate.passed && gate.severity === 'red');
}

function makeTurnRecord(
  turn: number,
  source: RoadTurnRecord['source'],
  verdict: RoadAcceptanceVerdict,
  critic: RoadCriticVerdict | null,
  frames: RoadFrameImage[],
): RoadTurnRecord {
  return {
    turn,
    source,
    gatesPassed: verdict.passedCount,
    gatesApplicable: verdict.applicableCount,
    score: verdict.score,
    coveragePct: verdict.coveragePct,
    widthDriftFt: verdict.widthDriftFt,
    verdict: verdict.acceptable ? 'pass' : 'reject',
    redDefects: redDefects(verdict).map(defect => defect.detail),
    criticVerdict: critic?.verdict ?? (critic === null ? 'unavailable' : undefined),
    criticConfidence: critic?.confidence,
    frameLabels: frames.map(frame => frame.label),
  };
}

/**
 * Gate count first, then score, then fewer red defects. This is the progress
 * rule: a later take never replaces an incumbent that clears more gates.
 */
export function isBetterTake(
  candidate: { turn: number; verdict: RoadAcceptanceVerdict },
  incumbent: { turn: number; verdict: RoadAcceptanceVerdict } | null,
): boolean {
  if (!incumbent) return true;
  if (candidate.verdict.passedCount !== incumbent.verdict.passedCount) {
    return candidate.verdict.passedCount > incumbent.verdict.passedCount;
  }
  if (candidate.verdict.score !== incumbent.verdict.score) {
    return candidate.verdict.score > incumbent.verdict.score;
  }
  const candidateRed = redDefects(candidate.verdict).length;
  const incumbentRed = redDefects(incumbent.verdict).length;
  return candidateRed < incumbentRed;
}

/** A confirmation redraw must not lose a gate, or give back coverage/width. */
export function confirmationRegressed(
  next: RoadAcceptanceVerdict,
  previous: RoadAcceptanceVerdict,
): boolean {
  if (!next.acceptable) return true;
  if (next.passedCount < previous.passedCount) return true;
  if (next.coveragePct < previous.coveragePct - 2) return true;
  if (
    next.widthDriftFt !== null
    && previous.widthDriftFt !== null
    && next.widthDriftFt > previous.widthDriftFt + 2
  ) {
    return true;
  }
  return false;
}

/**
 * A critic may reject only by naming a real gate. It can never force
 * acceptance, and an unknown/empty rejection is ignored.
 */
export function mergeCriticVerdict(
  verdict: RoadAcceptanceVerdict,
  critic: RoadCriticVerdict | null,
): RoadAcceptanceVerdict {
  if (!critic || critic.verdict !== 'reject') return verdict;
  const allowed = new Set<RoadGateId>(ROAD_GATE_IDS);
  const defects = critic.defects.filter(defect =>
    allowed.has(defect.gate)
    && defect.detail.trim()
    && typeof defect.stationFt === 'number'
    && Number.isFinite(defect.stationFt),
  );
  if (defects.length === 0) return verdict;

  const gates = verdict.gates.map(gate => ({ ...gate }));
  for (const defect of defects) {
    const existing = gates.find(gate => gate.id === defect.gate);
    if (existing) {
      existing.applicable = true;
      existing.passed = false;
      existing.severity = 'red';
      existing.detail = `${existing.detail} Critic: ${defect.detail}`;
      if (defect.stationFt !== undefined && defect.stationFt !== null) {
        existing.stationFt = defect.stationFt;
      }
    } else {
      gates.push({
        id: defect.gate,
        applicable: true,
        passed: false,
        severity: 'red',
        measured: null,
        allowed: null,
        stationFt: defect.stationFt ?? null,
        detail: `Critic: ${defect.detail}`,
      });
    }
  }
  return withGateResults(verdict, gates);
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────────────────────

export async function runRoadAcceptanceLoop<T extends DraftLineLike>(
  deps: RoadLoopDeps<T>,
): Promise<RoadAcceptanceResult<T>> {
  const maxTurns = Math.max(1, Math.min(MAX_ROAD_TURNS, Math.round(deps.maxTurns ?? MAX_ROAD_TURNS)));
  const turns: RoadTurnRecord[] = [];

  // Width clarification happens before drawing. It consumes no turn. A
  // dismissed question falls back to the narrower cluster and is audited.
  const widthTargets: Record<string, number> = {};
  const widthRanges: Record<string, { minFt: number; maxFt: number }> = {};
  let widthNote: string | undefined;
  let widthDecision: RoadWidthDecision | undefined;
  const widthConflict = detectWidthConflicts(deps.passOneModel)[0];
  if (widthConflict) {
    let resolution: RoadWidthResolution | null = null;
    if (deps.resolveWidthConflict) {
      try {
        resolution = await deps.resolveWidthConflict(widthConflict);
      } catch {
        resolution = null;
      }
    }
    if (!resolution) {
      resolution = {
        corridorId: widthConflict.corridorId,
        decision: 'assumed_narrow',
        widthFt: widthConflict.narrowWidthFt,
      };
    }
    widthDecision = resolution.decision;
    let chosenWidth: number | null = null;
    if (resolution.decision === 'narrow' || resolution.decision === 'assumed_narrow') {
      chosenWidth = widthConflict.narrowWidthFt;
    } else if (resolution.decision === 'wide') {
      chosenWidth = widthConflict.wideWidthFt;
    } else if (resolution.decision === 'custom') {
      chosenWidth = typeof resolution.widthFt === 'number' && Number.isFinite(resolution.widthFt)
        ? resolution.widthFt
        : null;
      if (chosenWidth === null) {
        widthDecision = 'assumed_narrow';
        chosenWidth = widthConflict.narrowWidthFt;
      }
    }
    if (chosenWidth !== null) widthTargets[widthConflict.corridorId] = chosenWidth;
    if (resolution.decision === 'transition') {
      widthRanges[widthConflict.corridorId] = {
        minFt: widthConflict.narrowWidthFt,
        maxFt: widthConflict.wideWidthFt,
      };
      widthNote = `taper ${widthConflict.corridorId} from ${widthConflict.narrowWidthFt.toFixed(1)} ft `
        + `at station ${widthConflict.narrowRange.endFt.toFixed(0)} to ${widthConflict.wideWidthFt.toFixed(1)} ft `
        + `by station ${widthConflict.wideRange.startFt.toFixed(0)}; hold the band in between.`;
    } else if (chosenWidth !== null) {
      widthNote = `hold ${widthConflict.corridorId} at ${chosenWidth.toFixed(1)} ft `
        + `(${widthDecision === 'assumed_narrow' ? 'dismissed conflict, narrower median' : `user selected ${widthDecision}`}).`;
    }
  }

  let incumbent: {
    turn: number;
    source: RoadTurnRecord['source'];
    lines: T[];
    report: RoadTakeReport;
    verdict: RoadAcceptanceVerdict;
  } | null = null;
  let confirmationPending = false;
  let confirmationRegressedFlag = false;
  let lastReport: RoadTakeReport = emptyReport();
  let stallCount = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (deps.shouldStop?.()) break;

    const source: RoadTurnRecord['source'] = turn === 1
      ? 'initial'
      : confirmationPending ? 'confirmation' : 'redraw';

    let candidateLines: T[];
    let candidateReport: RoadTakeReport;
    let frames: RoadFrameImage[] = [];

    if (turn === 1) {
      const reviewed = deps.runReview(deps.initialLines);
      candidateLines = reviewed.lines;
      candidateReport = reviewed.report;
      lastReport = candidateReport;
      if (deps.captureFrames) {
        try {
          frames = await deps.captureFrames({
            turn,
            confirmation: false,
            verdict: null,
            currentLines: candidateLines,
          });
        } catch {
          frames = [];
        }
      }
    } else {
      if (deps.captureFrames && incumbent) {
        try {
          frames = await deps.captureFrames({
            turn,
            confirmation: confirmationPending,
            verdict: incumbent.verdict,
            currentLines: incumbent.lines,
          });
        } catch {
          frames = [];
        }
      }

      const prompt = formatRoadGateBrief(
        deps.passOneModel,
        incumbent?.verdict ?? createEmptyVerdict(),
        {
          turn,
          maxTurns,
          confirmation: confirmationPending,
          frameLabels: frames.map(frame => frame.label),
          widthNote,
        },
      );

      const redrawn = await deps.redraw({
        turn,
        confirmation: confirmationPending,
        prompt,
        frames,
        verdict: incumbent?.verdict ?? null,
        incumbentLines: incumbent?.lines ?? [],
      });

      if (!redrawn || redrawn.length < 2) {
        turns.push(noGeometryRecord(turn, source));
        break;
      }

      const reviewed = deps.runReview(redrawn);
      candidateLines = reviewed.lines;
      candidateReport = reviewed.report;
      lastReport = candidateReport;
    }

    let verdict = deps.evaluateGates(candidateLines, { widthTargets, widthRanges });
    let critic: RoadCriticVerdict | null = null;
    // Cost control: the critic reviews the user-facing first take, a take that
    // is about to earn a confirmation, and the confirmation itself. Failed
    // redraws are already actionable from the deterministic gate table.
    const shouldConsultCritic = turn === 1
      || source === 'confirmation'
      || verdict.acceptable;
    if (deps.reviewWithCritic && shouldConsultCritic) {
      try {
        critic = await deps.reviewWithCritic({
          turn,
          confirmation: source === 'confirmation',
          verdict,
          frames,
          passOneModel: deps.passOneModel,
        });
        if (critic) verdict = mergeCriticVerdict(verdict, critic);
      } catch {
        critic = null;
      }
    }

    const record = makeTurnRecord(turn, source, verdict, critic, frames);
    turns.push(record);
    deps.onTurn?.(record, verdict);

    const candidate = {
      turn,
      source,
      lines: candidateLines,
      report: candidateReport,
      verdict,
    };

    // ── Confirmation turn: no regression, or keep the verified incumbent ────
    if (source === 'confirmation') {
      if (verdict.acceptable && incumbent && !confirmationRegressed(verdict, incumbent.verdict)) {
        return {
          lines: candidate.lines,
          report: candidate.report,
          verified: true,
          verdict,
          turns,
          turnsUsed: turns.length,
          bestTurn: candidate.turn,
          remainingDefects: [],
          confirmationRegressed: false,
          widthDecision,
          widthTargets,
        };
      }
      if (incumbent) {
        confirmationRegressedFlag = true;
        return {
          lines: incumbent.lines,
          report: incumbent.report,
          verified: incumbent.verdict.acceptable,
          verdict: incumbent.verdict,
          turns,
          turnsUsed: turns.length,
          bestTurn: incumbent.turn,
          remainingDefects: redDefects(incumbent.verdict),
          confirmationRegressed: true,
          widthDecision,
          widthTargets,
        };
      }
      confirmationRegressedFlag = true;
      break;
    }

    // ── First gate pass: spend one confirmation redraw ─────────────────────
    if (verdict.acceptable) {
      if (isBetterTake(candidate, incumbent)) incumbent = candidate;
      if (turn >= maxTurns) {
        return {
          lines: incumbent!.lines,
          report: incumbent!.report,
          verified: true,
          verdict: incumbent!.verdict,
          turns,
          turnsUsed: turns.length,
          bestTurn: incumbent!.turn,
          remainingDefects: [],
          confirmationRegressed: false,
          widthDecision,
          widthTargets,
        };
      }
      confirmationPending = true;
      stallCount = 0;
      continue;
    }

    // ── Progress / stall guard ─────────────────────────────────────────────
    if (isBetterTake(candidate, incumbent)) {
      incumbent = candidate;
      stallCount = 0;
    } else {
      stallCount++;
    }
    if (stallCount >= ROAD_STALL_LIMIT) break;
  }

  const best = incumbent ?? {
    turn: 1,
    source: 'initial' as const,
    lines: deps.initialLines,
    report: lastReport,
    verdict: createEmptyVerdict(),
  };

  return {
    lines: best.lines,
    report: best.report,
    verified: best.verdict.acceptable,
    verdict: best.verdict,
    turns,
    turnsUsed: turns.length,
    bestTurn: best.turn,
    remainingDefects: redDefects(best.verdict),
    confirmationRegressed: confirmationRegressedFlag,
    widthDecision,
    widthTargets,
  };
}
