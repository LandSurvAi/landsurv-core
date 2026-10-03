import React, { useEffect } from 'react';
import { BrainCircuitIcon } from '../icons';

export const RawAgentContent: React.FC = () => {
    // Inject structured data for SEO
    useEffect(() => {
      const productSchema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'RAW Crawler Agent',
        description: 'Your AI-powered field data processor. Parse and analyze raw surveyor data, perform COGO calculations, detect errors, and visualize your data dynamically.',
        url: 'https://raw.landsurv.ai',
        image: 'https://landsurv.ai/favicon-512.png',
        brand: { '@type': 'Brand', name: 'LandSurv.ai' },
        manufacturer: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
      };

      const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
          { '@type': 'ListItem', position: 2, name: 'Agents', item: 'https://landsurv.ai?page=agents' },
          { '@type': 'ListItem', position: 3, name: 'RAW Crawler Agent', item: 'https://raw.landsurv.ai' },
        ],
      };

      const script1 = document.createElement('script');
      script1.type = 'application/ld+json';
      script1.textContent = JSON.stringify(productSchema);
      document.head.appendChild(script1);

      const script2 = document.createElement('script');
      script2.type = 'application/ld+json';
      script2.textContent = JSON.stringify(breadcrumbSchema);
      document.head.appendChild(script2);

      return () => {
        if (script1.parentNode) script1.parentNode.removeChild(script1);
        if (script2.parentNode) script2.parentNode.removeChild(script2);
      };
    }, []);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <BrainCircuitIcon className="w-16 h-16 text-cyan-400 flex-shrink-0" />
                <div>
                    <h3 className="text-2xl font-bold text-cyan-400">RAW Crawler Agent</h3>
                    <p className="text-gray-300">Your AI-powered field data processor.</p>
                </div>
            </div>
            <p>
                The RAW Crawler Agent is your first step in transforming raw field data into actionable intelligence. By uploading a standard surveyor's .RAW file, you unlock a powerful suite of analytical tools accessible through natural language.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                <li><strong className="text-gray-100">Intelligent Parsing:</strong> The agent reads and understands the structure of your .RAW file, identifying setups, shots, control points, and descriptions.</li>
                <li><strong className="text-gray-100">Error Detection:</strong> Ask the agent to "check for errors" and it will perform common checks, such as analyzing closure reports and looking for duplicate point numbers.</li>
                <li><strong className="text-gray-100">Instant COGO:</strong> Perform Coordinate Geometry calculations on the fly. Simply ask to "inverse between points 501 and 502" or "calculate the area of points 1 through 5".</li>
                <li><strong className="text-gray-100">Dynamic Visualization:</strong> Bring your data to life. Ask the agent to "draw all points with 'tree' in the description" or "plot the control traverse" to see your data instantly on the canvas.</li>
            </ul>
            <p>
                The RAW Crawler agent streamlines the initial data review process, allowing you to quickly identify key information and potential issues before ever opening a CAD program.
            </p>
        </div>
    );
};
