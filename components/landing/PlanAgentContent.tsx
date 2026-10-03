import React, { useEffect } from 'react';
import { DocumentDuplicateIcon } from '../icons';

export const PlanAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Civil Plan Expert Agent',
          description: 'Your civil engineering assistant. Analyze civil engineering plans, extract coordinates from drawings, identify design elements, and assist in plan interpretation.',
          url: 'https://plan.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Civil Plan Expert Agent', item: 'https://plan.landsurv.ai' },
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
                <DocumentDuplicateIcon className="w-16 h-16 text-orange-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-orange-400">Civil Plan Expert Agent</h3>
                    <p className="text-gray-300">Extract and analyze data from multi-page PDF plans.</p>
                </div>
            </div>
            <p>
                The Civil Plan Expert is designed to digest and interpret complex civil engineering and survey plans. By uploading one or more PDF plan sheets, you can leverage AI to quickly find, extract, and visualize key design elements.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Multi-Page Analysis:</strong> Upload entire plan sets. The AI can process multiple pages at once to provide a holistic understanding of the project.</li>
                <li><strong className="text-gray-100">Feature Extraction:</strong> Ask the agent to "plot the storm drain network" or "draw lot 5 and label its dimensions," and it will read the plan to extract and visualize the requested features.</li>
                <li><strong className="text-gray-100">Scanned Document Support:</strong> Using powerful OCR, the agent can read text and dimensions from scanned paper plans, making legacy documents searchable and analyzable.</li>
                <li><strong className="text-gray-100">Uncertainty Highlighting:</strong> The AI will automatically flag areas on the PDF that are smudged, illegible, or ambiguous, providing you with a list of items that require professional review.</li>
            </ul>
            <p>
                This agent acts as a powerful assistant for plan review, helping you quickly synthesize information and identify potential issues or missing data across multiple sheets.
            </p>
        </div>
    );
};
