// DeedSummaryPanel.tsx  v26.05.20.6
// Floating panel auto-shown when the Boundary Agent ingests a deed.
// 4-step workflow:
//   1. Review deed summary (calls, area, closure)
//   2. Compute → amber overlay appears on canvas (no real linework yet)
//   3. Associate surveyed field points + Best Fit to align
//   4. Draw (Commit) → creates final CAD-layered linework

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { BoundaryFile, SurveyPoint, DeedSummary } from '../types.ts';
import { parseBearingToRadians, parseDistance, direct, directCurve, calculateClosure } from '../utils/cogo.ts';
import { XMarkIcon } from './icons.tsx';

interface PobInput {
  mode: 'point' | 'coords';
  pn: string;
  E: string;
  N: string;
}

/** CSS keyframes for the lite-scan loading card. Injected once at module
 *  scope so we don't have to plumb them through Tailwind config or the
 *  global stylesheet. Idempotent on hot-reload. */
const LITE_SCAN_KEYFRAMES_ID = 'lsvz-lite-scan-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(LITE_SCAN_KEYFRAMES_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = LITE_SCAN_KEYFRAMES_ID;
  styleEl.textContent = `
    @keyframes lsvz-scan-beam {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(420%); }
    }
    @keyframes lsvz-pulse-dot {
      0%, 100% { transform: scale(1);   opacity: 1;   box-shadow: 0 0 0 0 rgba(251,191,36,0.7); }
      50%      { transform: scale(1.3); opacity: 0.85; box-shadow: 0 0 0 7px rgba(251,191,36,0); }
    }
    @keyframes lsvz-bar-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }
  `;
  document.head.appendChild(styleEl);
}

/** Rotating reassurance copy for the lite-scan card. Cycles every ~2.2s so
 *  the user sees movement even when the network call is in flight. */
const SCAN_STATUSES = [
  'Reading deed pages…',
  'Locating metes-and-bounds passages…',
  'Identifying separate tracts…',
  'Picking up grantor / grantee / book / page…',
  'Drafting the tract preview list…',
];
const RotatingScanStatus: React.FC = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % SCAN_STATUSES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-[10px] text-sky-300/80 mt-0.5 min-h-[1.2em] italic">
      {SCAN_STATUSES[idx]}
    </div>
  );
};

interface DeedSummaryPanelProps {
  /** One BoundaryFile per tract just ingested from the deed. Empty array = pre-parse state. */
  files: BoundaryFile[];
  /** File name shown in pre-parse state (before AI extraction runs). */
  pendingFileName?: string;
  /** Lightweight per-tract summary produced by `summarizeDeed()` immediately
   * after upload. Each entry becomes a row with a Compute Preview button. */
  summary?: DeedSummary;
  /** Set of summary tractIds with an in-flight Compute Preview parse. */
  computingTractIds?: Set<string>;
  /** Trigger heavy DEED_READER parse for a single tract from the summary.
   *  `pob` is an optional Point-of-Beginning override the user typed into the
   *  pending-tracts row — either resolved from a point number or explicit E/N. */
  onComputeTract?: (tractId: string, pob: { easting: number; northing: number } | null) => void;
  /** Trigger heavy DEED_READER parse for every tract in the summary at once. */
  onComputeAll?: () => void;
  /** Legacy: pre-summary "Parse Deed" button (still shown if no summary yet). */
  onParseNow?: () => void;
  pointMap: Map<string, SurveyPoint>;
  /** Point number of the currently-selected canvas point (for one-click add to alignment). */
  selectedPointNumber?: string;
  /** Step 2: Show amber overlay (set hidden:false) + optional POB override. */
  onCompute: (fileId: string, pob: { easting: number; northing: number } | null) => void;
  /** Step 3a: Add point numbers to the alignment list for a file. */
  onAssociatePoints: (fileId: string, pns: string[]) => void;
  /** Step 3a: Remove a single point number from the alignment list. */
  onDisassociatePoint: (fileId: string, pn: string) => void;
  /** Step 3b: Run Helmert best-fit using associatedPointIds. */
  onBestFit: (fileId: string) => void;
  /** Try to match the deed to county GIS parcels and coarse-align it. */
  onAlignToGIS?: (fileId: string) => void;
  /** Start the interactive corner-pairing alignment on the canvas: click a corner of the
   *  highlighted deed, then the found point it belongs on. Repeat to refine the fit. */
  onAlignCorners?: (fileId: string) => void;
  /** Step 4: Write final CAD-layered linework onto the canvas. */
  onCommitDraw: (fileId: string) => void;
  onOpenInEditor: (fileId: string) => void;
  onClose: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Quick area estimate (shoelace) from a local-coordinate march. */
function estimateArea(file: BoundaryFile): number | null {
  const verts: { x: number; y: number }[] = [];
  let cursor = { x: 0, y: 0 };
  for (const call of file.calls) {
    let next: { x: number; y: number } | null = null;
    try {
      const c = { northing: cursor.y, easting: cursor.x };
      if (call.isCurve && call.curveRadius && call.arcLength) {
        const tRad = parseBearingToRadians(call.tangentBearing || call.bearing || '');
        if (tRad == null) continue;
        const da = call.arcLength / call.curveRadius;
        const sd = call.curveDirection === 'left' ? -da : da;
        const pt = directCurve(c, tRad, call.curveRadius, sd);
        next = { x: pt.easting, y: pt.northing };
      } else if (call.bearing && call.distance) {
        const brRad = parseBearingToRadians(call.bearing);
        const dist = parseDistance(call.distance);
        if (brRad == null || dist == null) continue;
        const pt = direct(c, brRad, dist);
        next = { x: pt.easting, y: pt.northing };
      }
    } catch { continue; }
    if (!next) continue;
    verts.push(next);
    cursor = next;
  }
  if (verts.length < 3) return null;
  // Shoelace
  let area = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += verts[i].x * verts[j].y;
    area -= verts[j].x * verts[i].y;
  }
  return Math.abs(area) / 2;
}

