/**
 * A2UI Quick-Thought Decomposition Service
 *
 * Breaks down in-chat A2UI surfaces, intake widgets, parameter requests,
 * inline prose option lists, and markdown checklists into compact actionable
 * controls (buttons, inputs, selects, checkboxes, and file pickers) that
 * render directly inside the Quick Thought card above the agent socket.
 *
 * Only when a dataset is genuinely too large (e.g. a full standards table or
 * more than MAX_QUICK_THOUGHT_OPTIONS / MAX_QUICK_THOUGHT_FIELDS items) does
 * Quick Thought fall back to opening the full chat panel as the primary action.
 */

import {
  AgentType,
  MessageRole,
  type A2UIInputField,
  type A2UIInputFormSpec,
  type A2UIPayload,
  type A2UISelectionPromptSpec,
  type A2UIWidgetType,
  type ChatMessage,
} from '../types.ts';
import {
  buildA2UIInputFormFromNeedsInput,
  deriveA2UIInputForm,
} from './a2uiInput.ts';
import { CONTOUR_AGENT_QUICK_THOUGHTS } from './contourSourceIntent.ts';

export const MAX_QUICK_THOUGHT_OPTIONS = 6;
export const MAX_QUICK_THOUGHT_FIELDS = 6;

/**
 * Opening options shown in the Quick Thought card alongside an agent's first
 * greeting. Every agent gets a set so the compact input surface is useful
 * before the model has asked for a specific parameter.
 */
export const AGENT_INITIAL_QUICK_THOUGHTS: Record<AgentType, string[]> = {
  [AgentType.RAW_CRAWLER]: [
    'Upload a .RAW file',
    'Load the example .RAW survey',
    'Summarize the loaded observations',
  ],
  [AgentType.VOICE_AGENT]: [
    'What can you do?',
    'Open the command bar',
    'Show available voice commands',
  ],
  [AgentType.CIVIL_DRAFTER]: [
    'Set up Auto Draft',
    'Open Point Studio',
    'Set up context',
  ],
  [AgentType.DEED_READER]: [
    'Upload or paste a deed',
    'Show the deed text',
    'Start a blank manual boundary',
    'Look up a parcel in County GIS',
  ],
  [AgentType.CENTERLINE_STATIONING]: [
    'Start a blank centerline',
    'Load the 1.5-mile highway example',
    'Upload a .CL alignment file',
  ],
  [AgentType.POINT_EDITOR]: [
    'Add a point manually',
    'Upload a point file',
    'Open Point Tools',
  ],
  [AgentType.GPS_STAKEOUT]: [
    'Stake out the closest point',
    'Collect a new point',
    'Open GPS Rover tools',
  ],
  [AgentType.FIELD_BOOK]: [
    'Open the field book',
    'Show recent field notes',
    'Log a new note',
  ],
  [AgentType.LSVZ_AGENT]: [
    'Where is my project?',
    'Fetch county tax lines for my project',
    'Fetch flood lines for my project',
  ],
  [AgentType.CIVIL_PLAN_EXPERT]: [
    'Upload PDF plan sheets',
    'Extract dimensions from the plans',
    'Plot the storm drain network',
  ],
  [AgentType.DXF_ANALYZER]: [
    'Upload a .DXF file',
    'Inspect layers and entities',
    'Measure total polyline length',
  ],
  [AgentType.FILE_MANAGER]: [
    'Open the file manager',
    'Show loaded project files',
    'Add a new file',
  ],
  [AgentType.TEXT_EDITOR]: [
    'Open the text editor',
    'Create a new note',
    'Show project text files',
  ],
  [AgentType.IMAGE_ANALYZER]: [
    'Upload site photos',
    'Describe the first image',
    'Link an image to a point',
  ],
  [AgentType.GIS_AGENT]: [
    'Show me county lines',
    'Draw State Plane / SPC zones',
    'Show school district lines',
    'Draw streams and water bodies',
    'Show watersheds',
    'Open the legend',
  ],
  [AgentType.CONTOURING_AGENT]: [...CONTOUR_AGENT_QUICK_THOUGHTS],
  [AgentType.STEEP_SLOPE_AGENT]: [
    'Run 15%, 30%, 45% slope bands',
    'Set a minimum vertical span',
    'Open Steep Slope tools',
  ],
  [AgentType.PROFILE_AGENT]: [
    'Generate a profile along a line',
    'Create cross sections every 50 ft',
    'Show linked road profiles',
    'Open Road Links',
  ],
  [AgentType.COGO_AGENT]: [
    'Inverse between two points',
    'Intersect two lines',
    'Open COGO Tools',
  ],
  [AgentType.GNSS_AGENT]: [
    'Upload a RINEX observation file',
    'Open RINEX tools',
    'What RINEX formats are supported?',
  ],
  [AgentType.DRONE_AGENT]: [
    'Open Drone tools',
    'What image overlap do I need?',
    'What outputs are produced?',
  ],
  [AgentType.AR_AGENT]: [
    'Show all points in AR',
    'Which points need stakeout?',
    'Open AR view',
  ],
  [AgentType.ZONING_AGENT]: [
    'Set jurisdiction and research zoning',
    'Look up R-1 setbacks',
    'Open Zoning tools',
  ],
  [AgentType.TITLE_SEARCH]: [
    'Upload or paste a deed',
    'Open Title Search panel',
    'Show the chain of title',
  ],
  [AgentType.CAD_MANAGER]: [
    'Upload a CAD standards file',
    'Open CAD Manager workspace',
    'Show the standards spreadsheet',
    'Open the legend',
  ],
  [AgentType.STANDARDS_COMPLIANCE]: [
    'Upload PDFs for compliance audit',
    'Run compliance now',
    'Open Compliance Summary panel',
  ],
  [AgentType.FLOOD_AGENT]: [
    'Fetch FEMA flood zones',
    'Use the current inclusion boundary',
    'Open Flood Zone tools',
  ],
  [AgentType.STRUCTURES_AGENT]: [
    'Fetch FEMA structures',
    'Rectify building footprints',
    'Open Structures tools',
  ],
  [AgentType.SOILS_AGENT]: [
    'Fetch soils for this area',
    'Show soil limitations',
    'Open Soils tools',
  ],
  [AgentType.DIRT_VOLUME_AGENT]: [
    'Compute cut and fill from my sections',
    'Compare two TIN surfaces',
    'Compare saved volume scenarios',
    'Open Dirt Volume workspace',
  ],
  [AgentType.STORMWATER_AGENT]: [
    'Run a 25-year runoff quick-check',
    'Size a detention basin',
    'Check a channel capacity',
    'Open Stormwater Quick-Check',
  ],
  [AgentType.ROADING_AGENT]: [
    'Synthesize an existing road',
    'Design a new road corridor',
    'Open Roading Studio',
    'Open Road Links',
    'Refresh road profiles & sections',
  ],
  [AgentType.REDLINE_AGENT]: [
    'Upload a marked-up plan package',
    'What did the reviewer ask for?',
    'Show unresolved items',
    'Apply the low-risk text fixes',
    'Summarize this redline run',
  ],
};

