/**
 * HatchManagerPanel — Hatch View for CAD Manager
 * v26.05.19.10
 *
 * Provides:
 *  - Visual grid of standard ACAD/ISO hatch patterns with live canvas previews
 *  - FEMA flood zone hatch section (CACP/agent-queryable)
 *  - Custom pattern builder (manual DXF PAT field entry)
 *  - Import .PAT / Export .PAT (AutoCAD-compatible)
 *  - Custom hatches are stored on StandardDefinition.hatches[] and persist in .lsvz
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HatchDefinition,
  HatchPatternLine,
  STANDARD_HATCHES,
  FEMA_HATCHES,
  exportToPat,
  importFromPat,
  renderHatchPreview,
} from '../../services/hatchLibrary';

// ─── Props ────────────────────────────────────────────────────────────────────

interface HatchManagerPanelProps {
  /** Custom hatches stored on the current standard (StandardDefinition.hatches). */
  customHatches: HatchDefinition[];
  /** Callback when user creates / edits / deletes a custom hatch. */
  onCustomHatchesChange: (hatches: HatchDefinition[]) => void;
}

// ─── Tiny preview card ────────────────────────────────────────────────────────

interface HatchCardProps {
  hatch: HatchDefinition;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}

function HatchPreviewCanvas({ hatch, size = 64 }: { hatch: HatchDefinition; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderHatchPreview(ctx, hatch, hatch.previewColor ?? '#22d3ee', '#1e293b');
  }, [hatch]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block', borderRadius: 4 }}
    />
  );
}

