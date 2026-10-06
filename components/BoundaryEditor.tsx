// BoundaryEditor.tsx
// Overhauled unified Boundary & Deed Dialog.
// Integrates Deed Summary, Lite-Scan progress, multi-tract management, and COGO traverse table.
// Features enlarged, professional bearing and distance inputs with Welcome Screen styling cues.

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { BoundaryFile, BoundaryFileCall, SurveyPoint, DeedSummary, DeedTractSummary } from '../types.ts';
import { parseBearingToRadians, parseDistance, direct, calculateClosure } from '../utils/cogo.ts';
import { 
  ChevronDownIcon, 
  ChevronUpIcon, 
  ChevronRightIcon, 
  XMarkIcon, 
  TableCellsIcon, 
  ArrowUpTrayIcon, 
  FolderIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  PencilSquareIcon, 
  TrashIcon, 
  PlusIcon,
  CourthouseIcon,
  MapPinIcon,
  AdjustmentsHorizontalIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownOnSquareIcon
} from './icons.tsx';
import BearingDmsInput from './BearingDmsInput.tsx';

export interface BoundaryEditorProps {
    boundaryFiles: BoundaryFile[];
    pointMap: Map<string, SurveyPoint>;
    /** Update one or more fields on a single call and re-run COGO forward. */
    onUpdateCall: (fileId: string, callId: string, patch: Partial<BoundaryFileCall>) => void;
    /** Append a new blank call at the end of the traverse. */
    onAddCall: (fileId: string) => void;
    /** Remove a call (also removes the matching SurveyLine). */
    onRemoveCall: (fileId: string, callId: string) => void;
    /** Run a closure report on the selected boundary file. */
    onGenerateClosureReport?: (fileId: string) => void;
    /** Investigate closure: surface ambiguities + propose auto-fixes. */
    onInvestigateClosure?: (fileId: string) => void;
    /** Generate a metes-and-bounds legal description for the selected boundary file. */
    onWriteLegal?: (fileId: string) => void;
    /** Draw this boundary's calls onto the canvas as live points/lines on the configured layers. */
    onDrawToLinework?: (fileId: string) => void;
    /** Update translation / rotation of the Boundary Object. Passing null clears the field. */
    onTransformChange?: (fileId: string, patch: { translationE?: number | null; translationN?: number | null; rotationDeg?: number | null }) => void;
    /** Update the POB (Point of Beginning): override the resolved world coord and/or rename the first vertex.
     *  - `pointNumber`: replaces the first call's `from` (and downstream chain links if that PN was reused).
     *  - `pobOverride`: explicit world (E,N). Pass null to clear and fall back to pointMap/centroid/origin.
     *  v26.05.22.1
     */
    onPobChange?: (fileId: string, patch: { pointNumber?: string; pobOverride?: { easting: number; northing: number } | null }) => void;
    onClose?: () => void;
    onSaveToFileManager?: (file: BoundaryFile) => void;
    onRenameFile?: (id: string, name: string) => void;
    onToggleVisibility?: (id: string) => void;
    onLoadFile?: (file: BoundaryFile) => void;
    /** Currently-selected point number (single-select from canvas), used as the source for "Associate Selected Point". */
    selectedPointNumber?: string;
    /** Associate one or more point numbers with the boundary so they follow its visibility and round-trip in .lsvz. */
    onAssociatePoints?: (fileId: string, pointIds: string[]) => void;
    /** Remove an associated point from the boundary (does not delete the point). */
    onDisassociatePoint?: (fileId: string, pointId: string) => void;
    /** Run a 2D rigid-body best-fit (translation + rotation) of the boundary deed geometry
     * to the associated survey points. Computes the Helmert transformation that minimises
     * the sum of squared residuals between deed vertices and matching survey shots. */
    onBestFitToPoints?: (fileId: string) => void;
    /** Start an interactive line-to-line alignment on the canvas. */
    onAlignToOtherBoundary?: (movableBfId: string) => void;
    /** Start the interactive corner-pairing alignment on the canvas. */
    onAlignCornersToPoints?: (fileId: string) => void;
    /** Optional controlled selection. */
    selectedFileId?: string;
    onSelectFile?: (fileId: string) => void;
    /** Controlled flag that toggles canvas bearing/distance annotations between original and rotated bearings. */
    showRotatedBearings?: boolean;
    onShowRotatedBearingsChange?: (next: boolean) => void;
    /** Viewport space occupied by sibling UI that this fixed panel must avoid. */
    reservedRight?: number;
    reservedBottom?: number;

    // Integrated Deed Summary & Multi-Tract Props
    summary?: DeedSummary | null;
    pendingFileName?: string;
    computingTractIds?: Set<string>;
    onComputeTract?: (tractId: string, pob: { easting: number; northing: number } | null) => void;
    onComputeAll?: () => void;
    onParseNow?: () => void;
    onAlignToGIS?: (fileId: string) => void;

    // Docking Props
    isDocked?: boolean;
    onToggleDock?: () => void;
    isMinimized?: boolean;
    onToggleMinimize?: () => void;
}

/** CSS keyframes for the lite-scan animation */
const LITE_SCAN_KEYFRAMES_ID = 'lsvz-boundary-scan-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(LITE_SCAN_KEYFRAMES_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = LITE_SCAN_KEYFRAMES_ID;
  styleEl.textContent = `
    @keyframes lsvz-scan-beam {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(420%); }
    }
    @keyframes lsvz-pulse-dot {
      0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(251,191,36,0.7); }
      50%      { transform: scale(1.3); opacity: 0.85; box-shadow: 0 0 0 7px rgba(251,191,36,0); }
    }
    @keyframes lsvz-bar-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }
  `;
  document.head.appendChild(styleEl);
}

const SCAN_STATUSES = [
  'Reading deed pages…',
  'Locating metes-and-bounds passages…',
  'Identifying separate tracts…',
  'Extracting grantor / grantee / book / page…',
  'Drafting traverse calls…',
];

const RotatingScanStatus: React.FC = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % SCAN_STATUSES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-[11px] text-sky-300/90 mt-0.5 min-h-[1.2em] italic font-medium">
      {SCAN_STATUSES[idx]}
    </div>
  );
};

