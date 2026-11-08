/**
 * A2UI (Agent-to-UI) Conversational Intake Service
 *
 * Replaces full-screen blocking upload gates with an inquisitive, friendly
 * in-chat agent flow on the drawing canvas. Each agent greets the user upon
 * entry, asks what they would likely want to do, and—when the user replies
 * "yes" (or clicks a quick-reply chip / requests an upload)—presents the
 * established upload & configuration controls directly inside the chat via A2UI.
 */

import {
  AgentType,
  MessageRole,
  type A2UIPayload,
  type A2UIWidgetType,
  type ChatMessage,
} from '../types.ts';
import { buildAgentWelcome } from './agentWelcome.ts';

export interface A2UIIntakeContext {
  existingPointCount?: number;
  cadStandardsLoaded?: boolean;
  hasBoundaryFiles?: boolean;
  hasCenterlines?: boolean;
  hasGisFeatures?: boolean;
  hasDxfLoaded?: boolean;
  hasPlansLoaded?: boolean;
  hasImagesLoaded?: boolean;
  hasRawLoaded?: boolean;
}

export type A2UICustomActionId =
  | 'manual-points'
  | 'open-point-tools'
  | 'manual-boundary'
  | 'open-boundary-gis'
  | 'open-cad-standards'
  | 'cad-manager-chat'
  | 'civil-drafter-existing-points'
  | 'civil-drafter-auto-draft'
  | 'civil-drafter-context'
  | 'civil-drafter-sample-raw'
  | 'raw-crawler-example'
  | 'centerline-example'
  | 'centerline-blank'
  | 'open-image-gallery'
  | 'open-zoning-intake'
  | 'open-title-search-panel'
  | 'open-compliance-panel'
  | 'roading-synthesize-existing'
  | 'roading-design-corridor'
  | 'open-roading-studio'
  | 'decline-upload';

export type A2UIReplyResolution =
  | {
      action: 'show-upload-widget';
      widgetType: A2UIWidgetType;
      agent: AgentType;
      replyText: string;
    }
  | {
      action: 'custom-action';
      customActionId: A2UICustomActionId;
      replyText: string;
      suggestedQuestions?: string[];
    };

/**
 * Agents that use conversational A2UI intake on the drawing canvas instead of
 * a blocking full-screen upload screen.
 */
export const A2UI_INTAKE_AGENTS: readonly AgentType[] = [
  AgentType.POINT_EDITOR,
  AgentType.DEED_READER,
  AgentType.RAW_CRAWLER,
  AgentType.CIVIL_DRAFTER,
  AgentType.CIVIL_PLAN_EXPERT,
  AgentType.DXF_ANALYZER,
  AgentType.GIS_AGENT,
  AgentType.CENTERLINE_STATIONING,
  AgentType.IMAGE_ANALYZER,
  AgentType.ZONING_AGENT,
  AgentType.TITLE_SEARCH,
  AgentType.STANDARDS_COMPLIANCE,
  AgentType.CAD_MANAGER,
  AgentType.ROADING_AGENT,
] as const;

export function getAgentA2UIWidgetType(agent: AgentType): A2UIWidgetType | null {
  switch (agent) {
    case AgentType.POINT_EDITOR:
      return 'point-upload';
    case AgentType.DEED_READER:
      return 'deed-upload';
    case AgentType.RAW_CRAWLER:
      return 'raw-upload';
    case AgentType.CIVIL_DRAFTER:
      return 'civil-drafter-upload';
    case AgentType.CIVIL_PLAN_EXPERT:
      return 'plan-upload';
    case AgentType.DXF_ANALYZER:
      return 'dxf-upload';
    case AgentType.GIS_AGENT:
      return 'gis-upload';
    case AgentType.CENTERLINE_STATIONING:
      return 'centerline-upload';
    case AgentType.IMAGE_ANALYZER:
      return 'image-upload';
    case AgentType.ZONING_AGENT:
      return 'zoning-intake';
    case AgentType.TITLE_SEARCH:
      return 'title-search-upload';
    case AgentType.STANDARDS_COMPLIANCE:
      return 'standards-compliance-intake';
    case AgentType.CAD_MANAGER:
      return 'cad-manager-intake';
    case AgentType.ROADING_AGENT:
      return 'roading-intake';
    case AgentType.CONTOURING_AGENT:
    case AgentType.STEEP_SLOPE_AGENT:
    case AgentType.PROFILE_AGENT:
    case AgentType.COGO_AGENT:
      return 'point-upload';
    default:
      return null;
  }
}

