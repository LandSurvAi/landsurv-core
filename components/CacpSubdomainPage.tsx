import React, { useEffect, useMemo } from 'react';
import { agentRegistry } from '../services/AgentRegistry';

// CACP protocol version — bump on backwards-incompatible envelope/skill-schema
// changes and update CACP_SPEC_RELEASE to the publication date (ISO 8601).
export const CACP_SPEC_VERSION = '1.2';
export const CACP_SPEC_RELEASE = '2026-08-21';

// ─── Icons ───────────────────────────────────────────────────────────────────

const NetworkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="4"  cy="19" r="2.5" />
    <circle cx="20" cy="19" r="2.5" />
    <line x1="12" y1="7.5" x2="12" y2="12" />
    <line x1="12" y1="12" x2="4"  y2="16.5" />
    <line x1="12" y1="12" x2="20" y2="16.5" />
  </svg>
);

const SkillIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
  </svg>
);

const BroadcastIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    <path d="M12 12h.008v.008H12V12z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12a9 9 0 0118 0" />
    <path d="M6.343 6.343a8 8 0 0111.314 0" />
  </svg>
);

const ShieldCheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const BookOpenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const CpuIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="2" x2="9" y2="4" />
    <line x1="15" y1="2" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="22" />
    <line x1="15" y1="20" x2="15" y2="22" />
    <line x1="2" y1="9" x2="4" y2="9" />
    <line x1="2" y1="15" x2="4" y2="15" />
    <line x1="20" y1="9" x2="22" y2="9" />
    <line x1="20" y1="15" x2="22" y2="15" />
  </svg>
);

const ArrowRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const CCIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1.293-9.707a2 2 0 012.586 0l1.414-1.414a4 4 0 00-5.414 0L7.879 10.293a4 4 0 000 5.414l1.414 1.414a4 4 0 005.414 0l-1.414-1.414a2 2 0 01-2.586 0 2 2 0 010-2.828 2 2 0 010 2.828z" />
  </svg>
);

const LogIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
    <rect x="3" y="4" width="18" height="16" rx="2" />
  </svg>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleBackToApp(onClose?: () => void) {
  if (onClose) { onClose(); return; }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (hostname !== 'localhost' && parts.length > 2) {
      const rootDomain = parts.slice(1).join('.');
      window.location.href = `${window.location.protocol}//${rootDomain}/`;
    } else {
      window.history.back();
    }
  }
}

// ─── Ask-Peer snippet ─────────────────────────────────────────────────────────

const ASK_PEER_EXAMPLE = `// An AI agent emits this JSON fragment inside its response text.
// The app intercepts it, routes it via CACP, and feeds the result
// back to the calling agent before it finishes its reply to the user.

{
  "askPeer": {
    "skillId": "request_next_point_number",
    "payload": { "count": 6 },
    "reason": "Need 6 sequential point numbers for boundary corners"
  }
}

// ── The same pattern for an action skill ──────────────────────────────────
{
  "askPeer": {
    "skillId": "remove_points",
    "payload": { "pointNumbers": ["12", "13", "14"], "reason": "duplicate" },
    "reason": "User asked to delete duplicates"
  }
}

// ── Group drafted points into per-tract lists ─────────────────────────────
{
  "askPeer": {
    "skillId": "update_point_list",
    "payload": {
      "listId":         "boundary-bf123",
      "listName":       "TRACT No. 2",
      "points":         [/* SurveyPoint[] */],
      "removePointIds": ["7","8","9"],
      "replacePoints":  true
    },
    "reason": "Re-draft of TRACT 2 — replace prior points"
  }
}

// ── Dispatch via the LSVZ Orchestrator hub ────────────────────────────────
{
  "askPeer": {
    "skillId": "lsvz_dispatch",
    "payload": {
      "skillId": "fetch_flood_zones",
      "payload": { "mode": "inclusion" }
    },
    "reason": "Pull FEMA flood layer for boundary area"
  }
}`;

// ─── AgentMessage type snippet ────────────────────────────────────────────────

const AGENT_MSG_SCHEMA = `// services/InterAgentCommunication.ts — transport envelope
interface AgentMessage {
  id:        string;           // UUID
  from:      AgentType;        // sending agent
  to:        AgentType | 'broadcast';
  command:   string;           // matches SkillSchema.id
  data:      Record<string, unknown>;  // typed per skill's inputs
  timestamp: number;           // epoch ms
  metadata?: {
    context?:          string;
    requiresResponse?: boolean;
    traceId?:          string;    // chain-aware correlation id
    parentMessageId?:  string;    // optional parent link
  };
}

interface AgentResponse {
  requestId: string;
  from:      AgentType;
  success:   boolean;
  data?:     Record<string, unknown>;  // typed per skill's outputs
  error?:    string;
  timestamp: number;
}`;

// ─── SkillSchema snippet ──────────────────────────────────────────────────────

const SKILL_SCHEMA_SNIPPET = `// services/AgentRegistry.ts — skill declaration
interface SkillSchema {
  id:          string;            // stable command string, never changes
  name:        string;            // short human label
  description: string;            // one-to-two sentence description
  type?:       'action' | 'query'; // action = mutates state; query = returns data
  inputs:      Record<string, SkillFieldSchema>;
  outputs:     Record<string, SkillFieldSchema>;
  examples?:   string[];          // usage hints for AI prompt injection
}

interface SkillFieldSchema {
  type:        'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  required?:   boolean;
  items?:      SkillFieldSchema;  // for arrays
  properties?: Record<string, SkillFieldSchema>; // for objects
  enum?:       Array<string | number>;
  default?:    unknown;
}`;