export interface AgentInitialQuickThoughtContext {
  /** True when the canvas has no points, linework, centerlines, or boundaries yet. */
  isWorkspaceEmpty?: boolean;
}

export function getAgentInitialQuickThoughtOptions(
  agent: AgentType,
  context: AgentInitialQuickThoughtContext = {},
): string[] {
  // LSAI is the front door to the whole suite. On a blank canvas, lead with the
  // three intake actions instead of project questions that cannot be answered yet.
  if (agent === AgentType.LSVZ_AGENT && context.isWorkspaceEmpty) {
    return ['Upload points', 'Process a deed', 'Upload a PDF'];
  }
  return AGENT_INITIAL_QUICK_THOUGHTS[agent] ?? [];
}

export interface A2UIQuickThoughtCheckboxItem {
  id: string;
  label: string;
  defaultChecked: boolean;
}

export type A2UIQuickThoughtKind =
  | 'options'
  | 'checkboxes'
  | 'input-form'
  | 'upload-widget'
  | 'selection-prompt'
  | 'cad-manager'
  | 'zoning-research'
  | 'zoning-sources'
  | 'settings'
  | 'experimental-agent'
  | 'hatch-studio'
  | 'workspace-tool'
  | 'deed-summary'
  | 'soil-limitations'
  | 'cacp-surface'
  | 'large-dataset';

