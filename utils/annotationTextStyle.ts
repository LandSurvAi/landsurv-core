import {
    DEFAULT_ANNOTATION_TEXT_STYLES,
    type AnnotationCategoryStyle,
    type AnnotationTextStyle,
    type CanvasTextAnnotation,
    type ParcelCadTextStyle,
} from '../types.ts';

export type ResolvedAnnotationTextStyle = {
    fontFamily: string;
    fontBold: boolean;
    fontItalic: boolean;
    textCase: 'original' | 'uppercase';
    lineSpacing: number;
    color: string;
    visible: boolean;
    scale: number;
    /** Fixed category height before the user scale multiplier. */
    heightPx?: number;
    /** Leroy reference associated with the category size. */
    leroySize?: number;
    maskEnabled: boolean;
    maskPadding: number;
    maskColor?: string;
    maskOpacity: number;
};

export type ResolvedCanvasTextStyle = {
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    height: number;
    widthFactor: number;
    oblique: number;
    textCase: 'original' | 'uppercase' | 'lowercase';
    lineSpacing: number;
    color?: string;
    visible: boolean;
    /** Category scale × per-text scale × existing override (not the global scale). */
    scale: number;
    existingItalic: boolean;
};

const clampLineSpacing = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value)) return 1.2;
    return Math.min(2, Math.max(0.8, value));
};

const clampHeight = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return 11;
    return Math.min(96, Math.max(4, value));
};

/** WIDTH factor: 0.5×–2× keeps text legible without letting a typo flatten it. */
const clampWidthFactor = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return 1;
    return Math.min(2, Math.max(0.5, value));
};

/** OBLIQUE angle in degrees, capped at the AutoCAD-style ±45°. */
const clampOblique = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value)) return 0;
    return Math.min(45, Math.max(-45, value));
};

export function resolveCadTextStyle(
    styleName: string | undefined,
    cadTextStyles: ParcelCadTextStyle[] = [],
): ParcelCadTextStyle | null {
    const normalizedName = styleName?.trim().toLowerCase();
    if (!normalizedName) return null;
    return cadTextStyles.find(style => style.name.trim().toLowerCase() === normalizedName) ?? null;
}

export function resolveAnnotationCategoryTextStyle(
    category: AnnotationCategoryStyle | null | undefined,
    cadTextStyles: ParcelCadTextStyle[] = [],
): ResolvedAnnotationTextStyle {
    const cadStyle = category?.styleSource === 'cad-manager'
        ? resolveCadTextStyle(category.cadTextStyleName, cadTextStyles)
        : null;

    return {
        fontFamily: cadStyle?.fontFamily ?? category?.fontFamily ?? 'Arial',
        fontBold: typeof cadStyle?.fontBold === 'boolean' ? cadStyle.fontBold : (category?.bold ?? false),
        fontItalic: typeof cadStyle?.fontItalic === 'boolean' ? cadStyle.fontItalic : (category?.italic ?? false),
        textCase: cadStyle?.textCase ?? category?.textCase ?? 'original',
        lineSpacing: clampLineSpacing(cadStyle?.lineSpacing ?? category?.lineSpacing),
        color: category?.color ?? '#D1D5DB',
        visible: category?.visible ?? true,
        scale: category?.scale ?? 1,
        heightPx: typeof category?.heightPx === 'number' && category.heightPx > 0
            ? category.heightPx
            : undefined,
        leroySize: category?.leroySize,
        maskEnabled: category?.maskEnabled === true,
        maskPadding: Math.min(24, Math.max(0, category?.maskPadding ?? 2)),
        maskColor: category?.maskColor,
        maskOpacity: Math.min(1, Math.max(0.05, category?.maskOpacity ?? 0.88)),
    };
}

export function applyAnnotationTextCase(
    text: string,
    textCase: 'original' | 'uppercase' | 'lowercase' = 'original',
): string {
    if (textCase === 'uppercase') return text.toUpperCase();
    if (textCase === 'lowercase') return text.toLowerCase();
    return text;
}

/** Find a named text style case-insensitively; falls back to the first style. */
export function resolveAnnotationTextStyleDefinition(
    styleName: string | undefined,
    styles: AnnotationTextStyle[] = DEFAULT_ANNOTATION_TEXT_STYLES,
    fallbackName = DEFAULT_ANNOTATION_TEXT_STYLES[0].name,
): AnnotationTextStyle {
    const catalog: AnnotationTextStyle[] = styles.length > 0 ? styles : DEFAULT_ANNOTATION_TEXT_STYLES;
    const normalized = styleName?.trim().toLowerCase();
    const match = normalized
        ? catalog.find(style => style.name.trim().toLowerCase() === normalized)
        : undefined;
    if (match) return match;
    return catalog.find(style => style.name === fallbackName) ?? catalog[0];
}

/**
 * Resolve everything needed to draw a canvas text entity. Typography comes from
 * the named style (or the category's bound style), while the category still
 * contributes color when the style has none, visibility, scale, and the
 * existing-feature overrides. Named styles deliberately win over category font
 * settings so one style can restyle every text entity without fighting the
 * annotation categories.
 */
export function resolveCanvasTextStyle(params: {
    annotation: CanvasTextAnnotation;
    category?: AnnotationCategoryStyle | null;
    styles?: AnnotationTextStyle[];
    fallbackStyleName?: string;
}): ResolvedCanvasTextStyle {
    const { annotation, category, styles, fallbackStyleName } = params;
    const style = resolveAnnotationTextStyleDefinition(
        annotation.styleName ?? category?.textStyleName ?? fallbackStyleName,
        styles,
    );
    const isExisting = annotation.convention === 'existing';

    return {
        fontFamily: annotation.fontFamily || style.fontFamily || 'Arial',
        bold: Boolean(style.bold),
        italic: Boolean(style.italic) || (isExisting && Boolean(category?.existingItalic)),
        height: clampHeight(annotation.height ?? style.height),
        widthFactor: clampWidthFactor(style.widthFactor),
        oblique: clampOblique(style.oblique),
        textCase: style.textCase ?? 'original',
        lineSpacing: clampLineSpacing(style.lineSpacing),
        color: annotation.color ?? style.color ?? category?.color,
        visible: category?.visible ?? true,
        scale: (annotation.scale ?? 1) * (category?.scale ?? 1) * (isExisting ? (category?.existingScale ?? 1) : 1),
        existingItalic: Boolean(category?.existingItalic),
    };
}

export function resolveAnnotationTextSize(
    baseSize: number,
    scalingMode: 'screen' | 'world',
    transformScale: number,
): number {
    return scalingMode === 'world' ? baseSize * transformScale : baseSize;
}

/**
 * Converts a fixed on-screen text height (CSS px) into world units for the
 * current canvas transform. Use this for annotations drawn inside the
 * world-space pass so their apparent size stays constant while zooming.
 */
export function screenTextHeightToWorld(
    screenHeightPx: number,
    transformScale: number,
): number {
    const height = Number(screenHeightPx);
    const scale = Number(transformScale);
    if (!Number.isFinite(height) || height <= 0) return 0;
    if (!Number.isFinite(scale) || scale <= 0) return height;
    return height / scale;
}