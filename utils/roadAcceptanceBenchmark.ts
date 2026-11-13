/**
 * roadAcceptanceBenchmark.ts
 *
 * FPAR — first-pass acceptance rate — from persisted road acceptance records.
 *
 * FPAR = road requests whose initial take passes every applicable gate with
 * zero model redraws ÷ road requests in the corpus (spec §17.1).
 *
 * This module only measures. It deliberately does not claim that a corpus
 * exists: run it over the same 30 requests before and after a drafter change.
 */

import type { RoadAcceptanceRecord } from '../types';

export interface FparSummary {
  total: number;
  firstPassAccepted: number;
  fpar: number;
  verified: number;
  unverifiedRate: number;
}

export interface FparComparison {
  before: FparSummary;
  after: FparSummary;
  ratio: number | null;
  meetsTarget: boolean;
}

function firstTurn(record: RoadAcceptanceRecord): RoadAcceptanceRecord['turns'][number] | null {
  return record.turns.find(turn => turn.turn === 1) ?? record.turns[0] ?? null;
}

/** The first take passed every applicable gate; later redraws do not count. */
export function acceptedOnFirstPass(record: RoadAcceptanceRecord): boolean {
  const first = firstTurn(record);
  if (!first || first.verdict !== 'pass') return false;
  return first.gatesApplicable > 0 && first.gatesPassed >= first.gatesApplicable;
}

export function computeFpar(records: RoadAcceptanceRecord[]): FparSummary {
  const total = records.length;
  const firstPassAccepted = records.filter(acceptedOnFirstPass).length;
  const verified = records.filter(record => record.verified).length;
  return {
    total,
    firstPassAccepted,
    fpar: total > 0 ? firstPassAccepted / total : 0,
    verified,
    unverifiedRate: total > 0 ? (total - verified) / total : 0,
  };
}

export function compareFpar(before: FparSummary, after: FparSummary): FparComparison {
  const ratio = before.fpar === 0
    ? (after.fpar > 0 ? Infinity : 0)
    : after.fpar / before.fpar;
  return {
    before,
    after,
    ratio,
    meetsTarget: before.total > 0 && after.total > 0 && after.fpar >= 2 * before.fpar,
  };
}

export function formatFparSummary(label: string, summary: FparSummary): string {
  return `${label}: ${summary.firstPassAccepted}/${summary.total} first-pass accepted `
    + `(${(summary.fpar * 100).toFixed(1)}% FPAR, `
    + `${(summary.unverifiedRate * 100).toFixed(1)}% unverified commits)`;
}

export function formatFparComparison(comparison: FparComparison): string {
  const ratio = comparison.ratio === null
    ? 'n/a'
    : Number.isFinite(comparison.ratio)
      ? `${comparison.ratio.toFixed(2)}×`
      : '∞';
  return [
    formatFparSummary('BEFORE', comparison.before),
    formatFparSummary('AFTER', comparison.after),
    `RATIO: ${ratio} · TARGET ${comparison.meetsTarget ? 'MET' : 'NOT MET'} (≥ 2×)`,
  ].join('\n');
}
