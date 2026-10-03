import React, { useEffect } from 'react';
import { CourthouseIcon } from '../icons';

/**
 * SEO landing page for the legacy `deed.landsurv.ai` subdomain.
 *
 * The agent formerly known as "Deed Reader & Plotter" has been renamed to
 * **Boundary Agent**. The deed.landsurv.ai URL is preserved for search-index
 * continuity until a dedicated boundary.landsurv.ai subdomain is published.
 * The agent's capabilities (deed parsing, OCR, plotting, closure, area) are
 * unchanged — only the name and scope framing has been updated.
 */
export const DeedAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Boundary Agent (formerly Deed Reader & Plotter)',
          description: 'The Boundary Agent — formerly the Deed Reader & Plotter — extracts and plots property boundaries from deed text, scanned PDFs, CSV bearing/distance lists, and manual entry. Includes OCR, traverse calculation, closure analysis, and area computation.',
          url: 'https://deed.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Boundary Agent', item: 'https://deed.landsurv.ai' },
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
                <CourthouseIcon className="w-16 h-16 text-green-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-green-400">Boundary Agent</h3>
                    <p className="text-gray-300">Formerly the <strong>Deed Reader &amp; Plotter</strong> — same engine, broader scope.</p>
                </div>
            </div>

            <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
                <h4 className="text-base font-semibold text-green-300 mb-1">📣 Renamed: Deed Reader &amp; Plotter is now the Boundary Agent</h4>
                <p className="text-gray-300">
                    The agent formerly published at <code className="text-green-400">deed.landsurv.ai</code> has been renamed to the
                    <strong className="text-green-300"> Boundary Agent</strong> to better reflect its widening scope. All deed-parsing,
                    OCR, plotting, closure, area, and metadata-extraction features are unchanged — they have simply been folded into a
                    single agent that now also handles CSV bearing/distance lists, hand-keyed traverses, multi-tract deeds, and the
                    floating Boundary Editor. This subdomain will continue to serve as the SEO landing for the agent until a dedicated
                    <code className="text-green-400"> boundary.landsurv.ai</code> page is published.
                </p>
            </div>

            <p>
                The Boundary Agent is the tool for one of the most time-consuming jobs in surveying: interpreting and plotting property
                boundaries. Whether the source is digital deed text, a scanned PDF, a CSV of metes-and-bounds calls, or hand entry from
                a field book, the agent extracts the calls, traverses the parcel, draws points and lines on the canvas, and writes
                back a clean legal description.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Text &amp; OCR Support:</strong> Paste a legal description or upload a deed PDF. Advanced OCR reads scanned documents.</li>
                <li><strong className="text-gray-100">Automated Plotting:</strong> Ask the agent to "plot this deed" — it extracts every metes-and-bounds call (including curves), traverses the parcel, and draws points and lines on the canvas.</li>
                <li><strong className="text-gray-100">Multi-Tract Deeds:</strong> Deeds with multiple descriptions produce one independent boundary object per tract, auto-named from the parcel ID or owner.</li>
                <li><strong className="text-gray-100">Closure &amp; Area:</strong> Instant closure-error and area-in-acres reporting on demand.</li>
                <li><strong className="text-gray-100">Monument &amp; Metadata Extraction:</strong> Pulls owner, parcel ID, book/page, and monument list out of the deed text into structured fields.</li>
                <li><strong className="text-gray-100">Hand Entry &amp; CSV:</strong> The floating Boundary Editor lets you add or correct bearing/distance/curve calls manually, or import them from CSV — no AI required.</li>
                <li><strong className="text-gray-100">Civil 3D Push:</strong> Send the resulting boundary as a real polyline with bearing/distance annotations straight into Civil 3D via the LandsurvConnector.</li>
            </ul>
            <p>
                By automating the initial boundary breakdown, the Boundary Agent dramatically reduces manual data entry and frees you
                to focus on the professional review and verification of the results.
            </p>
        </div>
    );
};
