import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Compass,
  Bot,
  Layers,
  Terminal,
  FileCode,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Info,
  AlertTriangle,
  Lightbulb,
  Clock,
  Tag,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { PublicSubdomainShell } from './PublicSubdomainShell.tsx';
import {
  DOC_PILLARS,
  DOC_ARTICLES,
  type DocPillarId,
  type DocArticle,
  type DocCallout,
  type DocCodeBlock,
  type DocParameter,
} from '../data/documentation/docsContent.ts';

// ─── Subdomain Page Component ───────────────────────────────────────────────

export function DocumentationSubdomainPage() {
  const [selectedPillarId, setSelectedPillarId] = useState<DocPillarId>('getting-started');
  const [selectedArticleId, setSelectedArticleId] = useState<string>('platform-overview');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  // Check if staging environment
  const isStaging = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    const search = window.location.search.toLowerCase();
    return host.includes('staging') || search.includes('staging');
  }, []);

  // Sync with URL parameters or hash on initial load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const docParam = params.get('doc') || params.get('article');
    const hashParam = window.location.hash.replace(/^#/, '');
    const targetSlug = docParam || hashParam;

    if (targetSlug) {
      const match = DOC_ARTICLES.find(a => a.id.toLowerCase() === targetSlug.toLowerCase());
      if (match) {
        setSelectedPillarId(match.pillarId);
        setSelectedArticleId(match.id);
      }
    }
  }, []);

  // Update hash when selected article changes
  const handleSelectArticle = (article: DocArticle) => {
    setSelectedPillarId(article.pillarId);
    setSelectedArticleId(article.id);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('doc', article.id);
      window.history.replaceState(null, '', url.toString());
    }
    // Scroll article view into focus on mobile
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  // Search filtering across titles, descriptions, tags, and sections
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return DOC_ARTICLES.filter(article => {
      if (article.title.toLowerCase().includes(q)) return true;
      if (article.description.toLowerCase().includes(q)) return true;
      if (article.tags.some(t => t.toLowerCase().includes(q))) return true;
      return article.sections.some(s =>
        s.title.toLowerCase().includes(q) || s.content.some(c => c.toLowerCase().includes(q))
      );
    });
  }, [searchQuery]);

  // Current active article
  const currentArticle = useMemo(() => {
    return (
      DOC_ARTICLES.find(a => a.id === selectedArticleId) ||
      DOC_ARTICLES.find(a => a.pillarId === selectedPillarId) ||
      DOC_ARTICLES[0]
    );
  }, [selectedArticleId, selectedPillarId]);

  // Articles within the currently selected pillar
  const pillarArticles = useMemo(() => {
    return DOC_ARTICLES.filter(a => a.pillarId === selectedPillarId);
  }, [selectedPillarId]);

  // Next / Previous article calculation
  const { prevArticle, nextArticle } = useMemo(() => {
    const currentIndex = DOC_ARTICLES.findIndex(a => a.id === currentArticle.id);
    const prev = currentIndex > 0 ? DOC_ARTICLES[currentIndex - 1] : null;
    const next = currentIndex < DOC_ARTICLES.length - 1 ? DOC_ARTICLES[currentIndex + 1] : null;
    return { prevArticle: prev, nextArticle: next };
  }, [currentArticle]);

  // Copy code helper
  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Pillar icon resolver
  const renderPillarIcon = (name: string, className = 'w-5 h-5') => {
    switch (name) {
      case 'Compass':
        return <Compass className={className} />;
      case 'Bot':
        return <Bot className={className} />;
      case 'Layers':
        return <Layers className={className} />;
      case 'Terminal':
        return <Terminal className={className} />;
      case 'FileCode':
        return <FileCode className={className} />;
      default:
        return <BookOpen className={className} />;
    }
  };

  return (
    <PublicSubdomainShell
      eyebrow={isStaging ? 'Staging Documentation Portal' : 'Official Developer & Surveying Reference'}
      title="LandSurv.ai Documentation"
      description="Comprehensive technical guides, agent workflows, CAD synchronization protocols, and open format specifications."
      meta={
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            {isStaging ? 'staging-documentation.landsurv.ai' : 'documentation.landsurv.ai'}
          </span>
          <span className="text-gray-400 text-xs">Updated October 2026</span>
          <span className="text-gray-500 text-xs">•</span>
          <span className="text-gray-400 text-xs">Platform v26.09+</span>
        </div>
      }
      contentClassName="max-w-7xl"
    >
      {/* Search & Global Actions Bar */}
      <div className="mb-8 rounded-2xl border border-white/[0.08] bg-slate-950/60 p-4 sm:p-5 backdrop-blur-md shadow-lg">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search documentation (e.g. 'closure math', 'live sync', 'pnezd', 'cacp envelope')..."
              className="w-full rounded-xl border border-white/[0.1] bg-slate-900/90 py-2.5 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end text-xs text-gray-400">
            <span className="hidden sm:inline">Pillars:</span>
            <span className="rounded-md bg-white/[0.05] px-2 py-1 text-gray-300 font-medium">5 Domains</span>
            <span className="rounded-md bg-white/[0.05] px-2 py-1 text-gray-300 font-medium">{DOC_ARTICLES.length} Guides</span>
          </div>
        </div>

        {/* Search Results Dropdown / Panel */}
        {searchQuery && (
          <div className="mt-4 border-t border-white/[0.08] pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Search Results ({filteredArticles.length} found)
            </p>
            {filteredArticles.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No documentation articles matched "{searchQuery}".</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredArticles.map(article => (
                  <button
                    key={article.id}
                    onClick={() => {
                      handleSelectArticle(article);
                      setSearchQuery('');
                    }}
                    className="flex flex-col text-left p-3 rounded-lg border border-white/[0.05] bg-slate-900/60 hover:border-cyan-400/40 hover:bg-slate-800/80 transition"
                  >
                    <span className="text-sm font-semibold text-cyan-300">{article.title}</span>
                    <span className="text-xs text-gray-400 line-clamp-1 mt-0.5">{article.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pillar Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {DOC_PILLARS.map(pillar => {
          const isActive = selectedPillarId === pillar.id;
          return (
            <button
              key={pillar.id}
              onClick={() => {
                setSelectedPillarId(pillar.id);
                const firstArticle = DOC_ARTICLES.find(a => a.pillarId === pillar.id);
                if (firstArticle) handleSelectArticle(firstArticle);
              }}
              className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                isActive
                  ? 'border-cyan-400/50 bg-cyan-950/30 shadow-lg shadow-cyan-950/30'
                  : 'border-white/[0.08] bg-slate-950/40 hover:border-white/20 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className={isActive ? 'text-cyan-400' : 'text-gray-400'}>
                  {renderPillarIcon(pillar.iconName)}
                </span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-white/[0.06] text-gray-400">
                  {pillar.badge}
                </span>
              </div>
              <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>
                {pillar.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Multi-Column Docs Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Sidebar Article Navigation */}
        <aside className="lg:col-span-4 xl:col-span-3">
          <div className="sticky top-24 rounded-2xl border border-white/[0.08] bg-slate-950/40 p-4 backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5" />
              Articles in this Pillar
            </h3>

            <nav className="space-y-1">
              {pillarArticles.map(article => {
                const isSelected = article.id === currentArticle.id;
                return (
                  <button
                    key={article.id}
                    onClick={() => handleSelectArticle(article)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition ${
                      isSelected
                        ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 font-semibold'
                        : 'text-gray-300 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-2">{article.title}</span>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-cyan-400' : 'text-gray-600'}`} />
                  </button>
                );
              })}
            </nav>

            {/* Quick Cross-Pillar Directory */}
            <div className="mt-6 pt-5 border-t border-white/[0.08]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                All Documentation Pillars
              </p>
              <div className="space-y-1">
                {DOC_PILLARS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPillarId(p.id);
                      const first = DOC_ARTICLES.find(a => a.pillarId === p.id);
                      if (first) handleSelectArticle(first);
                    }}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded transition ${
                      p.id === selectedPillarId
                        ? 'text-cyan-400 font-medium'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    • {p.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Subdomain Resource Links */}
            <div className="mt-6 pt-5 border-t border-white/[0.08] text-xs space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Related Subdomains
              </p>
              <a
                href="https://gateway.landsurv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-gray-400 hover:text-emerald-400 transition"
              >
                <span>AI Gateway Sandbox</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://lsvz.landsurv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-gray-400 hover:text-cyan-400 transition"
              >
                <span>.lsvz Container Spec</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://cacp.landsurv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-gray-400 hover:text-purple-400 transition"
              >
                <span>CACP v1.2 Protocol</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://standards.landsurv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-gray-400 hover:text-blue-400 transition"
              >
                <span>Industry Standards</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </aside>

        {/* Right Column: Active Article Document View */}
        <section className="lg:col-span-8 xl:col-span-9">
          <article className="rounded-2xl border border-white/[0.08] bg-slate-950/45 p-6 sm:p-8 shadow-xl">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 flex-wrap">
              <span>Docs</span>
              <ChevronRight className="w-3 h-3 text-gray-600" />
              <span className="text-cyan-400">
                {DOC_PILLARS.find(p => p.id === currentArticle.pillarId)?.title}
              </span>
              <ChevronRight className="w-3 h-3 text-gray-600" />
              <span className="text-gray-200 font-medium">{currentArticle.title}</span>
            </div>

            {/* Article Header */}
            <div className="border-b border-white/[0.08] pb-6 mb-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {currentArticle.statusBadge && (
                  <span className="rounded-full bg-cyan-500/15 border border-cyan-400/30 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                    {currentArticle.statusBadge}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  {currentArticle.readTimeMinutes} min read
                </span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-xs text-gray-400">Last updated: {currentArticle.lastUpdated}</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
                {currentArticle.title}
              </h1>
              <p className="text-base text-gray-300 leading-relaxed max-w-3xl">
                {currentArticle.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-4">
                {currentArticle.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-0.5 text-xs text-gray-400 border border-white/[0.05]"
                  >
                    <Tag className="w-2.5 h-2.5 text-gray-500" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Article Sections */}
            <div className="space-y-8">
              {currentArticle.sections.map((section, sIndex) => (
                <div key={sIndex} className="space-y-4">
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {section.title}
                  </h2>

                  <div className="space-y-2.5 text-gray-300 text-[15px] leading-relaxed">
                    {section.content.map((paragraph, pIndex) => (
                      <p key={pIndex}>{paragraph}</p>
                    ))}
                  </div>

                  {/* Callout Box */}
                  {section.callout && (
                    <div
                      className={`p-4 rounded-xl border text-sm leading-relaxed ${
                        section.callout.type === 'warning'
                          ? 'bg-amber-950/25 border-amber-400/30 text-amber-200'
                          : section.callout.type === 'tip'
                          ? 'bg-emerald-950/25 border-emerald-400/30 text-emerald-200'
                          : 'bg-cyan-950/25 border-cyan-400/30 text-cyan-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1">
                        {section.callout.type === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        ) : section.callout.type === 'tip' ? (
                          <Lightbulb className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Info className="w-4 h-4 text-cyan-400" />
                        )}
                        <span>{section.callout.title}</span>
                      </div>
                      <p className="opacity-90">{section.callout.text}</p>
                    </div>
                  )}

                  {/* Parameters Table */}
                  {section.parameters && section.parameters.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/[0.08] mt-3">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-900/90 text-gray-300 border-b border-white/[0.08]">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Key / Control</th>
                            <th className="px-4 py-2.5 font-semibold">Type</th>
                            <th className="px-4 py-2.5 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05] bg-slate-950/40">
                          {section.parameters.map((param, pIdx) => (
                            <tr key={pIdx}>
                              <td className="px-4 py-2 font-mono text-cyan-300 font-semibold">{param.name}</td>
                              <td className="px-4 py-2 text-gray-400">{param.type}</td>
                              <td className="px-4 py-2 text-gray-300">{param.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Code Block with Copy button */}
                  {section.codeBlock && (
                    <div className="rounded-xl border border-white/[0.08] bg-slate-900/90 overflow-hidden mt-4">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-white/[0.06] text-xs text-gray-400">
                        <span className="font-mono uppercase">{section.codeBlock.language}</span>
                        {section.codeBlock.caption && (
                          <span className="text-gray-400 italic hidden sm:inline">
                            {section.codeBlock.caption}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopyCode(section.codeBlock!.code, sIndex)}
                          className="flex items-center gap-1 text-gray-400 hover:text-cyan-300 transition"
                          title="Copy to clipboard"
                        >
                          {copiedCodeIndex === sIndex ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-4 text-xs sm:text-sm font-mono text-gray-200 overflow-x-auto leading-relaxed">
                        <code>{section.codeBlock.code}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* External Links & References */}
            {currentArticle.externalLinks && currentArticle.externalLinks.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/[0.08]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                  External Resources & Portals
                </h3>
                <div className="flex flex-wrap gap-3">
                  {currentArticle.externalLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-slate-900/60 text-xs font-semibold text-cyan-300 hover:border-cyan-400/40 hover:text-white transition"
                    >
                      <span>{link.label}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related Articles Cross-Linking */}
            {currentArticle.relatedDocs && currentArticle.relatedDocs.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/[0.08]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                  Related Guides
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {currentArticle.relatedDocs.map(relId => {
                    const relArticle = DOC_ARTICLES.find(a => a.id === relId);
                    if (!relArticle) return null;
                    return (
                      <button
                        key={relId}
                        onClick={() => handleSelectArticle(relArticle)}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-slate-900/40 hover:border-cyan-400/30 hover:bg-slate-900/70 text-left transition"
                      >
                        <div>
                          <p className="text-xs text-cyan-400 font-semibold">{relArticle.title}</p>
                          <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{relArticle.description}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-500 ml-2 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Article Pager (Previous / Next) */}
            <div className="mt-10 pt-6 border-t border-white/[0.08] flex items-center justify-between gap-4">
              {prevArticle ? (
                <button
                  onClick={() => handleSelectArticle(prevArticle)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] bg-slate-900/50 hover:bg-slate-800 text-xs sm:text-sm text-gray-300 hover:text-white transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <div className="text-left hidden sm:block">
                    <span className="text-[10px] uppercase text-gray-500 block">Previous</span>
                    <span className="font-semibold">{prevArticle.title}</span>
                  </div>
                </button>
              ) : (
                <div />
              )}

              {nextArticle ? (
                <button
                  onClick={() => handleSelectArticle(nextArticle)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] bg-slate-900/50 hover:bg-slate-800 text-xs sm:text-sm text-gray-300 hover:text-white transition"
                >
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] uppercase text-gray-500 block">Next</span>
                    <span className="font-semibold">{nextArticle.title}</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div />
              )}
            </div>
          </article>
        </section>
      </div>
    </PublicSubdomainShell>
  );
}

export default DocumentationSubdomainPage;
