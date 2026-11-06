import React, { useEffect } from 'react';
import { RoadIcon } from '../icons';

export const RoadingAgentContent: React.FC = () => {
  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Roading Agent',
        description:
          'Synthesize existing roads from survey points, background imagery, and OpenStreetMap ways, and design proposed road corridors, typical sections, profiles, and cross sections.',
        url: 'https://roading.landsurv.ai',
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
          { '@type': 'ListItem', position: 3, name: 'Roading Agent', item: 'https://roading.landsurv.ai' },
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
      <div className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        <RoadIcon className="h-16 w-16 flex-shrink-0 text-amber-400" />
        <div>
          <h3 className="text-2xl font-bold text-amber-400">Roading Agent</h3>
          <p className="text-gray-300">
            Synthesize existing roads from points &amp; imagery and design proposed road corridors with Stationing &amp; CL and Profile integration.
          </p>
        </div>
      </div>
      <p>
        The Roading Agent is LandSurv.ai&apos;s first-class civil roadway specialist for both <strong>existing road reconstruction</strong> and <strong>proposed roadway corridor design</strong>. It is deeply integrated with CACP, <code>.lsvz</code> project memory, and A2UI interactive surfaces.
      </p>
      <ul className="list-inside list-disc space-y-2 pl-2 text-gray-300">
        <li>
          <strong className="text-gray-100">Existing Road Synthesis:</strong> Combines field-collected road and curb shots (<code>EP</code>, <code>EOP</code>, <code>CL</code>, <code>CURB</code>, <code>TBC</code>, <code>ROW</code>), background aerial orthophoto width calibration, and OpenStreetMap road ways into clean CAD polylines and oriented street labels.
        </li>
        <li>
          <strong className="text-gray-100">Proposed Corridor &amp; Typical Section Designer:</strong> Configure travel lanes, lane widths, normal crown slope (%), curb &amp; gutter, sidewalks, and right-of-way (ROW) offsets along any alignment.
        </li>
        <li>
          <strong className="text-gray-100">Stationing &amp; CL + Profile Agent Coupling:</strong> Automatically syncs horizontal <code>Centerline</code> geometry with the Stationing &amp; CL Agent and generates centerline elevation profiles and stationed cross sections via the Profile Agent.
        </li>
        <li>
          <strong className="text-gray-100">Cul-de-Sacs, Curb Fillets &amp; Driveway Aprons:</strong> Generate turnaround bulbs, intersection curb returns, and flared residential driveway aprons in one click or conversational command.
        </li>
      </ul>
    </div>
  );
};

export default RoadingAgentContent;
