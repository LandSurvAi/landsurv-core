import React, { useEffect } from 'react';

const mainLinks = [
    { url: 'https://landsurv.ai', title: 'Main Application', description: 'The core AI-powered toolkit for surveying and civil engineering tasks.' },
    { url: 'https://pwa.landsurv.ai', title: 'LandSurv.ai PWA', description: 'Install the LandSurv.ai Progressive Web App for faster launch, offline-ready workflows, and app-like access.' },
    { url: 'https://about.landsurv.ai', title: 'About LandSurv.ai', description: 'Learn about the vision, features, and open data format of the platform.' },
    { url: 'https://civil3d.landsurv.ai', title: 'Civil 3D Cloud Integration', description: 'Download the LandsurvConnector plugin to connect Autodesk Civil 3D to the LandSurv.ai Cloud Brain.' },
    { url: 'https://release.landsurv.ai', title: 'Release Log', description: 'See what\'s new and improved in the latest versions of the application.' },
    { url: 'https://technologies.landsurv.ai', title: 'Technologies & Licenses', description: 'View the open-source technologies that power this application.' },
    { url: 'https://lsvz.landsurv.ai', title: '.lsvz File Format Documentation', description: 'Open-source (CC BY 4.0) spec for the AI-native survey data container format.' },
    { url: 'https://sitemap.landsurv.ai', title: 'Sitemap', description: 'A list of all public-facing pages and subdomains.' },
    { url: 'https://agents.landsurv.ai', title: 'LandSurv.ai Agents', description: 'Explore all available AI agents and their specialized capabilities.' },
    { url: 'https://legal.landsurv.ai', title: 'Legal & Compliance', description: 'Professional-practice disclaimer, legal terms, and policy references for SOC 2/GDPR and SAIF-aligned AI security controls.' },
    { url: 'https://compliance.landsurv.ai', title: 'Security & Compliance Trust Center', description: 'Operational trust-center summary for SOC 2, GDPR, and SAIF-aligned model-consumer risk controls.' },
    { url: 'https://privacy.landsurv.ai', title: 'Privacy Policy', description: 'Privacy notice covering personal data handling, legal bases, retention, data-subject rights, and SAIF-aligned AI privacy safeguards.' },
    { url: 'https://dpa.landsurv.ai', title: 'Data Processing Addendum (DPA)', description: 'Public summary of LandSurv.ai data processing commitments and controller/processor framework.' },
    { url: 'https://subprocessors.landsurv.ai', title: 'Subprocessors', description: 'Current list of subprocessors supporting platform operations and SAIF-aligned AI governance disclosures.' },
    { url: 'https://tos.landsurv.ai', title: 'Terms of Service', description: 'The full commercial contract covering use of the LandSurv.ai web app, agents, Claw browser-automation service, and Civil 3D connector.' },
    { url: 'https://opensource.landsurv.ai', title: 'Open Source Initiative', description: 'Our roadmap and commitment to open-sourcing the LandSurv.ai CAD engine, COGO tools, agent framework, CACP protocol, and .lsvz format under Apache-2.0.' },
    { url: 'https://documentation.landsurv.ai', title: 'Technical Documentation & Guides', description: 'Complete documentation for LandSurv.ai: platform guides, AI agent workflows, Civil 3D live sync, and API gateway reference.' },
];

const openSourceLinks = [
    { url: 'https://lsvz.landsurv.ai', title: '.lsvz File Format Specification', description: 'Open-source (CC BY 4.0) AI-native survey project archive format. A ZIP container with a typed JSON manifest.' },
    { url: 'https://cacp.landsurv.ai', title: 'CACP — Cross-Agent Communications Protocol', description: 'Open-source (CC BY 4.0) inter-agent messaging protocol used by LandSurv.ai agents to collaborate autonomously. Full spec, agent registry, and skill catalog.' },
];

