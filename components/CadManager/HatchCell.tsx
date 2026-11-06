/**
 * HatchCell Component
 *
 * Interactive cell for the Hatch column in StandardsEditor (and A2UI standards).
 * Features:
 *  - Live 2D canvas swatch preview of the assigned HatchDefinition
 *  - Smart recommendation badge based on code/description
 *  - Popover picker with search, category filter (All / Standard / Environmental / FEMA / Custom),
 *    and one-click assignment or clear.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  HatchDefinition,
  ALL_BUILT_IN_HATCHES,
  getHatchByName,
  resolveHatchForFeatureOrCode,
  renderHatchPreview,
} from '../../services/hatchLibrary';

export interface HatchCellProps {
  hatchPattern?: string;
  codeName: string;
  codeDescription: string;
  customHatches?: HatchDefinition[];
  onHatchChange: (patternName: string | undefined) => void;
  isLocked?: boolean;
}

export const HatchSwatch: React.FC<{
  hatch: HatchDefinition;
  size?: number;
  color?: string;
}> = ({ hatch, size = 24, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderHatchPreview(ctx, hatch, color || hatch.previewColor || '#22d3ee', '#0b1420');
  }, [hatch, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded border border-white/10 flex-shrink-0"
    />
  );
};

export const HatchCell: React.FC<HatchCellProps> = ({
  hatchPattern,
  codeName,
  codeDescription,
  customHatches = [],
  onHatchChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'standard' | 'environmental' | 'fema' | 'custom'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const allHatches = useMemo(
    () => [...ALL_BUILT_IN_HATCHES, ...customHatches],
    [customHatches],
  );

  const currentHatch = useMemo(() => {
    if (!hatchPattern || hatchPattern === '-') return undefined;
    return getHatchByName(hatchPattern, customHatches);
  }, [hatchPattern, customHatches]);

  const suggestedHatch = useMemo(() => {
    const rec = resolveHatchForFeatureOrCode(`${codeName} ${codeDescription}`, {
      customHatches,
    });
    return rec.source !== 'default' ? rec.hatch : null;
  }, [codeName, codeDescription, customHatches]);

  const filteredHatches = useMemo(() => {
    return allHatches.filter(h => {
      if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          h.name.toLowerCase().includes(q) ||
          h.description.toLowerCase().includes(q) ||
          (h.usage && h.usage.toLowerCase().includes(q)) ||
          (h.femaZone && h.femaZone.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allHatches, categoryFilter, search]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5 min-w-[8rem]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(v => !v);
        }}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-cyan-400/40 text-left transition-colors w-full"
        title={currentHatch ? `${currentHatch.name}: ${currentHatch.description}` : 'Click to assign a hatch pattern'}
      >
        {currentHatch ? (
          <>
            <HatchSwatch hatch={currentHatch} size={20} />
            <span className="font-mono text-xs text-cyan-200 truncate">{currentHatch.name}</span>
          </>
        ) : hatchPattern && hatchPattern !== '-' ? (
          <span className="font-mono text-xs text-amber-300 truncate">{hatchPattern}</span>
        ) : (
          <span className="text-xs text-slate-500 italic">— None —</span>
        )}
      </button>

      {currentHatch && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHatchChange(undefined);
          }}
          className="text-slate-500 hover:text-rose-400 text-xs px-1"
          title="Clear hatch assignment"
        >
          ×
        </button>
      )}

      {isOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-white/15 bg-[#0b1420] p-2.5 shadow-2xl space-y-2"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-[11px] font-semibold text-slate-200">
              Hatch Pattern for <span className="font-mono text-cyan-300">{codeName}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {suggestedHatch && (!currentHatch || currentHatch.name !== suggestedHatch.name) && (
            <div className="flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <HatchSwatch hatch={suggestedHatch} size={22} />
                <div className="min-w-0">
                  <div className="text-[10px] text-cyan-300 font-semibold">Suggested: {suggestedHatch.name}</div>
                  <div className="text-[9px] text-slate-400 truncate">{suggestedHatch.description}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onHatchChange(suggestedHatch.name);
                  setIsOpen(false);
                }}
                className="ml-2 shrink-0 rounded bg-cyan-500/25 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/40"
              >
                Use
              </button>
            </div>
          )}

          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ANSI31, AR-CONC, SOLID..."
            className="w-full rounded border border-white/10 bg-[#070d16] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />

          <div className="flex flex-wrap gap-1">
            {(['all', 'standard', 'environmental', 'fema', 'custom'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold capitalize transition-colors ${
                  categoryFilter === cat
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
            {filteredHatches.map(h => {
              const isSelected = currentHatch?.name === h.name;
              return (
                <button
                  key={h.name}
                  type="button"
                  onClick={() => {
                    onHatchChange(h.name);
                    setIsOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition-all ${
                    isSelected
                      ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100'
                      : 'border-white/[0.07] bg-[#070d16]/80 text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                  title={h.description}
                >
                  <HatchSwatch hatch={h} size={34} />
                  <span className="font-mono text-[10px] truncate max-w-full">{h.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                onHatchChange(undefined);
                setIsOpen(false);
              }}
              className="text-[10px] text-slate-400 hover:text-rose-300"
            >
              Clear Hatch
            </button>
            <span className="text-[9.5px] text-slate-500">{filteredHatches.length} patterns</span>
          </div>
        </div>
      )}
    </div>
  );
};
