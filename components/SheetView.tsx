// SheetView.tsx — paperspace view + Sheet Set Manager (v26.05.17.35).
//
// Features:
//   • Sheet Set Manager: multiple named sheets in a single set, displayed as
//     a tab bar at the top. Add / rename / duplicate / delete / reorder.
//   • Each sheet owns its own size, orientation, viewports, and titleblock
//     field values. The titleblock *layout* (element design) is shared
//     across the whole set so a logo / template only needs to be built once.
//   • Per-sheet, per-viewport: scale, world-center, hidden-layer set, and
//     hide-points toggle.
//   • Contour rendering uses fromPt/toPt fallback for lines that lack point
//     numbers; line colors come from cadLayerColors + type defaults.
//   • Titleblock placeholders: {PROJECT_NAME}, {SHEET_NUMBER}, {DRAWN_BY},
//     {DATE}, {DATE_TODAY}, {NOTES}, {SHEET_SIZE}, {SCALE}, {PAGE_OF}.
//     {PAGE_OF} expands to e.g. "3 of 7" from the sheet set order.
//   • Persistence: the full sheet-set state is written to localStorage on
//     every change (keyed by project name) and restored on mount so settings
//     survive navigation away from the Sheet View tab.
//   • Export: current sheet to PDF, or the entire sheet set to a multi-page
//     PDF (one page per sheet, page size = that sheet's paper size).

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { SurveyPoint, SurveyLine, ProfilePoint, ProfileInfo } from '../types.ts';
import jsPDF from 'jspdf';
import { parseDxfForSymbol } from '../utils/dxfParser.ts';
import proj4 from 'proj4';
import { useAppState, useErrorReporter } from '../contexts/AppStateContext';
import { useCanvasState } from '../contexts/CanvasStateContext';
import { getStaticMap, clearStaticMapsCache } from '../services/staticMapsService';
import { WebGpuBasemap } from '../utils/webgpuBasemap';
import { clearMapCache, decodeImageCached } from '../utils/mapTileCache';
import {
    TitleblockEditor,
    TitleblockRenderer,
    titleblockToSvgMarkup,
    DEFAULT_TITLEBLOCK_LAYOUT,
    createDefaultVerticalTitleblockLayout,
    type TitleblockLayout,
    type TitleblockContext,
    type TitleblockImageElement,
} from './TitleblockEditor.tsx';

// ---------------------------------------------------------------------------
// Sheet sizing
// ---------------------------------------------------------------------------

type SheetUnit = 'in' | 'mm';

interface SheetSize {
    id: string;
    label: string;
    widthIn: number;
    heightIn: number;
    unit: SheetUnit;
}

const SHEET_PRESETS: SheetSize[] = [
    { id: 'ansi-a', label: 'ANSI A (8.5 × 11)', widthIn: 11, heightIn: 8.5, unit: 'in' },
    { id: 'ansi-b', label: 'ANSI B (11 × 17)', widthIn: 17, heightIn: 11, unit: 'in' },
    { id: 'ansi-c', label: 'ANSI C (17 × 22)', widthIn: 22, heightIn: 17, unit: 'in' },
    { id: 'ansi-d', label: 'ANSI D (22 × 34)', widthIn: 34, heightIn: 22, unit: 'in' },
    { id: 'ansi-e', label: 'ANSI E (34 × 44)', widthIn: 44, heightIn: 34, unit: 'in' },
    { id: 'arch-d', label: 'ARCH D (24 × 36)', widthIn: 36, heightIn: 24, unit: 'in' },
    { id: 'arch-e', label: 'ARCH E (36 × 48)', widthIn: 48, heightIn: 36, unit: 'in' },
    { id: 'iso-a4', label: 'ISO A4 (210 × 297 mm)', widthIn: 297 / 25.4, heightIn: 210 / 25.4, unit: 'mm' },
    { id: 'iso-a3', label: 'ISO A3 (297 × 420 mm)', widthIn: 420 / 25.4, heightIn: 297 / 25.4, unit: 'mm' },
    { id: 'iso-a1', label: 'ISO A1 (594 × 841 mm)', widthIn: 841 / 25.4, heightIn: 594 / 25.4, unit: 'mm' },
    { id: 'custom', label: 'Custom', widthIn: 24, heightIn: 18, unit: 'in' },
];

const ENGINEER_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 200, 400, 500, 1000, 2000];

/**
 * Given a viewport size (in inches) and data extents (in survey feet), return
 * the smallest ENGINEER_SCALES value that fits the data with a 12% margin.
 */
function computeGoodScale(
    wIn: number,
    hIn: number,
    extents: { minE: number; maxE: number; minN: number; maxN: number } | null,
    padding = 0.12
): number {
    if (!extents) return 100;
    const dataW = extents.maxE - extents.minE;
    const dataH = extents.maxN - extents.minN;
    if (dataW + dataH < 0.001) return 100;
    const required = Math.max(
        dataW > 0 ? (dataW / wIn) * (1 + padding) : 0,
        dataH > 0 ? (dataH / hIn) * (1 + padding) : 0,
    );
    return ENGINEER_SCALES.find(s => s >= required) ?? ENGINEER_SCALES[ENGINEER_SCALES.length - 1];
}

// ---------------------------------------------------------------------------
// Entity clustering (points and/or lines) for viewport zoom
// ---------------------------------------------------------------------------

export interface EntityCluster {
    id: number;
    name: string;
    points: SurveyPoint[];
    lines: SurveyLine[];
    extents: { minE: number; maxE: number; minN: number; maxN: number };
    pointCount: number;
    lineCount: number;
    totalCount: number;
}

export function detectClusters(points: SurveyPoint[], lines: SurveyLine[]): EntityCluster[] {
    const ptMap = new Map<string, SurveyPoint>();
    for (const p of points) ptMap.set(p.pointNumber, p);

    interface Node {
        type: 'point' | 'line';
        point?: SurveyPoint;
        line?: SurveyLine;
        minE: number; maxE: number;
        minN: number; maxN: number;
        cx: number; cy: number;
    }

    const nodes: Node[] = [];

    for (const p of points) {
        nodes.push({
            type: 'point',
            point: p,
            minE: p.easting, maxE: p.easting,
            minN: p.northing, maxN: p.northing,
            cx: p.easting, cy: p.northing,
        });
    }

    for (const l of lines) {
        let p1x: number | undefined, p1y: number | undefined;
        let p2x: number | undefined, p2y: number | undefined;
        if (l.fromPt && l.toPt) {
            p1x = l.fromPt.x; p1y = l.fromPt.y;
            p2x = l.toPt.x;   p2y = l.toPt.y;
        } else {
            const p1 = ptMap.get(l.from);
            const p2 = ptMap.get(l.to);
            if (p1 && p2) {
                p1x = p1.easting; p1y = p1.northing;
                p2x = p2.easting; p2y = p2.northing;
            }
        }
        if (p1x !== undefined && p1y !== undefined && p2x !== undefined && p2y !== undefined) {
            const minE = Math.min(p1x, p2x);
            const maxE = Math.max(p1x, p2x);
            const minN = Math.min(p1y, p2y);
            const maxN = Math.max(p1y, p2y);
            nodes.push({
                type: 'line',
                line: l,
                minE, maxE,
                minN, maxN,
                cx: (minE + maxE) / 2,
                cy: (minN + maxN) / 2,
            });
        }
    }

    if (nodes.length === 0) return [];

    // Distance threshold: separation in thousands / ten-thousands of feet.
    // Front and rear of a 10-acre parcel (up to ~2,500 ft diagonal) are safely grouped together;
    // only offsite controls or distant blunders miles away form separate clusters.
    const CLUSTER_THRESHOLD_FT = 4500;

    const parent = new Array(nodes.length).fill(0).map((_, i) => i);
    const find = (i: number): number => {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (i: number, j: number) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    // 1. Line endpoint connectivity (endpoints connected by a line are in the same cluster)
    const ptIndexByPn = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'point' && nodes[i].point) {
            ptIndexByPn.set(nodes[i].point!.pointNumber, i);
        }
    }

    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'line' && nodes[i].line) {
            const l = nodes[i].line!;
            if (l.from && ptIndexByPn.has(l.from)) union(i, ptIndexByPn.get(l.from)!);
            if (l.to && ptIndexByPn.has(l.to)) union(i, ptIndexByPn.get(l.to)!);
        }
    }

    // 2. Spatial proximity linking between entities within CLUSTER_THRESHOLD_FT
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            if (find(i) === find(j)) continue;
            const ni = nodes[i];
            const nj = nodes[j];
            const dE = Math.max(0, Math.max(ni.minE, nj.minE) - Math.min(ni.maxE, nj.maxE));
            const dN = Math.max(0, Math.max(ni.minN, nj.minN) - Math.min(ni.maxN, nj.maxN));
            if (Math.hypot(dE, dN) <= CLUSTER_THRESHOLD_FT) {
                union(i, j);
            }
        }
    }

    // 3. Assemble clusters
    const clusterMap = new Map<number, Node[]>();
    for (let i = 0; i < nodes.length; i++) {
        const root = find(i);
        if (!clusterMap.has(root)) clusterMap.set(root, []);
        clusterMap.get(root)!.push(nodes[i]);
    }

    const clusters: EntityCluster[] = [];

    for (const group of clusterMap.values()) {
        const groupPts: SurveyPoint[] = [];
        const groupLines: SurveyLine[] = [];
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;

        for (const n of group) {
            if (n.type === 'point' && n.point) groupPts.push(n.point);
            if (n.type === 'line' && n.line) groupLines.push(n.line);
            minE = Math.min(minE, n.minE);
            maxE = Math.max(maxE, n.maxE);
            minN = Math.min(minN, n.minN);
            maxN = Math.max(maxN, n.maxN);
        }

        const pointCount = groupPts.length;
        const lineCount = groupLines.length;
        const totalCount = pointCount + lineCount;

        clusters.push({
            id: 0,
            name: '',
            points: groupPts,
            lines: groupLines,
            extents: { minE, maxE, minN, maxN },
            pointCount,
            lineCount,
            totalCount,
        });
    }

    // Sort by totalCount descending: clusters[0] is the LARGEST cluster!
    clusters.sort((a, b) => b.totalCount - a.totalCount);
    clusters.forEach((c, idx) => {
        c.id = idx + 1;
        const ptsText = `${c.pointCount} pt${c.pointCount === 1 ? '' : 's'}`;
        const linesText = c.lineCount > 0 ? `, ${c.lineCount} line${c.lineCount === 1 ? '' : 's'}` : '';
        c.name = `Cluster ${idx + 1} (${ptsText}${linesText})`;
    });

    return clusters;
}

// ---------------------------------------------------------------------------
// Layer / styling helpers
// ---------------------------------------------------------------------------

const typePseudoLayer = (t?: string): string | null => (t ? `*${t.toUpperCase()}` : null);
const lineLayerKey = (l: SurveyLine): string => l.layer || typePseudoLayer(l.type) || '*DEFAULT';
const pointLayerKey = (p: SurveyPoint): string => p.layer || '*POINTS';

const typeDefaultColor: Record<string, string> = {
    'contour-major': '#b45309',
    'contour-minor': '#d97706',
    'breakline':     '#eab308',
    'inclusion':     '#10b981',
    'exclusion':     '#ef4444',
    'parcel':        '#0ea5e9',
    'flood':         '#06b6d4',
};
const typeDefaultWidth: Record<string, number> = {
    'contour-major': 1.0,
    'contour-minor': 0.4,
    'breakline':     0.9,
    'parcel':        0.9,
    'flood':         0.8,
};

const pickLineColor = (l: SurveyLine, cadLayerColors: Record<string, string>): string => {
    const t = l.type || '';
    if (typeDefaultColor[t] && !l.layer) return typeDefaultColor[t];
    if (l.layer && cadLayerColors[l.layer]) return cadLayerColors[l.layer];
    if (typeDefaultColor[t]) return typeDefaultColor[t];
    return '#111111';
};
const pickLineWidth = (l: SurveyLine, scale: number): number => {
    const t = l.type || '';
    return (typeDefaultWidth[t] ?? 0.5) * scale;
};
const pickPointColor = (p: SurveyPoint, cadLayerColors: Record<string, string>): string => {
    if (p.layer && cadLayerColors[p.layer]) return cadLayerColors[p.layer];
    return '#b91c1c';
};

// ---------------------------------------------------------------------------
// Sheet set data model
// ---------------------------------------------------------------------------

/** Horizontal scale choices for profile viewports (ft per inch). */
const PROFILE_H_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 200, 400];
/** Vertical exaggeration options for profile viewports. */
const PROFILE_V_EXAG  = [1, 2, 5, 10, 20];

/** Per-viewport graphic style settings (applies to both plan and profile). */
export interface ViewportStyle {
    lineWeightPt:   number;   // base line weight in pt (0.25 – 3)
    textSizePt:     number;   // annotation text height in pt
    gridLineColor:  string;
    gridOpacity:    number;   // 0–1
    showScaleBar:   boolean;
    showNorthArrow: boolean;  // plan viewports only
}

const DEFAULT_VP_STYLE: ViewportStyle = {
    lineWeightPt:   0.5,
    textSizePt:     6,
    gridLineColor:  '#c8c8c8',
    gridOpacity:    0.4,
    showScaleBar:   true,
    showNorthArrow: true,
};

export type ScaleBarStyle = 'subdivided-blocks' | 'classic-ticks' | 'dual-bar' | 'minimal-modern';

export interface SheetScaleBar {
    enabled: boolean;
    viewportId: string;
    xIn: number;
    yIn: number;
    widthIn: number;
    heightIn: number;
    style: ScaleBarStyle;
    divisions: number;
    subdivisions: number;
    unitLabel: string;
    showNumericScale: boolean;
    color: string;
}

export function makeDefaultScaleBar(vpId = ''): SheetScaleBar {
    return {
        enabled: true,
        viewportId: vpId,
        xIn: 1.25,
        yIn: ARCH_D_HEIGHT - 2.5,
        widthIn: 3.0,
        heightIn: 0.6,
        style: 'subdivided-blocks',
        divisions: 3,
        subdivisions: 2,
        unitLabel: 'FEET',
        showNumericScale: true,
        color: '#111827',
    };
}

interface Viewport {
    id: string;
    xIn: number; yIn: number; wIn: number; hIn: number;
    /** 'plan' = normal survey plan view; 'profile' = vertical profile chart. */
    type: 'plan' | 'profile';
    centerE: number | null;
    centerN: number | null;
    scaleFt: number;
    showGrid: boolean;
    hiddenLayers: string[];
    hidePoints: boolean;
    style: ViewportStyle;
    /** Profile-viewport specifics (only meaningful when type === 'profile'). */
    profileId:      string | null;  // reserved for future named-profile lookup
    profileHScaleFt: number;        // horizontal ft per inch
    profileVExag:    number;        // vertical exaggeration
    showBasemap?:    boolean;
    basemapType?:    'satellite' | 'topo' | 'roadmap';
    basemapOpacity?: number;
    lockPosition?:             boolean;
    lockZoom?:                 boolean;
    rotationDeg?:              number;
    lockRotationToModelSpace?: boolean;
    lockRotation?:             boolean;
}

interface TitleblockFields {
    projectName: string;
    sheetNumber: string;
    drawnBy: string;
    date: string;
    notes: string;
}

interface Sheet {
    id: string;
    /** User-visible name in the sheet manager tabs. */
    name: string;
    sheetId: string;     // preset id, or 'custom'
    customW: number;
    customH: number;
    landscape: boolean;
    viewports: Viewport[];
    tbFields: TitleblockFields;
    scaleBar?: SheetScaleBar;
}

interface SheetSet {
    /** Shared titleblock layout used by every sheet in the set. */
    tbLayout: TitleblockLayout;
    sheets: Sheet[];
    activeSheetId: string;
}

const SCHEMA_VERSION = 1;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

