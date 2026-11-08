import { parseLabelAllRequest, type LabelAllRequest } from '../services/annotationStudio.ts';
import { parseAnnotationStyleCommand, type AnnotationStyleCommand } from './annotationStyleCommand.ts';

/**
 * Deterministic app-level chat commands.
 *
 * Some requests are actions, not questions. If "open settings" is sent to the
 * model, it answers with directions to the gear icon instead of opening the
 * dialog. These command-shaped phrases run locally before any API call, so the
 * UI action is guaranteed and does not depend on model behavior.
 *
 * Matching is intentionally anchored to the whole message: "open settings"
 * acts, while "where are settings?" or "open settings for point labels" still
 * flow to the agent.
 */

export type LocalChatCommand =
  | { action: 'open-settings'; replyText: string }
  | { action: 'label-all'; replyText: string; request: LabelAllRequest }
  | { action: 'style-annotations'; replyText: string; command: AnnotationStyleCommand }
  | { action: 'get-firmette'; replyText: string }
  | { action: 'get-soils-report'; replyText: string }
  | { action: 'show-soil-limitations'; replyText: string }
  | { action: 'get-soil-limitations-report'; replyText: string };

const SETTINGS_NOUN =
  '(?:(?:the|my|project)\\s+){0,2}settings?(?:\\s+(?:window|dialog|panel|page|tab))?';

const SETTINGS_COMMAND_RE = new RegExp(
  `^(?:please\\s+)?(?:(?:open|show|bring\\s+up|pull\\s+up|launch|display)\\s+(?:me\\s+)?${SETTINGS_NOUN}|${SETTINGS_NOUN})$`,
  'i',
);

const FIRMETTE_NOUN =
  '(?:firmette|firm\\s*ette|flood\\s*map|firm\\s*map|flood\\s*insurance\\s*rate\\s*map)';
const FIRMETTE_COMMAND_RE = new RegExp(
  `^(?:please\\s+)?(?:(?:get|fetch|download|pull|grab|obtain|show|open|bring\\s+up)\\s+(?:me\\s+)?(?:the\\s+|a\\s+|my\\s+)?(?:fema\\s+)?${FIRMETTE_NOUN}|firmette)` +
  `(?:\\s+(?:pdf|as\\s+a\\s+pdf|for\\s+(?:this|my|the)\\s+(?:project|site|area)))*$`,
  'i',
);

const SOILS_REPORT_COMMAND_RE = new RegExp(
  '^(?:please\\s+)?(?:get|fetch|download|pull|grab|obtain|run|generate|build|produce)\\s+' +
  '(?:me\\s+)?(?:the\\s+|a\\s+|my\\s+)?(?:usda\\s+|nrcs\\s+|ssurgo\\s+)?soil(?:s)?\\s+report(?:s)?' +
  '(?:\\s+for\\s+(?:all\\s+)?(?:the\\s+)?map\\s+units)?(?:\\s+(?:as\\s+a\\s+)?pdf)?$',
  'i',
);

const SOIL_LIMITATIONS_REPORT_COMMAND_RE = new RegExp(
  '^(?:please\\s+)?(?:get|fetch|download|pull|grab|obtain|run|generate|build|produce|compile)\\s+' +
  '(?:me\\s+)?(?:the\\s+|a\\s+|my\\s+)?(?:(?:pa|pennsylvania|e&s|erosion\\s+and\\s+sediment)\\s+)*' +
  '(?:soil|soils)\\s+limitations?\\s+report(?:s)?' +
  '(?:\\s+(?:for|on)\\s+(?:this|the|my)\\s+(?:project|site|area|boundary))?' +
  '(?:\\s+(?:as\\s+a\\s+)?pdf)?$',
  'i',
);

const SOIL_LIMITATIONS_NOUN =
  '(?:(?:pa|pennsylvania|e&s|erosion\\s+and\\s+sediment)\\s+)*' +
  '(?:soil|soils)\\s+limitations?(?:\\s+report(?:s)?)?';

/** View the compiled report inline through A2UI instead of downloading a PDF. */
const SHOW_SOIL_LIMITATIONS_COMMAND_RE = new RegExp(
  '^(?:please\\s+)?(?:show|display|view|see|open|bring\\s+up)\\s+(?:me\\s+)?(?:the\\s+|a\\s+|my\\s+)?' +
  `${SOIL_LIMITATIONS_NOUN}` +
  '(?:\\s+(?:for|on)\\s+(?:this|the|my)\\s+(?:project|site|area|boundary|inclusion(?:\\s+area)?))?$',
  'i',
);

/**
 * Parse a raw chat message into a local app command, or null when the message
 * should continue through the normal agent pipeline.
 */
export function parseLocalChatCommand(raw: string): LocalChatCommand | null {
  if (!raw || raw.trim().length === 0) return null;

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ');

  if (SETTINGS_COMMAND_RE.test(normalized)) {
    return {
      action: 'open-settings',
      replyText: 'Here are your **Project Settings**. Open fullscreen to edit them.',
    };
  }

  // "Label all inverts", "annotate every utility pole", … run locally so the
  // labels appear instantly and use the annotation manager's styles/rules.
  const labelRequest = parseLabelAllRequest(raw);
  if (labelRequest) {
    return {
      action: 'label-all',
      request: labelRequest,
      replyText: `Labeling all ${labelRequest.label} on the canvas…`,
    };
  }

  // Natural annotation styling is deterministic so "Adjust all FEMA text to
  // L80" never depends on a model round-trip.
  const annotationStyle = parseAnnotationStyleCommand(raw);
  if (annotationStyle) {
    return {
      action: 'style-annotations',
      command: annotationStyle,
      replyText: 'Applying annotation style…',
    };
  }

  if (FIRMETTE_COMMAND_RE.test(normalized)) {
    return {
      action: 'get-firmette',
      replyText: 'Fetching the FEMA FIRMETTE and downloading the PDF…',
    };
  }

  if (SHOW_SOIL_LIMITATIONS_COMMAND_RE.test(normalized)) {
    return {
      action: 'show-soil-limitations',
      replyText: 'Compiling the PA E&S Table E.1 soil limitations report…',
    };
  }

  if (SOIL_LIMITATIONS_REPORT_COMMAND_RE.test(normalized)) {
    return {
      action: 'get-soil-limitations-report',
      replyText: 'Compiling the PA E&S Table E.1 soil limitations report and downloading the PDF…',
    };
  }

  if (SOILS_REPORT_COMMAND_RE.test(normalized)) {
    return {
      action: 'get-soils-report',
      replyText: 'Fetching the USDA SSURGO soil report and downloading the PDF…',
    };
  }

  return null;
}
