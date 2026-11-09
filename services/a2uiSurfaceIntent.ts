/**
 * A2UI Surface Intent Resolver
 *
 * The surface catalog is a latent set of possibilities, not a menu. Agents and
 * the chat layer construct a surface only when the request calls for one.
 *
 * This resolver is deliberately narrow: it matches read-only protocol requests
 * (CACP manifests / traffic review) and returns null for everything else so
 * normal conversation and existing agent routing are untouched.
 */

import {
  AgentType,
  type A2UIHatchStudioSpec,
  type A2UISettingsSection,
  type A2UIWorkspaceToolId,
} from '../types.ts';
import { agentRegistry } from './AgentRegistry.ts';
import { resolveHatchForFeatureOrCode } from './hatchLibrary.ts';

export type A2UISurfaceIntent =
  | {
      surface: 'cacp-manifests';
      initialAgent?: AgentType;
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'cacp-review';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'settings';
      section: A2UISettingsSection;
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'text-editor';
      mode: 'edit' | 'new';
      /** Prefer the loaded deed/legal description, when the request names it. */
      fileHint?: 'deed';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'point-list';
      view: 'text' | 'spreadsheet';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'spreadsheet';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'workspace-tool';
      tool: A2UIWorkspaceToolId;
      agent: AgentType;
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'cad-standards-editor';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'gps-rover';
      mode: 'overview' | 'stakeout' | 'collect' | 'benchmark';
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'point-entry';
      pointNumber?: string;
      /** Bare add-point requests ask how; explicit wording arms a path. */
      placement: 'quick-thought' | 'canvas' | 'form';
      /** Clickable choices when the request did not name an entry method. */
      questionOptions?: string[];
      replyText: string;
      suggestedQuestions: string[];
    }
  | {
      surface: 'hatch-studio';
      hatchStudio: A2UIHatchStudioSpec;
      replyText: string;
      suggestedQuestions: string[];
    };

