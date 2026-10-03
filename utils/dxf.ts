import Drawing from 'dxf-writer';
import { DEFAULT_PARCEL_LABEL_FORMATTER, type SurveyPoint, type SurveyLine, type Centerline, type CenterlinePI, type Settings, type DxfExportOptions, type PointSymbol, type CustomSymbol, type ContourLabel, type ParcelCadTextStyle, type ParcelLabel, type ParcelLabelFormatter, type AnnotationCategoryStyle } from '../types.ts';
import { calculateCenterlineLength, calculateCurveGeometry, calculatePointFromStationOffset, formatStation } from './stationing.ts';
import { applyAnnotationTextCase, resolveAnnotationCategoryTextStyle } from './annotationTextStyle.ts';
import { buildParcelLabelLines, resolveEffectiveParcelTextStyle } from './parcelLabelFormatter.ts';

// A robust check for finite numbers.
const isFiniteNumber = (val: any): val is number => typeof val === 'number' && isFinite(val);

// ── Symbol table name / linetype handling ───────────────────────────────────
// AutoCAD (and Civil 3D) validate the DXF symbol tables far more strictly than
// IntelliCAD/Carlson do. Two rules matter here:
//   1. Symbol names (layers, linetypes) may not contain < > / \ " : ; ? * | = ,
//   2. Every linetype referenced by a LAYER record (group 6) MUST have a matching
//      LTYPE table record. A missing definition makes AutoCAD abort the import with
//      "Undefined line type <X> in LayerTableRecord <Y>" followed by
//      "Invalid or incomplete DXF input -- drawing discarded."

const INVALID_SYMBOL_NAME_CHARS = /[<>\/\\":;?*|=,`]/g;

const sanitizeSymbolName = (name: string, fallback: string): string => {
    const cleaned = (name ?? '')
        .replace(INVALID_SYMBOL_NAME_CHARS, '_')
        // Control characters are also rejected by AutoCAD's symbol table parser.
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, 255);
    return cleaned.length > 0 ? cleaned : fallback;
};

/**
 * Standard AutoCAD (acad.lin) linetype patterns.
 * Element convention matches dxf-writer: > 0 dash, < 0 gap, 0 dot.
 */
const STANDARD_LINE_TYPES: Record<string, { description: string; elements: number[] }> = {
    CONTINUOUS: { description: 'Solid line', elements: [] },
    BORDER: { description: 'Border __ __ . __ __ . __ __ . ', elements: [0.5, -0.25, 0.5, -0.25, 0, -0.25] },
    BORDER2: { description: 'Border (.5x) __.__.__.__.__.__. ', elements: [0.25, -0.125, 0.25, -0.125, 0, -0.125] },
    BORDERX2: { description: 'Border (2x) ____  ____  .  ___ ', elements: [1.0, -0.5, 1.0, -0.5, 0, -0.5] },
    CENTER: { description: 'Center ____ _ ____ _ ____ _ ____', elements: [1.25, -0.25, 0.25, -0.25] },
    CENTER2: { description: 'Center (.5x) ___ _ ___ _ ___ _ ', elements: [0.75, -0.125, 0.125, -0.125] },
    CENTERX2: { description: 'Center (2x) ________  __  _____', elements: [2.5, -0.5, 0.5, -0.5] },
    DASHDOT: { description: 'Dash dot __ . __ . __ . __ . __', elements: [0.5, -0.25, 0, -0.25] },
    DASHDOT2: { description: 'Dash dot (.5x) _._._._._._._. ', elements: [0.25, -0.125, 0, -0.125] },
    DASHDOTX2: { description: 'Dash dot (2x) ____  .  ____  . ', elements: [1.0, -0.5, 0, -0.5] },
    DASHED: { description: 'Dashed __ __ __ __ __ __ __ __ ', elements: [0.5, -0.25] },
    DASHED2: { description: 'Dashed (.5x) _ _ _ _ _ _ _ _ _ ', elements: [0.25, -0.125] },
    DASHEDX2: { description: 'Dashed (2x) ____  ____  ____ ', elements: [1.0, -0.5] },
    DIVIDE: { description: 'Divide __ . . __ . . __ . . __ ', elements: [0.5, -0.25, 0, -0.25, 0, -0.25] },
    DIVIDE2: { description: 'Divide (.5x) _.._.._.._.._.._', elements: [0.25, -0.125, 0, -0.125, 0, -0.125] },
    DIVIDEX2: { description: 'Divide (2x) ____  . .  ____ ', elements: [1.0, -0.5, 0, -0.5, 0, -0.5] },
    DOT: { description: 'Dot . . . . . . . . . . . . . . ', elements: [0, -0.25] },
    DOT2: { description: 'Dot (.5x) ....................', elements: [0, -0.125] },
    DOTX2: { description: 'Dot (2x) .  .  .  .  .  .  .  ', elements: [0, -0.5] },
    DOTTED: { description: 'Dotted . . . . . . . . . . . . ', elements: [0, -5.0] },
    HIDDEN: { description: 'Hidden __ __ __ __ __ __ __ __', elements: [0.25, -0.125] },
    HIDDEN2: { description: 'Hidden (.5x) _ _ _ _ _ _ _ _ ', elements: [0.125, -0.0625] },
    HIDDENX2: { description: 'Hidden (2x) ____ ____ ____ ', elements: [0.5, -0.25] },
    PHANTOM: { description: 'Phantom ______  __  __  ______', elements: [1.25, -0.25, 0.25, -0.25, 0.25, -0.25] },
    PHANTOM2: { description: 'Phantom (.5x) ___ _ _ ___ _ _ ', elements: [0.625, -0.125, 0.125, -0.125, 0.125, -0.125] },
    PHANTOMX2: { description: 'Phantom (2x) ____________    ', elements: [2.5, -0.5, 0.5, -0.5, 0.5, -0.5] },
};

