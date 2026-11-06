import React from 'react';

/**
 * High-detail CAD toolbar glyphs.
 *
 * These share the 24×24 / 1.5px-stroke language of `icons.tsx` but are drawn
 * for small (18–20px) toolbar and sidebar targets: one strong silhouette, fine
 * secondary construction lines, and selective fills for depth.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

const Base: React.FC<IconProps> = ({ children, ...props }) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    {children}
  </svg>
);

/** Viewport frame with survey crosshair and magnifier — zoom / extents. */
export const ToolbarZoomIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.4" strokeWidth="1.4" fill="currentColor" fillOpacity="0.07" />
    <path d="M2.4 6.2V2.4h3.8M10 2.4h3.6v3.8M13.6 10v3.6H10M6.2 13.6H2.4V10" strokeWidth="1.05" opacity="0.8" />
    <circle cx="15.8" cy="15.8" r="4.7" strokeWidth="1.7" fill="currentColor" fillOpacity="0.08" />
    <circle cx="15.8" cy="15.8" r="1.15" fill="currentColor" stroke="none" />
    <path
      d="M15.8 12.7v1.2M15.8 17.7v1.2M12.7 15.8h1.2M17.7 15.8h1.2"
      strokeWidth="1"
      opacity="0.75"
      strokeLinecap="round"
    />
    <path d="M19.2 19.2 22 22" strokeWidth="2.1" strokeLinecap="round" />
  </Base>
);

/** Engineering scale triangle with graduated ticks — annotation scale. */
export const ToolbarAnnotationScaleIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M3 21 21 21 3 3Z" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.07" />
    <path d="M6.2 18.4v-2.5M9.4 18.4v-2.5M12.6 18.4v-2.5M15.8 18.4v-2.5M19 18.4v-2.5" strokeWidth="1.05" opacity="0.85" />
    <path d="M6.2 6.2H3M6.2 9.4H3M6.2 12.6H3M6.2 15.8H3" strokeWidth="1.05" opacity="0.7" />
    <path d="M3 21h18" strokeWidth="1.8" />
    <path d="M3 3v18" strokeWidth="1.8" />
    <circle cx="7.2" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

/**
 * Open eye over stacked layer plates — data visibility.
 * The eye is the hero so the glyph reads as a visibility control first and a
 * layer stack second; the plates below are kept as two light chevrons so the
 * shape stays quiet at 18px next to the sidebar labels.
 */
export const ToolbarLayersIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path
      d="M4.9 7.3C7 4.3 9.3 3.1 12 3.1s5 1.2 7.1 4.2c-2.1 3-4.4 4.2-7.1 4.2s-5-1.2-7.1-4.2Z"
      strokeWidth="1.45"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.08"
    />
    <circle cx="12" cy="7.3" r="2.4" strokeWidth="1.1" fill="currentColor" fillOpacity="0.16" />
    <circle cx="12" cy="7.3" r="1.05" fill="currentColor" stroke="none" />
    <path d="M3.1 13.5 12 17.9 20.9 13.5" strokeWidth="1.35" strokeLinejoin="round" />
    <path d="M3.1 17 12 21.4 20.9 17" strokeWidth="1.35" strokeLinejoin="round" opacity="0.6" />
  </Base>
);

/** TIN facet surface with a highlighted vertex — surface / TIN shading. */
export const ToolbarSurfaceIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M2 18.6 7.2 8.4 12 13.2 16.8 4.8 22 10.8" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M7.2 8.4 7.8 18.9 12 13.2 13.4 20.4 16.8 4.8 17.4 15.6 22 10.8" strokeWidth="0.9" opacity="0.6" />
    <path d="M2 18.6 7.2 8.4 12 13.2 7.8 18.9Z" fill="currentColor" fillOpacity="0.13" strokeWidth="0.8" strokeLinejoin="round" />
    <path d="M2 18.6h20" strokeWidth="1.1" opacity="0.5" strokeLinecap="round" />
    <circle cx="16.8" cy="4.8" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

