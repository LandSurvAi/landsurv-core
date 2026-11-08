import { type AnnotationCategoryStyle, type ParcelCadTextStyle } from '../types.ts';

export type ResolvedAnnotationTextStyle = {
    fontFamily: string;
    fontBold: boolean;
    fontItalic: boolean;
    textCase: 'original' | 'uppercase';
    lineSpacing: number;
    color: string;
    visible: boolean;
    scale: number;
};

const clampLineSpacing = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value)) return 1.2;
    return Math.min(2, Math.max(0.8, value));
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
    };
}

export function applyAnnotationTextCase(
    text: string,
    textCase: 'original' | 'uppercase' = 'original',
): string {
    return textCase === 'uppercase' ? text.toUpperCase() : text;
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