// Pattern used when a drawing references a linetype we have no definition for
// (e.g. a custom "FENCELINE" from a CAD standard). Emitting a real LTYPE record
// keeps the intended name in the drawing while satisfying AutoCAD's validation.
const PLACEHOLDER_LINE_TYPE_ELEMENTS = [0.5, -0.25];

const registerStandardLineTypes = (d: Drawing, knownLineTypes: Set<string>) => {
    for (const [name, def] of Object.entries(STANDARD_LINE_TYPES)) {
        d.addLineType(name, def.description, def.elements);
        knownLineTypes.add(name);
    }
};

/**
 * Returns a linetype name that is guaranteed to exist in the LTYPE table,
 * registering a definition on demand for unknown (custom) names.
 */
const resolveLineType = (d: Drawing, knownLineTypes: Set<string>, lineType: string | undefined): string => {
    const requested = (lineType ?? '').trim();
    if (requested.length === 0) return 'CONTINUOUS';

    const name = sanitizeSymbolName(requested, 'CONTINUOUS').toUpperCase();
    if (name === 'BYLAYER' || name === 'BYBLOCK') return 'CONTINUOUS';
    if (knownLineTypes.has(name)) return name;

    d.addLineType(name, name, PLACEHOLDER_LINE_TYPE_ELEMENTS);
    knownLineTypes.add(name);
    return name;
};

const normalizeLayerName = (layer: string | undefined, fallback: string): string => {
    const trimmed = layer?.trim();
    if (!trimmed || trimmed.length === 0) return fallback;
    return sanitizeSymbolName(trimmed, fallback);
};

const ensureLayer = (
    d: Drawing,
    knownLayers: Set<string>,
    knownLineTypes: Set<string>,
    layerName: string,
    fallbackLineType: string = 'CONTINUOUS',
) => {
    if (knownLayers.has(layerName)) return;
    d.addLayer(layerName, Drawing.ACI.WHITE, resolveLineType(d, knownLineTypes, fallbackLineType));
    knownLayers.add(layerName);
};

// ── Handle allocation ───────────────────────────────────────────────────────
// Raw entities appended after dxf-writer has serialized the drawing need handles
// that (a) don't collide with the generated ones and (b) stay below $HANDSEED.
// AutoCAD rejects files whose $HANDSEED is not greater than every handle used.

const HANDLE_CODES = new Set(['5', '105']);

const maxHandleIn = (dxf: string): number => {
    const lines = dxf.split('\n');
    let max = 0;
    for (let i = 0; i + 1 < lines.length; i += 2) {
        if (!HANDLE_CODES.has(lines[i].trim())) continue;
        // $HANDSEED is stored as a group 5 value but is not an object handle.
        if (i >= 2 && lines[i - 2].trim() === '9' && lines[i - 1].trim() === '$HANDSEED') continue;
        const value = parseInt((lines[i + 1] ?? '').trim(), 16);
        if (Number.isFinite(value) && value > max) max = value;
    }
    return max;
};

const createHandleAllocator = (start: number) => {
    let next = Math.max(start, 1);
    return {
        next: () => (next++).toString(16).toUpperCase(),
        peek: () => next,
    };
};

type HandleAllocator = ReturnType<typeof createHandleAllocator>;

const applyHandseed = (dxf: string, seed: number): string => {
    const seedHex = Math.max(seed, 1).toString(16).toUpperCase();
    return dxf.replace(/(\n9\n\$HANDSEED\n5\n)[^\n]*/, `$1${seedHex}`);
};

// ── MTEXT helpers ───────────────────────────────────────────────────────────
// A single DXF group value may not exceed 255 bytes. MTEXT contents longer than
// that must be split into 250-character group 3 chunks followed by a group 1
// remainder, otherwise AutoCAD discards the whole file.

const MTEXT_CHUNK_SIZE = 250;

const splitMTextValue = (text: string): string[] => {
    if (text.length <= MTEXT_CHUNK_SIZE) return [text];
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > MTEXT_CHUNK_SIZE) {
        let size = MTEXT_CHUNK_SIZE;
        // Never split in the middle of a "\X" MTEXT escape sequence.
        let trailingBackslashes = 0;
        while (trailingBackslashes < size && rest[size - 1 - trailingBackslashes] === '\\') trailingBackslashes++;
        if (trailingBackslashes % 2 === 1) size -= 1;
        chunks.push(rest.slice(0, size));
        rest = rest.slice(size);
    }
    chunks.push(rest);
    return chunks;
};

/** Emits the group 3 / group 1 tag pairs for an MTEXT contents string. */
const mtextValueTags = (text: string): string => {
    const chunks = splitMTextValue(text);
    let out = '';
    for (let i = 0; i < chunks.length - 1; i++) out += `3\n${chunks[i]}\n`;
    out += `1\n${chunks[chunks.length - 1]}\n`;
    return out;
};

/** Same as mtextValueTags but returns a flat [code, value, ...] array. */
const mtextValueTagArray = (text: string): string[] => {
    const chunks = splitMTextValue(text);
    const tags: string[] = [];
    for (let i = 0; i < chunks.length - 1; i++) tags.push('3', chunks[i]);
    tags.push('1', chunks[chunks.length - 1]);
    return tags;
};

// ── Contour polyline joining ────────────────────────────────────────────────
type ContourChain = { layerName: string; elev: number; vertices: [number, number][] };

