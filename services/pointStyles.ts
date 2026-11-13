/**
 * Point Studio style model.
 *
 * A point style is a complete, named render recipe. Assignments bind styles to
 * point lists, description codes, CAD layers, or individual point numbers; the
 * project default resolves every point that no assignment matches. Per-point
 * overrides are render-only partial styles stored in project state.
 *
 * This module is intentionally free of React and canvas imports so it can be
 * used by the renderer, the A2UI surface, persistence, and tests.
 */

import type {
    PointEfficiencyStyle,
    PointHighlightStyle,
    PointLabelStyle,
    PointMarkerStyle,
    PointStudioState,
    PointStyle,
    PointStyleAssignment,
    PointStyleOverride,
    PointStyleTarget,
    ResolvedPointRenderStyle,
    SurveyPoint,
} from '../types.ts';

export const POINT_STUDIO_VERSION = 1 as const;
export const SURVEY_STANDARD_STYLE_ID = 'builtin-survey-standard';
const BUILTIN_CREATED_AT = '2026-11-12T00:00:00.000Z';

export interface LegacyPointStyleSeed {
    showPointSymbols?: boolean;
    pointEfficiencyMode?: boolean;
    pointAttributeScaling?: 'screen' | 'world';
    attributeScale?: number;
    pointLayers?: {
        pointNumber: { visible: boolean; color: string };
        description: { visible: boolean; color: string };
        elevation: { visible: boolean; color: string };
    };
}

const DEFAULT_SELECTION_RING: PointHighlightStyle['selectionRing'] = {
    enabled: true,
    color: '#22d3ee',
    radiusPx: 8,
    widthPx: 2,
    dash: [3, 2],
};

const DEFAULT_HOVER_RING: PointHighlightStyle['hoverRing'] = {
    enabled: false,
    color: '#ffffff',
    radiusPx: 9,
    widthPx: 1,
    dash: [],
};

const DEFAULT_HIGHLIGHTS: PointHighlightStyle = {
    selectionRing: DEFAULT_SELECTION_RING,
    hoverRing: DEFAULT_HOVER_RING,
    shrinkwrapBadges: true,
    pendingDeleteRing: true,
};

const DEFAULT_EFFICIENCY: PointEfficiencyStyle = {
    enabled: true,
    preset: 'current',
    detailScaleCutoff: 3,
    screenPointBudget: 240,
    cellSizePx: 4,
    dotShape: 'square',
    minDotSizePx: 2,
    maxDotSizePx: 4,
    densityGrowth: 1,
    color: '#FFD700',
    lightThemeColor: '#111827',
    opacity: 1,
    suppressLabels: true,
    suppressSymbols: true,
    suppressCallouts: true,
    keepSelectionRing: true,
    keepHoverRing: false,
    keepShrinkwrapBadges: true,
    keepPendingDeleteRings: true,
};

const DEFAULT_LABELS: PointLabelStyle = {
    showPointNumber: true,
    showElevation: true,
    showDescription: true,
    pointNumberColor: '#00FFFF',
    elevationColor: '#00FF00',
    descriptionColor: '#FF00FF',
    fontSizePx: 10,
    fontFamily: 'Arial',
    scaleMode: 'screen',
    offsetXPx: 5,
    offsetYPx: 5,
    leader: 'when-offset',
    leaderColor: 'rgba(128,128,128,0.7)',
    leaderWidthPx: 1,
    leaderDash: [4, 2],
    labelBackground: {
        enabled: false,
        color: '#000000',
        paddingPx: 2,
    },
};