// Default ARCH D: 36x24 in (landscape)
const ARCH_D_WIDTH = 36;
const ARCH_D_HEIGHT = 24;
const makeDefaultViewport = (): Viewport => {
    // Fill sheet leaving room for left margin (0.75 in) and right vertical titleblock (2.75 in + margins)
    const xIn = 0.75;
    const yIn = 0.5;
    const wIn = ARCH_D_WIDTH - 0.75 - 2.75 - 0.5 - 0.5; // ~31.5 in wide drawing area
    const hIn = ARCH_D_HEIGHT - 1.0;                     // ~23.0 in high
    return {
        id: newId('vp'),
        xIn,
        yIn,
        wIn,
        hIn,
        type: 'plan',
        centerE: null, centerN: null,
        scaleFt: 100,
        showGrid: false,
        hiddenLayers: [],
        hidePoints: false,
        style: { ...DEFAULT_VP_STYLE },
        profileId: null,
        profileHScaleFt: 50,
        profileVExag: 2,
        showBasemap: false,
        basemapType: 'satellite',
        basemapOpacity: 0.8,
        lockPosition: false,
        lockZoom: false,
        rotationDeg: 0,
        lockRotationToModelSpace: false,
        lockRotation: false,
    };
};

const makeDefaultSheet = (name: string, sheetNumber: string, projectName: string): Sheet => ({
    id: newId('sh'),
    name,
    sheetId: 'arch-d', // ARCH D (36x24)
    customW: ARCH_D_WIDTH,
    customH: ARCH_D_HEIGHT,
    landscape: true,
    viewports: [makeDefaultViewport()],
    tbFields: {
        projectName,
        sheetNumber,
        drawnBy: '',
        date: new Date().toLocaleDateString(),
        notes: '',
    },
    scaleBar: makeDefaultScaleBar(),
});

const makeDefaultSet = (projectName: string): SheetSet => {
    const first = makeDefaultSheet('Sheet 1', 'C-001', projectName);
    return { tbLayout: createDefaultVerticalTitleblockLayout(23.0), sheets: [first], activeSheetId: first.id };
};

// ---------------------------------------------------------------------------
// Persistence (per project name, in localStorage)
// ---------------------------------------------------------------------------

const storageKeyFor = (projectName?: string) =>
    `landsurv.sheetset.v${SCHEMA_VERSION}.${(projectName || '__default__').toLowerCase()}`;

/** Migrate a persisted Viewport to the current schema — fills in any fields added after
 *  the initial schema so old localStorage data doesn't crash newer code paths. */
const migrateViewport = (v: Record<string, unknown>): Viewport => ({
    ...makeDefaultViewport(),
    ...(v as Partial<Viewport>),
    // Guarantee the style sub-object always exists and has all required keys
    style: { ...DEFAULT_VP_STYLE, ...((v.style as Partial<ViewportStyle>) ?? {}) },
    type: (v.type as 'plan' | 'profile') ?? 'plan',
    profileId: (v.profileId as string | null) ?? null,
    profileHScaleFt: typeof v.profileHScaleFt === 'number' ? v.profileHScaleFt : 50,
    profileVExag:    typeof v.profileVExag    === 'number' ? v.profileVExag    : 2,
    showBasemap:     Boolean(v.showBasemap),
    basemapType:     (v.basemapType as any) || 'satellite',
    basemapOpacity:  typeof v.basemapOpacity === 'number' ? v.basemapOpacity : 0.8,
    lockPosition:             Boolean(v.lockPosition),
    lockZoom:                 Boolean(v.lockZoom),
    rotationDeg:              typeof v.rotationDeg === 'number' ? v.rotationDeg : 0,
    lockRotationToModelSpace: Boolean(v.lockRotationToModelSpace),
    lockRotation:             Boolean(v.lockRotation),
});

const loadSet = (projectName?: string): SheetSet | null => {
    try {
        const raw = localStorage.getItem(storageKeyFor(projectName));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
            // Migrate all viewports in every sheet so old data never crashes new code
            parsed.sheets = (parsed.sheets as Record<string, unknown>[]).map((sh: Record<string, unknown>) => {
                const viewports = Array.isArray(sh.viewports)
                    ? (sh.viewports as Record<string, unknown>[]).map(migrateViewport)
                    : [makeDefaultViewport()];
                return {
                    ...sh,
                    viewports,
                    scaleBar: (sh.scaleBar as SheetScaleBar) ?? makeDefaultScaleBar(viewports[0]?.id ?? ''),
                };
            });
            // Upgrade to clean industry-standard vertical title block on 24x36 / 11x17+ sets
            if (parsed.sheets.some((s: any) => s.sheetId === 'arch-d' || s.customW >= 17)) {
                const hasRotated = parsed.tbLayout?.elements?.some((el: any) => el.rotation === -90);
                if (!hasRotated) {
                    parsed.tbLayout = createDefaultVerticalTitleblockLayout(23.0);
                }
            }
            if (parsed.tbLayout?.elements) {
                parsed.tbLayout.elements = parsed.tbLayout.elements.map((el: any) => {
                    if (el.text && typeof el.text === 'string' && el.text.includes('LANDSURV.AI')) {
                        return { ...el, text: el.text.replace(/LANDSURV\.AI/g, '[FIRM NAME]') };
                    }
                    return el;
                });
            }
            return parsed as SheetSet;
        }
    } catch { /* ignore */ }
    return null;
};

const saveSet = (projectName: string | undefined, set: SheetSet) => {
    try {
        localStorage.setItem(storageKeyFor(projectName), JSON.stringify(set));
    } catch { /* quota / disabled — silently ignore */ }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SheetViewProps {
    points: SurveyPoint[];
    lines: SurveyLine[];
    projectName?: string;
    cadLayerColors?: Record<string, string>;
    /** Profile data from the Profile Agent — enables profile viewport type. */
    profileData?:  ProfilePoint[];
    profileInfo?:  ProfileInfo | null;
    /**
     * CACP command bus — Sheet View registers itself here so the Civil Drafter
     * and Auto Draft orchestrator can push viewports/styles programmatically.
     * Signature: onSheetViewCommand(cmd, payload) → void
     */
    onSheetViewCommand?: (cmd: 'add_plan_viewport' | 'add_profile_viewport' | 'set_sheet_style', payload: Record<string, unknown>) => void;
}


function renderScaleBarSvg(
    sb: SheetScaleBar,
    vp: Viewport | undefined,
    scalePpi: number,
    isPdf = false
): string {
    const scaleFt = vp?.type === 'profile' ? (vp.profileHScaleFt ?? 50) : (vp?.scaleFt ?? 50);
    const totalWpx = sb.widthIn * scalePpi;
    const totalHpx = (sb.heightIn || 0.6) * scalePpi;
    const totalFeet = sb.widthIn * scaleFt;
    const divs = Math.max(1, sb.divisions || 3);
    const divWpx = totalWpx / divs;
    const feetPerDiv = totalFeet / divs;
    const color = sb.color || '#111827';
    const barH = Math.max(4, Math.round(7 * (scalePpi / 72)));
    const fontSz = Math.max(6, Math.min(11, Math.round(8 * (scalePpi / 72))));
    const titleFontSz = Math.max(7, Math.min(12, Math.round(9 * (scalePpi / 72))));

    const parts: string[] = [];

    if (sb.style === 'subdivided-blocks') {
        const topY = fontSz + 5;
        for (let i = 0; i < divs; i++) {
            const x = i * divWpx;
            const fill = i % 2 === 0 ? color : '#ffffff';
            parts.push(`<rect x="${x.toFixed(1)}" y="${topY.toFixed(1)}" width="${divWpx.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" stroke="${color}" stroke-width="0.8" />`);
            const ftVal = Math.round(i * feetPerDiv);
            parts.push(`<text x="${x.toFixed(1)}" y="${(topY - 3).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="600" fill="${color}">${ftVal}</text>`);
            parts.push(`<line x1="${x.toFixed(1)}" y1="${(topY - 2).toFixed(1)}" x2="${x.toFixed(1)}" y2="${topY.toFixed(1)}" stroke="${color}" stroke-width="0.8" />`);
        }
        const endX = totalWpx;
        parts.push(`<text x="${endX.toFixed(1)}" y="${(topY - 3).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="600" fill="${color}">${Math.round(totalFeet)} ${sb.unitLabel || 'FEET'}</text>`);
        parts.push(`<line x1="${endX.toFixed(1)}" y1="${(topY - 2).toFixed(1)}" x2="${endX.toFixed(1)}" y2="${topY.toFixed(1)}" stroke="${color}" stroke-width="0.8" />`);

        let subY = topY + barH + fontSz + 3;
        parts.push(`<text x="${(totalWpx / 2).toFixed(1)}" y="${subY.toFixed(1)}" text-anchor="middle" font-size="${titleFontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="bold" letter-spacing="0.5" fill="${color}">GRAPHIC SCALE</text>`);
        if (sb.showNumericScale) {
            subY += fontSz + 2;
            parts.push(`<text x="${(totalWpx / 2).toFixed(1)}" y="${subY.toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" fill="${color}">1" = ${scaleFt}'</text>`);
        }
    } else if (sb.style === 'classic-ticks') {
        const lineY = fontSz + 7;
        parts.push(`<line x1="0" y1="${lineY.toFixed(1)}" x2="${totalWpx.toFixed(1)}" y2="${lineY.toFixed(1)}" stroke="${color}" stroke-width="1.5" />`);
        for (let i = 0; i <= divs; i++) {
            const x = i * divWpx;
            const ftVal = Math.round(i * feetPerDiv);
            parts.push(`<line x1="${x.toFixed(1)}" y1="${(lineY - 6).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(lineY + 6).toFixed(1)}" stroke="${color}" stroke-width="1.2" />`);
            parts.push(`<text x="${x.toFixed(1)}" y="${(lineY - 8).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="600" fill="${color}">${ftVal}${i === divs ? ' ' + (sb.unitLabel || 'FT') : ''}</text>`);
        }
        let subY = lineY + fontSz + 8;
        parts.push(`<text x="${(totalWpx / 2).toFixed(1)}" y="${subY.toFixed(1)}" text-anchor="middle" font-size="${titleFontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="bold" fill="${color}">SCALE: 1" = ${scaleFt}'</text>`);
    } else if (sb.style === 'dual-bar') {
        const topY = fontSz + 4;
        const totalMeters = Math.round(totalFeet * 0.3048);
        parts.push(`<rect x="0" y="${topY.toFixed(1)}" width="${totalWpx.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" stroke="${color}" stroke-width="0.8" />`);
        for (let i = 0; i <= divs; i++) {
            const x = i * divWpx;
            const ftVal = Math.round(i * feetPerDiv);
            parts.push(`<text x="${x.toFixed(1)}" y="${(topY - 3).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="600" fill="${color}">${ftVal}${i === divs ? ' FT' : ''}</text>`);
        }
        const btmY = topY + barH + 8;
        parts.push(`<line x1="0" y1="${btmY.toFixed(1)}" x2="${totalWpx.toFixed(1)}" y2="${btmY.toFixed(1)}" stroke="${color}" stroke-width="1.2" />`);
        parts.push(`<text x="0" y="${(btmY + fontSz + 2).toFixed(1)}" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" fill="${color}">0</text>`);
        parts.push(`<text x="${totalWpx.toFixed(1)}" y="${(btmY + fontSz + 2).toFixed(1)}" text-anchor="end" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" fill="${color}">${totalMeters} M</text>`);
        if (sb.showNumericScale) {
            parts.push(`<text x="${(totalWpx / 2).toFixed(1)}" y="${(btmY + fontSz + 2).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="Arial, sans-serif" font-weight="bold" fill="${color}">1" = ${scaleFt}'</text>`);
        }
    } else {
        const lineY = fontSz + 6;
        parts.push(`<line x1="0" y1="${lineY.toFixed(1)}" x2="${totalWpx.toFixed(1)}" y2="${lineY.toFixed(1)}" stroke="${color}" stroke-width="2" />`);
        parts.push(`<circle cx="0" cy="${lineY.toFixed(1)}" r="2.5" fill="${color}" />`);
        parts.push(`<circle cx="${totalWpx.toFixed(1)}" cy="${lineY.toFixed(1)}" r="2.5" fill="${color}" />`);
        parts.push(`<text x="0" y="${(lineY - 6).toFixed(1)}" text-anchor="start" font-size="${fontSz.toFixed(1)}" font-family="monospace" font-weight="bold" fill="${color}">0</text>`);
        parts.push(`<text x="${totalWpx.toFixed(1)}" y="${(lineY - 6).toFixed(1)}" text-anchor="end" font-size="${fontSz.toFixed(1)}" font-family="monospace" font-weight="bold" fill="${color}">${Math.round(totalFeet)} ${sb.unitLabel || 'FT'}</text>`);
        parts.push(`<text x="${(totalWpx / 2).toFixed(1)}" y="${(lineY + fontSz + 4).toFixed(1)}" text-anchor="middle" font-size="${fontSz.toFixed(1)}" font-family="sans-serif" font-weight="bold" fill="${color}">1" = ${scaleFt}'</text>`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalWpx.toFixed(1)} ${totalHpx.toFixed(1)}" style="display:block;overflow:visible;">${parts.join('')}</svg>`;
}


interface ViewportBasemapCanvasProps {
    vp: Viewport;
    ppi: number;
    imageDataUrl: string | null;
    opacity: number;
    worldMinE: number;
    worldMaxN: number;
    worldFtPerInch: number;
    rotationDeg?: number;
}

const ViewportBasemapCanvas: React.FC<ViewportBasemapCanvasProps> = React.memo(({
    vp,
    ppi,
    imageDataUrl,
    opacity,
    worldMinE,
    worldMaxN,
    worldFtPerInch,
    rotationDeg = 0,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gpuRef = useRef<WebGpuBasemap | null>(null);
    const [use2D, setUse2D] = useState(!WebGpuBasemap.isSupported());

    const wpx = Math.round(vp.wIn * ppi);
    const hpx = Math.round(vp.hIn * ppi);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || use2D || !WebGpuBasemap.isSupported()) return;
        let active = true;
        WebGpuBasemap.create(canvas, () => {
            if (active) setUse2D(true);
        }).then(renderer => {
            if (active && renderer) {
                gpuRef.current = renderer;
            } else if (active && !renderer) {
                setUse2D(true);
            }
        });
        return () => {
            active = false;
        };
    }, [use2D]);

    useEffect(() => {
        if (!imageDataUrl) return;
        let cancelled = false;

        decodeImageCached(imageDataUrl).then(img => {
            if (cancelled || !canvasRef.current) return;
            const canvas = canvasRef.current;

            const halfW = (vp.wIn / 2) * worldFtPerInch;
            const halfH = (vp.hIn / 2) * worldFtPerInch;
            const cx = vp.centerE ?? 0;
            const cy = vp.centerN ?? 0;
            const minE = cx - halfW;
            const maxE = cx + halfW;
            const minN = cy - halfH;
            const maxN = cy + halfH;

            if (gpuRef.current && gpuRef.current.ready && !use2D) {
                try {
                    const view = {
                        width: wpx,
                        height: hpx,
                        project: (e: number, n: number) => ({
                            x: ((e - worldMinE) / worldFtPerInch) * ppi,
                            y: ((worldMaxN - n) / worldFtPerInch) * ppi,
                        }),
                    };
                    gpuRef.current.render(
                        [{ source: img, bbox: [minE, minN, maxE, maxN], opacity }],
                        view
                    );
                    return;
                } catch {
                    setUse2D(true);
                }
            }

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, wpx, hpx);
                ctx.globalAlpha = opacity;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, wpx, hpx);
            }
        }).catch(err => {
            console.warn('Basemap image decode error:', err);
        });

        return () => {
            cancelled = true;
        };
    }, [imageDataUrl, opacity, wpx, hpx, vp, worldMinE, worldMaxN, worldFtPerInch, ppi, use2D]);

    return (
        <canvas
            ref={canvasRef}
            width={wpx}
            height={hpx}
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                display: imageDataUrl ? 'block' : 'none',
                zIndex: 0,
                transform: rotationDeg !== 0 ? `rotate(${rotationDeg}deg)` : undefined,
                transformOrigin: 'center center',
            }}
        />
    );
});

