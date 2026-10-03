/**
 * Drafting Style Library
 *
 * CAD Manager sub-tool — lets users upload example DXF files and annotate
 * them with plain-English descriptions of their drafting conventions.
 * This "trains" the Civil Drafter agent so it mimics the user's style
 * (layer naming, linetypes, feature organisation, etc.).
 *
 * Architecture:
 *   - Stateless display component: receives `entries` + `onChange` from App.tsx
 *   - DXF parsing is done locally in the browser (no cloud needed)
 *   - Compiled context string is pushed into Civil Drafter via CACP
 *     `cad_get_drafting_styles` command
 *
 * Feature summary for users
 * ─────────────────────────
 *   • Upload one or more DXF example files per feature type
 *   • The panel extracts every layer name, entity type, and linetype from the DXF
 *   • Users write plain-English descriptions: "Roads are drawn as two parallel
 *     LWPOLYLINE on layer V-ROAD-EDGE …"
 *   • Specific layer notes can be pinned as annotations
 *   • Reference screenshots/PDFs can be uploaded alongside the DXF
 *   • A compiled "Style Context" preview shows exactly what the Civil Drafter
 *     will receive as context when it starts
 *   • Styles are saved in the .lsvz bundle
 */

import React, { useState, useCallback, useRef } from 'react';
import type {
  DraftingStyleEntry,
  DraftingStyleAnnotation,
} from '../../types.ts';
import { parseDxfLayers, dxfLayersToContextString } from '../../utils/dxfLayerParser.ts';

// ─── Icons (inline SVG helpers) ───────────────────────────────────────────────

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
  </svg>
);
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
  </svg>
);
const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);
const DocumentArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);
const EyeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);
const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
  </svg>
);

// ─── Feature-type config ───────────────────────────────────────────────────────

type FeatureType = DraftingStyleEntry['featureType'];

interface FeatureTypeConfig {
  label: string;
  emoji: string;
  color: string;      // Tailwind text color
  bg: string;         // Tailwind bg
}

const FEATURE_TYPES: Record<FeatureType, FeatureTypeConfig> = {
  road:       { label: 'Roads & Pavement',   emoji: '🛣️',  color: 'text-yellow-300',  bg: 'bg-yellow-900/40' },
  building:   { label: 'Buildings',          emoji: '🏗️',  color: 'text-orange-300',  bg: 'bg-orange-900/40' },
  utility:    { label: 'Utilities',          emoji: '⚡',   color: 'text-blue-300',    bg: 'bg-blue-900/40' },
  boundary:   { label: 'Boundaries',         emoji: '📐',   color: 'text-green-300',   bg: 'bg-green-900/40' },
  vegetation: { label: 'Vegetation',         emoji: '🌳',   color: 'text-emerald-300', bg: 'bg-emerald-900/40' },
  water:      { label: 'Water Features',     emoji: '💧',   color: 'text-cyan-300',    bg: 'bg-cyan-900/40' },
  topo:       { label: 'Topography',         emoji: '⛰️',  color: 'text-amber-300',   bg: 'bg-amber-900/40' },
  annotation: { label: 'Annotations/Text',   emoji: '🔤',   color: 'text-purple-300',  bg: 'bg-purple-900/40' },
  misc:       { label: 'Miscellaneous',      emoji: '📌',   color: 'text-gray-300',    bg: 'bg-gray-900/40' },
};

// ACI color approximate hex lookup (partial, most-used colors)
const ACI_COLORS: Record<number, string> = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
  5: '#0000FF', 6: '#FF00FF', 7: '#FFFFFF', 8: '#404040',
  9: '#808080', 30: '#FF7B00', 40: '#BDB76B', 50: '#FFFF7B',
  250: '#808080', 251: '#A0A0A0', 252: '#C0C0C0', 253: '#E0E0E0',
};
const aciToHex = (n?: number): string | undefined => n !== undefined ? ACI_COLORS[n] : undefined;

// ─── Utility: generate a compiled context string for the Civil Drafter ─────────