// Confidence pill — shown in the editor header while the parsed deed is in
// its amber pre-commit state.
const ConfidencePill: React.FC<{ confidence: NonNullable<BoundaryFile['deedConfidence']> }> = ({ confidence }) => {
    const [open, setOpen] = useState(false);
    const cfg = {
        high:   { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/70', bg: 'bg-emerald-950/40', bar: 'bg-emerald-400', label: 'High confidence' },
        medium: { dot: 'bg-amber-400',  text: 'text-amber-300',  border: 'border-amber-500/70',  bg: 'bg-amber-950/40', bar: 'bg-amber-400',  label: 'Medium confidence' },
        low:    { dot: 'bg-rose-400',    text: 'text-rose-300',    border: 'border-rose-500/70',    bg: 'bg-rose-950/40', bar: 'bg-rose-400',    label: 'Low confidence' },
    }[confidence.level];

    return (
        <div className="pt-0.5">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`relative overflow-hidden w-full flex items-center gap-2 pl-6 pr-3.5 py-2 rounded-xl border border-l-0 border-dashed ${cfg.border} ${cfg.bg} hover:brightness-110 transition shadow-sm`}
                title={`${cfg.label} (${confidence.source === 'ai' ? 'AI self-rated' : 'derived from uncertainty count'})`}
            >
                <span className={`absolute inset-y-0 left-0 w-3 ${cfg.bar} rounded-l-xl`} aria-hidden="true" />
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.dot} shadow-sm shrink-0`} />
                <span className={`text-xs font-black ${cfg.text}`}>{cfg.label}</span>
                <span className="text-xs text-gray-200 font-medium ml-1">
                    ({confidence.source === 'ai' ? 'AI self-rated' : 'derived'})
                </span>
                <span className="ml-auto text-xs font-bold text-cyan-300 hover:text-cyan-200 underline">
                    {confidence.reasons.length > 0 ? (open ? 'hide details ▲' : 'why? details ▼') : ''}
                </span>
            </button>
            {open && confidence.reasons.length > 0 && (
                <ul className={`mt-1.5 ml-4 list-disc list-inside text-xs ${cfg.text} space-y-1 bg-gray-950/80 p-2.5 rounded-lg border border-dashed border-gray-700 font-semibold shadow-inner`}>
                    {confidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
            )}
        </div>
    );
};

// Compute closure summary from current boundary file + live point coordinates.
function computeClosureSummary(file: BoundaryFile, pointMap: Map<string, SurveyPoint>) {
    if (file.calls.length < 2) return null;
    const incomplete = file.calls.some(c => c.isCurve
        ? (typeof c.curveRadius !== 'number' || typeof c.arcLength !== 'number'
            || !isFinite(c.curveRadius) || !isFinite(c.arcLength)
            || c.curveRadius === 0 || c.arcLength === 0)
        : !(c.bearing && c.distance)
    );
    if (incomplete) return null;
    const lines = file.calls.map(c => ({
        from: c.from,
        to: c.to,
        bearing: c.bearing,
        distance: c.distance,
        isCurve: c.isCurve,
        curveRadius: c.curveRadius,
        arcLength: c.arcLength,
        chordBearing: c.chordBearing,
        tangentBearing: c.tangentBearing,
        curveDirection: c.curveDirection,
        deltaAngle: undefined as number | undefined,
    }));
    try {
        return calculateClosure(lines, pointMap);
    } catch {
        return null;
    }
}

const BoundaryEditor: React.FC<BoundaryEditorProps> = ({
    boundaryFiles,
    pointMap,
    onUpdateCall,
    onAddCall,
    onRemoveCall,
    onGenerateClosureReport,
    onInvestigateClosure,
    onWriteLegal,
    onDrawToLinework,
    onTransformChange,
    onPobChange,
    onClose,
    onSaveToFileManager,
    onRenameFile,
    onToggleVisibility,
    onLoadFile,
    selectedPointNumber,
    onAssociatePoints,
    onDisassociatePoint,
    onBestFitToPoints,
    onAlignToOtherBoundary,
    onAlignCornersToPoints,
    selectedFileId: controlledSelectedFileId,
    onSelectFile,
    showRotatedBearings: controlledShowRotatedBearings,
    onShowRotatedBearingsChange,
    reservedRight = 0,
    reservedBottom = 0,
    summary,
    pendingFileName,
    computingTractIds,
    onComputeTract,
    onComputeAll,
    onParseNow,
    onAlignToGIS,
    isDocked = false,
    onToggleDock,
    isMinimized: controlledMinimized,
    onToggleMinimize,
}) => {
    const [internalMinimized, setInternalMinimized] = useState(false);
    const isMinimized = controlledMinimized !== undefined ? controlledMinimized : internalMinimized;
    const toggleMinimize = useCallback(() => {
        if (onToggleMinimize) {
            onToggleMinimize();
        } else {
            setInternalMinimized(m => !m);
        }
    }, [onToggleMinimize]);

    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    const [showToolsDrawer, setShowToolsDrawer] = useState(false);
    const [internalSelectedFileId, setInternalSelectedFileId] = useState<string>('');

    const selectedFileId = controlledSelectedFileId !== undefined
        ? controlledSelectedFileId
        : internalSelectedFileId;

    const setSelectedFileId: React.Dispatch<React.SetStateAction<string>> = useCallback((value) => {
        const nextId = typeof value === 'function'
            ? (value as (prev: string) => string)(selectedFileId)
            : value;
        if (controlledSelectedFileId === undefined) setInternalSelectedFileId(nextId);
        onSelectFile?.(nextId);
    }, [controlledSelectedFileId, selectedFileId, onSelectFile]);

    // Local edit values: `${callId}.${field}` → string (text inputs)
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    // Set of call IDs whose curve-detail row is expanded.
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Rename state
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    // Load file ref
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Drag state
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const dragState = useRef<{
        isDragging: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        offset: { x: number; y: number };
        width: number;
        height: number;
        currentX: number;
        currentY: number;
        rafPending: boolean;
    }>({
        isDragging: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        origX: 0,
        origY: 0,
        offset: { x: 0, y: 0 },
        width: 600,
        height: 480,
        currentX: 0,
        currentY: 0,
        rafPending: false,
    });

    const [associateInput, setAssociateInput] = useState('');
    const [showAllBoundaries, setShowAllBoundaries] = useState(false);

    // Toggle for canvas rotated bearings
    const [internalShowRotatedBearings, setInternalShowRotatedBearings] = useState(false);
    const showRotatedBearings = controlledShowRotatedBearings !== undefined
        ? controlledShowRotatedBearings
        : internalShowRotatedBearings;
    const setShowRotatedBearings = useCallback((next: boolean) => {
        if (controlledShowRotatedBearings === undefined) setInternalShowRotatedBearings(next);
        onShowRotatedBearingsChange?.(next);
    }, [controlledShowRotatedBearings, onShowRotatedBearingsChange]);

    const panelEdgeGap = 10;
    const panelTopLimit = 56;

    // Default to the lower-right of the canvas area, excluding the chat rail.
    const getDefaultPos = useCallback(() => {
        const panelWidth = panelRef.current?.getBoundingClientRect().width ?? Math.min(600, window.innerWidth - panelEdgeGap * 2);
        const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 480;
        return {
            x: Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap),
            y: Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap),
        };
    }, [reservedBottom, reservedRight]);

    const clampPosition = useCallback((candidate: { x: number; y: number }) => {
        const rect = panelRef.current?.getBoundingClientRect();
        const panelWidth = rect?.width ?? Math.min(600, window.innerWidth - panelEdgeGap * 2);
        const panelHeight = rect?.height ?? 480;
        const maxX = Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap);
        const maxY = Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap);
        return {
            x: Math.max(panelEdgeGap, Math.min(maxX, candidate.x)),
            y: Math.max(panelTopLimit, Math.min(maxY, candidate.y)),
        };
    }, [reservedBottom, reservedRight]);

    useLayoutEffect(() => {
        if (isDocked) return;
        const clamp = () => {
            if (dragState.current.isDragging) return;
            setPos(previous => {
                const next = clampPosition(previous ?? getDefaultPos());
                return previous && previous.x === next.x && previous.y === next.y ? previous : next;
            });
        };
        clamp();
        const observer = typeof ResizeObserver !== 'undefined' && panelRef.current
            ? new ResizeObserver(clamp)
            : null;
        if (panelRef.current) observer?.observe(panelRef.current);
        window.addEventListener('resize', clamp);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', clamp);
        };
    }, [isDocked, clampPosition, getDefaultPos]);

    // Butter-smooth drag initiation (supports mouse and touch, matching useFabDrag)
    const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (isDocked) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, a, textarea')) return;

        const isTouch = 'touches' in e;
        const point = isTouch ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
        if (!point) return;

        const rect = panelRef.current?.getBoundingClientRect();
        const current = pos ?? getDefaultPos();
        const width = rect?.width ?? Math.min(600, window.innerWidth - panelEdgeGap * 2);
        const height = rect?.height ?? 480;
        const origX = rect?.left ?? current.x;
        const origY = rect?.top ?? current.y;

        dragState.current = {
            isDragging: true,
            hasMoved: false,
            startX: point.clientX,
            startY: point.clientY,
            origX,
            origY,
            offset: {
                x: point.clientX - origX,
                y: point.clientY - origY,
            },
            width,
            height,
            currentX: origX,
            currentY: origY,
            rafPending: false,
        };

        if (!isTouch) {
            e.preventDefault();
        }
    }, [isDocked, pos, getDefaultPos]);

    // Global drag listener matching useFabDrag for 60/120fps smoothness without reflows
    useEffect(() => {
        if (isDocked) return;

        const handlePointerMove = (e: MouseEvent | TouchEvent) => {
            const state = dragState.current;
            if (!state.isDragging) return;

            const isTouch = 'touches' in e;
            const point = isTouch ? (e as TouchEvent).touches[0] : (e as MouseEvent);
            if (!point) return;

            const dist = Math.hypot(point.clientX - state.startX, point.clientY - state.startY);
            if (dist > 3 && !state.hasMoved) {
                state.hasMoved = true;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
                if (panelRef.current) {
                    panelRef.current.style.transition = 'none';
                    panelRef.current.style.willChange = 'left, top';
                }
            }

            if (!state.hasMoved) return;

            if (e.cancelable) {
                e.preventDefault();
            }

            const maxX = Math.max(panelEdgeGap, window.innerWidth - reservedRight - state.width - panelEdgeGap);
            const maxY = Math.max(panelTopLimit, window.innerHeight - reservedBottom - state.height - panelEdgeGap);

            const nextX = Math.max(panelEdgeGap, Math.min(maxX, point.clientX - state.offset.x));
            const nextY = Math.max(panelTopLimit, Math.min(maxY, point.clientY - state.offset.y));

            state.currentX = nextX;
            state.currentY = nextY;

            if (!state.rafPending) {
                state.rafPending = true;
                requestAnimationFrame(() => {
                    state.rafPending = false;
                    if (state.isDragging && panelRef.current) {
                        panelRef.current.style.left = `${state.currentX}px`;
                        panelRef.current.style.top = `${state.currentY}px`;
                    }
                });
            }
        };

        const handlePointerUp = () => {
            const state = dragState.current;
            if (!state.isDragging) return;
            state.isDragging = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            if (panelRef.current) {
                panelRef.current.style.transition = '';
                panelRef.current.style.willChange = 'auto';
            }

            if (state.hasMoved) {
                setPos({ x: state.currentX, y: state.currentY });
            }
        };

        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('touchmove', handlePointerMove, { passive: false });
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('touchend', handlePointerUp);
        window.addEventListener('touchcancel', handlePointerUp);

        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('touchmove', handlePointerMove);
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchend', handlePointerUp);
            window.removeEventListener('touchcancel', handlePointerUp);
        };
    }, [isDocked, reservedBottom, reservedRight]);

    // Select newest file by default when list changes
    useEffect(() => {
        if (boundaryFiles.length > 0) {
            const latestId = boundaryFiles[boundaryFiles.length - 1].id;
            setSelectedFileId(prev => {
                const stillValid = boundaryFiles.some(f => f.id === prev);
                return stillValid ? prev : latestId;
            });
        }
    }, [boundaryFiles, setSelectedFileId]);

    // Clear stale edit values when selected file changes
    useEffect(() => {
        setEditValues({});
    }, [selectedFileId]);

    const selectedFile = boundaryFiles.find(f => f.id === selectedFileId) ?? (boundaryFiles.length > 0 ? boundaryFiles[boundaryFiles.length - 1] : undefined);

    // If there are no boundary files, but a summary or pending file exists, we still render the summary card
    if (!selectedFile && !summary && !pendingFileName) return null;

    const closure = selectedFile ? computeClosureSummary(selectedFile, pointMap) : null;

    // Ensure deed descriptions are always accessible even when there is only one description
    const tractList: DeedTractSummary[] = (summary?.tracts && summary.tracts.length > 0)
        ? summary.tracts
        : (summary ? [{
            tractId: summary.parcelId ? `Parcel ${summary.parcelId}` : 'Main Parcel',
            tractName: pendingFileName || selectedFile?.name || 'Property Description',
            grantor: summary.grantor,
            grantee: summary.owner,
            parcelId: summary.parcelId,
        }] : []);

    const singleTract = tractList.length === 1 ? tractList[0] : undefined;
    const matchingSingleFile = singleTract
        ? boundaryFiles.find(f => f.sourceTractId === singleTract.tractId || f.name.toLowerCase().includes(singleTract.tractId.toLowerCase()) || f.calls.some(c => Boolean(c.bearing && c.distance)))
        : undefined;
    const isSingleComputed = !!(matchingSingleFile && matchingSingleFile.calls.some(c => Boolean(c.bearing && c.distance)));
    const isSingleBusy = !!(singleTract && computingTractIds?.has(singleTract.tractId));
    const isAnyBusy = Boolean((computingTractIds && computingTractIds.size > 0) || isSingleBusy);

    const getDisplayValue = (callId: string, field: string, fallback: string) => {
        const key = `${callId}.${field}`;
        return editValues[key] !== undefined ? editValues[key] : fallback;
    };

    const handleChange = (callId: string, field: string, value: string) => {
        setEditValues(prev => ({ ...prev, [`${callId}.${field}`]: value }));
    };

    const handleCommit = (
        callId: string,
        field: keyof BoundaryFileCall,
        value: string,
        coerce?: (s: string) => unknown,
    ) => {
        if (!selectedFile) return;
        const key = `${callId}.${String(field)}`;
        setEditValues(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        const finalValue = coerce ? coerce(value) : value;
        const existingCall = selectedFile.calls.find(c => c.id === callId);
        if (existingCall) {
            const current = (existingCall as Record<string, unknown>)[field as string];
            if (current === finalValue) return;
            if ((current === undefined || current === '') && (finalValue === undefined || finalValue === '')) return;
        }
        onUpdateCall(selectedFile.id, callId, { [field]: finalValue } as Partial<BoundaryFileCall>);
    };

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        callId: string,
        field: keyof BoundaryFileCall,
        coerce?: (s: string) => unknown,
    ) => {
        if (e.key === 'Enter') {
            const el = inputRefs.current[`${callId}.${String(field)}`];
            if (el) {
                handleCommit(callId, field, el.value, coerce);
                el.blur();
            }
        }
        if (e.key === 'Escape') {
            setEditValues(prev => {
                const next = { ...prev };
                delete next[`${callId}.${String(field)}`];
                return next;
            });
            (e.target as HTMLInputElement).blur();
        }
    };

    const toggleExpanded = (callId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(callId)) next.delete(callId);
            else next.add(callId);
            return next;
        });
    };

    const toNumOrUndef = (s: string): number | undefined => {
        const t = s.trim();
        if (!t) return undefined;
        const n = parseFloat(t);
        return Number.isFinite(n) ? n : undefined;
    };

    const toStrOrUndef = (s: string): string | undefined => {
        const t = s.trim();
        return t ? t : undefined;
    };

    const formatArea = (sqFt: number) => {
        if (sqFt >= 4356) {
            return `${(sqFt / 43560).toFixed(4)} ac (${sqFt.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft)`;
        }
        return `${sqFt.toFixed(2)} sq ft`;
    };

    const handleLoadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onLoadFile) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) return;
            const calls: BoundaryFileCall[] = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length < 5) continue;
                calls.push({
                    id: `loaded-${Date.now()}-${i}`,
                    from: parts[1]?.trim() ?? '',
                    to: parts[2]?.trim() ?? '',
                    bearing: parts[3]?.trim() ?? '',
                    distance: parts[4]?.trim() ?? '',
                    isCurve: parts[5]?.trim().toLowerCase() === 'yes',
                    curveRadius: parts[6]?.trim() ? parseFloat(parts[6]) : undefined,
                    arcLength: parts[7]?.trim() ? parseFloat(parts[7]) : undefined,
                    chordBearing: parts[8]?.trim() || undefined,
                });
            }
            const newFile: BoundaryFile = {
                id: `bf-loaded-${Date.now()}`,
                name: file.name.replace(/\.csv$/i, ''),
                createdAt: new Date().toISOString(),
                calls,
            };
            onLoadFile(newFile);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const currentPos = pos ?? getDefaultPos();
    const maxPanelHeight = Math.max(200, window.innerHeight - reservedBottom - panelTopLimit - panelEdgeGap);

    return (
        <div
            ref={isDocked ? undefined : panelRef}
            style={isDocked ? {
                fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            } : { 
                left: currentPos.x, 
                top: currentPos.y, 
                width: Math.min(600, typeof window !== 'undefined' ? window.innerWidth - panelEdgeGap * 2 : 600), 
                maxHeight: maxPanelHeight,
                fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            }}
            className={isDocked ? (
                "w-full bg-gray-900/95 border-0 text-xs text-gray-200 select-none light-theme:bg-white light-theme:text-gray-800 flex flex-col overflow-hidden antialiased"
            ) : (
                `fixed z-30 max-w-[calc(100vw-1rem)] bg-gray-900/95 border border-gray-700/80 rounded-xl shadow-2xl backdrop-blur-md text-xs text-gray-200 select-none light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800 flex flex-col overflow-hidden antialiased transition-shadow ${
                    isMinimized ? 'shadow-lg' : 'shadow-2xl'
                }`
            )}
        >
            {/* Header — drag handle with Welcome Screen styling */}
            <div
                className={`flex items-center justify-between px-3.5 py-2.5 bg-gray-950/80 border-b border-gray-800/80 ${isDocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} light-theme:bg-gray-100/90 light-theme:border-gray-200 shrink-0 gap-2 select-none ${
                    isMinimized && !isDocked ? 'rounded-xl border-b-0' : ''
                }`}
                style={{ touchAction: isDocked ? 'auto' : 'none' }}
                onMouseDown={isDocked ? undefined : handlePointerDown}
                onTouchStart={isDocked ? undefined : handlePointerDown}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 overflow-hidden">
                    <CourthouseIcon className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="flex items-baseline gap-1.5 shrink-0">
                        <h2 className="text-sm font-extrabold tracking-tight text-white light-theme:text-gray-900 whitespace-nowrap">
                            Boundary<span className="text-cyan-400">Agent</span>
                        </h2>
                        <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider shrink-0 whitespace-nowrap">
                            Dialog
                        </span>
                    </div>

                    {/* Boundary file selector / tract switcher */}
                    {boundaryFiles.length > 0 && selectedFile && (
                        <div className="min-w-0 flex-1 max-w-[180px] overflow-hidden ml-1">
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={() => {
                                        if (onRenameFile && renameValue.trim() && selectedFile) onRenameFile(selectedFile.id, renameValue.trim());
                                        setIsRenaming(false);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                        if (e.key === 'Escape') setIsRenaming(false);
                                    }}
                                    className="bg-gray-950 border border-cyan-500 text-cyan-200 rounded-lg px-2.5 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-cyan-500 shadow-sm"
                                />
                            ) : (
                                <select
                                    value={selectedFileId}
                                    onChange={e => setSelectedFileId(e.target.value)}
                                    className="bg-gray-900 hover:bg-gray-850 border border-gray-700/80 hover:border-gray-600 text-gray-200 rounded-lg px-2.5 py-1 text-xs w-full min-w-0 truncate focus:outline-none focus:ring-1 focus:ring-cyan-500 font-medium cursor-pointer shadow-sm transition-colors light-theme:bg-gray-200 light-theme:border-gray-300 light-theme:text-gray-900"
                                >
                                    {boundaryFiles.map(f => (
                                        <option key={f.id} value={f.id}>
                                            {f.hidden ? '○ ' : '● '}{f.name} ({f.calls.length} calls)
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                </div>

                {/* Header Action Tools */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* File actions button group */}
                    <div className="flex items-center gap-0.5 bg-gray-900/80 border border-gray-800 rounded-lg p-0.5 shadow-sm light-theme:bg-gray-200/80 light-theme:border-gray-300">
                        {onToggleVisibility && selectedFile && (
                            <button
                                onClick={() => onToggleVisibility(selectedFile.id)}
                                className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors light-theme:hover:bg-gray-300"
                                title={selectedFile.hidden ? 'Show boundary overlay on canvas' : 'Hide boundary overlay on canvas'}
                            >
                                {selectedFile.hidden
                                    ? <EyeSlashIcon className="w-3.5 h-3.5 text-gray-500" />
                                    : <EyeIcon className="w-3.5 h-3.5 text-cyan-400" />}
                            </button>
                        )}
                        {onRenameFile && selectedFile && !isRenaming && (
                            <button
                                onClick={() => { setRenameValue(selectedFile.name); setIsRenaming(true); }}
                                className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-amber-300 transition-colors light-theme:hover:bg-gray-300"
                                title="Rename boundary"
                            >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {onLoadFile && (
                            <>
                                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleLoadCSV} />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-blue-400 transition-colors light-theme:hover:bg-gray-300"
                                    title="Import boundary from CSV"
                                >
                                    <FolderIcon className="w-3.5 h-3.5" />
                                </button>
                            </>
                        )}
                        {onSaveToFileManager && selectedFile && (
                            <button
                                onClick={() => onSaveToFileManager(selectedFile)}
                                className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-emerald-400 transition-colors light-theme:hover:bg-gray-300"
                                title="Save boundary to CSV file"
                            >
                                <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="w-px h-4 bg-gray-800 mx-0.5 light-theme:bg-gray-300" />

                    {/* Window control group: Dock/Pop-out, Minimize, Close */}
                    <div className="flex items-center gap-1">
                        {onToggleDock && (
                            <button
                                onClick={onToggleDock}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
                                    isDocked
                                        ? 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/60 shadow-cyan-950/40'
                                        : 'bg-gray-800 hover:bg-gray-700 text-cyan-300 hover:text-white border border-gray-600'
                                }`}
                                title={isDocked ? 'Pop out boundary dialog to a floating window on canvas' : 'Dock boundary dialog into Boundary Agent chat'}
                                aria-label={isDocked ? 'Pop out boundary dialog' : 'Dock boundary dialog'}
                            >
                                {isDocked ? (
                                    <>
                                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                        <span className="whitespace-nowrap font-bold">Pop Out</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownOnSquareIcon className="w-3.5 h-3.5" />
                                        <span className="whitespace-nowrap font-bold">Dock</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={toggleMinimize}
                            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors light-theme:hover:bg-gray-200"
                            title={isDocked ? 'Minimize in chat' : (isMinimized ? 'Expand dialog' : 'Minimize dialog')}
                            aria-label={isDocked ? 'Minimize in chat' : (isMinimized ? 'Expand dialog' : 'Minimize dialog')}
                        >
                            {isMinimized && !isDocked ? (
                                <ChevronDownIcon className="w-4 h-4" />
                            ) : (
                                <ChevronUpIcon className="w-4 h-4" />
                            )}
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-rose-950/60 text-gray-400 hover:text-rose-400 transition-colors light-theme:hover:bg-rose-100"
                                title="Close boundary dialog"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Dialog Content Area */}
            {!isMinimized && (
                <div className={`flex-1 overflow-y-auto px-3.5 py-3 space-y-3 ${isDocked ? 'max-h-[50vh] sm:max-h-[55vh]' : ''}`}>
                    {/* ========================================================= */}
                    {/* INTEGRATED DEED SUMMARY & LITE-SCAN BANNER                */}
                    {/* ========================================================= */}
                    {/* Pre-parse Lite-Scan State */}
                    {!summary && pendingFileName && boundaryFiles.length === 0 && (
                        <div className="relative overflow-hidden rounded-xl border border-gray-700/80 bg-gray-950/80 shadow-xl light-theme:bg-gray-50 light-theme:border-gray-200">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-sky-400 to-emerald-500" />
                            <div
                                className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-amber-400/10 to-transparent"
                                style={{ animation: 'lsvz-scan-beam 2.4s linear infinite' }}
                            />
                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="relative shrink-0 mt-0.5">
                                        <div className="w-10 h-12 rounded-lg bg-gray-900 border border-gray-700/80 flex flex-col items-center justify-center gap-1 overflow-hidden light-theme:bg-white light-theme:border-gray-300">
                                            <div className="w-6 h-0.5 rounded-full bg-amber-400" />
                                            <div className="w-6 h-px rounded-full bg-gray-600" />
                                            <div className="w-6 h-px rounded-full bg-gray-600" />
                                            <div className="w-4 h-px rounded-full bg-gray-700" />
                                            <div className="w-6 h-px rounded-full bg-gray-600" />
                                        </div>
                                        <span
                                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-gray-950"
                                            style={{ animation: 'lsvz-pulse-dot 1.6s ease-in-out infinite' }}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold bg-amber-400/20 text-amber-300 border border-amber-500/30">
                                                Boundary Agent
                                            </span>
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-sky-400/15 text-sky-300 border border-sky-500/30">
                                                Lite Scan
                                            </span>
                                        </div>
                                        <div className="font-bold text-white text-sm truncate light-theme:text-gray-900" title={pendingFileName}>
                                            {pendingFileName}
                                        </div>
                                        <RotatingScanStatus />
                                    </div>
                                </div>

                                <div className="mt-3 h-1 rounded-full bg-gray-800 overflow-hidden light-theme:bg-gray-200">
                                    <div
                                        className="h-full w-1/3 bg-gradient-to-r from-amber-500/0 via-amber-400 to-amber-500/0"
                                        style={{ animation: 'lsvz-bar-slide 1.6s ease-in-out infinite' }}
                                    />
                                </div>

                                {onParseNow && (
                                    <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between">
                                        <span className="text-[11px] text-gray-400">Taking longer than expected?</span>
                                        <button
                                            onClick={onParseNow}
                                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
                                        >
                                            Parse Full Deed Now ▶
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Integrated Deed Document Summary & Multi-Tract Card */}
                    {Boolean(summary && (summary.grantor || summary.owner || summary.parcelId || summary.book || tractList.length > 0)) && (
                        <div className="relative overflow-hidden rounded-xl border border-l-0 border-dashed border-cyan-400/80 bg-gray-950/90 pl-6 pr-4 py-3.5 shadow-lg light-theme:bg-gray-50 light-theme:border-cyan-500">
                            <span className="absolute inset-y-0 left-0 w-3 bg-cyan-400 rounded-l-xl shadow-sm" aria-hidden="true" />
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-xs font-black uppercase tracking-wider text-cyan-300 light-theme:text-cyan-700">
                                        Deed Summary
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-200 border border-cyan-400/50 text-[10px] font-mono font-bold">
                                        {tractList.length === 1 ? '1 description detected' : `${tractList.length} tracts detected`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {tractList.length > 1 && onComputeAll && (
                                        <button
                                            onClick={onComputeAll}
                                            disabled={isAnyBusy}
                                            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-colors disabled:opacity-50 active:scale-95"
                                            title="Parse and compute every tract from this deed at once"
                                        >
                                            {isAnyBusy ? 'Extracting…' : 'Compute All Tracts ▶'}
                                        </button>
                                    )}
                                    {tractList.length === 1 && !isSingleComputed && onComputeTract && (
                                        <button
                                            onClick={() => onComputeTract(singleTract!.tractId, null)}
                                            disabled={isSingleBusy}
                                            className="px-3.5 py-1 rounded-lg text-xs font-black bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all disabled:opacity-50 active:scale-95 border border-amber-400/50"
                                            title="Parse and plot this deed boundary on the canvas"
                                        >
                                            {isSingleBusy ? 'Extracting Calls…' : 'Compute & Plot ▶'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsSummaryCollapsed(c => !c)}
                                        className="text-xs font-bold text-gray-300 hover:text-white transition-colors"
                                    >
                                        {isSummaryCollapsed ? 'Expand ▲' : 'Collapse ▼'}
                                    </button>
                                </div>
                            </div>

                            {!isSummaryCollapsed && (
                                <div className="space-y-2.5 pt-1">
                                    {/* Document Metadata Pill Strip */}
                                    <div className="flex flex-wrap gap-2 text-xs text-gray-200 pb-2.5 border-b border-gray-750 light-theme:text-gray-700">
                                        {summary!.grantor && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900 border border-gray-700">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold">Grantor:</span>
                                                <span className="font-bold text-white light-theme:text-gray-900">{summary!.grantor}</span>
                                            </span>
                                        )}
                                        {summary!.owner && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900 border border-gray-700">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold">Grantee:</span>
                                                <span className="font-bold text-white light-theme:text-gray-900">{summary!.owner}</span>
                                            </span>
                                        )}
                                        {summary!.parcelId && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-500/60 shadow-sm">
                                                <span className="text-[10px] text-cyan-300 uppercase tracking-wider font-extrabold">Parcel:</span>
                                                <span className="font-mono text-cyan-200 font-black">{summary!.parcelId}</span>
                                            </span>
                                        )}
                                        {summary!.book && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900 border border-gray-700">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold">Book/Page:</span>
                                                <span className="font-mono text-white font-bold">{summary!.book}{summary!.page ? ` / ${summary!.page}` : ''}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Multi-Tract List */}
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {tractList.map((t) => {
                                            const matchingFile = boundaryFiles.find(f => f.sourceTractId === t.tractId || f.name.toLowerCase().includes(t.tractId.toLowerCase()) || (tractList.length === 1 && f.calls.some(c => Boolean(c.bearing && c.distance))));
                                            const isComputed = !!(matchingFile && matchingFile.calls.some(c => Boolean(c.bearing && c.distance)));
                                            const isDrafted = matchingFile ? ((matchingFile.drawnPointIds?.length ?? 0) > 0 || (matchingFile.drawnLineIds?.length ?? 0) > 0) : false;
                                            const isSelected = matchingFile && matchingFile.id === selectedFileId;
                                            const isBusy = !!computingTractIds?.has(t.tractId);

                                            return (
                                                <div
                                                    key={t.tractId}
                                                    className={`flex flex-col gap-1.5 p-3 rounded-lg border text-xs transition-colors ${
                                                        isSelected
                                                            ? 'bg-cyan-950/70 border-cyan-400 text-white shadow-md'
                                                            : 'bg-gray-900/90 border-gray-700 text-gray-200 hover:bg-gray-850'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div 
                                                            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                                            onClick={() => {
                                                                if (matchingFile) setSelectedFileId(matchingFile.id);
                                                            }}
                                                        >
                                                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDrafted ? 'bg-emerald-400 ring-2 ring-emerald-500/50' : isComputed ? 'bg-cyan-400 ring-2 ring-cyan-500/40' : isBusy ? 'bg-amber-400 animate-pulse' : 'bg-amber-400'}`} />
                                                            <span className="font-black text-white text-sm truncate light-theme:text-gray-900">
                                                                {t.tractId}
                                                            </span>
                                                            {t.tractName && t.tractName !== t.tractId && (
                                                                <span className="text-gray-300 font-semibold truncate text-xs">
                                                                    ({t.tractName})
                                                                </span>
                                                            )}
                                                            {t.acreage && (
                                                                <span className="text-emerald-300 font-mono text-xs font-black shrink-0 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/50 shadow-sm">
                                                                    {t.acreage}
                                                                </span>
                                                            )}
                                                            {t.sourcePage != null && (
                                                                <span className="text-gray-300 text-xs font-bold shrink-0">
                                                                    p.{t.sourcePage}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {isBusy ? (
                                                                <span className="text-amber-300 font-black text-xs flex items-center gap-1.5 bg-amber-950/90 px-2.5 py-1 rounded border border-amber-500/50 shadow-sm">
                                                                    <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                                                    Extracting…
                                                                </span>
                                                            ) : !isComputed && onComputeTract ? (
                                                                <button
                                                                    onClick={() => onComputeTract(t.tractId, null)}
                                                                    className="px-3 py-1 rounded-md text-xs font-black bg-amber-600 hover:bg-amber-500 text-white shadow-md border border-amber-400/50 transition-all active:scale-95"
                                                                >
                                                                    Compute &amp; Plot ▶
                                                                </button>
                                                            ) : isComputed && !isSelected ? (
                                                                <button
                                                                    onClick={() => matchingFile && setSelectedFileId(matchingFile.id)}
                                                                    className="px-3 py-1 rounded-md text-xs font-bold bg-gray-800 hover:bg-gray-700 text-cyan-300 hover:text-white border border-gray-600 transition-colors"
                                                                >
                                                                    Select
                                                                </button>
                                                            ) : null}
                                                            {isComputed && isSelected && (
                                                                <span className="text-cyan-200 text-xs font-black bg-cyan-950 border border-cyan-400/60 px-2.5 py-0.5 rounded-full shadow-sm">
                                                                    ● Active ({matchingFile.calls.length} calls)
                                                                </span>
                                                            )}
                                                            {isDrafted && (
                                                                <span className="text-emerald-300 text-xs font-black bg-emerald-950 border border-emerald-400/60 px-2.5 py-0.5 rounded-full shadow-sm">✓ Drafted</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {t.snippet && (
                                                        <div className="text-xs text-gray-200 bg-gray-950/90 px-3 py-1.5 rounded-md border border-gray-750 font-mono italic leading-relaxed truncate max-w-full" title={t.snippet}>
                                                            &ldquo;{t.snippet}&rdquo;
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Confidence Pill */}
                    {selectedFile?.deedConfidence && (
                        <ConfidencePill confidence={selectedFile.deedConfidence} />
                    )}

                    {/* Quick All-Boundaries Drawer */}
                    {boundaryFiles.length > 1 && (
                        <div className="border border-gray-800 rounded-lg bg-gray-950/40 overflow-hidden">
                            <button
                                onClick={() => setShowAllBoundaries(p => !p)}
                                className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-gray-400 hover:text-gray-200 hover:bg-gray-900/60"
                            >
                                <span className="font-semibold uppercase tracking-wider">All Boundaries ({boundaryFiles.length})</span>
                                <span>{showAllBoundaries ? '▾' : '▸'}</span>
                            </button>
                            {showAllBoundaries && (
                                <div className="max-h-36 overflow-y-auto px-2 pb-2 space-y-1">
                                    {boundaryFiles.map(f => {
                                        const isActive = f.id === selectedFile?.id;
                                        return (
                                            <div
                                                key={f.id}
                                                className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                                                    isActive ? 'bg-cyan-950/50 text-cyan-200 border border-cyan-700/50' : 'text-gray-300 hover:bg-gray-800/50'
                                                }`}
                                            >
                                                {onToggleVisibility && (
                                                    <button
                                                        onClick={() => onToggleVisibility(f.id)}
                                                        className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                                                        title={f.hidden ? 'Show overlay' : 'Hide overlay'}
                                                    >
                                                        {f.hidden ? <EyeSlashIcon className="w-3.5 h-3.5 text-gray-500" /> : <EyeIcon className="w-3.5 h-3.5 text-cyan-400" />}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setSelectedFileId(f.id)}
                                                    className="flex-1 min-w-0 text-left truncate font-mono font-medium"
                                                >
                                                    {isActive ? '● ' : '  '}{f.name}
                                                </button>
                                                <span className="text-gray-500 font-mono text-[11px] shrink-0">
                                                    {f.calls.length} calls
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TRAVERSE CALLS SPREADSHEET TABLE                          */}
                    {/* ========================================================= */}
                    {selectedFile && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-dashed border-gray-600 bg-gray-950/80 overflow-hidden shadow-lg light-theme:bg-white light-theme:border-gray-300">
                                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="text-white bg-gray-900 border-b border-gray-700 sticky top-0 z-10 light-theme:bg-gray-100 light-theme:border-gray-250">
                                                <th className="w-7 py-2.5 px-1"></th>
                                                <th className="text-center py-2.5 px-1 font-black text-[10px] uppercase tracking-wider text-gray-200 w-8">#</th>
                                                <th className="text-left py-2.5 px-2.5 font-black text-[10px] uppercase tracking-wider text-cyan-200 w-[235px]">Bearing (N/S · DMS · E/W)</th>
                                                <th className="text-left py-2.5 px-2 font-black text-[10px] uppercase tracking-wider text-cyan-200 w-28">Distance (ft)</th>
                                                <th className="text-center py-2.5 px-1 font-black text-[10px] uppercase tracking-wider text-gray-200 w-12">From</th>
                                                <th className="text-center py-2.5 px-1 font-black text-[10px] uppercase tracking-wider text-gray-200 w-12">To</th>
                                                <th className="text-center py-2.5 px-1 font-black text-[10px] uppercase tracking-wider text-gray-200 w-12">Status</th>
                                                <th className="w-8 py-2.5 px-1"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedFile.calls.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="py-8 text-center bg-gray-950/40 light-theme:bg-gray-50">
                                                        {isAnyBusy ? (
                                                            <div className="flex flex-col items-center justify-center gap-2">
                                                                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                                                <span className="text-cyan-300 font-semibold text-xs light-theme:text-cyan-700">Extracting boundary calls from deed...</span>
                                                                <span className="text-gray-500 text-[11px]">Bearings and distances will populate automatically</span>
                                                            </div>
                                                        ) : tractList.length > 0 && !isSingleComputed ? (
                                                            <div className="flex flex-col items-center justify-center gap-2">
                                                                <span className="text-gray-200 font-bold text-xs light-theme:text-gray-800">Deed description loaded — ready to extract</span>
                                                                <span className="text-gray-400 text-[11px]">Click below to parse bearings and distances, or key in calls manually.</span>
                                                                <button
                                                                    onClick={() => {
                                                                        if (tractList[0] && onComputeTract) {
                                                                            onComputeTract(tractList[0].tractId, null);
                                                                        } else {
                                                                            onComputeAll?.();
                                                                        }
                                                                    }}
                                                                    className="mt-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all active:scale-95"
                                                                >
                                                                    Compute &amp; Plot Boundary ▶
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="text-gray-500 italic text-xs">
                                                                No calls entered yet. Click &quot;Add Call Row&quot; below to begin entering bearings and distances.
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedFile.calls.map((call, idx) => {
                                                    const bearing = getDisplayValue(call.id, 'bearing', call.bearing);
                                                    const distance = getDisplayValue(call.id, 'distance', call.distance);
                                                    const brValid = parseBearingToRadians(bearing) !== null;
                                                    const distValid = parseDistance(distance) !== null;
                                                    const isCurve = !!call.isCurve;
                                                    const isOpen = expandedRows.has(call.id);

                                                    return (
                                                        <React.Fragment key={call.id}>
                                                            <tr className={`border-t border-gray-800/60 ${idx % 2 === 0 ? '' : 'bg-gray-900/30'} hover:bg-cyan-950/20 light-theme:border-gray-200 light-theme:hover:bg-cyan-50/50`}>
                                                                {/* Curve expand toggle */}
                                                                <td className="text-center px-1">
                                                                    <button
                                                                        onClick={() => toggleExpanded(call.id)}
                                                                        className={`p-1 rounded hover:bg-gray-800 transition-colors ${isCurve ? 'text-cyan-400 font-bold' : 'text-gray-500'} hover:text-amber-300`}
                                                                        title={isCurve ? 'Edit curve data' : 'Add curve data'}
                                                                    >
                                                                        {isOpen ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                                                                    </button>
                                                                </td>
                                                                {/* Row Index */}
                                                                <td className="text-center py-1.5 px-1 text-gray-400 font-mono text-xs font-semibold">{idx + 1}</td>
                                                                {/* Bearing Composite Input */}
                                                                <td className="py-1 px-2">
                                                                    <BearingDmsInput
                                                                        value={bearing}
                                                                        onCommit={(canonical) => onUpdateCall(selectedFile.id, call.id, { bearing: canonical })}
                                                                        inputRefs={inputRefs}
                                                                        rowKey={call.id}
                                                                    />
                                                                </td>
                                                                {/* Distance Input */}
                                                                <td className="py-1 px-2">
                                                                    <input
                                                                        ref={el => { inputRefs.current[`${call.id}.distance`] = el; }}
                                                                        value={distance}
                                                                        onChange={e => handleChange(call.id, 'distance', e.target.value)}
                                                                        onBlur={e => handleCommit(call.id, 'distance', e.target.value)}
                                                                        onKeyDown={e => handleKeyDown(e, call.id, 'distance')}
                                                                        className={`w-full h-7 bg-gray-950 border rounded-lg px-2.5 py-0.5 font-mono text-xs font-bold shadow-inner focus:outline-none focus:ring-2 transition-all light-theme:bg-white light-theme:text-gray-900 ${
                                                                            editValues[`${call.id}.distance`] !== undefined
                                                                                ? distValid
                                                                                    ? 'border-amber-400 ring-amber-400/50 text-amber-200'
                                                                                    : 'border-red-400 ring-red-400/50 text-red-200'
                                                                                : 'border-gray-600 hover:border-gray-500 text-white light-theme:border-gray-400'
                                                                        }`}
                                                                        placeholder="0.00"
                                                                        spellCheck={false}
                                                                        aria-label={`Call ${idx + 1} distance`}
                                                                    />
                                                                </td>
                                                                {/* From Point */}
                                                                <td className="text-center py-1 px-1">
                                                                    <span className="inline-block px-1.5 py-0.5 rounded bg-gray-900/90 text-gray-200 font-mono text-xs border border-gray-700/80 min-w-[22px] text-center shadow-inner font-bold">
                                                                        {call.from}
                                                                    </span>
                                                                </td>
                                                                {/* To Point */}
                                                                <td className="text-center py-1 px-1">
                                                                    <span className="inline-block px-1.5 py-0.5 rounded bg-gray-900/90 text-gray-200 font-mono text-xs border border-gray-700/80 min-w-[22px] text-center shadow-inner font-bold">
                                                                        {call.to}
                                                                    </span>
                                                                </td>
                                                                {/* Validation OK Indicator */}
                                                                <td className="text-center py-1 px-1">
                                                                    {brValid && distValid ? (
                                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-400/50" title="Bearing and distance are valid">✓</span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50" title="Incomplete call">
                                                                            {!brValid && !distValid ? 'empty' : !brValid ? 'brg?' : 'dist?'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                {/* Delete Row */}
                                                                <td className="text-center px-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            if (window.confirm(`Delete call ${idx + 1} (${call.from} → ${call.to})?`)) {
                                                                                onRemoveCall(selectedFile.id, call.id);
                                                                            }
                                                                        }}
                                                                        className="p-1.5 rounded-md hover:bg-rose-950/40 text-gray-400 hover:text-rose-400 transition-colors"
                                                                        title="Delete call row"
                                                                    >
                                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </td>
                                                            </tr>

                                                            {/* Curve details drawer */}
                                                            {isOpen && (
                                                                <tr className={`border-t border-gray-800 ${idx % 2 === 0 ? 'bg-gray-900/60' : 'bg-gray-950/60'}`}>
                                                                    <td colSpan={8} className="px-4 py-2.5">
                                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                                                            <label className="flex items-center gap-1.5 text-gray-200 font-bold cursor-pointer">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isCurve}
                                                                                    onChange={e => onUpdateCall(selectedFile.id, call.id, { isCurve: e.target.checked })}
                                                                                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                                                                                />
                                                                                <span>Curve Call</span>
                                                                            </label>

                                                                            {isCurve && (
                                                                                <>
                                                                                    <label className="flex items-center gap-1.5 text-gray-300 font-medium">
                                                                                        <span>Direction:</span>
                                                                                        <select
                                                                                            value={call.curveDirection ?? 'right'}
                                                                                            onChange={e => onUpdateCall(selectedFile.id, call.id, { curveDirection: e.target.value as 'left' | 'right' })}
                                                                                            className="bg-gray-900 border border-gray-600 text-white rounded-md px-2 py-0.5 text-xs font-semibold"
                                                                                        >
                                                                                            <option value="right">Right (CW)</option>
                                                                                            <option value="left">Left (CCW)</option>
                                                                                        </select>
                                                                                    </label>

                                                                                    {([
                                                                                        { f: 'curveRadius' as const, label: 'Radius', w: 'w-24', num: true },
                                                                                        { f: 'arcLength' as const, label: 'Arc', w: 'w-24', num: true },
                                                                                        { f: 'chordBearing' as const, label: 'Chord Brg', w: 'w-36', num: false },
                                                                                        { f: 'chordDistance' as const, label: 'Chord Dist', w: 'w-24', num: true },
                                                                                        { f: 'tangentBearing' as const, label: 'Tan Brg', w: 'w-36', num: false },
                                                                                    ]).map(({ f, label, w, num }) => {
                                                                                        const raw = call[f];
                                                                                        const fallback = raw === undefined || raw === null ? '' : String(raw);
                                                                                        const val = getDisplayValue(call.id, f, fallback);
                                                                                        const coerce = num ? toNumOrUndef : toStrOrUndef;
                                                                                        return (
                                                                                            <label key={f} className="flex items-center gap-1.5 text-gray-300 font-medium">
                                                                                                <span className="font-bold text-[11px] text-gray-200">{label}:</span>
                                                                                                <input
                                                                                                    ref={el => { inputRefs.current[`${call.id}.${f}`] = el; }}
                                                                                                    value={val}
                                                                                                    onChange={e => handleChange(call.id, f, e.target.value)}
                                                                                                    onBlur={e => handleCommit(call.id, f, e.target.value, coerce)}
                                                                                                    onKeyDown={e => handleKeyDown(e, call.id, f, coerce)}
                                                                                                    className={`${w} h-7 bg-gray-950 border rounded-md px-2 py-0.5 font-mono text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 light-theme:bg-white light-theme:text-gray-900 ${editValues[`${call.id}.${f}`] !== undefined ? 'border-cyan-400' : 'border-gray-600'}`}
                                                                                                    spellCheck={false}
                                                                                                    placeholder={num ? '0.00' : 'N00°00\'00"E'}
                                                                                                />
                                                                                            </label>
                                                                                        );
                                                                                    })}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Add-row Action Bar */}
                                <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-gray-800 bg-gray-900/80 light-theme:bg-gray-100">
                                    <span className="text-xs text-gray-300 flex items-center gap-1.5 font-medium">
                                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-gray-800 border border-gray-600 rounded text-cyan-300 shadow-sm">Tab</kbd>
                                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-gray-800 border border-gray-600 rounded text-cyan-300 shadow-sm">Space</kbd>
                                        auto-advances bearing fields
                                    </span>
                                    <button
                                        onClick={() => onAddCall(selectedFile.id)}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-950 hover:bg-cyan-900 text-cyan-200 hover:text-white border border-cyan-500/70 shadow-sm transition-all active:scale-95"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                        <span>Add Call Row</span>
                                    </button>
                                </div>
                            </div>

                            {/* ========================================================= */}
                            {/* CLOSURE & ACCURACY SUMMARY CARD                           */}
                            {/* ========================================================= */}
                            {closure && (
                                <div className={`relative overflow-hidden rounded-xl border border-l-0 border-dashed ${closure.misclosureDistance < 0.05 ? 'border-emerald-400/80' : 'border-amber-400/80'} bg-gray-950/90 pl-6 pr-4 py-3.5 shadow-md light-theme:bg-gray-50 light-theme:border-emerald-500`}>
                                    <span
                                        className={`absolute inset-y-0 left-0 w-3 ${closure.misclosureDistance < 0.05 ? 'bg-emerald-400' : 'bg-amber-400'} rounded-l-xl shadow-sm`}
                                        aria-hidden="true"
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                                            <div>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold block">Calculated Area</span>
                                                <span className="text-cyan-300 font-mono font-black text-sm light-theme:text-cyan-700">{formatArea(closure.area)}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold block">Precision Ratio</span>
                                                <span className="text-cyan-300 font-mono font-black text-sm light-theme:text-cyan-700">{closure.precision}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-extrabold block">Linear Misclosure</span>
                                                <span className={`font-mono font-black text-sm ${closure.misclosureDistance < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {closure.misclosureDistance.toFixed(4)} ft
                                                </span>
                                            </div>
                                        </div>

                                        {/* Closure & Legal Action Buttons */}
                                        <div className="flex items-center gap-2">
                                            {onInvestigateClosure && (
                                                <button
                                                    onClick={() => onInvestigateClosure(selectedFile.id)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/60 shadow-sm transition-colors active:scale-95"
                                                    title="Compare with deed text, identify errors, and propose fixes"
                                                >
                                                    Investigate
                                                </button>
                                            )}
                                            {onGenerateClosureReport && (
                                                <button
                                                    onClick={() => onGenerateClosureReport(selectedFile.id)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/60 shadow-sm transition-colors active:scale-95"
                                                    title="Generate printable closure report"
                                                >
                                                    Closure Report
                                                </button>
                                            )}
                                            {onWriteLegal && (
                                                <button
                                                    onClick={() => onWriteLegal(selectedFile.id)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/60 shadow-sm transition-colors active:scale-95"
                                                    title="Generate metes-and-bounds legal description"
                                                >
                                                    Write Legal
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ========================================================= */}
                            {/* PRIMARY DRAFTING & TOOLBAR                                */}
                            {/* ========================================================= */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-800/80 light-theme:border-gray-200">
                                <div className="flex flex-wrap items-center gap-2">
                                    {selectedFile && selectedFile.calls.some(c => Boolean(c.bearing && c.distance)) ? (
                                        <>
                                            {onDrawToLinework && (
                                                <button
                                                    onClick={() => onDrawToLinework(selectedFile.id)}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/40 transition-all active:scale-95"
                                                    title="Commit boundary calls to canvas as CAD linework"
                                                >
                                                    <span>Draft to CAD</span>
                                                    <span>▶</span>
                                                </button>
                                            )}
                                            {onDrawToLinework && boundaryFiles.length > 1 && (
                                                <button
                                                    onClick={() => boundaryFiles.forEach(bf => onDrawToLinework(bf.id))}
                                                    className="px-3 py-2 rounded-lg font-semibold text-xs text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 transition-colors"
                                                    title={`Draft all ${boundaryFiles.length} boundaries to CAD`}
                                                >
                                                    Draft All ({boundaryFiles.length})
                                                </button>
                                            )}
                                        </>
                                    ) : isAnyBusy ? (
                                        <button
                                            disabled
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs text-amber-200 bg-amber-950/80 border border-amber-600/50 cursor-wait shadow-sm"
                                        >
                                            <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                            <span>Extracting Geometry…</span>
                                        </button>
                                    ) : tractList.length > 0 ? (
                                        <button
                                            onClick={() => {
                                                if (tractList[0] && onComputeTract) {
                                                    onComputeTract(tractList[0].tractId, null);
                                                } else {
                                                    onComputeAll?.();
                                                }
                                            }}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-950/40 transition-all active:scale-95"
                                            title="Extract and plot the deed boundary on canvas"
                                        >
                                            <span>Compute &amp; Plot Boundary</span>
                                            <span>▶</span>
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-gray-500 bg-gray-800 border border-gray-750 opacity-60 cursor-not-allowed"
                                            title="Enter at least one call with bearing and distance first"
                                        >
                                            <span>Draft to CAD</span>
                                            <span>▶</span>
                                        </button>
                                    )}
                                    {onAlignToGIS && selectedFile && selectedFile.calls.some(c => Boolean(c.bearing && c.distance)) && (
                                        <button
                                            onClick={() => onAlignToGIS(selectedFile.id)}
                                            className="px-3 py-2 rounded-lg font-semibold text-xs text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/60 transition-colors"
                                            title="Match deed against county GIS parcel and align to centroid"
                                        >
                                            Align to GIS
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShowToolsDrawer(p => !p)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition light-theme:bg-gray-200 light-theme:text-gray-700"
                                >
                                    <span>Tools, POB &amp; Alignment</span>
                                    <span>{showToolsDrawer ? '▾' : '▸'}</span>
                                </button>
                            </div>

                            {/* ========================================================= */}
                            {/* COLLAPSIBLE TOOLS, POB & ALIGNMENT DRAWER                 */}
                            {/* ========================================================= */}
                            {showToolsDrawer && (
                                <div className="relative overflow-hidden rounded-xl border border-l-0 border-dashed border-blue-400/80 bg-gray-950/90 pl-6 pr-4 py-4 space-y-4 shadow-lg light-theme:bg-gray-50 light-theme:border-blue-500">
                                    <span className="absolute inset-y-0 left-0 w-3 bg-blue-500 rounded-l-xl shadow-sm" aria-hidden="true" />
                                    
                                    {/* POB Grid */}
                                    {onPobChange && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-black text-gray-100 uppercase tracking-wider">
                                                <MapPinIcon className="w-4 h-4 text-emerald-400" />
                                                <span>Point of Beginning (POB)</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2.5">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">Point #</span>
                                                    <input
                                                        type="text"
                                                        defaultValue={selectedFile.calls[0]?.from ?? ''}
                                                        onBlur={(e) => {
                                                            const v = e.currentTarget.value.trim();
                                                            const curr = selectedFile.calls[0]?.from ?? '';
                                                            if (v !== curr) onPobChange(selectedFile.id, { pointNumber: v });
                                                        }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                                                        placeholder="1"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-cyan-400 text-white font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">Northing (Y)</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        defaultValue={selectedFile.pobOverride?.northing ?? ''}
                                                        onBlur={(e) => {
                                                            const v = e.currentTarget.value.trim();
                                                            const e0 = selectedFile.pobOverride?.easting;
                                                            if (v === '') {
                                                                if (selectedFile.pobOverride) onPobChange(selectedFile.id, { pobOverride: null });
                                                            } else {
                                                                const n = parseFloat(v);
                                                                if (!isFinite(n)) return;
                                                                onPobChange(selectedFile.id, { pobOverride: { northing: n, easting: typeof e0 === 'number' && isFinite(e0) ? e0 : 0 } });
                                                            }
                                                        }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                                                        placeholder="0.00"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-emerald-400 text-emerald-300 font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">Easting (X)</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        defaultValue={selectedFile.pobOverride?.easting ?? ''}
                                                        onBlur={(e) => {
                                                            const v = e.currentTarget.value.trim();
                                                            const n0 = selectedFile.pobOverride?.northing;
                                                            if (v === '') {
                                                                if (selectedFile.pobOverride) onPobChange(selectedFile.id, { pobOverride: null });
                                                            } else {
                                                                const e1 = parseFloat(v);
                                                                if (!isFinite(e1)) return;
                                                                onPobChange(selectedFile.id, { pobOverride: { northing: typeof n0 === 'number' && isFinite(n0) ? n0 : 0, easting: e1 } });
                                                            }
                                                        }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                                                        placeholder="0.00"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-emerald-400 text-emerald-300 font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Transform Grid */}
                                    {onTransformChange && (
                                        <div className="space-y-2 pt-2.5 border-t border-gray-800">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-xs font-black text-gray-100 uppercase tracking-wider">
                                                    <AdjustmentsHorizontalIcon className="w-4 h-4 text-amber-400" />
                                                    <span>Coordinate Shift &amp; Rotation</span>
                                                </div>
                                                {(selectedFile.translationE || selectedFile.translationN || selectedFile.rotationDeg) && (
                                                    <button
                                                        onClick={() => onTransformChange(selectedFile.id, { translationE: null, translationN: null, rotationDeg: null })}
                                                        className="text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors underline"
                                                    >
                                                        Reset Shift
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2.5">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">ΔE (East Shift)</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={selectedFile.translationE ?? ''}
                                                        onChange={(e) => {
                                                            const v = e.target.value.trim();
                                                            onTransformChange(selectedFile.id, { translationE: v === '' ? null : parseFloat(v) });
                                                        }}
                                                        placeholder="0.00"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-amber-400 text-amber-300 font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">ΔN (North Shift)</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={selectedFile.translationN ?? ''}
                                                        onChange={(e) => {
                                                            const v = e.target.value.trim();
                                                            onTransformChange(selectedFile.id, { translationN: v === '' ? null : parseFloat(v) });
                                                        }}
                                                        placeholder="0.00"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-amber-400 text-amber-300 font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-gray-300 font-extrabold uppercase tracking-wider block">Rotation (Deg)</span>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        value={selectedFile.rotationDeg ?? ''}
                                                        onChange={(e) => {
                                                            const v = e.target.value.trim();
                                                            onTransformChange(selectedFile.id, { rotationDeg: v === '' ? null : parseFloat(v) });
                                                        }}
                                                        placeholder="0.00°"
                                                        className="w-full h-8 px-2.5 rounded-lg bg-gray-950 border border-gray-600 focus:border-amber-400 text-amber-300 font-mono font-bold text-xs shadow-inner focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                            {selectedFile.rotationDeg ? (
                                                <div className="pt-1">
                                                    <button
                                                        onClick={() => setShowRotatedBearings(!showRotatedBearings)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shadow-sm ${showRotatedBearings ? 'bg-sky-600 text-white border-sky-400' : 'bg-gray-800 text-gray-200 border-gray-600'}`}
                                                    >
                                                        {showRotatedBearings ? 'Showing Rotated Bearings on Canvas' : 'Showing Original Deed Bearings'}
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

                                    {/* Corner Pairing & Alignment */}
                                    <div className="space-y-2 pt-2.5 border-t border-gray-800">
                                        <div className="text-xs font-black text-gray-100 uppercase tracking-wider">
                                            Field Points &amp; Survey Alignment
                                        </div>
                                        {(onAlignToOtherBoundary || onAlignCornersToPoints) && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {onAlignCornersToPoints && (
                                                    <button
                                                        onClick={() => onAlignCornersToPoints(selectedFile.id)}
                                                        className="px-3.5 py-2 rounded-lg text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/50 shadow-md transition-all active:scale-95"
                                                        title="Align corners: click a corner of the deed on canvas, then the found survey point it belongs on"
                                                    >
                                                        ⌖ Align Corners to Found Points
                                                    </button>
                                                )}
                                                {onAlignToOtherBoundary && boundaryFiles.length >= 2 && (
                                                    <button
                                                        onClick={() => onAlignToOtherBoundary(selectedFile.id)}
                                                        className="px-3.5 py-2 rounded-lg text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 shadow-md transition-all active:scale-95"
                                                    >
                                                        ↔ Align to Other Deed
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Field Points Association & Helmert Best Fit */}
                                        {onAssociatePoints && (
                                            <div className="space-y-2 pt-1">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={associateInput}
                                                        onChange={e => setAssociateInput(e.target.value)}
                                                        placeholder="Point #s (e.g. 101, 102)"
                                                        className="flex-1 min-w-[120px] h-8 px-3 rounded-lg bg-gray-950 border border-gray-600 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 shadow-inner"
                                                    />
                                                    {selectedPointNumber && (
                                                        <button
                                                            onClick={() => onAssociatePoints(selectedFile.id, [selectedPointNumber])}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-amber-600/80 text-white hover:bg-amber-500 border border-amber-400/60 shadow-sm"
                                                        >
                                                            + Selected (#{selectedPointNumber})
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            const ids = associateInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
                                                            if (ids.length === 0) return;
                                                            onAssociatePoints(selectedFile.id, ids);
                                                            setAssociateInput('');
                                                        }}
                                                        className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 shadow-md transition-all active:scale-95"
                                                    >
                                                        Add Points
                                                    </button>
                                                    {onBestFitToPoints && (selectedFile.associatedPointIds?.length ?? 0) >= 1 && (
                                                        <button
                                                            onClick={() => onBestFitToPoints(selectedFile.id)}
                                                            className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/50 shadow-md transition-all active:scale-95"
                                                        >
                                                            Best Fit ({selectedFile.associatedPointIds?.length} pts)
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Associated points pill list */}
                                                {(selectedFile.associatedPointIds?.length ?? 0) > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                        {(selectedFile.associatedPointIds ?? []).map(pn => (
                                                            <span key={pn} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-900/60 text-blue-200 text-xs font-mono font-bold border border-blue-500/60 shadow-sm">
                                                                #{pn}
                                                                {onDisassociatePoint && (
                                                                    <button
                                                                        onClick={() => onDisassociatePoint(selectedFile.id, pn)}
                                                                        className="text-blue-300 hover:text-rose-400 font-extrabold leading-none"
                                                                    >×</button>
                                                                )}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BoundaryEditor;