const DEFAULT_MARKER: PointMarkerStyle = {
    shape: 'circle',
    sizePx: 3,
    color: '#FFD700',
    lightThemeColor: '#FFD700',
    strokeColor: '#000000',
    strokeWidthPx: 0.5,
    opacity: 1,
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeStyle = (
    id: string,
    name: string,
    description: string,
    marker: Partial<PointMarkerStyle>,
    labels: Partial<PointLabelStyle>,
    overrides: Partial<PointStyle> = {},
): PointStyle => ({
    id,
    name,
    description,
    source: 'builtin',
    marker: { ...clone(DEFAULT_MARKER), ...marker },
    labels: { ...clone(DEFAULT_LABELS), ...labels },
    renderSymbols: false,
    highlights: clone(DEFAULT_HIGHLIGHTS),
    efficiency: clone(DEFAULT_EFFICIENCY),
    dxfStyleName: name,
    c3dStyleName: name,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
    ...overrides,
});

/**
 * Built-in starter styles. They are cloned on the way out so editing a project
 * style never mutates this factory data.
 */
export const BUILTIN_POINT_STYLES: readonly PointStyle[] = [
    makeStyle(
        SURVEY_STANDARD_STYLE_ID,
        'Survey Standard',
        'The default LandSurv point look, preserved from the legacy renderer.',
        {},
        {},
    ),
    makeStyle(
        'builtin-boundary',
        'Boundary',
        'Crisp square corners for boundary and right-of-way shots.',
        { shape: 'square', sizePx: 6, color: '#22D3EE', lightThemeColor: '#0E7490', strokeColor: '#FFFFFF', strokeWidthPx: 1 },
        { showPointNumber: true, showElevation: false, showDescription: true, pointNumberColor: '#CFFAFE', descriptionColor: '#A5F3FC' },
    ),
    makeStyle(
        'builtin-topo',
        'Topo',
        'Small lime dots for dense topographic pickup.',
        { shape: 'dot', sizePx: 2, color: '#A3E635', lightThemeColor: '#3F6212', strokeWidthPx: 0 },
        { showPointNumber: false, showElevation: true, showDescription: true, elevationColor: '#D9F99D', descriptionColor: '#BEF264' },
    ),
    makeStyle(
        'builtin-stakeout',
        'Stakeout',
        'High-visibility crosses for points you are about to set out.',
        { shape: 'cross', sizePx: 8, color: '#F472B6', lightThemeColor: '#BE185D', strokeColor: '#F472B6', strokeWidthPx: 0 },
        { fontSizePx: 11, pointNumberColor: '#FDF2F8', elevationColor: '#FBCFE8', descriptionColor: '#F9A8D4' },
    ),
    makeStyle(
        'builtin-presentation',
        'Presentation',
        'Open rings and larger labels for client-facing exhibits.',
        { shape: 'ring', sizePx: 5, color: '#FFFFFF', lightThemeColor: '#111827', strokeColor: '#FFFFFF', strokeWidthPx: 1.5 },
        { fontSizePx: 12, showElevation: false, leader: 'always', pointNumberColor: '#FFFFFF', descriptionColor: '#E2E8F0' },
    ),
];

export function getBuiltinPointStyles(): PointStyle[] {
    return BUILTIN_POINT_STYLES.map(style => clone(style));
}

export function getBuiltinPointStyle(id: string): PointStyle | undefined {
    const found = BUILTIN_POINT_STYLES.find(style => style.id === id);
    return found ? clone(found) : undefined;
}

export function createDefaultPointStudioState(legacy: LegacyPointStyleSeed = {}): PointStudioState {
    const styles = getBuiltinPointStyles();
    const survey = styles.find(style => style.id === SURVEY_STANDARD_STYLE_ID) ?? styles[0];
    if (survey) {
        survey.labels.showPointNumber = legacy.pointLayers?.pointNumber.visible ?? true;
        survey.labels.showElevation = legacy.pointLayers?.elevation.visible ?? true;
        survey.labels.showDescription = legacy.pointLayers?.description.visible ?? true;
        survey.labels.pointNumberColor = legacy.pointLayers?.pointNumber.color ?? survey.labels.pointNumberColor;
        survey.labels.elevationColor = legacy.pointLayers?.elevation.color ?? survey.labels.elevationColor;
        survey.labels.descriptionColor = legacy.pointLayers?.description.color ?? survey.labels.descriptionColor;
        survey.labels.scaleMode = legacy.pointAttributeScaling === 'world' ? 'world' : 'screen';
        survey.labels.fontSizePx = clampNumber(10 * (legacy.attributeScale ?? 1), 6, 48);
        survey.renderSymbols = legacy.showPointSymbols === true;
        survey.efficiency.enabled = legacy.pointEfficiencyMode !== false;
    }
    return {
        version: POINT_STUDIO_VERSION,
        styles,
        defaultStyleId: SURVEY_STANDARD_STYLE_ID,
        assignments: [],
        overrides: {},
        updatedAt: BUILTIN_CREATED_AT,
    };
}

/**
 * Resolve the project's style state, migrating legacy settings when no state
 * exists. Returns a new object on migration but never mutates `settings`.
 */
export function ensurePointStudioState(
    settings: {
        pointStudio?: PointStudioState;
        showPointSymbols?: boolean;
        pointEfficiencyMode?: boolean;
        pointAttributeScaling?: 'screen' | 'world';
    },
    attributeScale = 1,
    pointLayers?: LegacyPointStyleSeed['pointLayers'],
): PointStudioState {
    const sanitized = sanitizePointStudioState(settings.pointStudio);
    if (sanitized) return sanitized;
    return createDefaultPointStudioState({
        showPointSymbols: settings.showPointSymbols,
        pointEfficiencyMode: settings.pointEfficiencyMode,
        pointAttributeScaling: settings.pointAttributeScaling,
        attributeScale,
        pointLayers,
    });
}

export function createPointStyle(name: string, base?: PointStyle): PointStyle {
    const now = new Date().toISOString();
    const source = base ? clone(base) : makeStyle('', name, '', {}, {});
    return {
        ...source,
        id: `point-style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || 'Untitled Style',
        description: base ? `Based on ${base.name}` : 'Custom point style',
        source: 'user',
        createdAt: now,
        updatedAt: now,
        dxfStyleName: name.trim() || 'Untitled Style',
        c3dStyleName: name.trim() || 'Untitled Style',
    };
}

export function clonePointStudioState(state: PointStudioState): PointStudioState {
    return clone(state);
}

export function createStyleAssignment(
    target: PointStyleTarget,
    styleId: string,
): PointStyleAssignment {
    const now = new Date().toISOString();
    return {
        id: `point-style-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        styleId,
        target,
        createdAt: now,
        updatedAt: now,
    };
}

interface WildcardAssignment {
    assignment: PointStyleAssignment;
    style: PointStyle;
    regex: RegExp;
    prefixLength: number;
    suffixLength: number;
}

export interface PointStyleResolver {
    defaultStyle: PointStyle;
    defaultEfficiency: PointEfficiencyStyle;
    stylesById: Map<string, PointStyle>;
    resolve: (point: Pick<SurveyPoint, 'pointNumber' | 'description' | 'layer'>, listId?: string) => ResolvedPointRenderStyle;
    getStyle: (styleId: string) => PointStyle | undefined;
}

const normalizeCode = (value: string | undefined | null): string => (value ?? '').trim().toUpperCase();
const normalizeLayer = (value: string | undefined | null): string => (value ?? '').trim().toUpperCase();
const firstCodeToken = (value: string): string => value.split(/\s+/)[0] ?? value;

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern: string): { regex: RegExp; prefixLength: number; suffixLength: number } {
    const normalized = normalizeCode(pattern);
    const firstWildcard = normalized.search(/[*?]/);
    const lastWildcard = Math.max(normalized.lastIndexOf('*'), normalized.lastIndexOf('?'));
    const prefixLength = firstWildcard === -1 ? normalized.length : firstWildcard;
    const suffixLength = lastWildcard === -1 || lastWildcard === normalized.length - 1
        ? (lastWildcard === normalized.length - 1 ? normalized.length - lastWildcard - 1 : 0)
        : normalized.length - lastWildcard - 1;
    const body = normalized
        .split('')
        .map(char => {
            if (char === '*') return '.*';
            if (char === '?') return '.';
            return escapeRegex(char);
        })
        .join('');
    return {
        regex: new RegExp(`^${body}$`, 'i'),
        prefixLength,
        suffixLength,
    };
}

