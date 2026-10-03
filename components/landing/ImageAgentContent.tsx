import React, { useEffect } from 'react';
import { CameraIcon } from '../icons';

export const ImageAgentContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Image Analyzer Agent',
          description: 'Extract data from photos and images. Analyze site photos, extract coordinates and measurements, identify features, and interpret visual survey documentation.',
          url: 'https://image.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'Image Analyzer Agent', item: 'https://image.landsurv.ai' },
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
                <CameraIcon className="w-16 h-16 text-red-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-red-400">Image Analyzer Agent</h3>
                    <p className="text-gray-300">Unlock insights from your site photos.</p>
                </div>
            </div>
            <p>
                The Image Analyzer Agent turns your project photos into a rich, searchable, and intelligent data source. Upload site photos to leverage powerful vision AI that can describe, tag, and help you connect visual context to your survey data.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">AI-Powered Descriptions:</strong> Ask the agent to "describe what you see in IMG_01.jpg" to get a detailed textual analysis of the image content.</li>
                <li><strong className="text-gray-100">Intelligent Tagging:</strong> The agent can identify key features. Ask, "Are there any utility markings visible in these photos?" to quickly sift through images for relevant information.</li>
                <li><strong className="text-gray-100">Point Association:</strong> Link visual data directly to your survey points. Use a simple command like "Associate IMG_02.jpg with point 501" to create a connection that can be reviewed in the Point Editor.</li>
                <li><strong className="text-gray-100">Interactive Markup (Experimental):</strong> Ask the agent to highlight features directly on the image, such as "draw a circle around the fire hydrant in IMG_03.jpg".</li>
            </ul>
            <p>
                By integrating visual data directly into your workflow, the Image Analyzer helps you create a more complete and context-aware project record.
            </p>
        </div>
    );
};
