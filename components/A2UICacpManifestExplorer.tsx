import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Network,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { agentRegistry, type AgentManifest, type SkillSchema } from '../services/AgentRegistry.ts';
import { AgentType } from '../types.ts';

interface A2UICacpManifestExplorerProps {
  initialAgent?: AgentType;
  /** Restrict the explorer to CACP-enabled manifests. Default: true. */
  cacpOnly?: boolean;
}

function lower(value: string): string {
  return value.toLowerCase();
}

const SkillRow: React.FC<{ skill: SkillSchema }> = ({ skill }) => {
  const [open, setOpen] = useState(false);
  const inputs = Object.entries(skill.inputs ?? {});
  const outputs = Object.entries(skill.outputs ?? {});

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold text-emerald-100">{skill.name}</span>
            <span
              className={`rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wide ${
                skill.type === 'action'
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                  : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
              }`}
            >
              {skill.type ?? 'query'}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-emerald-400/70">{skill.id}</div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{skill.description}</p>
        </div>
        {open ? (
          <ChevronUp className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
        ) : (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
        )}
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-2 border-t border-white/[0.06] px-2.5 py-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Inputs</p>
            {inputs.length === 0 ? (
              <p className="text-[9.5px] italic text-slate-600">none</p>
            ) : (
              <ul className="space-y-1">
                {inputs.map(([key, schema]) => (
                  <li key={key} className="text-[9.5px] leading-snug">
                    <span className="font-mono text-emerald-300">{key}</span>
                    <span className="text-slate-600"> : </span>
                    <span className="text-slate-300">{schema.type}</span>
                    {schema.required && <span className="ml-1 text-rose-400">*</span>}
                    {schema.description && <div className="ml-2 text-[9px] text-slate-500">{schema.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Outputs</p>
            {outputs.length === 0 ? (
              <p className="text-[9.5px] italic text-slate-600">none</p>
            ) : (
              <ul className="space-y-1">
                {outputs.map(([key, schema]) => (
                  <li key={key} className="text-[9.5px] leading-snug">
                    <span className="font-mono text-emerald-300">{key}</span>
                    <span className="text-slate-600"> : </span>
                    <span className="text-slate-300">{schema.type}</span>
                    {schema.description && <div className="ml-2 text-[9px] text-slate-500">{schema.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {skill.examples && skill.examples.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Examples</p>
              <ul className="list-inside list-disc space-y-0.5 text-[9.5px] text-slate-400">
                {skill.examples.map((example, index) => (
                  <li key={index}>{example}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Live CACP manifest browser used by the surface console and the public layer.
 * It reads the real AgentRegistry, so it is wired to the build's manifests
 * rather than a static page copy.
 */
export const A2UICacpManifestExplorer: React.FC<A2UICacpManifestExplorerProps> = ({
  initialAgent,
  cacpOnly = true,
}) => {
  const manifests = useMemo(
    () => (cacpOnly ? agentRegistry.listCacpEnabled() : agentRegistry.list()),
    [cacpOnly],
  );
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(
    initialAgent ?? manifests[0]?.agent ?? null,
  );
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const selected: AgentManifest | undefined = useMemo(
    () => manifests.find(manifest => manifest.agent === selectedAgent) ?? manifests[0],
    [manifests, selectedAgent],
  );

  const filteredAgents = useMemo(() => {
    const needle = lower(query.trim());
    if (!needle) return manifests;
    return manifests.filter(manifest => {
      const skills = manifest.skills.map(skill => `${skill.id} ${skill.name} ${skill.description}`).join(' ');
      return lower(`${manifest.displayName} ${manifest.agent} ${skills}`).includes(needle);
    });
  }, [manifests, query]);

  const totalSkills = useMemo(
    () => manifests.reduce((count, manifest) => count + manifest.skills.length, 0),
    [manifests],
  );

  const copyManifest = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard?.writeText(JSON.stringify(selected, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div data-testid="a2ui-cacp-manifests" className="flex min-h-0 flex-col">
      <div className="border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              <Network className="h-3 w-3" />
              CACP manifest explorer
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              {manifests.length} agents · {totalSkills} skills registered in this build. Schemas are read live.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-200">
            <ShieldCheck className="h-2.5 w-2.5" />
            Live registry
          </span>
        </div>

        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter agents or skills…"
            aria-label="Filter CACP manifests"
            className="w-full rounded-md border border-white/[0.09] bg-white/[0.03] py-1.5 pl-8 pr-2.5 text-[11.5px] text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/15"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[38%] min-w-[9.5rem] shrink-0 overflow-y-auto border-r border-white/[0.07] p-1.5">
          {filteredAgents.map(manifest => {
            const active = manifest.agent === selected?.agent;
            return (
              <button
                key={manifest.agent}
                type="button"
                onClick={() => setSelectedAgent(manifest.agent)}
                aria-pressed={active}
                className={`mb-1 w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? 'border-emerald-400/35 bg-emerald-400/[0.08]'
                    : 'border-transparent hover:border-white/[0.1] hover:bg-white/[0.03]'
                }`}
              >
                <span className={`block truncate text-[10.5px] font-semibold ${active ? 'text-emerald-100' : 'text-slate-300'}`}>
                  {manifest.displayName}
                </span>
                <span className="mt-0.5 block font-mono text-[8.5px] text-slate-500">
                  {manifest.skills.length} skills · v{manifest.version}
                </span>
              </button>
            );
          })}
          {filteredAgents.length === 0 && (
            <p className="px-1.5 py-4 text-[9.5px] text-slate-500">No manifests match.</p>
          )}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto p-2.5">
          {!selected ? (
            <p className="py-8 text-center text-[10.5px] text-slate-500">No CACP manifests registered.</p>
          ) : (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[12px] font-semibold text-slate-100">{selected.displayName}</h3>
                  <p className="truncate font-mono text-[9px] text-slate-500">
                    {selected.agent} · v{selected.version}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyManifest}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                >
                  {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                  {copied ? 'Copied' : 'JSON'}
                </button>
              </div>
              <div className="space-y-1.5">
                {selected.skills.map(skill => (
                  <SkillRow key={skill.id} skill={skill} />
                ))}
                {selected.skills.length === 0 && (
                  <p className="py-4 text-center text-[10px] text-slate-500">This manifest declares no skills.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default A2UICacpManifestExplorer;
