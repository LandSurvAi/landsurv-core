// BoundaryEditor.tsx
// Non-obtrusive floating overlay that displays within the Boundary Agent canvas view.
// Shows a spreadsheet-style table of the boundary traverse calls (bearing + distance)
// and propagates edits forward through the COGO chain.

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { BoundaryFile, BoundaryFileCall, SurveyPoint } from '../types.ts';
import { parseBearingToRadians, parseDistance, direct, calculateClosure } from '../utils/cogo.ts';
import { ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, XMarkIcon, TableCellsIcon, ArrowUpTrayIcon, FolderIcon, EyeIcon, EyeSlashIcon, PencilSquareIcon, TrashIcon, PlusIcon } from './icons.tsx';
import BearingDmsInput from './BearingDmsInput.tsx';

interface BoundaryEditorProps {
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
    /** Currently-selected point number (single-select from canvas), used as the source for "Associate Selected Point". v26.05.17.40 */
    selectedPointNumber?: string;
    /** Associate one or more point numbers with the boundary so they follow its visibility and round-trip in .lsvz. v26.05.17.40 */
    onAssociatePoints?: (fileId: string, pointIds: string[]) => void;
    /** Remove an associated point from the boundary (does not delete the point). v26.05.17.40 */
    onDisassociatePoint?: (fileId: string, pointId: string) => void;
    /** Run a 2D rigid-body best-fit (translation + rotation) of the boundary deed geometry
     * to the associated survey points. Computes the Helmert transformation that minimises
     * the sum of squared residuals between deed vertices (by From/To point number) and the
     * matching survey shots, then updates translationE/N and rotationDeg on the file. */
    onBestFitToPoints?: (fileId: string) => void;
    /** Start an interactive line-to-line alignment on the canvas. The caller arms the
     *  canvas tool with this boundary as the movable side; the user then clicks one line
     *  on this boundary, one line on a different boundary, and the movable boundary's
     *  transform snaps so the picked lines become collinear at the picked endpoints. */
    onAlignToOtherBoundary?: (movableBfId: string) => void;
    /** Start the interactive corner-pairing alignment on the canvas: the user clicks a corner
     *  of this deed's silhouette, then the found point that corner belongs on, repeating for
     *  as many corners as they want. Each pair refines a rigid translate+rotate best fit. */
    onAlignCornersToPoints?: (fileId: string) => void;
    /** Optional controlled selection. When provided, the editor surfaces this
     *  boundary as the "active" one and reports user changes via `onSelectFile`.
     *  When omitted, the editor falls back to its internal selection state. */
    selectedFileId?: string;
    onSelectFile?: (fileId: string) => void;
    /** Controlled flag that toggles the canvas bearing/distance annotations
     *  for the active boundary between original deed bearings and rotated
     *  (as-drawn) bearings. The editor table is unaffected and always edits
     *  the original deed values. */
    showRotatedBearings?: boolean;
    onShowRotatedBearingsChange?: (next: boolean) => void;
    /** Viewport space occupied by sibling UI that this fixed panel must avoid. */
    reservedRight?: number;
    reservedBottom?: number;
}