const agentLinks = [
    { url: 'https://deed.landsurv.ai', title: 'Boundary Agent (formerly Deed Reader & Plotter)', description: 'Dedicated landing page for the AI agent that interprets and plots property boundaries from deeds, CSV, and hand entry.' },
    { url: 'https://plan.landsurv.ai', title: 'Civil Plan Expert Agent', description: 'Dedicated landing page for the AI agent that analyzes multi-page PDF plans.' },
    { url: 'https://gis.landsurv.ai', title: 'GIS Agent', description: 'Dedicated landing page for the AI agent that analyzes GeoJSON files.' },
    { url: 'https://station.landsurv.ai', title: 'Stationing & CL Agent', description: 'Dedicated landing page for the AI agent that handles horizontal alignments.' },
    { url: 'https://point.landsurv.ai', title: 'Point Editor Agent', description: 'Dedicated landing page for the central hub for all coordinate data.' },
    { url: 'https://gps.landsurv.ai', title: 'GPS Rover Agent', description: 'Dedicated landing page for the AI agent that assists with field data collection and stakeout workflows.' },
    { url: 'https://cogo.landsurv.ai', title: 'COGO Agent', description: 'Dedicated landing page for the AI agent that performs coordinate geometry calculations.' },
    { url: 'https://gpx.landsurv.ai', title: 'GNSS/GPX Data Tools', description: 'Tools for importing and processing GNSS and GPS exchange format data.' },
    { url: 'https://steepslopes.landsurv.ai', title: 'Steep Slope Agent', description: 'Dedicated landing page for terrain slope-band analysis, filtering, and CAD publishing workflows.' },
    { url: 'https://rinex.landsurv.ai', title: 'RINEX Agent', description: 'Professional GNSS data processing and analysis platform for multi-constellation satellite observation files.' },
    { url: 'https://cadmanager.landsurv.ai', title: 'CAD Manager', description: 'Dedicated landing page for CAD description-key and standards management workflows.' },
    { url: 'https://civildrafter.landsurv.ai', title: 'Civil Drafter Agent', description: 'AI-powered drafting assistant for creating legal descriptions, plotting boundaries, and automating CAD workflows.' },
];


export const SitemapPageContent: React.FC = () => {
    // Use default theme colors for landing page (no activeAgent available in this context)
    const themeHover = 'hover:text-cyan-400';

    // Inject structured data for SEO
    useEffect(() => {
      // BreadcrumbList schema
      const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
          { '@type': 'ListItem', position: 2, name: 'Sitemap', item: 'https://sitemap.landsurv.ai' },
        ],
      };

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(breadcrumbSchema);
      document.head.appendChild(script);

      return () => {
        if (script.parentNode) script.parentNode.removeChild(script);
      };
    }, []);

    const LinkCard: React.FC<{ link: typeof mainLinks[0] }> = ({ link }) => (
        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
            <a href={link.url} target="_blank" rel="noopener noreferrer" className={`font-semibold text-lg text-gray-100 ${themeHover} hover:underline light-theme:text-gray-900`}>
                {link.title}
            </a>
            <p className="text-sm text-gray-400 light-theme:text-gray-600 mt-1">{link.description}</p>
        </div>
    );

    return (
        <>
            <div className="p-4 mb-6 text-sm bg-gray-900/50 rounded-lg border border-cyan-500/50 text-cyan-200">
                <strong className="font-semibold">Note for Search Engines:</strong> The machine-readable XML sitemap is available at{' '}
                <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="font-mono underline hover:text-cyan-100">
                    /sitemap.xml
                </a>.
            </div>
            <p className="mb-6 text-gray-400">
                This sitemap provides an overview of the main pages and resources available for the LandSurv.ai platform.
            </p>
            <section className="mb-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-3 light-theme:text-gray-800">Main Pages</h3>
                <div className="space-y-4">
                    {mainLinks.map(link => <LinkCard key={link.url} link={link} />)}
                </div>
            </section>
            
            <section className="mb-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-1 light-theme:text-gray-800">Open Source Specifications</h3>
                <p className="text-sm text-amber-400/80 mb-3">Published under Creative Commons Attribution 4.0 — free to use, adapt, and build upon with attribution.</p>
                <div className="space-y-4">
                    {openSourceLinks.map(link => (
                        <div key={link.url} className="p-4 bg-amber-900/10 rounded-lg border border-amber-700/30 light-theme:bg-amber-50 light-theme:border-amber-300">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className={`font-semibold text-lg text-gray-100 hover:text-amber-400 hover:underline light-theme:text-gray-900`}>
                                    {link.title}
                                </a>
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold">CC BY 4.0</span>
                            </div>
                            <p className="text-sm text-gray-400 light-theme:text-gray-600">{link.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-3 light-theme:text-gray-800">Agent Landing Pages</h3>
                <div className="space-y-4">
                    {agentLinks.map(link => <LinkCard key={link.url} link={link} />)}
                </div>
            </section>
        </>
    );
};