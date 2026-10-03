import React, { useMemo, useState } from 'react';

/**
 * gateway.landsurv.ai — public landing + functional hub for the LandSurv.ai
 * AI Gateway (Claude / ChatGPT / Grok integration layer).
 *
 * Informative: what the gateway is, the Big-3 integrations, access tiers.
 * Functional: a live boundary-closure sandbox that runs the *real* gateway
 * compute tool (anonymous / Partial Access) plus copy-paste onboarding for each
 * AI platform (GPT Actions OpenAPI URL, Claude MCP config, Grok endpoints).
 */

// The gateway API is reached same-origin: the frontend nginx proxies /api/ to
// the in-container backend. Use relative paths for calls, and the page's own
// public origin (e.g. https://gateway.landsurv.ai) for URLs shown to users /
// external assistant builders.
const PUBLIC_ORIGIN: string =
  typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://gateway.landsurv.ai';

function handleBackToApp() {
  if (typeof window !== 'undefined') {
    window.location.href = 'https://landsurv.ai';
  }
}

const DEFAULT_SANDBOX = `{
  "start": { "northing": 5000, "easting": 5000 },
  "calls": [
    { "bearing": "N 90°00'00\\" E", "distance": "208.71" },
    { "bearing": "N 00°00'00\\" E", "distance": "208.71" },
    { "bearing": "S 90°00'00\\" W", "distance": "208.71" },
    { "bearing": "S 00°00'00\\" W", "distance": "208.71" }
  ]
}`;

