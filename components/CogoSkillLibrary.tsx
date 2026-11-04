import React, { useMemo, useState } from 'react';
import { ChevronRightIcon, SparklesIcon } from './icons.tsx';
import { COGO_EXTENDED_SKILLS } from '../services/cogoSkillSchemas.ts';

export type CogoSkillGroup =
  | 'Survey'
  | 'Intersections'
  | 'Curves'
  | 'Traverse'
  | 'Area & Parcels'
  | 'Fit & Transforms'
  | 'Geodetic'
  | 'Site & QA';

export interface CogoSkillEntry {
  id: string;
  name: string;
  description: string;
  group: CogoSkillGroup;
}

const CORE_COGO_SKILLS: CogoSkillEntry[] = [
  {
    id: 'cogo_inverse',
    name: 'Inverse Calculation',
    description: 'Bearing and distance between two project points.',
    group: 'Survey',
  },
  {
    id: 'cogo_shrinkwrap',
    name: 'Shrinkwrap Boundary Hull',
    description: 'Wrap project points in a reviewed boundary hull and open the shrinkwrap editor.',
    group: 'Area & Parcels',
  },
];

function groupForSkill(id: string): CogoSkillGroup {
  if (id.includes('intersect') || id.includes('circle_through') || id.includes('perpendicular')) return 'Intersections';
  if (id.includes('curve') || id.includes('spiral') || id.includes('vcurve')) return 'Curves';
  if (id.includes('traverse')) return 'Traverse';
  if (id.includes('area') || id.includes('subdivide') || id.includes('offset') || id.includes('minimum_bounding') || id.includes('shrinkwrap')) {
    return 'Area & Parcels';
  }
  if (id.includes('bestfit') || id.includes('helmert') || id.includes('affine')) return 'Fit & Transforms';
  if (id.includes('geodesic')) return 'Geodetic';
  if (id.includes('sanity') || id.includes('selftest')) return 'Site & QA';
  return 'Survey';
}

export const COGO_SKILL_GROUPS: CogoSkillGroup[] = [
  'Survey',
  'Intersections',
  'Curves',
  'Traverse',
  'Area & Parcels',
  'Fit & Transforms',
  'Geodetic',
  'Site & QA',
];

export const COGO_SKILLS: CogoSkillEntry[] = [
  ...CORE_COGO_SKILLS,
  ...COGO_EXTENDED_SKILLS.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    group: groupForSkill(skill.id),
  })),
];

export const buildCogoSkillPrompt = (skill: CogoSkillEntry): string =>
  `Run the ${skill.name} COGO skill (${skill.id}) for this project. ${skill.description} ` +
  'Ask me for any missing inputs first, then calculate and show the result with units and a short interpretation.';

const SearchGlyph = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="11" cy="11" r="7" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
  </svg>
);

interface CogoSkillLibraryProps {
  /** Launch a skill prompt in the COGO agent chat. */
  onRunSkill: (prompt: string, skill: CogoSkillEntry) => void;
}

/**
 * Browsable view of every COGO CACP skill. The same catalog can be mounted in
 * an A2UI surface later; launching a skill currently routes through chat.
 */
export const CogoSkillLibrary: React.FC<CogoSkillLibraryProps> = ({ onRunSkill }) => {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'All' | CogoSkillGroup>('All');

  const groupCounts = useMemo(
    () =>
      COGO_SKILL_GROUPS.map(skillGroup => ({
        group: skillGroup,
        count: COGO_SKILLS.filter(skill => skill.group === skillGroup).length,
      })),
    []
  );

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return COGO_SKILLS.filter(skill => {
      if (group !== 'All' && skill.group !== group) return false;
      if (!normalizedQuery) return true;
      return `${skill.name} ${skill.id} ${skill.description} ${skill.group}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [group, query]);

  return (
    <section
      data-testid="cogo-skill-library"
      className="rounded-xl border border-white/[0.08] bg-[#0c1320] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
            <SparklesIcon className="h-3.5 w-3.5 text-violet-300" />
            Skill library
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            {COGO_SKILLS.length} deterministic COGO skills. Pick one and the agent will guide the inputs in chat.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-violet-200">
          {filteredSkills.length}
        </span>
      </div>

      <div className="relative mt-3">
        <SearchGlyph />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search COGO skills..."
          aria-label="Search COGO skills"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-violet-500/40 focus:outline-none"
        />
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {(['All', ...COGO_SKILL_GROUPS] as const).map(option => {
          const selected = group === option;
          const count = option === 'All'
            ? COGO_SKILLS.length
            : groupCounts.find(item => item.group === option)?.count ?? 0;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setGroup(option)}
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors ${
                selected
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                  : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
              }`}
            >
              {option} <span className="font-mono opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 space-y-1.5">
        {filteredSkills.map(skill => (
          <button
            key={skill.id}
            type="button"
            data-testid={`cogo-skill-${skill.id}`}
            onClick={() => onRunSkill(buildCogoSkillPrompt(skill), skill)}
            className="group flex w-full items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.06]"
            title={skill.description}
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] font-semibold text-slate-200 group-hover:text-white">{skill.name}</span>
                <span className="rounded bg-white/[0.04] px-1 py-0.5 text-[8.5px] font-medium uppercase tracking-wide text-slate-500">
                  {skill.group}
                </span>
              </span>
              <span className="mt-0.5 block truncate font-mono text-[9px] text-violet-300/75">{skill.id}</span>
              <span className="mt-1 block line-clamp-2 text-[10.5px] leading-snug text-slate-400">{skill.description}</span>
            </span>
            <ChevronRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-violet-300" />
          </button>
        ))}
        {filteredSkills.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] text-slate-500">
            No skills match “{query.trim()}”.
          </div>
        )}
      </div>
    </section>
  );
};

export default CogoSkillLibrary;