// Confidence pill — shown in the editor header while the parsed deed is in
// its amber pre-commit state. Reflects the AI's self-rated confidence (or a
// client-side fallback derived from the uncertainty count). Click to expand
// the list of reasons that drove the rating.
const ConfidencePill: React.FC<{ confidence: NonNullable<BoundaryFile['deedConfidence']> }> = ({ confidence }) => {
    const [open, setOpen] = useState(false);
    const cfg = {
        high:   { dot: 'bg-emerald-400', text: 'text-emerald-200', border: 'border-emerald-500/50', bg: 'bg-emerald-900/30', label: 'High confidence' },
        medium: { dot: 'bg-yellow-400',  text: 'text-yellow-200',  border: 'border-yellow-500/50',  bg: 'bg-yellow-900/30',  label: 'Medium confidence' },
        low:    { dot: 'bg-rose-400',    text: 'text-rose-200',    border: 'border-rose-500/50',    bg: 'bg-rose-900/30',    label: 'Low confidence' },
    }[confidence.level];

    return (
        <div className="px-3 pt-2">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded border ${cfg.border} ${cfg.bg} hover:brightness-110 transition`}
                title={`${cfg.label} (${confidence.source === 'ai' ? 'AI self-rated' : 'derived from uncertainty count'})`}
            >
                <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className={`text-[11px] font-semibold ${cfg.text}`}>{cfg.label}</span>
                <span className="text-[10px] text-gray-400 ml-1">
                    {confidence.source === 'ai' ? 'AI self-rated' : 'derived'}
                </span>
                <span className="ml-auto text-[10px] text-gray-400">
                    {confidence.reasons.length > 0 ? (open ? 'hide why' : 'why?') : ''}
                </span>
            </button>
            {open && confidence.reasons.length > 0 && (
                <ul className={`mt-1 ml-1 list-disc list-inside text-[11px] ${cfg.text} space-y-0.5`}>
                    {confidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
            )}
        </div>
    );
};

// Compute closure summary from current boundary file + live point coordinates.
// Any incomplete row (missing bearing/distance or curve params) makes calculateClosure
// throw, so we skip it for in-progress traverses rather than crashing the editor.
function computeClosureSummary(file: BoundaryFile, pointMap: Map<string, SurveyPoint>) {
    if (file.calls.length < 2) return null;
    // v26.05.22.1 — use explicit numeric checks; a curve with radius/arcLength
    // of 0 (a degenerate row in progress) is still "incomplete", but the old
    // `!(c.curveRadius && c.arcLength)` also flagged perfectly valid
    // negative-zero / falsy edge cases inconsistently. Be explicit.
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
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
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
    const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const [associateInput, setAssociateInput] = useState('');
    const [showAllBoundaries, setShowAllBoundaries] = useState(false);
    // Toggle for the canvas bearing/distance annotations on the active boundary.
    // When `controlledShowRotatedBearings` is provided, App owns the state and
    // we just forward toggles back through `onShowRotatedBearingsChange`.
    const [internalShowRotatedBearings, setInternalShowRotatedBearings] = useState(false);
    const showRotatedBearings = controlledShowRotatedBearings !== undefined
        ? controlledShowRotatedBearings
        : internalShowRotatedBearings;
    const setShowRotatedBearings = useCallback((next: boolean) => {
        if (controlledShowRotatedBearings === undefined) setInternalShowRotatedBearings(next);
        onShowRotatedBearingsChange?.(next);
    }, [controlledShowRotatedBearings, onShowRotatedBearingsChange]);

    const panelEdgeGap = 8;
    const panelTopLimit = 58;

    // Default to the lower-right of the canvas area, excluding the chat rail.
    const getDefaultPos = useCallback(() => {
        const panelWidth = panelRef.current?.getBoundingClientRect().width ?? Math.min(480, window.innerWidth - panelEdgeGap * 2);
        const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 420;
        return {
            x: Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap),
            y: Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap),
        };
    }, [reservedBottom, reservedRight]);

    const clampPosition = useCallback((candidate: { x: number; y: number }) => {
        const rect = panelRef.current?.getBoundingClientRect();
        const panelWidth = rect?.width ?? Math.min(480, window.innerWidth - panelEdgeGap * 2);
        const panelHeight = rect?.height ?? 420;
        const maxX = Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap);
        const maxY = Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap);
        return {
            x: Math.max(panelEdgeGap, Math.min(maxX, candidate.x)),
            y: Math.max(panelTopLimit, Math.min(maxY, candidate.y)),
        };
    }, [reservedBottom, reservedRight]);

    // Re-clamp after expansion, content changes, chat resizing, or viewport resizing.
    useLayoutEffect(() => {
        const clamp = () => {
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
    }, [clampPosition, getDefaultPos]);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        // Don't start drag from buttons or inputs inside the header
        if ((e.target as HTMLElement).closest('button, input, select')) return;
        e.preventDefault();
        const current = pos ?? getDefaultPos();
        dragState.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };

        const onMove = (ev: MouseEvent) => {
            if (!dragState.current) return;
            const dx = ev.clientX - dragState.current.startX;
            const dy = ev.clientY - dragState.current.startY;
            setPos(clampPosition({
                x: dragState.current.origX + dx,
                y: dragState.current.origY + dy,
            }));
        };
        const onUp = () => {
            dragState.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [pos, getDefaultPos, clampPosition]);

    // Select newest file by default when list changes
    useEffect(() => {
        if (boundaryFiles.length > 0) {
            const latestId = boundaryFiles[boundaryFiles.length - 1].id;
            setSelectedFileId(prev => {
                // Keep selection if still valid, else switch to latest
                const stillValid = boundaryFiles.some(f => f.id === prev);
                return stillValid ? prev : latestId;
            });
        }
    }, [boundaryFiles]);

    // Clear stale edit values when selected file changes
    useEffect(() => {
        setEditValues({});
    }, [selectedFileId]);

    const selectedFile = boundaryFiles.find(f => f.id === selectedFileId) ?? boundaryFiles[boundaryFiles.length - 1];

    if (!selectedFile) return null;

    const closure = computeClosureSummary(selectedFile, pointMap);

    const getDisplayValue = (callId: string, field: string, fallback: string) => {
        const key = `${callId}.${field}`;
        return editValues[key] !== undefined ? editValues[key] : fallback;
    };

    const handleChange = (callId: string, field: string, value: string) => {
        setEditValues(prev => ({ ...prev, [`${callId}.${field}`]: value }));
    };

    // Commit a single field. `coerce` may transform the raw text into a typed value
    // (e.g. numeric for radius/arcLength/chordDistance).
    const handleCommit = (
        callId: string,
        field: keyof BoundaryFileCall,
        value: string,
        coerce?: (s: string) => unknown,
    ) => {
        const key = `${callId}.${String(field)}`;
        setEditValues(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        const finalValue = coerce ? coerce(value) : value;
        // Bail on no-op commits so a bare focus/blur cycle doesn't trigger
        // a state update (and a downstream propagation pass that would
        // mutate user-entered curve fields).
        const existingCall = selectedFile.calls.find(c => c.id === callId);
        if (existingCall) {
            const current = (existingCall as Record<string, unknown>)[field as string];
            if (current === finalValue) return;
            // Treat empty string and undefined as equivalent (common for optional fields).
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
        if (sqFt > 43560) return `${(sqFt / 43560).toFixed(4)} ac`;
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
        // Reset so same file can be re-loaded
        e.target.value = '';
    };

    const currentPos = pos ?? getDefaultPos();
    const maxPanelHeight = Math.max(160, window.innerHeight - reservedBottom - panelTopLimit - panelEdgeGap);

    return (
        <div
            ref={panelRef}
            style={{ left: currentPos.x, top: currentPos.y, width: 480, maxHeight: maxPanelHeight, overflowY: 'auto' }}
            className="fixed z-30 max-w-[calc(100vw-1rem)] bg-gray-900/95 backdrop-blur-md border border-amber-500/40 rounded-xl shadow-2xl text-xs text-gray-100 select-none"
        >
            {/* Header — drag handle */}
            <div
                className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 cursor-grab active:cursor-grabbing"
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <TableCellsIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    {isRenaming ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => {
                                if (onRenameFile && renameValue.trim()) onRenameFile(selectedFile.id, renameValue.trim());
                                setIsRenaming(false);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            className="bg-gray-800 border border-amber-500 text-amber-200 rounded px-1.5 py-0.5 text-xs flex-1 min-w-0 max-w-[180px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                    ) : (
                        <select
                            value={selectedFileId}
                            onChange={e => setSelectedFileId(e.target.value)}
                            className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-1 py-0.5 text-xs flex-1 min-w-0 max-w-[180px]"
                        >
                            {boundaryFiles.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.hidden ? '○ ' : '● '}{f.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {/* Load from CSV */}
                    {onLoadFile && (
                        <>
                            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleLoadCSV} />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-colors"
                                title="Load boundary from CSV file"
                            >
                                <FolderIcon className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    {/* Rename */}
                    {onRenameFile && !isRenaming && (
                        <button
                            onClick={() => { setRenameValue(selectedFile.name); setIsRenaming(true); }}
                            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-amber-300 transition-colors"
                            title="Rename boundary"
                        >
                            <PencilSquareIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {/* Show/Hide boundary overlay */}
                    {onToggleVisibility && (
                        <button
                            onClick={() => onToggleVisibility(selectedFile.id)}
                            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title={selectedFile.hidden ? 'Show boundary overlay' : 'Hide boundary overlay'}
                        >
                            {selectedFile.hidden
                                ? <EyeSlashIcon className="w-3.5 h-3.5 text-gray-500" />
                                : <EyeIcon className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    {/* Save to file manager */}
                    {onSaveToFileManager && (
                        <button
                            onClick={() => onSaveToFileManager(selectedFile)}
                            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-green-400 transition-colors"
                            title="Save deed to File Manager as CSV"
                        >
                            <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button
                        onClick={() => setIsExpanded(p => !p)}
                        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronUpIcon className="w-3.5 h-3.5" />}
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                            title="Close boundary editor"
                        >
                            <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Confidence pill — only shown while a deed-sourced boundary still
                has unaccepted (amber) status. We always show it when present so
                the user can re-open it later, but its visual weight is highest
                during the pre-commit review. */}
            {selectedFile.deedConfidence && (
                <ConfidencePill confidence={selectedFile.deedConfidence} />
            )}

            {/* Quick visibility list — collapsible. Lets the user toggle show/hide on every boundary at a glance
                without having to open the dropdown and pick one at a time. v26.05.17.40 */}
            {boundaryFiles.length > 1 && (
                <div className="border-b border-gray-700/50 bg-gray-900/40">
                    <button
                        onClick={() => setShowAllBoundaries(p => !p)}
                        className="w-full px-3 py-1 flex items-center justify-between text-[10px] text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
                    >
                        <span className="font-semibold uppercase tracking-wide">All Boundaries ({boundaryFiles.length})</span>
                        <span>{showAllBoundaries ? '▾' : '▸'}</span>
                    </button>
                    {showAllBoundaries && (
                        <div className="max-h-40 overflow-y-auto px-2 pb-1.5">
                            {boundaryFiles.map(f => {
                                const isActive = f.id === selectedFile.id;
                                return (
                                    <div
                                        key={f.id}
                                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] ${isActive ? 'bg-amber-900/30 text-amber-200' : 'text-gray-300 hover:bg-gray-800/50'}`}
                                    >
                                        {onToggleVisibility && (
                                            <button
                                                onClick={() => onToggleVisibility(f.id)}
                                                className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                                                title={f.hidden ? 'Show' : 'Hide'}
                                            >
                                                {f.hidden
                                                    ? <EyeSlashIcon className="w-3.5 h-3.5 text-gray-500" />
                                                    : <EyeIcon className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedFileId(f.id)}
                                            className="flex-1 min-w-0 text-left truncate font-mono"
                                            title={`Select "${f.name}"`}
                                        >
                                            {isActive ? '● ' : '  '}{f.name}
                                        </button>
                                        <span className="text-gray-500 font-mono text-[10px] flex-shrink-0">
                                            {f.calls.length}c
                                            {(f.associatedPointIds?.length ?? 0) > 0 && ` · ${f.associatedPointIds!.length}p`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Table */}
            {isExpanded && (
                <>
                    <div className="max-h-72 overflow-y-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="text-gray-400 bg-gray-800/60 sticky top-0 z-10">
                                    <th className="w-5"></th>
                                    <th className="text-center py-1.5 px-1 font-medium w-7">#</th>
                                    <th className="text-left py-1.5 px-1 font-medium w-56">Bearing</th>
                                    <th className="text-left py-1.5 px-1 font-medium w-20">Distance</th>
                                    <th className="text-center py-1.5 px-1 font-medium w-10">From</th>
                                    <th className="text-center py-1.5 px-1 font-medium w-10">To</th>
                                    <th className="text-center py-1.5 px-1 font-medium w-12">OK</th>
                                    <th className="w-6"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedFile.calls.map((call, idx) => {
                                    const bearing = getDisplayValue(call.id, 'bearing', call.bearing);
                                    const distance = getDisplayValue(call.id, 'distance', call.distance);
                                    const brValid = parseBearingToRadians(bearing) !== null;
                                    const distValid = parseDistance(distance) !== null;
                                    const isCurve = !!call.isCurve;
                                    const isOpen = expandedRows.has(call.id);
                                    return (
                                        <React.Fragment key={call.id}>
                                            <tr
                                                className={`border-t border-gray-700/30 ${idx % 2 === 0 ? '' : 'bg-gray-800/20'} hover:bg-amber-900/10`}
                                            >
                                                <td className="text-center px-0.5">
                                                    <button
                                                        onClick={() => toggleExpanded(call.id)}
                                                        className={`p-0.5 rounded hover:bg-gray-700 transition-colors ${isCurve ? 'text-cyan-400' : 'text-gray-500'} hover:text-amber-300`}
                                                        title={isCurve ? 'Edit curve data' : 'Add curve data'}
                                                    >
                                                        {isOpen
                                                            ? <ChevronDownIcon className="w-3 h-3" />
                                                            : <ChevronRightIcon className="w-3 h-3" />}
                                                    </button>
                                                </td>
                                                <td className="text-center py-1 px-1 text-gray-500 font-mono">{idx + 1}</td>
                                                <td className="py-0.5 px-1">
                                                    <BearingDmsInput
                                                        value={bearing}
                                                        onCommit={(canonical) => onUpdateCall(selectedFile.id, call.id, { bearing: canonical })}
                                                        inputRefs={inputRefs}
                                                        rowKey={call.id}
                                                    />
                                                </td>
                                                <td className="py-0.5 px-1">
                                                    <input
                                                        ref={el => { inputRefs.current[`${call.id}.distance`] = el; }}
                                                        value={distance}
                                                        onChange={e => handleChange(call.id, 'distance', e.target.value)}
                                                        onBlur={e => handleCommit(call.id, 'distance', e.target.value)}
                                                        onKeyDown={e => handleKeyDown(e, call.id, 'distance')}
                                                        className={`w-full bg-transparent border rounded px-1 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 transition-colors ${
                                                            editValues[`${call.id}.distance`] !== undefined
                                                                ? distValid
                                                                    ? 'border-amber-500 ring-amber-500/50 text-amber-200'
                                                                    : 'border-red-500 ring-red-500/50 text-red-300'
                                                                : 'border-transparent hover:border-gray-600 text-gray-200'
                                                        }`}
                                                        spellCheck={false}
                                                    />
                                                </td>
                                                <td className="text-center py-1 px-1 text-gray-400 font-mono">{call.from}</td>
                                                <td className="text-center py-1 px-1 text-gray-400 font-mono">{call.to}</td>
                                                <td className="text-center py-1 px-1">
                                                    {brValid && distValid ? (
                                                        <span className="text-green-400" title="Bearing and distance are valid">✓</span>
                                                    ) : (
                                                        <span
                                                            className="text-yellow-400 text-[10px]"
                                                            title={`Needs ${[!brValid && 'bearing', !distValid && 'distance'].filter(Boolean).join(' + ')}`}
                                                        >
                                                            {!brValid && !distValid ? '— —' : !brValid ? 'brg?' : 'dist?'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-center px-0.5">
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm(`Delete call ${idx + 1} (${call.from} → ${call.to})?`)) {
                                                                onRemoveCall(selectedFile.id, call.id);
                                                            }
                                                        }}
                                                        className="p-0.5 rounded hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
                                                        title="Delete row"
                                                    >
                                                        <TrashIcon className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr className={`border-t border-gray-700/20 ${idx % 2 === 0 ? 'bg-gray-900/40' : 'bg-gray-800/40'}`}>
                                                    <td colSpan={8} className="px-3 py-2">
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                                                            <label className="flex items-center gap-1 text-gray-300">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isCurve}
                                                                    onChange={e => onUpdateCall(selectedFile.id, call.id, { isCurve: e.target.checked })}
                                                                    className="accent-cyan-500"
                                                                />
                                                                <span>Curve</span>
                                                            </label>
                                                            {isCurve && (
                                                                <>
                                                                    <label className="flex items-center gap-1 text-gray-400">
                                                                        Direction
                                                                        <select
                                                                            value={call.curveDirection ?? 'right'}
                                                                            onChange={e => onUpdateCall(selectedFile.id, call.id, { curveDirection: e.target.value as 'left' | 'right' })}
                                                                            className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-1 py-0.5 text-[11px]"
                                                                        >
                                                                            <option value="right">Right (CW)</option>
                                                                            <option value="left">Left (CCW)</option>
                                                                        </select>
                                                                    </label>
                                                                    {([
                                                                        { f: 'curveRadius' as const, label: 'Radius', w: 'w-20', num: true },
                                                                        { f: 'arcLength' as const, label: 'Arc', w: 'w-20', num: true },
                                                                        { f: 'chordBearing' as const, label: 'Chord Brg', w: 'w-32', num: false },
                                                                        { f: 'chordDistance' as const, label: 'Chord Dist', w: 'w-20', num: true },
                                                                        { f: 'tangentBearing' as const, label: 'Tan Brg', w: 'w-32', num: false },
                                                                    ]).map(({ f, label, w, num }) => {
                                                                        const raw = call[f];
                                                                        const fallback = raw === undefined || raw === null ? '' : String(raw);
                                                                        const val = getDisplayValue(call.id, f, fallback);
                                                                        const coerce = num ? toNumOrUndef : toStrOrUndef;
                                                                        return (
                                                                            <label key={f} className="flex items-center gap-1 text-gray-400">
                                                                                {label}
                                                                                <input
                                                                                    ref={el => { inputRefs.current[`${call.id}.${f}`] = el; }}
                                                                                    value={val}
                                                                                    onChange={e => handleChange(call.id, f, e.target.value)}
                                                                                    onBlur={e => handleCommit(call.id, f, e.target.value, coerce)}
                                                                                    onKeyDown={e => handleKeyDown(e, call.id, f, coerce)}
                                                                                    className={`${w} bg-gray-800 border rounded px-1 py-0.5 font-mono text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 ${editValues[`${call.id}.${f}`] !== undefined ? 'border-cyan-500' : 'border-gray-600'}`}
                                                                                    spellCheck={false}
                                                                                    placeholder={num ? '0' : 'N00°00\'00"E'}
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
                                })}
                            </tbody>
                        </table>
                        {/* Add-row button */}
                        <div className="flex justify-center py-1.5 border-t border-gray-700/30">
                            <button
                                onClick={() => onAddCall(selectedFile.id)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-400 hover:text-amber-300 hover:bg-gray-800/60 transition-colors"
                                title="Append a new blank call"
                            >
                                <PlusIcon className="w-3 h-3" />
                                Add row
                            </button>
                        </div>
                    </div>

                    {/* Closure Footer */}
                    {closure && (
                        <div className="border-t border-gray-700/50 px-3 py-2 flex flex-wrap gap-x-4 gap-y-0.5 bg-gray-800/30">
                            <span className="text-gray-400">
                                Area: <span className="text-cyan-300 font-mono">{formatArea(closure.area)}</span>
                            </span>
                            <span className="text-gray-400">
                                Precision: <span className="text-cyan-300 font-mono">{closure.precision}</span>
                            </span>
                            <span className="text-gray-400">
                                Misclosure: <span className={`font-mono ${closure.misclosureDistance < 0.05 ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {closure.misclosureDistance.toFixed(4)}&apos;
                                </span>
                            </span>
                        </div>
                    )}

                    {/* Action buttons */}
                    {(onGenerateClosureReport || onInvestigateClosure || onWriteLegal || onDrawToLinework) && (
                        <>
                        {/* POB row — explicit starting Point # and/or world coords. v26.05.22.1
                            Lets the user override where the deed lands without first loading a control point. */}
                        {onPobChange && (
                            <div className="border-t border-gray-700/50 px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-900/40 text-[11px]">
                                <span className="text-gray-400 font-semibold">POB:</span>
                                <label className="flex items-center gap-1 text-gray-400">
                                    PN
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
                                        className="w-16 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                                        title="Point number used as the POB. If this PN exists on the canvas its coords win."
                                    />
                                </label>
                                <label className="flex items-center gap-1 text-gray-400">
                                    N
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
                                        placeholder="—"
                                        className="w-24 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-emerald-300 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                                        title="POB Northing override. Blank → use PN lookup / centroid / (0,0)."
                                    />
                                </label>
                                <label className="flex items-center gap-1 text-gray-400">
                                    E
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
                                        placeholder="—"
                                        className="w-24 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-emerald-300 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                                        title="POB Easting override. Blank → use PN lookup / centroid / (0,0)."
                                    />
                                </label>
                                <span className="text-gray-600 italic text-[10px] ml-auto">PN match wins → then N/E → then existing centroid → then (0,0)</span>
                            </div>
                        )}
                        {/* Transform row: translate (ΔE, ΔN) and rotate the Boundary Object before drafting */}
                        {onTransformChange && (
                            <div className="border-t border-gray-700/50 px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-900/40 text-[11px]">
                                <span className="text-gray-400 font-semibold">Transform:</span>
                                <label className="flex items-center gap-1 text-gray-400">
                                    ΔE
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={selectedFile.translationE ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value.trim();
                                            onTransformChange(selectedFile.id, { translationE: v === '' ? null : parseFloat(v) });
                                        }}
                                        placeholder="0"
                                        className="w-20 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                                    />
                                </label>
                                <label className="flex items-center gap-1 text-gray-400">
                                    ΔN
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={selectedFile.translationN ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value.trim();
                                            onTransformChange(selectedFile.id, { translationN: v === '' ? null : parseFloat(v) });
                                        }}
                                        placeholder="0"
                                        className="w-20 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                                    />
                                </label>
                                <label className="flex items-center gap-1 text-gray-400">
                                    Rot°
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={selectedFile.rotationDeg ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value.trim();
                                            onTransformChange(selectedFile.id, { rotationDeg: v === '' ? null : parseFloat(v) });
                                        }}
                                        placeholder="0"
                                        className="w-20 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                                        title="Rotation in degrees about the POB (positive = counter-clockwise)"
                                    />
                                </label>
                                {selectedFile.rotationDeg ? (
                                    <button
                                        onClick={() => setShowRotatedBearings(!showRotatedBearings)}
                                        className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${showRotatedBearings
                                            ? 'bg-sky-700/60 text-sky-100 border-sky-500/60 hover:bg-sky-600/80'
                                            : 'bg-gray-700/60 text-gray-300 border-gray-600/40 hover:bg-gray-600/80'}`}
                                        title={showRotatedBearings
                                            ? 'Canvas annotations show rotated (as-drawn) bearings — click to show original deed bearings'
                                            : 'Canvas annotations show original deed bearings — click to show rotated (as-drawn) bearings'}
                                    >
                                        {showRotatedBearings ? 'Rotated brg' : 'Deed brg'}
                                    </button>
                                ) : null}
                                {(selectedFile.translationE || selectedFile.translationN || selectedFile.rotationDeg) ? (
                                    <button
                                        onClick={() => onTransformChange(selectedFile.id, { translationE: null, translationN: null, rotationDeg: null })}
                                        className="px-2 py-0.5 rounded text-[10px] bg-gray-700/60 text-gray-300 hover:bg-gray-600/80 border border-gray-600/40"
                                        title="Clear transform"
                                    >
                                        Reset
                                    </button>
                                ) : (
                                    <span className="text-gray-600 italic text-[10px]">no transform</span>
                                )}
                                {onAlignToOtherBoundary && boundaryFiles.length >= 2 && (
                                    <button
                                        onClick={() => onAlignToOtherBoundary(selectedFile.id)}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-700/60 text-blue-100 hover:bg-blue-600/80 border border-blue-500/40"
                                        title="Align this boundary to another deed: click one line on THIS boundary, then click the matching line on the OTHER deed. Movable rotates+translates so the picked lines coincide."
                                    >
                                        ↔ Align to other deed…
                                    </button>
                                )}
                                {onAlignCornersToPoints && (
                                    <button
                                        onClick={() => onAlignCornersToPoints(selectedFile.id)}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-700/60 text-indigo-100 hover:bg-indigo-600/80 border border-indigo-400/40"
                                        title="Align this deed to found points: click a corner of the highlighted deed, then click the found point it belongs on. Repeat for more corners — 1 pair translates, 2+ pairs also solve rotation. Shift+click a point to choose from a nest of stacked points."
                                    >
                                        ⌖ Align corners to found points…
                                    </button>
                                )}
                                <span className="text-gray-600 italic text-[10px] ml-auto">anchored at POB</span>
                            </div>
                        )}
                        <div className="border-t border-gray-700/50 px-3 py-1.5 flex flex-wrap gap-2 bg-gray-900/40">
                            {onDrawToLinework && (
                                <button
                                    onClick={() => onDrawToLinework(selectedFile.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-sky-700/50 text-sky-200 hover:bg-sky-600/70 border border-sky-500/30 transition-colors"
                                    title="Draft this boundary's calls onto the canvas as amber points + lines on the configured layers (uses CAD Manager standard if loaded)"
                                >
                                    Draft
                                </button>
                            )}
                            {/* v26.05.22.1 — Draft All: redraft every boundary file (each tract) in one click.
                                 Only shown when there is more than one boundary file so it stays unobtrusive
                                 for single-tract deeds. */}
                            {onDrawToLinework && boundaryFiles.length > 1 && (
                                <button
                                    onClick={() => {
                                        boundaryFiles.forEach(bf => onDrawToLinework(bf.id));
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-sky-900/40 text-sky-300 hover:bg-sky-800/60 border border-sky-700/40 transition-colors"
                                    title={`Draft all ${boundaryFiles.length} boundaries to amber linework`}
                                >
                                    Draft All ({boundaryFiles.length})
                                </button>
                            )}
                            {onInvestigateClosure && (
                                <button
                                    onClick={() => onInvestigateClosure(selectedFile.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-amber-700/50 text-amber-200 hover:bg-amber-600/70 border border-amber-500/30 transition-colors"
                                    title="Compare the traverse with the source deed, explain likely errors, and propose changes for your confirmation"
                                >
                                    Investigate Closure
                                </button>
                            )}
                            {onGenerateClosureReport && (
                                <button
                                    onClick={() => onGenerateClosureReport(selectedFile.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-700/50 text-emerald-200 hover:bg-emerald-600/70 border border-emerald-500/30 transition-colors"
                                    title="Generate a closure report; if exactly one piece of data is missing the solver will attempt to fix it"
                                >
                                    Closure Report
                                </button>
                            )}
                            {onWriteLegal && (
                                <button
                                    onClick={() => onWriteLegal(selectedFile.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-indigo-700/50 text-indigo-200 hover:bg-indigo-600/70 border border-indigo-500/30 transition-colors"
                                    title="Write a metes & bounds legal description for this boundary"
                                >
                                    Write Legal
                                </button>
                            )}
                        </div>
                                {/* Associate Points row — bundles user-picked points into the boundary so they hide together
                            and round-trip in .lsvz under BoundaryFile.associatedPointIds. v26.05.17.40 */}
                        {onAssociatePoints && (
                            <div className="border-t border-gray-700/50 px-3 py-1.5 flex flex-wrap items-center gap-2 bg-gray-900/30 text-[11px]">
                                <span className="text-gray-400 font-semibold">Associate Points:</span>
                                {selectedPointNumber && (
                                    <button
                                        onClick={() => onAssociatePoints(selectedFile.id, [selectedPointNumber])}
                                        className="px-2 py-0.5 rounded text-[10px] bg-amber-700/40 text-amber-200 hover:bg-amber-600/60 border border-amber-500/30"
                                        title={`Associate currently-selected point #${selectedPointNumber} with this boundary`}
                                    >
                                        + Selected (#{selectedPointNumber})
                                    </button>
                                )}
                                <input
                                    value={associateInput}
                                    onChange={e => setAssociateInput(e.target.value)}
                                    placeholder="PN list e.g. 101,102,103"
                                    className="flex-1 min-w-[140px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                                />
                                <button
                                    onClick={() => {
                                        const ids = associateInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
                                        if (ids.length === 0) return;
                                        onAssociatePoints(selectedFile.id, ids);
                                        setAssociateInput('');
                                    }}
                                    className="px-2 py-0.5 rounded text-[10px] bg-gray-700/60 text-gray-200 hover:bg-gray-600/80 border border-gray-600/40"
                                >
                                    Add
                                </button>
                                {onBestFitToPoints && (selectedFile.associatedPointIds?.length ?? 0) >= 1 && (
                                    <button
                                        onClick={() => onBestFitToPoints(selectedFile.id)}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-700/50 text-sky-200 hover:bg-sky-600/70 border border-sky-500/30"
                                        title={`Best-fit deed geometry to ${selectedFile.associatedPointIds?.length} found monument(s). Rigid-body only — deed angles and distances are preserved. Two modes: (1) PN match: if call From/To numbers equal survey point numbers; (2) Geometric: if point numbers don't match, finds the deed corners whose chord distances best match the inter-monument distances (convex-hull / distance-matrix). Updates Transform ΔE/ΔN/Rot.`}
                                    >
                                        ⟳ Best Fit ({selectedFile.associatedPointIds?.length}pts)
                                    </button>
                                )}
                                <span className="text-gray-500 text-[10px] ml-auto">
                                    {(selectedFile.associatedPointIds?.length ?? 0)} associated · hide hides amber overlay only
                                </span>
                            </div>
                        )}
                        {onAssociatePoints && (selectedFile.associatedPointIds?.length ?? 0) > 0 && (
                            <div className="border-t border-gray-700/50 px-3 py-1 flex flex-wrap gap-1 bg-gray-900/20">
                                {(selectedFile.associatedPointIds ?? []).map(pn => (
                                    <span key={pn} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800/80 text-amber-300 text-[10px] font-mono border border-amber-500/20">
                                        #{pn}
                                        {onDisassociatePoint && (
                                            <button
                                                onClick={() => onDisassociatePoint(selectedFile.id, pn)}
                                                className="text-gray-500 hover:text-red-400 leading-none"
                                                title="Remove association"
                                            >×</button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        </>
                    )}

                    <div className="px-3 py-1.5 text-gray-500 text-[10px] italic">
                        Click any cell to edit · Chevron expands curve fields · Trash deletes a row · Enter/blur applies.
                    </div>
                </>
            )}
        </div>
    );
};

export default BoundaryEditor;