/** Arrow cursor over a dashed pick window with a grip node — selection. */
export const ToolbarSelectIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path
      d="M4.6 2.8v14.1l3.3-3 2.3 5.3 2.6-1.1-2.3-5.2h4.6z"
      fill="currentColor"
      fillOpacity="0.18"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
    <path d="M13.8 18.6h7v3.6h-7z" strokeWidth="1.05" strokeDasharray="1.6 1.4" />
    <circle cx="7.6" cy="6.4" r="1" fill="currentColor" stroke="none" opacity="0.8" />
  </Base>
);

/** Survey control monument with crosshair and shot point — add point. */
export const ToolbarAddPointIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <circle cx="11.5" cy="7.5" r="4.3" strokeWidth="1.4" fill="currentColor" fillOpacity="0.08" />
    <path d="M11.5 3.2v8.6M7.2 7.5h8.6" strokeWidth="1" opacity="0.8" />
    <circle cx="11.5" cy="7.5" r="1.15" fill="currentColor" stroke="none" />
    <path d="M11.5 11.8v6.4" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8.6 21.2 11.5 19l2.9 2.2" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M18 3.2v4M16 5.2h4" strokeWidth="1.8" strokeLinecap="round" />
  </Base>
);

/** Pencil over chained linework — drawing tools. */
/** Adjustable crescent wrench with a worm screw — the Tools tab. */
export const AdjustableWrenchIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <g transform="rotate(45 12 12)">
      {/* Filled silhouette: handle, two jaws with a real opening, and a
          worm-screw bore cut out with evenodd so it works on any surface. */}
      <path
        d="M8.6 3.4H16v7.8h-2.6v10.2h-2.8V11.2H8.6V9.4H4.2V7.6h4.4V5.4H3.6V3.4Zm4.5 4a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z"
        fill="currentColor"
        fillRule="evenodd"
        stroke="none"
        strokeWidth="0"
      />
    </g>
  </Base>
);

export const ToolbarDrawToolsIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M2.6 17.4 7 13l2.6 2.4 4.1-4.1" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="2.6" cy="17.4" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="13.8" cy="11.2" r="1.2" fill="currentColor" stroke="none" />
    <path d="M14.2 9.4 18 5.6l2.4 2.4-3.8 3.8-2.9.5z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" />
    <path d="M17.1 6.5 19.5 8.9" strokeWidth="1" opacity="0.7" />
    <path d="M15.4 10.8 18.9 9.9" strokeWidth="1" opacity="0.6" />
  </Base>
);

/**
 * Horizontal aligned dimension — witness lines, a fully arrowed dimension
 * line, and the value block sitting above it. Square-on rather than slanted so
 * it stays readable in the 20px canvas toolbar.
 */
export const ToolbarDimensionIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M4.6 6.2v11.8M19.4 6.2v11.8" strokeWidth="1.1" opacity="0.6" />
    <path d="M4.6 15.3h14.8" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.6 15.3 8 14.15v2.3Z" fill="currentColor" stroke="none" />
    <path d="M19.4 15.3 16 14.15v2.3Z" fill="currentColor" stroke="none" />
    <rect x="7.6" y="7.1" width="8.8" height="4.6" rx="1.3" strokeWidth="1.15" fill="currentColor" fillOpacity="0.12" />
    <path d="M9.5 9.4h5" strokeWidth="1.5" strokeLinecap="round" />
  </Base>
);

/** Standards sheet: code table grid with a verified check — CAD standards. */
export const ToolbarStandardsIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.6" y="2.8" width="18.8" height="18.4" rx="1.6" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05" />
    <path d="M2.6 7.4h18.8M8.2 7.4v13.8M14.6 7.4v13.8M2.6 12.6h18.8M2.6 17h18.8" strokeWidth="0.9" opacity="0.6" />
    <circle cx="5.1" cy="5.1" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="7.2" cy="5.1" r="0.7" fill="currentColor" stroke="none" opacity="0.6" />
    <path d="M15.4 19.3 16.9 20.6 19.4 17.5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Point cluster behind a struck-out ring — symbol exclusion. */
export const ToolbarSymbolExclusionIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="8.6" strokeWidth="1.45" fill="currentColor" fillOpacity="0.05" />
    <path d="M6.1 6.1 17.9 17.9" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="0.9" fill="currentColor" stroke="none" opacity="0.55" />
    <circle cx="9.4" cy="15.2" r="0.9" fill="currentColor" stroke="none" opacity="0.55" />
    <path d="M13.8 14.2 15.4 15.8" strokeWidth="1.1" strokeDasharray="1 1.2" opacity="0.7" />
  </Base>
);

/** Point roster sheet with per-row point markers — point list. */
export const ToolbarPointListIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.8" y="3.2" width="18.4" height="17.6" rx="1.6" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05" />
    <path d="M2.8 8h18.4" strokeWidth="1.2" />
    <circle cx="5.6" cy="5.6" r="0.8" fill="currentColor" stroke="none" />
    <path d="M7.6 5.6h9" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="6.2" cy="11.2" r="1" fill="currentColor" stroke="none" />
    <path d="M9 11.2h9.4" strokeWidth="1.1" opacity="0.85" strokeLinecap="round" />
    <circle cx="6.2" cy="14.6" r="1" fill="currentColor" stroke="none" />
    <path d="M9 14.6h7.6" strokeWidth="1.1" opacity="0.75" strokeLinecap="round" />
    <circle cx="6.2" cy="18" r="1" fill="currentColor" stroke="none" />
    <path d="M9 18h5.8" strokeWidth="1.1" opacity="0.65" strokeLinecap="round" />
  </Base>
);

/** Computed hull around survey nodes — shrinkwrap. */
export const ToolbarShrinkwrapIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path
      d="M5.2 7.6 9.6 3.8l6.2 1 4 4.2-1.1 7.4-5.3 3.8-6.9-2.1-2.1-5.2z"
      strokeWidth="1.4"
      strokeDasharray="2.4 1.6"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.06"
    />
    <circle cx="9.2" cy="8.8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.2" cy="13.8" r="1.1" fill="currentColor" stroke="none" />
    <path d="M11.2 11 13.4 11.6" strokeWidth="1" opacity="0.6" />
    <path d="M18.2 5 21 2.2M21 2.2h-2.4M21 2.2v2.4" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />
  </Base>
);

/**
 * Civil 3D link: an isometric solid (the model) joined by a chain link.
 * The two interlocking arcs replace the old pair of overlapping capsules,
 * which turned to mush below 20px. Used by the sidebar's Connect C3D control.
 */
export const C3DLinkIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <polygon points="1.6,8.2 6,5.6 10.4,8.2 6,10.8" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.16" />
    <path d="M1.6 8.2v5L6 15.8" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M10.4 8.2v5L6 15.8" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M6 10.8v5" strokeWidth="0.95" opacity="0.55" />
    <g transform="translate(9.72 8.42) scale(0.54)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </g>
  </Base>
);

/**
 * AI model: a hexagon core holding a routing spark, with a caret underneath
 * signalling the model picker. Used for the sidebar's model selector.
 */
export const ModelSelectIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path
      d="M10.4 3 16.7 6.7v7.4L10.4 17.8 4.1 14.1V6.7Z"
      strokeWidth="1.45"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.07"
    />
    <path
      d="M10.4 6 11.9 8.9 14.8 10.4 11.9 11.9 10.4 14.8 8.9 11.9 6 10.4 8.9 8.9Z"
      fill="currentColor"
      fillOpacity="0.9"
      stroke="none"
    />
    <path d="M15.3 17.5 17.7 19.9 20.1 17.5" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Base>
);

/** Drafting viewport with terrain linework — Canvas. */
export const ViewCanvasIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.4" y="3.2" width="19.2" height="15.4" rx="1.4" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05" />
    <path d="M2.4 6.8h19.2" strokeWidth="1" opacity="0.55" />
    <path d="M4.8 15.8 8.2 10.9 11.1 13.2 14.3 8.4 17.1 11.2 19.4 9.1" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="14.3" cy="8.4" r="1" fill="currentColor" stroke="none" />
    <path d="M2.4 21.4v-1.6M2.4 21.4h1.6M21.6 18.6v2.8h-1.6" strokeWidth="1.2" opacity="0.7" />
    <path d="M3.6 5H5M19 5h1.4" strokeWidth="1.2" opacity="0.8" strokeLinecap="round" />
  </Base>
);

