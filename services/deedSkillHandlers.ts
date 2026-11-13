// Deed / Boundary Agent CACP skill handlers.
// Wires the skills declared in services/deedSkillSchemas.ts to the live
// Boundary Agent state in App.tsx (documents, descriptions, boundary files,
// calls, alignment, transforms, POB, and draft-to-linework).
//
// Usage in App.tsx:
//   useDeedSkillHandlers({ deedFile, deedSummary, boundaryFiles, ... });

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import { findBoundaryFileForTract } from '../utils/boundaryTractFiles.ts';
import type {
  BoundaryFile,
  BoundaryFileCall,
  DeedSummary,
  DeedTractSummary,
  PointList,
  SessionFile,
  SurveyPoint,
} from '../types';

export interface DeedSkillHandlersOpts {
  deedFile: SessionFile | null;
  deedSummary: DeedSummary | null;
  boundaryFiles: BoundaryFile[];
  activeBoundaryFileId: string;
  points: SurveyPoint[];
  pointLists: PointList[];
  computingTractIds: Set<string>;

  setActiveBoundaryFileId: (id: string) => void;
  setBoundaryFiles: Dispatch<SetStateAction<BoundaryFile[]>>;
  setIsBoundaryEditorVisible: (visible: boolean) => void;
  setIsBoundaryDialogMinimized: (minimized: boolean) => void;
  setBoundaryAlignmentDockMode: (mode: 'floating' | 'toolshelf') => void;
  setIsBoundaryAlignmentOpen: (open: boolean) => void;
  setBoundaryCornerAlignRequest: (request: { token: number; movableBfId: string } | null) => void;

  onOpenDescription: (tractId: string, snippet?: string) => void;
  onParseTracts: (
    tractIds: string[],
    pob?: { easting: number; northing: number } | null,
    opts?: { draw?: boolean },
  ) => void;
  onParseAll: (opts?: { draw?: boolean }) => void;
  onUpdateCall: (fileId: string, callId: string, patch: Partial<BoundaryFileCall>) => void;
  onAssociatePoints: (fileId: string, pointIds: string[]) => void;
  onDisassociatePoint: (fileId: string, pointId: string) => void;
  onBestFit: (fileId: string) => void;
  onTransform: (
    fileId: string,
    patch: { translationE?: number | null; translationN?: number | null; rotationDeg?: number | null },
    opts?: { immediate?: boolean },
  ) => void;
  onPobChange: (
    fileId: string,
    patch: { pointNumber?: string; pobOverride?: { easting: number; northing: number } | null },
  ) => void;
  onDrawToLinework: (fileId: string, opts?: { silent?: boolean }) => void;
  logActionToFieldbook: (msg: string) => void;
}

type TractState = 'pending' | 'computing' | 'ready' | 'drafted';

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: msg.id,
    from: AgentType.DEED_READER,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

function allProjectPoints(opts: DeedSkillHandlersOpts): SurveyPoint[] {
  const byNumber = new Map<string, SurveyPoint>();
  for (const point of opts.points) byNumber.set(point.pointNumber, point);
  for (const list of opts.pointLists) {
    for (const point of list.points) {
      if (!byNumber.has(point.pointNumber)) byNumber.set(point.pointNumber, point);
    }
  }
  return Array.from(byNumber.values());
}

function pointMap(opts: DeedSkillHandlersOpts): Map<string, SurveyPoint> {
  return new Map(allProjectPoints(opts).map(point => [point.pointNumber, point]));
}

/** Mirrors the lookup used by the deed-summary A2UI card. */
function fileForTract(
  files: BoundaryFile[],
  tract: DeedTractSummary,
  deedFileName?: string,
): BoundaryFile | undefined {
  return findBoundaryFileForTract(files, tract, deedFileName);
}

