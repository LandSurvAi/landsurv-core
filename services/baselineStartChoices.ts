/**
 * Baseline start selection helpers.
 *
 * A baseline start is a location, so the cursor flash should offer places to
 * start from instead of asking the user to type northing/easting values. The
 * chat form may still exist, but the flash is a one-click selection surface.
 */

import type { A2UIInputFormSpec, Centerline, SurveyPoint } from '../types.ts';
import { calculateCenterlineLength, formatStation } from '../utils/stationing.ts';

export const BASELINE_START_PICK_LABEL = 'Pick a start point on the canvas';

export interface BaselineStartChoice {
  label: string;
  northing: number;
  easting: number;
  kind: 'alignment-start' | 'alignment-end' | 'survey-point';
  /** Begin/end station of the source alignment, when the choice is an endpoint. */
  station?: number;
  alignmentName?: string;
}

/**
 * True when a chat input form is asking for the N/E of a baseline (or
 * alignment/centerline) start. Model-generated forms vary in wording, so the
 * test accepts both field ids and visible labels.
 */
export const isBaselineStartCoordinateForm = (form: A2UIInputFormSpec): boolean => {
  const context = `${form.title ?? ''} ${form.description ?? ''} ${form.submitLabel ?? ''}`.toLowerCase();
  if (!/\b(?:baseline|centerline|alignment)\b/.test(context)) return false;

  const fieldContext = form.fields
    .map(field => `${field.id} ${field.label} ${field.placeholder ?? ''}`)
    .join(' ')
    .toLowerCase();
  const hasNorthing = /\bnorthing\b|\bnorth\b|\bn\b/.test(fieldContext);
  const hasEasting = /\beasting\b|\beast\b|\be\b/.test(fieldContext);
  return hasNorthing && hasEasting;
};

/**
 * Build a short, ordered list of existing places a baseline can start from:
 * alignment ends first (the usual continuation/start targets), then recent
 * survey points. Labels carry the coordinates so a selected option is
 * self-explanatory when it is sent back to the agent.
 */
export const buildBaselineStartChoices = (options: {
  centerlines?: Centerline[];
  points?: SurveyPoint[];
  maxChoices?: number;
}): BaselineStartChoice[] => {
  const maxChoices = Math.max(1, Math.min(12, Math.round(options.maxChoices ?? 7)));
  const choices: BaselineStartChoice[] = [];

  const alignmentChoices: BaselineStartChoice[] = [];
  for (const centerline of options.centerlines ?? []) {
    if (centerline.pis.length === 0) continue;
    const first = centerline.pis[0];
    const last = centerline.pis[centerline.pis.length - 1];

    alignmentChoices.push({
      kind: 'alignment-start',
      station: centerline.beginStation,
      alignmentName: centerline.name,
      label:
        `Start ${centerline.name} · beginning · STA ${formatStation(centerline.beginStation)} · ` +
        `N ${first.northing.toFixed(2)} E ${first.easting.toFixed(2)}`,
      northing: first.northing,
      easting: first.easting,
    });

    if (centerline.pis.length > 1) {
      const endStation = centerline.beginStation + calculateCenterlineLength(centerline);
      alignmentChoices.push({
        kind: 'alignment-end',
        station: endStation,
        alignmentName: centerline.name,
        label:
          `Continue ${centerline.name} · end · STA ${formatStation(endStation)} · ` +
          `N ${last.northing.toFixed(2)} E ${last.easting.toFixed(2)}`,
        northing: last.northing,
        easting: last.easting,
      });
    }
  }

  // Continuation is the primary action, and after an extension the newest
  // alignment has the highest end station. Put those ends first so the second
  // continuation cannot silently pick the original 1+00 endpoint again.
  alignmentChoices.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'alignment-end' ? -1 : 1;
    if (a.kind === 'alignment-end') return (b.station ?? 0) - (a.station ?? 0);
    return (a.station ?? 0) - (b.station ?? 0);
  });
  choices.push(...alignmentChoices.slice(0, maxChoices));

  const recentPoints = (options.points ?? []).slice(-maxChoices);
  for (let index = recentPoints.length - 1; index >= 0 && choices.length < maxChoices; index -= 1) {
    const point = recentPoints[index];
    choices.push({
      kind: 'survey-point',
      label:
        `Point ${point.pointNumber}${point.description ? ` · ${point.description}` : ''} · ` +
        `N ${point.northing.toFixed(2)} E ${point.easting.toFixed(2)}`,
      northing: point.northing,
      easting: point.easting,
    });
  }

  return choices.slice(0, maxChoices);
};

/**
 * A BASELINE start that lands on an existing alignment's last PI is a
 * continuation, not a new alignment. Reusing that Centerline keeps its
 * beginStation, so the new segment's stations continue from the old EOP
 * instead of restarting at 1+00.
 */
export const findBaselineContinuationSource = (
  centerlines: Centerline[] | undefined,
  point: { easting: number; northing: number },
  tolerance = 1e-4,
): Centerline | null => {
  if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) return null;
  const limit = Math.max(0, Number.isFinite(tolerance) ? tolerance : 1e-4);

  let best: { centerline: Centerline; distance: number } | null = null;
  for (const centerline of centerlines ?? []) {
    if (centerline.pis.length === 0) continue;
    const end = centerline.pis[centerline.pis.length - 1];
    const distance = Math.hypot(end.easting - point.easting, end.northing - point.northing);
    if (distance > limit) continue;
    // Ties keep the earlier (normally active) alignment.
    if (!best || distance < best.distance) best = { centerline, distance };
  }

  return best?.centerline ?? null;
};

export const formatBaselineStartMessage = (choice: BaselineStartChoice): string => {
  const coordinates = `N ${choice.northing.toFixed(2)}, E ${choice.easting.toFixed(2)}`;

  if (choice.kind === 'alignment-end' && choice.station !== undefined) {
    return (
      `Continue ${choice.alignmentName ?? 'the baseline'} from its end at STA ${formatStation(choice.station)}. ` +
      `Start at ${coordinates} and set beginStation to ${choice.station.toFixed(2)}; ` +
      'do not reset the station to 0+00.'
    );
  }

  if (choice.kind === 'alignment-start' && choice.station !== undefined) {
    return (
      `Start at the beginning of ${choice.alignmentName ?? 'the baseline'} at STA ${formatStation(choice.station)}. ` +
      `Start the baseline at ${coordinates} with beginStation ${choice.station.toFixed(2)}.`
    );
  }

  return `Start the baseline at ${coordinates}.`;
};