/**
 * Groups contour SurveyLine segments by (layer, elevation) then chains
 * end-to-end connected segments into continuous polylines.
 * Returns one ContourChain per connected run.
 */
function joinContourSegments(contourLines: SurveyLine[]): ContourChain[] {
    if (contourLines.length === 0) return [];

    // Group segments by DXF layer name + elevation
    const groups = new Map<string, { layerName: string; elev: number; segs: Array<{ x1: number; y1: number; x2: number; y2: number }> }>();
    for (const line of contourLines) {
        if (!line.fromPt || !line.toPt) continue;
        const elev = line.fromPt.z ?? 0;
        const defaultLayer = line.type === 'contour-major' ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR';
        const layerName = normalizeLayerName(line.layer, defaultLayer);
        const key = `${layerName}:${elev}`;
        if (!groups.has(key)) groups.set(key, { layerName, elev, segs: [] });
        groups.get(key)!.segs.push({ x1: line.fromPt.x, y1: line.fromPt.y, x2: line.toPt.x, y2: line.toPt.y });
    }

    const result: ContourChain[] = [];
    const PREC = 4;
    const ptKey = (x: number, y: number) => `${x.toFixed(PREC)},${y.toFixed(PREC)}`;

    for (const { layerName, elev, segs } of groups.values()) {
        // Build endpoint → [{segIdx, which end}] map for O(n) chaining
        const endMap = new Map<string, Array<{ idx: number; end: 'start' | 'end' }>>();
        for (let i = 0; i < segs.length; i++) {
            const { x1, y1, x2, y2 } = segs[i];
            for (const [kx, ky, end] of [[x1, y1, 'start' as const], [x2, y2, 'end' as const]]) {
                const k = ptKey(kx as number, ky as number);
                if (!endMap.has(k)) endMap.set(k, []);
                endMap.get(k)!.push({ idx: i, end: end as 'start' | 'end' });
            }
        }

        const used = new Set<number>();

        for (let start = 0; start < segs.length; start++) {
            if (used.has(start)) continue;
            used.add(start);

            const chain: [number, number][] = [
                [segs[start].x1, segs[start].y1],
                [segs[start].x2, segs[start].y2],
            ];

            // Extend forward from tail
            let ext = true;
            while (ext) {
                ext = false;
                const [tx, ty] = chain[chain.length - 1];
                for (const c of endMap.get(ptKey(tx, ty)) ?? []) {
                    if (used.has(c.idx)) continue;
                    used.add(c.idx);
                    const s = segs[c.idx];
                    chain.push(c.end === 'start' ? [s.x2, s.y2] : [s.x1, s.y1]);
                    ext = true; break;
                }
            }

            // Extend backward from head
            ext = true;
            while (ext) {
                ext = false;
                const [hx, hy] = chain[0];
                for (const c of endMap.get(ptKey(hx, hy)) ?? []) {
                    if (used.has(c.idx)) continue;
                    used.add(c.idx);
                    const s = segs[c.idx];
                    chain.unshift(c.end === 'end' ? [s.x1, s.y1] : [s.x2, s.y2]);
                    ext = true; break;
                }
            }

            result.push({ layerName, elev, vertices: chain });
        }
    }

    return result;
}

/**
 * Converts joined contour chains into raw DXF LWPOLYLINE entities.
 * Group code 38 sets the uniform Z elevation for the entire polyline.
 *
 * IMPORTANT: AutoCAD 2010+ (and Civil 3D, BricsCAD, etc.) silently DROP any
 * LWPOLYLINE that is missing the AcDbEntity / AcDbPolyline subclass markers
 * and a unique entity handle (group 5). Earlier versions of this writer
 * omitted those, which is why contours stopped appearing in CAD on import.
 */
function contourChainsToRawDxf(chains: ContourChain[], handles: HandleAllocator): string {
    let out = '';
    for (const { layerName, elev, vertices } of chains) {
        if (vertices.length < 2) continue;
        const handleHex = handles.next();
        out += `0\nLWPOLYLINE\n`;
        out += `5\n${handleHex}\n`;            // unique entity handle (required)
        out += `100\nAcDbEntity\n`;            // entity subclass marker (required)
        out += `8\n${layerName}\n`;            // layer
        out += `100\nAcDbPolyline\n`;          // polyline subclass marker (required)
        out += `90\n${vertices.length}\n`;     // vertex count
        out += `70\n0\n`;                      // flags: 0 = open polyline
        out += `38\n${elev.toFixed(4)}\n`;     // elevation (Z applied to whole polyline)
        for (const [x, y] of vertices) {
            out += `10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n`;
        }
    }
    return out;
}

function hexToTrueColorInt(hex?: string): number | null {
    if (!hex) return null;
    const clean = hex.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return parseInt(clean, 16);
}