const REQUEST_VERB_RE =
  /\b(?:show|open|inspect|browse|list|view|display|review|pull\s+up|what(?:'s| is)|which|any)\b/i;

const ACTION_OR_HOWTO_VERB_RE =
  /\b(?:add|create|enter|place|drop|show|open|inspect|browse|list|view|display|review|pull\s+up|bring\s+up|launch|edit|adjust|change|configure|set(?:\s+up)?|turn\s+(?:on|off)|enable|disable|toggle|switch|update|manage|import|georeferenc\w*|export|hatch|bhatch|fill|shade|cross[- ]?hatch|how\s+(?:do\s+i|to|can\s+i)|where\s+(?:do\s+i|can\s+i|is|are))\b/i;

const MANIFEST_RE = /\b(?:manifests?|skills?|schemas?|capabilit(?:y|ies))\b/i;
const CACCP_RE = /\bcacp\b/i;
const TRAFFIC_RE =
  /\b(?:traffic|blocked|policy|warnings?|errors?|failures?|review|activity|events?|routing)\b/i;

function detectAgent(query: string): AgentType | undefined {
  const lower = query.toLowerCase();
  const manifests = agentRegistry.listCacpEnabled();
  const match = manifests.find(manifest => {
    const displayName = manifest.displayName.toLowerCase();
    const enumName = String(manifest.agent).toLowerCase();
    return lower.includes(displayName) || lower.includes(enumName);
  });
  return match?.agent;
}

interface SettingsIntentRule {
  section: A2UISettingsSection;
  pattern: RegExp;
  replyText: string;
  suggestedQuestions: string[];
}

const SETTINGS_SECTION_RULES: readonly SettingsIntentRule[] = [
  {
    section: 'graphics',
    pattern: /\b(?:graphics?(?:\s+settings?)?|webgpu|gpu(?:\s+power|\s+acceleration|\s+settings?)?|hardware\s+acceleration|canvas\s*2d\s+fallback|discrete\s+gpu|integrated\s+gpu|rendering\s+settings?)\b/i,
    replyText:
      'Here are the live <strong>Graphics &amp; WebGPU Acceleration</strong> controls right in chat. You can toggle WebGPU hardware acceleration or switch GPU power preference immediately, dock it to the tool shelf, or pop it out.',
    suggestedQuestions: [
      'Adjust Canvas & Display settings',
      'Change State Plane coordinate system',
      'Configure Map Imagery overlay',
    ],
  },
  {
    section: 'crs',
    pattern: /\b(?:state\s+plane|coordinate\s+system|crs\b|epsg|projection\s+(?:settings?|zone)|datum|nad\s*83|utm\s+zone)\b/i,
    replyText:
      'Here is the live <strong>Coordinate System &amp; Projection</strong> surface in chat. Pick a State Plane zone or search any EPSG code below.',
    suggestedQuestions: [
      'Adjust linear units and precision',
      'Configure Map Imagery overlay',
      'Open Graphics & WebGPU settings',
    ],
  },
  {
    section: 'imagery',
    pattern: /\b(?:map\s+imagery|aerial\s+(?:imagery|overlay|map)\s+settings?|satellite\s+(?:overlay|imagery)\s+settings?|google\s+(?:static\s+)?maps?\s+(?:key|settings?|overlay)|naip\s+(?:imagery|overlay|settings?)|map\s+opacity|basemap\s+settings?)\b/i,
    replyText:
      'Here are the live <strong>Map Imagery Overlay</strong> controls in chat. Toggle the imagery overlay, switch between NAIP / Satellite / Hybrid, or adjust opacity right here.',
    suggestedQuestions: [
      'Change State Plane coordinate system',
      'Open Graphics & WebGPU settings',
      'Open WMS & Offline Maps manager',
    ],
  },
  {
    section: 'point-labeling',
    pattern: /\b(?:point\s+label(?:ing|s)?(?:\s+settings?)?|numbering\s+style|point\s+prefix|next\s+point\s+number)\b/i,
    replyText:
      'Here are the live <strong>Point Labeling</strong> settings in chat. Adjust numbering style, point prefix, and next point number directly below.',
    suggestedQuestions: [
      'Adjust Canvas & Display settings',
      'Open Symbol Manager',
      'Open Annotate Manager',
    ],
  },
  {
    section: 'command-bar',
    pattern: /\b(?:command\s+bar(?:\s+settings?|\s+text\s+scale|\s+size)?|shortcut\s+hints|snap\s*(?:\/|\s+and\s+|\s+)?ortho\s+(?:status|badges))\b/i,
    replyText:
      'Here are the live <strong>Command Bar</strong> settings in chat. Adjust the text scale, shortcut hints, and SNAP/ORTHO badges below.',
    suggestedQuestions: [
      'Open Graphics & WebGPU settings',
      'Adjust Canvas & Display settings',
      'Change AI model settings',
    ],
  },
  {
    section: 'ai-model',
    pattern: /\b(?:ai\s+(?:model|behavior)\s+settings?|model\s+settings?|high[- ]thinking\s+model|uncertainty\s+sensitivity|(?:api|byok|openai|anthropic|claude|grok)\s+key\s+settings?|configure\s+api\s+keys?)\b/i,
    replyText:
      'Here are the live <strong>AI Behavior &amp; Model</strong> settings in chat. Switch the active model, high-thinking route, or uncertainty sensitivity below.',
    suggestedQuestions: [
      'Show CACP manifests',
      'Open Geospatial AI Engine settings',
      'Open Project Settings',
    ],
  },
  {
    section: 'geo-ai',
    pattern: /\b(?:geospatial\s+ai|samgeo|sam[- ]road|local\s+geo[- ]?ai|aerial\s+drafting\s+setting)\b/i,
    replyText:
      'Here are the live <strong>Geospatial AI Engine (SamGeo &amp; SAM-Road)</strong> settings in chat. Switch between Local Worker and Cloud Run or test your local daemon connection below.',
    suggestedQuestions: [
      'Open Graphics & WebGPU settings',
      'Change AI model settings',
      'Configure Map Imagery overlay',
    ],
  },
  {
    section: 'ntrip',
    pattern: /\b(?:ntrip(?:\s+settings?|\s+caster|\s+corrections?)?|rtcm\s+mountpoint|caster\s+host)\b/i,
    replyText:
      'Here are the live <strong>NTRIP Caster</strong> settings in chat. Enable RTK corrections and configure your host, port, and mountpoint below.',
    suggestedQuestions: [
      'Change State Plane coordinate system',
      'Open Stakeout Cut Sheet',
      'Adjust Canvas & Display settings',
    ],
  },
  {
    section: 'cutsheet',
    pattern: /\b(?:cut\s*sheet\s+(?:defaults?|settings?)|default\s+crew\s+chief|default\s+company\s+name)\b/i,
    replyText:
      'Here are the live <strong>Cut Sheet Defaults</strong> in chat. Update your default company name and crew chief below.',
    suggestedQuestions: [
      'Open Stakeout Cut Sheet',
      'Open Field Book',
      'Adjust Canvas & Display settings',
    ],
  },
  {
    section: 'notion',
    pattern: /\b(?:notion\s+(?:integration|settings?|token|workspace|sync))\b/i,
    replyText:
      'Here are the live <strong>Notion Integration</strong> controls in chat. Connect or manage your Notion workspace token below.',
    suggestedQuestions: [
      'Open Field Book',
      'Open Project Settings',
      'Show CACP manifests',
    ],
  },
  {
    section: 'a2ui',
    pattern: /\b(?:a2ui\s+settings?|default\s+surface\s+size|auto[- ]open\s+cacp\s+review)\b/i,
    replyText:
      'Here are the live <strong>Agent Surface</strong> settings in chat. Configure auto-open CACP review and the default surface size below.',
    suggestedQuestions: [
      'Show CACP manifests',
      'Review blocked CACP traffic',
      'Open Graphics & WebGPU settings',
    ],
  },
  {
    section: 'display',
    pattern: /\b(?:(?:canvas|display)\s+settings?|linear\s+units?|(?:change|set|switch)\s+units?\b|us\s+survey\s+(?:foot|feet)|international\s+(?:foot|feet)|coordinate\s+precision|decimal\s+places|north\s+arrow(?:\s+style|\s+position)?|point\s+attribute\s+scaling|enable\s+point\s+symbols|show\s+point\s+symbols|(?:dark|light)\s+(?:theme|mode)|holiday\s+theme|reduce\s+motion)\b/i,
    replyText:
      'Here are the live <strong>Canvas &amp; Display</strong> settings in chat. Adjust linear units, precision, point symbols, attribute scaling, north arrow, or theme right here.',
    suggestedQuestions: [
      'Open Graphics & WebGPU settings',
      'Change State Plane coordinate system',
      'Open Point Labeling settings',
    ],
  },
];

interface WorkspaceToolRule {
  tool: A2UIWorkspaceToolId;
  agent: AgentType;
  pattern: RegExp;
  replyText: string;
  suggestedQuestions: string[];
}

const WORKSPACE_TOOL_RULES: readonly WorkspaceToolRule[] = [
  {
    tool: 'symbol-manager',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:symbol\s+manager|custom\s+symbols?\s+(?:manager|editor|panel)|create\s+(?:a\s+)?custom\s+symbol|export\s+all\s+symbols|survey\s+symbol\s+library)\b/i,
    replyText:
      'Here is the live <strong>Symbol Manager</strong> in chat. Toggle built-in survey symbols, generate custom symbols with AI or DXF, or pop it out / dock it into the tool shelf.',
    suggestedQuestions: [
      'Open CAD Standards spreadsheet editor',
      'Open Linetype Manager',
      'Adjust Canvas & Display settings',
    ],
  },
  {
    tool: 'linetype-manager',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:linetype\s+manager|manage\s+linetypes?|custom\s+linetypes?\s+panel|upload\s+\.lin\s+file)\b/i,
    replyText:
      'Here is the live <strong>Linetype Manager</strong> in chat. Upload <code>.lin</code> files, generate survey linetypes with AI, or push them to Civil 3D.',
    suggestedQuestions: [
      'Open Symbol Manager',
      'Open Hatch Manager',
      'Open CAD Standards spreadsheet editor',
    ],
  },
  {
    tool: 'hatch-manager',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:hatch\s+manager|manage\s+hatches|custom\s+hatch(?:es)?\s+panel|hatch\s+patterns?\s+editor)\b/i,
    replyText:
      'Here is the live <strong>Hatch Manager</strong> in chat. Browse, customize, and preview CAD hatch patterns below.',
    suggestedQuestions: [
      'Open Linetype Manager',
      'Open Symbol Manager',
      'Open CAD Standards spreadsheet editor',
    ],
  },
  {
    tool: 'raster-underlay',
    agent: AgentType.CAD_MANAGER,
    pattern:
      /\b(?:georeferenc\w*|underlay\s+(?:manager|panel|surface)|(?:image|raster|pdf|scan(?:ned)?|plan)\s+(?:underlays?|overlays?|alignment)|align\s+(?:an?\s+|the\s+)?(?:image|pdf|scan(?:ned)?|raster|plan)\s+to\s+(?:project\s+|control\s+)?(?:points?|coordinates?))/i,
    replyText:
      'Here is the live <strong>Image &amp; PDF Underlays</strong> surface. Import a plan PDF or raster scan, click two image anchors, associate each with a project point, and the underlay scales and rotates into place.',
    suggestedQuestions: [
      'Open Hatch Manager',
      'Open CAD Standards spreadsheet editor',
      'Show CACP manifests',
    ],
  },
  {
    tool: 'annotate-manager',
    agent: AgentType.CIVIL_DRAFTER,
    pattern: /\b(?:annotate\s+manager|annotation\s+(?:manager|rules?|categories)\s*(?:panel|editor)?|manage\s+annotations?)\b/i,
    replyText:
      'Here is the live <strong>Annotate Manager</strong> in chat. Configure custom annotation rules, street labels, and annotation categories below.',
    suggestedQuestions: [
      'Open Point Labeling settings',
      'Open Symbol Manager',
      'Open Drafting Style Library',
    ],
  },
  {
    tool: 'stationing-controls',
    agent: AgentType.CENTERLINE_STATIONING,
    pattern: /\b(?:stationing|baseline|centerline)\s+(?:controls?|settings?)\b|\b(?:auto\s+station\s+points?|station\s+point\s+interval|station\s+labels?)\b/i,
    replyText:
      'Here are the live <strong>Stationing Controls</strong>. Auto station points follow the canvas P/L switch; adjust the interval and centerline annotations here.',
    suggestedQuestions: [
      'Open Annotate Manager',
      'Open Stationing & CL tools',
      'Turn off auto station points',
    ],
  },
  {
    tool: 'drafting-style-library',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:drafting\s+style\s+library|style\s+library\s+panel|manage\s+drafting\s+styles?)\b/i,
    replyText:
      'Here is the live <strong>Drafting Style Library</strong> in chat. Add or edit drafting style examples for the Civil Drafter agent.',
    suggestedQuestions: [
      'Open CAD Manager workspace',
      'Open Annotate Manager',
      'Open Symbol Manager',
    ],
  },
  {
    tool: 'layer-manager',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:data\s+visibility|layer\s+manager(?:\s+panel)?|layer\s+visibility\s+panel|toggle\s+layer\s+visibility)\b/i,
    replyText:
      'Here is the live <strong>Data Visibility &amp; Layer Manager</strong> in chat. Toggle point lists, CAD layers, WMS overlays, and inclusion boundaries below.',
    suggestedQuestions: [
      'Show all layers in the standards',
      'Open WMS & Offline Maps manager',
      'Open CAD Manager workspace',
    ],
  },
  {
    tool: 'compliance-summary',
    agent: AgentType.STANDARDS_COMPLIANCE,
    pattern: /\b(?:compliance\s+(?:summary|report|audit)\s+panel|standards\s+compliance\s+panel)\b/i,
    replyText:
      'Here is the live <strong>Standards Compliance Audit</strong> surface in chat. Review findings, toggle audit checks, or run a fresh compliance pass.',
    suggestedQuestions: [
      'Run compliance now.',
      'Open CAD Manager workspace',
      'Show all layers in the standards',
    ],
  },
  {
    tool: 'title-search-panel',
    agent: AgentType.TITLE_SEARCH,
    pattern: /\b(?:title\s+search\s+panel|chain\s+of\s+title\s+panel)\b/i,
    replyText:
      'Here is the live <strong>Title Search Workspace</strong> in chat. Inspect deeds, chain of title, and recorded liens below.',
    suggestedQuestions: [
      'Who is the current owner?',
      'Show me the chain of title.',
      'Open Closure Reports',
    ],
  },
  {
    tool: 'wms-manager',
    agent: AgentType.GIS_AGENT,
    pattern: /\b(?:wms\s+(?:manager|panel|services?)|offline\s+map\s+areas?\s+manager)\b/i,
    replyText:
      'Here is the live <strong>WMS &amp; Offline Maps Manager</strong> in chat. Connect a WMS endpoint, toggle imagery layers, or manage offline map caches.',
    suggestedQuestions: [
      'Configure Map Imagery overlay',
      'Open Data Visibility & Layer Manager',
      'Change State Plane coordinate system',
    ],
  },
  {
    tool: 'file-manager',
    agent: AgentType.LSVZ_AGENT,
    pattern: /\b(?:file\s+manager|project\s+files?\s+(?:manager|panel)|session\s+files?\s+manager)\b/i,
    replyText:
      'Here is the live <strong>File Manager</strong> in chat. Inspect uploaded and generated project files or open them in the Text Editor.',
    suggestedQuestions: [
      'Open Field Book',
      'Open Closure Reports',
      'Open CAD Manager workspace',
    ],
  },
  {
    tool: 'roading-panel',
    agent: AgentType.ROADING_AGENT,
    pattern: /\b(?:roading\s+(?:studio|panel|workspace|designer)|road\s+(?:typical\s+section|corridor)\s+(?:panel|designer|tool))\b/i,
    replyText:
      'Here is the live <strong>Roading Studio</strong> in chat. Synthesize existing roads from points &amp; imagery, design proposed corridors and typical sections, or generate road profiles.',
    suggestedQuestions: [
      'Synthesize existing road from points & imagery',
      'Design a 24ft road corridor with curb and sidewalk',
      'Generate road profile and cross sections',
    ],
  },
  {
    tool: 'fieldbook-panel',
    agent: AgentType.FIELD_BOOK,
    pattern: /\b(?:field\s*book(?:\s+panel|\s+notes|\s+log)?|open\s+field\s*book)\b/i,
    replyText:
      'Here is the live <strong>Survey Field Book</strong> in chat. Review logged actions, edit field notes, or export to Notion.',
    suggestedQuestions: [
      'Open Stakeout Cut Sheet',
      'Open File Manager',
      'Configure Notion integration',
    ],
  },
  {
    tool: 'cutsheet-panel',
    agent: AgentType.GPS_STAKEOUT,
    pattern: /\b(?:cut\s*sheet(?:\s+panel|\s+report|\s+table)?|stakeout\s+cut\s*sheet)\b/i,
    replyText:
      'Here is the live <strong>Stakeout Cut Sheet</strong> in chat. Review cut/fill deltas, edit header info, or export the sheet.',
    suggestedQuestions: [
      'Open Cut Sheet Defaults settings',
      'Open Field Book',
      'Open Closure Reports',
    ],
  },
  {
    tool: 'closure-report',
    agent: AgentType.DEED_READER,
    pattern: /\b(?:closure\s+reports?(?:\s+panel)?|traverse\s+closure\s+report)\b/i,
    replyText:
      'Here is the live <strong>Closure Reports</strong> surface in chat. Inspect boundary and traverse closure precision, misclosure, and area.',
    suggestedQuestions: [
      'Open Legal Description Writer',
      'What is the closure precision of the parcel?',
      'Open Field Book',
    ],
  },
  {
    tool: 'tin-surfaces',
    agent: AgentType.CONTOURING_AGENT,
    pattern: /\b(?:tin\s+surfaces?|surface\s+(?:manager|studio)|(?:create|build|make)\s+(?:a\s+)?(?:tin|surface)\s+(?:from|using)\s+contours?|import\s+(?:a\s+)?(?:\.?tin|landxml|surface)|export\s+(?:a\s+)?(?:tin|surface|landxml)|contour\s+surface)\b/i,
    replyText:
      'Here is the live <strong>TIN Surfaces</strong> surface in chat. Create a surface from the latest contour generation, import a <code>.tin</code> or LandXML file, or export a surface — every action is also exposed over CACP.',
    suggestedQuestions: [
      'Create TIN from the latest contours',
      'Import a .TIN or LandXML surface',
      'Open Steep Slope Report',
    ],
  },
  {
    tool: 'steep-slope-report',
    agent: AgentType.STEEP_SLOPE_AGENT,
    pattern: /\b(?:steep\s+slope\s+reports?(?:\s+panel)?|slope\s+analysis\s+report)\b/i,
    replyText:
      'Here is the live <strong>Steep Slope Report</strong> in chat. Review TIN slope-band runs and area breakdowns.',
    suggestedQuestions: [
      'Open Data Visibility & Layer Manager',
      'Open File Manager',
      'Open Field Book',
    ],
  },
  {
    tool: 'legal-writer',
    agent: AgentType.DEED_READER,
    pattern: /\b(?:legal\s+(?:description\s+)?writer|write\s+legal\s+description\s+panel)\b/i,
    replyText:
      'Here is the live <strong>Legal Description Writer</strong> in chat. Edit or regenerate metes-and-bounds descriptions with custom formatting.',
    suggestedQuestions: [
      'Open Closure Reports',
      'Extract all boundary descriptions from this deed.',
      'Open Field Book',
    ],
  },
  {
    tool: 'legend',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:open|show|edit|launch|manage|update)\s+(?:the\s+|my\s+)?(?:drawing\s+|sheet\s+|paperspace\s+)?(?:legend|symbol\s+key|key\s+map)\b/i,
    replyText:
      'Here is the live <strong>Legend</strong> surface. It is the same legend as the paperspace sheet — label, color, hatch, column, and placement edits write back to the drawing.',
    suggestedQuestions: [
      'Open Sheet View',
      'Open Data Visibility & Layer Manager',
      'Open Hatch Manager',
    ],
  },
  {
    tool: 'sheet-view',
    agent: AgentType.CAD_MANAGER,
    pattern: /\b(?:sheet\s+view|paperspace\s+(?:layout|view)|24\s*x\s*36\s+(?:sheet|plot|layout)|plot\s+layout\s+view)\b/i,
    replyText:
      'Here is the live <strong>Sheet View (24×36 Plot Layout)</strong> in chat. Preview the paperspace sheet or open it fullscreen to arrange viewports and titleblock metadata.',
    suggestedQuestions: [
      'Open CAD Manager workspace',
      'Open Symbol Manager',
      'Open Linetype Manager',
    ],
  },
];

