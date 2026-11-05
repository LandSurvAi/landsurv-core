import React, { useMemo } from 'react';
import { ArrowUpRight, ExternalLink, Network, Sparkles } from 'lucide-react';
import { agentRegistry } from '../services/AgentRegistry.ts';
import { interAgentComm } from '../services/InterAgentCommunication.ts';
import {
  getPublicPageGuide,
  openA2UISurface,
  resolvePublicPageKey,
} from '../services/a2uiSurfaces.ts';
import { CACP_SPEC_RELEASE, CACP_SPEC_VERSION } from './CacpSubdomainPage.tsx';
import { A2UICacpManifestExplorer } from './A2UICacpManifestExplorer.tsx';

interface A2UIPageAssistantProps {
  subdomain: string;
}

/**
 * Page-aware public surface.
 *
 * Every subdomain gets useful content without bespoke wiring: guide copy from
 * the catalog, live CACP registry data on protocol pages, and direct launch of
 * the manifest explorer.
 */
export const A2UIPageAssistant: React.FC<A2UIPageAssistantProps> = ({ subdomain }) => {
  const pageKey = resolvePublicPageKey(subdomain);
  const guide = useMemo(() => getPublicPageGuide(subdomain), [subdomain]);
  const isProtocolPage = pageKey === 'cacp';

  const protocolStats = useMemo(() => {
    if (!isProtocolPage) return null;
    const manifests = agentRegistry.listCacpEnabled();
    return {
      agents: manifests.length,
      skills: manifests.reduce((count, manifest) => count + manifest.skills.length, 0),
      logEntries: interAgentComm.getLog().length,
    };
  }, [isProtocolPage]);

  const openManifests = () => {
    openA2UISurface({
      key: 'cacp-manifests',
      definitionId: 'cacp-manifests',
      title: 'CACP manifest explorer',
      subtitle: 'Live agent and skill schemas',
      category: 'protocol',
      accent: 'emerald',
      size: 'wide',
      source: `public:${pageKey}`,
      content: <A2UICacpManifestExplorer />,
    });
  };

  return (
    <div data-testid="a2ui-page-assistant" className="p-3.5">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
        <Sparkles className="h-3 w-3" />
        {guide.eyebrow}
      </p>
      <h3 className="mt-1.5 text-[15px] font-bold text-slate-100">{guide.title}</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{guide.summary}</p>

      {isProtocolPage && protocolStats && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            ['Agents', protocolStats.agents],
            ['Skills', protocolStats.skills],
            ['Local events', protocolStats.logEntries],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.05] px-2 py-2 text-center">
              <p className="text-[15px] font-bold tabular-nums text-emerald-200">{value}</p>
              <p className="text-[8.5px] uppercase tracking-[0.1em] text-emerald-300/60">{label}</p>
            </div>
          ))}
        </div>
      )}

      {isProtocolPage && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-200">
            Spec v{CACP_SPEC_VERSION}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] text-slate-400">
            Released {CACP_SPEC_RELEASE}
          </span>
          <button
            type="button"
            onClick={openManifests}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 transition-colors hover:border-emerald-300/55 hover:bg-emerald-400/20"
          >
            <Network className="h-3 w-3" />
            Browse manifests
          </button>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {guide.highlights.map(highlight => (
          <div key={highlight.label} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10px] font-semibold text-slate-200">{highlight.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{highlight.detail}</p>
          </div>
        ))}
      </div>

      {guide.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-2.5">
          {guide.links.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1 rounded border border-cyan-400/25 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/10"
            >
              {link.label}
              {link.href.startsWith('http') ? (
                <ExternalLink className="h-2.5 w-2.5" />
              ) : (
                <ArrowUpRight className="h-2.5 w-2.5" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default A2UIPageAssistant;