function steepSlopeFillsToRawDxf(
    steepSlopeFillLines: SurveyLine[],
    style: 'solid' | 'hatch' | 'native-hatch',
    handles: HandleAllocator,
): string {
    let out = '';
    const hatchTs = [0.2, 0.4, 0.6, 0.8];

    for (const line of steepSlopeFillLines) {
        const pts = line.fillPath;
        if (!pts || pts.length < 3) continue;
        const [a, b, c] = pts;
        const layerName = normalizeLayerName(line.layer, 'LINES');
        const trueColor = hexToTrueColorInt(line.color);

        if (style === 'solid') {
            const handleHex = handles.next();
            out += `0\nSOLID\n`;
            out += `5\n${handleHex}\n`;
            out += `100\nAcDbEntity\n`;
            out += `8\n${layerName}\n`;
            if (trueColor !== null) out += `420\n${trueColor}\n`;
            out += `100\nAcDbTrace\n`;
            out += `10\n${a.x.toFixed(4)}\n20\n${a.y.toFixed(4)}\n30\n${(a.z ?? 0).toFixed(4)}\n`;
            out += `11\n${b.x.toFixed(4)}\n21\n${b.y.toFixed(4)}\n31\n${(b.z ?? 0).toFixed(4)}\n`;
            out += `12\n${c.x.toFixed(4)}\n22\n${c.y.toFixed(4)}\n32\n${(c.z ?? 0).toFixed(4)}\n`;
            out += `13\n${c.x.toFixed(4)}\n23\n${c.y.toFixed(4)}\n33\n${(c.z ?? 0).toFixed(4)}\n`;
        } else if (style === 'hatch') {
            for (let i = 0; i < hatchTs.length; i++) {
                const t = hatchTs[i];
                const p1x = a.x + (b.x - a.x) * t;
                const p1y = a.y + (b.y - a.y) * t;
                const p1z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t;
                const p2x = a.x + (c.x - a.x) * t;
                const p2y = a.y + (c.y - a.y) * t;
                const p2z = (a.z ?? 0) + ((c.z ?? 0) - (a.z ?? 0)) * t;

                const handleHex = handles.next();
                out += `0\nLINE\n`;
                out += `5\n${handleHex}\n`;
                out += `100\nAcDbEntity\n`;
                out += `8\n${layerName}\n`;
                if (trueColor !== null) out += `420\n${trueColor}\n`;
                out += `100\nAcDbLine\n`;
                out += `10\n${p1x.toFixed(4)}\n20\n${p1y.toFixed(4)}\n30\n${p1z.toFixed(4)}\n`;
                out += `11\n${p2x.toFixed(4)}\n21\n${p2y.toFixed(4)}\n31\n${p2z.toFixed(4)}\n`;
            }
        } else {
            // Native DXF HATCH entity with a single polyline boundary path.
            // Pattern: ANSI31 for robust cross-CAD compatibility.
            const handleHex = handles.next();
            out += `0\nHATCH\n`;
            out += `5\n${handleHex}\n`;
            out += `100\nAcDbEntity\n`;
            out += `8\n${layerName}\n`;
            if (trueColor !== null) out += `420\n${trueColor}\n`;
            out += `100\nAcDbHatch\n`;
            out += `10\n0.0\n20\n0.0\n30\n0.0\n`; // elevation point
            out += `210\n0.0\n220\n0.0\n230\n1.0\n`; // extrusion
            out += `2\nANSI31\n`; // hatch pattern name
            out += `70\n0\n`; // not solid fill
            out += `71\n0\n`; // non-associative
            out += `91\n1\n`; // one boundary path

            // Boundary path data (polyline path)
            out += `92\n2\n`; // polyline path flag
            out += `72\n1\n`; // has bulge flag
            out += `73\n1\n`; // closed
            out += `93\n3\n`; // number of polyline vertices
            for (const p of [a, b, c]) {
                out += `10\n${p.x.toFixed(4)}\n20\n${p.y.toFixed(4)}\n42\n0.0\n`;
            }
            out += `97\n0\n`; // no source boundary objects

            // Pattern definition (single ANSI31 line family)
            out += `75\n0\n`; // odd parity fill
            out += `76\n1\n`; // predefined pattern type
            out += `52\n0.0\n`; // pattern angle
            out += `41\n1.0\n`; // pattern scale
            out += `77\n0\n`; // not double
            out += `78\n1\n`; // one pattern definition line
            out += `53\n45.0\n`; // pattern line angle
            out += `43\n0.0\n44\n0.0\n`; // base point
            out += `45\n0.0\n46\n0.2\n`; // offset
            out += `79\n2\n`; // dash item count
            out += `49\n0.2\n49\n-0.1\n`; // dash pattern
            out += `47\n1.0\n`; // pixel size
            out += `98\n0\n`; // no seed points
        }
    }

    return out;
}

function parcelLabelsToRawMText(
    parcelLabels: ParcelLabel[],
    textHeight: number,
    parcelLabelFormatter: ParcelLabelFormatter,
    parcelCadTextStyles: ParcelCadTextStyle[],
    propertyOwnerCategory: AnnotationCategoryStyle | null | undefined,
    handles: HandleAllocator,
): string {
    let out = '';
    const escLine = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').trim();
    const sanitizeFont = (name: string | undefined): string => (name ?? '').replace(/[{};]/g, '').trim();
    const textStyle = resolveEffectiveParcelTextStyle(parcelLabelFormatter, parcelCadTextStyles, propertyOwnerCategory);

    for (const label of parcelLabels) {
        if (!isFiniteNumber(label.x) || !isFiniteNumber(label.y)) continue;
        const lines = buildParcelLabelLines(label, parcelLabelFormatter)
            .map(line => applyAnnotationTextCase(line, textStyle.textCase));
        if (lines.length === 0) continue;

        const handleHex = handles.next();
        const textCore = lines.map(escLine).join('\\P');
        const fontName = sanitizeFont(textStyle.fontFamily);
        const italicFlag = textStyle.fontItalic ? 1 : 0;
        const boldFlag = textStyle.fontBold ? 1 : 0;
        const text = fontName ? `{\\f${fontName}|b${boldFlag}|i${italicFlag};${textCore}}` : textCore;
        const rotation = isFiniteNumber(label.angle) ? label.angle : 0;

        out += `0\nMTEXT\n`;
        out += `5\n${handleHex}\n`;
        out += `100\nAcDbEntity\n`;
        out += `8\nPARCEL_LABELS\n`;
        out += `100\nAcDbMText\n`;
        out += `10\n${label.x.toFixed(4)}\n20\n${label.y.toFixed(4)}\n30\n0.0000\n`;
        out += `40\n${textHeight.toFixed(4)}\n`;
        out += `41\n0.0000\n`;
        out += `71\n5\n`; // middle center attachment
        out += `72\n1\n`; // left-to-right text flow
        out += `50\n${rotation.toFixed(4)}\n`;
        out += `73\n2\n`; // line spacing style: exact
        out += `44\n${textStyle.lineSpacing.toFixed(3)}\n`;
        out += `7\nSTANDARD\n`;
        out += mtextValueTags(text);
    }

    return out;
}

