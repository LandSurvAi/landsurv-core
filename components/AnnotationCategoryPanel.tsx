import React from 'react';
import { AnnotationCategoryStyle, DEFAULT_ANNOTATION_CATEGORIES, type ParcelCadTextStyle } from '../types';

interface Props {
    categories: AnnotationCategoryStyle[];
    onChange: (categories: AnnotationCategoryStyle[]) => void;
    globalScale: number;
    onChangeGlobalScale: (scale: number) => void;
    cadTextStyles: ParcelCadTextStyle[];
}

const FONT_OPTIONS = ['Arial', 'Arial Narrow', 'Calibri', 'Romans', 'Simplex'];

function update(
    categories: AnnotationCategoryStyle[],
    id: string,
    patch: Partial<AnnotationCategoryStyle>,
): AnnotationCategoryStyle[] {
    return categories.map(c => (c.id === id ? { ...c, ...patch } : c));
}

export const AnnotationCategoryPanel: React.FC<Props> = ({
    categories,
    onChange,
    globalScale,
    onChangeGlobalScale,
    cadTextStyles = [],
}) => {
    // Fall back to defaults if empty
    const cats = categories.length > 0 ? categories : DEFAULT_ANNOTATION_CATEGORIES;

    return (
        <div className="flex flex-col gap-3 px-1">
            {/* Global scale */}
            <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                <span className="text-[11px] text-gray-400 w-24 shrink-0">Global Scale</span>
                <input
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={globalScale}
                    onChange={e => onChangeGlobalScale(parseFloat(e.target.value))}
                    className="flex-1 accent-cyan-400 h-1"
                />
                <span className="text-[10px] text-gray-400 w-9 text-right font-mono">
                    {globalScale.toFixed(2)}×
                </span>
            </div>

            {/* Category rows */}
            <div className="flex flex-col gap-1.5">
                {cats.map(cat => (
                    <div key={cat.id} className="bg-white/5 rounded p-2 flex flex-col gap-1.5">
                        {/* Row 1 — name + visible + color */}
                        <div className="flex items-center gap-2">
                            <button
                                title={cat.visible ? 'Hide' : 'Show'}
                                onClick={() => onChange(update(cats, cat.id, { visible: !cat.visible }))}
                                className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                                    cat.visible
                                        ? 'border-white/20 text-white bg-white/10'
                                        : 'border-white/10 text-gray-500 bg-transparent'
                                }`}
                            >
                                {cat.visible ? '●' : '○'}
                            </button>
                            <span
                                className="text-[11px] font-medium flex-1"
                                style={{ color: cat.color }}
                            >
                                {cat.label}
                            </span>
                            {/* Color swatch */}
                            <label className="relative cursor-pointer" title="Color">
                                <span
                                    className="inline-block w-4 h-4 rounded border border-white/20"
                                    style={{ backgroundColor: cat.color }}
                                />
                                <input
                                    type="color"
                                    value={cat.color}
                                    onChange={e => onChange(update(cats, cat.id, { color: e.target.value }))}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                />
                            </label>
                            {/* Bold */}
                            <button
                                title="Bold"
                                onClick={() => onChange(update(cats, cat.id, { bold: !cat.bold }))}
                                className={`text-[11px] w-5 h-5 rounded border font-bold transition-colors ${
                                    cat.bold
                                        ? 'border-amber-400 text-amber-400 bg-amber-900/30'
                                        : 'border-white/15 text-gray-500'
                                }`}
                            >
                                B
                            </button>
                            {/* Italic */}
                            <button
                                title="Italic"
                                onClick={() => onChange(update(cats, cat.id, { italic: !cat.italic }))}
                                className={`text-[11px] w-5 h-5 rounded border italic transition-colors ${
                                    cat.italic
                                        ? 'border-sky-400 text-sky-400 bg-sky-900/30'
                                        : 'border-white/15 text-gray-500'
                                }`}
                            >
                                I
                            </button>
                        </div>

                        {/* Row 2 — scale slider */}
                        <div className="flex items-center gap-2 pl-6">
                            <span className="text-[10px] text-gray-500 w-8 shrink-0">Scale</span>
                            <input
                                type="range"
                                min={0.1}
                                max={3.0}
                                step={0.05}
                                value={cat.scale}
                                onChange={e => onChange(update(cats, cat.id, { scale: parseFloat(e.target.value) }))}
                                className="flex-1 accent-cyan-400 h-1"
                            />
                            <span className="text-[10px] text-gray-400 w-9 text-right font-mono">
                                {cat.scale.toFixed(2)}×
                            </span>
                        </div>

                        <div className="grid grid-cols-[3.5rem,1fr] gap-2 pl-6 items-center">
                            <span className="text-[10px] text-gray-500">Style</span>
                            <select
                                value={cat.styleSource === 'cad-manager' ? (cat.cadTextStyleName ?? '') : ''}
                                onChange={e => {
                                    const nextName = e.target.value;
                                    onChange(update(cats, cat.id, nextName
                                        ? { styleSource: 'cad-manager', cadTextStyleName: nextName }
                                        : { styleSource: 'local', cadTextStyleName: undefined }));
                                }}
                                className="min-w-0 text-[10px] bg-white/5 border border-white/15 rounded px-1.5 py-1 text-gray-300"
                            >
                                <option value="">Local Overrides</option>
                                {cadTextStyles.map(style => (
                                    <option key={style.name} value={style.name}>{style.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-[3.5rem,1fr] gap-2 pl-6 items-center">
                            <span className="text-[10px] text-gray-500">Font</span>
                            <select
                                value={cat.fontFamily}
                                disabled={cat.styleSource === 'cad-manager'}
                                onChange={e => onChange(update(cats, cat.id, { fontFamily: e.target.value, styleSource: 'local' }))}
                                className="min-w-0 text-[10px] bg-white/5 border border-white/15 rounded px-1.5 py-1 text-gray-300 disabled:text-gray-500"
                            >
                                {FONT_OPTIONS.map(font => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        </div>

                        {/* Row 3 — existing overrides */}
                        <div className="flex items-center gap-2 pl-6">
                            <span className="text-[10px] text-gray-500 w-14 shrink-0">Existing</span>
                            {/* Existing italic toggle */}
                            <button
                                title="Auto-italic for existing items"
                                onClick={() => onChange(update(cats, cat.id, { existingItalic: !cat.existingItalic }))}
                                className={`text-[10px] px-1.5 py-0 rounded border italic transition-colors ${
                                    cat.existingItalic
                                        ? 'border-sky-400 text-sky-400 bg-sky-900/30'
                                        : 'border-white/15 text-gray-500'
                                }`}
                            >
                                italic
                            </button>
                            <span className="text-[10px] text-gray-500">scale</span>
                            <input
                                type="number"
                                min={0.05}
                                max={2}
                                step={0.05}
                                value={cat.existingScale}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v > 0) onChange(update(cats, cat.id, { existingScale: v }));
                                }}
                                className="w-14 text-[10px] bg-white/5 border border-white/15 rounded px-1 py-0.5 text-gray-300 font-mono text-right"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Reset to defaults */}
            <button
                onClick={() => onChange([...DEFAULT_ANNOTATION_CATEGORIES])}
                className="text-[10px] text-gray-500 hover:text-gray-300 self-center underline underline-offset-2 transition-colors"
            >
                Reset to defaults
            </button>
        </div>
    );
};
