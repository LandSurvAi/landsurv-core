// A2UI input forms
// ---------------------------------------------------------------------------
// Agents frequently answer a request by listing the values they need in prose
// ("Please provide the following … 1. Starting point 2. Direction …"). That
// leaves the user to retype structured data into chat. This module turns those
// requests into a typed form spec that A2UIInputForm can render.
//
// The parser is intentionally conservative: it only creates a form when the
// response contains an explicit input-request cue AND at least one numbered
// parameter. Plain answers and numbered result lists are left alone.

import { AgentType } from '../types';
import type { A2UIInputField, A2UIInputFieldType, A2UIInputFormSpec } from '../types';

export interface A2UIInputFormOptions {
  agent?: AgentType;
}

interface ParsedSection {
  title: string;
  body: string;
}

const REQUEST_CUES: RegExp[] = [
  /\bplease\s+(?:provide|give|enter|specify|share|supply|confirm)\b/i,
  /\bprovide\s+the\s+following\b/i,
  /\b(?:i|we)\s+(?:need|require)\s+(?:the\s+following|these|a few|some|your)\b/i,
  /\b(?:missing|required)\s+(?:input|inputs|field|fields|value|values|parameter|parameters)\b/i,
  /\b(?:to|before)\s+(?:run|running|complete|completing|perform|performing|calculate|calculating|proceed|continue)\b[^.\n]{0,180}\b(?:provide|need|require|specify|give|enter)\b/i,
  /\bonce\s+(?:provided|entered|supplied|received)\b/i,
  /\b(?:fill|complete)\s+(?:in\s+)?(?:the\s+)?(?:following|form|fields|inputs)\b/i,
  /\bask me for (?:any )?missing\b/i,
];

function clean(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHeading(value: string): string {
  return clean(value)
    .replace(/^[-–—•]\s*/, '')
    .replace(/[:\-–—]\s*$/, '')
    .trim();
}

function parseSections(raw: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let inFence = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    if (/^\s*```/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const line = clean(rawLine.replace(/^>\s?/, ''));
    if (!line) continue;

    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numbered) {
      current = { title: cleanHeading(numbered[2]), body: '' };
      sections.push(current);
      continue;
    }

    if (!current) continue;
    // Closing prose after the parameter list is not part of the last field.
    if (/^(?:once|after that|when provided|note\b|disclaimer\b|the rest\b|i will\b|i'll\b|then i\b)/i.test(line)) {
      current = null;
      continue;
    }
    current.body += `${current.body ? ' ' : ''}${line.replace(/^[-–—•]\s*/, '')}`;
  }

  return sections.filter(section => section.title.length > 0);
}

function hasRequestCue(raw: string): boolean {
  return REQUEST_CUES.some(cue => cue.test(raw));
}

function isOptional(title: string, body: string): boolean {
  return /\b(?:optional|if available|if known|if applicable|not required)\b/i.test(`${title} ${body}`);
}

function inferFieldType(label: string, body = ''): A2UIInputFieldType {
  const lowerLabel = label.toLowerCase();
  const lowerText = `${label} ${body}`.toLowerCase();

  if (
    /\b(distance|length|radius|northing|easting|elevation|station|angle|degrees?|delta|height|width|area|count|number of|quantity)\b/.test(lowerLabel) &&
    !/\bpoint number\b/.test(lowerText)
  ) {
    return 'number';
  }
  if (/\b(description|notes?|details?|comments?|instructions?|legs?|calls?|vertices|polygon|boundary|traverse|points?|list)\b/.test(lowerLabel)) {
    return 'textarea';
  }
  return 'text';
}

function bodyHint(body: string, maxLength = 160): string | undefined {
  const hint = clean(body).replace(/\s*\bOR\s*$/i, '').trim();
  if (!hint) return undefined;
  return hint.length > maxLength ? `${hint.slice(0, maxLength - 1).trimEnd()}…` : hint;
}

function exampleFrom(body: string): string | undefined {
  const match = body.match(/(?:e\.g\.,?|for example,?)\s*([^;.)]+)/i);
  if (!match?.[1]) return undefined;
  const example = clean(match[1]).replace(/^[("'`]+|[)"'`]+$/g, '').trim();
  return example ? example.slice(0, 60) : undefined;
}

function uniqueId(label: string, used: Set<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'field';
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

/** Preserve a skill-supplied field id so requireOneOf references keep working. */
function explicitId(value: string, used: Set<string>): string {
  const base = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'field';
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function optionsFromBody(body: string): string[] {
  const match = body.match(/\b(?:choose|select|one of|either)\s+(.+?)(?:\.|$)/i);
  if (!match?.[1]) return [];

  const parts = match[1]
    .replace(/\s*,\s*(?:or|and)\s+/gi, ', ')
    .replace(/\s+(?:or|and)\s+/gi, ', ')
    .split(',')
    .map(part => clean(part).replace(/[.;:]$/, ''))
    .filter(part => part.length > 0 && part.length <= 48);

  return parts.length >= 2 && parts.length <= 6 ? parts : [];
}

function fieldLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, char => char.toUpperCase()) || 'Answer';
}

function readOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const label =
        typeof record.label === 'string'
          ? record.label
          : typeof record.value === 'string'
            ? record.value
            : '';
      if (label.trim()) out.push(label.trim());
    }
  }
  return out;
}

