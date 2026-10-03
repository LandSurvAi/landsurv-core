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
import { useErrorReporter } from '../contexts/AppStateContext';
import {
    TitleblockEditor,
    TitleblockRenderer,
    titleblockToSvgMarkup,
    DEFAULT_TITLEBLOCK_LAYOUT,
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
    // Fill 90% of the sheet, centered
    const marginW = ARCH_D_WIDTH * 0.05;
    const marginH = ARCH_D_HEIGHT * 0.05;
    const wIn = ARCH_D_WIDTH * 0.90;
    const hIn = ARCH_D_HEIGHT * 0.90;
    const xIn = marginW;
    const yIn = marginH;
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
});

const makeDefaultSet = (projectName: string): SheetSet => {
    const first = makeDefaultSheet('Sheet 1', 'C-001', projectName);
    return { tbLayout: DEFAULT_TITLEBLOCK_LAYOUT, sheets: [first], activeSheetId: first.id };
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
});

const loadSet = (projectName?: string): SheetSet | null => {
    try {
        const raw = localStorage.getItem(storageKeyFor(projectName));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
            // Migrate all viewports in every sheet so old data never crashes new code
            parsed.sheets = (parsed.sheets as Record<string, unknown>[]).map((sh: Record<string, unknown>) => ({
                ...sh,
                viewports: Array.isArray(sh.viewports)
                    ? (sh.viewports as Record<string, unknown>[]).map(migrateViewport)
                    : [makeDefaultViewport()],
            }));
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

const SheetView: React.FC<SheetViewProps> = ({ points, lines, projectName, cadLayerColors, profileData, profileInfo, onSheetViewCommand }) => {
    const layerColors = cadLayerColors ?? {};
    const { reportError } = useErrorReporter();

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

    // ── Auto-scale: pick a good scale when survey data first loads ────────
    const hasAutoScaledRef = useRef(false);
    // Reset the flag when a new project is loaded so the new points get fitted.
    useEffect(() => { hasAutoScaledRef.current = false; }, [projectName]);
    useEffect(() => {
        if (!extents || hasAutoScaledRef.current) return;
        hasAutoScaledRef.current = true;
        setSet(prev => ({
            ...prev,
            sheets: prev.sheets.map(sheet => ({
                ...sheet,
                viewports: sheet.viewports.map(v =>
                    v.centerE !== null
                        ? v
                        : { ...v, scaleFt: computeGoodScale(v.wIn, v.hIn, extents) }
                ),
            })),
        }));
    // hasAutoScaledRef is a ref (mutable) — intentionally not in deps
     
    }, [extents]);

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

    // ── Sheet display PPI ─────────────────────────────────────────────────
    const sheetContainerRef = useRef<HTMLDivElement>(null);
    const [ppi, setPpi] = useState<number>(48);
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
    const buildProfileVpSvg = (vp: Viewport): React.ReactElement => {
        const wpx = vp.wIn * ppi;
        const hpx = vp.hIn * ppi;
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
        const marginL = 0.5 * ppi, marginR = 0.25 * ppi;
        const marginT = 0.15 * ppi, marginB = 0.4 * ppi;
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
        const stationPaperFt = (chartW / ppi) * hScaleFt;
        // Vertical: elevRange / hScaleFt * vExag = vertical paper-inches
        const elevPaperIn = (elevRange / hScaleFt) * vExag;
        // If it would overflow chartH, clip gracefully
        const elevScale = Math.min(chartH / (elevPaperIn * ppi), chartH / 2) * (ppi / ppi);

        const stToPx = (st: number) =>
            marginL + ((st - stMin) / stationRange) * chartW;
        const elevToPx = (el: number) => {
            const paperIn = ((el - elevMin) / hScaleFt) * vExag;
            return hpx - marginB - Math.min(paperIn * ppi * (chartH / (elevPaperIn * ppi + 1)), chartH);
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
    const buildVpSvg = (vp: Viewport): React.ReactElement => {
        if (vp.type === 'profile') return buildProfileVpSvg(vp);
        const worldFtPerInch = vp.scaleFt;
        const wpx = vp.wIn * ppi;
        const hpx = vp.hIn * ppi;
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
            ((e - worldMinE) / worldFtPerInch) * ppi,
            ((worldMaxN - n) / worldFtPerInch) * ppi,
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
                const offY = -(l.labelOffset?.y || 0) / worldFtPerInch * ppi;
                const offXpx = offX / worldFtPerInch * ppi;
                // Target ~2ft tall in world units, but clamp for legibility.
                const fontPx = Math.max(4, Math.min(9, 2 / worldFtPerInch * ppi));
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

        return (
            <svg width={wpx} height={hpx} viewBox={`0 0 ${wpx} ${hpx}`} style={{ display: 'block', background: '#fff' }}>
                {lineEls}{pointEls}
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
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="0 0 ${wpx} ${hpx}"><rect x="0" y="0" width="${wpx}" height="${hpx}" fill="#fff"/>${parts.join('')}</svg>`;
        };

        const tbX = (eW - set.tbLayout.widthIn - 0.25) * pdfPpi;
        const tbY = (eH - set.tbLayout.heightIn - 0.25) * pdfPpi;
        const vpGroups = sheet.viewports.map(vp => {
            const x = vp.xIn * pdfPpi;
            const y = vp.yIn * pdfPpi;
            const inner = renderVpAt(vp);
            return `<g transform="translate(${x},${y})"><rect x="0" y="0" width="${vp.wIn * pdfPpi}" height="${vp.hIn * pdfPpi}" fill="none" stroke="#111" stroke-width="1.5" />${inner}<text x="4" y="${vp.hIn * pdfPpi - 4}" font-size="10" font-family="monospace" fill="#444">1" = ${vp.scaleFt}'</text></g>`;
        }).join('');

        const tbCtx = buildTbContext(sheet, sheet.viewports[0]?.scaleFt ?? null);
        const tbSvgInner = titleblockToSvgMarkup(set.tbLayout, tbCtx, pdfPpi);
        const tbBlock = `<g transform="translate(${tbX},${tbY})">${tbSvgInner}</g>`;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetPxW}" height="${sheetPxH}" viewBox="0 0 ${sheetPxW} ${sheetPxH}">
            <rect x="0" y="0" width="${sheetPxW}" height="${sheetPxH}" fill="#fff" />
            ${vpGroups}
            ${tbBlock}
        </svg>`;
        return { svg, widthPx: sheetPxW, heightPx: sheetPxH };
    }, [set.tbLayout, points, lines, extents, layerColors, buildTbContext]);

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
    }, [activeSheet, effW, effH, buildSheetSvg, reportError]);

    const handleExportSetPdf = useCallback(async () => {
        const pdfPpi = 100;
        let pdf: jsPDF | null = null;
        try {
            for (let i = 0; i < set.sheets.length; i++) {
                const sheet = set.sheets[i];
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
    }, [set.sheets, activeSheet, buildSheetSvg, reportError]);

    // ── Viewport drag-to-move / Shift+drag-to-pan / edge-resize ───────────
    // dragRef supports three modes: 'move' (default), 'pan' (Shift+drag),
    // and 'resize' (edge/corner handles).
    type DragState =
        | { type: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
        | { type: 'pan'; id: string; startX: number; startY: number; origCenterE: number | null; origCenterN: number | null; fallbackE: number; fallbackN: number }
        | { type: 'resize'; id: string; dir: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number };
    const dragRef = useRef<DragState | null>(null);

    const onVpMouseDown = (e: React.MouseEvent, vp: Viewport) => {
        e.stopPropagation();
        setSelectedVpId(vp.id);
        if ((e.ctrlKey || e.metaKey) && vp.type === 'plan') {
            // Ctrl+drag (or Cmd+drag on Mac) = pan viewport contents (adjust centerE/centerN).
            // If center is null (auto-fit), seed it from current extents so panning works.
            const fallbackE = extents ? (extents.minE + extents.maxE) / 2 : 0;
            const fallbackN = extents ? (extents.minN + extents.maxN) / 2 : 0;
            dragRef.current = {
                type: 'pan', id: vp.id,
                startX: e.clientX, startY: e.clientY,
                origCenterE: vp.centerE, origCenterN: vp.centerN,
                fallbackE, fallbackN,
            };
        } else {
            dragRef.current = {
                type: 'move', id: vp.id,
                startX: e.clientX, startY: e.clientY,
                origX: vp.xIn, origY: vp.yIn,
            };
        }
        const onMove = (ev: MouseEvent) => {
            const st = dragRef.current; if (!st) return;
            if (st.type === 'move') {
                const dxIn = (ev.clientX - st.startX) / ppi;
                const dyIn = (ev.clientY - st.startY) / ppi;
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

    // Mouse down on a resize handle (corner or edge).
    const onVpResizeMouseDown = (e: React.MouseEvent, vp: Viewport, dir: string) => {
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
            const dxIn = (ev.clientX - st.startX) / ppi;
            const dyIn = (ev.clientY - st.startY) / ppi;
            let x = st.origX, y = st.origY, w = st.origW, h = st.origH;
            if (st.dir.includes('e')) {
                w = Math.max(MIN, st.origW + dxIn);
            }
            if (st.dir.includes('w')) {
                const newW = Math.max(MIN, st.origW - dxIn);
                x = st.origX + (st.origW - newW);
                w = newW;
            }
            if (st.dir.includes('s')) {
                h = Math.max(MIN, st.origH + dyIn);
            }
            if (st.dir.includes('n')) {
                const newH = Math.max(MIN, st.origH - dyIn);
                y = st.origY + (st.origH - newH);
                h = newH;
            }
            // Clamp inside sheet
            if (x < 0) { w += x; x = 0; }
            if (y < 0) { h += y; y = 0; }
            if (x + w > effW) w = effW - x;
            if (y + h > effH) h = effH - y;
            w = Math.max(MIN, w); h = Math.max(MIN, h);
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

            <div className="flex flex-1 min-h-0 w-full">
            {/* Left tools rail */}
            <aside className="w-72 flex-shrink-0 border-r border-gray-700 p-3 overflow-y-auto space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-amber-400">Sheet View</h2>
                    <p className="text-[11px] text-gray-400">Paper space. Changes auto-save per project.</p>
                </div>

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sheet Size</h3>
                    <select
                        value={activeSheet.sheetId}
                        onChange={e => handleSheetSizeChange(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                    >
                        {SHEET_PRESETS.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                    {activeSheet.sheetId === 'custom' && (
                        <div className="flex gap-2">
                            <label className="flex-1 text-[11px] text-gray-400">
                                W (in)
                                <input type="number" value={activeSheet.customW} min={1}
                                    onChange={e => updateActiveSheet({ customW: parseFloat(e.target.value) || 1 })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs"/>
                            </label>
                            <label className="flex-1 text-[11px] text-gray-400">
                                H (in)
                                <input type="number" value={activeSheet.customH} min={1}
                                    onChange={e => updateActiveSheet({ customH: parseFloat(e.target.value) || 1 })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs"/>
                            </label>
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-[11px] text-gray-300">
                        <input type="checkbox" checked={activeSheet.landscape}
                            onChange={e => updateActiveSheet({ landscape: e.target.checked })}/>
                        Landscape
                    </label>
                </section>

                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Viewports</h3>
                        <div className="flex gap-1">
                            <button onClick={addViewport}
                                className="px-2 py-0.5 text-[11px] rounded bg-sky-700/40 text-sky-200 hover:bg-sky-600/60"
                                title="Add plan viewport">
                                + Plan
                            </button>
                            <button onClick={addProfileViewport}
                                className={`px-2 py-0.5 text-[11px] rounded ${profileData && profileData.length > 0 ? 'bg-emerald-700/40 text-emerald-100 hover:bg-emerald-600/60' : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'}`}
                                title={profileData && profileData.length > 0 ? 'Add profile viewport from Profile Agent data' : 'Generate a profile in the Profile Agent first'}
                            >
                                + Profile
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1">
                        {viewports.map(vp => (
                            <div key={vp.id}
                                onClick={() => setSelectedVpId(vp.id)}
                                className={`px-2 py-1 rounded text-[11px] cursor-pointer flex items-center justify-between gap-1 ${
                                    vp.id === selectedVpId
                                        ? 'bg-amber-900/40 border border-amber-500/60'
                                        : 'bg-gray-800 border border-transparent hover:border-gray-600'
                                }`}>
                                <span className={`text-[9px] px-1 rounded font-mono uppercase ${vp.type === 'profile' ? 'bg-emerald-800/60 text-emerald-300' : 'bg-sky-900/50 text-sky-300'}`}>
                                    {vp.type === 'profile' ? 'PROF' : 'PLAN'}
                                </span>
                                <span className="font-mono truncate flex-1">{vp.id.slice(-6)}</span>
                                <span className="text-gray-400 text-[10px]">
                                    {vp.type === 'profile' ? `1"=${vp.profileHScaleFt}' V${vp.profileVExag}×` : `1"=${vp.scaleFt}'`}
                                </span>
                                {viewports.length > 1 && (
                                    <button onClick={e => { e.stopPropagation(); removeViewport(vp.id); }}
                                        className="text-red-400 hover:text-red-300" title="Remove viewport">×</button>
                                )}
                            </div>
                        ))}
                    </div>

                    {selectedVp && (
                        <div className="border-t border-gray-700 pt-2 space-y-1">
                            <div className="text-[11px] text-gray-400 flex items-center gap-2">
                                Selected viewport
                                <span className={`text-[9px] px-1 rounded ${selectedVp.type === 'profile' ? 'bg-emerald-800/60 text-emerald-300' : 'bg-sky-900/50 text-sky-300'}`}>
                                    {selectedVp.type === 'profile' ? 'PROFILE' : 'PLAN'}
                                </span>
                                {selectedVp.type === 'plan' && (
                                    <button onClick={() => updateVp(selectedVp.id, { type: 'profile' })}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600 ml-auto">
                                        → Profile
                                    </button>
                                )}
                                {selectedVp.type === 'profile' && (
                                    <button onClick={() => updateVp(selectedVp.id, { type: 'plan' })}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600 ml-auto">
                                        → Plan
                                    </button>
                                )}
                            </div>

                            {/* Plan viewport controls */}
                            {selectedVp.type === 'plan' && (<>
                            <div className="grid grid-cols-2 gap-1 text-[11px]">
                                <label className="text-gray-400">X (in)
                                    <input type="number" step="0.1" value={selectedVp.xIn}
                                        onChange={e => updateVp(selectedVp.id, { xIn: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">Y (in)
                                    <input type="number" step="0.1" value={selectedVp.yIn}
                                        onChange={e => updateVp(selectedVp.id, { yIn: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">W (in)
                                    <input type="number" step="0.1" value={selectedVp.wIn}
                                        onChange={e => updateVp(selectedVp.id, { wIn: parseFloat(e.target.value) || 0.5 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">H (in)
                                    <input type="number" step="0.1" value={selectedVp.hIn}
                                        onChange={e => updateVp(selectedVp.id, { hIn: parseFloat(e.target.value) || 0.5 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                            </div>
                            <label className="block text-[11px] text-gray-400">
                                Scale (1" = N')
                                <select value={selectedVp.scaleFt}
                                    onChange={e => updateVp(selectedVp.id, { scaleFt: parseInt(e.target.value, 10) })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                                    {ENGINEER_SCALES.map(s => <option key={s} value={s}>1" = {s}'</option>)}
                                </select>
                            </label>
                            <div className="grid grid-cols-2 gap-1 text-[11px]">
                                <label className="text-gray-400">Center E
                                    <input type="number" step="any"
                                        value={selectedVp.centerE ?? ''} placeholder="auto"
                                        onChange={e => { const v = e.target.value.trim(); updateVp(selectedVp.id, { centerE: v === '' ? null : parseFloat(v) }); }}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">Center N
                                    <input type="number" step="any"
                                        value={selectedVp.centerN ?? ''} placeholder="auto"
                                        onChange={e => { const v = e.target.value.trim(); updateVp(selectedVp.id, { centerN: v === '' ? null : parseFloat(v) }); }}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                            </div>
                            <button onClick={() => updateVp(selectedVp.id, { centerE: null, centerN: null })}
                                className="w-full text-[11px] px-2 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/70">
                                Reset to auto-fit
                            </button>
                            <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-1">
                                <input type="checkbox" checked={selectedVp.hidePoints}
                                    onChange={e => updateVp(selectedVp.id, { hidePoints: e.target.checked })}/>
                                Hide points in this viewport
                            </label>
                            </>)}

                            {/* Profile viewport controls */}
                            {selectedVp.type === 'profile' && (<>
                            <div className="grid grid-cols-2 gap-1 text-[11px]">
                                <label className="text-gray-400">X (in)
                                    <input type="number" step="0.1" value={selectedVp.xIn}
                                        onChange={e => updateVp(selectedVp.id, { xIn: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">Y (in)
                                    <input type="number" step="0.1" value={selectedVp.yIn}
                                        onChange={e => updateVp(selectedVp.id, { yIn: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">W (in)
                                    <input type="number" step="0.1" value={selectedVp.wIn}
                                        onChange={e => updateVp(selectedVp.id, { wIn: parseFloat(e.target.value) || 0.5 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                                <label className="text-gray-400">H (in)
                                    <input type="number" step="0.1" value={selectedVp.hIn}
                                        onChange={e => updateVp(selectedVp.id, { hIn: parseFloat(e.target.value) || 0.5 })}
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                </label>
                            </div>
                            <label className="block text-[11px] text-gray-400">
                                Horizontal scale (1" = N')
                                <select value={selectedVp.profileHScaleFt}
                                    onChange={e => updateVp(selectedVp.id, { profileHScaleFt: parseInt(e.target.value, 10) })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                                    {PROFILE_H_SCALES.map(s => <option key={s} value={s}>H: 1" = {s}'</option>)}
                                </select>
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                Vertical exaggeration
                                <select value={selectedVp.profileVExag}
                                    onChange={e => updateVp(selectedVp.id, { profileVExag: parseInt(e.target.value, 10) })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                                    {PROFILE_V_EXAG.map(v => <option key={v} value={v}>V.E. {v}×</option>)}
                                </select>
                            </label>
                            {profileInfo && (
                                <div className="text-[10px] text-gray-400 italic px-1">
                                    Source: {profileInfo.name} ({profileInfo.type})
                                    {profileData ? ` — ${profileData.length} stations` : ''}
                                </div>
                            )}
                            {(!profileData || profileData.length === 0) && (
                                <div className="text-[10px] text-yellow-500 px-1">
                                    ⚠ No profile data. Generate in Profile Agent → switch back here.
                                </div>
                            )}
                            </>)}

                            {/* ── Style sub-panel ── */}
                            {(() => {
                                const vpStyle: ViewportStyle = { ...DEFAULT_VP_STYLE, ...(selectedVp.style ?? {}) };
                                return (
                            <div className="border-t border-gray-700 pt-2 mt-1">
                                <button
                                    onClick={() => setStyleExpanded(s => !s)}
                                    className="w-full flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400 hover:text-gray-200 py-0.5 px-1">
                                    <span>🎨 Graphic Style</span>
                                    <span>{styleExpanded ? '▲' : '▼'}</span>
                                </button>
                                {styleExpanded && (
                                    <div className="mt-1 space-y-1 text-[11px]">
                                        <div className="grid grid-cols-2 gap-1">
                                            <label className="text-gray-400">Line wt (pt)
                                                <input type="number" step="0.1" min={0.1} max={3}
                                                    value={vpStyle.lineWeightPt}
                                                    onChange={e => updateVpStyle(selectedVp.id, { lineWeightPt: parseFloat(e.target.value) || 0.5 })}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                            </label>
                                            <label className="text-gray-400">Text size (pt)
                                                <input type="number" step="1" min={4} max={24}
                                                    value={vpStyle.textSizePt}
                                                    onChange={e => updateVpStyle(selectedVp.id, { textSizePt: parseInt(e.target.value, 10) || 6 })}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                                            </label>
                                        </div>
                                        <label className="flex items-center justify-between text-gray-400">
                                            Grid color
                                            <input type="color" value={vpStyle.gridLineColor}
                                                onChange={e => updateVpStyle(selectedVp.id, { gridLineColor: e.target.value })}
                                                className="w-8 h-5 bg-transparent border-none cursor-pointer"/>
                                        </label>
                                        <label className="text-gray-400">
                                            Grid opacity ({(vpStyle.gridOpacity * 100).toFixed(0)}%)
                                            <input type="range" min={0} max={1} step={0.05}
                                                value={vpStyle.gridOpacity}
                                                onChange={e => updateVpStyle(selectedVp.id, { gridOpacity: parseFloat(e.target.value) })}
                                                className="w-full"/>
                                        </label>
                                        {selectedVp.type === 'plan' && (
                                            <label className="flex items-center gap-2 text-gray-300">
                                                <input type="checkbox" checked={vpStyle.showNorthArrow}
                                                    onChange={e => updateVpStyle(selectedVp.id, { showNorthArrow: e.target.checked })}/>
                                                North arrow
                                            </label>
                                        )}
                                        <label className="flex items-center gap-2 text-gray-300">
                                            <input type="checkbox" checked={vpStyle.showScaleBar}
                                                onChange={e => updateVpStyle(selectedVp.id, { showScaleBar: e.target.checked })}/>
                                            Scale bar
                                        </label>
                                        <button onClick={() => updateVpStyle(selectedVp.id, { ...DEFAULT_VP_STYLE })}
                                            className="w-full text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600/70">
                                            Reset style to defaults
                                        </button>
                                    </div>
                                )}
                            </div>
                                ); // end IIFE return
                            })(/* style IIFE */)}

                            {/* Layer visibility (plan only) */}
                            {selectedVp.type === 'plan' && (
                            <div className="border-t border-gray-700 pt-2 mt-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400">Layers</div>
                                    <div className="flex gap-1">
                                        <button onClick={() => updateVp(selectedVp.id, { hiddenLayers: [] })}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600/80" title="Show all">All</button>
                                        <button onClick={() => updateVp(selectedVp.id, { hiddenLayers: [...availableLayers] })}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600/80" title="Hide all">None</button>
                                    </div>
                                </div>
                                <div className="max-h-44 overflow-y-auto mt-1 space-y-0.5">
                                    {availableLayers.length === 0 && (
                                        <div className="text-[10px] text-gray-500 italic px-1">No layers detected.</div>
                                    )}
                                    {availableLayers.map(key => {
                                        const hidden = selectedVp.hiddenLayers.includes(key);
                                        const swatch = layerColors[key]
                                            ?? (key.startsWith('*') ? (typeDefaultColor[key.slice(1).toLowerCase()] ?? '#888') : '#888');
                                        return (
                                            <label key={key} className="flex items-center gap-1.5 text-[11px] text-gray-200 cursor-pointer hover:bg-gray-800/60 rounded px-1">
                                                <input type="checkbox" checked={!hidden}
                                                    onChange={() => toggleLayerInVp(selectedVp.id, key)}/>
                                                <span style={{ width: 10, height: 10, background: swatch, display: 'inline-block', border: '1px solid #333' }}/>
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

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Titleblock (this sheet)</h3>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                        value={activeSheet.tbFields.projectName}
                        onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, projectName: e.target.value } }))}
                        placeholder="Project name" />
                    <input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                        value={activeSheet.tbFields.sheetNumber}
                        onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, sheetNumber: e.target.value } }))}
                        placeholder="Sheet # (e.g. C-001)" />
                    <input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                        value={activeSheet.tbFields.drawnBy}
                        onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, drawnBy: e.target.value } }))}
                        placeholder="Drawn by" />
                    <input className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                        value={activeSheet.tbFields.date}
                        onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, date: e.target.value } }))}
                        placeholder="Date" />
                    <textarea className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs" rows={2}
                        value={activeSheet.tbFields.notes}
                        onChange={e => updateActiveSheet(s => ({ tbFields: { ...s.tbFields, notes: e.target.value } }))}
                        placeholder="Notes / firm name" />
                    <button
                        onClick={() => setTbEditorOpen(true)}
                        className="w-full px-2 py-1 text-[11px] rounded bg-amber-700/40 text-amber-100 hover:bg-amber-600/60 font-semibold">
                        ✎ Edit Titleblock Layout… (shared across set)
                    </button>
                    <div className="flex gap-2">
                        <input ref={tbDxfRef} type="file" accept=".dxf" className="hidden" onChange={handleTbDxfUpload} />
                        <button onClick={() => tbDxfRef.current?.click()}
                            className="flex-1 px-2 py-1 text-[11px] rounded bg-emerald-800/50 text-emerald-100 hover:bg-emerald-700/60">
                            Upload .dxf titleblock
                        </button>
                        <button onClick={() => updateSet({ tbLayout: DEFAULT_TITLEBLOCK_LAYOUT })}
                            className="px-2 py-1 text-[11px] rounded bg-gray-700/60 hover:bg-gray-600/80" title="Reset layout">Reset</button>
                    </div>
                    <div className="text-[10px] text-gray-500">
                        Placeholders: <code className="text-gray-300">{'{PROJECT_NAME}'}</code>, <code className="text-gray-300">{'{SHEET_NUMBER}'}</code>, <code className="text-gray-300">{'{PAGE_OF}'}</code> = "{activeIndex + 1} of {totalSheets}", <code className="text-gray-300">{'{SCALE}'}</code>, <code className="text-gray-300">{'{DATE}'}</code>, <code className="text-gray-300">{'{SHEET_SIZE}'}</code>.
                    </div>
                </section>

                <section className="space-y-2">
                    <button onClick={handleExportCurrentPdf}
                        className="w-full px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">
                        Export this sheet to PDF
                    </button>
                    <button onClick={handleExportSetPdf}
                        className="w-full px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white text-sm font-semibold">
                        Export entire set ({totalSheets} {totalSheets === 1 ? 'page' : 'pages'})
                    </button>
                </section>

                <div className="text-[10px] text-gray-500 italic">
                    Auto-saved to browser storage per project name.
                </div>
            </aside>

            {/* Sheet preview */}
            <div ref={sheetContainerRef} className="flex-1 overflow-auto bg-gray-800 p-4 flex items-center justify-center">
                <div style={{
                    width: effW * ppi,
                    height: effH * ppi,
                    background: '#fff',
                    position: 'relative',
                    boxShadow: '0 0 20px rgba(0,0,0,0.4)',
                    flexShrink: 0,
                }}>
                    <div style={{
                        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                        border: '1px solid #111', boxSizing: 'border-box', pointerEvents: 'none',
                    }} />
                    {viewports.map(vp => (
                        <div key={vp.id}
                            onMouseDown={e => onVpMouseDown(e, vp)}
                            style={{
                                position: 'absolute',
                                left: vp.xIn * ppi, top: vp.yIn * ppi,
                                width: vp.wIn * ppi, height: vp.hIn * ppi,
                                border: vp.id === selectedVpId ? '2px solid #f59e0b' : '1px solid #111',
                                background: '#fff', cursor: 'move', overflow: 'hidden',
                            }}
                            title={`Viewport ${vp.id} — 1" = ${vp.scaleFt}'`}>
                            {buildVpSvg(vp)}
                            {/* Resize handles: 8x8px, corners and sides (inset to avoid being clipped by overflow:hidden) */}
                            {['nw','n','ne','e','se','s','sw','w'].map(dir => (
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
                                        opacity: vp.id === selectedVpId ? 1 : 0.5,
                                    }}
                                    onClick={e => e.stopPropagation()}
                                />
                            ))}
                            <div style={{
                                position: 'absolute', left: 2, bottom: 1, fontSize: 8, color: '#555',
                                fontFamily: 'monospace', background: 'rgba(255,255,255,0.7)', padding: '0 2px',
                            }}>
                                1" = {vp.scaleFt}'
                            </div>
                        </div>
                    ))}

                    <div style={{
                        position: 'absolute',
                        right: 0.25 * ppi, bottom: 0.25 * ppi,
                        width: set.tbLayout.widthIn * ppi,
                        height: set.tbLayout.heightIn * ppi,
                        background: set.tbLayout.background === 'none' ? 'transparent' : set.tbLayout.background,
                        overflow: 'hidden',
                    }}>
                        <TitleblockRenderer
                            layout={set.tbLayout}
                            ctx={buildTbContext(activeSheet, selectedVp?.scaleFt ?? null)}
                            ppi={ppi}
                        />
                    </div>
                </div>
            </div>
            </div>

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
