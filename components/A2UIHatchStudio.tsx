/**
 * A2UIHatchStudio Component
 *
 * Fluid, conversational A2UI surface for hatching requests in chat.
 * Bridges natural-language hatching requests ("hatch the building", "fill the
 * concrete sidewalk with AR-CONC", "hatch flood zone AE", "let me pick a hatch")
 * with instant visual customization and one-click canvas / CACP execution.
 *
 * Supports inline chat rendering, docking into the Agent Tool Shelf, and floating
 * over the canvas via `A2UISurface`.
 */

import React, { useMemo, useState } from 'react';
import { useCadManager } from '../contexts/CadManagerContext.tsx';
import {
  ALL_BUILT_IN_HATCHES,
  getHatchByName,
  resolveHatchForFeatureOrCode,
  type HatchDefinition,
} from '../services/hatchLibrary.ts';
import { HatchPreviewCanvas } from './CadManager/HatchManagerPanel.tsx';
import { DecimalInput } from './DecimalInput.tsx';
import type { A2UIHatchStudioSpec } from '../types.ts';

export interface A2UIHatchStudioProps {
  spec?: A2UIHatchStudioSpec;
  onStartCanvasHatch?: (options: {
    mode: 'pick-area' | 'select-object';
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  onApplyToSelection?: (options: {
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  onOpenHatchManager?: () => void;
  onOpenSpreadsheetEditor?: () => void;
}

export const A2UIHatchStudio: React.FC<A2UIHatchStudioProps> = ({
  spec,
  onStartCanvasHatch,
  onApplyToSelection,
  onOpenHatchManager,
  onOpenSpreadsheetEditor,
}) => {
  const cadManager = useCadManager();
  const standard = cadManager.state?.standard ?? null;
  const customHatches = useMemo(() => standard?.hatches ?? [], [standard?.hatches]);

  const allPatterns = useMemo<HatchDefinition[]>(
    () => [...ALL_BUILT_IN_HATCHES, ...customHatches],
    [customHatches],
  );

  const initialRec = useMemo(() => {
    const seed = spec?.patternName || spec?.targetFeature || spec?.code || 'ANSI31';
    return resolveHatchForFeatureOrCode(seed, {
      customHatches,
      codes: standard?.codes,
    });
  }, [spec?.patternName, spec?.targetFeature, spec?.code, customHatches, standard?.codes]);

  const [patternName, setPatternName] = useState<string>(
    spec?.patternName?.toUpperCase() || initialRec.hatch.name,
  );
  const [scale, setScale] = useState<number>(spec?.scale ?? initialRec.recommendedScale ?? 1);
  const [angleDeg, setAngleDeg] = useState<number>(spec?.angleDeg ?? initialRec.recommendedAngle ?? 0);
  const [opacity, setOpacity] = useState<number>(spec?.opacity ?? 0.45);
  const [color, setColor] = useState<string>(
    spec?.color || initialRec.hatch.previewColor || '#22d3ee',
  );
  const [layer, setLayer] = useState<string>(
    spec?.layer || initialRec.recommendedLayer || 'V-ANNO-PATT',
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'standard' | 'environmental' | 'fema' | 'custom'>('all');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const activeHatch = useMemo(
    () => getHatchByName(patternName, customHatches) ?? allPatterns[0],
    [patternName, customHatches, allPatterns],
  );

  const visiblePatterns = useMemo(() => {
    if (categoryFilter === 'all') return allPatterns;
    return allPatterns.filter(p => p.category === categoryFilter);
  }, [allPatterns, categoryFilter]);

  const handleSaveToStandardCode = () => {
    if (!standard) return;
    const targetCode = (spec?.code || spec?.targetFeature || '').trim().toUpperCase();
    const matchedIdx = (standard.codes ?? []).findIndex(
      c =>
        c.code.toUpperCase() === targetCode ||
        (spec?.targetFeature && c.description.toLowerCase().includes(spec.targetFeature.toLowerCase())),
    );
    if (matchedIdx >= 0) {
      const nextCodes = [...standard.codes];
      nextCodes[matchedIdx] = {
        ...nextCodes[matchedIdx],
        hatchPattern: activeHatch.name,
        hatchScale: scale,
        hatchAngle: angleDeg,
        hatchLayer: layer,
      };
      cadManager.dispatch({
        type: 'SET_STANDARD',
        payload: { ...standard, codes: nextCodes, lastUpdated: new Date().toISOString() },
      });
      setSavedNotice(`Saved ${activeHatch.name} to code "${nextCodes[matchedIdx].code}" in ${standard.name}.`);
    } else {
      setSavedNotice(`Configured ${activeHatch.name} (×${scale}, ${angleDeg}°) as active hatch preset.`);
    }
  };

  return (
    <div
      data-testid="a2ui-hatch-studio"
      className="rounded-xl border border-cyan-400/25 bg-[#08101c]/95 p-3 text-xs text-slate-200 space-y-3 shadow-lg"
    >
      {/* Header + Live Preview */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1">
          <HatchPreviewCanvas
            hatch={activeHatch}
            size={72}
            scale={scale}
            angleDeg={angleDeg}
            color={color}
            opacity={opacity}
          />
          <span className="font-mono text-[10px] font-bold text-cyan-300">{activeHatch.name}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-white">
                {spec?.title || 'Interactive Hatch Studio'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {spec?.description || activeHatch.description}
              </p>
            </div>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-200">
              CACP · .PAT
            </span>
          </div>

          {/* Fluid Parameter Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <label className="block">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-400 block mb-0.5">
                Scale ({scale}×)
              </span>
              <DecimalInput
                min={0.05}
                max={100}
                value={scale}
                onValueChange={setScale}
                className="w-full rounded border border-white/10 bg-[#050b14] px-2 py-1 font-mono text-xs text-white"
                aria-label="Hatch scale"
              />
            </label>

            <label className="block">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-400 block mb-0.5">
                Angle ({angleDeg}°)
              </span>
              <input
                type="number"
                step="15"
                value={angleDeg}
                onChange={e => setAngleDeg(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-white/10 bg-[#050b14] px-2 py-1 font-mono text-xs text-white"
              />
            </label>

            <label className="block">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-400 block mb-0.5">
                Opacity ({Math.round(opacity * 100)}%)
              </span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={opacity}
                onChange={e => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 mt-1.5"
              />
            </label>

            <label className="block">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-400 block mb-0.5">
                Color &amp; Layer
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="h-6 w-7 rounded border border-white/10 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={layer}
                  onChange={e => setLayer(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-[#050b14] px-1.5 py-1 font-mono text-[10.5px] text-cyan-200"
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Category chips + Pattern Carousel */}
      <div className="space-y-1.5 pt-1 border-t border-white/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1">
            {(['all', 'standard', 'environmental', 'fema', 'custom'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors ${
                  categoryFilter === cat
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                    : 'bg-white/[0.03] text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Quick Key: <kbd className="rounded bg-white/10 px-1 py-0.2 text-cyan-300">H</kbd>
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5">
          {visiblePatterns.map(pat => {
            const isSelected = pat.name === activeHatch.name;
            return (
              <button
                key={pat.name}
                type="button"
                onClick={() => {
                  setPatternName(pat.name);
                  if (pat.previewColor) setColor(pat.previewColor);
                }}
                className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 shrink-0 transition-all ${
                  isSelected
                    ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/30'
                    : 'border-white/[0.07] bg-[#050b14]/80 text-slate-300 hover:border-white/20'
                }`}
                title={`${pat.name}: ${pat.description}`}
              >
                <HatchPreviewCanvas hatch={pat} size={38} />
                <span className="font-mono text-[9.5px] max-w-[54px] truncate">{pat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Action Strip: Fluid -> Canvas / Standard */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.07]">
        <button
          type="button"
          onClick={() =>
            onStartCanvasHatch?.({
              mode: 'pick-area',
              patternName: activeHatch.name,
              scale,
              angleDeg,
              opacity,
              color,
              layer,
            })
          }
          data-testid="a2ui-hatch-pick-area"
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 transition-colors"
        >
          <span>🎯</span> Click in Area on Canvas (H)
        </button>

        <button
          type="button"
          onClick={() =>
            onStartCanvasHatch?.({
              mode: 'select-object',
              patternName: activeHatch.name,
              scale,
              angleDeg,
              opacity,
              color,
              layer,
            })
          }
          data-testid="a2ui-hatch-select-object"
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 transition-colors"
        >
          <span>⬡</span> Select Closed Object
        </button>

        {onApplyToSelection && (
          <button
            type="button"
            onClick={() =>
              onApplyToSelection({
                patternName: activeHatch.name,
                scale,
                angleDeg,
                opacity,
                color,
                layer,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition-colors"
          >
            ✓ Hatch Selected Entities
          </button>
        )}

        <button
          type="button"
          onClick={handleSaveToStandardCode}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2 py-1.5 text-[10.5px] font-medium text-slate-300 transition-colors"
        >
          💾 Save to Standard
        </button>

        {onOpenHatchManager && (
          <button
            type="button"
            onClick={onOpenHatchManager}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2 py-1.5 text-[10.5px] font-medium text-cyan-300 transition-colors"
          >
            Full Hatch Manager →
          </button>
        )}
        {onOpenSpreadsheetEditor && (
          <button
            type="button"
            onClick={onOpenSpreadsheetEditor}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2 py-1.5 text-[10.5px] font-medium text-slate-300 transition-colors"
          >
            Spreadsheet
          </button>
        )}
      </div>

      {savedNotice && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] text-emerald-200">
          {savedNotice}
        </div>
      )}
    </div>
  );
};

export default A2UIHatchStudio;
