import React, { useMemo, useState } from 'react';
import type {
    AnnotationRule,
    AnnotationTextStyle,
    CanvasTextAnnotation,
    SurveyPoint,
} from '../types';
import { DEFAULT_ANNOTATION_TEXT_STYLES } from '../types';
import {
    buildPointLabelAnnotations,
    describeLabelAllResult,
    parseLabelAllRequest,
} from '../services/annotationStudio';
import { resolveAnnotationTextStyleDefinition } from '../utils/annotationTextStyle';
import { ANNOTATION_FONT_OPTIONS } from '../utils/annotationFonts.ts';
import { LEROY_STANDARD_SIZES, formatLeroySize, leroyToScreenPx, nearestLeroySize } from '../utils/annotationSizing.ts';

const FONT_OPTIONS = ANNOTATION_FONT_OPTIONS;

const updateStyle = (
    styles: AnnotationTextStyle[],
    id: string,
    patch: Partial<AnnotationTextStyle>,
): AnnotationTextStyle[] => styles.map(style => (style.id === id ? { ...style, ...patch } : style));

const uniqueStyleName = (styles: AnnotationTextStyle[], base: string): string => {
    const names = new Set(styles.map(style => style.name.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let index = 2;
    while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
    return `${base} ${index}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Text style library
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationTextStyleLibraryPanelProps {
    styles: AnnotationTextStyle[];
    activeStyleName: string;
    onChange: (styles: AnnotationTextStyle[]) => void;
    onChangeActiveStyle: (name: string) => void;
    globalScale?: number;
}

export const AnnotationTextStyleLibraryPanel: React.FC<AnnotationTextStyleLibraryPanelProps> = ({
    styles,
    activeStyleName,
    onChange,
    onChangeActiveStyle,
    globalScale = 1,
}) => {
    const catalog = styles.length > 0 ? styles : DEFAULT_ANNOTATION_TEXT_STYLES;
    const resolvedActive = resolveAnnotationTextStyleDefinition(activeStyleName, catalog);
    const [selectedId, setSelectedId] = useState<string>(resolvedActive.id);
    const selected = catalog.find(style => style.id === selectedId) ?? resolvedActive;

    const patch = (changes: Partial<AnnotationTextStyle>) => {
        onChange(updateStyle(catalog, selected.id, changes));
    };

    const addStyle = () => {
        const name = uniqueStyleName(catalog, 'New Text Style');
        const style: AnnotationTextStyle = {
            ...selected,
            id: `text_style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name,
        };
        onChange([...catalog, style]);
        setSelectedId(style.id);
    };

    const duplicateStyle = () => {
        const name = uniqueStyleName(catalog, `${selected.name} Copy`);
        const style: AnnotationTextStyle = {
            ...selected,
            id: `text_style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name,
        };
        onChange([...catalog, style]);
        setSelectedId(style.id);
    };

    const deleteStyle = () => {
        if (catalog.length <= 1) return;
        const remaining = catalog.filter(style => style.id !== selected.id);
        onChange(remaining);
        if (activeStyleName.trim().toLowerCase() === selected.name.trim().toLowerCase()) {
            onChangeActiveStyle(remaining[0].name);
        }
        setSelectedId(remaining[0].id);
    };

    const previewSize = Math.max(10, Math.min(28, selected.height * Math.max(0.5, Math.min(globalScale, 2))));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-white">Text Styles</h3>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                        Font, height, width factor, oblique, case, and spacing for every canvas text and generated label.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={addStyle}
                    className="shrink-0 rounded-md bg-cyan-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
                >
                    + New
                </button>
            </div>

            <div className="flex flex-col gap-1">
                {catalog.map(style => {
                    const isSelected = style.id === selected.id;
                    const isActive = style.name.trim().toLowerCase() === activeStyleName.trim().toLowerCase();
                    return (
                        <button
                            key={style.id}
                            type="button"
                            onClick={() => setSelectedId(style.id)}
                            className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left ${
                                isSelected
                                    ? 'border-cyan-500/60 bg-cyan-900/20'
                                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                            }`}
                        >
                            <span
                                className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-cyan-300' : 'bg-gray-600'}`}
                                title={isActive ? 'Used for new text' : 'Not active'}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-gray-100">{style.name}</span>
                                <span className="block truncate text-[10px] text-gray-500">
                                    {style.fontFamily} · {formatLeroySize(style.leroySize ?? nearestLeroySize(style.height)) || `${style.height}px`} · {style.height}px · {style.widthFactor.toFixed(2)}w
                                </span>
                            </span>
                            {isActive && <span className="text-[9px] font-bold uppercase tracking-wide text-cyan-300">Active</span>}
                        </button>
                    );
                })}
            </div>

            <div className="space-y-3 rounded-lg border border-white/10 bg-gray-900/60 p-3">
                <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Name</label>
                    <input
                        type="text"
                        value={selected.name}
                        onChange={event => patch({ name: event.target.value })}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Font</label>
                    <input
                        type="text"
                        list="annotation-text-font-options"
                        value={selected.fontFamily}
                        onChange={event => patch({ fontFamily: event.target.value })}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
                    />
                    <datalist id="annotation-text-font-options">
                        {FONT_OPTIONS.map(font => <option key={font} value={font} />)}
                    </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Leroy reference</label>
                        <select
                            aria-label="Leroy size"
                            value={selected.leroySize ?? nearestLeroySize(selected.height)}
                            onChange={event => {
                                const leroy = Number(event.target.value);
                                if (Number.isFinite(leroy) && leroy > 0) {
                                    patch({ height: leroyToScreenPx(leroy), leroySize: leroy });
                                }
                            }}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                        >
                            {LEROY_STANDARD_SIZES.map(size => (
                                <option key={size} value={size}>{formatLeroySize(size)} · {leroyToScreenPx(size)} px</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Height (px)</label>
                        <input
                            type="number"
                            min={4}
                            max={96}
                            step={0.5}
                            value={selected.height}
                            onChange={event => {
                                const value = parseFloat(event.target.value);
                                if (Number.isFinite(value) && value > 0) patch({ height: value, leroySize: nearestLeroySize(value) });
                            }}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Line spacing</label>
                        <input
                            type="number"
                            min={0.8}
                            max={2}
                            step={0.05}
                            value={selected.lineSpacing}
                            onChange={event => {
                                const value = parseFloat(event.target.value);
                                if (Number.isFinite(value) && value > 0) patch({ lineSpacing: value });
                            }}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                        <span>Width factor</span>
                        <span className="font-mono text-gray-300">{selected.widthFactor.toFixed(2)}×</span>
                    </label>
                    <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={selected.widthFactor}
                        onChange={event => patch({ widthFactor: parseFloat(event.target.value) })}
                        className="w-full accent-cyan-500"
                    />
                </div>

                <div>
                    <label className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                        <span>Oblique</span>
                        <span className="font-mono text-gray-300">{selected.oblique.toFixed(0)}°</span>
                    </label>
                    <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={selected.oblique}
                        onChange={event => patch({ oblique: parseFloat(event.target.value) })}
                        className="w-full accent-cyan-500"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => patch({ bold: !selected.bold })}
                        className={`h-7 w-7 rounded border text-xs font-bold ${
                            selected.bold
                                ? 'border-amber-400 bg-amber-900/30 text-amber-300'
                                : 'border-white/15 text-gray-500'
                        }`}
                    >
                        B
                    </button>
                    <button
                        type="button"
                        onClick={() => patch({ italic: !selected.italic })}
                        className={`h-7 w-7 rounded border text-xs italic ${
                            selected.italic
                                ? 'border-sky-400 bg-sky-900/30 text-sky-300'
                                : 'border-white/15 text-gray-500'
                        }`}
                    >
                        I
                    </button>
                    <select
                        value={selected.textCase}
                        onChange={event => patch({ textCase: event.target.value as AnnotationTextStyle['textCase'] })}
                        className="min-w-0 flex-1 rounded border border-white/15 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                        title="Text case"
                    >
                        <option value="original">Original case</option>
                        <option value="uppercase">UPPERCASE</option>
                        <option value="lowercase">lowercase</option>
                    </select>
                    <label className="relative h-7 w-7 cursor-pointer rounded border border-white/20" title="Style color">
                        <span className="absolute inset-0 rounded" style={{ backgroundColor: selected.color || '#e2e8f0' }} />
                        <input
                            type="color"
                            value={selected.color || '#e2e8f0'}
                            onChange={event => patch({ color: event.target.value })}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                    </label>
                </div>

                <div
                    className="rounded border border-white/10 bg-[#0a0f16] px-3 py-2"
                    style={{
                        color: selected.color || '#e2e8f0',
                        fontFamily: selected.fontFamily,
                        fontWeight: selected.bold ? 700 : 400,
                        fontStyle: selected.italic ? 'italic' : 'normal',
                        fontSize: `${previewSize}px`,
                        lineHeight: `${previewSize * selected.lineSpacing}px`,
                        transform: `skewX(${-selected.oblique}deg) scaleX(${selected.widthFactor})`,
                        transformOrigin: 'left center',
                    }}
                >
                    {selected.textCase === 'uppercase'
                        ? 'INV 723.45'
                        : selected.textCase === 'lowercase'
                            ? 'inv 723.45'
                            : 'Inv 723.45'}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onChangeActiveStyle(selected.name)}
                            className="rounded bg-cyan-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-600"
                        >
                            Use for new text
                        </button>
                        <button
                            type="button"
                            onClick={duplicateStyle}
                            className="rounded bg-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
                        >
                            Duplicate
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={deleteStyle}
                        disabled={catalog.length <= 1}
                        className="rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-900/20 disabled:cursor-not-allowed disabled:text-gray-600"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Text on canvas + quick labels
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasTextListPanelProps {
    annotations: CanvasTextAnnotation[];
    styles: AnnotationTextStyle[];
    activeStyleName: string;
    points: SurveyPoint[];
    rules: AnnotationRule[];
    onAddText?: () => void;
    onEditText?: (id: string) => void;
    onUpdateText?: (id: string, patch: Partial<CanvasTextAnnotation>) => void;
    onDeleteText?: (id: string) => void;
    onAddLabels?: (annotations: CanvasTextAnnotation[]) => void;
}

type MessageTone = 'ok' | 'error' | 'info';

export const CanvasTextListPanel: React.FC<CanvasTextListPanelProps> = ({
    annotations,
    styles,
    activeStyleName,
    points,
    rules,
    onAddText,
    onEditText,
    onUpdateText,
    onDeleteText,
    onAddLabels,
}) => {
    const catalog = styles.length > 0 ? styles : DEFAULT_ANNOTATION_TEXT_STYLES;
    const [selectedId, setSelectedId] = useState<string | null>(annotations[0]?.id ?? null);
    const [request, setRequest] = useState('Label all inverts');
    const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(null);

    const selected = useMemo(
        () => annotations.find(annotation => annotation.id === selectedId) ?? null,
        [annotations, selectedId],
    );

    const runLabelRequest = () => {
        const parsed = parseLabelAllRequest(request);
        if (!parsed) {
            setMessage({
                text: 'Try “Label all inverts” or “Label all utility poles”.',
                tone: 'error',
            });
            return;
        }
        const result = buildPointLabelAnnotations(points, parsed, {
            rules,
            styleName: activeStyleName,
            existingAnnotations: annotations,
            categoryId: 'callout',
        });
        const summary = describeLabelAllResult(parsed, result);
        if (result.annotations.length > 0) {
            onAddLabels?.(result.annotations);
            setSelectedId(result.annotations[0].id);
            setMessage({ text: summary, tone: 'ok' });
        } else {
            setMessage({ text: summary, tone: result.matchedCount === 0 ? 'error' : 'info' });
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-white">Text on Canvas</h3>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                        In-canvas notes and generated point labels. Double-click any text on the drawing to edit it in place.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onAddText}
                    className="shrink-0 rounded-md bg-cyan-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
                >
                    + Add Text
                </button>
            </div>

            {/* Quick label-all */}
            <div className="space-y-2 rounded-lg border border-purple-700/40 bg-purple-900/10 p-3">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-purple-200">Label matching points</span>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={request}
                        onChange={event => setRequest(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') runLabelRequest();
                        }}
                        placeholder="Label all inverts"
                        className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"
                    />
                    <button
                        type="button"
                        onClick={runLabelRequest}
                        className="rounded bg-purple-700 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-600"
                    >
                        Label
                    </button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {['Label all inverts', 'Label all utility poles', 'Label all manholes'].map(chip => (
                        <button
                            key={chip}
                            type="button"
                            onClick={() => setRequest(chip)}
                            className="rounded-full border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-200 hover:bg-purple-800/30"
                        >
                            {chip}
                        </button>
                    ))}
                </div>
                {message && (
                    <p className={`text-[11px] ${
                        message.tone === 'error'
                            ? 'text-red-400'
                            : message.tone === 'ok'
                                ? 'text-emerald-300'
                                : 'text-gray-400'
                    }`}>
                        {message.text}
                    </p>
                )}
            </div>

            {/* Text list */}
            <div className="flex flex-col gap-1">
                {annotations.length === 0 ? (
                    <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-xs text-gray-500">
                        No text on the canvas yet. Use <span className="font-semibold text-gray-300">+ Add Text</span> or
                        type <span className="font-mono text-gray-300">TEXT</span> on the command line.
                    </div>
                ) : annotations.map(annotation => {
                    const isSelected = annotation.id === selectedId;
                    const style = resolveAnnotationTextStyleDefinition(annotation.styleName, catalog);
                    return (
                        <button
                            key={annotation.id}
                            type="button"
                            onClick={() => setSelectedId(annotation.id)}
                            className={`flex items-start gap-2 rounded border px-2 py-1.5 text-left ${
                                isSelected
                                    ? 'border-cyan-500/60 bg-cyan-900/20'
                                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                            }`}
                        >
                            <span
                                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: annotation.color || '#67e8f9' }}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-gray-100">
                                    {annotation.text.split('\n')[0] || '(empty text)'}
                                </span>
                                <span className="block truncate text-[10px] text-gray-500">
                                    {style.name}
                                    {annotation.sourcePointNumber ? ` · PN ${annotation.sourcePointNumber}` : ''}
                                    {annotation.leaderTo ? ' · leader' : ''}
                                    {annotation.hidden ? ' · hidden' : ''}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {selected && (
                <div className="space-y-3 rounded-lg border border-white/10 bg-gray-900/60 p-3">
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Content</label>
                        <textarea
                            value={selected.text}
                            rows={3}
                            onChange={event => onUpdateText?.(selected.id, { text: event.target.value })}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Style</label>
                            <select
                                value={resolveAnnotationTextStyleDefinition(selected.styleName, catalog).name}
                                onChange={event => onUpdateText?.(selected.id, { styleName: event.target.value })}
                                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                            >
                                {catalog.map(style => (
                                    <option key={style.id} value={style.name}>{style.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">Rotation°</label>
                            <input
                                type="number"
                                step={1}
                                value={selected.angle}
                                onChange={event => {
                                    const value = parseFloat(event.target.value);
                                    if (Number.isFinite(value)) onUpdateText?.(selected.id, { angle: value });
                                }}
                                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr,3rem] items-center gap-2">
                        <input
                            type="range"
                            min={0.25}
                            max={4}
                            step={0.05}
                            value={selected.scale ?? 1}
                            onChange={event => onUpdateText?.(selected.id, { scale: parseFloat(event.target.value) })}
                            className="w-full accent-cyan-500"
                        />
                        <span className="text-right font-mono text-[10px] text-gray-300">{(selected.scale ?? 1).toFixed(2)}×</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="relative h-7 w-7 cursor-pointer rounded border border-white/20" title="Text color override">
                            <span className="absolute inset-0 rounded" style={{ backgroundColor: selected.color || '#67e8f9' }} />
                            <input
                                type="color"
                                value={selected.color || '#67e8f9'}
                                onChange={event => onUpdateText?.(selected.id, { color: event.target.value })}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => onUpdateText?.(selected.id, { hidden: !selected.hidden })}
                            className="rounded bg-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
                        >
                            {selected.hidden ? 'Show' : 'Hide'}
                        </button>
                        <button
                            type="button"
                            onClick={() => onEditText?.(selected.id)}
                            className="rounded bg-cyan-800 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-700"
                        >
                            Edit on canvas
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onDeleteText?.(selected.id);
                                setSelectedId(null);
                            }}
                            className="ml-auto rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-900/20"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
