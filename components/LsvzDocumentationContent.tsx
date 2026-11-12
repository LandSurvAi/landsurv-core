import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileJson,
  Link2,
  Search,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import {
  LSVZ_SCHEMA,
  renderExampleManifest,
  lsvzFieldCount,
  LSVZ_SPEC_VERSION,
  LSVZ_SPEC_RELEASE,
} from '../utils/lsvzSchema';
import { APP_VERSION } from '../utils/appVersion';

const exampleManifest = renderExampleManifest(APP_VERSION);
const fieldCount = lsvzFieldCount();

const TOC = [
  { id: 'lsvz-overview', label: 'Overview' },
  { id: 'lsvz-principles', label: 'Design principles' },
  { id: 'lsvz-archive', label: 'Archive layout' },
  { id: 'lsvz-manifest', label: 'Manifest schema' },
  { id: 'lsvz-interop', label: 'CACP & A2UI' },
  { id: 'lsvz-provenance', label: 'Provenance' },
  { id: 'lsvz-compatibility', label: 'Compatibility' },
  { id: 'lsvz-license', label: 'Licensing' },
];

const INITIAL_OPEN_GROUPS = new Set(['top', 'context', 'files', 'cacp', 'redline']);

const SectionHeading: React.FC<{ index: string; title: string; kicker?: string }> = ({ index, title, kicker }) => (
  <div className="mb-5 flex items-start gap-3">
    <span className="mt-0.5 font-mono text-[10px] font-bold tracking-[0.16em] text-cyan-400">{index}</span>
    <div>
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
      {kicker && <p className="mt-1 text-sm text-gray-400">{kicker}</p>}
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/[0.08] bg-slate-950/55 px-3 py-3">
    <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p>
    <p className="mt-1 truncate font-mono text-sm font-semibold text-cyan-200">{value}</p>
  </div>
);