/** Style card with line samples — Drafting Style Library. */
export const StyleLibraryIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.6" y="3.2" width="11.8" height="15.2" rx="1.2" strokeWidth="1.4" fill="currentColor" fillOpacity="0.06" />
    <path d="M2.6 6.8h11.8" strokeWidth="1.1" />
    <path d="M5 9.8h7" strokeWidth="1.05" opacity="0.8" />
    <path d="M5 12.6h5.4" strokeDasharray="2 1.4" strokeWidth="1.2" />
    <path d="M5 15.6h7" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16.2 6.2h3.4a1 1 0 0 1 1 1v12.1a1 1 0 0 1-1 1h-3.4" strokeWidth="1.2" opacity="0.55" />
    <path d="M16.2 8.6h2.2M16.2 11.6h2.2" strokeWidth="1" opacity="0.5" />
    <circle cx="17.3" cy="16.2" r="1.4" strokeWidth="1" fill="currentColor" fillOpacity="0.35" />
  </Base>
);

/** Solid / dashed / dotted line samples — Linetype Manager. */
export const LinetypeManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M2.6 7h18.8" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M2.6 12h18.8" strokeWidth="1.3" strokeDasharray="3 2" />
    <path d="M2.6 16.8h18.8" strokeWidth="2.2" strokeDasharray=".8 2.4" strokeLinecap="round" />
    <path d="M3.2 4.6v4.2M20.8 4.6v4.2M3.2 9.9v4.2M20.8 9.9v4.2M3.2 14.7v4.2M20.8 14.7v4.2" strokeWidth="0.9" opacity="0.45" />
  </Base>
);

/** Diagonal cross-hatch inside a framed region — Hatch Manager. */
export const HatchManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" fill="currentColor" fillOpacity="0.06" />
    <path d="M3 9 9 3M3 15 15 3M3 21 21 3M9 21 21 9M15 21 21 15" strokeWidth="1.2" opacity="0.85" />
    <path d="M9 3 21 15M3 9 15 21" strokeWidth="0.9" opacity="0.4" strokeDasharray="2 2" />
  </Base>
);

/** Folder with a document sheet — File Manager. */
export const FileManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M2.6 6.6a1.8 1.8 0 0 1 1.8-1.8h4.2l2 2.2h9.2a1.8 1.8 0 0 1 1.8 1.8v9.8a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.07" />
    <path d="M7.2 9.4h9.6v7.6H7.2z" strokeWidth="1" fill="currentColor" fillOpacity="0.06" />
    <path d="M9 12h6M9 14.2h4.4" strokeWidth="1" opacity="0.8" strokeLinecap="round" />
    <path d="M2.6 8.6h18.8" strokeWidth="1" opacity="0.45" />
  </Base>
);

/** Symbol library grid — Symbol Manager. */
export const SymbolManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="2.6" y="2.8" width="18.8" height="18.4" rx="1.6" strokeWidth="1.4" fill="currentColor" fillOpacity="0.04" />
    <path d="M2.6 8.2h18.8M8.8 8.2v13M15.2 8.2v13" strokeWidth="0.9" opacity="0.5" />
    <circle cx="5.1" cy="5.2" r="0.65" fill="currentColor" stroke="none" />
    <path d="M5.7 18.6 8.1 14.4 3.3 14.4Z" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" />
    <circle cx="12" cy="13.2" r="2.2" strokeWidth="1.3" fill="currentColor" fillOpacity="0.1" />
    <path d="M17 15.8h5M19.5 13.3v5" strokeWidth="1.3" strokeLinecap="round" />
  </Base>
);

