import React, { useMemo, useState } from 'react';
import { agentRegistry, AgentManifest, SkillSchema } from '../services/AgentRegistry';
import { AgentType } from '../types';

interface CacpManifestModalProps {
  agent: AgentType;
  onClose: () => void;
}

const SkillCard: React.FC<{ skill: SkillSchema }> = ({ skill }) => {
  const [open, setOpen] = useState(false);
  const inputKeys = Object.keys(skill.inputs || {});
  const outputKeys = Object.keys(skill.outputs || {});
  return (
    <div className="border border-emerald-700/40 bg-emerald-950/20 rounded-md p-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between text-left gap-3"
      >
        <div className="min-w-0">
          <div className="font-semibold text-emerald-200 text-sm">{skill.name}</div>
          <div className="font-mono text-[11px] text-emerald-400/80 truncate">{skill.id}</div>
          <div className="text-xs text-gray-300 mt-1 leading-snug">{skill.description}</div>
        </div>
        <span className="text-emerald-300 text-lg leading-none select-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Inputs</div>
            {inputKeys.length === 0 ? (
              <div className="text-xs text-gray-500 italic">none</div>
            ) : (
              <ul className="space-y-1">
                {inputKeys.map(k => {
                  const f = skill.inputs[k];
                  return (
                    <li key={k} className="text-xs">
                      <span className="font-mono text-emerald-300">{k}</span>
                      <span className="text-gray-500"> : </span>
                      <span className="text-gray-300">{f.type}</span>
                      {f.required && <span className="ml-1 text-rose-400">*</span>}
                      {f.description && <div className="text-[11px] text-gray-400 ml-3">{f.description}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Outputs</div>
            {outputKeys.length === 0 ? (
              <div className="text-xs text-gray-500 italic">none</div>
            ) : (
              <ul className="space-y-1">
                {outputKeys.map(k => {
                  const f = skill.outputs[k];
                  return (
                    <li key={k} className="text-xs">
                      <span className="font-mono text-emerald-300">{k}</span>
                      <span className="text-gray-500"> : </span>
                      <span className="text-gray-300">{f.type}</span>
                      {f.required && <span className="ml-1 text-rose-400">*</span>}
                      {f.description && <div className="text-[11px] text-gray-400 ml-3">{f.description}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {skill.examples && skill.examples.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Examples</div>
              <ul className="list-disc list-inside text-xs text-gray-300 space-y-0.5">
                {skill.examples.map((ex, i) => <li key={i}>{ex}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CacpManifestModal: React.FC<CacpManifestModalProps> = ({ agent, onClose }) => {
  const [view, setView] = useState<'pretty' | 'json'>('pretty');
  const manifest: AgentManifest | undefined = useMemo(() => agentRegistry.get(agent), [agent]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-gray-900 border border-emerald-600/40 rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col light-theme:bg-white light-theme:border-emerald-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-700/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-lg font-semibold text-emerald-200 truncate">
              {manifest ? `${manifest.displayName} — CACP Manifest` : 'CACP Manifest'}
            </h2>
            {manifest && (
              <span className="text-[10px] font-mono text-emerald-400/80 ml-1">v{manifest.version}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView('pretty')}
              className={`text-xs px-2 py-1 rounded ${view === 'pretty' ? 'bg-emerald-700/40 text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
              type="button"
            >
              Pretty
            </button>
            <button
              onClick={() => setView('json')}
              className={`text-xs px-2 py-1 rounded ${view === 'json' ? 'bg-emerald-700/40 text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
              type="button"
            >
              JSON
            </button>
            <button
              onClick={onClose}
              className="ml-2 text-gray-400 hover:text-white text-xl leading-none"
              aria-label="Close"
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!manifest ? (
            <div className="text-sm text-gray-400">
              This agent is not registered with CACP. No manifest is available.
            </div>
          ) : view === 'json' ? (
            <pre className="text-[11px] font-mono text-emerald-200 bg-black/40 p-3 rounded border border-emerald-800/30 whitespace-pre-wrap break-words light-theme:text-gray-800 light-theme:bg-gray-100 light-theme:border-gray-300">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">
                Agent <span className="font-mono text-emerald-300">{manifest.agent}</span> exposes{' '}
                <span className="text-emerald-200 font-semibold">{manifest.skills.length}</span> skill
                {manifest.skills.length === 1 ? '' : 's'} over the Cross-Agent Communications Protocol.
                Click any skill to inspect its input/output schema.
              </div>
              {manifest.skills.map(s => <SkillCard key={s.id} skill={s} />)}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-emerald-700/30 text-[11px] text-gray-500 flex items-center justify-between">
          <span>CACP — Cross Agent Communications Protocol</span>
          <button
            type="button"
            onClick={() => {
              if (manifest) {
                navigator.clipboard?.writeText(JSON.stringify(manifest, null, 2)).catch(() => {});
              }
            }}
            disabled={!manifest}
            className="text-emerald-400 hover:text-emerald-200 disabled:opacity-40"
          >
            Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
};

export default CacpManifestModal;