type DxfTextStyleOverride = {
    fontFamily?: string;
    fontBold?: boolean;
    fontItalic?: boolean;
    textCase?: 'original' | 'uppercase';
    lineSpacing?: number;
};

function convertTextEntitiesToMText(
    dxf: string,
    handles: HandleAllocator,
    textStyleOverridesByLayer: Record<string, DxfTextStyleOverride> = {},
): string {
    const lines = dxf.split(/\r?\n/);
    const output: string[] = [];
    const textEntityNames = new Set(['TEXT', 'MTEXT']);
    const clampLineSpacing = (value: number | undefined): number => {
        if (typeof value !== 'number' || !isFinite(value)) return 1.2;
        return Math.min(2, Math.max(0.8, value));
    };
    const sanitizeFont = (name: string | undefined): string => (name ?? '').replace(/[{};]/g, '').trim();
    const escLine = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');

    const findValue = (block: string[], code: string): string | null => {
        for (let i = 0; i < block.length - 1; i += 2) {
            if (block[i] === code) return block[i + 1];
        }
        return null;
    };

    const convertBlock = (block: string[]): string[] => {
        const entityType = findValue(block, '0');
        if (entityType !== 'TEXT') return block;

        const text = findValue(block, '1') ?? '';
        const rawHeight = parseFloat(findValue(block, '40') ?? '');
        // AutoCAD rejects MTEXT with a non-positive text height.
        const height = (Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1).toFixed(4);
        const rotation = findValue(block, '50') ?? '0.0';
        const layer = findValue(block, '8') ?? '0';
        const x = findValue(block, '10') ?? '0.0';
        const y = findValue(block, '20') ?? '0.0';
        const z = findValue(block, '30') ?? '0.0';
        const style = findValue(block, '7') ?? 'STANDARD';
        const handle = findValue(block, '5');
        const layerStyle = textStyleOverridesByLayer[layer];
        const transformedText = applyAnnotationTextCase(text, layerStyle?.textCase ?? 'original');
        const textCore = escLine(transformedText).replace(/\r\n|\r|\n/g, '\\P');
        const fontName = sanitizeFont(layerStyle?.fontFamily);
        const italicFlag = layerStyle?.fontItalic ? 1 : 0;
        const boldFlag = layerStyle?.fontBold ? 1 : 0;
        const textWithFormatting = fontName
            ? `{\\f${fontName}|b${boldFlag}|i${italicFlag};${textCore}}`
            : textCore;
        const lineSpacing = clampLineSpacing(layerStyle?.lineSpacing);

        return [
            '0', 'MTEXT',
            '5', handle && handle.length > 0 ? handle : handles.next(),
            '100', 'AcDbEntity',
            '8', layer,
            '100', 'AcDbMText',
            '10', x,
            '20', y,
            '30', z,
            '40', height,
            '41', '0.0',
            '71', '5',
            '72', '1',
            '50', rotation,
            '73', '2',
            '44', lineSpacing.toFixed(3),
            '7', style,
            ...mtextValueTagArray(textWithFormatting),
        ];
    };

    let i = 0;
    while (i < lines.length) {
        if (lines[i] === '0' && i + 1 < lines.length && textEntityNames.has(lines[i + 1])) {
            const block: string[] = ['0', lines[i + 1]];
            i += 2;
            while (i < lines.length) {
                if (lines[i] === '0' && i + 1 < lines.length) break;
                block.push(lines[i], lines[i + 1] ?? '');
                i += 2;
            }
            const converted = convertBlock(block);
            output.push(...converted);
            continue;
        }
        output.push(lines[i]);
        i += 1;
    }

    return output.join('\n');
}

