import React, { useEffect, useState } from 'react';
import { Scale, ShieldCheck, ExternalLink, X, BookOpen, Globe } from 'lucide-react';
import { RESTRICTED_HOST_SUFFIXES } from '../utils/clawCompliance';

// ---------------------------------------------------------------------------
// Module-scoped open/close bus. Any caller can pop the modal via
// `openSourcePolicyExplainer()` (or the window devtools handle). The single
// modal instance mounted at App root subscribes and renders.
// ---------------------------------------------------------------------------

type OpenListener = () => void;
const openListeners = new Set<OpenListener>();

export function openSourcePolicyExplainer(): void {
  for (const fn of openListeners) { try { fn(); } catch { /* isolated */ } }
}

if (typeof window !== 'undefined') {
  (window as any).__landsurvLegal = {
    open: openSourcePolicyExplainer,
  };
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

const PermissiveSourcesExplainer: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn: OpenListener = () => setOpen(true);
    openListeners.add(fn);
    return () => { openListeners.delete(fn); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-slate-900 border border-emerald-700/50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-emerald-950/40 to-slate-900">
          <Scale className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">How LandSurv sources external data</h2>
            <p className="text-xs text-slate-400">
              A short, plain-English explanation of the legal posture behind our research agents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-300 leading-relaxed">

          {/* What we do */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">What our research agents do</h3>
            </div>
            <p>
              When a Zoning, GIS, or Title agent needs a fact (a setback, a parcel ID, a flood zone) it consults the live web through
              the <strong className="text-emerald-300">LandSurv Claw</strong>, our containerised headless-browser service. The Claw is a tool
              the agent drives — it navigates, scrolls, scrapes, and reports back. Every call is logged in the floating status badge so
              you can see exactly which URL the agent visited and what it read.
            </p>
          </section>

          {/* Permissive vs restricted */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">Permissive sources only</h3>
            </div>
            <p className="mb-3">
              The Claw is only allowed to fetch from <strong className="text-white">permissive sources</strong> — websites whose terms of
              use either explicitly allow automated retrieval, or whose content sits in the public domain on platforms that don't
              contractually restrict access. In practice the agents prefer, in this order:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 mb-3 ml-2">
              <li>The municipality's own <code className="text-emerald-300 font-mono">.gov</code> site</li>
              <li>Zoneomics</li>
              <li>The county GIS / planning-department portal</li>
              <li>State planning office PDFs and public ordinance archives</li>
              <li>Grounded Google Search snippets (as a confirmation, not a primary source)</li>
            </ol>
            <p>
              The text of statutes and ordinances themselves is part of the public domain in the United States (the "government
              edicts doctrine" — <em>Banks v. Manchester</em>, 1888; <em>Georgia v. Public.Resource.Org</em>, 2020). We treat that
              underlying text as freely citable so long as we reach it through a host that permits the retrieval.
            </p>
          </section>

          {/* The blocklist */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-white">The TOS-restricted blocklist</h3>
            </div>
            <p className="mb-3">
              A handful of commercial codification platforms publish municipal codes under terms-of-service that explicitly prohibit
              automated retrieval, even of underlying public-record text. The LandSurv Claw will <strong className="text-amber-300">never
              fetch these hosts</strong>, no matter what an agent attempts. If an agent tries, the request is short-circuited before any
              network call is made and the agent receives an explicit{' '}
              <code className="text-amber-300 font-mono">[BLOCKED — TOS-RESTRICTED HOST]</code> response telling it to pivot.
            </p>
            <div className="bg-slate-950/60 border border-amber-700/40 rounded-lg p-3 font-mono text-xs text-amber-200/90 leading-relaxed">
              {RESTRICTED_HOST_SUFFIXES.join('  ·  ')}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Source: <code className="font-mono text-emerald-300">utils/clawCompliance.ts → RESTRICTED_HOST_SUFFIXES</code>
            </p>
          </section>

          {/* User-as-principal */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white">If you want to read a blocked source yourself</h3>
            </div>
            <p>
              You can always open the URL directly in your own browser. That request leaves your machine under <em>your</em> session
              and <em>your</em> TOS exposure — exactly as if you had typed the address bar yourself. The host application's automation
              never touches the host. If you find content there that you want the agent to use, paste it into the chat input; it will
              be treated as user-supplied input, not as scraped data.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              When a blocked attempt happens, a small notice in the bottom-left of the screen surfaces the URL and gives you a one-click
              <em> "Open in your browser"</em> link.
            </p>
          </section>

          {/* Legal background */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-5 h-5 text-violet-400" />
              <h3 className="font-semibold text-white">Why this is the cleanest posture</h3>
            </div>
            <p className="mb-2">
              Recent case law has clarified that scraping <em>publicly accessible</em> data is generally not a federal crime
              (<em>hiQ Labs v. LinkedIn</em>, 9th Cir. 2022; <em>Van Buren v. United States</em>, 2021). But federal-statute immunity
              does not cure a <em>contract</em> claim. A site whose terms-of-use prohibit automated retrieval may still bring a
              breach-of-contract or unfair-competition suit.
            </p>
            <p className="mb-2">
              Some platforms have argued that even an explicit per-fetch user attestation does not change the underlying retrieval
              mechanism. Rather than litigate that question one fact-pattern at a time, we made the engineering choice that puts the
              app firmly on the safe side of every theory: <strong className="text-white">we do not make automated requests to those
              hosts at all.</strong> Permissive sources cover the overwhelming majority of practical jurisdictions we encounter.
            </p>
          </section>

          {/* Disclaimer */}
          <section className="rounded-lg bg-slate-950/60 border border-slate-700 p-4">
            <h3 className="font-semibold text-slate-200 mb-1 text-sm">Not legal advice</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This explainer summarises the engineering policy and the publicly available legal reasoning that informed it. It is not
              legal advice and is not a substitute for review by qualified counsel. If you intend to use LandSurv outputs in a
              regulated context (filings, expert testimony, contractual deliverables) and have questions about source provenance,
              consult an attorney. The blocklist and policy may be reviewed and updated as guidance evolves.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-950/40 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            More detail at <a href="https://cacp.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">cacp.landsurv.ai</a>
            {' · '}
            <a href="https://lsvz.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">lsvz.landsurv.ai</a>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissiveSourcesExplainer;