export interface A2UIQuickThoughtBreakdown {
  hasActionablePrompt: boolean;
  kind: A2UIQuickThoughtKind | null;
  agent: AgentType;
  /** True when the underlying element has too many rows/items/fields for Quick Thought. */
  datasetTooLarge: boolean;
  totalItemCount?: number;
  options?: string[];
  checkboxes?: A2UIQuickThoughtCheckboxItem[];
  inputForm?: A2UIInputFormSpec;
  widgetType?: A2UIWidgetType;
  selectionPrompt?: A2UISelectionPromptSpec;
  a2ui?: A2UIPayload;
}

const QUESTION_OR_CHOICE_CUE_RE =
  /\b(?:let me know|which|choose|select|specify|tell me|would you like|how would you like|pick|prefer|what should)\b/i;

function stripHtmlAndMarkdown(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function cleanOptionText(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;,]$/, '')
    .trim();
}

export const MAX_QUICK_THOUGHT_PREVIEW_CHARS = 140;

function truncateQuickThought(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const clipped = slice.replace(/\s+\S*$/, '').trim();
  return `${(clipped || slice).replace(/[.,;:!?-]+$/, '')}…`;
}

/**
 * Builds the short line shown while the full conversation is closed. Short
 * answers pass through intact; long answers keep only their opening sentence
 * (or the lead-in before a numbered list) so no agent can dump an entire
 * response into the collapsed command bar.
 */
export function deriveQuickThoughtPreview(
  rawText: string | null | undefined,
  explicitText?: string | null,
  maxChars = MAX_QUICK_THOUGHT_PREVIEW_CHARS,
): string {
  const explicit = (explicitText ?? '').replace(/\s+/g, ' ').trim();
  if (explicit) return truncateQuickThought(explicit, maxChars);
  if (!rawText) return '';

  const text = stripHtmlAndMarkdown(rawText)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(^|\s)#{1,6}\s*/g, '$1')
    .replace(/^[ \t]*(?:[-+*])[ \t]+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  if (!text) return '';
  const flattened = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  const sentenceSource = flattened.replace(/(^|\s)\d{1,2}[.)]\s+/g, '$1');
  if (sentenceSource.length <= maxChars) return sentenceSource;

  // A long intro followed by a numbered/structured list is more useful than the
  // first list item: "Here is an overview…: 1. Points…" becomes just the intro.
  const introBeforeList = flattened.match(/^(.{20,180}?):\s*\d+[.)]\s+/)?.[1];
  if (introBeforeList) return truncateQuickThought(introBeforeList, maxChars);

  const firstSentence =
    sentenceSource.match(/^.{1,240}?[.!?](?=\s|$)/)?.[0] ?? sentenceSource;
  return truncateQuickThought(firstSentence, maxChars);
}

/**
 * Extracts markdown task-list checkboxes (`- [ ] ...` or `- [x] ...`) from a
 * model message so they can be toggled directly in Quick Thought.
 */
export function extractInlineCheckboxes(
  rawText: string | null | undefined,
  maxItems = MAX_QUICK_THOUGHT_OPTIONS,
): { items: A2UIQuickThoughtCheckboxItem[]; datasetTooLarge: boolean; totalCount: number } {
  if (!rawText) return { items: [], datasetTooLarge: false, totalCount: 0 };
  const text = stripHtmlAndMarkdown(rawText);
  const items: A2UIQuickThoughtCheckboxItem[] = [];
  const usedIds = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s*\[([ xX])\]\s+(.+)$/);
    if (!match) continue;
    const label = cleanOptionText(match[2]);
    if (!label || label.length > 90) continue;
    const baseId =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'check';
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    items.push({
      id,
      label,
      defaultChecked: match[1].toLowerCase() === 'x',
    });
  }

  if (items.length === 0) {
    return { items: [], datasetTooLarge: false, totalCount: 0 };
  }
  if (items.length > maxItems) {
    return { items: [], datasetTooLarge: true, totalCount: items.length };
  }
  return { items, datasetTooLarge: false, totalCount: items.length };
}

/**
 * Extracts numbered or bulleted choice options from prose when the model asks
 * the user to choose between options without populating `questionOptions`.
 */