function stateForTract(
  tract: DeedTractSummary,
  file: BoundaryFile | undefined,
  computing: Set<string>,
): TractState {
  if (computing.has(tract.tractId)) return 'computing';
  if (!file) return 'pending';
  if ((file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0) return 'drafted';
  return 'ready';
}

function findBoundaryFile(opts: DeedSkillHandlersOpts, idOrName?: unknown): BoundaryFile | undefined {
  const raw = typeof idOrName === 'string' ? idOrName.trim() : '';
  if (!raw) {
    return opts.boundaryFiles.find(file => file.id === opts.activeBoundaryFileId) ?? opts.boundaryFiles[0];
  }
  const key = raw.toLowerCase();
  return (
    opts.boundaryFiles.find(file => file.id === raw) ??
    opts.boundaryFiles.find(file => file.id.toLowerCase() === key) ??
    opts.boundaryFiles.find(file => file.name.toLowerCase() === key) ??
    opts.boundaryFiles.find(file => file.name.toLowerCase().includes(key))
  );
}

function findTract(
  summary: DeedSummary | null,
  tractId?: unknown,
  index?: unknown,
): DeedTractSummary | undefined {
  if (!summary) return undefined;
  const raw = typeof tractId === 'string' ? tractId.trim() : '';
  if (raw) {
    const key = raw.toLowerCase();
    const exact =
      summary.tracts.find(tract => tract.tractId.toLowerCase() === key) ??
      summary.tracts.find(tract => (tract.tractName ?? '').toLowerCase() === key);
    if (exact) return exact;
    const partial =
      summary.tracts.find(tract => tract.tractId.toLowerCase().includes(key)) ??
      summary.tracts.find(tract => (tract.tractName ?? '').toLowerCase().includes(key));
    if (partial) return partial;
  }
  if (typeof index === 'number' && Number.isFinite(index)) {
    return summary.tracts[Math.trunc(index) - 1];
  }
  return undefined;
}

function callRows(opts: DeedSkillHandlersOpts, file: BoundaryFile): Array<Record<string, unknown>> {
  const pts = pointMap(opts);
  return file.calls.map((call, i) => {
    const fromPoint = pts.get(call.from);
    const toPoint = pts.get(call.to);
    return {
      index: i + 1,
      id: call.id,
      from: call.from,
      to: call.to,
      bearing: call.bearing,
      distance: call.distance,
      isCurve: Boolean(call.isCurve),
      curveRadius: call.curveRadius,
      arcLength: call.arcLength,
      chordBearing: call.chordBearing,
      chordDistance: call.chordDistance,
      tangentBearing: call.tangentBearing,
      curveDirection: call.curveDirection,
      toDescription: call.toDescription,
      fromPoint: fromPoint
        ? {
            pointNumber: fromPoint.pointNumber,
            northing: fromPoint.northing,
            easting: fromPoint.easting,
            description: fromPoint.description,
          }
        : null,
      toPoint: toPoint
        ? {
            pointNumber: toPoint.pointNumber,
            northing: toPoint.northing,
            easting: toPoint.easting,
            description: toPoint.description,
          }
        : null,
    };
  });
}

function fileSummary(file: BoundaryFile): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    createdAt: file.createdAt,
    sourceTractId: file.sourceTractId,
    callCount: file.calls.length,
    curveCount: file.calls.filter(call => call.isCurve).length,
    hidden: Boolean(file.hidden),
    associatedPointCount: file.associatedPointIds?.length ?? 0,
    translationE: file.translationE ?? 0,
    translationN: file.translationN ?? 0,
    rotationDeg: file.rotationDeg ?? 0,
    pobOverride: file.pobOverride ?? null,
    drawn: (file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0,
    drawnPointCount: file.drawnPointIds?.length ?? 0,
    drawnLineCount: file.drawnLineIds?.length ?? 0,
    deedConfidence: file.deedConfidence,
  };
}