export function compileDraftingStyleContext(entries: DraftingStyleEntry[]): string {
  if (!entries || entries.length === 0) return '';

  const sections: string[] = [
    '## USER-DEFINED DRAFTING STYLE LIBRARY',
    'This company has defined specific conventions for how features are drafted.',
    'You MUST apply these conventions when generating or editing CAD linework.',
    '',
  ];

  for (const entry of entries) {
    const cfg = FEATURE_TYPES[entry.featureType];
    sections.push(`### ${cfg.emoji} ${entry.name} (${cfg.label})`);

    if (entry.userDescription.trim()) {
      sections.push(entry.userDescription.trim());
    }

    if (entry.dxfLayers && entry.dxfLayers.length > 0) {
      sections.push('');
      sections.push('**Example DXF layer structure:**');
      sections.push(
        dxfLayersToContextString(
          entry.dxfFileName ?? 'example.dxf',
          entry.dxfLayers,
          entry.dxfLayers.reduce((a, l) => a + l.entityCount, 0),
        )
      );
    }

    if (entry.annotations && entry.annotations.length > 0) {
      sections.push('');
      sections.push('**Specific notes:**');
      for (const ann of entry.annotations) {
        const prefix = ann.layerName ? `[Layer: ${ann.layerName}] ` : '';
        sections.push(`- ${prefix}${ann.text}`);
      }
    }

    sections.push('');
  }

  return sections.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface DraftingStyleLibraryProps {
  entries: DraftingStyleEntry[];
  onChange: (entries: DraftingStyleEntry[]) => void;
}

export const DraftingStyleLibrary: React.FC<DraftingStyleLibraryProps> = ({
  entries,
  onChange,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    entries.length > 0 ? entries[0].id : null,
  );
  const [filterType, setFilterType] = useState<FeatureType | 'all'>('all');
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [newAnnotationLayer, setNewAnnotationLayer] = useState('');
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);

  const selectedEntry = entries.find(e => e.id === selectedId) ?? null;

  // ── helper: update a specific entry field ─────────────────────────────────
  const updateEntry = useCallback(
    (id: string, changes: Partial<DraftingStyleEntry>) => {
      onChange(
        entries.map(e =>
          e.id === id ? { ...e, ...changes, updatedAt: new Date().toISOString() } : e,
        ),
      );
    },
    [entries, onChange],
  );

  // ── Add new entry ──────────────────────────────────────────────────────────
  const handleAddEntry = useCallback(() => {
    const id = `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const newEntry: DraftingStyleEntry = {
      id,
      name: 'New Style',
      featureType: 'misc',
      userDescription: '',
      annotations: [],
      referenceImages: [],
      createdAt: now,
      updatedAt: now,
    };
    onChange([...entries, newEntry]);
    setSelectedId(id);
  }, [entries, onChange]);

  // ── Delete entry ───────────────────────────────────────────────────────────
  const handleDeleteEntry = useCallback(
    (id: string) => {
      const updated = entries.filter(e => e.id !== id);
      onChange(updated);
      if (selectedId === id) {
        setSelectedId(updated.length > 0 ? updated[updated.length - 1].id : null);
      }
    },
    [entries, onChange, selectedId],
  );

  // ── DXF upload ─────────────────────────────────────────────────────────────
  const handleDxfFile = useCallback(
    (file: File) => {
      if (!selectedEntry) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const result = parseDxfLayers(content);
        updateEntry(selectedEntry.id, {
          dxfContent: content,
          dxfFileName: file.name,
          dxfLayers: result.layers,
        });
      };
      reader.readAsText(file);
    },
    [selectedEntry, updateEntry],
  );

  // ── Reference image upload ─────────────────────────────────────────────────
  const handleImageFiles = useCallback(
    (files: FileList | null) => {
      if (!files || !selectedEntry) return;
      const promises = Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
              reject(new Error('Not an image'));
              return;
            }
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      );
      Promise.all(promises).then((b64s) => {
        updateEntry(selectedEntry.id, {
          referenceImages: [...(selectedEntry.referenceImages ?? []), ...b64s],
        });
      });
    },
    [selectedEntry, updateEntry],
  );

  // ── Add annotation ─────────────────────────────────────────────────────────
  const handleAddAnnotation = useCallback(() => {
    if (!selectedEntry || !newAnnotationText.trim()) return;
    const ann: DraftingStyleAnnotation = {
      id: `ann_${Date.now()}`,
      text: newAnnotationText.trim(),
      layerName: newAnnotationLayer.trim() || undefined,
    };
    updateEntry(selectedEntry.id, {
      annotations: [...(selectedEntry.annotations ?? []), ann],
    });
    setNewAnnotationText('');
    setNewAnnotationLayer('');
  }, [selectedEntry, newAnnotationText, newAnnotationLayer, updateEntry]);

  // ── Delete annotation ──────────────────────────────────────────────────────
  const handleDeleteAnnotation = useCallback(
    (annId: string) => {
      if (!selectedEntry) return;
      updateEntry(selectedEntry.id, {
        annotations: (selectedEntry.annotations ?? []).filter(a => a.id !== annId),
      });
    },
    [selectedEntry, updateEntry],
  );

  // ── Delete reference image ─────────────────────────────────────────────────
  const handleDeleteImage = useCallback(
    (imgIndex: number) => {
      if (!selectedEntry) return;
      const updated = (selectedEntry.referenceImages ?? []).filter((_, i) => i !== imgIndex);
      updateEntry(selectedEntry.id, { referenceImages: updated });
    },
    [selectedEntry, updateEntry],
  );

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.dxf')) {
        handleDxfFile(file);
      } else if (file.type.startsWith('image/')) {
        handleImageFiles(e.dataTransfer.files);
      }
    },
    [handleDxfFile, handleImageFiles],
  );

  // ── Filtered entries list ──────────────────────────────────────────────────
  const filteredEntries =
    filterType === 'all'
      ? entries
      : entries.filter(e => e.featureType === filterType);

  // ── Compiled context preview ───────────────────────────────────────────────
  const compiledContext = compileDraftingStyleContext(entries);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-gray-950 text-gray-100 overflow-hidden">

      {/* ── Left panel: library list ─────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-gray-700/50 bg-gray-900/60">

        {/* Header */}
        <div className="p-3 border-b border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="w-5 h-5 text-fuchsia-400 flex-shrink-0" />
            <span className="font-semibold text-fuchsia-300 text-sm">Drafting Style Library</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Upload DXF examples and describe how each feature type is drafted.
            The Civil Drafter uses this as context.
          </p>
        </div>

        {/* Feature type filter chips */}
        <div className="p-2 border-b border-gray-700/40 flex flex-wrap gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-fuchsia-600/50 text-fuchsia-200' : 'text-gray-400 hover:text-gray-200'}`}
          >
            All ({entries.length})
          </button>
          {(Object.keys(FEATURE_TYPES) as FeatureType[]).filter(ft =>
            entries.some(e => e.featureType === ft)
          ).map(ft => {
            const cfg = FEATURE_TYPES[ft];
            const count = entries.filter(e => e.featureType === ft).length;
            return (
              <button
                key={ft}
                onClick={() => setFilterType(ft)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filterType === ft ? `${cfg.bg} ${cfg.color}` : 'text-gray-400 hover:text-gray-200'}`}
              >
                {cfg.emoji} {count}
              </button>
            );
          })}
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {filteredEntries.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-xs">
              No styles yet.<br />Click + Add Style below.
            </div>
          )}
          {filteredEntries.map(entry => {
            const cfg = FEATURE_TYPES[entry.featureType];
            const isActive = entry.id === selectedId;
            return (
              <div
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-b border-gray-800/50 ${
                  isActive
                    ? 'bg-fuchsia-900/30 border-l-2 border-l-fuchsia-400'
                    : 'hover:bg-gray-800/40 border-l-2 border-l-transparent'
                }`}
              >
                <span className="text-lg flex-shrink-0">{cfg.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-fuchsia-200' : 'text-gray-200'}`}>
                    {entry.name}
                  </p>
                  <p className={`text-xs truncate ${cfg.color}`}>{cfg.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.dxfLayers && entry.dxfLayers.length > 0 && (
                      <span className="text-xs text-indigo-400">
                        {entry.dxfLayers.length} layers
                      </span>
                    )}
                    {entry.userDescription.trim().length > 0 && (
                      <span className="text-xs text-green-400">✓ desc</span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-fuchsia-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="p-2 border-t border-gray-700/50 flex flex-col gap-2">
          <button
            onClick={handleAddEntry}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-600/40 text-sm font-semibold transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Style
          </button>
          <button
            onClick={() => setShowContextPreview(true)}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/40 text-sm font-semibold transition-colors"
          >
            <EyeIcon className="w-4 h-4" />
            Preview Civil Drafter Context
          </button>
        </div>
      </aside>

      {/* ── Right panel: entry detail ────────────────────────────────────── */}
      {selectedEntry ? (
        <main
          className="flex-1 flex flex-col min-w-0 overflow-y-auto"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* ── Title bar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 bg-gray-900/40">
            <span className="text-2xl">{FEATURE_TYPES[selectedEntry.featureType].emoji}</span>
            <input
              type="text"
              value={selectedEntry.name}
              onChange={e => updateEntry(selectedEntry.id, { name: e.target.value })}
              className="text-lg font-semibold bg-transparent border-b border-transparent hover:border-gray-600 focus:border-fuchsia-500 outline-none text-gray-100 flex-1 min-w-0 transition-colors"
              placeholder="Style name…"
            />
            {/* Feature type selector */}
            <select
              value={selectedEntry.featureType}
              onChange={e => updateEntry(selectedEntry.id, { featureType: e.target.value as FeatureType })}
              className="text-sm bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:border-fuchsia-500"
            >
              {(Object.keys(FEATURE_TYPES) as FeatureType[]).map((ft) => (
                <option key={ft} value={ft}>{FEATURE_TYPES[ft].emoji} {FEATURE_TYPES[ft].label}</option>
              ))}
            </select>
            <button
              onClick={() => handleDeleteEntry(selectedEntry.id)}
              className="p-1.5 rounded-md text-red-400 hover:bg-red-900/30 transition-colors"
              title="Delete this style entry"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>

          {/* ── Body */}
          <div className="flex-1 p-4 grid grid-cols-1 xl:grid-cols-2 gap-4 content-start">

            {/* ── Description card */}
            <div className="xl:col-span-2 bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-semibold text-fuchsia-300 mb-2 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4" />
                How are these features drafted?
              </h3>
              <p className="text-xs text-gray-400 mb-2">
                Describe in plain English your conventions for this feature type. Be specific about
                layer names, linetypes, geometry types, and any special rules.
              </p>
              <textarea
                value={selectedEntry.userDescription}
                onChange={e => updateEntry(selectedEntry.id, { userDescription: e.target.value })}
                rows={6}
                placeholder={`Example: Roads are always drafted with two parallel LWPOLYLINE on layer V-ROAD-EDGE (CONTINUOUS linetype). The centerline goes on V-ROAD-CL (DASHDOT). At T-intersections, the main road lines are never broken — the branch road connects to the edge of the main road. Edge-of-pavement shots use description codes EP, EOP, or CURB…`}
                className="w-full text-sm bg-gray-950/60 border border-gray-600/50 rounded-lg p-3 text-gray-200 placeholder-gray-600 resize-y focus:outline-none focus:border-fuchsia-500/60 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Tip: The more detail you provide, the better the Civil Drafter will match your style.
              </p>
            </div>

            {/* ── DXF Upload card */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                <DocumentArrowUpIcon className="w-4 h-4" />
                Example DXF File
                {selectedEntry.dxfFileName && (
                  <span className="ml-auto text-xs text-gray-400 font-normal truncate max-w-[180px]">
                    {selectedEntry.dxfFileName}
                  </span>
                )}
              </h3>

              {/* Upload area */}
              <div
                className="relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-600 hover:border-indigo-500/60 transition-colors cursor-pointer bg-gray-950/30 mb-3"
                onClick={() => dxfInputRef.current?.click()}
              >
                <DocumentArrowUpIcon className="w-8 h-8 text-indigo-400 opacity-60" />
                <p className="text-xs text-gray-400 text-center">
                  {selectedEntry.dxfFileName
                    ? 'Drop a new DXF or click to replace'
                    : 'Drop a DXF file here or click to upload'}
                </p>
                <input
                  ref={dxfInputRef}
                  type="file"
                  accept=".dxf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDxfFile(f); }}
                />
              </div>

              {/* Layer table */}
              {selectedEntry.dxfLayers && selectedEntry.dxfLayers.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-700/50">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-800 text-gray-400">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Layer</th>
                        <th className="text-right px-2 py-1.5 font-medium">Count</th>
                        <th className="text-left px-2 py-1.5 font-medium">Types</th>
                        <th className="text-left px-2 py-1.5 font-medium">Linetype</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.dxfLayers.map((layer, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/40' : 'bg-transparent'}>
                          <td className="px-2 py-1 font-mono text-indigo-300 max-w-[120px] truncate">
                            {layer.colorIndex !== undefined && (
                              <span
                                className="inline-block w-2 h-2 rounded-sm mr-1 border border-gray-600 flex-shrink-0"
                                style={{ background: aciToHex(layer.colorIndex) ?? '#888' }}
                              />
                            )}
                            {layer.name}
                          </td>
                          <td className="px-2 py-1 text-right text-gray-300">{layer.entityCount}</td>
                          <td className="px-2 py-1 text-gray-400 max-w-[120px] truncate">{layer.entityTypes.join(', ')}</td>
                          <td className="px-2 py-1 text-cyan-400 font-mono">{layer.lineType ?? ''}</td>
                          <td className="px-2 py-1">
                            {/* Quick-add layer annotation */}
                            <button
                              title="Annotate this layer"
                              onClick={() => setNewAnnotationLayer(layer.name)}
                              className="text-gray-500 hover:text-fuchsia-400 transition-colors"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic text-center py-2">
                  Upload a DXF to see its layer structure here.
                </p>
              )}
            </div>

            {/* ── Annotations card */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-semibold text-green-300 mb-3">
                Layer / Entity Annotations
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Pin specific notes to layers or entity types.  Useful for rules like
                "V-ROAD-CL always uses DASHDOT" or "Buildings are closed LWPOLYLINE".
              </p>

              {/* Annotation list */}
              <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                {(selectedEntry.annotations ?? []).length === 0 && (
                  <p className="text-xs text-gray-600 italic">No annotations yet.</p>
                )}
                {(selectedEntry.annotations ?? []).map(ann => (
                  <div
                    key={ann.id}
                    className="flex items-start gap-2 bg-gray-800/50 rounded-lg p-2 text-xs group"
                  >
                    {ann.layerName && (
                      <span className="mt-0.5 px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300 font-mono flex-shrink-0">
                        {ann.layerName}
                      </span>
                    )}
                    <span className="flex-1 text-gray-200">{ann.text}</span>
                    <button
                      onClick={() => handleDeleteAnnotation(ann.id)}
                      className="flex-shrink-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* New annotation form */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={newAnnotationLayer}
                  onChange={e => setNewAnnotationLayer(e.target.value)}
                  placeholder="Layer name (optional)"
                  className="w-full text-xs bg-gray-950/60 border border-gray-600/50 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-500/60 font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAnnotationText}
                    onChange={e => setNewAnnotationText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddAnnotation(); }}
                    placeholder="Note about this layer / entity type…"
                    className="flex-1 text-xs bg-gray-950/60 border border-gray-600/50 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-500/60 transition-colors"
                  />
                  <button
                    onClick={handleAddAnnotation}
                    disabled={!newAnnotationText.trim()}
                    className="px-3 py-1.5 rounded bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── Reference Images card */}
            <div className="xl:col-span-2 bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-amber-300">Reference Images / Screenshots</h3>
                <button
                  onClick={() => imgInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/40 text-xs font-semibold transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Upload Image
                </button>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleImageFiles(e.target.files)}
                />
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Upload screenshots from Civil 3D, PDF plans, or any other visual reference showing how these
                features should look in the final drawing. The Civil Drafter can see these images as context.
              </p>
              {(selectedEntry.referenceImages ?? []).length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-gray-700 text-gray-500 cursor-pointer hover:border-amber-600/40 transition-colors"
                  onClick={() => imgInputRef.current?.click()}
                >
                  <span className="text-3xl">🖼️</span>
                  <p className="text-xs">Drop images here or click Upload Image</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {(selectedEntry.referenceImages ?? []).map((src, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={src}
                        alt={`Reference ${idx + 1}`}
                        className="w-32 h-24 object-cover rounded-lg border border-gray-700/60"
                      />
                      <button
                        onClick={() => handleDeleteImage(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div
                    className="w-32 h-24 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-amber-600/40 transition-colors"
                    onClick={() => imgInputRef.current?.click()}
                  >
                    <PlusIcon className="w-6 h-6 text-gray-600" />
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      ) : (
        /* ── Empty state ──────────────────────────────────────────────── */
        <main className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <span className="text-6xl">🎨</span>
          <h2 className="text-xl font-semibold text-gray-300">No Styles Yet</h2>
          <p className="text-gray-500 text-sm max-w-md">
            The Drafting Style Library lets you teach the Civil Drafter exactly how
            your firm draws each type of feature.  Upload example DXF files and
            describe your conventions — the AI will apply them automatically.
          </p>
          <button
            onClick={handleAddEntry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600/30 text-fuchsia-200 border border-fuchsia-500/40 hover:bg-fuchsia-600/50 font-semibold transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Create First Style
          </button>
        </main>
      )}

      {/* ── Context Preview Modal ────────────────────────────────────────── */}
      {showContextPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[80vh] flex flex-col bg-gray-900 rounded-xl shadow-2xl border border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div>
                <h2 className="font-semibold text-fuchsia-300 flex items-center gap-2">
                  <EyeIcon className="w-5 h-5" />
                  Civil Drafter Context Preview
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  This is exactly what the Civil Drafter receives when a session starts.
                </p>
              </div>
              <button
                onClick={() => setShowContextPreview(false)}
                className="text-gray-500 hover:text-gray-200 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {compiledContext ? (
                <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono bg-gray-950/60 rounded-lg p-3">
                  {compiledContext}
                </pre>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  Add at least one style entry with a description to see context here.
                </p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-700 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {entries.length} style{entries.length !== 1 ? 's' : ''} • {compiledContext.length.toLocaleString()} characters
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(compiledContext);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftingStyleLibrary;