export function extractInlineQuestionOptions(
  rawText: string | null | undefined,
  maxOptions = MAX_QUICK_THOUGHT_OPTIONS,
): { options: string[]; datasetTooLarge: boolean; totalCount: number } {
  if (!rawText) return { options: [], datasetTooLarge: false, totalCount: 0 };
  const text = stripHtmlAndMarkdown(rawText);
  if (!QUESTION_OR_CHOICE_CUE_RE.test(text)) {
    return { options: [], datasetTooLarge: false, totalCount: 0 };
  }

  // 1. Check multi-line numbered or bulleted lists
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const numberedLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (m) {
      const cleaned = cleanOptionText(m[2]);
      if (cleaned && cleaned.length <= 90) {
        numberedLines.push(cleaned);
      }
    }
  }

  if (numberedLines.length >= 2) {
    if (numberedLines.length > maxOptions) {
      return { options: [], datasetTooLarge: true, totalCount: numberedLines.length };
    }
    return { options: numberedLines, datasetTooLarge: false, totalCount: numberedLines.length };
  }

  // 2. Check inline single-paragraph numbered choices:
  // e.g. "Please let me know which jurisdiction or parcel you want to query: 1. Boone County, IN 2. Berks County, PA 3. Other County"
  if (/\b1\.\s[\s\S]*\b2\.\s/.test(text)) {
    const inlineMatches = Array.from(
      text.matchAll(/(?:^|\s)(\d{1,2})\.\s+([^\d]+?)(?=(?:\s+\d{1,2}\.\s)|$)/g),
    );
    const extracted = inlineMatches
      .map(m => cleanOptionText(m[2]))
      .filter(opt => opt.length > 0 && opt.length <= 90);
    if (extracted.length >= 2) {
      if (extracted.length > maxOptions) {
        return { options: [], datasetTooLarge: true, totalCount: extracted.length };
      }
      return { options: extracted, datasetTooLarge: false, totalCount: extracted.length };
    }
  }

  return { options: [], datasetTooLarge: false, totalCount: 0 };
}

/**
 * Decomposes a model `ChatMessage` into its Quick Thought representation.
 */
