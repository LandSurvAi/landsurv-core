import React, { useEffect } from 'react';
import { StormwaterIcon } from '../icons.tsx';

export const StormwaterAgentContent: React.FC = () => {
  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Stormwater Agent',
        description:
          'Preliminary stormwater runoff using the Rational Method (Q = CiA), composite surface coefficients, and FAA time of concentration, with copy-ready engineering reports.',
        url: 'https://stormwater.landsurv.ai',
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
          { '@type': 'ListItem', position: 3, name: 'Stormwater Agent', item: 'https://stormwater.landsurv.ai' },
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
        <StormwaterIcon className="h-16 w-16 flex-shrink-0 text-sky-400" />
        <div>
          <h3 className="text-2xl font-bold text-sky-400">Stormwater Agent</h3>
          <p className="text-gray-300">
            Preliminary runoff, time of concentration, and conveyance sizing — with the calculation
            trail a reviewer can follow.
          </p>
        </div>
      </div>
      <p>
        The Stormwater Agent is LandSurv.ai&apos;s experimental hydrology and hydraulics specialist. It
        covers national Rational Method runoff, detention sizing and routing, and open-channel
        capacity; full storm sewer layout remains a later phase.
      </p>
      <ul className="list-inside list-disc space-y-2 pl-2 text-gray-300">
        <li>
          <strong className="text-gray-100">Composite Rational Method:</strong> Enter each contributing
          surface and area; the agent area-weights the runoff coefficients and reports peak flow in cfs
          and gpm using Q = C i A.
        </li>
        <li>
          <strong className="text-gray-100">National rainfall:</strong> NOAA Atlas 14 point
          precipitation-frequency lookups for the site coordinates, with editable runoff
          coefficients and a manual design intensity for locations outside Atlas 14 coverage or
          jurisdiction-specific requirements.
        </li>
        <li>
          <strong className="text-gray-100">Detention and conveyance:</strong> Modified Rational
          hydrographs, level-pool basin routing with orifice/weir outlets, and Manning channel or
          pipe capacity with normal and critical depth.
        </li>
        <li>
          <strong className="text-gray-100">Time of concentration:</strong> FAA Tc from the longest flow
          path and average slope, and the design storm duration automatically follows Tc.
        </li>
        <li>
          <strong className="text-gray-100">Applicability guardrails:</strong> Flags drainage areas over
          10 and 50 acres, unusually high composite coefficients, and cases where a full continuous
          simulation (EPA SWMM, HEC-HMS, or an approved local model) is required instead.
        </li>
        <li>
          <strong className="text-gray-100">Copy-ready reports:</strong> A formatted calculation with
          surface breakdown, weighted C, intensity, formula substitution, warnings, and citations for
          the project report.
        </li>
        <li>
          <strong className="text-gray-100">CACP skills:</strong> Other agents can request runoff or Tc
          over the Cross-Agent Communications Protocol and reuse the stored result in the fieldbook.
        </li>
      </ul>
      <p>
        Preliminary planning only. All results should be independently verified by a licensed
        professional engineer against the governing jurisdiction&apos;s design manual.
      </p>
    </div>
  );
};

export default StormwaterAgentContent;
