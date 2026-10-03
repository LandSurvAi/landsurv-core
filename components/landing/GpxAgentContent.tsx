import React, { useEffect } from 'react';
import { MapPinIcon } from '../icons';

export const GpxAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'GPX Data Tools',
          description: 'Tools for importing and processing GPS exchange format data. Parse GPX files, extract waypoints and tracks, and visualize GPS data.',
          url: 'https://gpx.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'GPX Data Tools', item: 'https://gpx.landsurv.ai' },
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
                <MapPinIcon className="w-16 h-16 text-red-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-red-400">GPX Data Tools</h3>
                    <p className="text-gray-300">Process GPS exchange format data with ease.</p>
                </div>
            </div>
            <p>
                GPX (GPS Exchange Format) is a standard format for sharing GPS and mapping data. LandSurv.ai provides powerful tools for working with GPX files, allowing you to import, analyze, and visualize GPS data within the platform.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Import GPS Data:</strong> Upload .gpx files containing waypoints, routes, and tracks from your GPS devices or mapping applications.</li>
                <li><strong className="text-gray-100">Track Visualization:</strong> See your GPS tracks displayed on the interactive canvas with detailed information about each point.</li>
                <li><strong className="text-gray-100">Data Analysis:</strong> Ask the AI agent questions about your GPS data, such as total distance traveled, elevation gain, or time statistics.</li>
                <li><strong className="text-gray-100">Coordinate Conversion:</strong> Convert between GPX coordinates and your project's coordinate system for seamless integration with your survey data.</li>
                <li><strong className="text-gray-100">Export Options:</strong> Export analyzed data in multiple formats to use in CAD, GIS, and other surveying software.</li>
            </ul>
            <p>
                Whether you're processing field-collected GPS data or integrating external mapping sources, the GPX tools make it easy to work with this universal GPS data format.
            </p>
        </div>
    );
};