function coerceFieldType(value: unknown, options: string[], label: string): A2UIInputFieldType {
  if (options.length > 0) return 'select';
  if (value === 'text' || value === 'number' || value === 'textarea' || value === 'select') {
    return value;
  }
  return inferFieldType(label);
}

function readInputFields(value: unknown, used: Set<string>): A2UIInputField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as Record<string, unknown>;
    const label =
      typeof record.label === 'string' && record.label.trim()
        ? clean(record.label)
        : `Field ${index + 1}`;
    const options = readOptions(record.options);
    const type = coerceFieldType(record.type, options, label);
    const field: A2UIInputField = {
      id: typeof record.id === 'string' && record.id.trim()
        ? explicitId(record.id, used)
        : uniqueId(label, used),
      label,
      type,
      placeholder: typeof record.placeholder === 'string' ? record.placeholder : undefined,
      hint: typeof record.hint === 'string' ? clean(record.hint) : undefined,
      required: record.required === true,
      options: options.length > 0 ? options : undefined,
      group:
        typeof record.group === 'string' && record.group.trim()
          ? clean(record.group)
          : undefined,
      unit:
        typeof record.unit === 'string' && record.unit.trim()
          ? clean(record.unit)
          : undefined,
      span: record.span === 2 ? 2 : undefined,
    };
    return [field];
  });
}

function deriveTitle(raw: string, agent?: AgentType): string {
  const task = raw.match(
    /\bTo\s+(?:run|complete|perform|calculate|proceed with)\s+(?:the\s+)?([^.\n,]+)/i,
  );
  if (task?.[1]) {
    const title = cleanHeading(task[1])
      .replace(/\s*\(\s*[a-z0-9_]+\s*\)\s*$/i, '')
      .trim();
    if (title) {
      return title.length > 72 ? `${title.slice(0, 71).trimEnd()}…` : title;
    }
  }
  if (agent === AgentType.COGO_AGENT) return 'COGO calculation inputs';
  return 'Inputs needed to continue';
}

function looksLikeCogoRequest(
  raw: string,
  sections: ParsedSection[],
  agent?: AgentType,
): boolean {
  const titleBlob = sections.map(section => section.title).join(' ');
  const mentionsCogo = agent === AgentType.COGO_AGENT || /\b(?:cogo|direct calculation|inverse calculation)\b/i.test(raw);
  return (
    mentionsCogo &&
    /\b(?:start(?:ing)? point|point of beginning|pob|from point)\b/i.test(titleBlob) &&
    /\b(?:direction|azimuth|bearing)\b/i.test(titleBlob) &&
    /\b(?:distance|length)\b/i.test(titleBlob)
  );
}

