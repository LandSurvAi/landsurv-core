/**
 * HatchManagerPanel — Professional CAD Hatch Workspace & Manager
 * v26.11.05
 *
 * Provides:
 *  - Visual grid of standard ACAD/ISO, Survey/Civil, Environmental, and FEMA hatch patterns
 *  - Live multi-scale (0.5×, 1×, 2×), rotation angle, color, opacity, and CAD layer controls
 *  - Direct "Hatch by Area (Pick Point)" and "Hatch by Select Object" canvas tool triggers
 *  - Active Canvas Hatches inspector (list, toggle visibility, edit pattern/scale/angle/layer, delete)
 *  - Custom pattern builder (manual DXF PAT field entry + AI natural-language pattern generator)
 *  - Import .PAT / Export .PAT (AutoCAD & Civil 3D compatible)
 *  - Custom hatches are stored on StandardDefinition.hatches[] and persist in .lsvz
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HatchDefinition,
  HatchPatternLine,
  STANDARD_HATCHES,
  FEMA_HATCHES,
  ALL_BUILT_IN_HATCHES,
  exportToPat,
  importFromPat,
  renderHatchPreview,
  createCanvasHatchTile,
  getHatchByName,
} from '../../services/hatchLibrary';
import type { CanvasHatch } from '../../types';
import { DecimalInput } from '../DecimalInput.tsx';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HatchManagerPanelProps {
  /** Custom hatches stored on the current standard (StandardDefinition.hatches). */
  customHatches: HatchDefinition[];
  /** Callback when user creates / edits / deletes a custom hatch. */
  onCustomHatchesChange: (hatches: HatchDefinition[]) => void;
  /** Optional list of placed CanvasHatch entities on the drawing canvas. */
  canvasHatches?: CanvasHatch[];
  /** Update an existing CanvasHatch on the canvas. */
  onUpdateCanvasHatch?: (id: string, patch: Partial<CanvasHatch>) => void;
  /** Delete a placed CanvasHatch from the canvas. */
  onDeleteCanvasHatch?: (id: string) => void;
  /** Start interactive Hatch mode on the drawing canvas. */
  onStartCanvasHatch?: (options: {
    mode: 'pick-area' | 'select-object';
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  /** Available CAD layers for assigning hatch output. */
  availableLayers?: string[];
  /** Active drawing layer name. */
  activeLayer?: string;
}

// ─── Tiny preview card ────────────────────────────────────────────────────────

interface HatchCardProps {
  hatch: HatchDefinition;
  selected?: boolean;
  scale?: number;
  angleDeg?: number;
  color?: string;
  onSelect?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}

export function HatchPreviewCanvas({
  hatch,
  size = 64,
  scale = 1,
  angleDeg = 0,
  color,
  opacity = 0.85,
}: {
  hatch: HatchDefinition;
  size?: number;
  scale?: number;
  angleDeg?: number;
  color?: string;
  opacity?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (scale === 1 && angleDeg === 0) {
      renderHatchPreview(ctx, hatch, color ?? hatch.previewColor ?? '#22d3ee', '#0f172a');
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, size);
      const tile = createCanvasHatchTile(hatch, {
        scale,
        angleDeg,
        color: color ?? hatch.previewColor ?? '#22d3ee',
        opacity,
      });
      if (tile) {
        const pat = ctx.createPattern(tile, 'repeat');
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, size, size);
        }
      } else {
        renderHatchPreview(ctx, hatch, color ?? hatch.previewColor ?? '#22d3ee', '#0f172a');
      }
    }
  }, [hatch, size, scale, angleDeg, color, opacity]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block', borderRadius: 4 }}
    />
  );
}

