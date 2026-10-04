import React, { useEffect } from 'react';
import { DxfAnalyzerIcon } from '../icons.tsx';

export const DxfAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'DXF Agent',
          description: 'Draw CAD files immediately in browser and transform CAD data into surveying intelligence. Parse DXF files, extract coordinates and geometry, identify design elements, and convert CAD data for surveying purposes.',
          url: 'https://dxf.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'DXF Agent', item: 'https://dxf.landsurv.ai' },
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
                <DxfAnalyzerIcon className="w-16 h-16 text-indigo-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-indigo-400">DXF Agent</h3>
                    <p className="text-gray-300">Query and visualize CAD drawings in your browser.</p>
                </div>
            </div>
            <p>
                The DXF Agent brings instant CAD linework visualization and AI analysis directly into your web browser. Upload a .dxf file, and the drawing is rendered immediately on your canvas while the AI parses layers, entities, and coordinates for queries and calculations.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">In-Browser Parsing:</strong> The agent reads the text content of the .dxf file, understanding its layers, entities, and block definitions.</li>
                <li><strong className="text-gray-100">Natural Language Queries:</strong> Ask complex questions about the drawing's contents, such as "How many layers are in this file?" or "List all entities on the 'SURVEY_POINTS' layer."</li>
                <li><strong className="text-gray-100">Selective Visualization:</strong> Instruct the agent to render specific parts of the drawing. For example, "draw all the lines from the 'SURVEY_LINES' layer" will plot only those entities on the canvas.</li>
                <li><strong className="text-gray-100">Data Extraction:</strong> Export geometric data to other formats by asking the agent to, for example, "create a CSV file of all points on the 'CONTROL' layer."</li>
            </ul>
            <p>
                This agent is perfect for quick reviews, data extraction, and verifying the contents of DXF files without interrupting your workflow.
            </p>
        </div>
    );
};
