import React, { useState } from 'react';
import { type AnnotationDimension } from '../types.ts';
import { type DimensionStyleSettings, DEFAULT_DIMENSION_SETTINGS } from './DimensionSettingsModal.tsx';
import { XMarkIcon, TrashIcon, UndoIcon } from './icons.tsx';

interface DimensionSettingsPanelProps {
    globalSettings: DimensionStyleSettings;
    onUpdateGlobalSettings: (settings: DimensionStyleSettings) => void;
    selectedDimension: AnnotationDimension | null;
    onUpdateSelectedDimension?: (updated: AnnotationDimension) => void;
    onDeleteSelectedDimension?: (id: string) => void;
    onDeselectDimension?: () => void;
    onClose: () => void;
}

const COLOR_SWATCHES = [
    { label: 'Cyan', value: '#00E5FF' },
    { label: 'Yellow', value: '#FACC15' },
    { label: 'Green', value: '#4ADE80' },
    { label: 'White', value: '#FFFFFF' },
    { label: 'Orange', value: '#FB923C' },
    { label: 'Magenta', value: '#E879F9' },
    { label: 'Rose', value: '#F43F5E' },
];

export const DimensionSettingsPanel: React.FC<DimensionSettingsPanelProps> = ({
    globalSettings,
    onUpdateGlobalSettings,
    selectedDimension,
    onUpdateSelectedDimension,
    onDeleteSelectedDimension,
    onDeselectDimension,
    onClose,
}) => {
    const isSelectedMode = !!selectedDimension;

    // Resolve current values: from selected dimension if in selected mode, else global
    const currentColor = isSelectedMode
        ? (selectedDimension.color || globalSettings.color)
        : globalSettings.color;

    const currentArrowStyle = isSelectedMode
        ? (selectedDimension.arrowStyle || globalSettings.arrowStyle)
        : globalSettings.arrowStyle;

    const currentArrowSize = isSelectedMode
        ? (selectedDimension.arrowSize ?? globalSettings.arrowSize)
        : globalSettings.arrowSize;

    const currentTextHeight = isSelectedMode
        ? (selectedDimension.textHeight ?? globalSettings.textHeight)
        : globalSettings.textHeight;

    const currentTextPlacement = isSelectedMode
        ? (selectedDimension.textPlacement || globalSettings.textPlacement)
        : globalSettings.textPlacement;

    const currentPrecision = isSelectedMode
        ? (selectedDimension.precision ?? globalSettings.precision)
        : globalSettings.precision;

    const currentScalingMode = isSelectedMode
        ? (selectedDimension.scalingMode || globalSettings.scalingMode)
        : globalSettings.scalingMode;

    const handleColorChange = (color: string) => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, color });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, color });
        }
    };

    const handleArrowStyleChange = (arrowStyle: 'closed' | 'open' | 'tick' | 'dot') => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, arrowStyle });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, arrowStyle });
        }
    };

    const handleArrowSizeChange = (arrowSize: number) => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, arrowSize });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, arrowSize });
        }
    };

    const handleTextHeightChange = (textHeight: number) => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, textHeight });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, textHeight });
        }
    };

    const handleTextPlacementChange = (textPlacement: 'above' | 'centered') => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, textPlacement });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, textPlacement });
        }
    };

    const handlePrecisionChange = (precision: number) => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, precision });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, precision });
        }
    };

    const handleScalingModeChange = (scalingMode: 'world' | 'screen') => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({ ...selectedDimension, scalingMode });
        } else {
            onUpdateGlobalSettings({ ...globalSettings, scalingMode });
        }
    };

    const handleTextOverrideChange = (textOverride: string) => {
        if (isSelectedMode && selectedDimension && onUpdateSelectedDimension) {
            onUpdateSelectedDimension({
                ...selectedDimension,
                textOverride: textOverride.trim() ? textOverride : undefined,
            });
        }
    };

    const handleApplyToAll = () => {
        if (selectedDimension) {
            onUpdateGlobalSettings({
                ...globalSettings,
                color: currentColor,
                arrowStyle: currentArrowStyle,
                arrowSize: currentArrowSize,
                textHeight: currentTextHeight,
                textPlacement: currentTextPlacement,
                precision: currentPrecision,
                scalingMode: currentScalingMode,
            });
        }
    };

    const handleResetSelected = () => {
        if (selectedDimension && onUpdateSelectedDimension) {
            const cleaned = { ...selectedDimension };
            delete cleaned.color;
            delete cleaned.arrowStyle;
            delete cleaned.arrowSize;
            delete cleaned.textHeight;
            delete cleaned.textPlacement;
            delete cleaned.precision;
            delete cleaned.scalingMode;
            delete cleaned.textOverride;
            onUpdateSelectedDimension(cleaned);
        }
    };

    return (
        <div className="absolute top-16 right-4 z-40 w-72 bg-gray-950/90 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-2xl p-3 text-xs text-gray-200 select-none animate-fade-in flex flex-col gap-2.5 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isSelectedMode ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
                        <span className="font-bold text-white text-[11px] tracking-wide">
                            {isSelectedMode ? `SELECTED DIMENSION` : 'GLOBAL DIMENSION STYLE'}
                        </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                        {isSelectedMode
                            ? `${selectedDimension.type.toUpperCase()} • Live in Scene`
                            : 'Applies to all dimensions live'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {isSelectedMode && onDeselectDimension && (
                        <button
                            type="button"
                            onClick={onDeselectDimension}
                            className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors"
                            title="Deselect this dimension to edit global settings"
                        >
                            Global
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
                        title="Close panel"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Custom Text Override (Selected dimension only) */}
            {isSelectedMode && (
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 block">Text Override (Custom Text)</label>
                    <input
                        type="text"
                        value={selectedDimension?.textOverride || ''}
                        onChange={e => handleTextOverrideChange(e.target.value)}
                        placeholder="Leave blank for auto measurement"
                        className="w-full bg-gray-900 border border-gray-700 focus:border-cyan-400 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none"
                    />
                </div>
            )}

            {/* Color Swatches */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-gray-400">Color</span>
                    <span className="text-[10px] font-mono" style={{ color: currentColor }}>{currentColor}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {COLOR_SWATCHES.map(sw => (
                        <button
                            key={sw.value}
                            type="button"
                            onClick={() => handleColorChange(sw.value)}
                            style={{ backgroundColor: sw.value }}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                currentColor === sw.value ? 'scale-115 border-white shadow-md' : 'border-transparent hover:scale-105 opacity-80'
                            }`}
                            title={sw.label}
                        />
                    ))}
                    <input
                        type="color"
                        value={currentColor}
                        onChange={e => handleColorChange(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                        title="Custom Color"
                    />
                </div>
            </div>

            {/* Arrow Style */}
            <div className="space-y-1">
                <span className="text-[10px] font-medium text-gray-400 block">Arrowhead Style</span>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                    {[
                        { label: 'Closed', value: 'closed' },
                        { label: 'Open', value: 'open' },
                        { label: 'Tick', value: 'tick' },
                        { label: 'Dot', value: 'dot' },
                    ].map(st => (
                        <button
                            key={st.value}
                            type="button"
                            onClick={() => handleArrowStyleChange(st.value as any)}
                            className={`py-1 px-1 rounded text-center border transition-colors ${
                                currentArrowStyle === st.value
                                    ? 'bg-cyan-600 border-cyan-400 text-white font-bold shadow-sm'
                                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                            }`}
                        >
                            {st.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Arrow Size & Text Height Sliders */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>Arrow Size</span>
                        <span className="font-mono text-cyan-300">{currentArrowSize.toFixed(1)}</span>
                    </div>
                    <input
                        type="range"
                        min="3"
                        max="20"
                        step="0.5"
                        value={currentArrowSize}
                        onChange={e => handleArrowSizeChange(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-gray-800 rounded"
                    />
                </div>
                <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>Text Height</span>
                        <span className="font-mono text-cyan-300">{currentTextHeight.toFixed(1)}'</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="8"
                        step="0.1"
                        value={currentTextHeight}
                        onChange={e => handleTextHeightChange(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-gray-800 rounded"
                    />
                </div>
            </div>

            {/* Text Placement & Sizing Mode */}
            <div className="space-y-1">
                <span className="text-[10px] font-medium text-gray-400 block">Text Placement</span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <button
                        type="button"
                        onClick={() => handleTextPlacementChange('centered')}
                        className={`py-1 rounded border transition-colors ${
                            currentTextPlacement === 'centered'
                                ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                                : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        Centered (Breaks line)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTextPlacementChange('above')}
                        className={`py-1 rounded border transition-colors ${
                            currentTextPlacement === 'above'
                                ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                                : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        Above Line
                    </button>
                </div>
            </div>

            {/* Decimal Precision */}
            <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-gray-400">
                    <span>Precision</span>
                    <span className="font-mono text-cyan-300">.{'0'.repeat(currentPrecision)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-[10px]">
                    {[0, 1, 2, 3, 4].map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => handlePrecisionChange(p)}
                            className={`py-1 rounded border transition-colors ${
                                currentPrecision === p
                                    ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                            }`}
                        >
                            .{p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Text Sizing Behavior: World (Zoomable) vs Screen */}
            <div className="space-y-1">
                <span className="text-[10px] font-medium text-gray-400 block">Sizing Behavior</span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <button
                        type="button"
                        onClick={() => handleScalingModeChange('world')}
                        className={`py-1 rounded border transition-colors ${
                            currentScalingMode === 'world'
                                ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                                : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        World (Zoomable)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleScalingModeChange('screen')}
                        className={`py-1 rounded border transition-colors ${
                            currentScalingMode === 'screen'
                                ? 'bg-cyan-600 border-cyan-400 text-white font-bold'
                                : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        Screen (Constant)
                    </button>
                </div>
            </div>

            {/* Master Scale (in Global mode) */}
            {!isSelectedMode && (
                <div className="pt-1.5 border-t border-gray-800 space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Master Dimension Scale</span>
                        <span className="font-mono text-cyan-300">{globalSettings.scale.toFixed(2)}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.25"
                        max="5.0"
                        step="0.05"
                        value={globalSettings.scale}
                        onChange={e => onUpdateGlobalSettings({ ...globalSettings, scale: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-gray-800 rounded"
                    />
                </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-gray-800 flex items-center gap-1.5">
                {isSelectedMode ? (
                    <>
                        <button
                            type="button"
                            onClick={handleApplyToAll}
                            className="flex-1 py-1 px-2 rounded text-[10px] font-semibold bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-cyan-500/30 transition-colors"
                            title="Make this dimension's style the new global default"
                        >
                            Apply to All
                        </button>
                        <button
                            type="button"
                            onClick={handleResetSelected}
                            className="py-1 px-2 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title="Reset to global style"
                        >
                            Reset
                        </button>
                        {onDeleteSelectedDimension && selectedDimension && (
                            <button
                                type="button"
                                onClick={() => onDeleteSelectedDimension(selectedDimension.id)}
                                className="p-1 rounded bg-red-950/60 hover:bg-red-900 text-red-300 transition-colors"
                                title="Delete this dimension"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => onUpdateGlobalSettings(DEFAULT_DIMENSION_SETTINGS)}
                        className="w-full py-1 text-[10px] text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded flex items-center justify-center gap-1 transition-colors"
                    >
                        <UndoIcon className="w-3 h-3" />
                        Reset All Defaults
                    </button>
                )}
            </div>
        </div>
    );
};
