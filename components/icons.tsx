import React from 'react';

// Precision CAD Upload / Load Session Glyph
export const UploadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* Bracketed CAD staging tray with graduation ticks */}
    <polyline points="3,14.5 3,20.5 21,20.5 21,14.5" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" />
    <line x1="6.5" y1="20.5" x2="6.5" y2="18.8" strokeWidth="1.1" opacity="0.75" />
    <line x1="12" y1="20.5" x2="12" y2="18.8" strokeWidth="1.1" opacity="0.75" />
    <line x1="17.5" y1="20.5" x2="17.5" y2="18.8" strokeWidth="1.1" opacity="0.75" />
    {/* Sharp upward vector shaft & chevron head */}
    <line x1="12" y1="16" x2="12" y2="3.5" strokeWidth="1.7" strokeLinecap="square" />
    <polyline points="7.2,8.2 12,3.2 16.8,8.2" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" />
    {/* Top target fiducial */}
    <rect x="3" y="3" width="2" height="2" fill="currentColor" stroke="none" opacity="0.65" />
    <rect x="19" y="3" width="2" height="2" fill="currentColor" stroke="none" opacity="0.65" />
  </svg>
);

// Precision Technical Dispatch / Contact Glyph
export const EnvelopeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <rect x="2.6" y="4.6" width="18.8" height="14.8" rx="1.2" strokeWidth="2" strokeLinejoin="round" />
    <path d="M3.4 6.6L12 13.6l8.6-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="6.4" y1="16.6" x2="17.6" y2="16.6" strokeWidth="0.85" strokeLinecap="round" opacity="0.28" />
  </svg>
);

export const SendIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

export const StopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
    </svg>
);

export const FileIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m9.75 9.75H8.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.625 19.5h12.75a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H5.625a2.25 2.25 0 00-2.25 2.25v12.75c0 1.242 1.008 2.25 2.25 2.25Z" />
  </svg>
);

export const FolderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
);

// RAW File Crawler Agent Glyph — Robotic Total Station Theodolite on Tripod Emitting EDM Laser Vectors to a Survey Prism
export const BrainCircuitIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Total station alidade yoke & leveling tribrach base */}
        <polyline points="4.5,14 4.5,6.5 11.5,6.5 11.5,14" strokeWidth="1.4" strokeLinejoin="miter" />
        <rect x="3.5" y="14" width="9" height="1.8" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" />
        {/* Optical EDM telescope barrel & objective lens */}
        <rect x="5.8" y="8.2" width="4.4" height="3.6" strokeWidth="1.4" fill="currentColor" fillOpacity="0.15" />
        <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
        {/* Top GPS/radio telemetry handle */}
        <polyline points="6,6.5 6,4.5 10,4.5 10,6.5" strokeWidth="1.2" strokeLinejoin="miter" />
        {/* Heavy survey tripod legs */}
        <line x1="5.2" y1="15.8" x2="2.5" y2="21.5" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="8" y1="15.8" x2="8" y2="21.5" strokeWidth="1.4" strokeLinecap="square" />
        <line x1="10.8" y1="15.8" x2="13.5" y2="21.5" strokeWidth="1.5" strokeLinecap="square" />
        {/* EDM laser measurement fan rays to target prism */}
        <line x1="10.2" y1="9.2" x2="18.2" y2="5.2" strokeWidth="1.15" strokeDasharray="1.8 1.2" />
        <line x1="10.2" y1="10" x2="18.2" y2="10" strokeWidth="1.2" />
        <line x1="10.2" y1="10.8" x2="18.2" y2="15.5" strokeWidth="1.15" strokeDasharray="1.8 1.2" />
        {/* Retro-reflective target prism & raw data nodes on right */}
        <polygon points="19.5,2.5 22,5 19.5,7.5 17,5" strokeWidth="1.4" fill="currentColor" fillOpacity="0.22" strokeLinejoin="miter" />
        <rect x="18.3" y="8.8" width="2.4" height="2.4" strokeWidth="1.3" />
        <polygon points="19.5,13.5 21.8,17.2 17.2,17.2" strokeWidth="1.3" strokeLinejoin="miter" />
        <line x1="19.5" y1="17.2" x2="19.5" y2="21.5" strokeWidth="1.2" />
    </svg>
);

// Civil Drafter Agent Glyph — Precision Drafting Dividers Compass Arching Over a 45° Engineer's Triangle & Cul-de-Sac Plat
export const CivilDrafterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Background 45-degree engineer's drafting set-square triangle */}
        <polygon points="2.5,21 21.5,21 2.5,5.5" strokeWidth="1.2" strokeLinejoin="miter" opacity="0.65" />
        {/* Inner cutout of drafting triangle */}
        <polygon points="5,18.5 13.5,18.5 5,11.5" strokeWidth="0.9" strokeLinejoin="miter" opacity="0.45" />
        {/* Bottom ruler scale graduation ticks along triangle base */}
        <line x1="6" y1="21" x2="6" y2="19.6" strokeWidth="1" />
        <line x1="9.5" y1="21" x2="9.5" y2="19.6" strokeWidth="1" />
        <line x1="13" y1="21" x2="13" y2="19.6" strokeWidth="1" />
        <line x1="16.5" y1="21" x2="16.5" y2="19.6" strokeWidth="1" />
        {/* Precision drafting compass / dividers in foreground */}
        <line x1="14" y1="2" x2="14" y2="4.2" strokeWidth="1.6" strokeLinecap="square" />
        <circle cx="14" cy="5.8" r="1.8" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
        {/* Left & right machined compass legs */}
        <line x1="12.8" y1="7.2" x2="7.5" y2="21.5" strokeWidth="1.7" strokeLinecap="square" />
        <line x1="15.2" y1="7.2" x2="20.5" y2="21.5" strokeWidth="1.7" strokeLinecap="square" />
        {/* Threaded adjustment crossbar & thumbwheel */}
        <line x1="9.6" y1="14.5" x2="18.4" y2="14.5" strokeWidth="1.2" />
        <rect x="13.2" y="13.3" width="1.6" height="2.4" fill="currentColor" stroke="none" />
        {/* Swept CAD tangent curve arc & vertex nodes */}
        <path strokeLinecap="square" strokeWidth="1.2" strokeDasharray="2 1.3" d="M6.5 18C10.5 15.5 16.5 15.5 21.5 18" />
        <circle cx="7.5" cy="21.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="20.5" cy="21.5" r="1" fill="currentColor" stroke="none" />
    </svg>
);

// Precision CAD Install / Download Glyph
export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path d="M3.6 15.2v5.4h16.8v-5.4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 2.8v11.6" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M7.4 9.9L12 14.6l4.6-4.7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="6" y1="18.4" x2="18" y2="18.4" strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
  </svg>
);

export const DxfIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

// DXF Agent Glyph — Precision CAD Vector Workspace with UCS Origin Triad, Dimensioned Polyline & Tangent Arc Grips
export const DxfAnalyzerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* Outer CAD viewport frame with corner snap markers */}
    <rect x="2" y="2" width="20" height="20" strokeWidth="1.4" strokeLinejoin="miter" />
    <line x1="2" y1="5.2" x2="22" y2="5.2" strokeWidth="1" />
    <rect x="3.5" y="3.1" width="1.2" height="1.2" fill="currentColor" stroke="none" />
    <rect x="6" y="3.1" width="1.2" height="1.2" fill="currentColor" stroke="none" />
    {/* Top linear dimension leader with extension lines & arrows */}
    <line x1="8" y1="6.8" x2="8" y2="10.2" strokeWidth="0.9" opacity="0.75" />
    <line x1="18.5" y1="6.8" x2="18.5" y2="10.2" strokeWidth="0.9" opacity="0.75" />
    <line x1="8" y1="7.8" x2="18.5" y2="7.8" strokeWidth="1" />
    <polygon points="8,7.8 9.6,7.1 9.6,8.5" fill="currentColor" stroke="none" />
    <polygon points="18.5,7.8 16.9,7.1 16.9,8.5" fill="currentColor" stroke="none" />
    {/* UCS X/Y origin triad at bottom-left */}
    <path strokeLinecap="square" strokeWidth="1.4" d="M4.2 14.2V19.8H9.8" />
    <polygon points="4.2,13 3.3,14.6 5.1,14.6" fill="currentColor" stroke="none" />
    <polygon points="11,19.8 9.4,18.9 9.4,20.7" fill="currentColor" stroke="none" />
    {/* Surveyed CAD polyline + tangent curve arc */}
    <polyline points="8,16.5 11.8,10.8 16.2,12.5" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" />
    <path strokeLinecap="square" strokeWidth="1.6" d="M16.2 12.5A4.2 4.2 0 0 1 19.5 17.5" />
    {/* Radial center-mark cross for the arc */}
    <line x1="14.5" y1="16.8" x2="16.5" y2="16.8" strokeWidth="0.9" opacity="0.75" />
    <line x1="15.5" y1="15.8" x2="15.5" y2="17.8" strokeWidth="0.9" opacity="0.75" />
    {/* CAD grip vertex handles */}
    <rect x="6.9" y="15.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    <rect x="10.7" y="9.7" width="2.2" height="2.2" strokeWidth="1.2" fill="none" />
    <rect x="15.1" y="11.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    <rect x="18.4" y="16.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
  </svg>
);

