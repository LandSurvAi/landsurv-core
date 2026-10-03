import React, { useState, useMemo, useCallback } from 'react';
import { type AnnotationRule, type SurveyPoint, type Settings, type StreetLabel } from '../types';
import { renderAnnotationTemplate, resolveAnnotation, buildAnnotationMatchers } from '../utils/annotationResolver';
import { generateAnnotationRule } from '../services/geminiService';
import { PencilSquareIcon, PlusIcon, EraserIcon, BrainCircuitIcon } from './icons';

interface AnnotateManagerPanelProps {
  rules: AnnotationRule[];
  onAddRule: (rule: AnnotationRule) => void;
  onUpdateRule: (rule: AnnotationRule) => void;
  onDeleteRule: (ruleId: string) => void;
  /** Points currently on the canvas — used to preview matches. */
  points: SurveyPoint[];
  /** Global annotation scale (0.25–5). */
  globalScale: number;
  onChangeGlobalScale: (s: number) => void;
  settings: Settings;
  /** Street name labels currently on the canvas. */
  streetLabels?: StreetLabel[];
  /** Whether a street-label fetch is in progress. */
  isFetchingStreetLabels?: boolean;
  /** Callback to trigger street name fetch. */
  onFetchStreetNames?: () => void;
  /** Callback to clear all street name labels. */
  onClearStreetLabels?: () => void;
  /** Whether an inclusion boundary exists (required for fetch). */
  hasInclusionBoundary?: boolean;
}

const STARTER_RULES: Omit<AnnotationRule, 'id'>[] = [
  {
    name: 'Invert',
    description: 'Pipe invert (sanitary, storm, etc.)',
    associatedTerms: ['*inv*', 'invert'],
    template: 'INV={elevation}\\n{description}',
    category: 'existing',
    scale: 1,
    leaderOffset: { dx: 6, dy: 6 },
    color: '#22d3ee',
  },
  {
    name: 'Utility Pole',
    description: 'Power / telecom pole',
    associatedTerms: ['*pp*', 'util pole', 'utility pole', 'pwr pole', '*pole*'],
    template: 'UTILITY POLE\\n{description}',
    category: 'existing',
    scale: 1,
    leaderOffset: { dx: 6, dy: 8 },
    color: '#22d3ee',
  },
];

