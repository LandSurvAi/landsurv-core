import React, { useEffect } from 'react';
import { SlopeIcon } from '../icons.tsx';

export const SteepSlopeAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Steep Slope Agent',
          description: 'Terrain slope classification and analysis. Classify terrain by slope-percent bands, remove small components below vertical-span thresholds, and publish slope layers to CAD.',
          url: 'https://steepslopes.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Steep Slope Agent', item: 'https://steepslopes.landsurv.ai' },
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
                <SlopeIcon className="w-16 h-16 text-rose-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-rose-400">Steep Slope Agent</h3>
                    <p className="text-gray-300">Classify terrain by slope percent and publish slope-based layers to CAD.</p>
                </div>
            </div>
            <p>
                The Steep Slope Agent analyzes terrain geometry to automatically classify and extract steep slopes based on your project requirements. Ideal for hazard identification, erosion control planning, and regulatory compliance (e.g., stormwater design, grading).
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Slope Band Classification:</strong> Define custom slope-percent ranges (e.g., 0–15%, 15–30%, 30%+) with custom colors and layer names for professional CAD visualization.</li>
                <li><strong className="text-gray-100">Component Filtering:</strong> Set a minimum vertical-span threshold (default 6 feet) to exclude isolated slope pockets from your analysis — only connected terrain features are retained.</li>
                <li><strong className="text-gray-100">TIN-Based Analysis:</strong> The agent triangulates your survey data into a TIN (Triangulated Irregular Network) and computes per-triangle slope angles for precise classification.</li>
                <li><strong className="text-gray-100">Automatic CAD Publishing:</strong> Render classified slope segments directly onto the canvas as survey lines, or publish new CAD layers for each slope band with your specified colors and naming.</li>
                <li><strong className="text-gray-100">Inclusion Boundary Support:</strong> Optionally restrict analysis to a named inclusion boundary to focus on project-specific areas.</li>
                <li><strong className="text-gray-100">Data Source Flexibility:</strong> Use existing project points, import a .TIN or LandXML surface, or load one from a session file.</li>
            </ul>
            <p>
                This agent streamlines slope hazard identification and professional slope exhibits, reducing manual classification time and ensuring CACP-compliant layer workflows.
            </p>
        </div>
    );
};