export const EraserIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 9-6 6m0-6 6 6" />
    </svg>
);

export const LightbulbIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12,2A7,7,0,0,0,5,9C5,11.38,6.19,13.47,8,14.74V17A1,1,0,0,0,9,18H15A1,1,0,0,0,16,17V14.74C17.81,13.47,19,11.38,19,9A7,7,0,0,0,12,2M9,21A1,1,0,0,0,10,22H14A1,1,0,0,0,15,21V20H9V21Z" />
    </svg>
);

export const HomeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
);

// Boundary Agent Glyph — Classical Courthouse Colonnade & Pediment Framed by a Surveyed Metes-and-Bounds Parcel Traverse
export const CourthouseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* Outer surveyed parcel boundary traverse with corner monuments & curve call */}
    <path strokeWidth="1.2" strokeDasharray="2.5 1.3" opacity="0.8" d="M3 4.2L19.8 2.5L21.5 19.5L2.5 21Z" />
    <rect x="1.8" y="3.1" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    <rect x="18.7" y="1.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    <rect x="20.4" y="18.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    <rect x="1.4" y="19.9" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    {/* Classical courthouse pediment with inner cornice & compass oculus */}
    <polygon points="4.2,9.6 12,4.2 19.8,9.6" strokeWidth="1.6" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.16" />
    <polygon points="6.6,8.8 12,5.3 17.4,8.8" strokeWidth="0.9" strokeLinejoin="miter" opacity="0.65" />
    <circle cx="12" cy="7.4" r="0.9" fill="currentColor" stroke="none" />
    {/* Architrave frieze beam */}
    <rect x="4.6" y="9.6" width="14.8" height="1.6" strokeWidth="1.2" />
    {/* Four fluted Ionic columns with capitals & bases */}
    <line x1="6.4" y1="11.2" x2="6.4" y2="17.4" strokeWidth="1.6" />
    <line x1="10.1" y1="11.2" x2="10.1" y2="17.4" strokeWidth="1.6" />
    <line x1="13.9" y1="11.2" x2="13.9" y2="17.4" strokeWidth="1.6" />
    <line x1="17.6" y1="11.2" x2="17.6" y2="17.4" strokeWidth="1.6" />
    {/* Stepped stereobate base plinth */}
    <line x1="4.4" y1="17.4" x2="19.6" y2="17.4" strokeWidth="1.4" />
    <line x1="3.6" y1="19" x2="20.4" y2="19" strokeWidth="1.6" />
  </svg>
);

// Roading Agent Glyph — plan-view roadway with ROW limits, edge-of-pavement,
// dashed centerline and right-of-way offset ticks.
export const RoadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Right-of-way limits */}
        <path strokeLinecap="round" strokeWidth={1} opacity={0.42} d="M4.2 22C4.2 18.2 0.7 17 0.7 12.5S4.2 6 4.2 2" />
        <path strokeLinecap="round" strokeWidth={1} opacity={0.42} d="M19.8 22C19.8 18.2 16.3 17 16.3 12.5S19.8 6 19.8 2" />
        {/* Edge of pavement */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 22C8 18.2 4.5 17 4.5 12.5S8 6 8 2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 22C16 18.2 12.5 17 12.5 12.5S16 6 16 2" />
        {/* Dashed centerline / median */}
        <path strokeLinecap="round" strokeDasharray="2.2 1.8" strokeWidth={1.2} d="M12 22C12 18.2 8.5 17 8.5 12.5S12 6 12 2" />
        {/* ROW offset ticks at both ends */}
        <path strokeLinecap="round" strokeWidth={1.1} opacity={0.75} d="M4.2 2.2H7.3M16.7 2.2H19.8M4.2 21.8H7.3M16.7 21.8H19.8" />
    </svg>
);

export const TableCellsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125A1.125 1.125 0 003 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.067-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

export const MapPinIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
);

export const ZoomToPointIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 7.5v6M7.5 10.5h6" />
  </svg>
);

// Point Editor Agent Glyph — Machined Hexagonal Brass Plumb Bob Suspended Over a Survey Control Monument & N/E Grid
export const PlumbBobIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      {/* Gammon reel suspension cord & knurled brass cap */}
      <line x1="12" y1="1.8" x2="12" y2="4.4" strokeWidth="1.5" strokeLinecap="square" />
      <rect x="10" y="4.4" width="4" height="1.6" strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
      {/* Faceted hexagonal brass plumb bob body tapering to hardened steel point */}
      <polygon points="7.8,6 16.2,6 17.2,9.2 12,17.8 6.8,9.2" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.14" />
      {/* Machined shoulder ring & vertical facet bevels */}
      <line x1="6.8" y1="9.2" x2="17.2" y2="9.2" strokeWidth="1.2" />
      <line x1="10" y1="6" x2="9.4" y2="9.2" strokeWidth="1" opacity="0.75" />
      <line x1="14" y1="6" x2="14.6" y2="9.2" strokeWidth="1" opacity="0.75" />
      <line x1="9.4" y1="9.2" x2="12" y2="17.8" strokeWidth="1" opacity="0.75" />
      <line x1="14.6" y1="9.2" x2="12" y2="17.8" strokeWidth="1" opacity="0.75" />
      {/* Isometric N/E coordinate datum plane & target monument below tip */}
      <polygon points="12,16.8 21.8,19.4 12,22 2.2,19.4" strokeWidth="1.3" strokeLinejoin="miter" />
      <line x1="7.1" y1="18.1" x2="16.9" y2="20.7" strokeWidth="0.9" opacity="0.7" />
      <line x1="16.9" y1="18.1" x2="7.1" y2="20.7" strokeWidth="0.9" opacity="0.7" />
      <circle cx="12" cy="19.4" r="1.2" fill="currentColor" stroke="none" />
      {/* Flanking PNEZD point tick marks */}
      <rect x="3" y="13.5" width="1.6" height="1.6" fill="currentColor" stroke="none" />
      <rect x="19.4" y="13.5" width="1.6" height="1.6" fill="currentColor" stroke="none" />
    </svg>
);

export const PlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

export const BookOpenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
);

export const MapIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-13.482l-9.046 3.016a.75.75 0 00-.455.698v9.916a.75.75 0 00.91.748l8.588-2.862a.75.75 0 00.548-.703V5.132a.75.75 0 00-.91-.748z" />
    </svg>
);

export const CutSheetIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.153 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM9 15h.008v.008H9V15zm.75 0h.008v.008H9.75V15zm1.5 0h.008v.008h-.008V15z" />
    </svg>
);

export const WidthIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12M6 12l4-4m-4 4l4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 12l-4-4m4 4l-4 4" />
    </svg>
);

export const OpposingArrowsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h14" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l3 3-3 3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 16H7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 13l-3 3 3 3" />
    </svg>
);

export const XMarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const QuestionMarkCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
);

export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);
export const ChevronUpIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
);

export const ChevronLeftIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
);

export const ChevronRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
);

export const ChevronDoubleRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
  </svg>
);


// Civil Plan Expert Agent Glyph — Multi-Sheet Engineering Plan Set with Cul-de-Sac Site Layout, North Rose & Titleblock
export const DocumentDuplicateIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Stacked rear plan sheets */}
        <polyline points="6.5,4.2 6.5,2 22,2 22,16.5 19.5,16.5" strokeWidth="1.15" opacity="0.6" strokeLinejoin="miter" />
        <polyline points="4.2,5.8 4.2,3.5 20.8,3.5 20.8,18.2 19,18.2" strokeWidth="1.15" opacity="0.8" strokeLinejoin="miter" />
        {/* Front primary 24x36 civil plan sheet */}
        <rect x="2" y="5.5" width="17" height="16.5" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.06" />
        {/* Right-hand titleblock strip & revision compartments */}
        <line x1="14.5" y1="5.5" x2="14.5" y2="22" strokeWidth="1.15" />
        <line x1="2" y1="18.8" x2="19" y2="18.8" strokeWidth="1.15" />
        <line x1="14.5" y1="9.2" x2="19" y2="9.2" strokeWidth="0.9" opacity="0.75" />
        <line x1="14.5" y1="12.8" x2="19" y2="12.8" strokeWidth="0.9" opacity="0.75" />
        <line x1="14.5" y1="15.8" x2="19" y2="15.8" strokeWidth="0.9" opacity="0.75" />
        <line x1="8.2" y1="18.8" x2="8.2" y2="22" strokeWidth="0.9" opacity="0.75" />
        {/* Precision North Arrow star in top-left */}
        <polygon points="4.8,7.2 5.8,10.4 4.8,9.6 3.8,10.4" fill="currentColor" stroke="none" />
        <line x1="3.8" y1="8.8" x2="5.8" y2="8.8" strokeWidth="0.8" />
        {/* Subdivision roadway & cul-de-sac bulb alignment inside plan viewport */}
        <path strokeWidth="1.3" strokeLinecap="square" d="M3.8 16.5L8.2 13.2L10.5 13.2" />
        <circle cx="11.6" cy="13.2" r="1.5" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2" />
        {/* Lot lines radiating from cul-de-sac */}
        <line x1="8.2" y1="13.2" x2="7.5" y2="9.5" strokeWidth="0.9" strokeDasharray="1.4 1" opacity="0.8" />
        <line x1="11.6" y1="11.7" x2="12.5" y2="8" strokeWidth="0.9" strokeDasharray="1.4 1" opacity="0.8" />
    </svg>
);

