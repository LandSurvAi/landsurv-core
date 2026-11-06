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
      surface: 'hatch-studio';
      hatchStudio: A2UIHatchStudioSpec;
      replyText: string;
      suggestedQuestions: string[];
    };

const REQUEST_VERB_RE =
  /\b(?:show|open|inspect|browse|list|view|display|review|pull\s+up|what(?:'s| is)|which|any)\b/i;

const ACTION_OR_HOWTO_VERB_RE =
  /\b(?:show|open|inspect|browse|list|view|display|review|pull\s+up|bring\s+up|launch|edit|adjust|change|configure|set(?:\s+up)?|turn\s+(?:on|off)|enable|disable|toggle|switch|update|manage|hatch|bhatch|fill|shade|cross[- ]?hatch|how\s+(?:do\s+i|to|can\s+i)|where\s+(?:do\s+i|can\s+i|is|are))\b/i;

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
      'Here are the live <strong>A2UI &amp; Agent Surface</strong> settings in chat. Configure auto-open CACP review and the default surface size below.',
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

const CAD_SPREADSHEET_EDITOR_RE =
  /\b(?:(?:edit|open|launch|modify|change|update)\s+(?:the\s+|my\s+)?(?:cad\s+)?(?:standards?\s+)?(?:spreadsheet|standards?\s+editor|full\s+editor)|(?:standards?\s+)?spreadsheet\s+editor)\b/i;

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

  if (!hasActionOrHowToVerb) return null;

  // 3. CAD Standards Spreadsheet Editor direct intent
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

  // 4. Granular section-scoped Settings surfaces
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