/**
 * Build a resolver once per style revision. The returned function is O(1) for
 * the common case and uses at most one wildcard scan per unique description.
 */
export function createPointStyleResolver(state: PointStudioState): PointStyleResolver {
    const stylesById = new Map(state.styles.map(style => [style.id, style]));
    const defaultStyle = stylesById.get(state.defaultStyleId) ?? stylesById.get(SURVEY_STANDARD_STYLE_ID) ?? state.styles[0];
    if (!defaultStyle) {
        throw new Error('Point Studio state has no default style.');
    }

    const layerMap = new Map<string, PointStyle>();
    const listMap = new Map<string, PointStyle>();
    const pointMap = new Map<string, PointStyle>();
    const exactCodeMap = new Map<string, PointStyle>();
    const wildcardRules: WildcardAssignment[] = [];

    for (const assignment of state.assignments) {
        const style = stylesById.get(assignment.styleId);
        if (!style) continue;
        switch (assignment.target.kind) {
            case 'layer':
                layerMap.set(normalizeLayer(assignment.target.layer), style);
                break;
            case 'point-list':
                listMap.set(assignment.target.listId, style);
                break;
            case 'point':
                pointMap.set(assignment.target.pointNumber.trim(), style);
                break;
            case 'description': {
                const match = normalizeCode(assignment.target.match);
                if (!match) break;
                if (assignment.target.matchMode === 'wildcard' || /[*?]/.test(match)) {
                    const compiled = wildcardToRegex(match);
                    wildcardRules.push({
                        assignment,
                        style,
                        regex: compiled.regex,
                        prefixLength: compiled.prefixLength,
                        suffixLength: compiled.suffixLength,
                    });
                } else {
                    exactCodeMap.set(match, style);
                }
                break;
            }
        }
    }

    wildcardRules.sort((a, b) => {
        if (b.prefixLength !== a.prefixLength) return b.prefixLength - a.prefixLength;
        if (b.suffixLength !== a.suffixLength) return b.suffixLength - a.suffixLength;
        return a.assignment.id.localeCompare(b.assignment.id);
    });

    const mergeOverride = (style: PointStyle, override?: PointStyleOverride): ResolvedPointRenderStyle => {
        const marker = override?.marker ? { ...style.marker, ...override.marker } : style.marker;
        const labels = override?.labels
            ? {
                ...style.labels,
                ...override.labels,
                labelBackground: {
                    ...style.labels.labelBackground,
                    ...(override.labels.labelBackground ?? {}),
                },
            }
            : style.labels;
        const highlights = override?.highlights
            ? {
                ...style.highlights,
                ...override.highlights,
                selectionRing: { ...style.highlights.selectionRing, ...(override.highlights.selectionRing ?? {}) },
                hoverRing: { ...style.highlights.hoverRing, ...(override.highlights.hoverRing ?? {}) },
            }
            : style.highlights;
        const efficiency = override?.efficiency ? { ...style.efficiency, ...override.efficiency } : style.efficiency;
        return {
            styleId: style.id,
            styleName: style.name,
            marker: normalizeMarker(marker),
            labels: normalizeLabels(labels),
            renderSymbols: style.renderSymbols,
            highlights: normalizeHighlights(highlights),
            efficiency: normalizeEfficiency(efficiency),
            dxfStyleName: style.dxfStyleName || style.name,
            c3dStyleName: style.c3dStyleName || style.dxfStyleName || style.name,
            reason: override ? 'point-override' : 'default',
        };
    };

    const resolve = (
        point: Pick<SurveyPoint, 'pointNumber' | 'description' | 'layer'>,
        listId?: string,
    ): ResolvedPointRenderStyle => {
        let chosen = defaultStyle;
        let reason: ResolvedPointRenderStyle['reason'] = 'default';

        const layerStyle = layerMap.get(normalizeLayer(point.layer));
        if (layerStyle) {
            chosen = layerStyle;
            reason = 'layer';
        }
        const listStyle = listId ? listMap.get(listId) : undefined;
        if (listStyle) {
            chosen = listStyle;
            reason = 'point-list';
        }

        const code = normalizeCode(point.description);
        if (code) {
            const exact = exactCodeMap.get(code) ?? exactCodeMap.get(firstCodeToken(code));
            if (exact) {
                chosen = exact;
                reason = 'description';
            } else {
                const wildcard = wildcardRules.find(rule => rule.regex.test(code) || rule.regex.test(firstCodeToken(code)));
                if (wildcard) {
                    chosen = wildcard.style;
                    reason = 'description';
                }
            }
        }

        const pointStyle = pointMap.get(point.pointNumber.trim());
        if (pointStyle) {
            chosen = pointStyle;
            reason = 'point';
        }

        const override = state.overrides?.[point.pointNumber.trim()];
        const resolved = mergeOverride(chosen, override);
        if (override) resolved.reason = 'point-override';
        else resolved.reason = reason;
        return resolved;
    };

    return {
        defaultStyle,
        defaultEfficiency: normalizeEfficiency(defaultStyle.efficiency),
        stylesById,
        resolve,
        getStyle: (styleId: string) => stylesById.get(styleId),
    };
}

