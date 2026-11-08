import React, { useEffect } from 'react';
import { GisAgentIcon } from '../icons.tsx';

export const GisAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'GIS Agent',
          description: 'Spatial data analysis and mapping. Work with GeoJSON data, perform spatial analysis, create maps, and integrate geographic information seamlessly.',
          url: 'https://gis.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'GIS Agent', item: 'https://gis.landsurv.ai' },
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
                <GisAgentIcon className="w-16 h-16 text-teal-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-teal-400">GIS Agent</h3>
                    <p className="text-gray-300">Bridge the gap between GIS and land surveying.</p>
                </div>
            </div>
            <p>
                The GIS Agent works with both GeoJSON and live public map services. Upload a .geojson or .json file, or simply ask for a layer — county lines, State Plane / SPC zones, school districts, voting districts, streams, water bodies, watersheds, parcels, and other public GIS topics. The agent searches PASDA, ArcGIS Online, and LandSurv Scout, verifies the layer against your project footprint, and draws it on its own CAD layer.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Live Map Layers:</strong> Ask in natural language ("show me county lines" or "draw streams and water bodies"). The agent resolves the topic at runtime rather than relying on a fixed list of layers.</li>
                <li><strong className="text-gray-100">ArcGIS Server Browser:</strong> Paste any public ArcGIS REST endpoint — a whole server, a folder, a service, or a single layer — and drill down through its folders, services, and layers just like a desktop GIS data-source manager. A curated catalog of federal (Census TIGERweb, USGS, FEMA flood zones, BLM PLSS, USFS, NPS) and state/county/city servers is built in.</li>
                <li><strong className="text-gray-100">GeoJSON Analysis:</strong> Ask the agent to "list all features of type 'Polygon'" or "summarize the properties of the feature named 'Lot-12'".</li>
                <li><strong className="text-gray-100">Direct Visualization:</strong> Use natural language to plot your data. A simple command like "plot all features" will instruct the AI to return a GeoJSON FeatureCollection that is then automatically rendered on the canvas.</li>
                <li><strong className="text-gray-100">Data Conversion:</strong> The agent, in conjunction with the application, converts GeoJSON geometry (Points, LineStrings, Polygons) into standard survey points and lines, making them available in the Point Editor for further work.</li>
                <li><strong className="text-gray-100">Coordinate System Awareness:</strong> While GeoJSON is typically in WGS84, the AI can be instructed to perform transformations if necessary (though the canvas primarily works in a projected system).</li>
            </ul>
            <p>
                This agent provides a crucial link between the world of Geographic Information Systems and the precision requirements of land surveying, enabling powerful new data integration workflows.
            </p>
        </div>
    );
};
