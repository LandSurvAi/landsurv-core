/**
 * LandSurv.ai Documentation Registry
 * Authoritative content store for documentation.landsurv.ai and staging-documentation.landsurv.ai.
 * Structured across the 5 core platform pillars.
 */

export type DocPillarId =
  | 'getting-started'
  | 'agents'
  | 'civil3d'
  | 'api-gateway'
  | 'specs';

export interface DocPillar {
  id: DocPillarId;
  title: string;
  badge: string;
  description: string;
  iconName: string;
}

export interface DocParameter {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description: string;
}

export interface DocCallout {
  type: 'info' | 'warning' | 'tip';
  title: string;
  text: string;
}

export interface DocCodeBlock {
  language: string;
  caption?: string;
  code: string;
}

export interface DocArticleSection {
  title: string;
  content: string[];
  callout?: DocCallout;
  codeBlock?: DocCodeBlock;
  parameters?: DocParameter[];
}

export interface DocArticle {
  id: string; // URL slug e.g. "quickstart", "c3d-live-sync"
  pillarId: DocPillarId;
  title: string;
  description: string;
  readTimeMinutes: number;
  lastUpdated: string;
  statusBadge?: string;
  tags: string[];
  sections: DocArticleSection[];
  relatedDocs?: string[]; // IDs of related articles
  externalLinks?: { label: string; url: string }[];
}

export const DOC_PILLARS: DocPillar[] = [
  {
    id: 'getting-started',
    title: 'Platform Overview & Getting Started',
    badge: 'Core Essentials',
    description: 'Learn the architectural foundations of LandSurv.ai, workspace layout, project persistence, and security controls.',
    iconName: 'Compass',
  },
  {
    id: 'agents',
    title: 'Agent Guides & Survey Workflows',
    badge: 'AI Agents',
    description: 'Field-to-finish workflows spanning deed analysis, plan review, redline resolution, COGO math, point clouds, RINEX GNSS, contouring, and corridor design.',
    iconName: 'Bot',
  },
  {
    id: 'civil3d',
    title: 'Civil 3D Integration & CAD Connector',
    badge: 'CAD Bridge',
    description: 'Bi-directional live synchronization, LandsurvConnector DLL/MSI, layer mapping, and CAD chat drafting engine.',
    iconName: 'Layers',
  },
  {
    id: 'api-gateway',
    title: 'AI Gateway & REST API Reference',
    badge: 'Developers',
    description: 'OpenAI, Claude, and Grok model interfaces, MCP relay tools, JWT authorization, and boundary calculation endpoints.',
    iconName: 'Terminal',
  },
  {
    id: 'specs',
    title: 'Open Specs & File Formats',
    badge: 'Open Standards',
    description: 'CC BY 4.0 specifications for .lsvz project archives, CACP v1.3 inter-agent protocol, A2UI surfaces, and geodetic coordinate engines.',
    iconName: 'FileCode',
  },
];