const emptyRule = (category: 'existing' | 'proposed' = 'existing'): AnnotationRule => ({
  id: `annot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  description: '',
  associatedTerms: [],
  template: '{description}',
  category,
  scale: 1,
  leaderOffset: { dx: 6, dy: 6 },
  color: category === 'proposed' ? '#f472b6' : '#22d3ee',
});

export const AnnotateManagerPanel: React.FC<AnnotateManagerPanelProps> = ({
  rules, onAddRule, onUpdateRule, onDeleteRule, points, globalScale, onChangeGlobalScale, settings,
  streetLabels = [], isFetchingStreetLabels = false, onFetchStreetNames, onClearStreetLabels, hasInclusionBoundary = false,
}) => {
  const [editing, setEditing] = useState<AnnotationRule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'existing' | 'proposed'>('all');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const hasApiKey = Boolean(settings?.userApiKey);

  const matchers = useMemo(() => buildAnnotationMatchers(rules), [rules]);

  const visibleRules = useMemo(
    () => rules.filter(r => filterCategory === 'all' || r.category === filterCategory),
    [rules, filterCategory],
  );

  const previewMatches = useCallback((rule: AnnotationRule): SurveyPoint[] => {
    if (!points || points.length === 0) return [];
    const subset = buildAnnotationMatchers([rule]);
    return points.filter(p => {
      if (!p.description) return false;
      const res = resolveAnnotation(p.description, [rule], subset);
      return res.rule?.id === rule.id;
    }).slice(0, 5);
  }, [points]);

  const startNew = (category: 'existing' | 'proposed') => {
    setEditing(emptyRule(category));
    setIsNew(true);
  };

  const startEdit = (rule: AnnotationRule) => {
    setEditing({ ...rule, leaderOffset: { ...rule.leaderOffset } });
    setIsNew(false);
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    if (isNew) onAddRule(editing); else onUpdateRule(editing);
    setEditing(null);
    setIsNew(false);
  };

  const seedStarters = () => {
    STARTER_RULES.forEach(r => {
      onAddRule({ ...r, id: `annot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    });
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !editing) return;
    setAiBusy(true);
    setAiError(null);
    try {
      // Pass the descriptions actually present in the file so the AI biases
      // match terms toward strings that will hit points on the canvas first,
      // then fall back to general survey-convention patterns.
      const pointDescs = (points ?? [])
        .map(p => (p.description ?? '').trim())
        .filter(Boolean);
      const ai = await generateAnnotationRule(aiPrompt.trim(), settings?.userApiKey, pointDescs);
      setEditing({
        ...editing,
        name: ai.name || editing.name,
        associatedTerms: ai.associatedTerms.length ? ai.associatedTerms : editing.associatedTerms,
        template: ai.template || editing.template,
        category: ai.category,
        leaderOffset: ai.leaderOffset,
        color: ai.category === 'proposed' ? '#f472b6' : '#22d3ee',
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI generation failed.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/70">
        <div>
          <h2 className="text-lg font-semibold text-white">Annotate Manager</h2>
          <p className="text-xs text-gray-400 mt-0.5">Leader-line notes auto-applied to points whose description matches a rule.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => startNew('existing')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-cyan-700 hover:bg-cyan-600 text-white"
            title="New Existing rule"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Existing
          </button>
          <button
            onClick={() => startNew('proposed')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-pink-700 hover:bg-pink-600 text-white"
            title="New Proposed rule"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Proposed
          </button>
        </div>
      </div>

      {/* Global scale */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-4 bg-gray-900/40">
        <label htmlFor="global-annot-scale" className="text-xs font-medium text-gray-400 whitespace-nowrap">Global Annotation Scale</label>
        <input
          id="global-annot-scale"
          type="range" min="0.25" max="5" step="0.05"
          value={globalScale}
          onChange={(e) => onChangeGlobalScale(parseFloat(e.target.value))}
          className="flex-1 accent-cyan-500"
        />
        <span className="font-mono bg-gray-800 text-gray-200 px-2 py-0.5 rounded text-xs w-14 text-center">{globalScale.toFixed(2)}x</span>
      </div>

      {/* Street Name Labels */}
      <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/40 space-y-2">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">Street Name Labels</span>
        </div>
        <p className="text-[10px] text-gray-400">
          Fetches named roads within the inclusion boundary and places text labels aligned with each road on the plan.
        </p>
        <button
          type="button"
          onClick={onFetchStreetNames}
          disabled={isFetchingStreetLabels || !hasInclusionBoundary || !onFetchStreetNames}
          className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-600 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {isFetchingStreetLabels ? 'Fetching…' : '🗺️ Fetch Street Names'}
        </button>
        {streetLabels.length > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-blue-300">{streetLabels.length} label{streetLabels.length === 1 ? '' : 's'} on plan</span>
            <button
              type="button"
              onClick={onClearStreetLabels}
              className="text-gray-400 hover:text-red-400 underline"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Body — split list / editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* List */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-800">
            <span className="text-xs text-gray-400">Filter:</span>
            {(['all', 'existing', 'proposed'] as const).map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`text-xs px-2 py-0.5 rounded ${filterCategory === c ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {visibleRules.length === 0 ? (
              <div className="text-center text-gray-500 py-12 px-4">
                <p className="text-sm mb-3">No annotation rules yet.</p>
                <button onClick={seedStarters} className="text-xs px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white">
                  Load starter rules (Invert + Utility Pole)
                </button>
              </div>
            ) : visibleRules.map(rule => {
              const matched = previewMatches(rule);
              return (
                <div
                  key={rule.id}
                  className={`p-2 rounded border ${editing?.id === rule.id ? 'border-cyan-500 bg-gray-800/80' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: rule.color || (rule.category === 'proposed' ? '#f472b6' : '#22d3ee') }}
                        />
                        <span className="text-sm font-medium text-white truncate">{rule.name || '(unnamed)'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${rule.category === 'proposed' ? 'bg-pink-900 text-pink-200' : 'bg-cyan-900 text-cyan-200'}`}>
                          {rule.category}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">{rule.scale.toFixed(2)}x</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1 truncate">
                        Matches: {rule.associatedTerms.join(', ') || '(none)'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Live: {matched.length} point(s) on canvas
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => startEdit(rule)} className="p-1 rounded hover:bg-gray-700 text-cyan-300" title="Edit">
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDeleteRule(rule.id)} className="p-1 rounded hover:bg-gray-700 text-red-400" title="Delete">
                        <EraserIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="w-1/2 overflow-y-auto p-4">
          {!editing ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center">
              <div>
                <p>Select a rule to edit, or create a new one.</p>
                <p className="mt-2 text-xs text-gray-600">
                  Placeholders: <code className="bg-gray-800 px-1 rounded">{'{description}'}</code>,{' '}
                  <code className="bg-gray-800 px-1 rounded">{'{elevation}'}</code>,{' '}
                  <code className="bg-gray-800 px-1 rounded">{'{pointNumber}'}</code>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* AI assist (only when API key present — freemium gate) */}
              <div className="border border-purple-700/40 rounded p-3 bg-purple-900/10">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuitIcon className="w-4 h-4 text-purple-300" />
                  <span className="text-xs font-semibold text-purple-200">AI Assist</span>
                  {!hasApiKey && <span className="text-[10px] text-gray-500 ml-auto">(add a Gemini key in Settings to enable)</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe the feature, e.g. 'sanitary invert' or 'fire hydrant'"
                    disabled={!hasApiKey || aiBusy}
                    className="flex-1 px-2 py-1 text-xs rounded bg-gray-800 border border-gray-700 text-white disabled:opacity-50"
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={!hasApiKey || aiBusy || !aiPrompt.trim()}
                    className="px-3 py-1 text-xs rounded bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {aiBusy ? <span className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin" /> : <BrainCircuitIcon className="w-3 h-3" />}
                    Generate
                  </button>
                </div>
                {aiError && <p className="text-[11px] text-red-400 mt-1">{aiError}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-white"
                  placeholder="e.g. Invert"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Category</label>
                <div className="flex gap-2">
                  {(['existing', 'proposed'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setEditing({ ...editing, category: c })}
                      className={`px-3 py-1 text-xs rounded ${editing.category === c ? (c === 'proposed' ? 'bg-pink-700 text-white' : 'bg-cyan-700 text-white') : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    >
                      {c[0].toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Match terms (comma-separated, * = wildcard)</label>
                <input
                  type="text"
                  value={editing.associatedTerms.join(', ')}
                  onChange={(e) => setEditing({
                    ...editing,
                    associatedTerms: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-white font-mono"
                  placeholder="*inv*, sanitary invert"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Note template <span className="text-gray-600">(\\n = new line)</span>
                </label>
                <textarea
                  value={editing.template}
                  onChange={(e) => setEditing({ ...editing, template: e.target.value })}
                  className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-white font-mono"
                  rows={3}
                  placeholder="INV={elevation}\\n{description}"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Leader Δ East (world)</label>
                  <input
                    type="number" step="0.5"
                    value={editing.leaderOffset.dx}
                    onChange={(e) => setEditing({ ...editing, leaderOffset: { ...editing.leaderOffset, dx: parseFloat(e.target.value) || 0 } })}
                    className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Leader Δ North (world)</label>
                  <input
                    type="number" step="0.5"
                    value={editing.leaderOffset.dy}
                    onChange={(e) => setEditing({ ...editing, leaderOffset: { ...editing.leaderOffset, dy: parseFloat(e.target.value) || 0 } })}
                    className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Per-rule scale: {editing.scale.toFixed(2)}x</label>
                <input
                  type="range" min="0.25" max="5" step="0.05"
                  value={editing.scale}
                  onChange={(e) => setEditing({ ...editing, scale: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Color</label>
                <input
                  type="color"
                  value={editing.color || '#22d3ee'}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  className="w-12 h-7 rounded bg-gray-800 border border-gray-700"
                />
              </div>
              {/* Preview */}
              <div className="border border-gray-700 rounded p-3 bg-gray-800/40">
                <p className="text-[11px] text-gray-500 mb-1">Preview (first matching point):</p>
                {(() => {
                  const sample = points.find(p => p.description && resolveAnnotation(p.description, [editing], buildAnnotationMatchers([editing])).rule?.id === editing.id);
                  const text = sample
                    ? renderAnnotationTemplate(editing.template, sample)
                    : renderAnnotationTemplate(editing.template, {
                        pointNumber: '101', northing: 5000, easting: 5000, elevation: 723.45,
                        description: editing.associatedTerms[0] || 'sample',
                      } as SurveyPoint);
                  return (
                    <pre className="text-xs font-mono whitespace-pre-wrap text-cyan-300">{text}</pre>
                  );
                })()}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setEditing(null); setIsNew(false); }} className="px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                  Cancel
                </button>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white">
                  {isNew ? 'Create rule' : 'Update rule'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