export function getUploadPromptCopy(agent: AgentType, widgetType: A2UIWidgetType): string {
  switch (widgetType) {
    case 'point-upload':
      return 'Here are the point upload options right in the chat — drop your <strong>.csv</strong> or <strong>.txt</strong> point files (or a whole folder) below:';
    case 'deed-upload':
      return 'Here are the Boundary Agent deed options — upload a deed PDF or image, paste a legal description, or jump to manual entry or County GIS below:';
    case 'raw-upload':
      return 'Drop your surveyor <strong>.RAW</strong> file right here in the chat, or load the example file below:';
    case 'civil-drafter-upload':
      return 'Drop your point file (<strong>.raw</strong>, <strong>.csv</strong>, <strong>.txt</strong>) or PDF plan sheet below to begin drafting:';
    case 'plan-upload':
      return 'Drop one or more PDF plan sheets below and I will read and synthesize them for you:';
    case 'dxf-upload':
      return 'Drop your <strong>.dxf</strong> file below to render it onto the canvas and inspect its layers and geometry:';
    case 'gis-upload':
      return 'You can ask me for live public layers any time — county lines, State Plane / SPC zones, school or voting districts, streams, water bodies, watersheds. Here are the GIS intake options for files and services:';
    case 'centerline-upload':
      return 'Drop your <strong>.cl</strong> alignment file below, load the 1.5-mile highway example, or start a blank centerline:';
    case 'image-upload':
      return 'Drop your site photos or exhibit images below so I can tag, analyze, and link them to your project points:';
    case 'zoning-intake':
      return 'Select your property jurisdiction (or autofill from GPS) below so I can research the official zoning map, districts, and ordinances:';
    case 'title-search-upload':
      return 'Upload a deed PDF/image or paste a deed description below to start building the chain of title:';
    case 'standards-compliance-intake':
      return 'Configure your compliance audit below — select a subject PDF, optional reference PDFs, source mode, and checks to run:';
    case 'cad-manager-intake':
      return 'Drop your CAD standards file (<strong>.lay</strong>, <strong>.dsc</strong>, <strong>.lin</strong>, <strong>.json</strong>, <strong>.md</strong>, <strong>.csv</strong>, <strong>.fxl</strong>, <strong>.fcl</strong>) below, or start a new standards session:';
    case 'roading-intake':
      return 'All fields are optional. Press <strong>Synthesize Existing Road</strong> to draw from the loaded survey points with the defaults shown, or <strong>Generate Road Corridor</strong> for a proposed design — refine lanes, curb, sidewalk, ROW, and Stationing/Profile coupling whenever you like:';
    default:
      return buildAgentWelcome(agent, 'Use the interactive options below to load your project data:');
  }
}

/**
 * Builds the initial inquisitive greeting message (or immediately expanded
 * A2UI upload widget when `autoExpandUpload` is true) when entering an agent.
 */