function sqftToAcres(sqft: number) { return sqft / 43560; }
function formatArea(sqft: number) {
  const ac = sqftToAcres(sqft);
  return ac >= 0.1 ? `${ac.toFixed(4)} ac` : `${sqft.toFixed(0)} sf`;
}

/** Quick closure check (linear) \u2014 no throws. */
function quickClosure(file: BoundaryFile, pointMap: Map<string, SurveyPoint>): string {
  if (file.calls.length < 2) return '—';
  const incomplete = file.calls.some(c => c.isCurve
    ? !(c.curveRadius && c.arcLength)
    : !(c.bearing && c.distance));
  if (incomplete) return 'incomplete';
  try {
    const lines = file.calls.map(c => ({
      from: c.from, to: c.to, bearing: c.bearing, distance: c.distance,
      isCurve: c.isCurve, curveRadius: c.curveRadius, arcLength: c.arcLength,
      chordBearing: c.chordBearing, tangentBearing: c.tangentBearing,
      curveDirection: c.curveDirection, deltaAngle: undefined as number | undefined,
    }));
    const cl = calculateClosure(lines, pointMap);
    if (!cl) return '—';
    const prec = cl.linearPrecision ?? 0;
    return prec > 0 ? `1 : ${Math.round(prec).toLocaleString()}` : '—';
  } catch { return '—'; }
}

// ─── component ──────────────────────────────────────────────────────────────

