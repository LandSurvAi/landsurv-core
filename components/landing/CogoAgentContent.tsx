import React, { useEffect } from 'react';
import { CrosshairsIcon } from '../icons';

export const CogoAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'COGO Agent',
          description: 'Coordinate geometry calculations. Perform inverse and direct calculations, compute intersections, calculate areas and closures, and solve geometric problems.',
          url: 'https://cogo.landsurv.ai',
          image: 'https://landsurv.ai/favicon-512.png',
          brand: { '@type': 'Brand', name: 'LandSurv.ai' },
          manufacturer: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
            { '@type': 'ListItem', position: 2, name: 'Agents', item: 'https://landsurv.ai?page=agents' },
            { '@type': 'ListItem', position: 3, name: 'COGO Agent', item: 'https://cogo.landsurv.ai' },
          ],
        },
      ];
      schemas.forEach((schema) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
      });
    }, []);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <CrosshairsIcon className="w-16 h-16 text-violet-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-violet-400">COGO Agent</h3>
                    <p className="text-gray-300">A surveyor-grade coordinate geometry workbench — 30+ skills exposed over CACP.</p>
                </div>
            </div>
            <p>
                The COGO (Coordinate Geometry) Agent is the project's computational geometry authority. It owns a comprehensive, deterministic skill set used by every other CACP-enabled agent in LandSurv.ai — Boundary, Civil Drafter, Stationing, GPS Stakeout, and the LSVZ Meta-Agent all delegate calculations here instead of approximating them in chat.
            </p>

            <h4 className="text-lg font-semibold text-violet-300 pt-2">Skill catalog</h4>
            <p className="text-gray-300 text-sm">
                All skills are routed through the Cross-Agent Communication Protocol (CACP). Inputs and outputs are validated by a shared schema; angles are radians unless a payload explicitly says otherwise; bearings accept quadrant DMS, decimal-degree, or DMS-with-letters strings.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Forward & inverse</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_inverse</code> — bearing &amp; distance between two PNs</li>
                        <li><code>cogo_direct</code> — forward from a point, azimuth, distance</li>
                        <li><code>cogo_format_bearing</code> / <code>cogo_parse_bearing</code></li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Intersections</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_intersect_bb</code> — bearing/bearing</li>
                        <li><code>cogo_intersect_bd</code> — bearing/distance</li>
                        <li><code>cogo_intersect_dd</code> — distance/distance (trilateration)</li>
                        <li><code>cogo_intersect_ll</code> — line/line segments</li>
                        <li><code>cogo_circle_through_3</code> &amp; <code>cogo_perpendicular_foot</code></li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Curves & spirals</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_curve_solve</code> — any 2 of R/Δ/L/C/T/E/M/Da/Dc</li>
                        <li><code>cogo_curve_stations</code> — PC, PI, PT</li>
                        <li><code>cogo_spiral_xy</code> — clothoid coordinates (Taylor series)</li>
                        <li><code>cogo_vcurve_elev_at</code>, <code>cogo_vcurve_summary</code> — vertical curves &amp; high/low point</li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Traverse adjustment</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_traverse_compute</code> — closure &amp; precision ratio</li>
                        <li><code>cogo_traverse_adjust</code> — Compass (Bowditch), Transit, Crandall, or none</li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Area & parcels</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_area_polygon</code> &amp; <code>cogo_area_from_pns</code> — Shoelace + acres</li>
                        <li><code>cogo_minimum_bounding_rect</code> — rotating-calipers MBR</li>
                        <li><code>cogo_subdivide_swing</code> — swing line for target area</li>
                        <li><code>cogo_subdivide_parallel</code> — parallel chord cut for target area</li>
                        <li><code>cogo_offset_polyline</code> — miter / bevel parallel offset</li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Best-fit & transforms</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_bestfit_line</code> — PCA</li>
                        <li><code>cogo_bestfit_circle</code> — Kåsa algebraic</li>
                        <li><code>cogo_helmert2d</code> — 4-param similarity (closed-form)</li>
                        <li><code>cogo_affine2d</code> — 6-param affine (least-squares)</li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Geodetic (WGS-84)</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_geodesic_inverse</code> — Vincenty inverse, &lt;1 mm convergence</li>
                        <li><code>cogo_geodesic_direct</code> — Vincenty direct</li>
                        <li><code>cogo_units_convert</code> — US-survey-foot aware (3.28083333… ft / m)</li>
                    </ul>
                </div>
                <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-700">
                    <h5 className="font-semibold text-violet-300">Site geometry & QA</h5>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1">
                        <li><code>cogo_shrinkwrap</code> — Andrew monotone-chain hull, drawn as inclusion polyline</li>
                        <li><code>cogo_selftest</code> — 8-fixture deterministic regression suite</li>
                    </ul>
                </div>
            </div>

            <h4 className="text-lg font-semibold text-violet-300 pt-2">Engineering notes</h4>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300 text-sm">
                <li><strong className="text-gray-100">Clean-room implementation.</strong> All primitives are implemented from textbook formulae (Wolf &amp; Ghilani, Vincenty 1975, Bourke, Andrew 1979) — no GPL or copyleft dependencies. The library lives under <code>utils/cogoLib/</code> with a focused vitest suite (43 fixtures green at last run).</li>
                <li><strong className="text-gray-100">Surveyor units.</strong> US survey foot (1 m = 3.28083333333 ft) is the canonical unit. Areas report sqft + acres simultaneously so reports never disagree with each other.</li>
                <li><strong className="text-gray-100">Reporting precision.</strong> Quadrant DMS to whole seconds, distances to 0.01 ft, areas to 4-decimal acres, geodetic distances to mm + 0.01 ft.</li>
                <li><strong className="text-gray-100">Self-delegation.</strong> The COGO Agent is allowed to call its own skills via <code>askPeer</code>. The host dispatches them locally — no chat round-trip, no LLM math.</li>
                <li><strong className="text-gray-100">Self-test.</strong> Hit <code>cogo_selftest</code> from any agent to run an 8-case regression covering inverse/direct, intersections, curves, area, Helmert, best-fit circle, and Vincenty (JFK→LHR ≈ 5550 km ±50 km).</li>
            </ul>

            <p className="text-gray-300 text-sm">
                Anything that depends on the active drawing's alignments, surfaces, or layer state is delegated out to the appropriate peer (Stationing for alignment-aware station/offset, CAD Manager for layer rules, Civil 3D MCP for drawing-resident operations). The COGO Agent stays purely in the realm of pure coordinate math.
            </p>
        </div>
    );
};