export function buildA2UIIntakeGreeting(
  agent: AgentType,
  ctx: A2UIIntakeContext = {},
  autoExpandUpload = false
): { message: ChatMessage; suggestedQuestions: string[] } | null {
  const widgetType = getAgentA2UIWidgetType(agent);
  if (!widgetType) return null;

  const ptCount = ctx.existingPointCount ?? 0;

  if (autoExpandUpload) {
    const welcomeText = buildAgentWelcome(
      agent,
      getUploadPromptCopy(agent, widgetType)
    );
    return {
      message: {
        role: MessageRole.MODEL,
        text: welcomeText,
        a2ui: {
          kind: 'upload-widget',
          agent,
          widgetType,
          status: 'expanded',
        },
      },
      suggestedQuestions: getDefaultSuggestedQuestions(agent),
    };
  }

  let detail = '';
  let questionOptions: string[] = [];
  const suggestedQuestions = getDefaultSuggestedQuestions(agent);

  switch (agent) {
    case AgentType.POINT_EDITOR:
      if (ptCount > 0) {
        detail = `Welcome to the drawing canvas! I see <strong>${ptCount.toLocaleString()} point${ptCount === 1 ? '' : 's'}</strong> already loaded. Would you like to upload additional point files (<strong>.csv</strong> or <strong>.txt</strong>), or work with the points already on the canvas?`;
        questionOptions = [
          'Upload Points',
          'Work with existing points',
          'Open Point Tools',
        ];
      } else {
        detail =
          'Welcome to the drawing canvas! Would you like to upload a point file (<strong>.csv</strong> or <strong>.txt</strong>) or folder right now, or would you prefer to key in points manually?';
        questionOptions = [
          'Upload Points',
          'Key in points manually',
          'Open Point Tools',
        ];
      }
      break;

    case AgentType.DEED_READER:
      detail =
        'Welcome to the drawing canvas! Would you like to upload or paste a deed / legal description for me to draft onto the canvas, key in a manual boundary, or look up a parcel in County GIS?';
      questionOptions = [
        'Yes, upload or paste a deed',
        'Start a blank manual boundary',
        'Look up parcel in County GIS',
      ];
      break;

    case AgentType.GIS_AGENT:
      detail =
        'Welcome to the drawing canvas! Ask me to draw a live public layer — county lines, State Plane / SPC zones, school districts, streams, water bodies, watersheds — or import <strong>.geojson</strong> / connect an ArcGIS REST service.';
      questionOptions = [
        'Yes, open GIS upload & server options',
        'Browse public ArcGIS catalog',
        'Work on canvas first',
      ];
      break;

    case AgentType.CAD_MANAGER:
      if (ctx.cadStandardsLoaded) {
        detail =
          'Welcome to the drawing canvas! Your CAD standard is loaded and active. Would you like to upload a standards file (<strong>.lay</strong>, <strong>.dsc</strong>, <strong>.lin</strong>, <strong>.json</strong>), open the CAD Manager workspace, or match survey codes and layers right here in chat?';
        questionOptions = [
          'Yes, upload a standards file',
          'Show standards spreadsheet',
          'Open CAD Standards Editor',
          'Match survey codes in chat',
        ];
      } else {
        detail =
          'Welcome to the drawing canvas! Would you like to upload an existing CAD standards file (<strong>.lay</strong>, <strong>.dsc</strong>, <strong>.lin</strong>, or <strong>.json</strong>) to get started, or open the CAD Manager workspace to create a new standard?';
        questionOptions = [
          'Yes, upload a standards file',
          'Start new standards session',
          'Work in chat on canvas',
        ];
      }
      break;

    case AgentType.CIVIL_DRAFTER:
      if (ptCount > 0) {
        detail = `Welcome to the drawing canvas! I see <strong>${ptCount.toLocaleString()} point${ptCount === 1 ? '' : 's'}</strong> already on the canvas. Set up <strong>Auto Draft</strong> for a guided one-shot drafting run, tune how much context I carry, upload a point/PDF file, or draft directly from the points already here.`;
        questionOptions = [
          'Set up Auto Draft',
          'Set up context',
          'Yes, upload a point or PDF file',
          'Draft from existing canvas points',
        ];
      } else {
        detail =
          'Welcome to the drawing canvas! Set up <strong>Auto Draft</strong> for a guided one-shot drafting run, tune how much context I carry, or upload a survey point file (<strong>.raw</strong>, <strong>.csv</strong>, <strong>.txt</strong>) or PDF plan sheet to begin.';
        questionOptions = [
          'Set up Auto Draft',
          'Set up context',
          'Yes, upload a point or PDF file',
        ];
      }
      break;

    case AgentType.RAW_CRAWLER:
      detail =
        'Welcome to the drawing canvas! Would you like to upload a field <strong>.RAW</strong> survey file for me to parse and plot, or load our example .RAW file to explore?';
      questionOptions = [
        'Yes, upload a .RAW file',
        'Load an example .RAW file',
        'Continue on canvas',
      ];
      break;

    case AgentType.DXF_ANALYZER:
      detail =
        'Welcome to the drawing canvas! Would you like to upload a <strong>.dxf</strong> drawing so I can render it immediately on the canvas and inspect its layers, entities, and geometry?';
      questionOptions = ['Yes, upload a .DXF file', 'Continue on canvas'];
      break;

    case AgentType.CIVIL_PLAN_EXPERT:
      detail =
        'Welcome to the drawing canvas! Would you like to upload one or more PDF plan sheets so I can read, synthesize, and extract design data from them?';
      questionOptions = ['Yes, upload PDF plan sheets', 'Continue on canvas'];
      break;

    case AgentType.CENTERLINE_STATIONING:
      detail =
        'Welcome to the drawing canvas! Would you like to upload a <strong>.cl</strong> alignment file, load our 1.5-mile highway example, or start a blank centerline alignment?';
      questionOptions = [
        'Yes, upload a .CL file',
        'Load 1.5-mile highway example',
        'Start a blank centerline',
      ];
      break;

    case AgentType.IMAGE_ANALYZER:
      detail =
        'Welcome to the drawing canvas! Would you like to upload site photos or exhibit images for me to describe, tag, and link to your survey points?';
      questionOptions = [
        'Yes, upload site photos',
        'Open Image Gallery',
        'Continue on canvas',
      ];
      break;

    case AgentType.ZONING_AGENT:
      detail =
        'Welcome to the drawing canvas! Would you like to set your property jurisdiction (or autofill from GPS) so I can research the official zoning map, districts, and setbacks?';
      questionOptions = [
        'Yes, set jurisdiction & research zoning',
        'Ask a zoning question in chat',
      ];
      break;

    case AgentType.TITLE_SEARCH:
      detail =
        'Welcome to the drawing canvas! Would you like to upload or paste a deed document to begin building the chain of title and checking for liens and encumbrances?';
      questionOptions = [
        'Yes, upload or paste a deed',
        'Open Title Search Panel',
        'Ask a title question in chat',
      ];
      break;

    case AgentType.STANDARDS_COMPLIANCE:
      detail =
        'Welcome to the drawing canvas! Would you like to upload a subject plan PDF (and optional reference PDFs) to run a CAD standards compliance audit?';
      questionOptions = [
        'Yes, upload PDFs for compliance audit',
        'Open Compliance Summary Panel',
        'Ask about compliance checks',
      ];
      break;

    case AgentType.ROADING_AGENT:
      detail =
        ptCount > 0
          ? `Welcome to the drawing canvas! I see <strong>${ptCount.toLocaleString()} point${ptCount === 1 ? '' : 's'}</strong>${ctx.hasCenterlines ? ' and active centerline alignments' : ''} ready. Would you like to synthesize existing roads from your points and background imagery, design a proposed road corridor with Stationing &amp; CL and Profile integration, or open the Roading Studio?`
          : 'Welcome to the drawing canvas! Would you like to synthesize existing roads from points, background imagery, and OpenStreetMap, or design a proposed road corridor (lanes, curb &amp; gutter, sidewalks, ROW, and profiles)?';
      questionOptions = [
        'Synthesize existing road from points & imagery',
        'Design new road corridor',
        'Open Roading Studio',
      ];
      break;

    default:
      return null;
  }

  return {
    message: {
      role: MessageRole.MODEL,
      text: buildAgentWelcome(agent, detail),
      questionOptions,
      a2ui: {
        kind: 'intake-prompt',
        agent,
        widgetType,
        status: 'prompting',
      },
    },
    suggestedQuestions,
  };
}

