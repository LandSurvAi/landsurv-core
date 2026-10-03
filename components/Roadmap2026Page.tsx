import React from 'react';
import { 
  ArrowRight, 
  Calendar, 
  CheckCircle2, 
  Target, 
  Zap, 
  Layers, 
  Network,
  Cpu,
  FileText,
  Home,
  Ruler,
  Settings,
  Link2,
  Sparkles
} from 'lucide-react';

/**
 * 2026 Roadmap Page
 * 
 * Landing page for 2026.landsurv.ai showcasing:
 * - 2025 accomplishments recap
 * - 2026 vision and roadmap
 * - Deep C3D integration plans
 * - LSVZ as central MCP/API liaison
 */

const accomplishments2025 = [
  {
    title: 'Civil 3D Cloud Integration',
    description: 'Launched LandsurvConnector - a revolutionary bridge between Civil 3D and cloud AI, enabling real-time bidirectional communication.',
    icon: Link2,
  },
  {
    title: 'Multi-Agent Architecture',
    description: 'Built 10+ specialized AI agents: RAW File Crawler, Boundary Agent, DXF Analyzer, Civil Plan Expert, GIS Agent, COGO Agent, and more.',
    icon: Network,
  },
  {
    title: 'CAD Manager Foundation',
    description: 'Established CAD Manager for description key sets, point groups, linetypes, and drawing standard management.',
    icon: Settings,
  },
  {
    title: 'AR Field Integration',
    description: 'Introduced Augmented Reality agent for visualizing survey data and stakeout points in the real world.',
    icon: Sparkles,
  },
  {
    title: 'AI Deed Drafting',
    description: 'Built intelligent deed drafting with automatic legal description generation, bearing/distance extraction, and document formatting.',
    icon: Cpu,
  },
  {
    title: 'Real-time C3D State Sync',
    description: 'Implemented live synchronization of Civil 3D drawing state - surfaces, alignments, points, and parcels.',
    icon: Zap,
  },
];

const roadmap2026 = [
  {
    quarter: 'Q1 2026',
    title: 'Survey Point Drawing Engine',
    description: 'AI-powered automated drafting from survey point data. Upload your points, describe what you need, and watch the drawing materialize in Civil 3D.',
    features: [
      'Intelligent point connection algorithms',
      'Natural language drawing commands',
      'Automatic linework generation',
      'Breakline and contour inference',
    ],
    icon: Ruler,
    color: 'cyan',
  },
  {
    quarter: 'Q1-Q2 2026',
    title: 'LSVZ: The Universal Liaison',
    description: 'Transform the C3D connector into the central API/MCP server for all LandSurv.ai agents. LSVZ becomes the bridge between Civil 3D and every webapp agent.',
    features: [
      'MCP server architecture for C3D',
      'Unified tool registry for all agents',
      'Cross-agent workflow orchestration',
      'Real-time state propagation',
    ],
    icon: Network,
    color: 'green',
  },
  {
    quarter: 'Q2 2026',
    title: 'Architectural Plan Integration',
    description: 'Import and draw from architect-provided plans. House footprints, building pads, and site features automatically translated to Civil 3D objects.',
    features: [
      'PDF/DWG plan interpretation',
      'Footprint extraction from designs',
      'Automatic Civil 3D object creation',
      'Coordinate transformation handling',
    ],
    icon: Home,
    color: 'orange',
  },
  {
    quarter: 'Q2-Q3 2026',
    title: 'Advanced CAD Manager',
    description: 'Deep drawing standard enforcement and active management. Real-time adherence checking, automatic corrections, and company standard templates.',
    features: [
      'Live standard compliance checking',
      'Automatic layer/style corrections',
      'Company template management',
      'Drawing audit and reporting',
    ],
    icon: FileText,
    color: 'purple',
  },
  {
    quarter: 'Q3-Q4 2026',
    title: 'Agent-to-C3D Pipelines',
    description: 'Every webapp agent gains direct C3D integration through LSVZ. Deed plots go straight to drawings, GIS data becomes Civil 3D features, and more.',
    features: [
      'Boundary Agent → Legal boundary drawing',
      'GIS Agent → Feature class import',
      'Civil Plan Expert → Design extraction',
      'DXF Analyzer → Drawing comparison',
    ],
    icon: Layers,
    color: 'amber',
  },
];

