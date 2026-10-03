import React, { useEffect } from 'react';
import { CrosshairsIcon } from '../icons';

export const GpsAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'GPS Stakeout Agent',
          description: 'On-site positioning and stakeout guidance. Generate stakeout data, calculate positions and offsets, guide field operations, and integrate with GPS receivers.',
          url: 'https://gps.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'GPS Stakeout Agent', item: 'https://gps.landsurv.ai' },
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
                <CrosshairsIcon className="w-16 h-16 text-blue-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-blue-400">GPS Stakeout Agent</h3>
                    <p className="text-gray-300">Turn your device into a powerful field data collection tool.</p>
                </div>
            </div>
            <p>
                The GPS Stakeout Agent leverages your device's built-in GPS to bring powerful stakeout and topographic survey capabilities directly into the field. By integrating with your project's coordinate system, it provides real-time guidance and data collection.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Real-Time Stakeout:</strong> Select a target point and get live updates on the direction and distance you need to travel to reach it, displayed on an intuitive compass interface.</li>
                <li><strong className="text-gray-100">Projection-Aware Collection:</strong> Configure your project's State Plane Coordinate System in the settings. The agent will automatically convert your GPS coordinates (WGS84) to your local system when storing new points.</li>
                <li><strong className="text-gray-100">Cut/Fill Information:</strong> When staking out a point with a design elevation, the agent provides real-time cut or fill information based on your device's altitude.</li>
                <li><strong className="text-gray-100">Store As-Staked Points:</strong> Once you've reached your target, you can store an as-staked point, which is automatically linked to the original design point for quality control.</li>
            </ul>
            <p>
                While not a substitute for survey-grade GNSS equipment, the GPS Stakeout Agent is an invaluable tool for preliminary site visits, reconnaissance, and non-critical stakeout tasks.
            </p>
        </div>
    );
};