const SheetView: React.FC<SheetViewProps> = ({ points, lines, projectName, cadLayerColors, profileData, profileInfo, onSheetViewCommand }) => {
    const layerColors = cadLayerColors ?? {};
    const { reportError } = useErrorReporter();
    const { settings } = useAppState();
    const { orientationTuple } = useCanvasState();

    const msAngleRad = orientationTuple?.viewAngle ?? (orientationTuple?.mode === 'view' ? (orientationTuple?.angle ?? 0) : 0);
    const msAngleDeg = Math.round(((msAngleRad * 180) / Math.PI) * 10) / 10;

    const getEffectiveVpRotation = useCallback((v: Viewport) => {
        return v.lockRotationToModelSpace ? msAngleDeg : (v.rotationDeg ?? 0);
    }, [msAngleDeg]);

    // ── Sheet-set state ───────────────────────────────────────────────────
    const [set, setSet] = useState<SheetSet>(() => loadSet(projectName) ?? makeDefaultSet(projectName ?? 'Untitled Project'));

    // Persist on every change.
    useEffect(() => { saveSet(projectName, set); }, [projectName, set]);

    const activeSheet = set.sheets.find(s => s.id === set.activeSheetId) ?? set.sheets[0];
    const activeIndex = set.sheets.findIndex(s => s.id === activeSheet.id);
    const totalSheets = set.sheets.length;

    // ── Sheet-set mutators ────────────────────────────────────────────────
    const updateSet = useCallback((patch: Partial<SheetSet>) => {
        setSet(prev => ({ ...prev, ...patch }));
    }, []);
    const updateActiveSheet = useCallback((patch: Partial<Sheet> | ((s: Sheet) => Partial<Sheet>)) => {
        setSet(prev => ({
            ...prev,
            sheets: prev.sheets.map(s => {
                if (s.id !== prev.activeSheetId) return s;
                const p = typeof patch === 'function' ? patch(s) : patch;
                return { ...s, ...p };
            }),
        }));
    }, []);

    const addSheet = () => {
        const nextNum = (set.sheets.length + 1).toString().padStart(3, '0');
        const s = makeDefaultSheet(`Sheet ${set.sheets.length + 1}`, `C-${nextNum}`, projectName ?? 'Untitled Project');
        // Copy non-page-specific titleblock fields from the active sheet so
        // project name / drawn by / date carry over without retyping.
        s.tbFields = {
            ...s.tbFields,
            projectName: activeSheet.tbFields.projectName,
            drawnBy:     activeSheet.tbFields.drawnBy,
            date:        activeSheet.tbFields.date,
            notes:       activeSheet.tbFields.notes,
        };
        setSet(prev => ({ ...prev, sheets: [...prev.sheets, s], activeSheetId: s.id }));
    };
    const duplicateSheet = (id: string) => {
        const src = set.sheets.find(s => s.id === id); if (!src) return;
        const copy: Sheet = JSON.parse(JSON.stringify(src));
        copy.id = newId('sh');
        copy.name = `${src.name} (copy)`;
        copy.viewports = copy.viewports.map(v => ({ ...v, id: newId('vp') }));
        setSet(prev => ({ ...prev, sheets: [...prev.sheets, copy], activeSheetId: copy.id }));
    };
    const deleteSheet = (id: string) => {
        if (set.sheets.length <= 1) return;
        if (!confirm(`Delete sheet "${set.sheets.find(s => s.id === id)?.name}"?`)) return;
        setSet(prev => {
            const rest = prev.sheets.filter(s => s.id !== id);
            return { ...prev, sheets: rest, activeSheetId: prev.activeSheetId === id ? rest[0].id : prev.activeSheetId };
        });
    };
    const renameSheet = (id: string, name: string) => {
        setSet(prev => ({ ...prev, sheets: prev.sheets.map(s => s.id === id ? { ...s, name } : s) }));
    };
    const moveSheet = (id: string, dir: -1 | 1) => {
        setSet(prev => {
            const idx = prev.sheets.findIndex(s => s.id === id);
            const j = idx + dir;
            if (idx < 0 || j < 0 || j >= prev.sheets.length) return prev;
            const arr = [...prev.sheets];
            const [s] = arr.splice(idx, 1);
            arr.splice(j, 0, s);
            return { ...prev, sheets: arr };
        });
    };

    // ── Sheet sizing (derived from active sheet) ──────────────────────────
    const preset = SHEET_PRESETS.find(s => s.id === activeSheet.sheetId) ?? SHEET_PRESETS[0];
    const baseSize: SheetSize = activeSheet.sheetId === 'custom'
        ? { id: 'custom', label: 'Custom', widthIn: activeSheet.customW, heightIn: activeSheet.customH, unit: 'in' }
        : preset;
    const effW = activeSheet.landscape ? Math.max(baseSize.widthIn, baseSize.heightIn) : Math.min(baseSize.widthIn, baseSize.heightIn);
    const effH = activeSheet.landscape ? Math.min(baseSize.widthIn, baseSize.heightIn) : Math.max(baseSize.widthIn, baseSize.heightIn);

    // ── Titleblock editor + DXF upload ────────────────────────────────────
    const [tbEditorOpen, setTbEditorOpen] = useState<boolean>(false);
    const tbDxfRef = useRef<HTMLInputElement>(null);

    /** Build placeholder context for the active sheet (PAGE_OF reflects set). */
    const buildTbContext = useCallback((sheet: Sheet, scaleFt: number | null): TitleblockContext => {
        const idx = set.sheets.findIndex(s => s.id === sheet.id);
        return {
            projectName: sheet.tbFields.projectName,
            sheetNumber: sheet.tbFields.sheetNumber,
            drawnBy:     sheet.tbFields.drawnBy,
            date:        sheet.tbFields.date,
            notes:       sheet.tbFields.notes,
            sheetSize:   sheet.sheetId === 'custom' ? `${sheet.customW}×${sheet.customH} in` : (SHEET_PRESETS.find(s => s.id === sheet.sheetId)?.label ?? ''),
            scale:       scaleFt != null ? `1" = ${scaleFt}'` : 'Varies',
            pageOf:      `${idx + 1} of ${set.sheets.length}`,
        };
    }, [set.sheets]);

    const handleTbDxfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const { svgPath, viewBox } = parseDxfForSymbol(ev.target?.result as string);
                if (!svgPath) { reportError({ title: 'Invalid DXF', message: 'No drawable LINE/LWPOLYLINE entities found in this DXF.' }); return; }
                const w = set.tbLayout.widthIn;
                const h = set.tbLayout.heightIn;
                const dxfEl: TitleblockImageElement = {
                    id: newId('dxf'),
                    type: 'image',
                    x: 0, y: 0, w, h,
                    dataUrl: null, dxfPath: svgPath, dxfViewBox: viewBox,
                    fit: 'contain',
                };
                updateSet({
                    tbLayout: {
                        widthIn: w,
                        heightIn: h,
                        background: 'none',
                        borderColor: set.tbLayout.borderColor,
                        borderWidth: set.tbLayout.borderWidth,
                        elements: [dxfEl],
                    },
                });
            } catch (err) {
                reportError({ title: 'DXF parse failed', message: err instanceof Error ? err.message : String(err), error: err });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [set.tbLayout, updateSet, reportError]);

    // ── Viewports on the active sheet ─────────────────────────────────────
    const viewports = activeSheet.viewports;
    const [selectedVpId, setSelectedVpId] = useState<string>(viewports[0]?.id ?? '');
    /** Whether the style sub-panel is expanded for the selected viewport. */
    const [styleExpanded, setStyleExpanded] = useState(false);

    // Keep selected viewport in sync when switching sheets.
    useEffect(() => {
        if (!activeSheet.viewports.find(v => v.id === selectedVpId)) {
            setSelectedVpId(activeSheet.viewports[0]?.id ?? '');
        }
    }, [activeSheet.id, activeSheet.viewports, selectedVpId]);

    const selectedVp = viewports.find(v => v.id === selectedVpId) ?? viewports[0];

    const addViewport = () => {
        // extents is defined later in the component body; at call-time it is
        // fully initialized — safe to reference here via closure.
        const vp: Viewport = { ...makeDefaultViewport(), xIn: 1, yIn: 1, wIn: 6, hIn: 4,
            scaleFt: computeGoodScale(6, 4, extents) };
        updateActiveSheet(s => ({ viewports: [...s.viewports, vp] }));
        setSelectedVpId(vp.id);
    };
    /** Add a profile viewport pre-loaded with the current profile data. */
    const addProfileViewport = () => {
        if (!profileData || profileData.length === 0) {
            reportError({ title: 'No profile data', message: 'No profile data loaded. Generate a profile in the Profile Agent first.' });
            return;
        }
        // Size profile viewport to span roughly 80% of the sheet width, 25% height.
        const wIn = Math.max(4, effW * 0.75);
        const hIn = Math.max(2, effH * 0.22);
        const totalStation = profileData[profileData.length - 1].station - profileData[0].station;
        // Pick an h-scale that fits in the viewport width.
        const hScaleNeeded = totalStation / wIn;
        const hScale = PROFILE_H_SCALES.find(s => s >= hScaleNeeded) ?? PROFILE_H_SCALES[PROFILE_H_SCALES.length - 1];
        const vp: Viewport = {
            ...makeDefaultViewport(),
            type: 'profile',
            xIn: 0.5,
            yIn: Math.max(0.5, effH - hIn - (set.tbLayout.heightIn + 0.75)),
            wIn,
            hIn,
            profileHScaleFt: hScale,
            profileVExag: 2,
        };
        updateActiveSheet(s => ({ viewports: [...s.viewports, vp] }));
        setSelectedVpId(vp.id);
    };
    const removeViewport = (id: string) => {
        if (viewports.length === 1) return;
        updateActiveSheet(s => ({ viewports: s.viewports.filter(v => v.id !== id) }));
        if (selectedVpId === id) setSelectedVpId(viewports.find(v => v.id !== id)?.id ?? '');
    };
    const updateVp = (id: string, patch: Partial<Viewport>) => {
        updateActiveSheet(s => ({ viewports: s.viewports.map(v => v.id === id ? { ...v, ...patch } : v) }));
    };
    const updateVpStyle = (id: string, patch: Partial<ViewportStyle>) => {
        updateActiveSheet(s => ({
            viewports: s.viewports.map(v =>
                v.id === id ? { ...v, style: { ...DEFAULT_VP_STYLE, ...(v.style ?? {}), ...patch } } : v
            ),
        }));
    };
    const toggleLayerInVp = (vpId: string, layerKey: string) => {
        updateActiveSheet(s => ({
            viewports: s.viewports.map(v => {
                if (v.id !== vpId) return v;
                const has = v.hiddenLayers.includes(layerKey);
                return { ...v, hiddenLayers: has ? v.hiddenLayers.filter(k => k !== layerKey) : [...v.hiddenLayers, layerKey] };
            }),
        }));
    };

    // ── Extents + layers ──────────────────────────────────────────────────
    const extents = useMemo(() => {
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        const consider = (e: number, n: number) => {
            if (e < minE) minE = e; if (e > maxE) maxE = e;
            if (n < minN) minN = n; if (n > maxN) maxN = n;
        };
        for (const p of points) consider(p.easting, p.northing);
        for (const l of lines) {
            if (l.fromPt) consider(l.fromPt.x, l.fromPt.y);
            if (l.toPt)   consider(l.toPt.x,   l.toPt.y);
        }
        if (!isFinite(minE)) return null;
        return { minE, maxE, minN, maxN };
    }, [points, lines]);

    const availableLayers = useMemo(() => {
        const setL = new Set<string>();
        for (const l of lines) setL.add(lineLayerKey(l));
        for (const p of points) setL.add(pointLayerKey(p));
        return Array.from(setL).sort();
    }, [points, lines]);

    // ── Entity clusters (points & lines) & Model Space ──────────────────
    const entityClusters = useMemo(() => detectClusters(points, lines), [points, lines]);
    const [activeModelSpaceVpId, setActiveModelSpaceVpId] = useState<string | null>(null);
    const [editingTbElement, setEditingTbElement] = useState<TitleblockElement | null>(null);

    const zoomExtents = useCallback((vpId?: string) => {
        const targetId = vpId ?? selectedVpId;
        if (!extents) return;
        const vp = activeSheet.viewports.find(v => v.id === targetId);
        if (!vp) return;
        const cx = (extents.minE + extents.maxE) / 2;
        const cy = (extents.minN + extents.maxN) / 2;
        const newScale = computeGoodScale(vp.wIn, vp.hIn, extents);
        updateVp(targetId, {
            centerE: cx,
            centerN: cy,
            scaleFt: newScale,
        });
    }, [extents, selectedVpId, activeSheet.viewports, updateVp]);

    const zoomToCluster = useCallback((cluster: EntityCluster, vpId?: string) => {
        const targetId = vpId ?? selectedVpId;
        const vp = activeSheet.viewports.find(v => v.id === targetId);
        if (!vp) return;
        const cx = (cluster.extents.minE + cluster.extents.maxE) / 2;
        const cy = (cluster.extents.minN + cluster.extents.maxN) / 2;
        const newScale = computeGoodScale(vp.wIn, vp.hIn, cluster.extents, 0.15);
        updateVp(targetId, {
            centerE: cx,
            centerN: cy,
            scaleFt: newScale,
        });
    }, [selectedVpId, activeSheet.viewports, updateVp]);

    const zoomToLargestCluster = useCallback((vpId?: string) => {
        const clusters = detectClusters(points, lines);
        if (clusters.length > 0) {
            zoomToCluster(clusters[0], vpId);
        } else if (extents) {
            zoomExtents(vpId);
        }
    }, [points, lines, zoomToCluster, zoomExtents, extents]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && activeModelSpaceVpId) {
                setActiveModelSpaceVpId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeModelSpaceVpId]);

    // ── Auto-scale: recognize new session / new points and zoom to LARGEST cluster ──
    const lastDataSignatureRef = useRef<string>('');
    useEffect(() => {
        if (!extents) return;
        const sig = `${projectName || '__default__'}_${points.length}_${lines.length}_${Math.round(extents.minE)}_${Math.round(extents.maxN)}`;
        if (lastDataSignatureRef.current !== sig) {
            lastDataSignatureRef.current = sig;

            // Find primary cluster (sorted by total entity count descending; [0] is largest)
            const clusters = detectClusters(points, lines);
            const primary = clusters[0];
            const targetExtents = primary ? primary.extents : extents;
            const targetCenterE = (targetExtents.minE + targetExtents.maxE) / 2;
            const targetCenterN = (targetExtents.minN + targetExtents.maxN) / 2;
            const span = Math.max(targetExtents.maxE - targetExtents.minE, targetExtents.maxN - targetExtents.minN);
            const threshold = Math.max(3000, span * 1.5);

            setSet(prev => ({
                ...prev,
                sheets: prev.sheets.map(sheet => ({
                    ...sheet,
                    viewports: sheet.viewports.map(v => {
                        const dist = (v.centerE !== null && v.centerN !== null)
                            ? Math.hypot(v.centerE - targetCenterE, v.centerN - targetCenterN)
                            : Infinity;
                        // If viewport is uncentered or cached from a PREVIOUS session/project,
                        // reset it directly to the largest cluster of this new dataset!
                        if (v.centerE === null || v.centerN === null || dist > threshold) {
                            return {
                                ...v,
                                centerE: targetCenterE,
                                centerN: targetCenterN,
                                scaleFt: computeGoodScale(v.wIn, v.hIn, targetExtents),
                            };
                        }
                        return v;
                    }),
                })),
            }));
        }
    }, [extents, points, lines, projectName]);


    // ── Basemap caching & fetching (Dumps on reload or when loading another file) ──
    const [basemapCache, setBasemapCache] = useState<Record<string, string>>({});
    const basemapCacheRef = useRef<Record<string, string>>({});
    const fetchingBasemapsRef = useRef<Set<string>>(new Set());

    // Dump map cache when page reloads or when another file/project is loaded
    useEffect(() => {
        void clearMapCache();
        clearStaticMapsCache();
        basemapCacheRef.current = {};
        setBasemapCache({});
        fetchingBasemapsRef.current.clear();
    }, [projectName, points]);

    const getVpBasemapKey = (vp: Viewport) => {
        const cx = vp.centerE ?? ((extents ? (extents.minE + extents.maxE) / 2 : 0));
        const cy = vp.centerN ?? ((extents ? (extents.minN + extents.maxN) / 2 : 0));
        return `${vp.id}_${Math.round(cx)}_${Math.round(cy)}_${vp.scaleFt}_${Math.round(vp.wIn * 10)}_${Math.round(vp.hIn * 10)}`;
    };

    const fetchBasemapForVp = useCallback(async (vp: Viewport) => {
        if (!vp.showBasemap || vp.type !== 'plan') return;
        const worldFtPerInch = vp.scaleFt;
        let cx = vp.centerE, cy = vp.centerN;
        if (cx == null || cy == null) {
            if (extents) { cx = (extents.minE + extents.maxE) / 2; cy = (extents.minN + extents.maxN) / 2; }
            else { return; }
        }
        const halfW = (vp.wIn / 2) * worldFtPerInch;
        const halfH = (vp.hIn / 2) * worldFtPerInch;
        const minE = cx - halfW;
        const maxE = cx + halfW;
        const minN = cy - halfH;
        const maxN = cy + halfH;

        const cacheKey = `${vp.id}_${Math.round(cx)}_${Math.round(cy)}_${vp.scaleFt}_${Math.round(vp.wIn * 10)}_${Math.round(vp.hIn * 10)}`;
        if (basemapCache[cacheKey] || fetchingBasemapsRef.current.has(cacheKey)) return;

        fetchingBasemapsRef.current.add(cacheKey);

        try {
            const epsg = settings?.projection?.epsg;
            let m0x = 0, m0y = 0, m1x = 0, m1y = 0;
            let projected = false;

            if (epsg) {
                try {
                    const projectCrs = `EPSG:${epsg}`;
                    const p0 = proj4(projectCrs, 'EPSG:3857', [minE, minN]);
                    const p1 = proj4(projectCrs, 'EPSG:3857', [maxE, maxN]);
                    m0x = Math.min(p0[0], p1[0]);
                    m1x = Math.max(p0[0], p1[0]);
                    m0y = Math.min(p0[1], p1[1]);
                    m1y = Math.max(p0[1], p1[1]);
                    projected = true;
                } catch { /* ignore */ }
            }

            if (!projected) {
                const withCoords = points.filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number');
                if (withCoords.length > 0) {
                    const avgLat = withCoords.reduce((sum, p) => sum + (p.latitude ?? 0), 0) / withCoords.length;
                    const avgLon = withCoords.reduce((sum, p) => sum + (p.longitude ?? 0), 0) / withCoords.length;
                    const center3857 = proj4('EPSG:4326', 'EPSG:3857', [avgLon, avgLat]);
                    const halfWm = halfW * 0.3048;
                    const halfHm = halfH * 0.3048;
                    m0x = center3857[0] - halfWm;
                    m1x = center3857[0] + halfWm;
                    m0y = center3857[1] - halfHm;
                    m1y = center3857[1] + halfHm;
                    projected = true;
                }
            }

            if (!projected) {
                fetchingBasemapsRef.current.delete(cacheKey);
                return;
            }

            // In EPSG:3857, 1 unit X = 1 unit Y; calculate pixel dimensions matching real world aspect ratio
            const mercAspect = Math.max(0.1, Math.abs((m1x - m0x) / (m1y - m0y)));
            const pxW = Math.round(1024);
            const pxH = Math.max(1, Math.round(1024 / mercAspect));

            // EXACT USGS NAIP ImageServer — matches Model Space / Canvas orthophoto
            const naipUrl = `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=${m0x},${m0y},${m1x},${m1y}&bboxSR=3857&imageSR=3857&size=${pxW},${pxH}&f=image&format=png`;

            const resp = await fetch(naipUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result as string);
                reader.onerror = () => rej(reader.error);
                reader.readAsDataURL(blob);
            });

            basemapCacheRef.current[cacheKey] = dataUrl;
            setBasemapCache(prev => ({ ...prev, [cacheKey]: dataUrl }));
            return dataUrl;
        } catch (err) {
            console.warn('Failed to load USGS NAIP imagery for viewport:', err);
            return null;
        } finally {
            fetchingBasemapsRef.current.delete(cacheKey);
        }
    }, [extents, points, settings?.projection?.epsg, basemapCache]);

    const debounceTimersRef = useRef<Record<string, number>>({});

    useEffect(() => {
        for (const vp of activeSheet.viewports) {
            if (vp.showBasemap && vp.type === 'plan') {
                const timerId = debounceTimersRef.current[vp.id];
                if (timerId) clearTimeout(timerId);

                const cacheKey = getVpBasemapKey(vp);
                if (basemapCache[cacheKey]) continue;

                debounceTimersRef.current[vp.id] = window.setTimeout(() => {
                    fetchBasemapForVp(vp);
                }, 200);
            }
        }
        return () => {
            for (const key of Object.keys(debounceTimersRef.current)) {
                clearTimeout(debounceTimersRef.current[key]);
            }
        };
    }, [activeSheet.viewports, fetchBasemapForVp, basemapCache]);

    /** Change sheet size and re-suggest scale for auto-centered viewports. */
    const handleSheetSizeChange = (newSheetId: string) => {
        const preset = SHEET_PRESETS.find(p => p.id === newSheetId);
        const baseW = newSheetId === 'custom' ? activeSheet.customW : (preset?.widthIn ?? 24);
        const baseH = newSheetId === 'custom' ? activeSheet.customH : (preset?.heightIn ?? 18);
        const eW = activeSheet.landscape ? Math.max(baseW, baseH) : Math.min(baseW, baseH);
        const eH = activeSheet.landscape ? Math.min(baseW, baseH) : Math.max(baseW, baseH);
        // Leave ~1" margin on each side for borders and titleblock clearance.
        const newScale = computeGoodScale(Math.max(1, eW - 1.0), Math.max(1, eH - 1.0), extents);
        updateActiveSheet(s => ({
            sheetId: newSheetId,
            viewports: s.viewports.map(v =>
                v.centerE !== null ? v : { ...v, scaleFt: newScale }
            ),
        }));
    };

    // ── Sheet display PPI, Zoom & MMB Pan ────────────────────────────────
    const sheetContainerRef = useRef<HTMLDivElement>(null);
    const [ppi, setPpi] = useState<number>(48);
    const [sheetZoom, setSheetZoom] = useState<number>(1.0);
    const [sheetPan, setSheetPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isPanningSheet, setIsPanningSheet] = useState<boolean>(false);
    const effectivePpi = Math.max(8, ppi * sheetZoom);

    const startPaperspacePan = useCallback((clientX: number, clientY: number) => {
        setIsPanningSheet(true);
        const startX = clientX;
        const startY = clientY;
        const origX = sheetPan.x;
        const origY = sheetPan.y;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            setSheetPan({
                x: origX + dx,
                y: origY + dy,
            });
        };

        const onUp = () => {
            setIsPanningSheet(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [sheetPan]);

    // Mouse wheel zoom for sheet canvas (smooth CAD zoom in paperspace)
    useEffect(() => {
        const el = sheetContainerRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            // If in active model space, viewport handles its own scale
            if (activeModelSpaceVpId) return;

            e.preventDefault();
            e.stopPropagation();
            const factor = e.deltaY < 0 ? 1.15 : 0.85;
            setSheetZoom(prev => Math.max(0.2, Math.min(6.0, Number((prev * factor).toFixed(3)))));
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [activeModelSpaceVpId]);
    React.useLayoutEffect(() => {
        const el = sheetContainerRef.current; if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            const fitW = (rect.width - 32) / effW;
            const fitH = (rect.height - 32) / effH;
            setPpi(Math.max(8, Math.min(96, Math.floor(Math.min(fitW, fitH)))));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [effW, effH]);

    // ── CACP outbound: register sheet view as a listener for push commands ─
    useEffect(() => {
        if (!onSheetViewCommand) return;
        // Expose this component's imperative actions to the CACP bus.
        // Currently handled by the parent (App.tsx) which maps the CACP
        // command response back to this callback prop.
        // This effect intentionally empty on mount — the parent calls the
        // prop when it receives a CACP 'sheet_view_command' message.
    }, [onSheetViewCommand]);

    // ── Profile SVG renderer ───────────────────────────────────────────────
    const buildProfileVpSvg = (vp: Viewport, renderPpi = effectivePpi): React.ReactElement => {
        const wpx = vp.wIn * renderPpi;
        const hpx = vp.hIn * renderPpi;
        const pd = profileData ?? [];
        if (pd.length < 2) {
            return (
                <svg width={wpx} height={hpx} viewBox={`0 0 ${wpx} ${hpx}`} style={{ display: 'block', background: '#fff' }}>
                    <rect x={0} y={0} width={wpx} height={hpx} fill="#f9fafb" />
                    <text x={wpx / 2} y={hpx / 2} textAnchor="middle" fontSize={10} fill="#aaa" fontFamily="monospace">
                        No profile data — generate in Profile Agent
                    </text>
                </svg>
            );
        }
        const marginL = 0.5 * renderPpi, marginR = 0.25 * renderPpi;
        const marginT = 0.15 * renderPpi, marginB = 0.4 * renderPpi;
        const chartW = wpx - marginL - marginR;
        const chartH = hpx - marginT - marginB;

        const stMin  = pd[0].station;
        const stMax  = pd[pd.length - 1].station;
        const elevs  = pd.map(p => p.elevation);
        const elevMin = Math.min(...elevs);
        const elevMax = Math.max(...elevs);
        const elevRange = Math.max(1, elevMax - elevMin);

        // Exaggerated elevation range in paper inches = (elevRange / vExag) / hScaleFt * ppi
        // We just map elevation linearly within chartH with vertical exaggeration baked in.
        const stationRange = stMax - stMin;
        const hScaleFt = vp.profileHScaleFt;
        const vExag    = vp.profileVExag;
        // Paper width available / hScale → how many ft we can show
        const stationPaperFt = (chartW / renderPpi) * hScaleFt;
        // Vertical: elevRange / hScaleFt * vExag = vertical paper-inches
        const elevPaperIn = (elevRange / hScaleFt) * vExag;
        // If it would overflow chartH, clip gracefully
        const elevScale = Math.min(chartH / (elevPaperIn * renderPpi), chartH / 2);

        const stToPx = (st: number) =>
            marginL + ((st - stMin) / stationRange) * chartW;
        const elevToPx = (el: number) => {
            const paperIn = ((el - elevMin) / hScaleFt) * vExag;
            return hpx - marginB - Math.min(paperIn * renderPpi * (chartH / (elevPaperIn * renderPpi + 1)), chartH);
        };

        const pts = pd.map(p => `${stToPx(p.station).toFixed(1)},${elevToPx(p.elevation).toFixed(1)}`).join(' ');
        const closedPts = `${pts} ${stToPx(stMax).toFixed(1)},${hpx - marginB} ${stToPx(stMin).toFixed(1)},${hpx - marginB}`;

        // Grid lines — even station intervals
        const stInterval = PROFILE_H_SCALES.find(s => s >= stationPaperFt / 6) ?? 100;
        const gridLines: React.ReactElement[] = [];
        for (let st = Math.ceil(stMin / stInterval) * stInterval; st <= stMax; st += stInterval) {
            const x = stToPx(st);
            gridLines.push(<line key={`sg${st}`} x1={x} y1={marginT} x2={x} y2={hpx - marginB} stroke="#c8c8c8" strokeWidth={0.5} />);
            gridLines.push(<text key={`sl${st}`} x={x} y={hpx - marginB + 8} textAnchor="middle" fontSize={6} fill="#555" fontFamily="monospace">{st.toFixed(0)}</text>);
        }
        // Elevation labels
        const elevInterval = Math.pow(10, Math.floor(Math.log10(elevRange / 4)));
        for (let el = Math.ceil(elevMin / elevInterval) * elevInterval; el <= elevMax; el += elevInterval) {
            const y = elevToPx(el);
            if (y < marginT || y > hpx - marginB) continue;
            gridLines.push(<line key={`eg${el}`} x1={marginL} y1={y} x2={wpx - marginR} y2={y} stroke="#c8c8c8" strokeWidth={0.4} strokeDasharray="2 3" />);
            gridLines.push(<text key={`el${el}`} x={marginL - 3} y={y + 3} textAnchor="end" fontSize={6} fill="#555" fontFamily="monospace">{el.toFixed(1)}</text>);
        }

        const name = profileInfo?.name ?? 'Profile';
        const infoLine = `V.E. ${vExag}× | H: 1"=${hScaleFt}' | ${stMin.toFixed(0)}+00 – ${stMax.toFixed(0)}+00`;

        return (
            <svg width={wpx} height={hpx} viewBox={`0 0 ${wpx} ${hpx}`} style={{ display: 'block', background: '#fff' }}>
                <rect x={0} y={0} width={wpx} height={hpx} fill="#fff" />
                {/* Chart area border */}
                <rect x={marginL} y={marginT} width={chartW} height={chartH} fill="#fafafa" stroke="#999" strokeWidth={0.8} />
                {gridLines}
                {/* Profile fill area */}
                <polygon points={closedPts} fill="rgba(59,130,246,0.12)" stroke="none" />
                {/* Profile line */}
                <polyline points={pts} fill="none" stroke="#1d4ed8" strokeWidth={1.2} strokeLinejoin="round" />
                {/* Title */}
                <text x={marginL} y={marginT - 3} fontSize={7} fill="#222" fontFamily="sans-serif" fontWeight="bold">{name}</text>
                <text x={wpx - marginR} y={marginT - 3} textAnchor="end" fontSize={6} fill="#666" fontFamily="monospace">{infoLine}</text>
            </svg>
        );
    };

    // ── Viewport SVG renderer (live preview) ──────────────────────────────
    const buildVpSvg = (vp: Viewport, renderPpi = effectivePpi): React.ReactElement => {
        if (vp.type === 'profile') return buildProfileVpSvg(vp, renderPpi);
        const worldFtPerInch = vp.scaleFt;
        const wpx = vp.wIn * renderPpi;
        const hpx = vp.hIn * renderPpi;
        let cx = vp.centerE, cy = vp.centerN;
        if (cx == null || cy == null) {
            if (extents) { cx = (extents.minE + extents.maxE) / 2; cy = (extents.minN + extents.maxN) / 2; }
            else { cx = 0; cy = 0; }
        }
        const halfWftAtScale = (vp.wIn / 2) * worldFtPerInch;
        const halfHftAtScale = (vp.hIn / 2) * worldFtPerInch;
        const worldMinE = cx - halfWftAtScale;
        const worldMaxN = cy + halfHftAtScale;
        const worldToPx = (e: number, n: number): [number, number] => [
            ((e - worldMinE) / worldFtPerInch) * renderPpi,
            ((worldMaxN - n) / worldFtPerInch) * renderPpi,
        ];

        const ptIx = new Map<string, SurveyPoint>();
        for (const p of points) ptIx.set(p.pointNumber, p);
        const hidden = new Set(vp.hiddenLayers);

        const lineEls: React.ReactElement[] = [];
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (hidden.has(lineLayerKey(l))) continue;
            let ax: number | undefined, ay: number | undefined;
            let bx: number | undefined, by: number | undefined;
            if (l.fromPt && l.toPt) {
                ax = l.fromPt.x; ay = l.fromPt.y;
                bx = l.toPt.x;   by = l.toPt.y;
            } else {
                const a = ptIx.get(l.from); const b = ptIx.get(l.to);
                if (!a || !b) continue;
                ax = a.easting; ay = a.northing;
                bx = b.easting; by = b.northing;
            }
            const [x1, y1] = worldToPx(ax, ay);
            const [x2, y2] = worldToPx(bx, by);
            lineEls.push(<line key={l.id ?? `ln-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={pickLineColor(l, layerColors)} strokeWidth={pickLineWidth(l, 1)} />);

            // Bearing & distance annotation (matches DrawingCanvas behavior).
            // Curves are skipped — they carry their own arc annotation.
            if (l.bearing && l.distance && !l.isCurve) {
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                let angleDeg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
                if (angleDeg > 90) angleDeg -= 180;
                else if (angleDeg < -90) angleDeg += 180;
                const labelRot = l.labelRotation || 0;
                const offX = l.labelOffset?.x || 0;
                // labelOffset.y is in world (N) units; SVG y increases downward.
                const offY = -(l.labelOffset?.y || 0) / worldFtPerInch * renderPpi;
                const offXpx = offX / worldFtPerInch * renderPpi;
                // Target ~2ft tall in world units, but clamp for legibility.
                const fontPx = Math.max(4, Math.min(12, (2 / worldFtPerInch) * renderPpi));
                const text = `${l.bearing} / ${l.distance}`;
                lineEls.push(
                    <text key={`bd-${l.id ?? i}`}
                        transform={`translate(${midX + offXpx} ${midY + offY}) rotate(${(angleDeg + labelRot).toFixed(2)})`}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={fontPx} fontStyle="italic" fontWeight={600}
                        fontFamily="Arial, sans-serif" fill="#374151"
                        stroke="#fff" strokeWidth={fontPx * 0.18} paintOrder="stroke fill">
                        {text}
                    </text>
                );
            }
        }

        const pointEls: React.ReactElement[] = [];
        if (!vp.hidePoints) {
            for (const p of points) {
                if (hidden.has(pointLayerKey(p))) continue;
                const [x, y] = worldToPx(p.easting, p.northing);
                if (x < -10 || x > wpx + 10 || y < -10 || y > hpx + 10) continue;
                const color = pickPointColor(p, layerColors);
                pointEls.push(
                    <g key={p.pointNumber}>
                        <circle cx={x} cy={y} r={1.5} fill={color} stroke="#000" strokeOpacity={0.4} strokeWidth={0.3} />
                        <text x={x + 3} y={y - 3} fontSize={5} fill="#111" fontFamily="monospace">{p.pointNumber}</text>
                    </g>
                );
            }
        }

        const rot = getEffectiveVpRotation(vp);
        return (
            <svg width="100%" height="100%" viewBox={`0 0 ${wpx} ${hpx}`} style={{ display: 'block', width: '100%', height: '100%', background: vp.showBasemap ? 'transparent' : '#fff', position: 'relative', zIndex: 1 }}>
                <g transform={rot !== 0 ? `rotate(${rot} ${(wpx / 2).toFixed(1)} ${(hpx / 2).toFixed(1)})` : undefined}>
                    {lineEls}{pointEls}
                </g>
            </svg>
        );
    };

    // ── Build the SVG for one sheet at a given DPI (used for PDF export) ──
    const buildSheetSvg = useCallback((sheet: Sheet, pdfPpi: number): { svg: string; widthPx: number; heightPx: number } => {
        const presetX = SHEET_PRESETS.find(p => p.id === sheet.sheetId) ?? SHEET_PRESETS[0];
        const baseX: SheetSize = sheet.sheetId === 'custom'
            ? { id: 'custom', label: 'Custom', widthIn: sheet.customW, heightIn: sheet.customH, unit: 'in' }
            : presetX;
        const eW = sheet.landscape ? Math.max(baseX.widthIn, baseX.heightIn) : Math.min(baseX.widthIn, baseX.heightIn);
        const eH = sheet.landscape ? Math.min(baseX.widthIn, baseX.heightIn) : Math.max(baseX.widthIn, baseX.heightIn);
        const sheetPxW = eW * pdfPpi;
        const sheetPxH = eH * pdfPpi;

        const renderVpAt = (vp: Viewport): string => {
            const wpx = vp.wIn * pdfPpi;
            const hpx = vp.hIn * pdfPpi;
            const worldFtPerInch = vp.scaleFt;
            let cx = vp.centerE, cy = vp.centerN;
            if (cx == null || cy == null) {
                if (extents) { cx = (extents.minE + extents.maxE) / 2; cy = (extents.minN + extents.maxN) / 2; }
                else { cx = 0; cy = 0; }
            }
            const halfWftAtScale = (vp.wIn / 2) * worldFtPerInch;
            const halfHftAtScale = (vp.hIn / 2) * worldFtPerInch;
            const worldMinE = cx - halfWftAtScale;
            const worldMaxN = cy + halfHftAtScale;
            const worldToPx = (e: number, n: number): [number, number] => [
                ((e - worldMinE) / worldFtPerInch) * pdfPpi,
                ((worldMaxN - n) / worldFtPerInch) * pdfPpi,
            ];
            const ptIx = new Map<string, SurveyPoint>();
            for (const p of points) ptIx.set(p.pointNumber, p);
            const hidden = new Set(vp.hiddenLayers);
            const parts: string[] = [];
            for (const l of lines) {
                if (hidden.has(lineLayerKey(l))) continue;
                let ax: number | undefined, ay: number | undefined;
                let bx: number | undefined, by: number | undefined;
                if (l.fromPt && l.toPt) {
                    ax = l.fromPt.x; ay = l.fromPt.y;
                    bx = l.toPt.x;   by = l.toPt.y;
                } else {
                    const a = ptIx.get(l.from); const b = ptIx.get(l.to);
                    if (!a || !b) continue;
                    ax = a.easting; ay = a.northing;
                    bx = b.easting; by = b.northing;
                }
                const [x1, y1] = worldToPx(ax, ay);
                const [x2, y2] = worldToPx(bx, by);
                const stroke = pickLineColor(l, layerColors);
                const sw = pickLineWidth(l, 2);
                parts.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}" stroke-width="${sw}" />`);

                // Bearing & distance annotation (PDF export).
                if (l.bearing && l.distance && !l.isCurve) {
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    let angleDeg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
                    if (angleDeg > 90) angleDeg -= 180;
                    else if (angleDeg < -90) angleDeg += 180;
                    const labelRot = l.labelRotation || 0;
                    const offXpx = (l.labelOffset?.x || 0) / worldFtPerInch * pdfPpi;
                    const offYpx = -((l.labelOffset?.y || 0)) / worldFtPerInch * pdfPpi;
                    const fontPx = Math.max(5, Math.min(12, 2 / worldFtPerInch * pdfPpi));
                    const txt = escapeXml(`${l.bearing} / ${l.distance}`);
                    parts.push(
                        `<text transform="translate(${(midX + offXpx).toFixed(2)} ${(midY + offYpx).toFixed(2)}) rotate(${(angleDeg + labelRot).toFixed(2)})" text-anchor="middle" dominant-baseline="middle" font-size="${fontPx.toFixed(2)}" font-style="italic" font-weight="600" font-family="Arial, sans-serif" fill="#374151" stroke="#fff" stroke-width="${(fontPx * 0.18).toFixed(2)}" paint-order="stroke fill">${txt}</text>`
                    );
                }
            }
            if (!vp.hidePoints) {
                for (const p of points) {
                    if (hidden.has(pointLayerKey(p))) continue;
                    const [x, y] = worldToPx(p.easting, p.northing);
                    if (x < -20 || x > wpx + 20 || y < -20 || y > hpx + 20) continue;
                    const color = pickPointColor(p, layerColors);
                    parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="${color}" stroke="#000" stroke-opacity="0.4" stroke-width="0.5" />`);
                    parts.push(`<text x="${(x + 4).toFixed(2)}" y="${(y - 4).toFixed(2)}" font-size="8" fill="#111" font-family="monospace">${escapeXml(p.pointNumber)}</text>`);
                }
            }
            const bKey = getVpBasemapKey(vp);
            const basemapUrl = vp.showBasemap ? (basemapCacheRef.current[bKey] || basemapCache[bKey]) : null;
            const rot = getEffectiveVpRotation(vp);
            const rotAttr = rot !== 0 ? ` transform="rotate(${rot} ${(wpx / 2).toFixed(2)} ${(hpx / 2).toFixed(2)})"` : '';
            const basemapTag = basemapUrl ? `<image href="${basemapUrl}" xlink:href="${basemapUrl}" x="0" y="0" width="${wpx}" height="${hpx}" preserveAspectRatio="none" opacity="${vp.basemapOpacity ?? 0.8}"${rotAttr} />` : '';
            return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${wpx}" height="${hpx}" viewBox="0 0 ${wpx} ${hpx}"><rect x="0" y="0" width="${wpx}" height="${hpx}" fill="#fff"/>${basemapTag}<g${rotAttr}>${parts.join('')}</g></svg>`;
        };

        const isVerticalTb = set.tbLayout.heightIn > 5;
        const tbX = (eW - set.tbLayout.widthIn - 0.5) * pdfPpi;
        const tbY = isVerticalTb ? 0.5 * pdfPpi : (eH - set.tbLayout.heightIn - 0.5) * pdfPpi;
        const vpGroups = sheet.viewports.map(vp => {
            const x = vp.xIn * pdfPpi;
            const y = vp.yIn * pdfPpi;
            const inner = renderVpAt(vp);
            return `<g transform="translate(${x},${y})"><rect x="0" y="0" width="${vp.wIn * pdfPpi}" height="${vp.hIn * pdfPpi}" fill="none" stroke="#111" stroke-width="1.5" />${inner}<text x="4" y="${vp.hIn * pdfPpi - 4}" font-size="10" font-family="monospace" fill="#444">1" = ${vp.scaleFt}'</text></g>`;
        }).join('');

        const tbCtx = buildTbContext(sheet, sheet.viewports[0]?.scaleFt ?? null);
        const tbSvgInner = titleblockToSvgMarkup(set.tbLayout, tbCtx, pdfPpi);
        const tbBlock = `<g transform="translate(${tbX},${tbY})">${tbSvgInner}</g>`;

        let sbBlock = '';
        if (sheet.scaleBar?.enabled !== false) {
            const sb = sheet.scaleBar ?? makeDefaultScaleBar(sheet.viewports[0]?.id ?? '');
            const linkedVp = sheet.viewports.find(v => v.id === sb.viewportId) ?? sheet.viewports[0];
            const sbSvg = renderScaleBarSvg(sb, linkedVp, pdfPpi, true);
            const sbX = sb.xIn * pdfPpi;
            const sbY = sb.yIn * pdfPpi;
            sbBlock = `<g transform="translate(${sbX.toFixed(2)},${sbY.toFixed(2)})">${sbSvg}</g>`;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sheetPxW}" height="${sheetPxH}" viewBox="0 0 ${sheetPxW} ${sheetPxH}">
            <rect x="0" y="0" width="${sheetPxW}" height="${sheetPxH}" fill="#fff" />
            ${vpGroups}
            ${tbBlock}
            ${sbBlock}
        </svg>`;
        return { svg, widthPx: sheetPxW, heightPx: sheetPxH };
    }, [set.tbLayout, points, lines, extents, layerColors, buildTbContext, getEffectiveVpRotation, basemapCache]);

    /** Rasterize an SVG to a PNG data URL via an offscreen canvas. */
    const svgToPng = (svg: string, w: number, h: number): Promise<string> => new Promise((resolve, reject) => {
        const img = new Image();
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas 2d unavailable')); return; }
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
        img.src = url;
    });

    const handleExportCurrentPdf = useCallback(async () => {
        const pdfPpi = 100;
        // Guarantee background imagery is loaded for all active viewports before plotting
        for (const vp of activeSheet.viewports) {
            if (vp.showBasemap && vp.type === 'plan') {
                const bKey = getVpBasemapKey(vp);
                if (!basemapCacheRef.current[bKey]) {
                    await fetchBasemapForVp(vp);
                }
            }
        }
        const { svg, widthPx, heightPx } = buildSheetSvg(activeSheet, pdfPpi);
        try {
            const png = await svgToPng(svg, widthPx, heightPx);
            const pdf = new jsPDF({ orientation: effW >= effH ? 'landscape' : 'portrait', unit: 'in', format: [effW, effH] });
            pdf.addImage(png, 'PNG', 0, 0, effW, effH);
            const safe = (activeSheet.tbFields.projectName || 'sheet').replace(/[^a-z0-9-_]/gi, '_');
            pdf.save(`${safe}_${activeSheet.tbFields.sheetNumber || activeSheet.name}.pdf`);
        } catch (e) {
            reportError({ title: 'Export failed', message: e instanceof Error ? e.message : String(e), error: e });
        }
    }, [activeSheet, effW, effH, buildSheetSvg, reportError, fetchBasemapForVp]);

    const handleExportSetPdf = useCallback(async () => {
        const pdfPpi = 100;
        let pdf: jsPDF | null = null;
        try {
            for (let i = 0; i < set.sheets.length; i++) {
                const sheet = set.sheets[i];
                for (const vp of sheet.viewports) {
                    if (vp.showBasemap && vp.type === 'plan') {
                        const bKey = getVpBasemapKey(vp);
                        if (!basemapCacheRef.current[bKey]) {
                            await fetchBasemapForVp(vp);
                        }
                    }
                }
                const { svg, widthPx, heightPx } = buildSheetSvg(sheet, pdfPpi);
                const png = await svgToPng(svg, widthPx, heightPx);
                const wIn = widthPx / pdfPpi;
                const hIn = heightPx / pdfPpi;
                if (!pdf) {
                    pdf = new jsPDF({ orientation: wIn >= hIn ? 'landscape' : 'portrait', unit: 'in', format: [wIn, hIn] });
                } else {
                    pdf.addPage([wIn, hIn], wIn >= hIn ? 'landscape' : 'portrait');
                }
                pdf.addImage(png, 'PNG', 0, 0, wIn, hIn);
            }
            const safe = (activeSheet.tbFields.projectName || 'sheet-set').replace(/[^a-z0-9-_]/gi, '_');
            pdf!.save(`${safe}_sheet-set.pdf`);
        } catch (e) {
            reportError({ title: 'Set export failed', message: e instanceof Error ? e.message : String(e), error: e });
        }
    }, [set.sheets, activeSheet, buildSheetSvg, reportError, fetchBasemapForVp]);

    // ── Viewport drag-to-move / Shift+drag-to-pan / edge-resize ───────────
    // dragRef supports three modes: 'move' (default), 'pan' (Shift+drag),
    // and 'resize' (edge/corner handles).
    type DragState =
        | { type: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
        | { type: 'pan'; id: string; startX: number; startY: number; origCenterE: number | null; origCenterN: number | null; fallbackE: number; fallbackN: number }
        | { type: 'resize'; id: string; dir: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number };
    const dragRef = useRef<DragState | null>(null);

    const onVpMouseDown = (e: React.MouseEvent, vp: Viewport) => {
        if (e.button === 1 || e.buttons === 4) {
            e.preventDefault();
            e.stopPropagation();
            startPaperspacePan(e.clientX, e.clientY);
            return;
        }
        e.stopPropagation();
        setSelectedVpId(vp.id);
        const isModelSpace = activeModelSpaceVpId === vp.id;
        if (((e.ctrlKey || e.metaKey) || isModelSpace) && vp.type === 'plan') {
            // Ctrl+drag (or Cmd+drag on Mac), or plain drag in Active Model Space = pan viewport contents (adjust centerE/centerN).
            // If center is null (auto-fit), seed it from current extents so panning works.
            const fallbackE = extents ? (extents.minE + extents.maxE) / 2 : 0;
            const fallbackN = extents ? (extents.minN + extents.maxN) / 2 : 0;
            dragRef.current = {
                type: 'pan', id: vp.id,
                startX: e.clientX, startY: e.clientY,
                origCenterE: vp.centerE, origCenterN: vp.centerN,
                fallbackE, fallbackN,
            };
        } else if (!vp.lockPosition) {
            dragRef.current = {
                type: 'move', id: vp.id,
                startX: e.clientX, startY: e.clientY,
                origX: vp.xIn, origY: vp.yIn,
            };
        }
        const onMove = (ev: MouseEvent) => {
            const st = dragRef.current; if (!st) return;
            if (st.type === 'move') {
                const dxIn = (ev.clientX - st.startX) / effectivePpi;
                const dyIn = (ev.clientY - st.startY) / effectivePpi;
                updateVp(st.id, {
                    xIn: Math.max(0, Math.min(effW - vp.wIn, st.origX + dxIn)),
                    yIn: Math.max(0, Math.min(effH - vp.hIn, st.origY + dyIn)),
                });
            } else if (st.type === 'pan') {
                // Convert pixel drag to world feet. Drag right => content moves right => center decreases (E).
                // Drag down => content moves down => center increases (N), because screen-Y inverts world-N.
                const dxPx = ev.clientX - st.startX;
                const dyPx = ev.clientY - st.startY;
                const dE = -(dxPx / ppi) * vp.scaleFt;
                const dN =  (dyPx / ppi) * vp.scaleFt;
                const baseE = st.origCenterE ?? st.fallbackE;
                const baseN = st.origCenterN ?? st.fallbackN;
                updateVp(st.id, { centerE: baseE + dE, centerN: baseN + dN });
            }
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };


    const onScaleBarMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || e.buttons === 4) {
            e.preventDefault();
            e.stopPropagation();
            startPaperspacePan(e.clientX, e.clientY);
            return;
        }
        e.stopPropagation();
        const sb = activeSheet.scaleBar ?? makeDefaultScaleBar(activeSheet.viewports[0]?.id ?? '');
        dragRef.current = {
            type: 'scalebar' as any,
            id: 'scalebar',
            startX: e.clientX,
            startY: e.clientY,
            origX: sb.xIn,
            origY: sb.yIn,
        } as any;
        const onMove = (ev: MouseEvent) => {
            const st = dragRef.current as any;
            if (!st || st.type !== 'scalebar') return;
            const dxIn = (ev.clientX - st.startX) / effectivePpi;
            const dyIn = (ev.clientY - st.startY) / effectivePpi;
            const sbW = sb.widthIn || 3.0;
            const sbH = sb.heightIn || 0.6;
            const nextX = Math.max(0.1, Math.min(effW - sbW - 0.1, st.origX + dxIn));
            const nextY = Math.max(0.1, Math.min(effH - sbH - 0.1, st.origY + dyIn));
            updateActiveSheet(s => ({
                scaleBar: {
                    ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                    xIn: nextX,
                    yIn: nextY,
                },
            }));
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Mouse down on a resize handle (corner or edge) — midpoints independent, corners proportional.
    const onVpResizeMouseDown = (e: React.MouseEvent, vp: Viewport, dir: string) => {
        if (e.button === 1 || e.buttons === 4) {
            e.preventDefault();
            e.stopPropagation();
            startPaperspacePan(e.clientX, e.clientY);
            return;
        }
        e.stopPropagation();
        e.preventDefault();
        setSelectedVpId(vp.id);
        dragRef.current = {
            type: 'resize', id: vp.id, dir,
            startX: e.clientX, startY: e.clientY,
            origX: vp.xIn, origY: vp.yIn, origW: vp.wIn, origH: vp.hIn,
        };
        const MIN = 0.5; // minimum viewport size in inches
        const onMove = (ev: MouseEvent) => {
            const st = dragRef.current; if (!st || st.type !== 'resize') return;
            const dxIn = (ev.clientX - st.startX) / effectivePpi;
            const dyIn = (ev.clientY - st.startY) / effectivePpi;

            let w = st.origW;
            let h = st.origH;
            let x = st.origX;
            let y = st.origY;

            // Midpoint handles (e, w, s, n): adjust width or height INDEPENDENTLY!
            if (st.dir === 'e') {
                w = Math.max(MIN, st.origW + dxIn);
            } else if (st.dir === 'w') {
                w = Math.max(MIN, st.origW - dxIn);
                x = st.origX + (st.origW - w);
            } else if (st.dir === 's') {
                h = Math.max(MIN, st.origH + dyIn);
            } else if (st.dir === 'n') {
                h = Math.max(MIN, st.origH - dyIn);
                y = st.origY + (st.origH - h);
            }
            // Corner handles (se, sw, ne, nw): maintain aspect ratio proportionally
            else {
                const origAspect = st.origW / st.origH;
                if (st.dir === 'se') {
                    const scale = Math.max(MIN / st.origW, 1 + (dxIn + dyIn * origAspect) / (2 * st.origW));
                    w = st.origW * scale;
                    h = w / origAspect;
                } else if (st.dir === 'sw') {
                    const scale = Math.max(MIN / st.origW, 1 + (-dxIn + dyIn * origAspect) / (2 * st.origW));
                    w = st.origW * scale;
                    h = w / origAspect;
                    x = st.origX + (st.origW - w);
                } else if (st.dir === 'ne') {
                    const scale = Math.max(MIN / st.origW, 1 + (dxIn - dyIn * origAspect) / (2 * st.origW));
                    w = st.origW * scale;
                    h = w / origAspect;
                    y = st.origY + (st.origH - h);
                } else if (st.dir === 'nw') {
                    const scale = Math.max(MIN / st.origW, 1 + (-dxIn - dyIn * origAspect) / (2 * st.origW));
                    w = st.origW * scale;
                    h = w / origAspect;
                    x = st.origX + (st.origW - w);
                    y = st.origY + (st.origH - h);
                }
            }

            // Clamp inside sheet boundaries
            if (x < 0) { w += x; x = 0; }
            if (y < 0) { h += y; y = 0; }
            if (x + w > effW) { w = effW - x; }
            if (y + h > effH) { h = effH - y; }

            w = Math.max(MIN, w);
            h = Math.max(MIN, h);
            updateVp(st.id, { xIn: x, yIn: y, wIn: w, hIn: h });
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full bg-gray-900 text-gray-100 text-sm">
            {/* Sheet Set Manager — top tab bar */}
            <div className="flex-shrink-0 border-b border-gray-700 bg-gray-950/60 px-2 py-1 flex items-center gap-1 overflow-x-auto">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-2">Sheet Set:</span>
                {set.sheets.map((s, i) => (
                    <div key={s.id}
                        onClick={() => updateSet({ activeSheetId: s.id })}
                        onDoubleClick={() => {
                            const n = prompt('Rename sheet:', s.name);
                            if (n != null && n.trim() !== '') renameSheet(s.id, n.trim());
                        }}
                        className={`group flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer whitespace-nowrap ${
                            s.id === set.activeSheetId
                                ? 'bg-amber-700/40 border border-amber-500/60 text-amber-100'
                                : 'bg-gray-800 border border-transparent hover:border-gray-600 text-gray-300'
                        }`}
                        title="Click to switch, double-click to rename"
                    >
                        <span className="text-gray-500">{i + 1}.</span>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-gray-500 text-[10px]">[{s.tbFields.sheetNumber}]</span>
                        {set.sheets.length > 1 && (
                            <>
                                <button onClick={e => { e.stopPropagation(); moveSheet(s.id, -1); }}
                                    className="opacity-0 group-hover:opacity-80 hover:opacity-100 text-gray-400" title="Move left">‹</button>
                                <button onClick={e => { e.stopPropagation(); moveSheet(s.id, 1); }}
                                    className="opacity-0 group-hover:opacity-80 hover:opacity-100 text-gray-400" title="Move right">›</button>
                                <button onClick={e => { e.stopPropagation(); deleteSheet(s.id); }}
                                    className="opacity-0 group-hover:opacity-80 hover:opacity-100 text-rose-400 hover:text-rose-300" title="Delete">×</button>
                            </>
                        )}
                    </div>
                ))}
                <button onClick={addSheet}
                    className="ml-1 px-2 py-1 rounded text-[11px] bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-100 font-semibold"
                    title="Add a new sheet to the set">
                    + Sheet
                </button>
                <button onClick={() => duplicateSheet(activeSheet.id)}
                    className="px-2 py-1 rounded text-[11px] bg-gray-700/60 hover:bg-gray-600/80 text-gray-200"
                    title="Duplicate the active sheet">
                    Duplicate
                </button>
                <div className="ml-auto text-[10px] text-gray-500 px-2">
                    Sheet {activeIndex + 1} of {totalSheets}
                </div>
            </div>

                        <div className="flex flex-1 min-h-0 w-full overflow-hidden">
                {/* 1. Sheet Preview Canvas (LEFT) */}
                <div
                    ref={sheetContainerRef}
                    onMouseDown={e => {
                        if (e.button === 1 || e.buttons === 4) {
                            e.preventDefault();
                            startPaperspacePan(e.clientX, e.clientY);
                        }
                    }}
                    onAuxClick={e => {
                        if (e.button === 1) e.preventDefault();
                        if (e.button === 1 && e.detail === 2) {
                            // Double-click MMB resets pan & zoom (Zoom Extents in CAD)
                            setSheetPan({ x: 0, y: 0 });
                            setSheetZoom(1.0);
                        }
                    }}
                    onDoubleClick={() => setActiveModelSpaceVpId(null)}
                    style={{
                        cursor: isPanningSheet ? 'grabbing' : undefined,
                    }}
                    className="flex-1 overflow-hidden bg-gray-950 p-6 flex items-center justify-center relative select-none"
                >
                    <div style={{
                        transform: `translate(${sheetPan.x}px, ${sheetPan.y}px)`,
                        width: effW * effectivePpi,
                        height: effH * effectivePpi,
                        background: '#fff',
                        position: 'relative',
                        boxShadow: '0 0 35px rgba(0,0,0,0.7)',
                        flexShrink: 0,
                        transformOrigin: 'center center',
                    }}>
                        <div style={{
                            position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                            border: '1px solid #111', boxSizing: 'border-box', pointerEvents: 'none',
                        }} />
                        {viewports.map(vp => {
                            const isSelected = vp.id === selectedVpId;
                            const isModelSpace = activeModelSpaceVpId === vp.id;
                            return (
                                <div
                                    key={vp.id}
                                    onMouseDown={e => onVpMouseDown(e, vp)}
                                    onDoubleClick={e => {
                                        e.stopPropagation();
                                        setSelectedVpId(vp.id);
                                        setActiveModelSpaceVpId(prev => prev === vp.id ? null : vp.id);
                                    }}
                                    onWheel={e => {
                                        if (isModelSpace && vp.type === 'plan') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (vp.lockZoom) return;
                                            const currentIdx = ENGINEER_SCALES.findIndex(s => s >= vp.scaleFt);
                                            let targetScale: number;
                                            if (e.deltaY > 0) {
                                                targetScale = ENGINEER_SCALES[Math.min(ENGINEER_SCALES.length - 1, (currentIdx >= 0 ? currentIdx : 0) + 1)];
                                            } else {
                                                targetScale = ENGINEER_SCALES[Math.max(0, (currentIdx >= 0 ? currentIdx : ENGINEER_SCALES.length - 1) - 1)];
                                            }
                                            updateVp(vp.id, { scaleFt: targetScale });
                                        }
                                    }}
                                    className="group"
                                    style={{
                                        position: 'absolute',
                                        left: vp.xIn * effectivePpi, top: vp.yIn * effectivePpi,
                                        width: vp.wIn * effectivePpi, height: vp.hIn * effectivePpi,
                                        border: isModelSpace
                                            ? '2.5px solid #06b6d4'
                                            : isSelected
                                            ? '2px solid #f59e0b'
                                            : '1px solid #111',
                                        boxShadow: isModelSpace
                                            ? '0 0 0 2px rgba(6,182,212,0.4), 0 0 25px rgba(6,182,212,0.35)'
                                            : isSelected
                                            ? '0 0 10px rgba(245,158,11,0.25)'
                                            : 'none',
                                        background: '#fff',
                                        cursor: isModelSpace ? 'grab' : (vp.lockPosition ? 'default' : 'move'),
                                        overflow: 'hidden',
                                        zIndex: isModelSpace ? 25 : isSelected ? 15 : 1,
                                    }}
                                    title={isModelSpace
                                        ? 'Active Model Space — Drag to Pan, Scroll to Zoom, Double-click to Exit'
                                        : 'Viewport ' + vp.id + ' — Double-click to enter Model Space'}
                                >
                                    {vp.showBasemap && vp.type === 'plan' && (() => {
                                        const bKey = getVpBasemapKey(vp);
                                        const worldFtPerInch = vp.scaleFt;
                                        const cx = vp.centerE ?? ((extents ? (extents.minE + extents.maxE) / 2 : 0));
                                        const cy = vp.centerN ?? ((extents ? (extents.minN + extents.maxN) / 2 : 0));
                                        const halfWftAtScale = (vp.wIn / 2) * worldFtPerInch;
                                        const halfHftAtScale = (vp.hIn / 2) * worldFtPerInch;
                                        const worldMinE = cx - halfWftAtScale;
                                        const worldMaxN = cy + halfHftAtScale;
                                        return (
                                            <ViewportBasemapCanvas
                                                vp={vp}
                                                ppi={effectivePpi}
                                                imageDataUrl={basemapCache[bKey] ?? null}
                                                opacity={vp.basemapOpacity ?? 0.8}
                                                worldMinE={worldMinE}
                                                worldMaxN={worldMaxN}
                                                worldFtPerInch={worldFtPerInch}
                                                rotationDeg={getEffectiveVpRotation(vp)}
                                            />
                                        );
                                    })()}
                                    {buildVpSvg(vp, effectivePpi)}

                                    {/* Hover Lock & Orientation Toolbar on Viewport */}
                                    <div
                                        className={`absolute top-1.5 right-1.5 z-30 flex items-center gap-1 transition-opacity duration-150 pointer-events-auto bg-gray-900/90 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-gray-700 shadow-xl text-[10px] ${
                                            (vp.lockPosition || vp.lockZoom || vp.lockRotationToModelSpace || (vp.rotationDeg ?? 0) !== 0) ? 'opacity-90 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'
                                        }`}
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => updateVp(vp.id, { lockPosition: !vp.lockPosition })}
                                            className={`px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors ${
                                                vp.lockPosition
                                                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60'
                                                    : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                            }`}
                                            title={vp.lockPosition ? "Position Locked (click to unlock moving/resizing on sheet)" : "Position Unlocked (click to lock moving/resizing on sheet)"}
                                        >
                                            <span>{vp.lockPosition ? '🔒' : '🔓'}</span>
                                            <span>Pos</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateVp(vp.id, { lockZoom: !vp.lockZoom })}
                                            className={`px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors ${
                                                vp.lockZoom
                                                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/60'
                                                    : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                            }`}
                                            title={vp.lockZoom ? `Scale Locked at 1"=${vp.scaleFt}' (click to unlock zoom)` : "Scale Unlocked (click to lock zoom)"}
                                        >
                                            <span>{vp.lockZoom ? '🔒' : '🔓'}</span>
                                            <span>Scale</span>
                                        </button>

                                        <div className="h-3 w-px bg-gray-700" />

                                        {/* Lock to Model Space Orientation Button */}
                                        <button
                                            type="button"
                                            onClick={() => updateVp(vp.id, { lockRotationToModelSpace: !vp.lockRotationToModelSpace })}
                                            className={`px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors ${
                                                vp.lockRotationToModelSpace
                                                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/60'
                                                    : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                            }`}
                                            title={vp.lockRotationToModelSpace ? `Locked to Model Space Orientation (${msAngleDeg}°)` : `Lock to Model Space Orientation (${msAngleDeg}°)`}
                                        >
                                            <span>{vp.lockRotationToModelSpace ? '🔒' : '📐'}</span>
                                            <span>MS</span>
                                        </button>

                                        {/* Cycle 90 deg rotation */}
                                        {!vp.lockRotationToModelSpace && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (vp.lockRotation) return;
                                                    const cur = vp.rotationDeg ?? 0;
                                                    const next = (cur + 90) % 360;
                                                    updateVp(vp.id, { rotationDeg: next });
                                                }}
                                                className={`px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors ${
                                                    (vp.rotationDeg ?? 0) !== 0
                                                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/60'
                                                        : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                                }`}
                                                title={`View Rotation: ${vp.rotationDeg ?? 0}° (click to rotate +90°)`}
                                            >
                                                <span>🔄</span>
                                                <span>{vp.rotationDeg ?? 0}°</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* In-viewport Floating HUD when Model Space is active */}
                                    {isModelSpace && (
                                        <div
                                            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-gray-900/95 text-white px-3 py-1.5 rounded-lg shadow-2xl border border-cyan-500/70 backdrop-blur-md text-[11px] pointer-events-auto"
                                            onClick={e => e.stopPropagation()}
                                            onMouseDown={e => e.stopPropagation()}
                                        >
                                            <span className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider text-[10px] uppercase">
                                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                                Model Space
                                            </span>
                                            <div className="h-3.5 w-px bg-gray-700 mx-1" />
                                            <button
                                                type="button"
                                                onClick={() => zoomToLargestCluster(vp.id)}
                                                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-white font-semibold transition-all flex items-center gap-1 border border-amber-500/30"
                                                title="Zoom to primary / largest cluster of points & lines"
                                            >
                                                🎯 Largest Cluster
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => zoomExtents(vp.id)}
                                                className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-200 hover:text-white font-semibold transition-all flex items-center gap-1 border border-cyan-500/30"
                                                title="Fit all survey data inside this viewport"
                                            >
                                                ⚡ Extents
                                            </button>
                                            {entityClusters.length > 0 && (
                                                <div className="relative group">
                                                    <button
                                                        type="button"
                                                        className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-white font-semibold transition-all flex items-center gap-1 border border-amber-500/30"
                                                        title="Zoom to cluster of survey points"
                                                    >
                                                        📍 Clusters ({entityClusters.length}) ▾
                                                    </button>
                                                    <div className="hidden group-hover:flex group-focus-within:flex flex-col absolute left-0 top-full mt-1 bg-gray-900 border border-gray-700/80 rounded-lg shadow-2xl py-1 min-w-[170px] z-40 max-h-52 overflow-y-auto">
                                                        <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-800">
                                                            Point Clusters
                                                        </div>
                                                        {entityClusters.map(c => (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                onClick={() => zoomToCluster(c, vp.id)}
                                                                className="px-2.5 py-1.5 text-left text-[11px] hover:bg-amber-500/20 text-gray-200 hover:text-amber-200 flex items-center justify-between transition-colors"
                                                            >
                                                                <span className="font-medium truncate">{c.name}</span>
                                                                <span className="text-[10px] text-amber-400/80 font-mono ml-2">{c.count} pts</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="h-3.5 w-px bg-gray-700 mx-1" />
                                            <span className="text-gray-300 font-mono text-[10px] bg-gray-800/80 px-1.5 py-0.5 rounded border border-gray-700">1″ = {vp.scaleFt}′</span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveModelSpaceVpId(null)}
                                                className="ml-1 px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors text-[10px] font-semibold"
                                                title="Exit Model Space (Return to Paper Space)"
                                            >
                                                ✕ Exit (PS)
                                            </button>
                                        </div>
                                    )}

                                    {/* Resize handles: only in Paper Space when selected */}
                                    {!isModelSpace && isSelected && !vp.lockPosition && ['nw','n','ne','e','se','s','sw','w'].map(dir => (
                                        <div
                                            key={dir}
                                            onMouseDown={e => onVpResizeMouseDown(e, vp, dir)}
                                            style={{
                                                position: 'absolute',
                                                ...(dir === 'nw' && { left: 0, top: 0, cursor: 'nwse-resize' }),
                                                ...(dir === 'n'  && { left: '50%', top: 0, transform: 'translateX(-50%)', cursor: 'ns-resize' }),
                                                ...(dir === 'ne' && { right: 0, top: 0, cursor: 'nesw-resize' }),
                                                ...(dir === 'e'  && { right: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }),
                                                ...(dir === 'se' && { right: 0, bottom: 0, cursor: 'nwse-resize' }),
                                                ...(dir === 's'  && { left: '50%', bottom: 0, transform: 'translateX(-50%)', cursor: 'ns-resize' }),
                                                ...(dir === 'sw' && { left: 0, bottom: 0, cursor: 'nesw-resize' }),
                                                ...(dir === 'w'  && { left: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }),
                                                width: 8, height: 8, background: '#f59e0b', borderRadius: 2, zIndex: 10,
                                                boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                                            }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ))}

                                    <div style={{
                                        position: 'absolute', left: 2, bottom: 1, fontSize: 8, color: '#444',
                                        fontFamily: 'monospace', background: 'rgba(255,255,255,0.85)', padding: '0 4px',
                                        borderRadius: '2px', border: '1px solid rgba(0,0,0,0.1)'
                                    }}>
                                        1″ = {vp.scaleFt}′ {isModelSpace ? '• [MODEL SPACE ACTIVE]' : ''}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Draggable Graphic Scale Bar on paper */}
                        {activeSheet.scaleBar?.enabled !== false && (() => {
                            const sb = activeSheet.scaleBar ?? makeDefaultScaleBar(activeSheet.viewports[0]?.id ?? '');
                            const linkedVp = activeSheet.viewports.find(v => v.id === sb.viewportId) ?? activeSheet.viewports[0];
                            const sbSvgMarkup = renderScaleBarSvg(sb, linkedVp, effectivePpi);
                            return (
                                <div
                                    key="scalebar"
                                    onMouseDown={onScaleBarMouseDown}
                                    style={{
                                        position: 'absolute',
                                        left: sb.xIn * effectivePpi,
                                        top: sb.yIn * effectivePpi,
                                        width: sb.widthIn * effectivePpi,
                                        height: (sb.heightIn || 0.6) * effectivePpi,
                                        cursor: 'grab',
                                        zIndex: 35,
                                        pointerEvents: 'auto',
                                    }}
                                    className="group hover:ring-2 hover:ring-amber-400 rounded transition-all bg-white/75 backdrop-blur-[2px] p-1 shadow-sm select-none"
                                    title={`Graphic Scale Bar (1" = ${linkedVp?.scaleFt ?? 50}') — Drag anywhere on sheet`}
                                    dangerouslySetInnerHTML={{ __html: sbSvgMarkup }}
                                />
                            );
                        })()}

                        {/* Titleblock (Vertical along right side or Corner Box) */}
                        {(() => {
                            const isVertical = set.tbLayout.heightIn > 5;
                            return (
                                <div style={{
                                    position: 'absolute',
                                    right: 0.5 * effectivePpi,
                                    ...(isVertical
                                        ? { top: 0.5 * effectivePpi, height: set.tbLayout.heightIn * effectivePpi }
                                        : { bottom: 0.5 * effectivePpi, height: set.tbLayout.heightIn * effectivePpi }
                                    ),
                                    width: set.tbLayout.widthIn * effectivePpi,
                                    background: set.tbLayout.background === 'none' ? 'transparent' : set.tbLayout.background,
                                    overflow: 'hidden',
                                    zIndex: 10,
                                }}>
                                    <TitleblockRenderer
                                        layout={set.tbLayout}
                                        ctx={buildTbContext(activeSheet, selectedVp?.scaleFt ?? null)}
                                        ppi={effectivePpi}
                                        onElementDoubleClick={(el) => setEditingTbElement(el)}
                                    />
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* 2. Modernized Toolset (RIGHT RAIL) */}
                <aside className="w-80 flex-shrink-0 border-l border-gray-700/70 bg-gray-900/95 backdrop-blur-md p-3.5 overflow-y-auto space-y-4 shadow-2xl">
                    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/90 border border-gray-700/70 p-3.5 rounded-xl shadow-md">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                                Paperspace Studio
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">v26.10</span>
                        </div>
                        <h2 className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-cyan-300 mt-1">
                            Sheet View
                        </h2>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                            Plot sheets & paper space. Double-click viewports to activate model space and zoom extents.
                        </p>
                    </div>

                    {/* Section 1: Sheet Size & Paper */}
                    <section className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                                <span>📐</span> Paper Size
                            </h3>
                            <span className="text-[10px] text-gray-400 font-mono">{effW}″ × {effH}″</span>
                        </div>

                        <select
                            value={activeSheet.sheetId}
                            onChange={e => handleSheetSizeChange(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700/80 hover:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500 transition-colors"
                        >
                            {SHEET_PRESETS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>

                        {activeSheet.sheetId === 'custom' && (
                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-gray-400">
                                    Width (in)
                                    <input type="number" value={activeSheet.customW} min={1}
                                        onChange={e => updateActiveSheet({ customW: parseFloat(e.target.value) || 1 })}
                                        className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs"/>
                                </label>
                                <label className="text-[10px] text-gray-400">
                                    Height (in)
                                    <input type="number" value={activeSheet.customH} min={1}
                                        onChange={e => updateActiveSheet({ customH: parseFloat(e.target.value) || 1 })}
                                        className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs"/>
                                </label>
                            </div>
                        )}

                        <div className="flex items-center gap-1 pt-1">
                            <button
                                type="button"
                                onClick={() => updateActiveSheet({ landscape: true })}
                                className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                                    activeSheet.landscape
                                        ? 'bg-amber-600/30 text-amber-200 border border-amber-500/60 shadow-sm'
                                        : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-700/60'
                                }`}
                            >
                                ⤢ Landscape
                            </button>
                            <button
                                type="button"
                                onClick={() => updateActiveSheet({ landscape: false })}
                                className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                                    !activeSheet.landscape
                                        ? 'bg-amber-600/30 text-amber-200 border border-amber-500/60 shadow-sm'
                                        : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-700/60'
                                }`}
                            >
                                ⤡ Portrait
                            </button>
                        </div>
                    </section>

                    {/* Section 2: Viewports */}
                    <section className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                                <span>🔍</span> Viewports
                            </h3>
                            <div className="flex gap-1.5">
                                <button onClick={addViewport}
                                    type="button"
                                    className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 transition-colors"
                                    title="Add new plan viewport">
                                    + Plan
                                </button>
                                <button onClick={addProfileViewport}
                                    type="button"
                                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                                        profileData && profileData.length > 0
                                            ? 'bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40'
                                            : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
                                    }`}
                                    title={profileData && profileData.length > 0 ? 'Add profile viewport' : 'Generate profile in Profile Agent first'}
                                >
                                    + Profile
                                </button>
                            </div>
                        </div>

                        {/* Viewport selection pills */}
                        <div className="space-y-1.5">
                            {viewports.map(vp => (
                                <div key={vp.id}
                                    onClick={() => setSelectedVpId(vp.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between gap-1.5 transition-all ${
                                        vp.id === selectedVpId
                                            ? 'bg-cyan-950/70 border border-cyan-500/70 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                                            : 'bg-gray-900 border border-gray-700/60 hover:border-gray-500 text-gray-300'
                                    }`}>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                                        vp.type === 'profile' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-sky-900/60 text-sky-300'
                                    }`}>
                                        {vp.type === 'profile' ? 'PROFILE' : 'PLAN'}
                                    </span>
                                    <span className="font-mono text-[11px] truncate flex-1">{vp.id.slice(-6)}</span>
                                    <span className="text-gray-400 font-mono text-[10px]">
                                        {vp.type === 'profile' ? `1″=${vp.profileHScaleFt}′ V${vp.profileVExag}×` : `1″=${vp.scaleFt}′`}
                                    </span>
                                    {viewports.length > 1 && (
                                        <button onClick={e => { e.stopPropagation(); removeViewport(vp.id); }}
                                            className="text-gray-400 hover:text-rose-400 text-sm px-1" title="Remove viewport">×</button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Selected viewport actions & properties */}
                        {selectedVp && (
                            <div className="border-t border-gray-700/80 pt-2.5 space-y-2.5">
                                {/* Model Space & Quick Zoom Actions */}
                                <div className="space-y-1.5">
                                    <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 flex items-center justify-between">
                                        <span>Quick Navigation</span>
                                        {activeModelSpaceVpId === selectedVp.id ? (
                                            <span className="text-cyan-400 font-bold flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                Active MS
                                            </span>
                                        ) : (
                                            <span className="text-gray-500 text-[9px]">Double-click to activate</span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => zoomToLargestCluster(selectedVp.id)}
                                            className="w-full py-1.5 px-2 rounded-lg bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/50 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                                            title="Zoom to primary / largest cluster of points and lines"
                                        >
                                            <span>🎯</span> Largest Cluster
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => zoomExtents(selectedVp.id)}
                                            className="w-full py-1.5 px-2 rounded-lg bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white border border-cyan-500/50 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                                            title="Center all survey data (full extents)"
                                        >
                                            <span>⚡</span> Full Extents
                                        </button>
                                    </div>

                                    {/* Cluster picker list if multiple clusters detected */}
                                    {entityClusters.length > 1 && (
                                        <div className="pt-1">
                                            <div className="text-[10px] text-gray-400 mb-1 flex items-center justify-between">
                                                <span>Detected Point Clusters:</span>
                                                <span className="font-mono text-amber-400 text-[10px]">{entityClusters.length} clusters</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {entityClusters.slice(0, 4).map(c => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => zoomToCluster(c, selectedVp.id)}
                                                        className="px-2 py-0.5 rounded bg-gray-900 hover:bg-amber-600/20 text-gray-300 hover:text-amber-200 border border-gray-700/80 hover:border-amber-500/50 text-[10px] font-medium transition-colors"
                                                    >
                                                        C{c.id} ({c.count} pts)
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Scale Controls */}
                                {selectedVp.type === 'plan' && (
                                    <div className="space-y-1.5 pt-1 border-t border-gray-700/60">
                                        <div className="flex items-center justify-between text-[11px] text-gray-300">
                                            <span className="font-semibold">Drawing Scale</span>
                                            <span className="font-mono font-bold text-amber-300 text-xs">1″ = {selectedVp.scaleFt}′</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[20, 30, 40, 50, 60, 100, 200, 500].map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => updateVp(selectedVp.id, { scaleFt: s })}
                                                    className={`py-1 rounded text-[10px] font-mono font-medium transition-all ${
                                                        selectedVp.scaleFt === s
                                                            ? 'bg-amber-600/30 text-amber-200 border border-amber-500/70 font-bold'
                                                            : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-700/60'
                                                    }`}
                                                >
                                                    1″={s}′
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Profile Viewport specific controls */}
                                {selectedVp.type === 'profile' && (
                                    <div className="space-y-2 pt-1 border-t border-gray-700/60">
                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                            <label className="text-gray-400">
                                                Horiz. Scale
                                                <select
                                                    value={selectedVp.profileHScaleFt}
                                                    onChange={e => updateVp(selectedVp.id, { profileHScaleFt: parseInt(e.target.value, 10) })}
                                                    className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                                                >
                                                    {PROFILE_H_SCALES.map(s => (
                                                        <option key={s} value={s}>1″ = {s}′</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="text-gray-400">
                                                Vert. Exag
                                                <select
                                                    value={selectedVp.profileVExag}
                                                    onChange={e => updateVp(selectedVp.id, { profileVExag: parseInt(e.target.value, 10) })}
                                                    className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                                                >
                                                    {PROFILE_V_EXAG.map(x => (
                                                        <option key={x} value={x}>{x}×</option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                                                {/* Background Map Toggle Card (uses already visible & cached background imagery) */}
                                {selectedVp.type === 'plan' && (
                                    <div className="border border-gray-700/80 rounded-lg p-2.5 bg-gray-900/80 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                                                <span>🗺️</span> Background Map
                                            </span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedVp.showBasemap ?? false}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        updateVp(selectedVp.id, { showBasemap: checked });
                                                        if (checked) {
                                                            fetchBasemapForVp({ ...selectedVp, showBasemap: true });
                                                        }
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-7 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </label>
                                        </div>

                                        {selectedVp.showBasemap && (
                                            <div className="space-y-2 text-xs pt-1.5 border-t border-gray-800">
                                                <label className="block text-gray-400 text-[10px]">
                                                    Opacity ({Math.round((selectedVp.basemapOpacity ?? 0.8) * 100)}%)
                                                    <input
                                                        type="range"
                                                        min={0.1}
                                                        max={1.0}
                                                        step={0.05}
                                                        value={selectedVp.basemapOpacity ?? 0.8}
                                                        onChange={e => updateVp(selectedVp.id, { basemapOpacity: parseFloat(e.target.value) })}
                                                        className="w-full mt-1.5"
                                                    />
                                                </label>
                                                <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                                                    <span>PDF Plot: <strong className="text-emerald-400 font-semibold">Included</strong></span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void clearMapCache();
                                                                clearStaticMapsCache();
                                                                setBasemapCache({});
                                                                fetchingBasemapsRef.current.clear();
                                                                fetchBasemapForVp(selectedVp);
                                                            }}
                                                            className="text-amber-400 hover:text-amber-300 underline font-medium text-[10px]"
                                                            title="Dump map cache and reload fresh imagery"
                                                        >
                                                            🗑️ Dump Cache
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => fetchBasemapForVp(selectedVp)}
                                                            className="text-cyan-400 hover:text-cyan-300 underline font-medium text-[10px]"
                                                        >
                                                            ↻ Refresh
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* View Orientation & Rotation Card */}
                                <div className="border border-gray-700/80 rounded-lg p-2.5 bg-gray-900/80 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                                            <span>🔄</span> View Rotation
                                        </span>
                                        <span className="font-mono text-xs text-purple-200 font-bold">
                                            {getEffectiveVpRotation(selectedVp)}°
                                        </span>
                                    </div>

                                    {/* Lock to Model Space Orientation toggle */}
                                    <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                                        <label className="text-[10px] text-gray-300 flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedVp.lockRotationToModelSpace ?? false}
                                                onChange={e => updateVp(selectedVp.id, { lockRotationToModelSpace: e.target.checked })}
                                                className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-0"
                                            />
                                            <span className="font-medium">Match Model Space ({msAngleDeg}°)</span>
                                        </label>
                                        {selectedVp.lockRotationToModelSpace && (
                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                                                LOCKED TO MS
                                            </span>
                                        )}
                                    </div>

                                    {/* Manual Rotation Controls (when not locked to MS) */}
                                    {!selectedVp.lockRotationToModelSpace && (
                                        <div className="space-y-1.5 pt-1 border-t border-gray-800/80">
                                            <div className="grid grid-cols-4 gap-1">
                                                {[0, 90, 180, 270].map(deg => (
                                                    <button
                                                        key={deg}
                                                        type="button"
                                                        onClick={() => updateVp(selectedVp.id, { rotationDeg: deg })}
                                                        className={`py-1 rounded text-[10px] font-mono font-medium transition-all ${
                                                            (selectedVp.rotationDeg ?? 0) === deg
                                                                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/70 font-bold'
                                                                : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                                                        }`}
                                                    >
                                                        {deg}°
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 pt-1">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="360"
                                                    step="1"
                                                    value={selectedVp.rotationDeg ?? 0}
                                                    onChange={e => updateVp(selectedVp.id, { rotationDeg: parseInt(e.target.value, 10) || 0 })}
                                                    className="flex-1"
                                                />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="360"
                                                    value={selectedVp.rotationDeg ?? 0}
                                                    onChange={e => updateVp(selectedVp.id, { rotationDeg: parseInt(e.target.value, 10) || 0 })}
                                                    className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right font-mono"
                                                />
                                                <span className="text-gray-400 text-xs">deg</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Graphics Style Expander */}
                                {(() => {
                                    const vpStyle = selectedVp.style ?? DEFAULT_VP_STYLE;
                                    return (
                                        <div className="border border-gray-700/80 rounded-lg p-2 bg-gray-900/80">
                                            <button
                                                type="button"
                                                onClick={() => setStyleExpanded(v => !v)}
                                                className="w-full flex items-center justify-between text-[11px] font-semibold text-gray-300 hover:text-white"
                                            >
                                                <span>🎨 Viewport Styling</span>
                                                <span className="text-gray-400">{styleExpanded ? '▲' : '▼'}</span>
                                            </button>
                                            {styleExpanded && (
                                                <div className="space-y-2 pt-2 mt-2 border-t border-gray-800 text-[11px]">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <label className="text-gray-400">Line weight (pt)
                                                            <input type="number" step="0.25" min={0.25} max={3}
                                                                value={vpStyle.lineWeightPt}
                                                                onChange={e => updateVpStyle(selectedVp.id, { lineWeightPt: parseFloat(e.target.value) || 0.5 })}
                                                                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs"/>
                                                        </label>
                                                        <label className="text-gray-400">Text size (pt)
                                                            <input type="number" step="1" min={4} max={24}
                                                                value={vpStyle.textSizePt}
                                                                onChange={e => updateVpStyle(selectedVp.id, { textSizePt: parseInt(e.target.value, 10) || 6 })}
                                                                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs"/>
                                                        </label>
                                                    </div>
                                                    {selectedVp.type === 'plan' && (
                                                        <label className="flex items-center gap-2 text-gray-300">
                                                            <input type="checkbox" checked={vpStyle.showNorthArrow}
                                                                onChange={e => updateVpStyle(selectedVp.id, { showNorthArrow: e.target.checked })}/>
                                                            Show North arrow
                                                        </label>
                                                    )}
                                                    <label className="flex items-center gap-2 text-gray-300">
                                                        <input type="checkbox" checked={vpStyle.showScaleBar}
                                                            onChange={e => updateVpStyle(selectedVp.id, { showScaleBar: e.target.checked })}/>
                                                            Show Scale bar
                                                        </label>
                                                    </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Layer Visibility (Plan only) */}
                                {selectedVp.type === 'plan' && (
                                    <div className="border border-gray-700/80 rounded-lg p-2 bg-gray-900/80 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-300">Visible Layers</span>
                                            <div className="flex gap-1">
                                                <button onClick={() => updateVp(selectedVp.id, { hiddenLayers: [] })}
                                                    type="button"
                                                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300" title="Show all">All</button>
                                                <button onClick={() => updateVp(selectedVp.id, { hiddenLayers: [...availableLayers] })}
                                                    type="button"
                                                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300" title="Hide all">None</button>
                                            </div>
                                        </div>
                                        <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                                            {availableLayers.length === 0 && (
                                                <div className="text-[10px] text-gray-500 italic px-1">No layers detected.</div>
                                            )}
                                            {availableLayers.map(key => {
                                                const hidden = selectedVp.hiddenLayers.includes(key);
                                                const swatch = layerColors[key]
                                                    ?? (key.startsWith('*') ? (typeDefaultColor[key.slice(1).toLowerCase()] ?? '#888') : '#888');
                                                return (
                                                    <label key={key} className="flex items-center gap-1.5 text-[11px] text-gray-300 hover:text-white cursor-pointer hover:bg-gray-800/80 rounded px-1.5 py-0.5">
                                                        <input type="checkbox" checked={!hidden}
                                                            onChange={() => toggleLayerInVp(selectedVp.id, key)}/>
                                                        <span style={{ width: 9, height: 9, background: swatch, display: 'inline-block', borderRadius: 2 }}/>
                                                        <span className={`flex-1 truncate font-mono text-[10px] ${key.startsWith('*') ? 'italic text-gray-400' : ''}`}>{key}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                                        {/* Section: Graphic Scale Bar */}
                    <section className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                                <span>📏</span> Graphic Scale Bar
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={activeSheet.scaleBar?.enabled ?? true}
                                    onChange={e => updateActiveSheet(s => ({
                                        scaleBar: {
                                            ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                            enabled: e.target.checked,
                                        }
                                    }))}
                                    className="sr-only peer"
                                />
                                <div className="w-7 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                        </div>

                        {activeSheet.scaleBar?.enabled !== false && (
                            <div className="space-y-2 text-xs pt-1.5 border-t border-gray-800">
                                <label className="block text-gray-400 text-[10px]">
                                    Linked Viewport Scale
                                    <select
                                        value={activeSheet.scaleBar?.viewportId ?? activeSheet.viewports[0]?.id}
                                        onChange={e => updateActiveSheet(s => ({
                                            scaleBar: {
                                                ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                viewportId: e.target.value,
                                            }
                                        }))}
                                        className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200"
                                    >
                                        {activeSheet.viewports.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.type === 'profile' ? `Profile (1"=${v.profileHScaleFt}')` : `Plan (1"=${v.scaleFt}')`} - {v.id.slice(-6)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="space-y-1">
                                    <span className="text-gray-400 text-[10px]">Scale Bar Style</span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {[
                                            { id: 'subdivided-blocks', label: 'Checkered Blocks' },
                                            { id: 'classic-ticks', label: 'Classic Ticks' },
                                            { id: 'dual-bar', label: 'Dual Feet/Meters' },
                                            { id: 'minimal-modern', label: 'Minimal Modern' },
                                        ].map(st => (
                                            <button
                                                key={st.id}
                                                type="button"
                                                onClick={() => updateActiveSheet(s => ({
                                                    scaleBar: {
                                                        ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                        style: st.id as any,
                                                    }
                                                }))}
                                                className={`py-1 px-2 rounded-md text-[10px] font-medium transition-all ${
                                                    (activeSheet.scaleBar?.style ?? 'subdivided-blocks') === st.id
                                                        ? 'bg-amber-600/30 text-amber-200 border border-amber-500/70 font-bold'
                                                        : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-700'
                                                }`}
                                            >
                                                {st.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                                    <label>
                                        Length on Paper (in)
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="1"
                                            max="8"
                                            value={activeSheet.scaleBar?.widthIn ?? 3.0}
                                            onChange={e => updateActiveSheet(s => ({
                                                scaleBar: {
                                                    ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                    widthIn: parseFloat(e.target.value) || 3.0,
                                                }
                                            }))}
                                            className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200"
                                        />
                                    </label>
                                    <label>
                                        Major Divisions
                                        <input
                                            type="number"
                                            min="1"
                                            max="8"
                                            value={activeSheet.scaleBar?.divisions ?? 3}
                                            onChange={e => updateActiveSheet(s => ({
                                                scaleBar: {
                                                    ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                    divisions: parseInt(e.target.value, 10) || 3,
                                                }
                                            }))}
                                            className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200"
                                        />
                                    </label>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <label className="flex items-center gap-1.5 text-gray-300 text-[11px] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={activeSheet.scaleBar?.showNumericScale ?? true}
                                            onChange={e => updateActiveSheet(s => ({
                                                scaleBar: {
                                                    ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                    showNumericScale: e.target.checked,
                                                }
                                            }))}
                                        />
                                        Include 1" = X' Text
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => updateActiveSheet(s => ({
                                            scaleBar: {
                                                ...(s.scaleBar ?? makeDefaultScaleBar(s.viewports[0]?.id ?? '')),
                                                xIn: 1.5,
                                                yIn: effH - 3.2,
                                            }
                                        }))}
                                        className="text-[10px] text-amber-400 hover:text-amber-300 underline"
                                    >
                                        Reset Position
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    💡 Drag the scale bar directly on the paper canvas to position it anywhere.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Section 3: Titleblock Information */}
                    <section className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 shadow-sm space-y-2.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                            <span>🏷️</span> Titleblock Fields
                        </h3>
                        <div className="space-y-1.5 text-xs">
                            <input className="w-full bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-xs text-gray-200"
                                value={activeSheet.tbFields.projectName}
                                onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, projectName: e.target.value } }))}
                                placeholder="Project Name" />
                            <div className="grid grid-cols-2 gap-1.5">
                                <input className="w-full bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-xs text-gray-200"
                                    value={activeSheet.tbFields.sheetNumber}
                                    onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, sheetNumber: e.target.value } }))}
                                    placeholder="Sheet # (C-001)" />
                                <input className="w-full bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-xs text-gray-200"
                                    value={activeSheet.tbFields.drawnBy}
                                    onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, drawnBy: e.target.value } }))}
                                    placeholder="Drawn by" />
                            </div>
                            <input className="w-full bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-xs text-gray-200"
                                value={activeSheet.tbFields.date}
                                onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, date: e.target.value } }))}
                                placeholder="Date" />
                            <textarea className="w-full bg-gray-900 border border-gray-700/80 rounded-lg px-2.5 py-1 text-xs text-gray-200" rows={2}
                                value={activeSheet.tbFields.notes}
                                onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, notes: e.target.value } }))}
                                placeholder="Notes / firm disclaimer" />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                type="button"
                                onClick={() => updateSet({ tbLayout: createDefaultVerticalTitleblockLayout(effH - 1.0) })}
                                className="py-1.5 px-2 text-[10px] font-bold rounded-lg bg-cyan-700/40 hover:bg-cyan-600 text-cyan-200 hover:text-white border border-cyan-500/50 transition-all flex items-center justify-center gap-1"
                                title="Set to industry standard vertical titleblock running down the right edge of the sheet">
                                <span>📐</span> Vertical Right
                            </button>
                            <button
                                type="button"
                                onClick={() => updateSet({ tbLayout: DEFAULT_TITLEBLOCK_LAYOUT })}
                                className="py-1.5 px-2 text-[10px] font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-all"
                                title="Reset to classic bottom-right corner box">
                                Corner Box
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setTbEditorOpen(true)}
                            className="w-full py-1.5 px-2 text-[11px] rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/50 font-semibold transition-all">
                            ✎ Edit Titleblock Layout…
                        </button>
                        <div className="flex gap-2">
                            <input ref={tbDxfRef} type="file" accept=".dxf" className="hidden" onChange={handleTbDxfUpload} />
                            <button onClick={() => tbDxfRef.current?.click()}
                                type="button"
                                className="flex-1 py-1 px-2 text-[10px] rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 font-medium transition-all">
                                Upload .dxf border
                            </button>
                            <button onClick={() => updateSet({ tbLayout: DEFAULT_TITLEBLOCK_LAYOUT })}
                                type="button"
                                className="py-1 px-2 text-[10px] rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700" title="Reset layout">
                                Reset
                            </button>
                        </div>
                    </section>

                    {/* Section 4: Export to PDF */}
                    <section className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 shadow-sm space-y-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                            <span>🖨️</span> Publish & Export
                        </h3>
                        <button onClick={handleExportCurrentPdf}
                            type="button"
                            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5">
                            <span>📄</span> Export This Sheet (PDF)
                        </button>
                        <button onClick={handleExportSetPdf}
                            type="button"
                            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5">
                            <span>📚</span> Export Complete Set ({totalSheets} {totalSheets === 1 ? 'Page' : 'Pages'})
                        </button>
                        <div className="text-[10px] text-gray-500 italic text-center pt-1">
                            Persisted automatically per project name.
                        </div>
                    </section>
                </aside>
            </div>

                        {/* Double-click Titleblock Entity Editor Modal */}
            {editingTbElement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl p-5 max-w-md w-full space-y-4 text-xs">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
                            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                                <span>✎</span> Edit Titleblock Entity ({editingTbElement.id})
                            </h3>
                            <button
                                type="button"
                                onClick={() => setEditingTbElement(null)}
                                className="text-gray-400 hover:text-white text-base font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {editingTbElement.type === 'text' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">
                                        Text Content / Placeholder
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={editingTbElement.text}
                                        onChange={e => setEditingTbElement({ ...editingTbElement, text: e.target.value })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                                    />
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {['{PROJECT_NAME}', '{SHEET_NUMBER}', '{DRAWN_BY}', '{DATE}', '{SCALE}', '{PAGE_OF}', '{NOTES}'].map(ph => (
                                            <button
                                                key={ph}
                                                type="button"
                                                onClick={() => setEditingTbElement({ ...editingTbElement, text: (editingTbElement.text ? editingTbElement.text + ' ' : '') + ph })}
                                                className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-cyan-300 text-[10px] font-mono border border-gray-700"
                                            >
                                                {ph}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] text-gray-400 block">
                                        Font Size (pt)
                                        <input
                                            type="number"
                                            min={4}
                                            max={48}
                                            value={editingTbElement.fontSize}
                                            onChange={e => setEditingTbElement({ ...editingTbElement, fontSize: parseFloat(e.target.value) || 8 })}
                                            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
                                        />
                                    </label>
                                    <label className="text-[10px] text-gray-400 block">
                                        Font Weight
                                        <select
                                            value={editingTbElement.fontWeight}
                                            onChange={e => setEditingTbElement({ ...editingTbElement, fontWeight: e.target.value as any })}
                                            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] text-gray-400 block">
                                        Alignment
                                        <select
                                            value={editingTbElement.align}
                                            onChange={e => setEditingTbElement({ ...editingTbElement, align: e.target.value as any })}
                                            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
                                        >
                                            <option value="left">Left</option>
                                            <option value="center">Center</option>
                                            <option value="right">Right</option>
                                        </select>
                                    </label>
                                    <label className="text-[10px] text-gray-400 block">
                                        Rotation
                                        <select
                                            value={editingTbElement.rotation || 0}
                                            onChange={e => setEditingTbElement({ ...editingTbElement, rotation: parseInt(e.target.value, 10) || 0 })}
                                            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
                                        >
                                            <option value={0}>0° (Horizontal)</option>
                                            <option value={-90}>-90° (Vertical CCW)</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!confirm(`Delete entity "${editingTbElement.id}" from titleblock?`)) return;
                                    updateSet({
                                        tbLayout: {
                                            ...set.tbLayout,
                                            elements: set.tbLayout.elements.filter(el => el.id !== editingTbElement.id),
                                        },
                                    });
                                    setEditingTbElement(null);
                                }}
                                className="px-2.5 py-1 text-[11px] rounded-lg bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border border-rose-700/50"
                            >
                                Delete
                            </button>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingTbElement(null)}
                                    className="px-3 py-1 text-[11px] rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        updateSet({
                                            tbLayout: {
                                                ...set.tbLayout,
                                                elements: set.tbLayout.elements.map(el =>
                                                    el.id === editingTbElement.id ? editingTbElement : el
                                                ),
                                            },
                                        });
                                        setEditingTbElement(null);
                                    }}
                                    className="px-3.5 py-1 text-[11px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
                                >
                                    Save Entity
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tbEditorOpen && (
                <TitleblockEditor
                    layout={set.tbLayout}
                    ctx={buildTbContext(activeSheet, selectedVp?.scaleFt ?? null)}
                    onSave={(next) => updateSet({ tbLayout: next })}
                    onClose={() => setTbEditorOpen(false)}
                />
            )}
        </div>
    );
};

function escapeXml(s: string): string {
    return (s || '').replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

export default SheetView;
