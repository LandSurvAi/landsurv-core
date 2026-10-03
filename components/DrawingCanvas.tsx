// FUTURE GEMINI: This is the core visual component. It is a complex, stateful canvas renderer.
// - Pay close attention to the `draw` function. This is where all points, lines, and symbols are rendered.
// - The `transform` state (scale, offsetX, offsetY) controls the user's viewport (pan and zoom).
// - Event handlers (`handleWheel`, `handleMouseDown`, etc.) manage user interaction. When modifying them, be very careful with dependency arrays in `useCallback` to avoid stale closures.
// - The floating toolbar at the bottom-left is a standard UI element. Preserve its contents and functionality unless specifically asked to change it.

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
    AgentType,
    type SurveyPoint,
    type SurveyLine,
    type ContourLabel,
    type StreetLabel,
    type Centerline,
    type CustomSymbol,
    type AnnotationRule,
    type Settings,
    type WmsService,
    type ActiveWmsLayer,
    type OfflineMapArea,
    type PointList,
    type DeedMetadata,
    type AnnotationDimension,
    type BoundaryFile,
    type BoundaryFileCall,
    type TinSurface,
    type ParcelCadTextStyle,
    type ParcelLabelFormatter
} from '../types.ts';
import type { LinetypeDefinition } from '../contexts/types/CadManager.types.ts';
import { calculateCenterlineLength, calculateCurveGeometry, calculatePointFromStationOffset, formatStation } from '../utils/stationing.ts';
import { parseBearingToRadians, parseDistance, direct, inverse, formatBearing, calculateClosure, directCurve, calculateChordDistance } from '../utils/cogo.ts';
import { solveRigidCornerAlign } from '../utils/cornerAlign.ts';
import { buildSymbolMatchers, resolveSymbol } from '../utils/symbolResolver.ts';
import { findMatchingSymbol, libraryToSymbolDefinition } from '../data/surveySymbolLibrary.ts';
import { buildAnnotationMatchers, resolveAnnotation, renderAnnotationTemplate } from '../utils/annotationResolver.ts';
import { loadImageViaProxy } from '../utils/corsProxy.ts';
import { buildParcelLabelLines, resolveParcelTextStyle } from '../utils/parcelLabelFormatter.ts';
import { applyAnnotationTextCase, resolveAnnotationCategoryTextStyle, resolveAnnotationTextSize } from '../utils/annotationTextStyle.ts';
import { getStaticMap, type StaticMapRequest } from '../services/staticMapsService.ts';
import { useCadManager } from '../contexts/CadManagerContext.tsx';
import { useAppState, useErrorReporter } from '../contexts/AppStateContext.tsx';
import { useDocumentScrollLock } from '../hooks/useDocumentScrollLock.ts';
import { StandardsEditor } from './CadManager/StandardsEditor.tsx';
import type { StandardDefinition } from '../contexts/types/CadManager.types';
import { convertLinearUnits, getLinearUnitAbbreviation, type LinearUnit } from '../utils/linearUnits.ts';
import { LayersIcon, RedrawIcon, ZoomExtentsIcon, ScaleIcon, AttributeScaleIcon, DownloadIcon, ZoomToPointIcon, XMarkIcon, EyeIcon, PencilSquareIcon, BreaklineIcon, InclusionLineIcon, ExclusionLineIcon, ScissorsIcon, UndoIcon, RedoIcon, ExtendIcon, PolylineIcon, ListBulletIcon, CircleIcon } from './icons.tsx';
import proj4 from 'proj4';

/**
 * Compute the unique circular arc that starts at `start`, leaves tangent to
 * the unit vector `tangent` (world frame: x=easting, y=northing), and passes
 * through `end`. Returns null when the geometry is degenerate (endpoint
 * coincident with the start or lying on the tangent line) so callers can
 * fall back to a straight segment. Used by the polyline tool's Arc submode.
 */
export const computeTangentArc = (
    start: { easting: number; northing: number },
    tangent: { x: number; y: number },
    end: { easting: number; northing: number },
): {
    centerEasting: number;
    centerNorthing: number;
    radius: number;
    arcLength: number;
    sweep: number;
    direction: 'left' | 'right';
    tangentBearing: string;
    chordBearing: string;
    endTangent: { x: number; y: number };
} | null => {
    const cx = end.easting - start.easting;
    const cy = end.northing - start.northing;
    const chordLenSq = cx * cx + cy * cy;
    if (chordLenSq < 1e-12) return null;
    // Center lies on the tangent's left normal (world frame is y-up, CCW+).
    const nx = -tangent.y;
    const ny = tangent.x;
    const denom = 2 * (cx * nx + cy * ny);
    if (Math.abs(denom) < 1e-9) return null;
    const signedRadius = chordLenSq / denom; // positive → center left of travel
    const radius = Math.abs(signedRadius);
    const direction: 'left' | 'right' = signedRadius > 0 ? 'left' : 'right';
    const centerEasting = start.easting + signedRadius * nx;
    const centerNorthing = start.northing + signedRadius * ny;
    const a0 = Math.atan2(start.northing - centerNorthing, start.easting - centerEasting);
    const a1 = Math.atan2(end.northing - centerNorthing, end.easting - centerEasting);
    const rawSweep = direction === 'left' ? a1 - a0 : a0 - a1;
    const sweep = ((rawSweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (sweep < 1e-9 || 2 * Math.PI - sweep < 1e-9) return null;
    const signedSweep = direction === 'left' ? sweep : -sweep;
    const cosS = Math.cos(signedSweep);
    const sinS = Math.sin(signedSweep);
    const normalizeBearing = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
    return {
        centerEasting,
        centerNorthing,
        radius,
        arcLength: radius * sweep,
        sweep,
        direction,
        tangentBearing: formatBearing(normalizeBearing(Math.atan2(tangent.x, tangent.y))),
        chordBearing: formatBearing(normalizeBearing(Math.atan2(cx, cy))),
        endTangent: {
            x: tangent.x * cosS - tangent.y * sinS,
            y: tangent.x * sinS + tangent.y * cosS,
        },
    };
};


export interface DrawingCanvasHandles {
  zoomExtents: () => void;
  /** Zoom canvas to a specific bounding box in project coordinates. */
  zoomToBbox: (minE: number, maxE: number, minN: number, maxN: number, padding?: number) => void;
  redraw: () => void;
  finishDrawing: () => void;
  cancelDeleteMode: () => void;
  confirmDelete: () => void;
  getTransform: () => { scale: number; offsetX: number; offsetY: number };
  setTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}

interface DrawingCanvasProps {
    /** Initial 2D canvas transform (scale/zoom & pan offsets) restored from saved session state. */
    initialTransform?: { scale: number; offsetX: number; offsetY: number } | null;
    /** Notified whenever the viewport transform (scale/pan) changes. */
    onTransformChange?: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
    points: SurveyPoint[];
    lines: SurveyLine[];
    contourLabels: ContourLabel[];
    /** Named road labels placed on the plan (v26.05.19.4). */
    streetLabels?: StreetLabel[];
    centerlines: Centerline[];
    customSymbols: CustomSymbol[];
    /**
     * Ids of built-in survey-library symbols (tree, manhole, …) the user has
     * opted into showing. Built-in symbols default to OFF; a point only renders
     * its built-in glyph when the matched library id is in this set. The '*'
     * sentinel means "all built-in symbols enabled".
     */
    enabledBuiltinSymbolIds?: Set<string>;
    pointLayers: { pointNumber: { visible: boolean; color: string; }; description: { visible: boolean; color: string; }; elevation: { visible: boolean; color: string; }; };
    attributeScale: number;
    setAttributeScale: React.Dispatch<React.SetStateAction<number>>;
    lineLabelScale: number;
    setLineLabelScale: React.Dispatch<React.SetStateAction<number>>;
    lineThickness: number;
    setLineThickness: React.Dispatch<React.SetStateAction<number>>;
    contourLabelScale: number;
    onLayerColorChange: (layer: 'pointNumber' | 'description' | 'elevation', color: string) => void;
    activeAgent: AgentType;
    settings: Settings;
    zoomTarget: SurveyPoint | null;
    onZoomComplete: () => void;
    /** Point numbers queued for deletion — rendered with a pulsing red ring so the user can verify before confirming. */
    pendingDeletePointNumbers?: Set<string>;
    onUpdatePointLabelOffset: (pointNumber: string, offset: { x: number; y: number }) => void;
    // Per-point override for the annotation leader offset. Ctrl+drag updates;
    // Shift+click on the note mirrors dx (left ↔ right side of the point).
    onUpdatePointAnnotationOffset?: (pointNumber: string, offset: { dx: number; dy: number }) => void;
    onUpdateLineLabelOffset?: (lineId: string, offset: { x: number; y: number }) => void;
    onToggleLineLabelRotation?: (lineId: string) => void;
    onSwapLineBearingDirection?: (lineId: string) => void;
    onUpdateDeedMetadataOffset?: (offset: { x: number; y: number }) => void;
    onUpdateOwnerNameOffset?: (offset: { x: number; y: number }) => void;
    deedMetadataOffset?: { x: number; y: number }; // Offset for deed metadata box in world coordinates
    ownerNameOffset?: { x: number; y: number }; // Offset for owner name label in world coordinates
    onAddLine: (newLine: SurveyLine) => void;
    onDeleteLine: (lineId: string) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    wmsServices: WmsService[];
    activeWmsLayers: ActiveWmsLayer[];
    offlineMapAreas: OfflineMapArea[];
    onRedrawAndShowAll: () => void;
    onOpenDxfExportModal: () => void;
    isLayerPanelOpen: boolean;
    setIsLayerPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onLayerToggle: (layerName: "pointNumber" | "description" | "elevation") => void;
    activeAccent: string;
    currentPosition: GeolocationPosition | null;
    projectedPosition: { northing: number, easting: number } | null;
    onZoomToPoint: (point: SurveyPoint) => void;
    linesVisible: boolean;
    onSetLinesVisible: React.Dispatch<React.SetStateAction<boolean>>;
    centerlinesVisible: boolean;
    onSetCenterlinesVisible: React.Dispatch<React.SetStateAction<boolean>>;
    pointLists: PointList[];
    orientationTuple?: {
        angle: number;
        originX: number;
        originY: number;
        mode?: 'drafting' | 'view';
        draftingAngle?: number;
        draftingOriginX?: number;
        draftingOriginY?: number;
        viewAngle?: number;
        viewOriginX?: number;
        viewOriginY?: number;
        placed?: boolean;
    };
    onSetOrientationTuple?: React.Dispatch<React.SetStateAction<{
        angle: number;
        originX: number;
        originY: number;
        mode?: 'drafting' | 'view';
        draftingAngle?: number;
        draftingOriginX?: number;
        draftingOriginY?: number;
        viewAngle?: number;
        viewOriginX?: number;
        viewOriginY?: number;
        placed?: boolean;
    }>>;
    onTogglePointListVisibility: (listId: string) => void;
    deedMetadata?: DeedMetadata; // Deed information to display on canvas
    onToolStateChange?: (state: {
        isDrawing: boolean;
        isTrimming: boolean;
        isExtending: boolean;
        isDeleting: boolean;
        selectedCount?: number;
        segmentCount?: number;
        lineType?: 'normal' | 'breakline' | 'inclusion' | 'exclusion';
    }) => void;
    onShowSettings?: () => void;
    // C3D Integration props
    isC3DConnected?: boolean;
    /** Faint futuristic background grid — toggled from the app header. */
    isGridVisible?: boolean;
    // Agent draw mode
    agentDrawMode: 'both' | 'points' | 'lines';
    onCycleAgentDrawMode: () => void;
    // Annotation mode (lifted to App.tsx so the header toggle can control it)
    agentAnnotMode: 'both' | 'bearing' | 'distance';
    onCycleAgentAnnotMode: () => void;
    // Boundary line draw callback (called when user confirms a bearing+distance or curve call)
    onAddBoundaryCall?: (from: SurveyPoint, bearing: string, distance: string, onComplete: (endPt: SurveyPoint) => void, curveOptions?: { curveRadius: number; arcLength: number; curveDirection: 'left' | 'right' }) => void;
    // Closure report callback — receives accumulated drawn calls, returns closure summary or null on error
    onComputeCurrentClosure?: (calls: Array<{ from: string; to: string; bearing: string; distance: string; isCurve?: boolean; curveRadius?: number; arcLength?: number; curveDirection?: 'left' | 'right'; tangentBearing?: string }>) => { precision: string; area: number; misclosureDistance: number; misclosureBearing: string } | null;
    // Convert selected canvas lines to a BoundaryFile in the boundary editor
    onConvertSelectionToBoundary?: (lines: SurveyLine[]) => void;
    // Annotation dimensions
    dimensions: AnnotationDimension[];
    onAddDimension: (dim: AnnotationDimension) => void;
    dimensionScale: number;
    setDimensionScale: React.Dispatch<React.SetStateAction<number>>;
    symbolScale: number;
    setSymbolScale: React.Dispatch<React.SetStateAction<number>>;
    customAnnotations?: AnnotationRule[];
    annotationScale?: number;
    setAnnotationScale?: React.Dispatch<React.SetStateAction<number>>;
    /** Parcel centroid annotation labels (v26.05.19.15). */
    parcelLabels?: import('../types.ts').ParcelLabel[];
    /** Parcel label field include/exclude and prefix controls. */
    parcelLabelFormatter?: ParcelLabelFormatter;
    /** CAD Manager text style catalog used when parcel styleSource='cad-manager'. */
    parcelCadTextStyles?: ParcelCadTextStyle[];
    /** Per-category annotation styles (v26.05.19.15). */
    annotationCategories?: import('../types.ts').AnnotationCategoryStyle[];
    /** Imported/generated TIN surfaces for wireframe display. */
    tinSurfaces?: TinSurface[];
    // Boundary file overlays
    boundaryFiles?: BoundaryFile[];
    /** Id of the active boundary in the editor. Rendered in a distinct color
     *  (blue) so the user can tell at a glance which tract their transform/POB
     *  edits will apply to. Other (visible) tracts stay amber. */
    activeBoundaryFileId?: string;
    /** When true, the BFOverlay bearing labels for the active boundary are
     *  rendered as the rotated (as-drawn) bearing rather than the original
     *  deed bearing. Only has an effect when the active file has a non-zero
     *  rotationDeg. */
    showRotatedBearings?: boolean;
    // Boundary call label interaction callbacks (Alt = rotate, Shift = swap direction)
    onToggleBoundaryCallLabelRotation?: (fileId: string, callId: string) => void;
    onSwapBoundaryCallBearingDirection?: (fileId: string, callId: string) => void;
    // Line layer query/edit
    onUpdateLine?: (lineId: string, changes: Partial<SurveyLine>) => void;
    availableLayers?: string[];
    // Active drawing layer — applied to manually drawn polylines (not AI lines)
    activeDrawingLayer?: string;
    onSetActiveDrawingLayer?: (layer: string) => void;
    // Floating point list panel
    onOpenPointListPanel?: () => void;
    isPointListPanelOpen?: boolean;
    /** Pulse the point list toolbar button pink to hint the user can open the floating list. */
    isPointListButtonPulsing?: boolean;
    /** Opens the boundary editor as a canvas-toolbar panel. */
    onOpenBoundaryEditor?: () => void;
    /** Whether the boundary editor is currently open. */
    isBoundaryEditorOpen?: boolean;
    /** Pulse the boundary editor toolbar button to hint the user can open the floating editor. */
    isBoundaryEditorButtonPulsing?: boolean;
    /** Opens the shrinkwrap editor using the visible canvas points. */
    onOpenShrinkwrap?: () => void;
    /** Whether the shrinkwrap editor is currently open. */
    isShrinkwrapOpen?: boolean;
    /** Active shrinkwrap source pns (already filtered: excludedPns removed). Enables hover-to-highlight + click-to-remove. */
    shrinkwrapSourcePns?: string[];
    /** Called when the user clicks a shrinkwrap source point on the canvas. */
    onShrinkwrapPointClick?: (pn: string) => void;
    /** General point selection — called whenever a survey point is clicked in normal (non-drawing) mode. Used by DeedSummaryPanel alignment and other panels. */
    onPointSelected?: (point: SurveyPoint) => void;
    /** Boundary-align tool — patch translationE/N/rotationDeg on a boundary file.
     *  Mirrors BoundaryEditor's onTransformChange so the silent-redraw debounce is shared. */
    onUpdateBoundaryTransform?: (id: string, patch: { translationE?: number | null; translationN?: number | null; rotationDeg?: number | null }) => void;
    /** When set (an incrementing token + movable bf id), arms the boundary-align tool with
     *  movable preset and waits for the user to click one line on movable, one on target. */
    boundaryAlignRequest?: { token: number; movableBfId: string } | null;
    /** Called when the tool exits (commit or cancel) so the parent can clear the request. */
    onBoundaryAlignRequestHandled?: () => void;
    /** When set (an incrementing token + bf id), arms the corner-align tool: the user clicks a
     *  corner on the highlighted deed silhouette, then clicks the found point it belongs on.
     *  Every extra pair refines a rigid (translate + rotate) best fit. */
    boundaryCornerAlignRequest?: { token: number; movableBfId: string } | null;
    /** Called when the corner-align tool exits (commit or cancel) so the parent can clear the request. */
    onBoundaryCornerAlignRequestHandled?: () => void;
    /** Called on commit with the point numbers the user paired, so the parent can associate
     *  them with the boundary (they then hide/persist together). */
    onBoundaryCornerAlignCommitted?: (bfId: string, pointIds: string[]) => void;
    /** User-defined linetypes from the CAD Manager standard. Looked up by name when rendering line patterns. */
    linetypes?: LinetypeDefinition[];
    /** Global linetype scale (AutoCAD LTSCALE equivalent). Multiplies every rendered dash pattern. Default 1.0. */
    globalLinetypeScale?: number;
    /** Map of CAD layer name → default linetype name, derived from the standard's codes.
     *  Used as a fallback when a SurveyLine has a layer but no explicit lineType — common
     *  for lines created before the linetype system existed or imported from DXF. */
    layerLinetypeMap?: Record<string, string>;
}

type OsnapMode = 'endpoint' | 'midpoint' | 'intersection' | 'center' | 'nearest' | 'perpendicular' | 'tangent';
type OsnapResult = {
    easting: number;
    northing: number;
    mode: OsnapMode;
    sourcePoint?: SurveyPoint;
};

export interface TtrEntity {
    kind: 'line' | 'circle' | 'arc';
    line?: SurveyLine;
    p1?: { x: number; y: number };
    p2?: { x: number; y: number };
    center?: { x: number; y: number };
    radius?: number;
    startAngle?: number;
    centralAngle?: number;
    isLeftCurve?: boolean;
    pickPoint: { x: number; y: number };
}

export interface TrimPreviewData {
    kind: 'line' | 'circle' | 'arc';
    p1?: { x: number; y: number };
    p2?: { x: number; y: number };
    center?: { x: number; y: number };
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    arcAnticlockwise?: boolean;
    hitPoint: { x: number; y: number };
}

export type GripType = 'start' | 'mid' | 'end' | 'center' | 'quadrant';

export interface EntityGrip {
    id: string;
    lineId: string;
    type: GripType;
    x: number;
    y: number;
    quadrantIndex?: number;
    line: SurveyLine;
}

const RUNNING_OSNAP_STORAGE_KEY = 'landsurv.runningOsnaps.v1';
const OSNAP_LABELS: Record<OsnapMode, string> = {
    endpoint: 'Endpoint',
    midpoint: 'Midpoint',
    intersection: 'Intersection',
    center: 'Center',
    nearest: 'Nearest',
    perpendicular: 'Perpendicular',
    tangent: 'Tangent',
};
const OSNAP_GLYPHS: Record<OsnapMode, string> = {
    endpoint: 'E',
    midpoint: 'M',
    intersection: 'X',
    center: 'C',
    nearest: 'N',
    perpendicular: '⊥',
    tangent: 'T',
};
const OSNAP_ORDER: OsnapMode[] = ['endpoint', 'midpoint', 'intersection', 'center', 'nearest', 'perpendicular', 'tangent'];

const NorthArrow: React.FC<{ style: 'classic' | 'modern' | 'elegant', position: 'left' | 'right', isLightTheme: boolean, rotationRad?: number, onClick?: () => void }> = ({ style, position, isLightTheme, rotationRad = 0, onClick }) => {
    const positionClass = position === 'left' ? 'top-4 left-4' : 'top-4 right-4';
    const rotationDeg = -(rotationRad * 180) / Math.PI;

    const classicArrow = (
        <svg width="40" height="78" viewBox="0 0 80 155">
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.4"/>
                </filter>
            </defs>
            <g filter="url(#shadow)">
                {/* Arrow shape with border */}
                <path d="M40 5 L10 95 L40 75 L70 95 Z" stroke={isLightTheme ? "#333" : "#DDD"} strokeWidth="2" fill="none"/>

                {/* Dark half (left) */}
                <path d="M40 5 L10 95 L40 75 Z" fill={isLightTheme ? "#4A5568" : "#2D3748"} />

                {/* Light half (right) */}
                <path d="M40 5 L70 95 L40 75 Z" fill={isLightTheme ? "#E2E8F0" : "#A0AEC0"} />
                
                <text x="40" y="145" fontFamily="sans-serif" fontSize="48" fill={isLightTheme ? "#333" : "#DDD"} textAnchor="middle" fontWeight="bold">N</text>
            </g>
        </svg>
    );

    const modernArrow = (
         <svg width="40" height="40" viewBox="0 0 100 100">
             <defs>
                <filter id="shadow-modern" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.4"/>
                </filter>
            </defs>
            <g filter="url(#shadow-modern)">
                <path d="M50 5 L15 95 L50 75 L85 95 Z" fill={isLightTheme ? "rgba(113, 128, 150, 0.8)" : "rgba(45, 55, 72, 0.8)"} stroke={isLightTheme ? "#A0AEC0" : "#4A5568"} strokeWidth="3" />
                <path d="M50 5 L50 75" stroke={isLightTheme ? "#A0AEC0" : "#4A5568"} strokeWidth="3" />
                <text x="50" y="38" fontFamily="sans-serif" fontSize="28" fill="#f87171" textAnchor="middle" fontWeight="bold">N</text>
            </g>
        </svg>
    );
    
    const elegantArrow = (
        <svg width="45" height="45" viewBox="0 0 100 100">
            <defs>
                <filter id="shadow-elegant" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.3"/>
                </filter>
            </defs>
            <g filter="url(#shadow-elegant)">
                <path d="M50 5 L50 95" stroke={isLightTheme ? "#4A5568" : "#A0AEC0"} strokeWidth="2"/>
                <path d="M50 5 L40 25 L60 25 Z" fill={isLightTheme ? "#f56565" : "#f56565"}/>
                <text x="50" y="45" fontFamily="serif" fontSize="24" fill={isLightTheme ? "#333" : "#DDD"} textAnchor="middle" fontWeight="bold">N</text>
            </g>
        </svg>
    );

    let arrowSvg;
    switch (style) {
        case 'modern':
            arrowSvg = modernArrow;
            break;
        case 'elegant':
            arrowSvg = elegantArrow;
            break;
        case 'classic':
        default:
            arrowSvg = classicArrow;
            break;
    }

    return (
        <div className={`absolute ${positionClass} z-10 cursor-pointer hover:scale-110 transition-transform`} onClick={onClick} title="Settings / North Arrow">
            <div
                style={{
                    transform: `rotate(${rotationDeg}deg)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.3s ease-out'
                }}
            >
                {arrowSvg}
            </div>
        </div>
    );
};

const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeoutId: number;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => func(...args), delay);
    };
};

function latToWorldY(latDeg: number): number {
    const lat = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
    const sinLat = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
}

function worldYToLat(worldY: number): number {
    const rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY)));
    return (rad * 180) / Math.PI;
}

function bboxFromCenterZoom(lat: number, lng: number, zoom: number, width: number, height: number): {
    west: number;
    south: number;
    east: number;
    north: number;
} {
    const scale = 256 * Math.pow(2, zoom);
    const cx = ((lng + 180) / 360) * scale;
    const cy = latToWorldY(lat) * scale;

    const leftX = cx - width / 2;
    const rightX = cx + width / 2;
    const topY = cy - height / 2;
    const bottomY = cy + height / 2;

    const west = (leftX / scale) * 360 - 180;
    const east = (rightX / scale) * 360 - 180;
    const north = worldYToLat(topY / scale);
    const south = worldYToLat(bottomY / scale);

    return { west, south, east, north };
}

const BoundaryEditorGlyph: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 6.5 11.5 3l6.5 3.5 1 7-5.5 6-7.5-2-2-6z" />
        <path d="M5 6.5 14 19.5M18 6.5 6 17.5" strokeOpacity="0.35" />
        <circle cx="5" cy="6.5" r="1.2" fill="currentColor" />
        <circle cx="18" cy="6.5" r="1.2" fill="currentColor" />
        <circle cx="19" cy="13.5" r="1.2" fill="currentColor" />
        <circle cx="13.5" cy="19.5" r="1.2" fill="currentColor" />
        <circle cx="6" cy="17.5" r="1.2" fill="currentColor" />
    </svg>
);

function zoomForBboxWgs84(bboxWgs84: [number, number, number, number]): number {
    const widthDeg = Math.max(1e-6, bboxWgs84[2] - bboxWgs84[0]);
    const heightDeg = Math.max(1e-6, bboxWgs84[3] - bboxWgs84[1]);
    const span = Math.max(widthDeg, heightDeg) * 1.15;
    const zoom = Math.floor(Math.log2((360 * 640) / (span * 256)));
    return Math.max(12, Math.min(20, zoom));
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandles, DrawingCanvasProps>((props, ref) => {
    useDocumentScrollLock(true);

    const { 
        initialTransform,
        onTransformChange,
        points, lines, contourLabels, centerlines, customSymbols, enabledBuiltinSymbolIds, pointLayers, attributeScale, setAttributeScale, lineLabelScale, setLineLabelScale, lineThickness, setLineThickness, contourLabelScale, onLayerColorChange, activeAgent, settings, zoomTarget, onZoomComplete,
        onUpdatePointLabelOffset, onAddLine, onDeleteLine, canUndo, canRedo, onUndo, onRedo, wmsServices, activeWmsLayers, offlineMapAreas, onRedrawAndShowAll, onOpenDxfExportModal,
        onUpdatePointAnnotationOffset,
        isLayerPanelOpen, setIsLayerPanelOpen, onLayerToggle, activeAccent, currentPosition, projectedPosition, onZoomToPoint,
        linesVisible, onSetLinesVisible, centerlinesVisible, onSetCenterlinesVisible, pointLists, onTogglePointListVisibility, deedMetadata, onToolStateChange, onShowSettings,
        isC3DConnected, isGridVisible, agentDrawMode, onCycleAgentDrawMode, agentAnnotMode, onCycleAgentAnnotMode, onAddBoundaryCall, onConvertSelectionToBoundary, onComputeCurrentClosure,
        dimensions, onAddDimension, dimensionScale, setDimensionScale, symbolScale, setSymbolScale,
        customAnnotations = [], annotationScale = 1, setAnnotationScale,
        parcelLabels, annotationCategories,
        tinSurfaces = [],
        boundaryFiles,
        activeBoundaryFileId,
        showRotatedBearings,
        activeDrawingLayer,
        linetypes: standardLinetypes,
        globalLinetypeScale = 1,
        layerLinetypeMap,
        orientationTuple = {
            angle: 0,
            originX: 0,
            originY: 0,
            mode: 'drafting',
            draftingAngle: 0,
            draftingOriginX: 0,
            draftingOriginY: 0,
            viewAngle: 0,
            viewOriginX: 0,
            viewOriginY: 0,
        },
        onSetOrientationTuple,
    } = props;
    const { addNotification, setSettings } = useAppState();
    const { reportError } = useErrorReporter();

    // Helper to notify boundary errors to the notification bar instead of displaying inline
    const notifyBoundaryError = useCallback((message: string, isClosure: boolean = false) => {
        addNotification({
            kind: 'boundary-processing',
            severity: 'error',
            title: isClosure ? 'Closure Error' : 'Boundary Input Error',
            message,
        });
    }, [addNotification]);

    console.log('[DC] render — boundaryFiles:', boundaryFiles ? boundaryFiles.length : 'undef', 'points:', points.length);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<{ scale: number; offsetX: number; offsetY: number }>(() => initialTransform || { scale: 1, offsetX: 0, offsetY: 0 });
    const transformRef = useRef(transform);
    const hasAutoFitOnceRef = useRef(Boolean(initialTransform));

    useEffect(() => {
        transformRef.current = transform;
        onTransformChange?.(transform);
    }, [transform, onTransformChange]);

    useEffect(() => {
        if (initialTransform) {
            setTransform(initialTransform);
            hasAutoFitOnceRef.current = true;
        }
    }, [initialTransform]);

    const worldToScreen = useCallback((easting: number, northing: number): { x: number; y: number } => {
        let x = easting;
        let y = northing;
        const viewAngle = orientationTuple?.viewAngle ?? (orientationTuple?.mode === 'view' ? orientationTuple.angle : 0);
        const viewOriginX = orientationTuple?.viewOriginX ?? (orientationTuple?.mode === 'view' ? orientationTuple.originX : 0);
        const viewOriginY = orientationTuple?.viewOriginY ?? (orientationTuple?.mode === 'view' ? orientationTuple.originY : 0);

        if (viewAngle !== 0) {
            const dx = easting - viewOriginX;
            const dy = northing - viewOriginY;
            const cos = Math.cos(viewAngle);
            const sin = Math.sin(viewAngle);
            x = dx * cos - dy * sin + viewOriginX;
            y = dx * sin + dy * cos + viewOriginY;
        }
        return {
            x: x * transform.scale + transform.offsetX,
            y: -y * transform.scale + transform.offsetY,
        };
    }, [transform, orientationTuple]);

    const screenToWorld = useCallback((screenX: number, screenY: number): { easting: number; northing: number } => {
        const rawX = (screenX - transform.offsetX) / transform.scale;
        const rawY = -(screenY - transform.offsetY) / transform.scale;
        const viewAngle = orientationTuple?.viewAngle ?? (orientationTuple?.mode === 'view' ? orientationTuple.angle : 0);
        const viewOriginX = orientationTuple?.viewOriginX ?? (orientationTuple?.mode === 'view' ? orientationTuple.originX : 0);
        const viewOriginY = orientationTuple?.viewOriginY ?? (orientationTuple?.mode === 'view' ? orientationTuple.originY : 0);

        if (viewAngle !== 0) {
            const dx = rawX - viewOriginX;
            const dy = rawY - viewOriginY;
            const cos = Math.cos(viewAngle);
            const sin = Math.sin(viewAngle);
            return {
                easting: dx * cos + dy * sin + viewOriginX,
                northing: -dx * sin + dy * cos + viewOriginY,
            };
        }
        return {
            easting: rawX,
            northing: rawY,
        };
    }, [transform, orientationTuple]);

    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const pinchDistRef = useRef(0);
    /** Point number currently hovered in shrinkwrap mode (null = none). */
    const hoveredShrinkwrapPnRef = useRef<string | null>(null);
    const [hoveredShrinkwrapPn, setHoveredShrinkwrapPn] = useState<string | null>(null);
    // Dynamic input / Cursor HUD screen position
    const [cursorScreenPos, setCursorScreenPos] = useState<{ x: number; y: number } | null>(null);
    // Shift+hover quick-info tooltip
    const [shiftHoverPoints, setShiftHoverPoints] = useState<SurveyPoint[]>([]);
    const [shiftHoverPos, setShiftHoverPos] = useState<{ clientX: number; clientY: number } | null>(null);
    const shiftHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shiftHoverAnchorRef = useRef<{ mx: number; my: number } | null>(null);
    const [zoomToPointNumber, setZoomToPointNumber] = useState('');
    const [isZoomToPointOpen, setIsZoomToPointOpen] = useState(false);
    // Description-search variant of zoom-to-point: "Show me sign points",
    // "find iron pins", "EP", etc. Opens a floating list of matching points
    // and stays open so the user can zoom to each one in sequence.
    const [isFindPointsOpen, setIsFindPointsOpen] = useState(false);
    const [findPointsQuery, setFindPointsQuery] = useState('');
    const [isZoomExtentsOpen, setIsZoomExtentsOpen] = useState(false);
    const [isTinShadingEnabled, setIsTinShadingEnabled] = useState(false);
    const [isAttributeFlyoutOpen, setIsAttributeFlyoutOpen] = useState(false);
    const [isOtPopupOpen, setIsOtPopupOpen] = useState(false);
    const [isPickingOtOrigin, setIsPickingOtOrigin] = useState(false);
    const [isPickingOtLineAlign, setIsPickingOtLineAlign] = useState(false);
    const [drawingMode, setDrawingMode] = useState<'none' | 'polylines' | 'breaklines' | 'inclusion' | 'exclusion' | 'circle' | 'boundary-line' | 'aligned-dim' | 'boundary-align' | 'boundary-corner-align'>('none');
    // Circle drawing state (triggered by 'C' key or Drawing Tools)
    const [circleCenter, setCircleCenter] = useState<{ easting: number; northing: number } | null>(null);
    const [circleSizeParam, setCircleSizeParam] = useState<'radius' | 'diameter'>('radius');
    const [typedCircleValue, setTypedCircleValue] = useState('');
    const [circleSubMode, setCircleSubMode] = useState<'center-radius' | 'ttr'>('center-radius');
    const [ttrStep, setTtrStep] = useState<1 | 2 | 3>(1);
    const [ttrEntity1, setTtrEntity1] = useState<TtrEntity | null>(null);
    const [ttrEntity2, setTtrEntity2] = useState<TtrEntity | null>(null);
    const [ttrHoverEntity, setTtrHoverEntity] = useState<TtrEntity | null>(null);
    const [polylinePoints, setPolylinePoints] = useState<SurveyPoint[]>([]);
    const [typedSegmentLength, setTypedSegmentLength] = useState('');
    // AutoCAD-style Arc submode for the polyline tool (A toggles on, L back off).
    const [polylineArcMode, setPolylineArcMode] = useState(false);
    // Unit tangent (world frame) leaving the current polyline anchor — the arc
    // submode locks to this so chained segments stay tangent-continuous.
    const lastSegmentTangentRef = useRef<{ x: number; y: number } | null>(null);
    const [isMultiSegmentMode, setIsMultiSegmentMode] = useState(false); // For continuous polyline drawing
    const [isDeletingLines, setIsDeletingLines] = useState(false);
    const [isTrimmingLines, setIsTrimmingLines] = useState(false);
    const [trimPoint, setTrimPoint] = useState<{ x: number; y: number } | null>(null);
    const [trimHoverPreview, setTrimHoverPreview] = useState<TrimPreviewData | null>(null);
    const [isExtendingLines, setIsExtendingLines] = useState(false);
    const [extendFromLine, setExtendFromLine] = useState<string | null>(null);
    // Aligned dimension tool state
    const [isDimFlyoutOpen, setIsDimFlyoutOpen] = useState(false);
    const [dimPhase, setDimPhase] = useState<0 | 1 | 2>(0); // 0=pick p1, 1=pick p2, 2=pick offset
    const [dimP1, setDimP1] = useState<{ easting: number; northing: number } | null>(null);
    const [dimP2, setDimP2] = useState<{ easting: number; northing: number } | null>(null);
    const [dimPreviewMouse, setDimPreviewMouse] = useState<{ easting: number; northing: number } | null>(null);
    const [dimSnapPoint, setDimSnapPoint] = useState<{ easting: number; northing: number } | null>(null);
    const [activeOsnapPoint, setActiveOsnapPoint] = useState<OsnapResult | null>(null);
    const [runningOsnaps, setRunningOsnaps] = useState<Set<OsnapMode>>(() => {
        try {
            const raw = localStorage.getItem(RUNNING_OSNAP_STORAGE_KEY);
            if (!raw) return new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection']);
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection']);
            const valid = parsed.filter((m): m is OsnapMode => OSNAP_ORDER.includes(m));
            return new Set<OsnapMode>(valid.length > 0 ? valid : ['endpoint', 'midpoint', 'intersection']);
        } catch {
            return new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection']);
        }
    });
    const [inlineOsnapOverride, setInlineOsnapOverride] = useState<OsnapMode | null>(null);
    const [inlineOsnapMenuPos, setInlineOsnapMenuPos] = useState<{ x: number; y: number } | null>(null);

    // Boundary-align tool state — pick a line on one boundary file, a line on
    // another, auto-rotate+translate the first so the picked edges are
    // collinear, then slide along the target line until a click commits.
    const [boundaryAlignMovable, setBoundaryAlignMovable] = useState<{ bfId: string; callId: string } | null>(null);
    const [boundaryAlignTarget, setBoundaryAlignTarget]   = useState<{ bfId: string; callId: string } | null>(null);
    const [boundaryAlignSliding, setBoundaryAlignSliding] = useState<boolean>(false);
    // 180° flip toggle — swaps which movable-line endpoint snaps to which target-line endpoint.
    const [boundaryAlignFlipped, setBoundaryAlignFlipped] = useState<boolean>(false);
    // Captured at slide entry — drives the per-frame translation update on mouse move.
    const boundaryAlignSlideRef = useRef<{
        movableBfId: string;
        rotDegFixed: number;            // movable bf.rotationDeg locked during slide
        baseTxE: number;                // movable bf.translationE at slide start (movable.from snapped to target.from)
        baseTxN: number;                // movable bf.translationN at slide start
        dirE: number;                   // target line unit direction (E component)
        dirN: number;                   // target line unit direction (N component)
        targetLen: number;              // target line length (world units)
        movableLen: number;             // movable line length (world units)
        mouseStartProj: number;         // mouse projection onto target line at slide start
        sMin: number;                   // min slide parameter (allowed range)
        sMax: number;                   // max slide parameter (allowed range)
    } | null>(null);
    // Per-bf cached geometry stashed during BFOverlay render; read by the
    // boundary-align hit-test on mousedown without re-walking the COGO chain.
    const bfGeometryCacheRef = useRef<Map<string, {
        synthMap: Map<string, { easting: number; northing: number }>;
        pob: { easting: number; northing: number };
        txE: number;
        txN: number;
        rotDeg: number;
    }>>(new Map());

    // When the parent fires a boundary-align request (token + movableBfId),
    // arm the tool with movable pre-bound: user clicks one line on movable,
    // then one line on target, snap is committed and the tool exits.
    const lastAlignTokenRef = useRef<number | null>(null);
    useEffect(() => {
        const req = props.boundaryAlignRequest;
        if (!req || req.token === lastAlignTokenRef.current) return;
        lastAlignTokenRef.current = req.token;
        setDrawingMode('boundary-align');
        setBoundaryAlignMovable({ bfId: req.movableBfId, callId: '__pending__' });
        setBoundaryAlignTarget(null);
        setBoundaryAlignSliding(false);
        boundaryAlignSlideRef.current = null;
    }, [props.boundaryAlignRequest]);

    // ---------------------------------------------------------------------
    // Corner-align tool state (v26.06 — "align deed silhouette to found points")
    //
    // Workflow: arm from the Boundary Editor, then repeatedly
    //   1. click a CORNER of the highlighted deed silhouette (amber/blue dashed
    //      overlay), and
    //   2. click the FOUND POINT that corner should sit on. Shift+click opens a
    //      picker listing every point in the nest under the cursor so stacked
    //      monuments can be disambiguated.
    // Each committed pair re-solves a rigid-body (translate + rotate, no scale)
    // best fit and live-previews it through onUpdateBoundaryTransform.
    // ---------------------------------------------------------------------
    type CornerAlignPair = {
        /** Deed vertex point-number label as it appears in the calls. */
        pn: string;
        /** Un-baked (COGO-local) deed vertex — the fit's source frame. */
        srcE: number;
        srcN: number;
        /** Found survey point the corner is being pinned to. */
        targetPn: string;
        targetE: number;
        targetN: number;
    };
    const [cornerAlignBfId, setCornerAlignBfId] = useState<string | null>(null);
    const [cornerAlignPairs, setCornerAlignPairs] = useState<CornerAlignPair[]>([]);
    /** Corner picked but not yet paired to a found point. */
    const [cornerAlignPendingCorner, setCornerAlignPendingCorner] = useState<{ pn: string; srcE: number; srcN: number; x: number; y: number } | null>(null);
    /** Shift+click nest picker: candidate points under the cursor awaiting a choice. */
    const [cornerAlignPicker, setCornerAlignPicker] = useState<{ x: number; y: number; items: SurveyPoint[] } | null>(null);
    /** Residual summary of the most recent fit, shown in the banner. */
    const [cornerAlignFit, setCornerAlignFit] = useState<{ rmse: number; maxResidual: number; rotDeg: number } | null>(null);
    /** Corner under the cursor while waiting for a corner pick (hover affordance). */
    const [cornerAlignHover, setCornerAlignHover] = useState<{ pn: string; x: number; y: number } | null>(null);
    /** Transform the bf had when the tool was armed, restored on Cancel. */
    const cornerAlignBaseTxRef = useRef<{ translationE: number; translationN: number; rotationDeg: number } | null>(null);

    const lastCornerAlignTokenRef = useRef<number | null>(null);
    useEffect(() => {
        const req = props.boundaryCornerAlignRequest;
        if (!req || req.token === lastCornerAlignTokenRef.current) return;
        lastCornerAlignTokenRef.current = req.token;
        const bf = boundaryFiles?.find(b => b.id === req.movableBfId);
        cornerAlignBaseTxRef.current = {
            translationE: bf?.translationE ?? 0,
            translationN: bf?.translationN ?? 0,
            rotationDeg: bf?.rotationDeg ?? 0,
        };
        setDrawingMode('boundary-corner-align');
        setCornerAlignBfId(req.movableBfId);
        setCornerAlignPairs([]);
        setCornerAlignPendingCorner(null);
        setCornerAlignPicker(null);
        setCornerAlignFit(null);
        setCornerAlignHover(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.boundaryCornerAlignRequest]);

    // Boundary-line drawing state
    const [boundaryLineFrom, setBoundaryLineFrom] = useState<SurveyPoint | null>(null);
    // boundaryLineTo: null = waiting for 2nd click, 'snapped' or coords once filled by 2nd click
    const [boundaryClickedTo, setBoundaryClickedTo] = useState<{easting: number; northing: number} | null>(null);
    const [boundaryBearing, setBoundaryBearing] = useState('');
    const [boundaryDistance, setBoundaryDistance] = useState('');
    const [boundaryInputError, setBoundaryInputError] = useState('');
    const boundaryBearingRef = useRef<HTMLInputElement>(null);
    // Curve mode state
    const [boundaryCurveMode, setBoundaryCurveMode] = useState(false);
    const [boundaryCurveRadius, setBoundaryCurveRadius] = useState('');
    const [boundaryCurveArcLength, setBoundaryCurveArcLength] = useState('');
    const [boundaryCurveDirection, setBoundaryCurveDirection] = useState<'left' | 'right'>('right');
    const [boundaryCurveChordBearing, setBoundaryCurveChordBearing] = useState('');
    // Accumulated drawn calls for closure report
    const [drawnBoundaryCalls, setDrawnBoundaryCalls] = useState<Array<{ from: string; to: string; bearing: string; distance: string; isCurve?: boolean; curveRadius?: number; arcLength?: number; curveDirection?: 'left' | 'right'; tangentBearing?: string; chordBearing?: string }>>([]);
    const [boundaryClosureResult, setBoundaryClosureResult] = useState<{ precision: string; area: number; misclosureDistance: number; misclosureBearing: string } | null>(null);
    const [boundaryClosureError, setBoundaryClosureError] = useState('');
    // Annotation mode: controls what is shown on line labels and boundary overlay labels.
    // Lifted to App.tsx (see props) so the toggle button can live in the app header.

    const [isLabelDragging, setIsLabelDragging] = useState(false);
    const labelDragTarget = useRef<{pointNumber: string, startX: number, startY: number, startOffsetX: number, startOffsetY: number} | null>(null);
    const lineLabelDragTarget = useRef<{lineId: string, startX: number, startY: number, startOffsetX: number, startOffsetY: number} | null>(null);
    // Per-point annotation leader drag (Ctrl+drag on the note). Offsets are stored
    // in world units as { dx, dy } where dx<0 means the note is mirrored left.
    const annotationDragTarget = useRef<{pointNumber: string, startX: number, startY: number, startDx: number, startDy: number} | null>(null);
    // Screen-space hit boxes for annotation notes, refreshed every draw frame.
    // Used by Ctrl+click (drag) and Shift+click (mirror) hit-testing.
    const annotationHitBoxesRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());
    // World-space hit boxes for curve annotation labels (R / L / Δ stack),
    // refreshed every draw frame. Used by Ctrl+drag to reposition the curve
    // label — mirrors the labelOffset flow already used by straight-line B+D.
    const curveLabelBoxesRef = useRef<Map<string, { wx: number; wy: number; ww: number; wh: number }>>(new Map());
    const deedMetadataDragTarget = useRef<{startX: number, startY: number, startOffsetX: number, startOffsetY: number} | null>(null);
    const ownerNameDragTarget = useRef<{startX: number, startY: number, startOffsetX: number, startOffsetY: number} | null>(null);
    
    const [isDrawingToolsMenuOpen, setIsDrawingToolsMenuOpen] = useState(false);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isBoxSelectMode, setIsBoxSelectMode] = useState(false);
    
    // Toolbar dragging state - two separate toolbars
    const [viewToolbarPosition, setViewToolbarPosition] = useState({ x: 16, y: 16 }); // view/navigation tools at top
    const [editToolbarPosition, setEditToolbarPosition] = useState({ x: 16, y: window.innerHeight - 130 }); // drawing/editing tools at bottom with proper spacing
    const [isViewToolbarDragging, setIsViewToolbarDragging] = useState(false);
    const [isEditToolbarDragging, setIsEditToolbarDragging] = useState(false);
    const viewToolbarDragStart = useRef<{ x: number; y: number; toolbarX: number; toolbarY: number } | null>(null);
    const editToolbarDragStart = useRef<{ x: number; y: number; toolbarX: number; toolbarY: number } | null>(null);
    
    // Helper to determine flyout direction based on toolbar position
    const getFlyoutDirection = useCallback((toolbarX: number, toolbarY: number) => {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Determine if closer to top or bottom
        const isCloserToTop = toolbarY < screenHeight / 2;
        // Determine if closer to left or right
        const isCloserToLeft = toolbarX < screenWidth / 2;
        
        return {
            vertical: isCloserToTop ? 'below' : 'above',
            horizontal: isCloserToLeft ? 'right' : 'left'
        };
    }, []);

    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const [isAltPressed, setIsAltPressed] = useState(false);
    const [isOrthoEnabled, setIsOrthoEnabled] = useState(false);
    const [isOverLabel, setIsOverLabel] = useState(false);
    // Line selection mode (active when drawing tools menu open, no sub-tool)
    const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
    const [isOverLine, setIsOverLine] = useState(false);
    const [shiftBoxSelect, setShiftBoxSelect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
    const [hoveredGrip, setHoveredGrip] = useState<EntityGrip | null>(null);
    const [activeGrip, setActiveGrip] = useState<EntityGrip | null>(null);
    const activeGripDragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
    // Line query panel drag state
    const [lineQueryPanelPos, setLineQueryPanelPos] = useState<{ x: number; y: number } | null>(null);
    const lineQueryDragState = useRef<{ dragging: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({ dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
    
    // Use ref for cursor position to avoid re-creating draw callback on every mouse move
    const cursorWorldPosRef = useRef<{ x: number, y: number } | null>(null);
    const drawRef = useRef<(() => void) | null>(null);
    // Track pending animation frame to prevent multiple queued draws
    const animationFrameRef = useRef<number | null>(null);
    
    const [wmsImages, setWmsImages] = useState<{ image: HTMLImageElement; bbox: [number, number, number, number]; opacity: number }[]>([]);
    const [offlineImages, setOfflineImages] = useState<Map<string, HTMLImageElement>>(new Map());
    const [googleOverlayImage, setGoogleOverlayImage] = useState<{
        image: HTMLImageElement;
        bbox: [number, number, number, number];
        opacity: number;
        source: 'user-maps' | 'user-gemini' | 'proxy' | 'naip-proxy';
        mapType: NonNullable<StaticMapRequest['maptype']>;
    } | null>(null);
    const [googleOverlayDiagnostic, setGoogleOverlayDiagnostic] = useState<{ tone: 'info' | 'error'; message: string } | null>(null);
    const googleOverlaySeqRef = useRef(0);
    const lastOverlayDiagnosticNotificationRef = useRef<string | null>(null);

    useEffect(() => {
        if (!settings.googleMaps?.enabled || !googleOverlayDiagnostic) {
            lastOverlayDiagnosticNotificationRef.current = null;
            return;
        }
        const key = `${googleOverlayDiagnostic.tone}:${googleOverlayDiagnostic.message}`;
        if (lastOverlayDiagnosticNotificationRef.current === key) return;
        lastOverlayDiagnosticNotificationRef.current = key;
        addNotification({
            kind: 'map-imagery-overlay',
            severity: googleOverlayDiagnostic.tone === 'error' ? 'error' : 'warning',
            title: 'Map Imagery Overlay',
            message: googleOverlayDiagnostic.message,
        });
    }, [settings.googleMaps?.enabled, googleOverlayDiagnostic, addNotification]);

    useEffect(() => {
        try {
            localStorage.setItem(RUNNING_OSNAP_STORAGE_KEY, JSON.stringify([...runningOsnaps]));
        } catch {
            // Ignore localStorage failures (private mode / quota).
        }
    }, [runningOsnaps]);

    const toggleRunningOsnap = useCallback((mode: OsnapMode) => {
        setRunningOsnaps(prev => {
            const next = new Set(prev);
            if (next.has(mode)) next.delete(mode);
            else next.add(mode);
            return next;
        });
    }, []);

    const runningOsnapLabel = useMemo(() => {
        const active = OSNAP_ORDER.filter(mode => runningOsnaps.has(mode));
        return active.length > 0 ? active.map(mode => OSNAP_LABELS[mode]).join(', ') : 'None';
    }, [runningOsnaps]);


    const pointMap = useMemo(() => new Map(points.map(p => [p.pointNumber, p])), [points]);

    const findNearestSurveyPoint = useCallback((screenX: number, screenY: number, thresholdPx: number): SurveyPoint | null => {
        let nearestPoint: SurveyPoint | null = null;
        let minDistSq = thresholdPx * thresholdPx;
        for (const p of points) {
            if (p.hidden) continue;
            const ptScreen = worldToScreen(p.easting, p.northing);
            const dSq = (screenX - ptScreen.x) ** 2 + (screenY - ptScreen.y) ** 2;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                nearestPoint = p;
            }
        }
        return nearestPoint;
    }, [points, worldToScreen]);

    const makeTempSnapPoint = useCallback((snap: OsnapResult): SurveyPoint => ({
        pointNumber: `SNAP_${snap.mode}_${Date.now()}_${Math.round(snap.easting * 1000)}_${Math.round(snap.northing * 1000)}`,
        easting: snap.easting,
        northing: snap.northing,
        hidden: true,
    }), []);

    const makeTempWorldPoint = useCallback((easting: number, northing: number): SurveyPoint => ({
        pointNumber: `FREE_${Date.now()}_${Math.round(easting * 1000)}_${Math.round(northing * 1000)}`,
        easting,
        northing,
        hidden: true,
    }), []);

    const applyOrthoConstraint = useCallback((
        anchor: { easting: number; northing: number },
        target: { easting: number; northing: number }
    ) => {
        const dx = target.easting - anchor.easting;
        const dy = target.northing - anchor.northing;
        const isDraftingMode = (orientationTuple?.mode ?? 'drafting') === 'drafting';
        const theta = isDraftingMode
            ? (orientationTuple?.draftingAngle ?? orientationTuple?.angle ?? 0)
            : (orientationTuple?.viewAngle ?? orientationTuple?.angle ?? 0);

        if (theta !== 0) {
            // Rotate (dx, dy) into OT reference frame
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            const rx = dx * cos + dy * sin;
            const ry = -dx * sin + dy * cos;

            // Snap to nearest 90-degree axis in OT frame
            let projX = 0;
            let projY = 0;
            if (Math.abs(rx) >= Math.abs(ry)) {
                projX = rx;
                projY = 0;
            } else {
                projX = 0;
                projY = ry;
            }

            // Rotate back from OT frame to world frame
            const resDx = projX * cos - projY * sin;
            const resDy = projX * sin + projY * cos;
            return {
                easting: anchor.easting + resDx,
                northing: anchor.northing + resDy,
            };
        }

        if (Math.abs(dx) >= Math.abs(dy)) {
            return { easting: target.easting, northing: anchor.northing };
        }
        return { easting: anchor.easting, northing: target.northing };
    }, [orientationTuple]);

    const isLinearDrawingMode = useCallback((mode: typeof drawingMode) => (
        mode === 'polylines' || mode === 'breaklines' || mode === 'inclusion' || mode === 'exclusion'
    ), []);

    const buildLineEndpoint = useCallback((point: SurveyPoint) => {
        const committedPoint = !point.hidden ? pointMap.get(point.pointNumber) : null;
        if (committedPoint) {
            return { ref: committedPoint.pointNumber, coords: undefined as { x: number; y: number; z: number } | undefined };
        }
        return {
            ref: point.pointNumber,
            coords: { x: point.easting, y: point.northing, z: 0 },
        };
    }, [pointMap]);

    const addCircleGeometry = useCallback((center: { easting: number; northing: number }, radius: number) => {
        if (!radius || radius <= 1e-6) return;
        const pCenter = makeTempWorldPoint(center.easting, center.northing);
        const pCenterLine = buildLineEndpoint(pCenter);
        const circumference = 2 * Math.PI * radius;

        // Single circle entity
        onAddLine({
            from: pCenterLine.ref,
            to: pCenterLine.ref,
            type: undefined,
            layer: activeDrawingLayer || undefined,
            fromPt: { x: center.easting, y: center.northing, z: 0 },
            toPt: { x: center.easting, y: center.northing, z: 0 },
            circleCenter: { x: center.easting, y: center.northing, z: 0 },
            isCurve: true,
            isCircle: true,
            curveRadius: radius,
            arcLength: circumference,
        });

        requestAnimationFrame(() => {
            drawRef.current?.();
        });
    }, [makeTempWorldPoint, buildLineEndpoint, onAddLine, activeDrawingLayer]);

    const resolveOsnapAtScreen = useCallback((
        screenX: number,
        screenY: number,
        modes: Set<OsnapMode>,
        thresholdPx: number,
        anchorPoint?: { easting: number; northing: number } | null,
    ): OsnapResult | null => {
        if (modes.size === 0) return null;

        let best: OsnapResult | null = null;
        let bestDistSq = thresholdPx * thresholdPx;
        const nearSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

        const tryCandidate = (mode: OsnapMode, easting: number, northing: number, sourcePoint?: SurveyPoint) => {
            const ptScreen = worldToScreen(easting, northing);
            const dSq = (screenX - ptScreen.x) ** 2 + (screenY - ptScreen.y) ** 2;
            if (dSq <= bestDistSq) {
                bestDistSq = dSq;
                best = { easting, northing, mode, sourcePoint };
            }
        };

        if (modes.has('endpoint')) {
            for (const p of points) {
                if (p.hidden) continue;
                tryCandidate('endpoint', p.easting, p.northing, p);
            }
        }

        const mouseWorld = screenToWorld(screenX, screenY);
        const worldMouseE = mouseWorld.easting;
        const worldMouseN = mouseWorld.northing;
        const gatherIntersections = modes.has('intersection');

        for (const line of lines) {
            if (line.hidden) continue;
            const from = pointMap.get(line.from);
            const to = pointMap.get(line.to);
            const x1 = from ? from.easting : line.fromPt?.x;
            const y1 = from ? from.northing : line.fromPt?.y;
            const x2 = to ? to.easting : line.toPt?.x;
            const y2 = to ? to.northing : line.toPt?.y;

            // Handle Full Circles
            const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (x1 === x2 && y1 === y2)) && !line.tangentBearing && !line.chordBearing);
            if (isCircleEntity && line.curveRadius) {
                const cX = line.circleCenter ? line.circleCenter.x : (x1 ?? 0);
                const cY = line.circleCenter ? line.circleCenter.y : (y1 ?? 0);
                const radius = line.curveRadius;

                if (modes.has('center')) {
                    tryCandidate('center', cX, cY);
                }

                if (modes.has('nearest')) {
                    const dE = worldMouseE - cX;
                    const dN = worldMouseN - cY;
                    const dist = Math.hypot(dE, dN);
                    if (dist > 1e-9) {
                        const nearE = cX + radius * (dE / dist);
                        const nearN = cY + radius * (dN / dist);
                        tryCandidate('nearest', nearE, nearN);
                    }
                }

                if (modes.has('endpoint') || modes.has('midpoint')) {
                    // Circle quadrants (0°, 90°, 180°, 270°)
                    tryCandidate('endpoint', cX + radius, cY);
                    tryCandidate('endpoint', cX - radius, cY);
                    tryCandidate('endpoint', cX, cY + radius);
                    tryCandidate('endpoint', cX, cY - radius);
                }

                if (modes.has('perpendicular') && anchorPoint) {
                    const adE = anchorPoint.easting - cX;
                    const adN = anchorPoint.northing - cY;
                    const adist = Math.hypot(adE, adN);
                    if (adist > 1e-9) {
                        tryCandidate('perpendicular', cX + radius * (adE / adist), cY + radius * (adN / adist));
                        tryCandidate('perpendicular', cX - radius * (adE / adist), cY - radius * (adN / adist));
                    }
                }

                if (modes.has('tangent')) {
                    const refPt = anchorPoint || { easting: worldMouseE, northing: worldMouseN };
                    const adE = refPt.easting - cX;
                    const adN = refPt.northing - cY;
                    const distToCenter = Math.hypot(adE, adN);
                    if (distToCenter >= radius - 1e-9) {
                        const alpha = Math.atan2(adN, adE);
                        const gamma = Math.acos(Math.min(1, Math.max(-1, radius / Math.max(radius, distToCenter))));
                        const ang1 = alpha - gamma;
                        const ang2 = alpha + gamma;
                        tryCandidate('tangent', cX + radius * Math.cos(ang1), cY + radius * Math.sin(ang1));
                        tryCandidate('tangent', cX + radius * Math.cos(ang2), cY + radius * Math.sin(ang2));
                    }
                }
                continue;
            }

            if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;

            // Handle Arcs / Curves
            if (line.isCurve && line.curveRadius && line.arcLength) {
                const radius = line.curveRadius;
                const centralAngle = line.arcLength / radius;
                const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };

                let isLeftCurve = line.curveDirection === 'left';
                if (line.curveDirection !== 'left' && line.curveDirection !== 'right') {
                    const tempTangent = line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null;
                    if (tempTangent !== null) {
                        const dirBearingStr = line.chordBearing || line.bearing;
                        if (dirBearingStr) {
                            const dirRad = parseBearingToRadians(dirBearingStr);
                            if (dirRad !== null) {
                                const halfDelta = centralAngle / 2;
                                const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                                const expectedLeftChord  = normalizeAng(tempTangent - halfDelta);
                                const dirNorm = normalizeAng(dirRad);
                                const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                                const diffLeft  = Math.min(Math.abs(dirNorm - expectedLeftChord),  2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                                if (diffLeft < diffRight) isLeftCurve = true;
                            }
                        }
                    }
                }

                let chordRadArc: number | null = null;
                const chordStr = line.chordBearing || line.bearing;
                if (chordStr) {
                    chordRadArc = parseBearingToRadians(chordStr);
                } else {
                    const dE = x2 - x1;
                    const dN = y2 - y1;
                    if (Math.hypot(dE, dN) > 1e-9) {
                        let az = Math.atan2(dE, dN);
                        if (az < 0) az += 2 * Math.PI;
                        chordRadArc = az;
                    }
                }

                const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                const tangentAngle: number | null = chordRadArc !== null
                    ? chordRadArc - signedDeltaArc / 2
                    : (line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null);

                if (tangentAngle !== null) {
                    const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                    const centerOffsetAngle = isLeftCurve
                        ? canvasTangentAngle + Math.PI / 2
                        : canvasTangentAngle - Math.PI / 2;
                    const cX = x1 + radius * Math.cos(centerOffsetAngle);
                    const cY = y1 + radius * Math.sin(centerOffsetAngle);

                    if (modes.has('center')) {
                        tryCandidate('center', cX, cY);
                    }

                    if (modes.has('endpoint')) {
                        tryCandidate('endpoint', x1, y1, from && !from.hidden ? from : undefined);
                        tryCandidate('endpoint', x2, y2, to && !to.hidden ? to : undefined);
                    }

                    const startAngle = Math.atan2(y1 - cY, x1 - cX);
                    const midAngle = isLeftCurve ? startAngle + centralAngle / 2 : startAngle - centralAngle / 2;

                    if (modes.has('midpoint')) {
                        const midE = cX + radius * Math.cos(midAngle);
                        const midN = cY + radius * Math.sin(midAngle);
                        tryCandidate('midpoint', midE, midN);
                    }

                    if (modes.has('nearest')) {
                        const mouseAngle = Math.atan2(worldMouseN - cY, worldMouseE - cX);
                        let inArc = false;
                        if (isLeftCurve) {
                            let sweep = (mouseAngle - startAngle) % (2 * Math.PI);
                            if (sweep < 0) sweep += 2 * Math.PI;
                            if (sweep <= centralAngle) inArc = true;
                        } else {
                            let sweep = (startAngle - mouseAngle) % (2 * Math.PI);
                            if (sweep < 0) sweep += 2 * Math.PI;
                            if (sweep <= centralAngle) inArc = true;
                        }

                        if (inArc) {
                            const nearE = cX + radius * Math.cos(mouseAngle);
                            const nearN = cY + radius * Math.sin(mouseAngle);
                            tryCandidate('nearest', nearE, nearN);
                        } else {
                            const d1Sq = (worldMouseE - x1) ** 2 + (worldMouseN - y1) ** 2;
                            const d2Sq = (worldMouseE - x2) ** 2 + (worldMouseN - y2) ** 2;
                            if (d1Sq < d2Sq) {
                                tryCandidate('nearest', x1, y1);
                            } else {
                                tryCandidate('nearest', x2, y2);
                            }
                        }
                    }

                    if (modes.has('perpendicular') && anchorPoint) {
                        const adE = anchorPoint.easting - cX;
                        const adN = anchorPoint.northing - cY;
                        const adist = Math.hypot(adE, adN);
                        if (adist > 1e-9) {
                            const pAng1 = Math.atan2(adN, adE);
                            const pAng2 = pAng1 + Math.PI;
                            for (const ang of [pAng1, pAng2]) {
                                let inArc = false;
                                if (isLeftCurve) {
                                    let sweep = (ang - startAngle) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle) inArc = true;
                                } else {
                                    let sweep = (startAngle - ang) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle) inArc = true;
                                }
                                if (inArc) {
                                    tryCandidate('perpendicular', cX + radius * Math.cos(ang), cY + radius * Math.sin(ang));
                                }
                            }
                        }
                    }

                    if (modes.has('tangent')) {
                        const refPt = anchorPoint || { easting: worldMouseE, northing: worldMouseN };
                        const adE = refPt.easting - cX;
                        const adN = refPt.northing - cY;
                        const distToCenter = Math.hypot(adE, adN);
                        if (distToCenter >= radius - 1e-9) {
                            const alpha = Math.atan2(adN, adE);
                            const gamma = Math.acos(Math.min(1, Math.max(-1, radius / Math.max(radius, distToCenter))));
                            const ang1 = alpha - gamma;
                            const ang2 = alpha + gamma;
                            for (const ang of [ang1, ang2]) {
                                let inArc = false;
                                if (isLeftCurve) {
                                    let sweep = (ang - startAngle) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle + 1e-5) inArc = true;
                                } else {
                                    let sweep = (startAngle - ang) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle + 1e-5) inArc = true;
                                }
                                if (inArc) {
                                    tryCandidate('tangent', cX + radius * Math.cos(ang), cY + radius * Math.sin(ang));
                                }
                            }
                        }
                    }
                }
                continue;
            }

            const dx = x2 - x1;
            const dy = y2 - y1;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-12) continue;

            if (modes.has('endpoint')) {
                tryCandidate('endpoint', x1, y1, from && !from.hidden ? from : undefined);
                tryCandidate('endpoint', x2, y2, to && !to.hidden ? to : undefined);
            }

            if (modes.has('midpoint')) {
                tryCandidate('midpoint', (x1 + x2) / 2, (y1 + y2) / 2);
            }

            if (modes.has('nearest')) {
                let t = ((worldMouseE - x1) * dx + (worldMouseN - y1) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                tryCandidate('nearest', x1 + dx * t, y1 + dy * t);
            }

            if (modes.has('perpendicular') && anchorPoint) {
                let tPerp = ((anchorPoint.easting - x1) * dx + (anchorPoint.northing - y1) * dy) / lenSq;
                tPerp = Math.max(0, Math.min(1, tPerp));
                tryCandidate('perpendicular', x1 + dx * tPerp, y1 + dy * tPerp);
            }

            if (gatherIntersections) {
                let tMouse = ((worldMouseE - x1) * dx + (worldMouseN - y1) * dy) / lenSq;
                tMouse = Math.max(0, Math.min(1, tMouse));
                const cx = x1 + dx * tMouse;
                const cy = y1 + dy * tMouse;
                const worldDist = Math.hypot(worldMouseE - cx, worldMouseN - cy);
                if (worldDist <= (thresholdPx * 3) / transform.scale) {
                    nearSegments.push({ x1, y1, x2, y2 });
                }
            }
        }

        if (gatherIntersections && nearSegments.length > 1) {
            for (let i = 0; i < nearSegments.length; i++) {
                const a = nearSegments[i];
                const ax = a.x2 - a.x1;
                const ay = a.y2 - a.y1;
                for (let j = i + 1; j < nearSegments.length; j++) {
                    const b = nearSegments[j];
                    const bx = b.x2 - b.x1;
                    const by = b.y2 - b.y1;
                    const denom = ax * by - ay * bx;
                    if (Math.abs(denom) < 1e-12) continue;

                    const rx = b.x1 - a.x1;
                    const ry = b.y1 - a.y1;
                    const ta = (rx * by - ry * bx) / denom;
                    const tb = (rx * ay - ry * ax) / denom;
                    if (ta < 0 || ta > 1 || tb < 0 || tb > 1) continue;

                    tryCandidate('intersection', a.x1 + ta * ax, a.y1 + ta * ay);
                }
            }
        }

        if (boundaryFiles && boundaryFiles.length > 0) {
            for (const bf of boundaryFiles) {
                if (bf.hidden) continue;
                for (const call of bf.calls) {
                    const from = pointMap.get(call.from);
                    const to = pointMap.get(call.to);
                    if (!from || !to) continue;
                    const x1 = from.easting;
                    const y1 = from.northing;
                    const x2 = to.easting;
                    const y2 = to.northing;

                    if (call.isCurve && call.curveRadius && call.arcLength) {
                        const radius = call.curveRadius;
                        const centralAngle = call.arcLength / radius;
                        const isLeftCurve = call.curveDirection === 'left';
                        let chordRadArc: number | null = null;
                        const chordStr = call.chordBearing || call.bearing;
                        if (chordStr) {
                            chordRadArc = parseBearingToRadians(chordStr);
                        } else {
                            const dE = x2 - x1;
                            const dN = y2 - y1;
                            if (Math.hypot(dE, dN) > 1e-9) {
                                let az = Math.atan2(dE, dN);
                                if (az < 0) az += 2 * Math.PI;
                                chordRadArc = az;
                            }
                        }

                        const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                        const tangentAngle: number | null = chordRadArc !== null
                            ? chordRadArc - signedDeltaArc / 2
                            : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);

                        if (tangentAngle !== null) {
                            const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                            const centerOffsetAngle = isLeftCurve
                                ? canvasTangentAngle + Math.PI / 2
                                : canvasTangentAngle - Math.PI / 2;
                            const cX = x1 + radius * Math.cos(centerOffsetAngle);
                            const cY = y1 + radius * Math.sin(centerOffsetAngle);

                            if (modes.has('center')) {
                                tryCandidate('center', cX, cY);
                            }
                            if (modes.has('endpoint')) {
                                tryCandidate('endpoint', x1, y1, from);
                                tryCandidate('endpoint', x2, y2, to);
                            }
                            const startAngle = Math.atan2(y1 - cY, x1 - cX);
                            if (modes.has('midpoint')) {
                                const midAngle = isLeftCurve ? startAngle + centralAngle / 2 : startAngle - centralAngle / 2;
                                tryCandidate('midpoint', cX + radius * Math.cos(midAngle), cY + radius * Math.sin(midAngle));
                            }
                            if (modes.has('nearest')) {
                                const mouseAngle = Math.atan2(worldMouseN - cY, worldMouseE - cX);
                                let inArc = false;
                                if (isLeftCurve) {
                                    let sweep = (mouseAngle - startAngle) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle) inArc = true;
                                } else {
                                    let sweep = (startAngle - mouseAngle) % (2 * Math.PI);
                                    if (sweep < 0) sweep += 2 * Math.PI;
                                    if (sweep <= centralAngle) inArc = true;
                                }
                                if (inArc) {
                                    tryCandidate('nearest', cX + radius * Math.cos(mouseAngle), cY + radius * Math.sin(mouseAngle));
                                } else {
                                    const d1Sq = (worldMouseE - x1) ** 2 + (worldMouseN - y1) ** 2;
                                    const d2Sq = (worldMouseE - x2) ** 2 + (worldMouseN - y2) ** 2;
                                    tryCandidate('nearest', d1Sq < d2Sq ? x1 : x2, d1Sq < d2Sq ? y1 : y2);
                                }
                            }
                            if (modes.has('perpendicular') && anchorPoint) {
                                const adE = anchorPoint.easting - cX;
                                const adN = anchorPoint.northing - cY;
                                const adist = Math.hypot(adE, adN);
                                if (adist > 1e-9) {
                                    const pAng1 = Math.atan2(adN, adE);
                                    const pAng2 = pAng1 + Math.PI;
                                    for (const ang of [pAng1, pAng2]) {
                                        let inArc = false;
                                        if (isLeftCurve) {
                                            let sweep = (ang - startAngle) % (2 * Math.PI);
                                            if (sweep < 0) sweep += 2 * Math.PI;
                                            if (sweep <= centralAngle) inArc = true;
                                        } else {
                                            let sweep = (startAngle - ang) % (2 * Math.PI);
                                            if (sweep < 0) sweep += 2 * Math.PI;
                                            if (sweep <= centralAngle) inArc = true;
                                        }
                                        if (inArc) {
                                            tryCandidate('perpendicular', cX + radius * Math.cos(ang), cY + radius * Math.sin(ang));
                                        }
                                    }
                                }
                            }
                            if (modes.has('tangent')) {
                                const refPt = anchorPoint || { easting: worldMouseE, northing: worldMouseN };
                                const adE = refPt.easting - cX;
                                const adN = refPt.northing - cY;
                                const distToCenter = Math.hypot(adE, adN);
                                if (distToCenter >= radius - 1e-9) {
                                    const alpha = Math.atan2(adN, adE);
                                    const gamma = Math.acos(Math.min(1, Math.max(-1, radius / Math.max(radius, distToCenter))));
                                    const ang1 = alpha - gamma;
                                    const ang2 = alpha + gamma;
                                    for (const ang of [ang1, ang2]) {
                                        let inArc = false;
                                        if (isLeftCurve) {
                                            let sweep = (ang - startAngle) % (2 * Math.PI);
                                            if (sweep < 0) sweep += 2 * Math.PI;
                                            if (sweep <= centralAngle + 1e-5) inArc = true;
                                        } else {
                                            let sweep = (startAngle - ang) % (2 * Math.PI);
                                            if (sweep < 0) sweep += 2 * Math.PI;
                                            if (sweep <= centralAngle + 1e-5) inArc = true;
                                        }
                                        if (inArc) {
                                            tryCandidate('tangent', cX + radius * Math.cos(ang), cY + radius * Math.sin(ang));
                                        }
                                    }
                                }
                            }
                        }
                        continue;
                    }

                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq < 1e-12) continue;

                    if (modes.has('endpoint')) {
                        tryCandidate('endpoint', x1, y1, from);
                        tryCandidate('endpoint', x2, y2, to);
                    }
                    if (modes.has('midpoint')) {
                        tryCandidate('midpoint', (x1 + x2) / 2, (y1 + y2) / 2);
                    }
                    if (modes.has('nearest')) {
                        let t = ((worldMouseE - x1) * dx + (worldMouseN - y1) * dy) / lenSq;
                        t = Math.max(0, Math.min(1, t));
                        tryCandidate('nearest', x1 + dx * t, y1 + dy * t);
                    }
                }
            }
        }

        return best;
    }, [lines, pointMap, points, transform, worldToScreen, screenToWorld, boundaryFiles]);

    const symbolMatchers = useMemo(() => buildSymbolMatchers(customSymbols), [customSymbols]);

    // CAD Manager standards: when a point's field code (or a surveyor alias
    // pattern such as "CM*") resolves to a master code whose Symbol column
    // holds a real SymbolDefinition, render that SVG. Wrapped in a synthetic
    // CustomSymbol so the existing draw pipeline can use it unchanged.
    const cadManager = useCadManager();
    const cadStandard = cadManager.state.standard;
    const cadSymbolCache = useRef(new Map<string, CustomSymbol | null>());
    useEffect(() => { cadSymbolCache.current.clear(); }, [cadStandard]);
    // Toolbar-launched CAD Standards spreadsheet editor (full-screen modal).
    const [isCadStandardsEditorOpen, setIsCadStandardsEditorOpen] = useState(false);
    // Per-description symbol exclusion: when the user clicks a point in this
    // mode, the point's description (normalized) is added/removed from the set.
    // All points sharing that description have their symbol suppressed, so
    // disassociating one disassociates the entire group. Persisted to
    // localStorage so exclusions survive loading a new point set.
    const SYMBOL_EXCLUSION_STORAGE_KEY = 'landsurv.excludedSymbolDescriptions.v1';
    const [symbolExclusionMode, setSymbolExclusionMode] = useState(false);
    const [excludedSymbolDescriptions, setExcludedSymbolDescriptions] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(SYMBOL_EXCLUSION_STORAGE_KEY);
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? new Set(arr.filter((s): s is string => typeof s === 'string')) : new Set();
        } catch {
            return new Set();
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(SYMBOL_EXCLUSION_STORAGE_KEY, JSON.stringify([...excludedSymbolDescriptions]));
        } catch { /* quota / privacy mode — ignore */ }
    }, [excludedSymbolDescriptions]);
    // Hover tooltip shown while in symbol-exclusion mode: explains why the
    // hovered point's description currently resolves to its symbol (or not).
    const [exclusionHover, setExclusionHover] = useState<{
        clientX: number;
        clientY: number;
        description: string;
        symbolName: string | null;
        reason: string;
        excluded: boolean;
    } | null>(null);
    useEffect(() => { if (!symbolExclusionMode) setExclusionHover(null); }, [symbolExclusionMode]);

    const getCadManagerSymbol = useCallback((description: string): CustomSymbol | undefined => {
        if (!description || !cadStandard) return undefined;
        const cached = cadSymbolCache.current.get(description);
        if (cached !== undefined) return cached ?? undefined;

        const res = cadManager.resolveCode(description);
        if (res.source === 'unknown') {
            cadSymbolCache.current.set(description, null);
            return undefined;
        }
        const codeDef = cadStandard.codes.find(c => c.code.toUpperCase() === res.master.toUpperCase());
        const sym = codeDef?.symbol;
        if (!sym || typeof sym !== 'object' || !sym.svgPath) {
            cadSymbolCache.current.set(description, null);
            return undefined;
        }
        const synthetic: CustomSymbol = {
            id: `cad-${res.master}`,
            name: sym.name || res.master,
            description: sym.description || codeDef?.description || '',
            associatedTerms: [],
            svgPath: sym.svgPath,
            fillPath: sym.fillPath,
            viewBox: sym.viewBox || '0 0 24 24',
            scale: 1,
        };
        cadSymbolCache.current.set(description, synthetic);
        return synthetic;
    }, [cadManager, cadStandard]);

    // Built-in survey symbol library (tree, manhole, hydrant, etc.) — final
    // fallback when neither the custom-symbol library nor the CAD Manager
    // standard has an entry for this description. Without this, codes like
    // "TREE 12" rendered as the generic default dot instead of an actual
    // tree glyph. Cached per description since findMatchingSymbol re-scores
    // the whole library on every call.
    const builtinSymbolCache = useRef(new Map<string, CustomSymbol | null>());
    // Gate: a built-in library symbol only renders when the user has opted its
    // id into enabledBuiltinSymbolIds (or '*' for all). Default OFF. This is
    // the deterministic, request-scoped visibility model — e.g. "draw tree
    // symbols" enables just the tree ids; everything else stays the default
    // marker until asked for.
    const isBuiltinSymbolEnabled = useCallback((libId: string): boolean => {
        if (!enabledBuiltinSymbolIds || enabledBuiltinSymbolIds.size === 0) return false;
        return enabledBuiltinSymbolIds.has('*') || enabledBuiltinSymbolIds.has(libId);
    }, [enabledBuiltinSymbolIds]);
    const getBuiltinLibrarySymbol = useCallback((description: string): CustomSymbol | undefined => {
        if (!description) return undefined;
        let synthetic = builtinSymbolCache.current.get(description);
        if (synthetic === undefined) {
            const libMatch = findMatchingSymbol(description, description);
            if (!libMatch) {
                builtinSymbolCache.current.set(description, null);
                return undefined;
            }
            const def = libraryToSymbolDefinition(libMatch, description);
            synthetic = {
                id: `builtin-${libMatch.id}`,
                name: def.name,
                description: def.description || '',
                associatedTerms: [],
                svgPath: def.svgPath!,
                fillPath: def.fillPath,
                viewBox: def.viewBox || '0 0 24 24',
                scale: 1,
            };
            builtinSymbolCache.current.set(description, synthetic);
        }
        if (!synthetic) return undefined;
        // Apply the opt-in gate (kept out of the cache so toggling visibility
        // takes effect without invalidating the match cache).
        const libId = synthetic.id.replace(/^builtin-/, '');
        if (!isBuiltinSymbolEnabled(libId)) return undefined;
        return synthetic;
    }, [isBuiltinSymbolEnabled]);

    const getSymbolForPoint = useCallback((point: SurveyPoint): CustomSymbol | undefined => {
        if (settings.showPointSymbols !== true) return undefined;
        if (point.description && excludedSymbolDescriptions.has(point.description.trim().toUpperCase())) return undefined;
        if (point.description) {
            const res = resolveSymbol(point.description, customSymbols, symbolMatchers);
            if (res.symbol) {
                // Skip hidden symbols — point will fall through to a plain marker.
                if (res.symbol.hidden) return undefined;
                return res.symbol;
            }
            // Fall back to CAD Manager standard's per-code Symbol column,
            // matched via master code + surveyor aliases (wildcards OK).
            const cadSym = getCadManagerSymbol(point.description);
            if (cadSym) return cadSym;
            // Final fallback: the built-in survey symbol library (tree,
            // manhole, hydrant, etc.) matched by code/description keywords.
            const builtinSym = getBuiltinLibrarySymbol(point.description);
            if (builtinSym) return builtinSym;
        }
        return undefined;
    }, [settings.showPointSymbols, symbolMatchers, customSymbols, getCadManagerSymbol, getBuiltinLibrarySymbol, excludedSymbolDescriptions]);

    // Produce a human-readable explanation of *why* a point's description
    // currently maps (or doesn't map) to a symbol. Used by the exclusion-mode
    // hover tooltip so the user can see which rule they're about to disable.
    const explainSymbolAssociation = useCallback((description: string): { symbolName: string | null; reason: string } => {
        const desc = (description || '').trim();
        if (!desc) return { symbolName: null, reason: 'Point has no description.' };
        if (settings.showPointSymbols !== true) {
            return { symbolName: null, reason: 'Point symbols are turned off in Settings — enable Point Symbols to render matching symbols.' };
        }
        const res = resolveSymbol(desc, customSymbols, symbolMatchers);
        if (res.symbol && res.source !== 'none') {
            if (res.source === 'name-exact') {
                return { symbolName: res.symbol.name, reason: `Custom symbol "${res.symbol.name}" — exact name match on "${desc}".` };
            }
            if (res.source === 'fuzzy-term') {
                return { symbolName: res.symbol.name, reason: `Custom symbol "${res.symbol.name}" — matched associated term /${res.matchedTerm}/.` };
            }
            return { symbolName: res.symbol.name, reason: `Custom symbol "${res.symbol.name}" — ${res.source}.` };
        }
        const cad = cadManager.resolveCode(desc);
        if (cad.source !== 'unknown') {
            const sym = cadStandard?.codes.find(c => c.code === cad.master)?.symbol;
            const symName = typeof sym === 'string' ? sym : (sym?.name ?? null);
            const sourceLabel = cad.source === 'alias' ? 'surveyor alias'
                : cad.source === 'standard' ? 'master code match'
                : cad.source;
            return {
                symbolName: symName,
                reason: `CAD Manager → master code "${cad.master}" (${cad.description}) via ${sourceLabel}${cad.confidence != null ? ` · confidence ${Math.round(cad.confidence * 100)}%` : ''}.`,
            };
        }
        const builtinSym = getBuiltinLibrarySymbol(desc);
        if (builtinSym) {
            return { symbolName: builtinSym.name, reason: `Built-in survey symbol library — matched "${builtinSym.name}" from "${desc}".` };
        }
        // A built-in match may exist but be gated off (default). Surface that so
        // the user knows they can enable it (e.g. "draw tree symbols").
        const libMatch = findMatchingSymbol(desc, desc);
        if (libMatch && !isBuiltinSymbolEnabled(libMatch.id)) {
            return {
                symbolName: null,
                reason: `Built-in "${libMatch.name}" symbol is available but turned off — ask to "draw ${libMatch.name.toLowerCase()} symbols" to show it.`,
            };
        }
        return { symbolName: null, reason: 'No symbol rule matches this description — drawing a plain point marker.' };
    }, [settings.showPointSymbols, customSymbols, symbolMatchers, cadManager, cadStandard, getBuiltinLibrarySymbol, isBuiltinSymbolEnabled]);

    const annotationMatchers = useMemo(() => buildAnnotationMatchers(customAnnotations), [customAnnotations]);

    const getAnnotationForPoint = useCallback((point: SurveyPoint): AnnotationRule | null => {
        if (!customAnnotations || customAnnotations.length === 0) return null;
        if (!point.description) return null;
        const res = resolveAnnotation(point.description, customAnnotations, annotationMatchers);
        return res.rule;
    }, [customAnnotations, annotationMatchers]);

    // ── Flood ring chains (memoized — expensive O(n²) only runs when data changes) ──
    const floodRings = useMemo(() => {
        const byPid = new Map<string, Array<{x:number;y:number}>>();
        // Group segments by polylineId
        const groups = new Map<string, Array<{a:{x:number;y:number}; b:{x:number;y:number}}>>();
        for (const line of lines) {
            if (line.type !== 'flood' || line.hidden) continue;
            const pid = line.polylineId ?? `${line.layer ?? 'flood'}_nopid`;
            const a = line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : (() => { const p = pointMap.get(line.from); return p ? { x: p.easting, y: p.northing } : null; })();
            const b = line.toPt ? { x: line.toPt.x, y: line.toPt.y } : (() => { const p = pointMap.get(line.to); return p ? { x: p.easting, y: p.northing } : null; })();
            if (!a || !b) continue;
            if (!groups.has(pid)) groups.set(pid, []);
            groups.get(pid)!.push({ a, b });
        }
        for (const [pid, pool] of groups) {
            if (pool.length < 2) continue;
            const remaining = pool.slice();
            const first = remaining.splice(0, 1)[0];
            const ring: {x:number;y:number}[] = [first.a, first.b];
            const EPS = 0.001;
            let extended = true;
            while (extended && remaining.length > 0) {
                extended = false;
                const tail = ring[ring.length - 1];
                for (let i = 0; i < remaining.length; i++) {
                    const { a, b } = remaining[i];
                    if (Math.abs(a.x - tail.x) < EPS && Math.abs(a.y - tail.y) < EPS) {
                        ring.push(b); remaining.splice(i, 1); extended = true; break;
                    } else if (Math.abs(b.x - tail.x) < EPS && Math.abs(b.y - tail.y) < EPS) {
                        ring.push(a); remaining.splice(i, 1); extended = true; break;
                    }
                }
            }
            if (ring.length >= 3) byPid.set(pid, ring);
        }
        return byPid;
    }, [lines, pointMap]);

    // Helper function to find line near a click point
    const findLineNearClick = useCallback((clickX: number, clickY: number, threshold: number = 10): SurveyLine | null => {
        let nearestLine: SurveyLine | null = null;
        let minDistance = threshold;
        
        lines.forEach(line => {
            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);
            
            const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);
            
            if (!p1Coords) return;

            const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !line.tangentBearing && !line.chordBearing);
            if (isCircleEntity && line.curveRadius) {
                const center = line.circleCenter || (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : p1Coords);
                if (center) {
                    const sCenter = worldToScreen(center.x, center.y);
                    const distFromScreenCenter = Math.hypot(clickX - sCenter.x, clickY - sCenter.y);
                    const screenRadius = line.curveRadius * transform.scale;
                    const distToCircumference = Math.abs(distFromScreenCenter - screenRadius);
                    if (distToCircumference <= minDistance) {
                        minDistance = distToCircumference;
                        nearestLine = line;
                    }
                }
                return;
            }

            if (line.isCurve && line.curveRadius && line.arcLength) {
                // Curve hit testing: compute arc geometry in screen coordinates
                let curveLine = line;
                const radius = curveLine.curveRadius!;
                const arcLength = curveLine.arcLength!;
                const centralAngle = arcLength / radius;

                if (!curveLine.tangentBearing && !curveLine.chordBearing && !curveLine.bearing && p2Coords) {
                    const dE = p2Coords.x - p1Coords.x;
                    const dN = p2Coords.y - p1Coords.y;
                    if (Math.hypot(dE, dN) > 1e-9) {
                        let az = Math.atan2(dE, dN);
                        if (az < 0) az += 2 * Math.PI;
                        curveLine = { ...curveLine, chordBearing: formatBearing(az) };
                    }
                }

                const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
                let isLeftCurve = false;
                if (curveLine.curveDirection === 'left') {
                    isLeftCurve = true;
                } else if (curveLine.curveDirection === 'right') {
                    isLeftCurve = false;
                } else {
                    const tempTangent = curveLine.tangentBearing ? parseBearingToRadians(curveLine.tangentBearing) : null;
                    if (tempTangent !== null) {
                        const dirBearingStr = curveLine.chordBearing || curveLine.bearing;
                        if (dirBearingStr) {
                            const dirRad = parseBearingToRadians(dirBearingStr);
                            if (dirRad !== null) {
                                const halfDelta = centralAngle / 2;
                                const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                                const expectedLeftChord  = normalizeAng(tempTangent - halfDelta);
                                const dirNorm = normalizeAng(dirRad);
                                const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                                const diffLeft  = Math.min(Math.abs(dirNorm - expectedLeftChord),  2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                                if (diffLeft < diffRight) isLeftCurve = true;
                            }
                        }
                    }
                }

                const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                const chordStrArc = curveLine.chordBearing || curveLine.bearing;
                const chordRadArc = chordStrArc ? parseBearingToRadians(chordStrArc) : null;
                const tangentAngle: number | null = chordRadArc !== null
                    ? chordRadArc - signedDeltaArc / 2
                    : (curveLine.tangentBearing ? parseBearingToRadians(curveLine.tangentBearing) : null);

                if (tangentAngle !== null) {
                    const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                    const centerOffsetAngle = isLeftCurve
                        ? canvasTangentAngle + Math.PI / 2
                        : canvasTangentAngle - Math.PI / 2;
                    const centerWorldX = p1Coords.x + radius * Math.cos(centerOffsetAngle);
                    const centerWorldY = p1Coords.y + radius * Math.sin(centerOffsetAngle);

                    const sCenter = worldToScreen(centerWorldX, centerWorldY);
                    const screenCenterX = sCenter.x;
                    const screenCenterY = sCenter.y;
                    const screenRadius = radius * transform.scale;

                    const startAngle = Math.atan2(p1Coords.y - centerWorldY, p1Coords.x - centerWorldX);
                    const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;

                    // Check distance from click to arc center vs screenRadius, and angle checks
                    const dx = clickX - screenCenterX;
                    const dy = clickY - screenCenterY;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

                    if (Math.abs(distFromCenter - screenRadius) <= minDistance) {
                        const clickAngle = Math.atan2(-dy, dx); // Note canvas Y is flipped
                        // Normalize angular check between startAngle and endAngle
                        const normalizeAngleRad = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
                        const sNorm = normalizeAngleRad(startAngle);
                        const eNorm = normalizeAngleRad(endAngle);
                        const cNorm = normalizeAngleRad(clickAngle);

                        const inArc = false;
                        if (!isLeftCurve) {
                            // Clockwise in world (CCW or CW in screen depending on Y flip)
                            // Let's sample points along the arc for robust hit testing
                            const numSamples = Math.max(10, Math.round(arcLength * transform.scale / 5));
                            let minDistToArc = minDistance;
                            for (let i = 0; i <= numSamples; i++) {
                                const frac = i / numSamples;
                                const interpAngle = startAngle + (isLeftCurve ? centralAngle * frac : -centralAngle * frac);
                                const sampleWorldX = centerWorldX + radius * Math.cos(interpAngle);
                                const sampleWorldY = centerWorldY + radius * Math.sin(interpAngle);
                                const sSample = worldToScreen(sampleWorldX, sampleWorldY);
                                const dSample = Math.hypot(clickX - sSample.x, clickY - sSample.y);
                                if (dSample < minDistToArc) {
                                    minDistToArc = dSample;
                                    nearestLine = line;
                                }
                            }
                            if (nearestLine === line) {
                                minDistance = minDistToArc;
                            }
                        } else {
                            const numSamples = Math.max(10, Math.round(arcLength * transform.scale / 5));
                            let minDistToArc = minDistance;
                            for (let i = 0; i <= numSamples; i++) {
                                const frac = i / numSamples;
                                const interpAngle = startAngle + (isLeftCurve ? centralAngle * frac : -centralAngle * frac);
                                const sampleWorldX = centerWorldX + radius * Math.cos(interpAngle);
                                const sampleWorldY = centerWorldY + radius * Math.sin(interpAngle);
                                const sSample = worldToScreen(sampleWorldX, sampleWorldY);
                                const dSample = Math.hypot(clickX - sSample.x, clickY - sSample.y);
                                if (dSample < minDistToArc) {
                                    minDistToArc = dSample;
                                    nearestLine = line;
                                }
                            }
                            if (nearestLine === line) {
                                minDistance = minDistToArc;
                            }
                        }
                    }
                }
            } else if (p2Coords) {
                // Convert to screen coordinates
                const s1 = worldToScreen(p1Coords.x, p1Coords.y);
                const s2 = worldToScreen(p2Coords.x, p2Coords.y);
                const screenX1 = s1.x;
                const screenY1 = s1.y;
                const screenX2 = s2.x;
                const screenY2 = s2.y;
                
                // Calculate distance from point to line segment
                const dx = screenX2 - screenX1;
                const dy = screenY2 - screenY1;
                const lengthSq = dx * dx + dy * dy;
                
                if (lengthSq === 0) return; // Points are the same
                
                let t = ((clickX - screenX1) * dx + (clickY - screenY1) * dy) / lengthSq;
                t = Math.max(0, Math.min(1, t)); // Clamp to line segment
                
                const projX = screenX1 + t * dx;
                const projY = screenY1 + t * dy;
                
                const distance = Math.sqrt((clickX - projX) ** 2 + (clickY - projY) ** 2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestLine = line;
                }
            }
        });
        
        return nearestLine;
    }, [lines, pointMap, transform, worldToScreen]);

    const resolveTtrEntityFromLine = useCallback((line: SurveyLine, clickWorld: { easting: number; northing: number }): TtrEntity | null => {
        const p1 = pointMap.get(line.from);
        const p2 = pointMap.get(line.to);
        const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
        const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);
        if (!p1Coords) return null;

        const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !line.tangentBearing && !line.chordBearing);
        if (isCircleEntity && line.curveRadius) {
            const center = line.circleCenter || (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : p1Coords);
            if (!center) return null;
            const dE = clickWorld.easting - center.x;
            const dN = clickWorld.northing - center.y;
            const d = Math.hypot(dE, dN);
            const pickPoint = d > 1e-9 ? { x: center.x + line.curveRadius * (dE / d), y: center.y + line.curveRadius * (dN / d) } : { x: center.x + line.curveRadius, y: center.y };
            return {
                kind: 'circle',
                line,
                center: { x: center.x, y: center.y },
                radius: line.curveRadius,
                pickPoint,
            };
        }

        if (line.isCurve && line.curveRadius && line.arcLength) {
            const radius = line.curveRadius;
            const centralAngle = line.arcLength / radius;
            const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };

            let isLeftCurve = line.curveDirection === 'left';
            if (line.curveDirection !== 'left' && line.curveDirection !== 'right') {
                const tempTangent = line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null;
                if (tempTangent !== null) {
                    const dirBearingStr = line.chordBearing || line.bearing;
                    if (dirBearingStr) {
                        const dirRad = parseBearingToRadians(dirBearingStr);
                        if (dirRad !== null) {
                            const halfDelta = centralAngle / 2;
                            const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                            const expectedLeftChord = normalizeAng(tempTangent - halfDelta);
                            const dirNorm = normalizeAng(dirRad);
                            const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                            const diffLeft = Math.min(Math.abs(dirNorm - expectedLeftChord), 2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                            if (diffLeft < diffRight) isLeftCurve = true;
                        }
                    }
                }
            }

            let chordRadArc: number | null = null;
            const chordStr = line.chordBearing || line.bearing;
            if (chordStr) {
                chordRadArc = parseBearingToRadians(chordStr);
            } else if (p2Coords) {
                const dE = p2Coords.x - p1Coords.x;
                const dN = p2Coords.y - p1Coords.y;
                if (Math.hypot(dE, dN) > 1e-9) {
                    let az = Math.atan2(dE, dN);
                    if (az < 0) az += 2 * Math.PI;
                    chordRadArc = az;
                }
            }

            const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
            const tangentAngle: number | null = chordRadArc !== null
                ? chordRadArc - signedDeltaArc / 2
                : (line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null);

            if (tangentAngle !== null) {
                const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                const centerOffsetAngle = isLeftCurve
                    ? canvasTangentAngle + Math.PI / 2
                    : canvasTangentAngle - Math.PI / 2;
                const cX = p1Coords.x + radius * Math.cos(centerOffsetAngle);
                const cY = p1Coords.y + radius * Math.sin(centerOffsetAngle);
                const startAngle = Math.atan2(p1Coords.y - cY, p1Coords.x - cX);
                const mouseAngle = Math.atan2(clickWorld.northing - cY, clickWorld.easting - cX);
                const pickPoint = { x: cX + radius * Math.cos(mouseAngle), y: cY + radius * Math.sin(mouseAngle) };
                return {
                    kind: 'arc',
                    line,
                    center: { x: cX, y: cY },
                    radius,
                    startAngle,
                    centralAngle,
                    isLeftCurve,
                    pickPoint,
                };
            }
        }

        if (p2Coords) {
            const dx = p2Coords.x - p1Coords.x;
            const dy = p2Coords.y - p1Coords.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 1e-12) {
                let t = ((clickWorld.easting - p1Coords.x) * dx + (clickWorld.northing - p1Coords.y) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                const pickPoint = { x: p1Coords.x + dx * t, y: p1Coords.y + dy * t };
                return {
                    kind: 'line',
                    line,
                    p1: { x: p1Coords.x, y: p1Coords.y },
                    p2: { x: p2Coords.x, y: p2Coords.y },
                    pickPoint,
                };
            }
        }

        return null;
    }, [pointMap]);

    const findTtrEntityNearClick = useCallback((clickX: number, clickY: number, threshold: number = 25): TtrEntity | null => {
        const mouseWorld = screenToWorld(clickX, clickY);
        const line = findLineNearClick(clickX, clickY, threshold);
        if (line) {
            return resolveTtrEntityFromLine(line, mouseWorld);
        }
        if (boundaryFiles && boundaryFiles.length > 0) {
            for (const bf of boundaryFiles) {
                if (bf.hidden) continue;
                for (const call of bf.calls) {
                    const from = pointMap.get(call.from);
                    const to = pointMap.get(call.to);
                    if (!from || !to) continue;
                    const p1Coords = { x: from.easting, y: from.northing };
                    const p2Coords = { x: to.easting, y: to.northing };
                    const fakeLine: SurveyLine = {
                        from: call.from,
                        to: call.to,
                        fromPt: { x: p1Coords.x, y: p1Coords.y, z: 0 },
                        toPt: { x: p2Coords.x, y: p2Coords.y, z: 0 },
                        isCurve: call.isCurve,
                        curveRadius: call.curveRadius,
                        arcLength: call.arcLength,
                        curveDirection: call.curveDirection,
                        tangentBearing: call.tangentBearing,
                        bearing: call.bearing,
                        chordBearing: call.chordBearing,
                    };
                    const ent = resolveTtrEntityFromLine(fakeLine, mouseWorld);
                    if (ent) {
                        const sPick = worldToScreen(ent.pickPoint.x, ent.pickPoint.y);
                        if (Math.hypot(clickX - sPick.x, clickY - sPick.y) <= threshold) {
                            return ent;
                        }
                    }
                }
            }
        }
        return null;
    }, [findLineNearClick, resolveTtrEntityFromLine, screenToWorld, worldToScreen, boundaryFiles, pointMap]);

    const solveTtrCircle = useCallback((ent1: TtrEntity, ent2: TtrEntity, radius: number): {
        center: { easting: number; northing: number };
        radius: number;
        tangentPt1: { x: number; y: number };
        tangentPt2: { x: number; y: number };
    } | null => {
        if (!radius || radius <= 1e-6) return null;

        type Candidate = {
            center: { x: number; y: number };
            t1: { x: number; y: number };
            t2: { x: number; y: number };
            score: number;
        };
        const candidates: Candidate[] = [];

        const isEnt1Line = ent1.kind === 'line';
        const isEnt2Line = ent2.kind === 'line';

        if (isEnt1Line && isEnt2Line && ent1.p1 && ent1.p2 && ent2.p1 && ent2.p2) {
            // Line - Line
            const v1x = ent1.p2.x - ent1.p1.x;
            const v1y = ent1.p2.y - ent1.p1.y;
            const len1 = Math.hypot(v1x, v1y);
            const v2x = ent2.p2.x - ent2.p1.x;
            const v2y = ent2.p2.y - ent2.p1.y;
            const len2 = Math.hypot(v2x, v2y);
            if (len1 < 1e-9 || len2 < 1e-9) return null;

            const u1x = v1x / len1; const u1y = v1y / len1;
            const n1x = -u1y; const n1y = u1x;
            const u2x = v2x / len2; const u2y = v2y / len2;
            const n2x = -u2y; const n2y = u2x;

            const cross = u1x * u2y - u1y * u2x;
            if (Math.abs(cross) > 1e-6) {
                // Intersect 4 pairs of offset lines
                for (const s1 of [1, -1]) {
                    const off1x = ent1.p1.x + s1 * radius * n1x;
                    const off1y = ent1.p1.y + s1 * radius * n1y;
                    for (const s2 of [1, -1]) {
                        const off2x = ent2.p1.x + s2 * radius * n2x;
                        const off2y = ent2.p1.y + s2 * radius * n2y;

                        const dx = off2x - off1x;
                        const dy = off2y - off1y;
                        const t = (dx * u2y - dy * u2x) / cross;
                        const cx = off1x + t * u1x;
                        const cy = off1y + t * u1y;

                        const t1x = cx - s1 * radius * n1x;
                        const t1y = cy - s1 * radius * n1y;
                        const t2x = cx - s2 * radius * n2x;
                        const t2y = cy - s2 * radius * n2y;

                        const score = (t1x - ent1.pickPoint.x) ** 2 + (t1y - ent1.pickPoint.y) ** 2 +
                                      (t2x - ent2.pickPoint.x) ** 2 + (t2y - ent2.pickPoint.y) ** 2;
                        candidates.push({ center: { x: cx, y: cy }, t1: { x: t1x, y: t1y }, t2: { x: t2x, y: t2y }, score });
                    }
                }
            } else {
                // Parallel lines
                const distBetween = Math.abs((ent2.p1.x - ent1.p1.x) * n1x + (ent2.p1.y - ent1.p1.y) * n1y);
                if (Math.abs(distBetween - 2 * radius) < Math.max(0.05 * radius, 1.0)) {
                    const sgn = ((ent2.p1.x - ent1.p1.x) * n1x + (ent2.p1.y - ent1.p1.y) * n1y) >= 0 ? 1 : -1;
                    const midLinePx = ent1.p1.x + (sgn * distBetween / 2) * n1x;
                    const midLinePy = ent1.p1.y + (sgn * distBetween / 2) * n1y;
                    const midPickX = (ent1.pickPoint.x + ent2.pickPoint.x) / 2;
                    const midPickY = (ent1.pickPoint.y + ent2.pickPoint.y) / 2;
                    const t = (midPickX - midLinePx) * u1x + (midPickY - midLinePy) * u1y;
                    const cx = midLinePx + t * u1x;
                    const cy = midLinePy + t * u1y;
                    const t1x = cx - sgn * radius * n1x;
                    const t1y = cy - sgn * radius * n1y;
                    const t2x = cx + sgn * radius * n1x;
                    const t2y = cy + sgn * radius * n1y;
                    candidates.push({ center: { x: cx, y: cy }, t1: { x: t1x, y: t1y }, t2: { x: t2x, y: t2y }, score: 0 });
                }
            }
        } else if ((isEnt1Line && !isEnt2Line) || (!isEnt1Line && isEnt2Line)) {
            // Line - Circle / Arc
            const lineEnt = isEnt1Line ? ent1 : ent2;
            const circEnt = isEnt1Line ? ent2 : ent1;
            const isSwapped = !isEnt1Line;

            if (lineEnt.p1 && lineEnt.p2 && circEnt.center && circEnt.radius) {
                const v1x = lineEnt.p2.x - lineEnt.p1.x;
                const v1y = lineEnt.p2.y - lineEnt.p1.y;
                const len1 = Math.hypot(v1x, v1y);
                if (len1 > 1e-9) {
                    const ux = v1x / len1; const uy = v1y / len1;
                    const nx = -uy; const ny = ux;

                    const offsetRadii = [circEnt.radius + radius, Math.abs(circEnt.radius - radius)].filter(r => r > 1e-6);

                    for (const s of [1, -1]) {
                        const offLx = lineEnt.p1.x + s * radius * nx;
                        const offLy = lineEnt.p1.y + s * radius * ny;

                        for (const rOff of offsetRadii) {
                            const dx = offLx - circEnt.center.x;
                            const dy = offLy - circEnt.center.y;
                            const b = 2 * (dx * ux + dy * uy);
                            const c = dx * dx + dy * dy - rOff * rOff;
                            const disc = b * b - 4 * c;
                            if (disc >= 0) {
                                const sqrtDisc = Math.sqrt(disc);
                                const tVals = [(-b + sqrtDisc) / 2, (-b - sqrtDisc) / 2];
                                for (const t of tVals) {
                                    const cx = offLx + t * ux;
                                    const cy = offLy + t * uy;
                                    const tLineX = cx - s * radius * nx;
                                    const tLineY = cy - s * radius * ny;

                                    const dcx = cx - circEnt.center.x;
                                    const dcy = cy - circEnt.center.y;
                                    const dcLen = Math.hypot(dcx, dcy);
                                    if (dcLen < 1e-9) continue;
                                    const tCircX = circEnt.center.x + circEnt.radius * (dcx / dcLen);
                                    const tCircY = circEnt.center.y + circEnt.radius * (dcy / dcLen);

                                    const t1 = isSwapped ? { x: tCircX, y: tCircY } : { x: tLineX, y: tLineY };
                                    const t2 = isSwapped ? { x: tLineX, y: tLineY } : { x: tCircX, y: tCircY };
                                    const score = (t1.x - ent1.pickPoint.x) ** 2 + (t1.y - ent1.pickPoint.y) ** 2 +
                                                  (t2.x - ent2.pickPoint.x) ** 2 + (t2.y - ent2.pickPoint.y) ** 2;
                                    candidates.push({ center: { x: cx, y: cy }, t1, t2, score });
                                }
                            }
                        }
                    }
                }
            }
        } else if (!isEnt1Line && !isEnt2Line && ent1.center && ent1.radius && ent2.center && ent2.radius) {
            // Circle - Circle
            const offsetRadii1 = [ent1.radius + radius, Math.abs(ent1.radius - radius)].filter(r => r > 1e-6);
            const offsetRadii2 = [ent2.radius + radius, Math.abs(ent2.radius - radius)].filter(r => r > 1e-6);

            const dCentersX = ent2.center.x - ent1.center.x;
            const dCentersY = ent2.center.y - ent1.center.y;
            const distCenters = Math.hypot(dCentersX, dCentersY);

            if (distCenters > 1e-9) {
                for (const r1 of offsetRadii1) {
                    for (const r2 of offsetRadii2) {
                        if (distCenters <= r1 + r2 && distCenters >= Math.abs(r1 - r2)) {
                            const a = (r1 * r1 - r2 * r2 + distCenters * distCenters) / (2 * distCenters);
                            const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
                            const midX = ent1.center.x + (a / distCenters) * dCentersX;
                            const midY = ent1.center.y + (a / distCenters) * dCentersY;
                            const orthX = -(dCentersY / distCenters);
                            const orthY = (dCentersX / distCenters);

                            const candidateCenters = [
                                { x: midX + h * orthX, y: midY + h * orthY },
                                { x: midX - h * orthX, y: midY - h * orthY },
                            ];

                            for (const c of candidateCenters) {
                                const dc1x = c.x - ent1.center.x;
                                const dc1y = c.y - ent1.center.y;
                                const len1 = Math.hypot(dc1x, dc1y);
                                const dc2x = c.x - ent2.center.x;
                                const dc2y = c.y - ent2.center.y;
                                const len2 = Math.hypot(dc2x, dc2y);
                                if (len1 < 1e-9 || len2 < 1e-9) continue;

                                const t1x = ent1.center.x + ent1.radius * (dc1x / len1);
                                const t1y = ent1.center.y + ent1.radius * (dc1y / len1);
                                const t2x = ent2.center.x + ent2.radius * (dc2x / len2);
                                const t2y = ent2.center.y + ent2.radius * (dc2y / len2);

                                const score = (t1x - ent1.pickPoint.x) ** 2 + (t1y - ent1.pickPoint.y) ** 2 +
                                              (t2x - ent2.pickPoint.x) ** 2 + (t2y - ent2.pickPoint.y) ** 2;
                                candidates.push({ center: c, t1: { x: t1x, y: t1y }, t2: { x: t2x, y: t2y }, score });
                            }
                        }
                    }
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.score - b.score);
        const best = candidates[0];
        return {
            center: { easting: best.center.x, northing: best.center.y },
            radius,
            tangentPt1: best.t1,
            tangentPt2: best.t2,
        };
    }, []);

    const computeTrimAction = useCallback((clickedLine: SurveyLine, worldX: number, worldY: number): {
        lineId: string;
        newLines: SurveyLine[];
        preview: TrimPreviewData;
    } | null => {
        const p1 = pointMap.get(clickedLine.from);
        const p2 = pointMap.get(clickedLine.to);
        const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (clickedLine.fromPt ? { x: clickedLine.fromPt.x, y: clickedLine.fromPt.y } : null);
        const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (clickedLine.toPt ? { x: clickedLine.toPt.x, y: clickedLine.toPt.y } : null);
        if (!p1Coords) return null;

        const isCircleEntity = clickedLine.isCircle || (clickedLine.isCurve && clickedLine.curveRadius && (!clickedLine.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !clickedLine.tangentBearing && !clickedLine.chordBearing);
        const lineId = clickedLine.id || `${clickedLine.from}-${clickedLine.to}`;

        // Gather all cutting entities
        type CuttingEntity =
            | { type: 'line'; p1: { x: number; y: number }; p2: { x: number; y: number } }
            | { type: 'circle'; center: { x: number; y: number }; radius: number }
            | { type: 'arc'; center: { x: number; y: number }; radius: number; startAngle: number; centralAngle: number; isLeftCurve: boolean };

        const cuttingEntities: CuttingEntity[] = [];

        for (const line of lines) {
            if (line === clickedLine || line.hidden) continue;
            const lp1 = pointMap.get(line.from);
            const lp2 = pointMap.get(line.to);
            const c1 = lp1 ? { x: lp1.easting, y: lp1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const c2 = lp2 ? { x: lp2.easting, y: lp2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);
            if (!c1) continue;

            const isCirc = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (c1 && c2 && c1.x === c2.x && c1.y === c2.y)) && !line.tangentBearing && !line.chordBearing);
            if (isCirc && line.curveRadius) {
                const center = line.circleCenter || (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : c1);
                cuttingEntities.push({ type: 'circle', center: { x: center.x, y: center.y }, radius: line.curveRadius });
            } else if (line.isCurve && line.curveRadius && line.arcLength && c2) {
                const radius = line.curveRadius;
                const centralAngle = line.arcLength / radius;
                const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
                let isLeftCurve = line.curveDirection === 'left';
                if (line.curveDirection !== 'left' && line.curveDirection !== 'right') {
                    const tempTangent = line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null;
                    if (tempTangent !== null) {
                        const dirBearingStr = line.chordBearing || line.bearing;
                        if (dirBearingStr) {
                            const dirRad = parseBearingToRadians(dirBearingStr);
                            if (dirRad !== null) {
                                const halfDelta = centralAngle / 2;
                                const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                                const expectedLeftChord = normalizeAng(tempTangent - halfDelta);
                                const dirNorm = normalizeAng(dirRad);
                                const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                                const diffLeft = Math.min(Math.abs(dirNorm - expectedLeftChord), 2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                                if (diffLeft < diffRight) isLeftCurve = true;
                            }
                        }
                    }
                }
                let chordRadArc: number | null = null;
                const chordStr = line.chordBearing || line.bearing;
                if (chordStr) {
                    chordRadArc = parseBearingToRadians(chordStr);
                } else {
                    const dE = c2.x - c1.x;
                    const dN = c2.y - c1.y;
                    if (Math.hypot(dE, dN) > 1e-9) {
                        let az = Math.atan2(dE, dN);
                        if (az < 0) az += 2 * Math.PI;
                        chordRadArc = az;
                    }
                }
                const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                const tangentAngle = chordRadArc !== null
                    ? chordRadArc - signedDeltaArc / 2
                    : (line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null);
                if (tangentAngle !== null) {
                    const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                    const centerOffsetAngle = isLeftCurve ? canvasTangentAngle + Math.PI / 2 : canvasTangentAngle - Math.PI / 2;
                    const cX = c1.x + radius * Math.cos(centerOffsetAngle);
                    const cY = c1.y + radius * Math.sin(centerOffsetAngle);
                    const startAngle = Math.atan2(c1.y - cY, c1.x - cX);
                    cuttingEntities.push({ type: 'arc', center: { x: cX, y: cY }, radius, startAngle, centralAngle, isLeftCurve });
                }
            } else if (c2) {
                cuttingEntities.push({ type: 'line', p1: c1, p2: c2 });
            }
        }

        if (boundaryFiles && boundaryFiles.length > 0) {
            for (const bf of boundaryFiles) {
                if (bf.hidden) continue;
                for (const call of bf.calls) {
                    const bp1 = pointMap.get(call.from);
                    const bp2 = pointMap.get(call.to);
                    if (!bp1 || !bp2) continue;
                    const c1 = { x: bp1.easting, y: bp1.northing };
                    const c2 = { x: bp2.easting, y: bp2.northing };
                    if (call.isCurve && call.curveRadius && call.arcLength) {
                        const radius = call.curveRadius;
                        const centralAngle = call.arcLength / radius;
                        const isLeftCurve = call.curveDirection === 'left';
                        let chordRadArc: number | null = null;
                        const chordStr = call.chordBearing || call.bearing;
                        if (chordStr) {
                            chordRadArc = parseBearingToRadians(chordStr);
                        } else {
                            const dE = c2.x - c1.x;
                            const dN = c2.y - c1.y;
                            if (Math.hypot(dE, dN) > 1e-9) {
                                let az = Math.atan2(dE, dN);
                                if (az < 0) az += 2 * Math.PI;
                                chordRadArc = az;
                            }
                        }
                        const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                        const tangentAngle = chordRadArc !== null ? chordRadArc - signedDeltaArc / 2 : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
                        if (tangentAngle !== null) {
                            const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                            const centerOffsetAngle = isLeftCurve ? canvasTangentAngle + Math.PI / 2 : canvasTangentAngle - Math.PI / 2;
                            const cX = c1.x + radius * Math.cos(centerOffsetAngle);
                            const cY = c1.y + radius * Math.sin(centerOffsetAngle);
                            const startAngle = Math.atan2(c1.y - cY, c1.x - cX);
                            cuttingEntities.push({ type: 'arc', center: { x: cX, y: cY }, radius, startAngle, centralAngle, isLeftCurve });
                        }
                    } else {
                        cuttingEntities.push({ type: 'line', p1: c1, p2: c2 });
                    }
                }
            }
        }

        // Case 1: Full Circle
        if (isCircleEntity && clickedLine.curveRadius) {
            const center = clickedLine.circleCenter || (clickedLine.fromPt ? { x: clickedLine.fromPt.x, y: clickedLine.fromPt.y } : p1Coords);
            if (!center) return null;
            const R = clickedLine.curveRadius;
            let thetaClick = Math.atan2(worldY - center.y, worldX - center.x);
            if (thetaClick < 0) thetaClick += 2 * Math.PI;

            const angleHits: number[] = [];

            for (const cut of cuttingEntities) {
                if (cut.type === 'line') {
                    const ux = cut.p2.x - cut.p1.x;
                    const uy = cut.p2.y - cut.p1.y;
                    const lenSq = ux * ux + uy * uy;
                    if (lenSq > 1e-9) {
                        const fx = cut.p1.x - center.x;
                        const fy = cut.p1.y - center.y;
                        const a = lenSq;
                        const b = 2 * (fx * ux + fy * uy);
                        const c = fx * fx + fy * fy - R * R;
                        const disc = b * b - 4 * a * c;
                        if (disc >= 0) {
                            const sqrtDisc = Math.sqrt(disc);
                            for (const u of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
                                if (u >= -0.001 && u <= 1.001) {
                                    const ix = cut.p1.x + u * ux;
                                    const iy = cut.p1.y + u * uy;
                                    let ang = Math.atan2(iy - center.y, ix - center.x);
                                    if (ang < 0) ang += 2 * Math.PI;
                                    angleHits.push(ang);
                                }
                            }
                        }
                    }
                } else if (cut.type === 'circle' || cut.type === 'arc') {
                    const C2 = cut.center;
                    const R2 = cut.radius;
                    const d = Math.hypot(C2.x - center.x, C2.y - center.y);
                    if (d > 1e-6 && d <= R + R2 && d >= Math.abs(R - R2)) {
                        const a = (R * R - R2 * R2 + d * d) / (2 * d);
                        const h = Math.sqrt(Math.max(0, R * R - a * a));
                        const midX = center.x + a * (C2.x - center.x) / d;
                        const midY = center.y + a * (C2.y - center.y) / d;
                        const rx = -(C2.y - center.y) / d;
                        const ry = (C2.x - center.x) / d;
                        for (const pt of [{ x: midX + h * rx, y: midY + h * ry }, { x: midX - h * rx, y: midY - h * ry }]) {
                            if (cut.type === 'arc') {
                                const angCut = Math.atan2(pt.y - C2.y, pt.x - C2.x);
                                let sweep = cut.isLeftCurve ? (angCut - cut.startAngle) % (2 * Math.PI) : (cut.startAngle - angCut) % (2 * Math.PI);
                                if (sweep < 0) sweep += 2 * Math.PI;
                                if (sweep > cut.centralAngle + 1e-4) continue;
                            }
                            let ang = Math.atan2(pt.y - center.y, pt.x - center.x);
                            if (ang < 0) ang += 2 * Math.PI;
                            angleHits.push(ang);
                        }
                    }
                }
            }

            angleHits.sort((a, b) => a - b);
            const uniqueAngles: number[] = [];
            for (const ang of angleHits) {
                if (uniqueAngles.length === 0 || Math.abs(ang - uniqueAngles[uniqueAngles.length - 1]) > 0.01) {
                    uniqueAngles.push(ang);
                }
            }
            if (uniqueAngles.length > 1 && (2 * Math.PI - (uniqueAngles[uniqueAngles.length - 1] - uniqueAngles[0])) < 0.01) {
                uniqueAngles.pop();
            }

            const hitPoint = { x: center.x + R * Math.cos(thetaClick), y: center.y + R * Math.sin(thetaClick) };

            if (uniqueAngles.length < 2) {
                return {
                    lineId,
                    newLines: [],
                    preview: {
                        kind: 'circle',
                        center,
                        radius: R,
                        hitPoint,
                    },
                };
            }

            const m = uniqueAngles.length;
            let clickedIntervalIdx = -1;
            for (let i = 0; i < m; i++) {
                const a1 = uniqueAngles[i];
                const a2 = i === m - 1 ? uniqueAngles[0] + 2 * Math.PI : uniqueAngles[i + 1];
                let clickA = thetaClick;
                if (i === m - 1 && clickA < a1) clickA += 2 * Math.PI;
                if (clickA >= a1 - 1e-4 && clickA <= a2 + 1e-4) {
                    clickedIntervalIdx = i;
                    break;
                }
            }

            const a1 = uniqueAngles[clickedIntervalIdx >= 0 ? clickedIntervalIdx : 0];
            const a2 = clickedIntervalIdx >= 0
                ? (clickedIntervalIdx === m - 1 ? uniqueAngles[0] + 2 * Math.PI : uniqueAngles[clickedIntervalIdx + 1])
                : uniqueAngles[1];

            const preview: TrimPreviewData = {
                kind: 'arc',
                center,
                radius: R,
                startAngle: a1,
                endAngle: a2,
                arcAnticlockwise: false,
                hitPoint,
            };

            const newLines: SurveyLine[] = [];
            for (let i = 0; i < m; i++) {
                if (i === clickedIntervalIdx) continue;
                const segA1 = uniqueAngles[i];
                const segA2 = i === m - 1 ? uniqueAngles[0] : uniqueAngles[i + 1];
                let sweep = (segA2 - segA1) % (2 * Math.PI);
                if (sweep <= 0) sweep += 2 * Math.PI;
                if (sweep < 0.001) continue;

                const pA = { x: center.x + R * Math.cos(segA1), y: center.y + R * Math.sin(segA1) };
                const pB = { x: center.x + R * Math.cos(segA1 + sweep), y: center.y + R * Math.sin(segA1 + sweep) };
                const arcLen = R * sweep;

                let chordAz = Math.atan2(pB.x - pA.x, pB.y - pA.y);
                if (chordAz < 0) chordAz += 2 * Math.PI;
                let tanAz = (Math.PI / 2) - (segA1 + Math.PI / 2);
                tanAz = (tanAz % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

                newLines.push({
                    ...clickedLine,
                    id: undefined,
                    from: `TRIM_${Date.now()}_${i}_A`,
                    to: `TRIM_${Date.now()}_${i}_B`,
                    fromPt: { x: pA.x, y: pA.y, z: 0 },
                    toPt: { x: pB.x, y: pB.y, z: 0 },
                    isCurve: true,
                    isCircle: false,
                    curveRadius: R,
                    arcLength: arcLen,
                    curveDirection: 'left',
                    chordBearing: formatBearing(chordAz),
                    tangentBearing: formatBearing(tanAz),
                });
            }

            return { lineId, newLines, preview };
        }

        // Case 2: Curved Line / Arc
        if (clickedLine.isCurve && clickedLine.curveRadius && clickedLine.arcLength && p2Coords) {
            const radius = clickedLine.curveRadius;
            const centralAngle = clickedLine.arcLength / radius;
            const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };

            let isLeftCurve = clickedLine.curveDirection === 'left';
            if (clickedLine.curveDirection !== 'left' && clickedLine.curveDirection !== 'right') {
                const tempTangent = clickedLine.tangentBearing ? parseBearingToRadians(clickedLine.tangentBearing) : null;
                if (tempTangent !== null) {
                    const dirBearingStr = clickedLine.chordBearing || clickedLine.bearing;
                    if (dirBearingStr) {
                        const dirRad = parseBearingToRadians(dirBearingStr);
                        if (dirRad !== null) {
                            const halfDelta = centralAngle / 2;
                            const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                            const expectedLeftChord = normalizeAng(tempTangent - halfDelta);
                            const dirNorm = normalizeAng(dirRad);
                            const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                            const diffLeft = Math.min(Math.abs(dirNorm - expectedLeftChord), 2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                            if (diffLeft < diffRight) isLeftCurve = true;
                        }
                    }
                }
            }
            let chordRadArc: number | null = null;
            const chordStr = clickedLine.chordBearing || clickedLine.bearing;
            if (chordStr) {
                chordRadArc = parseBearingToRadians(chordStr);
            } else {
                const dE = p2Coords.x - p1Coords.x;
                const dN = p2Coords.y - p1Coords.y;
                if (Math.hypot(dE, dN) > 1e-9) {
                    let az = Math.atan2(dE, dN);
                    if (az < 0) az += 2 * Math.PI;
                    chordRadArc = az;
                }
            }
            const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
            const tangentAngle = chordRadArc !== null ? chordRadArc - signedDeltaArc / 2 : (clickedLine.tangentBearing ? parseBearingToRadians(clickedLine.tangentBearing) : null);
            if (tangentAngle !== null) {
                const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                const centerOffsetAngle = isLeftCurve ? canvasTangentAngle + Math.PI / 2 : canvasTangentAngle - Math.PI / 2;
                const cX = p1Coords.x + radius * Math.cos(centerOffsetAngle);
                const cY = p1Coords.y + radius * Math.sin(centerOffsetAngle);
                const startAngle = Math.atan2(p1Coords.y - cY, p1Coords.x - cX);
                const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;

                const clickAng = Math.atan2(worldY - cY, worldX - cX);
                let clickParam = isLeftCurve ? (clickAng - startAngle) % (2 * Math.PI) : (startAngle - clickAng) % (2 * Math.PI);
                if (clickParam < 0) clickParam += 2 * Math.PI;
                clickParam = Math.max(0, Math.min(centralAngle, clickParam));

                const hitPoint = {
                    x: cX + radius * Math.cos(isLeftCurve ? startAngle + clickParam : startAngle - clickParam),
                    y: cY + radius * Math.sin(isLeftCurve ? startAngle + clickParam : startAngle - clickParam),
                };

                const arcParams: number[] = [];

                for (const cut of cuttingEntities) {
                    if (cut.type === 'line') {
                        const ux = cut.p2.x - cut.p1.x;
                        const uy = cut.p2.y - cut.p1.y;
                        const lenSq = ux * ux + uy * uy;
                        if (lenSq > 1e-9) {
                            const fx = cut.p1.x - cX;
                            const fy = cut.p1.y - cY;
                            const a = lenSq;
                            const b = 2 * (fx * ux + fy * uy);
                            const c = fx * fx + fy * fy - radius * radius;
                            const disc = b * b - 4 * a * c;
                            if (disc >= 0) {
                                const sqrtDisc = Math.sqrt(disc);
                                for (const u of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
                                    if (u >= -0.001 && u <= 1.001) {
                                        const ix = cut.p1.x + u * ux;
                                        const iy = cut.p1.y + u * uy;
                                        const ang = Math.atan2(iy - cY, ix - cX);
                                        let p = isLeftCurve ? (ang - startAngle) % (2 * Math.PI) : (startAngle - ang) % (2 * Math.PI);
                                        if (p < 0) p += 2 * Math.PI;
                                        if (p > 0.005 && p < centralAngle - 0.005) {
                                            arcParams.push(p);
                                        }
                                    }
                                }
                            }
                        }
                    } else if (cut.type === 'circle' || cut.type === 'arc') {
                        const C2 = cut.center;
                        const R2 = cut.radius;
                        const d = Math.hypot(C2.x - cX, C2.y - cY);
                        if (d > 1e-6 && d <= radius + R2 && d >= Math.abs(radius - R2)) {
                            const a = (radius * radius - R2 * R2 + d * d) / (2 * d);
                            const h = Math.sqrt(Math.max(0, radius * radius - a * a));
                            const midX = cX + a * (C2.x - cX) / d;
                            const midY = cY + a * (C2.y - cY) / d;
                            const rx = -(C2.y - cY) / d;
                            const ry = (C2.x - cX) / d;
                            for (const pt of [{ x: midX + h * rx, y: midY + h * ry }, { x: midX - h * rx, y: midY - h * ry }]) {
                                if (cut.type === 'arc') {
                                    const angCut = Math.atan2(pt.y - C2.y, pt.x - C2.x);
                                    let sweepCut = cut.isLeftCurve ? (angCut - cut.startAngle) % (2 * Math.PI) : (cut.startAngle - angCut) % (2 * Math.PI);
                                    if (sweepCut < 0) sweepCut += 2 * Math.PI;
                                    if (sweepCut > cut.centralAngle + 1e-4) continue;
                                }
                                const ang = Math.atan2(pt.y - cY, pt.x - cX);
                                let p = isLeftCurve ? (ang - startAngle) % (2 * Math.PI) : (startAngle - ang) % (2 * Math.PI);
                                if (p < 0) p += 2 * Math.PI;
                                if (p > 0.005 && p < centralAngle - 0.005) {
                                    arcParams.push(p);
                                }
                            }
                        }
                    }
                }

                arcParams.sort((a, b) => a - b);
                const uniqueP: number[] = [];
                for (const p of arcParams) {
                    if (uniqueP.length === 0 || Math.abs(p - uniqueP[uniqueP.length - 1]) > 0.01) {
                        uniqueP.push(p);
                    }
                }

                if (uniqueP.length === 0) {
                    return {
                        lineId,
                        newLines: [],
                        preview: {
                            kind: 'arc',
                            center: { x: cX, y: cY },
                            radius,
                            startAngle,
                            endAngle,
                            arcAnticlockwise: !isLeftCurve,
                            hitPoint,
                        },
                    };
                }

                const allP = [0, ...uniqueP, centralAngle];
                let clickedIdx = -1;
                for (let i = 0; i < allP.length - 1; i++) {
                    if (clickParam >= allP[i] - 1e-4 && clickParam <= allP[i + 1] + 1e-4) {
                        clickedIdx = i;
                        break;
                    }
                }
                if (clickedIdx === -1) clickedIdx = 0;

                const pA_param = allP[clickedIdx];
                const pB_param = allP[clickedIdx + 1];
                const angA = isLeftCurve ? startAngle + pA_param : startAngle - pA_param;
                const angB = isLeftCurve ? startAngle + pB_param : startAngle - pB_param;

                const preview: TrimPreviewData = {
                    kind: 'arc',
                    center: { x: cX, y: cY },
                    radius,
                    startAngle: angA,
                    endAngle: angB,
                    arcAnticlockwise: !isLeftCurve,
                    hitPoint,
                };

                const newLines: SurveyLine[] = [];
                for (let i = 0; i < allP.length - 1; i++) {
                    if (i === clickedIdx) continue;
                    const segA = allP[i];
                    const segB = allP[i + 1];
                    const deltaSub = segB - segA;
                    if (deltaSub < 0.001) continue;

                    const curAngA = isLeftCurve ? startAngle + segA : startAngle - segA;
                    const curAngB = isLeftCurve ? startAngle + segB : startAngle - segB;

                    const pA = { x: cX + radius * Math.cos(curAngA), y: cY + radius * Math.sin(curAngA) };
                    const pB = { x: cX + radius * Math.cos(curAngB), y: cY + radius * Math.sin(curAngB) };
                    const arcLen = radius * deltaSub;

                    let chordAz = Math.atan2(pB.x - pA.x, pB.y - pA.y);
                    if (chordAz < 0) chordAz += 2 * Math.PI;

                    const tanMathAngle = isLeftCurve ? curAngA + Math.PI / 2 : curAngA - Math.PI / 2;
                    let tanAz = (Math.PI / 2) - tanMathAngle;
                    tanAz = (tanAz % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

                    const startPn = segA === 0 ? clickedLine.from : `TRIM_${Date.now()}_${i}_A`;
                    const endPn = segB === centralAngle ? clickedLine.to : `TRIM_${Date.now()}_${i}_B`;

                    newLines.push({
                        ...clickedLine,
                        id: undefined,
                        from: startPn,
                        to: endPn,
                        fromPt: { x: pA.x, y: pA.y, z: 0 },
                        toPt: { x: pB.x, y: pB.y, z: 0 },
                        isCurve: true,
                        isCircle: false,
                        curveRadius: radius,
                        arcLength: arcLen,
                        curveDirection: clickedLine.curveDirection,
                        chordBearing: formatBearing(chordAz),
                        tangentBearing: formatBearing(tanAz),
                    });
                }

                return { lineId, newLines, preview };
            }
        }

        // Case 3: Straight Line Segment
        if (!p2Coords) return null;
        const vx = p2Coords.x - p1Coords.x;
        const vy = p2Coords.y - p1Coords.y;
        const L = Math.hypot(vx, vy);
        if (L < 1e-6) return null;

        const tClick = Math.max(0, Math.min(1, ((worldX - p1Coords.x) * vx + (worldY - p1Coords.y) * vy) / (L * L)));
        const hitPoint = { x: p1Coords.x + tClick * vx, y: p1Coords.y + tClick * vy };

        const tHits: number[] = [];

        for (const cut of cuttingEntities) {
            if (cut.type === 'line') {
                const ux = cut.p2.x - cut.p1.x;
                const uy = cut.p2.y - cut.p1.y;
                const denom = vx * uy - vy * ux;
                if (Math.abs(denom) > 1e-9) {
                    const rx = cut.p1.x - p1Coords.x;
                    const ry = cut.p1.y - p1Coords.y;
                    const t = (rx * uy - ry * ux) / denom;
                    const s = (rx * vy - ry * vx) / denom;
                    if (t > 0.001 && t < 0.999 && s >= -0.001 && s <= 1.001) {
                        tHits.push(t);
                    }
                }
            } else if (cut.type === 'circle' || cut.type === 'arc') {
                const C = cut.center;
                const R = cut.radius;
                const fx = p1Coords.x - C.x;
                const fy = p1Coords.y - C.y;
                const a = L * L;
                const b = 2 * (fx * vx + fy * vy);
                const c = fx * fx + fy * fy - R * R;
                const disc = b * b - 4 * a * c;
                if (disc >= 0) {
                    const sqrtDisc = Math.sqrt(disc);
                    for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
                        if (t > 0.001 && t < 0.999) {
                            const ix = p1Coords.x + t * vx;
                            const iy = p1Coords.y + t * vy;
                            if (cut.type === 'arc') {
                                const ang = Math.atan2(iy - C.y, ix - C.x);
                                let sweep = cut.isLeftCurve ? (ang - cut.startAngle) % (2 * Math.PI) : (cut.startAngle - ang) % (2 * Math.PI);
                                if (sweep < 0) sweep += 2 * Math.PI;
                                if (sweep <= cut.centralAngle + 1e-4) {
                                    tHits.push(t);
                                }
                            } else {
                                tHits.push(t);
                            }
                        }
                    }
                }
            }
        }

        tHits.sort((a, b) => a - b);
        const uniqueT: number[] = [];
        for (const t of tHits) {
            if (uniqueT.length === 0 || Math.abs(t - uniqueT[uniqueT.length - 1]) > 0.002) {
                uniqueT.push(t);
            }
        }

        if (uniqueT.length === 0) {
            return {
                lineId,
                newLines: [],
                preview: {
                    kind: 'line',
                    p1: p1Coords,
                    p2: p2Coords,
                    hitPoint,
                },
            };
        }

        const allT = [0, ...uniqueT, 1];
        let clickedSegmentIdx = -1;
        for (let i = 0; i < allT.length - 1; i++) {
            if (tClick >= allT[i] - 1e-4 && tClick <= allT[i + 1] + 1e-4) {
                clickedSegmentIdx = i;
                break;
            }
        }
        if (clickedSegmentIdx === -1) {
            let bestDist = Infinity;
            for (let i = 0; i < allT.length - 1; i++) {
                const midT = (allT[i] + allT[i + 1]) / 2;
                const d = Math.abs(tClick - midT);
                if (d < bestDist) {
                    bestDist = d;
                    clickedSegmentIdx = i;
                }
            }
        }

        const tA = allT[clickedSegmentIdx >= 0 ? clickedSegmentIdx : 0];
        const tB = allT[clickedSegmentIdx >= 0 ? clickedSegmentIdx + 1 : 1];
        const preview: TrimPreviewData = {
            kind: 'line',
            p1: { x: p1Coords.x + tA * vx, y: p1Coords.y + tA * vy },
            p2: { x: p1Coords.x + tB * vx, y: p1Coords.y + tB * vy },
            hitPoint,
        };

        const newLines: SurveyLine[] = [];
        for (let i = 0; i < allT.length - 1; i++) {
            if (i === clickedSegmentIdx) continue;
            const segTa = allT[i];
            const segTb = allT[i + 1];
            const pA = { x: p1Coords.x + segTa * vx, y: p1Coords.y + segTa * vy };
            const pB = { x: p1Coords.x + segTb * vx, y: p1Coords.y + segTb * vy };
            const segDist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
            if (segDist < 0.001) continue;

            let az = Math.atan2(pB.x - pA.x, pB.y - pA.y);
            if (az < 0) az += 2 * Math.PI;

            const startPn = segTa === 0 ? clickedLine.from : `TRIM_${Date.now()}_${i}`;
            const endPn = segTb === 1 ? clickedLine.to : `TRIM_${Date.now()}_${i + 1}`;

            newLines.push({
                ...clickedLine,
                id: undefined,
                from: startPn,
                to: endPn,
                fromPt: { x: pA.x, y: pA.y, z: 0 },
                toPt: { x: pB.x, y: pB.y, z: 0 },
                bearing: formatBearing(az),
                distance: segDist.toFixed(2),
                isCurve: false,
                isCircle: false,
            });
        }

        return { lineId, newLines, preview };
    }, [lines, pointMap, boundaryFiles]);

    const getGripsForSelectedLines = useCallback((): EntityGrip[] => {
        if (selectedLineIds.size === 0) return [];
        const result: EntityGrip[] = [];

        selectedLineIds.forEach(selId => {
            const selLine = lines.find(l => (l.id || `${l.from}-${l.to}`) === selId);
            if (!selLine || selLine.hidden) return;
            const sp1 = pointMap.get(selLine.from);
            const sp2 = pointMap.get(selLine.to);
            const p1c = sp1 ? { x: sp1.easting, y: sp1.northing } : (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : null);
            const p2c = sp2 ? { x: sp2.easting, y: sp2.northing } : (selLine.toPt ? { x: selLine.toPt.x, y: selLine.toPt.y } : null);
            if (!p1c) return;

            const isCircleEntity = selLine.isCircle || (selLine.isCurve && selLine.curveRadius && (!selLine.fromPt || (p1c && p2c && p1c.x === p2c.x && p1c.y === p2c.y)) && !selLine.tangentBearing && !selLine.chordBearing);

            if (isCircleEntity && selLine.curveRadius) {
                const center = selLine.circleCenter || (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : p1c);
                if (center) {
                    const R = selLine.curveRadius;
                    result.push({ id: `${selId}-center`, lineId: selId, type: 'center', x: center.x, y: center.y, line: selLine });
                    result.push({ id: `${selId}-quad-0`, lineId: selId, type: 'quadrant', x: center.x + R, y: center.y, quadrantIndex: 0, line: selLine });
                    result.push({ id: `${selId}-quad-1`, lineId: selId, type: 'quadrant', x: center.x, y: center.y + R, quadrantIndex: 1, line: selLine });
                    result.push({ id: `${selId}-quad-2`, lineId: selId, type: 'quadrant', x: center.x - R, y: center.y, quadrantIndex: 2, line: selLine });
                    result.push({ id: `${selId}-quad-3`, lineId: selId, type: 'quadrant', x: center.x, y: center.y - R, quadrantIndex: 3, line: selLine });
                }
            } else if (selLine.isCurve && selLine.curveRadius && selLine.arcLength && p2c) {
                const radius = selLine.curveRadius;
                const centralAngle = selLine.arcLength / radius;
                const isLeftCurve = selLine.curveDirection === 'left';
                let chordRadArc: number | null = null;
                const chordStr = selLine.chordBearing || selLine.bearing;
                if (chordStr) {
                    chordRadArc = parseBearingToRadians(chordStr);
                } else {
                    const dE = p2c.x - p1c.x;
                    const dN = p2c.y - p1c.y;
                    if (Math.hypot(dE, dN) > 1e-9) {
                        let az = Math.atan2(dE, dN);
                        if (az < 0) az += 2 * Math.PI;
                        chordRadArc = az;
                    }
                }
                const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                const tangentAngle = chordRadArc !== null
                    ? chordRadArc - signedDeltaArc / 2
                    : (selLine.tangentBearing ? parseBearingToRadians(selLine.tangentBearing) : null);
                if (tangentAngle !== null) {
                    const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                    const centerOffsetAngle = isLeftCurve ? canvasTangentAngle + Math.PI / 2 : canvasTangentAngle - Math.PI / 2;
                    const cX = p1c.x + radius * Math.cos(centerOffsetAngle);
                    const cY = p1c.y + radius * Math.sin(centerOffsetAngle);
                    const startAngle = Math.atan2(p1c.y - cY, p1c.x - cX);
                    const midAngle = isLeftCurve ? startAngle + centralAngle / 2 : startAngle - centralAngle / 2;
                    const midX = cX + radius * Math.cos(midAngle);
                    const midY = cY + radius * Math.sin(midAngle);

                    result.push({ id: `${selId}-start`, lineId: selId, type: 'start', x: p1c.x, y: p1c.y, line: selLine });
                    result.push({ id: `${selId}-mid`, lineId: selId, type: 'mid', x: midX, y: midY, line: selLine });
                    result.push({ id: `${selId}-end`, lineId: selId, type: 'end', x: p2c.x, y: p2c.y, line: selLine });
                    result.push({ id: `${selId}-center`, lineId: selId, type: 'center', x: cX, y: cY, line: selLine });
                }
            } else if (p2c) {
                result.push({ id: `${selId}-start`, lineId: selId, type: 'start', x: p1c.x, y: p1c.y, line: selLine });
                result.push({ id: `${selId}-mid`, lineId: selId, type: 'mid', x: (p1c.x + p2c.x) / 2, y: (p1c.y + p2c.y) / 2, line: selLine });
                result.push({ id: `${selId}-end`, lineId: selId, type: 'end', x: p2c.x, y: p2c.y, line: selLine });
            }
        });

        return result;
    }, [selectedLineIds, lines, pointMap]);

    const findGripNearClick = useCallback((screenX: number, screenY: number, thresholdPx = 9): EntityGrip | null => {
        const grips = getGripsForSelectedLines();
        let best: EntityGrip | null = null;
        let bestDistSq = thresholdPx * thresholdPx;

        for (const g of grips) {
            const sc = worldToScreen(g.x, g.y);
            const dSq = (screenX - sc.x) ** 2 + (screenY - sc.y) ** 2;
            if (dSq <= bestDistSq) {
                bestDistSq = dSq;
                best = g;
            }
        }
        return best;
    }, [getGripsForSelectedLines, worldToScreen]);

    const commitActiveGrip = useCallback((
        grip: EntityGrip,
        targetWorldX: number,
        targetWorldY: number,
        snapResult?: OsnapResult | null
    ) => {
        const selLine = grip.line;
        const lineId = grip.lineId;
        const finalX = snapResult ? snapResult.easting : targetWorldX;
        const finalY = snapResult ? snapResult.northing : targetWorldY;
        const snappedPn = snapResult?.sourcePoint?.pointNumber;

        const p1 = pointMap.get(selLine.from);
        const p2 = pointMap.get(selLine.to);
        const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : null);
        const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (selLine.toPt ? { x: selLine.toPt.x, y: selLine.toPt.y } : null);

        const isCircleEntity = selLine.isCircle || (selLine.isCurve && selLine.curveRadius && (!selLine.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !selLine.tangentBearing && !selLine.chordBearing);

        if (isCircleEntity && selLine.curveRadius) {
            if (grip.type === 'center') {
                const changes: Partial<SurveyLine> = {
                    circleCenter: { x: finalX, y: finalY, z: 0 },
                    fromPt: { x: finalX, y: finalY, z: 0 },
                    toPt: { x: finalX, y: finalY, z: 0 },
                };
                if (snappedPn) {
                    changes.from = snappedPn;
                    changes.to = snappedPn;
                }
                props.onUpdateLine?.(lineId, changes);
            } else if (grip.type === 'quadrant') {
                const center = selLine.circleCenter || (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : p1Coords);
                if (center) {
                    const newR = Math.hypot(finalX - center.x, finalY - center.y);
                    if (newR > 1e-4) {
                        props.onUpdateLine?.(lineId, {
                            curveRadius: newR,
                            arcLength: 2 * Math.PI * newR,
                        });
                    }
                }
            }
        } else if (selLine.isCurve && selLine.curveRadius && p1Coords && p2Coords) {
            // Arc / Curve
            if (grip.type === 'start') {
                const dx = p2Coords.x - finalX;
                const dy = p2Coords.y - finalY;
                const newChordLen = Math.hypot(dx, dy);
                let az = Math.atan2(dx, dy);
                if (az < 0) az += 2 * Math.PI;
                const changes: Partial<SurveyLine> = {
                    fromPt: { x: finalX, y: finalY, z: 0 },
                    chordBearing: formatBearing(az),
                    distance: newChordLen.toFixed(2),
                };
                if (snappedPn) changes.from = snappedPn;
                props.onUpdateLine?.(lineId, changes);
            } else if (grip.type === 'end') {
                const dx = finalX - p1Coords.x;
                const dy = finalY - p1Coords.y;
                const newChordLen = Math.hypot(dx, dy);
                let az = Math.atan2(dx, dy);
                if (az < 0) az += 2 * Math.PI;
                const changes: Partial<SurveyLine> = {
                    toPt: { x: finalX, y: finalY, z: 0 },
                    chordBearing: formatBearing(az),
                    distance: newChordLen.toFixed(2),
                };
                if (snappedPn) changes.to = snappedPn;
                props.onUpdateLine?.(lineId, changes);
            } else if (grip.type === 'mid' || grip.type === 'center') {
                const deltaX = finalX - grip.x;
                const deltaY = finalY - grip.y;
                props.onUpdateLine?.(lineId, {
                    fromPt: { x: p1Coords.x + deltaX, y: p1Coords.y + deltaY, z: 0 },
                    toPt: { x: p2Coords.x + deltaX, y: p2Coords.y + deltaY, z: 0 },
                });
            }
        } else if (p1Coords && p2Coords) {
            // Straight Line
            if (grip.type === 'start') {
                const dx = p2Coords.x - finalX;
                const dy = p2Coords.y - finalY;
                const newDist = Math.hypot(dx, dy);
                let az = Math.atan2(dx, dy);
                if (az < 0) az += 2 * Math.PI;
                const changes: Partial<SurveyLine> = {
                    fromPt: { x: finalX, y: finalY, z: 0 },
                    bearing: formatBearing(az),
                    distance: newDist.toFixed(2),
                };
                if (snappedPn) changes.from = snappedPn;
                props.onUpdateLine?.(lineId, changes);
            } else if (grip.type === 'end') {
                const dx = finalX - p1Coords.x;
                const dy = finalY - p1Coords.y;
                const newDist = Math.hypot(dx, dy);
                let az = Math.atan2(dx, dy);
                if (az < 0) az += 2 * Math.PI;
                const changes: Partial<SurveyLine> = {
                    toPt: { x: finalX, y: finalY, z: 0 },
                    bearing: formatBearing(az),
                    distance: newDist.toFixed(2),
                };
                if (snappedPn) changes.to = snappedPn;
                props.onUpdateLine?.(lineId, changes);
            } else if (grip.type === 'mid') {
                const deltaX = finalX - grip.x;
                const deltaY = finalY - grip.y;
                props.onUpdateLine?.(lineId, {
                    fromPt: { x: p1Coords.x + deltaX, y: p1Coords.y + deltaY, z: 0 },
                    toPt: { x: p2Coords.x + deltaX, y: p2Coords.y + deltaY, z: 0 },
                });
            }
        }

        setActiveGrip(null);
        setHoveredGrip(null);
        requestAnimationFrame(() => drawRef.current?.());
    }, [pointMap, props]);

    const zoomExtents = useCallback((padding = 0.1) => {
        const visibleBoundaryFiles = (boundaryFiles ?? []).filter(bf => !bf.hidden && bf.calls.length > 0);
        if (points.length === 0 && lines.length === 0 && centerlines.length === 0 && visibleBoundaryFiles.length === 0) return;
        const container = containerRef.current;
        if (!container) return;

        let minN = Infinity, maxN = -Infinity, minE = Infinity, maxE = -Infinity;

        points.forEach(p => {
            minN = Math.min(minN, p.northing); maxN = Math.max(maxN, p.northing);
            minE = Math.min(minE, p.easting); maxE = Math.max(maxE, p.easting);
        });
        
        const linePoints: Array<{ easting: number; northing: number }> = [];
        lines.forEach(line => {
            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);
            const p1Coords = p1
                ? { easting: p1.easting, northing: p1.northing }
                : (line.fromPt ? { easting: line.fromPt.x, northing: line.fromPt.y } : null);
            const p2Coords = p2
                ? { easting: p2.easting, northing: p2.northing }
                : (line.toPt ? { easting: line.toPt.x, northing: line.toPt.y } : null);
            if (p1Coords) linePoints.push(p1Coords);
            if (p2Coords) linePoints.push(p2Coords);
        });
        linePoints.forEach(p => {
             minN = Math.min(minN, p.northing); maxN = Math.max(maxN, p.northing);
             minE = Math.min(minE, p.easting); maxE = Math.max(maxE, p.easting);
        });
        
        // Also account for curve and circle extents in survey lines
        lines.forEach(line => {
            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);
            const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);

            const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !line.tangentBearing && !line.chordBearing);
            if (isCircleEntity && line.curveRadius) {
                const center = line.circleCenter || (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : p1Coords);
                if (center) {
                    const r = line.curveRadius;
                    minN = Math.min(minN, center.y - r);
                    maxN = Math.max(maxN, center.y + r);
                    minE = Math.min(minE, center.x - r);
                    maxE = Math.max(maxE, center.x + r);
                }
            } else if ((line.isCurve || line.curveRadius) && line.curveRadius && line.arcLength) {
                if (p1) {
                    const radius = line.curveRadius;
                    
                    // Approximate bounds by adding radius to both endpoints
                    minN = Math.min(minN, p1.northing - radius, p1.northing + radius);
                    maxN = Math.max(maxN, p1.northing - radius, p1.northing + radius);
                    minE = Math.min(minE, p1.easting - radius, p1.easting + radius);
                    maxE = Math.max(maxE, p1.easting - radius, p1.easting + radius);
                }
                if (p2) {
                    const radius = line.curveRadius;
                    minN = Math.min(minN, p2.northing - radius, p2.northing + radius);
                    maxN = Math.max(maxN, p2.northing - radius, p2.northing + radius);
                    minE = Math.min(minE, p2.easting - radius, p2.easting + radius);
                    maxE = Math.max(maxE, p2.easting - radius, p2.easting + radius);
                }
            }
        });
        
        centerlines.forEach(cl => {
            cl.pis.forEach(p => {
                minN = Math.min(minN, p.northing); maxN = Math.max(maxN, p.northing);
                minE = Math.min(minE, p.easting); maxE = Math.max(maxE, p.easting);
            });

            // Also account for curve extents
            for (let i = 1; i < cl.pis.length - 1; i++) {
                const p_prev = cl.pis[i-1];
                const p_curr = cl.pis[i];
                const p_next = cl.pis[i+1];

                if (p_curr.curveRadius) {
                    const curve = calculateCurveGeometry(p_prev, p_curr, p_next, p_curr.curveRadius);
                    if (curve) {
                        minN = Math.min(minN, curve.pcNorthing, curve.ptNorthing);
                        maxN = Math.max(maxN, curve.pcNorthing, curve.ptNorthing);
                        minE = Math.min(minE, curve.pcEasting, curve.ptEasting);
                        maxE = Math.max(maxE, curve.pcEasting, curve.ptEasting);
                        
                        const { centerEasting: cx, centerNorthing: cy, radius: r, startAngle, endAngle } = curve;
                        const cardinalAngles = [
                            { angle: 0, update: () => maxE = Math.max(maxE, cx + r) }, // East
                            { angle: Math.PI / 2, update: () => maxN = Math.max(maxN, cy + r) }, // North
                            { angle: Math.PI, update: () => minE = Math.min(minE, cx - r) }, // West
                            { angle: 3 * Math.PI / 2, update: () => minN = Math.min(minN, cy - r) } // South
                        ];
                        
                        const normalize = (angle: number) => (angle + 2 * Math.PI) % (2 * Math.PI);
                        const s = normalize(startAngle);
                        const e = normalize(endAngle);
                        const isCcw = !curve.turnRight;

                        cardinalAngles.forEach(item => {
                            const angle = item.angle;
                            let isBetween = false;
                            
                            if (isCcw) {
                                if (s < e) { isBetween = angle >= s && angle <= e; } 
                                else { isBetween = angle >= s || angle <= e; }
                            } else { // Clockwise
                                if (s > e) { isBetween = angle <= s && angle >= e; } 
                                else { isBetween = angle <= s || angle >= e; }
                            }
                            
                            if (isBetween) {
                                item.update();
                            }
                        });
                    }
                }
            }
        });

        // --- Boundary file amber overlays ---
        // Walk each visible BoundaryFile using the same synth-point logic as the
        // draw pass so zoom-extents works before survey points are assigned.
        visibleBoundaryFiles.forEach(bf => {
            const synthMap = new Map<string, { easting: number; northing: number }>();
            const lookupPt = (pn: string | undefined): { easting: number; northing: number } | undefined => {
                if (!pn) return undefined;
                const pm = pointMap.get(pn);
                if (pm) return { easting: pm.easting, northing: pm.northing };
                return synthMap.get(pn);
            };
            const firstCall = bf.calls[0];
            const pobFromMap = firstCall.from ? pointMap.get(firstCall.from) : undefined;
            const pob: { easting: number; northing: number } = pobFromMap
                ? { easting: pobFromMap.easting, northing: pobFromMap.northing }
                : bf.pobOverride
                ? { easting: bf.pobOverride.easting, northing: bf.pobOverride.northing }
                : { easting: 0, northing: 0 };
            if (firstCall.from) synthMap.set(firstCall.from, pob);
            let cursor = pob;
            for (const call of bf.calls) {
                const fromHere = lookupPt(call.from) ?? cursor;
                if (!fromHere) continue;
                let endPt: { easting: number; northing: number } | null = null;
                if (call.isCurve && typeof call.curveRadius === 'number' && isFinite(call.curveRadius)
                    && typeof call.arcLength === 'number' && isFinite(call.arcLength) && call.arcLength !== 0) {
                    const centralAngle = call.arcLength / call.curveRadius;
                    const chordStr = call.chordBearing || call.bearing;
                    const chordRad = chordStr ? parseBearingToRadians(chordStr) : null;
                    if (chordRad !== null) {
                        endPt = directCurve(fromHere, chordRad - centralAngle / 2, call.curveRadius, centralAngle);
                    }
                } else {
                    const bStr = call.bearing || call.chordBearing;
                    const bRad = bStr ? parseBearingToRadians(bStr) : null;
                    const dist = call.distance
                        ? parseDistance(call.distance)
                        : (typeof (call as any).distanceFt === 'number' ? (call as any).distanceFt : null);
                    if (bRad !== null && typeof dist === 'number' && isFinite(dist)) {
                        endPt = direct(fromHere, bRad, dist);
                    }
                }
                if (endPt) {
                    if (call.to && !lookupPt(call.to)) synthMap.set(call.to, endPt);
                    cursor = endPt;
                }
            }
            // Apply the per-file transform (translate + rotate) the same way the draw pass does,
            // then fold each transformed point into the global bbox.
            const bfFirstPt = lookupPt(bf.calls[0].from);
            const bfTxE = bf.translationE ?? 0;
            const bfTxN = bf.translationN ?? 0;
            const bfRotRad = ((bf.rotationDeg ?? 0) * Math.PI) / 180;
            const hasTransform = (bfTxE !== 0 || bfTxN !== 0 || bfRotRad !== 0) && !!bfFirstPt;
            synthMap.forEach(p => {
                let e = p.easting, n = p.northing;
                if (hasTransform && bfFirstPt) {
                    const dx = e - bfFirstPt.easting;
                    const dy = n - bfFirstPt.northing;
                    e = bfFirstPt.easting + (bfTxE) + dx * Math.cos(bfRotRad) - dy * Math.sin(bfRotRad);
                    n = bfFirstPt.northing + (bfTxN) + dx * Math.sin(bfRotRad) + dy * Math.cos(bfRotRad);
                }
                minN = Math.min(minN, n); maxN = Math.max(maxN, n);
                minE = Math.min(minE, e); maxE = Math.max(maxE, e);
            });
        });

        if (minN === Infinity) return;

        const dataWidth = maxE - minE;
        const dataHeight = maxN - minN;
        
        // FIX: Handle cases where data has no spatial extent (e.g. single point) to prevent division by zero.
        if (dataWidth < 1e-9 && dataHeight < 1e-9) {
            const defaultScale = 0.5; // Apply a reasonable default zoom level
            const newOffsetX = container.clientWidth / 2 - minE * defaultScale;
            // Center vertically on the point's northing.
            const newOffsetY = container.clientHeight / 2 + minN * defaultScale; 
            setTransform({ scale: defaultScale, offsetX: newOffsetX, offsetY: newOffsetY });
            return;
        }

        const scaleX = container.clientWidth / (dataWidth * (1 + padding));
        const scaleY = container.clientHeight / (dataHeight * (1 + padding));
        const newScale = Math.min(scaleX, scaleY);
        
        const newOffsetX = (container.clientWidth - dataWidth * newScale) / 2 - minE * newScale;
        const newOffsetY = (container.clientHeight - dataHeight * newScale) / 2 + maxN * newScale;
        
        setTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
    }, [points, lines, centerlines, pointMap, boundaryFiles]);

    /** Zoom to a specific bounding box in project coordinates — avoids the zoom-to-all issue when GIS layers are loaded. */
    const zoomToBbox = useCallback((minE: number, maxE: number, minN: number, maxN: number, padding = 0.15) => {
        const container = containerRef.current;
        if (!container) return;
        const rangeE = maxE - minE;
        const rangeN = maxN - minN;
        if (rangeE < 1e-9 && rangeN < 1e-9) {
            // Single point or zero-size: just centre on it at a reasonable scale
            const scale = 8;
            const cx = (minE + maxE) / 2;
            const cy = (minN + maxN) / 2;
            setTransform({
                scale,
                offsetX: container.clientWidth / 2 - cx * scale,
                offsetY: container.clientHeight / 2 + cy * scale,
            });
            return;
        }
        const scaleX = container.clientWidth  / (rangeE * (1 + padding));
        const scaleY = container.clientHeight / (rangeN * (1 + padding));
        const scale   = Math.min(scaleX, scaleY);
        const offsetX = (container.clientWidth  - rangeE * scale) / 2 - minE * scale;
        const offsetY = (container.clientHeight - rangeN * scale) / 2 + maxN * scale;
        setTransform({ scale, offsetX, offsetY });
    }, []);

    const redraw = useCallback(() => {
        // This is a dummy function to trigger a re-render if needed, but the main draw effect depends on props.
        // We can force a re-render by updating a dummy state if necessary, but it's usually not.
        // For now, `draw` is called via useEffect on prop changes, which is sufficient.
    }, []);

    useImperativeHandle(ref, () => ({
        zoomExtents,
        zoomToBbox,
        redraw,
        finishDrawing,
        cancelDeleteMode: () => {
            setIsDeletingLines(false);
        },
        confirmDelete: () => {
            // No longer needed - lines delete immediately
            setIsDeletingLines(false);
        },
        getTransform: () => transformRef.current,
        setTransform: (newTransform: { scale: number; offsetX: number; offsetY: number }) => {
            setTransform(newTransform);
        },
    }));
    
    useEffect(() => {
        const imageMap = new Map<string, HTMLImageElement>();
        let isMounted = true;
    
        const promises = offlineMapAreas.flatMap(area =>
          area.layers.map(layer => {
            const key = `${area.id}-${layer.layerName}`;
            if (offlineImages.has(key)) {
              imageMap.set(key, offlineImages.get(key)!);
              return Promise.resolve();
            }
            return new Promise<void>(resolve => {
              const img = new Image();
              img.onload = () => {
                if (isMounted) {
                  imageMap.set(key, img);
                }
                resolve();
              };
              img.onerror = () => resolve(); // Resolve even on error
              img.src = layer.imageData;
            });
          })
        );
    
        Promise.all(promises).then(() => {
          if (isMounted) {
            setOfflineImages(new Map(imageMap));
          }
        });
    
        return () => { isMounted = false; };
      }, [offlineMapAreas]);
    
    const fetchWmsImages = useMemo(() => debounce(async (
        currentTransform: typeof transform,
        currentActiveWmsLayers: ActiveWmsLayer[],
        currentWmsServices: WmsService[],
        currentSettings: Settings,
        canvasElement: HTMLCanvasElement | null
    ) => {
        if (!canvasElement || !currentSettings.projection.epsg) {
            setWmsImages([]);
            return;
        }
    
        const { scale, offsetX, offsetY } = currentTransform;
        const { width, height } = canvasElement;
    
        const minE_view = (0 - offsetX) / scale;
        const maxE_view = (width - offsetX) / scale;
        const maxN_view = -(0 - offsetY) / scale;
        const minN_view = -(height - offsetY) / scale;
        const viewBboxArray: [number, number, number, number] = [minE_view, minN_view, maxE_view, maxN_view];
        const projectCrs = `EPSG:${currentSettings.projection.epsg}`;
    
        const activeVisibleLayers = currentActiveWmsLayers.filter(l => l.isVisible);
        if (activeVisibleLayers.length === 0) {
            setWmsImages([]);
            return;
        }
    
        const imagePromises = activeVisibleLayers.map(async (layer) => {
            const service = currentWmsServices.find(s => s.url === layer.serviceUrl);
            if (!service) return null;
    
            const layerInfo = service.layers.find(l => l.name === layer.layerName);
            if (!layerInfo) return null;
    
            let requestCrs = projectCrs;
            let requestBboxArray = viewBboxArray;
    
            const isProjectCrsSupported = layerInfo.supportedCrs.some(crs => crs.includes(String(currentSettings.projection.epsg)));
    
            if (!isProjectCrsSupported) {
                const fallbackCrsList = ['EPSG:3857', 'EPSG:4326'];
                const supportedFallback = fallbackCrsList.find(crs =>
                    layerInfo.supportedCrs.some(supported => supported.includes(crs.split(':')[1]))
                );
    
                if (supportedFallback) {
                    try {
                        const corners_proj = [
                            [viewBboxArray[0], viewBboxArray[1]], [viewBboxArray[2], viewBboxArray[1]],
                            [viewBboxArray[0], viewBboxArray[3]], [viewBboxArray[2], viewBboxArray[3]]
                        ];
                        
                        const corners_reproj = corners_proj.map(c => proj4(projectCrs, supportedFallback, c));
                        
                        const minX_reproj = Math.min(...corners_reproj.map(c => c[0]));
                        const minY_reproj = Math.min(...corners_reproj.map(c => c[1]));
                        const maxX_reproj = Math.max(...corners_reproj.map(c => c[0]));
                        const maxY_reproj = Math.max(...corners_reproj.map(c => c[1]));
                        
                        requestCrs = supportedFallback;
                        requestBboxArray = [minX_reproj, minY_reproj, maxX_reproj, maxY_reproj];
                    } catch (e) {
                        console.error(`Projection from ${projectCrs} to ${supportedFallback} failed:`, e);
                        return null;
                    }
                } else {
                    console.warn(`Layer ${layer.layerName} from ${service.title} supports neither project CRS nor common web CRSs.`);
                    return null;
                }
            }
            
            let finalBboxArray = requestBboxArray;
            // WMS 1.3.0 spec requires axis order swap for geographic CRS like EPSG:4326 (lat,lon instead of lon,lat).
            if (requestCrs === 'EPSG:4326') {
                const [minX, minY, maxX, maxY] = requestBboxArray;
                finalBboxArray = [minY, minX, maxY, maxX];
            }
            const requestBboxString = finalBboxArray.join(',');
    
            const wmsUrl = new URL(service.url);
            wmsUrl.searchParams.set('service', 'WMS');
            wmsUrl.searchParams.set('request', 'GetMap');
            wmsUrl.searchParams.set('layers', layer.layerName);
            wmsUrl.searchParams.set('styles', '');
            // Forcibly request WMS 1.3.0 for better consistency across servers.
            wmsUrl.searchParams.set('version', '1.3.0');
            wmsUrl.searchParams.set('width', String(width));
            wmsUrl.searchParams.set('height', String(height));
            // The parameter is 'CRS' for 1.3.0. By forcing this version, we can use 'CRS' consistently.
            wmsUrl.searchParams.set('CRS', requestCrs);
            wmsUrl.searchParams.set('bbox', requestBboxString);
            wmsUrl.searchParams.set('format', 'image/png');
            wmsUrl.searchParams.set('transparent', 'true');
    
            const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(wmsUrl.toString())}`;
            const drawingBbox = viewBboxArray;
    
            // Load via the prioritized CORS-proxy list (api.codetabs.com is
            // primary as of 2026-05-17; allorigins / corsproxy.io are tried
            // next on failure). This used to be a single hard-coded
            // allorigins.win Image() call, which silently failed when the
            // proxy started returning 408s — image just never appeared on
            // the canvas with no UI error. The helper logs failures to
            // console and tries each proxy in turn.
            try {
                const img = await loadImageViaProxy(wmsUrl.toString());
                return { image: img, bbox: drawingBbox, opacity: layer.opacity };
            } catch (err) {
                console.error(`[WMS] All proxies failed for ${service.title} / ${layer.layerName}`, err);
                // Fallback diagnostic: fetch through the (likely-failing) primary
                // proxy directly so any returned error text is logged.
                fetch(proxiedUrl)
                    .then(res => res.text())
                    .then(text => console.error(`[WMS] Primary proxy diagnostic body for ${service.title}:`, text.slice(0, 500)))
                    .catch(() => {});
                return null;
            }
        });

        const loadedImages = (await Promise.all(imagePromises)).filter((img): img is { image: HTMLImageElement; bbox: [number, number, number, number]; opacity: number } => img !== null);
        setWmsImages(loadedImages);
    }, 500), []);


    useEffect(() => {
        fetchWmsImages(transform, activeWmsLayers, wmsServices, settings, canvasRef.current);
    }, [transform, activeWmsLayers, wmsServices, settings, fetchWmsImages]);

    const fetchGoogleOverlayImage = useMemo(() => debounce(async (
        currentTransform: typeof transform,
        currentSettings: Settings,
        canvasElement: HTMLCanvasElement | null
    ) => {
        const seq = ++googleOverlaySeqRef.current;
        const gm = currentSettings.googleMaps;
        if (!canvasElement || !gm?.enabled) {
            setGoogleOverlayImage(null);
            setGoogleOverlayDiagnostic(null);
            return;
        }
        if (!currentSettings.projection.epsg) {
            setGoogleOverlayImage(null);
            setGoogleOverlayDiagnostic({
                tone: 'info',
                message: 'Map imagery is hidden: set a project EPSG in Settings. WMS layers require this too.',
            });
            return;
        }

        const { scale, offsetX, offsetY } = currentTransform;
        const { width, height } = canvasElement;
        const minEView = (0 - offsetX) / scale;
        const maxEView = (width - offsetX) / scale;
        const maxNView = -(0 - offsetY) / scale;
        const minNView = -(height - offsetY) / scale;

        const projectCrs = `EPSG:${currentSettings.projection.epsg}`;
        let cornersWgs84: Array<[number, number]>;
        try {
            cornersWgs84 = [
                proj4(projectCrs, 'EPSG:4326', [minEView, minNView]) as [number, number],
                proj4(projectCrs, 'EPSG:4326', [maxEView, minNView]) as [number, number],
                proj4(projectCrs, 'EPSG:4326', [maxEView, maxNView]) as [number, number],
                proj4(projectCrs, 'EPSG:4326', [minEView, maxNView]) as [number, number],
            ];
            if (cornersWgs84.some(([lon, latVal]) => !Number.isFinite(lon) || !Number.isFinite(latVal))) {
                setGoogleOverlayImage(null);
                setGoogleOverlayDiagnostic({
                    tone: 'error',
                    message: 'Map imagery reprojection failed: non-finite coordinates. Verify EPSG and georeferenced point values.',
                });
                return;
            }
        } catch (e) {
            console.warn('[GoogleOverlay] View reprojection to WGS84 failed:', e);
            setGoogleOverlayImage(null);
            setGoogleOverlayDiagnostic({
                tone: 'error',
                message: 'Map imagery reprojection failed. Verify project EPSG and coordinate units.',
            });
            return;
        }

        const lons = cornersWgs84.map(c => c[0]);
        const lats = cornersWgs84.map(c => c[1]);
        const wgsBbox: [number, number, number, number] = [
            Math.min(...lons),
            Math.min(...lats),
            Math.max(...lons),
            Math.max(...lats),
        ];
        const lat = (wgsBbox[1] + wgsBbox[3]) / 2;
        const lng = (wgsBbox[0] + wgsBbox[2]) / 2;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            setGoogleOverlayImage(null);
            setGoogleOverlayDiagnostic({
                tone: 'error',
                message: 'Map imagery is out of range after reprojection. Verify EPSG matches your drawing coordinates.',
            });
            return;
        }
        const zoom = zoomForBboxWgs84(wgsBbox);

        const selectedMapType = gm.mapType ?? 'naip';
        const resolvedMapType: StaticMapRequest['maptype'] =
            selectedMapType === 'hybrid'
                ? ((gm.showLabels ?? true) ? 'hybrid' : 'satellite')
                : selectedMapType;

        // ── CRS-native NAIP path ──────────────────────────────────────────
        // Request the imagery already reprojected into the project CRS for the
        // exact current view, then draw it 1:1. This removes the zoom-dependent
        // misalignment caused by stretching a geographic (lat/lng) tile onto a
        // grid-coordinate rectangle. Only NAIP can be reprojected server-side;
        // Google static tiles stay on the legacy center/zoom path below.
        if (resolvedMapType === 'naip') {
            const projWidth = maxEView - minEView;
            const projHeight = maxNView - minNView;
            if (!(projWidth > 0) || !(projHeight > 0)) {
                setGoogleOverlayImage(null);
                return;
            }

            // Pad + snap the request extent to a stable grid so small pans and
            // zooms reuse a cached image instead of re-fetching the backend
            // proxy (which is slow and bounded by a per-IP daily limit). We draw
            // into the returned extent, so a larger snapped rectangle stays
            // geometrically exact — only the cache key is stabilized.
            const pad = 0.2;
            const rawMinX = minEView - projWidth * pad;
            const rawMaxX = maxEView + projWidth * pad;
            const rawMinY = minNView - projHeight * pad;
            const rawMaxY = maxNView + projHeight * pad;
            const niceStep = (span: number) => {
                const raw = span / 6;
                if (!(raw > 0) || !Number.isFinite(raw)) return span || 1;
                const mag = Math.pow(10, Math.floor(Math.log10(raw)));
                const norm = raw / mag;
                const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
                return nice * mag;
            };
            const stepX = niceStep(rawMaxX - rawMinX);
            const stepY = niceStep(rawMaxY - rawMinY);
            const snapMinX = Math.floor(rawMinX / stepX) * stepX;
            const snapMaxX = Math.ceil(rawMaxX / stepX) * stepX;
            const snapMinY = Math.floor(rawMinY / stepY) * stepY;
            const snapMaxY = Math.ceil(rawMaxY / stepY) * stepY;
            const snapWidth = snapMaxX - snapMinX;
            const snapHeight = snapMaxY - snapMinY;

            // Preserve the snapped extent aspect ratio so the returned extent
            // matches the requested bbox exactly. Honor the retina scale (2×)
            // by requesting a higher-resolution image for the same extent.
            const retinaScale = Math.min(2, Math.max(1, Math.round(currentSettings.googleMaps?.scale ?? 1)));
            const capDim = 640 * retinaScale;
            const aspect = snapWidth / snapHeight;
            let outW = capDim;
            let outH = capDim;
            if (aspect >= 1) outH = Math.max(1, Math.round(capDim / aspect));
            else outW = Math.max(1, Math.round(capDim * aspect));

            // Attempt to fetch NAIP already reprojected into a target SR, then
            // draw it 1:1 into the returned extent (converted to project coords
            // if the request SR was not the project SR).
            //   requestSr === project EPSG → draw returned extent directly.
            //   requestSr === 3857         → reproject returned extent → project.
            const runNaip = async (
                requestBbox: [number, number, number, number],
                requestSr: number,
                extentToProject: boolean,
            ) => {
                const staticMap = await getStaticMap({
                    lat,
                    lng,
                    width: outW,
                    height: outH,
                    maptype: 'naip',
                    projectedBbox: requestBbox,
                    sr: requestSr,
                });

                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error('Overlay image decode failed'));
                    i.src = staticMap.dataUrl;
                });

                if (seq !== googleOverlaySeqRef.current) return true;

                let drawBbox: [number, number, number, number] =
                    staticMap.extent ?? requestBbox;

                if (extentToProject && staticMap.extent) {
                    const srCrs = `EPSG:${requestSr}`;
                    const [exMinX, exMinY, exMaxX, exMaxY] = staticMap.extent;
                    const cs = [
                        proj4(srCrs, projectCrs, [exMinX, exMinY]) as [number, number],
                        proj4(srCrs, projectCrs, [exMaxX, exMinY]) as [number, number],
                        proj4(srCrs, projectCrs, [exMaxX, exMaxY]) as [number, number],
                        proj4(srCrs, projectCrs, [exMinX, exMaxY]) as [number, number],
                    ];
                    const xs = cs.map(c => c[0]);
                    const ys = cs.map(c => c[1]);
                    drawBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
                }

                setGoogleOverlayImage({
                    image: img,
                    bbox: drawBbox,
                    opacity: gm.opacity ?? 1.0,
                    source: staticMap.source,
                    mapType: 'naip',
                });
                setGoogleOverlayDiagnostic(null);
                return true;
            };

            try {
                // Preferred: reproject server-side into the project SR (exact
                // grid alignment when the ImageServer recognizes the EPSG).
                await runNaip(
                    [snapMinX, snapMinY, snapMaxX, snapMaxY],
                    currentSettings.projection.epsg,
                    false,
                );
            } catch (e) {
                if (seq !== googleOverlaySeqRef.current) return;
                // Fallback: many local/State-Plane EPSGs are not recognized by
                // the USGS ImageServer ("'imageSR' parameter is invalid"). Web
                // Mercator (3857) is universally supported, so reproject the
                // snapped extent into 3857 with proj4 and reproject the returned
                // extent back to project coords for drawing.
                try {
                    const c3857 = [
                        proj4(projectCrs, 'EPSG:3857', [snapMinX, snapMinY]) as [number, number],
                        proj4(projectCrs, 'EPSG:3857', [snapMaxX, snapMinY]) as [number, number],
                        proj4(projectCrs, 'EPSG:3857', [snapMaxX, snapMaxY]) as [number, number],
                        proj4(projectCrs, 'EPSG:3857', [snapMinX, snapMaxY]) as [number, number],
                    ];
                    const xs = c3857.map(c => c[0]);
                    const ys = c3857.map(c => c[1]);
                    if (c3857.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
                        throw new Error('Web Mercator reprojection produced non-finite coordinates');
                    }
                    await runNaip(
                        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
                        3857,
                        true,
                    );
                } catch (e2) {
                    if (seq !== googleOverlaySeqRef.current) return;
                    console.warn('[GoogleOverlay] NAIP overlay fetch failed:', e, e2);
                    setGoogleOverlayImage(null);
                    const detail = e2 instanceof Error && e2.message ? ` ${e2.message}` : '';
                    setGoogleOverlayDiagnostic({
                        tone: 'error',
                        message: `Map imagery fetch failed.${detail}`,
                    });
                }
            }
            return;
        }

        try {
            const staticMap = await getStaticMap(
                {
                    lat,
                    lng,
                    zoom,
                    width: 640,
                    height: 640,
                    maptype: resolvedMapType,
                },
                {
                    mapsKey: gm.apiKey || undefined,
                    geminiKey: currentSettings.userApiKey || undefined,
                }
            );

            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => reject(new Error('Overlay image decode failed'));
                i.src = staticMap.dataUrl;
            });

            const imageWgs = bboxFromCenterZoom(lat, lng, zoom, 640, 640);
            const projectedCorners = [
                proj4('EPSG:4326', projectCrs, [imageWgs.west, imageWgs.south]) as [number, number],
                proj4('EPSG:4326', projectCrs, [imageWgs.east, imageWgs.south]) as [number, number],
                proj4('EPSG:4326', projectCrs, [imageWgs.east, imageWgs.north]) as [number, number],
                proj4('EPSG:4326', projectCrs, [imageWgs.west, imageWgs.north]) as [number, number],
            ];
            const eastings = projectedCorners.map(p => p[0]);
            const northings = projectedCorners.map(p => p[1]);
            if (seq !== googleOverlaySeqRef.current) return;

            setGoogleOverlayImage({
                image: img,
                bbox: [Math.min(...eastings), Math.min(...northings), Math.max(...eastings), Math.max(...northings)],
                opacity: gm.opacity ?? 1.0,
                source: staticMap.source,
                mapType: resolvedMapType,
            });
            setGoogleOverlayDiagnostic(null);
        } catch (e) {
            if (seq !== googleOverlaySeqRef.current) return;
            console.warn('[GoogleOverlay] fetch failed:', e);
            setGoogleOverlayDiagnostic(e instanceof Error ? e.message : String(e));
        }
    }, 500), []);

    useEffect(() => {
        fetchGoogleOverlayImage(transform, settings, canvasRef.current);
    }, [transform, settings, fetchGoogleOverlayImage]);

    // Auto-fit the view to all points **only on the first non-empty load**, not
    // every time the point count changes. Previous code re-ran on every
    // points.length delta, which fought against per-operation zoom calls
    // (e.g. Draw Boundary's zoomToBbox) and zoomed the user out into a
    // state-plane sized void whenever new geometry landed on the canvas.
    useEffect(() => {
        if (!hasAutoFitOnceRef.current && points.length > 0) {
            hasAutoFitOnceRef.current = true;
            zoomExtents();
        }
        // Reset the latch when the canvas is cleared so the next load re-fits if no initialTransform.
        if (points.length === 0 && !initialTransform) {
            hasAutoFitOnceRef.current = false;
        }
    }, [points.length, initialTransform, zoomExtents]);
    
     useEffect(() => {
        if (zoomTarget) {
            const { northing, easting } = zoomTarget;
            const newScale = settings.zoomToPointLevel;

            const newOffsetX = containerRef.current!.clientWidth / 2 - easting * newScale;
            const newOffsetY = containerRef.current!.clientHeight / 2 + northing * newScale;

            setTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
            onZoomComplete();
        }
    }, [zoomTarget, onZoomComplete, settings.zoomToPointLevel]);


    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        // v26.05.25.2 — diagnostic BEFORE the canvas null guard so we can see if draw()
        // is being invoked at all but bailing because the ref isn't attached yet.
        console.log('[Draw] tick — canvasRef:', !!canvas, 'points:', points.length, 'lines:', lines.length,
            'boundaryFiles:', boundaryFiles ? boundaryFiles.length : 'undef',
            'bfVisible:', boundaryFiles ? boundaryFiles.filter(b => !b.hidden).length : 'n/a');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const isLightTheme = settings.theme === 'light';

        // HiDPI: bake devicePixelRatio into the base transform so every draw
        // call below can keep using CSS-pixel coordinates while the backing
        // store renders at full physical resolution — this is what keeps
        // vector strokes crisp at any zoom level.
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = canvas.width / dpr;   // CSS px
        const logicalHeight = canvas.height / dpr; // CSS px
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        // Image smoothing only affects drawImage (raster tiles, etc.) —
        // vector strokes are unaffected. Leave on so WMS / FEMA tiles stay
        // smooth when scaled.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // --- Faint futuristic background grid (screen-space, fixed density) ---
        // Drawn before the world-space transform so it stays a crisp fixed
        // reference grid regardless of pan/zoom — a subtle sci-fi HUD backdrop
        // rather than a survey-scale grid.
        if (isGridVisible) {
            ctx.save();
            const minorSpacing = 32; // CSS px
            const majorEvery = 4; // every 4th line is a "major" line
            const gridColor = isLightTheme ? 'rgba(15, 118, 140, 0.10)' : 'rgba(56, 224, 255, 0.07)';
            const majorGridColor = isLightTheme ? 'rgba(15, 118, 140, 0.18)' : 'rgba(56, 224, 255, 0.14)';
            // Offset the grid with the pan so it feels anchored to the world,
            // while spacing stays constant on screen (classic HUD grid look).
            const offX = ((transform.offsetX % minorSpacing) + minorSpacing) % minorSpacing;
            const offY = ((transform.offsetY % minorSpacing) + minorSpacing) % minorSpacing;
            ctx.lineWidth = 1;
            let col = Math.round(-offX / minorSpacing);
            for (let x = offX; x <= logicalWidth; x += minorSpacing, col++) {
                ctx.strokeStyle = (col % majorEvery === 0) ? majorGridColor : gridColor;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, 0);
                ctx.lineTo(x + 0.5, logicalHeight);
                ctx.stroke();
            }
            let row = Math.round(-offY / minorSpacing);
            for (let y = offY; y <= logicalHeight; y += minorSpacing, row++) {
                ctx.strokeStyle = (row % majorEvery === 0) ? majorGridColor : gridColor;
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(logicalWidth, y + 0.5);
                ctx.stroke();
            }
            ctx.restore();
        }

        // --- Pass 1: Draw world-space items ---
        ctx.save();
        ctx.translate(transform.offsetX, transform.offsetY);
        ctx.scale(transform.scale, -transform.scale); // Flip Y-axis for standard coordinate systems

        // Apply Orientation Tuple (OT / UCS) View rotation and origin translation if explicitly set
        const viewAngle = orientationTuple?.viewAngle ?? (orientationTuple?.mode === 'view' ? orientationTuple.angle : 0);
        const viewOriginX = orientationTuple?.viewOriginX ?? (orientationTuple?.mode === 'view' ? orientationTuple.originX : 0);
        const viewOriginY = orientationTuple?.viewOriginY ?? (orientationTuple?.mode === 'view' ? orientationTuple.originY : 0);

        if (viewAngle !== 0) {
            ctx.translate(viewOriginX, viewOriginY);
            ctx.rotate(viewAngle);
            ctx.translate(-viewOriginX, -viewOriginY);
        }

            const inverseScale = 1 / transform.scale;
            const annotationScalingMode = settings.pointAttributeScaling;
            const lineAnnotationWorldTextHeight = (multiplier: number = 1) => {
                if (annotationScalingMode === 'world') return 2.0 * lineLabelScale * multiplier;
                return 10 * lineLabelScale * inverseScale * multiplier;
            };
        // Minimum 1 CSS pixel — anything below produces sub-pixel alpha-blended
        // strokes that disappear at certain zooms, especially with transparent
        // colors (contours). A full screen pixel is the smallest crisp stroke a
        // canvas can render without fading out.
        const minScreenPixelWidth = 1 * inverseScale;
        const scaledLineWidth = Math.max(1 * inverseScale * lineThickness, minScreenPixelWidth);
        // Round caps/joins so single-pixel strokes never vanish at endpoints or
        // mitred joints between contour segments.
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw Google/NAIP basemap underlay
        if (googleOverlayImage) {
            const { image, bbox, opacity } = googleOverlayImage;
            const [minE, minN, maxE, maxN] = bbox;
            const worldWidth = maxE - minE;
            const worldHeight = maxN - minN;
            if (worldWidth > 0 && worldHeight > 0) {
                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.translate(minE, maxN);
                ctx.scale(1, -1);
                ctx.drawImage(image, 0, 0, worldWidth, worldHeight);
                ctx.restore();
            }
        }

        // Draw WMS images
        wmsImages.forEach(wmsImage => {
            const { image, bbox, opacity } = wmsImage;
            const [minE, minN, maxE, maxN] = bbox;
            const worldWidth = maxE - minE;
            const worldHeight = maxN - minN;

            if (worldWidth > 0 && worldHeight > 0) {
                ctx.save();
                ctx.globalAlpha = opacity;
                // The image needs to be flipped back vertically within the already-flipped canvas context.
                // Go to the top-left corner of the image in world coordinates.
                ctx.translate(minE, maxN);
                // Flip the context locally for this image drawing operation.
                ctx.scale(1, -1);
                // Draw the image at the new (0,0) of the translated-and-flipped context.
                ctx.drawImage(image, 0, 0, worldWidth, worldHeight);
                ctx.restore();
            }
        });
        
        // Draw offline maps
        offlineMapAreas.filter(area => area.isVisible).forEach(area => {
            area.layers.forEach(layer => {
                const key = `${area.id}-${layer.layerName}`;
                const img = offlineImages.get(key);
                if (img) {
                    ctx.save();
                    ctx.globalAlpha = layer.opacity;
                    const [minE, minN, maxE, maxN] = area.bbox;
                    const worldWidth = maxE - minE;
                    const worldHeight = maxN - minN;

                    if (worldWidth > 0 && worldHeight > 0) {
                        // Same logic as WMS: translate to top-left, local flip, then draw.
                        ctx.translate(minE, maxN);
                        ctx.scale(1, -1);
                        ctx.drawImage(img, 0, 0, worldWidth, worldHeight);
                    }
                    ctx.restore();
                }
            });
        });

        // Build a fast lookup of user-defined linetypes (from the CAD Manager standard).
        // Keys are upper-cased AND stripped of non-alphanumerics so "FENCE_LINE",
        // "FENCELINE", "FENCE-LINE", etc. all hash to the same entry.
        const normalizeLtName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const linetypeLookup = new Map<string, LinetypeDefinition>();
        if (standardLinetypes && standardLinetypes.length > 0) {
            for (const lt of standardLinetypes) {
                if (lt && lt.name) linetypeLookup.set(normalizeLtName(lt.name), lt);
            }
        }
        // One-shot diagnostic per *standard change* — uses standardLinetypes
        // length+name-signature as the key so HMR can't make it sticky.
        if (typeof window !== 'undefined') {
            const sig = `lt:${standardLinetypes?.length ?? 0}/lns:${lines.length}`;
            const last = (window as any).__ltDebugSig;
            if (last !== sig) {
                (window as any).__ltDebugSig = sig;
                const uniqueLineTypes = new Set<string>();
                const uniqueLayers = new Set<string>();
                let linesWithLineType = 0;
                let linesWithLayer = 0;
                const samples: any[] = [];
                for (const l of lines) {
                    if (l.lineType) { uniqueLineTypes.add(l.lineType); linesWithLineType++; }
                    if (l.layer) { uniqueLayers.add(l.layer); linesWithLayer++; }
                    if (samples.length < 5) {
                        samples.push({
                            id: l.id, from: l.from, to: l.to,
                            layer: l.layer, lineType: l.lineType, type: l.type,
                        });
                    }
                }
                 
                console.log('[Linetype Debug]', {
                    standardLinetypesCount: standardLinetypes?.length ?? 0,
                    lookupKeys: Array.from(linetypeLookup.keys()),
                    totalLines: lines.length,
                    linesWithLineType,
                    linesWithLayer,
                    lineTypesOnCanvas: Array.from(uniqueLineTypes),
                    layersOnCanvas: Array.from(uniqueLayers),
                    sampleLines: samples,
                });
            }
        }
        // Common AutoCAD spelling aliases — when the canvas line references one
        // name but the standard's linetype library uses the equivalent shorter
        // name (a near-universal mismatch in real-world CAD workflows).
        const LT_ALIASES: Record<string, string[]> = {
            FENCELINE: ['FENCE'],
            FENCE: ['FENCELINE', 'FENCELINE1', 'FENCELINE2'],
            PROPERTYLINE: ['PROPERTY'],
            PROPERTY: ['PROPERTYLINE'],
            EASEMENTLINE: ['EASEMENT'],
            EASEMENT: ['EASEMENTLINE'],
            WATERLINE: ['WATER'],
            WATER: ['WATERLINE'],
            SEWERLINE: ['SEWER'],
            SEWER: ['SEWERLINE'],
            GASLINE: ['GAS'],
            GAS: ['GASLINE'],
            ELECTRICLINE: ['ELECTRIC'],
            ELECTRIC: ['ELECTRICLINE'],
        };
        const lookupLinetype = (rawName: string): LinetypeDefinition | undefined => {
            const key = normalizeLtName(rawName);
            const direct = linetypeLookup.get(key);
            if (direct) return direct;
            const aliases = LT_ALIASES[key];
            if (aliases) {
                for (const alt of aliases) {
                    const hit = linetypeLookup.get(normalizeLtName(alt));
                    if (hit) return hit;
                }
            }
            return undefined;
        };

        // Resolve the effective linetype name for a SurveyLine. Priority:
        //   1) explicit line.lineType
        //   2) lookup by line.layer in the standard's codes (layerLinetypeMap)
        //   3) undefined → caller falls back to CONTINUOUS
        const resolveLineTypeName = (l: { lineType?: string; layer?: string }): string | undefined => {
            if (l.lineType && l.lineType.length > 0) return l.lineType;
            if (l.layer && layerLinetypeMap) {
                const hit = layerLinetypeMap[l.layer];
                if (hit) return hit;
            }
            return undefined;
        };

        // World-units → screen-pixel multiplier used when rendering a standard's
        // raw .lin pattern (which is expressed in drawing units). Tuned so a
        // 0.5-unit dash matches the legacy hardcoded "DASHED" 12-px dash.
        const LIN_UNIT_TO_PX = 24;

        // True when a linetype carries embedded shape/text glyphs that should be
        // stamped along the line (e.g. fence X, sewer S). Such linetypes can't
        // be expressed via setLineDash alone and need the complex renderer.
        const isComplexTextLinetype = (def: LinetypeDefinition | undefined): boolean => {
            if (!def || !def.shapeData || def.shapeData.length === 0) return false;
            return def.shapeData.some(sd => !!sd && (sd.isText || (sd.name && sd.name.length > 0)));
        };

        // Helper function to get line dash pattern based on CAD linetype
        // Pattern values are zoom-independent (multiplied by inverseScale) and respect
        // the global LTSCALE, the per-linetype scale, and an optional per-entity scale.
        const getLinetypePattern = (
            lineType: string | undefined,
            inverseScale: number,
            entityScale: number = 1,
        ): number[] => {
            if (!lineType) return []; // CONTINUOUS (default)
            const lt = lineType.toUpperCase();
            // Combined scale: zoom-independent base * project LTSCALE * per-entity CELTSCALE
            const baseScale = inverseScale * (globalLinetypeScale || 1) * (entityScale || 1);

            // 1) Prefer the user-defined linetype from the loaded CAD Manager standard.
            const userDef = lookupLinetype(lineType);
            if (userDef && userDef.pattern && userDef.pattern.length > 0) {
                const perLtScale = userDef.scale && userDef.scale > 0 ? userDef.scale : 1;
                const s = baseScale * perLtScale * LIN_UNIT_TO_PX;
                // .lin pattern: positive=dash, negative=gap, 0=dot/shape slot.
                // setLineDash only renders dash/gap cadence — text glyphs are
                // stamped separately by drawComplexLinetype. Here we collapse
                // any 0 (shape slot) into the *gap* on either side so the
                // canvas pattern still shows breaks where the glyphs go.
                const out: number[] = [];
                for (const v of userDef.pattern) {
                    if (v === 0) {
                        // Tiny 1-screen-pixel dash so the cadence stays visible
                        // even on linetypes that consist only of shape/gap pairs.
                        out.push(Math.max(0.5, 1) * inverseScale);
                    } else {
                        out.push(Math.abs(v) * s);
                    }
                }
                return out;
            }
            if (userDef && (!userDef.pattern || userDef.pattern.length === 0)) {
                return []; // Explicit CONTINUOUS authored in the standard
            }

            // 2) Fall back to the legacy built-in AutoCAD-like patterns.
            const s = baseScale; // legacy values were already in screen px @ scale=1
            switch (lt) {
                case 'CONTINUOUS':
                    return []; // Solid line
                case 'DASHED':
                    return [12 * s, 6 * s]; // __ __ __
                case 'HIDDEN':
                case 'HIDDEN2':
                    return [6 * s, 3 * s]; // _ _ _ _
                case 'DOT':
                case 'DOTTED':
                    return [1 * s, 4 * s]; // . . . .
                case 'DASHDOT':
                case 'CENTER':
                case 'CENTER2':
                    return [18 * s, 4 * s, 2 * s, 4 * s]; // ____ . ____ .
                case 'DIVIDE':
                case 'DIVIDE2':
                    return [12 * s, 4 * s, 2 * s, 4 * s, 2 * s, 4 * s]; // __ . . __ . .
                case 'PHANTOM':
                case 'PHANTOM2':
                    return [25 * s, 4 * s, 6 * s, 4 * s, 6 * s, 4 * s]; // _____ __ __ _____
                case 'BORDER':
                case 'BORDER2':
                    return [12 * s, 4 * s, 12 * s, 4 * s, 2 * s, 4 * s]; // __ __ . __ __ .
                case 'FENCELINE':
                case 'FENCELINE1':
                case 'FENCELINE2':
                    return [18 * s, 6 * s, 3 * s, 6 * s]; // ____X____X (approximation)
                case 'BATTING':
                    return [3 * s, 10 * s]; // Short dashes spaced far apart
                case 'ZIGZAG':
                    return [6 * s, 2 * s]; // Short zigzag approximation
                default:
                    // For unknown linetypes, treat as dashed (visible indicator)
                    if (lt.includes('DASH')) return [12 * s, 6 * s];
                    if (lt.includes('DOT')) return [1 * s, 4 * s];
                    if (lt.includes('CENTER')) return [18 * s, 4 * s, 2 * s, 4 * s];
                    if (lt.includes('HIDDEN')) return [6 * s, 3 * s];
                    return []; // Default to continuous
            }
        };

        /**
         * Render a single line segment using a *complex* linetype that carries
         * embedded text or shape glyphs (e.g. fence X, sewer S, water W).
         *
         * Walks the pattern cycle along the segment; for each element:
         *   - positive  → stroke a dash of that length
         *   - negative  → advance through a gap
         *   - zero      → stamp the next shape/text glyph rotated to line angle
         *
         * Falls back gracefully to a simple dashed stroke if the pattern has
         * no positive elements (degenerate) so the line is never invisible.
         *
         * Coordinates are in world space (canvas is already world-aligned with
         * Y flipped). Text glyphs are drawn upright by locally inverting Y.
         */
        const drawComplexLinetype = (
            x1: number, y1: number, x2: number, y2: number,
            def: LinetypeDefinition,
            entityScale: number,
            strokeColor: string,
            strokeWidth: number,
        ) => {
            const dx = x2 - x1, dy = y2 - y1;
            const segLen = Math.hypot(dx, dy);
            if (segLen < 1e-9) return;
            const ux = dx / segLen, uy = dy / segLen;
            const angle = Math.atan2(dy, dx); // world frame (Y up)

            const perLtScale = def.scale && def.scale > 0 ? def.scale : 1;
            // .lin drawing-unit → world unit multiplier at current zoom.
            const unitScale =
                (globalLinetypeScale || 1) *
                perLtScale *
                (entityScale || 1) *
                LIN_UNIT_TO_PX *
                inverseScale;

            // Pre-build the cycle: alternating dash/gap/glyph entries.
            const cycle: Array<{ kind: 'dash' | 'gap' | 'glyph' | 'arc'; size: number; shape?: any }> = [];
            let shapeIdx = 0;
            let cycleLen = 0;
            for (const v of def.pattern) {
                if (v > 0) {
                    const sz = v * unitScale;
                    cycle.push({ kind: 'dash', size: sz });
                    cycleLen += sz;
                } else if (v < 0) {
                    const sz = Math.abs(v) * unitScale;
                    cycle.push({ kind: 'gap', size: sz });
                    cycleLen += sz;
                } else {
                    const sd = def.shapeData?.[shapeIdx++];
                    if (sd && (sd as any).arc) {
                        // Arc bump consumes chord length along the line.
                        const chord = ((sd.scale && sd.scale > 0 ? sd.scale : 0.5)) * unitScale;
                        cycle.push({ kind: 'arc', size: chord, shape: sd });
                        cycleLen += chord;
                    } else {
                        cycle.push({ kind: 'glyph', size: 0, shape: sd });
                    }
                }
            }

            // Defensive fallback if there's no cadence to advance through.
            if (cycleLen <= 0) {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                return;
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.setLineDash([]);

            let dist = 0;
            // Cap iterations defensively — very long lines with a tiny cycle
            // could otherwise blow the loop counter on bad input.
            const maxIters = Math.ceil((segLen / cycleLen) * cycle.length) + cycle.length + 8;
            let iter = 0;
            while (dist < segLen && iter++ < maxIters) {
                for (const el of cycle) {
                    if (dist >= segLen) break;
                    if (el.kind === 'dash') {
                        const end = Math.min(dist + el.size, segLen);
                        ctx.beginPath();
                        ctx.moveTo(x1 + ux * dist, y1 + uy * dist);
                        ctx.lineTo(x1 + ux * end, y1 + uy * end);
                        ctx.stroke();
                        dist = end;
                    } else if (el.kind === 'gap') {
                        dist += el.size;
                    } else if (el.kind === 'arc' && el.shape) {
                        // Semicircle bump (revision-cloud / treeline foliage).
                        const chord = Math.min(el.size, segLen - dist);
                        if (chord > 0) {
                            const sx = x1 + ux * dist;
                            const sy = y1 + uy * dist;
                            const ex = x1 + ux * (dist + chord);
                            const ey = y1 + uy * (dist + chord);
                            const cx = (sx + ex) / 2;
                            const cy = (sy + ey) / 2;
                            const r = chord / 2;
                            const side: 1 | -1 = el.shape.arcSide === -1 ? -1 : 1;
                            // Arc from start angle (pointing back toward sx,sy)
                            // around to end angle (pointing toward ex,ey),
                            // bulging perpendicular to the line on `side`.
                            const baseAngle = Math.atan2(sy - cy, sx - cx);
                            const endAngle = Math.atan2(ey - cy, ex - cx);
                            ctx.beginPath();
                            // ccw flag chooses which side the arc bulges.
                            // Canvas Y is flipped (world Y-up), so side=+1
                            // (left of line dir in world) needs ccw=false here.
                            ctx.arc(cx, cy, r, baseAngle, endAngle, side === 1 ? false : true);
                            ctx.stroke();
                        }
                        dist += el.size;
                    } else if (el.kind === 'glyph' && el.shape) {
                        const sd = el.shape;
                        const label = (sd.name || '').trim();
                        if (label) {
                            // Place the glyph at the *centre* of the surrounding
                            // gap (i.e. current dist) so it sits cleanly in the
                            // break. Honours .lin X/Y offsets too.
                            const xOff = (sd.xOffset || 0) * unitScale;
                            const yOff = (sd.yOffset || 0) * unitScale;
                            const textScale = sd.scale && sd.scale > 0 ? sd.scale : 0.1;
                            // Glyph height in world units. The 2.0× multiplier
                            // tunes the .lin "S=" (which is half-height in
                            // AutoCAD) to a legible canvas character.
                            const glyphPx = textScale * unitScale * 2.0;
                            const px = x1 + ux * dist;
                            const py = y1 + uy * dist;

                            ctx.save();
                            ctx.translate(px, py);
                            ctx.rotate(angle);
                            // Counter-act the main canvas Y-flip so text reads
                            // right-way-up regardless of line angle.
                            ctx.scale(1, -1);
                            ctx.fillStyle = strokeColor;
                            ctx.font = `bold ${glyphPx}px Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(label, xOff, -yOff);
                            ctx.restore();
                        }
                        // Shapes are zero-length in the pattern cycle.
                    }
                }
            }
        };

        // Draw selection highlights and grips (rendered before lines so highlight is under the line)
        if (selectedLineIds.size > 0) {
            const selStroke = isLightTheme ? '#0284C7' : '#38BDF8';
            const selWidth = Math.max(scaledLineWidth + 1.2 * inverseScale, minScreenPixelWidth * 1.5);

            selectedLineIds.forEach(selId => {
                const selLine = lines.find(l => (l.id || `${l.from}-${l.to}`) === selId);
                if (!selLine) return;
                const sp1 = pointMap.get(selLine.from);
                const sp2 = pointMap.get(selLine.to);
                const sp1c = sp1 ? { x: sp1.easting, y: sp1.northing } : (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : null);
                const sp2c = sp2 ? { x: sp2.easting, y: sp2.northing } : (selLine.toPt ? { x: selLine.toPt.x, y: selLine.toPt.y } : null);
                if (!sp1c) return;

                const isCircleEntity = selLine.isCircle || (selLine.isCurve && selLine.curveRadius && (!selLine.fromPt || (sp1c && sp2c && sp1c.x === sp2c.x && sp1c.y === sp2c.y)) && !selLine.tangentBearing && !selLine.chordBearing);
                if (isCircleEntity && selLine.curveRadius) {
                    const center = selLine.circleCenter || (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : sp1c);
                    if (center) {
                        ctx.save();
                        ctx.strokeStyle = selStroke;
                        ctx.lineWidth = selWidth;
                        ctx.setLineDash([5 * inverseScale, 3 * inverseScale]);
                        ctx.beginPath();
                        ctx.arc(center.x, center.y, selLine.curveRadius, 0, 2 * Math.PI);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }
                } else if (selLine.isCurve && selLine.curveRadius && selLine.arcLength) {
                    let curveSel = selLine;
                    const radius = curveSel.curveRadius!;
                    const arcLength = curveSel.arcLength!;
                    const centralAngle = arcLength / radius;

                    if (!curveSel.tangentBearing && !curveSel.chordBearing && !curveSel.bearing && sp2c) {
                        const dE = sp2c.x - sp1c.x;
                        const dN = sp2c.y - sp1c.y;
                        if (Math.hypot(dE, dN) > 1e-9) {
                            let az = Math.atan2(dE, dN);
                            if (az < 0) az += 2 * Math.PI;
                            curveSel = { ...curveSel, chordBearing: formatBearing(az) };
                        }
                    }

                    const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
                    let isLeftCurve = false;
                    if (curveSel.curveDirection === 'left') {
                        isLeftCurve = true;
                    } else if (curveSel.curveDirection === 'right') {
                        isLeftCurve = false;
                    } else {
                        const tempTangent = curveSel.tangentBearing ? parseBearingToRadians(curveSel.tangentBearing) : null;
                        if (tempTangent !== null) {
                            const dirBearingStr = curveSel.chordBearing || curveSel.bearing;
                            if (dirBearingStr) {
                                const dirRad = parseBearingToRadians(dirBearingStr);
                                if (dirRad !== null) {
                                    const halfDelta = centralAngle / 2;
                                    const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                                    const expectedLeftChord  = normalizeAng(tempTangent - halfDelta);
                                    const dirNorm = normalizeAng(dirRad);
                                    const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                                    const diffLeft  = Math.min(Math.abs(dirNorm - expectedLeftChord),  2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                                    if (diffLeft < diffRight) isLeftCurve = true;
                                }
                            }
                        }
                    }

                    const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                    const chordStrArc = curveSel.chordBearing || curveSel.bearing;
                    const chordRadArc = chordStrArc ? parseBearingToRadians(chordStrArc) : null;
                    const tangentAngle: number | null = chordRadArc !== null
                        ? chordRadArc - signedDeltaArc / 2
                        : (curveSel.tangentBearing ? parseBearingToRadians(curveSel.tangentBearing) : null);

                    if (tangentAngle !== null) {
                        const canvasTangentAngle = Math.PI / 2 - tangentAngle;
                        const centerOffsetAngle = isLeftCurve
                            ? canvasTangentAngle + Math.PI / 2
                            : canvasTangentAngle - Math.PI / 2;
                        const centerX = sp1c.x + radius * Math.cos(centerOffsetAngle);
                        const centerY = sp1c.y + radius * Math.sin(centerOffsetAngle);
                        const startAngle = Math.atan2(sp1c.y - centerY, sp1c.x - centerX);
                        const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;
                        const arcAnticlockwise = !isLeftCurve;
                        const ptX = centerX + radius * Math.cos(endAngle);
                        const ptY = centerY + radius * Math.sin(endAngle);

                        ctx.save();
                        ctx.strokeStyle = selStroke;
                        ctx.lineWidth = selWidth;
                        ctx.setLineDash([5 * inverseScale, 3 * inverseScale]);
                        ctx.beginPath();
                        ctx.moveTo(sp1c.x, sp1c.y);
                        ctx.arc(centerX, centerY, radius, startAngle, endAngle, arcAnticlockwise);
                        ctx.lineTo(ptX, ptY);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }
                } else if (sp1c && sp2c) {
                    ctx.save();
                    ctx.strokeStyle = selStroke;
                    ctx.lineWidth = selWidth;
                    ctx.setLineDash([5 * inverseScale, 3 * inverseScale]);
                    ctx.beginPath();
                    ctx.moveTo(sp1c.x, sp1c.y);
                    ctx.lineTo(sp2c.x, sp2c.y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                }
            });

            // Draw Grip handles on selected entities
            const allGrips = getGripsForSelectedLines();
            const gripSize = 6 * inverseScale;
            allGrips.forEach(grip => {
                const isAct = activeGrip?.id === grip.id;
                const isHov = hoveredGrip?.id === grip.id;
                ctx.save();
                ctx.beginPath();
                ctx.rect(grip.x - gripSize / 2, grip.y - gripSize / 2, gripSize, gripSize);
                ctx.fillStyle = isAct ? '#EF4444' : isHov ? '#F59E0B' : '#0284C7';
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1 * inverseScale;
                ctx.stroke();
                ctx.restore();
            });

            // Draw Active Grip Stretch rubberband preview
            if (activeGrip && cursorWorldPosRef.current) {
                const curP = activeOsnapPoint
                    ? { x: activeOsnapPoint.easting, y: activeOsnapPoint.northing }
                    : cursorWorldPosRef.current;
                const selLine = activeGrip.line;
                const sp1 = pointMap.get(selLine.from);
                const sp2 = pointMap.get(selLine.to);
                const p1c = sp1 ? { x: sp1.easting, y: sp1.northing } : (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : null);
                const p2c = sp2 ? { x: sp2.easting, y: sp2.northing } : (selLine.toPt ? { x: selLine.toPt.x, y: selLine.toPt.y } : null);

                ctx.save();
                ctx.strokeStyle = '#F59E0B'; // Amber stretch line
                ctx.lineWidth = Math.max(scaledLineWidth * 1.2, minScreenPixelWidth);
                ctx.setLineDash([4 * inverseScale, 3 * inverseScale]);

                const isCircleEntity = selLine.isCircle || (selLine.isCurve && selLine.curveRadius && (!selLine.fromPt || (p1c && p2c && p1c.x === p2c.x && p1c.y === p2c.y)) && !selLine.tangentBearing && !selLine.chordBearing);

                if (isCircleEntity && selLine.curveRadius) {
                    if (activeGrip.type === 'center') {
                        ctx.beginPath();
                        ctx.arc(curP.x, curP.y, selLine.curveRadius, 0, 2 * Math.PI);
                        ctx.stroke();
                    } else if (activeGrip.type === 'quadrant') {
                        const center = selLine.circleCenter || (selLine.fromPt ? { x: selLine.fromPt.x, y: selLine.fromPt.y } : p1c);
                        if (center) {
                            const newR = Math.hypot(curP.x - center.x, curP.y - center.y);
                            ctx.beginPath();
                            ctx.arc(center.x, center.y, newR, 0, 2 * Math.PI);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(center.x, center.y);
                            ctx.lineTo(curP.x, curP.y);
                            ctx.stroke();
                        }
                    }
                } else if (p1c && p2c) {
                    if (activeGrip.type === 'start') {
                        ctx.beginPath();
                        ctx.moveTo(curP.x, curP.y);
                        ctx.lineTo(p2c.x, p2c.y);
                        ctx.stroke();
                    } else if (activeGrip.type === 'end') {
                        ctx.beginPath();
                        ctx.moveTo(p1c.x, p1c.y);
                        ctx.lineTo(curP.x, curP.y);
                        ctx.stroke();
                    } else if (activeGrip.type === 'mid') {
                        const dx = curP.x - activeGrip.x;
                        const dy = curP.y - activeGrip.y;
                        ctx.beginPath();
                        ctx.moveTo(p1c.x + dx, p1c.y + dy);
                        ctx.lineTo(p2c.x + dx, p2c.y + dy);
                        ctx.stroke();
                    }
                }
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Draw lines
        // Keep steep-slope geometry behind contours and design lines so contour
        // generations remain readable after steep-slope analysis.
        const orderedLines = [...lines].sort((a, b) => {
            const aSteep = a.type === 'steep-slope' ? 0 : 1;
            const bSteep = b.type === 'steep-slope' ? 0 : 1;
            return aSteep - bSteep;
        });
        orderedLines.forEach(line => {
            // Skip curve lines - they will be rendered as smooth arcs in the curve rendering pass
            if (line.isCurve) {
                return; // Skip - we'll handle curves separately below
            }
            // In shaded TIN mode, suppress imported TIN edge overlay linework so
            // only the surface shading is shown.
            if (isTinShadingEnabled && line.type === 'tin-edge') {
                return;
            }
            // Skip lines toggled off (e.g. hidden steep-slope geometry).
            if (line.hidden) {
                return;
            }
            
            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);
            
            const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);

            if (p1Coords && p2Coords) {
                // Determine line styling
                let strokeStyle = isLightTheme ? '#111827' : '#FFFFFF';
                let lineWidth = scaledLineWidth;
                let isDashed = false;

                if (line.type === 'breakline') {
                    strokeStyle = '#FF69B4'; // Hot Pink
                    lineWidth = scaledLineWidth * 1.5;
                } else if (line.type === 'inclusion') {
                    strokeStyle = '#34D399'; // Green-400
                    lineWidth = scaledLineWidth * 1.5;
                } else if (line.type === 'shrinkwrap-preview') {
                    strokeStyle = '#A78BFA'; // Violet-400
                    lineWidth = scaledLineWidth * 1.5;
                    isDashed = true;
                } else if (line.type === 'exclusion') {
                    strokeStyle = '#F87171'; // Red-400
                    lineWidth = scaledLineWidth * 1.5;
                    isDashed = true;
                } else if (line.type?.startsWith('contour')) {
                     // Use fully opaque colors — combining low alpha with a 1px
                     // stroke previously made contours fade to invisible. Width
                     // (not transparency) distinguishes major from minor.
                     // Dark-theme colors are kept bright enough to read on the
                     // bare canvas, so contours stay visible when the steep-slope
                     // fill backdrop is hidden (previously they vanished without
                     // the green fill behind them).
                     const majorColor = isLightTheme ? '#4B5563' : '#CBD5E1';
                     const minorColor = isLightTheme ? '#6B7280' : '#94A3B8';
                     strokeStyle = line.type === 'contour-major' ? majorColor : minorColor;
                     // Floor at 1 CSS pixel so contours never disappear when
                     // zoomed out. Major contours render slightly thicker.
                     lineWidth = Math.max(
                         line.type === 'contour-major' ? scaledLineWidth * 1.25 : scaledLineWidth,
                         minScreenPixelWidth
                     );
                } else if (line.type === 'parcel') {
                    // County tax-parcel boundary — distinct amber so it stands
                    // apart from breaklines/contours and reads at any zoom.
                    strokeStyle = isLightTheme ? 'rgba(180, 83, 9, 0.85)' : 'rgba(251, 191, 36, 0.85)';
                    lineWidth = Math.max(scaledLineWidth * 0.7, minScreenPixelWidth);
                } else if (line.type === 'flood') {
                    // FEMA NFHL flood-hazard polygon ring — cyan to distinguish
                    // from parcel (amber) and contours (gray).
                    strokeStyle = isLightTheme ? 'rgba(8, 145, 178, 0.85)' : 'rgba(34, 211, 238, 0.85)';
                    lineWidth = Math.max(scaledLineWidth * 0.7, minScreenPixelWidth);
                    isDashed = true;
                } else if (line.type === 'steep-slope') {
                    const explicitColor = line.color;
                    strokeStyle = explicitColor
                        ? `${explicitColor}ff`
                        : (isLightTheme ? 'rgba(239, 68, 68, 0.92)' : 'rgba(248, 113, 113, 0.92)');
                    lineWidth = Math.max(scaledLineWidth * 0.55, minScreenPixelWidth * 0.6);
                    if (line.fillPath && line.fillPath.length >= 3) {
                        const alphaColor = explicitColor
                            ? `${explicitColor}e6`
                            : (isLightTheme ? 'rgba(239, 68, 68, 0.90)' : 'rgba(248, 113, 113, 0.90)');

                        ctx.beginPath();
                        ctx.moveTo(line.fillPath[0].x, line.fillPath[0].y);
                        for (let i = 1; i < line.fillPath.length; i++) {
                            ctx.lineTo(line.fillPath[i].x, line.fillPath[i].y);
                        }
                        ctx.closePath();
                        ctx.fillStyle = alphaColor;
                        ctx.fill();

                        // Subtle edge so adjacent triangles remain readable.
                        ctx.strokeStyle = strokeStyle;
                        ctx.lineWidth = Math.max(scaledLineWidth * 0.35, minScreenPixelWidth * 0.45);
                        ctx.stroke();
                        return;
                    }
                }

                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth;

                // Complex linetypes (fence X, sewer S, water W, …) carry shape
                // glyphs that must be stamped along the line. Route those to
                // the dedicated walker so the text is actually visible.
                const effectiveLineTypeName = resolveLineTypeName(line);
                const complexDef = effectiveLineTypeName ? lookupLinetype(effectiveLineTypeName) : undefined;
                if (complexDef && isComplexTextLinetype(complexDef)) {
                    drawComplexLinetype(
                        p1Coords.x, p1Coords.y,
                        p2Coords.x, p2Coords.y,
                        complexDef,
                        line.lineTypeScale ?? 1,
                        strokeStyle,
                        lineWidth,
                    );
                } else {
                    // Draw straight line
                    ctx.beginPath();
                    ctx.moveTo(p1Coords.x, p1Coords.y);
                    ctx.lineTo(p2Coords.x, p2Coords.y);

                    // Apply line pattern: CAD lineType takes precedence, then special types (exclusion), then solid
                    let dashPattern: number[] = [];
                    if (effectiveLineTypeName) {
                        // CAD linetype from CAD Manager standard (with per-entity CELTSCALE)
                        dashPattern = getLinetypePattern(effectiveLineTypeName, inverseScale, line.lineTypeScale);
                    } else if (isDashed) {
                        // Fallback for exclusion lines
                        const dashSize = 5 * inverseScale;
                        dashPattern = [dashSize, dashSize];
                    }

                    if (dashPattern.length > 0) {
                        ctx.setLineDash(dashPattern);
                    }
                    ctx.stroke();
                    if (dashPattern.length > 0) {
                        ctx.setLineDash([]);
                    }
                }
            }
        });

        // ── FEMA Flood-Zone Hatch Fill ──────────────────────────────────────
        // Uses pre-computed rings (floodRings memo) + createPattern() tile so
        // each polygon is filled with a single ctx.fill() call — no per-line
        // stroke loops that crash the browser on large flood zones.
        {
            const hatchCfg = settings.floodHatch;
            const hatchStyle = hatchCfg?.style ?? 'lines';
            if (hatchStyle !== 'none' && floodRings.size > 0) {
                const hatchOpacity = hatchCfg?.opacity ?? 0.18;
                const hatchScaleWorld = hatchCfg?.scale ?? 50;
                const hatchSpacePx = Math.max(6, Math.min(60, hatchScaleWorld * transform.scale));
                const hatchColor = isLightTheme ? `rgba(8,145,178,${hatchOpacity})` : `rgba(34,211,238,${hatchOpacity})`;

                // Build a small repeating tile once per style/spacing/color
                const tileSize = Math.round(hatchSpacePx);
                const tile = document.createElement('canvas');
                tile.width = tileSize * (hatchStyle === 'cross' ? 1 : 1);
                tile.height = tileSize;
                const tc = tile.getContext('2d')!;
                tc.clearRect(0, 0, tile.width, tile.height);
                tc.strokeStyle = hatchColor;
                tc.fillStyle = hatchColor;
                tc.lineWidth = 0.8;

                if (hatchStyle === 'dots') {
                    const r = Math.max(1, tileSize * 0.12);
                    tc.beginPath();
                    tc.arc(0, 0, r, 0, 2 * Math.PI);
                    tc.arc(tileSize, 0, r, 0, 2 * Math.PI);
                    tc.arc(0, tileSize, r, 0, 2 * Math.PI);
                    tc.arc(tileSize / 2, tileSize / 2, r, 0, 2 * Math.PI);
                    tc.fill();
                } else if (hatchStyle === 'chevron') {
                    const h = tileSize / 2;
                    tc.beginPath();
                    tc.moveTo(0, h); tc.lineTo(tileSize / 2, 0); tc.lineTo(tileSize, h);
                    tc.moveTo(0, tileSize); tc.lineTo(tileSize / 2, h); tc.lineTo(tileSize, tileSize);
                    tc.stroke();
                } else {
                    // 'lines' — one diagonal line through tile; 'cross' — two
                    tc.beginPath();
                    tc.moveTo(0, 0); tc.lineTo(tileSize, tileSize);
                    tc.moveTo(-tileSize, 0); tc.lineTo(0, tileSize);
                    tc.moveTo(tileSize, 0); tc.lineTo(tileSize * 2, tileSize);
                    tc.stroke();
                    if (hatchStyle === 'cross') {
                        tc.beginPath();
                        tc.moveTo(tileSize, 0); tc.lineTo(0, tileSize);
                        tc.moveTo(0, 0); tc.lineTo(-tileSize, tileSize);
                        tc.moveTo(tileSize * 2, 0); tc.lineTo(tileSize, tileSize);
                        tc.stroke();
                    }
                }

                const pattern = ctx.createPattern(tile, 'repeat');

                // World→screen projection
                const toScreenX = (wx: number) => wx * transform.scale + transform.offsetX;
                const toScreenY = (wy: number) => -wy * transform.scale + transform.offsetY;

                for (const ring of floodRings.values()) {
                    const sx0 = toScreenX(ring[0].x), sy0 = toScreenY(ring[0].y);
                    // Quick off-screen cull
                    let bx0 = sx0, by0 = sy0, bx1 = sx0, by1 = sy0;
                    for (let i = 1; i < ring.length; i++) {
                        const sx = toScreenX(ring[i].x), sy = toScreenY(ring[i].y);
                        if (sx < bx0) bx0 = sx; if (sx > bx1) bx1 = sx;
                        if (sy < by0) by0 = sy; if (sy > by1) by1 = sy;
                    }
                    if (bx1 < 0 || by1 < 0 || bx0 > canvas.clientWidth || by0 > canvas.clientHeight) continue;

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(sx0, sy0);
                    for (let i = 1; i < ring.length; i++) {
                        ctx.lineTo(toScreenX(ring[i].x), toScreenY(ring[i].y));
                    }
                    ctx.closePath();
                    if (pattern) {
                        ctx.fillStyle = pattern;
                    } else {
                        ctx.fillStyle = hatchColor;
                    }
                    ctx.fill();
                    ctx.restore();
                }
            }
        }

        // Draw curve lines (smooth arcs & full circles)
        curveLabelBoxesRef.current.clear();
        lines.forEach(line => {
            if (!line.isCurve && !line.isCircle) {
                return; // Only process curve/circle lines
            }
            
            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);

            const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);

            // Handle Full Circles
            const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (p1Coords && p2Coords && p1Coords.x === p2Coords.x && p1Coords.y === p2Coords.y)) && !line.tangentBearing && !line.chordBearing);
            if (isCircleEntity && line.curveRadius) {
                const center = line.circleCenter || (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : p1Coords);
                if (!center) return;

                let strokeStyle = isLightTheme ? '#111827' : '#FFFFFF';
                let lineWidth = scaledLineWidth;
                let isDashed = false;

                if (line.type === 'breakline') {
                    strokeStyle = '#FF69B4';
                    lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                } else if (line.type === 'inclusion') {
                    strokeStyle = '#34D399';
                    lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                } else if (line.type === 'shrinkwrap-preview') {
                    strokeStyle = '#A78BFA';
                    lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                    isDashed = true;
                } else if (line.type === 'exclusion') {
                    strokeStyle = '#F87171';
                    lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                    isDashed = true;
                }

                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth;

                ctx.beginPath();
                ctx.arc(center.x, center.y, line.curveRadius, 0, 2 * Math.PI);

                let dashPattern: number[] = [];
                const effectiveCurveLineTypeName = resolveLineTypeName(line);
                if (effectiveCurveLineTypeName) {
                    dashPattern = getLinetypePattern(effectiveCurveLineTypeName, inverseScale, line.lineTypeScale);
                } else if (isDashed) {
                    const dashSize = 5 * inverseScale;
                    dashPattern = [dashSize, dashSize];
                }
                
                if (dashPattern.length > 0) {
                    ctx.setLineDash(dashPattern);
                }
                ctx.stroke();
                if (dashPattern.length > 0) {
                    ctx.setLineDash([]);
                }
                return;
            }

            // If the AI omitted bearings (common for full circles where the JSON only carries
            // R / arcLength / curveDirection), derive a chord bearing from the two endpoints.
            // Skip if the chord is degenerate (e.g. full-circle 360° case where p1==p2 — caller
            // is expected to split a full circle into two 180° arcs with distinct endpoints).
            if (!line.tangentBearing && !line.chordBearing && !line.bearing && p1Coords && p2Coords) {
                const dE = p2Coords.x - p1Coords.x;
                const dN = p2Coords.y - p1Coords.y;
                if (Math.hypot(dE, dN) > 1e-9) {
                    let az = Math.atan2(dE, dN); // bearing radians (N=0, CW)
                    if (az < 0) az += 2 * Math.PI;
                    line = { ...line, chordBearing: formatBearing(az) };
                }
            }

            if (!line.curveRadius || !line.arcLength || (!line.tangentBearing && !line.chordBearing && !line.bearing)) {
                return; // Need radius, arc length, and at least one bearing to work with
            }
            
            if (!p1Coords) {
                return; // Need start point
            }

            // Determine line styling
            let strokeStyle = isLightTheme ? '#111827' : '#FFFFFF';
            let lineWidth = scaledLineWidth; // Already has minimum applied
            let isDashed = false;

            if (line.type === 'breakline') {
                strokeStyle = '#FF69B4'; // Hot Pink
                lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
            } else if (line.type === 'inclusion') {
                strokeStyle = '#34D399'; // Green-400
                lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
            } else if (line.type === 'shrinkwrap-preview') {
                strokeStyle = '#A78BFA'; // Violet-400
                lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                isDashed = true;
            } else if (line.type === 'exclusion') {
                strokeStyle = '#F87171'; // Red-400
                lineWidth = Math.max(scaledLineWidth * 1.5, minScreenPixelWidth);
                isDashed = true;
            }

            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;

            const radius = line.curveRadius;
            const arcLength = line.arcLength;
            const centralAngle = arcLength / radius; // Radians
            
            // Determine curve direction FIRST (independent of tangentBearing)
                const normalizeAng = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
                let isLeftCurve = false;
                if (line.curveDirection === 'left') {
                    isLeftCurve = true;
                } else if (line.curveDirection === 'right') {
                    isLeftCurve = false;
                } else {
                    // Fallback: use AI-provided tangentBearing (if any) to compare chord bearing
                    const tempTangent = line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null;
                    if (tempTangent !== null) {
                        const dirBearingStr = line.chordBearing || line.bearing;
                        if (dirBearingStr) {
                            const dirRad = parseBearingToRadians(dirBearingStr);
                            if (dirRad !== null) {
                                const halfDelta = centralAngle / 2;
                                const expectedRightChord = normalizeAng(tempTangent + halfDelta);
                                const expectedLeftChord  = normalizeAng(tempTangent - halfDelta);
                                const dirNorm = normalizeAng(dirRad);
                                const diffRight = Math.min(Math.abs(dirNorm - expectedRightChord), 2 * Math.PI - Math.abs(dirNorm - expectedRightChord));
                                const diffLeft  = Math.min(Math.abs(dirNorm - expectedLeftChord),  2 * Math.PI - Math.abs(dirNorm - expectedLeftChord));
                                if (diffLeft < diffRight) isLeftCurve = true;
                            }
                        }
                    }
                }

                // Resolve tangent bearing geometrically: tangentBearing = chordBearing - signedΔ/2
                // More reliable than AI-provided tangentBearing which is sometimes incorrect.
                const signedDeltaArc = isLeftCurve ? -centralAngle : centralAngle;
                const chordStrArc = line.chordBearing || line.bearing;
                const chordRadArc = chordStrArc ? parseBearingToRadians(chordStrArc) : null;
                const tangentAngle: number | null = chordRadArc !== null
                    ? chordRadArc - signedDeltaArc / 2
                    : (line.tangentBearing ? parseBearingToRadians(line.tangentBearing) : null);

            if (tangentAngle !== null) {
                // Convert bearing angle to canvas angle
                // Bearing: 0=North, π/2=East, π=South, 3π/2=West (clockwise from north)
                // Canvas: 0=East, π/2=North, π=West, 3π/2=South (counter-clockwise from east)
                const canvasTangentAngle = Math.PI / 2 - tangentAngle;

                // Center is 90° to the right (right curve) or left (left curve) of tangent direction
                const centerOffsetAngle = isLeftCurve
                    ? canvasTangentAngle + Math.PI / 2   // Left curve: center to the left
                    : canvasTangentAngle - Math.PI / 2;  // Right curve: center to the right
                const centerX = p1Coords.x + radius * Math.cos(centerOffsetAngle);
                const centerY = p1Coords.y + radius * Math.sin(centerOffsetAngle);

                // Calculate start angle from center to PC (start point)
                const startAngle = Math.atan2(p1Coords.y - centerY, p1Coords.x - centerX);
                // In Y-flipped canvas: anticlockwise=true → CW in world (right curve)
                //                     anticlockwise=false → CCW in world (left curve)
                const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;
                const arcAnticlockwise = !isLeftCurve;

                // Calculate the endpoint PT coordinates for visual closure
                const ptX = centerX + radius * Math.cos(endAngle);
                const ptY = centerY + radius * Math.sin(endAngle);

                // Draw the arc
                ctx.beginPath();
                ctx.moveTo(p1Coords.x, p1Coords.y);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle, arcAnticlockwise);
                ctx.lineTo(ptX, ptY); // Ensure connection ends cleanly at PT
                
                // Apply line pattern: CAD lineType takes precedence, then special types (exclusion), then solid
                let dashPattern: number[] = [];
                const effectiveCurveLineTypeName = resolveLineTypeName(line);
                if (effectiveCurveLineTypeName) {
                    dashPattern = getLinetypePattern(effectiveCurveLineTypeName, inverseScale, line.lineTypeScale);
                } else if (isDashed) {
                    const dashSize = 5 * inverseScale;
                    dashPattern = [dashSize, dashSize];
                }
                
                if (dashPattern.length > 0) {
                    ctx.setLineDash(dashPattern);
                }
                ctx.stroke();
                if (dashPattern.length > 0) {
                    ctx.setLineDash([]);
                }

                // Draw curve annotation with curve parameters — but only when this looks
                // like a boundary call (AI-provided bearing/distance, or an explicit boundary
                // line type). Ad-hoc curves such as user-drawn circles or geometric arcs that
                // arrive with only R/L/Δ/curveDirection should render silently.
                const isBoundaryCurve = !!(line.bearing || line.distance
                    || line.type === 'parcel' || line.type === 'inclusion' || line.type === 'exclusion');
                if (line.curveRadius && line.arcLength && isBoundaryCurve) {
                    // Calculate delta angle in degrees from radians
                    const deltaDegreesTotal = (centralAngle * 180) / Math.PI;
                    const deltaDegrees = Math.floor(deltaDegreesTotal);
                    const deltaMinutes = Math.floor((deltaDegreesTotal - deltaDegrees) * 60);
                    const deltaSeconds = Math.round(((deltaDegreesTotal - deltaDegrees) * 60 - deltaMinutes) * 60);

                    // Position annotation at the midpoint of the arc
                    const midAngle = startAngle - centralAngle / 2;
                    const annotationDistance = radius * 1.3; // Position slightly beyond the arc
                    const offsetX = line.labelOffset?.x || 0;
                    const offsetY = line.labelOffset?.y || 0;
                    const annotX = centerX + annotationDistance * Math.cos(midAngle) + offsetX;
                    const annotY = centerY + annotationDistance * Math.sin(midAngle) + offsetY;

                    // Create stacked annotation text (same format as B&D labels)
                    const chordParts: string[] = [];
                    if (agentAnnotMode !== 'distance') chordParts.push(line.bearing ?? '');
                    if (agentAnnotMode !== 'bearing') chordParts.push(line.distance ?? '');
                    const chordText = chordParts.filter(Boolean).join(' / ') || (line.bearing ?? '');
                    const radiusText = `R = ${line.curveRadius.toFixed(2)}'`;
                    const arcLengthText = `L = ${line.arcLength.toFixed(2)}'`;
                    const deltaText = `Δ = ${deltaDegrees}°${deltaMinutes}'${deltaSeconds}"`;

                    // Draw annotation using same scale and style as B&D labels
                        const worldTextHeight = lineAnnotationWorldTextHeight();
                    ctx.save();
                    ctx.translate(annotX, annotY);
                    ctx.scale(1, -1); // Counter-act the main canvas y-flip for text

                    ctx.font = `600 ${worldTextHeight}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = isLightTheme ? '#374151' : '#D1D5DB';
                    
                    // Calculate dimensions for stacked text
                    const lineHeight = worldTextHeight * 1.2;
                    const lines_text = [chordText, radiusText, arcLengthText, deltaText];
                    let maxWidth = 0;
                    lines_text.forEach(textLine => {
                        const width = ctx.measureText(textLine).width;
                        if (width > maxWidth) maxWidth = width;
                    });

                    // Draw background for all three lines
                    const padding = worldTextHeight * 0.2;
                    const totalHeight = lineHeight * lines_text.length;
                    ctx.clearRect(-maxWidth / 2 - padding, -totalHeight / 2 - padding, maxWidth + 2 * padding, totalHeight + 2 * padding);

                    // Record world-space hit box for Ctrl+drag repositioning.
                    const curveLineId = line.id || `${line.from}-${line.to}`;
                    curveLabelBoxesRef.current.set(curveLineId, {
                        wx: annotX,
                        wy: annotY,
                        ww: maxWidth + 2 * padding,
                        wh: totalHeight + 2 * padding,
                    });
                    
                    // Draw each line of text stacked
                    const startY = -(totalHeight / 2) + lineHeight / 2;
                    lines_text.forEach((textLine, index) => {
                        const y = startY + index * lineHeight;
                        ctx.fillText(textLine, 0, y);
                    });

                    ctx.restore();
                }
            }
        });

        // Draw centerlines
        centerlines.forEach(cl => {
            if (cl.pis.length < 2) return;
            
            ctx.strokeStyle = 'rgba(66, 153, 225, 0.8)';
            ctx.lineWidth = Math.max(scaledLineWidth * 1.2, minScreenPixelWidth);

            let lastPt = { easting: cl.pis[0].easting, northing: cl.pis[0].northing };

            for (let i = 1; i < cl.pis.length; i++) {
                const p_prev = cl.pis[i-1];
                const p_curr = cl.pis[i];
                
                if (i < cl.pis.length - 1 && p_curr.curveRadius) {
                    const p_next = cl.pis[i+1];
                    const curve = calculateCurveGeometry(p_prev, p_curr, p_next, p_curr.curveRadius);
                    if (curve) {
                        ctx.beginPath();
                        ctx.moveTo(lastPt.easting, lastPt.northing);
                        ctx.lineTo(curve.pcEasting, curve.pcNorthing);
                        ctx.stroke();

                        ctx.beginPath();
                        // With a flipped Y-axis, a CW turn in world-space (turnRight=true) becomes CCW on canvas, so anticlockwise must be true.
                        ctx.arc(curve.centerEasting, curve.centerNorthing, curve.radius, curve.startAngle, curve.endAngle, curve.turnRight);
                        ctx.stroke();

                        lastPt = { easting: curve.ptEasting, northing: curve.ptNorthing };
                    } else { // straight line if curve fails
                        ctx.beginPath();
                        ctx.moveTo(lastPt.easting, lastPt.northing);
                        ctx.lineTo(p_curr.easting, p_curr.northing);
                        ctx.stroke();
                        lastPt = p_curr;
                    }
                } else {
                    ctx.beginPath();
                    ctx.moveTo(lastPt.easting, lastPt.northing);
                    ctx.lineTo(p_curr.easting, p_curr.northing);
                    ctx.stroke();
                    lastPt = p_curr;
                }
            }
        });

        // Draw visible TIN surfaces (optional elevation shading + wireframe).
        tinSurfaces.filter(t => !t.hidden).forEach(surface => {
            const verts = surface.vertices;
            if (!verts || verts.length === 0 || !surface.triangles || surface.triangles.length === 0) return;
            ctx.save();

            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const v of verts) {
                if (v.elevation < minZ) minZ = v.elevation;
                if (v.elevation > maxZ) maxZ = v.elevation;
            }
            const zRange = Math.max(maxZ - minZ, 1e-9);
            const toShadeColor = (z: number): string => {
                const t = Math.max(0, Math.min(1, (z - minZ) / zRange));
                const hue = 8 + t * 112; // red->yellow->green style ramp
                return `hsla(${hue.toFixed(1)}, 92%, 56%, 0.38)`;
            };

            for (const tri of surface.triangles) {
                const ia = Array.isArray(tri) ? tri[0] : (tri as any).a;
                const ib = Array.isArray(tri) ? tri[1] : (tri as any).b;
                const ic = Array.isArray(tri) ? tri[2] : (tri as any).c;
                const a = verts[ia];
                const b = verts[ib];
                const c = verts[ic];
                if (!a || !b || !c) continue;

                ctx.beginPath();
                ctx.moveTo(a.easting, a.northing);
                ctx.lineTo(b.easting, b.northing);
                ctx.lineTo(c.easting, c.northing);
                ctx.closePath();

                if (isTinShadingEnabled) {
                    const zAvg = (a.elevation + b.elevation + c.elevation) / 3;
                    ctx.fillStyle = toShadeColor(zAvg);
                    ctx.fill();
                }

                if (!isTinShadingEnabled) {
                    ctx.strokeStyle = isLightTheme ? 'rgba(245, 158, 11, 0.35)' : 'rgba(251, 191, 36, 0.5)';
                    ctx.lineWidth = Math.max(scaledLineWidth * 0.3, minScreenPixelWidth * 0.45);
                    ctx.setLineDash([]);
                    ctx.stroke();
                }
            }
            ctx.restore();
        });
        
        // Draw rubber band line for all continuous drawing modes (polylines, breaklines, inclusion, exclusion)
        if ((drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') && polylinePoints.length > 0 && cursorWorldPosRef.current) {
            const lastPolyPoint = polylinePoints[polylinePoints.length - 1];
            if (lastPolyPoint) {
                const cursorPos = cursorWorldPosRef.current;
                let targetX = cursorPos.x;
                let targetY = cursorPos.y;
                if (typedSegmentLength.trim().length > 0) {
                    const num = Number(typedSegmentLength);
                    if (Number.isFinite(num) && num > 0) {
                        const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                        const worldLength = convertLinearUnits(num, fromUnit, 'foot');
                        const dx = cursorPos.x - lastPolyPoint.easting;
                        const dy = cursorPos.y - lastPolyPoint.northing;
                        const mag = Math.hypot(dx, dy);
                        if (mag > 1e-9) {
                            targetX = lastPolyPoint.easting + (dx / mag) * worldLength;
                            targetY = lastPolyPoint.northing + (dy / mag) * worldLength;
                        }
                    }
                }
                // Arc submode preview: arc leaving the anchor tangent to the
                // previous segment, through the cursor. Falls back to the
                // straight rubber band when the cursor sits on the tangent line.
                const previewArc = drawingMode === 'polylines' && polylineArcMode && lastSegmentTangentRef.current
                    ? computeTangentArc(
                        { easting: lastPolyPoint.easting, northing: lastPolyPoint.northing },
                        lastSegmentTangentRef.current,
                        { easting: targetX, northing: targetY })
                    : null;
                ctx.beginPath();
                ctx.moveTo(lastPolyPoint.easting, lastPolyPoint.northing);
                if (previewArc) {
                    // Same angle convention as the committed-curve pass below.
                    const startAngle = Math.atan2(lastPolyPoint.northing - previewArc.centerNorthing, lastPolyPoint.easting - previewArc.centerEasting);
                    const endAngle = previewArc.direction === 'left' ? startAngle + previewArc.sweep : startAngle - previewArc.sweep;
                    ctx.arc(previewArc.centerEasting, previewArc.centerNorthing, previewArc.radius, startAngle, endAngle, previewArc.direction !== 'left');
                    ctx.lineTo(targetX, targetY);
                } else {
                    ctx.lineTo(targetX, targetY);
                }
                // Color based on mode
                const colors = {
                    'polylines': '#FFFF00',
                    'breaklines': '#FF69B4',
                    'inclusion': '#34D399',
                    'exclusion': '#F87171'
                };
                ctx.strokeStyle = colors[drawingMode] || '#FFFF00';
                ctx.lineWidth = Math.max(1 * inverseScale, minScreenPixelWidth);
                const dashSize = 5 * inverseScale;
                const gapSize = 3 * inverseScale;
                ctx.setLineDash([dashSize, gapSize]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw rubber band circle preview
        if (drawingMode === 'circle' && circleSubMode === 'center-radius' && circleCenter && cursorWorldPosRef.current) {
            const cursorPos = cursorWorldPosRef.current;
            let r = Math.hypot(cursorPos.x - circleCenter.easting, cursorPos.y - circleCenter.northing);
            if (typedCircleValue.trim().length > 0) {
                const num = Number(typedCircleValue);
                if (Number.isFinite(num) && num > 0) {
                    const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                    const worldVal = convertLinearUnits(num, fromUnit, 'foot');
                    r = circleSizeParam === 'diameter' ? worldVal / 2 : worldVal;
                }
            } else if (circleSizeParam === 'diameter') {
                r = r / 2;
            }

            if (r > 1e-6) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(circleCenter.easting, circleCenter.northing, r, 0, 2 * Math.PI);
                ctx.strokeStyle = '#38BDF8';
                ctx.lineWidth = Math.max(1.5 * inverseScale, minScreenPixelWidth);
                const dashSize = 5 * inverseScale;
                const gapSize = 3 * inverseScale;
                ctx.setLineDash([dashSize, gapSize]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Center crosshair marker
                const cross = 5 * inverseScale;
                ctx.beginPath();
                ctx.moveTo(circleCenter.easting - cross, circleCenter.northing);
                ctx.lineTo(circleCenter.easting + cross, circleCenter.northing);
                ctx.moveTo(circleCenter.easting, circleCenter.northing - cross);
                ctx.lineTo(circleCenter.easting, circleCenter.northing + cross);
                ctx.strokeStyle = '#38BDF8';
                ctx.lineWidth = 1.2 * inverseScale;
                ctx.stroke();

                // Radius connector line from center to cursor
                ctx.beginPath();
                ctx.moveTo(circleCenter.easting, circleCenter.northing);
                ctx.lineTo(cursorPos.x, cursorPos.y);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
                ctx.setLineDash([3 * inverseScale, 3 * inverseScale]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Draw TTR circle preview & tangent glyphs
        if (drawingMode === 'circle' && circleSubMode === 'ttr') {
            const drawTangentMarker = (x: number, y: number, color: string = '#F59E0B') => {
                const r = 6 * inverseScale;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5 * inverseScale;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x - r * 1.4, y - r);
                ctx.lineTo(x + r * 1.4, y - r);
                ctx.stroke();
                const fontSize = 8 * inverseScale;
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.fillStyle = color;
                ctx.fillText('T', x + r + 2 * inverseScale, y + r + 2 * inverseScale);
                ctx.restore();
            };

            if (ttrEntity1) {
                drawTangentMarker(ttrEntity1.pickPoint.x, ttrEntity1.pickPoint.y, '#F59E0B');
            }
            if (ttrEntity2) {
                drawTangentMarker(ttrEntity2.pickPoint.x, ttrEntity2.pickPoint.y, '#F59E0B');
            }
            if (ttrStep < 3 && ttrHoverEntity) {
                drawTangentMarker(ttrHoverEntity.pickPoint.x, ttrHoverEntity.pickPoint.y, '#38BDF8');
            }

            if (ttrStep === 3 && ttrEntity1 && ttrEntity2) {
                const cursorPos = cursorWorldPosRef.current;
                const defaultR = cursorPos ? Math.hypot(cursorPos.x - ttrEntity2.pickPoint.x, cursorPos.y - ttrEntity2.pickPoint.y) : 25;
                let rVal = defaultR;
                if (typedCircleValue.trim().length > 0) {
                    const num = Number(typedCircleValue);
                    if (Number.isFinite(num) && num > 0) {
                        const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                        rVal = convertLinearUnits(num, fromUnit, 'foot');
                    }
                }
                if (circleSizeParam === 'diameter') rVal = rVal / 2;

                if (rVal > 1e-6) {
                    const sol = solveTtrCircle(ttrEntity1, ttrEntity2, rVal);
                    if (sol) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(sol.center.easting, sol.center.northing, sol.radius, 0, 2 * Math.PI);
                        ctx.strokeStyle = '#38BDF8';
                        ctx.lineWidth = Math.max(1.5 * inverseScale, minScreenPixelWidth);
                        const dashSize = 5 * inverseScale;
                        const gapSize = 3 * inverseScale;
                        ctx.setLineDash([dashSize, gapSize]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Center crosshair marker
                        const cross = 5 * inverseScale;
                        ctx.beginPath();
                        ctx.moveTo(sol.center.easting - cross, sol.center.northing);
                        ctx.lineTo(sol.center.easting + cross, sol.center.northing);
                        ctx.moveTo(sol.center.easting, sol.center.northing - cross);
                        ctx.lineTo(sol.center.easting, sol.center.northing + cross);
                        ctx.strokeStyle = '#38BDF8';
                        ctx.lineWidth = 1.2 * inverseScale;
                        ctx.stroke();

                        // Dashed radial lines to tangent points
                        ctx.beginPath();
                        ctx.moveTo(sol.center.easting, sol.center.northing);
                        ctx.lineTo(sol.tangentPt1.x, sol.tangentPt1.y);
                        ctx.moveTo(sol.center.easting, sol.center.northing);
                        ctx.lineTo(sol.tangentPt2.x, sol.tangentPt2.y);
                        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                        ctx.setLineDash([3 * inverseScale, 3 * inverseScale]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        drawTangentMarker(sol.tangentPt1.x, sol.tangentPt1.y, '#34D399');
                        drawTangentMarker(sol.tangentPt2.x, sol.tangentPt2.y, '#34D399');
                        ctx.restore();
                    }
                }
            }
        }

        // Draw Trim preview highlight (AutoCAD-style clean red dashed highlight with sleek '✕' cut badge)
        if (isTrimmingLines && trimHoverPreview) {
            ctx.save();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // Red-500
            ctx.lineWidth = Math.max(scaledLineWidth + 1.2 * inverseScale, minScreenPixelWidth * 1.5);
            ctx.shadowBlur = 0;
            const dashSize = 5 * inverseScale;
            const gapSize = 3 * inverseScale;
            ctx.setLineDash([dashSize, gapSize]);

            if (trimHoverPreview.kind === 'line' && trimHoverPreview.p1 && trimHoverPreview.p2) {
                ctx.beginPath();
                ctx.moveTo(trimHoverPreview.p1.x, trimHoverPreview.p1.y);
                ctx.lineTo(trimHoverPreview.p2.x, trimHoverPreview.p2.y);
                ctx.stroke();
            } else if ((trimHoverPreview.kind === 'arc' || trimHoverPreview.kind === 'circle') && trimHoverPreview.center && trimHoverPreview.radius) {
                ctx.beginPath();
                if (trimHoverPreview.kind === 'circle') {
                    ctx.arc(trimHoverPreview.center.x, trimHoverPreview.center.y, trimHoverPreview.radius, 0, 2 * Math.PI);
                } else {
                    ctx.arc(
                        trimHoverPreview.center.x,
                        trimHoverPreview.center.y,
                        trimHoverPreview.radius,
                        trimHoverPreview.startAngle ?? 0,
                        trimHoverPreview.endAngle ?? 2 * Math.PI,
                        trimHoverPreview.arcAnticlockwise ?? false
                    );
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();

            // Draw a clean subtle '✕' badge at the hit point
            if (trimHoverPreview.hitPoint) {
                const hp = trimHoverPreview.hitPoint;
                const r = 5 * inverseScale;
                ctx.save();
                ctx.beginPath();
                ctx.arc(hp.x, hp.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1 * inverseScale;
                ctx.stroke();

                const xArm = 2.2 * inverseScale;
                ctx.beginPath();
                ctx.moveTo(hp.x - xArm, hp.y - xArm);
                ctx.lineTo(hp.x + xArm, hp.y + xArm);
                ctx.moveTo(hp.x + xArm, hp.y - xArm);
                ctx.lineTo(hp.x - xArm, hp.y + xArm);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1.4 * inverseScale;
                ctx.stroke();
                ctx.restore();
            }
        }
        
        // Draw line labels (skip curve lines as they have their own annotations)
        lines.forEach(line => {
            if (line.bearing && line.distance && !line.isCurve) {
                const p1 = pointMap.get(line.from);
                const p2 = pointMap.get(line.to);
        
                if (p1 && p2) {
                    const midX = (p1.easting + p2.easting) / 2;
                    const midY = (p1.northing + p2.northing) / 2;

                    const dx = p2.easting - p1.easting;
                    const dy = p2.northing - p1.northing;
                    let angle = Math.atan2(dy, dx);

                    // Flip text if it would be upside down
                    if (Math.abs(angle) > Math.PI / 2) {
                        angle += Math.PI;
                    }

                    // Apply additional 180-degree rotation if labelRotation is set
                    const labelRotation = line.labelRotation || 0;
                    const rotationRadians = (labelRotation * Math.PI) / 180;

                    // Build label text based on annotation mode
                    const textParts: string[] = [];
                    if (agentAnnotMode !== 'distance') textParts.push(line.bearing!);
                    if (agentAnnotMode !== 'bearing') textParts.push(line.distance!);
                    const text = textParts.join(' / ');
                    if (!text) return;
                    // Define text height in world units, controlled by lineLabelScale.
                        const worldTextHeight = lineAnnotationWorldTextHeight();
                    
                    // Apply label offset if it exists
                    const offsetX = line.labelOffset?.x || 0;
                    const offsetY = line.labelOffset?.y || 0;
                    
                    ctx.save();
                    ctx.translate(midX + offsetX, midY + offsetY);
                    ctx.rotate(angle + rotationRadians);
                    ctx.scale(1, -1); // Counter-act the main canvas y-flip to draw text upright.
                    
                    ctx.font = `italic 600 ${worldTextHeight}px Arial`;
                    const textWidth = ctx.measureText(text).width;

                    // Clear a background for the text for readability.
                    const padding = worldTextHeight * 0.2;
                    ctx.clearRect(-textWidth / 2 - padding, -worldTextHeight / 2 - padding, textWidth + 2 * padding, worldTextHeight + 2 * padding);
                    
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = isLightTheme ? '#374151' : '#D1D5DB';
                    ctx.fillText(text, 0, 0);

                    ctx.restore();
                }
            }
        });

        // Draw deed metadata as one stacked text block (for DEED_READER agent) - in world space.
        // Suppressed when per-tract BoundaryFiles exist: each file gets its own
        // centroid annotation rendered inside the BFOverlay loop below, so the
        // labels follow their individual tract transforms instead of being
        // averaged into a single position.
        const hasBoundaryAnnotations = !!(boundaryFiles && boundaryFiles.some(bf => !bf.hidden && (bf.parcelId || bf.ownerName || bf.lotDescription)));
        if (deedMetadata && points.length > 0 && activeAgent === AgentType.DEED_READER && !hasBoundaryAnnotations) {
            // Calculate center of all deed points
            let sumNorthing = 0;
            let sumEasting = 0;
            let count = 0;
            
            points.forEach(p => {
                // Skip intermediate curve points
                const pNumberLower = p.pointNumber?.toLowerCase() || '';
                if (pNumberLower.includes('int-') || pNumberLower.startsWith('int_')) {
                    return;
                }
                sumNorthing += p.northing;
                sumEasting += p.easting;
                count++;
            });
            
            if (count > 0) {
                const centerNorthing = sumNorthing / count;
                const centerEasting = sumEasting / count;
                
                // Build all text lines to display (owner, book/page, parcel)
                const textLines: string[] = [];
                if (deedMetadata.owners && deedMetadata.owners.length > 0) {
                    textLines.push(`Owner: ${deedMetadata.owners.join(' to ')}`);
                }
                if (deedMetadata.deedBook || deedMetadata.deedPage) {
                    const bookPage = [
                        deedMetadata.deedBook ? `Book ${deedMetadata.deedBook}` : '',
                        deedMetadata.deedPage ? `Page ${deedMetadata.deedPage}` : ''
                    ].filter(Boolean).join(', ');
                    if (bookPage) textLines.push(bookPage);
                }
                if (deedMetadata.parcelId) {
                    textLines.push(`Parcel: ${deedMetadata.parcelId}`);
                }
                
                if (textLines.length > 0) {
                    const worldTextHeight = lineAnnotationWorldTextHeight();
                    const lineHeight = worldTextHeight * 1.4;
                    
                    // Use ownerNameOffset for positioning (this is now the unified metadata offset)
                    const offsetX = props.ownerNameOffset?.x || 0;
                    const offsetY = props.ownerNameOffset?.y || 10;
                    
                    ctx.save();
                    ctx.translate(centerEasting + offsetX, centerNorthing + offsetY);
                    ctx.scale(1, -1); // Counter-act the main canvas y-flip
                    
                    ctx.font = `italic 600 ${worldTextHeight}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Measure text for background clearing
                    const maxWidth = Math.max(...textLines.map(line => ctx.measureText(line).width));
                    const padding = worldTextHeight * 0.2;
                    const totalHeight = textLines.length * lineHeight;
                    
                    // Clear a background for the entire text block (like B&D labels)
                    ctx.clearRect(
                        -maxWidth / 2 - padding,
                        -totalHeight / 2 - padding,
                        maxWidth + 2 * padding,
                        totalHeight + 2 * padding
                    );
                    
                    // Draw all text lines in white (matching B&D labels)
                    ctx.fillStyle = isLightTheme ? '#374151' : '#D1D5DB';
                    const startY = -(textLines.length - 1) * lineHeight / 2;
                    textLines.forEach((line, i) => {
                        ctx.fillText(line, 0, startY + i * lineHeight);
                    });
                    
                    ctx.restore();
                }
            }
        }

        // --- Draw annotation dimensions (aligned) in world-space ---
        const drawAlignedDimension = (
            p1: { easting: number; northing: number },
            p2: { easting: number; northing: number },
            offsetDist: number,
            label: string,
            color: string
        ) => {
            const dx = p2.easting - p1.easting;
            const dy = p2.northing - p1.northing;
            const len = Math.hypot(dx, dy);
            if (len < 1e-9) return;

            // Perpendicular unit vector (left-hand of P1→P2 direction)
            const px = -dy / len;
            const py = dx / len;

            // Dimension line endpoints
            const d1 = { x: p1.easting + offsetDist * px, y: p1.northing + offsetDist * py };
            const d2 = { x: p2.easting + offsetDist * px, y: p2.northing + offsetDist * py };

            // Extension/gap size in world units (screenspace constant)
            const extLen = 4 * inverseScale;
            const gapLen = 1.5 * inverseScale;
            // Sign of offsetDist to know direction for extension beyond dim line
            const sign = offsetDist >= 0 ? 1 : -1;

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = inverseScale;
            ctx.setLineDash([]);

            // Witness line 1: from P1 (with gap) to slightly past D1
            ctx.beginPath();
            ctx.moveTo(p1.easting + px * gapLen * sign, p1.northing + py * gapLen * sign);
            ctx.lineTo(d1.x + px * extLen * sign, d1.y + py * extLen * sign);
            ctx.stroke();

            // Witness line 2
            ctx.beginPath();
            ctx.moveTo(p2.easting + px * gapLen * sign, p2.northing + py * gapLen * sign);
            ctx.lineTo(d2.x + px * extLen * sign, d2.y + py * extLen * sign);
            ctx.stroke();

            // Dimension line
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(d2.x, d2.y);
            ctx.stroke();

            // Arrowheads (closed triangles, pointing along dim line direction)
            const arrowSize = 8 * inverseScale;
            const arrowWidth = arrowSize * 0.3;
            const ux = dx / len; // unit vector along dim line
            const uy = dy / len;

            // Arrow at D1 pointing toward D2
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(d1.x + ux * arrowSize - uy * arrowWidth, d1.y + uy * arrowSize + ux * arrowWidth);
            ctx.lineTo(d1.x + ux * arrowSize + uy * arrowWidth, d1.y + uy * arrowSize - ux * arrowWidth);
            ctx.closePath();
            ctx.fill();

            // Arrow at D2 pointing toward D1
            ctx.beginPath();
            ctx.moveTo(d2.x, d2.y);
            ctx.lineTo(d2.x - ux * arrowSize - uy * arrowWidth, d2.y - uy * arrowSize + ux * arrowWidth);
            ctx.lineTo(d2.x - ux * arrowSize + uy * arrowWidth, d2.y - uy * arrowSize - ux * arrowWidth);
            ctx.closePath();
            ctx.fill();

            // Text at midpoint of dim line
            const midX = (d1.x + d2.x) / 2;
            const midY = (d1.y + d2.y) / 2;
            let textAngle = Math.atan2(dy, dx);
            if (Math.abs(textAngle) > Math.PI / 2) textAngle += Math.PI;

            const worldTextHeight = 2.5 * inverseScale * dimensionScale;
            ctx.save();
            ctx.translate(midX, midY);
            ctx.rotate(textAngle);
            ctx.scale(1, -1); // Counter-act Y-flip
            ctx.font = `bold ${worldTextHeight}px Arial`;
            const textWidth = ctx.measureText(label).width;
            const padX = worldTextHeight * 0.25;
            const padY = worldTextHeight * 0.15;
            ctx.clearRect(-textWidth / 2 - padX, -worldTextHeight / 2 - padY - worldTextHeight * 0.3, textWidth + padX * 2, worldTextHeight + padY * 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            ctx.fillText(label, 0, -worldTextHeight * 0.3);
            ctx.restore();
        };

        // Draw saved dimensions
        dimensions.forEach(dim => {
            const dist = Math.hypot(dim.p2.easting - dim.p1.easting, dim.p2.northing - dim.p1.northing);
            const label = dim.textOverride ?? dist.toFixed(2);
            drawAlignedDimension(dim.p1, dim.p2, dim.offsetDist, label, '#00E5FF');
        });

        // Draw live preview for aligned-dim mode
        if (drawingMode === 'aligned-dim') {
            if (dimP1 && dimP2 && dimPreviewMouse) {
                // Phase 2: show live preview with current mouse position as offset reference
                const dx = dimP2.easting - dimP1.easting;
                const dy = dimP2.northing - dimP1.northing;
                const len = Math.hypot(dx, dy);
                if (len > 1e-9) {
                    const px = -dy / len;
                    const py = dx / len;
                    const offsetDist = (dimPreviewMouse.easting - dimP1.easting) * px + (dimPreviewMouse.northing - dimP1.northing) * py;
                    const dist = len;
                    drawAlignedDimension(dimP1, dimP2, offsetDist, dist.toFixed(2), 'rgba(0,229,255,0.55)');
                }
            } else if (dimP1 && !dimP2 && dimPreviewMouse) {
                // Phase 1: show rubber-band from P1 to mouse
                ctx.strokeStyle = 'rgba(0,229,255,0.55)';
                ctx.lineWidth = inverseScale;
                const dashSize = 5 * inverseScale;
                ctx.setLineDash([dashSize, dashSize]);
                ctx.beginPath();
                ctx.moveTo(dimP1.easting, dimP1.northing);
                ctx.lineTo(dimPreviewMouse.easting, dimPreviewMouse.northing);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw P1 marker
                ctx.fillStyle = '#00E5FF';
                ctx.beginPath();
                ctx.arc(dimP1.easting, dimP1.northing, 3 * inverseScale, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Snap indicator: yellow diamond at snap target
            if (dimSnapPoint) {
                const sr = 5 * inverseScale;
                ctx.save();
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 1.5 * inverseScale;
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.moveTo(dimSnapPoint.easting, dimSnapPoint.northing - sr);
                ctx.lineTo(dimSnapPoint.easting + sr, dimSnapPoint.northing);
                ctx.lineTo(dimSnapPoint.easting, dimSnapPoint.northing + sr);
                ctx.lineTo(dimSnapPoint.easting - sr, dimSnapPoint.northing);
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            }
        }

        if (activeOsnapPoint && (activeGrip || isPickingOtOrigin || drawingMode === 'circle' || drawingMode === 'aligned-dim' || drawingMode === 'boundary-line' || drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion')) {
            const sr = 5 * inverseScale;
            ctx.save();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1.5 * inverseScale;
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.moveTo(activeOsnapPoint.easting, activeOsnapPoint.northing - sr);
            ctx.lineTo(activeOsnapPoint.easting + sr, activeOsnapPoint.northing);
            ctx.lineTo(activeOsnapPoint.easting, activeOsnapPoint.northing + sr);
            ctx.lineTo(activeOsnapPoint.easting - sr, activeOsnapPoint.northing);
            ctx.closePath();
            ctx.stroke();
            const glyph = OSNAP_GLYPHS[activeOsnapPoint.mode] || '*';
            const fontSize = 9 * inverseScale;
            ctx.font = `bold ${fontSize}px Arial`;
            const tw = ctx.measureText(glyph).width;
            const px = activeOsnapPoint.easting + 8 * inverseScale;
            const py = activeOsnapPoint.northing + 8 * inverseScale;
            ctx.fillStyle = 'rgba(10, 14, 25, 0.9)';
            ctx.fillRect(px - 2 * inverseScale, py - fontSize * 0.8, tw + 4 * inverseScale, fontSize + 2 * inverseScale);
            ctx.fillStyle = '#FFD700';
            ctx.fillText(glyph, px, py);
            ctx.restore();
        }

        // --- Draw boundary file overlays ---
        if (boundaryFiles && boundaryFiles.length > 0) {
            const normalizeAngBnd = (a: number) => { let n = a % (2 * Math.PI); if (n < 0) n += 2 * Math.PI; return n; };
            // Union of ALL boundary files' drawn point IDs. Used to prevent cross-tract
            // pointMap contamination: when tract 2 is drafted/redrafted with a transform,
            // its drawn POB (often sharing PN "1" with tract 1) overwrites tract 1's POB
            // entry in pointMap. Any tract resolving its POB or COGO origin via pointMap
            // must exclude ALL drawn IDs, not just its own.
            const allBoundaryDrawnIds = new Set<string>();
            boundaryFiles.forEach(other => {
                (other.drawnPointIds ?? []).forEach(id => allBoundaryDrawnIds.add(id));
            });
            // Rebuild bf geometry cache from scratch each frame so the
            // boundary-align hit-test sees current bf transforms + synth maps.
            bfGeometryCacheRef.current.clear();
            boundaryFiles.forEach(bf => {
                if (bf.hidden) { console.debug('[BFOverlay] skip (hidden)', bf.id, bf.name); return; }
                if (bf.calls.length === 0) { console.debug('[BFOverlay] skip (no calls)', bf.id); return; }
                // Build a per-bf synthesized point map so the amber overlay can draw
                // even before any survey points exist in pointMap. Mirrors the same
                // POB-resolution priority order as handleDrawBoundaryToLinework.
                //
                // FIX (v26.05.29): Previously this code used pointMap.get(firstCall.from)
                // as the COGO walk origin without excluding bf.drawnPointIds. After a
                // Draft+transform sequence, pointMap holds already-transformed positions,
                // causing the amber overlay to start its walk from the post-transform POB
                // and then apply the canvas transform AGAIN — doubling the effect. The
                // fix mirrors the Draft code exactly: skip drawnPointIds when resolving
                // the POB, and walk the COGO chain using only synthMap so stale pointMap
                // entries cannot contaminate the intermediate vertices.
                const synthMap = new Map<string, { easting: number; northing: number }>();
                // The true POB (before the closing call overwrites synthMap[from])
                // and the final walked vertex. Their delta is the raw misclosure
                // used below to paint the closing segment red when the deed doesn't
                // mathematically close back onto the POB.
                let bfPobOriginal: { easting: number; northing: number } | undefined;
                let bfFinalCursor: { easting: number; northing: number } | undefined;
                // Points that are already drawn carry the previous transform baked in;
                // never use them as walk origins.
                const priorDrawnIds = new Set(bf.drawnPointIds ?? []);
                // lookupPt for the DRAWING phase (after synthMap is fully built):
                // synthMap always wins so the fresh walk result is rendered, not the
                // stale drawn positions; fall back to external (non-drawn) pointMap entries.
                const lookupPt = (pn: string | undefined) => {
                    if (!pn) return undefined;
                    return synthMap.get(pn) ?? (!allBoundaryDrawnIds.has(pn) ? pointMap.get(pn) : undefined);
                };
                {
                    const firstCall = bf.calls[0];
                    // POB resolution priority:
                    //   1. If this boundary has been drafted, recover the UN-BAKED
                    //      POB by subtracting the baked translation from the drafted
                    //      POB position. The amber walk then matches white's pre-
                    //      transform geometry, and the full current transform is
                    //      applied via ctx below. Without un-baking, post-draft
                    //      transform edits would double-apply translation and
                    //      mis-rotate (walked-then-rotated ≠ rotated-while-walking).
                    //   2. Pre-draft: try the deed-side key, but skip if any tract has
                    //      already drafted that PN (cross-tract POB pollution guard).
                    //   3. Explicit pobOverride set by the user in the editor.
                    //   4. Centroid of non-drawn project points (matches Draft fallback).
                    //   5. (0,0).
                    const draftedPob = bf.drawnPointIds && bf.drawnPointIds.length > 0
                        ? pointMap.get(bf.drawnPointIds[0])
                        : undefined;
                    let unbakedPob: { easting: number; northing: number } | undefined;
                    if (draftedPob) {
                        const baked0 = bf.bakedTransform;
                        unbakedPob = {
                            easting: draftedPob.easting - (baked0?.translationE ?? 0),
                            northing: draftedPob.northing - (baked0?.translationN ?? 0),
                        };
                    }
                    const pobFromMap = unbakedPob
                        ?? ((firstCall.from && !allBoundaryDrawnIds.has(firstCall.from))
                            ? pointMap.get(firstCall.from)
                            : undefined);
                    let pob: { easting: number; northing: number };
                    if (pobFromMap) {
                        pob = { easting: pobFromMap.easting, northing: pobFromMap.northing };
                    } else if (bf.pobOverride) {
                        pob = { easting: bf.pobOverride.easting, northing: bf.pobOverride.northing };
                    } else {
                        // Mirror handleDrawBoundaryToLinework's centroid fallback so the
                        // amber preview anchors at the exact same location the white Draft
                        // will land at. Without this, "PN match → override → (0,0)" diverges
                        // from the documented "PN → override → centroid → (0,0)" chain.
                        let sumE = 0, sumN = 0, cnt = 0;
                        pointMap.forEach((p) => {
                            if (!allBoundaryDrawnIds.has(p.pointNumber)) {
                                sumE += p.easting; sumN += p.northing; cnt++;
                            }
                        });
                        pob = cnt > 0
                            ? { easting: sumE / cnt, northing: sumN / cnt }
                            : { easting: 0, northing: 0 };
                    }
                    if (firstCall.from) synthMap.set(firstCall.from, pob);
                    bfPobOriginal = { easting: pob.easting, northing: pob.northing };
                    let cursor = pob;
                    for (const call of bf.calls) {
                        // Walk using synthMap ONLY — pointMap entries are potentially stale
                        // drawn positions and must not influence intermediate vertices.
                        const fromHere = (call.from ? synthMap.get(call.from) : undefined) ?? cursor;
                        if (!fromHere) continue;
                        let endPt: { easting: number; northing: number } | null = null;
                        if (call.isCurve && typeof call.curveRadius === 'number' && isFinite(call.curveRadius)
                            && typeof call.arcLength === 'number' && isFinite(call.arcLength) && call.arcLength !== 0) {
                            const centralAngle = call.arcLength / call.curveRadius;
                            let left = false;
                            if ((call as any).curveDirection === 'left') left = true;
                            else if ((call as any).curveDirection === 'right') left = false;
                            else {
                                const tempT = call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null;
                                const dirStr = call.chordBearing || call.bearing;
                                if (tempT !== null && dirStr) {
                                    const dirRad = parseBearingToRadians(dirStr);
                                    if (dirRad !== null) {
                                        const half = centralAngle / 2;
                                        const expR = ((tempT + half) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                                        const expL = ((tempT - half) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                                        const dnorm = ((dirRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                                        const dR = Math.min(Math.abs(dnorm - expR), 2 * Math.PI - Math.abs(dnorm - expR));
                                        const dL = Math.min(Math.abs(dnorm - expL), 2 * Math.PI - Math.abs(dnorm - expL));
                                        if (dL < dR) left = true;
                                    }
                                }
                            }
                            const signedDelta = left ? -centralAngle : centralAngle;
                            const chordStr = call.chordBearing || call.bearing;
                            const chordRad = chordStr ? parseBearingToRadians(chordStr) : null;
                            const tRad: number | null = chordRad !== null
                                ? chordRad - signedDelta / 2
                                : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
                            if (tRad !== null) {
                                endPt = directCurve(fromHere, tRad, call.curveRadius, signedDelta);
                            }
                        } else {
                            const bStr = call.bearing || call.chordBearing;
                            const bRad = bStr ? parseBearingToRadians(bStr) : null;
                            const dist = call.distance ? parseDistance(call.distance) : (typeof (call as any).distanceFt === 'number' ? (call as any).distanceFt : null);
                            if (bRad !== null && typeof dist === 'number' && isFinite(dist)) {
                                endPt = direct(fromHere, bRad, dist);
                            }
                        }
                        if (endPt) {
                            // Always write into synthMap — removes the old !lookupPt guard
                            // which could suppress storage when pointMap had a stale entry.
                            if (call.to) synthMap.set(call.to, endPt);
                            cursor = endPt;
                        }
                    }
                    bfFinalCursor = cursor;
                }
                // Per-file synth diagnostic — how many points we resolved + bbox.
                // Also drives the per-BF annotation auto-scale below: very
                // large parcels need physically larger world-space text so
                // labels remain legible when zoomed to extents.
                let bMinE = Infinity, bMaxE = -Infinity, bMinN = Infinity, bMaxN = -Infinity;
                {
                    synthMap.forEach(p => {
                        if (p.easting < bMinE) bMinE = p.easting;
                        if (p.easting > bMaxE) bMaxE = p.easting;
                        if (p.northing < bMinN) bMinN = p.northing;
                        if (p.northing > bMaxN) bMaxN = p.northing;
                    });
                    console.debug('[BFOverlay] synth', bf.id, bf.name,
                        'calls:', bf.calls.length, 'synthPts:', synthMap.size,
                        'bbox:', isFinite(bMinE) ? `E[${bMinE.toFixed(1)}..${bMaxE.toFixed(1)}] N[${bMinN.toFixed(1)}..${bMaxN.toFixed(1)}]` : 'empty');
                }
                // Auto-scale for bearing/distance labels: reference parcel is
                // ~300 ft across (= 1.0x). A 3,000-ft parcel becomes 10x, a
                // 15,000-ft parcel hits the 50x ceiling. The user's
                // `lineLabelScale` slider still multiplies on top of this.
                const bfMaxDim = isFinite(bMinE) ? Math.max(bMaxE - bMinE, bMaxN - bMinN) : 0;
                const bfAutoLabelScale = bfMaxDim > 0
                    ? Math.max(1, Math.min(50, bfMaxDim / 300))
                    : 1;
                // Per-BoundaryFile transform (translate + rotate around POB).
                // Apply via canvas context so geometry math stays untouched —
                // the renderer just re-frames the result.
                //
                // The walk above used the UN-BAKED POB (drafted POB minus baked
                // translation), so applying the FULL current transform here gives
                // the same formula white linework uses (just with current params
                // instead of baked). When current == baked, amber lands exactly on
                // white; any edit to ΔE/ΔN/Rot° moves amber by that change only.
                const bfTxE = bf.translationE ?? 0;
                const bfTxN = bf.translationN ?? 0;
                const bfRotDeg = bf.rotationDeg ?? 0;
                const bfFirstPt = lookupPt(bf.calls[0].from);
                const hasBfTransform = (bfTxE !== 0 || bfTxN !== 0 || bfRotDeg !== 0) && !!bfFirstPt;
                // Stash for boundary-align hit-testing (un-baked POB + current transform).
                if (bfFirstPt) {
                    bfGeometryCacheRef.current.set(bf.id, {
                        synthMap: new Map(synthMap),
                        pob: { easting: bfFirstPt.easting, northing: bfFirstPt.northing },
                        txE: bfTxE,
                        txN: bfTxN,
                        rotDeg: bfRotDeg,
                    });
                }
                ctx.save();
                if (hasBfTransform && bfFirstPt) {
                    // Translate to anchor, rotate, translate back, then apply offset.
                    ctx.translate(bfFirstPt.easting + bfTxE, bfFirstPt.northing + bfTxN);
                    ctx.rotate((bfRotDeg * Math.PI) / 180);
                    ctx.translate(-bfFirstPt.easting, -bfFirstPt.northing);
                }
                // Active boundary = blue, inactive (but visible) = amber. Lets the
                // user tell at a glance which tract their transform/POB edits hit.
                const isActiveBf = activeBoundaryFileId && bf.id === activeBoundaryFileId;
                ctx.strokeStyle = isActiveBf
                    ? 'rgba(96, 165, 250, 0.9)'   // blue-400
                    : 'rgba(255, 180, 50, 0.75)'; // amber
                ctx.lineWidth = 2.5 * inverseScale;
                ctx.setLineDash([6 * inverseScale, 3 * inverseScale]);
                ctx.shadowColor = isActiveBf
                    ? 'rgba(96, 165, 250, 0.55)'
                    : 'rgba(255, 180, 50, 0.45)';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                let pathStarted = false;
                for (const call of bf.calls) {
                    const fromPt = lookupPt(call.from);
                    const toPt   = lookupPt(call.to);
                    if (!fromPt) continue;
                    if (!pathStarted) {
                        // Anchor the path at the TRUE POB. synthMap[calls[0].from]
                        // may have been overwritten by an explicit closing call's
                        // computed endpoint, so prefer bfPobOriginal to keep the
                        // walk starting from the deed's point-of-beginning.
                        const startPt = bfPobOriginal ?? fromPt;
                        ctx.moveTo(startPt.easting, startPt.northing);
                        pathStarted = true;
                    }
                    if (call.isCurve && call.curveRadius && call.arcLength) {
                        const bndCentralAngle = call.arcLength / call.curveRadius;
                        // Determine curve direction first
                        let bndLeft = false;
                        if ((call as any).curveDirection === 'left') {
                            bndLeft = true;
                        } else if ((call as any).curveDirection === 'right') {
                            bndLeft = false;
                        } else {
                            const tempTRad = call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null;
                            const bndDirStr = call.chordBearing || call.bearing;
                            if (tempTRad !== null && bndDirStr) {
                                const bndDirRad = parseBearingToRadians(bndDirStr);
                                if (bndDirRad !== null) {
                                    const half = bndCentralAngle / 2;
                                    const expR = normalizeAngBnd(tempTRad + half);
                                    const expL = normalizeAngBnd(tempTRad - half);
                                    const bndNorm = normalizeAngBnd(bndDirRad);
                                    const dR = Math.min(Math.abs(bndNorm - expR), 2 * Math.PI - Math.abs(bndNorm - expR));
                                    const dL = Math.min(Math.abs(bndNorm - expL), 2 * Math.PI - Math.abs(bndNorm - expL));
                                    if (dL < dR) bndLeft = true;
                                }
                            }
                        }
                        // Resolve tangent bearing geometrically: tangentBearing = chordBearing - signedΔ/2
                        const bndSignedDelta = bndLeft ? -bndCentralAngle : bndCentralAngle;
                        const bndChordStr = call.chordBearing || call.bearing;
                        const bndChordRad = bndChordStr ? parseBearingToRadians(bndChordStr) : null;
                        const tRad: number | null = bndChordRad !== null
                            ? bndChordRad - bndSignedDelta / 2
                            : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
                        if (tRad !== null) {
                            const bndCanvasTangent = Math.PI / 2 - tRad;
                            const bndCenterOffset = bndLeft ? bndCanvasTangent + Math.PI / 2 : bndCanvasTangent - Math.PI / 2;
                            const bndCx = fromPt.easting  + call.curveRadius * Math.cos(bndCenterOffset);
                            const bndCy = fromPt.northing + call.curveRadius * Math.sin(bndCenterOffset);
                            const bndStartAngle = Math.atan2(fromPt.northing - bndCy, fromPt.easting - bndCx);
                            const bndEndAngle   = bndLeft ? bndStartAngle + bndCentralAngle : bndStartAngle - bndCentralAngle;
                            ctx.arc(bndCx, bndCy, call.curveRadius, bndStartAngle, bndEndAngle, !bndLeft);
                        } else if (toPt) {
                            ctx.lineTo(toPt.easting, toPt.northing);
                        }
                    } else if (toPt) {
                        ctx.lineTo(toPt.easting, toPt.northing);
                    }
                }
                // Close back to start. synthMap[calls[0].from] may have been
                // overwritten by an explicit closing call's computed endpoint, so
                // the path was anchored at bfPobOriginal (the true POB) above.
                // Decide how to render the closing segment from geometry, not
                // endpoint labels. Draft preserves a misclosed endpoint as a
                // distinct point, so label topology is not a reliable warning
                // signal after commit.
                const lastCall = bf.calls[bf.calls.length - 1];
                const firstFrom = bf.calls[0]?.from;
                const isExplicitClose = !!(lastCall && firstFrom && lastCall.to === firstFrom);
                let bfMisclosureDist = 0;
                if (bfPobOriginal && bfFinalCursor) {
                    bfMisclosureDist = Math.hypot(
                        bfFinalCursor.easting - bfPobOriginal.easting,
                        bfFinalCursor.northing - bfPobOriginal.northing,
                    );
                }
                const closeTol = Math.max(0.1, bfMaxDim * 0.001);
                const isOpenDeed = bfMisclosureDist > closeTol;
                if (isOpenDeed && bfPobOriginal && bfFinalCursor) {
                    // Stroke the walked calls first, then overlay the unclosed gap
                    // in red so an open deed no longer masquerades as closed.
                    ctx.stroke();
                    ctx.save();
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)'; // red-500
                    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
                    ctx.shadowBlur = 10;
                    ctx.lineWidth = 3 * inverseScale;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(bfFinalCursor.easting, bfFinalCursor.northing);
                    ctx.lineTo(bfPobOriginal.easting, bfPobOriginal.northing);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    // Closed (or implied-close) deed: draw the closing segment in the
                    // boundary color back to the true POB when there is no explicit
                    // closing call already terminating the walk there.
                    if (pathStarted && bfPobOriginal && !isExplicitClose) {
                        ctx.lineTo(bfPobOriginal.easting, bfPobOriginal.northing);
                    }
                    ctx.stroke();
                }
                ctx.setLineDash([]);

                // Boundary-align highlight — overdraw the picked call on this bf
                // in a saturated blue (movable) or green (target) so the user can
                // tell which lines drive the alignment math.
                const alignHighlight: { callId: string; color: string } | null =
                    (boundaryAlignMovable?.bfId === bf.id)
                        ? { callId: boundaryAlignMovable.callId, color: 'rgba(59,130,246,1)' }
                        : (boundaryAlignTarget?.bfId === bf.id)
                            ? { callId: boundaryAlignTarget.callId, color: 'rgba(34,197,94,1)' }
                            : null;
                if (alignHighlight) {
                    const hCall = bf.calls.find(c => c.id === alignHighlight.callId);
                    const hFrom = hCall ? lookupPt(hCall.from) : undefined;
                    const hTo   = hCall ? lookupPt(hCall.to)   : undefined;
                    if (hFrom && hTo) {
                        ctx.save();
                        ctx.strokeStyle = alignHighlight.color;
                        ctx.lineWidth = 5 * inverseScale;
                        ctx.shadowColor = alignHighlight.color;
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.moveTo(hFrom.easting, hFrom.northing);
                        ctx.lineTo(hTo.easting,   hTo.northing);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
                // NOTE: ctx.restore() deferred to after the labels loop so the
                // per-BoundaryFile transform also applies to the B&D labels.

                // Draw B&D labels on each boundary call (amber, matching the overlay)
                bf.calls.forEach(call => {
                    const bFromPt = lookupPt(call.from);
                    const bToPt   = lookupPt(call.to);
                    if (!bFromPt || !bToPt) return;
                    let bText = call.chordBearing || call.bearing;
                    // When the user has toggled "Rotated brg" on the active
                    // boundary in the editor, replace the deed bearing on the
                    // canvas annotation with the as-drawn (rotated) bearing.
                    // Geometry rotates CCW (Y-up) by bfRotDeg → compass bearings shift by -bfRotDeg.
                    if (isActiveBf && showRotatedBearings && bfRotDeg && bText) {
                        const rad = parseBearingToRadians(bText);
                        if (rad !== null) {
                            bText = formatBearing(rad - (bfRotDeg * Math.PI) / 180);
                        }
                    }
                    const dText = call.arcLength ? `L=${call.arcLength.toFixed(2)}'` : call.distance;
                    const labelParts: string[] = [];
                    if (agentAnnotMode !== 'distance' && bText) labelParts.push(bText);
                    if (agentAnnotMode !== 'bearing' && dText) labelParts.push(dText);
                    const labelText = labelParts.join(' / ');
                    if (!labelText) return;

                    // Compute label position: arc midpoint for curves, chord midpoint for straights
                    let lmx: number, lmy: number, langle: number;
                    if (call.isCurve && call.curveRadius && call.arcLength) {
                        const bndCA = call.arcLength / call.curveRadius;
                        const bndLeft = (call as any).curveDirection === 'left';
                        const bndSD = bndLeft ? -bndCA : bndCA;
                        const bndCS = call.chordBearing || call.bearing;
                        const bndCR = bndCS ? parseBearingToRadians(bndCS) : null;
                        const tRad_ = bndCR !== null ? bndCR - bndSD / 2 : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
                        if (tRad_ !== null) {
                            const ct = Math.PI / 2 - tRad_;
                            const co = bndLeft ? ct + Math.PI / 2 : ct - Math.PI / 2;
                            const cx_ = bFromPt.easting  + call.curveRadius * Math.cos(co);
                            const cy_ = bFromPt.northing + call.curveRadius * Math.sin(co);
                            const sa_ = Math.atan2(bFromPt.northing - cy_, bFromPt.easting - cx_);
                            const ma_ = bndLeft ? sa_ + bndCA / 2 : sa_ - bndCA / 2;
                            lmx = cx_ + call.curveRadius * Math.cos(ma_);
                            lmy = cy_ + call.curveRadius * Math.sin(ma_);
                        } else {
                            lmx = (bFromPt.easting + bToPt.easting) / 2;
                            lmy = (bFromPt.northing + bToPt.northing) / 2;
                        }
                        langle = 0;
                    } else {
                        lmx = (bFromPt.easting + bToPt.easting) / 2;
                        lmy = (bFromPt.northing + bToPt.northing) / 2;
                        const ldx = bToPt.easting - bFromPt.easting;
                        const ldy = bToPt.northing - bFromPt.northing;
                        langle = Math.atan2(ldy, ldx);
                        if (Math.abs(langle) > Math.PI / 2) langle += Math.PI;
                    }

                    const worldTextHeight = 2.0 * lineLabelScale * bfAutoLabelScale;
                    ctx.save();
                    ctx.translate(lmx, lmy);
                    const callLabelRot = (call.labelRotation || 0) * Math.PI / 180;
                    ctx.rotate(langle + callLabelRot);
                    ctx.scale(1, -1);
                    ctx.font = `italic 600 ${worldTextHeight}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = isActiveBf
                        ? 'rgba(96, 165, 250, 0.95)'
                        : 'rgba(255, 180, 50, 0.95)';
                    const tw = ctx.measureText(labelText).width;
                    const pad = worldTextHeight * 0.2;
                    ctx.clearRect(-tw / 2 - pad, -worldTextHeight / 2 - pad, tw + 2 * pad, worldTextHeight + 2 * pad);
                    ctx.fillText(labelText, 0, 0);
                    ctx.restore();
                });

                // Per-tract centroid annotation — parcel ID / owner / lot description.
                // Rendered inside the bf transform so it follows the tract's
                // translation/rotation just like the B&D labels. Centroid is the
                // average of the walked (un-baked) vertices in synthMap.
                const bfTextLines: string[] = [];
                if (bf.parcelId) bfTextLines.push(`Parcel: ${bf.parcelId}`);
                if (bf.ownerName) bfTextLines.push(`N/F ${bf.ownerName}`);
                if (bf.lotDescription) bfTextLines.push(bf.lotDescription);
                if (bfTextLines.length > 0 && synthMap.size > 0) {
                    let sumE = 0, sumN = 0, cnt = 0;
                    synthMap.forEach(p => { sumE += p.easting; sumN += p.northing; cnt++; });
                    const cE = sumE / cnt;
                    const cN = sumN / cnt;
                    // Use lineLabelScale alone (no per-bf autoscale) so every
                    // tract's annotation renders at the same physical size
                    // regardless of parcel bbox.
                    const annTextHeight = lineAnnotationWorldTextHeight();
                    const annLineHeight = annTextHeight * 1.4;
                    ctx.save();
                    ctx.translate(cE, cN);
                    ctx.scale(1, -1);
                    ctx.font = `italic 600 ${annTextHeight}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const maxW = Math.max(...bfTextLines.map(l => ctx.measureText(l).width));
                    const padA = annTextHeight * 0.25;
                    const totalH = bfTextLines.length * annLineHeight;
                    ctx.clearRect(-maxW / 2 - padA, -totalH / 2 - padA, maxW + 2 * padA, totalH + 2 * padA);
                    ctx.fillStyle = isActiveBf
                        ? 'rgba(96, 165, 250, 0.95)'
                        : (isLightTheme ? '#374151' : '#D1D5DB');
                    const startY = -(bfTextLines.length - 1) * annLineHeight / 2;
                    bfTextLines.forEach((line, i) => {
                        ctx.fillText(line, 0, startY + i * annLineHeight);
                    });
                    ctx.restore();
                }

                // Close the outer transform save() started before strokeStyle.
                ctx.restore();
            });
        }

        // Draw World/UCS Origin Tuple on canvas at (originX, originY) if active or placed
        const otMode = orientationTuple?.mode ?? 'drafting';
        const otAngle = otMode === 'drafting' 
            ? (orientationTuple?.draftingAngle ?? orientationTuple?.angle ?? 0)
            : (orientationTuple?.viewAngle ?? orientationTuple?.angle ?? 0);
        const otOriginX = otMode === 'drafting'
            ? (orientationTuple?.draftingOriginX ?? orientationTuple?.originX ?? 0)
            : (orientationTuple?.viewOriginX ?? orientationTuple?.originX ?? 0);
        const otOriginY = otMode === 'drafting'
            ? (orientationTuple?.draftingOriginY ?? orientationTuple?.originY ?? 0)
            : (orientationTuple?.viewOriginY ?? orientationTuple?.originY ?? 0);

        if (orientationTuple && (orientationTuple.placed || otAngle !== 0 || otOriginX !== 0 || otOriginY !== 0)) {
            const ox = otOriginX;
            const oy = otOriginY;
            const axisLen = 42 * inverseScale;
            const arrowHead = 8 * inverseScale;
            const textOffset = 8 * inverseScale;
            const fontH = 11 * inverseScale;
            const localAngle = otMode === 'view' ? 0 : otAngle;

            ctx.save();
            ctx.translate(ox, oy);
            if (localAngle !== 0) {
                ctx.rotate(localAngle);
            }
            ctx.lineWidth = Math.max(1.8 * inverseScale, 1.5 * minScreenPixelWidth);

            // Origin box
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeRect(-3 * inverseScale, -3 * inverseScale, 6 * inverseScale, 6 * inverseScale);

            // X-Axis (Green)
            ctx.strokeStyle = '#34D399';
            ctx.fillStyle = '#34D399';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(axisLen, 0);
            ctx.stroke();
            // X Arrowhead
            ctx.beginPath();
            ctx.moveTo(axisLen, 0);
            ctx.lineTo(axisLen - arrowHead, arrowHead * 0.4);
            ctx.lineTo(axisLen - arrowHead, -arrowHead * 0.4);
            ctx.closePath();
            ctx.fill();

            // Y-Axis (Red)
            ctx.strokeStyle = '#F87171';
            ctx.fillStyle = '#F87171';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, axisLen);
            ctx.stroke();
            // Y Arrowhead
            ctx.beginPath();
            ctx.moveTo(0, axisLen);
            ctx.lineTo(arrowHead * 0.4, axisLen - arrowHead);
            ctx.lineTo(-arrowHead * 0.4, axisLen - arrowHead);
            ctx.closePath();
            ctx.fill();

            // Labels 'X' and 'Y'
            ctx.save();
            ctx.scale(1, -1);
            ctx.font = `bold ${fontH}px sans-serif`;
            ctx.fillStyle = '#34D399';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('X', axisLen + textOffset, 0);

            ctx.fillStyle = '#F87171';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('Y', 0, -(axisLen + textOffset));
            ctx.restore();

            ctx.restore();
        }

        ctx.restore(); // --- End world-space pass ---

        // --- Pass 2: Draw screen-space items (Points, Labels, GPS) ---
        // Draw contour labels
        if (contourLabels) {
            // Category style for contour labels (v26.05.19.15)
            const clCat = annotationCategories?.find(c => c.id === 'contour-labels');
            const clStyle = resolveAnnotationCategoryTextStyle(clCat, props.parcelCadTextStyles);
            const clColor = clCat?.color ?? (isLightTheme ? 'rgba(50,50,50,0.9)' : 'rgba(200,200,200,0.9)');
            if (clStyle.visible) {
                const contourBaseSize = 10 * attributeScale * contourLabelScale * clStyle.scale * 0.8;
                const screenTextSize = resolveAnnotationTextSize(contourBaseSize, annotationScalingMode, transform.scale);
                ctx.font = `${clStyle.fontItalic ? 'italic ' : ''}${clStyle.fontBold ? 'bold ' : ''}${screenTextSize}px ${clStyle.fontFamily}`;
                ctx.fillStyle = clColor;

                contourLabels.forEach(label => {
                    const pt = worldToScreen(label.x, label.y);
                    const screenX = pt.x;
                    const screenY = pt.y;
                
                    if (screenX < -50 || screenX > canvas.clientWidth + 50 || screenY < -20 || screenY > canvas.clientHeight + 20) {
                        return;
                    }

                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(-label.angle * Math.PI / 180);
                
                    const textWidth = ctx.measureText(label.text).width;
                    ctx.clearRect(-textWidth / 2 - 2, -screenTextSize / 2, textWidth + 4, screenTextSize);
                
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(applyAnnotationTextCase(label.text, clStyle.textCase), 0, 0);
                    ctx.restore();
                });
            }
        }

        // Draw street-name labels (v26.05.19.4) — road names aligned with road bearing.
        if (props.streetLabels && props.streetLabels.length > 0) {
            // Category style for roads (v26.05.19.15)
            const rdCat = annotationCategories?.find(c => c.id === 'roads');
            const rdStyle = resolveAnnotationCategoryTextStyle(rdCat, props.parcelCadTextStyles);
            const rdColor = rdCat?.color ?? (isLightTheme ? 'rgba(30,80,160,0.92)' : 'rgba(100,180,255,0.92)');
            if (rdStyle.visible) {
                const streetBaseSize = Math.max(8, 11 * attributeScale * rdStyle.scale);
                const streetTextSize = resolveAnnotationTextSize(streetBaseSize, annotationScalingMode, transform.scale);
                ctx.font = `${rdStyle.fontItalic ? 'italic ' : ''}${rdStyle.fontBold ? 'bold ' : ''}${streetTextSize}px ${rdStyle.fontFamily}`;
                ctx.fillStyle = rdColor;

                props.streetLabels.forEach(label => {
                    const pt = worldToScreen(label.x, label.y);
                    const screenX = pt.x;
                    const screenY = pt.y;

                    if (screenX < -100 || screenX > canvas.clientWidth + 100 || screenY < -20 || screenY > canvas.clientHeight + 20) {
                        return;
                    }

                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(-label.angle * Math.PI / 180);

                    const textWidth = ctx.measureText(label.text).width;
                    // Slight background clear so text is readable over contours/lines
                    const pad = 3;
                    ctx.clearRect(-textWidth / 2 - pad, -streetTextSize / 2 - 1, textWidth + pad * 2, streetTextSize + 2);

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(applyAnnotationTextCase(label.text, rdStyle.textCase), 0, 0);
                    ctx.restore();
                });
            }
        }

        // Draw parcel centroid labels (v26.05.19.15) — "N/F [OWNER]" annotation.
        if (parcelLabels && parcelLabels.length > 0) {
            const parcelTextStyle = resolveParcelTextStyle(props.parcelLabelFormatter, props.parcelCadTextStyles);
            const poCat = annotationCategories?.find(c => c.id === 'property-owners');
            const poCategoryStyle = resolveAnnotationCategoryTextStyle(poCat, props.parcelCadTextStyles);
            const poVisible = poCategoryStyle.visible;
            const poColor = poCat?.color ?? '#86efac';
            const poUsesCadCategory = poCat?.styleSource === 'cad-manager' && !!poCat?.cadTextStyleName;
            const poFamily = poUsesCadCategory ? poCategoryStyle.fontFamily : (parcelTextStyle.fontFamily || poCat?.fontFamily || 'Arial Narrow');
            const poItalic = poUsesCadCategory ? poCategoryStyle.fontItalic : parcelTextStyle.fontItalic;
            const poBold = poUsesCadCategory ? poCategoryStyle.fontBold : parcelTextStyle.fontBold;
            const poLineSpacing = poUsesCadCategory ? poCategoryStyle.lineSpacing : parcelTextStyle.lineSpacing;
            const poTextCase = poUsesCadCategory ? poCategoryStyle.textCase : parcelTextStyle.textCase;
            const poCatScale = poCategoryStyle.scale || 0.8;
            const parcelBaseFontSize = Math.max(7, 10 * attributeScale * annotationScale * poCatScale);
            const poFontSize = resolveAnnotationTextSize(parcelBaseFontSize, annotationScalingMode, transform.scale);
            const poFontStr = `${poItalic ? 'italic ' : ''}${poBold ? 'bold ' : ''}${poFontSize}px ${poFamily}`;
            if (poVisible) {
                ctx.font = poFontStr;
                ctx.fillStyle = poColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                parcelLabels.forEach(label => {
                    const pt = worldToScreen(label.x, label.y);
                    const screenX = pt.x;
                    const screenY = pt.y;

                    if (screenX < -120 || screenX > canvas.clientWidth + 120 || screenY < -30 || screenY > canvas.clientHeight + 30) {
                        return;
                    }

                    ctx.save();
                    ctx.translate(screenX, screenY);
                    ctx.rotate(-label.angle * Math.PI / 180);

                    const parcelLines = buildParcelLabelLines(label, props.parcelLabelFormatter);
                    if (parcelLines.length === 0) {
                        ctx.restore();
                        return;
                    }

                    const lines = parcelLines
                        .map(line => applyAnnotationTextCase(line, poTextCase));
                    const lineHeight = poFontSize * poLineSpacing;
                    const lineCount = lines.length;
                    const yOffset = -((lineCount - 1) * lineHeight) / 2;

                    // Background clear for readability
                    ctx.font = poFontStr;
                    const maxW = Math.max(...lines.map(line => ctx.measureText(line).width));
                    const totalH = lineHeight * lineCount;
                    ctx.clearRect(-maxW / 2 - 2, yOffset - lineHeight / 2 - 1, maxW + 4, totalH + 2);

                    lines.forEach((line, index) => {
                        ctx.fillText(line, 0, yOffset + (index * lineHeight));
                    });

                    ctx.restore();
                });
            }
        }
        
        // Draw points and labels
        // Reset annotation hit-boxes each frame so stale entries don't trigger
        // Ctrl/Shift click handlers after a point loses its annotation.
        annotationHitBoxesRef.current.clear();
        // Shrinkwrap source pns set for O(1) lookup during point rendering
        const shrinkwrapPnSet: Set<string> | null = props.shrinkwrapSourcePns?.length
            ? new Set(props.shrinkwrapSourcePns)
            : null;
        const pendingDeleteSet: Set<string> | null = props.pendingDeletePointNumbers?.size
            ? props.pendingDeletePointNumbers
            : null;
        points.forEach(p => {
            // Skip intermediate curve points - they should not be drawn on screen
            const pNumberLower = p.pointNumber?.toLowerCase() || '';
            if (pNumberLower.includes('int-') || pNumberLower.startsWith('int_')) {
                return; // Skip intermediate curve approximation points
            }

            const pt = worldToScreen(p.easting, p.northing);
            const screenX = pt.x;
            const screenY = pt.y;

            if (screenX < -20 || screenX > canvas.clientWidth + 20 || screenY < -20 || screenY > canvas.clientHeight + 20) {
                return;
            }

            // Shrinkwrap highlight ring — drawn before the point itself so it sits underneath
            if (shrinkwrapPnSet?.has(p.pointNumber)) {
                const isHov = p.pointNumber === hoveredShrinkwrapPn;
                ctx.save();
                ctx.beginPath();
                ctx.arc(screenX, screenY, isHov ? 11 : 7, 0, 2 * Math.PI);
                ctx.strokeStyle = isHov ? '#EF4444' : '#A78BFA';
                ctx.lineWidth = isHov ? 2.5 : 1.5;
                ctx.stroke();
                ctx.restore();
            }

            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 0.5;

            const symbol = getSymbolForPoint(p);
            if (symbol && symbol.svgPath) {
                const viewBoxParts = symbol.viewBox.split(' ').map(Number);
                const [vx, vy, vw, vh] = viewBoxParts.length === 4 ? viewBoxParts : [0, 0, 24, 24];
                // Symbols are world geometry (like CAD blocks): they must grow
                // and shrink with zoom exactly like linework. We normalize every
                // glyph to a consistent world size regardless of its source
                // viewBox (built-in 24×24 vs arbitrary DXF extents), then
                // multiply by transform.scale so it tracks zoom. Baseline of
                // 9.6 world units preserves the previous on-screen size at 1:1
                // zoom (24 × 0.4) so existing scenes look unchanged there.
                const viewExtent = Math.max(vw, vh) || 24;
                const targetWorldExtent = 9.6 * (symbol.scale || 1) * (symbolScale || 1);
                const symbolScreenScale = (targetWorldExtent / viewExtent) * transform.scale;
                const strokePath = new Path2D(symbol.svgPath);
                const fillPath = symbol.fillPath ? new Path2D(symbol.fillPath) : null;

                ctx.save();
                ctx.translate(screenX, screenY);
                ctx.scale(symbolScreenScale, -symbolScreenScale);
                ctx.translate(-(vx + vw / 2), -(vy + vh / 2));

                const symbolColor = isLightTheme ? '#111827' : '#FFD700';

                if (fillPath) {
                    ctx.fillStyle = symbolColor;
                    ctx.fill(fillPath);
                }

                ctx.strokeStyle = symbolColor;
                // Keep the outline a roughly constant on-screen weight (~1.5px)
                // even as the glyph scales with zoom — the CAD "lineweight is
                // screen-constant, geometry scales" convention. Guard against a
                // zero scale (fully zoomed out) to avoid a non-finite width.
                ctx.lineWidth = symbolScreenScale > 0 ? 1.5 / symbolScreenScale : 1.5;
                ctx.stroke(strokePath);

                ctx.restore();
            } else {
                const pointRadius = 1.5;
                ctx.beginPath();
                ctx.arc(screenX, screenY, pointRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }

            // Draw labels
            // Check if we should use world-relative (scaling with zoom) or screen-relative (fixed size)
            const useWorldScaling = settings.pointAttributeScaling === 'world';
            const screenTextSize = useWorldScaling ? (10 * attributeScale * transform.scale) : (10 * attributeScale);
            
            // Optimization: Skip labels if they are too small to read
            if (screenTextSize < 5) return;

            ctx.font = `${screenTextSize}px Arial`;
            
            // Base text offset in screen pixels
            const baseTextOffset = 5 * attributeScale;
            
            // Label offsets are always stored in world coordinates
            // Leader line length ALWAYS scales with zoom (for both modes)
            // Only the text size differs between modes
            const labelOffsetX = p.labelOffset 
              ? p.labelOffset.x * transform.scale
              : baseTextOffset;
            const labelOffsetY = p.labelOffset 
              ? p.labelOffset.y * transform.scale
              : baseTextOffset;
            
            const areAnyLabelsVisible = pointLayers.pointNumber.visible || pointLayers.elevation.visible || pointLayers.description.visible;

            if (p.labelOffset && (p.labelOffset.x !== 0 || p.labelOffset.y !== 0) && areAnyLabelsVisible) {
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX + labelOffsetX, screenY + labelOffsetY);
                ctx.strokeStyle = "rgba(128, 128, 128, 0.7)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            if (pointLayers.pointNumber.visible) {
                ctx.fillStyle = pointLayers.pointNumber.color;
                ctx.fillText(p.pointNumber, screenX + labelOffsetX, screenY + labelOffsetY - screenTextSize);
            }
            if (pointLayers.elevation.visible && p.elevation !== undefined) {
                ctx.fillStyle = pointLayers.elevation.color;
                ctx.fillText(p.elevation.toFixed(settings.coordinatePrecision), screenX + labelOffsetX, screenY + labelOffsetY);
            }
            if (pointLayers.description.visible && p.description) {
                ctx.fillStyle = pointLayers.description.color;
                ctx.fillText(p.description, screenX + labelOffsetX, screenY + labelOffsetY + screenTextSize);
            }

                    // Pending-delete ring — pulsing red halo so the user can verify
                    // which points are about to be removed before confirming.
                    if (pendingDeleteSet?.has(p.pointNumber)) {
                        const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 180);
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, 14 * pulse, 0, 2 * Math.PI);
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // red-500
                        ctx.lineWidth = 2.5;
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, 20 * pulse, 0, 2 * Math.PI);
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.restore();
                    }

                    // -----------------------------------------------------------------
                    // Annotation rules (leader + note) — applies only to matching points.
                    // Mirrors the symbol pattern: per-rule scale × global annotationScale.
                    // Offset is in world units; the leader bends at that point and a
                    // horizontal underline carries the text to the right.
                    // -----------------------------------------------------------------
            const annotRule = getAnnotationForPoint(p);
            if (annotRule) {
                const noteText = renderAnnotationTemplate(annotRule.template, p);
                const annCat = annotationCategories?.find(c => c.id === 'callout') ?? null;
                const annStyle = resolveAnnotationCategoryTextStyle(annCat, props.parcelCadTextStyles);
                const noteLines = noteText.split('\n').map(line => applyAnnotationTextCase(line, annStyle.textCase));
                // Apply category-driven existing overrides (v26.05.19.15)
                const isExisting = annotRule.category === 'existing';
                const existingItalic = annCat ? annCat.existingItalic : true;
                const existingScaleMult = annCat ? annCat.existingScale : 0.25;
                const ruleScaleMult = isExisting ? existingScaleMult : 1;
                const combinedScale = (annotRule.scale || 1) * (annotationScale || 1) * ruleScaleMult;
                const applyItalic = (isExisting && existingItalic) || annStyle.fontItalic;
                const noteFontSize = resolveAnnotationTextSize(11 * combinedScale, annotationScalingMode, transform.scale);
                // Per-point override (Ctrl+drag / Shift+click mirror) takes
                // precedence over the rule's default leaderOffset.
                const effDx = p.annotationOffset ? p.annotationOffset.dx : annotRule.leaderOffset.dx;
                const effDy = p.annotationOffset ? p.annotationOffset.dy : annotRule.leaderOffset.dy;
                const mirrored = effDx < 0;
                // Bend point in screen coords (world offset → pixels via transform.scale)
                const bendX = screenX + effDx * transform.scale;
                const bendY = screenY - effDy * transform.scale;
                // Horizontal underline length sized to widest line; on the
                // mirrored side, underline extends to the LEFT of the bend.
                ctx.font = `${applyItalic ? 'italic ' : ''}${annStyle.fontBold ? 'bold ' : ''}${noteFontSize}px ${annStyle.fontFamily}`;
                const widest = Math.max(...noteLines.map(l => ctx.measureText(l).width));
                const underlineLen = widest + 6 * combinedScale;
                const underlineEndX = mirrored ? bendX - underlineLen : bendX + underlineLen;
                const color = annotRule.color || annStyle.color || (annotRule.category === 'proposed' ? '#f472b6' : '#22d3ee');
                // Leader: point → bend → end of underline
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(bendX, bendY);
                ctx.lineTo(underlineEndX, bendY);
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, 1.2 * combinedScale);
                ctx.setLineDash([]);
                ctx.stroke();
                // Tiny arrowhead at point
                const ah = 4 * combinedScale;
                const ang = Math.atan2(bendY - screenY, bendX - screenX);
                ctx.beginPath();
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX + ah * Math.cos(ang - 0.4), screenY + ah * Math.sin(ang - 0.4));
                ctx.lineTo(screenX + ah * Math.cos(ang + 0.4), screenY + ah * Math.sin(ang + 0.4));
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                // Text — stacked upward from the underline. Right-align on the
                // mirrored side so the underline reads naturally toward the bend.
                ctx.fillStyle = color;
                ctx.textBaseline = 'alphabetic';
                const prevAlign = ctx.textAlign;
                ctx.textAlign = mirrored ? 'right' : 'left';
                const textX = mirrored ? bendX - 3 * combinedScale : bendX + 3 * combinedScale;
                noteLines.forEach((ln, i) => {
                    const ty = bendY - 3 * combinedScale - (noteLines.length - 1 - i) * (noteFontSize * annStyle.lineSpacing);
                    ctx.fillText(ln, textX, ty);
                });
                ctx.textAlign = prevAlign;
                // Record screen-space hit box for Ctrl/Shift click handlers.
                const totalH = noteLines.length * noteFontSize * 1.15 + 4 * combinedScale;
                const boxX = mirrored ? bendX - underlineLen : bendX;
                const boxY = bendY - totalH;
                annotationHitBoxesRef.current.set(p.pointNumber, {
                    x: boxX,
                    y: boxY,
                    w: underlineLen,
                    h: totalH + 4 * combinedScale,
                });
            }
        });
        
        // Draw current GPS position
        if (projectedPosition) {
            const pt = worldToScreen(projectedPosition.easting, projectedPosition.northing);
            const screenX = pt.x;
            const screenY = pt.y;

            ctx.fillStyle = 'rgba(0, 191, 255, 0.8)';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(screenX, screenY, 8, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore(); // --- End screen-space pass ---
    }, [transform, points, lines, centerlines, customSymbols, pointLayers, attributeScale, lineLabelScale, lineThickness, contourLabelScale, settings, getSymbolForPoint, getAnnotationForPoint, customAnnotations, annotationScale, offlineMapAreas, contourLabels, props.streetLabels, parcelLabels, props.parcelLabelFormatter, props.parcelCadTextStyles, annotationCategories, pointMap, drawingMode, polylinePoints, polylineArcMode, projectedPosition, googleOverlayImage, wmsImages, offlineImages, isDeletingLines, isTrimmingLines, trimHoverPreview, deedMetadata, activeAgent, props.ownerNameOffset, props.deedMetadataOffset, dimensions, dimensionScale, symbolScale, dimP1, dimP2, dimPreviewMouse, dimSnapPoint, activeOsnapPoint, selectedLineIds, tinSurfaces, isTinShadingEnabled, boundaryFiles, activeBoundaryFileId, showRotatedBearings, agentAnnotMode, hoveredShrinkwrapPn, props.shrinkwrapSourcePns, props.pendingDeletePointNumbers, floodRings, boundaryAlignMovable, boundaryAlignTarget, isGridVisible, worldToScreen, circleCenter, circleSizeParam, typedCircleValue, circleSubMode, ttrStep, ttrEntity1, ttrEntity2, ttrHoverEntity, solveTtrCircle, activeGrip, hoveredGrip, getGripsForSelectedLines]);

    // Throttled draw using requestAnimationFrame to prevent flickering during rapid updates
    const scheduleDraw = useCallback(() => {
        console.log('[DC] scheduleDraw called, pendingFrame:', animationFrameRef.current);
        if (animationFrameRef.current !== null) {
            // Already have a pending frame, skip
            return;
        }
        animationFrameRef.current = requestAnimationFrame(() => {
            console.log('[DC] rAF fired, drawRef set?:', !!drawRef.current);
            animationFrameRef.current = null;
            drawRef.current?.();
        });
    }, []);

    // Mount/unmount sentinel
    useEffect(() => {
        console.log('[DC] MOUNT');
        return () => console.log('[DC] UNMOUNT');
    }, []);

    // Store draw function in ref for stable access
    useEffect(() => {
        console.log('[DC] drawRef <- draw (draw fn changed)');
        drawRef.current = draw;
    }, [draw]);

    // Draw when draw function changes, using requestAnimationFrame for smoothness
    useEffect(() => {
        console.log('[DC] schedule effect firing');
        scheduleDraw();
    }, [draw, scheduleDraw]);

    // Keep re-drawing while pending-delete points are on screen so the red
    // halo actually pulses instead of freezing on a single frame.
    useEffect(() => {
        if (!props.pendingDeletePointNumbers || props.pendingDeletePointNumbers.size === 0) return;
        let alive = true;
        const tick = () => {
            if (!alive) return;
            scheduleDraw();
            requestAnimationFrame(tick);
        };
        const raf = requestAnimationFrame(tick);
        return () => { alive = false; cancelAnimationFrame(raf); };
    }, [props.pendingDeletePointNumbers, scheduleDraw]);
    
    // Cleanup animation frame on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const applySize = () => {
            const { width, height } = container.getBoundingClientRect();
            // HiDPI: backing store is CSS px × devicePixelRatio so 1-px strokes
            // land on a single physical pixel instead of being bilinearly upscaled
            // by the browser (which is what made every line look fuzzy when
            // zoomed in). The draw() function applies a setTransform(dpr,...) so
            // all existing CSS-pixel coordinates keep working unchanged.
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
        };

        applySize();
        const resizeObserver = new ResizeObserver(() => {
            applySize();
            scheduleDraw();
        });
        resizeObserver.observe(container);

        // Re-apply when the display’s DPR changes (zoom level or moving to a
        // different-density monitor).
        const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        const onDprChange = () => { applySize(); scheduleDraw(); };
        mql.addEventListener?.('change', onDprChange);

        return () => {
            resizeObserver.disconnect();
            mql.removeEventListener?.('change', onDprChange);
        };
    }, [scheduleDraw]);
    
    const isOverLabelArea = useCallback((mouseX: number, mouseY: number, p: SurveyPoint) => {
        const { scale } = transform;

        const ptScreen = worldToScreen(p.easting, p.northing);
        const pointScreenX = ptScreen.x;
        const pointScreenY = ptScreen.y;

        const screenTextSize = 10 * attributeScale;
        const textOffset = 5 * attributeScale;
        
        // Convert label offset from world coordinates to screen coordinates
        const labelOffsetWorldX = p.labelOffset ? p.labelOffset.x : textOffset / scale;
        const labelOffsetWorldY = p.labelOffset ? p.labelOffset.y : textOffset / scale;
        
        const labelOffsetScreenX = labelOffsetWorldX * scale;
        const labelOffsetScreenY = labelOffsetWorldY * scale;
        
        const labelBlockX = pointScreenX + labelOffsetScreenX;
        const labelCenterY = pointScreenY + labelOffsetScreenY;
        
        const topOfBlock = labelCenterY - screenTextSize * 1.5;
        const bottomOfBlock = labelCenterY + screenTextSize * 1.5;

        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        ctx.font = `${screenTextSize.toFixed(2)}px Arial`;
        const texts = [
            pointLayers.pointNumber.visible ? p.pointNumber : '',
            pointLayers.elevation.visible && p.elevation !== undefined ? p.elevation.toFixed(settings.coordinatePrecision) : '',
            pointLayers.description.visible ? p.description : ''
        ].filter((text): text is string => typeof text === 'string' && text.length > 0);
        const blockWidth = texts.length > 0 ? Math.max(...texts.map(t => ctx.measureText(t).width)) : 0;
        
        const PADDING = 15;

        return (
            mouseX >= labelBlockX - PADDING &&
            mouseX <= labelBlockX + blockWidth + PADDING &&
            mouseY >= topOfBlock - PADDING &&
            mouseY <= bottomOfBlock + PADDING
        );
    }, [transform, attributeScale, pointLayers, settings.coordinatePrecision, worldToScreen]);

    // Hit-test the annotation note (leader underline + stacked text) for a point.
    // Uses the screen-space box captured during the most recent draw frame, so
    // the hit area always matches what the user sees regardless of mirror/scale.
    const isOverAnnotationArea = useCallback((mouseX: number, mouseY: number, p: SurveyPoint): boolean => {
        const box = annotationHitBoxesRef.current.get(p.pointNumber);
        if (!box) return false;
        const PAD = 6;
        return (
            mouseX >= box.x - PAD &&
            mouseX <= box.x + box.w + PAD &&
            mouseY >= box.y - PAD &&
            mouseY <= box.y + box.h + PAD
        );
    }, []);

    const isOverLineLabelArea = useCallback((mouseX: number, mouseY: number, line: SurveyLine): boolean => {
        if (!line.bearing || !line.distance || line.isCurve) return false;
        
        const p1 = pointMap.get(line.from);
        const p2 = pointMap.get(line.to);
        if (!p1 || !p2) return false;

        const midX = (p1.easting + p2.easting) / 2;
        const midY = (p1.northing + p2.northing) / 2;
        
        const offsetX = line.labelOffset?.x || 0;
        const offsetY = line.labelOffset?.y || 0;
        
        const worldTextHeight = settings.pointAttributeScaling === 'world'
            ? 2.0 * lineLabelScale
            : 10 * lineLabelScale * (1 / transform.scale);
        const text = `${line.bearing} / ${line.distance}`;
        
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        ctx.font = `600 ${worldTextHeight}px Arial`;
        const textWidth = ctx.measureText(text).width;
        const padding = worldTextHeight * 0.2;
        
        // Convert world coordinates to screen coordinates
        const labelWorldX = midX + offsetX;
        const labelWorldY = midY + offsetY;
        const pt = worldToScreen(labelWorldX, labelWorldY);
        const screenX = pt.x;
        const screenY = pt.y;
        
        const screenWidth = (textWidth + 2 * padding) * transform.scale;
        const screenHeight = (worldTextHeight + 2 * padding) * transform.scale;
        
        const PADDING_SCREEN = 10;
        
        return (
            mouseX >= screenX - screenWidth / 2 - PADDING_SCREEN &&
            mouseX <= screenX + screenWidth / 2 + PADDING_SCREEN &&
            mouseY >= screenY - screenHeight / 2 - PADDING_SCREEN &&
            mouseY <= screenY + screenHeight / 2 + PADDING_SCREEN
        );
    }, [transform, lineLabelScale, pointMap, worldToScreen]);

    const isOverCurveLabelArea = useCallback((mouseX: number, mouseY: number, line: SurveyLine): boolean => {
        if (!line.isCurve) return false;
        const lineId = line.id || `${line.from}-${line.to}`;
        const box = curveLabelBoxesRef.current.get(lineId);
        if (!box) return false;
        const pt = worldToScreen(box.wx, box.wy);
        const screenX = pt.x;
        const screenY = pt.y;
        const screenWidth = box.ww * transform.scale;
        const screenHeight = box.wh * transform.scale;
        const PADDING_SCREEN = 10;
        return (
            mouseX >= screenX - screenWidth / 2 - PADDING_SCREEN &&
            mouseX <= screenX + screenWidth / 2 + PADDING_SCREEN &&
            mouseY >= screenY - screenHeight / 2 - PADDING_SCREEN &&
            mouseY <= screenY + screenHeight / 2 + PADDING_SCREEN
        );
    }, [transform, worldToScreen]);

    const isOverBoundaryCallLabelArea = useCallback((mouseX: number, mouseY: number, call: BoundaryFileCall): boolean => {
        const bFromPt = pointMap.get(call.from);
        const bToPt   = pointMap.get(call.to);
        if (!bFromPt || !bToPt) return false;
        const bText = call.chordBearing || call.bearing;
        const dText = call.arcLength ? `L=${call.arcLength.toFixed(2)}'` : call.distance;
        if (!bText && !dText) return false;
        const labelText = [bText, dText].filter(Boolean).join(' / ');
        const worldTextHeight = settings.pointAttributeScaling === 'world'
            ? 2.0 * lineLabelScale
            : 10 * lineLabelScale * (1 / transform.scale);
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        ctx.font = `italic 600 ${worldTextHeight}px Arial`;
        const textWidth = ctx.measureText(labelText).width;
        const padding = worldTextHeight * 0.2;
        const lmx = (bFromPt.easting + bToPt.easting) / 2;
        const lmy = (bFromPt.northing + bToPt.northing) / 2;
        const pt = worldToScreen(lmx, lmy);
        const screenX = pt.x;
        const screenY = pt.y;
        const screenWidth  = (textWidth + 2 * padding) * transform.scale;
        const screenHeight = (worldTextHeight + 2 * padding) * transform.scale;
        const PAD = 10;
        return (
            mouseX >= screenX - screenWidth / 2 - PAD &&
            mouseX <= screenX + screenWidth / 2 + PAD &&
            mouseY >= screenY - screenHeight / 2 - PAD &&
            mouseY <= screenY + screenHeight / 2 + PAD
        );
    }, [transform, lineLabelScale, pointMap, worldToScreen]);

    const isOverDeedMetadataArea = useCallback((mouseX: number, mouseY: number): boolean => {
        if (!deedMetadata || points.length === 0 || activeAgent !== AgentType.DEED_READER) return false;
        
        // Calculate center of all deed points
        let sumNorthing = 0;
        let sumEasting = 0;
        let count = 0;
        
        points.forEach(p => {
            const pNumberLower = p.pointNumber?.toLowerCase() || '';
            if (pNumberLower.includes('int-') || pNumberLower.startsWith('int_')) {
                return;
            }
            sumNorthing += p.northing;
            sumEasting += p.easting;
            count++;
        });
        
        if (count === 0) return false;
        
        const centerNorthing = sumNorthing / count;
        const centerEasting = sumEasting / count;
        
        const offsetX = props.deedMetadataOffset?.x || 0;
        const offsetY = props.deedMetadataOffset?.y || 0;
        
        // Build text lines to measure box size
        const textLines: string[] = [];
        if (deedMetadata.owners && deedMetadata.owners.length > 0) {
            textLines.push(`Owner: ${deedMetadata.owners.join(' to ')}`);
        }
        if (deedMetadata.deedBook || deedMetadata.deedPage) {
            const bookPage = [
                deedMetadata.deedBook ? `Book ${deedMetadata.deedBook}` : '',
                deedMetadata.deedPage ? `Page ${deedMetadata.deedPage}` : ''
            ].filter(Boolean).join(', ');
            if (bookPage) textLines.push(bookPage);
        }
        if (deedMetadata.parcelId) {
            textLines.push(`Parcel: ${deedMetadata.parcelId}`);
        }
        
        if (textLines.length === 0) return false;
        
        const worldTextHeight = settings.pointAttributeScaling === 'world'
            ? 2.0 * lineLabelScale
            : 10 * lineLabelScale * (1 / transform.scale);
        const lineHeight = worldTextHeight * 1.4;
        
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        ctx.font = `600 ${worldTextHeight}px Arial`;
        const maxWidth = Math.max(...textLines.map(line => ctx.measureText(line).width));
        const padding = worldTextHeight * 0.5;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = textLines.length * lineHeight + padding;
        
        // Convert world coordinates to screen coordinates
        const labelWorldX = centerEasting + offsetX;
        const labelWorldY = centerNorthing + offsetY;
        const pt = worldToScreen(labelWorldX, labelWorldY);
        const screenX = pt.x;
        const screenY = pt.y;
        
        const screenWidth = boxWidth * transform.scale;
        const screenHeight = boxHeight * transform.scale;
        
        const PADDING_SCREEN = 10;
        
        return (
            mouseX >= screenX - screenWidth / 2 - PADDING_SCREEN &&
            mouseX <= screenX + screenWidth / 2 + PADDING_SCREEN &&
            mouseY >= screenY - screenHeight / 2 - PADDING_SCREEN &&
            mouseY <= screenY + screenHeight / 2 + PADDING_SCREEN
        );
    }, [deedMetadata, points, activeAgent, props.deedMetadataOffset, lineLabelScale, transform, worldToScreen]);

    const isOverOwnerNameArea = useCallback((mouseX: number, mouseY: number): boolean => {
        if (!deedMetadata || points.length === 0 || activeAgent !== AgentType.DEED_READER) return false;
        
        // Calculate center of all deed points
        let sumNorthing = 0;
        let sumEasting = 0;
        let count = 0;
        
        points.forEach(p => {
            const pNumberLower = p.pointNumber?.toLowerCase() || '';
            if (pNumberLower.includes('int-') || pNumberLower.startsWith('int_')) {
                return;
            }
            sumNorthing += p.northing;
            sumEasting += p.easting;
            count++;
        });
        
        if (count === 0) return false;
        
        const centerNorthing = sumNorthing / count;
        const centerEasting = sumEasting / count;
        
        const offsetX = props.ownerNameOffset?.x || 0;
        const offsetY = props.ownerNameOffset?.y || 10;
        
        // Build all text lines (matching rendering logic)
        const textLines: string[] = [];
        if (deedMetadata.owners && deedMetadata.owners.length > 0) {
            textLines.push(`Owner: ${deedMetadata.owners.join(' to ')}`);
        }
        if (deedMetadata.deedBook || deedMetadata.deedPage) {
            const bookPage = [
                deedMetadata.deedBook ? `Book ${deedMetadata.deedBook}` : '',
                deedMetadata.deedPage ? `Page ${deedMetadata.deedPage}` : ''
            ].filter(Boolean).join(', ');
            if (bookPage) textLines.push(bookPage);
        }
        if (deedMetadata.parcelId) {
            textLines.push(`Parcel: ${deedMetadata.parcelId}`);
        }
        
        if (textLines.length === 0) return false;
        
        const worldTextHeight = settings.pointAttributeScaling === 'world'
            ? 2.0 * lineLabelScale
            : 10 * lineLabelScale * (1 / transform.scale);
        const lineHeight = worldTextHeight * 1.4;
        
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        
        ctx.font = `600 ${worldTextHeight}px Arial`;
        const maxWidth = Math.max(...textLines.map(line => ctx.measureText(line).width));
        const padding = worldTextHeight * 0.2;
        const totalHeight = textLines.length * lineHeight;
        
        // Convert world coordinates to screen coordinates
        const labelWorldX = centerEasting + offsetX;
        const labelWorldY = centerNorthing + offsetY;
        const pt = worldToScreen(labelWorldX, labelWorldY);
        const screenX = pt.x;
        const screenY = pt.y;
        
        const screenWidth = (maxWidth + 2 * padding) * transform.scale;
        const screenHeight = (totalHeight + 2 * padding) * transform.scale;
        
        return (
            mouseX >= screenX - screenWidth / 2 &&
            mouseX <= screenX + screenWidth / 2 &&
            mouseY >= screenY - screenHeight / 2 &&
            mouseY <= screenY + screenHeight / 2
        );
    }, [deedMetadata, points, activeAgent, props.ownerNameOffset, lineLabelScale, transform, worldToScreen]);

    /** Rotate the movable boundary 180° during the align-slide phase by
     *  swapping which movable-line endpoint snaps to which target-line
     *  endpoint. Re-bases the slide so the cursor doesn't jump. Bound to R. */
    const rotateAlign180 = useCallback(() => {
        if (!boundaryAlignSliding || !boundaryAlignMovable || !boundaryAlignTarget) return;
        if (!props.onUpdateBoundaryTransform) return;
        const nextFlipped = !boundaryAlignFlipped;
        const aligned = computeBoundaryAlignSnap(
            { bfId: boundaryAlignMovable.bfId, callId: boundaryAlignMovable.callId },
            boundaryAlignTarget,
            nextFlipped,
        );
        if (!aligned) return;
        setBoundaryAlignFlipped(nextFlipped);
        props.onUpdateBoundaryTransform(boundaryAlignMovable.bfId, {
            translationE: aligned.txE,
            translationN: aligned.txN,
            rotationDeg: aligned.rotDeg,
        });
        const cur = cursorWorldPosRef.current;
        const proj = cur ? cur.x * aligned.dirE + cur.y * aligned.dirN : 0;
        boundaryAlignSlideRef.current = {
            movableBfId: boundaryAlignMovable.bfId,
            rotDegFixed: aligned.rotDeg,
            baseTxE: aligned.txE,
            baseTxN: aligned.txN,
            dirE: aligned.dirE,
            dirN: aligned.dirN,
            targetLen: aligned.targetLen,
            movableLen: aligned.movableLen,
            mouseStartProj: proj,
            sMin: -1e9,
            sMax:  1e9,
        };
    // `computeBoundaryAlignSnap` is intentionally omitted from deps — it's declared later
    // in this component body, so listing it here would TDZ on every render. Closure resolves
    // it lazily when this callback actually fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boundaryAlignSliding, boundaryAlignMovable, boundaryAlignTarget, boundaryAlignFlipped, props]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;
        if (e.key === 'Control' || e.key === 'Meta') {
            setIsCtrlPressed(true);
        }
        if (e.key === 'Alt') {
            setIsAltPressed(true);
        }
        if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey && isLinearDrawingMode(drawingMode) && polylinePoints.length > 0) {
            if (/^[0-9.]$/.test(e.key)) {
                e.preventDefault();
                setTypedSegmentLength(prev => {
                    if (e.key === '.' && prev.includes('.')) return prev;
                    return `${prev}${e.key}`;
                });
                if (drawRef.current) {
                    requestAnimationFrame(() => drawRef.current?.());
                }
                return;
            }
            if (e.key === 'Backspace' && typedSegmentLength.length > 0) {
                e.preventDefault();
                setTypedSegmentLength(prev => prev.slice(0, -1));
                if (drawRef.current) {
                    requestAnimationFrame(() => drawRef.current?.());
                }
                return;
            }
            if (e.key === 'Enter' && typedSegmentLength.length > 0) {
                e.preventDefault();
                const lengthVal = Number(typedSegmentLength);
                const anchor = polylinePoints[polylinePoints.length - 1];
                if (anchor && Number.isFinite(lengthVal) && lengthVal > 0) {
                    const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                    const worldLength = convertLinearUnits(lengthVal, fromUnit, 'foot');
                    let target = activeOsnapPoint
                        ? { easting: activeOsnapPoint.easting, northing: activeOsnapPoint.northing }
                        : (cursorWorldPosRef.current
                            ? { easting: cursorWorldPosRef.current.x, northing: cursorWorldPosRef.current.y }
                            : { easting: anchor.easting + 1, northing: anchor.northing });
                    if (isOrthoEnabled && !activeOsnapPoint) {
                        target = applyOrthoConstraint(anchor, target);
                    }
                    let dx = target.easting - anchor.easting;
                    let dy = target.northing - anchor.northing;
                    const mag = Math.hypot(dx, dy);
                    if (mag < 1e-9) {
                        dx = 1;
                        dy = 0;
                    } else {
                        dx /= mag;
                        dy /= mag;
                    }
                    const next = makeTempWorldPoint(anchor.easting + dx * worldLength, anchor.northing + dy * worldLength);
                    setPolylinePoints(prev => [...prev, next]);
                }
                setTypedSegmentLength('');
                return;
            }
        }
        // Circle mode typing & commands
        if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey && drawingMode === 'circle') {
            if (e.key === 't' || e.key === 'T') {
                e.preventDefault();
                setCircleSubMode(prev => {
                    if (prev === 'ttr') {
                        setTtrStep(1);
                        setTtrEntity1(null);
                        setTtrEntity2(null);
                        setTtrHoverEntity(null);
                        setTypedCircleValue('');
                        return 'center-radius';
                    } else {
                        setCircleCenter(null);
                        setTtrStep(1);
                        setTtrEntity1(null);
                        setTtrEntity2(null);
                        setTtrHoverEntity(null);
                        setTypedCircleValue('');
                        return 'ttr';
                    }
                });
                return;
            }
            if (/^[0-9.]$/.test(e.key)) {
                e.preventDefault();
                setTypedCircleValue(prev => {
                    if (e.key === '.' && prev.includes('.')) return prev;
                    return `${prev}${e.key}`;
                });
                return;
            }
            if (e.key === 'Backspace' && typedCircleValue.length > 0) {
                e.preventDefault();
                setTypedCircleValue(prev => prev.slice(0, -1));
                return;
            }
            if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                setCircleSizeParam(prev => prev === 'diameter' ? 'radius' : 'diameter');
                return;
            }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                setCircleSizeParam('radius');
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (circleSubMode === 'ttr') {
                    if (ttrStep === 3 && ttrEntity1 && ttrEntity2) {
                        let rVal = 25;
                        if (typedCircleValue.trim().length > 0) {
                            const num = Number(typedCircleValue);
                            if (Number.isFinite(num) && num > 0) {
                                const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                                rVal = convertLinearUnits(num, fromUnit, 'foot');
                            }
                        } else if (cursorWorldPosRef.current) {
                            rVal = Math.hypot(cursorWorldPosRef.current.x - ttrEntity2.pickPoint.x, cursorWorldPosRef.current.y - ttrEntity2.pickPoint.y);
                        }
                        if (circleSizeParam === 'diameter') rVal = rVal / 2;
                        const sol = solveTtrCircle(ttrEntity1, ttrEntity2, rVal);
                        if (sol) {
                            addCircleGeometry(sol.center, sol.radius);
                            setCircleSubMode('center-radius');
                            setTtrStep(1);
                            setTtrEntity1(null);
                            setTtrEntity2(null);
                            setTypedCircleValue('');
                            setDrawingMode('none');
                        }
                    }
                    return;
                }
                if (circleCenter) {
                    let radiusVal = 0;
                    if (typedCircleValue.trim().length > 0) {
                        const num = Number(typedCircleValue);
                        if (Number.isFinite(num) && num > 0) {
                            const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                            const worldVal = convertLinearUnits(num, fromUnit, 'foot');
                            radiusVal = circleSizeParam === 'diameter' ? worldVal / 2 : worldVal;
                        }
                    } else {
                        const target = activeOsnapPoint
                            ? { easting: activeOsnapPoint.easting, northing: activeOsnapPoint.northing }
                            : (cursorWorldPosRef.current
                                ? { easting: cursorWorldPosRef.current.x, northing: cursorWorldPosRef.current.y }
                                : null);
                        if (target) {
                            const dist = Math.hypot(target.easting - circleCenter.easting, target.northing - circleCenter.northing);
                            radiusVal = circleSizeParam === 'diameter' ? dist / 2 : dist;
                        }
                    }
                    if (radiusVal > 1e-6) {
                        addCircleGeometry(circleCenter, radiusVal);
                    }
                    setCircleCenter(null);
                    setTypedCircleValue('');
                    setDrawingMode('none');
                }
                return;
            }
        }
        // L / I / C / S / B — start drawing & selection commands (AutoCAD-like command shortcuts).
        if (!isTextInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setIsBoxSelectMode(false);
                    setSelectedLineIds(new Set());
                } else {
                    finishDrawing();
                    setIsSelectionMode(true);
                    setIsBoxSelectMode(false);
                }
                return;
            }
            if (e.key === 'b' || e.key === 'B') {
                e.preventDefault();
                if (!isSelectionMode) {
                    finishDrawing();
                    setIsSelectionMode(true);
                    setIsBoxSelectMode(true);
                } else {
                    setIsBoxSelectMode(prev => !prev);
                }
                return;
            }
            if (e.key === 't' || e.key === 'T') {
                e.preventDefault();
                if (isTrimmingLines) {
                    setIsTrimmingLines(false);
                    setTrimPoint(null);
                } else {
                    finishDrawing();
                    setIsTrimmingLines(true);
                    setIsExtendingLines(false);
                    setIsDeletingLines(false);
                    setTrimPoint(null);
                    setExtendFromLine(null);
                    setIsSelectionMode(false);
                    setSelectedLineIds(new Set());
                }
                return;
            }
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                if (drawingMode === 'circle') {
                    finishDrawing();
                } else {
                    setDrawingMode('circle');
                    setCircleCenter(null);
                    setCircleSizeParam('radius');
                    setTypedCircleValue('');
                    setIsTrimmingLines(false);
                    setIsExtendingLines(false);
                    setIsDeletingLines(false);
                    setTrimPoint(null);
                    setExtendFromLine(null);
                    setIsSelectionMode(false);
                    setSelectedLineIds(new Set());
                    setPolylinePoints([]);
                    setTypedSegmentLength('');
                }
                return;
            }
            if (e.key === 'o' || e.key === 'O') {
                e.preventDefault();
                setIsOrthoEnabled(prev => !prev);
                return;
            }
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                // Mid-polyline: L switches back to straight segments (CAD
                // polyline Line submode) instead of restarting the polyline.
                if (drawingMode === 'polylines' && polylinePoints.length > 0) {
                    setPolylineArcMode(false);
                    return;
                }
                setDrawingMode('polylines');
                setIsTrimmingLines(false);
                setIsExtendingLines(false);
                setIsDeletingLines(false);
                setTrimPoint(null);
                setExtendFromLine(null);
                setIsSelectionMode(false);
                setSelectedLineIds(new Set());
                setPolylinePoints([]);
                setPolylineArcMode(false);
                lastSegmentTangentRef.current = null;
                setTypedSegmentLength('');
                return;
            }
            if ((e.key === 'a' || e.key === 'A') && drawingMode === 'polylines') {
                // CAD polyline Arc submode: only meaningful once a segment
                // exists, since the arc locks tangent to the previous segment.
                if (polylinePoints.length > 0 && lastSegmentTangentRef.current) {
                    e.preventDefault();
                    setPolylineArcMode(true);
                    return;
                }
            }
            if (e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                setDrawingMode('inclusion');
                setIsTrimmingLines(false);
                setIsExtendingLines(false);
                setIsDeletingLines(false);
                setTrimPoint(null);
                setExtendFromLine(null);
                setIsSelectionMode(false);
                setSelectedLineIds(new Set());
                setPolylinePoints([]);
                setTypedSegmentLength('');
                return;
            }
        }
        // R — rotate movable boundary 180° during align-slide.
        if ((e.key === 'r' || e.key === 'R') && boundaryAlignSliding) {
            if (!isTextInput) {
                e.preventDefault();
                rotateAlign180();
                return;
            }
        }
        if ((e.key === 'Delete' || e.key === 'Backspace' || e.key === 'd' || e.key === 'D') && selectedLineIds.size > 0) {
            if (isTextInput) return;
            e.preventDefault();
            selectedLineIds.forEach(id => onDeleteLine(id));
            setSelectedLineIds(new Set());
        }
        // Escape unwinds the corner-align tool one step at a time: nest picker →
        // pending corner → whole tool (handled by the generic drawingMode branch).
        if (e.key === 'Escape' && drawingMode === 'boundary-corner-align' && (cornerAlignPicker || cornerAlignPendingCorner)) {
            if (isTextInput) return;
            e.preventDefault();
            if (cornerAlignPicker) setCornerAlignPicker(null);
            else setCornerAlignPendingCorner(null);
            return;
        }
        if (e.key === 'Escape' && activeGrip) {
            if (isTextInput) return;
            e.preventDefault();
            setActiveGrip(null);
            setHoveredGrip(null);
            requestAnimationFrame(() => drawRef.current?.());
            return;
        }
        if (e.key === 'Escape' && (isPickingOtOrigin || isPickingOtLineAlign)) {
            if (isTextInput) return;
            e.preventDefault();
            setIsPickingOtOrigin(false);
            setIsPickingOtLineAlign(false);
            return;
        }
        if (e.key === 'Escape' && drawingMode === 'circle') {
            if (isTextInput) return;
            e.preventDefault();
            if (circleSubMode === 'ttr') {
                if (ttrStep === 3) {
                    setTtrStep(2);
                    setTtrEntity2(null);
                    setTypedCircleValue('');
                } else if (ttrStep === 2) {
                    setTtrStep(1);
                    setTtrEntity1(null);
                } else {
                    setCircleSubMode('center-radius');
                    setDrawingMode('none');
                }
            } else if (circleCenter) {
                setCircleCenter(null);
                setTypedCircleValue('');
            } else {
                setDrawingMode('none');
            }
            return;
        }
        if (e.key === 'Escape' && inlineOsnapMenuPos) {
            if (isTextInput) return;
            e.preventDefault();
            setInlineOsnapMenuPos(null);
            return;
        }
        if (e.key === 'Escape' && typedSegmentLength.length > 0) {
            if (isTextInput) return;
            e.preventDefault();
            setTypedSegmentLength('');
            return;
        }
        if (e.key === 'Escape' && isSelectionMode) {
            if (isTextInput) return;
            e.preventDefault();
            if (selectedLineIds.size > 0) {
                setSelectedLineIds(new Set());
            } else {
                setIsSelectionMode(false);
                setIsBoxSelectMode(false);
            }
            return;
        }
        if (e.key === 'Escape' && selectedLineIds.size > 0) {
            setSelectedLineIds(new Set());
            return;
        }
        if (e.key === 'Escape' && (drawingMode !== 'none' || isTrimmingLines || isExtendingLines || isDeletingLines)) {
            if (isTextInput) return;
            e.preventDefault();
            finishDrawing();
            setIsTrimmingLines(false);
            setIsExtendingLines(false);
            setIsDeletingLines(false);
            setExtendFromLine(null);
            setTrimPoint(null);
            setTypedSegmentLength('');
            setCircleCenter(null);
            setTypedCircleValue('');
            setCircleSubMode('center-radius');
            setTtrStep(1);
            setTtrEntity1(null);
            setTtrEntity2(null);
            setTtrHoverEntity(null);
        }
    }, [selectedLineIds, onDeleteLine, boundaryAlignSliding, rotateAlign180, drawingMode, isTrimmingLines, isExtendingLines, isDeletingLines, inlineOsnapMenuPos, typedSegmentLength, polylinePoints, activeOsnapPoint, isOrthoEnabled, applyOrthoConstraint, makeTempWorldPoint, isLinearDrawingMode, cornerAlignPicker, cornerAlignPendingCorner, circleCenter, circleSizeParam, typedCircleValue, circleSubMode, ttrStep, ttrEntity1, ttrEntity2, solveTtrCircle, addCircleGeometry, settings.linearUnits, isPickingOtOrigin, isPickingOtLineAlign, isSelectionMode, isBoxSelectMode]);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            setIsCtrlPressed(false);
        }
        if (e.key === 'Alt') {
            setIsAltPressed(false);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // Auto-exit selection mode when another tool becomes active.
    useEffect(() => {
        if (!isSelectionMode) return;
        if (drawingMode !== 'none' || isTrimmingLines || isExtendingLines || isDeletingLines) {
            setIsSelectionMode(false);
            setSelectedLineIds(new Set());
        }
    }, [isSelectionMode, drawingMode, isTrimmingLines, isExtendingLines, isDeletingLines]);
    
    // Toolbar dragging handlers
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isViewToolbarDragging && viewToolbarDragStart.current) {
                const deltaX = e.clientX - viewToolbarDragStart.current.x;
                const deltaY = e.clientY - viewToolbarDragStart.current.y;
                setViewToolbarPosition({
                    x: viewToolbarDragStart.current.toolbarX + deltaX,
                    y: viewToolbarDragStart.current.toolbarY + deltaY
                });
            }
            if (isEditToolbarDragging && editToolbarDragStart.current) {
                const deltaX = e.clientX - editToolbarDragStart.current.x;
                const deltaY = e.clientY - editToolbarDragStart.current.y;
                setEditToolbarPosition({
                    x: editToolbarDragStart.current.toolbarX + deltaX,
                    y: editToolbarDragStart.current.toolbarY + deltaY
                });
            }
        };
        
        const handleMouseUp = () => {
            if (isViewToolbarDragging) {
                setIsViewToolbarDragging(false);
                viewToolbarDragStart.current = null;
            }
            if (isEditToolbarDragging) {
                setIsEditToolbarDragging(false);
                editToolbarDragStart.current = null;
            }
        };
        
        if (isViewToolbarDragging || isEditToolbarDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isViewToolbarDragging, isEditToolbarDragging]);
    
    const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setCursorScreenPos({ x: mouseX, y: mouseY });

        if (isCtrlPressed && !isLabelDragging) {
            let foundLabel = false;
            for (let i = points.length - 1; i >= 0; i--) {
                if (isOverLabelArea(mouseX, mouseY, points[i])) {
                    foundLabel = true;
                    break;
                }
            }
            if (foundLabel !== isOverLabel) {
                setIsOverLabel(foundLabel);
            }
        } else if (isOverLabel) {
            setIsOverLabel(false);
        }

        // Update hover state for line selection / trim / extend mode
        const isLineSelectMode = (isSelectionMode || isTrimmingLines || isExtendingLines) && drawingMode === 'none' && !isDeletingLines;
        if (isLineSelectMode) {
            const hovered = findLineNearClick(mouseX, mouseY, 15) !== null;
            if (hovered !== isOverLine) setIsOverLine(hovered);
        } else if (isOverLine) {
            setIsOverLine(false);
        }

        if (activeGrip) {
            const mouseWorld = screenToWorld(mouseX, mouseY);
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : (runningOsnaps.size > 0 ? runningOsnaps : new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection', 'center', 'nearest', 'perpendicular', 'tangent']));
            const anchor = activeGrip.type === 'start'
                ? (pointMap.get(activeGrip.line.to) ? { easting: pointMap.get(activeGrip.line.to)!.easting, northing: pointMap.get(activeGrip.line.to)!.northing } : (activeGrip.line.toPt ? { easting: activeGrip.line.toPt.x, northing: activeGrip.line.toPt.y } : null))
                : (pointMap.get(activeGrip.line.from) ? { easting: pointMap.get(activeGrip.line.from)!.easting, northing: pointMap.get(activeGrip.line.from)!.northing } : (activeGrip.line.fromPt ? { easting: activeGrip.line.fromPt.x, northing: activeGrip.line.fromPt.y } : null));
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, 20, anchor);
            setActiveOsnapPoint(snapped);
            let previewPoint = snapped ? { easting: snapped.easting, northing: snapped.northing } : { easting: mouseWorld.easting, northing: mouseWorld.northing };
            if (isOrthoEnabled && anchor && !snapped) {
                previewPoint = applyOrthoConstraint(anchor, previewPoint);
            }
            cursorWorldPosRef.current = { x: previewPoint.easting, y: previewPoint.northing };
            if (drawRef.current) {
                requestAnimationFrame(() => drawRef.current?.());
            }
            return;
        }

        if (selectedLineIds.size > 0 && drawingMode === 'none' && !isTrimmingLines && !isExtendingLines) {
            const hGrip = findGripNearClick(mouseX, mouseY, 9);
            if (hGrip?.id !== hoveredGrip?.id) {
                setHoveredGrip(hGrip);
                if (drawRef.current) {
                    requestAnimationFrame(() => drawRef.current?.());
                }
            }
        } else if (hoveredGrip) {
            setHoveredGrip(null);
            if (drawRef.current) {
                requestAnimationFrame(() => drawRef.current?.());
            }
        }

        if (isPickingOtOrigin) {
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : (runningOsnaps.size > 0 ? runningOsnaps : new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection', 'nearest']));
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, 25);
            setActiveOsnapPoint(snapped);
            if (drawRef.current) {
                requestAnimationFrame(() => drawRef.current?.());
            }
            return;
        }

        if (isTrimmingLines) {
            const mouseWorld = screenToWorld(mouseX, mouseY);
            cursorWorldPosRef.current = { x: mouseWorld.easting, y: mouseWorld.northing };
            const hoveredLine = findLineNearClick(mouseX, mouseY, 15);
            if (hoveredLine) {
                const action = computeTrimAction(hoveredLine, mouseWorld.easting, mouseWorld.northing);
                setTrimHoverPreview(action?.preview || null);
            } else {
                setTrimHoverPreview(null);
            }
            if (drawRef.current) {
                requestAnimationFrame(() => drawRef.current?.());
            }
            return;
        } else if (trimHoverPreview) {
            setTrimHoverPreview(null);
        }

        if (drawingMode === 'circle') {
            const mouseWorld = screenToWorld(mouseX, mouseY);
            if (circleSubMode === 'ttr') {
                if (ttrStep < 3) {
                    const ent = findTtrEntityNearClick(mouseX, mouseY, 25);
                    setTtrHoverEntity(ent);
                    cursorWorldPosRef.current = { x: mouseWorld.easting, y: mouseWorld.northing };
                } else {
                    cursorWorldPosRef.current = { x: mouseWorld.easting, y: mouseWorld.northing };
                }
                if (drawRef.current) {
                    requestAnimationFrame(() => drawRef.current?.());
                }
                return;
            }

            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : (runningOsnaps.size > 0 ? runningOsnaps : new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection', 'nearest']));
            const anchor = circleCenter;
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, 20, anchor);
            setActiveOsnapPoint(snapped);
            let previewPoint = snapped ? { easting: snapped.easting, northing: snapped.northing } : { easting: mouseWorld.easting, northing: mouseWorld.northing };
            if (isOrthoEnabled && anchor && !snapped) {
                previewPoint = applyOrthoConstraint(anchor, previewPoint);
            }
            cursorWorldPosRef.current = { x: previewPoint.easting, y: previewPoint.northing };
            if (drawRef.current) {
                requestAnimationFrame(() => drawRef.current?.());
            }
            return;
        }

        if (drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') {
            const mouseWorld = screenToWorld(mouseX, mouseY);
            const worldX = mouseWorld.easting;
            const worldY = mouseWorld.northing;
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = polylinePoints.length > 0
                ? { easting: polylinePoints[polylinePoints.length - 1].easting, northing: polylinePoints[polylinePoints.length - 1].northing }
                : null;
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, 15, anchor);
            setActiveOsnapPoint(snapped);
            if (polylinePoints.length > 0) {
                let previewPoint = snapped ? { easting: snapped.easting, northing: snapped.northing } : { easting: worldX, northing: worldY };
                if (isOrthoEnabled && anchor && !snapped) {
                    previewPoint = applyOrthoConstraint(anchor, previewPoint);
                }
                cursorWorldPosRef.current = { x: previewPoint.easting, y: previewPoint.northing };
                // Manually trigger draw to update rubberband using stable ref
                if (drawRef.current) {
                    requestAnimationFrame(() => drawRef.current?.());
                }
            }
        } else if (drawingMode === 'aligned-dim') {
            const mouseWorld = screenToWorld(mouseX, mouseY);
            const worldX = mouseWorld.easting;
            const worldY = mouseWorld.northing;
            const dimSnapThresh = 20;
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = dimPhase > 0 && dimP1 ? { easting: dimP1.easting, northing: dimP1.northing } : null;
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, dimSnapThresh, anchor);
            setDimSnapPoint(snapped ? { easting: snapped.easting, northing: snapped.northing } : null);
            setActiveOsnapPoint(snapped);
            setDimPreviewMouse(snapped ? { easting: snapped.easting, northing: snapped.northing } : { easting: worldX, northing: worldY });
        } else if (drawingMode === 'boundary-line') {
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = boundaryLineFrom ? { easting: boundaryLineFrom.easting, northing: boundaryLineFrom.northing } : null;
            const snapped = resolveOsnapAtScreen(mouseX, mouseY, activeModes, 20, anchor);
            setActiveOsnapPoint(snapped);
        } else {
            if (cursorWorldPosRef.current !== null) {
                cursorWorldPosRef.current = null;
            }
            if (activeOsnapPoint !== null) {
                setActiveOsnapPoint(null);
            }
        }
    }, [
        isCtrlPressed, isLabelDragging, points, isOverLabel, isOverLabelArea,
        drawingMode, polylinePoints.length, transform,
        isSelectionMode, isDeletingLines, isTrimmingLines, isExtendingLines, findLineNearClick, isOverLine,
        inlineOsnapOverride, runningOsnaps, resolveOsnapAtScreen, activeOsnapPoint, dimPhase, dimP1, boundaryLineFrom,
        isOrthoEnabled, applyOrthoConstraint, screenToWorld, isPickingOtOrigin,
        circleSubMode, ttrStep, findTtrEntityNearClick, computeTrimAction, trimHoverPreview,
        activeGrip, hoveredGrip, findGripNearClick, selectedLineIds, pointMap
    ]);

    const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setInlineOsnapMenuPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, []);


    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

        setTransform(prev => {
            const newScale = Math.max(0.00001, Math.min(50000, prev.scale * zoomFactor));
            const actualZoomFactor = newScale / prev.scale;
            if (Math.abs(actualZoomFactor - 1) < 1e-9) return prev;

            const newOffsetX = mouseX - (mouseX - prev.offsetX) * actualZoomFactor;
            const newOffsetY = mouseY - (mouseY - prev.offsetY) * actualZoomFactor;
            return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
        });
    }, []);

    // -----------------------------------------------------------------------
    // Boundary-align helpers
    // -----------------------------------------------------------------------
    /** Resolve a boundary call's world-space from/to endpoints by reading
     *  the bf's cached synthMap and applying its translate-then-rotate transform.
     *  Returns null if either endpoint is missing from synthMap. */
    const getBoundaryCallWorldEndpoints = useCallback((bfId: string, callId: string): {
        from: { x: number; y: number };
        to: { x: number; y: number };
    } | null => {
        const cache = bfGeometryCacheRef.current.get(bfId);
        if (!cache) return null;
        const bf = boundaryFiles?.find(b => b.id === bfId);
        if (!bf) return null;
        const call = bf.calls.find(c => c.id === callId);
        if (!call || !call.from || !call.to) return null;
        const fromUn = cache.synthMap.get(call.from);
        const toUn   = cache.synthMap.get(call.to);
        if (!fromUn || !toUn) return null;
        const rotRad = (cache.rotDeg * Math.PI) / 180;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const applyTx = (p: { easting: number; northing: number }) => {
            const dx = p.easting - cache.pob.easting;
            const dy = p.northing - cache.pob.northing;
            return {
                x: dx * cosR - dy * sinR + cache.pob.easting + cache.txE,
                y: dx * sinR + dy * cosR + cache.pob.northing + cache.txN,
            };
        };
        return { from: applyTx(fromUn), to: applyTx(toUn) };
    }, [boundaryFiles]);

    /** Find the boundary call segment closest to (worldX, worldY) within
     *  worldThreshold. Returns { bfId, callId } or null. Curves are tested
     *  as straight chords (good enough for picking — alignment uses chord
     *  direction anyway). */
    const hitTestBoundaryCall = useCallback((worldX: number, worldY: number, worldThreshold: number): {
        bfId: string;
        callId: string;
    } | null => {
        if (!boundaryFiles) return null;
        let bestBf: string | null = null;
        let bestCall: string | null = null;
        let bestDistSq = worldThreshold * worldThreshold;
        for (const bf of boundaryFiles) {
            if (bf.hidden) continue;
            const cache = bfGeometryCacheRef.current.get(bf.id);
            if (!cache) continue;
            for (const call of bf.calls) {
                const ends = getBoundaryCallWorldEndpoints(bf.id, call.id);
                if (!ends) continue;
                // Point-to-segment squared distance.
                const vx = ends.to.x - ends.from.x;
                const vy = ends.to.y - ends.from.y;
                const lenSq = vx * vx + vy * vy;
                if (lenSq < 1e-12) continue;
                let t = ((worldX - ends.from.x) * vx + (worldY - ends.from.y) * vy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                const cx = ends.from.x + t * vx;
                const cy = ends.from.y + t * vy;
                const dSq = (worldX - cx) ** 2 + (worldY - cy) ** 2;
                if (dSq < bestDistSq) {
                    bestDistSq = dSq;
                    bestBf = bf.id;
                    bestCall = call.id;
                }
            }
        }
        if (bestBf && bestCall) return { bfId: bestBf, callId: bestCall };
        return null;
    }, [boundaryFiles, getBoundaryCallWorldEndpoints]);

    /** Compute the (translationE, translationN, rotationDeg) needed on the
     *  movable bf so its picked line becomes collinear with the target line,
     *  with movable.from snapped to target.from. Also returns the unit
     *  direction along the target line and both line lengths (used by the
     *  slide-phase mouse handler). */
    const computeBoundaryAlignSnap = useCallback((
        movablePick: { bfId: string; callId: string },
        targetPick:  { bfId: string; callId: string },
        flipped: boolean = false,
    ): {
        txE: number; txN: number; rotDeg: number;
        dirE: number; dirN: number;
        movableLen: number; targetLen: number;
    } | null => {
        const movCache = bfGeometryCacheRef.current.get(movablePick.bfId);
        const tgtEnds  = getBoundaryCallWorldEndpoints(targetPick.bfId, targetPick.callId);
        if (!movCache || !tgtEnds) return null;
        const bf = boundaryFiles?.find(b => b.id === movablePick.bfId);
        const call = bf?.calls.find(c => c.id === movablePick.callId);
        if (!bf || !call || !call.from || !call.to) return null;
        const rawFromUn = movCache.synthMap.get(call.from);
        const rawToUn   = movCache.synthMap.get(call.to);
        if (!rawFromUn || !rawToUn) return null;
        // When flipped, swap which movable endpoint snaps to target.from — yields a 180° rotation.
        const movFromUn = flipped ? rawToUn   : rawFromUn;
        const movToUn   = flipped ? rawFromUn : rawToUn;
        // Solve F(p) = R(θ)(p - POB) + POB + T where F(movFromUn) = tgtEnds.from
        // and F(movToUn) lies on the target ray with same orientation.
        const targetDx = tgtEnds.to.x - tgtEnds.from.x;
        const targetDy = tgtEnds.to.y - tgtEnds.from.y;
        const targetLen = Math.hypot(targetDx, targetDy);
        const movDx = movToUn.easting - movFromUn.easting;
        const movDy = movToUn.northing - movFromUn.northing;
        const movableLen = Math.hypot(movDx, movDy);
        if (targetLen < 1e-9 || movableLen < 1e-9) return null;
        const targetAng = Math.atan2(targetDy, targetDx);
        const movAng    = Math.atan2(movDy, movDx);
        const thetaRad  = targetAng - movAng;
        const cosT = Math.cos(thetaRad);
        const sinT = Math.sin(thetaRad);
        // T = Q_from - POB - R(θ)(M_from - POB)
        const ax = movFromUn.easting  - movCache.pob.easting;
        const ay = movFromUn.northing - movCache.pob.northing;
        const rotAx = ax * cosT - ay * sinT;
        const rotAy = ax * sinT + ay * cosT;
        const txE = tgtEnds.from.x - movCache.pob.easting  - rotAx;
        const txN = tgtEnds.from.y - movCache.pob.northing - rotAy;
        return {
            txE,
            txN,
            rotDeg: (thetaRad * 180) / Math.PI,
            dirE: targetDx / targetLen,
            dirN: targetDy / targetLen,
            movableLen,
            targetLen,
        };
    }, [boundaryFiles, getBoundaryCallWorldEndpoints]);

    /** Enumerate world-space corners of a bf using its cached synthMap +
     *  (optionally overridden) transform. Used by slide-time corner snap to
     *  find coincident movable<->target vertices. */
    const getBoundaryCornersWorld = useCallback((bfId: string, overrideTx?: { txE: number; txN: number; rotDeg: number }): { x: number; y: number }[] => {
        const cache = bfGeometryCacheRef.current.get(bfId);
        if (!cache) return [];
        const tx = overrideTx ?? { txE: cache.txE, txN: cache.txN, rotDeg: cache.rotDeg };
        const rotRad = (tx.rotDeg * Math.PI) / 180;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const out: { x: number; y: number }[] = [];
        cache.synthMap.forEach(p => {
            const dx = p.easting - cache.pob.easting;
            const dy = p.northing - cache.pob.northing;
            out.push({
                x: dx * cosR - dy * sinR + cache.pob.easting + tx.txE,
                y: dx * sinR + dy * cosR + cache.pob.northing + tx.txN,
            });
        });
        return out;
    }, []);

    // =====================================================================
    // Corner-align tool helpers
    // =====================================================================

    /** Enumerate the deed's vertices with their point-number labels, in BOTH the
     *  un-baked COGO frame (the fit's source space) and current world space (for
     *  hit-testing / drawing markers). */
    const getBoundaryCornerEntries = useCallback((bfId: string): { pn: string; srcE: number; srcN: number; x: number; y: number }[] => {
        const cache = bfGeometryCacheRef.current.get(bfId);
        if (!cache) return [];
        const rotRad = (cache.rotDeg * Math.PI) / 180;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const out: { pn: string; srcE: number; srcN: number; x: number; y: number }[] = [];
        cache.synthMap.forEach((p, pn) => {
            const dx = p.easting - cache.pob.easting;
            const dy = p.northing - cache.pob.northing;
            out.push({
                pn,
                srcE: p.easting,
                srcN: p.northing,
                x: dx * cosR - dy * sinR + cache.pob.easting + cache.txE,
                y: dx * sinR + dy * cosR + cache.pob.northing + cache.txN,
            });
        });
        return out;
    }, []);

    /** Nearest deed corner to a world coordinate, within `tol` world units. */
    const hitTestBoundaryCorner = useCallback((bfId: string, worldX: number, worldY: number, tol: number) => {
        let best: { pn: string; srcE: number; srcN: number; x: number; y: number } | null = null;
        let bestD2 = tol * tol;
        for (const c of getBoundaryCornerEntries(bfId)) {
            const d2 = (c.x - worldX) ** 2 + (c.y - worldY) ** 2;
            if (d2 <= bestD2) { bestD2 = d2; best = c; }
        }
        return best;
    }, [getBoundaryCornerEntries]);

    // The bf geometry cache is rebuilt inside the canvas draw effect, so mirror it
    // into state (after that effect has run) for the DOM corner markers to render.
    const [cornerAlignCorners, setCornerAlignCorners] = useState<{ pn: string; srcE: number; srcN: number; x: number; y: number }[]>([]);
    useEffect(() => {
        if (drawingMode !== 'boundary-corner-align' || !cornerAlignBfId) {
            setCornerAlignCorners(prev => (prev.length === 0 ? prev : []));
            return;
        }
        setCornerAlignCorners(getBoundaryCornerEntries(cornerAlignBfId));
    }, [drawingMode, cornerAlignBfId, boundaryFiles, pointMap, getBoundaryCornerEntries]);

    /**
     * Rigid-body (2D Helmert without scale) fit of the deed's un-baked vertices onto
     * the found points the user paired them with. See utils/cornerAlign.ts — the solve
     * is expressed in the same frame the BFOverlay renderer uses, so the result drops
     * straight into translationE/translationN/rotationDeg.
     *
     *  • 1 pair   → pure translation, the boundary keeps its current rotation.
     *  • 2+ pairs → least-squares rotation + translation (deed shape preserved:
     *    bearings and distances are never stretched).
     */
    const solveCornerAlign = useCallback((bfId: string, pairs: CornerAlignPair[], fallbackRotDeg: number) => {
        const cache = bfGeometryCacheRef.current.get(bfId);
        if (!cache) return null;
        return solveRigidCornerAlign(cache.pob, pairs, fallbackRotDeg);
    }, []);

    /** Re-solve and live-preview the fit for the given pair set. */
    const applyCornerAlign = useCallback((bfId: string, pairs: CornerAlignPair[]) => {
        if (!props.onUpdateBoundaryTransform) return;
        const base = cornerAlignBaseTxRef.current;
        const fit = solveCornerAlign(bfId, pairs, base?.rotationDeg ?? 0);
        if (!fit) return;
        props.onUpdateBoundaryTransform(bfId, {
            translationE: fit.translationE,
            translationN: fit.translationN,
            rotationDeg: fit.rotationDeg,
        });
        setCornerAlignFit({ rmse: fit.rmse, maxResidual: fit.maxResidual, rotDeg: fit.rotationDeg });
    }, [props, solveCornerAlign]);

    /** Tear down corner-align state. `restore` puts the boundary back where it started. */
    const resetCornerAlign = useCallback((restore: boolean) => {
        if (restore && cornerAlignBfId && cornerAlignBaseTxRef.current && props.onUpdateBoundaryTransform) {
            props.onUpdateBoundaryTransform(cornerAlignBfId, cornerAlignBaseTxRef.current);
        }
        cornerAlignBaseTxRef.current = null;
        setCornerAlignBfId(null);
        setCornerAlignPairs([]);
        setCornerAlignPendingCorner(null);
        setCornerAlignPicker(null);
        setCornerAlignFit(null);
        setCornerAlignHover(null);
    }, [cornerAlignBfId, props]);

    /** Pair the pending corner with a found point and refresh the fit. */
    const commitCornerAlignPoint = useCallback((sp: SurveyPoint) => {
        const bfId = cornerAlignBfId;
        const corner = cornerAlignPendingCorner;
        if (!bfId || !corner) return;
        // Re-picking the same corner (or the same found point) replaces the old pair
        // rather than double-weighting it in the least-squares solve.
        const next = cornerAlignPairs.filter(p => p.pn !== corner.pn && p.targetPn !== sp.pointNumber);
        next.push({
            pn: corner.pn,
            srcE: corner.srcE,
            srcN: corner.srcN,
            targetPn: sp.pointNumber,
            targetE: sp.easting,
            targetN: sp.northing,
        });
        setCornerAlignPairs(next);
        setCornerAlignPendingCorner(null);
        setCornerAlignPicker(null);
        applyCornerAlign(bfId, next);
    }, [cornerAlignBfId, cornerAlignPendingCorner, cornerAlignPairs, applyCornerAlign]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (inlineOsnapMenuPos) {
            setInlineOsnapMenuPos(null);
        }
        const currentSnap = activeOsnapPoint;
        if (activeOsnapPoint !== null) {
            setActiveOsnapPoint(null);
        }

        if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            document.body.classList.add('panning');
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (e.button !== 0) return;

        // OT (UCS) Origin Pick Mode — click on canvas or snap to point/line to set origin
        if (isPickingOtOrigin) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : (runningOsnaps.size > 0 ? runningOsnaps : new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection', 'nearest']));
            const snapped = currentSnap || resolveOsnapAtScreen(clickX, clickY, activeModes, 25);
            if (inlineOsnapOverride) setInlineOsnapOverride(null);
            const nearestExisting = findNearestSurveyPoint(clickX, clickY, 25);

            let pickedE = 0;
            let pickedN = 0;
            if (snapped) {
                pickedE = snapped.easting;
                pickedN = snapped.northing;
            } else if (nearestExisting) {
                pickedE = nearestExisting.easting;
                pickedN = nearestExisting.northing;
            } else {
                const worldCoords = screenToWorld(clickX, clickY);
                pickedE = worldCoords.easting;
                pickedN = worldCoords.northing;
            }

            const roundedE = Math.round(pickedE * 1000) / 1000;
            const roundedN = Math.round(pickedN * 1000) / 1000;

            if (onSetOrientationTuple) {
                onSetOrientationTuple(prev => {
                    const m = prev.mode ?? 'drafting';
                    if (m === 'drafting') {
                        return {
                            ...prev,
                            draftingOriginX: roundedE,
                            draftingOriginY: roundedN,
                            originX: roundedE,
                            originY: roundedN,
                            placed: true,
                        };
                    } else {
                        return {
                            ...prev,
                            viewOriginX: roundedE,
                            viewOriginY: roundedN,
                            originX: roundedE,
                            originY: roundedN,
                            placed: true,
                        };
                    }
                });
            }
            setIsPickingOtOrigin(false);
            return;
        }

        // OT (UCS) Line Align Mode — click any line or boundary call to align orientation angle to it
        if (isPickingOtLineAlign) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const clickedLine = findLineNearClick(clickX, clickY, 20);
            let targetAngleRad: number | null = null;
            let p1E: number | undefined;
            let p1N: number | undefined;

            if (clickedLine) {
                const p1 = pointMap.get(clickedLine.from);
                const p2 = pointMap.get(clickedLine.to);
                const x1 = p1 ? p1.easting : clickedLine.fromPt?.x;
                const y1 = p1 ? p1.northing : clickedLine.fromPt?.y;
                const x2 = p2 ? p2.easting : clickedLine.toPt?.x;
                const y2 = p2 ? p2.northing : clickedLine.toPt?.y;
                if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    if (Math.hypot(dx, dy) > 1e-9) {
                        targetAngleRad = Math.atan2(dy, dx);
                        p1E = x1;
                        p1N = y1;
                    }
                }
            } else if (boundaryFiles) {
                const worldCoords = screenToWorld(clickX, clickY);
                const hit = hitTestBoundaryCall(worldCoords.easting, worldCoords.northing, 20 / transform.scale);
                if (hit) {
                    const endpoints = getBoundaryCallWorldEndpoints(hit.bfId, hit.callId);
                    if (endpoints) {
                        const dx = endpoints.to.x - endpoints.from.x;
                        const dy = endpoints.to.y - endpoints.from.y;
                        if (Math.hypot(dx, dy) > 1e-9) {
                            targetAngleRad = Math.atan2(dy, dx);
                            p1E = endpoints.from.x;
                            p1N = endpoints.from.y;
                        }
                    }
                }
            }

            if (targetAngleRad !== null && onSetOrientationTuple) {
                onSetOrientationTuple(prev => {
                    const m = prev.mode ?? 'drafting';
                    const rad = targetAngleRad!;
                    const originE = p1E !== undefined ? Math.round(p1E * 1000) / 1000 : (prev.originX || 0);
                    const originN = p1N !== undefined ? Math.round(p1N * 1000) / 1000 : (prev.originY || 0);
                    if (m === 'drafting') {
                        return {
                            ...prev,
                            draftingAngle: rad,
                            angle: rad,
                            draftingOriginX: originE,
                            draftingOriginY: originN,
                            originX: originE,
                            originY: originN,
                            placed: true,
                        };
                    } else {
                        return {
                            ...prev,
                            viewAngle: rad,
                            angle: rad,
                            viewOriginX: originE,
                            viewOriginY: originN,
                            originX: originE,
                            originY: originN,
                            placed: true,
                        };
                    }
                });
            }

            setIsPickingOtLineAlign(false);
            return;
        }

        // Symbol exclusion mode — click any point and we suppress symbols for
        // every point sharing that description (so disassociating one
        // disassociates the entire group). Click again to re-enable.
        if (symbolExclusionMode) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const HIT = 14;
                let nearestDesc: string | null = null;
                let bestDist = HIT * HIT;
                for (const p of points) {
                    if (p.hidden) continue;
                    if (!p.description) continue;
                    const pt = worldToScreen(p.easting, p.northing);
                    const sx = pt.x;
                    const sy = pt.y;
                    const d = (mx - sx) ** 2 + (my - sy) ** 2;
                    if (d < bestDist) { bestDist = d; nearestDesc = p.description; }
                }
                if (nearestDesc) {
                    const key = nearestDesc.trim().toUpperCase();
                    setExcludedSymbolDescriptions(prev => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                    });
                    return;
                }
            }
        }

        // Corner-align tool — alternate corner pick / found-point pick.
        // Shift+click on the found-point step opens the nest picker.
        if (drawingMode === 'boundary-corner-align' && cornerAlignBfId) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const worldCoords = screenToWorld(mx, my);
            const worldX = worldCoords.easting;
            const worldY = worldCoords.northing;

            // An open nest picker swallows the click — the user chooses from the list.
            if (cornerAlignPicker) {
                setCornerAlignPicker(null);
                return;
            }

            if (!cornerAlignPendingCorner) {
                const CORNER_HIT_PX = 14;
                const corner = hitTestBoundaryCorner(cornerAlignBfId, worldX, worldY, CORNER_HIT_PX / transform.scale);
                if (corner) {
                    setCornerAlignPendingCorner(corner);
                    setCornerAlignHover(null);
                }
                return;
            }

            // Found-point step. Collect candidates around the cursor; Shift always
            // opens the list, and a plain click falls back to the list whenever the
            // nest holds more than one point so nothing is silently guessed.
            const PICK_PX = e.shiftKey ? 30 : 16;
            const tolWorld = PICK_PX / transform.scale;
            const nest = points
                .filter(p => !p.hidden && Math.hypot(p.easting - worldX, p.northing - worldY) <= tolWorld)
                .sort((a, b) =>
                    Math.hypot(a.easting - worldX, a.northing - worldY) -
                    Math.hypot(b.easting - worldX, b.northing - worldY));
            if (nest.length === 0) return;
            if (nest.length === 1 && !e.shiftKey) {
                commitCornerAlignPoint(nest[0]);
                return;
            }
            setCornerAlignPicker({ x: mx, y: my, items: nest.slice(0, 12) });
            return;
        }

        // Boundary-align tool — pick movable line, then target line, then slide.
        if (drawingMode === 'boundary-align') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const worldCoords = screenToWorld(mx, my);
            const worldX = worldCoords.easting;
            const worldY = worldCoords.northing;
            // Pixel threshold → world threshold via current scale.
            const HIT_PX = 12;
            const hit = hitTestBoundaryCall(worldX, worldY, HIT_PX / transform.scale);
            const exitTool = () => {
                setBoundaryAlignSliding(false);
                setBoundaryAlignFlipped(false);
                boundaryAlignSlideRef.current = null;
                setBoundaryAlignMovable(null);
                setBoundaryAlignTarget(null);
                setDrawingMode('none');
                props.onBoundaryAlignRequestHandled?.();
            };
            // Active slide: a click commits the current position and exits the tool.
            if (boundaryAlignSliding) {
                exitTool();
                return;
            }
            // Movable preset from parent (BoundaryEditor) but no line picked yet:
            // the click must land on a line belonging to the preset bf.
            if (boundaryAlignMovable && boundaryAlignMovable.callId === '__pending__') {
                if (!hit) return;
                if (hit.bfId !== boundaryAlignMovable.bfId) return; // ignore clicks on other bfs
                setBoundaryAlignMovable({ bfId: hit.bfId, callId: hit.callId });
                return;
            }
            if (!boundaryAlignMovable) {
                if (hit) setBoundaryAlignMovable({ bfId: hit.bfId, callId: hit.callId });
                return;
            }
            if (!boundaryAlignTarget) {
                if (!hit || hit.bfId === boundaryAlignMovable.bfId) return; // must be a DIFFERENT bf
                setBoundaryAlignTarget({ bfId: hit.bfId, callId: hit.callId });
                setBoundaryAlignFlipped(false);
                // Snap movable so the picked line is collinear with the target line.
                const aligned = computeBoundaryAlignSnap(boundaryAlignMovable, { bfId: hit.bfId, callId: hit.callId }, false);
                if (aligned && props.onUpdateBoundaryTransform) {
                    props.onUpdateBoundaryTransform(boundaryAlignMovable.bfId, {
                        translationE: aligned.txE,
                        translationN: aligned.txN,
                        rotationDeg: aligned.rotDeg,
                    });
                    // Enter slide mode — mouse projection onto target line
                    // becomes the slide parameter. Click anywhere to commit.
                    boundaryAlignSlideRef.current = {
                        movableBfId: boundaryAlignMovable.bfId,
                        rotDegFixed: aligned.rotDeg,
                        baseTxE: aligned.txE,
                        baseTxN: aligned.txN,
                        dirE: aligned.dirE,
                        dirN: aligned.dirN,
                        targetLen: aligned.targetLen,
                        movableLen: aligned.movableLen,
                        mouseStartProj: worldX * aligned.dirE + worldY * aligned.dirN,
                        sMin: -1e9,
                        sMax:  1e9,
                    };
                    setBoundaryAlignSliding(true);
                }
                return;
            }
            return;
        }

        // Shrinkwrap point removal — click nearest source point to exclude it
        if (props.shrinkwrapSourcePns?.length && props.onShrinkwrapPointClick && drawingMode === 'none' && !isDeletingLines && !isTrimmingLines && !isExtendingLines) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const HIT = 14;
                let nearest: string | null = null;
                let bestDist = HIT * HIT;
                for (const p of points) {
                    if (!props.shrinkwrapSourcePns.includes(p.pointNumber)) continue;
                    const pt = worldToScreen(p.easting, p.northing);
                    const sx = pt.x;
                    const sy = pt.y;
                    const d = (mx - sx) ** 2 + (my - sy) ** 2;
                    if (d < bestDist) { bestDist = d; nearest = p.pointNumber; }
                }
                if (nearest) {
                    props.onShrinkwrapPointClick(nearest);
                    hoveredShrinkwrapPnRef.current = null;
                    setHoveredShrinkwrapPn(null);
                    return;
                }
            }
        }

        // General point selection — fires whenever a point is clicked in normal mode.
        // Does NOT consume the event (no return), so panning still works when clicking empty space.
        if (props.onPointSelected && drawingMode === 'none' && !isDeletingLines && !isTrimmingLines && !isExtendingLines) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const HIT = 16;
                let nearest: SurveyPoint | null = null;
                let bestDist = HIT * HIT;
                for (const p of points) {
                    const pt = worldToScreen(p.easting, p.northing);
                    const sx = pt.x;
                    const sy = pt.y;
                    const d = (mx - sx) ** 2 + (my - sy) ** 2;
                    if (d < bestDist) { bestDist = d; nearest = p; }
                }
                if (nearest) {
                    props.onPointSelected(nearest);
                    // Don't return — allow normal canvas behavior to continue
                }
            }
        }

        // Grip selection and stretch manipulation
        if (selectedLineIds.size > 0 && drawingMode === 'none' && !isDeletingLines && !isTrimmingLines && !isExtendingLines) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const worldCoords = screenToWorld(clickX, clickY);

                if (activeGrip) {
                    commitActiveGrip(activeGrip, worldCoords.easting, worldCoords.northing, activeOsnapPoint);
                    return;
                }

                const clickedGrip = findGripNearClick(clickX, clickY, 10);
                if (clickedGrip) {
                    setActiveGrip(clickedGrip);
                    activeGripDragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
                    return;
                }
            }
        }

        // Line selection mode: dedicated selection tool active
        if (isSelectionMode && drawingMode === 'none' && !isDeletingLines && !isTrimmingLines && !isExtendingLines) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const clickedLine = findLineNearClick(clickX, clickY, 15);
            if (clickedLine && !isBoxSelectMode) {
                const lineId = clickedLine.id || `${clickedLine.from}-${clickedLine.to}`;
                setSelectedLineIds(prev => {
                    const next = new Set(prev);
                    if (next.has(lineId)) {
                        next.delete(lineId);
                    } else {
                        next.add(lineId);
                    }
                    return next;
                });
                return;
            }
            // Click on empty space (or in box mode) — initiate AutoCAD-style window/crossing selection box
            setShiftBoxSelect({ startX: clickX, startY: clickY, endX: clickX, endY: clickY });
            return;
        }

        // Handle line deletion mode
        if (isDeletingLines) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            const clickedLine = findLineNearClick(clickX, clickY, 15);
            if (clickedLine?.id) {
                // Delete immediately on click
                onDeleteLine(clickedLine.id);
            }
            return;
        }
        
        // Handle line trimming mode - delete line or trim at intersections
        if (isTrimmingLines) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Convert screen to world coordinates
            const worldCoords = screenToWorld(clickX, clickY);
            const worldX = worldCoords.easting;
            const worldY = worldCoords.northing;
            
            // Find the line clicked
            const clickedLine = findLineNearClick(clickX, clickY, 15);
            if (!clickedLine) return;
            
            const action = computeTrimAction(clickedLine, worldX, worldY);
            if (action) {
                onDeleteLine(action.lineId);
                action.newLines.forEach(nl => onAddLine(nl));
                setTrimHoverPreview(null);
                requestAnimationFrame(() => {
                    drawRef.current?.();
                });
            }
            return;
        }
        
        // Handle line extending mode - click line to select, click target to extend
        if (isExtendingLines) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Convert screen to world coordinates
            const worldCoords = screenToWorld(clickX, clickY);
            const worldX = worldCoords.easting;
            const worldY = worldCoords.northing;
            
            if (!extendFromLine) {
                // First click: select the line to extend
                const clickedLine = findLineNearClick(clickX, clickY, 15);
                if (clickedLine) {
                    const lineId = clickedLine.id || `${clickedLine.from}-${clickedLine.to}`;
                    setExtendFromLine(lineId);
                    console.log('Extend mode: Selected line', lineId);
                }
            } else {
                // Second click: extend to another line or point
                const targetLine = findLineNearClick(clickX, clickY, 15);
                const sourceLine = lines.find(l => (l.id || `${l.from}-${l.to}`) === extendFromLine);
                
                if (!sourceLine) {
                    setExtendFromLine(null);
                    return;
                }
                
                const p1 = pointMap.get(sourceLine.from);
                const p2 = pointMap.get(sourceLine.to);
                const p1Coords = p1 ? { x: p1.easting, y: p1.northing } : (sourceLine.fromPt ? { x: sourceLine.fromPt.x, y: sourceLine.fromPt.y } : null);
                const p2Coords = p2 ? { x: p2.easting, y: p2.northing } : (sourceLine.toPt ? { x: sourceLine.toPt.x, y: sourceLine.toPt.y } : null);
                
                if (!p1Coords || !p2Coords) {
                    setExtendFromLine(null);
                    return;
                }
                
                // Determine which end of the line is closer to the click
                const dist1 = Math.sqrt((worldX - p1Coords.x) ** 2 + (worldY - p1Coords.y) ** 2);
                const dist2 = Math.sqrt((worldX - p2Coords.x) ** 2 + (worldY - p2Coords.y) ** 2);
                const extendFromEnd = dist1 < dist2 ? 'start' : 'end';
                
                let newEndPoint: { x: number; y: number; z: number };
                
                if (targetLine) {
                    // Extend to intersection with target line
                    const tp1 = pointMap.get(targetLine.from);
                    const tp2 = pointMap.get(targetLine.to);
                    const tp1Coords = tp1 ? { x: tp1.easting, y: tp1.northing } : (targetLine.fromPt ? { x: targetLine.fromPt.x, y: targetLine.fromPt.y } : null);
                    const tp2Coords = tp2 ? { x: tp2.easting, y: tp2.northing } : (targetLine.toPt ? { x: targetLine.toPt.x, y: targetLine.toPt.y } : null);
                    
                    if (!tp1Coords || !tp2Coords) {
                        setExtendFromLine(null);
                        return;
                    }
                    
                    // Calculate line intersection
                    const denom = (p1Coords.x - p2Coords.x) * (tp1Coords.y - tp2Coords.y) - (p1Coords.y - p2Coords.y) * (tp1Coords.x - tp2Coords.x);
                    if (Math.abs(denom) < 1e-10) {
                        console.log('Extend mode: Lines are parallel, cannot extend');
                        setExtendFromLine(null);
                        return;
                    }
                    
                    const t = ((p1Coords.x - tp1Coords.x) * (tp1Coords.y - tp2Coords.y) - (p1Coords.y - tp1Coords.y) * (tp1Coords.x - tp2Coords.x)) / denom;
                    const intX = p1Coords.x + t * (p2Coords.x - p1Coords.x);
                    const intY = p1Coords.y + t * (p2Coords.y - p1Coords.y);
                    
                    newEndPoint = { x: intX, y: intY, z: 0 };
                } else {
                    // Extend to clicked point
                    newEndPoint = { x: worldX, y: worldY, z: 0 };
                }
                
                // Delete the original line
                onDeleteLine(extendFromLine);
                
                // Create extended line
                const newLine: SurveyLine = {
                    from: extendFromEnd === 'start' ? `EXT_${Date.now()}` : sourceLine.from,
                    to: extendFromEnd === 'end' ? `EXT_${Date.now()}` : sourceLine.to,
                    type: sourceLine.type,
                    fromPt: extendFromEnd === 'start' ? newEndPoint : (sourceLine.fromPt || { x: p1Coords.x, y: p1Coords.y, z: 0 }),
                    toPt: extendFromEnd === 'end' ? newEndPoint : (sourceLine.toPt || { x: p2Coords.x, y: p2Coords.y, z: 0 })
                };
                
                onAddLine(newLine);
                console.log('Extend mode: Extended line to new point');
                
                // Reset for next extend operation
                setExtendFromLine(null);
            }
            
            return;
        }
        
        if (e.ctrlKey || e.metaKey) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Prioritize owner name over deed metadata if both are visible
            if (isOverOwnerNameArea(clickX, clickY)) {
                document.body.classList.add('label-dragging');
                setIsLabelDragging(true);

                const offsetX = props.ownerNameOffset?.x || 0;
                const offsetY = props.ownerNameOffset?.y || 10;
                
                ownerNameDragTarget.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startOffsetX: offsetX,
                    startOffsetY: offsetY,
                };
                return;
            }

            // Check deed metadata next (if visible)
            if (isOverDeedMetadataArea(clickX, clickY)) {
                document.body.classList.add('label-dragging');
                setIsLabelDragging(true);

                const offsetX = props.deedMetadataOffset?.x || 0;
                const offsetY = props.deedMetadataOffset?.y || 0;
                
                deedMetadataDragTarget.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startOffsetX: offsetX,
                    startOffsetY: offsetY,
                };
                return;
            }

            // Check line labels
            for (const line of [...lines].reverse()) {
                if (line.bearing && line.distance && !line.isCurve && isOverLineLabelArea(clickX, clickY, line)) {
                    document.body.classList.add('label-dragging');
                    setIsLabelDragging(true);

                    lineLabelDragTarget.current = {
                        lineId: line.id || `${line.from}-${line.to}`,
                        startX: e.clientX,
                        startY: e.clientY,
                        startOffsetX: line.labelOffset?.x || 0,
                        startOffsetY: line.labelOffset?.y || 0,
                    };
                    return;
                }
            }

            // Check curve labels (R / L / Δ stack) — same drag mechanism,
            // shares the labelOffset field.
            for (const line of [...lines].reverse()) {
                if (line.isCurve && isOverCurveLabelArea(clickX, clickY, line)) {
                    document.body.classList.add('label-dragging');
                    setIsLabelDragging(true);
                    lineLabelDragTarget.current = {
                        lineId: line.id || `${line.from}-${line.to}`,
                        startX: e.clientX,
                        startY: e.clientY,
                        startOffsetX: line.labelOffset?.x || 0,
                        startOffsetY: line.labelOffset?.y || 0,
                    };
                    return;
                }
            }

            // Check point labels
            for (const p of [...points].reverse()) {
                if (isOverLabelArea(clickX, clickY, p)) {
                    document.body.classList.add('label-dragging');
                    setIsLabelDragging(true);

                    // If no label offset exists, use default in world coordinates
                    const defaultWorldOffset = (5 * attributeScale) / transform.scale;
                    labelDragTarget.current = {
                        pointNumber: p.pointNumber,
                        startX: e.clientX,
                        startY: e.clientY,
                        startOffsetX: p.labelOffset?.x || defaultWorldOffset,
                        startOffsetY: p.labelOffset?.y || defaultWorldOffset,
                    };
                    return;
                }
            }

            // Check annotation notes (Ctrl+drag to reposition leader/note).
            if (onUpdatePointAnnotationOffset) {
                for (const p of [...points].reverse()) {
                    if (isOverAnnotationArea(clickX, clickY, p)) {
                        const rule = getAnnotationForPoint(p);
                        if (!rule) continue;
                        const eff = p.annotationOffset || { dx: rule.leaderOffset.dx, dy: rule.leaderOffset.dy };
                        document.body.classList.add('label-dragging');
                        setIsLabelDragging(true);
                        annotationDragTarget.current = {
                            pointNumber: p.pointNumber,
                            startX: e.clientX,
                            startY: e.clientY,
                            startDx: eff.dx,
                            startDy: eff.dy,
                        };
                        return;
                    }
                }
            }
        }

        if (e.altKey) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check line labels for rotation
            for (const line of [...lines].reverse()) {
                if (line.bearing && line.distance && !line.isCurve && isOverLineLabelArea(clickX, clickY, line)) {
                    const lineId = line.id || `${line.from}-${line.to}`;
                    if (props.onToggleLineLabelRotation) {
                        props.onToggleLineLabelRotation(lineId);
                    }
                    return;
                }
            }
            // Check boundary call labels for rotation
            if (props.boundaryFiles && props.onToggleBoundaryCallLabelRotation) {
                for (const bf of [...(props.boundaryFiles)].reverse()) {
                    for (const call of [...bf.calls].reverse()) {
                        if (isOverBoundaryCallLabelArea(clickX, clickY, call)) {
                            props.onToggleBoundaryCallLabelRotation(bf.id, call.id);
                            return;
                        }
                    }
                }
            }
        }

        // Shift+Click to swap bearing direction
        if (e.shiftKey) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check annotation notes first — Shift+click mirrors dx left↔right.
            if (onUpdatePointAnnotationOffset) {
                for (const p of [...points].reverse()) {
                    if (isOverAnnotationArea(clickX, clickY, p)) {
                        const rule = getAnnotationForPoint(p);
                        if (!rule) continue;
                        const eff = p.annotationOffset || { dx: rule.leaderOffset.dx, dy: rule.leaderOffset.dy };
                        onUpdatePointAnnotationOffset(p.pointNumber, { dx: -eff.dx, dy: eff.dy });
                        return;
                    }
                }
            }

            // Check line labels for direction swap
            for (const line of [...lines].reverse()) {
                if (line.bearing && line.distance && !line.isCurve && isOverLineLabelArea(clickX, clickY, line)) {
                    const lineId = line.id || `${line.from}-${line.to}`;
                    if (props.onSwapLineBearingDirection) {
                        props.onSwapLineBearingDirection(lineId);
                    }
                    return;
                }
            }
            // Check boundary call labels for bearing swap
            if (props.boundaryFiles && props.onSwapBoundaryCallBearingDirection) {
                for (const bf of [...(props.boundaryFiles)].reverse()) {
                    for (const call of [...bf.calls].reverse()) {
                        if (isOverBoundaryCallLabelArea(clickX, clickY, call)) {
                            props.onSwapBoundaryCallBearingDirection(bf.id, call.id);
                            return;
                        }
                    }
                }
            }

            // Shift+drag selection window (CAD style):
            // left->right = window (fully inside), right->left = crossing.
            if (drawingMode === 'none' && !isDeletingLines && !isTrimmingLines && !isExtendingLines && !boundaryAlignSliding) {
                setShiftBoxSelect({ startX: clickX, startY: clickY, endX: clickX, endY: clickY });
                return;
            }
        }

        if (drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const worldCoords = screenToWorld(clickX, clickY);
            const worldEasting = worldCoords.easting;
            const worldNorthing = worldCoords.northing;
            const clickThreshold = 15; // pixels
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = polylinePoints.length > 0
                ? { easting: polylinePoints[polylinePoints.length - 1].easting, northing: polylinePoints[polylinePoints.length - 1].northing }
                : null;
            const snapped = resolveOsnapAtScreen(clickX, clickY, activeModes, clickThreshold, anchor);
            if (inlineOsnapOverride) setInlineOsnapOverride(null);
            const nearestExisting = findNearestSurveyPoint(clickX, clickY, clickThreshold);

            let nextPoint: SurveyPoint | null = null;
            if (typedSegmentLength.trim().length > 0 && anchor) {
                const num = Number(typedSegmentLength);
                if (Number.isFinite(num) && num > 0) {
                    const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                    const worldLength = convertLinearUnits(num, fromUnit, 'foot');
                    let target = snapped
                        ? { easting: snapped.easting, northing: snapped.northing }
                        : { easting: worldEasting, northing: worldNorthing };
                    if (isOrthoEnabled) {
                        target = applyOrthoConstraint(anchor, target);
                    }
                    const dx = target.easting - anchor.easting;
                    const dy = target.northing - anchor.northing;
                    const mag = Math.hypot(dx, dy);
                    const dirX = mag > 1e-9 ? dx / mag : 1;
                    const dirY = mag > 1e-9 ? dy / mag : 0;
                    nextPoint = makeTempWorldPoint(anchor.easting + dirX * worldLength, anchor.northing + dirY * worldLength);
                }
            }
            if (!nextPoint) {
                if (snapped?.sourcePoint) {
                    nextPoint = snapped.sourcePoint;
                } else if (snapped) {
                    nextPoint = makeTempSnapPoint(snapped);
                } else if (nearestExisting) {
                    nextPoint = nearestExisting;
                } else {
                    let freePoint = { easting: worldEasting, northing: worldNorthing };
                    if (isOrthoEnabled && anchor) {
                        freePoint = applyOrthoConstraint(anchor, freePoint);
                    }
                    nextPoint = makeTempWorldPoint(freePoint.easting, freePoint.northing);
                }
            }

            if (nextPoint) {
                if (typedSegmentLength.length > 0) setTypedSegmentLength('');
                setPolylinePoints(prev => [...prev, nextPoint]);
            }
            return;
        }

        if (drawingMode === 'circle') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            if (circleSubMode === 'ttr') {
                if (ttrStep === 1) {
                    const ent = ttrHoverEntity || findTtrEntityNearClick(clickX, clickY, 25);
                    if (ent) {
                        setTtrEntity1(ent);
                        setTtrStep(2);
                        setTtrHoverEntity(null);
                    }
                    return;
                } else if (ttrStep === 2) {
                    const ent = ttrHoverEntity || findTtrEntityNearClick(clickX, clickY, 25);
                    if (ent) {
                        setTtrEntity2(ent);
                        setTtrStep(3);
                        setTtrHoverEntity(null);
                        setTypedCircleValue('');
                    }
                    return;
                } else if (ttrStep === 3 && ttrEntity1 && ttrEntity2) {
                    let radiusVal = 25;
                    if (typedCircleValue.trim().length > 0) {
                        const num = Number(typedCircleValue);
                        if (Number.isFinite(num) && num > 0) {
                            const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                            radiusVal = convertLinearUnits(num, fromUnit, 'foot');
                        }
                    } else {
                        const worldCoords = screenToWorld(clickX, clickY);
                        radiusVal = Math.hypot(worldCoords.easting - ttrEntity2.pickPoint.x, worldCoords.northing - ttrEntity2.pickPoint.y);
                    }
                    if (circleSizeParam === 'diameter') radiusVal = radiusVal / 2;

                    const sol = solveTtrCircle(ttrEntity1, ttrEntity2, radiusVal);
                    if (sol) {
                        addCircleGeometry(sol.center, sol.radius);
                        setCircleSubMode('center-radius');
                        setTtrStep(1);
                        setTtrEntity1(null);
                        setTtrEntity2(null);
                        setTypedCircleValue('');
                        setDrawingMode('none');
                    }
                    return;
                }
            }

            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : (runningOsnaps.size > 0 ? runningOsnaps : new Set<OsnapMode>(['endpoint', 'midpoint', 'intersection', 'nearest']));
            const anchor = circleCenter;
            const snapped = currentSnap || resolveOsnapAtScreen(clickX, clickY, activeModes, 20, anchor);
            if (inlineOsnapOverride) setInlineOsnapOverride(null);
            const nearestExisting = findNearestSurveyPoint(clickX, clickY, 20);

            let pickedPt = { easting: 0, northing: 0 };
            if (snapped) {
                pickedPt = { easting: snapped.easting, northing: snapped.northing };
            } else if (nearestExisting) {
                pickedPt = { easting: nearestExisting.easting, northing: nearestExisting.northing };
            } else {
                const worldCoords = screenToWorld(clickX, clickY);
                pickedPt = { easting: worldCoords.easting, northing: worldCoords.northing };
            }

            if (!circleCenter) {
                setCircleCenter(pickedPt);
                setTypedCircleValue('');
            } else {
                let radiusVal = 0;
                if (typedCircleValue.trim().length > 0) {
                    const num = Number(typedCircleValue);
                    if (Number.isFinite(num) && num > 0) {
                        const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                        const worldVal = convertLinearUnits(num, fromUnit, 'foot');
                        radiusVal = circleSizeParam === 'diameter' ? worldVal / 2 : worldVal;
                    }
                } else {
                    const dist = Math.hypot(pickedPt.easting - circleCenter.easting, pickedPt.northing - circleCenter.northing);
                    radiusVal = circleSizeParam === 'diameter' ? dist / 2 : dist;
                }

                if (radiusVal > 1e-6) {
                    addCircleGeometry(circleCenter, radiusVal);
                }
                setCircleCenter(null);
                setTypedCircleValue('');
                setDrawingMode('none');
            }
            return;
        }

        if (drawingMode === 'aligned-dim') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const worldCoords = screenToWorld(clickX, clickY);
            const worldEasting = worldCoords.easting;
            const worldNorthing = worldCoords.northing;
            const snapThreshold = 20;
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = dimPhase > 0 && dimP1 ? { easting: dimP1.easting, northing: dimP1.northing } : null;
            const snapped = resolveOsnapAtScreen(clickX, clickY, activeModes, snapThreshold, anchor);
            if (inlineOsnapOverride) setInlineOsnapOverride(null);
            const worldPt = snapped ? { easting: snapped.easting, northing: snapped.northing } : { easting: worldEasting, northing: worldNorthing };

            if (dimPhase === 0) {
                setDimP1(worldPt);
                setDimPhase(1);
            } else if (dimPhase === 1) {
                setDimP2(worldPt);
                setDimPhase(2);
            } else if (dimPhase === 2 && dimP1 && dimP2) {
                const dxLine = dimP2.easting - dimP1.easting;
                const dyLine = dimP2.northing - dimP1.northing;
                const lineLen = Math.hypot(dxLine, dyLine);
                if (lineLen > 1e-9) {
                    const pxPerp = -dyLine / lineLen;
                    const pyPerp = dxLine / lineLen;
                    const offsetDist = (worldPt.easting - dimP1.easting) * pxPerp + (worldPt.northing - dimP1.northing) * pyPerp;
                    const newDim: AnnotationDimension = {
                        id: `dim-${Date.now()}`,
                        type: 'aligned',
                        p1: dimP1,
                        p2: dimP2,
                        offsetDist,
                    };
                    onAddDimension(newDim);
                }
                // Chain: reset to phase 0 for the next dimension
                setDimPhase(0);
                setDimP1(null);
                setDimP2(null);
            }
            return;
        }

        if (drawingMode === 'boundary-line') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Convert canvas pixel → world coords
            const worldCoords = screenToWorld(clickX, clickY);
            const worldEasting = worldCoords.easting;
            const worldNorthing = worldCoords.northing;
            const clickThreshold = 20;
            const activeModes = inlineOsnapOverride ? new Set<OsnapMode>([inlineOsnapOverride]) : runningOsnaps;
            const anchor = boundaryLineFrom ? { easting: boundaryLineFrom.easting, northing: boundaryLineFrom.northing } : null;
            const snapped = resolveOsnapAtScreen(clickX, clickY, activeModes, clickThreshold, anchor);
            if (inlineOsnapOverride) setInlineOsnapOverride(null);
            const nearestPoint = snapped?.sourcePoint ?? findNearestSurveyPoint(clickX, clickY, clickThreshold);

            if (!boundaryLineFrom) {
                // First click: must snap to an existing point
                if (nearestPoint) {
                    setBoundaryLineFrom(nearestPoint);
                    setBoundaryClickedTo(null);
                    setBoundaryBearing('');
                    setBoundaryDistance('');
                    setBoundaryInputError('');
                } else {
                    notifyBoundaryError('No endpoint found — start must snap to an existing point.');
                }
            } else {
                // Second click: use selected osnap target or raw world coords
                const toEasting = snapped ? snapped.easting : worldEasting;
                const toNorthing = snapped ? snapped.northing : worldNorthing;
                const toCoord = { easting: toEasting, northing: toNorthing };
                const inv = inverse(boundaryLineFrom, toCoord);
                if (inv.distance < 0.001) {
                    notifyBoundaryError('Second click is too close to the start point.');
                    return;
                }
                const bearingStr = formatBearing(inv.bearing);
                const distStr = inv.distance.toFixed(2);
                setBoundaryClickedTo(toCoord);
                setBoundaryBearing(bearingStr);
                setBoundaryDistance(distStr);
                setBoundaryInputError('');
                setTimeout(() => boundaryBearingRef.current?.focus(), 50);
            }
            return;
        }

        document.body.classList.add('panning');
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }, [drawingMode, isDeletingLines, isTrimmingLines, isExtendingLines, extendFromLine, boundaryLineFrom, points, lines, pointMap, transform, attributeScale, isOverLabelArea, isOverLineLabelArea, isOverDeedMetadataArea, isOverOwnerNameArea, isOverAnnotationArea, getAnnotationForPoint, onUpdatePointAnnotationOffset, findLineNearClick, onDeleteLine, onAddLine, props, dimPhase, dimP1, dimP2, onAddDimension, isSelectionMode, selectedLineIds, boundaryAlignMovable, boundaryAlignTarget, boundaryAlignSliding, hitTestBoundaryCall, computeBoundaryAlignSnap, cornerAlignBfId, cornerAlignPendingCorner, cornerAlignPicker, hitTestBoundaryCorner, commitCornerAlignPoint, symbolExclusionMode, inlineOsnapMenuPos, inlineOsnapOverride, runningOsnaps, resolveOsnapAtScreen, findNearestSurveyPoint, activeOsnapPoint, makeTempWorldPoint, makeTempSnapPoint, isOrthoEnabled, applyOrthoConstraint, typedSegmentLength, screenToWorld, worldToScreen, isPickingOtOrigin, isPickingOtLineAlign, onSetOrientationTuple, boundaryFiles, getBoundaryCallWorldEndpoints, circleCenter, circleSizeParam, typedCircleValue, circleSubMode, ttrStep, ttrEntity1, ttrEntity2, ttrHoverEntity, findTtrEntityNearClick, solveTtrCircle, computeTrimAction, addCircleGeometry, settings.linearUnits]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (shiftBoxSelect) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            setShiftBoxSelect(prev => prev ? { ...prev, endX: mx, endY: my } : prev);
            return;
        }

        // Symbol-exclusion hover tooltip — show why the nearest point's
        // symbol is associated (or note it's already excluded).
        if (symbolExclusionMode) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const HIT = 18;
                let nearest: SurveyPoint | null = null;
                let bestDist = HIT * HIT;
                for (const p of points) {
                    if (p.hidden) continue;
                    if (!p.description) continue;
                    const sx = p.easting * transform.scale + transform.offsetX;
                    const sy = -p.northing * transform.scale + transform.offsetY;
                    const d = (mx - sx) ** 2 + (my - sy) ** 2;
                    if (d < bestDist) { bestDist = d; nearest = p; }
                }
                if (nearest) {
                    const key = (nearest.description || '').trim().toUpperCase();
                    const excluded = excludedSymbolDescriptions.has(key);
                    const info = explainSymbolAssociation(nearest.description || '');
                    setExclusionHover(prev => {
                        if (prev && prev.description === nearest!.description && prev.excluded === excluded
                            && prev.clientX === e.clientX && prev.clientY === e.clientY) return prev;
                        return {
                            clientX: e.clientX,
                            clientY: e.clientY,
                            description: nearest!.description || '',
                            symbolName: info.symbolName,
                            reason: info.reason,
                            excluded,
                        };
                    });
                } else if (exclusionHover) {
                    setExclusionHover(null);
                }
            }
        }

        // Corner-align hover — highlight the deed corner under the cursor while
        // the tool is waiting for a corner pick.
        if (drawingMode === 'boundary-corner-align' && cornerAlignBfId && !cornerAlignPendingCorner && !cornerAlignPicker) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const worldX = (mx - transform.offsetX) / transform.scale;
                const worldY = -(my - transform.offsetY) / transform.scale;
                const corner = hitTestBoundaryCorner(cornerAlignBfId, worldX, worldY, 14 / transform.scale);
                setCornerAlignHover(prev => {
                    if (!corner) return prev ? null : prev;
                    if (prev && prev.pn === corner.pn && prev.x === corner.x && prev.y === corner.y) return prev;
                    return { pn: corner.pn, x: corner.x, y: corner.y };
                });
            }
        } else if (cornerAlignHover) {
            setCornerAlignHover(null);
        }

        // Boundary-align slide — drive movable bf translation along target line.
        if (boundaryAlignSliding && boundaryAlignSlideRef.current && props.onUpdateBoundaryTransform && boundaryAlignTarget) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const worldX = (mx - transform.offsetX) / transform.scale;
                const worldY = -(my - transform.offsetY) / transform.scale;
                const s = boundaryAlignSlideRef.current;
                const proj = worldX * s.dirE + worldY * s.dirN;
                let delta = proj - s.mouseStartProj;
                if (delta < s.sMin) delta = s.sMin;
                if (delta > s.sMax) delta = s.sMax;
                // Corner-coincidence snap — if any movable corner (after slide)
                // would land within snapPxWorld of any target corner, snap to it.
                const snapPxWorld = 10 / transform.scale;
                const perpDirE = -s.dirN;
                const perpDirN =  s.dirE;
                const movCornersBase = getBoundaryCornersWorld(s.movableBfId, {
                    txE: s.baseTxE, txN: s.baseTxN, rotDeg: s.rotDegFixed,
                });
                const tgtCorners = getBoundaryCornersWorld(boundaryAlignTarget.bfId);
                let bestSnapDelta: number | null = null;
                let bestSnapDist = snapPxWorld;
                for (const m of movCornersBase) {
                    for (const t of tgtCorners) {
                        const diffX = t.x - m.x;
                        const diffY = t.y - m.y;
                        const along = diffX * s.dirE + diffY * s.dirN;
                        const perp  = diffX * perpDirE + diffY * perpDirN;
                        if (Math.abs(perp) > snapPxWorld) continue;       // not on the slide line
                        if (Math.abs(along - delta) > snapPxWorld * 4) continue; // too far from cursor
                        if (Math.abs(perp) < bestSnapDist) {
                            bestSnapDist = Math.abs(perp);
                            bestSnapDelta = along;
                        }
                    }
                }
                if (bestSnapDelta !== null) delta = bestSnapDelta;
                props.onUpdateBoundaryTransform(s.movableBfId, {
                    translationE: s.baseTxE + s.dirE * delta,
                    translationN: s.baseTxN + s.dirN * delta,
                    rotationDeg: s.rotDegFixed,
                });
            }
            return;
        }

        if (isLabelDragging) {
            if (ownerNameDragTarget.current) {
                const dx = e.clientX - ownerNameDragTarget.current.startX;
                const dy = e.clientY - ownerNameDragTarget.current.startY;
                
                const worldDx = dx / transform.scale;
                const worldDy = -dy / transform.scale; // Invert Y for world coords
                
                const newOffsetX = ownerNameDragTarget.current.startOffsetX + worldDx;
                const newOffsetY = ownerNameDragTarget.current.startOffsetY + worldDy;

                if (props.onUpdateOwnerNameOffset) {
                    props.onUpdateOwnerNameOffset({ x: newOffsetX, y: newOffsetY });
                }
                return;
            }

            if (deedMetadataDragTarget.current) {
                const dx = e.clientX - deedMetadataDragTarget.current.startX;
                const dy = e.clientY - deedMetadataDragTarget.current.startY;
                
                const worldDx = dx / transform.scale;
                const worldDy = -dy / transform.scale; // Invert Y for world coords
                
                const newOffsetX = deedMetadataDragTarget.current.startOffsetX + worldDx;
                const newOffsetY = deedMetadataDragTarget.current.startOffsetY + worldDy;

                if (props.onUpdateDeedMetadataOffset) {
                    props.onUpdateDeedMetadataOffset({ x: newOffsetX, y: newOffsetY });
                }
                return;
            }
            
            if (lineLabelDragTarget.current) {
                const dx = e.clientX - lineLabelDragTarget.current.startX;
                const dy = e.clientY - lineLabelDragTarget.current.startY;
                
                const worldDx = dx / transform.scale;
                const worldDy = -dy / transform.scale; // Invert Y for world coords
                
                const newOffsetX = lineLabelDragTarget.current.startOffsetX + worldDx;
                const newOffsetY = lineLabelDragTarget.current.startOffsetY + worldDy;

                if (props.onUpdateLineLabelOffset) {
                    props.onUpdateLineLabelOffset(lineLabelDragTarget.current.lineId, { x: newOffsetX, y: newOffsetY });
                }
                return;
            }
            
            if (labelDragTarget.current) {
                const dx = e.clientX - labelDragTarget.current.startX;
                const dy = e.clientY - labelDragTarget.current.startY;
                
                // Always store offsets in world coordinates
                // Convert screen pixel delta to world units
                const worldDx = dx / transform.scale;
                const worldDy = dy / transform.scale;
                
                const newOffsetX = labelDragTarget.current.startOffsetX + worldDx;
                const newOffsetY = labelDragTarget.current.startOffsetY + worldDy;

                onUpdatePointLabelOffset(labelDragTarget.current.pointNumber, { x: newOffsetX, y: newOffsetY });
                return;
            }

            if (annotationDragTarget.current && onUpdatePointAnnotationOffset) {
                const dx = e.clientX - annotationDragTarget.current.startX;
                const dy = e.clientY - annotationDragTarget.current.startY;
                // Annotation offset is { dx, dy } in world units. Note: dy is
                // "up positive" (subtracted in render), so invert screen dy.
                const worldDx = dx / transform.scale;
                const worldDy = -dy / transform.scale;
                const newDx = annotationDragTarget.current.startDx + worldDx;
                const newDy = annotationDragTarget.current.startDy + worldDy;
                onUpdatePointAnnotationOffset(annotationDragTarget.current.pointNumber, { dx: newDx, dy: newDy });
                return;
            }
        }

        if (isPanning) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setTransform(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }

        // Shrinkwrap hover detection — find nearest source point within 14px
        if (props.shrinkwrapSourcePns?.length) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const HIT = 14;
                let found: string | null = null;
                for (const p of points) {
                    if (!props.shrinkwrapSourcePns.includes(p.pointNumber)) continue;
                    const sx = p.easting * transform.scale + transform.offsetX;
                    const sy = -p.northing * transform.scale + transform.offsetY;
                    if ((mx - sx) ** 2 + (my - sy) ** 2 < HIT * HIT) { found = p.pointNumber; break; }
                }
                if (found !== hoveredShrinkwrapPnRef.current) {
                    hoveredShrinkwrapPnRef.current = found;
                    setHoveredShrinkwrapPn(found);
                }
            }
        } else if (hoveredShrinkwrapPnRef.current !== null) {
            hoveredShrinkwrapPnRef.current = null;
            setHoveredShrinkwrapPn(null);
        }

        // Shift+hover quick-info tooltip — show point details near cursor after a short dwell.
        const canvas = canvasRef.current;
        if (canvas && e.shiftKey && !isPanning && !isLabelDragging && !shiftBoxSelect) {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const anchor = shiftHoverAnchorRef.current;
            // Cancel existing dwell if cursor moved >18px from anchor
            if (anchor && Math.hypot(mx - anchor.mx, my - anchor.my) > 18) {
                if (shiftHoverTimerRef.current !== null) {
                    clearTimeout(shiftHoverTimerRef.current);
                    shiftHoverTimerRef.current = null;
                }
                setShiftHoverPoints([]);
                setShiftHoverPos(null);
                shiftHoverAnchorRef.current = null;
            }
            // Start dwell timer if none in progress
            if (shiftHoverTimerRef.current === null) {
                shiftHoverAnchorRef.current = { mx, my };
                const capturedClientX = e.clientX;
                const capturedClientY = e.clientY;
                shiftHoverTimerRef.current = setTimeout(() => {
                    shiftHoverTimerRef.current = null;
                    const RADIUS_PX = 30;
                    const nearby: SurveyPoint[] = [];
                    for (const p of points) {
                        const sx = p.easting * transform.scale + transform.offsetX;
                        const sy = -p.northing * transform.scale + transform.offsetY;
                        if ((mx - sx) ** 2 + (my - sy) ** 2 < RADIUS_PX * RADIUS_PX) {
                            nearby.push(p);
                        }
                    }
                    nearby.sort((a, b) => {
                        const da = (mx - (a.easting * transform.scale + transform.offsetX)) ** 2
                                 + (my - (-a.northing * transform.scale + transform.offsetY)) ** 2;
                        const db = (mx - (b.easting * transform.scale + transform.offsetX)) ** 2
                                 + (my - (-b.northing * transform.scale + transform.offsetY)) ** 2;
                        return da - db;
                    });
                    if (nearby.length > 0) {
                        setShiftHoverPoints(nearby.slice(0, 8));
                        setShiftHoverPos({ clientX: capturedClientX, clientY: capturedClientY });
                    }
                }, 480);
            }
        } else if (!e.shiftKey) {
            // Shift released — cancel dwell and hide tooltip
            if (shiftHoverTimerRef.current !== null) {
                clearTimeout(shiftHoverTimerRef.current);
                shiftHoverTimerRef.current = null;
            }
            if (shiftHoverPoints.length > 0) {
                setShiftHoverPoints([]);
                setShiftHoverPos(null);
                shiftHoverAnchorRef.current = null;
            }
        }
    }, [isPanning, isLabelDragging, onUpdatePointLabelOffset, onUpdatePointAnnotationOffset, props, transform, points, hoveredShrinkwrapPn, shiftHoverPoints, boundaryAlignSliding, boundaryAlignTarget, getBoundaryCornersWorld, symbolExclusionMode, excludedSymbolDescriptions, explainSymbolAssociation, exclusionHover, shiftBoxSelect, drawingMode, cornerAlignBfId, cornerAlignPendingCorner, cornerAlignPicker, cornerAlignHover, hitTestBoundaryCorner]);

    const handleMouseUp = useCallback(() => {
        if (shiftBoxSelect) {
            const minX = Math.min(shiftBoxSelect.startX, shiftBoxSelect.endX);
            const maxX = Math.max(shiftBoxSelect.startX, shiftBoxSelect.endX);
            const minY = Math.min(shiftBoxSelect.startY, shiftBoxSelect.endY);
            const maxY = Math.max(shiftBoxSelect.startY, shiftBoxSelect.endY);
            const dx = Math.abs(shiftBoxSelect.endX - shiftBoxSelect.startX);
            const dy = Math.abs(shiftBoxSelect.endY - shiftBoxSelect.startY);
            const isDrag = dx > 3 || dy > 3;
            const isWindow = shiftBoxSelect.endX >= shiftBoxSelect.startX;

            if (isDrag) {
                const inRect = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
                const segIntersectsRect = (x1: number, y1: number, x2: number, y2: number) => {
                    if (inRect(x1, y1) || inRect(x2, y2)) return true;
                    const intersects = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx2: number, dy2: number) => {
                        const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
                        const o1 = o(ax, ay, bx, by, cx, cy);
                        const o2 = o(ax, ay, bx, by, dx2, dy2);
                        const o3 = o(cx, cy, dx2, dy2, ax, ay);
                        const o4 = o(cx, cy, dx2, dy2, bx, by);
                        return (o1 * o2 < 0) && (o3 * o4 < 0);
                    };
                    return (
                        intersects(x1, y1, x2, y2, minX, minY, maxX, minY) ||
                        intersects(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
                        intersects(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
                        intersects(x1, y1, x2, y2, minX, maxY, minX, minY)
                    );
                };

                const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
                    const vx = x2 - x1;
                    const vy = y2 - y1;
                    const lSq = vx * vx + vy * vy;
                    if (lSq < 1e-9) return Math.hypot(px - x1, py - y1);
                    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lSq));
                    return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
                };

                const circleIntersectsRect = (cx: number, cy: number, r: number) => {
                    if (inRect(cx, cy)) return true;
                    if (Math.hypot(minX - cx, minY - cy) <= r ||
                        Math.hypot(maxX - cx, minY - cy) <= r ||
                        Math.hypot(maxX - cx, maxY - cy) <= r ||
                        Math.hypot(minX - cx, maxY - cy) <= r) return true;
                    if (distToSegment(cx, cy, minX, minY, maxX, minY) <= r) return true;
                    if (distToSegment(cx, cy, maxX, minY, maxX, maxY) <= r) return true;
                    if (distToSegment(cx, cy, maxX, maxY, minX, maxY) <= r) return true;
                    if (distToSegment(cx, cy, minX, maxY, minX, minY) <= r) return true;
                    return false;
                };

                const selected = new Set<string>();
                for (const line of lines) {
                    if (line.hidden) continue;
                    const p1 = pointMap.get(line.from);
                    const p2 = pointMap.get(line.to);
                    const x1w = p1 ? p1.easting : line.fromPt?.x;
                    const y1w = p1 ? p1.northing : line.fromPt?.y;
                    const x2w = p2 ? p2.easting : line.toPt?.x;
                    const y2w = p2 ? p2.northing : line.toPt?.y;
                    if (x1w === undefined || y1w === undefined) continue;

                    const lineId = line.id || `${line.from}-${line.to}`;
                    const isCircleEntity = line.isCircle || (line.isCurve && line.curveRadius && (!line.fromPt || (x1w === x2w && y1w === y2w)) && !line.tangentBearing && !line.chordBearing);

                    if (isCircleEntity && line.curveRadius) {
                        const cXw = line.circleCenter ? line.circleCenter.x : x1w;
                        const cYw = line.circleCenter ? line.circleCenter.y : y1w;
                        const sc = worldToScreen(cXw, cYw);
                        const sr = line.curveRadius * transform.scale;
                        if (isWindow) {
                            if (sc.x - sr >= minX && sc.x + sr <= maxX && sc.y - sr >= minY && sc.y + sr <= maxY) {
                                selected.add(lineId);
                            }
                        } else {
                            if (circleIntersectsRect(sc.x, sc.y, sr)) {
                                selected.add(lineId);
                            }
                        }
                        continue;
                    }

                    if (x2w === undefined || y2w === undefined) continue;
                    const sp1 = worldToScreen(x1w, y1w);
                    const sp2 = worldToScreen(x2w, y2w);
                    const sx1 = sp1.x;
                    const sy1 = sp1.y;
                    const sx2 = sp2.x;
                    const sy2 = sp2.y;

                    if (line.isCurve && line.curveRadius && line.arcLength) {
                        if (isWindow) {
                            let allIn = inRect(sx1, sy1) && inRect(sx2, sy2);
                            if (allIn) {
                                for (let k = 1; k < 6; k++) {
                                    const frac = k / 6;
                                    const sampleX = sx1 + (sx2 - sx1) * frac;
                                    const sampleY = sy1 + (sy2 - sy1) * frac;
                                    if (!inRect(sampleX, sampleY)) {
                                        allIn = false;
                                        break;
                                    }
                                }
                            }
                            if (allIn) selected.add(lineId);
                        } else {
                            if (inRect(sx1, sy1) || inRect(sx2, sy2) || segIntersectsRect(sx1, sy1, sx2, sy2)) {
                                selected.add(lineId);
                            }
                        }
                        continue;
                    }

                    if (isWindow) {
                        if (inRect(sx1, sy1) && inRect(sx2, sy2)) selected.add(lineId);
                    } else {
                        if (segIntersectsRect(sx1, sy1, sx2, sy2)) selected.add(lineId);
                    }
                }

                setSelectedLineIds(selected);
                setIsSelectionMode(true);
            } else {
                if (selectedLineIds.size > 0 && !isBoxSelectMode) {
                    setSelectedLineIds(new Set());
                }
            }

            setShiftBoxSelect(null);
            return;
        }

        if (activeGrip && activeGripDragStartRef.current && canvasRef.current) {
            const dragDist = Math.hypot(e.clientX - activeGripDragStartRef.current.clientX, e.clientY - activeGripDragStartRef.current.clientY);
            if (dragDist > 4) {
                const rect = canvasRef.current.getBoundingClientRect();
                const worldCoords = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
                commitActiveGrip(activeGrip, worldCoords.easting, worldCoords.northing, activeOsnapPoint);
                activeGripDragStartRef.current = null;
                return;
            }
            activeGripDragStartRef.current = null;
        }

        if (isLabelDragging) {
            document.body.classList.remove('label-dragging');
            setIsLabelDragging(false);
            labelDragTarget.current = null;
            lineLabelDragTarget.current = null;
            deedMetadataDragTarget.current = null;
            ownerNameDragTarget.current = null;
            annotationDragTarget.current = null;
        }
        if (isPanning) {
            document.body.classList.remove('panning');
            setIsPanning(false);
        }
    }, [isLabelDragging, isPanning, shiftBoxSelect, lines, pointMap, transform, activeGrip, isBoxSelectMode, selectedLineIds, commitActiveGrip, screenToWorld, activeOsnapPoint]);
    
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (drawingMode !== 'none') return;
        if (e.touches.length === 1) {
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            pinchDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    }, [drawingMode]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container || drawingMode !== 'none') return;
        
        if (e.touches.length === 1) { // Panning
            const touch = e.touches[0];
            const dx = touch.clientX - lastMousePos.current.x;
            const dy = touch.clientY - lastMousePos.current.y;
            setTransform(prev => ({...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy}));
            lastMousePos.current = { x: touch.clientX, y: touch.clientY };
        } else if (e.touches.length === 2) { // Zooming
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

            if (pinchDistRef.current > 0) {
                const zoomFactor = currentDist / pinchDistRef.current;
                
                const rect = container.getBoundingClientRect();
                const midPointX = (t1.clientX + t2.clientX) / 2 - rect.left;
                const midPointY = (t1.clientY + t2.clientY) / 2 - rect.top;

                setTransform(prev => {
                    const newScale = Math.max(0.00001, Math.min(50000, prev.scale * zoomFactor));
                    const actualZoomFactor = newScale / prev.scale;
                    
                    const newOffsetX = midPointX - (midPointX - prev.offsetX) * actualZoomFactor;
                    const newOffsetY = midPointY - (midPointY - prev.offsetY) * actualZoomFactor;
                    
                    return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
                });
            }
            pinchDistRef.current = currentDist;
        }
    }, [drawingMode]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            pinchDistRef.current = 0; // Stop zooming
        }
        if (e.touches.length === 1) {
            // Transitioning from zoom to pan
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }, []);
    
    // Notify parent of tool state changes
    useEffect(() => {
        if (onToolStateChange) {
            const lineType = drawingMode === 'breaklines' ? 'breakline' : drawingMode === 'inclusion' ? 'inclusion' : drawingMode === 'exclusion' ? 'exclusion' : 'normal';
            onToolStateChange({
                isDrawing: drawingMode !== 'none',
                isTrimming: isTrimmingLines,
                isExtending: isExtendingLines,
                isDeleting: isDeletingLines,
                selectedCount: selectedLineIds.size,
                segmentCount: polylinePoints.length > 0 ? polylinePoints.length - 1 : 0,
                lineType
            });
        }
    }, [drawingMode, isTrimmingLines, isExtendingLines, isDeletingLines, polylinePoints.length, onToolStateChange, selectedLineIds.size]);

    const handleZoomToPointSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const pointToZoom = points.find(p => p.pointNumber === zoomToPointNumber);
        if (pointToZoom) {
            onZoomToPoint(pointToZoom);
            setZoomToPointNumber('');
            setIsZoomToPointOpen(false);
        } else {
            reportError({ title: 'Point not found', message: `Point "${zoomToPointNumber}" not found.` });
        }
    };

    // Find Points: filter the loaded points by a free-text description query.
    // Strips natural-language prefixes like "show me", "find", "where are"
    // and stop-words like "points"/"the" so the user can type the way they'd
    // ask an agent. Falls back to point-number and layer matching too.
    const findPointsMatches = useMemo(() => {
        const raw = findPointsQuery.trim().toLowerCase();
        if (!raw) return [] as SurveyPoint[];
        const cleaned = raw
            .replace(/^(show\s+me|find|where\s+are|list|give\s+me|locate|search\s+for)\s+/i, '')
            .replace(/\b(the|all|every|any|please|points?)\b/g, ' ')
            .trim();
        const tokens = (cleaned || raw).split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return [] as SurveyPoint[];
        return points.filter(p => {
            const hay = [
                p.description ?? '',
                p.pointNumber ?? '',
                p.layer ?? '',
            ].join(' ').toLowerCase();
            return tokens.every(t => hay.includes(t));
        }).slice(0, 200); // cap render cost for huge jobs
    }, [findPointsQuery, points]);
    
    // Leaving the active tool (Escape, toolbar switch, …) resets the arc
    // submode and the chained tangent so the next polyline starts fresh.
    useEffect(() => {
        setPolylineArcMode(false);
        lastSegmentTangentRef.current = null;
    }, [drawingMode]);

    useEffect(() => {
        if (drawingMode === 'polylines' && polylinePoints.length === 2) {
            // For polylines mode, when user has 2 points, create a line between them
            const p1 = polylinePoints[0];
            const p2 = polylinePoints[1];
            const p1Line = buildLineEndpoint(p1);
            const p2Line = buildLineEndpoint(p2);
            // Arc submode: unique arc leaving p1 tangent to the previous
            // segment and passing through p2. Degenerate geometry (p2 on the
            // tangent line) falls back to a straight segment.
            const arc = polylineArcMode && lastSegmentTangentRef.current
                ? computeTangentArc(
                    { easting: p1.easting, northing: p1.northing },
                    lastSegmentTangentRef.current,
                    { easting: p2.easting, northing: p2.northing })
                : null;
            if (arc) {
                onAddLine({
                    from: p1Line.ref,
                    to: p2Line.ref,
                    type: undefined,
                    layer: activeDrawingLayer || undefined,
                    fromPt: p1Line.coords,
                    toPt: p2Line.coords,
                    isCurve: true,
                    curveRadius: arc.radius,
                    arcLength: arc.arcLength,
                    curveDirection: arc.direction,
                    tangentBearing: arc.tangentBearing,
                    chordBearing: arc.chordBearing,
                });
                lastSegmentTangentRef.current = arc.endTangent;
            } else {
                onAddLine({
                    from: p1Line.ref,
                    to: p2Line.ref,
                    type: undefined,
                    layer: activeDrawingLayer || undefined,
                    fromPt: p1Line.coords,
                    toPt: p2Line.coords,
                });
                const segLen = Math.hypot(p2.easting - p1.easting, p2.northing - p1.northing);
                if (segLen > 1e-9) {
                    lastSegmentTangentRef.current = { x: (p2.easting - p1.easting) / segLen, y: (p2.northing - p1.northing) / segLen };
                }
            }

            requestAnimationFrame(() => {
                draw();
            });

            // Keep last point as start for next segment (continuous drawing)
            setPolylinePoints([p2]);
        } else if (drawingMode === 'breaklines' && polylinePoints.length === 2) {
            // Draw breaklines (2 points at a time, continuous)
            const p1 = polylinePoints[0];
            const p2 = polylinePoints[1];
            const p1Line = buildLineEndpoint(p1);
            const p2Line = buildLineEndpoint(p2);
            onAddLine({
                from: p1Line.ref,
                to: p2Line.ref,
                type: 'breakline',
                fromPt: p1Line.coords,
                toPt: p2Line.coords,
            });
            
            requestAnimationFrame(() => {
                draw();
            });
            
            // Keep last point as start for next segment (continuous drawing)
            setPolylinePoints([p2]);
        } else if (drawingMode === 'inclusion' && polylinePoints.length === 2) {
            // Draw inclusion lines (2 points at a time, continuous)
            const p1 = polylinePoints[0];
            const p2 = polylinePoints[1];
            const p1Line = buildLineEndpoint(p1);
            const p2Line = buildLineEndpoint(p2);
            onAddLine({
                from: p1Line.ref,
                to: p2Line.ref,
                type: 'inclusion',
                fromPt: p1Line.coords,
                toPt: p2Line.coords,
            });
            
            requestAnimationFrame(() => {
                draw();
            });
            
            // Keep last point as start for next segment (continuous drawing)
            setPolylinePoints([p2]);
        } else if (drawingMode === 'exclusion' && polylinePoints.length === 2) {
            // Draw exclusion lines (2 points at a time, continuous)
            const p1 = polylinePoints[0];
            const p2 = polylinePoints[1];
            const p1Line = buildLineEndpoint(p1);
            const p2Line = buildLineEndpoint(p2);
            onAddLine({
                from: p1Line.ref,
                to: p2Line.ref,
                type: 'exclusion',
                fromPt: p1Line.coords,
                toPt: p2Line.coords,
            });
            
            requestAnimationFrame(() => {
                draw();
            });
            
            // Keep last point as start for next segment (continuous drawing)
            setPolylinePoints([p2]);
        }
    }, [polylinePoints, onAddLine, drawingMode, draw, buildLineEndpoint, activeDrawingLayer, polylineArcMode]);
    
    const finishDrawing = () => {
        setDrawingMode('none');
        setPolylinePoints([]);
        setTypedSegmentLength('');
        setCircleCenter(null);
        setTypedCircleValue('');
        setCircleSubMode('center-radius');
        setTtrStep(1);
        setTtrEntity1(null);
        setTtrEntity2(null);
        setTtrHoverEntity(null);
        setIsTrimmingLines(false);
        setTrimPoint(null);
        setTrimHoverPreview(null);
        setIsExtendingLines(false);
        setExtendFromLine(null);
        setIsMultiSegmentMode(false);
        resetBoundaryLineMode();
        resetDimMode();
        if (cornerAlignBfId) {
            resetCornerAlign(true);
            props.onBoundaryCornerAlignRequestHandled?.();
        }
    };

    const resetBoundaryLineMode = () => {
        setBoundaryLineFrom(null);
        setBoundaryClickedTo(null);
        setBoundaryBearing('');
        setBoundaryDistance('');
        setBoundaryInputError('');
        setBoundaryCurveMode(false);
        setBoundaryCurveRadius('');
        setBoundaryCurveArcLength('');
        setBoundaryCurveChordBearing('');
        setBoundaryCurveDirection('right');
        setDrawnBoundaryCalls([]);
        setBoundaryClosureResult(null);
        setBoundaryClosureError('');
    };

    const resetDimMode = () => {
        setDimPhase(0);
        setDimP1(null);
        setDimP2(null);
        setDimPreviewMouse(null);
    };

    const handleBoundaryCallConfirm = () => {
        if (!boundaryLineFrom) {
            notifyBoundaryError('Click on a point first to set the start.');
            return;
        }
        if (!boundaryBearing.trim()) {
            notifyBoundaryError(`Enter a ${boundaryCurveMode ? 'tangent bearing' : 'bearing'}.`);
            return;
        }
        setBoundaryClosureResult(null);
        setBoundaryClosureError('');

        if (boundaryCurveMode) {
            const radius = parseFloat(boundaryCurveRadius);
            const arcLen = parseFloat(boundaryCurveArcLength);
            if (!boundaryCurveRadius.trim() || isNaN(radius) || radius <= 0) { notifyBoundaryError('Enter a valid radius.'); return; }
            if (!boundaryCurveArcLength.trim() || isNaN(arcLen) || arcLen <= 0) { notifyBoundaryError('Enter a valid arc length.'); return; }
            const brRad = parseBearingToRadians(boundaryBearing);
            if (brRad === null) { notifyBoundaryError('Invalid tangent bearing format.'); return; }
            setBoundaryInputError('');
            if (onAddBoundaryCall) {
                // Compute chord bearing from tangent + curve geometry if user left it blank
                const chordBearingRaw = boundaryCurveChordBearing.trim();
                let resolvedChordBearing = chordBearingRaw || '';
                if (!resolvedChordBearing) {
                    const deltaM = arcLen / radius;
                    const deltaS = boundaryCurveDirection === 'left' ? -deltaM : deltaM;
                    const chordRad = brRad + deltaS / 2;
                    resolvedChordBearing = formatBearing(chordRad);
                }
                onAddBoundaryCall(boundaryLineFrom, boundaryBearing.trim(), arcLen.toFixed(2), (endPt) => {
                    setDrawnBoundaryCalls(prev => [...prev, {
                        from: boundaryLineFrom.pointNumber,
                        to: endPt.pointNumber,
                        bearing: resolvedChordBearing,
                        distance: arcLen.toFixed(2),
                        isCurve: true,
                        curveRadius: radius,
                        arcLength: arcLen,
                        curveDirection: boundaryCurveDirection,
                        tangentBearing: boundaryBearing.trim(),
                        chordBearing: resolvedChordBearing,
                    }]);
                    setBoundaryLineFrom(endPt);
                    setBoundaryClickedTo(null);
                    setBoundaryBearing('');
                    setBoundaryCurveRadius('');
                    setBoundaryCurveArcLength('');
                    setBoundaryCurveChordBearing('');
                    setBoundaryInputError('');
                    setTimeout(() => boundaryBearingRef.current?.focus(), 50);
                }, { curveRadius: radius, arcLength: arcLen, curveDirection: boundaryCurveDirection });
            }
        } else {
            if (!boundaryDistance.trim()) {
                notifyBoundaryError('Enter a distance.');
                return;
            }
            const brRad = parseBearingToRadians(boundaryBearing);
            const dist = parseDistance(boundaryDistance);
            if (brRad === null) { notifyBoundaryError('Invalid bearing format.'); return; }
            if (dist === null) { notifyBoundaryError('Invalid distance.'); return; }
            setBoundaryInputError('');
            if (onAddBoundaryCall) {
                onAddBoundaryCall(boundaryLineFrom, boundaryBearing.trim(), boundaryDistance.trim(), (endPt) => {
                    setDrawnBoundaryCalls(prev => [...prev, {
                        from: boundaryLineFrom.pointNumber,
                        to: endPt.pointNumber,
                        bearing: boundaryBearing.trim(),
                        distance: boundaryDistance.trim(),
                    }]);
                    // Chain: set the newly created endpoint as the new from, clear second-click state
                    setBoundaryLineFrom(endPt);
                    setBoundaryClickedTo(null);
                    setBoundaryBearing('');
                    setBoundaryDistance('');
                    setBoundaryInputError('');
                    // Focus bearing input for next call
                    setTimeout(() => boundaryBearingRef.current?.focus(), 50);
                });
            }
        }
    };

    const handleBoundaryClosureReport = () => {
        if (!onComputeCurrentClosure || drawnBoundaryCalls.length < 2) return;
        setBoundaryClosureResult(null);
        setBoundaryClosureError('');
        try {
            const result = onComputeCurrentClosure(drawnBoundaryCalls);
            if (result) {
                setBoundaryClosureResult(result);
            } else {
                notifyBoundaryError('Could not compute closure.', true);
            }
        } catch (e: any) {
            notifyBoundaryError(e?.message ?? 'Closure error.', true);
        }
    };

    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const clickedLine = findLineNearClick(clickX, clickY, 15);
        if (!clickedLine) return;

        const targetPolylineId = clickedLine.polylineId;
        const matchingIds = new Set<string>();

        // Step 1: If polylineId exists, add all lines with the same polylineId
        if (targetPolylineId) {
            lines.forEach(l => {
                if (l.polylineId === targetPolylineId && !l.hidden) {
                    matchingIds.add(l.id || `${l.from}-${l.to}`);
                }
            });
        }

        // Step 2: Continuous connected chain traversal
        const getEndpoints = (l: SurveyLine) => {
            const p1 = pointMap.get(l.from);
            const p2 = pointMap.get(l.to);
            const pt1 = p1 ? { x: p1.easting, y: p1.northing } : (l.fromPt ? { x: l.fromPt.x, y: l.fromPt.y } : null);
            const pt2 = p2 ? { x: p2.easting, y: p2.northing } : (l.toPt ? { x: l.toPt.x, y: l.toPt.y } : null);
            return { fromPn: l.from, toPn: l.to, pt1, pt2 };
        };

        const queue: SurveyLine[] = [clickedLine];
        const visited = new Set<SurveyLine>([clickedLine]);

        while (queue.length > 0) {
            const curr = queue.shift()!;
            const currId = curr.id || `${curr.from}-${curr.to}`;
            matchingIds.add(currId);
            const currEnds = getEndpoints(curr);

            for (const other of lines) {
                if (visited.has(other) || other.hidden) continue;
                const otherEnds = getEndpoints(other);

                let connected = false;
                // Point Number ID matching
                if (currEnds.fromPn && (currEnds.fromPn === otherEnds.fromPn || currEnds.fromPn === otherEnds.toPn)) connected = true;
                if (currEnds.toPn && (currEnds.toPn === otherEnds.fromPn || currEnds.toPn === otherEnds.toPn)) connected = true;

                // Coordinate proximity matching (< 0.05 ft)
                if (!connected && currEnds.pt1 && currEnds.pt2 && otherEnds.pt1 && otherEnds.pt2) {
                    const d11 = Math.hypot(currEnds.pt1.x - otherEnds.pt1.x, currEnds.pt1.y - otherEnds.pt1.y);
                    const d12 = Math.hypot(currEnds.pt1.x - otherEnds.pt2.x, currEnds.pt1.y - otherEnds.pt2.y);
                    const d21 = Math.hypot(currEnds.pt2.x - otherEnds.pt1.x, currEnds.pt2.y - otherEnds.pt1.y);
                    const d22 = Math.hypot(currEnds.pt2.x - otherEnds.pt2.x, currEnds.pt2.y - otherEnds.pt2.y);
                    if (d11 < 0.05 || d12 < 0.05 || d21 < 0.05 || d22 < 0.05) {
                        connected = true;
                    }
                }

                if (connected) {
                    visited.add(other);
                    queue.push(other);
                }
            }
        }

        setSelectedLineIds(matchingIds);
        setIsSelectionMode(true);
        requestAnimationFrame(() => drawRef.current?.());
    }, [findLineNearClick, lines, pointMap]);

    return (
        <div 
            ref={containerRef} 
            className="w-full h-full bg-gray-900 relative light-theme:bg-gray-200" 
            onWheel={handleWheel}
            onMouseMove={handleContainerMouseMove}
            onMouseLeave={() => {
                setCursorScreenPos(null);
                cursorWorldPosRef.current = null;
                // Clear shift-hover tooltip when pointer leaves the canvas area
                if (shiftHoverTimerRef.current !== null) {
                    clearTimeout(shiftHoverTimerRef.current);
                    shiftHoverTimerRef.current = null;
                }
                if (shiftHoverPoints.length > 0) {
                    setShiftHoverPoints([]);
                    setShiftHoverPos(null);
                    shiftHoverAnchorRef.current = null;
                }
            }}
            style={{ cursor: isPanning ? 'grabbing' : (isPickingOtOrigin ? 'crosshair' : (shiftBoxSelect ? 'crosshair' : (isCtrlPressed && isOverLabel ? 'grab' : (drawingMode !== 'none' || isDeletingLines || isTrimmingLines || isExtendingLines ? 'crosshair' : (hoveredShrinkwrapPn ? 'pointer' : (isSelectionMode ? (isOverLine ? 'pointer' : 'crosshair') : 'default')))))), overflow: 'visible' }}
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full gesture-capture"
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleCanvasContextMenu}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />

            {/* OT (Orientation Tuple / UCS) Widget in Bottom-Left */}
            {(() => {
                const curMode = orientationTuple.mode ?? 'drafting';
                const curAngle = curMode === 'drafting'
                    ? (orientationTuple.draftingAngle ?? orientationTuple.angle ?? 0)
                    : (orientationTuple.viewAngle ?? orientationTuple.angle ?? 0);
                const curOriginX = curMode === 'drafting'
                    ? (orientationTuple.draftingOriginX ?? orientationTuple.originX ?? 0)
                    : (orientationTuple.viewOriginX ?? orientationTuple.originX ?? 0);
                const curOriginY = curMode === 'drafting'
                    ? (orientationTuple.draftingOriginY ?? orientationTuple.originY ?? 0)
                    : (orientationTuple.viewOriginY ?? orientationTuple.originY ?? 0);
                const curAngleDeg = Math.round((curAngle * 180) / Math.PI * 100) / 100;

                const setModeAngle = (rad: number) => {
                    if (!onSetOrientationTuple) return;
                    onSetOrientationTuple(prev => {
                        const m = prev.mode ?? 'drafting';
                        if (m === 'drafting') {
                            return { ...prev, draftingAngle: rad, angle: rad, placed: true };
                        } else {
                            return { ...prev, viewAngle: rad, angle: rad, placed: true };
                        }
                    });
                };

                const setModeOriginX = (val: number) => {
                    if (!onSetOrientationTuple) return;
                    onSetOrientationTuple(prev => {
                        const m = prev.mode ?? 'drafting';
                        if (m === 'drafting') {
                            return { ...prev, draftingOriginX: val, originX: val, placed: true };
                        } else {
                            return { ...prev, viewOriginX: val, originX: val, placed: true };
                        }
                    });
                };

                const setModeOriginY = (val: number) => {
                    if (!onSetOrientationTuple) return;
                    onSetOrientationTuple(prev => {
                        const m = prev.mode ?? 'drafting';
                        if (m === 'drafting') {
                            return { ...prev, draftingOriginY: val, originY: val, placed: true };
                        } else {
                            return { ...prev, viewOriginY: val, originY: val, placed: true };
                        }
                    });
                };

                const resetModeOrigin = () => {
                    if (!onSetOrientationTuple) return;
                    onSetOrientationTuple(prev => {
                        const m = prev.mode ?? 'drafting';
                        if (m === 'drafting') {
                            return { ...prev, draftingOriginX: 0, draftingOriginY: 0, originX: 0, originY: 0, placed: prev.draftingAngle !== 0 };
                        } else {
                            return { ...prev, viewOriginX: 0, viewOriginY: 0, originX: 0, originY: 0, placed: prev.viewAngle !== 0 };
                        }
                    });
                };

                return (
                    <div className="absolute bottom-3 left-3 z-30 select-none">
                        <div 
                            onClick={() => setIsOtPopupOpen(prev => !prev)}
                            className="p-2 rounded-xl bg-gray-900/90 hover:bg-gray-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-200 shadow-xl cursor-pointer flex items-center justify-center backdrop-blur-sm transition-all group hover:scale-105"
                            title="Orientation Tuple (OT / UCS): Click to adjust orientation and pivot origin"
                        >
                            <svg className="w-6 h-6 transition-transform duration-300" style={{ transform: `rotate(${curAngleDeg}deg)` }} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                {/* Origin box */}
                                <rect x="4" y="20" width="4" height="4" fill="white" fillOpacity="0.8" stroke="none" />
                                {/* X-axis Arrow */}
                                <line x1="6" y1="22" x2="24" y2="22" stroke="#34D399" />
                                <polyline points="20,18 24,22 20,26" stroke="#34D399" fill="none" />
                                {/* Y-axis Arrow */}
                                <line x1="6" y1="22" x2="6" y2="4" stroke="#F87171" />
                                <polyline points="2,8 6,4 10,8" stroke="#F87171" fill="none" />
                            </svg>
                        </div>

                        {isOtPopupOpen && (
                            <div className="absolute bottom-full mb-2 left-0 w-72 bg-gray-950/95 border border-cyan-500/50 rounded-xl shadow-2xl p-3.5 text-xs text-gray-200 backdrop-blur-md z-40 animate-fade-in-up">
                                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-gray-800">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-cyan-400">Orientation Tuple (OT)</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/50 font-mono">UCS</span>
                                    </div>
                                    <button 
                                        onClick={() => setIsOtPopupOpen(false)}
                                        className="text-gray-400 hover:text-white p-0.5 rounded"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="space-y-3.5">
                                    {/* Mode Selector */}
                                    <div>
                                        <div className="flex rounded-lg bg-gray-900 p-0.5 border border-gray-800">
                                            <button
                                                type="button"
                                                onClick={() => onSetOrientationTuple?.(prev => ({
                                                    ...prev,
                                                    mode: 'drafting',
                                                }))}
                                                className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                                                    curMode === 'drafting'
                                                        ? 'bg-cyan-600 text-white shadow-sm'
                                                        : 'text-gray-400 hover:text-gray-200'
                                                }`}
                                                title="Drafting: Geometry & North stay put, new lines with Ortho follow OT angle"
                                            >
                                                Drafting
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onSetOrientationTuple?.(prev => ({
                                                    ...prev,
                                                    mode: 'view',
                                                }))}
                                                className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                                                    curMode === 'view'
                                                        ? 'bg-cyan-600 text-white shadow-sm'
                                                        : 'text-gray-400 hover:text-gray-200'
                                                }`}
                                                title="View: Rotates the entire canvas viewport and all geometry"
                                            >
                                                View
                                            </button>
                                        </div>
                                    </div>

                                    {/* Rotation Angle */}
                                    <div>
                                        <div className="flex justify-between items-center text-[11px] text-gray-400 mb-1.5">
                                            <span className="font-semibold text-gray-300">Rotation Angle:</span>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    step="any"
                                                    value={curAngleDeg}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        if (!isNaN(val)) {
                                                            setModeAngle((val * Math.PI) / 180);
                                                        }
                                                    }}
                                                    className="w-16 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-cyan-300 font-mono text-right text-xs focus:border-cyan-400 focus:outline-none"
                                                />
                                                <span className="text-cyan-300 font-mono">°</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="-180" 
                                            max="180" 
                                            step="0.5"
                                            value={curAngleDeg}
                                            onChange={(e) => {
                                                const deg = parseFloat(e.target.value);
                                                setModeAngle((deg * Math.PI) / 180);
                                            }}
                                            className="w-full accent-cyan-500 cursor-pointer"
                                        />
                                        <div className="flex items-center gap-1 pt-1.5">
                                            <button 
                                                onClick={() => setModeAngle(0)}
                                                className="flex-1 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-mono text-[10px] transition-colors"
                                            >
                                                0°
                                            </button>
                                            <button 
                                                onClick={() => setModeAngle(curAngle + Math.PI / 2)}
                                                className="flex-1 py-0.5 rounded bg-cyan-900/60 hover:bg-cyan-700 text-cyan-200 font-mono text-[10px] transition-colors"
                                                title="+90°"
                                            >
                                                +90°
                                            </button>
                                            <button 
                                                onClick={() => setModeAngle(curAngle - Math.PI / 2)}
                                                className="flex-1 py-0.5 rounded bg-cyan-900/60 hover:bg-cyan-700 text-cyan-200 font-mono text-[10px] transition-colors"
                                                title="-90°"
                                            >
                                                -90°
                                            </button>
                                            <button 
                                                onClick={() => setModeAngle(curAngle + Math.PI)}
                                                className="flex-1 py-0.5 rounded bg-cyan-900/60 hover:bg-cyan-700 text-cyan-200 font-mono text-[10px] transition-colors"
                                                title="180°"
                                            >
                                                180°
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsPickingOtLineAlign(true);
                                                setIsOtPopupOpen(false);
                                            }}
                                            className="mt-2 w-full py-1 rounded bg-indigo-700/80 hover:bg-indigo-600 text-indigo-100 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm border border-indigo-500/40"
                                            title="Click any line or boundary segment on canvas to align rotation angle to it"
                                        >
                                            <span>📏</span> Align to Line
                                        </button>
                                    </div>

                                    {/* Origin (Pivot Point) */}
                                    <div className="pt-2 border-t border-gray-800/80">
                                        <div className="flex justify-between items-center text-[11px] text-gray-400 mb-1.5">
                                            <span className="font-semibold text-gray-300">Origin / Pivot Point:</span>
                                            <span className="text-[10px] text-gray-500 font-mono">World Coords</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                            <div>
                                                <label className="text-[10px] text-emerald-400 font-mono block mb-0.5">X (Easting):</label>
                                                <input 
                                                    type="number" 
                                                    step="any"
                                                    value={curOriginX}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setModeOriginX(isNaN(val) ? 0 : val);
                                                    }}
                                                    className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-emerald-300 font-mono text-xs focus:border-emerald-400 focus:outline-none"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-red-400 font-mono block mb-0.5">Y (Northing):</label>
                                                <input 
                                                    type="number" 
                                                    step="any"
                                                    value={curOriginY}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        setModeOriginY(isNaN(val) ? 0 : val);
                                                    }}
                                                    className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-red-300 font-mono text-xs focus:border-red-400 focus:outline-none"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button 
                                                onClick={() => {
                                                    setIsPickingOtOrigin(true);
                                                    setIsOtPopupOpen(false);
                                                }}
                                                className="flex-1 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                                                title="Click canvas or snap to point/line to set origin"
                                            >
                                                <span>🎯</span> Pick Origin
                                            </button>
                                            <button 
                                                onClick={resetModeOrigin}
                                                className="py-1 px-2.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs transition-colors"
                                                title="Reset origin to (0,0)"
                                            >
                                                Reset (0,0)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {inlineOsnapMenuPos && (
                <div
                    className="absolute z-50 w-56 bg-gray-900/95 border border-cyan-500/40 rounded-lg shadow-2xl p-2 text-xs"
                    style={{ left: inlineOsnapMenuPos.x, top: inlineOsnapMenuPos.y }}
                >
                    <div className="text-cyan-300 font-semibold px-1 pb-1 border-b border-cyan-500/20">
                        Shift+RightClick Snaps
                    </div>
                    <div className="mt-2">
                        <div className="text-gray-400 px-1 mb-1">Inline (next pick only)</div>
                        {OSNAP_ORDER.map(mode => (
                            <button
                                key={`inline-${mode}`}
                                onClick={() => {
                                    setInlineOsnapOverride(mode);
                                    setInlineOsnapMenuPos(null);
                                }}
                                className={`w-full text-left px-2 py-1 rounded mb-1 transition-colors ${inlineOsnapOverride === mode ? 'bg-cyan-700/70 text-cyan-100' : 'hover:bg-gray-800 text-gray-200'}`}
                            >
                                {OSNAP_LABELS[mode]}
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                setInlineOsnapOverride(null);
                                setInlineOsnapMenuPos(null);
                            }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-gray-800 text-gray-300"
                        >
                            Clear Inline Override
                        </button>
                    </div>
                    <div className="mt-2 pt-2 border-t border-cyan-500/20">
                        <div className="text-gray-400 px-1 mb-1">Running snaps</div>
                        {OSNAP_ORDER.map(mode => (
                            <label key={`running-${mode}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={runningOsnaps.has(mode)}
                                    onChange={() => toggleRunningOsnap(mode)}
                                    className="accent-cyan-500"
                                />
                                <span className="text-gray-200">{OSNAP_LABELS[mode]}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Combined status line: snaps/ortho and map button on single line */}
            {(() => {
                const mapEnabled = !!settings.googleMaps?.enabled;
                const hasOsnapInfo = inlineOsnapOverride || runningOsnaps.size > 0 || isOrthoEnabled || isSelectionMode || isTrimmingLines || isExtendingLines || isDeletingLines || drawingMode === 'circle' || ((drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') && polylinePoints.length > 0);
                
                // Always show if there's osnap info or we want the map button visible
                if (!hasOsnapInfo) return null;
                
                return (
                    <div className="absolute bottom-3 right-3 z-30 px-3 py-1 rounded bg-gray-900/85 border border-cyan-500/30 text-[10px] text-cyan-100 font-mono flex items-center gap-3 whitespace-nowrap">
                        {inlineOsnapOverride ? `OSNAP NEXT: ${OSNAP_LABELS[inlineOsnapOverride]} | ` : ''}
                        {`RUNNING: ${runningOsnapLabel}`}
                        {` | ORTHO: ${isOrthoEnabled ? 'ON' : 'OFF'}`}
                        {activeGrip ? ' | GRIP STRETCH: MOVE ENDPOINT [Click to place, Esc to cancel]' : (isSelectionMode ? ` | SELECT (${isBoxSelectMode ? 'BOX' : 'CLICK/DRAG'}): ${selectedLineIds.size} SELECTED [S to exit, B for box, Dbl-click to chain, D/Del to remove]` : '')}
                        {isTrimmingLines ? ' | TRIM (T): CLICK SEGMENT TO CUT [Esc to exit]' : ''}
                        {isExtendingLines ? ' | EXTEND: CLICK LINE [Esc to exit]' : ''}
                        {isDeletingLines ? ' | DELETE: CLICK LINES [Esc to exit]' : ''}
                        {drawingMode === 'polylines' && polylinePoints.length > 0 ? ` | ${polylineArcMode ? 'ARC' : 'LINE'} (A/L)` : ''}
                        {(drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') && polylinePoints.length > 0 ? ` | LEN: ${typedSegmentLength || '_'} ${getLinearUnitAbbreviation(settings.linearUnits)} (Enter)` : ''}
                        {drawingMode === 'circle' ? (
                            circleSubMode === 'ttr' ? (
                                ttrStep === 1
                                    ? ` | CIRCLE (TTR): SELECT 1ST TANGENT [T for Center/Rad] (Esc)`
                                    : ttrStep === 2
                                    ? ` | CIRCLE (TTR): SELECT 2ND TANGENT (Esc)`
                                    : ` | CIRCLE (TTR): ${circleSizeParam.toUpperCase()}: ${typedCircleValue || '_' } ${getLinearUnitAbbreviation(settings.linearUnits)} [D to switch] (Enter)`
                            ) : (
                                !circleCenter
                                    ? ` | CIRCLE: PICK CENTER [T for TTR] (Esc)`
                                    : ` | CIRCLE: ${circleSizeParam.toUpperCase()}: ${typedCircleValue || (cursorWorldPosRef.current ? (Math.hypot(cursorWorldPosRef.current.x - circleCenter.easting, cursorWorldPosRef.current.y - circleCenter.northing) * (circleSizeParam === 'diameter' ? 2 : 1)).toFixed(2) : '_')} ${getLinearUnitAbbreviation(settings.linearUnits)} [D to switch, T for TTR] (Enter)`
                            )
                        ) : ''}
                        {' | '}
                        <button
                            type="button"
                            className="text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
                            title="Toggle map imagery"
                            onClick={() => {
                                setSettings(prev => ({
                                    ...prev,
                                    googleMaps: {
                                        ...prev.googleMaps,
                                        enabled: !prev.googleMaps?.enabled,
                                        ...(!prev.googleMaps?.enabled ? { mapType: 'naip' as const, scale: 2 } : {}),
                                    },
                                }));
                            }}
                        >
                            MAP: {mapEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                );
            })()}

            {/* Map button always visible - shows even when no osnap info */}
            {(() => {
                const mapEnabled = !!settings.googleMaps?.enabled;
                const hasOsnapInfo = inlineOsnapOverride || runningOsnaps.size > 0 || isOrthoEnabled || isSelectionMode || isTrimmingLines || isExtendingLines || isDeletingLines || drawingMode === 'circle' || ((drawingMode === 'polylines' || drawingMode === 'breaklines' || drawingMode === 'inclusion' || drawingMode === 'exclusion') && polylinePoints.length > 0);
                
                // Only show if no osnap info (osnap+map combo already shown above)
                if (hasOsnapInfo) return null;
                
                return (
                    <div className="absolute bottom-3 right-3 z-30 px-3 py-1 rounded bg-gray-900/85 border border-cyan-500/30 text-[10px] text-cyan-100 font-mono flex items-center gap-3 whitespace-nowrap">
                        <button
                            type="button"
                            className="text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
                            title="Toggle map imagery"
                            onClick={() => {
                                setSettings(prev => ({
                                    ...prev,
                                    googleMaps: {
                                        ...prev.googleMaps,
                                        enabled: !prev.googleMaps?.enabled,
                                        ...(!prev.googleMaps?.enabled ? { mapType: 'naip' as const, scale: 2 } : {}),
                                    },
                                }));
                            }}
                        >
                            MAP: {mapEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                );
            })()}

            {settings.googleMaps?.enabled && googleOverlayDiagnostic && (
                <button
                    type="button"
                    className={`absolute top-3 right-3 z-30 max-w-[540px] text-left px-3 py-2 rounded border text-xs font-mono shadow-lg transition-colors ${
                        googleOverlayDiagnostic.tone === 'error'
                            ? 'bg-rose-900/80 border-rose-400/50 text-rose-100 hover:bg-rose-900/90'
                            : 'bg-amber-900/80 border-amber-400/50 text-amber-100 hover:bg-amber-900/90'
                    }`}
                    title="Map imagery diagnostics (click to open map settings)"
                    onClick={() => {
                        if (!onShowSettings) return;
                        onShowSettings();
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('landsurv-open-settings-google-maps'));
                        }, 80);
                    }}
                >
                    <span>{googleOverlayDiagnostic.message}</span>
                </button>
            )}

            {googleOverlayImage && settings.googleMaps?.enabled && (() => {
                const sourceLabel =
                    googleOverlayImage.source === 'naip-proxy' ? 'NAIP proxy'
                    : googleOverlayImage.source === 'user-maps' ? 'User Maps key'
                    : googleOverlayImage.source === 'user-gemini' ? 'User AI key'
                    : 'Server proxy';
                const mapTypeLabel =
                    googleOverlayImage.mapType === 'naip' ? 'NAIP'
                    : googleOverlayImage.mapType === 'hybrid' ? 'Hybrid'
                    : googleOverlayImage.mapType === 'satellite' ? 'Satellite'
                    : googleOverlayImage.mapType === 'terrain' ? 'Terrain'
                    : 'Roadmap';
                return (
                    <button
                        type="button"
                        className="absolute z-30 px-2 py-1 rounded bg-gray-900/85 border border-emerald-500/30 text-[10px] text-emerald-100 font-mono hover:bg-gray-800/90 transition-colors flex items-center gap-1"
                        style={{ right: 12, bottom: 28 }}
                        title="Active basemap imagery (click to open map settings)"
                        onClick={() => {
                            if (!onShowSettings) return;
                            onShowSettings();
                            setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('landsurv-open-settings-google-maps'));
                            }, 80);
                        }}
                    >
                        <svg viewBox="0 0 24 24" className="w-3 h-3 text-emerald-300/90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2v3" />
                            <path d="M12 19v3" />
                            <path d="M4.93 4.93l2.12 2.12" />
                            <path d="M16.95 16.95l2.12 2.12" />
                            <path d="M2 12h3" />
                            <path d="M19 12h3" />
                            <path d="M4.93 19.07l2.12-2.12" />
                            <path d="M16.95 7.05l2.12-2.12" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{`IMAGERY: ${mapTypeLabel} | SOURCE: ${sourceLabel}`}</span>
                    </button>
                );
            })()}

            {shiftBoxSelect && (() => {
                const left = Math.min(shiftBoxSelect.startX, shiftBoxSelect.endX);
                const top = Math.min(shiftBoxSelect.startY, shiftBoxSelect.endY);
                const width = Math.abs(shiftBoxSelect.endX - shiftBoxSelect.startX);
                const height = Math.abs(shiftBoxSelect.endY - shiftBoxSelect.startY);
                const isWindow = shiftBoxSelect.endX >= shiftBoxSelect.startX;
                return (
                    <div
                        className="absolute pointer-events-none z-40"
                        style={{
                            left,
                            top,
                            width,
                            height,
                            border: isWindow ? '1.5px solid rgba(59,130,246,0.95)' : '1.5px dashed rgba(34,197,94,0.95)',
                            background: isWindow ? 'rgba(59,130,246,0.20)' : 'rgba(34,197,94,0.20)',
                        }}
                    />
                );
            })()}

            {/* Shift+hover quick-info tooltip */}
            {shiftHoverPoints.length > 0 && shiftHoverPos && (() => {
                const container = containerRef.current;
                const rect = container?.getBoundingClientRect();
                const tooltipX = rect ? shiftHoverPos.clientX - rect.left + 16 : 16;
                const tooltipY = rect ? shiftHoverPos.clientY - rect.top - 10  : 0;
                return (
                    <div
                        className="absolute z-50 pointer-events-none select-none"
                        style={{ left: tooltipX, top: tooltipY, transform: 'translateY(-100%)' }}
                    >
                        <div className="bg-gray-900/95 border border-gray-600 rounded-lg shadow-xl px-3 py-2 text-xs font-mono min-w-[200px] max-w-[320px]">
                            <div className="text-gray-400 text-[10px] mb-1 tracking-wide uppercase">
                                {shiftHoverPoints.length === 1 ? '1 point' : `${shiftHoverPoints.length} points`} nearby
                            </div>
                            <table className="w-full border-collapse">
                                <tbody>
                                    {shiftHoverPoints.map(p => (
                                        <tr key={p.pointNumber} className="border-t border-gray-700/50 first:border-t-0">
                                            <td className="py-0.5 pr-2 text-amber-400 font-bold whitespace-nowrap">{p.pointNumber}</td>
                                            <td className="py-0.5 pr-2 text-gray-200 truncate max-w-[120px]" title={p.description}>{p.description || '—'}</td>
                                            <td className="py-0.5 text-cyan-400 whitespace-nowrap text-right">
                                                {p.elevation != null && p.elevation !== 0 ? p.elevation.toFixed(2) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* Standardized Dynamic Cursor HUD for geometry input */}
            {cursorScreenPos && (() => {
                const isDrawingActive = 
                    drawingMode !== 'none' ||
                    isSelectionMode ||
                    !!activeGrip ||
                    isPickingOtOrigin ||
                    isPickingOtLineAlign ||
                    isTrimmingLines ||
                    isExtendingLines;

                if (!isDrawingActive) return null;

                const unitAbbrev = getLinearUnitAbbreviation(settings.linearUnits);
                const mouseWorld = screenToWorld(cursorScreenPos.x, cursorScreenPos.y);
                const container = containerRef.current;
                const containerW = container ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 800);
                const containerH = container ? container.clientHeight : (typeof window !== 'undefined' ? window.innerHeight : 600);

                let hudLeft = cursorScreenPos.x + 20;
                let hudTop = cursorScreenPos.y + 20;
                if (hudLeft + 250 > containerW) hudLeft = Math.max(10, cursorScreenPos.x - 260);
                if (hudTop + 110 > containerH) hudTop = Math.max(10, cursorScreenPos.y - 110);

                let badgeText = '';
                let badgeColor = 'bg-cyan-900/80 text-cyan-200 border-cyan-500/50';
                let primaryInput: React.ReactNode = null;
                let secondaryText: React.ReactNode = null;

                if (activeGrip) {
                    badgeText = 'STRETCH';
                    badgeColor = 'bg-rose-900/80 text-rose-200 border-rose-500/50';
                    primaryInput = (
                        <span className="font-medium text-white">
                            Move {activeGrip.type.toUpperCase()} endpoint
                        </span>
                    );
                    secondaryText = (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            {activeOsnapPoint ? (
                                <span className="text-amber-300 font-mono">◈ {activeOsnapPoint.mode} · </span>
                            ) : null}
                            <span>[Click] Place · [Esc] Cancel · [O] Ortho</span>
                        </div>
                    );
                } else if (isSelectionMode) {
                    badgeText = isBoxSelectMode ? 'SELECT (BOX)' : 'SELECT';
                    badgeColor = 'bg-cyan-900/80 text-cyan-200 border-cyan-500/50';
                    primaryInput = (
                        <span className="font-medium text-white">
                            {selectedLineIds.size > 0 ? `${selectedLineIds.size} entity selected` : (isBoxSelectMode ? 'Drag window/crossing box' : 'Click entity or drag box')}
                        </span>
                    );
                    secondaryText = (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span className="text-gray-300 font-semibold">[B]</span> Box · <span className="text-gray-300 font-semibold">[Dbl-Click]</span> Chain · <span className="text-gray-300 font-semibold">[D/Del]</span> Delete · <span className="text-gray-300 font-semibold">[S/Esc]</span> Exit
                        </div>
                    );
                } else if (drawingMode === 'circle') {
                    if (circleSubMode === 'ttr') {
                        badgeText = 'CIRCLE (TTR)';
                        badgeColor = 'bg-amber-900/80 text-amber-200 border-amber-500/50';
                        if (ttrStep === 1) {
                            primaryInput = <span className="font-medium text-white">Select first tangent object</span>;
                            secondaryText = (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <span>Click line, arc, or circle</span> · <span className="text-gray-300 font-semibold">[T]</span> Center/Rad · <span className="text-gray-300 font-semibold">[Esc]</span> Cancel
                                </div>
                            );
                        } else if (ttrStep === 2) {
                            primaryInput = <span className="font-medium text-white">Select second tangent object</span>;
                            secondaryText = (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <span>Click line, arc, or circle</span> · <span className="text-gray-300 font-semibold">[Esc]</span> Back
                                </div>
                            );
                        } else {
                            const currentP = cursorWorldPosRef.current || { x: mouseWorld.easting, y: mouseWorld.northing };
                            const defaultR = ttrEntity2 ? Math.hypot(currentP.x - ttrEntity2.pickPoint.x, currentP.y - ttrEntity2.pickPoint.y) : 25;
                            let rVal = defaultR;
                            if (typedCircleValue.trim().length > 0) {
                                const num = Number(typedCircleValue);
                                if (Number.isFinite(num) && num > 0) {
                                    const fromUnit: LinearUnit = settings.linearUnits || 'usSurveyFoot';
                                    rVal = convertLinearUnits(num, fromUnit, 'foot');
                                }
                            }
                            if (circleSizeParam === 'diameter') rVal = rVal / 2;
                            const sol = ttrEntity1 && ttrEntity2 ? solveTtrCircle(ttrEntity1, ttrEntity2, rVal) : null;
                            const displayVal = typedCircleValue.length > 0 ? typedCircleValue : (circleSizeParam === 'diameter' ? rVal * 2 : rVal).toFixed(2);

                            primaryInput = (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-300 text-[11px] font-semibold">{circleSizeParam === 'diameter' ? 'Diameter:' : 'Radius:'}</span>
                                    <div className="px-1.5 py-0.5 rounded bg-gray-900 border border-amber-400 text-amber-300 font-mono font-bold text-xs flex items-center gap-1 shadow-inner">
                                        <span>{displayVal}</span>
                                        <span className="text-[10px] text-amber-400 font-normal">{unitAbbrev}</span>
                                    </div>
                                </div>
                            );
                            secondaryText = sol ? (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <span className="text-emerald-400 font-semibold">✓ Tangent found</span> · <span className="text-cyan-300 font-semibold">[Enter]</span> Commit · <span className="text-gray-300 font-semibold">[D]</span> Diam
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 text-[10px] text-amber-400">
                                    <span>⚠ No tangent circle for this radius</span> · <span className="text-gray-300 font-semibold">[D]</span> Diam
                                </div>
                            );
                        }
                    } else {
                        badgeText = 'CIRCLE';
                        badgeColor = 'bg-sky-900/80 text-sky-200 border-sky-500/50';
                        if (!circleCenter) {
                            primaryInput = <span className="font-medium text-white">Specify center point</span>;
                            secondaryText = activeOsnapPoint
                                ? <span className="text-amber-300 font-mono">◈ {activeOsnapPoint.mode} · <span className="text-gray-300 font-semibold">[T]</span> TTR</span>
                                : <span className="text-gray-400 font-mono">E: {mouseWorld.easting.toFixed(2)}, N: {mouseWorld.northing.toFixed(2)} · <span className="text-gray-300 font-semibold">[T]</span> TTR</span>;
                        } else {
                            const currentP = cursorWorldPosRef.current || { x: mouseWorld.easting, y: mouseWorld.northing };
                            const liveRadius = Math.hypot(currentP.x - circleCenter.easting, currentP.y - circleCenter.northing);
                            const liveVal = circleSizeParam === 'diameter' ? liveRadius * 2 : liveRadius;
                            const displayVal = typedCircleValue.length > 0 ? typedCircleValue : liveVal.toFixed(2);

                            primaryInput = (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-300 text-[11px] font-semibold">{circleSizeParam === 'diameter' ? 'Diameter:' : 'Radius:'}</span>
                                    <div className="px-1.5 py-0.5 rounded bg-gray-900 border border-sky-400 text-sky-300 font-mono font-bold text-xs flex items-center gap-1 shadow-inner">
                                        <span>{displayVal}</span>
                                        <span className="text-[10px] text-sky-400 font-normal">{unitAbbrev}</span>
                                    </div>
                                </div>
                            );
                            secondaryText = (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <span className="text-gray-300 font-semibold">[D]</span> Diam / <span className="text-gray-300 font-semibold">[R]</span> Rad · <span className="text-cyan-300 font-semibold">[Enter]</span> Commit · <span className="text-gray-300 font-semibold">[T]</span> TTR
                                </div>
                            );
                        }
                    }
                } else if (isLinearDrawingMode(drawingMode)) {
                    const modeLabel = drawingMode === 'breaklines' ? 'BREAKLINE' : drawingMode === 'inclusion' ? 'INCLUSION' : drawingMode === 'exclusion' ? 'EXCLUSION' : 'POLYLINE';
                    badgeText = modeLabel;
                    badgeColor = drawingMode === 'breaklines' ? 'bg-pink-900/80 text-pink-200 border-pink-500/50'
                        : drawingMode === 'inclusion' ? 'bg-emerald-900/80 text-emerald-200 border-emerald-500/50'
                        : drawingMode === 'exclusion' ? 'bg-rose-900/80 text-rose-200 border-rose-500/50'
                        : 'bg-yellow-900/80 text-yellow-200 border-yellow-500/50';

                    if (polylinePoints.length === 0) {
                        primaryInput = <span className="font-medium text-white">Specify start point</span>;
                        secondaryText = activeOsnapPoint
                            ? <span className="text-amber-300 font-mono">◈ {activeOsnapPoint.mode}</span>
                            : <span className="text-gray-400 font-mono">E: {mouseWorld.easting.toFixed(2)}, N: {mouseWorld.northing.toFixed(2)}</span>;
                    } else {
                        const anchor = polylinePoints[polylinePoints.length - 1];
                        const currentP = cursorWorldPosRef.current || { x: mouseWorld.easting, y: mouseWorld.northing };
                        const liveDist = Math.hypot(currentP.x - anchor.easting, currentP.y - anchor.northing);
                        const inv = inverse(anchor, { easting: currentP.x, northing: currentP.y });
                        const bearingStr = formatBearing(inv.bearing);
                        const displayDist = typedSegmentLength.length > 0 ? typedSegmentLength : liveDist.toFixed(2);

                        primaryInput = (
                            <div className="flex items-center gap-1.5">
                                <span className="text-gray-300 text-[11px] font-semibold">Length:</span>
                                <div className="px-1.5 py-0.5 rounded bg-gray-900 border border-yellow-400 text-yellow-300 font-mono font-bold text-xs flex items-center gap-1 shadow-inner">
                                    <span>{displayDist}</span>
                                    <span className="text-[10px] text-yellow-500 font-normal">{unitAbbrev}</span>
                                </div>
                            </div>
                        );
                        secondaryText = (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-cyan-300 font-mono text-[11px] font-medium">{bearingStr}</span>
                                <span className="text-[10px] text-gray-400"><span className="text-gray-300 font-semibold">[Enter]</span> Commit · <span className="text-gray-300 font-semibold">[O]</span> Ortho {isOrthoEnabled ? 'ON' : 'OFF'}</span>
                            </div>
                        );
                    }
                } else if (drawingMode === 'aligned-dim') {
                    badgeText = 'DIMENSION';
                    badgeColor = 'bg-cyan-900/80 text-cyan-200 border-cyan-500/50';
                    primaryInput = <span className="font-medium text-white">{dimPhase === 0 ? 'Specify 1st point' : dimPhase === 1 ? 'Specify 2nd point' : 'Specify dimension offset'}</span>;
                    secondaryText = activeOsnapPoint ? <span className="text-amber-300 font-mono">◈ {activeOsnapPoint.mode}</span> : null;
                } else if (drawingMode === 'boundary-line') {
                    badgeText = 'BOUNDARY';
                    badgeColor = 'bg-amber-900/80 text-amber-200 border-amber-500/50';
                    primaryInput = <span className="font-medium text-white">{!boundaryLineFrom ? 'Click start point (snap)' : 'Specify next call direction & distance'}</span>;
                } else if (isPickingOtOrigin) {
                    badgeText = 'OT ORIGIN';
                    badgeColor = 'bg-emerald-900/80 text-emerald-200 border-emerald-500/50';
                    primaryInput = <span className="font-medium text-white">Click to set OT Origin</span>;
                    secondaryText = activeOsnapPoint ? <span className="text-amber-300 font-mono">◈ {activeOsnapPoint.mode}</span> : null;
                } else if (isPickingOtLineAlign) {
                    badgeText = 'ALIGN TO LINE';
                    badgeColor = 'bg-indigo-900/80 text-indigo-200 border-indigo-500/50';
                    primaryInput = <span className="font-medium text-white">Click line to align rotation</span>;
                } else if (isTrimmingLines) {
                    badgeText = 'TRIM';
                    badgeColor = 'bg-orange-900/80 text-orange-200 border-orange-500/50';
                    primaryInput = <span className="font-medium text-white">Click line segment to trim</span>;
                } else if (isExtendingLines) {
                    badgeText = 'EXTEND';
                    badgeColor = 'bg-blue-900/80 text-blue-200 border-blue-500/50';
                    primaryInput = <span className="font-medium text-white">{!extendFromLine ? 'Click line to extend' : 'Click boundary/line to extend to'}</span>;
                }

                return (
                    <div
                        className="absolute z-50 pointer-events-none select-none transition-all duration-75 ease-out"
                        style={{ left: hudLeft, top: hudTop }}
                    >
                        <div className="bg-gray-950/95 border border-cyan-500/40 rounded-lg shadow-2xl px-2.5 py-1.5 text-xs backdrop-blur-md flex flex-col gap-1 min-w-[160px] max-w-[280px]">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded border uppercase tracking-wide ${badgeColor}`}>
                                    {badgeText}
                                </span>
                                {activeOsnapPoint && (
                                    <span className="text-[10px] text-amber-400 font-mono font-semibold flex items-center gap-0.5">
                                        ◈ {activeOsnapPoint.mode}
                                    </span>
                                )}
                            </div>
                            {primaryInput}
                            {secondaryText}
                        </div>
                    </div>
                );
            })()}
            
            {/* Line Type Status Banner */}
            {false && drawingMode !== 'none' && (
                <div className={`absolute top-0 left-0 right-0 z-30 p-3 flex items-center justify-center gap-4 ${
                    drawingMode === 'breaklines' ? 'bg-pink-600/90' : 
                    drawingMode === 'inclusion' ? 'bg-green-600/90' : 
                    drawingMode === 'exclusion' ? 'bg-red-600/90' :
                    'bg-yellow-600/90'
                } backdrop-blur-sm`}>
                    <span className="text-white font-semibold text-lg">
                        {drawingMode === 'polylines' && '✏️ Drawing Polylines'}
                        {drawingMode === 'breaklines' && '🟥 Drawing Breaklines'} 
                        {drawingMode === 'inclusion' && '🟩 Drawing Inclusion Lines'}
                        {drawingMode === 'exclusion' && '🟥 Drawing Exclusion Lines'}
                    </span>
                    <span className="text-white/80 text-sm">Click points to draw. Click last point again or press Escape to finish.</span>
                </div>
            )}

            {/* Corner-align tool — markers, nest picker and status banner. */}
            {drawingMode === 'boundary-corner-align' && cornerAlignBfId && (() => {
                const toScreen = (e: number, n: number) => ({
                    x: e * transform.scale + transform.offsetX,
                    y: -n * transform.scale + transform.offsetY,
                });
                const corners = cornerAlignCorners;
                const pairedCornerPns = new Set(cornerAlignPairs.map(p => p.pn));
                const stage: 'corner' | 'point' = cornerAlignPendingCorner ? 'point' : 'corner';
                return (
                    <>
                        {/* Selectable deed corners */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-30" style={{ overflow: 'visible' }}>
                            {corners.map(c => {
                                const s = toScreen(c.x, c.y);
                                const isPaired = pairedCornerPns.has(c.pn);
                                const isPending = cornerAlignPendingCorner?.pn === c.pn;
                                const isHover = cornerAlignHover?.pn === c.pn;
                                const color = isPending ? '#f472b6' : isPaired ? '#34d399' : '#60a5fa';
                                const r = isPending || isHover ? 9 : 6;
                                return (
                                    <g key={`ca-corner-${c.pn}`}>
                                        <rect
                                            x={s.x - r} y={s.y - r} width={r * 2} height={r * 2}
                                            fill={isPending ? 'rgba(244,114,182,0.28)' : 'rgba(96,165,250,0.16)'}
                                            stroke={color}
                                            strokeWidth={isPending || isHover ? 2.5 : 1.5}
                                        />
                                        {(isPending || isHover) && (
                                            <text x={s.x + r + 4} y={s.y - r - 2} fill={color} fontSize={11} fontFamily="monospace">
                                                {c.pn}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                            {/* Committed corner → found-point tie lines */}
                            {cornerAlignPairs.map(p => {
                                const t = toScreen(p.targetE, p.targetN);
                                return (
                                    <g key={`ca-pair-${p.pn}-${p.targetPn}`}>
                                        <circle cx={t.x} cy={t.y} r={7} fill="none" stroke="#34d399" strokeWidth={2} />
                                        <text x={t.x + 10} y={t.y + 4} fill="#34d399" fontSize={11} fontFamily="monospace">
                                            {p.pn}→{p.targetPn}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>

                        {/* Nest picker — Shift+click (or any ambiguous click) lists every
                            point stacked under the cursor so the right monument is chosen. */}
                        {cornerAlignPicker && (
                            <div
                                className="absolute z-50 bg-gray-900/97 border border-pink-500/50 rounded-lg shadow-2xl text-xs overflow-hidden"
                                style={{
                                    left: Math.min(cornerAlignPicker.x + 12, Math.max(0, (containerRef.current?.clientWidth ?? 0) - 280)),
                                    top: Math.min(cornerAlignPicker.y + 12, Math.max(0, (containerRef.current?.clientHeight ?? 0) - 240)),
                                    width: 268,
                                }}
                                onMouseDown={ev => ev.stopPropagation()}
                            >
                                <div className="px-3 py-1.5 bg-pink-900/50 border-b border-pink-500/30 text-pink-100 font-semibold">
                                    {cornerAlignPicker.items.length} point{cornerAlignPicker.items.length === 1 ? '' : 's'} in this nest
                                    <span className="block text-[10px] font-normal text-pink-200/70">
                                        Pin corner {cornerAlignPendingCorner?.pn} to…
                                    </span>
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                    {cornerAlignPicker.items.map(p => (
                                        <button
                                            key={p.pointNumber}
                                            type="button"
                                            onClick={() => commitCornerAlignPoint(p)}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-pink-800/40 border-b border-gray-700/40 last:border-b-0"
                                        >
                                            <span className="text-amber-400 font-mono font-bold w-14 shrink-0">{p.pointNumber}</span>
                                            <span className="text-gray-200 truncate flex-1" title={p.description}>{p.description || '—'}</span>
                                            <span className="text-cyan-400 font-mono shrink-0">
                                                {p.elevation != null && p.elevation !== 0 ? p.elevation.toFixed(2) : '—'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCornerAlignPicker(null)}
                                    className="w-full px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px]"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* Status banner + running pair list */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-[520px] max-w-[92%] rounded-lg shadow-lg bg-indigo-950/90 border border-indigo-400/60 backdrop-blur-sm">
                            <div className="flex items-center gap-3 px-4 py-2">
                                <span className="text-indigo-100 text-sm font-semibold flex-1">
                                    {stage === 'corner'
                                        ? '⌖ Click a CORNER of the highlighted deed'
                                        : `⌖ Corner ${cornerAlignPendingCorner?.pn} — now click the found point it belongs on`}
                                </span>
                                {cornerAlignPairs.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const next = cornerAlignPairs.slice(0, -1);
                                            setCornerAlignPairs(next);
                                            setCornerAlignPendingCorner(null);
                                            if (next.length > 0) {
                                                applyCornerAlign(cornerAlignBfId, next);
                                            } else if (cornerAlignBaseTxRef.current) {
                                                props.onUpdateBoundaryTransform?.(cornerAlignBfId, cornerAlignBaseTxRef.current);
                                                setCornerAlignFit(null);
                                            }
                                        }}
                                        className="px-2 py-0.5 rounded text-xs bg-indigo-800 hover:bg-indigo-700 text-indigo-100 border border-indigo-400/50"
                                        title="Remove the last corner ↔ point pair and re-fit"
                                    >
                                        Undo pair
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        const ids = cornerAlignPairs.map(p => p.targetPn);
                                        const bfId = cornerAlignBfId;
                                        setDrawingMode('none');
                                        resetCornerAlign(false);
                                        if (ids.length > 0) props.onBoundaryCornerAlignCommitted?.(bfId, ids);
                                        props.onBoundaryCornerAlignRequestHandled?.();
                                    }}
                                    disabled={cornerAlignPairs.length === 0}
                                    className="px-2 py-0.5 rounded text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-700 text-white border border-emerald-400/60"
                                    title="Keep the current fit and exit the tool"
                                >
                                    Done
                                </button>
                                <button
                                    onClick={() => {
                                        setDrawingMode('none');
                                        resetCornerAlign(true);
                                        props.onBoundaryCornerAlignRequestHandled?.();
                                    }}
                                    className="px-2 py-0.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-500/60"
                                    title="Discard the fit and restore the boundary's original position"
                                >
                                    Cancel
                                </button>
                            </div>
                            <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-indigo-200/80">
                                <span>Shift+click a found point to pick from a nest of stacked points.</span>
                                {cornerAlignPairs.length > 0 && (
                                    <span className="font-mono text-emerald-300">
                                        {cornerAlignPairs.length} pair{cornerAlignPairs.length === 1 ? '' : 's'}
                                        {cornerAlignPairs.length === 1 ? ' (translation only — add a 2nd for rotation)' : ''}
                                    </span>
                                )}
                                {cornerAlignFit && cornerAlignPairs.length >= 2 && (
                                    <span className="font-mono text-amber-300">
                                        RMS {cornerAlignFit.rmse.toFixed(2)}′ · max {cornerAlignFit.maxResidual.toFixed(2)}′ · rot {cornerAlignFit.rotDeg.toFixed(4)}°
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* Boundary-align status banner — visible while the tool is armed. */}
            {drawingMode === 'boundary-align' && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-lg shadow-lg bg-blue-900/85 border border-blue-400/60 backdrop-blur-sm">
                    <span className="text-blue-100 text-sm font-semibold">
                        {boundaryAlignMovable && boundaryAlignMovable.callId === '__pending__'
                            ? '↔ Align: click a line on THIS boundary to use as the source'
                            : !boundaryAlignTarget
                                ? '↔ Align: now click the matching line on the OTHER deed'
                                : boundaryAlignSliding
                                    ? '↔ Slide along line — corners snap to target. Press R to rotate 180°. Click to commit.'
                                    : '↔ Aligning…'}
                    </span>
                    <button
                        onClick={() => {
                            setDrawingMode('none');
                            setBoundaryAlignMovable(null);
                            setBoundaryAlignTarget(null);
                            setBoundaryAlignSliding(false);
                            setBoundaryAlignFlipped(false);
                            boundaryAlignSlideRef.current = null;
                            props.onBoundaryAlignRequestHandled?.();
                        }}
                        className="px-2 py-0.5 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white border border-blue-400/60"
                        title="Cancel align"
                    >
                        Cancel
                    </button>
                </div>
            )}
            
            {/* Line Type Indicators Legend */}
            {false && drawingMode !== 'none' && (
                <div className="absolute top-16 left-4 z-20 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg p-3">
                    <div className="text-xs font-semibold text-gray-300 mb-2">Line Type Legend:</div>
                    <div className="flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                            <span className="text-gray-300">Breaklines</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-gray-300">Inclusion Lines</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-gray-300">Exclusion Lines</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <span className="text-gray-300">Normal Lines</span>
                        </div>
                    </div>
                </div>
            )}
            
            <NorthArrow 
                style={settings.northArrowStyle} 
                position={settings.northArrowPosition} 
                isLightTheme={settings.theme === 'light'} 
                rotationRad={orientationTuple?.viewAngle ?? (orientationTuple?.mode === 'view' ? (orientationTuple?.angle ?? 0) : 0)}
                onClick={onShowSettings} 
            />

            {/* Selection-mode hint banner — visible whenever selection mode is active */}
            {isSelectionMode && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 bg-gray-900/90 backdrop-blur-md border border-cyan-500/40 rounded-lg shadow-lg text-xs text-cyan-100 pointer-events-none flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-cyan-300" fill="currentColor"><path d="M5 3 L5 18 L9 14 L11.5 20 L13.5 19.2 L11 13.2 L17 13 Z"/></svg>
                    <span>Selection Mode — click lines to select · press <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded font-mono text-[10px]">D</kbd> to delete · <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-600 rounded font-mono text-[10px]">Esc</kbd> to clear</span>
                </div>
            )}

            {/* Line Selection Info Panel — appears when lines are selected in selection mode */}
            {selectedLineIds.size > 0 && isSelectionMode && (() => {
                const selId = [...selectedLineIds][0];
                const selLine = lines.find(l => (l.id || `${l.from}-${l.to}`) === selId);
                if (!selLine) return null;
                const currentLayer = selLine.layer || '(no layer)';
                const defaultPos = { x: Math.max(0, window.innerWidth / 2 - 140), y: window.innerHeight - 220 };
                const panelPos = lineQueryPanelPos || defaultPos;
                const handleDragStart = (e: React.MouseEvent) => {
                    e.preventDefault();
                    lineQueryDragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPosX: panelPos.x, startPosY: panelPos.y };
                    const onMove = (ev: MouseEvent) => {
                        if (!lineQueryDragState.current.dragging) return;
                        setLineQueryPanelPos({ x: lineQueryDragState.current.startPosX + (ev.clientX - lineQueryDragState.current.startX), y: lineQueryDragState.current.startPosY + (ev.clientY - lineQueryDragState.current.startY) });
                    };
                    const onUp = () => { lineQueryDragState.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                };
                return (
                    <div className="fixed z-40 bg-gray-900/96 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-2xl text-xs text-gray-200 flex flex-col gap-0 min-w-[280px]" style={{ left: panelPos.x, top: panelPos.y }}>
                        <div className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none border-b border-cyan-500/20 rounded-t-xl" onMouseDown={handleDragStart}>
                            <span className="font-semibold text-cyan-300">{selectedLineIds.size === 1 ? '1 line selected' : `${selectedLineIds.size} lines selected`}</span>
                            <button onClick={() => setSelectedLineIds(new Set())} className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white" title="Clear selection">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className="flex flex-col gap-2 p-3">
                        {selectedLineIds.size === 1 && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                <span className="text-gray-400">From → To</span>
                                <span className="font-mono">{selLine.from} → {selLine.to}</span>
                                {selLine.bearing && <><span className="text-gray-400">Bearing</span><span className="font-mono">{selLine.bearing}</span></>}
                                {selLine.distance && <><span className="text-gray-400">Distance</span><span className="font-mono">{selLine.distance}</span></>}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 flex-shrink-0">Layer</span>
                            {props.availableLayers && props.availableLayers.length > 0 ? (
                                <select
                                    value={currentLayer === '(no layer)' ? '' : currentLayer}
                                    onChange={e => {
                                        if (props.onUpdateLine) {
                                            selectedLineIds.forEach(id => props.onUpdateLine!(id, { layer: e.target.value }));
                                        }
                                    }}
                                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-500"
                                >
                                    <option value="">(no layer)</option>
                                    {props.availableLayers.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            ) : (
                                <span className="font-mono text-cyan-200">{currentLayer}</span>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-500">Del/Backspace/D to delete · Esc to deselect · Alt+click label to flip · Shift+click label to swap bearing</p>
                        {onConvertSelectionToBoundary && (
                            <button
                                onClick={() => {
                                    const selected = lines.filter(l => selectedLineIds.has(l.id || `${l.from}-${l.to}`));
                                    onConvertSelectionToBoundary(selected);
                                    setSelectedLineIds(new Set());
                                }}
                                className="mt-1 w-full p-1.5 rounded-md text-xs flex items-center justify-center gap-2 bg-amber-700 hover:bg-amber-600 text-white"
                                title="Convert selected lines to a Boundary object in the Boundary Editor"
                            >
                                <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21l18-18M6 18l3-3M15 9l3-3"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>
                                Convert to Boundary ({selectedLineIds.size})
                            </button>
                        )}
                        </div>
                    </div>
                );
            })()}

            {/* Boundary-Line Draw Dialog */}
            {drawingMode === 'boundary-line' && (
                <div className="absolute top-1/2 right-4 -translate-y-1/2 z-30 w-64 bg-gray-900/96 backdrop-blur-md border border-amber-500/50 rounded-xl shadow-2xl p-3 text-xs">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-amber-300">Draw Boundary Line</span>
                        <button
                            onClick={() => { setDrawingMode('none'); resetBoundaryLineMode(); }}
                            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                            title="Exit boundary line mode"
                        >
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div className="text-gray-400 mb-2 text-[10px] leading-snug">
                        {!boundaryLineFrom
                            ? 'Click an existing point to set the start.'
                            : !boundaryClickedTo && !boundaryBearing
                            ? <>From: <span className="text-amber-200 font-mono">{boundaryLineFrom.pointNumber}</span> — click anywhere or type bearing &amp; {boundaryCurveMode ? 'curve data' : 'distance'} below.</>
                            : <>From: <span className="text-amber-200 font-mono">{boundaryLineFrom.pointNumber}</span> — confirm or adjust, then click <strong>Add</strong>. Chains automatically.</> }
                    </div>
                    {/* Curve mode toggle */}
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            onClick={() => { setBoundaryCurveMode(m => !m); setBoundaryInputError(''); setBoundaryClosureResult(null); }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${boundaryCurveMode ? 'bg-sky-700 border-sky-500 text-sky-100' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                        >
                            ⌒ Curve
                        </button>
                        {drawnBoundaryCalls.length >= 2 && onComputeCurrentClosure && (
                            <button
                                onClick={handleBoundaryClosureReport}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border bg-gray-800 border-gray-600 text-gray-400 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
                                title="Compute closure for drawn calls"
                            >
                                ⬡ Closure
                            </button>
                        )}
                    </div>
                    {boundaryLineFrom && (
                        <>
                            <div className="mb-2">
                                <label className="text-gray-400 block mb-0.5">{boundaryCurveMode ? 'Tangent Bearing (in)' : 'Bearing'}</label>
                                <input
                                    ref={boundaryBearingRef}
                                    value={boundaryBearing}
                                    onChange={e => setBoundaryBearing(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBoundaryCallConfirm(); } }}
                                    placeholder='e.g. N 45°30′00″ E'
                                    className="w-full bg-gray-800 border border-gray-600 focus:border-amber-500 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                    spellCheck={false}
                                />
                            </div>
                            {!boundaryCurveMode && (
                                <div className="mb-2">
                                    <label className="text-gray-400 block mb-0.5">Distance</label>
                                    <input
                                        value={boundaryDistance}
                                        onChange={e => setBoundaryDistance(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBoundaryCallConfirm(); } }}
                                        placeholder='e.g. 125.00'
                                        className="w-full bg-gray-800 border border-gray-600 focus:border-amber-500 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                        spellCheck={false}
                                    />
                                </div>
                            )}
                            {boundaryCurveMode && (
                                <>
                                    <div className="mb-2">
                                        <label className="text-gray-400 block mb-0.5">Radius</label>
                                        <input
                                            value={boundaryCurveRadius}
                                            onChange={e => setBoundaryCurveRadius(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBoundaryCallConfirm(); } }}
                                            placeholder='e.g. 200.00'
                                            className="w-full bg-gray-800 border border-gray-600 focus:border-sky-500 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                                            spellCheck={false}
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="text-gray-400 block mb-0.5">Arc Length</label>
                                        <input
                                            value={boundaryCurveArcLength}
                                            onChange={e => setBoundaryCurveArcLength(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBoundaryCallConfirm(); } }}
                                            placeholder='e.g. 85.42'
                                            className="w-full bg-gray-800 border border-gray-600 focus:border-sky-500 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                                            spellCheck={false}
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="text-gray-400 block mb-0.5">Direction</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setBoundaryCurveDirection('left')}
                                                className={`flex-1 py-0.5 rounded text-[10px] font-medium border transition-colors ${boundaryCurveDirection === 'left' ? 'bg-sky-700 border-sky-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                                            >
                                                ↺ Left
                                            </button>
                                            <button
                                                onClick={() => setBoundaryCurveDirection('right')}
                                                className={`flex-1 py-0.5 rounded text-[10px] font-medium border transition-colors ${boundaryCurveDirection === 'right' ? 'bg-sky-700 border-sky-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                                            >
                                                ↻ Right
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mb-2">
                                        <label className="text-gray-400 block mb-0.5">Chord Bearing <span className="text-gray-600">(optional)</span></label>
                                        <input
                                            value={boundaryCurveChordBearing}
                                            onChange={e => setBoundaryCurveChordBearing(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBoundaryCallConfirm(); } }}
                                            placeholder='auto-computed if blank'
                                            className="w-full bg-gray-800 border border-gray-600 focus:border-sky-500 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                                            spellCheck={false}
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex gap-1.5">
                                <button
                                    onClick={handleBoundaryCallConfirm}
                                    className="flex-1 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold transition-colors"
                                >
                                    Add ➜
                                </button>
                                <button
                                    onClick={resetBoundaryLineMode}
                                    className="py-1 px-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                                    title="Reset start point"
                                >
                                    ↺
                                </button>
                            </div>
                        </>
                    )}

                    {/* Closure result */}
                    {boundaryClosureResult && (
                        <div className="mt-2 p-2 bg-gray-800/80 rounded border border-emerald-700/50 text-[10px] space-y-0.5">
                            <div className="text-emerald-400 font-semibold mb-1">Closure Report</div>
                            <div className="flex justify-between"><span className="text-gray-400">Precision</span><span className="text-white font-mono">{boundaryClosureResult.precision}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">Misclosure</span><span className="text-white font-mono">{boundaryClosureResult.misclosureDistance.toFixed(3)} ft</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">Area</span><span className="text-white font-mono">{(boundaryClosureResult.area / 43560).toFixed(4)} ac</span></div>
                        </div>
                    )}

                </div>
            )}
            {/* View/Navigation Toolbar */}
            <div 
                style={{ left: `${viewToolbarPosition.x}px`, top: `${viewToolbarPosition.y}px` }}
                className="absolute z-20"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.toolbar-drag-handle')) {
                        setIsViewToolbarDragging(true);
                        viewToolbarDragStart.current = {
                            x: e.clientX,
                            y: e.clientY,
                            toolbarX: viewToolbarPosition.x,
                            toolbarY: viewToolbarPosition.y
                        };
                        e.preventDefault();
                    }
                }}
            >
                {(() => {
                    const viewDirection = getFlyoutDirection(viewToolbarPosition.x, viewToolbarPosition.y);
                    const shouldFlyoutGoAbove = viewDirection.vertical === 'above';
                    
                    return (
                        <>
                            {/* Flyouts positioned above toolbar if needed */}
                            {shouldFlyoutGoAbove && isAttributeFlyoutOpen && (
                                <div className="absolute bottom-full mb-2 left-0 p-4 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-64 animate-fade-in-up">
                                    <label htmlFor="attributeScale" className="block text-sm font-medium text-gray-400 mb-1">Point Attribute Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="attributeScale" min="0.5" max="5" step="0.1" value={attributeScale} onChange={(e) => setAttributeScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{attributeScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="lineLabelScale" className="block text-sm font-medium text-gray-400 mb-1">Bearing &amp; Distance Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="lineLabelScale" min="0.5" max="20" step="0.1" value={lineLabelScale} onChange={(e) => setLineLabelScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{lineLabelScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="dimensionScale_above" className="block text-sm font-medium text-gray-400 mb-1">Dimension Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="dimensionScale_above" min="0.5" max="5" step="0.1" value={dimensionScale} onChange={(e) => setDimensionScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{dimensionScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="symbolScale_above" className="block text-sm font-medium text-gray-400 mb-1">Symbol Scale (global)</label>
                                    <div className="flex items-center gap-4">
                                        <input type="range" id="symbolScale_above" min="0.25" max="5" step="0.05" value={symbolScale} onChange={(e) => setSymbolScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{symbolScale.toFixed(2)}x</span>
                                    </div>
                                    {setAnnotationScale && (
                                        <>
                                            <label htmlFor="annotationScale_above" className="block text-sm font-medium text-gray-400 mb-1 mt-3">Annotation Scale (global)</label>
                                            <div className="flex items-center gap-4">
                                                <input type="range" id="annotationScale_above" min="0.25" max="5" step="0.05" value={annotationScale} onChange={(e) => setAnnotationScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                                <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{annotationScale.toFixed(2)}x</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            
                            {shouldFlyoutGoAbove && isZoomExtentsOpen && (
                                <div className="absolute bottom-full mb-2 left-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up">
                                    <div className="space-y-1">
                                        <button onClick={() => { zoomExtents(); setIsZoomExtentsOpen(false); }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Zoom Extents"><ZoomExtentsIcon className="w-5 h-5"/> Zoom Extents</button>
                                        <button onClick={() => {
                                            setIsZoomExtentsOpen(false);
                                            setIsZoomToPointOpen(true);
                                        }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Zoom to Point"><ZoomToPointIcon className="w-5 h-5"/> Zoom to Point</button>
                                        <button onClick={() => {
                                            setIsZoomExtentsOpen(false);
                                            setIsFindPointsOpen(true);
                                        }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Find Points by Description"><ListBulletIcon className="w-5 h-5"/> Find Points</button>
                                    </div>
                                </div>
                            )}
                            
                            {shouldFlyoutGoAbove && isZoomToPointOpen && (
                                <div className="absolute bottom-full mb-2 left-0 p-3 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-56 animate-fade-in-up">
                                    <form onSubmit={handleZoomToPointSubmit} className="flex items-center gap-2 mb-3">
                                        <input type="text" value={zoomToPointNumber} onChange={(e) => setZoomToPointNumber(e.target.value)} placeholder="Point Number" className="flex-1 p-1.5 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500" autoFocus />
                                        <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-700">Go</button>
                                    </form>
                                    {points.length > 0 && (
                                        <div className="max-h-48 overflow-y-auto pr-2">
                                            <h5 className="text-xs font-bold text-gray-400 uppercase mb-2">Points</h5>
                                            <div className="space-y-1">
                                                {points.map(point => (
                                                    <button key={point.pointNumber} onClick={() => { onZoomToPoint(point); setZoomToPointNumber(''); setIsZoomToPointOpen(false); }} className="w-full text-left p-1.5 rounded-md text-xs bg-gray-700 hover:bg-gray-600 transition-colors truncate">{point.pointNumber}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {shouldFlyoutGoAbove && isFindPointsOpen && (
                                <div className="absolute bottom-full mb-2 left-0 p-3 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-72 animate-fade-in-up">
                                    <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-bold text-gray-300 uppercase">Find Points</h5>
                                        <button onClick={() => { setIsFindPointsOpen(false); setFindPointsQuery(''); }} className="text-gray-400 hover:text-white" title="Close"><XMarkIcon className="w-4 h-4"/></button>
                                    </div>
                                    <input type="text" value={findPointsQuery} onChange={(e) => setFindPointsQuery(e.target.value)} placeholder='e.g. "show me sign points"' className="w-full p-1.5 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2" autoFocus />
                                    <div className="max-h-64 overflow-y-auto pr-1">
                                        {findPointsQuery.trim() === '' ? (
                                            <p className="text-xs text-gray-400 italic px-1">Type a description to filter the {points.length} loaded point{points.length !== 1 ? 's' : ''}.</p>
                                        ) : findPointsMatches.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic px-1">No matching points.</p>
                                        ) : (
                                            <>
                                                <p className="text-[10px] text-gray-500 uppercase mb-1 px-1">{findPointsMatches.length} match{findPointsMatches.length !== 1 ? 'es' : ''}{findPointsMatches.length >= 200 ? ' (capped)' : ''}</p>
                                                <div className="space-y-1">
                                                    {findPointsMatches.map(point => (
                                                        <button key={point.pointNumber} onClick={() => onZoomToPoint(point)} className="w-full text-left p-1.5 rounded-md text-xs bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2" title="Zoom to this point">
                                                            <span className="font-mono text-cyan-300 flex-shrink-0">{point.pointNumber}</span>
                                                            <span className="text-gray-300 truncate">{point.description || '(no description)'}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {shouldFlyoutGoAbove && isDrawingToolsMenuOpen && (
                                <div className="absolute bottom-full mb-2 right-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up">
                                    <div className="space-y-2">
                                        <button onClick={() => { 
                                            if (drawingMode === 'polylines') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('polylines');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'polylines' ? 'bg-yellow-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Polylines (L)"><PolylineIcon className="w-5 h-5"/> Draw Polylines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'circle') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('circle');
                                                setCircleCenter(null);
                                                setCircleSizeParam('radius');
                                                setTypedCircleValue('');
                                                setCircleSubMode('center-radius');
                                                setTtrStep(1);
                                                setTtrEntity1(null);
                                                setTtrEntity2(null);
                                                setTtrHoverEntity(null);
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'circle' ? 'bg-sky-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Circle (C: Center/Radius, T: Tangent-Tangent-Radius)"><CircleIcon className="w-5 h-5"/> Draw Circle (C / TTR)</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'breaklines') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('breaklines');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'breaklines' ? 'bg-pink-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Breaklines"><BreaklineIcon className="w-5 h-5"/> Draw Breaklines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'inclusion') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('inclusion');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'inclusion' ? 'bg-green-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Inclusion Lines (I)"><InclusionLineIcon className="w-5 h-5"/> Draw Inclusion Lines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'exclusion') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('exclusion');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'exclusion' ? 'bg-red-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Exclusion Lines"><ExclusionLineIcon className="w-5 h-5"/> Draw Exclusion Lines</button>

                                        <button onClick={() => {
                                            if (drawingMode === 'boundary-line') {
                                                setDrawingMode('none');
                                                resetBoundaryLineMode();
                                            } else {
                                                setDrawingMode('boundary-line');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                                resetBoundaryLineMode();
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'boundary-line' ? 'bg-amber-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Boundary Line (click point, enter bearing + distance)">
                                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21l18-18M6 18l3-3M15 9l3-3"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>
                                            Draw Boundary Line
                                        </button>
                                        
                                        <div className="border-t border-gray-700"></div>
                                        
                                        <button onClick={() => {
                                            if (isTrimmingLines) {
                                                setIsTrimmingLines(false);
                                                setTrimPoint(null);
                                            } else {
                                                setIsTrimmingLines(true);
                                                setIsDeletingLines(false);
                                                setDrawingMode('none');
                                                setIsExtendingLines(false);
                                                setExtendFromLine(null);
                                            }
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${isTrimmingLines ? 'bg-orange-600 text-white' : 'hover:bg-gray-700'}`} title="Trim Lines"><ScissorsIcon className="w-5 h-5"/> Trim Lines</button>
                                        
                                        <button onClick={() => {
                                            if (isExtendingLines) {
                                                setIsExtendingLines(false);
                                                setExtendFromLine(null);
                                            } else {
                                                setIsExtendingLines(true);
                                                setIsDeletingLines(false);
                                                setDrawingMode('none');
                                                setIsTrimmingLines(false);
                                                setTrimPoint(null);
                                            }
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${isExtendingLines ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`} title="Extend Lines"><ExtendIcon className="w-5 h-5"/> Extend Lines</button>

                                        {selectedLineIds.size > 0 && onConvertSelectionToBoundary && (
                                            <>
                                                <div className="border-t border-gray-700"></div>
                                                <button onClick={() => {
                                                    const selected = lines.filter(l => selectedLineIds.has(l.id || `${l.from}-${l.to}`));
                                                    onConvertSelectionToBoundary(selected);
                                                    setSelectedLineIds(new Set());
                                                    setIsDrawingToolsMenuOpen(false);
                                                }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white" title="Convert selected lines to a Boundary object in the Boundary Editor">
                                                    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21l18-18M6 18l3-3M15 9l3-3"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>
                                                    Convert to Boundary ({selectedLineIds.size})
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Dimension flyout — above position */}
                            {shouldFlyoutGoAbove && isDimFlyoutOpen && (
                                <div className="absolute bottom-full mb-2 right-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up w-52">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-gray-400 uppercase px-1">Dimensions</p>
                                        <button onClick={() => {
                                            if (drawingMode === 'aligned-dim') {
                                                setDrawingMode('none');
                                                resetDimMode();
                                            } else {
                                                setDrawingMode('aligned-dim');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                                resetDimMode();
                                            }
                                            setIsDimFlyoutOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'aligned-dim' ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'}`} title="Aligned Dimension (3-click: P1, P2, offset)">
                                            <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <line x1="4" y1="18" x2="20" y2="18"/>
                                                <line x1="4" y1="14" x2="4" y2="22"/>
                                                <line x1="20" y1="14" x2="20" y2="22"/>
                                                <line x1="4" y1="7" x2="20" y2="7" strokeDasharray="3 2"/>
                                                <path d="M7 18 L7 7M17 18 L17 7" strokeOpacity="0.4"/>
                                            </svg>
                                            Aligned Dimension
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {/* Main toolbar - always at the positioned location */}
                            <div className="p-1 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50 shadow-lg">
                                {/* Desktop: Single row layout */}
                                <div className="hidden md:flex flex-row items-center gap-1">
                                    <div className="toolbar-drag-handle px-1 cursor-move flex items-center" title="Drag to move toolbar">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                            <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                            <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                        </div>
                                    </div>
                                    <button onClick={() => {
                                        setIsZoomExtentsOpen(p => !p);
                                        if (!isZoomExtentsOpen) {
                                            setIsAttributeFlyoutOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsLayerPanelOpen(false);
                                            setIsDrawingToolsMenuOpen(false);
                                        }
                                    }} className={`p-3 rounded-lg transition-colors ${isZoomExtentsOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Zoom Options"><ZoomExtentsIcon className="w-6 h-6"/></button>
                                    
                                    <button onClick={() => {
                                        setIsAttributeFlyoutOpen(p => !p);
                                        if (!isAttributeFlyoutOpen) {
                                            setIsZoomExtentsOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsLayerPanelOpen(false);
                                            setIsDrawingToolsMenuOpen(false);
                                        }
                                    }} className={`p-3 rounded-lg transition-colors ${isAttributeFlyoutOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Annotation Scale"><AttributeScaleIcon className="w-6 h-6"/></button>
                                    <button onClick={() => {
                                        setIsLayerPanelOpen(p => !p);
                                        if (!isLayerPanelOpen) {
                                            setIsZoomExtentsOpen(false);
                                            setIsAttributeFlyoutOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsDrawingToolsMenuOpen(false);
                                        }
                                    }} className={`p-3 rounded-lg transition-colors ${isLayerPanelOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Data Visibility"><LayersIcon className="w-6 h-6"/></button>
                                    <button
                                        onClick={() => setIsTinShadingEnabled(v => !v)}
                                        className={`p-3 rounded-lg transition-colors ${isTinShadingEnabled ? 'bg-cyan-600' : 'hover:bg-gray-700'}`}
                                        title={isTinShadingEnabled ? 'TIN Shading: ON' : 'TIN Shading: OFF'}
                                    >
                                        <EyeIcon className="w-6 h-6"/>
                                    </button>
                                    <button onClick={() => {
                                        setIsSelectionMode(p => {
                                            const next = !p;
                                            if (next) {
                                                setIsZoomExtentsOpen(false);
                                                setIsAttributeFlyoutOpen(false);
                                                setIsZoomToPointOpen(false);
                                                setIsLayerPanelOpen(false);
                                                setIsDrawingToolsMenuOpen(false);
                                                setIsDimFlyoutOpen(false);
                                                setDrawingMode('none');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            } else {
                                                setSelectedLineIds(new Set());
                                            }
                                            return next;
                                        });
                                    }} className={`p-3 rounded-lg transition-colors ${isSelectionMode ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Selection Mode — click lines to select, press D or Delete to remove, then Convert to Boundary">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
                                            <path d="M5 3 L5 18 L9 14 L11.5 20 L13.5 19.2 L11 13.2 L17 13 Z" fill="currentColor"/>
                                        </svg>
                                    </button>
                                    <button onClick={() => {
                                        setIsDrawingToolsMenuOpen(p => !p);
                                        if (!isDrawingToolsMenuOpen) {
                                            setIsZoomExtentsOpen(false);
                                            setIsAttributeFlyoutOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsLayerPanelOpen(false);
                                        } else {
                                            setSelectedLineIds(new Set());
                                        }
                                    }} className={`p-3 rounded-lg transition-colors ${isDrawingToolsMenuOpen || drawingMode !== 'none' || isTrimmingLines || isExtendingLines || isDeletingLines ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Drawing Tools"><PencilSquareIcon className="w-6 h-6"/></button>
                                    <button onClick={() => {
                                        setIsDimFlyoutOpen(p => !p);
                                        if (!isDimFlyoutOpen) {
                                            setIsZoomExtentsOpen(false);
                                            setIsAttributeFlyoutOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsLayerPanelOpen(false);
                                            setIsDrawingToolsMenuOpen(false);
                                        }
                                    }} className={`p-3 rounded-lg transition-colors ${isDimFlyoutOpen || drawingMode === 'aligned-dim' ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Dimension Tools">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <line x1="3" y1="19" x2="21" y2="19"/>
                                            <line x1="3" y1="14" x2="3" y2="24" strokeWidth="1.8"/><line x1="21" y1="14" x2="21" y2="24" strokeWidth="1.8"/>
                                            <line x1="3" y1="8" x2="21" y2="8" strokeDasharray="3,2"/>
                                            <line x1="6" y1="19" x2="6" y2="8" strokeOpacity="0.45"/>
                                            <line x1="18" y1="19" x2="18" y2="8" strokeOpacity="0.45"/>
                                        </svg>
                                    </button>
                                    {/* CAD Standards spreadsheet editor (quick open) */}
                                    <button
                                        onClick={() => setIsCadStandardsEditorOpen(true)}
                                        disabled={!cadStandard}
                                        className={`p-3 rounded-lg transition-colors flex items-center ${cadStandard ? 'hover:bg-gray-700' : 'opacity-40 cursor-not-allowed'}`}
                                        title={cadStandard ? `Open CAD Standards editor (${cadStandard.codes.length} codes)` : 'Load a CAD standard to edit codes'}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <rect x="3" y="4" width="18" height="16" rx="2"/>
                                            <line x1="3" y1="9" x2="21" y2="9"/>
                                            <line x1="3" y1="14" x2="21" y2="14"/>
                                            <line x1="9" y1="4" x2="9" y2="20"/>
                                            <line x1="15" y1="4" x2="15" y2="20"/>
                                        </svg>
                                    </button>
                                    {/* Symbol exclusion mode — click points to hide their symbols */}
                                    <button
                                        onClick={() => setSymbolExclusionMode(m => !m)}
                                        className={`p-3 rounded-lg transition-colors flex items-center ${symbolExclusionMode ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-700'}`}
                                        title={symbolExclusionMode
                                            ? `Exit symbol exclusion mode (${excludedSymbolDescriptions.size} description${excludedSymbolDescriptions.size === 1 ? '' : 's'} hidden) — click a point to toggle its group`
                                            : 'Exclude point symbols: click a point to hide symbols for every point with the same description'}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <circle cx="12" cy="12" r="8"/>
                                            <line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                    {/* Floating Point List Panel toggle */}
                                    {props.onOpenPointListPanel && (
                                        <button
                                            onClick={props.onOpenPointListPanel}
                                            className={`p-3 rounded-lg transition-colors ${props.isPointListPanelOpen ? 'bg-cyan-600 hover:bg-cyan-700' : 'hover:bg-gray-700'} ${props.isPointListButtonPulsing && !props.isPointListPanelOpen ? 'animate-pulse-pink-cta' : ''}`}
                                            title="Point List Panel"
                                        >
                                            <ListBulletIcon className="w-6 h-6"/>
                                        </button>
                                    )}
                                    {props.onOpenBoundaryEditor && (boundaryFiles?.length ?? 0) > 0 && (
                                        <button
                                            onClick={props.onOpenBoundaryEditor}
                                            className={`p-3 rounded-lg transition-colors ${props.isBoundaryEditorOpen ? 'bg-amber-600 hover:bg-amber-700' : 'hover:bg-gray-700'} ${props.isBoundaryEditorButtonPulsing && !props.isBoundaryEditorOpen ? 'animate-pulse-pink-cta' : ''}`}
                                            title={props.isBoundaryEditorOpen ? 'Close Boundary Editor' : 'Open Boundary Editor'}
                                            aria-label={props.isBoundaryEditorOpen ? 'Close Boundary Editor' : 'Open Boundary Editor'}
                                        >
                                            <BoundaryEditorGlyph />
                                        </button>
                                    )}
                                    {props.onOpenShrinkwrap && (
                                        <button
                                            onClick={props.onOpenShrinkwrap}
                                            className={`p-3 rounded-lg transition-colors ${props.isShrinkwrapOpen ? 'bg-violet-600 hover:bg-violet-700' : 'hover:bg-gray-700'}`}
                                            title="Shrinkwrap visible survey points"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M5 7.5 9 4l6 1 4 4-1 7-5 4-7-2-2-5z" strokeDasharray="3 2" />
                                                <circle cx="9" cy="9" r="1" fill="currentColor" />
                                                <circle cx="15" cy="14" r="1" fill="currentColor" />
                                            </svg>
                                        </button>
                                    )}
                                </div>

                                {/* Mobile: 2-row layout */}
                                <div className="md:hidden grid grid-cols-4 gap-1">
                                    {/* Row 1: Drag handle + Zoom + Attribute + Layers */}
                                    <div className="col-span-4 flex items-center gap-1">
                                        <div className="toolbar-drag-handle px-1 cursor-move flex items-center flex-shrink-0" title="Drag to move toolbar">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                            </div>
                                        </div>
                                        <button onClick={() => {
                                            setIsZoomExtentsOpen(p => !p);
                                            if (!isZoomExtentsOpen) {
                                                setIsAttributeFlyoutOpen(false);
                                                setIsZoomToPointOpen(false);
                                                setIsLayerPanelOpen(false);
                                                setIsDrawingToolsMenuOpen(false);
                                            }
                                        }} className={`p-2 rounded-lg flex-1 transition-colors ${isZoomExtentsOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Zoom"><ZoomExtentsIcon className="w-4 h-4 mx-auto"/></button>
                                        
                                        <button onClick={() => {
                                            setIsAttributeFlyoutOpen(p => !p);
                                            if (!isAttributeFlyoutOpen) {
                                                setIsZoomExtentsOpen(false);
                                                setIsZoomToPointOpen(false);
                                                setIsLayerPanelOpen(false);
                                                setIsDrawingToolsMenuOpen(false);
                                            }
                                        }} className={`p-2 rounded-lg flex-1 transition-colors ${isAttributeFlyoutOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Attribute"><AttributeScaleIcon className="w-4 h-4 mx-auto"/></button>
                                        <button onClick={() => {
                                            setIsLayerPanelOpen(p => !p);
                                            if (!isLayerPanelOpen) {
                                                setIsZoomExtentsOpen(false);
                                                setIsAttributeFlyoutOpen(false);
                                                setIsZoomToPointOpen(false);
                                                setIsDrawingToolsMenuOpen(false);
                                            }
                                        }} className={`p-2 rounded-lg flex-1 transition-colors ${isLayerPanelOpen ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Data Visibility"><LayersIcon className="w-4 h-4 mx-auto"/></button>
                                        <button
                                            onClick={() => setIsTinShadingEnabled(v => !v)}
                                            className={`p-2 rounded-lg flex-1 transition-colors ${isTinShadingEnabled ? 'bg-cyan-600' : 'hover:bg-gray-700'}`}
                                            title={isTinShadingEnabled ? 'TIN Shading: ON' : 'TIN Shading: OFF'}
                                        >
                                            <EyeIcon className="w-4 h-4 mx-auto"/>
                                        </button>
                                    </div>

                                    {/* Row 2: Drawing Tools + C3D (conditional) + Undo + Redo */}
                                    <button onClick={() => {
                                        setIsDrawingToolsMenuOpen(p => !p);
                                        if (!isDrawingToolsMenuOpen) {
                                            setIsZoomExtentsOpen(false);
                                            setIsAttributeFlyoutOpen(false);
                                            setIsZoomToPointOpen(false);
                                            setIsLayerPanelOpen(false);
                                        } else {
                                            setSelectedLineIds(new Set());
                                        }
                                    }} className={`p-2 rounded-lg flex items-center justify-center ${isDrawingToolsMenuOpen || drawingMode !== 'none' || isTrimmingLines || isExtendingLines || isDeletingLines ? 'bg-cyan-600' : 'hover:bg-gray-700'}`} title="Drawing Tools"><PencilSquareIcon className="w-4 h-4"/></button>
                                    {props.onOpenShrinkwrap && (
                                        <button
                                            onClick={props.onOpenShrinkwrap}
                                            className={`p-2 rounded-lg flex items-center justify-center ${props.isShrinkwrapOpen ? 'bg-violet-600' : 'hover:bg-gray-700'}`}
                                            title="Shrinkwrap visible survey points"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M5 7.5 9 4l6 1 4 4-1 7-5 4-7-2-2-5z" strokeDasharray="3 2" />
                                            </svg>
                                        </button>
                                    )}
                                    {props.onOpenBoundaryEditor && (boundaryFiles?.length ?? 0) > 0 && (
                                        <button
                                            onClick={props.onOpenBoundaryEditor}
                                            className={`p-2 rounded-lg flex items-center justify-center ${props.isBoundaryEditorOpen ? 'bg-amber-600' : 'hover:bg-gray-700'} ${props.isBoundaryEditorButtonPulsing && !props.isBoundaryEditorOpen ? 'animate-pulse-pink-cta' : ''}`}
                                            title={props.isBoundaryEditorOpen ? 'Close Boundary Editor' : 'Open Boundary Editor'}
                                            aria-label={props.isBoundaryEditorOpen ? 'Close Boundary Editor' : 'Open Boundary Editor'}
                                        >
                                            <BoundaryEditorGlyph className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Flyouts positioned below toolbar if needed */}
                            {!shouldFlyoutGoAbove && isAttributeFlyoutOpen && (
                                <div className="absolute top-full mt-2 left-0 p-4 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-64 animate-fade-in-up">
                                    <label htmlFor="attributeScale" className="block text-sm font-medium text-gray-400 mb-1">Point Attribute Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="attributeScale" min="0.5" max="5" step="0.1" value={attributeScale} onChange={(e) => setAttributeScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{attributeScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="lineLabelScale" className="block text-sm font-medium text-gray-400 mb-1">Bearing &amp; Distance Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="lineLabelScale" min="0.5" max="20" step="0.1" value={lineLabelScale} onChange={(e) => setLineLabelScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{lineLabelScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="dimensionScale_below" className="block text-sm font-medium text-gray-400 mb-1">Dimension Scale</label>
                                    <div className="flex items-center gap-4 mb-4">
                                        <input type="range" id="dimensionScale_below" min="0.5" max="5" step="0.1" value={dimensionScale} onChange={(e) => setDimensionScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{dimensionScale.toFixed(1)}x</span>
                                    </div>
                                    <label htmlFor="symbolScale_below" className="block text-sm font-medium text-gray-400 mb-1">Symbol Scale (global)</label>
                                    <div className="flex items-center gap-4">
                                        <input type="range" id="symbolScale_below" min="0.25" max="5" step="0.05" value={symbolScale} onChange={(e) => setSymbolScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                        <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{symbolScale.toFixed(2)}x</span>
                                    </div>
                                    {setAnnotationScale && (
                                        <>
                                            <label htmlFor="annotationScale_below" className="block text-sm font-medium text-gray-400 mb-1 mt-3">Annotation Scale (global)</label>
                                            <div className="flex items-center gap-4">
                                                <input type="range" id="annotationScale_below" min="0.25" max="5" step="0.05" value={annotationScale} onChange={(e) => setAnnotationScale(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                                                <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{annotationScale.toFixed(2)}x</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            
                            {!shouldFlyoutGoAbove && isZoomExtentsOpen && (
                                <div className="absolute top-full mt-2 left-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up">
                                    <div className="space-y-1">
                                        <button onClick={() => { zoomExtents(); setIsZoomExtentsOpen(false); }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Zoom Extents"><ZoomExtentsIcon className="w-5 h-5"/> Zoom Extents</button>
                                        <button onClick={() => {
                                            setIsZoomExtentsOpen(false);
                                            setIsZoomToPointOpen(true);
                                        }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Zoom to Point"><ZoomToPointIcon className="w-5 h-5"/> Zoom to Point</button>
                                        <button onClick={() => {
                                            setIsZoomExtentsOpen(false);
                                            setIsFindPointsOpen(true);
                                        }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-700" title="Find Points by Description"><ListBulletIcon className="w-5 h-5"/> Find Points</button>
                                    </div>
                                </div>
                            )}
                            
                            {!shouldFlyoutGoAbove && isZoomToPointOpen && (
                                <div className="absolute top-full mt-2 left-0 p-3 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-56 animate-fade-in-up">
                                    <form onSubmit={handleZoomToPointSubmit} className="flex items-center gap-2 mb-3">
                                        <input type="text" value={zoomToPointNumber} onChange={(e) => setZoomToPointNumber(e.target.value)} placeholder="Point Number" className="flex-1 p-1.5 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500" autoFocus />
                                        <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-700">Go</button>
                                    </form>
                                    {points.length > 0 && (
                                        <div className="max-h-48 overflow-y-auto pr-2">
                                            <h5 className="text-xs font-bold text-gray-400 uppercase mb-2">Points</h5>
                                            <div className="space-y-1">
                                                {points.map(point => (
                                                    <button key={point.pointNumber} onClick={() => { onZoomToPoint(point); setZoomToPointNumber(''); setIsZoomToPointOpen(false); }} className="w-full text-left p-1.5 rounded-md text-xs bg-gray-700 hover:bg-gray-600 transition-colors truncate">{point.pointNumber}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!shouldFlyoutGoAbove && isFindPointsOpen && (
                                <div className="absolute top-full mt-2 left-0 p-3 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg w-72 animate-fade-in-up">
                                    <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-bold text-gray-300 uppercase">Find Points</h5>
                                        <button onClick={() => { setIsFindPointsOpen(false); setFindPointsQuery(''); }} className="text-gray-400 hover:text-white" title="Close"><XMarkIcon className="w-4 h-4"/></button>
                                    </div>
                                    <input type="text" value={findPointsQuery} onChange={(e) => setFindPointsQuery(e.target.value)} placeholder='e.g. "show me sign points"' className="w-full p-1.5 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2" autoFocus />
                                    <div className="max-h-64 overflow-y-auto pr-1">
                                        {findPointsQuery.trim() === '' ? (
                                            <p className="text-xs text-gray-400 italic px-1">Type a description to filter the {points.length} loaded point{points.length !== 1 ? 's' : ''}.</p>
                                        ) : findPointsMatches.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic px-1">No matching points.</p>
                                        ) : (
                                            <>
                                                <p className="text-[10px] text-gray-500 uppercase mb-1 px-1">{findPointsMatches.length} match{findPointsMatches.length !== 1 ? 'es' : ''}{findPointsMatches.length >= 200 ? ' (capped)' : ''}</p>
                                                <div className="space-y-1">
                                                    {findPointsMatches.map(point => (
                                                        <button key={point.pointNumber} onClick={() => onZoomToPoint(point)} className="w-full text-left p-1.5 rounded-md text-xs bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2" title="Zoom to this point">
                                                            <span className="font-mono text-cyan-300 flex-shrink-0">{point.pointNumber}</span>
                                                            <span className="text-gray-300 truncate">{point.description || '(no description)'}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!shouldFlyoutGoAbove && isDrawingToolsMenuOpen && (
                                <div className="absolute top-full mt-2 right-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up">
                                    <div className="space-y-2">
                                        <button onClick={() => { 
                                            if (drawingMode === 'polylines') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('polylines');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'polylines' ? 'bg-yellow-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Polylines (L)"><PolylineIcon className="w-5 h-5"/> Draw Polylines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'circle') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('circle');
                                                setCircleCenter(null);
                                                setCircleSizeParam('radius');
                                                setTypedCircleValue('');
                                                setCircleSubMode('center-radius');
                                                setTtrStep(1);
                                                setTtrEntity1(null);
                                                setTtrEntity2(null);
                                                setTtrHoverEntity(null);
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'circle' ? 'bg-sky-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Circle (C: Center/Radius, T: Tangent-Tangent-Radius)"><CircleIcon className="w-5 h-5"/> Draw Circle (C / TTR)</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'breaklines') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('breaklines');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'breaklines' ? 'bg-pink-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Breaklines"><BreaklineIcon className="w-5 h-5"/> Draw Breaklines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'inclusion') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('inclusion');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'inclusion' ? 'bg-green-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Inclusion Lines (I)"><InclusionLineIcon className="w-5 h-5"/> Draw Inclusion Lines</button>
                                        
                                        <button onClick={() => { 
                                            if (drawingMode === 'exclusion') {
                                                finishDrawing();
                                            } else {
                                                setDrawingMode('exclusion');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'exclusion' ? 'bg-red-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Exclusion Lines"><ExclusionLineIcon className="w-5 h-5"/> Draw Exclusion Lines</button>

                                        <button onClick={() => {
                                            if (drawingMode === 'boundary-line') {
                                                setDrawingMode('none');
                                                resetBoundaryLineMode();
                                            } else {
                                                setDrawingMode('boundary-line');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                                resetBoundaryLineMode();
                                            }
                                            setIsDrawingToolsMenuOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'boundary-line' ? 'bg-amber-600 text-white' : 'hover:bg-gray-700'}`} title="Draw Boundary Line (click point, enter bearing + distance)">
                                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21l18-18M6 18l3-3M15 9l3-3"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>
                                            Draw Boundary Line
                                        </button>
                                        
                                        <div className="border-t border-gray-700"></div>
                                        
                                        <button onClick={() => {
                                            if (isTrimmingLines) {
                                                setIsTrimmingLines(false);
                                                setTrimPoint(null);
                                            } else {
                                                setIsTrimmingLines(true);
                                                setIsDeletingLines(false);
                                                setDrawingMode('none');
                                                setIsExtendingLines(false);
                                                setExtendFromLine(null);
                                            }
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${isTrimmingLines ? 'bg-orange-600 text-white' : 'hover:bg-gray-700'}`} title="Trim Lines"><ScissorsIcon className="w-5 h-5"/> Trim Lines</button>
                                        
                                        <button onClick={() => {
                                            if (isExtendingLines) {
                                                setIsExtendingLines(false);
                                                setExtendFromLine(null);
                                            } else {
                                                setIsExtendingLines(true);
                                                setIsDeletingLines(false);
                                                setDrawingMode('none');
                                                setIsTrimmingLines(false);
                                                setTrimPoint(null);
                                            }
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${isExtendingLines ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`} title="Extend Lines"><ExtendIcon className="w-5 h-5"/> Extend Lines</button>
                                        
                                        <button onClick={() => {
                                            if (isDeletingLines) {
                                                setIsDeletingLines(false);
                                            } else {
                                                setIsDeletingLines(true);
                                                setDrawingMode('none');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                            }
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${isDeletingLines ? 'bg-red-600 text-white' : 'hover:bg-gray-700'}`} title="Delete Lines"><XMarkIcon className="w-5 h-5"/> Delete Lines</button>

                                        {selectedLineIds.size > 0 && onConvertSelectionToBoundary && (
                                            <>
                                                <div className="border-t border-gray-700"></div>
                                                <button onClick={() => {
                                                    const selected = lines.filter(l => selectedLineIds.has(l.id || `${l.from}-${l.to}`));
                                                    onConvertSelectionToBoundary(selected);
                                                    setSelectedLineIds(new Set());
                                                    setIsDrawingToolsMenuOpen(false);
                                                }} className="w-full p-2 rounded-lg text-sm flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white" title="Convert selected lines to a Boundary object in the Boundary Editor">
                                                    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21l18-18M6 18l3-3M15 9l3-3"/><circle cx="3" cy="21" r="1.5" fill="currentColor"/><circle cx="21" cy="3" r="1.5" fill="currentColor"/></svg>
                                                    Convert to Boundary ({selectedLineIds.size})
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {!shouldFlyoutGoAbove && isDimFlyoutOpen && (
                                <div className="absolute top-full mt-2 right-0 p-2 bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/50 shadow-lg animate-fade-in-up w-52">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-gray-400 uppercase px-1">Dimensions</p>
                                        <button onClick={() => {
                                            if (drawingMode === 'aligned-dim') {
                                                setDrawingMode('none');
                                                resetDimMode();
                                            } else {
                                                setDrawingMode('aligned-dim');
                                                setIsTrimmingLines(false);
                                                setIsExtendingLines(false);
                                                setIsDeletingLines(false);
                                                setTrimPoint(null);
                                                setExtendFromLine(null);
                                                resetDimMode();
                                            }
                                            setIsDimFlyoutOpen(false);
                                        }} className={`w-full p-2 rounded-lg text-sm flex items-center gap-2 ${drawingMode === 'aligned-dim' ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'}`} title="Aligned Dimension (3-click: P1, P2, offset)">
                                            <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <line x1="4" y1="18" x2="20" y2="18"/>
                                                <line x1="4" y1="14" x2="4" y2="22"/>
                                                <line x1="20" y1="14" x2="20" y2="22"/>
                                                <line x1="4" y1="7" x2="20" y2="7" strokeDasharray="3 2"/>
                                                <path d="M7 18 L7 7M17 18 L17 7" strokeOpacity="0.4"/>
                                            </svg>
                                            Aligned Dimension
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>
            {/* Quick-access CAD Standards spreadsheet editor (full-screen modal) */}
            {isCadStandardsEditorOpen && cadStandard && (
                <StandardsEditor
                    standard={cadStandard}
                    onSave={(updated: StandardDefinition) => {
                        cadManager.dispatch({ type: 'SET_STANDARD', payload: updated });
                        setIsCadStandardsEditorOpen(false);
                    }}
                    onClose={() => setIsCadStandardsEditorOpen(false)}
                />
            )}
            {/* Symbol-exclusion hover tooltip */}
            {symbolExclusionMode && exclusionHover && (
                <div
                    className="pointer-events-none fixed z-[10000] max-w-xs px-3 py-2 rounded-md text-xs shadow-lg border bg-gray-900/95 border-gray-700 text-gray-100"
                    style={{ left: exclusionHover.clientX + 16, top: exclusionHover.clientY + 16 }}
                >
                    <div className="font-semibold text-cyan-300">{exclusionHover.description}</div>
                    {exclusionHover.symbolName && (
                        <div className="text-gray-300">Symbol: <span className="text-white">{exclusionHover.symbolName}</span></div>
                    )}
                    <div className="mt-1 text-gray-400">{exclusionHover.reason}</div>
                    <div className={`mt-1 font-medium ${exclusionHover.excluded ? 'text-red-400' : 'text-green-400'}`}>
                        {exclusionHover.excluded ? 'Currently excluded — click to restore' : 'Click to exclude this description'}
                    </div>
                </div>
            )}
        </div>
    );
});