/** Leader callout box — Annotate Manager. */
export const AnnotateManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M3 21 9.4 14.4" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M3 21l.5-2.4 1.9 1.9z" fill="currentColor" stroke="none" />
    <path d="M8.4 12.8h12.8v5.8H9.8L8.4 17.2z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.08" />
    <path d="M10.8 14.8h8M10.8 16.6h5.6" strokeWidth="1" opacity="0.85" strokeLinecap="round" />
  </Base>
);

/** Numbered document with caret — Text Editor. */
export const TextEditorToolIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <rect x="4.4" y="2.6" width="15.2" height="18.8" rx="1.4" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05" />
    <path d="M7.8 2.6v18.8" strokeWidth="1" opacity="0.45" />
    <path d="M6.4 6.6h.7M6.4 9.8h.7M6.4 13h.7M6.4 16.2h.7" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    <path d="M9.8 6.6h7.2M9.8 10h5.4M9.8 13.4h6.8" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M9.8 17.2h4.6" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15.6 16v2.4" strokeWidth="1" opacity="0.8" strokeLinecap="round" />
  </Base>
);

/** Globe with raster tiles — WMS Manager. */
export const WmsManagerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <circle cx="11" cy="11.4" r="7.6" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05" />
    <path d="M3.4 11.4h15.2M11 3.8c2.5 2.2 2.5 13 0 15.2M11 3.8c-2.5 2.2-2.5 13 0 15.2" strokeWidth="0.9" opacity="0.7" />
    <rect x="15.2" y="15.2" width="6" height="6" rx="0.8" strokeWidth="1.2" fill="currentColor" fillOpacity="0.12" />
    <path d="M15.2 18.2h6M18.2 15.2v6" strokeWidth="0.9" opacity="0.75" />
  </Base>
);

/** Field book with ruled notes and pencil — Field Book. */
export const FieldBookToolIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M4.6 3.4h12a1.8 1.8 0 0 1 1.8 1.8v15.4H6.4a1.8 1.8 0 0 1-1.8-1.8z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
    <path d="M4.6 3.4v17.2" strokeWidth="1.6" />
    <path d="M8 8h7.6M8 11.2h7.6M8 14.4h5.6" strokeWidth="1" opacity="0.85" strokeLinecap="round" />
    <path d="M13.6 20.4l4.4-4.4 1.7 1.7-4.4 4.4-2.3.6z" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" />
  </Base>
);

/** Closed traverse with a marked closure gap — Closure Reports. */
export const ClosureReportIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M6.2 19.6 3.2 9.8 9.4 3.4 18.8 5.2 21 13.4" strokeWidth="1.45" strokeLinejoin="round" />
    <path d="M21 13.4 17.4 19.6 6.2 19.6" strokeWidth="1.25" strokeDasharray="2 1.6" strokeLinejoin="round" />
    <circle cx="6.2" cy="19.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="9.8" r="1" fill="currentColor" stroke="none" />
    <circle cx="9.4" cy="3.4" r="1" fill="currentColor" stroke="none" />
    <circle cx="18.8" cy="5.2" r="1" fill="currentColor" stroke="none" />
    <circle cx="21" cy="13.4" r="1" fill="currentColor" stroke="none" />
    <path d="M13.6 8.4h4.6M15.9 6.1v4.6" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
  </Base>
);

/** Sheet with a review eye — PDF Reviewer. */
export const PdfReviewerIcon: React.FC<IconProps> = (props) => (
  <Base {...props}>
    <path d="M5.4 2.8h9l4.6 4.6v13.8H5.4z" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.05" />
    <path d="M14.4 2.8v4.6H19" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M8.6 14.6c.8-1.4 2.2-2.2 3.9-2.2s3.1.8 3.9 2.2c-.8 1.4-2.2 2.2-3.9 2.2s-3.1-.8-3.9-2.2z" strokeWidth="1.2" fill="currentColor" fillOpacity="0.08" />
    <circle cx="12.5" cy="14.6" r="1.1" fill="currentColor" stroke="none" />
    <path d="M8 9h4" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
  </Base>
);

export default Base;
