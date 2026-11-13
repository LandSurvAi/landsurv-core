import React from 'react';
import type { ContourBlendPreview, IsoPath } from '../types.ts';

interface ContourBlendHighlightOverlayProps {
  preview: ContourBlendPreview | null;
  worldToScreen: (easting: number, northing: number) => { x: number; y: number };
}

const MAX_HIGHLIGHT_PATHS = 500;
const MAX_ENDPOINT_MARKERS = 80;
const MAX_REJECTED_MARKERS = 24;

function screenPath(
  vertices: Array<{ x: number; y: number }> | undefined,
  worldToScreen: ContourBlendHighlightOverlayProps['worldToScreen'],
  close = false,
): string {
  if (!vertices || vertices.length < 2) return '';
  const parts: string[] = [];
  for (const vertex of vertices) {
    const screen = worldToScreen(vertex.x, vertex.y);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
    parts.push(`${parts.length === 0 ? 'M' : 'L'} ${screen.x.toFixed(1)} ${screen.y.toFixed(1)}`);
  }
  if (parts.length === 0) return '';
  return close ? `${parts.join(' ')} Z` : parts.join(' ');
}

function pathPoints(path: IsoPath | undefined): Array<{ x: number; y: number }> {
  return path?.vertices ?? [];
}

/**
 * Screen-space highlight of a staged contour blend.
 *
 * This never modifies drawing state: it sits above the canvas and shows the
 * exact transition curves, ESRI pieces to trim, open ends, and rejected joins
 * the review dialog is describing. Nothing here survives Apply/Cancel.
 */
export const ContourBlendHighlightOverlay: React.FC<ContourBlendHighlightOverlayProps> = ({
  preview,
  worldToScreen,
}) => {
  if (!preview) return null;

  const boundaryPath = screenPath(preview.boundary, worldToScreen, true);
  const outsidePaths = preview.gisOutsidePaths.slice(0, MAX_HIGHLIGHT_PATHS);
  const trimmedPaths = preview.gisTrimmedPaths.slice(0, MAX_HIGHLIGHT_PATHS);
  const connectors = preview.connectors;
  const matched = preview.matchedJoins.slice(0, MAX_ENDPOINT_MARKERS);
  const unmatched = preview.unmatchedGisEndpoints.slice(0, MAX_ENDPOINT_MARKERS);
  const rejected = preview.rejectedJoins.slice(0, MAX_REJECTED_MARKERS);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden="true"
      data-testid="contour-blend-highlight"
    >
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        {boundaryPath && (
          <path
            d={boundaryPath}
            fill="rgba(129,140,248,0.06)"
            stroke="#818cf8"
            strokeWidth={1.6}
            strokeDasharray="9 5"
            strokeLinejoin="round"
          />
        )}

        {/* ESRI linework that the blend would remove inside the boundary. */}
        {trimmedPaths.map((path, index) => {
          const d = screenPath(pathPoints(path), worldToScreen);
          if (!d) return null;
          return (
            <path
              key={`trimmed-${index}`}
              d={d}
              fill="none"
              stroke="#fb7185"
              strokeWidth={1}
              strokeOpacity={0.42}
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* ESRI linework that survives outside the boundary. */}
        {outsidePaths.map((path, index) => {
          const d = screenPath(pathPoints(path), worldToScreen);
          if (!d) return null;
          return (
            <path
              key={`outside-${index}`}
              d={d}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.1}
              strokeOpacity={0.45}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Rejected pairings: shown so a surveyor can see what was refused. */}
        {rejected.map((join, index) => {
          const gis = worldToScreen(join.gis.x, join.gis.y);
          const survey = worldToScreen(join.survey.x, join.survey.y);
          if (!Number.isFinite(gis.x) || !Number.isFinite(survey.x)) return null;
          return (
            <g key={`rejected-${index}`}>
              <line
                x1={gis.x}
                y1={gis.y}
                x2={survey.x}
                y2={survey.y}
                stroke="#fb7185"
                strokeWidth={1}
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
              <g stroke="#fb7185" strokeWidth={1.8} strokeLinecap="round">
                <line x1={gis.x - 4} y1={gis.y - 4} x2={gis.x + 4} y2={gis.y + 4} />
                <line x1={gis.x + 4} y1={gis.y - 4} x2={gis.x - 4} y2={gis.y + 4} />
                <title>
                  {`Rejected ${join.gis.elevation.toFixed(2)}' join${join.issues?.length ? `: ${join.issues.join('; ')}` : ''}`}
                </title>
              </g>
            </g>
          );
        })}

        {/* New transition curves: the primary action being proposed. */}
        {connectors.map((connector, index) => {
          const d = screenPath(connector.vertices, worldToScreen);
          if (!d) return null;
          return (
            <g key={`connector-${index}`}>
              <path
                d={d}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={9}
                strokeOpacity={0.16}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={d}
                fill="none"
                stroke="#67e8f9"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{`New ${connector.elevation.toFixed(2)}' transition curve`}</title>
              </path>
            </g>
          );
        })}

        {/* Matched hand-offs: green is the survey end, cyan the ESRI end. */}
        {matched.map((join, index) => {
          const gis = worldToScreen(join.gis.x, join.gis.y);
          const survey = worldToScreen(join.survey.x, join.survey.y);
          if (!Number.isFinite(gis.x) || !Number.isFinite(survey.x)) return null;
          return (
            <g key={`matched-${index}`}>
              <circle cx={gis.x} cy={gis.y} r={2.6} fill="#22d3ee" stroke="#0e7490" strokeWidth={1}>
                <title>{`ESRI ${join.gis.elevation.toFixed(2)}'`}</title>
              </circle>
              <circle cx={survey.x} cy={survey.y} r={3.2} fill="#34d399" stroke="#065f46" strokeWidth={1}>
                <title>{`Survey ${join.survey.elevation.toFixed(2)}'`}</title>
              </circle>
            </g>
          );
        })}

        {/* ESRI ends the blend cannot join at this distance/elevation. */}
        {unmatched.map((endpoint, index) => {
          const screen = worldToScreen(endpoint.x, endpoint.y);
          if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
          return (
            <g key={`unmatched-${index}`} transform={`translate(${screen.x} ${screen.y}) rotate(45)`}>
              <rect
                x={-3.4}
                y={-3.4}
                width={6.8}
                height={6.8}
                fill="#fbbf24"
                fillOpacity={0.65}
                stroke="#b45309"
                strokeWidth={1}
              >
                <title>{`Open ESRI end ${endpoint.elevation.toFixed(2)}' — no same-elevation survey match within ${preview.maxJoinDistance.toFixed(0)} ft`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ContourBlendHighlightOverlay;