export const CpuChipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 21v-1.5M15.75 3v1.5m0 15v1.5M12 4.5v-1.5m0 18v-1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 6.75h.008v.008H15V6.75zm0 3h.008v.008H15V9.75zm0 3h.008v.008H15v-3zm0 3h.008v.008H15v-3zm-6-6h.008v.008H9V6.75zm0 3h.008v.008H9V9.75zm0 3h.008v.008H9v-3zm0 3h.008v.008H9v-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25v7.5a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15.75v-7.5A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25z" />
    </svg>
);

// Job Info / Fieldbook Clipboard Glyph — Bold Clipboard with Rule Lines
export const ClipboardDocumentListIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path d="M9 4.4H5.2V21.4H18.8V4.4H15" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="9" y="2.2" width="6" height="3.6" rx="0.8" strokeWidth="1.9" />
        <circle cx="10.7" cy="4" r="0.55" fill="currentColor" stroke="none" opacity="0.6" />
        <circle cx="13.3" cy="4" r="0.55" fill="currentColor" stroke="none" opacity="0.6" />
        <line x1="6.9" y1="9.6" x2="6.9" y2="19.4" strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
        <line x1="8.6" y1="10.6" x2="15.6" y2="10.6" strokeWidth="2.1" strokeLinecap="round" />
        <line x1="8.6" y1="14.4" x2="15.6" y2="14.4" strokeWidth="2.1" strokeLinecap="round" />
        <line x1="8.6" y1="18.2" x2="12.6" y2="18.2" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
    </svg>
);

// Release Log Glyph — Bold Chronometer for Version History / What's New
export const LogClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="8.8" strokeWidth="2.1" />
        <line x1="12" y1="4.3" x2="12" y2="6.1" strokeWidth="1.05" strokeLinecap="round" opacity="0.5" />
        <line x1="12" y1="17.9" x2="12" y2="19.7" strokeWidth="1.05" strokeLinecap="round" opacity="0.5" />
        <line x1="4.3" y1="12" x2="6.1" y2="12" strokeWidth="1.05" strokeLinecap="round" opacity="0.5" />
        <line x1="17.9" y1="12" x2="19.7" y2="12" strokeWidth="1.05" strokeLinecap="round" opacity="0.5" />
        <polyline points="12,6.8 12,12 16,14.4" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
);

// Upgrade / Compute Credits Glyph — Bold Dollar Mark, No Enclosing Badge
export const CurrencyDollarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path d="M16.6 7.4H9.8a2.7 2.7 0 0 0 0 5.4h4.4a2.7 2.7 0 0 1 0 5.4H7.4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="4.4" x2="12" y2="19.6" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="9.9" y1="3.2" x2="14.1" y2="3.2" strokeWidth="1.05" strokeLinecap="round" opacity="0.6" />
        <line x1="9.9" y1="20.8" x2="14.1" y2="20.8" strokeWidth="1.05" strokeLinecap="round" opacity="0.6" />
    </svg>
);

// LSVZ Meta-Agent Glyph — Isometric Tesseract Container with Internal Cryptographic Lattice
export const LsvzIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Outer isometric hexagonal cube */}
        <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" strokeWidth="1.5" strokeLinejoin="miter" />
        {/* Inner nested tesseract core */}
        <polygon points="12,6.8 16.5,9.4 16.5,14.6 12,17.2 7.5,14.6 7.5,9.4" strokeWidth="1.2" fill="currentColor" fillOpacity="0.14" strokeLinejoin="miter" />
        {/* Isometric axis struts connecting inner and outer vertices */}
        <line x1="12" y1="2" x2="12" y2="6.8" strokeWidth="1.1" />
        <line x1="21" y1="7" x2="16.5" y2="9.4" strokeWidth="1.1" />
        <line x1="21" y1="17" x2="16.5" y2="14.6" strokeWidth="1.1" />
        <line x1="12" y1="22" x2="12" y2="17.2" strokeWidth="1.1" />
        <line x1="3" y1="17" x2="7.5" y2="14.6" strokeWidth="1.1" />
        <line x1="3" y1="7" x2="7.5" y2="9.4" strokeWidth="1.1" />
        {/* Internal cube edges */}
        <path strokeWidth="1.1" opacity="0.8" d="M7.5 9.4L12 12L16.5 9.4M12 12V17.2" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
);

export const ListBulletIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
);

export const AdjustmentsHorizontalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0h7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
);

// Faint futuristic background grid toggle icon.
export const GridIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
);

// Agent constellation — the AGENTS tab. A solid core with three orbiting
// workspace nodes and a link to each: distinct from the layer stack and
// readable down to 16px.
export const AgentConstellationIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity={0.92} stroke="none" />
        <circle cx="12" cy="4.4" r="1.6" />
        <circle cx="4.7" cy="16.8" r="1.6" />
        <circle cx="19.3" cy="16.8" r="1.6" />
        <path strokeLinecap="round" d="M12 6.2v3.1M10.1 13.6 6.4 15.7M13.9 13.6l3.7 2.1" opacity={0.8} />
        <path strokeLinecap="round" d="M6.1 8.2a8 8 0 0 1 4.2-2.9" opacity={0.4} />
    </svg>
);

export const LayersIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m9.375 2.25c.621 0 1.125.504 1.125 1.125v3.375m-13.5-3.375V21a1.125 1.125 0 001.125 1.125h9.75" />
    </svg>
);

// Sheet View Icon - 24x36 aspect ratio landscape architectural paper with a folded corner
export const SheetViewIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Exact 24x36 aspect ratio landscape sheet (19.5w x 13h = 1.5 ratio, 36:24) with dog-ear folded corner at top-right */}
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M 2.25 7 C 2.25 6.2 2.9 5.5 3.75 5.5 H 16.5 L 21.75 10.75 V 17 C 21.75 17.8 21.1 18.5 20.25 18.5 H 3.75 C 2.9 18.5 2.25 17.8 2.25 17 Z"
        />
        {/* Folded paper dog-ear flap */}
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M 16.5 5.5 V 10.75 H 21.75"
            fill="currentColor"
            fillOpacity="0.2"
        />
        {/* Inner drawing viewport box and vertical titleblock strip lines */}
        <rect x="4.5" y="7.5" width="9.5" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <line x1="16.5" y1="13" x2="19.75" y2="13" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
        <line x1="16.5" y1="15" x2="19.75" y2="15" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
        <line x1="16.5" y1="17" x2="19.75" y2="17" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
    </svg>
);

// CAD Manager Agent Glyph — Stacked Isometric CAD Layer Planes Interlocked with a 12-Tooth Vernier Gear & Descriptor Table
export const CadManagerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Top isometric CAD layer plane with internal coordinate cross */}
        <polygon points="2,7.2 10.8,2.5 17.5,6 8.7,10.7" strokeWidth="1.4" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.16" />
        <line x1="6.4" y1="4.8" x2="13.1" y2="8.3" strokeWidth="0.85" opacity="0.7" />
        <line x1="5.3" y1="8.9" x2="14.1" y2="4.2" strokeWidth="0.85" opacity="0.7" />
        {/* Middle & lower stacked CAD layer planes */}
        <polyline points="2,10.8 8.7,14.3 12.2,12.4" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="miter" />
        <polyline points="2,14.4 8.7,17.9 10.8,16.8" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="miter" />
        <polyline points="2,18 8.7,21.5 11.2,20.2" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="miter" />
        {/* Precision machined vernier gear at bottom-right */}
        <circle cx="16.5" cy="15.5" r="3.5" strokeWidth="1.5" fill="currentColor" fillOpacity="0.12" />
        <circle cx="16.5" cy="15.5" r="1.4" strokeWidth="1.2" />
        <path strokeLinecap="square" strokeWidth="1.6" d="M16.5 10.2v1.5M16.5 19.3v1.5M11.2 15.5h1.5M20.3 15.5h1.5M12.7 11.7l1.1 1.1M19.2 18.2l1.1 1.1M20.3 11.7l-1.1 1.1M13.8 18.2l-1.1 1.1" />
        {/* Field-to-finish descriptor code key rows at top-right */}
        <rect x="18.2" y="2.4" width="1.3" height="1.3" fill="currentColor" stroke="none" />
        <line x1="20.2" y1="3.05" x2="22" y2="3.05" strokeWidth="1.2" strokeLinecap="square" />
        <rect x="18.2" y="5" width="1.3" height="1.3" fill="currentColor" stroke="none" />
        <line x1="20.2" y1="5.65" x2="22" y2="5.65" strokeWidth="1.2" strokeLinecap="square" />
        <rect x="18.2" y="7.6" width="1.3" height="1.3" fill="currentColor" stroke="none" />
        <line x1="20.2" y1="8.25" x2="22" y2="8.25" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
);