export function Roadmap2026Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-cyan-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">
                  LandSurv.ai <span className="text-cyan-400">2026</span>
                </h1>
                <p className="text-sm text-gray-400">Vision & Roadmap</p>
              </div>
            </div>
            <a
              href="https://landsurv.ai"
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Back to App
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 rounded-full">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="text-cyan-400 font-semibold">The Year of Deep Integration</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-bold text-white mb-6">
            <span className="bg-gradient-to-r from-cyan-400 via-green-400 to-cyan-400 bg-clip-text text-transparent">
              2026
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto">
            From cloud AI assistant to <span className="text-cyan-400 font-semibold">full Civil 3D integration</span>. 
            This year, we're making AI your drafting partner, not just your advisor.
          </p>
        </div>

        {/* Vision Statement */}
        <div className="bg-gradient-to-r from-cyan-500/10 via-green-500/10 to-cyan-500/10 border border-cyan-500/20 rounded-2xl p-8 md:p-12 mb-16">
          <div className="max-w-4xl mx-auto text-center">
            <Target className="w-12 h-12 text-cyan-400 mx-auto mb-6" />
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">Our Vision for 2026</h3>
            <p className="text-lg text-gray-300 leading-relaxed">
              Transform LandSurv.ai from a collection of intelligent agents into a <span className="text-green-400 font-semibold">unified Civil 3D powerhouse</span>. 
              The LSVZ connector will become the central nervous system—an MCP server that bridges every webapp agent directly to your drawing. 
              Survey points become linework. Architect plans become site features. Legal descriptions become boundary drawings. 
              <span className="text-cyan-400 font-semibold"> All through natural language commands.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2025 Accomplishments */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
            What We Built in <span className="text-green-400">2025</span>
          </h3>
          <p className="text-gray-400 text-lg">The foundation for everything that comes next</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {accomplishments2025.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/[0.08] bg-slate-950/45 p-6 transition hover:border-green-500/50 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition">
                  <item.icon className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <h4 className="font-semibold text-white">{item.title}</h4>
                  </div>
                  <p className="text-sm text-gray-400">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2026 Roadmap */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
            The <span className="text-cyan-400">2026</span> Roadmap
          </h3>
          <p className="text-gray-400 text-lg">Ambitious goals. Practical milestones.</p>
        </div>

        <div className="space-y-8">
          {roadmap2026.map((item, index) => {
            const colorClasses: Record<string, { bg: string; border: string; text: string; glow: string }> = {
              cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', glow: 'hover:border-cyan-500/50' },
              green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', glow: 'hover:border-green-500/50' },
              orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', glow: 'hover:border-orange-500/50' },
              purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', glow: 'hover:border-purple-500/50' },
              amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'hover:border-amber-500/50' },
            };
            const colors = colorClasses[item.color] || colorClasses.cyan;

            return (
              <div
                key={index}
                className={`border ${colors.border} rounded-2xl bg-slate-950/45 p-6 md:p-8 ${colors.glow} transition group`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className={`p-4 ${colors.bg} rounded-xl shrink-0`}>
                    <item.icon className={`w-8 h-8 ${colors.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className={`px-3 py-1 ${colors.bg} ${colors.text} rounded-full text-sm font-semibold`}>
                        {item.quarter}
                      </span>
                      <h4 className="text-xl font-bold text-white">{item.title}</h4>
                    </div>
                    <p className="text-gray-300 mb-4">{item.description}</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {item.features.map((feature, fIndex) => (
                        <div key={fIndex} className="flex items-center gap-2 text-sm text-gray-400">
                          <div className={`w-1.5 h-1.5 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* LSVZ Architecture Highlight */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-br from-green-500/10 via-cyan-500/10 to-green-500/10 border border-green-500/20 rounded-2xl p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <Network className="w-12 h-12 text-green-400 mb-6" />
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                LSVZ: The Universal Bridge
              </h3>
              <p className="text-gray-300 mb-6">
                The LandSurv Connector (LSVZ) is evolving from a simple C3D plugin into the <span className="text-green-400 font-semibold">central MCP server</span> for 
                the entire LandSurv.ai ecosystem. Every agent—present and future—will communicate through LSVZ to read from and write to Civil 3D.
              </p>
              <ul className="space-y-3">
                {[
                  'Acts as API/MCP server for all webapp agents',
                  'Unified tool registry across the ecosystem',
                  'Bidirectional state synchronization',
                  'Natural language command processing',
                  'Cross-agent workflow orchestration',
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-3 text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="aspect-square bg-gray-800/50 rounded-xl border border-gray-700 p-8 flex items-center justify-center">
                {/* Simple architecture diagram */}
                <div className="text-center">
                  <div className="inline-block p-4 bg-green-500/20 rounded-xl border border-green-500/30 mb-4">
                    <span className="text-2xl font-bold text-green-400">LSVZ</span>
                    <p className="text-xs text-gray-400 mt-1">MCP Server</p>
                  </div>
                  <div className="flex justify-center gap-4 mb-4">
                    <ArrowRight className="w-6 h-6 text-gray-500 rotate-90" />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    {['Boundary Agent', 'GIS Agent', 'CAD Mgr', 'DXF Analyzer', 'Plan Expert', 'COGO'].map((agent, i) => (
                      <div key={i} className="p-2 bg-cyan-500/10 rounded border border-cyan-500/20 text-cyan-400">
                        {agent}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center gap-4 mt-4 mb-4">
                    <ArrowRight className="w-6 h-6 text-gray-500 rotate-90" />
                  </div>
                  <div className="inline-block p-3 bg-orange-500/20 rounded-xl border border-orange-500/30">
                    <span className="text-lg font-bold text-orange-400">Civil 3D</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Join Us on This Journey
          </h3>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            2026 is about making AI work <span className="text-cyan-400">for you</span>, directly in your drawings. 
            Start using LandSurv.ai today and be ready for what's next.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://landsurv.ai"
              className="inline-flex items-center gap-2 px-8 py-4 bg-cyan-500 text-gray-900 font-bold rounded-lg hover:bg-cyan-400 transition text-lg"
            >
              Launch LandSurv.ai
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="https://civil3d.landsurv.ai"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition text-lg"
            >
              Get the Connector
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} LandSurv.ai — AI-Native Tools for Land Surveyors & Civil Engineers</p>
        </div>
      </footer>
    </div>
  );
}
