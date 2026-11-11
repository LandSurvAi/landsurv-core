import React, { useEffect } from 'react';
import { DirtVolumeIcon } from '../icons.tsx';

export const DirtVolumeAgentContent: React.FC = () => {
  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Dirt Volume Agent',
        description:
          'Earthwork quantity takeoffs by average end area and TIN-to-TIN surface comparison, with saved scenario comparisons and copy-ready quantity reports.',
        url: 'https://dirtvolume.landsurv.ai',
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
          { '@type': 'ListItem', position: 3, name: 'Dirt Volume Agent', item: 'https://dirtvolume.landsurv.ai' },
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
        <DirtVolumeIcon className="h-16 w-16 flex-shrink-0 text-amber-400" />
        <div>
          <h3 className="text-2xl font-bold text-amber-400">Dirt Volume Agent</h3>
          <p className="text-gray-300">
            Obtain, compare, and report earthwork quantities — with the method and assumptions a
            reviewer can follow.
          </p>
        </div>
      </div>
      <p>
        The Dirt Volume Agent is LandSurv.ai&apos;s earthwork quantity specialist. It computes cut and
        fill from cross sections, compares existing and proposed TIN surfaces already in the project,
        runs grid takeoffs, and measures stockpiles.
      </p>
      <ul className="list-inside list-disc space-y-2 pl-2 text-gray-300">
        <li>
          <strong className="text-gray-100">End-area volumes:</strong> Enter station, cut area, and fill
          area for each section; the agent applies average end area or Simpson&apos;s rule and reports
          cut and fill in cubic yards.
        </li>
        <li>
          <strong className="text-gray-100">TIN-to-TIN comparison:</strong> Pick the existing-ground and
          proposed surfaces; the agent samples the overlap and returns cut, fill, plan area, and
          maximum depths.
        </li>
        <li>
          <strong className="text-gray-100">Grid and stockpile takeoffs:</strong> Grade pads and lots
          from existing/proposed elevation grids, or measure a pile above a flat base from top shots.
        </li>
        <li>
          <strong className="text-gray-100">Scenario comparison:</strong> Save named options with cut
          swell and fill shrink factors, then compare deltas, percent changes, net spread, and the
          best-balanced option.
        </li>
        <li>
          <strong className="text-gray-100">Reports and PDFs:</strong> Produce a copy-ready quantity
          report with method notes, warnings, and comparison table, then export it as a PDF.
        </li>
        <li>
          <strong className="text-gray-100">CACP skills:</strong> Other agents can request end-area,
          grid, stockpile, or TIN volumes over the Cross-Agent Communications Protocol and reuse the
          saved scenarios.
        </li>
      </ul>
      <p>
        Quantity takeoff only. Section areas, surface models, shrink/swell factors, and final
        quantities should be verified by a licensed professional before bidding, construction, or
        payment.
      </p>
    </div>
  );
};

export default DirtVolumeAgentContent;
