/**
 * Civil Drafter road paint CACP handlers.
 *
 * road_paint_catalog — presets, CAD layer/linetype rules, and available CLs.
 * road_paint_apply   — station a centerline (creating it through CL & Stationing
 *                      when needed) and commit 4-inch paint bands + callouts.
 * road_paint_clear   — remove generated paint without touching survey lines.
 */

import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import {
  AgentType,
  type Centerline,
  type RoadPaintMarkingId,
  type RoadPaintSpec,
  type StreetLabel,
  type SurveyLine,
  type SurveyPoint,
} from '../types';
import {
  ROAD_PAINT_PRESETS,
  buildRoadPaintMarkings,
  resolveRoadPaintSpec,
} from '../utils/roadPaint';
import { calculateCenterlineLength, formatStation } from '../utils/stationing';

export interface RoadPaintHandlerDeps {
  points: SurveyPoint[];
  centerlines: Centerline[];
  setCenterlines?: React.Dispatch<React.SetStateAction<Centerline[]>>;
  lines: SurveyLine[];
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  streetLabels?: StreetLabel[];
  setStreetLabels?: React.Dispatch<React.SetStateAction<StreetLabel[]>>;
  logActionToFieldbook: (msg: string) => void;
  openRoadPaintStudio?: (spec?: RoadPaintSpec) => void;
}

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
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

const MARKINGS: RoadPaintMarkingId[] = ['EP', 'WL', 'SWL', 'DYL'];

function readMarking(value: unknown): RoadPaintMarkingId | null {
  const text = String(value ?? '').trim().toUpperCase() as RoadPaintMarkingId;
  return MARKINGS.includes(text) ? text : null;
}

function readSpec(data: Record<string, unknown>): RoadPaintSpec {
  const spec: RoadPaintSpec = {
    marking: readMarking(data.marking) ?? 'DYL',
  };
  if (typeof data.centerlineId === 'string' && data.centerlineId.trim()) {
    spec.centerlineId = data.centerlineId.trim();
  }
  if (typeof data.centerlineName === 'string' && data.centerlineName.trim()) {
    spec.centerlineName = data.centerlineName.trim();
  }
  if (Array.isArray(data.pointNumbers)) {
    spec.pointNumbers = data.pointNumbers.map(String).filter(Boolean);
  }
  if (data.side === 'left' || data.side === 'right' || data.side === 'both') {
    spec.side = data.side;
  }
  if (typeof data.offsetIn === 'number' && Number.isFinite(data.offsetIn)) spec.offsetIn = data.offsetIn;
  if (typeof data.widthIn === 'number' && Number.isFinite(data.widthIn)) spec.widthIn = data.widthIn;
  if (typeof data.separationIn === 'number' && Number.isFinite(data.separationIn)) {
    spec.separationIn = data.separationIn;
  }
  if (typeof data.stationStepFt === 'number' && Number.isFinite(data.stationStepFt)) {
    spec.stationStepFt = data.stationStepFt;
  }
  if (typeof data.labelIntervalFt === 'number' && Number.isFinite(data.labelIntervalFt)) {
    spec.labelIntervalFt = data.labelIntervalFt;
  }
  if (typeof data.startStation === 'string' || typeof data.startStation === 'number') {
    spec.startStation = data.startStation;
  }
  if (typeof data.endStation === 'string' || typeof data.endStation === 'number') {
    spec.endStation = data.endStation;
  }
  if (typeof data.lineType === 'string' && data.lineType.trim()) spec.lineType = data.lineType.trim();
  if (typeof data.color === 'string' && data.color.trim()) spec.color = data.color.trim();
  if (typeof data.layer === 'string' && data.layer.trim()) spec.layer = data.layer.trim();
  if (data.annotate === false) spec.annotate = false;
  if (data.replaceExisting === false) spec.replaceExisting = false;
  return spec;
}

const paintErrorMessage = (available: Centerline[]): string => {
  if (available.length === 0) {
    return (
      'No centerline exists yet. Establish one first — the CL & Stationing agent owns stationing ' +
      '(askPeer cl_create_from_points), then paint WL, SWL or DYL against that alignment.'
    );
  }
  return (
    `No matching centerline. Available alignments: ${available
      .map(cl => `${cl.name} (${cl.id})`)
      .join(', ')}. Pass centerlineId/centerlineName, or pass ordered pointNumbers so the handler can create the alignment.`
  );
};