export function getDefaultSuggestedQuestions(agent: AgentType): string[] {
  switch (agent) {
    case AgentType.POINT_EDITOR:
      return [
        'Calculate inverse from 100 to 101',
        'Add a point at N: 5000, E: 5000',
        'Filter points by description',
      ];
    case AgentType.DEED_READER:
      return [
        'Extract all boundary descriptions from this deed.',
        'What is the closure precision of the parcel?',
        'Are there any ambiguous calls in the legal description?',
      ];
    case AgentType.GIS_AGENT:
      return [
        'Show me county lines',
        'Draw State Plane / SPC zones',
        'Draw streams and water bodies',
        'Show watersheds',
        'How many features are in this file?',
      ];
    case AgentType.CAD_MANAGER:
      return [
        'What layers are in the active CAD standard?',
        'Map survey code EP to the right pavement layer',
        'How do description keys resolve symbols and linetypes?',
      ];
    case AgentType.CIVIL_DRAFTER:
      return [
        'Draw the road edges as parallel lines',
        'Create centerline from survey shots',
        'Plot building footprints',
        'Analyze the point descriptions',
      ];
    case AgentType.RAW_CRAWLER:
      return [
        'Summarize all observations in this .RAW file',
        'Plot all traverse and sideshot points on the canvas',
        'Are there any backsight or rod height changes?',
      ];
    case AgentType.DXF_ANALYZER:
      return [
        'How many layers are in this DXF?',
        'List all entities by layer and type.',
        'What is the total length of all polylines?',
      ];
    case AgentType.CIVIL_PLAN_EXPERT:
      return [
        'Plot the storm drain network.',
        'Draw lot 5 and label its dimensions.',
        'What is the elevation of the sanitary manhole in the intersection?',
      ];
    case AgentType.CENTERLINE_STATIONING:
      return [
        'What is the total length of the centerline?',
        'Calculate coordinates at Station 2+50, offset 25 ft right',
        'List all curve data along the alignment',
      ];
    case AgentType.IMAGE_ANALYZER:
      return [
        'Describe what you see in the first image.',
        'Are there any utility markings visible in these photos?',
        'Associate IMG_01.jpg with point 501.',
      ];
    case AgentType.ZONING_AGENT:
      return [
        'What are the setback requirements for R-1?',
        'What is the maximum building height?',
        'Are there any overlay or floodplain districts?',
      ];
    case AgentType.TITLE_SEARCH:
      return [
        'Analyze this deed and extract the key information.',
        'Who is the current owner?',
        'Show me the chain of title.',
      ];
    case AgentType.STANDARDS_COMPLIANCE:
      return [
        'Run compliance now.',
        'Run compliance using CAD Manager mode.',
        'Show likely layer and linetype mismatches.',
      ];
    case AgentType.ROADING_AGENT:
      return [
        'Synthesize the existing road from my survey points and background imagery',
        'Design a 24ft wide road corridor with curb, 5ft sidewalks, and 50ft ROW',
        'Generate a road centerline profile and cross sections every 25 feet',
        'Add a 45ft radius cul-de-sac at the end of the road',
      ];
    default:
      return [];
  }
}