function descriptionRow(
  tract: DeedTractSummary,
  file: BoundaryFile | undefined,
  computing: Set<string>,
  includeSnippet: boolean,
): Record<string, unknown> {
  const state = stateForTract(tract, file, computing);
  return {
    tractId: tract.tractId,
    tractName: tract.tractName,
    sourcePage: tract.sourcePage,
    acreage: tract.acreage,
    parcelId: tract.parcelId,
    grantor: tract.grantor,
    grantee: tract.grantee,
    reason: tract.reason,
    snippet: includeSnippet ? tract.snippet : undefined,
    status: state,
    needsSource: state === 'pending' && Boolean(tract.reason),
    boundaryFileId: file?.id,
    boundaryFileName: file?.name,
    callCount: file?.calls.length ?? 0,
    drafted: state === 'drafted',
  };
}

export function registerDeedSkillHandlers(getOpts: () => DeedSkillHandlersOpts): () => void {
  const unsubs: Array<() => void> = [];

  // ── deed_get_status ─────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_get_status', async (message) => {
      const opts = getOpts();
      const summary = opts.deedSummary;
      const tracts = summary?.tracts ?? [];
      const files = opts.boundaryFiles;
      const computing = opts.computingTractIds;
      const statuses = tracts.map(tract => stateForTract(tract, fileForTract(files, tract, summary?.fileName), computing));
      const extracted = statuses.filter(status => status !== 'pending' && status !== 'computing').length;
      const pending = statuses.filter(status => status === 'pending').length;
      const computingCount = statuses.filter(status => status === 'computing').length;
      const meta = opts.deedFile?.deedMetadata;
      return respond(message, true, {
        loaded: Boolean(opts.deedFile || summary),
        fileName: opts.deedFile?.name ?? summary?.fileName,
        metadata: {
          owner: summary?.owner ?? meta?.owners?.[0],
          grantor: summary?.grantor,
          parcelId: summary?.parcelId ?? meta?.parcelId,
          book: summary?.book ?? meta?.deedBook,
          page: summary?.page ?? meta?.deedPage,
        },
        descriptionCount: tracts.length,
        extractedCount: extracted,
        pendingCount: pending,
        computingCount,
        boundaryFileCount: files.length,
        activeBoundaryFileId: opts.activeBoundaryFileId || files[0]?.id,
        summary: !opts.deedFile && !summary
          ? 'No deed is loaded. Upload a deed PDF or paste a legal description first.'
          : `${tracts.length} description${tracts.length === 1 ? '' : 's'} detected, ` +
            `${extracted} extracted, ${pending} pending, ${computingCount} extracting; ` +
            `${files.length} boundary file${files.length === 1 ? '' : 's'} in session.`,
      });
    }),
  );

  // ── deed_list_documents ─────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_list_documents', async (message) => {
      const opts = getOpts();
      const summary = opts.deedSummary;
      const documents: Array<Record<string, unknown>> = [];
      if (opts.deedFile || summary) {
        const meta = opts.deedFile?.deedMetadata;
        documents.push({
          id: opts.deedFile?.name ?? summary?.fileName ?? 'deed',
          name: opts.deedFile?.name ?? summary?.fileName ?? 'Deed',
          loaded: true,
          contentLength: opts.deedFile?.content?.length ?? 0,
          owner: summary?.owner ?? meta?.owners?.[0],
          grantor: summary?.grantor,
          parcelId: summary?.parcelId ?? meta?.parcelId,
          book: summary?.book ?? meta?.deedBook,
          page: summary?.page ?? meta?.deedPage,
          descriptionCount: summary?.tracts.length ?? 0,
          boundaryFileCount: opts.boundaryFiles.length,
        });
      }
      return respond(message, true, {
        documents,
        count: documents.length,
        activeDocument: documents[0]?.name,
      });
    }),
  );

  // ── deed_get_metadata ───────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_get_metadata', async (message) => {
      const opts = getOpts();
      const summary = opts.deedSummary;
      const meta = opts.deedFile?.deedMetadata;
      return respond(message, true, {
        fileName: opts.deedFile?.name ?? summary?.fileName,
        owner: summary?.owner ?? meta?.owners?.[0],
        grantor: summary?.grantor,
        parcelId: summary?.parcelId ?? meta?.parcelId,
        book: summary?.book ?? meta?.deedBook,
        page: summary?.page ?? meta?.deedPage,
        descriptions: (summary?.tracts ?? []).map(tract => ({
          tractId: tract.tractId,
          tractName: tract.tractName,
          sourcePage: tract.sourcePage,
          acreage: tract.acreage,
        })),
      });
    }),
  );

  // ── deed_list_descriptions ──────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_list_descriptions', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const statusFilter = typeof d.status === 'string' ? d.status : 'all';
      const includeSnippet = d.includeSnippet !== false;
      const summary = opts.deedSummary;
      const tracts = summary?.tracts ?? [];
      const computing = opts.computingTractIds;
      const rows = tracts
        .map(tract => descriptionRow(tract, fileForTract(opts.boundaryFiles, tract, summary?.fileName), computing, includeSnippet))
        .filter(row => statusFilter === 'all' || row.status === statusFilter);
      const counts = { pending: 0, computing: 0, ready: 0, drafted: 0 };
      for (const tract of tracts) {
        const status = stateForTract(tract, fileForTract(opts.boundaryFiles, tract, summary?.fileName), computing);
        counts[status] += 1;
      }
      return respond(message, true, {
        descriptions: rows,
        totalCount: rows.length,
        counts,
        fileName: opts.deedFile?.name ?? summary?.fileName,
      });
    }),
  );

  // ── deed_get_description ────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_get_description', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const summary = opts.deedSummary;
      const tract = findTract(summary, d.tractId, d.index);
      if (!tract) {
        const available = (summary?.tracts ?? []).map(t => t.tractId).join(', ') || 'none';
        return respond(message, false, undefined, `Description not found. Available: ${available}.`);
      }
      const file = fileForTract(opts.boundaryFiles, tract, summary?.fileName);
      return respond(message, true, {
        found: true,
        description: descriptionRow(tract, file, opts.computingTractIds, true),
        boundaryFile: file ? fileSummary(file) : null,
        calls: file ? callRows(opts, file) : [],
        message: `${tract.tractId}${tract.tractName ? ` (${tract.tractName})` : ''} — ` +
          `${file?.calls.length ?? 0} call(s), status ${stateForTract(tract, file, opts.computingTractIds)}.`,
      });
    }),
  );

  // ── deed_open_description ───────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_open_description', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const tract = findTract(opts.deedSummary, d.tractId, d.index);
      if (!tract) return respond(message, false, undefined, 'Description not found.');
      const text = tract.snippet?.trim() || tract.reason?.trim() || tract.tractName?.trim() || tract.tractId;
      opts.onOpenDescription(tract.tractId, text);
      return respond(message, true, {
        opened: true,
        tractId: tract.tractId,
        editorFile: opts.deedFile?.name ?? `${tract.tractId} — Description.txt`,
      });
    }),
  );

  // ── deed_parse_description ──────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_parse_description', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const summary = opts.deedSummary;
      if (!summary || summary.tracts.length === 0) {
        return respond(message, false, undefined, 'No descriptions are loaded. Upload or summarize a deed first.');
      }

      const requested: string[] = [];
      if (Array.isArray(d.tractIds)) requested.push(...d.tractIds.map(String));
      if (typeof d.tractId === 'string' && d.tractId.trim()) requested.push(d.tractId.trim());

      const tracts: DeedTractSummary[] = [];
      const unknown: string[] = [];
      for (const id of requested) {
        const tract = findTract(summary, id);
        if (tract) {
          if (!tracts.some(t => t.tractId === tract.tractId)) tracts.push(tract);
        } else {
          unknown.push(id);
        }
      }
      if (tracts.length === 0) {
        return respond(
          message,
          false,
          undefined,
          unknown.length > 0
            ? `Unknown description(s): ${unknown.join(', ')}. Available: ${summary.tracts.map(t => t.tractId).join(', ')}.`
            : 'Provide tractIds (array) or tractId (string).',
        );
      }

      let pob: { easting: number; northing: number } | null = null;
      if (typeof d.pointNumber === 'string' && d.pointNumber.trim()) {
        const point = pointMap(opts).get(d.pointNumber.trim());
        if (!point) return respond(message, false, undefined, `POB point ${d.pointNumber} was not found in the project.`);
        pob = { easting: point.easting, northing: point.northing };
      } else if (typeof d.easting === 'number' && typeof d.northing === 'number' &&
                 Number.isFinite(d.easting) && Number.isFinite(d.northing)) {
        pob = { easting: d.easting, northing: d.northing };
      }

      const ids = tracts.map(tract => tract.tractId);
      const draw = d.draw === true;
      opts.onParseTracts(ids, pob, { draw });
      return respond(message, true, {
        accepted: true,
        tractIds: ids,
        drawRequested: draw,
        message: `Started extraction for ${ids.join(', ')}${draw ? ' and will draft the boundary when it lands' : ''}.`,
      });
    }),
  );

  // ── deed_parse_all_descriptions ─────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_parse_all_descriptions', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const tracts = opts.deedSummary?.tracts ?? [];
      if (tracts.length === 0) {
        return respond(message, false, undefined, 'No descriptions are loaded. Upload or summarize a deed first.');
      }
      const draw = d.draw === true;
      opts.onParseAll({ draw });
      return respond(message, true, {
        accepted: true,
        tractCount: tracts.length,
        drawRequested: draw,
        message: `Started extraction for all ${tracts.length} description${tracts.length === 1 ? '' : 's'}${draw ? ' and will draft the boundaries when they land' : ''}.`,
      });
    }),
  );

  // ── deed_list_boundary_files ────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_list_boundary_files', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const includeCalls = d.includeCalls === true;
      const files = opts.boundaryFiles.map(file => ({
        ...fileSummary(file),
        calls: includeCalls ? callRows(opts, file) : undefined,
      }));
      return respond(message, true, {
        files,
        count: files.length,
        activeFileId: opts.activeBoundaryFileId || opts.boundaryFiles[0]?.id,
      });
    }),
  );

  // ── deed_get_boundary_file ──────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_get_boundary_file', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const calls = callRows(opts, file);
      return respond(message, true, {
        found: true,
        file: fileSummary(file),
        calls,
        callCount: calls.length,
      });
    }),
  );

  // ── deed_select_boundary_file ───────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_select_boundary_file', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'Boundary file not found.');
      opts.setActiveBoundaryFileId(file.id);
      if (d.openEditor !== false) {
        opts.setIsBoundaryEditorVisible(true);
        opts.setIsBoundaryDialogMinimized(false);
      }
      return respond(message, true, { selected: true, fileId: file.id, fileName: file.name });
    }),
  );

  // ── deed_list_calls ─────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_list_calls', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const calls = callRows(opts, file);
      return respond(message, true, {
        fileId: file.id,
        fileName: file.name,
        calls,
        count: calls.length,
      });
    }),
  );

  // ── deed_update_call ────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_update_call', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const callId = typeof d.callId === 'string' ? d.callId : '';
      const call = file.calls.find(c => c.id === callId);
      if (!call) return respond(message, false, undefined, `Call ${callId || '(missing)'} was not found in ${file.name}.`);

      const patch: Partial<BoundaryFileCall> = {};
      if (typeof d.bearing === 'string') patch.bearing = d.bearing;
      if (typeof d.distance === 'string') patch.distance = d.distance;
      if (typeof d.chordBearing === 'string') patch.chordBearing = d.chordBearing;
      if (typeof d.chordDistance === 'number') patch.chordDistance = d.chordDistance;
      if (typeof d.tangentBearing === 'string') patch.tangentBearing = d.tangentBearing;
      if (typeof d.isCurve === 'boolean') patch.isCurve = d.isCurve;
      if (typeof d.curveRadius === 'number') patch.curveRadius = d.curveRadius;
      if (typeof d.arcLength === 'number') patch.arcLength = d.arcLength;
      if (d.curveDirection === 'left' || d.curveDirection === 'right') patch.curveDirection = d.curveDirection;
      if (typeof d.toDescription === 'string') patch.toDescription = d.toDescription;

      if (Object.keys(patch).length === 0) {
        return respond(message, false, undefined, 'Provide at least one call field to update.');
      }
      opts.onUpdateCall(file.id, call.id, patch);
      return respond(message, true, {
        updated: true,
        fileId: file.id,
        call: { ...call, ...patch },
      });
    }),
  );

  // ── deed_toggle_boundary_visibility ─────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_toggle_boundary_visibility', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const hidden = typeof d.hidden === 'boolean' ? d.hidden : !file.hidden;
      opts.setBoundaryFiles(prev => prev.map(candidate => candidate.id === file.id ? { ...candidate, hidden } : candidate));
      opts.logActionToFieldbook(`Boundary ${hidden ? 'hidden' : 'shown'}: ${file.name}.`);
      return respond(message, true, { fileId: file.id, hidden });
    }),
  );

  // ── deed_draw_to_linework ───────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_draw_to_linework', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      if (file.calls.length === 0) {
        return respond(message, false, undefined, `${file.name} has no calls to draft.`);
      }
      opts.onDrawToLinework(file.id, { silent: d.silent === true });
      return respond(message, true, {
        queued: true,
        fileId: file.id,
        callCount: file.calls.length,
        message: `Drafting ${file.calls.length} call(s) from ${file.name} to CAD linework.`,
      });
    }),
  );

  // ── deed_get_alignment ──────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_get_alignment', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const pts = pointMap(opts);
      const associated = (file.associatedPointIds ?? []).map(id => {
        const point = pts.get(id);
        return point
          ? {
              pointNumber: point.pointNumber,
              northing: point.northing,
              easting: point.easting,
              description: point.description,
            }
          : { pointNumber: id, missing: true };
      });
      const drawn = (file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0;
      return respond(message, true, {
        found: true,
        fileId: file.id,
        fileName: file.name,
        associatedPointCount: associated.length,
        associatedPoints: associated,
        translationE: file.translationE ?? 0,
        translationN: file.translationN ?? 0,
        rotationDeg: file.rotationDeg ?? 0,
        pobOverride: file.pobOverride ?? null,
        drawn,
        drawnPointCount: file.drawnPointIds?.length ?? 0,
        drawnLineCount: file.drawnLineIds?.length ?? 0,
        message: `${file.name}: ${associated.length} associated point(s), ` +
          `translation (${(file.translationE ?? 0).toFixed(2)}, ${(file.translationN ?? 0).toFixed(2)}), ` +
          `rotation ${(file.rotationDeg ?? 0).toFixed(3)}°, ${drawn ? 'drafted' : 'not drafted'}.`,
      });
    }),
  );

  // ── deed_list_alignment_points ──────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_list_alignment_points', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');

      const includeDrawn = d.includeDrawn === true;
      const drawnIds = new Set<string>();
      if (!includeDrawn) {
        for (const boundary of opts.boundaryFiles) {
          for (const id of boundary.drawnPointIds ?? []) drawnIds.add(id);
        }
      }

      const listId = typeof d.listId === 'string' ? d.listId.trim().toLowerCase() : '';
      const listNames = new Map<string, string[]>();
      for (const list of opts.pointLists) {
        for (const point of list.points) {
          const names = listNames.get(point.pointNumber) ?? [];
          names.push(list.name);
          listNames.set(point.pointNumber, names);
        }
      }
      const listPointIds = listId
        ? new Set(
            opts.pointLists
              .filter(list => list.id.toLowerCase() === listId || list.name.toLowerCase().includes(listId))
              .flatMap(list => list.points.map(point => point.pointNumber)),
          )
        : null;
      const byDescription =
        typeof d.byDescription === 'string' ? d.byDescription.trim().toLowerCase() : '';
      const limit =
        typeof d.limit === 'number' && Number.isFinite(d.limit)
          ? Math.max(1, Math.min(1000, Math.trunc(d.limit)))
          : 100;

      const rows = allProjectPoints(opts)
        .filter(point => !drawnIds.has(point.pointNumber))
        .filter(point => !listPointIds || listPointIds.has(point.pointNumber))
        .filter(point => !byDescription || (point.description ?? '').toLowerCase().includes(byDescription))
        .slice(0, limit)
        .map(point => ({
          pointNumber: point.pointNumber,
          northing: point.northing,
          easting: point.easting,
          elevation: point.elevation,
          description: point.description,
          lists: listNames.get(point.pointNumber) ?? [],
        }));

      return respond(message, true, { fileId: file.id, points: rows, count: rows.length });
    }),
  );

  // ── deed_associate_points ───────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_associate_points', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const requested = Array.isArray(d.pointNumbers)
        ? d.pointNumbers.map(String).map(id => id.trim()).filter(Boolean)
        : [];
      if (requested.length === 0) return respond(message, false, undefined, 'pointNumbers is required.');

      const known = pointMap(opts);
      const valid = requested.filter(id => known.has(id));
      const missing = requested.filter(id => !known.has(id));
      if (valid.length === 0) {
        return respond(message, false, undefined, `None of those point numbers exist in the project: ${missing.join(', ')}.`);
      }
      opts.onAssociatePoints(file.id, valid);
      const merged = new Set([...(file.associatedPointIds ?? []), ...valid]);
      return respond(message, true, {
        associated: true,
        fileId: file.id,
        pointNumbers: valid,
        missing,
        associatedPointCount: merged.size,
      });
    }),
  );

  // ── deed_disassociate_point ─────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_disassociate_point', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      const pointNumber = typeof d.pointNumber === 'string' ? d.pointNumber.trim() : '';
      if (!pointNumber) return respond(message, false, undefined, 'pointNumber is required.');
      const current = file.associatedPointIds ?? [];
      if (!current.includes(pointNumber)) {
        return respond(message, false, undefined, `${pointNumber} is not associated with ${file.name}.`);
      }
      opts.onDisassociatePoint(file.id, pointNumber);
      return respond(message, true, {
        disassociated: true,
        fileId: file.id,
        remainingCount: current.filter(id => id !== pointNumber).length,
      });
    }),
  );

  // ── deed_best_fit ───────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_best_fit', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      if (file.calls.length === 0) return respond(message, false, undefined, `${file.name} has no calls to align.`);
      const associatedCount = file.associatedPointIds?.length ?? 0;
      if (associatedCount === 0) {
        return respond(message, false, undefined, 'Associate at least one survey point before running best fit.');
      }
      opts.onBestFit(file.id);
      return respond(message, true, {
        applied: true,
        fileId: file.id,
        associatedPointCount: associatedCount,
        message: `Best fit started for ${file.name} using ${associatedCount} associated point(s).`,
      });
    }),
  );

  // ── deed_align_corners ──────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_align_corners', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');
      if (file.calls.length === 0) return respond(message, false, undefined, `${file.name} has no calls to align.`);
      opts.setActiveBoundaryFileId(file.id);
      opts.setBoundaryCornerAlignRequest({ token: Date.now(), movableBfId: file.id });
      opts.setIsBoundaryEditorVisible(true);
      opts.setIsBoundaryDialogMinimized(false);
      return respond(message, true, {
        started: true,
        fileId: file.id,
        message: `Corner-pairing alignment started for ${file.name}. Click a deed corner, then the found point it belongs on.`,
      });
    }),
  );

  // ── deed_transform_boundary ─────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_transform_boundary', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');

      const reset = d.reset === true;
      let translationE = reset ? 0 : (file.translationE ?? 0);
      let translationN = reset ? 0 : (file.translationN ?? 0);
      let rotationDeg = reset ? 0 : (file.rotationDeg ?? 0);

      if (typeof d.translationE === 'number' && Number.isFinite(d.translationE)) translationE = d.translationE;
      if (typeof d.translationN === 'number' && Number.isFinite(d.translationN)) translationN = d.translationN;
      if (typeof d.rotationDeg === 'number' && Number.isFinite(d.rotationDeg)) rotationDeg = d.rotationDeg;
      if (typeof d.translateByE === 'number' && Number.isFinite(d.translateByE)) translationE += d.translateByE;
      if (typeof d.translateByN === 'number' && Number.isFinite(d.translateByN)) translationN += d.translateByN;
      if (typeof d.rotateByDeg === 'number' && Number.isFinite(d.rotateByDeg)) rotationDeg += d.rotateByDeg;

      opts.onTransform(
        file.id,
        { translationE, translationN, rotationDeg },
        { immediate: true },
      );
      opts.logActionToFieldbook(
        `Boundary transform: ${file.name} ΔE=${translationE.toFixed(3)}, ΔN=${translationN.toFixed(3)}, ` +
        `rotation=${rotationDeg.toFixed(3)}°.`,
      );
      return respond(message, true, {
        applied: true,
        fileId: file.id,
        translationE,
        translationN,
        rotationDeg,
      });
    }),
  );

  // ── deed_set_pob ────────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_set_pob', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No matching boundary file was found.');

      if (d.clear === true) {
        opts.onPobChange(file.id, { pointNumber: '', pobOverride: null });
        return respond(message, true, {
          applied: true,
          fileId: file.id,
          message: `Cleared the POB for ${file.name}; drafting will use the project centroid fallback.`,
        });
      }

      if (typeof d.pointNumber === 'string' && d.pointNumber.trim()) {
        const requested = d.pointNumber.trim().toLowerCase();
        const point = allProjectPoints(opts).find(p => p.pointNumber.toLowerCase() === requested);
        if (!point) {
          return respond(message, false, undefined, `POB point ${d.pointNumber} was not found in the project.`);
        }
        opts.onPobChange(file.id, {
          pointNumber: point.pointNumber,
          pobOverride: { easting: point.easting, northing: point.northing },
        });
        return respond(message, true, {
          applied: true,
          fileId: file.id,
          pointNumber: point.pointNumber,
          pob: { easting: point.easting, northing: point.northing },
          message: `POB for ${file.name} set to point ${point.pointNumber}.`,
        });
      }

      if (typeof d.easting === 'number' && typeof d.northing === 'number' &&
          Number.isFinite(d.easting) && Number.isFinite(d.northing)) {
        const pob = { easting: d.easting, northing: d.northing };
        opts.onPobChange(file.id, { pobOverride: pob });
        return respond(message, true, {
          applied: true,
          fileId: file.id,
          pob,
          message: `POB for ${file.name} set to E=${pob.easting.toFixed(4)}, N=${pob.northing.toFixed(4)}.`,
        });
      }

      return respond(message, false, undefined, 'Provide pointNumber, easting + northing, or clear:true.');
    }),
  );

  // ── deed_open_editor ────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_open_editor', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file && opts.boundaryFiles.length === 0) {
        return respond(message, false, undefined, 'No boundary file is available to edit yet.');
      }
      if (file) opts.setActiveBoundaryFileId(file.id);
      opts.setIsBoundaryEditorVisible(true);
      opts.setIsBoundaryDialogMinimized(false);
      return respond(message, true, { opened: true, fileId: file?.id });
    }),
  );

  // ── deed_open_alignment_tools ───────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('deed_open_alignment_tools', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const file = findBoundaryFile(opts, d.fileId);
      if (!file) return respond(message, false, undefined, 'No boundary file is available to align yet.');
      opts.setActiveBoundaryFileId(file.id);
      opts.setBoundaryAlignmentDockMode('floating');
      opts.setIsBoundaryAlignmentOpen(true);
      opts.setIsBoundaryEditorVisible(true);
      opts.setIsBoundaryDialogMinimized(false);
      return respond(message, true, { opened: true, fileId: file.id, docked: false });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * React hook that mounts the Deed Agent CACP handlers and keeps their live
 * state references fresh across renders.
 */
export function useDeedSkillHandlers(opts: DeedSkillHandlersOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    return registerDeedSkillHandlers(() => optsRef.current);
  }, []);
}