// Standards Compliance Agent Glyph — Audited Engineering Sheet with North Star, Scale Bar & Precision Verification Shield
export const StandardsComplianceIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        {/* Engineering plan sheet frame with top title strip */}
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.5" d="M12.5 21H2.2V2.2H19.5V10.5" />
        <line x1="2.2" y1="5.6" x2="19.5" y2="5.6" strokeWidth="1.1" />
        <line x1="14" y1="2.2" x2="14" y2="5.6" strokeWidth="1" />
        {/* North star rose inside sheet top-right */}
        <polygon points="16.5,6.8 17.3,9.6 16.5,8.9 15.7,9.6" fill="currentColor" stroke="none" />
        {/* Audited checklist rows with verified checkboxes */}
        <rect x="4" y="7.6" width="1.8" height="1.8" strokeWidth="1.1" fill="currentColor" fillOpacity="0.25" />
        <line x1="7" y1="8.5" x2="13.5" y2="8.5" strokeWidth="1.2" strokeLinecap="square" />
        <rect x="4" y="11.2" width="1.8" height="1.8" strokeWidth="1.1" fill="currentColor" fillOpacity="0.25" />
        <line x1="7" y1="12.1" x2="12" y2="12.1" strokeWidth="1.2" strokeLinecap="square" />
        <rect x="4" y="14.8" width="1.8" height="1.8" strokeWidth="1.1" fill="currentColor" fillOpacity="0.25" />
        <line x1="7" y1="15.7" x2="11" y2="15.7" strokeWidth="1.2" strokeLinecap="square" />
        {/* Graphic bar scale at bottom-left of sheet */}
        <rect x="4" y="18.2" width="6.5" height="1.2" strokeWidth="0.9" />
        <line x1="6.2" y1="18.2" x2="6.2" y2="19.4" strokeWidth="0.9" />
        <line x1="8.4" y1="18.2" x2="8.4" y2="19.4" strokeWidth="0.9" />
        {/* Double-beveled verification shield & bold check mark at bottom-right */}
        <polygon points="17.2,10.8 22,12.6 22,17.4 17.2,22 12.4,17.4 12.4,12.6" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.18" />
        <polyline points="14.7,16.3 16.6,18.2 19.9,14.2" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
);

export const RedrawIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-7.95 0a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM12 12.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
    </svg>
);

export const ZoomExtentsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
);

// Stationing & Centerline Agent Glyph — Horizontal Highway Corridor Curve with Tangent PI Monument, PC/PT Nodes & Station/Offset Callouts
export const ScaleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Back & forward tangent lines intersecting at PI */}
        <polyline points="3.5,20 6,5.2 20.5,4.2" strokeWidth="1.05" strokeDasharray="2 1.4" opacity="0.75" />
        {/* Point of Intersection (PI) monument triangle with center dot */}
        <polygon points="6,2.4 8.6,6.6 3.4,6.6" strokeWidth="1.3" fill="currentColor" fillOpacity="0.22" strokeLinejoin="miter" />
        <circle cx="6" cy="5.2" r="0.7" fill="currentColor" stroke="none" />
        {/* Parallel corridor right-of-way edges & primary centerline curve */}
        <path strokeLinecap="square" strokeWidth="0.95" opacity="0.65" d="M2,19.5C3,9.8 10.5,3.2 20.2,2.6" />
        <path strokeLinecap="square" strokeWidth="1.8" d="M4,20.2C5,11.5 11.5,5.5 20.5,4.8" />
        <path strokeLinecap="square" strokeWidth="0.95" opacity="0.65" d="M6.2,21C7,13.4 12.8,7.8 20.8,7" />
        {/* Perpendicular station tick marks along alignment */}
        <line x1="2.2" y1="16.2" x2="6.8" y2="17" strokeWidth="1.3" strokeLinecap="square" />
        <line x1="4.8" y1="10.5" x2="8.8" y2="13.2" strokeWidth="1.3" strokeLinecap="square" />
        <line x1="9.6" y1="5.8" x2="12.4" y2="9.6" strokeWidth="1.3" strokeLinecap="square" />
        <line x1="16" y1="3.1" x2="16.8" y2="7.6" strokeWidth="1.3" strokeLinecap="square" />
        {/* Perpendicular offset callout vector & staked monument */}
        <line x1="11" y1="7.7" x2="17.8" y2="17.2" strokeWidth="1.15" strokeDasharray="1.6 1.2" />
        <rect x="16.4" y="15.8" width="3.8" height="3.8" strokeWidth="1.4" fill="currentColor" fillOpacity="0.18" />
        <circle cx="18.3" cy="17.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
);

export const AttributeScaleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20L7 15l2.5 5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.75 18h2.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18L16 10l4 8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.75 15h4.5" />
  </svg>
);

export const FullscreenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
    </svg>
);

export const ExitFullscreenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L3.75 3.75M3.75 3.75h4.5m-4.5 0v4.5m11.25-4.5L20.25 3.75m0 0h-4.5m4.5 0v4.5M9 15l-5.25 5.25m0 0h4.5m-4.5 0v-4.5m11.25 4.5l5.25 5.25m0 0h-4.5m4.5 0v-4.5" />
    </svg>
);

export const ArrowTopRightOnSquareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
);

export const ArrowDownOnSquareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75h-3M12 3.75v10.5m0 0l-3.75-3.75M12 14.25l3.75-3.75" />
    </svg>
);

export const ChatBubbleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m2.25 2.25H15M2.25 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9-9-4.03-9-9z" />
    </svg>
);

// Precision CAD Load / Upload Tray Glyph
export const ArrowUpTrayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path d="M3.6 15.2v5.4h16.8v-5.4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 15.8V4.2" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M7.4 8.7L12 4l4.6 4.7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="6" y1="18.4" x2="18" y2="18.4" strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
    </svg>
);

export const Bars3Icon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);

// GPS Rover Agent Glyph — RTK GNSS Rover Receiver Dome on Range Pole with Bullseye Level Vial & Stakeout Target Reticle
export const CrosshairsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Corner stakeout guidance brackets */}
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.3" d="M2 5.5V2h3.5M18.5 2H22v3.5M22 18.5V22h-3.5M5.5 22H2v-3.5" />
        {/* Outer precision stakeout bullseye ring & inner tolerance ring */}
        <circle cx="12" cy="12" r="8" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4.8" strokeWidth="1.1" strokeDasharray="2.2 1.3" opacity="0.85" />
        {/* Cardinal & intercardinal stadia graduation ticks */}
        <line x1="12" y1="2" x2="12" y2="6.8" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="12" y1="17.2" x2="12" y2="22" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="2" y1="12" x2="6.8" y2="12" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="17.2" y1="12" x2="22" y2="12" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="5.8" y1="5.8" x2="7.5" y2="7.5" strokeWidth="1" opacity="0.7" />
        <line x1="18.2" y1="5.8" x2="16.5" y2="7.5" strokeWidth="1" opacity="0.7" />
        <line x1="5.8" y1="18.2" x2="7.5" y2="16.5" strokeWidth="1" opacity="0.7" />
        <line x1="18.2" y1="18.2" x2="16.5" y2="16.5" strokeWidth="1" opacity="0.7" />
        {/* Central survey monument diamond & pinpoint */}
        <polygon points="12,9.4 14.6,12 12,14.6 9.4,12" strokeWidth="1.2" fill="currentColor" fillOpacity="0.22" strokeLinejoin="miter" />
        <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
);

// COGO Agent Glyph — Bearing-Bearing & Bearing-Distance Intersection Network with Tangent Circle, Subtended Angles & Control Monuments
export const CogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Distance-distance resection circle (dashed) */}
        <circle cx="13.5" cy="9.5" r="6.2" strokeWidth="1" strokeDasharray="2 1.3" opacity="0.75" />
        {/* Primary COGO closed traverse polygon */}
        <polygon points="3,19.5 19.8,19.5 13.5,3.5" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.1" />
        {/* Internal inverse & perpendicular offset drop-line */}
        <line x1="13.5" y1="3.5" x2="10.2" y2="19.5" strokeWidth="1.15" strokeDasharray="2 1.2" />
        <line x1="3" y1="19.5" x2="16.8" y2="11.8" strokeWidth="1.1" opacity="0.85" />
        {/* Right-angle perpendicularity square at baseline */}
        <polyline points="10.2,17.3 12.4,17.3 12.4,19.5" strokeWidth="1" opacity="0.85" />
        {/* Subtended interior horizontal angle arc at left control station */}
        <path strokeLinecap="square" strokeWidth="1.3" d="M8.4 19.5A5.4 5.4 0 0 0 6.2 14.6" />
        {/* Survey control monument squares & intersection point */}
        <rect x="1.8" y="18.3" width="2.4" height="2.4" fill="currentColor" stroke="none" />
        <rect x="18.6" y="18.3" width="2.4" height="2.4" fill="currentColor" stroke="none" />
        <rect x="12.3" y="2.3" width="2.4" height="2.4" fill="currentColor" stroke="none" />
        <circle cx="11.4" cy="14.8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
);

// Technical Specification / .lsvz Document Glyph
export const DocumentTextIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path d="M5 2.6h8.2L19 8.4v13H5V2.6z" strokeWidth="2" strokeLinejoin="round" />
        <path d="M13.2 2.6v5.8H19" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8.2" y1="12.2" x2="15.8" y2="12.2" strokeWidth="2" strokeLinecap="round" />
        <line x1="8.2" y1="16.2" x2="13.4" y2="16.2" strokeWidth="2" strokeLinecap="round" />
        <line x1="8.2" y1="19.2" x2="11.4" y2="19.2" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
        <rect x="16.3" y="17.8" width="1.2" height="1.2" fill="currentColor" stroke="none" opacity="0.35" />
    </svg>
);

