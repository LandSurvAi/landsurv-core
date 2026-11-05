import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { A2UIZoningContext } from '../types';
import { knowledgeBase, type KnowledgeFact } from '../services/KnowledgeBase';
import { subscribeBootstrap, stageLabel, type BootstrapStatus } from '../utils/zoningBootstrap';
import { subscribeClawEvents, type ClawCallEvent } from '../utils/clawClient';
import { openSourcePolicyExplainer } from './PermissiveSourcesExplainer';
import ArcGISZoningMap from './ArcGISZoningMap';

interface Props {
  context: A2UIZoningContext;
  onAskQuestion?: (question: string) => void;
  onSelectDistrict?: (district: string) => void;
}

interface ResearchSummary {
  completedAt?: string;
  map?: { url?: string; kind?: string } | null;
  districtsCount?: number;
  districtsSource?: string | null;
  sourceCount?: number;
  dropped?: string[];
  narrative?: string;
  candidatesConsidered?: number;
  candidatesVerified?: number;
}

interface DistrictEntry {
  code: string;
  name?: string;
}

interface RequirementEntry {
  label: string;
  value: string;
  source?: string;
}

const ACTIVE_STAGES: BootstrapStatus['stage'][] = [
  'starting',
  'streaming',
  'tool-call',
  'streaming-followup',
  'parsing',
  'pinning',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isPdfUrl(url?: string): boolean {
  return Boolean(url && /\.pdf(\?|#|$)/i.test(url));
}

function arcgisServiceOf(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/^(https?:\/\/[^?#]*?\/MapServer)(?:\/\d+)?(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

function proxiedUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) return url;
    return `/api/proxy-fetch?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return url;
  }
}

function normalizeDistrict(value: unknown): DistrictEntry | null {
  if (typeof value === 'string') {
    const code = value.trim();
    return code ? { code } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const code = String(record.code ?? record.name ?? '').trim();
  if (!code) return null;
  return {
    code,
    name: record.name ? String(record.name) : undefined,
  };
}

function normalizeUse(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.use ?? record.name ?? record.label ?? record.description ?? '').trim();
  }
  return String(value ?? '').trim();
}

function displayValue(fact?: KnowledgeFact): string {
  if (!fact || fact.value == null) return '';
  const value = fact.value;
  const raw = typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : Array.isArray(value)
      ? value.map(normalizeUse).filter(Boolean).join(', ')
      : '';
  if (!raw) return '';
  const units = fact.units?.trim();
  if (!units || raw.toLowerCase().includes(units.toLowerCase())) return raw;
  return `${raw} ${units}`;
}

const SummaryChip: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <span
    className={
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium '
      + (ok
        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
        : 'border-slate-600/40 bg-slate-800/40 text-gray-400')
    }
  >
    {ok ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : <AlertCircle className="h-2.5 w-2.5 shrink-0" />}
    <span className="truncate">{children}</span>
  </span>
);

export const A2UIZoningResearch: React.FC<Props> = ({
  context,
  onAskQuestion,
  onSelectDistrict,
}) => {
  const [facts, setFacts] = useState<KnowledgeFact[]>(() =>
    knowledgeBase.queryFacts({ category: 'zoning.requirements' })
  );
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState(context.district ?? '');
  const [manualDistrictInput, setManualDistrictInput] = useState('');
  const [activeClawCall, setActiveClawCall] = useState<ClawCallEvent | null>(null);
  const [lastClawCall, setLastClawCall] = useState<ClawCallEvent | null>(null);
  const [showEmbeddedViewer, setShowEmbeddedViewer] = useState(false);

  useEffect(
    () => knowledgeBase.onChange(() =>
      setFacts(knowledgeBase.queryFacts({ category: 'zoning.requirements' }))
    ),
    []
  );

  useEffect(() => subscribeBootstrap(status => setBootstrap(status)), []);

  useEffect(
    () =>
      subscribeClawEvents(evt => {
        if (evt.status === 'running') {
          setActiveClawCall(evt);
        } else {
          setActiveClawCall(prev => (prev && prev.id === evt.id ? null : prev));
          setLastClawCall(evt);
        }
      }),
    []
  );

  const data = useMemo(() => {
    const placeKey = context.place.trim().toLowerCase();
    const scoped = placeKey
      ? facts.filter(fact => fact.subject.toLowerCase().includes(placeKey))
      : [];
    const get = (predicate: string): KnowledgeFact | undefined => {
      const matches = scoped.filter(
        fact => fact.predicate.toLowerCase() === predicate.toLowerCase()
      );
      return matches[matches.length - 1];
    };
    const districtKey = (selectedDistrict || context.district || '').trim().toLowerCase();
    const getRequirement = (predicate: string): KnowledgeFact | undefined => {
      const matches = scoped.filter(
        fact => fact.predicate.toLowerCase() === predicate.toLowerCase()
      );
      if (districtKey) {
        const preferred = matches.filter(fact =>
          fact.subject.toLowerCase().includes(districtKey)
        );
        if (preferred.length > 0) return preferred[preferred.length - 1];
      }
      return matches[matches.length - 1];
    };

    const asString = (predicate: string): string | undefined => {
      const value = get(predicate)?.value;
      return typeof value === 'string' ? value : undefined;
    };

    const districtValue = get('zoningDistricts')?.value;
    const districts = Array.isArray(districtValue)
      ? districtValue
          .map(normalizeDistrict)
          .filter((district): district is DistrictEntry => Boolean(district))
      : [];

    const sourceValue = get('zoningMapSources')?.value;
    const sources = Array.isArray(sourceValue)
      ? sourceValue.map(String).filter(source => /^https?:\/\//i.test(source))
      : [];

    const summaryValue = get('zoningResearchSummary')?.value;
    const summary = summaryValue && typeof summaryValue === 'object'
      ? summaryValue as ResearchSummary
      : null;

    const requirementDefs: Array<[string, string]> = [
      ['Front setback', 'setbackFront'],
      ['Side setback', 'setbackSide'],
      ['Rear setback', 'setbackRear'],
      ['Max height', 'maxHeight'],
      ['Min lot area', 'minLotArea'],
      ['Lot coverage', 'lotCoverage'],
    ];
    const requirements = requirementDefs
      .map(([label, predicate]): RequirementEntry | null => {
        const fact = getRequirement(predicate);
        const value = displayValue(fact);
        if (!value) return null;
        const src = typeof fact?.source === 'string' && /^https?:\/\//i.test(fact.source)
          ? fact.source
          : undefined;
        return { label, value, source: src };
      })
      .filter((requirement): requirement is RequirementEntry => Boolean(requirement));

    const usesValue = getRequirement('permittedUses')?.value;
    const uses = Array.isArray(usesValue)
      ? usesValue.map(normalizeUse).filter(Boolean).slice(0, 12)
      : [];

    return {
      mapUrl: asString('zoningMapUrl'),
      mapImg: asString('zoningMapImage'),
      mapKind: asString('zoningMapKind'),
      districts,
      sources,
      summary,
      requirements,
      uses,
      districtLabel: displayValue(getRequirement('district')),
    };
  }, [facts, context.place, context.district, selectedDistrict]);

  const [mapImgFailed, setMapImgFailed] = useState(false);
  useEffect(() => {
    setMapImgFailed(false);
    setShowEmbeddedViewer(false);
  }, [data.mapImg, data.mapUrl]);

  const countyLabel = context.county
    ? (/\bcounty$/i.test(context.county) ? context.county : `${context.county} County`)
    : '';
  const jurisdiction = [context.place, countyLabel, context.state].filter(Boolean).join(' · ');
  const bootstrapActive = Boolean(bootstrap && ACTIVE_STAGES.includes(bootstrap.stage));
  const recentlyStarted = !context.startedAt || Date.now() - context.startedAt < 20_000;
  const isWorking = bootstrapActive || (!bootstrap && recentlyStarted && !data.summary);
  const failed = bootstrap?.stage === 'failed';
  const districtLabel = selectedDistrict || data.districtLabel;
  const hasMap = Boolean(data.mapUrl || data.mapImg);
  const hasDistrictData = data.districts.length > 0;
  const arcgisServiceUrl = arcgisServiceOf(data.mapUrl);
  const canEmbedViewer = Boolean(data.mapUrl && (isPdfUrl(data.mapUrl) || data.mapKind === 'pdf' || data.mapKind === 'gis'));

  const askQuestion = (question: string) => {
    onAskQuestion?.(question);
  };

  const handleDistrictClick = (district: DistrictEntry) => {
    setSelectedDistrict(district.code);
    if (onSelectDistrict) {
      onSelectDistrict(district.code);
      return;
    }
    askQuestion(
      `Tell me about the ${district.code}${district.name ? ` (${district.name})` : ''} zoning district`
      + `${jurisdiction ? ` in ${jurisdiction}` : ''} — permitted uses, setbacks, height limit, and lot coverage. Cite the section number(s).`
    );
  };

  const handleManualDistrictSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualDistrictInput.trim();
    if (!code) return;
    setManualDistrictInput('');
    handleDistrictClick({ code });
  };

  const quickQuestions = ['Setbacks', 'Permitted uses', 'Height limit', 'Lot coverage'];

  return (
    <div
      data-testid="a2ui-zoning-research"
      className="mt-3 min-w-0 overflow-hidden rounded-xl border border-emerald-500/25 bg-[#081119] shadow-lg shadow-emerald-950/20"
    >
      <div className="flex min-w-0 items-start gap-2 border-b border-white/[0.07] bg-emerald-500/[0.06] px-3 py-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100">
              Zoning research
            </span>
            <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1 py-px font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-300">
              A2UI
            </span>
            {districtLabel && (
              <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-200">
                {districtLabel}
              </span>
            )}
            {activeClawCall && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-px font-mono text-[8.5px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                {activeClawCall.tool}
              </span>
            )}
            {!activeClawCall && lastClawCall && (
              <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px font-mono text-[8.5px] text-slate-400">
                {lastClawCall.status === 'ok' ? '✓' : '!'} {lastClawCall.tool}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10.5px] text-gray-400">
            {jurisdiction || 'Zoning research in this chat'}
          </p>
        </div>
        <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
      </div>

      <div className="min-w-0 space-y-2.5 p-3">
        {isWorking && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-2.5 py-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-300" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-emerald-100">
                {bootstrap ? stageLabel(bootstrap.stage) : 'Starting zoning research…'}
              </p>
              {bootstrap?.detail && (
                <p className="truncate text-[10px] text-gray-500">{bootstrap.detail}</p>
              )}
            </div>
          </div>
        )}

        {failed && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-2.5 py-2 text-rose-100">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold">Auto-research couldn't complete</p>
              <p className="mt-0.5 text-[10px] text-rose-200/70">
                {bootstrap?.detail || 'Ask a zoning question in the chat below and I will dig deeper.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-cyan-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
                Official map
              </span>
              {canEmbedViewer && !arcgisServiceUrl && (
                <button
                  type="button"
                  onClick={() => setShowEmbeddedViewer(v => !v)}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 hover:border-cyan-400/60"
                >
                  <Eye className="h-2.5 w-2.5" />
                  {showEmbeddedViewer ? 'Hide preview' : 'Preview inline'}
                </button>
              )}
              {hasMap && !canEmbedViewer && <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-400" />}
            </div>

            {arcgisServiceUrl ? (
              <div className="mb-2 h-40 w-full overflow-hidden rounded-md border border-white/10">
                <ArcGISZoningMap serviceUrl={arcgisServiceUrl} place={context.place} />
              </div>
            ) : showEmbeddedViewer && data.mapUrl ? (
              <div className="mb-2 h-44 w-full overflow-hidden rounded-md border border-white/10 bg-slate-950">
                <iframe
                  src={proxiedUrl(data.mapUrl) ?? data.mapUrl}
                  title={`Official zoning map for ${context.place || 'municipality'}`}
                  className="h-full w-full border-0"
                />
              </div>
            ) : data.mapImg && !mapImgFailed ? (
              <img
                src={data.mapImg}
                alt={`Zoning map for ${context.place}`}
                loading="lazy"
                className="mb-2 h-24 w-full rounded-md border border-white/10 object-cover"
                onError={() => setMapImgFailed(true)}
              />
            ) : (
              <div className="mb-2 flex h-16 items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.015]">
                <MapPin className="h-4 w-4 text-slate-600" />
              </div>
            )}

            {data.mapUrl ? (
              <a
                href={data.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-[10.5px] font-semibold text-cyan-300 hover:text-cyan-200"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {data.mapKind === 'gis' ? 'Open interactive GIS zoning map' : 'Open official zoning map'}
                </span>
              </a>
            ) : (
              <p className="text-[10px] text-gray-500">
                {isWorking ? 'Searching for the official map…' : 'No official map found yet.'}
              </p>
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-violet-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                Zoning districts
              </span>
              {hasDistrictData && (
                <span className="ml-auto rounded bg-violet-500/10 px-1.5 py-px font-mono text-[9px] text-violet-300">
                  {data.districts.length}
                </span>
              )}
            </div>
            {hasDistrictData ? (
              <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto pr-0.5">
                {data.districts.map((district, index) => (
                  <button
                    key={`${district.code}-${index}`}
                    type="button"
                    onClick={() => handleDistrictClick(district)}
                    aria-label={`Research ${district.code} zoning district`}
                    className={`min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors ${
                      selectedDistrict === district.code
                        ? 'border-amber-400/60 bg-amber-500/15'
                        : 'border-violet-700/30 bg-gradient-to-br from-slate-900/60 to-slate-900/30 hover:border-violet-400/60 hover:bg-violet-500/10'
                    }`}
                  >
                    <span className="block truncate text-[11px] font-bold text-violet-200">
                      {district.code}
                    </span>
                    {district.name && (
                      <span className="block truncate text-[9px] text-gray-500">{district.name}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-violet-500/20 bg-violet-500/[0.03] px-2 text-center">
                <p className="text-[10px] text-gray-500">
                  {isWorking ? 'Compiling district list…' : 'No districts found yet.'}
                </p>
              </div>
            )}

            {/* Manual District Entry (ZoningPanel parity) */}
            <form onSubmit={handleManualDistrictSubmit} className="mt-2 flex items-center gap-1">
              <input
                type="text"
                value={manualDistrictInput}
                onChange={e => setManualDistrictInput(e.target.value)}
                placeholder="Enter district code (e.g. R-1, C-2)…"
                aria-label="Enter custom zoning district code"
                className="min-w-0 flex-1 rounded border border-white/[0.09] bg-[#060d16] px-2 py-1 text-[10px] text-slate-200 placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manualDistrictInput.trim()}
                className="shrink-0 rounded border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-[9.5px] font-semibold text-violet-200 transition-colors hover:border-violet-400 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Research
              </button>
            </form>
          </div>
        </div>

        {(data.requirements.length > 0 || data.uses.length > 0) && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.035] p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                {districtLabel ? `${districtLabel} requirements` : 'Pinned requirements'}
              </span>
            </div>
            {data.requirements.length > 0 && (
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {data.requirements.map(requirement => (
                  <div
                    key={requirement.label}
                    className="min-w-0 rounded border border-white/[0.06] bg-black/10 px-1.5 py-1"
                  >
                    <p className="truncate text-[9px] uppercase tracking-wider text-gray-500">
                      {requirement.label}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-emerald-100">
                      {requirement.value}
                    </p>
                    {requirement.source && (
                      <a
                        href={requirement.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex max-w-full items-center gap-0.5 text-[8.5px] text-emerald-400/80 hover:text-emerald-300"
                      >
                        <ExternalLink className="h-2 w-2 shrink-0" />
                        <span className="truncate">{hostOf(requirement.source)}</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {data.uses.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[9px] uppercase tracking-wider text-gray-500">Permitted uses</p>
                <div className="flex flex-wrap gap-1">
                  {data.uses.map(use => (
                    <span
                      key={use}
                      className="rounded border border-emerald-400/20 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[9.5px] text-emerald-100"
                    >
                      {use}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {data.summary && (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.035] p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-sky-300" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-200">
                Auto-research summary
              </span>
              {data.summary.completedAt && (
                <span className="ml-auto font-mono text-[9px] text-gray-500">
                  {new Date(data.summary.completedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <SummaryChip ok={!!data.summary.map}>
                {data.summary.map
                  ? `Map · ${data.summary.map.kind || 'link'}${data.summary.map.url ? ` · ${hostOf(data.summary.map.url)}` : ''}`
                  : 'Map · not found'}
              </SummaryChip>
              <SummaryChip ok={(data.summary.districtsCount ?? 0) > 0}>
                {`Districts · ${data.summary.districtsCount ?? data.districts.length}`}
              </SummaryChip>
              <SummaryChip ok={(data.summary.sourceCount ?? 0) > 0}>
                {`Sources · ${data.summary.sourceCount ?? data.sources.length}`}
              </SummaryChip>
            </div>
            {data.summary.narrative && (
              <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-gray-400">
                {data.summary.narrative}
              </p>
            )}
            {data.summary.dropped && data.summary.dropped.length > 0 && (
              <p className="mt-1 flex items-start gap-1 text-[9.5px] text-amber-300/80">
                <AlertCircle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>Not used: {data.summary.dropped.join('; ')}</span>
              </p>
            )}
          </div>
        )}

        {data.sources.length > 0 && (
          <div className="border-t border-white/[0.06] pt-2">
            <p className="mb-1 text-[9px] uppercase tracking-wider text-gray-500">Sources</p>
            <div className="flex flex-wrap gap-1">
              {data.sources.slice(0, 6).map(source => (
                <a
                  key={source}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9.5px] text-gray-400 hover:border-cyan-400/30 hover:text-cyan-300"
                  title={source}
                >
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="max-w-[160px] truncate">{hostOf(source)}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {onAskQuestion && (
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map(question => (
              <button
                key={question}
                type="button"
                onClick={() =>
                  askQuestion(
                    `What are the ${question.toLowerCase()} for the ${districtLabel || context.place || 'property'}?`
                    + ' Cite the zoning ordinance section(s).'
                  )
                }
                className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-200 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/15"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-1.5">
          <p className="text-[9px] text-gray-600">
            Preliminary research for review — verify with the municipality before relying on it.
          </p>
          <button
            type="button"
            onClick={() => openSourcePolicyExplainer()}
            className="inline-flex items-center gap-1 text-[9px] text-gray-500 transition-colors hover:text-emerald-300"
          >
            <ShieldCheck className="h-2.5 w-2.5" />
            Permissive-source policy
          </button>
        </div>
      </div>
    </div>
  );
};

export default A2UIZoningResearch;