export function resolvePointRenderStyle(
    state: PointStudioState,
    point: Pick<SurveyPoint, 'pointNumber' | 'description' | 'layer'>,
    listId?: string,
): ResolvedPointRenderStyle {
    return createPointStyleResolver(state).resolve(point, listId);
}

export function getPointStyleUsage(state: PointStudioState, styleId: string): number {
    return state.assignments.filter(assignment => assignment.styleId === styleId).length
        + (state.defaultStyleId === styleId ? 1 : 0);
}

export function describePointStyleTarget(target: PointStyleTarget): string {
    switch (target.kind) {
        case 'point-list':
            return `List ${target.listId}`;
        case 'description':
            return `${target.matchMode === 'wildcard' ? 'Code' : 'Code'} ${target.match}`;
        case 'point':
            return `Point ${target.pointNumber}`;
        case 'layer':
            return `Layer ${target.layer}`;
        default:
            return 'Target';
    }
}

export function getPointStyleTargetKey(target: PointStyleTarget): string {
    switch (target.kind) {
        case 'point-list':
            return `list:${target.listId}`;
        case 'description':
            return `code:${target.matchMode}:${target.match.toUpperCase()}`;
        case 'point':
            return `point:${target.pointNumber}`;
        case 'layer':
            return `layer:${target.layer.toUpperCase()}`;
    }
}