function HatchCard({ hatch, selected, scale = 1, angleDeg = 0, color, onSelect, onDelete, onExport }: HatchCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border cursor-pointer transition-all select-none
        ${selected
          ? 'border-cyan-400/60 bg-cyan-400/15 ring-1 ring-cyan-400/30'
          : 'border-white/[0.07] bg-[#0b1420]/80 hover:border-white/[0.16] hover:bg-white/[0.04]'
        } light-theme:bg-[#0b1420] light-theme:border-white/[0.12]`}
    >
      <HatchPreviewCanvas hatch={hatch} size={56} scale={scale} angleDeg={angleDeg} color={color} />
      <span className="text-xs text-slate-200 font-mono text-center leading-tight max-w-[80px] truncate" title={hatch.name}>
        {hatch.name}
      </span>
      {hatch.femaZone ? (
        <span className="text-[9.5px] text-cyan-400 font-medium">Zone {hatch.femaZone}</span>
      ) : (
        <span className="text-[9.5px] text-slate-500 capitalize">{hatch.category}</span>
      )}
      {(onDelete || onExport) && (
        <div className="absolute top-1 right-1 flex gap-1">
          {onExport && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); }}
              className="w-4 h-4 text-[10px] text-slate-400 hover:text-cyan-400 transition-colors"
              title="Export .PAT"
            >↓</button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-4 h-4 text-[10px] text-slate-400 hover:text-red-400 transition-colors"
              title="Delete"
            >×</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Blank hatch template ────────────────────────────────────────────────────

const BLANK_HATCH: HatchDefinition = {
  name: '',
  description: '',
  category: 'custom',
  lines: [
    { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125, dashes: undefined },
  ],
  isAcadStandard: false,
};

function blankLine(): HatchPatternLine {
  return { angle: 0, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 };
}

/** Synthesize a custom HatchDefinition from a natural-language description. */
function generateHatchFromPrompt(prompt: string): HatchDefinition {
  const lower = prompt.toLowerCase();
  const angleMatch = prompt.match(/(-?\d+(?:\.\d+)?)\s*(?:deg|°|degree)/i);
  const baseAngle = angleMatch ? parseFloat(angleMatch[1]) : lower.includes('horizontal') ? 0 : lower.includes('vertical') ? 90 : 45;
  const spacingMatch = prompt.match(/(?:spacing|every|delta|step)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  const spacing = spacingMatch ? Math.max(0.02, Math.min(2, parseFloat(spacingMatch[1]))) : lower.includes('tight') || lower.includes('dense') ? 0.0625 : lower.includes('wide') || lower.includes('loose') ? 0.25 : 0.125;
  const isCross = /\b(?:cross|grid|mesh|check|plaid|double|diamond)\b/i.test(lower);
  const isDashed = /\b(?:dash|dashed|broken|intermittent|ripple)\b/i.test(lower);
  const isDotted = /\b(?:dot|dots|stipple|sand|grain)\b/i.test(lower);

  const dashes = isDotted
    ? [0, -spacing]
    : isDashed
      ? [spacing * 1.5, -spacing]
      : undefined;

  const lines: HatchPatternLine[] = [
    { angle: baseAngle, originX: 0, originY: 0, deltaX: 0, deltaY: spacing, dashes },
  ];
  if (isCross) {
    lines.push({ angle: (baseAngle + 90) % 360, originX: 0, originY: 0, deltaX: 0, deltaY: spacing, dashes });
  }

  const slug = prompt
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || 'CUSTOM_PAT';

  return {
    name: `CUST_${slug}`,
    description: prompt.trim() || 'AI-authored custom hatch pattern',
    category: 'custom',
    isAcadStandard: false,
    defaultScale: 1,
    previewColor: '#22d3ee',
    lines,
  };
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function HatchManagerPanel({
  customHatches,
  onCustomHatchesChange,
  canvasHatches = [],
  onUpdateCanvasHatch,
  onDeleteCanvasHatch,
  onStartCanvasHatch,
  availableLayers = [],
  activeLayer = 'V-ANNO-PATT',
}: HatchManagerPanelProps) {
  const [section, setSection] = useState<'standard' | 'fema' | 'custom' | 'canvas' | 'editor'>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<HatchDefinition | null>(() => STANDARD_HATCHES[1] ?? STANDARD_HATCHES[0]);
  const [editing, setEditing] = useState<HatchDefinition>(BLANK_HATCH);
  const [aiPrompt, setAiPrompt] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Live placement parameters
  const [hatchScale, setHatchScale] = useState<number>(1);
  const [hatchAngle, setHatchAngle] = useState<number>(0);
  const [hatchOpacity, setHatchOpacity] = useState<number>(0.45);
  const [hatchColor, setHatchColor] = useState<string>('#22d3ee');
  const [hatchLayer, setHatchLayer] = useState<string>(activeLayer || 'V-ANNO-PATT');

  const allPatterns = useMemo(
    () => [...ALL_BUILT_IN_HATCHES, ...customHatches],
    [customHatches],
  );

  const filteredStandard = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return STANDARD_HATCHES;
    return STANDARD_HATCHES.filter(
      h =>
        h.name.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q) ||
        (h.usage && h.usage.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  const filteredFema = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FEMA_HATCHES;
    return FEMA_HATCHES.filter(
      h =>
        h.name.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q) ||
        (h.femaZone && h.femaZone.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  // ── Export single hatch as .PAT ─────────────────────────────────────────────
  const handleExportOne = useCallback((hatch: HatchDefinition) => {
    const content = exportToPat([hatch]);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${hatch.name}.pat`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Export all custom hatches ───────────────────────────────────────────────
  const handleExportAll = useCallback(() => {
    const targetList = customHatches.length > 0 ? customHatches : allPatterns;
    const content = exportToPat(targetList);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'LandSurv_Hatches.pat';
    a.click();
    URL.revokeObjectURL(url);
  }, [customHatches, allPatterns]);

  // ── Import .PAT file ────────────────────────────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = importFromPat(text);
        if (parsed.length === 0) {
          setImportError('No valid patterns found in .PAT file.');
          return;
        }
        const merged = [...customHatches];
        for (const p of parsed) {
          const exist = merged.findIndex(h => h.name.toUpperCase() === p.name.toUpperCase());
          if (exist >= 0) merged[exist] = { ...p, category: 'custom' as const };
          else merged.push({ ...p, category: 'custom' as const });
        }
        onCustomHatchesChange(merged);
        setImportError(null);
        setSection('custom');
      } catch {
        setImportError('Failed to parse .PAT file. Ensure it follows AutoCAD PAT format.');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  }, [customHatches, onCustomHatchesChange]);

  // ── Editor helpers ──────────────────────────────────────────────────────────
  const handleStartNew = () => {
    setEditing({ ...BLANK_HATCH });
    setEditError(null);
    setSection('editor');
  };

  const handleEditExisting = (hatch: HatchDefinition) => {
    setEditing({ ...hatch });
    setEditError(null);
    setSection('editor');
  };

  const handleAiGenerate = () => {
    if (!aiPrompt.trim()) return;
    const generated = generateHatchFromPrompt(aiPrompt);
    setEditing(generated);
    setEditError(null);
    setSection('editor');
  };

  const handleSaveEdit = () => {
    if (!editing.name.trim()) { setEditError('Pattern name is required.'); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(editing.name.trim())) {
      setEditError('Name must contain only letters, numbers, hyphens, or underscores.'); return;
    }
    if (editing.lines.length === 0 && editing.name.trim().toUpperCase() !== 'SOLID') {
      setEditError('At least one pattern line is required.'); return;
    }
    const cleaned: HatchDefinition = { ...editing, name: editing.name.trim().toUpperCase(), category: 'custom' };
    const exist = customHatches.findIndex(h => h.name.toUpperCase() === cleaned.name);
    const next = [...customHatches];
    if (exist >= 0) next[exist] = cleaned;
    else next.push(cleaned);
    onCustomHatchesChange(next);
    setSelected(cleaned);
    setSection('custom');
    setEditError(null);
  };

  const handleDeleteCustom = (name: string) => {
    onCustomHatchesChange(customHatches.filter(h => h.name !== name));
    if (selected?.name === name) setSelected(STANDARD_HATCHES[1] ?? null);
  };

  const updateEditLine = (idx: number, field: keyof HatchPatternLine, value: string) => {
    const lines = editing.lines.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'dashes') {
        const dashes = value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        return { ...l, dashes: dashes.length > 0 ? dashes : undefined };
      }
      return { ...l, [field]: parseFloat(value) || 0 };
    });
    setEditing(prev => ({ ...prev, lines }));
  };

  const addEditLine = () => setEditing(prev => ({ ...prev, lines: [...prev.lines, blankLine()] }));
  const removeEditLine = (idx: number) => setEditing(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));

  // ── Tab button class helper ─────────────────────────────────────────────────
  const tabCls = (active: boolean) =>
    `inline-flex cursor-pointer items-center gap-1 border-b-2 px-2.5 py-2 text-[10.5px] font-semibold transition-colors ${
      active
        ? 'border-cyan-400/60 bg-cyan-400/[0.08] text-cyan-200'
        : 'border-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
    }`;

  // ── Selected hatch detail + rigid placement controls ────────────────────────
  const renderDetail = () => {
    if (!selected) return null;
    return (
      <div className="mt-3 p-3 bg-[#0b1420]/95 rounded-xl border border-white/[0.09] space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <HatchPreviewCanvas
              hatch={selected}
              size={80}
              scale={hatchScale}
              angleDeg={hatchAngle}
              color={hatchColor}
              opacity={hatchOpacity}
            />
            <div className="flex gap-1">
              {[0.5, 1, 2].map(mul => (
                <button
                  key={mul}
                  type="button"
                  onClick={() => setHatchScale(mul)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                    hatchScale === mul
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                      : 'bg-white/[0.04] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mul}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-100 font-mono">{selected.name}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExportOne(selected)}
                  className="text-[10.5px] px-2 py-0.5 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 rounded transition-colors"
                >
                  Export .PAT
                </button>
                <button
                  type="button"
                  onClick={() => handleEditExisting({ ...selected, name: selected.category === 'custom' ? selected.name : `${selected.name}_CUST` })}
                  className="text-[10.5px] px-2 py-0.5 bg-cyan-400/15 hover:bg-cyan-400/30 text-cyan-200 rounded transition-colors"
                >
                  {selected.category === 'custom' ? 'Edit' : 'Clone & Edit'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{selected.description}</p>
            {selected.femaZone && (
              <p className="text-xs text-cyan-400 mt-0.5">FEMA Zone: <strong>{selected.femaZone}</strong></p>
            )}
            {selected.usage && (
              <p className="text-[11px] text-slate-500 mt-0.5 italic">{selected.usage}</p>
            )}

            {/* Rigid CAD Placement Parameters */}
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.07]">
              <div>
                <label className="block text-[9.5px] uppercase tracking-wider text-slate-400 mb-0.5">Scale</label>
                <DecimalInput
                  min={0.05}
                  max={100}
                  value={hatchScale}
                  onValueChange={setHatchScale}
                  className="w-full rounded border border-white/10 bg-[#070d16] px-2 py-1 font-mono text-xs text-slate-100"
                  aria-label="Hatch scale"
                />
              </div>
              <div>
                <label className="block text-[9.5px] uppercase tracking-wider text-slate-400 mb-0.5">Angle (°)</label>
                <input
                  type="number"
                  step="15"
                  value={hatchAngle}
                  onChange={e => setHatchAngle(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-white/10 bg-[#070d16] px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[9.5px] uppercase tracking-wider text-slate-400 mb-0.5">Opacity</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="1"
                  value={hatchOpacity}
                  onChange={e => setHatchOpacity(Math.max(0.05, Math.min(1, parseFloat(e.target.value) || 0.45)))}
                  className="w-full rounded border border-white/10 bg-[#070d16] px-2 py-1 font-mono text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[9.5px] uppercase tracking-wider text-slate-400 mb-0.5">Color & Layer</label>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={hatchColor}
                    onChange={e => setHatchColor(e.target.value)}
                    className="h-6 w-7 rounded border border-white/10 bg-transparent cursor-pointer"
                    title="Hatch Color"
                  />
                  <input
                    type="text"
                    value={hatchLayer}
                    onChange={e => setHatchLayer(e.target.value)}
                    list="hatch-manager-layers"
                    placeholder="V-ANNO-PATT"
                    className="min-w-0 flex-1 rounded border border-white/10 bg-[#070d16] px-1.5 py-1 font-mono text-[11px] text-slate-100"
                  />
                </div>
              </div>
            </div>

            {onStartCanvasHatch && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onStartCanvasHatch({
                      mode: 'pick-area',
                      patternName: selected.name,
                      scale: hatchScale,
                      angleDeg: hatchAngle,
                      opacity: hatchOpacity,
                      color: hatchColor,
                      layer: hatchLayer,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/90 hover:bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition-colors"
                >
                  <span>🎯</span> Click in Area (H)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onStartCanvasHatch({
                      mode: 'select-object',
                      patternName: selected.name,
                      scale: hatchScale,
                      angleDeg: hatchAngle,
                      opacity: hatchOpacity,
                      color: hatchColor,
                      layer: hatchLayer,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/15 hover:bg-cyan-400/25 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-colors"
                >
                  <span>⬡</span> Hatch by Select Object
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PAT source lines */}
        <div className="space-y-0.5 pt-1 border-t border-white/[0.06]">
          <p className="text-[10px] text-slate-500 font-mono">PAT Vector Definition:</p>
          {selected.lines.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic">
              {selected.name === 'SOLID' ? 'SOLID, Solid fill (AcDbHatch solid flag = 1)' : 'No fill (Zone X unshaded)'}
            </p>
          ) : (
            selected.lines.map((l, i) => (
              <code key={i} className="block text-[10px] text-emerald-300 bg-[#070d16] px-2 py-0.5 rounded font-mono">
                {[l.angle, l.originX, l.originY, l.deltaX, l.deltaY, ...(l.dashes ?? [])].join(', ')}
              </code>
            ))
          )}
        </div>
      </div>
    );
  };

  // ── Editor form ─────────────────────────────────────────────────────────────
  const renderEditor = () => (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => setSection('custom')} className="text-xs text-slate-400 hover:text-slate-200">← Back</button>
        <h3 className="text-sm font-semibold text-slate-200">
          {customHatches.some(h => h.name === editing.name) ? `Edit: ${editing.name}` : 'Author Custom Hatch Pattern (.PAT)'}
        </h3>
      </div>

      {/* AI Pattern Generator bar */}
      <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] p-2.5 space-y-1.5">
        <label className="block text-[10.5px] font-semibold text-cyan-300">
          ✨ Describe a pattern to auto-generate PAT vectors
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
            placeholder='e.g. "45 degree dashed cross hatch with tight 0.1 spacing"'
            className="flex-1 rounded border border-white/10 bg-[#070d16] px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAiGenerate}
            className="rounded bg-cyan-500/25 hover:bg-cyan-500/40 border border-cyan-400/40 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors"
          >
            Generate
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex items-center gap-4">
        <HatchPreviewCanvas hatch={editing} size={96} />
        <div className="flex-1 space-y-2">
          <div>
            <label className="text-xs text-slate-400 block mb-0.5">Name (PAT identifier) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value.toUpperCase() }))}
              className="w-full px-2 py-1 bg-[#0b1420] border border-white/[0.1] rounded text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="MY_PATTERN"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-0.5">Description</label>
            <input
              type="text"
              value={editing.description}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              className="w-full px-2 py-1 bg-[#0b1420] border border-white/[0.1] rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="My custom pattern"
            />
          </div>
        </div>
      </div>

      {/* FEMA zone designation (optional) */}
      <div>
        <label className="text-xs text-slate-400 block mb-0.5">FEMA Zone (optional, e.g. AE, V, FLOODWAY)</label>
        <input
          type="text"
          value={editing.femaZone ?? ''}
          onChange={e => setEditing(p => ({ ...p, femaZone: e.target.value || undefined }))}
          className="w-48 px-2 py-1 bg-[#0b1420] border border-white/[0.1] rounded text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          placeholder="AE"
        />
      </div>

      {/* Pattern lines table */}
      <div>
        <p className="text-xs text-slate-400 mb-1">
          Pattern Lines — <span className="text-slate-500">angle, originX, originY, deltaX, deltaY[, dashes…]</span>
        </p>
        <div className="space-y-2">
          {editing.lines.map((line, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-1 bg-[#070d16]/60 rounded p-2 text-xs">
              {(['angle', 'originX', 'originY', 'deltaX', 'deltaY'] as (keyof HatchPatternLine)[]).map(field => (
                <div key={field} className="flex flex-col items-center">
                  <span className="text-slate-500 text-[10px] mb-0.5">{field}</span>
                  <input
                    type="number"
                    step="any"
                    value={(line[field] as number) ?? 0}
                    onChange={e => updateEditLine(idx, field, e.target.value)}
                    className="w-16 px-1 py-0.5 bg-[#0b1420] border border-white/[0.07] rounded text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                  />
                </div>
              ))}
              <div className="flex flex-col items-start ml-1">
                <span className="text-slate-500 text-[10px] mb-0.5">dashes (,)</span>
                <input
                  type="text"
                  value={line.dashes?.join(', ') ?? ''}
                  onChange={e => updateEditLine(idx, 'dashes', e.target.value)}
                  className="w-28 px-1 py-0.5 bg-[#0b1420] border border-white/[0.07] rounded text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                  placeholder=".125, -.125"
                />
              </div>
              <button
                onClick={() => removeEditLine(idx)}
                className="ml-1 text-slate-500 hover:text-red-400 transition-colors"
              >×</button>
            </div>
          ))}
        </div>
        <button
          onClick={addEditLine}
          className="mt-2 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          + Add Line
        </button>
      </div>

      {editError && <p className="text-xs text-red-400">{editError}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSaveEdit}
          className="px-4 py-2 bg-cyan-500/90 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Save Pattern
        </button>
        <button
          onClick={() => setSection('custom')}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.09] text-slate-200 rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div data-testid="hatch-manager-panel" className="flex flex-col h-full min-h-0 text-sm">
      <datalist id="hatch-manager-layers">
        {availableLayers.map(l => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {/* Top quick-action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#080e17]/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-200">Hatch Pattern Library</span>
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {allPatterns.length} patterns
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onStartCanvasHatch && (
            <>
              <button
                type="button"
                onClick={() =>
                  onStartCanvasHatch({
                    mode: 'pick-area',
                    patternName: selected?.name ?? 'ANSI31',
                    scale: hatchScale,
                    angleDeg: hatchAngle,
                    opacity: hatchOpacity,
                    color: hatchColor,
                    layer: hatchLayer,
                  })
                }
                className="rounded border border-cyan-400/50 bg-cyan-500/20 hover:bg-cyan-500/30 px-2 py-1 text-[11px] font-semibold text-cyan-200 transition-colors"
                title="Click inside any closed area on the canvas to hatch it (Shortcut: H)"
              >
                🎯 Hatch Area (H)
              </button>
              <button
                type="button"
                onClick={() =>
                  onStartCanvasHatch({
                    mode: 'select-object',
                    patternName: selected?.name ?? 'ANSI31',
                    scale: hatchScale,
                    angleDeg: hatchAngle,
                    opacity: hatchOpacity,
                    color: hatchColor,
                    layer: hatchLayer,
                  })
                }
                className="rounded border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] px-2 py-1 text-[11px] font-semibold text-slate-200 transition-colors"
                title="Select closed polylines, circles, or boundary objects to hatch"
              >
                ⬡ Hatch Object
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleStartNew}
            className="rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-1 text-[11px] font-semibold text-emerald-200 transition-colors"
          >
            + Custom .PAT
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-0 border-b border-white/[0.07] px-3 pt-1 flex-shrink-0">
        <button className={tabCls(section === 'standard')} onClick={() => setSection('standard')}>
          Standard &amp; Survey ({STANDARD_HATCHES.length})
        </button>
        <button className={tabCls(section === 'fema')} onClick={() => setSection('fema')}>
          FEMA Zones ({FEMA_HATCHES.length})
        </button>
        <button className={tabCls(section === 'custom')} onClick={() => setSection('custom')}>
          Custom ({customHatches.length})
        </button>
        <button className={tabCls(section === 'canvas')} onClick={() => setSection('canvas')}>
          Placed Hatches ({canvasHatches.length})
        </button>
        {section === 'editor' && (
          <button className={tabCls(true)}>Pattern Builder</button>
        )}
        {(section === 'standard' || section === 'fema') && (
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter patterns..."
            className="ml-auto my-1 w-36 rounded border border-white/10 bg-[#070d16] px-2 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* ── ACAD & Survey Standard hatches ────────────────────────────── */}
        {section === 'standard' && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              AutoCAD / Civil 3D &amp; LandSurv survey hatch patterns (ACAD.PAT compatible, native <code className="text-cyan-400">AcDbHatch</code> DXF export).
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
              {filteredStandard.map(h => (
                <HatchCard
                  key={h.name}
                  hatch={h}
                  scale={selected?.name === h.name ? hatchScale : 1}
                  angleDeg={selected?.name === h.name ? hatchAngle : 0}
                  selected={selected?.name === h.name}
                  onSelect={() => setSelected(h)}
                  onExport={() => handleExportOne(h)}
                />
              ))}
            </div>
            {renderDetail()}
          </div>
        )}

        {/* ── FEMA Zone hatches ─────────────────────────────────────────── */}
        {section === 'fema' && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              FEMA FIRM flood zone hatch patterns — DWG/DXF compatible. Agents use
              <code className="mx-1 text-cyan-400">cad_resolve_hatch</code> to retrieve these for flood polygons.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
              {filteredFema.map(h => (
                <HatchCard
                  key={h.name}
                  hatch={h}
                  scale={selected?.name === h.name ? hatchScale : 1}
                  angleDeg={selected?.name === h.name ? hatchAngle : 0}
                  selected={selected?.name === h.name}
                  onSelect={() => setSelected(h)}
                  onExport={() => handleExportOne(h)}
                />
              ))}
            </div>
            {renderDetail()}
          </div>
        )}

        {/* ── Custom hatches ────────────────────────────────────────────── */}
        {section === 'custom' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400">
                Project-specific patterns stored in your CAD standard (<code>.lsvz</code>).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleExportAll}
                  className="text-xs px-2 py-1 bg-white/[0.06] hover:bg-white/[0.09] text-slate-200 rounded transition-colors"
                >
                  Export .PAT
                </button>
                <label className="text-xs px-2 py-1 bg-white/[0.06] hover:bg-white/[0.09] text-slate-200 rounded transition-colors cursor-pointer">
                  📁 Import .PAT
                  <input ref={importRef} type="file" accept=".pat,.PAT" className="hidden" onChange={handleImportFile} />
                </label>
                <button
                  onClick={handleStartNew}
                  className="text-xs px-2 py-1 bg-cyan-400/20 hover:bg-cyan-400/25 text-cyan-100 rounded transition-colors"
                >
                  + New Pattern
                </button>
              </div>
            </div>

            {importError && <p className="text-xs text-red-400 mb-2">{importError}</p>}

            {customHatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-white/10">
                <span className="text-3xl mb-2">▤</span>
                <p className="text-slate-300 text-sm font-medium mb-1">No custom patterns yet</p>
                <p className="text-slate-500 text-xs mb-4 max-w-xs">
                  Author a custom pattern with AI or manual PAT vectors, or import an AutoCAD <code>.PAT</code> file.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleStartNew}
                    className="px-3 py-1.5 bg-cyan-500/90 hover:bg-cyan-400 text-white rounded text-xs font-medium transition-colors"
                  >
                    + Author Pattern
                  </button>
                  <label className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.09] text-slate-200 rounded text-xs cursor-pointer transition-colors">
                    📁 Import .PAT
                    <input type="file" accept=".pat,.PAT" className="hidden" onChange={handleImportFile} />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
                  {customHatches.map(h => (
                    <HatchCard
                      key={h.name}
                      hatch={h}
                      selected={selected?.name === h.name}
                      onSelect={() => setSelected(h)}
                      onDelete={() => handleDeleteCustom(h.name)}
                      onExport={() => handleExportOne(h)}
                    />
                  ))}
                </div>
                {renderDetail()}
              </>
            )}
          </div>
        )}

        {/* ── Placed Canvas Hatches Inspector ───────────────────────────── */}
        {section === 'canvas' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 mb-2">
              Active <code className="text-cyan-300">CanvasHatch</code> entities in the current drawing session (saved in <code>.lsvz</code> &amp; exported to DXF).
            </p>
            {canvasHatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400 space-y-2">
                <p>No hatch regions have been placed on the canvas yet.</p>
                <p className="text-[11px] text-slate-500">
                  Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-cyan-300">H</kbd> on the canvas or click <strong>Hatch Area (H)</strong> above to fill any closed boundary.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {canvasHatches.map(ch => {
                  const pat = getHatchByName(ch.patternName, customHatches) ?? STANDARD_HATCHES[1];
                  const holeCount = ch.loops.filter(l => l.isHole).length;
                  return (
                    <div
                      key={ch.id}
                      className="flex flex-wrap items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#0b1420]/90 p-2"
                    >
                      <HatchPreviewCanvas
                        hatch={pat}
                        size={36}
                        scale={ch.scale}
                        angleDeg={ch.angleDeg}
                        color={ch.color}
                        opacity={ch.opacity}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-cyan-200">{ch.patternName}</span>
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
                            {ch.layer}
                          </span>
                          {ch.areaSqFt !== undefined && (
                            <span className="text-[10px] text-emerald-300 font-mono">
                              {ch.areaSqFt.toFixed(1)} sq ft ({(ch.areaSqFt / 43560).toFixed(3)} ac)
                            </span>
                          )}
                          {holeCount > 0 && (
                            <span className="text-[10px] text-amber-300">
                              {holeCount} island{holeCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-400">
                          <label className="inline-flex items-center gap-1">
                            Pattern:
                            <select
                              value={ch.patternName}
                              onChange={e => onUpdateCanvasHatch?.(ch.id, { patternName: e.target.value })}
                              className="rounded border border-white/10 bg-[#070d16] px-1 py-0.5 font-mono text-[10px] text-slate-200"
                            >
                              {allPatterns.map(p => (
                                <option key={p.name} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="inline-flex items-center gap-1">
                            Scale:
                            <DecimalInput
                              min={0.05}
                              value={ch.scale}
                              onValueChange={scale => onUpdateCanvasHatch?.(ch.id, { scale })}
                              className="w-14 rounded border border-white/10 bg-[#070d16] px-1 py-0.5 font-mono text-[10px] text-slate-200"
                              aria-label={`Scale for ${ch.patternName} hatch`}
                            />
                          </label>
                          <label className="inline-flex items-center gap-1">
                            Angle:
                            <input
                              type="number"
                              step="15"
                              value={ch.angleDeg}
                              onChange={e => onUpdateCanvasHatch?.(ch.id, { angleDeg: parseFloat(e.target.value) || 0 })}
                              className="w-14 rounded border border-white/10 bg-[#070d16] px-1 py-0.5 font-mono text-[10px] text-slate-200"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onUpdateCanvasHatch?.(ch.id, { hidden: !ch.hidden })}
                          className={`rounded px-2 py-1 text-[10px] font-semibold ${
                            ch.hidden
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-white/[0.06] text-slate-300 hover:text-white'
                          }`}
                        >
                          {ch.hidden ? 'Hidden' : 'Visible'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCanvasHatch?.(ch.id)}
                          className="rounded bg-rose-500/15 hover:bg-rose-500/30 px-2 py-1 text-[10px] font-semibold text-rose-300"
                          title="Delete hatch entity"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PAT editor ────────────────────────────────────────────────── */}
        {section === 'editor' && renderEditor()}
      </div>
    </div>
  );
}