export function decomposeMessageForQuickThought(
  message: ChatMessage | null | undefined,
  activeAgent: AgentType,
): A2UIQuickThoughtBreakdown {
  const empty: A2UIQuickThoughtBreakdown = {
    hasActionablePrompt: false,
    kind: null,
    agent: activeAgent,
    datasetTooLarge: false,
  };

  if (!message || message.role !== MessageRole.MODEL) {
    return empty;
  }

  const a2ui =
    message.a2ui &&
    message.a2ui.status !== 'completed' &&
    message.a2ui.status !== 'dismissed'
      ? message.a2ui
      : undefined;
  const effectiveAgent = a2ui?.agent ?? activeAgent;
  const rawText = message.result || message.text || '';

  // 1. Explicit questionOptions on the message
  if (message.questionOptions && message.questionOptions.length > 0) {
    if (message.questionOptions.length > MAX_QUICK_THOUGHT_OPTIONS) {
      return {
        hasActionablePrompt: true,
        kind: 'large-dataset',
        agent: effectiveAgent,
        datasetTooLarge: true,
        totalItemCount: message.questionOptions.length,
        options: message.questionOptions.slice(0, MAX_QUICK_THOUGHT_OPTIONS),
        a2ui,
      };
    }
    return {
      hasActionablePrompt: true,
      kind: 'options',
      agent: effectiveAgent,
      datasetTooLarge: false,
      totalItemCount: message.questionOptions.length,
      options: message.questionOptions,
      a2ui,
    };
  }

  // 2. Active A2UI surfaces
  if (a2ui) {
    switch (a2ui.kind) {
      case 'upload-widget':
        return {
          hasActionablePrompt: true,
          kind: 'upload-widget',
          agent: effectiveAgent,
          datasetTooLarge: false,
          widgetType: a2ui.widgetType,
          a2ui,
        };

      case 'deed-summary':
        return {
          hasActionablePrompt: true,
          kind: 'deed-summary',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'soil-limitations': {
        const unitCount = a2ui.soilLimitations?.units.length ?? 0;
        return {
          hasActionablePrompt: true,
          kind: 'soil-limitations',
          agent: effectiveAgent,
          datasetTooLarge: unitCount > 3,
          totalItemCount: unitCount,
          a2ui,
        };
      }

      case 'input-form': {
        const form = a2ui.inputForm;
        if (!form || form.fields.length === 0) {
          return {
            hasActionablePrompt: true,
            kind: 'large-dataset',
            agent: effectiveAgent,
            datasetTooLarge: false,
            a2ui,
          };
        }
        if (form.fields.length > MAX_QUICK_THOUGHT_FIELDS) {
          return {
            hasActionablePrompt: true,
            kind: 'input-form',
            agent: effectiveAgent,
            datasetTooLarge: true,
            totalItemCount: form.fields.length,
            inputForm: form,
            a2ui,
          };
        }
        return {
          hasActionablePrompt: true,
          kind: 'input-form',
          agent: effectiveAgent,
          datasetTooLarge: false,
          totalItemCount: form.fields.length,
          inputForm: form,
          a2ui,
        };
      }

      case 'selection-prompt':
        return {
          hasActionablePrompt: true,
          kind: 'selection-prompt',
          agent: effectiveAgent,
          datasetTooLarge: false,
          selectionPrompt: a2ui.selectionPrompt ?? {
            title: 'Select lines and arcs',
            description: 'Select lines and arcs on the canvas to be divided.',
          },
          a2ui,
        };

      case 'cad-manager':
        return {
          hasActionablePrompt: true,
          kind: 'cad-manager',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'zoning-research':
        return {
          hasActionablePrompt: true,
          kind: 'zoning-research',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'zoning-sources':
        return {
          hasActionablePrompt: true,
          kind: 'zoning-sources',
          agent: effectiveAgent,
          datasetTooLarge:
            (a2ui.zoningSources?.sources?.length ?? 0) > MAX_QUICK_THOUGHT_OPTIONS,
          totalItemCount: a2ui.zoningSources?.sources?.length,
          a2ui,
        };

      case 'settings':
        return {
          hasActionablePrompt: true,
          kind: 'settings',
          agent: effectiveAgent,
          datasetTooLarge: a2ui.settingsSection === 'all',
          a2ui,
        };

      case 'experimental-agent':
        return {
          hasActionablePrompt: true,
          kind: 'experimental-agent',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'hatch-studio':
        return {
          hasActionablePrompt: true,
          kind: 'hatch-studio',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'workspace-tool':
        return {
          hasActionablePrompt: true,
          kind: 'workspace-tool',
          agent: effectiveAgent,
          datasetTooLarge: false,
          a2ui,
        };

      case 'cacp-review': {
        const itemCount = a2ui.cacpReview?.items?.length ?? 0;
        return {
          hasActionablePrompt: true,
          kind: 'cacp-surface',
          agent: effectiveAgent,
          datasetTooLarge: itemCount > 3,
          totalItemCount: itemCount,
          a2ui,
        };
      }

      case 'cacp-manifests':
        return {
          hasActionablePrompt: true,
          kind: 'cacp-surface',
          agent: effectiveAgent,
          datasetTooLarge: true,
          a2ui,
        };

      case 'standards-explorer':
        return {
          hasActionablePrompt: true,
          kind: 'large-dataset',
          agent: effectiveAgent,
          datasetTooLarge: true,
          a2ui,
        };

      case 'intake-prompt':
        break;

      default:
        return {
          hasActionablePrompt: true,
          kind: 'large-dataset',
          agent: effectiveAgent,
          datasetTooLarge: true,
          a2ui,
        };
    }
  }

  // 3. Inline checkboxes in the message body (`- [ ] ...`)
  const checkboxExtract = extractInlineCheckboxes(rawText);
  if (checkboxExtract.totalCount > 0) {
    if (checkboxExtract.datasetTooLarge) {
      return {
        hasActionablePrompt: true,
        kind: 'large-dataset',
        agent: effectiveAgent,
        datasetTooLarge: true,
        totalItemCount: checkboxExtract.totalCount,
      };
    }
    return {
      hasActionablePrompt: true,
      kind: 'checkboxes',
      agent: effectiveAgent,
      datasetTooLarge: false,
      totalItemCount: checkboxExtract.totalCount,
      checkboxes: checkboxExtract.items,
    };
  }

  // 4. Derived A2UI input form from numbered parameter requests in prose
  const derivedForm = deriveA2UIInputForm(rawText, { agent: effectiveAgent });
  if (derivedForm && derivedForm.fields.length > 0) {
    const tooLarge = derivedForm.fields.length > MAX_QUICK_THOUGHT_FIELDS;
    return {
      hasActionablePrompt: true,
      kind: 'input-form',
      agent: effectiveAgent,
      datasetTooLarge: tooLarge,
      totalItemCount: derivedForm.fields.length,
      inputForm: derivedForm,
    };
  }

  // 5. Inline numberedchoice options in prose
  const inlineOptions = extractInlineQuestionOptions(rawText);
  if (inlineOptions.totalCount >= 2) {
    if (inlineOptions.datasetTooLarge) {
      return {
        hasActionablePrompt: true,
        kind: 'large-dataset',
        agent: effectiveAgent,
        datasetTooLarge: true,
        totalItemCount: inlineOptions.totalCount,
      };
    }
    return {
      hasActionablePrompt: true,
      kind: 'options',
      agent: effectiveAgent,
      datasetTooLarge: false,
      totalItemCount: inlineOptions.totalCount,
      options: inlineOptions.options,
    };
  }

  // 6. Single missing-value `needsInput` prompt (e.g. from CACP skill)
  if (message.needsInput) {
    const cleanQuestion = stripHtmlAndMarkdown(rawText).split(/\n+/)[0] || 'Enter value';
    const synthesized = buildA2UIInputFormFromNeedsInput(
      { question: cleanQuestion, field: 'answer' },
      { agent: effectiveAgent },
    );
    const fallbackField: A2UIInputField = {
      id: 'answer',
      label: 'Your answer',
      type: 'text',
      required: true,
      placeholder: 'Type value…',
    };
    return {
      hasActionablePrompt: true,
      kind: 'input-form',
      agent: effectiveAgent,
      datasetTooLarge: false,
      totalItemCount: 1,
      inputForm: synthesized ?? {
        title: 'Input needed',
        description: cleanQuestion,
        fields: [fallbackField],
        submitLabel: 'Send to agent',
      },
    };
  }

  return empty;
}

export interface A2UIFollowUpResolution {
  replyText: string;
  questionOptions?: string[];
  needsInput?: boolean;
  inputForm?: A2UIInputFormSpec;
}

/**
 * Intercepts underspecified geometry / COGO commands and Quick-Thought option
 * selections (such as choosing a spiral type after "draw a spiral") so the
 * user is always prompted for exact parameters via Quick Thought and Canvas
 * Flashes instead of the model assuming arbitrary coordinates or dimensions.
 */
export function resolveA2UIFollowUpPrompt(
  query: string,
  activeAgent: AgentType,
): A2UIFollowUpResolution | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^here are the requested values:/i.test(trimmed)) return null;
  if (/^\[(?:cacp|kb recall)/i.test(trimmed)) return null;

  const hasNumericParams = /\b\d+(?:\.\d+)?\s*(?:ft|feet|m|meters|deg|°|turns?|r\s*=|l\s*=|a\s*=|b\s*=)|\b\d+\s*,\s*\d+/i.test(
    trimmed,
  );
  if (hasNumericParams) return null;

  // 1. Generic spiral request -> Step 1: ask which spiral type in Quick Thought
  if (
    /^(?:please\s+|can\s+you\s+|let'?s\s+)?(?:draw|plot|create|generate|construct|compute)\s+(?:a\s+|an\s+|the\s+)?spiral[.!?]*$/i.test(
      trimmed,
    )
  ) {
    return {
      replyText: 'What type of spiral would you like to draw?',
      questionOptions: [
        'Highway / Clothoid Transition Spiral',
        'Archimedean / Geometric Spiral',
        'Logarithmic Spiral',
      ],
    };
  }

  // 2. Logarithmic Spiral selected or requested without parameters -> Step 2: follow-up parameter form
  if (
    /^(?:logarithmic\s+spiral|(?:please\s+|can\s+you\s+)?(?:draw|plot|create|generate|construct)\s+(?:a\s+|an\s+|the\s+)?logarithmic\s+spiral)[.!?]*$/i.test(
      trimmed,
    )
  ) {
    return {
      replyText:
        'What parameters should I use for the <strong>Logarithmic Spiral</strong> (<em>r = a · e<sup>b·θ</sup></em>)?',
      needsInput: true,
      inputForm: {
        title: 'Logarithmic Spiral Parameters',
        description: 'Provide the start/center point, initial radius, growth rate, and sweep angle.',
        submitLabel: 'Draw spiral',
        fields: [
          {
            id: 'start-point',
            label: 'Start / Center (Pt # or E,N)',
            type: 'text',
            placeholder: 'e.g. Pt 1 or 5000, 5000',
            required: true,
          },
          {
            id: 'initial-radius',
            label: 'Initial radius (a)',
            type: 'number',
            unit: 'ft',
            placeholder: '10',
            required: true,
          },
          {
            id: 'growth-rate',
            label: 'Growth rate (b)',
            type: 'number',
            placeholder: '0.15',
            required: true,
          },
          {
            id: 'sweep-angle',
            label: 'Sweep angle',
            type: 'number',
            unit: 'deg',
            placeholder: '360',
            required: true,
          },
          {
            id: 'direction',
            label: 'Direction',
            type: 'select',
            options: ['Counter-clockwise', 'Clockwise'],
          },
        ],
      },
    };
  }

  // 3. Archimedean / Geometric Spiral selected or requested without parameters -> Step 2: follow-up parameter form
  if (
    /^(?:archimedean(?:\s*\/\s*geometric)?\s+spiral|geometric\s+spiral|(?:please\s+|can\s+you\s+)?(?:draw|plot|create|generate|construct)\s+(?:a\s+|an\s+|the\s+)?(?:archimedean|geometric)\s+spiral)[.!?]*$/i.test(
      trimmed,
    )
  ) {
    return {
      replyText:
        'What parameters should I use for the <strong>Archimedean Spiral</strong> (<em>r = a + b·θ</em>)?',
      needsInput: true,
      inputForm: {
        title: 'Archimedean Spiral Parameters',
        description: 'Provide the start/center point, initial radius, turn spacing, and sweep angle.',
        submitLabel: 'Draw spiral',
        fields: [
          {
            id: 'start-point',
            label: 'Start / Center (Pt # or E,N)',
            type: 'text',
            placeholder: 'e.g. Pt 1 or 5000, 5000',
            required: true,
          },
          {
            id: 'initial-radius',
            label: 'Initial radius (a)',
            type: 'number',
            unit: 'ft',
            placeholder: '0',
            required: true,
          },
          {
            id: 'turn-spacing',
            label: 'Spacing per turn',
            type: 'number',
            unit: 'ft',
            placeholder: '25',
            required: true,
          },
          {
            id: 'sweep-angle',
            label: 'Sweep angle',
            type: 'number',
            unit: 'deg',
            placeholder: '360',
            required: true,
          },
          {
            id: 'direction',
            label: 'Direction',
            type: 'select',
            options: ['Counter-clockwise', 'Clockwise'],
          },
        ],
      },
    };
  }

  // 4. Highway / Clothoid Transition Spiral selected or requested without parameters -> Step 2: follow-up parameter form
  if (
    /^(?:highway(?:\s*\/\s*clothoid)?(?:\s+transition)?\s+spiral|clothoid(?:\s+transition)?\s+spiral|transition\s+spiral|euler\s+spiral|(?:please\s+|can\s+you\s+)?(?:draw|plot|create|generate|construct)\s+(?:a\s+|an\s+|the\s+)?(?:highway|clothoid|transition|euler)(?:\s+transition)?\s+spiral)[.!?]*$/i.test(
      trimmed,
    )
  ) {
    return {
      replyText:
        'What parameters should I use for the <strong>Highway / Clothoid Transition Spiral</strong>?',
      needsInput: true,
      inputForm: {
        title: 'Clothoid Spiral Parameters',
        description: 'Provide the TS point, back tangent bearing, spiral length (Ls), and end radius (R).',
        submitLabel: 'Draw spiral',
        fields: [
          {
            id: 'start-point',
            label: 'TS Point (Pt # or E,N)',
            type: 'text',
            placeholder: 'e.g. Pt 1 or 5000, 5000',
            required: true,
          },
          {
            id: 'tangent-bearing',
            label: 'Back tangent bearing',
            type: 'text',
            placeholder: 'N 45°00\'00" E',
            required: true,
          },
          {
            id: 'total-length',
            label: 'Spiral length (Ls)',
            type: 'number',
            unit: 'ft',
            placeholder: '200',
            required: true,
          },
          {
            id: 'end-radius',
            label: 'End radius (R)',
            type: 'number',
            unit: 'ft',
            placeholder: '500',
            required: true,
          },
          {
            id: 'direction',
            label: 'Curve direction',
            type: 'select',
            options: ['Right', 'Left'],
          },
        ],
      },
    };
  }

  void activeAgent;
  return null;
}