export const ContainerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
);

export const InteroperabilityIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18m-7.5-12L21 9m0 0L16.5 4.5M21 9H3" />
    </svg>
);

export const OpenHandsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A11.953 11.953 0 0112 13.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0a8.997 8.997 0 01-7.843 4.582M12 21a8.997 8.997 0 007.843-4.582m-15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m-7.843 2.918A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253m0 0A11.953 11.953 0 0112 13.5c2.998 0 5.74-1.1 7.843-2.918m-7.843-2.918A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253m0 0a8.997 8.997 0 017.843-4.582" />
    </svg>
);

export const SunIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
);

export const MoonIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
);

export const MinusIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
);

// Information / About Glyph — Bold 'i' in a Clean Circular Bezel (No Polygon)
export const InfoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="12" cy="12" r="9.2" strokeWidth="2" />
        <line x1="9.3" y1="19" x2="14.7" y2="19" strokeWidth="0.9" strokeLinecap="round" opacity="0.35" />
        <line x1="12" y1="10.8" x2="12" y2="17.2" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="10.75" y="5.95" width="2.5" height="2.5" transform="rotate(45 12 7.2)" fill="currentColor" stroke="none" />
    </svg>
);

// Image Analyzer Agent Glyph — Machine-Vision Camera Chassis, Multi-Blade Iris Diaphragm & AI Feature Detection Reticle
export const CameraIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    {/* Machined camera body, shutter release button & pentaprism housing */}
    <rect x="3.5" y="5.2" width="2.5" height="1.8" strokeWidth="1.2" />
    <polygon points="2,7 6.8,7 8.4,4 15.6,4 17.2,7 22,7 22,20.5 2,20.5" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.06" />
    {/* Right-hand grip texture line & top hot-shoe flash mount */}
    <line x1="5.2" y1="7" x2="5.2" y2="20.5" strokeWidth="0.9" opacity="0.55" />
    <line x1="10.2" y1="2.5" x2="13.8" y2="2.5" strokeWidth="1.4" strokeLinecap="square" />
    {/* Outer knurled lens barrel & inner optical element */}
    <circle cx="13" cy="13.8" r="5" strokeWidth="1.5" />
    <circle cx="13" cy="13.8" r="3.1" strokeWidth="1" opacity="0.85" fill="currentColor" fillOpacity="0.16" />
    {/* Tangential iris aperture blades */}
    <line x1="13" y1="8.8" x2="15.2" y2="11.2" strokeWidth="0.9" opacity="0.75" />
    <line x1="18" y1="13.8" x2="15.6" y2="16" strokeWidth="0.9" opacity="0.75" />
    <line x1="13" y1="18.8" x2="10.8" y2="16.4" strokeWidth="0.9" opacity="0.75" />
    <line x1="8" y1="13.8" x2="10.4" y2="11.6" strokeWidth="0.9" opacity="0.75" />
    <circle cx="13" cy="13.8" r="1" fill="currentColor" stroke="none" />
    {/* AI bounding-box corner brackets inside frame */}
    <path strokeLinecap="square" strokeWidth="1.15" d="M6.8 9.8V8.5h1.3M19.2 9.8V8.5h-1.3M6.8 17.8v1.3h1.3M19.2 17.8v1.3h-1.3" />
  </svg>
);

// Drone Agent Glyph — Quadcopter Photogrammetry UAV with Spinning Rotor Arcs, Nadir Gimbal & Ground Control Swath Grid
export const DroneIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Diagonal carbon-fiber airframe booms */}
        <line x1="5" y1="5" x2="19" y2="13.5" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="19" y1="5" x2="5" y2="13.5" strokeWidth="1.5" strokeLinecap="square" />
        {/* Four rotor guard rings & propeller blades */}
        <circle cx="4.8" cy="4.8" r="2.5" strokeWidth="1.4" />
        <circle cx="19.2" cy="4.8" r="2.5" strokeWidth="1.4" />
        <circle cx="4.8" cy="13.5" r="2.2" strokeWidth="1.3" />
        <circle cx="19.2" cy="13.5" r="2.2" strokeWidth="1.3" />
        <line x1="3.2" y1="4.8" x2="6.4" y2="4.8" strokeWidth="1.1" />
        <line x1="17.6" y1="4.8" x2="20.8" y2="4.8" strokeWidth="1.1" />
        {/* Central RTK fuselage & nadir photogrammetry camera lens */}
        <polygon points="9.8,6.8 14.2,6.8 15.2,11.6 8.8,11.6" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.22" />
        <circle cx="12" cy="9.2" r="1.1" fill="currentColor" stroke="none" />
        {/* Downward photogrammetry stereo-overlap frustum rays */}
        <line x1="10.2" y1="11.6" x2="5.5" y2="20.5" strokeWidth="1.1" strokeDasharray="1.6 1.1" />
        <line x1="13.8" y1="11.6" x2="18.5" y2="20.5" strokeWidth="1.1" strokeDasharray="1.6 1.1" />
        <line x1="12" y1="11.6" x2="12" y2="21.5" strokeWidth="0.9" opacity="0.7" />
        {/* Orthomosaic ground swath grid with GCP target */}
        <polygon points="4.5,21.5 19.5,21.5 17,18.2 7,18.2" strokeWidth="1.3" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.14" />
        <line x1="5.8" y1="19.8" x2="18.2" y2="19.8" strokeWidth="0.85" opacity="0.7" />
    </svg>
);

// GIS Agent Glyph — Geodesic Graticule Globe with Projected Spatial Parcel Layer, Attribute Table & Coordinate Pin
export const GlobeAltIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      {/* Geodesic sphere perimeter & graticule meridians/parallels */}
      <circle cx="10.5" cy="12.5" r="8.2" strokeWidth="1.5" />
      <ellipse cx="10.5" cy="12.5" rx="4" ry="8.2" strokeWidth="1.05" opacity="0.75" />
      <line x1="2.3" y1="12.5" x2="18.7" y2="12.5" strokeWidth="1.05" opacity="0.75" />
      <path strokeWidth="0.95" opacity="0.65" d="M3.6 8C7.5 9.2 13.5 9.2 17.4 8" />
      <path strokeWidth="0.95" opacity="0.65" d="M3.6 17C7.5 15.8 13.5 15.8 17.4 17" />
      {/* Projected vector GIS parcel polygon layer breaking out to top-right */}
      <polygon points="11.8,5.8 21.5,3 20.2,12.2 13,10.8" strokeWidth="1.6" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.24" />
      {/* Internal parcel subdivision line inside GIS layer */}
      <line x1="16.6" y1="4.4" x2="16.6" y2="11.5" strokeWidth="1" opacity="0.8" />
      {/* GIS vertex nodes */}
      <rect x="10.8" y="4.8" width="1.9" height="1.9" fill="currentColor" stroke="none" />
      <rect x="20.5" y="2" width="1.9" height="1.9" fill="currentColor" stroke="none" />
      <rect x="19.2" y="11.2" width="1.9" height="1.9" fill="currentColor" stroke="none" />
      <rect x="12" y="9.8" width="1.9" height="1.9" fill="currentColor" stroke="none" />
    </svg>
);

export const GisAgentIcon = GlobeAltIcon;

export const BugAntIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m-2 2L7 2m7 2 3-2M6.5 9 4 7m13.5 2 2.5-2M6.5 13H4m13.5 0H20m-13.5 4-2.5 2m16-2 2.5 2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v9" />
    </svg>
);

export const EyeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.432 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export const EyeSlashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" />
  </svg>
);

export const PencilSquareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
);

export const RotateCwIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
  </svg>
);

export const RotateCcwIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

// Contouring Agent Glyph — Topographic Saddle & Summit Isolines Intertwined with a Delaunay TIN Mesh & Spot Benchmark
export const ContourIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Corner map graticule ticks */}
        <path strokeLinecap="square" strokeWidth="1.3" d="M2 5V2h3M19 2h3v3M22 19v3h-3M5 22H2v-3" />
        {/* Outer index contour ring (bold) */}
        <path strokeWidth="1.6" d="M2.5 15.8C2.8 8.2 7.5 3.2 14.2 3.8C19.8 4.3 21.6 9.2 21 15C20.4 19.8 15.6 21.4 9.6 20.8C4.8 20.3 2.2 19.2 2.5 15.8Z" />
        {/* Intermediate contour rings */}
        <path strokeWidth="1.15" opacity="0.88" d="M5.4 14.8C5.8 9.8 9.2 6.2 13.8 6.6C17.8 7 18.8 10.4 18.3 14.2C17.8 17.4 14.4 18.5 10.4 18C7 17.6 5.1 17.2 5.4 14.8Z" />
        <path strokeWidth="1.1" opacity="0.8" d="M8.4 13.8C8.6 11 10.6 9 13.4 9.3C15.6 9.5 16.2 11.4 15.9 13.5C15.6 15.2 13.6 15.8 11.2 15.5C9.3 15.2 8.2 15 8.4 13.8Z" />
        {/* Delaunay TIN triangulation facets radiating from summit */}
        <polyline points="4.2,17.8 12.6,12.4 19.6,7.8" strokeWidth="0.85" strokeDasharray="1.4 1.1" opacity="0.7" />
        <polyline points="8.2,4.8 12.6,12.4 16.2,19.6" strokeWidth="0.85" strokeDasharray="1.4 1.1" opacity="0.7" />
        {/* Summit benchmark triangle monument */}
        <polygon points="12.6,10.8 14.1,13.4 11.1,13.4" fill="currentColor" stroke="none" />
    </svg>
);

