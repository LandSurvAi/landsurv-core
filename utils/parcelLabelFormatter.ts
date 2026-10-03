import { DEFAULT_PARCEL_LABEL_FORMATTER, type AnnotationCategoryStyle, type ParcelCadTextStyle, type ParcelLabelFormatter, type ParcelLabelTextData } from '../types.ts';
import { resolveAnnotationCategoryTextStyle } from './annotationTextStyle.ts';

type ResolvedParcelTextStyle = {
    fontFamily: string;
    fontBold: boolean;
    fontItalic: boolean;
    textCase: 'original' | 'uppercase';
    lineSpacing: number;
};

const PARCEL_STYLE_PRESETS: Record<NonNullable<ParcelLabelFormatter['stylePreset']>, ResolvedParcelTextStyle> = {
    'narrow-cad': {
        fontFamily: 'Arial Narrow',
        fontBold: false,
        fontItalic: true,
        textCase: 'uppercase',
        lineSpacing: 1.2,
    },
    'classic-cad': {
        fontFamily: 'Romans',
        fontBold: false,
        fontItalic: false,
        textCase: 'uppercase',
        lineSpacing: 1.15,
    },
    'plan-readable': {
        fontFamily: 'Calibri',
        fontBold: true,
        fontItalic: false,
        textCase: 'original',
        lineSpacing: 1.3,
    },
    'field-compact': {
        fontFamily: 'Simplex',
        fontBold: false,
        fontItalic: false,
        textCase: 'uppercase',
        lineSpacing: 1.0,
    },
};

export const DEFAULT_PARCEL_CAD_TEXT_STYLES: ParcelCadTextStyle[] = [
    { name: 'Parcel Owner - Narrow CAD', fontFamily: 'Arial Narrow', fontBold: false, fontItalic: true, textCase: 'uppercase', lineSpacing: 1.2 },
    { name: 'Parcel Owner - Classic CAD', fontFamily: 'Romans', fontBold: false, fontItalic: false, textCase: 'uppercase', lineSpacing: 1.15 },
    { name: 'Parcel Owner - Plan Readable', fontFamily: 'Calibri', fontBold: true, fontItalic: false, textCase: 'original', lineSpacing: 1.3 },
    { name: 'Parcel Owner - Field Compact', fontFamily: 'Simplex', fontBold: false, fontItalic: false, textCase: 'uppercase', lineSpacing: 1.0 },
];

const clampLineSpacing = (value: number | undefined): number => {
    if (typeof value !== 'number' || !isFinite(value)) return 1.2;
    return Math.min(2, Math.max(0.8, value));
};

const normalizeText = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const buildDeedBookPageLine = (parcel: ParcelLabelTextData): string | null => {
    const deedBook = normalizeText(parcel.deedBook);
    const deedPage = normalizeText(parcel.deedPage);
    if (deedBook && deedPage) return `Deed Bk/Pg ${deedBook}/${deedPage}`;
    if (deedBook) return `Deed Book ${deedBook}`;
    if (deedPage) return `Deed Page ${deedPage}`;

    const deedRef = normalizeText(parcel.deedRef);
    if (!deedRef) return null;
    return deedRef.split('|').map(part => part.trim()).filter(Boolean)[0] ?? null;
};

const buildBlockUnitLine = (parcel: ParcelLabelTextData): string | null => {
    const block = normalizeText(parcel.block);
    const unit = normalizeText(parcel.unit);
    if (block && unit) return `Block/Unit ${block}/${unit}`;
    if (block) return `Block ${block}`;
    if (unit) return `Unit ${unit}`;

    const deedRef = normalizeText(parcel.deedRef);
    if (!deedRef) return null;
    return deedRef.split('|').map(part => part.trim()).filter(Boolean)[1] ?? null;
};

export function resolveParcelTextStyle(
    formatter: ParcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
    cadTextStyles: ParcelCadTextStyle[] = DEFAULT_PARCEL_CAD_TEXT_STYLES,
): ResolvedParcelTextStyle {
    const presetName = formatter.stylePreset ?? DEFAULT_PARCEL_LABEL_FORMATTER.stylePreset ?? 'narrow-cad';
    const preset = PARCEL_STYLE_PRESETS[presetName] ?? PARCEL_STYLE_PRESETS['narrow-cad'];

    const cadStyle = formatter.styleSource === 'cad-manager'
        ? cadTextStyles.find(style => style.name.toLowerCase() === (formatter.cadTextStyleName ?? '').toLowerCase())
        : null;

    return {
        fontFamily: normalizeText(cadStyle?.fontFamily) ?? normalizeText(formatter.fontFamily) ?? preset.fontFamily,
        fontBold: typeof cadStyle?.fontBold === 'boolean' ? cadStyle.fontBold : (typeof formatter.fontBold === 'boolean' ? formatter.fontBold : preset.fontBold),
        fontItalic: typeof cadStyle?.fontItalic === 'boolean' ? cadStyle.fontItalic : (typeof formatter.fontItalic === 'boolean' ? formatter.fontItalic : preset.fontItalic),
        textCase: cadStyle?.textCase ?? formatter.textCase ?? preset.textCase,
        lineSpacing: clampLineSpacing(cadStyle?.lineSpacing ?? formatter.lineSpacing ?? preset.lineSpacing),
    };
}

export function resolveEffectiveParcelTextStyle(
    formatter: ParcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
    cadTextStyles: ParcelCadTextStyle[] = DEFAULT_PARCEL_CAD_TEXT_STYLES,
    propertyOwnerCategory?: AnnotationCategoryStyle | null,
): ResolvedParcelTextStyle {
    if (propertyOwnerCategory?.styleSource === 'cad-manager' && propertyOwnerCategory.cadTextStyleName) {
        const categoryStyle = resolveAnnotationCategoryTextStyle(propertyOwnerCategory, cadTextStyles);
        return {
            fontFamily: categoryStyle.fontFamily,
            fontBold: categoryStyle.fontBold,
            fontItalic: categoryStyle.fontItalic,
            textCase: categoryStyle.textCase,
            lineSpacing: categoryStyle.lineSpacing,
        };
    }
    return resolveParcelTextStyle(formatter, cadTextStyles);
}

export function buildParcelLabelLines(
    parcel: ParcelLabelTextData,
    formatter: ParcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
): string[] {
    const lines: string[] = [];

    if (formatter.includeParcelId) {
        lines.push(`Parcel ID: ${normalizeText(parcel.parcelId) ?? 'PARCEL'}`);
    }

    const owner = normalizeText(parcel.owner);
    if (formatter.includeOwner && owner) {
        const prefix = formatter.prependOwnerPrefix ? normalizeText(formatter.ownerPrefix) ?? 'N/F' : null;
        lines.push(prefix ? `${prefix} ${owner}` : owner);
    }

    if (formatter.includeDeedBookPage) {
        const deedBookPage = buildDeedBookPageLine(parcel);
        if (deedBookPage) lines.push(deedBookPage);
    }

    if (formatter.includeBlockUnit) {
        const blockUnit = buildBlockUnitLine(parcel);
        if (blockUnit) lines.push(blockUnit);
    }

    return lines;
}

export function formatParcelLabelLines(
    parcel: ParcelLabelTextData,
    formatter: ParcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
    cadTextStyles: ParcelCadTextStyle[] = DEFAULT_PARCEL_CAD_TEXT_STYLES,
): string[] {
    const textStyle = resolveParcelTextStyle(formatter, cadTextStyles);
    const lines = buildParcelLabelLines(parcel, formatter);

    if (textStyle.textCase === 'uppercase') return lines.map(line => line.toUpperCase());
    return lines;
}