import React from 'react';
import type { TimelineIcon } from '../../utils/timeline/types.ts';

/**
 * Small, single-meaning glyphs for timeline entries. They share one 16px
 * stroke grid so the strip reads as a family without every step looking alike.
 */
export const TIMELINE_ICON_LABELS: Record<TimelineIcon, string> = {
  baseline: 'Baseline alignment',
  sketch: 'Sketch',
  upload: 'Point upload',
  deed: 'Deed',
  boundary: 'Boundary',
  c3d: 'Civil 3D',
  question: 'Question',
  shrinkwrap: 'Shrinkwrap',
  aoi: 'Area of interest',
  surface: 'Surface',
  contour: 'Contours',
  station: 'Stationing & centerline',
  export: 'Export',
  display: 'Display',
  generate: 'Generated',
  ai: 'Agent',
  feature: 'Feature',
};

export const TimelineGlyph: React.FC<{
  icon: TimelineIcon;
  className?: string;
}> = ({ icon, className = 'h-3.5 w-3.5' }) => {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className}${icon === 'sketch' || icon === 'baseline' ? ' text-white' : ''}`}
    >
      {icon === 'baseline' && (
        <rect x="3" y="3" width="10" height="10" rx="1" />
      )}
      {icon === 'sketch' && (
        <>
          <path d="m3 13 1-3 7-7 2 2-7 7-3 1Z" />
          <path d="m9.5 4.5 2 2M4 10l2 2" />
        </>
      )}
      {icon === 'upload' && (
        <>
          <path d="M3 9.5V13h10V9.5" />
          <path d="M8 10V2m0 0L5 5m3-3 3 3" />
        </>
      )}
      {icon === 'deed' && (
        <>
          <path d="M4 2h7a1 1 0 0 1 1 1v9a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V3a1 1 0 0 1 1-1Z" />
          <path d="M5 5h5M5 8h5M5 11h3" />
        </>
      )}
      {icon === 'boundary' && (
        <>
          <path d="M3 5.2 8 2l5 3.2v5.6L8 14l-5-3.2V5.2Z" />
          <circle cx="3" cy="5.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="13" cy="5.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
        </>
      )}
      {icon === 'c3d' && (
        <>
          <path d="m8 2 5 3v6l-5 3-5-3V5l5-3Z" />
          <path d="m3 5 5 3 5-3M8 8v6" />
        </>
      )}
      {icon === 'question' && (
        <>
          <path d="M3 2h10v8H8l-3 2.5V10H3V2Z" />
          <path d="M6.2 5a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.7.5-.7 1.1" />
          <circle cx="8" cy="9.3" r=".6" fill="currentColor" stroke="none" />
        </>
      )}
      {icon === 'shrinkwrap' && (
        <>
          <path d="M2.5 6 6 2.5l4 .5 3.5 4-2 4.5-5.5 1L3 9.5 2.5 6Z" />
          <circle cx="6" cy="2.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="13.5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="6" cy="12.5" r="1" fill="currentColor" stroke="none" />
        </>
      )}
      {icon === 'aoi' && (
        <>
          <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
          <circle cx="8" cy="8" r="2.1" />
          <circle cx="8" cy="8" r=".65" fill="currentColor" stroke="none" />
        </>
      )}
      {icon === 'surface' && (
        <>
          <path d="M2 13 8 3l6 10H2Z" />
          <path d="M5 8h6M8 3 7 13M8 3l3 10" />
        </>
      )}
      {icon === 'contour' && (
        <>
          <path d="M1.5 5.5c1.5-3 3.5 3 5 0s3.5 3 5 0 2 .8 3 .5" />
          <path d="M1.5 10.5c1.5-3 3.5 3 5 0s3.5 3 5 0 2 .8 3 .5" />
        </>
      )}
      {icon === 'station' && (
        <>
          <path
            d="M1.6 13.7 4.4 8.8c1.1-2 3-4 4.4-4.4l4.6-1.2"
            strokeWidth="1.7"
            strokeLinecap="square"
          />
          <path
            d="M4.4 8.8 6.2 4.7 8.8 4.3"
            strokeWidth="0.9"
            strokeDasharray="1.3 1.1"
            opacity="0.65"
            strokeLinecap="square"
          />
          <polygon
            points="6.2,2.1 7.5,4.7 4.9,4.7"
            fill="currentColor"
            fillOpacity="0.25"
            strokeWidth="1.05"
            strokeLinejoin="miter"
          />
          <circle cx="6.2" cy="4.7" r="0.5" fill="currentColor" stroke="none" />
          <path d="M2.1 10.7l1.8 1.05M12.2 2.4l.55 2.05" strokeWidth="1.2" strokeLinecap="square" />
        </>
      )}
      {icon === 'export' && (
        <>
          <path d="M3 9.5V13h10V9.5" />
          <path d="M8 2v8m0 0L5 7m3 3 3-3" />
        </>
      )}
      {icon === 'display' && (
        <>
          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
          <circle cx="8" cy="8" r="2.1" />
        </>
      )}
      {icon === 'generate' && (
        <>
          <path d="M8 1.5 9.35 6.65 14.5 8 9.35 9.35 8 14.5 6.65 9.35 1.5 8l5.15-1.35L8 1.5Z" />
          <path d="M12.5 2.5v2M11.5 3.5h2" />
        </>
      )}
      {icon === 'ai' && (
        <>
          <rect x="3.5" y="3.5" width="9" height="9" rx="2" />
          <path d="M6.5 6.5v3M9.5 6.5v3M3.5 8h1.5M11 8h1.5M6.5 3.5V2M9.5 3.5V2M6.5 14v-1.5M9.5 14v-1.5" />
        </>
      )}
      {icon === 'feature' && (
        <>
          <path d="M10.5 2a3 3 0 0 0-3.2 4.2l-4.8 4.8a1.4 1.4 0 1 0 2 2l4.8-4.8A3 3 0 0 0 14 5.5L12 7.5 10 5.5l2-2a3 3 0 0 0-1.5-1.3Z" />
        </>
      )}
    </svg>
  );
};

export default TimelineGlyph;