const AFFIRMATIVE_REPLY_RE =
  /^(?:y|yes|yeah|yep|yup|sure|ok|okay|please|yes\s+please|sure\s+thing|definitely|absolutely|of\s+course|let'?s\s+do\s+it|go\s+ahead|bring\s+it\s+up|show\s+(?:it|options|upload))[\s.!]*$/i;

const DECLINE_REPLY_RE =
  /^(?:n|no|nope|nah|no\s+thanks|no\s+thank\s+you|not\s+now|later|skip|cancel|never\s*mind|continue\s+on\s+canvas|work\s+on\s+canvas(?:\s+first)?|work\s+in\s+chat(?:\s+on\s+canvas|\s+without\s+a\s+file)?|draft\s+from\s+canvas\s+geometry|continue\s+without\s+uploading|ask\s+a\s+(?:zoning|title)\s+question\s+in\s+chat|ask\s+about\s+compliance\s+checks)[\s.!]*$/i;

const EXPLICIT_UPLOAD_CMD_RE =
  /^(?:(?:yes,?\s+)?(?:please\s+|can\s+i\s+|i\s+want\s+to\s+|let'?s\s+)?(?:upload|import|load|attach|add)\s+(?:a\s+|some\s+|more\s+|my\s+|new\s+|the\s+)?(?:points?|point\s+files?|point\s+or\s+pdf\s+files?|csv|txt|files?|data|deeds?|legal\s+descriptions?|dxf|dwg|gis|geojson|raw|raw\s+files?|plans?|plan\s+sheets?|pdfs?|centerlines?|cl|images?|photos?|pictures?|standards?|cad\s+standards?)|upload|add\s+data|open\s+upload|show\s+upload(?:\s+options)?)[\s.!]*$/i;

/**
 * Inspects a user chat message and determines whether it is answering an A2UI
 * intake prompt (e.g. "yes" / clicking a quick chip) or explicitly asking to
 * open an inline A2UI upload widget.
 *
 * Returns `null` when the message should proceed to the normal AI chat turn.
 */
export function classifyA2UIIntakeReply(
  query: string,
  activeAgent: AgentType,
  lastMessage?: ChatMessage | null
): A2UIReplyResolution | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  const isPrompting =
    lastMessage?.role === MessageRole.MODEL &&
    (lastMessage?.a2ui?.kind === 'intake-prompt' ||
      Boolean(lastMessage?.questionOptions && lastMessage.questionOptions.length > 0));

  // 1. Check exact or clear matches against our custom action chips first
  if (/^(?:key\s+in\s+points\s+manually|enter\s+points\s+manually|work\s+with\s+existing\s+points|start\s+empty(?:\s+session)?)$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'manual-points',
      replyText:
        'Sounds good! The drawing canvas is ready. Use the <strong>Add Point (P)</strong> button on the canvas toolbar, open the <strong>Point Tools</strong> dock, or ask me for any COGO calculation. Type <strong>"upload points"</strong> anytime if you want to import a file later.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.POINT_EDITOR),
    };
  }

  if (/^open\s+point\s+(?:list|tools)$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-point-tools',
      replyText:
        'I have opened the <strong>Point Workspace</strong> dock on the right so you can key in, edit, sort, and manage every point list in one place. Type <strong>"upload points"</strong> anytime to bring up the file uploader in chat.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.POINT_EDITOR),
    };
  }

  if (/^start\s+a\s+blank\s+(?:manual\s+)?boundary$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'manual-boundary',
      replyText:
        'I have started a blank boundary session and opened the <strong>Boundary Editor</strong> so you can key in bearings and distances by hand. Type <strong>"upload deed"</strong> anytime if you want to paste or upload a deed later.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.DEED_READER),
    };
  }

  if (/^look\s+up\s+parcel\s+in\s+(?:county\s+)?gis$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-boundary-gis',
      replyText:
        'I have opened the <strong>County Parcels GIS</strong> panel so you can search and pull public tax-parcel boundaries onto the canvas.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.DEED_READER),
    };
  }

  if (/^(?:open\s+(?:cad\s+)?standards(?:\s+(?:editor|spreadsheet))?|start\s+new\s+standards\s+session)$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-cad-standards',
      replyText:
        'Opening the <strong>CAD Manager workspace</strong> as an interactive surface so you can author layers, description keys, linetypes, and symbols. Pop it out or dock it into the agent tool shelf.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CAD_MANAGER),
    };
  }

  if (/^match\s+survey\s+codes\s+in\s+chat$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'cad-manager-chat',
      replyText:
        'Ready! Tell me which field codes or descriptions you want to standardize, or ask about layers and linetypes in your active standard. Type <strong>"upload standards"</strong> anytime to load a file.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CAD_MANAGER),
    };
  }

  if (/^set\s+up\s+auto\s+draft$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'civil-drafter-auto-draft',
      replyText:
        'I have opened <strong>Auto Draft</strong> in the tool shelf. Pick the site location, confirm what to draft, and run it when ready.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CIVIL_DRAFTER),
    };
  }

  if (/^set\s+up\s+context$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'civil-drafter-context',
      replyText:
        'I have opened <strong>Civil Drafter Context</strong> as an A2UI surface so you can tune retained conversation, point payloads, and vision imagery before the next draft.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CIVIL_DRAFTER),
    };
  }

  if (/^draft\s+from\s+existing\s+canvas\s+points$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'civil-drafter-existing-points',
      replyText:
        'Great — I am locked onto the survey points already on your canvas! Tell me what linework you would like me to draw (e.g., road edges, centerline, building footprints) or use <strong>Auto Draft</strong>.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CIVIL_DRAFTER),
    };
  }

  if (/^load\s+sample\s+\.?raw\s+survey$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'civil-drafter-sample-raw',
      replyText:
        'Loading the sample <strong>.RAW</strong> survey onto the canvas for Civil Drafter…',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CIVIL_DRAFTER),
    };
  }

  if (/^load\s+(?:an\s+)?example\s+\.?raw\s+file$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'raw-crawler-example',
      replyText:
        'Loading the example <strong>.RAW</strong> survey file onto the canvas…',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.RAW_CRAWLER),
    };
  }

  if (/^load\s+1\.5-mile\s+highway\s+example$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'centerline-example',
      replyText:
        'Loading the <strong>1.5-mile highway example (.cl)</strong> alignment onto the canvas…',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CENTERLINE_STATIONING),
    };
  }

  if (/^start\s+a\s+blank\s+centerline$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'centerline-blank',
      replyText:
        'Started a blank alignment for <strong>Centerline "CL-1"</strong>. Open the Stationing Tools or tell me the PIs to add!',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.CENTERLINE_STATIONING),
    };
  }

  if (/^open\s+image\s+gallery$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-image-gallery',
      replyText: 'Opening the <strong>Image Analyzer Gallery</strong>.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.IMAGE_ANALYZER),
    };
  }

  if (/^(?:open|show)\s+zoning\s+(?:research|results)(?:\s+(?:panel|in\s+chat))?$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-zoning-intake',
      replyText: 'Opening the <strong>zoning jurisdiction picker</strong> here in the chat.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.ZONING_AGENT),
    };
  }

  if (/^open\s+title\s+search\s+panel$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-title-search-panel',
      replyText: 'Opening the <strong>Title Search Panel</strong>.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.TITLE_SEARCH),
    };
  }

  if (/^open\s+compliance\s+summary\s+panel$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-compliance-panel',
      replyText: 'Opening the <strong>Standards Compliance Summary Panel</strong>.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.STANDARDS_COMPLIANCE),
    };
  }

  if (/^synthesize\s+existing\s+road(?:\s+from\s+points\s*&\s*imagery)?$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'roading-synthesize-existing',
      replyText:
        'Synthesizing the existing road from your points and imagery now. Inputs are optional — if you know the deeded <strong>right-of-way (ROW) width</strong>, give it to me afterwards and I will add the ROW lines without redrawing.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.ROADING_AGENT),
    };
  }

  if (/^design\s+new\s+road\s+corridor$/i.test(trimmed)) {
    return {
      action: 'show-upload-widget',
      widgetType: 'roading-intake',
      agent: AgentType.ROADING_AGENT,
      replyText: getUploadPromptCopy(AgentType.ROADING_AGENT, 'roading-intake'),
    };
  }

  if (/^open\s+roading\s+studio$/i.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'open-roading-studio',
      replyText:
        'I have opened the <strong>Roading Studio</strong> so you can configure existing road synthesis, typical sections, cul-de-sacs, and centerline profiles.',
      suggestedQuestions: getDefaultSuggestedQuestions(AgentType.ROADING_AGENT),
    };
  }

  // LSAI's empty-workspace Quick Thought uses "Process a deed" as a direct
  // intake action; it should open the deed widget even with no prompt loaded.
  if (/^(?:process|upload|analyze|read)\s+(?:a\s+|the\s+)?deed$/i.test(trimmed)) {
    return {
      action: 'show-upload-widget',
      widgetType: 'deed-upload',
      agent: AgentType.DEED_READER,
      replyText: getUploadPromptCopy(AgentType.DEED_READER, 'deed-upload'),
    };
  }

  // 2. Check affirmative / upload chips when an intake prompt is active
  if (
    isPrompting &&
    (AFFIRMATIVE_REPLY_RE.test(trimmed) ||
      lower.startsWith('yes,') ||
      lower.startsWith('yes ') ||
      lower === 'browse public arcgis catalog' ||
      lower === 'use my location to autofill')
  ) {
    const targetAgent = lastMessage?.a2ui?.agent ?? activeAgent;
    const widgetType =
      lastMessage?.a2ui?.widgetType ?? getAgentA2UIWidgetType(targetAgent);
    if (widgetType) {
      return {
        action: 'show-upload-widget',
        widgetType,
        agent: targetAgent,
        replyText: getUploadPromptCopy(targetAgent, widgetType),
      };
    }
  }

  // 3. Check decline replies when an intake prompt is active
  if (isPrompting && DECLINE_REPLY_RE.test(trimmed)) {
    return {
      action: 'custom-action',
      customActionId: 'decline-upload',
      replyText:
        'No problem at all! The drawing canvas is ready whenever you are. Ask me any question or give a command below — and if you ever want to upload or configure data later, just say <strong>"upload"</strong>!',
      suggestedQuestions: getDefaultSuggestedQuestions(activeAgent),
    };
  }

  // 4. Check explicit upload / import commands on ANY turn
  if (EXPLICIT_UPLOAD_CMD_RE.test(trimmed)) {
    let targetAgent = activeAgent;
    let widgetType = getAgentA2UIWidgetType(activeAgent);

    if (/\b(?:point|points|csv|txt)\b/i.test(lower) && !widgetType) {
      targetAgent = AgentType.POINT_EDITOR;
      widgetType = 'point-upload';
    } else if (/\bdeed|legal\s+description\b/i.test(lower)) {
      if (activeAgent === AgentType.TITLE_SEARCH) {
        widgetType = 'title-search-upload';
      } else {
        targetAgent = AgentType.DEED_READER;
        widgetType = 'deed-upload';
      }
    } else if (/\bdxf\b/i.test(lower)) {
      targetAgent = AgentType.DXF_ANALYZER;
      widgetType = 'dxf-upload';
    } else if (/\bgis|geojson\b/i.test(lower)) {
      targetAgent = AgentType.GIS_AGENT;
      widgetType = 'gis-upload';
    } else if (/\braw\b/i.test(lower) && activeAgent !== AgentType.CIVIL_DRAFTER) {
      targetAgent = AgentType.RAW_CRAWLER;
      widgetType = 'raw-upload';
    } else if (/\bcenterline|\bcl\b/i.test(lower)) {
      targetAgent = AgentType.CENTERLINE_STATIONING;
      widgetType = 'centerline-upload';
    } else if (/\bimage|photo|picture\b/i.test(lower)) {
      targetAgent = AgentType.IMAGE_ANALYZER;
      widgetType = 'image-upload';
    } else if (/\bstandard/i.test(lower) && activeAgent === AgentType.CAD_MANAGER) {
      widgetType = 'cad-manager-intake';
    } else if (!widgetType && /\b(?:pdf|plans?|plan\s+sheets?)\b/i.test(lower)) {
      targetAgent = AgentType.CIVIL_PLAN_EXPERT;
      widgetType = 'plan-upload';
    } else if (!widgetType) {
      widgetType = 'point-upload';
    }

    if (widgetType) {
      return {
        action: 'show-upload-widget',
        widgetType,
        agent: targetAgent,
        replyText: getUploadPromptCopy(targetAgent, widgetType),
      };
    }
  }

  return null;
}

/**
 * Helper to mark any active `intake-prompt` or `upload-widget` messages in a
 * chat history array as completed when data is uploaded or an option is chosen.
 */
export function markPendingA2UICompleted(
  history: ChatMessage[],
  summary?: string
): ChatMessage[] {
  return history.map((msg) => {
    if (!msg.a2ui) {
      if (msg.questionOptions || msg.needsInput) {
        return {
          ...msg,
          questionOptions: undefined,
          needsInput: undefined,
        };
      }
      return msg;
    }
    if (
      msg.a2ui.kind !== 'intake-prompt' &&
      msg.a2ui.kind !== 'upload-widget' &&
      msg.a2ui.kind !== 'input-form'
    ) {
      return msg;
    }
    if (msg.a2ui.status === 'completed' || msg.a2ui.status === 'dismissed') {
      return msg;
    }
    const nextA2ui: A2UIPayload = {
      ...msg.a2ui,
      status: 'completed',
      ...(summary ? { completedSummary: summary } : {}),
    };
    return {
      ...msg,
      questionOptions: undefined,
      needsInput: undefined,
      a2ui: nextA2ui,
    };
  });
}