// Profile & Cross Section Agent Glyph — Engineering Profile Grid with Existing Terrain, Vertical Curve Tangent, PVI Triangle & Cut/Fill Ordinates
export const ProfileIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Profile graph frame & bottom station/elevation title band */}
        <rect x="2" y="2.5" width="20" height="19" strokeWidth="1.5" strokeLinejoin="miter" />
        <line x1="2" y1="17.5" x2="22" y2="17.5" strokeWidth="1.2" />
        {/* Left-edge elevation ruler ticks */}
        <line x1="2" y1="6.2" x2="3.6" y2="6.2" strokeWidth="1" />
        <line x1="2" y1="10" x2="3.6" y2="10" strokeWidth="1" />
        <line x1="2" y1="13.8" x2="3.6" y2="13.8" strokeWidth="1" />
        {/* Vertical ordinate station gridlines */}
        <line x1="7" y1="2.5" x2="7" y2="17.5" strokeWidth="0.8" strokeDasharray="1.4 1.4" opacity="0.55" />
        <line x1="12" y1="2.5" x2="12" y2="17.5" strokeWidth="0.8" strokeDasharray="1.4 1.4" opacity="0.55" />
        <line x1="17" y1="2.5" x2="17" y2="17.5" strokeWidth="0.8" strokeDasharray="1.4 1.4" opacity="0.55" />
        {/* Existing ground (EG) dashed terrain profile */}
        <path strokeWidth="1.2" strokeDasharray="2.2 1.3" opacity="0.85" d="M2 14.8C4.8 13.8 6.5 7.5 9.5 8.8C12.5 10.1 14.5 5.2 17.5 6.4C19.5 7.2 20.8 5.5 22 4.8" />
        {/* Proposed finished grade (FG) bold alignment with PVI nodes */}
        <polyline points="2,16.2 8.5,10.5 15.5,11.2 22,5.8" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" />
        <polygon points="8.5,8.8 10,11.4 7,11.4" fill="currentColor" stroke="none" />
        <rect x="14.5" y="10.2" width="2" height="2" fill="currentColor" stroke="none" />
        {/* Bottom datum band station ticks */}
        <line x1="7" y1="17.5" x2="7" y2="21.5" strokeWidth="1" />
        <line x1="12" y1="17.5" x2="12" y2="21.5" strokeWidth="1" />
        <line x1="17" y1="17.5" x2="17" y2="21.5" strokeWidth="1" />
    </svg>
);

export const ExclamationTriangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);

export const BreaklineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3-4 3 8 3-4h4" />
    </svg>
);

export const InclusionLineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18 M3 8l4 4-4 4 M21 8l-4 4 4 4" />
    </svg>
);

// Steep Slope Agent Glyph — Rugged Mountain Escarpment with CAD Slope Hachures (Tadpoles) & Steep Grade Callout
export const SlopeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Distant secondary ridge peak for topographic depth */}
        <polyline points="2,16.5 6.5,9.5 11,13.5" strokeWidth="1.1" opacity="0.55" strokeLinejoin="miter" />
        {/* Primary steep mountain ridge & cliff escarpment face */}
        <polygon points="2,21 15.5,3.5 21.5,11 21.5,21" strokeWidth="1.6" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.14" />
        {/* Internal TIN facet ridges descending from peak */}
        <polyline points="15.5,3.5 12.5,13.5 21.5,15.5" strokeWidth="1.1" strokeLinejoin="miter" opacity="0.8" />
        <polyline points="8.5,12.5 12.5,13.5 9.5,21" strokeWidth="1.1" strokeLinejoin="miter" opacity="0.8" />
        <line x1="12.5" y1="13.5" x2="16.5" y2="21" strokeWidth="1" opacity="0.7" />
        {/* Traditional surveying slope hachure ticks along the upper ridge */}
        <line x1="13.2" y1="6.5" x2="15.2" y2="8.2" strokeWidth="1.1" />
        <line x1="10.8" y1="9.6" x2="13.2" y2="11.6" strokeWidth="1.1" />
        <line x1="6.2" y1="15.6" x2="8.6" y2="17.6" strokeWidth="1.1" />
        {/* Steep fall-line grade vector arrow running parallel to the slope */}
        <line x1="11.5" y1="4" x2="4" y2="13.8" strokeWidth="1.4" strokeLinecap="square" />
        <polyline points="4,10.5 4,13.8 7.3,13.8" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter" />
        {/* Toe-of-slope angle arc */}
        <path strokeWidth="1.2" d="M6.8 21A4.8 4.8 0 0 0 5 17.2" />
    </svg>
);

export const ExclusionLineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18 M3 12l4-4m-4 4l4 4 M21 12l-4-4m4 4l-4 4" />
    </svg>
);

export const ScissorsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        {/* Top handle/ring */}
        <circle cx="5" cy="5" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Bottom handle/ring */}
        <circle cx="5" cy="19" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Top blade - much longer */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 5.5L22 12" />
        {/* Bottom blade - much longer */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 18.5L22 12" />
        {/* Sharp point at tips */}
        <circle cx="22" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

export const UndoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
);

export const RedoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
);

export const ExtendIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        {/* Main line */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h10" />
        {/* Extension arrow */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 12h6M17 9l3 3-3 3" />
        {/* Endpoint circles */}
        <circle cx="4" cy="12" r="1.5" fill="currentColor" />
        <circle cx="14" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

export const PolylineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        {/* Connected line segments forming a path */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 18L9 12L15 15L20 6" />
        {/* Point markers at vertices */}
        <circle cx="4" cy="18" r="1.5" fill="currentColor" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="15" r="1.5" fill="currentColor" />
        <circle cx="20" cy="6" r="1.5" fill="currentColor" />
    </svg>
);

// RINEX / GNSS Agent Glyph — Orbital GNSS Satellite with Multi-Cell Solar Wings, L1/L2/L5 Carrier Wavefronts & CORS Base Monument
export const SatelliteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Central octagonal satellite bus & L-band antenna array */}
        <polygon points="12.5,5 15.8,8.3 12.5,11.6 9.2,8.3" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.24" />
        <circle cx="12.5" cy="8.3" r="0.9" fill="currentColor" stroke="none" />
        {/* Left & right multi-cell solar array wings */}
        <polygon points="4.2,4.2 8.2,8.2 10.6,5.8 6.6,1.8" strokeWidth="1.35" strokeLinejoin="miter" />
        <polygon points="14.4,10.8 18.4,14.8 20.8,12.4 16.8,8.4" strokeWidth="1.35" strokeLinejoin="miter" />
        <line x1="5.4" y1="3" x2="9.4" y2="7" strokeWidth="0.9" opacity="0.75" />
        <line x1="6.2" y1="6.2" x2="8.6" y2="3.8" strokeWidth="0.9" opacity="0.75" />
        <line x1="15.6" y1="9.6" x2="19.6" y2="13.6" strokeWidth="0.9" opacity="0.75" />
        <line x1="16.4" y1="12.8" x2="18.8" y2="10.4" strokeWidth="0.9" opacity="0.75" />
        {/* L1 / L2 / L5 carrier-phase wavefront arcs propagating to ground */}
        <path strokeLinecap="square" strokeWidth="1.25" d="M7.5 11.8A4.8 4.8 0 0 0 11.8 13.8" />
        <path strokeLinecap="square" strokeWidth="1.2" opacity="0.85" d="M5.5 13.8A7.6 7.6 0 0 0 12.2 16.4" />
        <line x1="10.8" y1="10" x2="6.2" y2="17.2" strokeWidth="0.95" strokeDasharray="1.4 1.1" opacity="0.75" />
        {/* Ground CORS reference station monument & choke-ring dome at bottom-left */}
        <line x1="3" y1="17.2" x2="8" y2="17.2" strokeWidth="1.5" strokeLinecap="square" />
        <polygon points="5.5,17.2 8.5,21.8 2.5,21.8" strokeWidth="1.4" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.2" />
        <circle cx="5.5" cy="20.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
);


export const MonitorIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
);

// AR Visualization Agent Glyph — Mixed-Reality Spatial Visor Projecting a 3D Holographic Terrain Cube & X/Y/Z Survey Axes
export const ARIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Mixed-reality headset visor & temple arms at top */}
        <polyline points="2,6.2 3.5,3.5 20.5,3.5 22,6.2" strokeWidth="1.2" strokeLinejoin="miter" />
        <polygon points="3.2,3.5 20.8,3.5 19.4,9.2 14,9.2 12,7.5 10,9.2 4.6,9.2" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.16" />
        {/* Dual optical tracking sensors on visor */}
        <rect x="6" y="5.2" width="2.8" height="1.6" strokeWidth="1.1" />
        <rect x="15.2" y="5.2" width="2.8" height="1.6" strokeWidth="1.1" />
        {/* Holographic frustum projection beams */}
        <line x1="6.5" y1="9.2" x2="6.5" y2="14.2" strokeWidth="1" strokeDasharray="1.4 1.1" opacity="0.75" />
        <line x1="17.5" y1="9.2" x2="17.5" y2="14.2" strokeWidth="1" strokeDasharray="1.4 1.1" opacity="0.75" />
        {/* Projected 3D isometric terrain cube with internal Z-axis */}
        <polygon points="12,11.2 17.8,14.2 17.8,19.2 12,22 6.2,19.2 6.2,14.2" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.1" />
        <path strokeWidth="1.15" d="M6.2 14.2L12 17L17.8 14.2M12 17V22" />
        <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </svg>
);