export function clampNumber(value: number, min: number, max: number, fallback = min): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function isCssColor(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return true;
    if (/^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,/]+\)$/i.test(trimmed)) return true;
    return /^[a-z]{3,32}$/i.test(trimmed);
}

function normalizeMarker(marker: PointMarkerStyle): PointMarkerStyle {
    return {
        shape: marker.shape ?? 'circle',
        sizePx: clampNumber(marker.sizePx, 1, 32, 3),
        color: isCssColor(marker.color) ? marker.color : '#FFD700',
        lightThemeColor: marker.lightThemeColor && isCssColor(marker.lightThemeColor) ? marker.lightThemeColor : marker.color,
        strokeColor: isCssColor(marker.strokeColor) ? marker.strokeColor : '#000000',
        strokeWidthPx: clampNumber(marker.strokeWidthPx, 0, 4, 0.5),
        opacity: clampNumber(marker.opacity, 0, 1, 1),
    };
}

function normalizeLabels(labels: PointLabelStyle): PointLabelStyle {
    return {
        ...DEFAULT_LABELS,
        ...labels,
        fontSizePx: clampNumber(labels.fontSizePx, 6, 48, 10),
        offsetXPx: clampNumber(labels.offsetXPx, -200, 200, 5),
        offsetYPx: clampNumber(labels.offsetYPx, -200, 200, 5),
        leaderWidthPx: clampNumber(labels.leaderWidthPx, 0, 6, 1),
        leaderDash: Array.isArray(labels.leaderDash) ? labels.leaderDash.slice(0, 6).map(value => clampNumber(value, 0, 40, 0)) : [4, 2],
        labelBackground: {
            ...DEFAULT_LABELS.labelBackground,
            ...(labels.labelBackground ?? {}),
            paddingPx: clampNumber(labels.labelBackground?.paddingPx ?? 2, 0, 12, 2),
        },
    };
}

function normalizeHighlights(highlights: PointHighlightStyle): PointHighlightStyle {
    return {
        ...DEFAULT_HIGHLIGHTS,
        ...highlights,
        selectionRing: { ...DEFAULT_SELECTION_RING, ...(highlights.selectionRing ?? {}) },
        hoverRing: { ...DEFAULT_HOVER_RING, ...(highlights.hoverRing ?? {}) },
    };
}