export function generateDxf(
    points: SurveyPoint[],
    lines: SurveyLine[],
    contourLabels: ContourLabel[],
    centerlines: Centerline[],
    options: DxfExportOptions,
    settings: Settings,
    customSymbols: CustomSymbol[],
    parcelLabels: ParcelLabel[] = [],
    parcelLabelFormatter: ParcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
    parcelCadTextStyles: ParcelCadTextStyle[] = [],
    annotationCategories: AnnotationCategoryStyle[] = [],
): string {
    const { coordinatePrecision } = settings;
    const { includePoints, includeLines, includeCenterlines, pointScale, steepSlopeFillStyle = 'solid' } = options;

    const d = new Drawing();

    // Register the standard acad.lin linetype definitions before any layer
    // references them. AutoCAD/Civil 3D discard the whole file when a
    // LayerTableRecord points at an undefined LTYPE.
    const knownLineTypes = new Set<string>(['BYBLOCK', 'BYLAYER']);
    registerStandardLineTypes(d, knownLineTypes);

    // Define layers
    d.addLayer('POINTS', Drawing.ACI.WHITE, 'CONTINUOUS');
    d.addLayer('POINT_NUMBERS', Drawing.ACI.CYAN, 'CONTINUOUS');
    d.addLayer('POINT_DESCRIPTIONS', Drawing.ACI.MAGENTA, 'CONTINUOUS');
    d.addLayer('POINT_ELEVATIONS', Drawing.ACI.GREEN, 'CONTINUOUS');
    d.addLayer('LINES', Drawing.ACI.YELLOW, 'CONTINUOUS');
    d.addLayer('LINE_ANNOTATIONS', Drawing.ACI.RED, 'CONTINUOUS');
    d.addLayer('CENTERLINE', Drawing.ACI.BLUE, 'CENTER');
    d.addLayer('CONTOUR_MAJOR', 8, 'CONTINUOUS'); // Brownish/Dark Gray
    d.addLayer('CONTOUR_MINOR', 9, 'CONTINUOUS'); // Light Gray
    d.addLayer('CONTOUR_LABELS', Drawing.ACI.WHITE, 'CONTINUOUS');
    d.addLayer('PARCEL_LABELS', Drawing.ACI.GREEN, 'CONTINUOUS');
    d.addLayer('DISCLAIMER', Drawing.ACI.CYAN, 'CONTINUOUS');
    const knownLayers = new Set([
        'POINTS',
        'POINT_NUMBERS',
        'POINT_DESCRIPTIONS',
        'POINT_ELEVATIONS',
        'LINES',
        'LINE_ANNOTATIONS',
        'CENTERLINE',
        'CONTOUR_MAJOR',
        'CONTOUR_MINOR',
        'CONTOUR_LABELS',
        'PARCEL_LABELS',
        'DISCLAIMER',
    ]);
    
    const baseTextHeight = 2.5 * pointScale;

    const pointMap = new Map<string, { x: number; y: number; z: number; desc?: string; labelOffset?: { x: number; y: number }; symbol?: PointSymbol; layer?: string }>();
    points.forEach(p => {
        if (isFiniteNumber(p.easting) && isFiniteNumber(p.northing)) {
            pointMap.set(p.pointNumber, { x: p.easting, y: p.northing, z: isFiniteNumber(p.elevation) ? p.elevation! : 0, desc: p.description, labelOffset: p.labelOffset, symbol: p.symbol, layer: p.layer });
        }
    });

    const propertyOwnerCategory = annotationCategories.find(category => category.id === 'property-owners') ?? null;
    const boundaryCategory = annotationCategories.find(category => category.id === 'boundary') ?? null;
    const contourLabelsCategory = annotationCategories.find(category => category.id === 'contour-labels') ?? null;
    const boundaryTextStyle = resolveAnnotationCategoryTextStyle(boundaryCategory, parcelCadTextStyles);
    const contourLabelTextStyle = resolveAnnotationCategoryTextStyle(contourLabelsCategory, parcelCadTextStyles);
    const lineAnnotationTextHeight = baseTextHeight * 0.8 * (isFiniteNumber(boundaryTextStyle.scale) ? boundaryTextStyle.scale : 1);
    const contourLabelTextHeight = baseTextHeight * (isFiniteNumber(contourLabelTextStyle.scale) ? contourLabelTextStyle.scale : 1);

    if (includePoints) {
        const symbolScale = baseTextHeight * 0.5;

        pointMap.forEach((p, pn) => {
            const pointLayer = normalizeLayerName(p.layer, 'POINTS');
            ensureLayer(d, knownLayers, knownLineTypes, pointLayer);
            d.setActiveLayer(pointLayer);
            
            let symbolDrawn = false;
            // TODO: Add custom symbol drawing logic here if needed for DXF export.
            
            if (!symbolDrawn && p.symbol) {
                const s = symbolScale / 2;
                switch (p.symbol) {
                    case 'circle':
                        d.drawCircle(p.x, p.y, s);
                        symbolDrawn = true;
                        break;
                    case 'square':
                        d.drawPolyline([
                            [p.x - s, p.y - s],
                            [p.x + s, p.y - s],
                            [p.x + s, p.y + s],
                            [p.x - s, p.y + s],
                        ], true); // true for closed
                        symbolDrawn = true;
                        break;
                    case 'triangle':
                        const h = s * 2 * (Math.sqrt(3) / 2);
                        d.drawPolyline([
                            [p.x, p.y + h * (2/3)],
                            [p.x - s, p.y - h * (1/3)],
                            [p.x + s, p.y - h * (1/3)],
                        ], true); // true for closed
                        symbolDrawn = true;
                        break;
                    case 'cross':
                        d.drawLine(p.x - s, p.y, p.x + s, p.y);
                        d.drawLine(p.x, p.y - s, p.x, p.y + s);
                        symbolDrawn = true;
                        break;
                    case 'x':
                        d.drawLine(p.x - s, p.y - s, p.x + s, p.y + s);
                        d.drawLine(p.x + s, p.y - s, p.x - s, p.y + s);
                        symbolDrawn = true;
                        break;
                }
            }
            
            if (!symbolDrawn) {
                 d.drawPoint(p.x, p.y);
            }

            const labelOffsetX = p.labelOffset ? p.labelOffset.x * pointScale : baseTextHeight / 2;
            const labelOffsetY = p.labelOffset ? p.labelOffset.y * pointScale : baseTextHeight / 2;

            // Point Number
            d.setActiveLayer('POINT_NUMBERS');
            d.drawText(p.x + labelOffsetX, p.y + labelOffsetY + baseTextHeight, baseTextHeight, 0, pn);

            // Elevation
            if (isFiniteNumber(p.z)) {
                d.setActiveLayer('POINT_ELEVATIONS');
                d.drawText(p.x + labelOffsetX, p.y + labelOffsetY, baseTextHeight, 0, p.z.toFixed(coordinatePrecision));
            }

            // Description
            if (p.desc) {
                d.setActiveLayer('POINT_DESCRIPTIONS');
                d.drawText(p.x + labelOffsetX, p.y + labelOffsetY - baseTextHeight, baseTextHeight, 0, p.desc);
            }
        });
    }

    if (includeLines) {
        lines.forEach(line => {
            // Contour lines are handled separately as joined 3D polylines below
            if (line.type?.startsWith('contour')) return;
            // Steep-slope filled triangles are emitted as raw DXF entities below.
            if (line.type === 'steep-slope' && line.fillPath && line.fillPath.length >= 3) return;

            const p1 = pointMap.get(line.from);
            const p2 = pointMap.get(line.to);
            
            const fromPt = p1 ? { x: p1.x, y: p1.y } : (line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : null);
            const toPt = p2 ? { x: p2.x, y: p2.y } : (line.toPt ? { x: line.toPt.x, y: line.toPt.y } : null);

            if (fromPt && toPt) {
                const lineLayer = normalizeLayerName(line.layer, 'LINES');
                ensureLayer(d, knownLayers, knownLineTypes, lineLayer, line.lineType || 'CONTINUOUS');
                d.setActiveLayer(lineLayer);

                // Check if this is a full circle entity
                if (line.isCircle && line.curveRadius) {
                    const center = line.circleCenter || fromPt || toPt;
                    if (center) {
                        d.drawCircle(center.x, center.y, line.curveRadius);
                    }
                } else if (line.isCurve && line.curveRadius && line.arcLength && line.tangentBearing) {
                    // Check if this is a curve line (from the Boundary Agent)
                    // Parse the tangent bearing to get the direction
                    const parseBearing = (bearing: string): number => {
                        const match = bearing.match(/([NS])\s*(\d+)°(\d+)'(\d+)"?\s*([EW])/);
                        if (!match) return 0;
                        const [, ns, deg, min, sec, ew] = match;
                        let angle = parseInt(deg) + parseInt(min) / 60 + parseInt(sec) / 3600;
                        
                        // Convert to azimuth (0° = North, clockwise)
                        if (ns === 'N' && ew === 'E') {
                            // NE quadrant: azimuth = angle
                        } else if (ns === 'S' && ew === 'E') {
                            // SE quadrant: azimuth = 180 - angle
                            angle = 180 - angle;
                        } else if (ns === 'S' && ew === 'W') {
                            // SW quadrant: azimuth = 180 + angle
                            angle = 180 + angle;
                        } else if (ns === 'N' && ew === 'W') {
                            // NW quadrant: azimuth = 360 - angle
                            angle = 360 - angle;
                        }
                        return angle;
                    };

                    const tangentAzimuth = parseBearing(line.tangentBearing);
                    const tangentAngle = (90 - tangentAzimuth) * Math.PI / 180; // Convert to math angle (CCW from East)
                    
                    const radius = line.curveRadius;
                    const arcLength = line.arcLength;
                    const centralAngle = arcLength / radius; // in radians
                    
                    // Calculate center offset angle (perpendicular to tangent, to the right for right curves)
                    const centerOffsetAngle = tangentAngle - Math.PI / 2; // 90° clockwise from tangent
                    
                    // Calculate center point
                    const centerX = fromPt.x + radius * Math.cos(centerOffsetAngle);
                    const centerY = fromPt.y + radius * Math.sin(centerOffsetAngle);
                    
                    // Calculate start and end angles for the arc
                    const startAngle = Math.atan2(fromPt.y - centerY, fromPt.x - centerX);
                    const endAngle = startAngle - centralAngle; // Clockwise sweep (negative for right curves)
                    
                    // Convert to degrees for DXF
                    let startAngleDeg = startAngle * 180 / Math.PI;
                    let endAngleDeg = endAngle * 180 / Math.PI;
                    
                    // DXF arcs are always CCW, so swap for clockwise curves
                    [startAngleDeg, endAngleDeg] = [endAngleDeg, startAngleDeg];
                    
                    d.drawArc(centerX, centerY, radius, startAngleDeg, endAngleDeg);
                    
                    // Add curve annotations
                    d.setActiveLayer('LINE_ANNOTATIONS');
                    const midAngle = (startAngle + endAngle) / 2;
                    const annotDistance = radius * 1.3;
                    const annotX = centerX + annotDistance * Math.cos(midAngle);
                    const annotY = centerY + annotDistance * Math.sin(midAngle);
                    d.drawText(
                        annotX,
                        annotY,
                        lineAnnotationTextHeight,
                        0,
                        applyAnnotationTextCase(`R=${line.curveRadius}' L=${line.arcLength}'`, boundaryTextStyle.textCase),
                    );
                } else {
                    // Regular straight line
                    d.drawLine(fromPt.x, fromPt.y, toPt.x, toPt.y);
                }

                if (line.bearing && line.distance && fromPt && toPt && !line.isCurve) {
                    d.setActiveLayer('LINE_ANNOTATIONS');
                    const midX = (fromPt.x + toPt.x) / 2;
                    const midY = (fromPt.y + toPt.y) / 2;
                    const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x) * 180 / Math.PI;
                    const text = applyAnnotationTextCase(`${line.bearing} / ${line.distance}`, boundaryTextStyle.textCase);
                    d.drawText(midX, midY, lineAnnotationTextHeight, angle, text);
                }
            }
        });
    }

    d.setActiveLayer('CONTOUR_LABELS');
    contourLabels.forEach(label => {
        d.drawText(
            label.x,
            label.y,
            contourLabelTextHeight,
            label.angle,
            applyAnnotationTextCase(label.text, contourLabelTextStyle.textCase),
        );
    });

    if (includeCenterlines) {
        d.setActiveLayer('CENTERLINE');
        centerlines.forEach(cl => {
            if (cl.pis.length < 2) return;

            let lastPt: CenterlinePI = cl.pis[0];
            for (let i = 0; i < cl.pis.length - 1; i++) {
                const p_curr = cl.pis[i];
                const p_next = cl.pis[i+1];

                const curveAtNext = (i < cl.pis.length - 2 && p_next.curveRadius)
                    ? calculateCurveGeometry(p_curr, p_next, cl.pis[i+2], p_next.curveRadius)
                    : null;
                
                if (curveAtNext) {
                    d.drawLine(lastPt.easting, lastPt.northing, curveAtNext.pcEasting, curveAtNext.pcNorthing);
                    
                    let startAngle = curveAtNext.startAngle * 180 / Math.PI;
                    let endAngle = curveAtNext.endAngle * 180 / Math.PI;
                    // FIX: DXF arcs are always CCW. For a CW (right) turn, we must swap the start and end angles
                    // to draw from the end point to the start point in a CCW direction.
                    if (curveAtNext.turnRight) {
                        [startAngle, endAngle] = [endAngle, startAngle];
                    }
                    d.drawArc(curveAtNext.centerEasting, curveAtNext.centerNorthing, curveAtNext.radius, startAngle, endAngle);
                    
                    lastPt = { ...p_next, easting: curveAtNext.ptEasting, northing: curveAtNext.ptNorthing, id: p_next.id, pointNumber: p_next.pointNumber };
                } else {
                    d.drawLine(lastPt.easting, lastPt.northing, p_next.easting, p_next.northing);
                    lastPt = p_next;
                }
            }
        });
    }
    
    // Add a disclaimer
    d.setActiveLayer('DISCLAIMER');
    let disclaimerX = 0;
    let disclaimerY = -baseTextHeight * 4;
    if (points.length > 0) {
        let minX = Infinity, minY = Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.easting);
            minY = Math.min(minY, p.northing);
        });
        disclaimerX = minX;
        disclaimerY = minY - baseTextHeight * 4;
    }
    d.drawText(disclaimerX, disclaimerY, baseTextHeight * 1.5, 0, "Generated by LandSurv.ai - Professional Review Required");

    // ── Inject joined 3D contour polylines into the ENTITIES section ─────────
    // dxf-writer only writes 2D entities; contours need Z (elevation group 38)
    // and should be continuous polylines rather than individual 2-point lines.
    // Their layers must be registered BEFORE the drawing is serialized, otherwise
    // the raw entities reference layers that never reach the LAYER table.
    const contourLines = lines.filter(l => l.type?.startsWith('contour'));
    const steepSlopeFillLines = lines.filter(l => l.type === 'steep-slope' && !!l.fillPath && l.fillPath.length >= 3);

    if (includeLines) {
        contourLines.forEach(line => {
            const defaultLayer = line.type === 'contour-major' ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR';
            const layerName = normalizeLayerName(line.layer, defaultLayer);
            ensureLayer(d, knownLayers, knownLineTypes, layerName, line.lineType || 'CONTINUOUS');
        });
        steepSlopeFillLines.forEach(line => {
            ensureLayer(d, knownLayers, knownLineTypes, normalizeLayerName(line.layer, 'LINES'));
        });
    }

    let baseDxf = d.toDxfString();

    // Handles for the raw entities continue the sequence dxf-writer used so that
    // nothing collides and $HANDSEED can stay greater than every handle in the file.
    const handles = createHandleAllocator(maxHandleIn(baseDxf) + 1);

    baseDxf = convertTextEntitiesToMText(baseDxf, handles, {
        LINE_ANNOTATIONS: {
            fontFamily: boundaryTextStyle.fontFamily,
            fontBold: boundaryTextStyle.fontBold,
            fontItalic: boundaryTextStyle.fontItalic,
            textCase: boundaryTextStyle.textCase,
            lineSpacing: boundaryTextStyle.lineSpacing,
        },
        CONTOUR_LABELS: {
            fontFamily: contourLabelTextStyle.fontFamily,
            fontBold: contourLabelTextStyle.fontBold,
            fontItalic: contourLabelTextStyle.fontItalic,
            textCase: contourLabelTextStyle.textCase,
            lineSpacing: contourLabelTextStyle.lineSpacing,
        },
    });

    let rawEntities = '';
    if (includeLines && contourLines.length > 0) {
        rawEntities += contourChainsToRawDxf(joinContourSegments(contourLines), handles);
    }
    if (includeLines && steepSlopeFillLines.length > 0) {
        rawEntities += steepSlopeFillsToRawDxf(steepSlopeFillLines, steepSlopeFillStyle, handles);
    }
    if (parcelLabels.length > 0) {
        rawEntities += parcelLabelsToRawMText(parcelLabels, baseTextHeight * 0.8, parcelLabelFormatter, parcelCadTextStyles, propertyOwnerCategory, handles);
    }

    let result = baseDxf;
    if (rawEntities.length > 0) {
        const entitiesStart = baseDxf.indexOf('\n2\nENTITIES\n');
        const entitiesEndIdx = entitiesStart >= 0 ? baseDxf.indexOf('\n0\nENDSEC\n', entitiesStart) : -1;
        result = entitiesEndIdx >= 0
            ? baseDxf.substring(0, entitiesEndIdx + 1) + rawEntities + baseDxf.substring(entitiesEndIdx + 1)
            : baseDxf + rawEntities;
    }

    // AutoCAD requires $HANDSEED to be greater than every handle in the file.
    return applyHandseed(result, handles.peek());
}