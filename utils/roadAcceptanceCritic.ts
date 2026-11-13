/**
 * roadAcceptanceCritic.ts
 *
 * INDEPENDENT ROAD ACCEPTANCE CRITIC
 * ──────────────────────────────────
 * The critic is deliberately small and isolated:
 *
 *   • it gets the gate table, corridor tolerances and labelled frames
 *   • it never sees the drafter's prose, chat history or line JSON
 *   • its verdict is advisory and can only reject by naming a real RoadGateId
 *     AND a station
 *   • malformed or empty output becomes "unavailable", never a failure
 *
 * The parser lives here (not in App.tsx) so the strict JSON contract can be
 * tested without a model or a browser environment.
 */

import {
  ROAD_GATE_IDS,
  type RoadAcceptanceVerdict,
  type RoadGateId,
} from './roadAcceptanceGates.ts';
import type { RoadCriticDefect, RoadCriticVerdict } from './roadRetakeLoop.ts';

export interface RoadCriticPromptInput {
  turn: number;
  confirmation: boolean;
  verdict: RoadAcceptanceVerdict;
  frameLabels?: string[];
}

function gateRow(gate: RoadAcceptanceVerdict['gates'][number]): string {
  const status = !gate.applicable
    ? 'N/A'
    : gate.passed
      ? 'PASS'
      : `FAIL (${gate.severity})`;
  const measurements = [
    gate.measured !== null ? `measured ${gate.measured.toFixed(2)}` : null,
    gate.allowed !== null ? `allowed ${gate.allowed.toFixed(2)}` : null,
    gate.stationFt !== null ? `station ${gate.stationFt.toFixed(0)} ft` : null,
  ].filter((value): value is string => Boolean(value));
  return `- ${gate.id}: ${status}${measurements.length ? ` · ${measurements.join(' · ')}` : ''} — ${gate.detail}`;
}

export function buildRoadCriticPrompt(input: RoadCriticPromptInput): string {
  const { turn, confirmation, verdict } = input;
  const tolerances = verdict.corridorTolerances.map(tolerance =>
    `- ${tolerance.corridorId}: length ${tolerance.lengthFt.toFixed(0)} ft`
    + `${tolerance.medianWidthFt !== null ? ` · median width ${tolerance.medianWidthFt.toFixed(1)} ft` : ''}`
    + ` · width tol ±${tolerance.widthTolFt.toFixed(1)} ft`
    + ` · gap tol ${tolerance.gapTolFt.toFixed(0)} ft`
    + ` · endpoint tol ${tolerance.endpointTolFt.toFixed(0)} ft`,
  );

  return [
    'You are an independent road acceptance inspector.',
    'You do not know what the drafter intended, how it explained itself, or what it changed. You only see the deterministic gate table, the corridor tolerances and the labelled frames supplied with this message.',
    '',
    `TURN: ${turn}/8${confirmation ? ' (CONFIRMATION REDRAW)' : ''}`,
    `DETERMINISTIC RESULT: ${verdict.passedCount}/${verdict.applicableCount} gates passed · ${verdict.coveragePct.toFixed(1)}% coverage · ${verdict.shotRecallPct.toFixed(1)}% shot grounding`,
    '',
    'GATE TABLE:',
    ...verdict.gates.map(gateRow),
    '',
    'CORRIDOR TOLERANCES:',
    ...(tolerances.length > 0 ? tolerances : ['- none recorded']),
    '',
    'FRAMES:',
    ...(input.frameLabels?.length
      ? input.frameLabels.map(label => `- ${label}`)
      : ['- no frames supplied; judge only the gate table']),
    '',
    'ALLOWED GATE IDS:',
    ROAD_GATE_IDS.join(', '),
    '',
    'Return ONLY JSON with this shape:',
    '{"verdict":"accept"|"reject"|"uncertain","confidence":0.0,"defects":[{"gate":"continuity","stationFt":210,"severity":"red","detail":"what is visibly wrong"}]}',
    '',
    'RULES:',
    '- accept and uncertain add no defects and never force acceptance over a red deterministic gate.',
    '- reject MUST name at least one gate from ALLOWED GATE IDS and a numeric station in feet. A rejection without both is ignored.',
    '- Do not propose coordinates, edit geometry, or return a drawing contract. You are a reviewer, not the drafter.',
    '- Use amber only for a non-blocking observation; use red for a defect that should trigger another turn.',
    '- If the gate table already lists a failed gate, you may confirm it with a sharper detail and station.',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeConfidence(value: unknown): number {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(number)) return 0.5;
  const scaled = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, scaled));
}

function parseStationFt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const plus = value.match(/(\d+)\+(\d+(?:\.\d+)?)/);
  if (plus) return Number(plus[1]) * 100 + Number(plus[2]);
  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDefects(value: unknown): RoadCriticDefect[] {
  if (!Array.isArray(value)) return [];
  const defects: RoadCriticDefect[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const gate = String(record.gate ?? record.gateId ?? '').trim().toLowerCase();
    if (!ROAD_GATE_IDS.includes(gate as RoadGateId)) continue;
    const detail = String(record.detail ?? record.reason ?? record.message ?? '').trim();
    if (!detail) continue;
    const stationFt = parseStationFt(record.stationFt ?? record.station ?? record.station_ft);
    defects.push({
      gate: gate as RoadGateId,
      ...(stationFt !== null ? { stationFt } : {}),
      severity: record.severity === 'amber' ? 'amber' : 'red',
      detail,
    });
  }
  return defects;
}

function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

/**
 * Parse the critic contract. A reject is downgraded to uncertain when it does
 * not name a real gate and a station, so a vague "looks wrong" can never block
 * a gate-passing take. Malformed output returns null (recorded as unavailable).
 */
export function parseRoadCriticResponse(raw: string): RoadCriticVerdict | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const jsonText = extractJson(raw);
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root) return null;

  const token = String(root.verdict ?? root.result ?? '').trim().toLowerCase();
  const verdict: RoadCriticVerdict['verdict'] | null =
    token === 'accept' || token === 'pass'
      ? 'accept'
      : token === 'reject' || token === 'fail'
        ? 'reject'
        : token === 'uncertain' || token === 'unknown'
          ? 'uncertain'
          : null;
  if (!verdict) return null;

  const confidence = normalizeConfidence(root.confidence);
  const defects = parseDefects(root.defects);

  if (verdict === 'reject') {
    const actionable = defects.filter(defect =>
      typeof defect.stationFt === 'number' && Number.isFinite(defect.stationFt),
    );
    if (actionable.length === 0) {
      return { verdict: 'uncertain', confidence, defects: [] };
    }
    return { verdict, confidence, defects: actionable };
  }

  return { verdict, confidence, defects: [] };
}