function genericFieldDraft(
  section: ParsedSection,
  label = cleanHeading(section.title) || 'Value',
): Omit<A2UIInputField, 'id'> {
  const optional = isOptional(section.title, section.body);
  const normalizedLabel =
    label.replace(/\s*\(?\boptional\b\)?\s*$/i, '').trim() || 'Value';
  const inferred = inferFieldType(normalizedLabel, section.body);
  const options = inferred === 'text' ? optionsFromBody(section.body) : [];
  const type = options.length > 0 ? 'select' : inferred;

  return {
    label: normalizedLabel,
    type,
    required: !optional,
    options: options.length > 0 ? options : undefined,
    placeholder: options.length > 0 ? undefined : exampleFrom(section.body),
    hint: bodyHint(section.body),
    span: type === 'textarea' ? 2 : undefined,
  };
}

function buildCogoForm(
  raw: string,
  sections: ParsedSection[],
  agent?: AgentType,
): A2UIInputFormSpec {
  const fields: A2UIInputField[] = [];
  const used = new Set<string>();
  const requireOneOf: string[][] = [];

  const add = (draft: Omit<A2UIInputField, 'id'>): string => {
    const id = uniqueId(draft.label, used);
    fields.push({ ...draft, id });
    return id;
  };

  for (const section of sections) {
    const title = section.title.toLowerCase();
    const body = section.body;

    if (/\b(?:start(?:ing)?(?:\s+point)?|point of beginning|\bpob\b|from point)\b/.test(title)) {
      const pointIds: string[] = [];
      const coordinateIds: string[] = [];
      const hasPoint = /\bpoint\s*(?:number|no\.?|#)|\bpn\b/i.test(body);
      const hasCoordinates = /\bcoordinates?\b|\bnorthing\b|\beasting\b/i.test(body);

      if (hasPoint || !hasCoordinates) {
        pointIds.push(add({
          label: 'Point number',
          type: 'text',
          placeholder: 'e.g. 101',
          hint: 'Use an existing project point',
          group: 'Starting point',
          required: !hasCoordinates,
        }));
      }

      if (hasCoordinates) {
        coordinateIds.push(add({
          label: 'Northing',
          type: 'number',
          placeholder: 'e.g. 5000.00',
          group: 'Or enter coordinates',
        }));
        coordinateIds.push(add({
          label: 'Easting',
          type: 'number',
          placeholder: 'e.g. 5000.00',
          group: 'Or enter coordinates',
        }));
        add({
          label: 'Elevation',
          type: 'number',
          placeholder: 'optional',
          group: 'Or enter coordinates',
        });
      }

      if (pointIds.length > 0 && coordinateIds.length > 0) {
        requireOneOf.push(pointIds, coordinateIds);
      } else if (pointIds.length > 0 || coordinateIds.length > 0) {
        requireOneOf.push(pointIds.length > 0 ? pointIds : coordinateIds);
      }
      continue;
    }

    if (/\b(?:direction|azimuth|bearing|angle)\b/.test(title)) {
      const hasFormats = /\bbearing\b/i.test(body) && /\bazimuth\b/i.test(body);
      const label = /\bazimuth\b/.test(title)
        ? 'Azimuth'
        : /\bbearing\b/.test(title)
          ? 'Bearing'
          : 'Direction';

      if (hasFormats) {
        add({
          label: 'Direction format',
          type: 'select',
          options: [
            'Quadrant bearing',
            'Azimuth (decimal degrees)',
            'Azimuth (DMS)',
            'Radians',
          ],
          group: 'Direction',
          required: true,
        });
      }

      add({
        label,
        type: 'text',
        placeholder: hasFormats ? 'N 45°00\'00" E' : 'e.g. 135°30\'00"',
        hint: bodyHint(body),
        group: 'Direction',
        required: true,
        span: 2,
      });
      continue;
    }

    if (/\b(?:distance|length)\b/.test(title)) {
      add({
        label: /horizontal/i.test(section.title)
          ? 'Horizontal distance'
          : cleanHeading(section.title),
        type: 'number',
        placeholder: '100.00',
        hint: bodyHint(body),
        required: !isOptional(section.title, body),
        group: 'Distance',
      });
      continue;
    }

    if (/\b(?:destination|target|new point|result|assign)\b/.test(title)) {
      add({
        label: 'Target point number',
        type: 'text',
        placeholder: 'e.g. 102',
        hint: 'Optional point number for the result',
        group: 'Destination (optional)',
      });
      add({
        label: 'Description',
        type: 'text',
        placeholder: 'e.g. IP SET, CALC',
        group: 'Destination (optional)',
      });
      continue;
    }

    add(genericFieldDraft(section));
  }

  return {
    title: deriveTitle(raw, agent),
    description: 'Fill in the values below. Use a point number or explicit coordinates where offered.',
    fields,
    submitLabel: 'Run calculation',
    requireOneOf: requireOneOf.length > 0 ? requireOneOf : undefined,
  };
}

function buildGenericForm(
  raw: string,
  sections: ParsedSection[],
  agent?: AgentType,
): A2UIInputFormSpec | null {
  if (sections.length === 0) return null;
  const used = new Set<string>();
  const fields = sections.map(section => {
    const draft = genericFieldDraft(section);
    return { ...draft, id: uniqueId(draft.label, used) };
  });

  return {
    title: deriveTitle(raw, agent),
    description: 'Fill in the values the agent asked for. Required fields are marked *.',
    fields,
    submitLabel: 'Send values',
  };
}

/**
 * Build a form from a model response that explicitly asks for parameters.
 * Returns null for ordinary answers, result tables, and prose without a clear
 * input-request cue.
 */
export function deriveA2UIInputForm(
  raw: string | null | undefined,
  options: A2UIInputFormOptions = {},
): A2UIInputFormSpec | null {
  if (!raw || raw.trim().length < 12) return null;
  if (!hasRequestCue(raw)) return null;

  const sections = parseSections(raw);
  if (sections.length === 0) return null;
  if (looksLikeCogoRequest(raw, sections, options.agent)) {
    return buildCogoForm(raw, sections, options.agent);
  }
  return buildGenericForm(raw, sections, options.agent);
}

/**
 * Convert the structured `needsInput` payload returned by a CACP skill into a
 * one-field (or multi-field) A2UI form.
 */
export function buildA2UIInputFormFromNeedsInput(
  input: unknown,
  options: { title?: string; agent?: AgentType } = {},
): A2UIInputFormSpec | null {
  if (!input || typeof input !== 'object') return null;

  const record = input as Record<string, unknown>;
  const question = typeof record.question === 'string' ? clean(record.question) : '';
  if (!question) return null;

  const used = new Set<string>();
  let fields = readInputFields(record.fields, used);

  if (fields.length === 0) {
    const fieldName =
      typeof record.field === 'string' && record.field.trim()
        ? record.field.trim()
        : 'answer';
    const hint = typeof record.hint === 'string' ? clean(record.hint) : '';
    const optionsList = readOptions(record.options);
    const label = fieldLabel(fieldName);
    const type = optionsList.length > 0 ? 'select' : inferFieldType(label, hint);

    fields = [{
      id: uniqueId(fieldName, used),
      label,
      type,
      required: true,
      options: optionsList.length > 0 ? optionsList : undefined,
      hint: hint || undefined,
      placeholder: optionsList.length > 0 ? undefined : exampleFrom(hint),
      span: type === 'textarea' ? 2 : undefined,
    }];
  }

  const requireOneOf = Array.isArray(record.requireOneOf)
    ? record.requireOneOf
        .filter((group): group is unknown[] => Array.isArray(group))
        .map(group => group.filter((id): id is string => typeof id === 'string'))
        .filter(group => group.length > 0)
    : [];

  return {
    title: options.title ?? 'Input needed',
    description: question,
    fields,
    submitLabel: 'Send to agent',
    requireOneOf: requireOneOf.length > 0 ? requireOneOf : undefined,
  };
}
