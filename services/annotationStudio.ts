/**
 * Annotation Studio
 *
 * Shared, deterministic logic behind the in-canvas text workflow and the
 * Annotation Manager:
 *   - parse plain-language requests such as "Label all inverts"
 *   - match survey points by description / field code
 *   - generate `CanvasTextAnnotation` entities with leader lines
 *
 * The canvas and the manager both call this module, so a label generated from
 * chat, from the manager, or from a per-point rule uses the same matching and
 * text-template rules.
 */

import type {
    AnnotationRule,
    CanvasTextAnnotation,
    SurveyPoint,
} from '../types.ts';
import {
    buildAnnotationMatchers,
    renderAnnotationTemplate,
    resolveAnnotation,
} from '../utils/annotationResolver.ts';

export interface LabelAllRequest {
    kind: 'label-all';
    /** Original phrase, e.g. "Label all inverts". */
    raw: string;
    /** Singular feature key used for matching, e.g. "invert". */
    feature: string;
    /** Human-readable plural used in replies and the manager UI. */
    label: string;
    /** Upper-case tokens compared against description / field-code tokens. */
    matchTerms: string[];
}

type FeatureAlias = {
    label: string;
    tokens: string[];
};

/**
 * Survey descriptions are abbreviated heavily (INV, PP, FH, MH …). These
 * aliases make requests phrased in plain English hit the same shots a surveyor
 * would expect. Unknown nouns still work through the generic keyword fallback.
 */
const FEATURE_ALIASES: Record<string, FeatureAlias> = {
    invert: { label: 'inverts', tokens: ['INV', 'INVERT'] },
    'utility pole': { label: 'utility poles', tokens: ['PP', 'POLE', 'UTIL', 'PWR', 'POWER'] },
    pole: { label: 'poles', tokens: ['PP', 'POLE', 'UTIL', 'PWR', 'POWER'] },
    hydrant: { label: 'hydrants', tokens: ['FH', 'HYD', 'HYDRANT'] },
    manhole: { label: 'manholes', tokens: ['MH', 'MANHOLE', 'MHOL'] },
    cleanout: { label: 'cleanouts', tokens: ['CO', 'CLN', 'CLEANOUT'] },
    valve: { label: 'valves', tokens: ['GV', 'VALVE'] },
    meter: { label: 'meters', tokens: ['WM', 'METER'] },
    'water meter': { label: 'water meters', tokens: ['WM', 'METER'] },
    monument: { label: 'monuments', tokens: ['MON', 'MONUMENT', 'IP', 'IRON'] },
    'control point': { label: 'control points', tokens: ['CP', 'CONTROL', 'CTRL'] },
    tree: { label: 'trees', tokens: ['TREE', 'OAK', 'PINE'] },
    sign: { label: 'signs', tokens: ['SIGN', 'STOP'] },
    culvert: { label: 'culverts', tokens: ['CULV', 'CULVERT', 'CMP'] },
    headwall: { label: 'headwalls', tokens: ['HW', 'HEADWALL'] },
    'catch basin': { label: 'catch basins', tokens: ['CB', 'CATCH', 'BASIN'] },
    'retaining wall': { label: 'retaining walls', tokens: ['RW', 'RETAIN'] },
    'manhole rim': { label: 'manhole rims', tokens: ['RIM'] },
    point: { label: 'points', tokens: [] },
};

const LABEL_ALL_RE = new RegExp(
    '^(?:please\\s+)?(?:label|annotate|tag|mark|call\\s*out|note)\\s+' +
    '(?:all|every|each)(?:\\s+of)?(?:\\s+the)?\\s+(.+?)\\s*[.!?]*$',
    'i',
);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const singularize = (term: string): string => {
    const cleaned = term
        .replace(/^(?:the|all|every|each)\s+/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (!cleaned) return '';
    if (FEATURE_ALIASES[cleaned]) return cleaned;
    if (cleaned.endsWith('ies') && cleaned.length > 4) return `${cleaned.slice(0, -3)}y`;
    if (/(?:ses|ches|shes|xes)$/.test(cleaned) && cleaned.length > 4) return cleaned.slice(0, -2);
    if (cleaned.endsWith('s') && !cleaned.endsWith('ss') && cleaned.length > 3) return cleaned.slice(0, -1);
    return cleaned;
};

/**
 * Parse a whole request like "Label all inverts" / "annotate every utility
 * pole". Returns null when the message is not a label-all request.
 */
export function parseLabelAllRequest(raw: string): LabelAllRequest | null {
    if (!raw || !raw.trim()) return null;
    const normalized = raw.trim().replace(/\s+/g, ' ');
    const match = normalized.match(LABEL_ALL_RE);
    if (!match) return null;

    const phrase = match[1]?.trim() ?? '';
    if (!phrase) return null;
    const feature = singularize(phrase);
    if (!feature) return null;

    const alias = FEATURE_ALIASES[feature];
    return {
        kind: 'label-all',
        raw: normalized,
        feature,
        label: alias?.label ?? `${feature}s`,
        matchTerms: alias?.tokens ?? [feature.toUpperCase()],
    };
}

const descriptionTokens = (description: string | undefined): string[] => (
    (description ?? '')
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)
);

/**
 * Match a point description against the request. Codes use exact tokens
 * (INV / PP / FH) plus a short numeric suffix tolerance (INV1, PP-2), while
 * longer nouns also match a whole-word phrase such as "sanitary invert".
 */