export function registerRoadPaintSkillHandlers(
  getDeps: () => RoadPaintHandlerDeps,
): () => void {
  const unsubs: Array<() => void> = [];

  // ── road_paint_catalog ──────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('road_paint_catalog', async (message) => {
      const deps = getDeps();
      const centerlines = deps.centerlines.map(cl => {
        const lengthFt = calculateCenterlineLength(cl);
        return {
          id: cl.id,
          name: cl.name,
          beginStation: cl.beginStation,
          endStation: cl.beginStation + lengthFt,
          lengthFt,
        };
      });

      return respond(message, true, {
        markings: ROAD_PAINT_PRESETS.map(preset => ({
          id: preset.id,
          label: preset.label,
          paint: preset.paint,
          color: preset.color,
          layer: preset.layer,
          lineType: preset.lineType,
          offsetsIn: preset.stripeOffsetsIn,
          widthIn: preset.defaultWidthIn,
          description: preset.description,
        })),
        centerlines,
        paintRules: [
          'EP (edge of pavement) is a surveyed reference used to fit/check the centerline — it is never paint.',
          'SWL/WL is ONE white stripe; DYL is TWO yellow stripes.',
          'Paint is a real 4-inch-wide band, not a CAD lineweight.',
          'Paint is offset 8 inches each side of the centerline by default (DYL), or 8 inches to one side for SWL/WL.',
          'Stationing and annotation come from the CL & Stationing alignment; do not invent stations.',
          'WL/SWL use L-ROAD-PAINT-W with CONTINUOUS; DYL uses L-ROAD-PAINT-Y with CONTINUOUS.',
        ],
      });
    }),
  );

  // ── road_paint_apply ────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('road_paint_apply', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const spec = readSpec(data);
      const marking = readMarking(data.marking);

      if (!marking) {
        return respond(
          message,
          false,
          undefined,
          `Unknown marking "${String(data.marking ?? '')}". Use WL, SWL or DYL for paint (EP is a reference feature).`,
        );
      }
      if (marking === 'EP') {
        return respond(
          message,
          false,
          undefined,
          'EP (edge of pavement) is a surveyed reference, not paint. Fit the centerline between the EP shots, then apply WL, SWL or DYL.',
        );
      }

      if (data.openStudio === true) {
        const deps = getDeps();
        if (!deps.openRoadPaintStudio) {
          return respond(message, false, undefined, 'The Road Paint Studio A2UI is not mounted in this workspace.');
        }
        deps.openRoadPaintStudio(spec);
        return respond(message, true, {
          opened: true,
          marking,
          message: 'Road Paint Studio opened. Choose the alignment, offset and station range, then apply.',
        });
      }

      let deps = getDeps();
      let centerline: Centerline | undefined;
      if (spec.centerlineId) {
        centerline = deps.centerlines.find(cl => cl.id === spec.centerlineId);
      }
      if (!centerline && spec.centerlineName) {
        const wanted = spec.centerlineName.trim().toLowerCase();
        centerline = deps.centerlines.find(cl => cl.name.trim().toLowerCase() === wanted);
      }

      let centerlineSource: 'existing' | 'cl_create_from_points' = 'existing';
      if (!centerline && spec.pointNumbers && spec.pointNumbers.length >= 2) {
        const points = spec.pointNumbers
          .map(number => deps.points.find(p => p.pointNumber === number))
          .filter((p): p is SurveyPoint => Boolean(p));
        if (points.length >= 2) {
          const response = await interAgentComm.askPeer(
            AgentType.CIVIL_DRAFTER,
            'cl_create_from_points',
            {
              name: spec.centerlineName || `${marking} CL`,
              points: points.map(p => ({
                pointNumber: p.pointNumber,
                northing: p.northing,
                easting: p.easting,
                description: p.description,
              })),
            },
            { timeoutMs: 8000, useCache: false },
          );
          const created = response?.data?.centerline as Centerline | undefined;
          if (response?.success && created) {
            centerline = created;
            centerlineSource = 'cl_create_from_points';
            deps = getDeps();
            if (!deps.centerlines.some(cl => cl.id === created.id)) {
              deps.setCenterlines?.(prev => [created, ...prev.filter(cl => cl.name !== created.name)]);
            }
          }
        }
      }

      if (!centerline) {
        return respond(message, false, undefined, paintErrorMessage(getDeps().centerlines));
      }

      const resolved = resolveRoadPaintSpec(spec, centerline);
      if ('error' in resolved) return respond(message, false, undefined, resolved.error);

      const built = buildRoadPaintMarkings(centerline, resolved.spec);
      if (built.lines.length === 0) {
        return respond(
          message,
          false,
          undefined,
          `Could not sample paint geometry on "${centerline.name}". Check the alignment geometry and station range.`,
        );
      }

      const replaceExisting = spec.replaceExisting !== false;
      const samePaint = (line: SurveyLine) =>
        line.type === 'road-paint' &&
        line.roadPaint?.marking === resolved.spec.marking &&
        line.roadPaint?.centerlineId === centerline!.id;
      const removedLines = replaceExisting ? deps.lines.filter(samePaint).length : 0;
      deps.setLines(prev => [
        ...prev.filter(line => !(replaceExisting && samePaint(line))),
        ...built.lines,
      ]);

      if (deps.setStreetLabels) {
        const sameLabel = (label: StreetLabel) =>
          label.roadPaint?.marking === resolved.spec.marking &&
          label.roadPaint?.centerlineId === centerline!.id;
        deps.setStreetLabels(prev => [
          ...prev.filter(label => !(replaceExisting && sameLabel(label))),
          ...built.labels,
        ]);
      }

      const range = `${formatStation(resolved.spec.startStation)}–${formatStation(resolved.spec.endStation)}`;
      const sideText =
        resolved.spec.marking === 'DYL'
          ? `${resolved.spec.stripeOffsetsIn.map(o => `${Math.abs(o)} in`).join(' each side / ')} each side`
          : `${resolved.spec.stripeOffsetsIn[0] >= 0 ? 'right' : 'left'} of CL`;
      const messageText =
        `Painted ${resolved.spec.marking} (${resolved.spec.label}) on "${centerline.name}" ` +
        `from ${range}: ${built.stripeCount} stripe${built.stripeCount === 1 ? '' : 's'} ` +
        `${resolved.spec.widthIn} in wide, ${sideText}. ` +
        `${built.segmentCount} bands on ${resolved.spec.layer} (${resolved.spec.lineType})` +
        `${built.labels.length > 0 ? ` with ${built.labels.length} station callouts` : ''}.`;

      deps.logActionToFieldbook(`Civil Drafter: ${messageText}`);

      return respond(message, true, {
        applied: true,
        marking: resolved.spec.marking,
        centerlineId: centerline.id,
        centerlineName: centerline.name,
        stripeCount: built.stripeCount,
        segmentCount: built.segmentCount,
        lengthFt: Number(built.lengthFt.toFixed(2)),
        startStation: resolved.spec.startStation,
        endStation: resolved.spec.endStation,
        layer: resolved.spec.layer,
        lineType: resolved.spec.lineType,
        color: resolved.spec.color,
        annotationCount: built.labels.length,
        paintedAreaSqFt: Number(built.paintedAreaSqFt.toFixed(2)),
        centerlineSource,
        replacedLineCount: removedLines,
        message: messageText,
      });
    }),
  );

  // ── road_paint_clear ────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('road_paint_clear', async (message) => {
      const deps = getDeps();
      const data = (message.data ?? {}) as Record<string, unknown>;
      const marking = readMarking(data.marking);
      const centerlineId = typeof data.centerlineId === 'string' ? data.centerlineId : undefined;

      const matches = (markingId?: RoadPaintMarkingId, clId?: string) =>
        (!markingId || markingId === marking) && (!clId || clId === centerlineId);

      const removedLines = deps.lines.filter(
        line => line.type === 'road-paint' && matches(line.roadPaint?.marking, line.roadPaint?.centerlineId),
      ).length;
      if (removedLines > 0) {
        deps.setLines(prev =>
          prev.filter(
            line => !(line.type === 'road-paint' && matches(line.roadPaint?.marking, line.roadPaint?.centerlineId)),
          ),
        );
      }

      let removedLabels = 0;
      if (deps.setStreetLabels) {
        removedLabels = (deps.streetLabels ?? []).filter(
          label => Boolean(label.roadPaint) && matches(label.roadPaint?.marking, label.roadPaint?.centerlineId),
        ).length;
        if (removedLabels > 0) {
          deps.setStreetLabels(prev =>
            prev.filter(
              label => !(label.roadPaint && matches(label.roadPaint.marking, label.roadPaint.centerlineId)),
            ),
          );
        }
      }

      const scope = [marking ?? 'all paint', centerlineId ? `on ${centerlineId}` : 'on every alignment'].join(' ');
      const messageText = `Removed ${removedLines} paint band${removedLines === 1 ? '' : 's'} and ${removedLabels} callout${
        removedLabels === 1 ? '' : 's'
      } (${scope}).`;
      deps.logActionToFieldbook(`Civil Drafter: ${messageText}`);

      return respond(message, true, {
        removedLines,
        removedLabels,
        message: messageText,
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