// ─── AgentManifest snippet ────────────────────────────────────────────────────

const AGENT_MANIFEST_SNIPPET = `// services/AgentRegistry.ts — manifest declaration
interface AgentManifest {
  agent:        AgentType;
  displayName:  string;
  cacpEnabled:  boolean;  // true = UI badge shown + LSVZ orchestrator enabled
  version:      string;   // bump when shape changes
  skills:       SkillSchema[];
}

// Registration — called once at module load:
agentRegistry.register({
  agent:       AgentType.POINT_EDITOR,
  displayName: 'Point Editor',
  cacpEnabled: true,
  version:     '1.0.0',
  skills: [
    {
      id:          'request_next_point_number',
      name:        'Request Next Point Number',
      description: 'Returns the next available PN(s) honoring project labeling settings.',
      inputs:  { count: { type: 'integer', default: 1 } },
      outputs: { numbers: { type: 'array', items: { type: 'string' }, required: true } },
      examples: ['Boundary Agent requests 6 numbers for boundary corners'],
    },
    // … more skills
  ],
});`;

// ─── Component ───────────────────────────────────────────────────────────────

export function CacpSubdomainPage({ onClose }: { onClose?: () => void }) {
  // Live agent registry — all CACP-enabled manifests
  const cacpAgents = useMemo(() => agentRegistry.listCacpEnabled(), []);
  const totalSkills = useMemo(
    () => cacpAgents.reduce((n, m) => n + m.skills.length, 0),
    [cacpAgents],
  );

  // SEO structured data
  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: 'CACP — Cross-Agent Communications Protocol',
        description:
          'The open, declarative inter-agent communications layer used by LandSurv.ai ' +
          'to enable specialized AI survey agents to collaborate autonomously. ' +
          'Licensed under Creative Commons Attribution 4.0 International.',
        url: 'https://cacp.landsurv.ai',
        image: 'https://landsurv.ai/favicon-512.png',
        author:    { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        publisher: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        license:   'https://creativecommons.org/licenses/by/4.0/',
        keywords: 'CACP, multi-agent, AI protocol, survey software, inter-agent communication, open source',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
          { '@type': 'ListItem', position: 2, name: 'CACP Protocol', item: 'https://cacp.landsurv.ai' },
        ],
      },
    ];
    const injected: HTMLScriptElement[] = [];
    schemas.forEach(s => {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(s);
      document.head.appendChild(el);
      injected.push(el);
    });
    return () => injected.forEach(el => el.parentNode?.removeChild(el));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200">

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBackToApp(onClose)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-emerald-400 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to App
            </button>
            <div className="h-4 w-px bg-gray-700" />
            <span className="text-lg font-bold">
              Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Open Protocol
            </span>
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 font-semibold hover:bg-amber-500/20 transition"
            >
              CC BY 4.0
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 pb-12 pt-10 shadow-2xl shadow-cyan-950/20 sm:mt-12 sm:px-10 sm:pt-14">
        <div className="flex flex-col md:flex-row items-start gap-10">
          <div className="flex-1">
            {/* Open-source badge */}
            <div className="flex flex-wrap gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Open Source
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300 font-semibold">
                CACP Spec v{CACP_SPEC_VERSION}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-700/40 border border-gray-600/40 text-sm text-gray-300 font-mono">
                Released {CACP_SPEC_RELEASE}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300 font-semibold">
                Partially implemented
              </span>
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400 font-semibold hover:bg-amber-500/20 transition"
              >
                <CCIcon className="w-4 h-4" />
                Creative Commons Attribution 4.0
              </a>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sm text-sky-400 font-semibold">
                {cacpAgents.length} Agents · {totalSkills} Skills
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
              CACP
              <span className="block text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">
                Cross-Agent Communications Protocol
              </span>
            </h1>
            <p className="text-lg text-gray-300 mb-6 max-w-2xl leading-relaxed">
              The open, declarative inter-agent messaging layer at the core of LandSurv.ai.
              CACP lets specialized AI survey agents delegate tasks to each other autonomously —
              eliminating guesswork, preventing duplicated logic, and keeping every agent within
              its own area of expertise. The current rollout includes the Voice Agent pilot, so
              spoken drafting intent can be classified, proposed, and confirmed through the same
              typed askPeer flow used by the rest of the registry.
            </p>
            <div className="mb-6 rounded-xl border border-amber-600/40 bg-amber-500/8 p-4 text-sm text-amber-100">
              <strong className="font-semibold">Implementation status:</strong> the protocol contract, message routing,
              and the .lsvz + fieldback persistence layer are in place and ready for a DGX Spark class deployment,
              but the full on-site edge inference stack remains partially implemented and awaits additional hardware funding.
            </div>
            <div className="flex flex-wrap gap-4">
              <a
                href="#spec"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition flex items-center gap-2 text-sm"
              >
                Read the Spec
                <ArrowRightIcon className="w-4 h-4" />
              </a>
              <a
                href="#registry"
                className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 font-semibold rounded-lg transition text-sm"
              >
                Agent Registry
              </a>
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/40 text-amber-400 font-semibold rounded-lg transition text-sm flex items-center gap-2"
              >
                <CCIcon className="w-4 h-4" />
                CC BY 4.0 License
              </a>
            </div>
          </div>

          {/* Stats box */}
          <div className="w-full md:w-64 bg-gray-900 border border-emerald-800/30 rounded-xl p-5 flex-shrink-0">
            <div className="text-xs uppercase tracking-widest text-emerald-500 mb-3 font-semibold">Protocol Stats</div>
            <dl className="space-y-3">
              {[
                { label: 'CACP-Enabled Agents', value: String(cacpAgents.length) },
                { label: 'Total Registered Skills', value: String(totalSkills) },
                { label: 'Transport', value: 'Typed Pub/Sub' },
                { label: 'Activity Log', value: '500-entry ring' },
                { label: 'KB Persistence', value: 'Session-scoped' },
                { label: 'License', value: 'CC BY 4.0' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-2">
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-xs text-emerald-300 font-mono font-semibold text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── What is CACP ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">What is CACP?</h2>
        <p className="text-gray-400 mb-8 max-w-3xl">
          LandSurv.ai is composed of a fleet of specialized AI agents — each an expert in one domain
          (boundary parsing, GPS stakeout, COGO math, CAD standards, flood hazards, soils, zoning…).
          CACP is the protocol that lets these agents collaborate without being hard-wired together.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: NetworkIcon,
              title: 'Declarative Agent Registry',
              body: 'Every agent self-describes its capabilities via a typed AgentManifest. The registry is the single source of truth for who can do what — no hard-coded routing tables.',
            },
            {
              icon: SkillIcon,
              title: 'Typed Skill Catalog',
              body: 'Each capability is a SkillSchema with a stable id, typed inputs/outputs (JSON-Schema style), and optional usage examples. Any agent can query the registry to discover peer skills at runtime.',
            },
            {
              icon: BroadcastIcon,
              title: 'The askPeer Pattern',
              body: 'An LLM-powered agent signals a peer delegation by emitting a JSON fragment in its response. The app intercepts it, routes the message, and feeds the result back before the user sees a reply.',
            },
            {
              icon: CpuIcon,
              title: 'LSVZ Orchestrator Hub',
              body: 'A special hub agent owns lsvz_dispatch (route by skillId to any agent) and kb_query / kb_record (the Project Knowledge Base — structured facts shared across agents in a session).',
            },
            {
              icon: BroadcastIcon,
              title: 'Voice Agent Pilot',
              body: 'The Voice Agent listens to browser speech input, proposes active drawing layers, and surfaces executable askPeer tasks for buildings, roads, utilities, boundaries, and topo workflows without mutating state until the user confirms.',
            },
            {
              icon: NetworkIcon,
              title: 'Homepage Capability Badge',
              body: 'CACP-capable agent cards on the homepage now use a compact badge: green status dot + opposing-arrows glyph. It keeps the manifest click target while reducing card chrome and preserving tooltip accessibility.',
            },
            {
              icon: LogIcon,
              title: 'Activity Log & Caching',
              body: 'Every message phase (send, handler, response, error, no-handler) is logged to a 500-entry ring buffer persisted in localStorage with traceId and policy outcome metadata. Results are cached to avoid redundant peer calls.',
            },
            {
              icon: ShieldCheckIcon,
              title: 'Policy-Gated Delegation',
              body: 'Agents are instructed: if another agent owns the knowledge, you MUST delegate via askPeer — do NOT guess, do NOT refuse, and do NOT make up numbers. Runtime policy checks validate ownership, payload shape, and rate behavior in soft mode first, then can be promoted to hard block mode.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5">
              <Icon className="w-8 h-8 text-emerald-400 mb-3" />
              <h3 className="font-semibold text-white mb-2 text-sm">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────────────────────── */}
      <section id="spec" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">How it Works</h2>
        <p className="text-gray-400 mb-8 max-w-3xl">
          A complete CACP message flow from user intent to coordinated agent response.
        </p>

        {/* Flow steps */}
        <ol className="relative border-l border-emerald-700/40 space-y-8 ml-4">
          {[
            {
              n: '1',
              title: 'User intent reaches an AI agent',
              body: 'The user types a message. The app routes it to the active AI agent (e.g. Boundary Agent) which receives the request along with its CACP peer manifest — a compact description of every skill exposed by other agents.',
            },
            {
              n: '2',
              title: 'Agent recognises a delegation opportunity',
              body: 'The agent\'s system prompt instructs it: "If you need data owned by another agent, emit an askPeer JSON object." For example, a boundary agent about to place 6 corners knows it needs 6 point numbers from the Point Editor.',
            },
            {
              n: '3',
              title: 'askPeer JSON emitted in the LLM response',
              body: 'The model writes a structured JSON fragment: { "askPeer": { "skillId": "request_next_point_number", "payload": { "count": 6 }, "reason": "…" } }. The app detects this pattern before rendering the message.',
            },
            {
              n: '4',
              title: 'Registry lookup, policy check & dispatch',
              body: 'The app calls agentRegistry.findOwnerOfSkill("request_next_point_number"), gets AgentType.POINT_EDITOR, then runs CACP policy checks (ownership, payload schema, and per-command rate guard). In soft mode, warnings are logged and dispatch continues; in hard mode, invalid traffic is blocked. Valid messages dispatch via interAgentComm.request() (or interAgentComm.askPeer()).',
            },
            {
              n: '5',
              title: 'Peer agent executes the skill & responds',
              body: 'The Point Editor increments its counter, reserves the block, and returns { success: true, data: { numbers: ["101","102","103","104","105","106"] } } as an AgentResponse.',
            },
            {
              n: '6',
              title: 'Response injected into the calling agent',
              body: 'The app injects the response into the next LLM turn (or feeds it back into the current one). The Boundary Agent now uses the real point numbers when placing the boundary corners — no guessing.',
            },
            {
              n: '7',
              title: 'Activity logged, result cached',
              body: 'Every step is written to the CacpLogEntry ring buffer with traceId, policyStatus, and warning details when present. Results are cached by (skillId, payload-signature) with a TTL (default 10 minutes), so identical calls inside the window skip round-trips. The DevOps Console exposes filtering and expanded payload inspection.',
            },
          ].map(({ n, title, body }) => (
            <li key={n} className="ml-6">
              <span className="absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-700 border-2 border-gray-950 text-xs font-bold text-white">
                {n}
              </span>
              <h3 className="font-semibold text-emerald-300 mb-1">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── askPeer Protocol Reference ─────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">The <code className="text-emerald-400 font-mono text-xl">askPeer</code> Protocol</h2>
        <p className="text-gray-400 mb-6 max-w-3xl">
          Any CACP-enabled agent can emit this JSON fragment anywhere in its LLM response text to
          delegate to a peer. The app parses it before presenting output to the user.
        </p>
        <div className="bg-gray-950 border border-emerald-800/40 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-900/20 border-b border-emerald-800/30">
            <span className="text-xs font-mono text-emerald-400">askPeer JSON shape</span>
            <span className="text-xs text-gray-500">TypeScript / JSON</span>
          </div>
          <pre className="p-5 overflow-x-auto text-sm">
            <code className="text-emerald-300 font-mono leading-relaxed whitespace-pre">{ASK_PEER_EXAMPLE}</code>
          </pre>
        </div>

        {/* action vs query table */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5">
            <div className="text-xs uppercase tracking-widest text-sky-400 mb-2 font-semibold">type: 'query'</div>
            <h3 className="font-semibold text-white mb-2">Data retrieval</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              The peer reads/computes and returns structured data. The calling agent uses the returned
              values to complete its task. <strong className="text-gray-300">After receiving a query response, do NOT
              call askPeer again.</strong>
            </p>
            <div className="mt-3 font-mono text-xs text-sky-300 bg-gray-950/60 rounded p-2">
              request_next_point_number, cogo_inverse, kb_query, gps_get_current_position, …
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5">
            <div className="text-xs uppercase tracking-widest text-rose-400 mb-2 font-semibold">type: 'action'</div>
            <h3 className="font-semibold text-white mb-2">State mutation</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              The peer mutates app state (inserts, updates, removes). After the peer responds the calling
              agent <strong className="text-gray-300">only confirms the outcome</strong> to the user
              and must NOT call askPeer again.
            </p>
            <div className="mt-3 font-mono text-xs text-rose-300 bg-gray-950/60 rounded p-2">
              remove_points, cad_create_layer, kb_record, gps_set_target_point, …
            </div>
          </div>
        </div>
      </section>

      {/* ── Schema Reference ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-6">Schema Reference</h2>
        <div className="space-y-6">
          {/* AgentManifest */}
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <BookOpenIcon className="w-5 h-5" />
              AgentManifest &amp; Registration
            </h3>
            <div className="bg-gray-950 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                <span className="text-xs font-mono text-gray-400">services/AgentRegistry.ts</span>
              </div>
              <pre className="p-5 overflow-x-auto text-sm">
                <code className="text-emerald-300 font-mono leading-relaxed whitespace-pre">{AGENT_MANIFEST_SNIPPET}</code>
              </pre>
            </div>
          </div>

          {/* SkillSchema */}
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <SkillIcon className="w-5 h-5" />
              SkillSchema &amp; SkillFieldSchema
            </h3>
            <div className="bg-gray-950 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                <span className="text-xs font-mono text-gray-400">services/AgentRegistry.ts</span>
              </div>
              <pre className="p-5 overflow-x-auto text-sm">
                <code className="text-emerald-300 font-mono leading-relaxed whitespace-pre">{SKILL_SCHEMA_SNIPPET}</code>
              </pre>
            </div>
          </div>

          {/* Transport */}
          <div>
            <h3 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <BroadcastIcon className="w-5 h-5" />
              Transport Envelope (AgentMessage / AgentResponse)
            </h3>
            <div className="bg-gray-950 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                <span className="text-xs font-mono text-gray-400">services/InterAgentCommunication.ts</span>
              </div>
              <pre className="p-5 overflow-x-auto text-sm">
                <code className="text-emerald-300 font-mono leading-relaxed whitespace-pre">{AGENT_MSG_SCHEMA}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── What's New: COGO Skill Expansion ───────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">What's new</span>
          <h2 className="text-2xl font-bold text-white">COGO Skill Expansion</h2>
        </div>
        <p className="text-gray-400 mb-6 max-w-3xl text-sm">
          The COGO Agent's CACP surface area has been overhauled. The new <code className="text-emerald-400 font-mono">utils/cogoLib/</code> module
          (clean-room, MIT-compatible) backs <strong className="text-gray-200">30+ deterministic skills</strong> covering forward/inverse,
          intersections, horizontal &amp; vertical curves, spirals, traverse adjustment (Compass / Transit / Crandall),
          area &amp; parcel subdivision, parallel offsets, best-fit (line / circle), 2D transforms (Helmert similarity / affine),
          and WGS-84 geodetic computations (Vincenty inverse &amp; direct). All skills are listed in the Live Agent Registry below.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">forward / inverse</div>
            <div className="text-gray-300">cogo_inverse · cogo_direct · cogo_format_bearing · cogo_parse_bearing</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">intersections</div>
            <div className="text-gray-300">cogo_intersect_bb / bd / dd / ll · cogo_circle_through_3 · cogo_perpendicular_foot</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">curves &amp; spirals</div>
            <div className="text-gray-300">cogo_curve_solve · cogo_curve_stations · cogo_spiral_xy · cogo_vcurve_elev_at · cogo_vcurve_summary</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">traverse</div>
            <div className="text-gray-300">cogo_traverse_compute · cogo_traverse_adjust (Compass / Transit / Crandall)</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">area &amp; parcels</div>
            <div className="text-gray-300">cogo_area_polygon · cogo_area_from_pns · cogo_minimum_bounding_rect · cogo_subdivide_swing · cogo_subdivide_parallel · cogo_offset_polyline</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">best-fit &amp; transforms</div>
            <div className="text-gray-300">cogo_bestfit_line · cogo_bestfit_circle · cogo_helmert2d · cogo_affine2d</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">geodetic (WGS-84)</div>
            <div className="text-gray-300">cogo_geodesic_inverse · cogo_geodesic_direct · cogo_units_convert</div>
          </div>
          <div className="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
            <div className="text-emerald-400 font-mono text-xs mb-1">site &amp; QA</div>
            <div className="text-gray-300">cogo_shrinkwrap · points_sanity_check · cogo_selftest (8-fixture regression)</div>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-500 max-w-3xl">
          Coverage: 43-fixture vitest suite at <code className="text-emerald-400 font-mono">tests/cogoLib.test.ts</code>.
          All formulae from public-domain or permissively-licensed sources (Wolf &amp; Ghilani, Vincenty 1975, Bourke,
          Andrew 1979 monotone-chain, Kåsa). No GPL / copyleft inheritance.
        </p>
      </section>

      {/* ── Live Agent Registry ────────────────────────────────────────────── */}
      <section id="registry" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">
          Live Agent Registry
          <span className="ml-3 text-sm font-normal text-emerald-400 font-mono">
            {cacpAgents.length} agents · {totalSkills} skills
          </span>
        </h2>
        <p className="text-gray-400 mb-6 max-w-3xl text-sm">
          All CACP-enabled agents currently registered in this build. Skill IDs are the stable
          <code className="mx-1 text-emerald-400 font-mono">command</code> strings used in
          <code className="ml-1 text-emerald-400 font-mono">askPeer.skillId</code>.
        </p>
        <div className="space-y-4">
          {cacpAgents.map(manifest => (
            <details
              key={manifest.agent}
              className="group bg-gray-900/50 border border-gray-700/60 rounded-xl overflow-hidden"
            >
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none hover:bg-emerald-900/10 transition">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="font-semibold text-white">{manifest.displayName}</span>
                  <span className="text-xs font-mono text-gray-500">{manifest.agent}</span>
                  <span className="hidden sm:inline text-xs font-mono text-gray-600">v{manifest.version}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-emerald-400 font-mono">
                    {manifest.skills.length} skill{manifest.skills.length !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className="w-4 h-4 text-gray-500 group-open:rotate-90 transition-transform"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </summary>
              <div className="border-t border-gray-700/60 divide-y divide-gray-800">
                {manifest.skills.map(skill => (
                  <div key={skill.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-1.5">
                      <div>
                        <span className="font-mono text-emerald-300 text-sm">{skill.id}</span>
                        {skill.type && (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${
                            skill.type === 'action'
                              ? 'bg-rose-900/40 text-rose-400 border border-rose-700/30'
                              : 'bg-sky-900/40 text-sky-400 border border-sky-700/30'
                          }`}>
                            {skill.type}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-300 font-semibold">{skill.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-2">{skill.description}</p>
                    <div className="grid sm:grid-cols-2 gap-3 mt-2">
                      {/* Inputs */}
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Inputs</div>
                        {Object.keys(skill.inputs).length === 0 ? (
                          <span className="text-xs text-gray-600 italic">none</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {Object.entries(skill.inputs).map(([k, f]) => (
                              <li key={k} className="text-xs">
                                <span className="font-mono text-emerald-400">{k}</span>
                                <span className="text-gray-500">: </span>
                                <span className="text-gray-400">{f.type}</span>
                                {f.required && <span className="text-rose-400 ml-1">*</span>}
                                {f.description && (
                                  <span className="text-gray-500 ml-1">— {f.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {/* Outputs */}
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Outputs</div>
                        {Object.keys(skill.outputs).length === 0 ? (
                          <span className="text-xs text-gray-600 italic">none</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {Object.entries(skill.outputs).map(([k, f]) => (
                              <li key={k} className="text-xs">
                                <span className="font-mono text-emerald-400">{k}</span>
                                <span className="text-gray-500">: </span>
                                <span className="text-gray-400">{f.type}</span>
                                {f.required && <span className="text-rose-400 ml-1">*</span>}
                                {f.description && (
                                  <span className="text-gray-500 ml-1">— {f.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    {skill.examples && skill.examples.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Examples</div>
                        <ul className="space-y-0.5">
                          {skill.examples.map((ex, i) => (
                            <li key={i} className="text-xs text-gray-500 pl-3 border-l border-emerald-800/40">
                              {ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ── Project Knowledge Base ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">Project Knowledge Base</h2>
        <p className="text-gray-400 mb-6 max-w-3xl text-sm">
          The LSVZ Orchestrator hub agent maintains a session-scoped Knowledge Base (KB) —
          a structured store of facts that agents discover and share during a session.
          Any CACP-enabled agent can write facts via <code className="text-emerald-400 font-mono">kb_record</code> and
          query them via <code className="text-emerald-400 font-mono">kb_query</code>.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              category: 'deed.row',
              example: 'subject: "Main Street", predicate: "width", value: "33 ft"',
              label: 'Right-of-Way widths from deeds',
            },
            {
              category: 'zoning.requirements',
              example: 'predicate: "setbackFront", value: 25, units: "ft" — plus setbackSide/Rear, maxHeight, minLotArea, lotCoverage, permittedUses[], sources[]',
              label: 'Setbacks & dimensional standards from live zoning research (auto-pinned by Zoning Agent from permissive sources only — v1.2)',
            },
            {
              category: 'deed.metadata',
              example: 'subject: "Lot A", predicate: "area", value: "1.24 ac"',
              label: 'Parcel area and call metadata',
            },
            {
              category: 'parcel.gis',
              example: 'subject: "parcel-001", predicate: "owner", value: "Smith, J."',
              label: 'GIS-sourced parcel attributes',
            },
            {
              category: 'soils',
              example: 'subject: "HgB", predicate: "hydgrpdcd", value: "B"',
              label: 'SSURGO hydrologic group codes',
            },
            {
              category: 'structures',
              example: 'subject: "nsi-007", predicate: "sqft", value: "2400"',
              label: 'FEMA NSI building attributes',
            },
          ].map(({ category, example, label }) => (
            <div key={category} className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-4">
              <div className="font-mono text-xs text-emerald-400 mb-1">{category}</div>
              <div className="text-sm font-semibold text-white mb-1">{label}</div>
              <div className="font-mono text-xs text-gray-500 bg-gray-950/60 rounded p-2">{example}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          KB facts are session-scoped: they're saved inside the <a href="https://lsvz.landsurv.ai" className="text-emerald-400 hover:underline">.lsvz archive</a> so they
          survive a Save/Load cycle but are not shared between unrelated sessions.
          Agents consult the KB <em>before</em> calling peers — the answer may already be there.
        </p>
      </section>

      {/* ── Authoritative Source Provenance & TOS Blocklist ─────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold text-white">Authoritative Source Provenance</h2>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-xs text-amber-300 font-mono">v1.2 · PERMISSIVE-ONLY</span>
        </div>
        <p className="text-gray-400 mb-6 max-w-3xl text-sm">
          Some KB categories — most notably <code className="text-emerald-400 font-mono">zoning.requirements</code> — are populated from
          live web sources. To keep CACP-pinned facts defensible in a legal/contractual context, the host application restricts the
          retrieval layer to <strong className="text-white">permissive sources only</strong>: hosts whose terms of use either explicitly
          allow automated retrieval, or whose content sits in the public domain on platforms that don't contractually restrict access.
          Commercial codification platforms whose TOS prohibits automation are <strong className="text-amber-300">hard-blocked</strong> at
          the client layer — the host application makes no automated request to them, regardless of what an agent attempts.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900/50 border border-amber-700/40 rounded-xl p-5">
            <ShieldCheckIcon className="w-7 h-7 text-amber-300 mb-3" />
            <h3 className="font-semibold text-white mb-2">TOS blocklist (hard)</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              Hosts on the blocklist below are short-circuited before any network call. The agent receives an explicit{' '}
              <code className="text-amber-300 font-mono">[BLOCKED — TOS-RESTRICTED HOST]</code> tool result with pivot instructions, and a
              passive toast notifies the human user of the attempt. The user can always open the URL in their own browser — that
              request leaves their machine under their own session and TOS, not the app's automation.
            </p>
            <div className="font-mono text-xs text-amber-200/80 bg-gray-950/60 rounded p-2 leading-relaxed">
              ecode360.com, municode.com, qcode.us, library.qcode.us, generalcode.com, codepublishing.com, amlegal.com, codelibrary.amlegal.com, sterlingcodifiers.com, lf-pubs.com
            </div>
          </div>

          <div className="bg-gray-900/50 border border-emerald-700/40 rounded-xl p-5">
            <BookOpenIcon className="w-7 h-7 text-emerald-300 mb-3" />
            <h3 className="font-semibold text-white mb-2">Permissive-source preference order</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              When a research agent (e.g. the Zoning Agent answering <code className="text-emerald-300 font-mono">get_zoning_requirements</code>)
              picks a URL, it walks this preference order. The first permissive source that yields the needed fact wins; the agent never
              attempts a blocklisted host.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-300 space-y-0.5 ml-2">
              <li>The municipality's own <code className="text-emerald-300 font-mono">.gov</code> site</li>
              <li>Zoneomics</li>
              <li>County GIS / planning-department portals</li>
              <li>State planning office PDFs and public ordinance archives</li>
              <li>Grounded Google Search snippets (confirmation, not primary source)</li>
            </ol>
          </div>
        </div>

        <div className="mt-6 bg-gradient-to-br from-emerald-900/15 to-emerald-950/20 border border-emerald-700/40 rounded-xl p-5">
          <h3 className="font-semibold text-white mb-2">Cross-agent reuse path</h3>
          <p className="text-sm text-gray-400 leading-relaxed mb-3">
            Once a zoning research turn completes — whether triggered by inter-agent CACP (a Boundary or Civil Drafter agent calling
            <code className="text-emerald-300 font-mono mx-1">get_zoning_requirements</code>) or by direct user chat with the Zoning Agent — the
            structured JSON in the answer is parsed and pinned twice:
          </p>
          <ol className="text-sm text-gray-400 leading-relaxed space-y-1 list-decimal list-inside">
            <li><code className="text-emerald-300 font-mono">interAgentComm.cacheResult('get_zoning_requirements', payload, response)</code> — CACP cache, keyed by <code className="font-mono">(state, county, municipality, district)</code></li>
            <li><code className="text-emerald-300 font-mono">extractZoningFacts()</code> → multiple <code className="font-mono">kb_record</code> calls under the <code className="font-mono">zoning.requirements</code> category, with the source URL preserved in the <code className="font-mono">source</code> field</li>
          </ol>
          <p className="text-sm text-gray-400 leading-relaxed mt-3">
            Every cached fact and KB entry therefore carries a permissive-source URL — there are no opaque or attestation-only
            citations in the protocol. Downstream agents read the cached response immediately, without re-fetching.
          </p>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Legal background and case-law references are summarised in the in-app <em>"How LandSurv sources external data"</em> modal
          (open it from any blocked-source toast, from the Claw status badge, or in the JS console via
          <code className="text-emerald-300 font-mono mx-1">window.__landsurvLegal.open()</code>). This is engineering policy, not legal
          advice; production use in regulated contexts should be reviewed by counsel.
        </div>
      </section>

      {/* ── Activity Log & Caching ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-6">Activity Log &amp; Result Cache</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900/50 border border-gray-700/60 rounded-xl p-5">
            <LogIcon className="w-7 h-7 text-emerald-400 mb-3" />
            <h3 className="font-semibold text-white mb-2">CacpLogEntry ring buffer</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              Every message phase is appended to a 500-entry ring buffer persisted in
              <code className="mx-1 text-emerald-300 font-mono">localStorage</code> under
              <code className="ml-1 text-emerald-300 font-mono">landsurv-cacp-log</code>.
            </p>
            <table className="w-full text-xs text-gray-400 border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-1 text-gray-500 font-semibold">Phase</th>
                  <th className="text-left py-1 text-gray-500 font-semibold">Fired when</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[
                  ['send', 'Message dispatched to peer'],
                  ['handler', 'Peer handler invoked'],
                  ['response', 'Peer returned a result (success)'],
                  ['error', 'Peer threw or returned success:false'],
                  ['no-handler', 'No registered handler for the command'],
                ].map(([phase, desc]) => (
                  <tr key={phase}>
                    <td className="py-1 font-mono text-emerald-300">{phase}</td>
                    <td className="py-1 text-gray-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-900/50 border border-gray-700/60 rounded-xl p-5">
            <CpuIcon className="w-7 h-7 text-emerald-400 mb-3" />
            <h3 className="font-semibold text-white mb-2">CacpCachedResult</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              Query-skill responses are cached by a signature derived from
              <code className="mx-1 text-emerald-300 font-mono">(skillId, payload)</code> with a
              TTL (default 10 minutes). Subsequent identical calls inside the window return the
              cached value immediately — no round-trip, no repeated LLM context injection.
            </p>
            <div className="font-mono text-xs text-emerald-300 bg-gray-950/60 rounded p-3 leading-relaxed">
              {'interface CacpCachedResult {\n'}
              {'  skillId:   string;\n'}
              {'  cacheKey:  string;   // skillId + payload signature\n'}
              {'  payload:   Record<string, unknown>;\n'}
              {'  data:      Record<string, unknown>;  // response data\n'}
              {'  from:      AgentType; // agent that produced the data\n'}
              {'  cachedAt:  number;   // epoch ms\n'}
              {'  expiresAt: number;   // epoch ms (TTL expiry)\n'}
              {'}'}
            </div>
          </div>
        </div>
      </section>

      {/* ── Implementing CACP ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-6">Implementing CACP in Your Agent</h2>
        <ol className="space-y-6">
          {[
            {
              n: '1',
              title: 'Define your AgentManifest',
              body: 'Call agentRegistry.register({ agent, displayName, cacpEnabled: true, version, skills }) once at module load. Each skill needs a stable id, typed inputs/outputs, and a description.',
              code: `agentRegistry.register({\n  agent:        AgentType.MY_AGENT,\n  displayName:  'My Agent',\n  cacpEnabled:  true,\n  version:      '1.0.0',\n  skills: [ { id: 'my_skill', name: '...', description: '...', inputs: {}, outputs: {} } ],\n});`,
            },
            {
              n: '2',
              title: 'Register a message handler',
              body: 'Call interAgentComm.onCommand(commandId, handler) once per skill in your component or service. The handler receives an AgentMessage and returns a Promise<AgentResponse | void>; onCommand returns an unsubscribe function for cleanup.',
              code: `const unsubscribe = interAgentComm.onCommand('my_skill', async (msg) => {\n  return { requestId: msg.id, from: AgentType.MY_AGENT,\n           success: true, data: { result: '...' }, timestamp: Date.now() };\n});\n// call unsubscribe() on teardown`,
            },
            {
              n: '3',
              title: 'Include the peer manifest in the system prompt',
              body: 'Call buildPeerManifestText(agentType) from geminiService.ts and append it to the agent\'s system prompt so the LLM knows which peers it can call and via which skill IDs.',
              code: `// In geminiService.ts getSystemPrompt(agentType):\nconst peerManifest = buildPeerManifestText(agentType);\nreturn \`\${basePrompt}\\n\\n\${peerManifest}\`;`,
            },
            {
              n: '4',
              title: 'Handle askPeer in the chat interceptor',
              body: 'The main app (App.tsx) already parses askPeer JSON from any agent response. Your agent just needs to emit the correct JSON fragment; the framework handles dispatch, response injection, and logging.',
              code: `// Agent LLM response (no code needed on your side — just emit the JSON):\n{ "askPeer": { "skillId": "request_next_point_number",\n               "payload": { "count": 4 },\n               "reason": "Need 4 PNs for the corners" } }`,
            },
          ].map(({ n, title, body, code }) => (
            <li key={n} className="bg-gray-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-gray-800/40 border-b border-gray-700/40">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-xs font-bold text-white">{n}</span>
                <h3 className="font-semibold text-white text-sm">{title}</h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-400 mb-3 leading-relaxed">{body}</p>
                <pre className="bg-gray-950 rounded-lg p-3 overflow-x-auto text-xs font-mono text-emerald-300 leading-relaxed whitespace-pre">{code}</pre>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Open Source / License ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <div className="bg-gradient-to-br from-amber-900/20 to-amber-950/20 border border-amber-700/30 rounded-2xl p-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <CCIcon className="w-14 h-14 text-amber-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-2xl font-bold text-white">Open Source — CC BY 4.0</h2>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-semibold">
                  Open Protocol
                </span>
              </div>
              <p className="text-gray-300 leading-relaxed mb-4">
                The CACP specification — including the AgentManifest schema, SkillSchema type system,
                the <code className="text-amber-300 font-mono mx-1">askPeer</code> message pattern, the transport
                envelope, and the Project Knowledge Base design — is published under the
                <strong className="text-white"> Creative Commons Attribution 4.0 International</strong> license.
              </p>
              <p className="text-gray-400 text-sm leading-relaxed mb-5">
                You are free to <strong className="text-gray-200">share</strong> (copy and redistribute in any medium or format)
                and <strong className="text-gray-200">adapt</strong> (remix, transform, and build upon) the spec
                for any purpose, including commercially, as long as you give appropriate credit to
                <strong className="text-gray-200"> LandSurv.ai</strong> as the originating project.
                No additional restrictions may be applied.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 text-amber-300 rounded-lg text-sm font-semibold transition"
                >
                  <CCIcon className="w-4 h-4" />
                  View CC BY 4.0 License
                </a>
                <a
                  href="https://lsvz.landsurv.ai"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-600/30 text-cyan-400 rounded-lg text-sm font-semibold transition"
                >
                  .lsvz Format Spec (also CC BY 4.0)
                </a>
                <a
                  href="https://landsurv.ai"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 text-gray-300 rounded-lg text-sm font-semibold transition"
                >
                  LandSurv.ai App
                  <ArrowRightIcon className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Related Specs ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-800">
        <h2 className="text-xl font-bold text-white mb-4">Related Open Specifications</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <a
            href="https://lsvz.landsurv.ai"
            className="group flex items-start gap-4 p-5 bg-gray-900/50 border border-gray-700/60 rounded-xl hover:border-cyan-600/40 transition"
          >
            <div className="w-10 h-10 rounded-full bg-cyan-900/40 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-cyan-400 text-sm">.lsvz</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white group-hover:text-cyan-400 transition">LandSurvAI Zipped Format</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/30 text-amber-400 font-semibold">CC BY 4.0</span>
              </div>
              <p className="text-sm text-gray-400">
                The AI-native survey project archive format. CACP session state (activity log, KB facts,
                manifest state) is saved inside every .lsvz file.
              </p>
              <span className="text-xs text-cyan-500 mt-1 inline-block">lsvz.landsurv.ai →</span>
            </div>
          </a>
          <a
            href="https://agents.landsurv.ai"
            className="group flex items-start gap-4 p-5 bg-gray-900/50 border border-gray-700/60 rounded-xl hover:border-emerald-600/40 transition"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
              <NetworkIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-semibold text-white group-hover:text-emerald-400 transition mb-1">
                LandSurv.ai Agent Directory
              </div>
              <p className="text-sm text-gray-400">
                Full catalog of all agents in the platform — their purpose, capabilities, and how
                they each participate in the CACP ecosystem.
              </p>
              <span className="text-xs text-emerald-500 mt-1 inline-block">agents.landsurv.ai →</span>
            </div>
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 bg-gray-950/80 mt-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div>
            &copy; {new Date().getFullYear()} LandSurv.ai — CACP specification published under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
              CC BY 4.0
            </a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://lsvz.landsurv.ai" className="hover:text-gray-300 transition">.lsvz Spec</a>
            <a href="https://agents.landsurv.ai" className="hover:text-gray-300 transition">Agents</a>
            <a href="https://sitemap.landsurv.ai" className="hover:text-gray-300 transition">Sitemap</a>
            <a href="https://landsurv.ai" className="hover:text-gray-300 transition">App</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