export const DOC_ARTICLES: DocArticle[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Pillar 1: Platform Overview & Getting Started
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'platform-overview',
    pillarId: 'getting-started',
    title: 'Platform Architecture & Vision',
    description: 'An introduction to LandSurv.ai: the AI-native workspace designed for licensed surveyors, civil drafters, and field crews.',
    readTimeMinutes: 5,
    lastUpdated: '2026-11-12',
    statusBadge: 'v26.11 Production',
    tags: ['architecture', 'overview', 'surveying', 'canvas', 'ai-brain'],
    sections: [
      {
        title: 'Executive Overview',
        content: [
          'LandSurv.ai combines deterministic coordinate geometry, automated plan recognition, and multi-agent AI assistants into a single unified workspace.',
          'Unlike legacy desktop packages that operate as isolated silos, LandSurv.ai delivers a zero-installation browser environment coupled with native desktop connectors (such as the Autodesk Civil 3D bridge) and cloud processing agents.',
        ],
        callout: {
          type: 'info',
          title: 'Professional Practice Guardrail',
          text: 'LandSurv.ai is a mathematical and drafting accelerator. It does not provide automated legal opinions or self-certifying surveys; all stamped boundary determinations remain under the direct supervision of licensed professionals.',
        },
      },
      {
        title: 'Three-Tier Architecture',
        content: [
          '1. Client Workspace (SPA): Hardware-accelerated 2D/3D WebGPU and Canvas viewport, client-side COGO calculation engine, and offline session storage.',
          '2. Agent Intelligence Layer: Specialized agents collaborating over CACP (Cross-Agent Communications Protocol) for deed parsing, contour generation, steep-slope classification, and point cloud triangulation.',
          '3. Connectors & External Bridges: The LandsurvConnector .NET bridge for Autodesk Civil 3D, QGIS GeoJSON bridge, and the AI Gateway for Claude, ChatGPT, and Grok.',
        ],
      },
    ],
    relatedDocs: ['workspace-navigation', 'lsvz-quickstart', 'api-key-configuration'],
    externalLinks: [
      { label: 'About LandSurv.ai', url: 'https://about.landsurv.ai' },
      { label: 'Public Release Log', url: 'https://release.landsurv.ai' },
    ],
  },
  {
    id: 'workspace-navigation',
    pillarId: 'getting-started',
    title: 'Workspace Navigation & Viewport Controls',
    description: 'Master the 2D CAD canvas, 3D WebGPU point cloud viewer, agent selector, and inspection inspector panels.',
    readTimeMinutes: 6,
    lastUpdated: '2026-09-28',
    statusBadge: 'Updated',
    tags: ['canvas', 'viewport', 'hotkeys', 'osnap', 'webgpu'],
    sections: [
      {
        title: 'Primary Layout Anatomy',
        content: [
          'The workspace is structured into three coordinated viewports: the Agent Navigation Sidebar (left), the Interactive Drawing Canvas / 3D Viewer (center), and the Contextual Chat / Tool Panel (right).',
          'Switching agents automatically updates the center viewport to surface the tools, tables, and visualization overlays relevant to that workflow.',
        ],
      },
      {
        title: 'Canvas Hotkeys & Shortcuts',
        content: [
          'The LandSurv.ai CAD engine conforms to standard drafting muscle memory:',
          'Press Space to activate the CAD command line, then type a command. Manual drafting tools are command-only — no toolbar buttons are required. Run a modify or array command with nothing selected and it waits for picks: left-click to select, drag a window to box select, middle-drag to keep panning, Enter to apply, Esc to cancel.',
          'Feedback is color-coded — typed commands in amber, success in emerald, information in cyan, warnings in amber, errors in red — and results that can be inspected elsewhere carry inline links such as Open in Text Editor, Open Properties, and Copy.',
        ],
        parameters: [
          { name: 'Pan / Zoom', type: 'Mouse', description: 'Middle mouse button drag to pan; mouse wheel to zoom dynamically.' },
          { name: 'Z', type: 'Key', description: 'Enter box zoom; drag a window to frame it. Esc cancels.' },
          { name: 'Space', type: 'Key', description: 'Activate the CAD command line. Type HELP to list every command and alias.' },
          { name: 'L / PLINE', type: 'Command', description: 'Draw chained line/arc segments; A toggles tangent Arc and L returns to straight segments.' },
          { name: 'R', type: 'Key', description: 'Start ROTATE from the keyboard — snapped base point, then a clicked point or typed angle. With nothing selected it arms picks; press R again to cancel.' },
          { name: 'PROP / PROPERTIES', type: 'Command', description: 'Open (or focus) the floating Properties panel for the current selection — also available from the PROPERTIES link beside ORTHO in the command line.' },
          { name: 'C', type: 'Command', description: 'Activate Circle tool with Tangent-Tangent-Radius (TTR) mode and radius/diameter toggles.' },
          { name: 'D / DIMALIGNED', type: 'Key', description: 'Start an aligned dimension — pick two points, then the offset line.' },
          { name: 'REC x1,y1 x2,y2', type: 'Command', description: 'Draw a closed rectangle (polyline) from opposite corners, e.g. REC 0,0 100,60.' },
          { name: 'POL sides center radius', type: 'Command', description: 'Draw an inscribed regular polygon, first vertex north, e.g. POL 6 0,0 50.' },
          { name: 'S / B', type: 'Command', description: 'Select entities individually (S) or with a crossing/window box (B).' },
          { name: 'In-command picking', type: 'Mouse', description: 'A modify/array command with no selection waits for picks — left-click toggles entities, drag a window to box select, MMB pan stays live, Enter applies and hands focus back to the command line, Esc cancels.' },
          { name: 'T', type: 'Command', description: 'Activate Trim tool with real-time segment hover preview.' },
          { name: 'EX', type: 'Command', description: 'Activate Extend; click a line to extend it to the boundary.' },
          { name: 'F / FILLET', type: 'Key', description: 'Round the corner between exactly two selected straight lines; the radius prompt opens on F.' },
          { name: 'CP / OS [distance]', type: 'Command', description: 'Copy the selection, or offset a line/polyline/arc/circle by a typed distance.' },
          { name: 'M [dx,dy]', type: 'Command', description: 'Bare M picks a snapped base point then a snapped destination with a live ghost preview; M dx,dy moves immediately in the current linear unit.' },
          { name: 'RO [angle] [pivot]', type: 'Command', description: 'Bare RO starts the click flow — pick a base point (snaps honored), then click a point or type the angle while a dashed ghost previews the rotation; hold Shift for 15° angle increments. RO 45 rotates immediately about the selection center.' },
          { name: 'SC factor [pivot]', type: 'Command', description: 'Scale the selection about its center or a typed pivot.' },
          { name: 'MI [x1,y1 x2,y2]', type: 'Command', description: 'Bare MI picks two snapped axis points and previews the mirrored result live; MI x1,y1 x2,y2 mirrors immediately.' },
          { name: 'J / EXPLODE', type: 'Command', description: 'Join selected line/arc segments into one polyline, or explode selected polylines and hatches back into linework.' },
          { name: 'X / E / DEL', type: 'Key', description: 'Delete the selected entities; Delete or Backspace also delete.' },
          { name: 'AR rows cols rowGap colGap', type: 'Command', description: 'Rectangular array of the selection, e.g. AR 3 4 20 15.' },
          { name: 'PA count fillAngle [center]', type: 'Command', description: 'Polar array of the selection; defaults to the selection center, e.g. PA 8 360.' },
          { name: 'ALL / DS', type: 'Command', description: 'Select all visible entities or deselect everything.' },
          { name: 'DI x1,y1 x2,y2', type: 'Command', description: 'Report ΔE, ΔN, distance, and azimuth between two points.' },
          { name: 'A / L', type: 'Key', description: 'Toggle between true circular Tangent Arc and Straight Line while drafting polylines.' },
          { name: 'Escape', type: 'Key', description: 'Cancel active command or clear current geometric selection.' },
        ],
      },
      {
        title: 'WebGPU 3D Engine & Orientation Tuple',
        content: [
          'For terrain surfaces, elevation contours, and dense LiDAR clouds, activate the "3D" toggle in the top header. The viewport switches to a Babylon.js WebGPUEngine with zero-copy Float32Array vertex buffers streamed directly to GPU VRAM.',
          'Use the Orientation Tuple (OT) instrument in the canvas toolbar (its live angle readout sits beside the axis glyph) to rotate the drafting ortho grid or pivot the entire project view without altering ground coordinate systems.',
        ],
      },
    ],
    relatedDocs: ['platform-overview', 'point-editor-guide', 'lsvz-quickstart'],
  },
  {
    id: 'api-key-configuration',
    pillarId: 'getting-started',
    title: 'API Keys & BYOK (Bring-Your-Own-Key)',
    description: 'Configure Google Gemini, Anthropic Claude, and OpenAI credentials with client-side encryption and zero-retention security.',
    readTimeMinutes: 4,
    lastUpdated: '2026-09-20',
    statusBadge: 'Security Hardened',
    tags: ['security', 'byok', 'api-keys', 'privacy', 'vertex-ai'],
    sections: [
      {
        title: 'Key Storage & Privacy Model',
        content: [
          'LandSurv.ai supports a Bring-Your-Own-Key (BYOK) paradigm. When you enter custom API keys in the Settings panel, keys are encrypted locally in your browser storage using standard WebCrypto APIs.',
          'Client-provided API keys are never persisted to long-term database tables on the LandSurv.ai backend and are never used to train foundational AI models.',
        ],
        callout: {
          type: 'tip',
          title: 'Google Vertex AI & Enterprise Hosting',
          text: 'Enterprise workspaces with private VPC Service Controls can connect through the backend proxy directly to private Vertex AI endpoints.',
        },
      },
      {
        title: 'Supported Model Providers',
        content: [
          '• Google Gemini 1.5 Pro & Flash (Native Multimodal Vision & Deed Extraction)',
          '• Anthropic Claude 3.5 Sonnet & Claude 3.7 (Complex boundary reconciliation & script drafting)',
          '• OpenAI GPT-4o (General inspection and prompt orchestration)',
        ],
      },
    ],
    relatedDocs: ['platform-overview', 'ai-gateway-reference'],
    externalLinks: [
      { label: 'Security & Compliance Trust Center', url: 'https://compliance.landsurv.ai' },
      { label: 'Privacy Policy', url: 'https://privacy.landsurv.ai' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Pillar 2: Agent Guides & Survey Workflows
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'boundary-agent-guide',
    pillarId: 'agents',
    title: 'Boundary Agent: Deed Analysis & Metes-and-Bounds',
    description: 'Extract legal descriptions, compute mathematical closures, handle curve parameters, and align deeds to found monumentation.',
    readTimeMinutes: 8,
    lastUpdated: '2026-09-25',
    statusBadge: 'Core Agent',
    tags: ['deeds', 'boundary', 'metes-and-bounds', 'closure', 'curves', 'monuments'],
    sections: [
      {
        title: 'Overview',
        content: [
          'The Boundary Agent (formerly Deed Reader & Plotter) ingests scanned deeds, PDFs, or typed metes-and-bounds descriptions. It parses bearings, distances, and curve parameters into structured boundary calls and calculates closure statistics.',
        ],
      },
      {
        title: 'Mathematical Closure & Error Analysis',
        content: [
          'Once calls are parsed, LandSurv.ai computes traverse closure using rigorous precision geodetic formulas:',
          '• Linear Error of Closure: $$\\text{Error} = \\sqrt{(\\Delta N)^2 + (\\Delta E)^2}$$',
          '• Relative Precision: expressed as 1 part in X (e.g. 1:15,000, 1:50,000).',
          '• Perimeter & Closed Polygon Area (Square Feet, Acres, Hectares).',
        ],
        callout: {
          type: 'warning',
          title: 'Non-Tangency in Curves',
          text: 'If a curve call is non-tangent, ensure the radial bearing or chord bearing is specified in the text. LandSurv.ai flags missing curve constraints with actionable repair suggestions.',
        },
      },
      {
        title: 'Best-Fit Alignment to Found Monuments',
        content: [
          'Field surveys rarely land on historical deed coordinates. Use the "Align to Monuments" feature to select a deed corner and pair it with a found monument point.',
          'Selecting two or more point pairs executes a rigid Helmsert transformation (translation + rotation) that preserves historical deed angles and distances while anchoring the polygon to your local control network.',
        ],
      },
    ],
    relatedDocs: ['cogo-math-engine', 'point-editor-guide', 'civil-drafter-guide'],
  },
  {
    id: 'civil-drafter-guide',
    pillarId: 'agents',
    title: 'Civil Drafter Agent & Auto-Drafting',
    description: 'Automate boundary drafting, road corridor linework, curb returns, and description-key styling directly from field codes.',
    readTimeMinutes: 7,
    lastUpdated: '2026-09-25',
    statusBadge: 'v26.09 Enhanced',
    tags: ['autodraft', 'linework', 'codes', 'curb-returns', 'cad-standards'],
    sections: [
      {
        title: 'Description-Key & Linework Processing',
        content: [
          'Civil Drafter parses raw field shots with line-control codes (e.g. "EP B", "EP", "EP PC", "EP PT", "EP E") into continuous, smoothed polyline chains.',
          'It supports Carlson, Trimble, and Leica line coding conventions with automated Tangent Arc interpolation.',
        ],
      },
      {
        title: 'Vision-Assisted Aerial & Sketch Drafting',
        content: [
          'Upload aerial orthomosaics, hand-drawn field sketches, or preliminary site development layouts. Civil Drafter extracts curb lines, building footprints, and parking geometries aligned to registered ground points.',
        ],
      },
    ],
    relatedDocs: ['boundary-agent-guide', 'cadmanager-standards', 'c3d-live-sync'],
  },
  {
    id: 'point-editor-guide',
    pillarId: 'agents',
    title: 'Point Editor & Coordinate Database',
    description: 'Central hub for managing survey points: PNEZD formatting, point lists, coordinate transformations, and symbol tagging.',
    readTimeMinutes: 5,
    lastUpdated: '2026-09-22',
    statusBadge: 'Stable',
    tags: ['points', 'pnezd', 'csv', 'transformation', 'symbols'],
    sections: [
      {
        title: 'Import & Export Formats',
        content: [
          'The Point Editor natively supports ASCII PNEZD, PENZD, NEZ, and custom CSV delimiters. Coordinates can be dynamically scaled, translated, or rotated across State Plane Coordinate zones.',
        ],
        codeBlock: {
          language: 'csv',
          caption: 'Standard PNEZD Format Sample',
          code: `PointNumber,Northing,Easting,Elevation,Description\n100,2045612.34,1423891.12,412.50,IPF 1/2 REBAR\n101,2045689.10,1424102.55,414.20,EP B\n102,2045710.45,1424150.80,415.10,EP E`,
        },
      },
      {
        title: 'Point List Organization & Symbols',
        content: [
          'Organize points into distinct logical sets (e.g., "Found Monuments", "Calculated Boundary", "Topography", "Ground Control"). Toggle visibility, assign custom block symbols, and export DXF layers with text labels.',
        ],
      },
    ],
    relatedDocs: ['cogo-math-engine', 'c3d-live-sync'],
  },
  {
    id: 'rinex-gnss-guide',
    pillarId: 'agents',
    title: 'RINEX GNSS Processing Agent',
    description: 'Post-process multi-constellation satellite observations, base-rover kinematic vectors, and verify receiver health.',
    readTimeMinutes: 6,
    lastUpdated: '2026-09-30',
    statusBadge: 'Beta',
    tags: ['rinex', 'gnss', 'rtklib', 'base-station', 'rover', 'satellite'],
    sections: [
      {
        title: 'Supported Formats & Constellations',
        content: [
          'RINEX 2.11, 3.02, 3.04, and 3.05 observation and navigation files.',
          'Constellations: GPS (NAVSTAR), GLONASS, Galileo, BeiDou, and QZSS. Carrier phase L1/L2/L5 dual and triple-frequency observations.',
        ],
        callout: {
          type: 'info',
          title: 'Upstream Engine Attribution',
          text: 'GNSS baseline solving is powered by RTKLIB (BSD-2-Clause by Tomoji Takasu) and NGS OPUS reference models.',
        },
      },
      {
        title: 'Quality Assessment & SNR Plots',
        content: [
          'Inspect signal-to-noise ratio (SNR) masks, cycle-slip indicators, satellite skyplots, and PDOP / GDOP dilution of precision charts before committing baseline vectors.',
        ],
      },
    ],
    relatedDocs: ['point-editor-guide', 'cogo-math-engine'],
    externalLinks: [
      { label: 'RINEX Subdomain Portal', url: 'https://rinex.landsurv.ai' },
    ],
  },
  {
    id: 'cogo-math-engine',
    pillarId: 'agents',
    title: 'COGO Engine & Coordinate Geometry',
    description: 'Traverse calculations, forward/inverse solvers, intersection math, and State Plane grid-to-ground scale factors.',
    readTimeMinutes: 6,
    lastUpdated: '2026-09-20',
    statusBadge: 'Verified Engine',
    tags: ['cogo', 'inverse', 'traverse', 'intersections', 'scale-factors'],
    sections: [
      {
        title: 'Analytical Coordinate Solvers',
        content: [
          '• Direct Problem: calculate coordinate from point, azimuth/bearing, and horizontal distance.',
          '• Inverse Problem: compute exact bearing and distance between two points.',
          '• Intersections: Bearing-Bearing, Distance-Distance, and Bearing-Distance with quadrant disambiguation.',
          '• Area Computations: Double meridian distance (DMD) and Green’s Theorem coordinate area.',
        ],
      },
    ],
    relatedDocs: ['boundary-agent-guide', 'point-editor-guide'],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Pillar 3: Civil 3D Integration & CAD Connector
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'c3d-connector-setup',
    pillarId: 'civil3d',
    title: 'LandsurvConnector Installation & Pairing',
    description: 'Step-by-step installation for the Autodesk Civil 3D plugin via direct MSI installer or portable ZIP bundle.',
    readTimeMinutes: 5,
    lastUpdated: '2026-09-15',
    statusBadge: 'v26.09.07 MSI',
    tags: ['civil3d', 'connector', 'installer', 'msi', 'netload', 'autocad'],
    sections: [
      {
        title: 'Prerequisites & Compatibility',
        content: [
          '• Autodesk Civil 3D 2021, 2022, 2023, 2024, or 2025 on 64-bit Windows.',
          '• Microsoft .NET Framework 4.8 / .NET 8 Desktop Runtime.',
          '• Active LandSurv.ai account or local pairing token.',
        ],
      },
      {
        title: 'Installation Options',
        content: [
          '1. MSI Installer (Recommended): Automatically registers the plugin in the Autodesk ApplicationPlugins directory (`%APPDATA%\\Autodesk\\ApplicationPlugins\\LandsurvConnector.bundle`). The plugin auto-loads when Civil 3D starts.',
          '2. Portable ZIP: Extract DLLs to a trusted path, open Civil 3D, and type `NETLOAD` in the command prompt to select `LandsurvConnector.dll`.',
        ],
        codeBlock: {
          language: 'shell',
          caption: 'AutoCAD Command Line Verification',
          code: `Command: NETLOAD\n(Select LandsurvConnector.dll)\n✓ LandSurv.ai Connector v26.09.07 loaded.\nType LANDSURVCONNECT to open the sync center.`,
        },
      },
      {
        title: 'Device Pairing & QR Code Workflow',
        content: [
          'Click "Connect to WebApp" in the Civil 3D palette. You will receive an ephemeral pairing code or QR code.',
          'In your LandSurv.ai browser workspace, open the "Civil 3D" status modal and enter the 6-digit code or scan the QR code. The bi-directional WebSocket session links immediately.',
        ],
      },
    ],
    relatedDocs: ['c3d-live-sync', 'cadmanager-standards'],
    externalLinks: [
      { label: 'Download Connector MSI / ZIP', url: 'https://connector-download.landsurv.ai' },
      { label: 'Civil 3D Cloud Subdomain', url: 'https://civil3d.landsurv.ai' },
    ],
  },
  {
    id: 'c3d-live-sync',
    pillarId: 'civil3d',
    title: 'Bidirectional Live Sync & Intent Journaling',
    description: 'Understand how LandSurv.ai and Civil 3D reconcile points, layers, polylines, and circles without destructive collisions.',
    readTimeMinutes: 7,
    lastUpdated: '2026-09-24',
    statusBadge: 'Zero-Data-Loss',
    tags: ['sync', 'tombstones', 'c3d', 'diff', 'intent-journal', 'safety'],
    sections: [
      {
        title: 'Safe Baseline Differencing',
        content: [
          'Live Sync operates on a 3-way baseline differencing algorithm (Base, LandSurv.ai, Civil 3D).',
          '• Additions: newly created survey points or polyline features on either side propagate cleanly on debounce.',
          '• Modifications: vertex moves, description edits, or elevation adjustments are reconciled using latest timestamp resolution.',
          '• Destructive Guardrail: Deletions require explicit intent tombstones. An object deleted on one side will never be silently recreated from the other.',
        ],
        callout: {
          type: 'warning',
          title: 'Bulk Deletion Protection',
          text: 'If a sync operation would delete more than 10 entities in Civil 3D, the connector pauses Live Sync and presents an interactive review dialog requiring typed confirmation.',
        },
      },
      {
        title: 'Supported Civil 3D Entity Types',
        content: [
          '• CogoPoint / DBPoint: Point number, Northing, Easting, Elevation, Raw Description, Full Description.',
          '• Lightweight Polyline (LWPOLYLINE): 2D boundary and road centerlines with true circular arc bulges.',
          '• 3D Polyline & Feature Lines: 3D breaklines and breakline strings for surface TIN creation.',
          '• Circle & Arc: Native circle geometry captured as twin continuous arcs or single circular entities.',
          '• Layer Tables: Colors (ACI & TrueColor), linetype names, and lineweight standards.',
        ],
      },
    ],
    relatedDocs: ['c3d-connector-setup', 'cadmanager-standards'],
  },
  {
    id: 'cadmanager-standards',
    pillarId: 'civil3d',
    title: 'CAD Manager: Description Keys & Layer Standards',
    description: 'Map Carlson Field Code Libraries (.fcl), Trimble FXL, and agency layer standards to automated CAD layers.',
    readTimeMinutes: 5,
    lastUpdated: '2026-09-19',
    statusBadge: 'Production',
    tags: ['cadmanager', 'description-keys', 'fcl', 'layers', 'carlson', 'trimble'],
    sections: [
      {
        title: 'Description Key Matching',
        content: [
          'CAD Manager parses field descriptions and routes them to targeted drawing layers, point styles, and label styles.',
          'For example, code "IPF*" maps to layer `V-PROP-LINE-MONU` with an iron pin symbol, while "BLDG*" maps to `V-BLDG-LINE`.',
        ],
      },
      {
        title: 'Carlson .fcl to Trimble CSV Conversion',
        content: [
          'Upload legacy Carlson Field Code (.fcl) files directly into CAD Manager. The conversion engine translates polyline Y/N flags and feature descriptions into clean, Trimble-compatible CSV feature dictionaries.',
        ],
      },
    ],
    relatedDocs: ['civil-drafter-guide', 'c3d-connector-setup'],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Pillar 4: AI Gateway & REST API Reference
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'ai-gateway-reference',
    pillarId: 'api-gateway',
    title: 'LandSurv AI Gateway & External Model Tools',
    description: 'Expose professional surveying tools to Claude, ChatGPT, Grok, and custom MCP clients via structured endpoints.',
    readTimeMinutes: 6,
    lastUpdated: '2026-09-20',
    statusBadge: 'Public API',
    tags: ['gateway', 'claude', 'chatgpt', 'grok', 'mcp', 'tools', 'json-schema'],
    sections: [
      {
        title: 'AI Gateway Architecture',
        content: [
          'The LandSurv.ai Gateway exposes our deterministic surveying calculators directly to frontier AI foundation models.',
          'Instead of models hallucinating trigonometric boundary math, the model invokes LandSurv.ai tools over secure HTTP or Model Context Protocol (MCP) relays.',
        ],
      },
      {
        title: 'Tool Endpoints Overview',
        content: [
          '1. `analyze_boundary_closure`: Solves metes-and-bounds closures, linear misclose, and area.',
          '2. `analyze_parcel_geometry`: Performs polygon intersection, subdivision splits, and setback verification.',
          '3. `solve_cogo_traverse`: Computes balanced traverses and coordinates from angle/distance observations.',
          '4. `stage_point_editor`: Stages candidate coordinates into an active user session.',
        ],
        codeBlock: {
          language: 'json',
          caption: 'Sample analyze_boundary_closure Tool Call',
          code: `{\n  "tool": "analyze_boundary_closure",\n  "arguments": {\n    "point_of_beginning": { "northing": 10000.0, "easting": 10000.0 },\n    "calls": [\n      { "bearing": "N 00° 00' 00\\" E", "distance": 100.0 },\n      { "bearing": "S 90° 00' 00\\" E", "distance": 150.0 },\n      { "bearing": "S 00° 00' 00\\" W", "distance": 100.0 },\n      { "bearing": "N 90° 00' 00\\" W", "distance": 150.0 }\n    ]\n  }\n}`,
        },
      },
    ],
    relatedDocs: ['boundary-agent-guide', 'cacp-spec-guide'],
    externalLinks: [
      { label: 'Interactive Gateway Sandbox', url: 'https://gateway.landsurv.ai' },
    ],
  },
  {
    id: 'rest-api-authentication',
    pillarId: 'api-gateway',
    title: 'Authentication, Scopes & Rate Limits',
    description: 'API key authorization, OAuth2 Bearer tokens, rate limiting headers, and enterprise quota allocations.',
    readTimeMinutes: 4,
    lastUpdated: '2026-09-18',
    statusBadge: 'Security Standard',
    tags: ['api-key', 'jwt', 'oauth2', 'rate-limit', 'quotas'],
    sections: [
      {
        title: 'Authorization Headers',
        content: [
          'Authenticate API requests by passing your API token in the `Authorization` header:',
        ],
        codeBlock: {
          language: 'shell',
          caption: 'Curl Request Header',
          code: `curl -X POST https://api.landsurv.ai/api/gateway/tools/analyze_boundary_closure \\\n  -H "Authorization: Bearer ls_live_xxxxxxxxxxxxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"calls": [...]}'`,
        },
      },
      {
        title: 'Rate Limits & Concurrency',
        content: [
          '• Standard Developer Tier: 60 requests/minute, 5 concurrent calculations.',
          '• Enterprise Tier: 1,200 requests/minute, 50 concurrent calculations with dedicated SLA.',
          'Standard rate-limiting response headers are returned on all calls: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.',
        ],
      },
    ],
    relatedDocs: ['ai-gateway-reference', 'api-key-configuration'],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Pillar 5: Open Specs & File Formats
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'lsvz-quickstart',
    pillarId: 'specs',
    title: '.lsvz File Format Specification v1.3',
    description: 'Open CC BY 4.0 project archive: a ZIP container with a typed manifest.json, original source files, CACP state, A2UI conversation payloads, and Redline review records.',
    readTimeMinutes: 9,
    lastUpdated: '2026-11-12',
    statusBadge: 'Spec v1.3',
    tags: ['lsvz', 'zip', 'manifest', 'open-format', 'interoperability', 'a2ui', 'redline'],
    sections: [
      {
        title: 'Container Structure',
        content: [
          'The `.lsvz` file is a standard ZIP archive. The only reserved entry is `manifest.json` at the root; every other entry is an original source file or an agent-produced artifact.',
          'There is no proprietary index, encrypted database, or required network service. A reader can list the ZIP directory and inspect the typed manifest without LandSurv.ai running.',
        ],
        codeBlock: {
          language: 'text',
          caption: 'Archive layout',
          code: `project.lsvz
├── manifest.json          Typed SessionState + provenance
├── job123.raw             Original RAW file
├── parcel_a.pdf           Original deed
├── C-101.pdf              Original plan sheet
├── topo.dxf               Original DXF
└── photo_01.jpg           Original site photo`,
        },
      },
      {
        title: 'manifest.json Contract',
        content: [
          'The manifest is UTF-8 JSON. Its top-level groups cover project context, source and generated files, geometry, mapping, stakeout, PDF markup, CACP state, fieldbook, Redline runs, per-agent chat histories, and UI restoration state.',
          'The public schema is compile-time checked against the live `SessionState` type, so a new session field cannot silently enter the archive without being documented here. Additive optional fields do not bump the spec; a new top-level group or semantic contract change does.',
        ],
        codeBlock: {
          language: 'json',
          caption: 'Manifest identity and provenance',
          code: `{
  "version": "26.11.13.02",
  "savedAt": "2026-11-12T15:30:00.000Z",
  "sessionMetadata": {
    "author": "Jane Doe",
    "note": "60% QA package",
    "exportFileName": "oakridge_boundary.lsvz"
  },
  "jobInfo": {
    "jobName": "Oakridge Boundary Retracement",
    "jobNo": "2026-084"
  }
}`,
        },
      },
      {
        title: 'CACP, A2UI & Redline State',
        content: [
          'CACP project memory travels with the archive: point-number reservations, sourced Knowledge Base facts, description-key mappings, and event-linked keyframes. Ephemeral caches and the activity log remain runtime diagnostics.',
          'A2UI payloads ride inside each agent chat history. The restored transcript includes the typed surface descriptor, lifecycle status, and relay attribution, so the conversation and its generated surface reopen together. Redline runs add sheet calibration, markups, numbered worklist items, decisions, revision assignment, and metrics.',
        ],
      },
      {
        title: 'Compatibility & Licensing',
        content: [
          'The app normalizes older manifests before hydrating session state. Unknown keys are ignored or preserved rather than treated as fatal, and legacy `roadCorridors` records remain readable beside the v1.3 baseline-linked `road-model` contract.',
          'The specification is published under Creative Commons Attribution 4.0 International (CC BY 4.0). The application, agents, and third-party source files retain their own terms.',
        ],
      },
    ],
    relatedDocs: ['cacp-spec-guide', 'a2ui-cacp-integration', 'redline-agent-guide'],
    externalLinks: [
      { label: '.lsvz Specification Subdomain', url: 'https://lsvz.landsurv.ai' },
      { label: 'CC BY 4.0 License', url: 'https://creativecommons.org/licenses/by/4.0/' },
    ],
  },
  {
    id: 'cacp-spec-guide',
    pillarId: 'specs',
    title: 'CACP v1.3: Cross-Agent Communications Protocol',
    description: 'The typed inter-agent protocol for survey collaboration: manifests, skill dispatch, askPeer envelopes, policy gates, and the Project Knowledge Base.',
    readTimeMinutes: 9,
    lastUpdated: '2026-11-03',
    statusBadge: 'Spec v1.3',
    tags: ['cacp', 'protocol', 'agents', 'skills', 'envelope', 'open-source'],
    sections: [
      {
        title: 'Protocol Principles',
        content: [
          'CACP (Cross-Agent Communications Protocol) specifies how specialized surveying agents discover capabilities, delegate deterministic work, and exchange project state without hard-coded routing tables.',
          'Published under CC BY 4.0, the protocol is vendor-agnostic and implementable in cloud or local deployments. The registry is the source of truth for skill ownership; agents are instructed to delegate rather than guess when another agent owns the knowledge.',
        ],
      },
      {
        title: 'Message Envelope',
        content: [
          'Messages use a compact typed envelope with a stable id, sender, recipient, command, command data, optional metadata, and a millisecond timestamp. Action skills bypass the result cache; query skills use the documented 10-minute cache.',
        ],
        codeBlock: {
          language: 'json',
          caption: 'CACP v1.3 request envelope',
          code: `{
  "id": "msg_01J8Z5K4W7",
  "from": "BOUNDARY_AGENT",
  "to": "POINT_EDITOR",
  "command": "request_next_point_number",
  "data": {
    "count": 6
  },
  "metadata": {
    "traceId": "trace-4f81",
    "requiresResponse": true
  },
  "timestamp": 1762891200000
}`,
        },
      },
      {
        title: 'Policy, Caching & Knowledge',
        content: [
          'Runtime policy checks validate skill ownership, payload shape, and rate behavior. The activity log records send, handler, response, error, and no-handler phases in a 500-entry ring buffer with trace ids; cached results avoid redundant peer calls.',
          'Project Knowledge Base facts are session-scoped and persisted in `.lsvz`. Zoning facts are sourced from permissive-only hosts; commercial codification platforms whose terms prohibit automation are hard-blocked before any network call.',
        ],
      },
    ],
    relatedDocs: ['lsvz-quickstart', 'a2ui-cacp-integration', 'boundary-agent-guide'],
    externalLinks: [
      { label: 'CACP Subdomain & Live Registry', url: 'https://cacp.landsurv.ai' },
      { label: 'Open Source Initiative Portal', url: 'https://opensource.landsurv.ai' },
    ],
  },
  {
    id: 'a2ui-cacp-integration',
    pillarId: 'specs',
    title: 'A2UI Surfaces over CACP',
    description: 'How catalog-addressed A2UI surfaces are produced, relayed, rendered, and restored inside .lsvz conversations.',
    readTimeMinutes: 6,
    lastUpdated: '2026-11-12',
    statusBadge: 'Integrated',
    tags: ['a2ui', 'cacp', 'surfaces', 'chat', 'lsvz', 'integration'],
    sections: [
      {
        title: 'What A2UI Is',
        content: [
          'A2UI is the declarative surface layer for agent-generated UI. A payload names a catalog widget type and carries typed props; the host renders the corresponding React component. No remote React, HTML, or executable UI is accepted.',
          'Surfaces are used when a chat response needs a spreadsheet, settings form, hatch studio, GPS rover control, or another structured interaction that is clearer than prose.',
        ],
      },
      {
        title: 'How It Travels',
        content: [
          'A2UI messages ride inside the existing per-agent chat history as typed payloads with a lifecycle status. CACP remains the transport for deterministic peer work; A2UI is the presentation contract carried alongside the conversation.',
          'Because the payload is stored with the transcript, reopening an `.lsvz` restores the surface and the conversation together. Relay attribution identifies when a specialist composed the body returned by the LSAI Agent.',
        ],
        codeBlock: {
          language: 'json',
          caption: 'A2UI payload carried in a chat message',
          code: `{
  "kind": "a2ui",
  "agent": "LSAI_AGENT",
  "widgetType": "spreadsheet",
  "status": "completed",
  "props": {
    "title": "Point List",
    "columns": ["Point #", "Elevation"],
    "rows": [["101", 812.25]],
    "editable": false
  }
}`,
        },
      },
      {
        title: 'Safety Boundary',
        content: [
          'The catalog is allow-listed. Props are validated against the widget schema, spreadsheet cells are normalized, and unknown widget types are rejected rather than rendered.',
          'A2UI does not grant tool access. State changes still go through CACP skills and their policy checks, so a surface cannot bypass ownership, validation, or permission gates.',
        ],
      },
    ],
    relatedDocs: ['cacp-spec-guide', 'lsvz-quickstart'],
    externalLinks: [
      { label: 'A2UI/CACP Integration Plan', url: 'https://documentation.landsurv.ai' },
      { label: 'CACP Specification', url: 'https://cacp.landsurv.ai' },
    ],
  },
  {
    id: 'redline-agent-guide',
    pillarId: 'agents',
    title: 'Redline Agent: Plan Markup to Worklist',
    description: 'Upload marked-up plan sets, calibrate sheets, inventory annotations, and turn review comments into a numbered, auditable worklist.',
    readTimeMinutes: 6,
    lastUpdated: '2026-11-12',
    statusBadge: 'New in 26.11',
    tags: ['redline', 'plan-review', 'markups', 'worklist', 'revision', 'quality-control'],
    sections: [
      {
        title: 'Workflow',
        content: [
          'The Redline Agent accepts a PDF package, registers one or more sheets, and calibrates each sheet with a two-point scale. It then inventories marked-up annotations, groups them into review items, and proposes a numbered worklist.',
          'Each item carries the reviewer text, sheet reference, status, and the revision it was assigned to. The run records warnings and local metrics so a reviewer can audit what was proposed without reopening every sheet.',
        ],
      },
      {
        title: 'Persistence & Review',
        content: [
          'Redline runs are saved in the manifest as `redlineRuns`. Source PDFs remain in the project PDF store and are referenced by file name. Reopening the `.lsvz` restores the sheet registrations, markups, worklist decisions, revision block, and metrics.',
          'The agent is intentionally review-oriented: it proposes and organizes; the licensed professional remains responsible for accepting, rejecting, and revising the work.',
        ],
      },
    ],
    relatedDocs: ['lsvz-quickstart', 'platform-overview'],
    externalLinks: [
      { label: 'Platform Documentation', url: 'https://documentation.landsurv.ai' },
    ],
  },
];