const POINT_ENTRY_RE =
  /\b(?:(?:add|create|enter|place|drop)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:survey\s+|project\s+)?point(?![a-z])(?:\s+(?:dialog|manually|by\s+coordinates|with\s+coordinates|entry))?|(?:open|show|launch)\s+(?:the\s+)?(?:add\s+point|point\s+(?:entry|dialog|surface)))\b/i;

// Coordinates, Plus Codes, a dialog/form, or a manual entry request means the
// user wants to type the point. Explicit canvas wording arms the picker.
const POINT_ENTRY_FORM_RE =
  /\b(?:coordinates?|plus\s*code|google\s*plus|dialog|form|entry|manually|manual|by\s+hand|type\s+(?:it|the\s+point|in))\b/i;
const POINT_ENTRY_CANVAS_RE =
  /\b(?:canvas|click(?:ing)?|pick(?:ing)?|point\s+and\s+click|on\s+the\s+map)\b/i;
const POINT_ENTRY_CHOICES = [
  'Place a point on the canvas',
  'Enter a point by coordinates',
  'Enter a point by Google Plus Code',
] as const;

const CAD_SPREADSHEET_EDITOR_RE =
  /\b(?:(?:edit|open|launch|modify|change|update)\s+(?:the\s+|my\s+)?(?:cad\s+)?(?:standards?\s+)?(?:spreadsheet|standards?\s+editor|full\s+editor)|(?:standards?\s+)?spreadsheet\s+editor)\b/i;