// Zoning Agent Glyph — Municipal Zoning District Map with Setback Building Envelope, Hatching & Dimensional Arrows
export const ZoningIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Outer municipal zoning map boundary with corner monuments */}
        <rect x="2.2" y="2.2" width="19.6" height="19.6" strokeWidth="1.5" strokeLinejoin="miter" />
        <rect x="1.4" y="1.4" width="1.8" height="1.8" fill="currentColor" stroke="none" />
        <rect x="20.8" y="1.4" width="1.8" height="1.8" fill="currentColor" stroke="none" />
        <rect x="1.4" y="20.8" width="1.8" height="1.8" fill="currentColor" stroke="none" />
        <rect x="20.8" y="20.8" width="1.8" height="1.8" fill="currentColor" stroke="none" />
        {/* Zoning district boundary splits */}
        <line x1="13.6" y1="2.2" x2="13.6" y2="21.8" strokeWidth="1.4" />
        <line x1="13.6" y1="12" x2="21.8" y2="12" strokeWidth="1.4" />
        {/* Buildable setback envelope (dashed) & front/side yard setback arrows */}
        <rect x="5" y="5.5" width="6" height="13" strokeWidth="1.2" strokeDasharray="2 1.2" fill="currentColor" fillOpacity="0.18" />
        <line x1="2.2" y1="12" x2="5" y2="12" strokeWidth="1" />
        <line x1="8" y1="2.2" x2="8" y2="5.5" strokeWidth="1" />
        {/* Diagonal commercial/overlay district hatching in top-right quadrant */}
        <line x1="15" y1="3.8" x2="20.2" y2="9" strokeWidth="1" opacity="0.8" />
        <line x1="17.6" y1="3.4" x2="20.6" y2="6.4" strokeWidth="1" opacity="0.8" />
        <line x1="14.6" y1="6.4" x2="17.6" y2="9.4" strokeWidth="1" opacity="0.8" />
        {/* Cross-hatched industrial/open-space zone in bottom-right quadrant */}
        <line x1="15.4" y1="14.8" x2="19.8" y2="14.8" strokeWidth="1.2" strokeLinecap="square" />
        <line x1="15.4" y1="17.4" x2="19.8" y2="17.4" strokeWidth="1.2" strokeLinecap="square" />
        <line x1="15.4" y1="19.8" x2="18.2" y2="19.8" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
);

// C3D Connector Plug Glyph — Bold Connector That Inherits Its Button Colour
export const PlugIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <line x1="9.2" y1="2.6" x2="9.2" y2="6.8" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="14.8" y1="2.6" x2="14.8" y2="6.8" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M6.2 6.8h11.6v3.6a5.8 5.8 0 0 1-11.6 0V6.8z" strokeWidth="2.1" strokeLinejoin="round" />
        <line x1="6.9" y1="8.8" x2="17.1" y2="8.8" strokeWidth="0.9" opacity="0.35" />
        <circle cx="12" cy="8.8" r="0.8" fill="currentColor" stroke="none" opacity="0.7" />
        <line x1="12" y1="16.2" x2="12" y2="21.4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

// Legal & Compliance Balance Beam Glyph — Bold Scales of Justice on a Stepped Pedestal
export const LegalScaleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="12" cy="3.4" r="1.4" fill="currentColor" stroke="none" />
        <line x1="12" y1="4.6" x2="12" y2="19.4" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="3.8" y1="6.6" x2="20.2" y2="6.6" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="10.9" y="5.5" width="2.2" height="2.2" transform="rotate(45 12 6.6)" fill="currentColor" stroke="none" opacity="0.85" />
        <line x1="4" y1="6.9" x2="4" y2="8.6" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
        <line x1="20" y1="6.9" x2="20" y2="8.6" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
        <path d="M6.3 8.6H1.7l2.3 5.2z" strokeWidth="1.9" strokeLinejoin="round" fill="currentColor" fillOpacity="0.25" />
        <path d="M17.7 8.6h4.6l-2.3 5.2z" strokeWidth="1.9" strokeLinejoin="round" fill="currentColor" fillOpacity="0.25" />
        <line x1="7.6" y1="19.4" x2="16.4" y2="19.4" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="5.6" y1="21.6" x2="18.4" y2="21.6" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

// Geodetic Projection Ellipsoid Glyph — Bold State Plane / EPSG Graticule Globe
export const ProjectionGlobeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="12" cy="12" r="8.6" strokeWidth="2.1" />
        <ellipse cx="12" cy="12" rx="4.2" ry="8.6" strokeWidth="1.7" />
        <line x1="3.4" y1="12" x2="20.6" y2="12" strokeWidth="1.9" />
        <path strokeWidth="1.7" d="M5.2 7.4c4.3 1.5 9.3 1.5 13.6 0M5.2 16.6c4.3-1.5 9.3-1.5 13.6 0" />
        <line x1="12" y1="1.4" x2="12" y2="3.4" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <line x1="12" y1="20.6" x2="12" y2="22.6" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <line x1="1.4" y1="12" x2="3.4" y2="12" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <line x1="20.6" y1="12" x2="22.6" y2="12" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
);

// Title Search Agent Glyph — Historical Deed Folios, Chain-of-Title Node Graph, Recorder Seal & Optical Loupe
export const TitleSearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Stacked historical deed book folios */}
        <polyline points="5.5,4.2 5.5,2 19,2 19,10.5" strokeWidth="1.2" opacity="0.65" strokeLinejoin="miter" />
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.5" d="M11.2 20.5H2.5V4.2h14v7" />
        {/* Chain-of-title conveyance linkage graph on primary deed */}
        <polyline points="5.5,7.8 9.8,7.8 9.8,11.8 5.5,11.8 5.5,15.8 9.2,15.8" strokeWidth="1.25" strokeLinecap="square" strokeLinejoin="miter" />
        <rect x="4.4" y="6.7" width="2.2" height="2.2" fill="currentColor" stroke="none" />
        <rect x="8.7" y="10.7" width="2.2" height="2.2" fill="currentColor" stroke="none" />
        <rect x="4.4" y="14.7" width="2.2" height="2.2" fill="currentColor" stroke="none" />
        {/* County Recorder official ribbon seal on top-right of deed */}
        <circle cx="13.2" cy="7.5" r="1.3" strokeWidth="1.1" fill="currentColor" fillOpacity="0.25" />
        {/* Precision optical magnifier reticle at bottom-right */}
        <circle cx="16.2" cy="16.2" r="3.8" strokeWidth="1.5" fill="currentColor" fillOpacity="0.14" />
        <line x1="18.9" y1="18.9" x2="22" y2="22" strokeWidth="1.9" strokeLinecap="square" />
        <line x1="14.6" y1="16.2" x2="17.8" y2="16.2" strokeWidth="0.9" opacity="0.8" />
        <line x1="16.2" y1="14.6" x2="16.2" y2="17.8" strokeWidth="0.9" opacity="0.8" />
    </svg>
);

// Sparkles icon for AI/Training features
export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 18l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.178a3.375 3.375 0 002.456 2.456L20.5 18l-1.178.398a3.375 3.375 0 00-2.424 2.424z" />
    </svg>
);

// Cryptographic API Key Glyph — Bold Key with Solid Bow and Bitted Blade
export const KeyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="7.4" cy="12" r="4.6" strokeWidth="2.2" />
        <circle cx="7.4" cy="12" r="3" strokeWidth="0.85" opacity="0.4" />
        <circle cx="7.4" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <line x1="13.6" y1="9.8" x2="13.6" y2="14.2" strokeWidth="1.05" strokeLinecap="round" opacity="0.6" />
        <line x1="12" y1="12" x2="21.2" y2="12" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="16.2" y1="12" x2="16.2" y2="16.6" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="20" y1="12" x2="20" y2="15.4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

// Precision Machined Settings Gear Glyph — Bold Ring, Hub and Eight Teeth
export const CogIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="12" cy="12" r="6.2" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.4" strokeWidth="2" />
        <circle cx="12" cy="12" r="0.55" fill="currentColor" stroke="none" opacity="0.5" />
        <path strokeWidth="2.2" strokeLinecap="butt" d="M12 1.6v4.2M12 18.2v4.2M1.6 12h4.2M18.2 12h4.2M4.6 4.6l3 3M16.4 16.4l3 3M19.4 4.6l-3 3M7.6 16.4l-3 3" />
    </svg>
);