function normalizeEfficiency(efficiency: PointEfficiencyStyle): PointEfficiencyStyle {
    return {
        ...DEFAULT_EFFICIENCY,
        ...efficiency,
        detailScaleCutoff: clampNumber(efficiency.detailScaleCutoff, 0.1, 100, 3),
        screenPointBudget: clampNumber(efficiency.screenPointBudget, 1, 1_000_000, 240),
        cellSizePx: clampNumber(efficiency.cellSizePx, 2, 16, 4),
        minDotSizePx: clampNumber(efficiency.minDotSizePx, 1, 32, 2),
        maxDotSizePx: clampNumber(efficiency.maxDotSizePx, efficiency.minDotSizePx, 32, 4),
        densityGrowth: clampNumber(efficiency.densityGrowth, 0, 4, 1),
        opacity: clampNumber(efficiency.opacity, 0, 1, 1),
    };
}

function mergeStyle(base: PointStyle, incoming: Partial<PointStyle>): PointStyle {
    return {
        ...base,
        ...incoming,
        id: incoming.id || base.id,
        name: incoming.name || base.name,
        source: incoming.source ?? base.source,
        marker: normalizeMarker({ ...base.marker, ...(incoming.marker ?? {}) }),
        labels: normalizeLabels({ ...base.labels, ...(incoming.labels ?? {}) }),
        highlights: normalizeHighlights({ ...base.highlights, ...(incoming.highlights ?? {}) }),
        efficiency: normalizeEfficiency({ ...base.efficiency, ...(incoming.efficiency ?? {}) }),
        renderSymbols: incoming.renderSymbols ?? base.renderSymbols,
        dxfStyleName: incoming.dxfStyleName ?? base.dxfStyleName,
        c3dStyleName: incoming.c3dStyleName ?? base.c3dStyleName,
        createdAt: incoming.createdAt || base.createdAt,
        updatedAt: incoming.updatedAt || base.updatedAt,
    };
}

/**
 * Sanitize project/imported state. Returns null when there is not enough data
 * to be useful, so callers can fall back to migration/defaults.
 */