const POINT_LIST_RE =
  /\b(?:point\s+(?:list|table|grid|spreadsheet)|(?:all|my|the|project|survey|current|loaded)\s+points\b|(?:list|show|view|display|open)\s+(?:all\s+|my\s+|the\s+|project\s+)?points\b)/i;
const GENERIC_SPREADSHEET_RE =
  /\b(?:open|show|start|create|new|blank)\b[\s\S]{0,24}\bspreadsheet\b/i;

/**
 * Map a chat message to a surface intent. Returns null when the message should
 * continue through the normal agent pipeline.
 */
export function resolveA2UISurfaceIntent(query: string): A2UISurfaceIntent | null {
  const trimmed = query.trim();
  if (trimmed.length < 6) return null;

  const hasVerb = REQUEST_VERB_RE.test(trimmed);
  const hasActionOrHowToVerb = ACTION_OR_HOWTO_VERB_RE.test(trimmed);

  // 1. Traffic review takes precedence when the message is about blocked/warned
  // traffic rather than schemas.
  if (hasVerb && CACCP_RE.test(trimmed) && TRAFFIC_RE.test(trimmed)) {
    return {
      surface: 'cacp-review',
      replyText:
        'Here is the live <strong>CACP traffic review</strong> in chat. Blocked sends and policy warnings are shown first; open fullscreen for more room, and re-dispatch always runs back through the CACP policy gate.',
      suggestedQuestions: [
        'Which CACP skills does the CAD Manager expose?',
        'Show me the CACP manifests',
        'Why was the last CACP send blocked?',
      ],
    };
  }

  // 2. Manifests require an explicit manifest/skill/schema signal plus either a
  // CACP mention, the word "manifest", or a named CACP-enabled agent.
  const initialAgent = detectAgent(trimmed);
  if (
    hasVerb &&
    MANIFEST_RE.test(trimmed) &&
    (CACCP_RE.test(trimmed) || /\bmanifests?\b/i.test(trimmed) || initialAgent !== undefined)
  ) {
    const subject = initialAgent
      ? `${initialAgent}’s manifest`
      : 'every CACP-enabled agent';
    return {
      surface: 'cacp-manifests',
      initialAgent,
      replyText: `Here is the live <strong>CACP manifest explorer</strong> for ${subject}. Skill inputs, outputs, and action/query semantics come straight from the registry — open fullscreen to browse comfortably.`,
      suggestedQuestions: [
        'Show blocked CACP traffic',
        'Which agent owns request_next_point_number?',
        'List all CACP-enabled agents',
      ],
    };
  }

  // 3. GPS Rover surface — live fix, stakeout, collect, and benchmark.
  // Project location is owned by the LSAI Agent's cluster toolset instead.
  const GPS_ROVER_RE =
    /\b(?:gps\s+(?:rover|panel|surface|status|dashboard|tools?)|rover\s+(?:panel|surface|status|dashboard)|open\s+(?:the\s+)?gps(?:\s+rover)?)\b/i;

  if (GPS_ROVER_RE.test(trimmed) && (hasActionOrHowToVerb || hasVerb)) {
    const mode = /\bstake\s?out\b/i.test(trimmed)
      ? 'stakeout'
      : /\bcollect|topo(?:graphic)?\s+shot\b/i.test(trimmed)
        ? 'collect'
        : /\bbenchmark|calibration|check\s+(?:a\s+)?(?:known\s+)?point\b/i.test(trimmed)
          ? 'benchmark'
          : 'overview';
    return {
      surface: 'gps-rover',
      mode,
      replyText:
        'Here is the live <strong>GPS Rover</strong> surface. It shows the current fix, stakeout guidance, point collection, and benchmark checks — everything is also exposed over CACP.',
      suggestedQuestions: [
        'Open GPS Rover stakeout',
        'Collect a point at the current fix',
        'Show the CACP manifests for GPS Rover',
      ],
    };
  }

  if (!hasActionOrHowToVerb) return null;

  // 3a. Point database views: the default is the in-chat text editor; explicit
  // sheet/grid/table wording opens the same data directly in the spreadsheet.
  if (
    POINT_LIST_RE.test(trimmed) &&
    !/\b(?:settings?|label(?:ing|s)?|numbering|symbols?|entry|upload|manager)\b/i.test(trimmed)
  ) {
    const view = /\b(?:spreadsheet|sheet|grid|table)\b/i.test(trimmed)
      ? 'spreadsheet'
      : 'text';
    return {
      surface: 'point-list',
      view,
      replyText:
        view === 'spreadsheet'
          ? 'Here is the live <strong>point list</strong> in the A2UI spreadsheet. Search the grid, copy it as TSV, or download CSV; switch back to Text any time.'
          : 'Here is the live <strong>point list</strong> in the A2UI text editor. Switch to <strong>Sheet</strong> for a searchable grid with CSV/TSV export.',
      suggestedQuestions:
        view === 'spreadsheet'
          ? ['Open the point list as text', 'Open Point Tools', 'Show only working points']
          : ['Open point list as spreadsheet', 'Open Point Tools', 'Show only working points'],
    };
  }

  // 3b. Generic blank spreadsheet for tables and quick calculations. Named CAD
  // standards spreadsheets stay on their richer editor below.
  if (
    GENERIC_SPREADSHEET_RE.test(trimmed) &&
    !/\b(?:cad|standards?)\b/i.test(trimmed)
  ) {
    return {
      surface: 'spreadsheet',
      replyText:
        'Here is a lightweight <strong>A2UI spreadsheet</strong>. Edit the scratch grid, search it, or copy/download the data. It is also available to agents through the <code>open_spreadsheet</code> CACP action.',
      suggestedQuestions: [
        'Open point list as spreadsheet',
        'Show CACP manifests',
        'Open the Text Editor',
      ],
    };
  }

  // 3c. First-class A2UI Text Editor. Show document text, deed transcripts,
  // OCR output, notes, and markdown in the same surface every agent uses.
  const TEXT_EDITOR_SUBJECT_RE =
    /(?:\b(?:text\s+editor|document\s+text|deed\s+text|cursive|transcript|transcription|ocr(?:\s+text)?|markdown|text\s+of|contents?\s+of|file\s+(?:text|content))\b|\.md\b)/i;
  const READ_DOCUMENT_RE =
    /\b(?:read|transcribe|extract|show|view|display|open)\b[\s\S]{0,40}\b(?:deed|document|description|note|transcript)\b(?!\s+(?:writer|manager|panel))/i;
  const NEW_TEXT_RE =
    /\b(?:new\s+(?:(?:markdown|md|txt|text)\s+)?(?:text|note|document)|create\s+(?:a\s+)?(?:new\s+)?(?:(?:markdown|md|txt|text)\s+)?(?:text|note|document))\b/i;
  if (TEXT_EDITOR_SUBJECT_RE.test(trimmed) || READ_DOCUMENT_RE.test(trimmed) || NEW_TEXT_RE.test(trimmed)) {
    const mode = NEW_TEXT_RE.test(trimmed) ? 'new' : 'edit';
    const fileHint = /\b(?:deed|legal\s+description|cursive|parcel|title)\b/i.test(trimmed)
      ? 'deed'
      : undefined;
    return {
      surface: 'text-editor',
      mode,
      fileHint,
      replyText:
        mode === 'new'
          ? 'Here is the live <strong>A2UI Text Editor</strong>. Start a plain <code>.txt</code> or Markdown <code>.md</code> note; it stays in the project file list and is available to every agent.'
          : fileHint === 'deed'
            ? 'Here is the live <strong>A2UI Text Editor</strong> with the deed text. Review or correct the transcript, then save it back to the project file list.'
            : 'Here is the live <strong>A2UI Text Editor</strong>. Open a project text file, edit it, or start a new <code>.txt</code> / <code>.md</code> note without leaving the conversation.',
      suggestedQuestions: [
        'Show the deed text',
        'Create a new Markdown note',
        'Open the full Text Editor',
      ],
    };
  }

  // 4. CAD Standards Spreadsheet Editor direct intent
  if (CAD_SPREADSHEET_EDITOR_RE.test(trimmed)) {
    return {
      surface: 'cad-standards-editor',
      replyText:
        'Here is the editable <strong>CAD Standards Sheet</strong> right in chat, and I have also opened the full <strong>Standards Spreadsheet Editor</strong> so you can edit codes, layers, linetypes, symbols, Team Codes, and Field-to-Finish settings.',
      suggestedQuestions: [
        'Show all layers in the standards',
        'Open Symbol Manager',
        'Open Linetype Manager',
      ],
    };
  }

  // 4. First-class A2UI point-entry dialog. A bare "add a point" is ambiguous,
  // so offer the entry methods as Quick Thought choices. Explicit coordinate,
  // Plus Code, dialog, or canvas wording takes the matching path immediately.
  if (POINT_ENTRY_RE.test(trimmed)) {
    const pointNumberMatch = trimmed.match(/\bpoint\s*#?\s*(\d+)\b/i);
    const wantsForm = POINT_ENTRY_FORM_RE.test(trimmed);
    const wantsCanvas = !wantsForm && POINT_ENTRY_CANVAS_RE.test(trimmed);
    if (!wantsForm && !wantsCanvas) {
      return {
        surface: 'point-entry',
        pointNumber: pointNumberMatch?.[1],
        placement: 'quick-thought',
        questionOptions: [...POINT_ENTRY_CHOICES],
        replyText:
          'How would you like to add the point? Pick it on the canvas, type coordinates, or use a full Google Plus Code. PointAgent CACP assigns the number.',
        suggestedQuestions: [...POINT_ENTRY_CHOICES],
      };
    }
    return {
      surface: 'point-entry',
      pointNumber: pointNumberMatch?.[1],
      placement: wantsForm ? 'form' : 'canvas',
      replyText: wantsForm
        ? 'Here is the live <strong>point-entry</strong> surface. Enter coordinates, a full Google Plus Code, elevation, and a description — PointAgent CACP keeps the number unique.'
        : 'Click on the canvas to place the point. I’ve armed the add-point tool with the next CACP number; press Esc when finished.',
      suggestedQuestions: wantsForm
        ? [
            'Place a point on the canvas',
            'Enter a point by Google Plus Code',
            'Use the next CACP point number',
            'Open Point Editor',
          ]
        : [
            'Enter a point by coordinates',
            'Enter a point by Google Plus Code',
            'Open the Add Point dialog',
          ],
    };
  }

  // 5. Granular section-scoped Settings surfaces
  for (const rule of SETTINGS_SECTION_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        surface: 'settings',
        section: rule.section,
        replyText: rule.replyText,
        suggestedQuestions: rule.suggestedQuestions,
      };
    }
  }

  // 5. Workspace Tools & Managers
  for (const rule of WORKSPACE_TOOL_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        surface: 'workspace-tool',
        tool: rule.tool,
        agent: rule.agent,
        replyText: rule.replyText,
        suggestedQuestions: rule.suggestedQuestions,
      };
    }
  }

  // 6. Fluid Conversational Hatch Requests -> A2UI Hatch Studio
  const isHatchActionRequest =
    /\b(?:hatch|bhatch|cross[- ]?hatch)\b/i.test(trimmed) ||
    /\b(?:fill|shade)\b.*\b(?:with\s+hatch|pattern|polygon|area|building|concrete|asphalt|gravel|wetland|pond|parcel|lot|driveway|sidewalk)\b/i.test(trimmed);

  if (isHatchActionRequest && !/\b(?:standard|spreadsheet|sheet|table)\b/i.test(trimmed)) {
    const rec = resolveHatchForFeatureOrCode(trimmed);
    const scaleMatch = trimmed.match(/\bscale\s*(?:of\s*|to\s*|=\s*)?(\d+(?:\.\d+)?)/i);
    const angleMatch = trimmed.match(/\b(?:angle|rotate|rotated)\s*(?:of\s*|to\s*|=\s*)?(-?\d+(?:\.\d+)?)/i);
    const scale = scaleMatch ? Math.max(0.05, parseFloat(scaleMatch[1])) : rec.recommendedScale;
    const angleDeg = angleMatch ? parseFloat(angleMatch[1]) : rec.recommendedAngle;
    const target: 'area' | 'objects' | 'circles' = /\bcircles?\b/i.test(trimmed)
      ? 'circles'
      : /\b(?:select|objects?|polyline)\b/i.test(trimmed)
        ? 'objects'
        : 'area';
    const mode: 'pick-area' | 'select-object' =
      target === 'area' ? 'pick-area' : 'select-object';

    return {
      surface: 'hatch-studio',
      hatchStudio: {
        title: `Hatch Studio — ${rec.hatch.name}`,
        description: `${rec.hatch.description} (Layer: ${rec.recommendedLayer})`,
        patternName: rec.hatch.name,
        scale,
        angleDeg,
        opacity: 0.45,
        color: rec.hatch.previewColor || '#22d3ee',
        layer: rec.recommendedLayer,
        mode,
        target,
        targetFeature: trimmed,
      },
      replyText:
        `I matched your request to the <strong>${rec.hatch.name}</strong> pattern (${rec.hatch.description}) on layer <code>${rec.recommendedLayer}</code>. ` +
        `Adjust scale, angle, or pattern below, then click <strong>Click in Area on Canvas (H)</strong> or <strong>Select Closed Object</strong> to place it.`,
      suggestedQuestions: [
        'Open Hatch Manager',
        'Show all hatch patterns in the standard',
        'Open CAD Standards spreadsheet editor',
      ],
    };
  }

  return null;
}