// Flood Zone Agent Glyph — Rising Floodwater Waves Inundating a Structure with Staff Gauge & BFE Datum Line
export const FloodIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Left-side vertical hydrological staff gauge ruler */}
        <line x1="3.5" y1="2.5" x2="3.5" y2="13.5" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="3.5" y1="3.5" x2="5.5" y2="3.5" strokeWidth="1.2" />
        <line x1="3.5" y1="6.2" x2="5" y2="6.2" strokeWidth="1.1" />
        <line x1="3.5" y1="9" x2="5.5" y2="9" strokeWidth="1.2" />
        <line x1="3.5" y1="11.8" x2="5" y2="11.8" strokeWidth="1.1" />
        {/* Base Flood Elevation (BFE) datum line & water-surface triangle */}
        <line x1="6" y1="9" x2="21.5" y2="9" strokeWidth="1.1" strokeDasharray="2.2 1.4" opacity="0.85" />
        <polygon points="8.5,9 10,6.2 7,6.2" strokeWidth="1.1" fill="currentColor" fillOpacity="0.3" strokeLinejoin="miter" />
        {/* Partially inundated structure / house on right bank */}
        <polygon points="11.5,7.5 16.5,3 21.5,7.5" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.18" />
        <polyline points="12.8,7.5 12.8,14 20.2,14 20.2,7.5" strokeWidth="1.4" strokeLinejoin="miter" />
        <rect x="15.3" y="9.2" width="2.4" height="2.4" strokeWidth="1.1" />
        {/* Three full-width surging floodwater wave crests at bottom */}
        <path strokeLinecap="square" strokeWidth="1.6" d="M2 14.5C4.5 12.6 6.5 16.4 9 14.5C11.5 12.6 13.5 16.4 16 14.5C18.5 12.6 20 16.4 22 14.5" />
        <path strokeLinecap="square" strokeWidth="1.5" opacity="0.9" d="M2 18C4.5 16.1 6.5 19.9 9 18C11.5 16.1 13.5 19.9 16 18C18.5 16.1 20 19.9 22 18" />
        <path strokeLinecap="square" strokeWidth="1.3" opacity="0.7" d="M2 21.2C4.5 19.6 6.5 22.8 9 21.2C11.5 19.6 13.5 22.8 16 21.2C18.5 19.6 20 22.8 22 21.2" />
    </svg>
);

// Structures Agent Glyph — Detailed Architectural House with Gable Roof, Chimney, Dormer & Surveyed Footprint Corners
export const StructuresIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Surveyed building footprint base & setback ticks */}
        <line x1="2" y1="20" x2="22" y2="20" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="4.5" y1="22" x2="19.5" y2="22" strokeWidth="1" strokeDasharray="2 1.4" opacity="0.75" />
        {/* Chimney stack on right roof slope */}
        <polyline points="16.2,6.8 16.2,3.2 18.8,3.2 18.8,9.2" strokeWidth="1.4" strokeLinejoin="miter" />
        {/* Sharp overhanging pitched gable roof */}
        <polygon points="2,11 12,2.5 22,11 19.8,11 12,4.4 4.2,11" strokeWidth="1.4" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.2" />
        {/* Attic gable louver / dormer window */}
        <polygon points="10.2,8.8 12,7.2 13.8,8.8" strokeWidth="1.1" strokeLinejoin="miter" />
        {/* Main house walls */}
        <rect x="4.5" y="11" width="15" height="9" strokeWidth="1.5" strokeLinejoin="miter" fill="currentColor" fillOpacity="0.08" />
        {/* Front entrance door & transom */}
        <rect x="10.3" y="14.2" width="3.4" height="5.8" strokeWidth="1.3" />
        {/* Left & right multi-pane windows */}
        <rect x="6.2" y="13" width="2.6" height="2.8" strokeWidth="1.1" />
        <rect x="15.2" y="13" width="2.6" height="2.8" strokeWidth="1.1" />
        {/* Rectified BLDG survey monument nodes at structure corners */}
        <rect x="3.4" y="18.9" width="2.2" height="2.2" fill="currentColor" stroke="none" />
        <rect x="18.4" y="18.9" width="2.2" height="2.2" fill="currentColor" stroke="none" />
        <rect x="10.9" y="1.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    </svg>
);

/** Soils Agent Glyph — Geotechnical Soil Core Pit with O/A/B/C/R Horizons, Prismatic Clay Peds, Bedrock Fractures & Auger T-Handle */
export const StormwaterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Falling drop with a grated inlet cross-section */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.6c3.1 4 5.1 6.7 5.1 9.2a5.1 5.1 0 1 1-10.2 0c0-2.5 2-5.2 5.1-9.2Z" />
        <path strokeLinecap="round" strokeWidth={1.2} opacity={0.85} d="M9.4 10.6h5.2M9.8 13.1h4.4" />
        {/* Runoff sheet flow along the surface */}
        <path strokeLinecap="round" strokeWidth={1.1} opacity={0.6} d="M2.6 20.9c1.15-.85 2.3-.85 3.45 0 1.15.85 2.3.85 3.45 0 1.15-.85 2.3-.85 3.45 0 1.15.85 2.3.85 3.45 0 1.15-.85 2.3-.85 3.45 0" />
    </svg>
);

/** Dirt Volume Agent Glyph — existing vs proposed ground with cut/fill arrows */
export const DirtVolumeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Existing ground (dashed) over proposed grade */}
        <path strokeLinecap="round" strokeDasharray="2 1.6" opacity={0.8} d="M2.5 8.2c2.6 0 3.7-2.9 6-2.9 2.3 0 3 2.6 5.1 2.6 2.2 0 3.2-2.3 7.9-2.3" />
        <path strokeLinecap="round" d="M2.5 13.1c2.7 0 3.9-1.5 6-1.5 2.2 0 3 1.3 5.1 1.3 2.1 0 3.2-1.2 7.9-1.2" />
        {/* Cut arrow (material removed) */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.2 10.1V4.6m0 0L5.7 6.1m1.5-1.5 1.5 1.5" />
        {/* Fill arrow (material placed) */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.8 10.7v5.5m0 0-1.5-1.5m1.5 1.5 1.5-1.5" />
        {/* Base line and hatch marks */}
        <path strokeLinecap="round" d="M2.5 20.5h19" />
        <path strokeLinecap="round" opacity={0.55} d="M5 20.5l-1.4-2.1M9.5 20.5l-1.4-2.1M14 20.5l-1.4-2.1M18.5 20.5l-1.4-2.1" />
    </svg>
);

export const SoilsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        {/* Top soil auger T-handle & surface grass/organic O-horizon */}
        <line x1="15.5" y1="2.2" x2="21.5" y2="2.2" strokeWidth="1.5" strokeLinecap="square" />
        <line x1="18.5" y1="2.2" x2="18.5" y2="17" strokeWidth="1.3" strokeDasharray="2 1" />
        {/* Outer SSURGO soil profile pit frame */}
        <rect x="2.2" y="4.5" width="19.6" height="17" strokeWidth="1.5" strokeLinejoin="miter" />
        {/* A-horizon (topsoil) undulating boundary & granular loam texture */}
        <path strokeWidth="1.3" d="M2.2 8.8C7 8 11 9.5 15.5 8.5C18.5 7.9 20.2 8.8 21.8 8.6" />
        <circle cx="6.2" cy="6.6" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="10.2" cy="6.9" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="14.2" cy="6.4" r="0.7" fill="currentColor" stroke="none" />
        {/* B-horizon (subsoil) blocky prismatic clay peds */}
        <path strokeWidth="1.3" d="M2.2 15C8 15.6 14 14.2 21.8 15" />
        <line x1="7.5" y1="8.7" x2="7.5" y2="15.2" strokeWidth="1" opacity="0.75" />
        <line x1="12.5" y1="8.8" x2="12.5" y2="14.7" strokeWidth="1" opacity="0.75" />
        <line x1="7.5" y1="11.8" x2="12.5" y2="11.8" strokeWidth="0.9" opacity="0.65" />
        {/* C/R-horizon (weathered substratum cobbles & bedrock fractures) */}
        <polygon points="5.5,17.2 8.2,16.6 8.8,19.2 5.8,19.8" strokeWidth="1" fill="currentColor" fillOpacity="0.2" />
        <line x1="10.8" y1="16.4" x2="14.8" y2="20.2" strokeWidth="1.1" opacity="0.85" />
        <line x1="14.8" y1="16.4" x2="18.8" y2="20.2" strokeWidth="1.1" opacity="0.85" />
        {/* Left-edge pedological depth scale ticks */}
        <line x1="2.2" y1="6.6" x2="4" y2="6.6" strokeWidth="1.1" />
        <line x1="2.2" y1="11.8" x2="4" y2="11.8" strokeWidth="1.1" />
        <line x1="2.2" y1="18.2" x2="4" y2="18.2" strokeWidth="1.1" />
    </svg>
);

export const CircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

export const ArrowLeftIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
);

export const CodeBracketIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
);

export const GitHubIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
);

export const YouTubeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
);

export const FacebookIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 21v-8h2.75l.41-3.12H13.5V7.89c0-.9.25-1.51 1.55-1.51h1.66V3.59A22.23 22.23 0 0 0 14.29 3C11.9 3 10.26 4.46 10.26 7.14v2.74H7.5V13h2.76v8h3.24Z" />
    </svg>
);

export const LinkedInIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);

export const PauseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
);

export const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
);