const DeedSummaryPanel: React.FC<DeedSummaryPanelProps> = ({
  files,
  pendingFileName,
  summary,
  computingTractIds,
  onComputeTract,
  onComputeAll,
  onParseNow,
  pointMap,
  selectedPointNumber,
  onCompute,
  onAssociatePoints,
  onDisassociatePoint,
  onBestFit,
  onAlignToGIS,
  onAlignCorners,
  onCommitDraw,
  onOpenInEditor,
  onClose,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Track which files have been through the Compute step (independent of hidden toggle)
  const [computedIds, setComputedIds] = useState<Set<string>>(new Set());

  // Per-file POB input state
  const [pobInputs, setPobInputs] = useState<Record<string, PobInput>>({});
  // Per-file association text input (comma-separated PNs to add)
  const [assocInputs, setAssocInputs] = useState<Record<string, string>>({});
  // Per-row "Advanced" toggle — collapsed by default so the unified tract
  // list reads as a flat list of pending / computed / drafted rows. Users
  // expand individual rows to access Align / Re-compute / Edit.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Whole-list collapse — lets the user fold the entire tract list away so
  // they can work in the Boundary Editor (or anywhere else on the canvas)
  // without this panel hogging vertical space.
  const [listCollapsed, setListCollapsed] = useState(false);

  // Shade-in-place: collapse the whole panel down to just the draggable
  // header bar, matching the Shrinkwrap / Inclusion Boundaries panels.
  const [isShaded, setIsShaded] = useState(false);

  const getPobInput = (fileId: string): PobInput =>
    pobInputs[fileId] ?? { mode: 'point', pn: '', E: '', N: '' };

  const updatePobInput = (fileId: string, patch: Partial<PobInput>) =>
    setPobInputs(prev => ({ ...prev, [fileId]: { ...getPobInput(fileId), ...patch } }));

  const resolvePob = (fileId: string): { easting: number; northing: number } | null => {
    const inp = getPobInput(fileId);
    if (inp.mode === 'point') {
      if (!inp.pn.trim()) return null;
      const pt = pointMap.get(inp.pn.trim());
      return pt ? { easting: pt.easting, northing: pt.northing } : null;
    } else {
      const E = parseFloat(inp.E);
      const N = parseFloat(inp.N);
      return isFinite(E) && isFinite(N) ? { easting: E, northing: N } : null;
    }
  };

  const validatePob = (fileId: string): string | null => {
    const inp = getPobInput(fileId);
    if (inp.mode === 'point' && inp.pn.trim()) {
      if (!pointMap.get(inp.pn.trim())) return `Point "${inp.pn.trim()}" not found`;
    } else if (inp.mode === 'coords') {
      const E = parseFloat(inp.E);
      const N = parseFloat(inp.N);
      if (inp.E && !isFinite(E)) return 'Invalid Easting';
      if (inp.N && !isFinite(N)) return 'Invalid Northing';
    }
    return null;
  };

  const handleCompute = useCallback((fileId: string) => {
    const pob = resolvePob(fileId);
    onCompute(fileId, pob);
    setComputedIds(prev => new Set([...prev, fileId]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pobInputs, pointMap, onCompute]);

  /** Parse a comma/space-separated list of point numbers from a string. */
  const parsePnList = (raw: string): string[] =>
    raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);

  const handleAddAssociation = useCallback((fileId: string) => {
    const raw = assocInputs[fileId] ?? '';
    const pns = parsePnList(raw);
    if (pns.length === 0) return;
    onAssociatePoints(fileId, pns);
    setAssocInputs(prev => ({ ...prev, [fileId]: '' }));
  }, [assocInputs, onAssociatePoints]);

  const handleAddSelectedPoint = useCallback((fileId: string) => {
    if (!selectedPointNumber) return;
    onAssociatePoints(fileId, [selectedPointNumber]);
  }, [selectedPointNumber, onAssociatePoints]);

  const getDefaultPos = useCallback(() => ({
    x: Math.max(8, window.innerWidth / 2 - 230),
    y: 72,
  }), []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    const current = pos ?? getDefaultPos();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragState.current.origX + ev.clientX - dragState.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + ev.clientY - dragState.current.startY)),
      });
    };
    const onUp = () => { dragState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos, getDefaultPos]);

  const { x, y } = pos ?? getDefaultPos();
  const style: React.CSSProperties = { position: 'fixed', left: x, top: y, zIndex: 9500, minWidth: 440, maxWidth: 580 };

  const stepBadge = (n: number, label: string, done: boolean) => (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${done ? 'bg-emerald-700/50 text-emerald-200' : 'bg-gray-700/60 text-gray-400'}`}>
      {done ? '✓' : n} {label}
    </span>
  );

  return (
    <div style={style} className="bg-gray-900/95 border border-gray-700/60 rounded-xl shadow-2xl text-white text-sm select-none backdrop-blur-sm">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 bg-gray-900/60 cursor-grab active:cursor-grabbing ${isShaded ? 'rounded-xl' : 'rounded-t-xl border-b border-gray-700'}`}
        onMouseDown={handleDragStart}
      >
        <span className="font-semibold text-gray-200 text-[13px] flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>📄</span>
          Deed Summary
          {files.length > 1 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-700/60 text-gray-200 text-[10px]">
              {files.length} tracts
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setIsShaded(s => !s); }}
            className="p-1 hover:bg-gray-700/60 rounded-lg text-gray-400 hover:text-white transition-colors"
            aria-label={isShaded ? 'Restore' : 'Shade'}
            title={isShaded ? 'Restore Deed Summary' : 'Shade (collapse in place)'}
          >
            {isShaded ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7 7 7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            )}
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-700/60 rounded-lg text-gray-400 hover:text-white transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isShaded && (<>

      {/* Workflow legend collapsed into a one-line breadcrumb so the tract
          rows below carry the per-row status visually. */}
      {files.length > 0 && (
        <div className="px-3 pt-1.5 pb-0.5 text-[9px] text-gray-500 flex items-center gap-1">
          <span>Workflow:</span>
          <span className="text-gray-400">Review</span>
          <span className="text-gray-700">›</span>
          <span className="text-gray-400">Compute (amber)</span>
          <span className="text-gray-700">›</span>
          <span className="text-gray-400">Align (optional)</span>
          <span className="text-gray-700">›</span>
          <span className="text-gray-400">Draft Commit (CAD)</span>
        </div>
      )}

      {/* Pre-parse state — shown ONLY when the cheap summarizer hasn't returned
          yet AND no tracts have been computed yet. As soon as `summary` lands
          (even if it has zero tracts), we switch to the summary UI below.

          The visual goal here is "professional, attractive, worth the wait".
          A subtle animated scan band over a deed-page glyph + rotating
          status messages reassures the user that real work is in flight,
          even though the underlying call is only a couple of seconds. */}
      {files.length === 0 && !summary && pendingFileName && (
        <div className="px-3 py-3">
          <div className="relative overflow-hidden rounded-xl border border-gray-700/60 bg-gray-900 shadow-xl">
            {/* Multicolor top accent stripe */}
            <div className="h-0.5 w-full bg-gradient-to-r from-amber-400 via-sky-400 to-violet-500" />
            {/* Scan beam: amber tinted */}
            <div
              className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-amber-400/8 to-transparent"
              style={{ animation: 'lsvz-scan-beam 2.4s linear infinite' }}
            />

            <div className="relative px-4 pt-3 pb-3.5">
              {/* Header: icon + badge pills + file name */}
              <div className="flex items-start gap-3">
                {/* Document glyph — neutral dark with amber top rule */}
                <div className="relative shrink-0 mt-0.5">
                  <div className="w-9 h-11 rounded bg-gray-800 border border-gray-700/80 flex flex-col items-center justify-center gap-[3px] overflow-hidden">
                    <div className="w-6 h-0.5 rounded-full bg-amber-400/90" />
                    <div className="w-6 h-px rounded-full bg-gray-500/60" />
                    <div className="w-6 h-px rounded-full bg-gray-500/60" />
                    <div className="w-4 h-px rounded-full bg-gray-600/50" />
                    <div className="w-6 h-px rounded-full bg-gray-500/60" />
                  </div>
                  {/* Pulsing amber activity dot */}
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-gray-900"
                    style={{ animation: 'lsvz-pulse-dot 1.6s ease-in-out infinite' }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  {/* Badge row */}
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-[0.1em] font-bold bg-amber-400/15 text-amber-300 border border-amber-500/30">
                      Boundary Agent
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-[0.1em] font-semibold bg-sky-400/10 text-sky-400 border border-sky-500/25">
                      Lite Scan
                    </span>
                  </div>
                  {/* File name */}
                  <div className="font-semibold text-white text-[13px] leading-tight truncate" title={pendingFileName}>
                    {pendingFileName}
                  </div>
                  {/* Rotating status line */}
                  <RotatingScanStatus />
                </div>
              </div>

              {/* Indeterminate progress bar */}
              <div className="mt-3 h-0.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full w-1/3 bg-gradient-to-r from-amber-500/0 via-amber-300 to-amber-500/0"
                  style={{ animation: 'lsvz-bar-slide 1.6s ease-in-out infinite' }}
                />
              </div>

              {/* Three-step pipeline — amber (active) / sky / violet */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {/* Step 1 — active */}
                <div className="rounded-lg bg-amber-950/50 border border-amber-600/40 px-2 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" style={{ animation: 'lsvz-pulse-dot 1.2s ease-in-out infinite' }} />
                    <span className="text-[7.5px] font-bold text-amber-400 uppercase tracking-wide">Step 1</span>
                  </div>
                  <div className="text-[9px] font-semibold text-amber-100 leading-tight">Scan Pages</div>
                  <div className="text-[7.5px] text-amber-300/55 mt-0.5 leading-tight">Reading metes-and-bounds calls</div>
                </div>
                {/* Step 2 — queued */}
                <div className="rounded-lg bg-sky-950/30 border border-sky-700/25 px-2 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-600/50 shrink-0" />
                    <span className="text-[7.5px] font-bold text-sky-500/60 uppercase tracking-wide">Step 2</span>
                  </div>
                  <div className="text-[9px] font-semibold text-sky-200/45 leading-tight">Detect Tracts</div>
                  <div className="text-[7.5px] text-sky-400/35 mt-0.5 leading-tight">Identify separate deed parcels</div>
                </div>
                {/* Step 3 — on demand */}
                <div className="rounded-lg bg-violet-950/30 border border-violet-700/25 px-2 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600/50 shrink-0" />
                    <span className="text-[7.5px] font-bold text-violet-400/60 uppercase tracking-wide">Step 3</span>
                  </div>
                  <div className="text-[9px] font-semibold text-violet-200/45 leading-tight">Compute</div>
                  <div className="text-[7.5px] text-violet-400/35 mt-0.5 leading-tight">Generate geometry on demand</div>
                </div>
              </div>

              {onParseNow && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-[10px] text-gray-400/70 hover:text-gray-300 select-none list-none flex items-center gap-1">
                    <span className="transition-transform group-open:rotate-90">▶</span> Advanced: skip summary and parse the full deed now
                  </summary>
                  <button
                    onClick={onParseNow}
                    className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-semibold bg-gray-700/60 text-gray-100 hover:bg-gray-600/70 border border-gray-600/40 transition-colors"
                  >
                    Parse Deed (skip summary) ▶
                  </button>
                  <p className="mt-1.5 text-[9px] text-gray-500 italic text-center">
                    Heavier and slower. Use only if the lite scan stalls.
                  </p>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document-level summary header — grantor / grantee / parcel / book / page */}
      {summary && (summary.owner || summary.grantor || summary.parcelId || summary.book) && (
        <div className="px-3 pt-2 pb-1">
          <div className="bg-gray-800/40 rounded border border-gray-700/30 px-2.5 py-1.5 text-[10px] text-gray-300 flex flex-wrap gap-x-3 gap-y-0.5">
            {summary.grantor && <span><span className="text-gray-500">Grantor:</span> <span className="text-gray-100">{summary.grantor}</span></span>}
            {summary.owner && <span><span className="text-gray-500">Grantee:</span> <span className="text-gray-100">{summary.owner}</span></span>}
            {summary.parcelId && <span><span className="text-gray-500">Parcel:</span> <span className="text-gray-100">{summary.parcelId}</span></span>}
            {summary.book && <span><span className="text-gray-500">Book/Pg:</span> <span className="text-gray-100">{summary.book}{summary.page ? `/${summary.page}` : ''}</span></span>}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────
          UNIFIED TRACT LIST — lightweight, click-to-expand, fully collapsible.
          One row per tract (summary tract OR orphan BoundaryFile). Each row
          is one line by default; click the row to reveal POB + Align + Edit.
          The entire list can be collapsed via the header caret so the user
          can free up screen space for the Boundary Editor dialog.
          ────────────────────────────────────────────────────────────── */}
      {(summary || files.length > 0) && (() => {
        type Row = {
          key: string;
          pobKey: string;
          summary?: NonNullable<typeof summary>['tracts'][number];
          file?: BoundaryFile;
        };
        const rows: Row[] = [];
        const claimedFileIds = new Set<string>();
        if (summary) {
          for (const t of summary.tracts) {
            const matchingFile = files.find(f => f.sourceTractId === t.tractId);
            if (matchingFile) claimedFileIds.add(matchingFile.id);
            rows.push({
              key: matchingFile ? matchingFile.id : `tract:${t.tractId}`,
              pobKey: matchingFile ? matchingFile.id : `tract:${t.tractId}`,
              summary: t,
              file: matchingFile,
            });
          }
        }
        for (const f of files) {
          if (!claimedFileIds.has(f.id)) {
            rows.push({ key: f.id, pobKey: f.id, file: f });
          }
        }
        if (rows.length === 0) {
          // Fallback: summary returned zero tracts and no orphan BFs exist.
          return summary && onComputeAll ? (
            <div className="px-3 py-3">
              <div className="bg-gray-800/60 rounded-lg border border-gray-700/40 p-3 text-center">
                <div className="text-[11px] text-gray-300 mb-2">No tracts detected in summary pass.</div>
                <button onClick={onComputeAll}
                  className="w-full py-1.5 rounded text-[12px] font-bold bg-amber-700/70 text-amber-50 hover:bg-amber-600/80 border border-amber-500/50">
                  Compute All (full parse) ▶
                </button>
              </div>
            </div>
          ) : null;
        }

        const pendingCount = rows.filter(r => !r.file).length;
        const computedCount = rows.filter(r => r.file && !((r.file.drawnPointIds?.length ?? 0) > 0 || (r.file.drawnLineIds?.length ?? 0) > 0)).length;
        const draftedCount = rows.filter(r => r.file && ((r.file.drawnPointIds?.length ?? 0) > 0 || (r.file.drawnLineIds?.length ?? 0) > 0)).length;
        const anyComputing = rows.some(r => r.summary && computingTractIds?.has(r.summary.tractId));

        return (
          <div className="px-3 py-2">
            {/* List header — collapse caret + counts + Compute-All */}
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => setListCollapsed(c => !c)}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-200 hover:text-white"
                title={listCollapsed ? 'Show tract list' : 'Hide tract list (free up space for editor)'}
              >
                <span className="text-gray-400 text-[10px]">{listCollapsed ? '▶' : '▼'}</span>
                Tracts <span className="text-gray-500 font-normal">({rows.length})</span>
              </button>
              <div className="flex-1 flex items-center gap-1.5 text-[9px]">
                {pendingCount > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-200 border border-amber-700/40">{pendingCount} pending</span>}
                {computedCount > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-200 border border-emerald-700/40">{computedCount} preview</span>}
                {draftedCount > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-100 border border-emerald-400/40">{draftedCount} drafted</span>}
              </div>
              {pendingCount > 1 && onComputeAll && (
                <button
                  onClick={onComputeAll}
                  disabled={anyComputing}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-700/60 text-amber-50 hover:bg-amber-600/80 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Run a single full-deed parse for every remaining tract"
                >
                  Compute All ▶
                </button>
              )}
            </div>

            {/* Rows — hidden when list collapsed */}
            {!listCollapsed && (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-0.5">
                {rows.map(row => {
                  const file = row.file;
                  const t = row.summary;
                  const pobKey = row.pobKey;
                  const pobInp = getPobInput(pobKey);
                  const pobErr = validatePob(pobKey);
                  const pobResolved = resolvePob(pobKey);
                  const pnPt = pobInp.mode === 'point' && pobInp.pn.trim() ? pointMap.get(pobInp.pn.trim()) : undefined;
                  const busy = t ? !!computingTractIds?.has(t.tractId) : false;
                  const isDrafted = file
                    ? ((file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0)
                    : false;
                  const isExpanded = expandedRows.has(row.key);

                  const status: 'pending' | 'computed' | 'drafted' =
                    !file ? 'pending' : (isDrafted ? 'drafted' : 'computed');

                  const statusDot =
                    status === 'pending' ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Pending" /> :
                    status === 'computed' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Amber preview rendered" /> :
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 ring-1 ring-emerald-100/40 shrink-0" title="Drafted to CAD" />;

                  const titleStr = t?.tractId ?? file?.name ?? 'Untitled tract';
                  const subTitle = t?.tractName && t.tractName !== t.tractId ? t.tractName : undefined;
                  const acreage = t?.acreage;
                  const sourcePage = t?.sourcePage;
                  const parcelLine = [
                    t?.parcelId ?? file?.parcelId,
                    t?.grantor && `Grantor: ${t.grantor}`,
                    t?.grantee && `Grantee: ${t.grantee}`,
                    file?.ownerName && !t?.grantee ? `Owner: ${file.ownerName}` : undefined,
                  ].filter(Boolean).join(' · ');

                  const areaSqft = file ? estimateArea(file) : null;
                  const closure = file ? quickClosure(file, pointMap) : null;
                  const associated = file?.associatedPointIds ?? [];
                  const hasAlignment = associated.length > 0;

                  // Tiny inline primary-action icon for the collapsed row.
                  // Clicking the icon fires the action without expanding.
                  const inlineAction = status === 'pending' && t ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onComputeTract?.(t.tractId, pobResolved); }}
                      disabled={busy || !onComputeTract || !!pobErr}
                      className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-700/70 text-amber-50 hover:bg-amber-600/80 border border-amber-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={busy ? 'Parsing…' : (pobErr ? `${pobErr} — click row to set POB` : 'Compute amber preview')}
                    >{busy ? '…' : 'Compute ▶'}</button>
                  ) : status === 'computed' && file ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCommitDraw(file.id); }}
                      className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500/90 border border-emerald-400/60"
                      title="Commit boundary as permanent CAD linework"
                    >Draft ▶</button>
                  ) : status === 'drafted' && file ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenInEditor(file.id); }}
                      className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-gray-700/60 text-gray-200 hover:bg-gray-600/80 border border-gray-600/40"
                      title="Open in Boundary Editor"
                    >Edit</button>
                  ) : null;

                  return (
                    <div key={row.key} className="bg-gray-800/40 rounded border border-gray-700/40 overflow-hidden">
                      {/* Collapsed row — single clickable line */}
                      <div
                        onClick={() => toggleRow(row.key)}
                        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-700/30"
                        title="Click for details"
                      >
                        <span className="text-gray-500 text-[10px] w-2 shrink-0">{isExpanded ? '▾' : '▸'}</span>
                        {statusDot}
                        <span className="font-semibold text-emerald-100 text-[11px] truncate">{titleStr}</span>
                        {subTitle && <span className="text-[10px] text-gray-400 truncate">{subTitle}</span>}
                        {acreage && <span className="text-[9px] text-emerald-400 shrink-0">{acreage}</span>}
                        {sourcePage != null && <span className="text-[9px] text-gray-500 shrink-0">p.{sourcePage}</span>}
                        {file && (
                          <span className="text-[9px] text-gray-500 shrink-0">{file.calls.length}c</span>
                        )}
                        <div className="flex-1" />
                        {inlineAction}
                      </div>

                      {/* Expanded detail — only when row is open */}
                      {isExpanded && (
                        <div className="border-t border-gray-700/40 bg-gray-900/40 px-2.5 py-2 space-y-2">
                          {parcelLine && (
                            <div className="text-[10px] text-gray-400 truncate">{parcelLine}</div>
                          )}
                          {t?.snippet && !file && (
                            <div className="text-[10px] text-gray-400 italic line-clamp-3" title={t.snippet}>“{t.snippet}”</div>
                          )}
                          {file && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                              {areaSqft != null && <span><span className="text-gray-500">Area≈</span> <span className="text-gray-200">{formatArea(areaSqft)}</span></span>}
                              {closure && <span><span className="text-gray-500">Closure:</span> <span className={closure.startsWith('1') ? 'text-emerald-300' : 'text-gray-300'}>{closure}</span></span>}
                              {isDrafted && <span className="text-emerald-400 font-medium">✓ Drafted to CAD</span>}
                            </div>
                          )}

                          {/* POB row */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500 shrink-0">Start at:</span>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => updatePobInput(pobKey, { mode: 'point' })}
                                className={`px-1.5 py-0.5 rounded text-[9px] border ${pobInp.mode === 'point' ? 'bg-blue-700/60 border-blue-500/40 text-blue-100' : 'bg-gray-700/40 border-gray-600/30 text-gray-400 hover:text-gray-200'}`}
                              >Pt #</button>
                              <button
                                onClick={() => updatePobInput(pobKey, { mode: 'coords' })}
                                className={`px-1.5 py-0.5 rounded text-[9px] border ${pobInp.mode === 'coords' ? 'bg-blue-700/60 border-blue-500/40 text-blue-100' : 'bg-gray-700/40 border-gray-600/30 text-gray-400 hover:text-gray-200'}`}
                              >E/N</button>
                            </div>
                            {pobInp.mode === 'point' ? (
                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={pobInp.pn}
                                  onChange={e => updatePobInput(pobKey, { pn: e.target.value })}
                                  placeholder="Point # or blank…"
                                  className="flex-1 min-w-0 bg-gray-900/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                                />
                                {selectedPointNumber && (
                                  <button onClick={() => updatePobInput(pobKey, { pn: selectedPointNumber })}
                                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-gray-700/50 text-gray-300 hover:bg-gray-600/70 border border-gray-600/40"
                                    title={`Use canvas selection: ${selectedPointNumber}`}>↖ {selectedPointNumber}</button>
                                )}
                                {pnPt && <span className="text-[9px] text-emerald-400 shrink-0">✓</span>}
                                {pobInp.pn.trim() && !pnPt && <span className="text-[9px] text-red-400 shrink-0">?</span>}
                              </div>
                            ) : (
                              <div className="flex gap-1 flex-1 min-w-0">
                                <input type="number" value={pobInp.E} onChange={e => updatePobInput(pobKey, { E: e.target.value })} placeholder="Easting" className="flex-1 min-w-0 bg-gray-900/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/60" />
                                <input type="number" value={pobInp.N} onChange={e => updatePobInput(pobKey, { N: e.target.value })} placeholder="Northing" className="flex-1 min-w-0 bg-gray-900/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/60" />
                              </div>
                            )}
                          </div>
                          {pobErr && <div className="text-[9px] text-red-400">{pobErr}</div>}

                          {/* Full-width primary action */}
                          <div className="flex gap-1.5">
                            {status === 'pending' && t && (
                              <button
                                onClick={() => onComputeTract?.(t.tractId, pobResolved)}
                                disabled={busy || !onComputeTract || !!pobErr}
                                className="flex-1 py-1 rounded text-[11px] font-semibold bg-amber-700/70 text-amber-50 hover:bg-amber-600/80 border border-amber-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                              >{busy ? '…parsing' : 'Compute Preview ▶ (amber)'}</button>
                            )}
                            {status === 'computed' && file && (
                              <>
                                <button
                                  onClick={() => handleCompute(file.id)}
                                  disabled={!!pobErr}
                                  className="px-2 py-1 rounded text-[10px] bg-gray-700/60 text-gray-200 hover:bg-gray-600/80 border border-gray-600/40 disabled:opacity-40 shrink-0"
                                  title="Re-apply amber preview (e.g. after changing POB)"
                                >↻</button>
                                <button
                                  onClick={() => onCommitDraw(file.id)}
                                  className="flex-1 py-1 rounded text-[11px] font-bold bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500/90 border border-emerald-400/60"
                                >Draft (Commit) ▶ CAD</button>
                              </>
                            )}
                            {status === 'drafted' && file && (
                              <button
                                onClick={() => onCommitDraw(file.id)}
                                className="flex-1 py-1 rounded text-[11px] font-semibold bg-emerald-700/40 text-emerald-100 hover:bg-emerald-600/60 border border-emerald-500/40"
                              >Re-draft</button>
                            )}
                          </div>

                          {/* Alignment + Open-in-editor (file rows only) */}
                          {file && (
                            <div className="pt-1.5 border-t border-gray-700/40 space-y-1.5">
                              <div className="text-[9px] text-gray-500 font-semibold uppercase tracking-wide">Align to field points (optional)</div>
                              {associated.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {associated.map(pn => {
                                    const pt = pointMap.get(pn);
                                    return (
                                      <span key={pn}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-800/50 border border-blue-600/40 text-[10px] text-blue-200"
                                        title={pt ? `E ${pt.easting.toFixed(2)}  N ${pt.northing.toFixed(2)}` : 'Point not in pointMap'}>
                                        {pn}{!pt && <span className="text-red-400 text-[8px]">?</span>}
                                        <button onClick={() => onDisassociatePoint(file.id, pn)}
                                          className="ml-0.5 text-blue-400/70 hover:text-red-400 text-[10px] leading-none">×</button>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={assocInputs[file.id] ?? ''}
                                  onChange={e => setAssocInputs(prev => ({ ...prev, [file.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAssociation(file.id); } }}
                                  placeholder="Point #s (comma-separated)…"
                                  className="flex-1 bg-gray-900/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                                />
                                <button onClick={() => handleAddAssociation(file.id)}
                                  disabled={!assocInputs[file.id]?.trim()}
                                  className="px-2 py-0.5 rounded text-[10px] bg-blue-700/60 text-blue-100 hover:bg-blue-600/80 border border-blue-500/40 disabled:opacity-40">Add</button>
                                {selectedPointNumber && (
                                  <button onClick={() => handleAddSelectedPoint(file.id)}
                                    className="px-2 py-0.5 rounded text-[10px] bg-gray-700/50 text-gray-300 hover:bg-gray-600/70 border border-gray-600/40"
                                    title={`Add canvas selection: ${selectedPointNumber}`}>↖ {selectedPointNumber}</button>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                <button onClick={() => onBestFit(file.id)} disabled={!hasAlignment}
                                  className="flex-1 py-1 rounded text-[10px] font-semibold bg-blue-700/60 text-blue-100 hover:bg-blue-600/80 border border-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={hasAlignment ? 'Run Helmert best-fit' : 'Associate at least one field point first'}>
                                  Best Fit ↔ Align
                                </button>
                                {onAlignToGIS && (
                                  <button onClick={() => onAlignToGIS(file.id)}
                                    className="flex-1 py-1 rounded text-[10px] font-semibold bg-cyan-700/60 text-cyan-50 hover:bg-cyan-600/80 border border-cyan-500/40"
                                    title="Match this deed to the best county GIS parcel and coarse-align to its centroid">
                                    Align to GIS
                                  </button>
                                )}
                                {onAlignCorners && (
                                  <button onClick={() => onAlignCorners(file.id)}
                                    className="flex-1 py-1 rounded text-[10px] font-semibold bg-indigo-700/60 text-indigo-50 hover:bg-indigo-600/80 border border-indigo-400/40"
                                    title="Pick corners: click a corner of the highlighted deed, then the found point it belongs on. Shift+click to choose from a nest of stacked points.">
                                    ⌖ Pick Corners
                                  </button>
                                )}
                                <button onClick={() => onOpenInEditor(file.id)}
                                  className="flex-1 py-1 rounded text-[10px] bg-gray-700/60 text-gray-200 hover:bg-gray-600/80 border border-gray-600/40">
                                  Open in Editor →
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}



      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-700/40">
        <p className="text-[9px] text-gray-600 italic">
          Compute shows amber preview · Align snaps deed to field monuments · Draw Commit creates CAD linework
        </p>
      </div>
      </>)}
    </div>
  );
};

export default DeedSummaryPanel;
