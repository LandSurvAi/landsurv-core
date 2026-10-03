
import React, { useEffect } from 'react';
import { ContainerIcon, InteroperabilityIcon, OpenHandsIcon, BrainCircuitIcon, LsvzIcon } from './icons';
import { LSVZ_SCHEMA, renderExampleManifest, lsvzFieldCount, LSVZ_SPEC_VERSION, LSVZ_SPEC_RELEASE } from '../utils/lsvzSchema';
import { APP_VERSION } from '../utils/appVersion';

// The example manifest and the per-field tables below are generated from
// utils/lsvzSchema.ts, which is compile-time checked against the SessionState
// type in types.ts. When a developer adds a new field to SessionState, the
// TypeScript build fails until they document it in LSVZ_SCHEMA — so this page,
// the SEO landing, and any AI assistant citing the spec stay in sync
// automatically.
const exampleManifest = renderExampleManifest(APP_VERSION);

export const LsvzDocumentationContent: React.FC = () => {
    // Landing pages don't have access to activeAgent context, use default theme
    const themeColor = 'text-cyan-400';
    const themeCodeColor = 'text-cyan-300';
    const themeCodeColor2 = 'text-cyan-200';

    useEffect(() => {
        const schemas = [
            {
                '@context': 'https://schema.org',
                '@type': 'TechArticle',
                headline: '.lsvz — LandSurvAI Zipped File Format Specification',
                description: 'Open source AI-native survey project archive format. A ZIP container with a typed JSON manifest holding all session state for land survey and civil engineering projects. Licensed CC BY 4.0.',
                url: 'https://lsvz.landsurv.ai',
                image: 'https://landsurv.ai/favicon-512.png',
                author:    { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
                publisher: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
                license:   'https://creativecommons.org/licenses/by/4.0/',
                keywords:  '.lsvz, survey data, open source, AI-native, land survey, civil engineering, file format, CC BY 4.0',
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
        <>
            {/* .lsvz spec-version banner */}
            <section className="mb-4 p-3 rounded-xl bg-gray-900/60 border border-cyan-700/40 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold">
                    .lsvz Specification v{LSVZ_SPEC_VERSION}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-700/40 border border-gray-600/40 text-gray-300 font-mono text-xs">
                    Released {LSVZ_SPEC_RELEASE}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-700/40 border border-gray-600/40 text-gray-400 font-mono text-xs">
                    App build {APP_VERSION}
                </span>
            </section>

            {/* Open-source / license banner */}
            <section className="mb-8 p-4 rounded-xl bg-amber-900/20 border border-amber-700/40 flex flex-col sm:flex-row items-start gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-amber-800/30 border border-amber-700/40">
                    <svg className="w-7 h-7 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1.293-9.707a2 2 0 012.586 0l1.414-1.414a4 4 0 00-5.414 0L7.879 10.293a4 4 0 000 5.414l1.414 1.414a4 4 0 005.414 0l-1.414-1.414a2 2 0 01-2.586 0 2 2 0 010-2.828 2 2 0 010 2.828z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-white">Open Source Specification</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-400 font-semibold">CC BY 4.0</span>
                    </div>
                    <p className="text-sm text-amber-200/80">
                        The <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> format specification is published as an open standard under the{' '}
                        <strong className="text-white">Creative Commons Attribution 4.0 International</strong> license.
                        Free to use, adapt, and build upon for any purpose — including commercially — with attribution to LandSurv.ai.
                    </p>
                    <a
                        href="https://creativecommons.org/licenses/by/4.0/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 hover:underline mt-2"
                    >
                        View CC BY 4.0 License →
                    </a>
                </div>
            </section>

            <section className="mb-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-3">1. The Vision: A Universal Format for Survey Data</h3>
                <p className="mb-6">
                The <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> (LandSurvAI Zipped) file format is designed to be the industry's first comprehensive, AI-native container for land surveying and civil engineering projects. Its purpose is to break down data silos by encapsulating every piece of data from a user's session—from raw field data to AI analysis—into a single, portable, and transparent file.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <ContainerIcon className={`w-12 h-12 mx-auto mb-3 ${themeColor}`} />
                    <h4 className="font-semibold text-white">Complete Project Archive</h4>
                    <p className="text-sm text-gray-400 mt-1">Source files, AI chats, and all generated data (points, lines, reports) are stored in one auditable and portable archive.</p>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <BrainCircuitIcon className={`w-12 h-12 mx-auto mb-3 ${themeColor}`} />
                    <h4 className="font-semibold text-white">AI-Ready & Future-Proof</h4>
                    <p className="text-sm text-gray-400 mt-1">The structured manifest allows AI agents to instantly understand project context, enabling deeper insights and automation.</p>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <OpenHandsIcon className={`w-12 h-12 mx-auto mb-3 ${themeColor}`} />
                    <h4 className="font-semibold text-white">Democratized Data</h4>
                    <p className="text-sm text-gray-400 mt-1">An open, non-proprietary format prevents vendor lock-in, allowing smaller firms and developers to innovate without expensive licenses.</p>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <InteroperabilityIcon className={`w-12 h-12 mx-auto mb-3 ${themeColor}`} />
                    <h4 className="font-semibold text-white">Radical Interoperability</h4>
                    <p className="text-sm text-gray-400 mt-1">Designed for seamless data transfer between software, field equipment, and other AIs, ensuring your data is always accessible.</p>
                </div>
                </div>
            </section>

            <section className="mb-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-3">2. Structure (Version {APP_VERSION})</h3>
                <p className="mb-4">
                The <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> file is a standard ZIP archive. This container approach ensures that all project-related information is self-contained, auditable, and ready for advanced AI analysis or archival. The archive must contain:
                </p>
                <ul className="list-disc list-inside mb-4 space-y-2">
                <li>A <strong className={`${themeColor}`}>manifest.json</strong> file that contains the complete session state, including UI settings, chat histories, and all generated data.</li>
                <li>The original source files (e.g., <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>job123.raw</code>, <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>parcel_a.pdf</code>) for external reference and archival.</li>
                </ul>

                <p className="mb-4 text-sm text-gray-400 italic">
                The schema below is generated directly from the live <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>SessionState</code> TypeScript interface at build time
                ({lsvzFieldCount()} top-level fields across {LSVZ_SCHEMA.length} groups in this release). When the app gains a new feature that persists state, this page updates automatically — the build fails if a developer adds a field without documenting it here.
                </p>

                <p className="mb-4 text-sm text-gray-400">
                Recent releases expanded the live session surface in several ways that are visible in this manifest: project settings persist selectable linear units for typed drafting; CACP traffic can be surfaced with optional notifications when <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>showCacpNotifications</code> is enabled; steep-slope analysis runs (<code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>steepSlopeRuns</code>) and their agent conversation persist alongside TIN surfaces; the Soils Agent stores SSURGO map units (<code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>soilMapUnits</code>) and its chat; multi-deed batch workflows resume from <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>deedBatchJob</code>; and the Civil Drafter's user-trained conventions travel in <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>draftingStyleLibrary</code>. The companion Voice Agent pilot is part of the live agent roster, but its transcripts remain runtime UI state rather than manifest content.
                </p>

                <h4 className="text-lg font-semibold text-gray-200 mb-2">Top-level fields by group:</h4>
                <div className="space-y-4 mb-6">
                    {LSVZ_SCHEMA.map(group => (
                        <div key={group.id} className="bg-gray-900/40 rounded-lg border border-gray-700 overflow-hidden">
                            <div className="px-4 py-2 bg-gray-800/60 border-b border-gray-700">
                                <h5 className={`font-semibold ${themeColor}`}>{group.title}</h5>
                                <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
                            </div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {group.fields.map(f => (
                                        <tr key={String(f.key)} className="border-t border-gray-800 first:border-t-0">
                                            <td className={`px-4 py-2 align-top whitespace-nowrap font-mono ${themeCodeColor}`}>{String(f.key)}</td>
                                            <td className="px-4 py-2 align-top text-gray-300">{f.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>

                <h4 className="text-lg font-semibold text-gray-200 mb-2">manifest.json example:</h4>
                <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm border border-gray-600">
                <code className={`language-json ${themeCodeColor2}`}>
                    {exampleManifest}
                </code>
                </pre>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-3">3. Computational provenance — COGO skill suite</h3>
                <p className="mb-3">
                Every COGO calculation an agent performs in a session is computed by a deterministic skill in <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>utils/cogoLib/</code> — never by the LLM in chat.
                The results are written to the fieldbook and (where applicable) the project KnowledgeBase, both of which are persisted into the <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> manifest. This means the archive carries a full, replayable computational provenance: anyone reopening the file can re-run the same skills against the same inputs and reproduce every number bit-for-bit.
                </p>
                <p className="mb-4 text-sm">
                The current release exposes <strong className="text-white">30+ COGO skills</strong> over CACP, organized into the categories below. The full schema (inputs, outputs, examples) is published live at <a href="https://cacp.landsurv.ai" className={`${themeColor} hover:underline`}>cacp.landsurv.ai</a>.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>forward / inverse</div>
                        <div className="text-gray-300">cogo_inverse · cogo_direct · cogo_format_bearing · cogo_parse_bearing</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>intersections</div>
                        <div className="text-gray-300">cogo_intersect_bb / bd / dd / ll · cogo_circle_through_3 · cogo_perpendicular_foot</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>curves &amp; spirals</div>
                        <div className="text-gray-300">cogo_curve_solve · cogo_curve_stations · cogo_spiral_xy · cogo_vcurve_elev_at · cogo_vcurve_summary</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>traverse</div>
                        <div className="text-gray-300">cogo_traverse_compute · cogo_traverse_adjust (Compass / Transit / Crandall)</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>area &amp; subdivision</div>
                        <div className="text-gray-300">cogo_area_polygon · cogo_area_from_pns · cogo_minimum_bounding_rect · cogo_subdivide_swing · cogo_subdivide_parallel · cogo_offset_polyline</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>best-fit &amp; transforms</div>
                        <div className="text-gray-300">cogo_bestfit_line · cogo_bestfit_circle · cogo_helmert2d · cogo_affine2d</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>geodetic (WGS-84)</div>
                        <div className="text-gray-300">cogo_geodesic_inverse · cogo_geodesic_direct · cogo_units_convert</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                        <div className={`${themeCodeColor} font-mono text-xs mb-1`}>site &amp; QA</div>
                        <div className="text-gray-300">cogo_shrinkwrap · points_sanity_check (6-check OCR point validation) · cogo_selftest (8-fixture deterministic regression)</div>
                    </div>
                </div>
                <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 text-sm">
                    <h4 className="font-semibold text-white mb-2">Reproducibility &amp; numerical guarantees</h4>
                    <ul className="list-disc list-inside text-gray-400 space-y-1">
                        <li><strong className="text-gray-200">Clean-room implementation.</strong> All formulae from public-domain or permissively-licensed sources (Wolf &amp; Ghilani, Vincenty 1975, Bourke, Andrew 1979, Kåsa). No GPL / copyleft inheritance.</li>
                        <li><strong className="text-gray-200">Surveyor units.</strong> US survey foot (1 m = 3.28083333333 ft) is canonical. Areas always emit sqft + acres simultaneously.</li>
                        <li><strong className="text-gray-200">Test coverage.</strong> 43-fixture vitest suite at <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>tests/cogoLib.test.ts</code>; runtime self-test exposed via <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>cogo_selftest</code>.</li>
                        <li><strong className="text-gray-200">Reporting precision.</strong> Quadrant DMS to whole seconds, distances to 0.01 ft, areas to 4-decimal acres, geodetic distances to mm + 0.01 ft.</li>
                    </ul>
                </div>
            </section>

            <section className="mt-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-3">4. Knowledge Base provenance — permissive-source policy</h3>
                <p className="mb-3">
                The <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>knowledgeFacts</code> array inside <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>manifest.json</code> is more than a scratchpad — it is the
                manifest's audit trail for any external research an agent performed during the session. Each fact carries a <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>source</code> URL,
                a millisecond <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>timestamp</code>, a confidence weight, and the original textual <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>context</code> from which the value was extracted.
                Re-opening the <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> gives the next reader exactly the same evidence the agents saw at save time.
                </p>
                <p className="mb-4 text-sm">
                Today the Zoning Agent is the heaviest writer, persisting setbacks, max height, lot coverage, permitted uses, and source citations under the <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>zoning.requirements</code> category every time the user (or another agent via <a href="https://cacp.landsurv.ai" className={`${themeColor} hover:underline`}>CACP</a>) asks a zoning question. Cross-agent reuse is automatic — Boundary Agent, Civil Drafter, and the auto-draft orchestrator read those facts directly from the KB, no second research turn required.
                </p>

                <div className="bg-gray-900/40 border border-emerald-700/40 rounded-lg p-4 text-sm mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-white">Permissive-source policy</h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-xs text-emerald-300 font-mono">App v1.2</span>
                    </div>
                    <p className="text-gray-400 mb-2">
                        The host application's research layer (the LandSurv Claw) only fetches from <strong className="text-white">permissive sources</strong>: hosts whose terms of use either explicitly allow automated retrieval, or whose content sits in the public domain on platforms that don't contractually restrict access. Commercial codification platforms whose TOS prohibits automation (eCode360, Municode, qcode.us, generalCode, codePublishing, amLegal, sterlingCodifiers, lf-pubs) are <strong className="text-amber-300">hard-blocked</strong>; the host application never sends them an automated request, and no facts derived from them ever enter the <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>knowledgeFacts</code> array.
                    </p>
                    <p className="text-gray-400 mb-2">
                        Every <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>knowledgeFacts</code> entry pinned by the Zoning Agent therefore carries a permissive-source URL in its <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>source</code> field — a municipality .gov site, Zoneomics, a county GIS portal, a state planning office PDF, or a similar public archive. Anyone re-opening the <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> can follow that URL and verify the fact under the same TOS the original retrieval respected.
                    </p>
                    <pre className="bg-gray-950 p-3 rounded text-xs font-mono text-emerald-300 whitespace-pre overflow-x-auto">{`{
  "category":  "zoning.requirements",
  "subject":   "Lehi|Utah County|UT|R1-10",
  "predicate": "setbackFront",
  "value":     25,
  "units":     "ft",
  "source":    "https://lehi-ut.gov/zoning/r1-10",
  "context":   "<excerpt from the cited ordinance section>",
  "confidence": 0.95,
  "timestamp":  1730000000000
}`}</pre>
                    <p className="text-gray-400 mt-2">
                        The in-app <em>"How LandSurv sources external data"</em> modal (open from any blocked-source toast or from the Claw status badge) walks through the policy, the blocklist, the source-preference order, and the case-law background.
                    </p>
                </div>
            </section>

            <section className="mt-8">
                <h3 className="text-xl font-semibold text-gray-100 mb-3">5. Licensing</h3>
                <div className="flex items-start gap-4 bg-amber-900/20 p-4 rounded-lg border border-amber-700/40">
                <svg className={`w-10 h-10 text-amber-400 flex-shrink-0 mt-1`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1.293-9.707a2 2 0 012.586 0l1.414-1.414a4 4 0 00-5.414 0L7.879 10.293a4 4 0 000 5.414l1.414 1.414a4 4 0 005.414 0l-1.414-1.414a2 2 0 01-2.586 0 2 2 0 010-2.828 2 2 0 010 2.828z" />
                </svg>
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">Creative Commons Attribution 4.0 International</h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-400 font-semibold">Open Source</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                    The <code className={`bg-gray-700 px-1 py-0.5 rounded ${themeCodeColor} font-mono`}>.lsvz</code> format specification is published under the CC BY 4.0 license to encourage widespread, open adoption. You are free to share and adapt the format for any purpose, even commercially, as long as you give appropriate credit to LandSurv.ai.
                    </p>
                    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className={`text-sm text-amber-400 hover:underline mt-2 inline-block`}>
                    View License Details &rarr;
                    </a>
                </div>
                </div>
            </section>
        </>
    );
};