export function pointMatchesLabelRequest(
    point: Pick<SurveyPoint, 'description'>,
    request: LabelAllRequest,
): boolean {
    if (request.feature === 'point') return true;
    const description = (point.description ?? '').trim();
    if (!description) return false;

    const tokens = descriptionTokens(description);
    for (const term of request.matchTerms) {
        const upperTerm = term.toUpperCase();
        if (!upperTerm) continue;
        if (tokens.includes(upperTerm)) return true;
        if (upperTerm.length >= 3 && tokens.some(token => (
            token.startsWith(upperTerm) && token.length <= upperTerm.length + 3
        ))) {
            return true;
        }
    }

    if (request.feature.length >= 4) {
        const phrase = new RegExp(
            `(^|[^A-Z0-9])${escapeRegex(request.feature.toUpperCase())}($|[^A-Z0-9])`,
        );
        if (phrase.test(description.toUpperCase())) return true;
    }
    return false;
}

/** Default note template for a generated label, before a matching rule wins. */
export function defaultLabelTemplate(feature: string): string {
    if (feature === 'invert') return 'INV {elevation}';
    if (feature === 'point') return '{pointNumber}\\n{description}';
    return '{description}';
}

export interface BuildPointLabelOptions {
    /** Existing annotation rules; a matching rule supplies template/color/offset. */
    rules?: AnnotationRule[];
    /** Named text style for generated labels. */
    styleName?: string;
    /** Annotation category bucket (defaults to 'callout'). */
    categoryId?: string;
    /** Existing text entities, used to avoid labeling the same point twice. */
    existingAnnotations?: CanvasTextAnnotation[];
    /** World-space label offset from the source point. */
    leaderOffset?: { dx: number; dy: number };
    /** Override template for every generated label. */
    template?: string;
    /** Optional safety cap for very large point files. */
    limit?: number;
}

export interface BuildPointLabelResult {
    annotations: CanvasTextAnnotation[];
    matchedPoints: SurveyPoint[];
    matchedCount: number;
    skippedCount: number;
}

const pointLabelId = (): string =>
    `text_label_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const renderLabelText = (template: string, point: SurveyPoint): string => {
    const rendered = renderAnnotationTemplate(template, point).trim();
    return rendered || point.description || point.pointNumber || '';
};

/**
 * Build text annotations for every point matching a "label all …" request.
 * Existing labels for the same point are skipped so repeating the request in
 * chat is safe.
 */
export function buildPointLabelAnnotations(
    points: SurveyPoint[],
    request: LabelAllRequest,
    options: BuildPointLabelOptions = {},
): BuildPointLabelResult {
    const rules = options.rules ?? [];
    const matchers = rules.length > 0 ? buildAnnotationMatchers(rules) : undefined;
    const existing = options.existingAnnotations ?? [];
    const offset = options.leaderOffset ?? { dx: 8, dy: 8 };
    const limit = options.limit ?? 2000;
    const matchedPoints = points.filter(point => pointMatchesLabelRequest(point, request));
    const matchedCount = matchedPoints.length;
    const annotations: CanvasTextAnnotation[] = [];
    let skippedCount = 0;

    for (const point of matchedPoints) {
        if (annotations.length >= limit) break;

        const rule = point.description && rules.length > 0
            ? resolveAnnotation(point.description, rules, matchers).rule
            : null;
        const template = options.template
            ?? rule?.template
            ?? defaultLabelTemplate(request.feature);
        const text = renderLabelText(template, point);
        if (!text) continue;

        if (existing.some(entity => (
            entity.sourcePointNumber === point.pointNumber && entity.text === text
        ))) {
            skippedCount += 1;
            continue;
        }

        const ruleOffset = rule?.leaderOffset ?? offset;
        annotations.push({
            id: pointLabelId(),
            text,
            x: point.easting + ruleOffset.dx,
            y: point.northing + ruleOffset.dy,
            angle: 0,
            styleName: rule?.textStyleName ?? options.styleName,
            categoryId: options.categoryId ?? 'callout',
            convention: rule?.category ?? 'existing',
            color: rule?.color,
            leaderTo: { easting: point.easting, northing: point.northing },
            sourcePointNumber: point.pointNumber,
            createdAt: new Date().toISOString(),
        });
    }

    return { annotations, matchedPoints, matchedCount, skippedCount };
}

/** Create a manual text entity with a stable id and sensible defaults. */
export function createCanvasTextAnnotation(init: {
    text: string;
    x: number;
    y: number;
    angle?: number;
    styleName?: string;
    categoryId?: string;
    convention?: 'existing' | 'proposed';
    layer?: string;
}): CanvasTextAnnotation {
    return {
        id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: init.text,
        x: init.x,
        y: init.y,
        angle: init.angle ?? 0,
        styleName: init.styleName,
        categoryId: init.categoryId ?? 'manual-text',
        convention: init.convention ?? 'proposed',
        layer: init.layer,
        createdAt: new Date().toISOString(),
    };
}

/** One-line result summary shared by chat replies and the manager status. */
export function describeLabelAllResult(
    request: LabelAllRequest,
    result: BuildPointLabelResult,
): string {
    if (result.matchedCount === 0) {
        return `No points matched **${request.label}**. Check the point descriptions or add a rule first.`;
    }
    if (result.annotations.length === 0) {
        return `All ${result.matchedCount} matching ${request.label} already have labels.`;
    }
    const skipped = result.skippedCount > 0
        ? ` ${result.skippedCount} already labeled.`
        : '';
    return `Labeled ${result.annotations.length} of ${result.matchedCount} matching ${request.label}.${skipped}`;
}
