import React, { useEffect } from 'react';
import { ContourIcon, ProfileIcon } from '../icons.tsx';

export const ContourAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Contouring Agent',
          description: 'Elevation analysis and contour mapping. Generate contour lines, analyze topography, create elevation maps, and visualize terrain data in real-time.',
          url: 'https://contour.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Contouring Agent', item: 'https://contour.landsurv.ai' },
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
                <ContourIcon className="w-16 h-16 text-amber-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-amber-400">Contouring Agent</h3>
                    <p className="text-gray-300">Visualize topography with AI-generated contour lines.</p>
                </div>
            </div>
            <p>
                The Contouring Agent brings topographic modeling directly into your project. Based on the point data collected and generated across all other agents, this tool can create and visualize contour lines, providing an immediate understanding of your site's terrain.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">TIN-Based Contouring:</strong> The agent uses a Triangulated Irregular Network (TIN) methodology, a standard in civil engineering, to accurately interpolate elevations between your data points.</li>
                <li><strong className="text-gray-100">Custom Intervals:</strong> Simply tell the agent your desired contour interval (e.g., "Generate contours at a 1-foot interval") to create a custom topographic map.</li>
                <li><strong className="text-gray-100">Data-Driven Visualization:</strong> Contours are generated as standard line and point data, making them fully integrated with the canvas, Point Editor, and DXF export functions.</li>
                <li><strong className="text-gray-100">Selective Contouring:</strong> Focus on specific areas by instructing the agent to only use points with certain descriptions, such as "Create 5-foot contours using only 'GROUND' shots."</li>
            </ul>
            <p>
                This agent provides a rapid and powerful way to visualize elevation changes, identify drainage patterns, and understand the topography of your project site without leaving the application.
            </p>
        </div>
    );
};

export const ProfileAgentContent: React.FC = () => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <ProfileIcon className="w-16 h-16 text-sky-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-sky-400">Profile & Cross Section Agent</h3>
                    <p className="text-gray-300">Generate and analyze elevation profiles along alignments.</p>
                </div>
            </div>
            <p>
                The Profile & Cross Section Agent allows you to create detailed elevation profiles from your project's point and line data. This tool is essential for understanding terrain, designing grades, and calculating volumes.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Profile from Line:</strong> Select any line on your canvas to instantly generate a profile showing the ground elevation along its length.</li>
                <li><strong className="text-gray-100">Centerline Profiles:</strong> Create profiles along complex horizontal alignments defined in the Stationing & CL agent.</li>
                <li><strong className="text-gray-100">Cross Sections:</strong> Generate cross sections at specified intervals along a profile line or centerline to analyze areas.</li>
                <li><strong className="text-gray-100">Interactive Analysis:</strong> Query the AI about slopes, elevations, and high/low points directly from the profile view.</li>
            </ul>
        </div>
    );
};