const PlatformCard: React.FC<{
  name: string;
  tag: string;
  accent: string;
  children: React.ReactNode;
}> = ({ name, tag, accent, children }) => (
  <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-slate-950/55 p-6">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-bold text-white">{name}</h3>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accent}`}>{tag}</span>
    </div>
    <div className="text-sm text-gray-300 space-y-2 flex-1">{children}</div>
  </div>
);

export function GatewaySubdomainPage({ onClose }: { onClose?: () => void }) {
  const [sandboxInput, setSandboxInput] = useState(DEFAULT_SANDBOX);
  const [result, setResult] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>('');

  const mcpConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            landsurv: {
              command: 'node',
              args: ['/absolute/path/to/backend/dist/mcp/server.js'],
            },
          },
        },
        null,
        2,
      ),
    [],
  );

  const runSandbox = async () => {
    setRunning(true);
    setError('');
    setResult('');
    let parsed: any;
    try {
      parsed = JSON.parse(sandboxInput);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      setRunning(false);
      return;
    }
    const tool = parsed.calls ? 'analyze_boundary_closure' : 'analyze_parcel_geometry';
    try {
      const resp = await fetch(`/api/grok/tools/${tool}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: parsed }),
      });
      const data = await resp.json();
      setResult(JSON.stringify(data, null, 2));
      if (!resp.ok) setError(`Server returned ${resp.status}`);
    } catch (e) {
      setError(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const back = () => (onClose ? onClose() : handleBackToApp());

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={back} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-emerald-400 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to App
            </button>
            <div className="h-4 w-px bg-gray-700" />
            <span className="text-lg font-bold">
              Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
              <span className="text-gray-500 font-normal"> / Gateway</span>
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 pb-10 pt-10 shadow-2xl shadow-cyan-950/20 sm:mt-12 sm:px-10 sm:pt-14">
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> AI Gateway
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-700/40 border border-gray-600/40 text-sm text-gray-300">Claude · ChatGPT · Grok</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight max-w-3xl">
          Professional land surveying, inside your favorite AI.
        </h1>
        <p className="mt-5 text-lg text-gray-300 max-w-2xl">
          The LandSurv.ai Gateway exposes real surveying tools — deed &amp; boundary analysis and
          Point Editor staging — to Claude, ChatGPT, and Grok. Ask in plain language; get
          survey-grade math, closure checks, and drafted points back.
        </p>
      </section>

      {/* Live sandbox (functional) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl border border-emerald-400/20 bg-slate-950/55 p-6 shadow-xl shadow-emerald-950/10 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-bold text-white">Try it live — boundary closure</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">No sign-in</span>
          </div>
          <p className="text-gray-400 mb-5 max-w-3xl text-sm">
            This runs the exact same <code className="text-emerald-300 font-mono">analyze_boundary_closure</code> tool the AI
            platforms call. Provide a point of beginning and metes-and-bounds calls (a{' '}
            <code className="text-emerald-300 font-mono">calls</code> array), or a{' '}
            <code className="text-emerald-300 font-mono">vertices</code> array for area/perimeter. Bearings are DMS quadrant
            strings; distances are feet.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Input JSON</label>
              <textarea
                value={sandboxInput}
                onChange={(e) => setSandboxInput(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono"
              />
              <button
                onClick={runSandbox}
                disabled={running}
                className="mt-3 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition"
              >
                {running ? 'Computing…' : 'Compute closure'}
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Result</label>
              <pre className="w-full h-[22rem] overflow-auto bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-emerald-200 font-mono whitespace-pre-wrap">
                {result || (error ? '' : '—')}
              </pre>
              {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Big-3 onboarding */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-white mb-6">Connect your AI</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PlatformCard name="ChatGPT" tag="GPT Actions" accent="bg-teal-500/15 text-teal-300 border border-teal-500/30">
            <p>Add a custom GPT Action using our OpenAPI 3.1 schema and sign in with LandSurv.ai (OAuth 2.0):</p>
            <a
              href={`${PUBLIC_ORIGIN}/api/gpt-actions/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block break-all text-emerald-300 font-mono text-xs bg-gray-950 border border-gray-700 rounded px-2 py-1 hover:border-emerald-500/50"
            >
              {PUBLIC_ORIGIN}/api/gpt-actions/openapi.json
            </a>
            <p className="text-xs text-gray-400">Authorize URL and token URL are advertised in the schema's OAuth security scheme.</p>
          </PlatformCard>

          <PlatformCard name="Claude" tag="MCP + Web" accent="bg-orange-500/15 text-orange-300 border border-orange-500/30">
            <p>Connect Claude Desktop / Projects to the LandSurv MCP server:</p>
            <pre className="text-[11px] leading-tight text-gray-200 bg-gray-950 border border-gray-700 rounded px-2 py-2 overflow-auto font-mono whitespace-pre">{mcpConfig}</pre>
            <p className="text-xs text-gray-400">Exposes the analysis tools; runs the same registry as the web app.</p>
          </PlatformCard>

          <PlatformCard name="Grok" tag="Function calling" accent="bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <p>Point Grok's function-calling at the OpenAI-compatible tool endpoints:</p>
            <a
              href={`${PUBLIC_ORIGIN}/api/grok/tools`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block break-all text-emerald-300 font-mono text-xs bg-gray-950 border border-gray-700 rounded px-2 py-1 hover:border-emerald-500/50"
            >
              GET {PUBLIC_ORIGIN}/api/grok/tools
            </a>
            <p className="text-xs text-gray-400">Invoke with <code className="font-mono">POST /api/grok/tools/&lt;name&gt;</code>.</p>
          </PlatformCard>
        </div>
      </section>

      {/* Access tiers */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <h2 className="text-2xl font-bold text-white mb-6">Two access tiers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-6">
            <h3 className="text-lg font-bold text-white mb-2">Partial — no sign-in</h3>
            <ul className="text-sm text-gray-300 space-y-1.5 list-disc list-inside">
              <li>Deed &amp; boundary analysis (area, perimeter, closure, precision ratio)</li>
              <li>Quick-plots and error detection</li>
              <li>Available to anonymous callers on every platform</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-6">
            <h3 className="text-lg font-bold text-white mb-2">Full — signed in</h3>
            <ul className="text-sm text-gray-300 space-y-1.5 list-disc list-inside">
              <li>Stage points directly into your active LandSurv.ai project</li>
              <li>Reserve point numbers from your point file</li>
              <li>Deep links back to the LandSurv.ai dashboard</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 text-center">
          <a
            href="https://landsurv.ai"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
          >
            Open LandSurv.ai
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}

export default GatewaySubdomainPage;