export function sanitizePointStudioState(input: unknown): PointStudioState | null {
    if (!input || typeof input !== 'object') return null;
    const candidate = input as Partial<PointStudioState>;
    if (!Array.isArray(candidate.styles) || candidate.styles.length === 0) return null;

    const base = createDefaultPointStudioState();
    const baseById = new Map(base.styles.map(style => [style.id, style]));
    const styles: PointStyle[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    for (const rawStyle of candidate.styles) {
        if (!rawStyle || typeof rawStyle !== 'object') continue;
        const id = typeof rawStyle.id === 'string' ? rawStyle.id.trim() : '';
        const name = typeof rawStyle.name === 'string' ? rawStyle.name.trim() : '';
        if (!id || !name || seenIds.has(id) || seenNames.has(name.toUpperCase())) continue;
        seenIds.add(id);
        seenNames.add(name.toUpperCase());
        const template = baseById.get(id) ?? base.styles[0] ?? BUILTIN_POINT_STYLES[0];
        styles.push(mergeStyle(template, { ...rawStyle, id, name }));
    }
    if (styles.length === 0) return null;

    const defaultStyleId = styles.some(style => style.id === candidate.defaultStyleId)
        ? candidate.defaultStyleId as string
        : styles[0].id;
    const assignments = Array.isArray(candidate.assignments)
        ? candidate.assignments.filter((assignment): assignment is PointStyleAssignment =>
            Boolean(assignment)
            && typeof assignment.id === 'string'
            && typeof assignment.styleId === 'string'
            && styles.some(style => style.id === assignment.styleId)
            && Boolean(assignment.target)
            && typeof assignment.target === 'object')
        : [];
    const overrides: Record<string, PointStyleOverride> = {};
    if (candidate.overrides && typeof candidate.overrides === 'object') {
        for (const [key, value] of Object.entries(candidate.overrides)) {
            if (value && typeof value === 'object') {
                overrides[key] = { ...(value as PointStyleOverride), pointNumber: key };
            }
        }
    }

    return {
        version: POINT_STUDIO_VERSION,
        styles,
        defaultStyleId,
        assignments,
        overrides,
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    };
}

export interface PointStylePack {
    format: 'landsurv.point-styles';
    version: number;
    exportedAt: string;
    generator: string;
    styles: PointStyle[];
    assignments?: PointStyleAssignment[];
    defaultStyleId?: string;
}

export function exportPointStylePack(
    state: PointStudioState,
    includeAssignments = false,
): PointStylePack {
    return {
        format: 'landsurv.point-styles',
        version: POINT_STUDIO_VERSION,
        exportedAt: new Date().toISOString(),
        generator: 'LandSurv Point Studio',
        styles: clone(state.styles),
        ...(includeAssignments ? { assignments: clone(state.assignments) } : {}),
        defaultStyleId: state.defaultStyleId,
    };
}

export function parsePointStylePack(raw: unknown): { ok: true; pack: PointStylePack } | { ok: false; error: string } {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Style pack must be a JSON object.' };
    const candidate = raw as Partial<PointStylePack>;
    if (candidate.format !== 'landsurv.point-styles') {
        return { ok: false, error: 'Not a LandSurv point style pack (missing format).' };
    }
    if (!Array.isArray(candidate.styles) || candidate.styles.length === 0) {
        return { ok: false, error: 'Style pack contains no styles.' };
    }
    const sanitized = sanitizePointStudioState({
        version: POINT_STUDIO_VERSION,
        styles: candidate.styles,
        defaultStyleId: candidate.defaultStyleId,
        assignments: candidate.assignments ?? [],
        overrides: {},
        updatedAt: new Date().toISOString(),
    });
    if (!sanitized) return { ok: false, error: 'Style pack styles are invalid.' };
    return {
        ok: true,
        pack: {
            format: 'landsurv.point-styles',
            version: POINT_STUDIO_VERSION,
            exportedAt: candidate.exportedAt || new Date().toISOString(),
            generator: candidate.generator || 'Imported style pack',
            styles: sanitized.styles,
            ...(candidate.assignments ? { assignments: sanitized.assignments } : {}),
            defaultStyleId: sanitized.defaultStyleId,
        },
    };
}

/**
 * Merge an imported pack into the current state. Existing styles with the same
 * id are kept; imported duplicates receive a new id and an "(imported)" name.
 */
export function mergePointStylePack(
    state: PointStudioState,
    pack: PointStylePack,
): PointStudioState {
    const styles = [...state.styles];
    const idMap = new Map<string, string>();
    const usedNames = new Set(styles.map(style => style.name.toUpperCase()));

    for (const incoming of pack.styles) {
        const existingIndex = styles.findIndex(style => style.id === incoming.id);
        if (existingIndex === -1) {
            styles.push(clone(incoming));
            usedNames.add(incoming.name.toUpperCase());
            idMap.set(incoming.id, incoming.id);
            continue;
        }
        const baseName = incoming.name.replace(/\s+\(imported\)$/i, '');
        let nextName = `${baseName} (imported)`;
        let suffix = 2;
        while (usedNames.has(nextName.toUpperCase())) {
            nextName = `${baseName} (imported ${suffix++})`;
        }
        const nextId = `${incoming.id}-imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copy = clone(incoming);
        copy.id = nextId;
        copy.name = nextName;
        copy.source = 'imported';
        copy.dxfStyleName = nextName;
        copy.c3dStyleName = nextName;
        styles.push(copy);
        usedNames.add(nextName.toUpperCase());
        idMap.set(incoming.id, nextId);
    }

    const existingAssignmentKeys = new Set(state.assignments.map(assignment => `${assignment.styleId}:${getPointStyleTargetKey(assignment.target)}`));
    const importedAssignments = (pack.assignments ?? [])
        .map(assignment => {
            const styleId = idMap.get(assignment.styleId);
            if (!styleId) return null;
            const next: PointStyleAssignment = {
                ...clone(assignment),
                id: `point-style-assignment-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                styleId,
            };
            if (existingAssignmentKeys.has(`${styleId}:${getPointStyleTargetKey(next.target)}`)) return null;
            existingAssignmentKeys.add(`${styleId}:${getPointStyleTargetKey(next.target)}`);
            return next;
        })
        .filter((assignment): assignment is PointStyleAssignment => Boolean(assignment));

    return {
        ...state,
        styles,
        assignments: [...state.assignments, ...importedAssignments],
        updatedAt: new Date().toISOString(),
    };
}
