import React, { useEffect } from 'react';
import { ScaleIcon } from '../icons';

export const StationAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Stationing & Centerline Agent',
          description: 'Master alignment design and stationing. Analyze centerline files, calculate stations and offsets, perform stationing calculations, and manage alignment data.',
          url: 'https://station.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Stationing & Centerline Agent', item: 'https://station.landsurv.ai' },
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
                <ScaleIcon className="w-16 h-16 text-purple-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-purple-400">Stationing & CL Agent</h3>
                    <p className="text-gray-300">Define and calculate horizontal alignments with ease.</p>
                </div>
            </div>
            <p>
                The Stationing & Centerline (CL) Agent provides a powerful, interactive environment for working with horizontal alignments. Whether you're starting from scratch or using an existing file, this agent simplifies complex geometric calculations.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Interactive PI Editor:</strong> Manually input the Northing and Easting of your Points of Intersection (PIs) and define curve radii to build your alignment visually.</li>
                <li><strong className="text-gray-100">File Upload:</strong> Import existing centerline data by uploading a simple .cl file, formatted with PI coordinates and curve information.</li>
                <li><strong className="text-gray-100">Real-Time Visualization:</strong> As you define your alignment, it is instantly drawn on the canvas, including tangents and curves, providing immediate visual feedback.</li>
                <li><strong className="text-gray-100">Stakeout Calculations:</strong> Use the stakeout panel to calculate the coordinate of any point by its station and offset from the defined centerline. The resulting point is then plotted on the canvas.</li>
            </ul>
            <p>
                This agent is essential for any road design, utility layout, or construction stakeout project, integrating seamlessly with the Point Editor for a complete workflow.
            </p>
        </div>
    );
};