export const LsvzDocumentationContent: React.FC = () => {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(INITIAL_OPEN_GROUPS));
  const [copiedExample, setCopiedExample] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: '.lsvz — LandSurv.ai Project Archive Specification',
        description:
          'Open CC BY 4.0 specification for the .lsvz survey project archive: ZIP container, typed manifest.json, native source files, CACP state, A2UI message payloads, and Redline review records.',
        url: 'https://lsvz.landsurv.ai',
        image: 'https://landsurv.ai/favicon-512.png',
        author: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        publisher: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        license: 'https://creativecommons.org/licenses/by/4.0/',
        version: LSVZ_SPEC_VERSION,
        datePublished: LSVZ_SPEC_RELEASE,
        keywords:
          '.lsvz, survey data, open source, AI-native, land survey, civil engineering, file format, CACP, A2UI, CC BY 4.0',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
          { '@type': 'ListItem', position: 2, name: '.lsvz File Format', item: 'https://lsvz.landsurv.ai' },
        ],
      },
    ];
    const injected: HTMLScriptElement[] = [];
    schemas.forEach(schema => {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(schema);
      document.head.appendChild(el);
      injected.push(el);
    });
    return () => injected.forEach(el => el.parentNode?.removeChild(el));
  }, []);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LSVZ_SCHEMA;
    return LSVZ_SCHEMA.map(group => ({
      ...group,
      fields: group.fields.filter(field =>
        String(field.key).toLowerCase().includes(q) ||
        field.description.toLowerCase().includes(q) ||
        group.title.toLowerCase().includes(q) ||
        group.description.toLowerCase().includes(q),
      ),
    })).filter(group => group.fields.length > 0);
  }, [query]);

  const visibleFieldCount = useMemo(
    () => filteredGroups.reduce((count, group) => count + group.fields.length, 0),
    [filteredGroups],
  );

  const copy = async (text: string, setCopied: (value: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions can be denied; the text remains selectable.
    }
  };

  const toggleGroup = (id: string) => {
    setOpenGroups(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/45 via-slate-900/85 to-emerald-950/25 px-5 py-7 sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Open standard
            </span>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300">
              CC BY 4.0
            </span>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-cyan-200">
              Spec v{LSVZ_SPEC_VERSION}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-gray-400">
              Published {LSVZ_SPEC_RELEASE}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-gray-400">
              App {APP_VERSION}
            </span>
          </div>

          <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                Format specification / LS-VZ
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
                .lsvz <span className="font-light text-cyan-300">File Format</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-gray-300">
                A portable, auditable container for the complete surveying workspace. One ZIP, one typed
                manifest, and the original source files — with CACP project memory, A2UI conversation
                surfaces, and Redline review records carried as first-class session state.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <a href="#lsvz-archive" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20">
                  Archive layout
                </a>
                <a href="#lsvz-manifest" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.08]">
                  Manifest schema
                </a>
                <a href="https://lsvz.landsurv.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.08]">
                  Public URL <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Container" value="ZIP" />
              <Stat label="Manifest" value="JSON" />
              <Stat label="Documented fields" value={String(fieldCount)} />
              <Stat label="Schema groups" value={String(LSVZ_SCHEMA.length)} />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-4 space-y-0.5" aria-label=".lsvz specification contents">
            <p className="mb-2 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Contents</p>
            {TOC.map((item, index) => (
              <a key={item.id} href={`#${item.id}`} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.04] hover:text-cyan-200">
                <span className="w-4 font-mono text-[9px] text-gray-600 group-hover:text-cyan-500">{String(index + 1).padStart(2, '0')}</span>
                {item.label}
              </a>
            ))}
            <div className="mt-4 border-t border-white/[0.08] px-2 pt-3">
              <a href="https://cacp.landsurv.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-gray-500 transition-colors hover:text-emerald-300">
                <Waypoints className="h-3 w-3" /> CACP specification
              </a>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 space-y-12">
          <section id="lsvz-overview" className="scroll-mt-6">
            <SectionHeading index="01" title="Overview" kicker="What the format is, and what it is not." />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
              <div className="space-y-3 text-[15px] leading-7 text-gray-300">
                <p>
                  <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-cyan-300">.lsvz</code>{' '}
                  is the LandSurv.ai project archive. It packages the complete editable session — geometry,
                  survey source files, agent conversations, CACP knowledge, Redline runs, and UI restoration
                  state — so another workstation can reopen the project with the same context.
                </p>
                <p>
                  The archive is deliberately boring at the container layer: a standard ZIP file. The contract
                  is the typed <code className="font-mono text-cyan-300">manifest.json</code> at the root.
                  Every other entry is a source file or an agent-produced artifact. Nothing proprietary is
                  hidden in a binary database.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-slate-950/50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> Specification status
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  {[
                    ['Version', `v${LSVZ_SPEC_VERSION}`],
                    ['Published', LSVZ_SPEC_RELEASE],
                    ['Manifest', 'UTF-8 JSON'],
                    ['License', 'CC BY 4.0'],
                    ['Compatibility', 'Additive-first'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-mono text-gray-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>

          <section id="lsvz-principles" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="02" title="Design principles" kicker="Four constraints that keep the archive portable and legible." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Complete, not lossy', 'Points, linework, centerlines, hatches, labels, chats, CACP facts, and Redline runs round-trip. A reopened archive is the project, not a screenshot of it.'],
                ['Typed and inspectable', 'The manifest is JSON. Keys and groups are documented here and compile-time checked against the live SessionState type, so the spec cannot silently drift.'],
                ['AI-readable', 'Agents receive a compact project manifest and can query the structured state directly. CACP facts and A2UI messages remain attached to the project they belong to.'],
                ['Open by construction', 'ZIP + JSON + original files. No license server, no encrypted index, and no dependency on a LandSurv-hosted service to read the archive.'],
              ].map(([title, body], index) => (
                <article key={title} className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-4">
                  <span className="font-mono text-[10px] text-cyan-500">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-gray-400">{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="lsvz-archive" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="03" title="Archive layout" kicker="What is inside the ZIP, and what the reader may rely on." />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/70">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500">Archive tree</span>
                  <span className="font-mono text-[10px] text-cyan-400">application/x-landsurvai-session</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-6 text-gray-300">
{`project.lsvz
├─ manifest.json          canonical SessionState
├─ job123.raw             original RAW file
├─ parcel_a.pdf           original deed
├─ C-101.pdf              original plan sheet
├─ topo.dxf               original DXF
└─ photo_01.jpg           original site photo`}
                </pre>
              </div>
              <div className="space-y-3 text-[13px] leading-6 text-gray-400">
                <p><strong className="text-gray-200">manifest.json is reserved.</strong> It is written first and never overwritten by a payload file. A duplicate data filename is uniquified rather than clobbering an earlier entry.</p>
                <p><strong className="text-gray-200">Source files stay as files.</strong> RAW, PDF, DXF, image, and generated artifacts are written as sibling ZIP entries. Base64 is used only when the manifest itself carries a payload, such as a keyframe or raster underlay.</p>
                <p><strong className="text-gray-200">DEFLATE, no proprietary codec.</strong> The archive uses standard ZIP DEFLATE and the LandSurv MIME type only as a hint; any ZIP reader can inspect the directory.</p>
              </div>
            </div>
          </section>

          <section id="lsvz-manifest" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="04" title="Manifest schema" kicker={`${fieldCount} documented top-level fields across ${LSVZ_SCHEMA.length} groups. Generated from the live schema and checked against SessionState.`} />
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Filter fields, groups, or descriptions…"
                  className="w-full rounded-lg border border-white/[0.1] bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-gray-100 placeholder-gray-500 outline-none transition focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30"
                  aria-label="Filter .lsvz manifest fields"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-gray-500">{query ? `${visibleFieldCount} matching fields` : `${fieldCount} fields`}</span>
                <button type="button" onClick={() => setOpenGroups(new Set(LSVZ_SCHEMA.map(group => group.id)))} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-gray-400 transition-colors hover:border-cyan-400/30 hover:text-cyan-200">Expand all</button>
                <button type="button" onClick={() => setOpenGroups(new Set())} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-gray-400 transition-colors hover:border-cyan-400/30 hover:text-cyan-200">Collapse all</button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredGroups.map((group, index) => {
                const isOpen = query.trim() ? true : openGroups.has(group.id);
                return (
                  <div key={group.id} className="overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950/40">
                    <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]" aria-expanded={isOpen}>
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 font-mono text-[9px] text-cyan-500">{String(index + 1).padStart(2, '0')}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-100">{group.title}</h3>
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-gray-500">{group.fields.length} fields</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-5 text-gray-500">{group.description}</p>
                        </div>
                      </div>
                      <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/[0.06]">
                        {group.fields.map(field => (
                          <div key={String(field.key)} className="grid gap-1.5 border-b border-white/[0.04] px-4 py-3 last:border-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
                            <code className="break-all font-mono text-[11px] font-semibold text-cyan-300">{String(field.key)}</code>
                            <div className="min-w-0">
                              <p className="text-[12px] leading-5 text-gray-300">{field.description}</p>
                              <code className="mt-1 block truncate font-mono text-[10px] text-gray-500" title={field.example}>{field.example}</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredGroups.length === 0 && (
                <div className="rounded-lg border border-white/[0.08] bg-slate-950/40 px-4 py-6 text-sm text-gray-400">
                  No fields match <span className="font-mono text-cyan-300">{query}</span>.
                </div>
              )}
            </div>

            <details className="group mt-4 overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-gray-300">
                <span className="inline-flex items-center gap-2">
                  <FileJson className="h-3.5 w-3.5 text-cyan-400" /> Annotated manifest outline
                  <span className="font-normal text-gray-500">(comments, not valid JSON)</span>
                </span>
                <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="relative border-t border-white/[0.06]">
                <button type="button" onClick={() => copy(exampleManifest, setCopiedExample)} className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-white/[0.1] bg-slate-900/90 px-2 py-1 text-[10px] text-gray-400 transition-colors hover:text-cyan-200">
                  {copiedExample ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedExample ? 'Copied' : 'Copy'}
                </button>
                <pre className="max-h-96 overflow-auto p-4 font-mono text-[10.5px] leading-5 text-gray-400">{exampleManifest}</pre>
              </div>
            </details>
          </section>

          <section id="lsvz-interop" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="05" title="CACP & A2UI" kicker="Protocol state and conversational surfaces are part of the project, not an external service." />
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-emerald-400/20 bg-emerald-950/10 p-5">
                <div className="flex items-center gap-2">
                  <Waypoints className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">CACP v1.3 project memory</h3>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-gray-400">
                  Cross-agent work is persisted where it changes the project: point-number reservations,
                  sourced Knowledge Base facts, description-key mappings, and CACP keyframes. The transient
                  activity log, result cache, and policy counters stay runtime diagnostics rather than
                  becoming part of the archive contract.
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-gray-500">
                  <li><code className="font-mono text-emerald-300">cacpReservations</code> · point blocks owned by an agent</li>
                  <li><code className="font-mono text-emerald-300">knowledgeFacts</code> · sourced, timestamped facts</li>
                  <li><code className="font-mono text-emerald-300">descriptionKeys</code> · VLM-to-CAD code registry</li>
                  <li><code className="font-mono text-emerald-300">keyframeCache</code> · event-linked visual evidence</li>
                </ul>
              </article>
              <article className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-5">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">A2UI conversation surfaces</h3>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-gray-400">
                  A2UI payloads ride inside the per-agent chat histories. A message can carry a typed
                  surface descriptor, its lifecycle status, and relay attribution; the archive restores the
                  conversation and the surface state together. Surfaces are catalog-addressed components —
                  no remote React, HTML, or executable UI is stored.
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-gray-500">
                  <li><code className="font-mono text-cyan-300">*ChatHistory</code> · agent transcript + A2UI payloads</li>
                  <li><code className="font-mono text-cyan-300">relay</code> · specialist-composed body attribution</li>
                  <li><code className="font-mono text-cyan-300">uiState</code> · active agent, model, panel, viewport</li>
                  <li><code className="font-mono text-cyan-300">redlineRuns</code> · review items and decisions</li>
                </ul>
              </article>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/70">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500">CACP message shape · v1.3</span>
                <button type="button" onClick={() => copy(`{"id":"msg_01J...","from":"BOUNDARY_AGENT","to":"POINT_EDITOR","command":"request_next_point_number","data":{"count":6},"metadata":{"traceId":"trace-...","requiresResponse":true},"timestamp":1762891200000}`, setCopiedMessage)} className="inline-flex items-center gap-1 text-[10px] text-gray-500 transition-colors hover:text-cyan-300">
                  {copiedMessage ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedMessage ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-5 text-emerald-200/90">
{`{
  "id": "msg_01J...",
  "from": "BOUNDARY_AGENT",
  "to": "POINT_EDITOR",
  "command": "request_next_point_number",
  "data": { "count": 6 },
  "metadata": {
    "traceId": "trace-...",
    "requiresResponse": true
  },
  "timestamp": 1762891200000
}`}
              </pre>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Read the full protocol at <a href="https://cacp.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">cacp.landsurv.ai</a>.
            </p>
          </section>

          <section id="lsvz-provenance" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="06" title="Provenance" kicker="Why a reopened archive can explain its own numbers." />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3 text-[13px] leading-6 text-gray-400">
                <p>
                  COGO results are computed by deterministic skills, not by an LLM in prose. The inputs,
                  outputs, and resulting project state travel in the archive, so a reviewer can replay the
                  calculation against the same points and bearings.
                </p>
                <p>
                  Knowledge Base entries carry a source URL, extraction context, confidence, and a millisecond
                  timestamp. The source policy is permissive-only; blocked commercial codification hosts never
                  enter the <code className="font-mono text-gray-300">knowledgeFacts</code> array.
                </p>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-slate-950/70 p-4 font-mono text-[10.5px] leading-5 text-gray-400">
{`{
  "category": "zoning.requirements",
  "subject": "Lehi|Utah|R1-10",
  "predicate": "setbackFront",
  "value": 25,
  "units": "ft",
  "source": "https://lehi-ut.gov/...",
  "confidence": 0.95,
  "timestamp": 1762891200000
}`}
              </pre>
            </div>
          </section>

          <section id="lsvz-compatibility" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="07" title="Versioning & compatibility" kicker="How the format evolves without breaking old projects." />
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              {[
                ['Current specification', `v${LSVZ_SPEC_VERSION} · published ${LSVZ_SPEC_RELEASE}`],
                ['Container rule', 'manifest.json is reserved and always root-level'],
                ['Additive changes', 'New optional fields and embedded metadata are backward-compatible'],
                ['Breaking changes', 'New top-level groups or semantic contract changes bump the minor version'],
                ['Legacy loading', 'The app normalizes older manifests before hydrating session state'],
                ['Unknown data', 'Unrecognized keys are preserved or ignored rather than treated as fatal'],
              ].map(([label, value], index) => (
                <div key={label} className={`grid gap-1 px-4 py-3 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-4 ${index === 0 ? '' : 'border-t border-white/[0.05]'}`}>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</span>
                  <span className="text-[13px] leading-6 text-gray-300">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-950/15 px-4 py-3 text-[12px] leading-6 text-amber-100/80">
              <strong className="text-amber-200">v1.3 note.</strong> The manifest adds the Redline run group and the
              parametric road-model record. Legacy <code className="font-mono">roadCorridors</code> entries remain
              readable; new models use the baseline-linked <code className="font-mono">road-model</code> mode.
            </div>
          </section>

          <section id="lsvz-license" className="scroll-mt-6 border-t border-white/[0.08] pt-8">
            <SectionHeading index="08" title="Licensing" kicker="Open specification, explicit attribution." />
            <div className="flex flex-col gap-4 rounded-xl border border-amber-400/20 bg-amber-950/15 p-5 sm:flex-row sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 font-mono text-xs font-bold text-amber-300">CC</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">Creative Commons Attribution 4.0 International</h3>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300">CC BY 4.0</span>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-gray-400">
                  The <code className="font-mono text-amber-200">.lsvz</code> specification is published under
                  CC BY 4.0. You may share and adapt it for any purpose, including commercially, with attribution
                  to LandSurv.ai. The license covers the specification text and schema; the application, agents,
                  and third-party source files retain their own terms.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
                  <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-300 hover:underline">License text <ExternalLink className="h-3 w-3" /></a>
                  <a href="https://github.com/LandSurvAi/landsurv-core" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-300 hover:underline">Reference implementation <ExternalLink className="h-3 w-3" /></a>
                </div>
              </div>
            </div>
            <footer className="mt-6 flex flex-col gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono"><Archive className="h-3 w-3" /> .lsvz specification v{LSVZ_SPEC_VERSION} · {LSVZ_SPEC_RELEASE}</span>
              <span>LandSurv.ai · open format, professional provenance</span>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
};