function HatchCard({ hatch, selected, onSelect, onDelete, onExport }: HatchCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border cursor-pointer transition-all select-none
        ${selected
          ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500'
          : 'border-gray-700 bg-gray-800/60 hover:border-gray-500 hover:bg-gray-700/40'
        } light-theme:bg-gray-100 light-theme:border-gray-300`}
    >
      <HatchPreviewCanvas hatch={hatch} size={56} />
      <span className="text-xs text-gray-300 font-mono text-center leading-tight light-theme:text-gray-700 max-w-[72px] truncate" title={hatch.name}>
        {hatch.name}
      </span>
      {hatch.femaZone && (
        <span className="text-[10px] text-cyan-400 font-medium">Zone {hatch.femaZone}</span>
      )}
      {(onDelete || onExport) && (
        <div className="absolute top-1 right-1 flex gap-1">
          {onExport && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); }}
              className="w-4 h-4 text-[10px] text-gray-400 hover:text-cyan-400 transition-colors"
              title="Export .PAT"
            >⬇</button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-4 h-4 text-[10px] text-gray-400 hover:text-red-400 transition-colors"
              title="Delete"
            >✕</button>
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export function HatchManagerPanel({ customHatches, onCustomHatchesChange }: HatchManagerPanelProps) {
  const [section, setSection] = useState<'standard' | 'fema' | 'custom' | 'editor'>('fema');
  const [selected, setSelected] = useState<HatchDefinition | null>(null);
  const [editing, setEditing] = useState<HatchDefinition>(BLANK_HATCH);
  const [editError, setEditError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

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
    if (customHatches.length === 0) return;
    const content = exportToPat(customHatches);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'LandSurv_Custom.pat';
    a.click();
    URL.revokeObjectURL(url);
  }, [customHatches]);

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

  const handleSaveEdit = () => {
    if (!editing.name.trim()) { setEditError('Pattern name is required.'); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(editing.name.trim())) {
      setEditError('Name must contain only letters, numbers, hyphens, or underscores.'); return;
    }
    if (editing.lines.length === 0) { setEditError('At least one pattern line is required.'); return; }
    const cleaned: HatchDefinition = { ...editing, name: editing.name.trim().toUpperCase(), category: 'custom' };
    const exist = customHatches.findIndex(h => h.name.toUpperCase() === cleaned.name);
    const next = [...customHatches];
    if (exist >= 0) next[exist] = cleaned;
    else next.push(cleaned);
    onCustomHatchesChange(next);
    setSection('custom');
    setEditError(null);
  };

  const handleDeleteCustom = (name: string) => {
    onCustomHatchesChange(customHatches.filter(h => h.name !== name));
    if (selected?.name === name) setSelected(null);
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
    `px-3 py-2 text-xs font-medium rounded-t-md transition-colors cursor-pointer border-b-2 ${
      active
        ? 'text-indigo-400 border-indigo-500 bg-gray-800/70'
        : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-700/30'
    } light-theme:${active ? 'text-indigo-600 border-indigo-500 bg-white' : 'text-gray-500 hover:text-gray-700'}`;

  // ── Selected hatch detail overlay ───────────────────────────────────────────
  const renderDetail = () => {
    if (!selected) return null;
    return (
      <div className="mt-4 p-3 bg-gray-800/80 rounded-lg border border-gray-700 light-theme:bg-gray-50 light-theme:border-gray-300">
        <div className="flex items-start gap-3">
          <HatchPreviewCanvas hatch={selected} size={80} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100 font-mono light-theme:text-gray-800">{selected.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 light-theme:text-gray-600">{selected.description}</p>
            {selected.femaZone && (
              <p className="text-xs text-cyan-400 mt-1">FEMA Zone: <strong>{selected.femaZone}</strong></p>
            )}
            {selected.usage && (
              <p className="text-xs text-gray-500 mt-1 italic">{selected.usage}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleExportOne(selected)}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
              >
                ⬇ Export .PAT
              </button>
              {selected.category === 'custom' && (
                <button
                  onClick={() => handleEditExisting(selected)}
                  className="text-xs px-2 py-1 bg-indigo-700/50 hover:bg-indigo-700 text-indigo-300 rounded transition-colors"
                >
                  ✏ Edit
                </button>
              )}
            </div>
          </div>
        </div>
        {/* PAT source lines */}
        <div className="mt-2 space-y-0.5">
          <p className="text-[10px] text-gray-500 font-mono">PAT Lines:</p>
          {selected.lines.length === 0
            ? <p className="text-[10px] text-gray-500 italic">No fill (Zone X unshaded)</p>
            : selected.lines.map((l, i) => (
              <code key={i} className="block text-[10px] text-green-400 bg-gray-900 px-2 py-0.5 rounded">
                {[l.angle, l.originX, l.originY, l.deltaX, l.deltaY, ...(l.dashes ?? [])].join(', ')}
              </code>
            ))
          }
        </div>
      </div>
    );
  };

  // ── Editor form ─────────────────────────────────────────────────────────────
  const renderEditor = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setSection('custom')} className="text-xs text-gray-400 hover:text-gray-200">← Back</button>
        <h3 className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">
          {customHatches.some(h => h.name === editing.name) ? `Edit: ${editing.name}` : 'New Hatch Pattern'}
        </h3>
      </div>

      {/* Live preview */}
      <div className="flex items-center gap-4">
        <HatchPreviewCanvas hatch={editing} size={96} />
        <div className="flex-1 space-y-2">
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Name (PAT identifier) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value.toUpperCase() }))}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 light-theme:bg-white light-theme:text-gray-800"
              placeholder="MY_PATTERN"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Description</label>
            <input
              type="text"
              value={editing.description}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 light-theme:bg-white light-theme:text-gray-800"
              placeholder="My custom pattern"
            />
          </div>
        </div>
      </div>

      {/* FEMA zone designation (optional) */}
      <div>
        <label className="text-xs text-gray-400 block mb-0.5">FEMA Zone (optional, e.g. AE, V, FLOODWAY)</label>
        <input
          type="text"
          value={editing.femaZone ?? ''}
          onChange={e => setEditing(p => ({ ...p, femaZone: e.target.value || undefined }))}
          className="w-48 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="AE"
        />
      </div>

      {/* Pattern lines table */}
      <div>
        <p className="text-xs text-gray-400 mb-1">
          Pattern Lines — <span className="text-gray-500">angle, originX, originY, deltaX, deltaY[, dashes…]</span>
        </p>
        <div className="space-y-2">
          {editing.lines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-gray-900/50 rounded p-2 text-xs">
              {(['angle', 'originX', 'originY', 'deltaX', 'deltaY'] as (keyof HatchPatternLine)[]).map(field => (
                <div key={field} className="flex flex-col items-center">
                  <span className="text-gray-500 text-[10px] mb-0.5">{field}</span>
                  <input
                    type="number"
                    step="any"
                    value={(line[field] as number) ?? 0}
                    onChange={e => updateEditLine(idx, field, e.target.value)}
                    className="w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div className="flex flex-col items-start ml-1">
                <span className="text-gray-500 text-[10px] mb-0.5">dashes (,)</span>
                <input
                  type="text"
                  value={line.dashes?.join(', ') ?? ''}
                  onChange={e => updateEditLine(idx, 'dashes', e.target.value)}
                  className="w-28 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder=".125, -.125"
                />
              </div>
              <button
                onClick={() => removeEditLine(idx)}
                className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          onClick={addEditLine}
          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          + Add Line
        </button>
      </div>

      {editError && <p className="text-xs text-red-400">{editError}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSaveEdit}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Save Pattern
        </button>
        <button
          onClick={() => setSection('custom')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 text-sm">
      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-gray-700 px-3 pt-2 flex-shrink-0 light-theme:border-gray-300">
        <button className={tabCls(section === 'fema')}    onClick={() => setSection('fema')}>🌊 FEMA Zones</button>
        <button className={tabCls(section === 'standard')} onClick={() => setSection('standard')}>📐 ACAD Standard</button>
        <button className={tabCls(section === 'custom')}   onClick={() => setSection('custom')}>⚙ Custom</button>
        {section === 'editor' && (
          <button className={tabCls(true)}>✏ Editor</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">

        {/* ── FEMA Zone hatches ─────────────────────────────────────────── */}
        {section === 'fema' && (
          <div>
            <p className="text-xs text-gray-400 mb-3 light-theme:text-gray-600">
              FEMA FIRM flood zone hatch patterns — DWG/DXF compatible. Agents use
              <code className="mx-1 text-cyan-400">getHatchForZone()</code>to retrieve these for polygon fills.
            </p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {FEMA_HATCHES.map(h => (
                <HatchCard
                  key={h.name}
                  hatch={h}
                  selected={selected?.name === h.name}
                  onSelect={() => setSelected(prev => prev?.name === h.name ? null : h)}
                  onExport={() => handleExportOne(h)}
                />
              ))}
            </div>
            {renderDetail()}
          </div>
        )}

        {/* ── ACAD Standard hatches ─────────────────────────────────────── */}
        {section === 'standard' && (
          <div>
            <p className="text-xs text-gray-400 mb-3 light-theme:text-gray-600">
              AutoCAD standard hatch patterns (ACAD.PAT / ISO.PAT). DXF-exportable.
            </p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {STANDARD_HATCHES.map(h => (
                <HatchCard
                  key={h.name}
                  hatch={h}
                  selected={selected?.name === h.name}
                  onSelect={() => setSelected(prev => prev?.name === h.name ? null : h)}
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
              <p className="text-xs text-gray-400 light-theme:text-gray-600">
                Project-specific patterns stored in your CAD standard (.lsvz).
              </p>
              <div className="flex gap-2">
                {customHatches.length > 0 && (
                  <button
                    onClick={handleExportAll}
                    className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
                  >
                    ⬇ Export All .PAT
                  </button>
                )}
                <label className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors cursor-pointer">
                  📁 Import .PAT
                  <input ref={importRef} type="file" accept=".pat,.PAT" className="hidden" onChange={handleImportFile} />
                </label>
                <button
                  onClick={handleStartNew}
                  className="text-xs px-2 py-1 bg-indigo-700/60 hover:bg-indigo-600 text-indigo-200 rounded transition-colors"
                >
                  + New Pattern
                </button>
              </div>
            </div>

            {importError && (
              <p className="text-xs text-red-400 mb-2">{importError}</p>
            )}

            {customHatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-3">📐</span>
                <p className="text-gray-400 text-sm mb-1">No custom patterns yet</p>
                <p className="text-gray-500 text-xs mb-4">
                  Create a pattern manually or import an AutoCAD .PAT file.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleStartNew}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    + New Pattern
                  </button>
                  <label className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs cursor-pointer transition-colors">
                    📁 Import .PAT
                    <input type="file" accept=".pat,.PAT" className="hidden" onChange={handleImportFile} />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {customHatches.map(h => (
                    <HatchCard
                      key={h.name}
                      hatch={h}
                      selected={selected?.name === h.name}
                      onSelect={() => setSelected(prev => prev?.name === h.name ? null : h)}
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

        {/* ── PAT editor ────────────────────────────────────────────────── */}
        {section === 'editor' && renderEditor()}

      </div>
    </div>
  );
}
