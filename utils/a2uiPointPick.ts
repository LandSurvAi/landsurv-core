import type { A2UIInputField, A2UIInputFormSpec } from '../types.ts';

/** A snapped canvas pick returned to an A2UI point/coordinate input. */
export interface A2UIPointPickResult {
  northing: number;
  easting: number;
  /** Survey point number when the pick landed on a project point. */
  pointNumber?: string;
}

export interface A2UIPointPickTargets {
  /** One field accepts both forms: "N, E" or a point number. */
  combinedFieldId?: string;
  northingFieldId?: string;
  eastingFieldId?: string;
  pointNumberFieldId?: string;
}

const normalizeFieldToken = (value: string): string =>
  value.replace(/[^a-z0-9]+/gi, '').toLowerCase();

const matchesFieldToken = (field: A2UIInputField, pattern: RegExp): boolean =>
  pattern.test(normalizeFieldToken(field.label)) || pattern.test(normalizeFieldToken(field.id));

const isNorthingField = (field: A2UIInputField): boolean =>
  matchesFieldToken(field, /^(?:northing|north|n|ycoordinate|ycoord|northingft|northingfeet)$/);

const isEastingField = (field: A2UIInputField): boolean =>
  matchesFieldToken(field, /^(?:easting|east|e|xcoordinate|xcoord|eastingft|eastingfeet)$/);

const isPointNumberField = (field: A2UIInputField): boolean =>
  matchesFieldToken(field, /^(?:pointnumber|pointno|pointid|ptnumber|ptno|ptid|pn)$/);

/** A bare "Point" / "PT #" label is a point number when coordinates have their own fields. */
const isShortPointNumberField = (field: A2UIInputField): boolean =>
  matchesFieldToken(field, /^(?:point|pt|pn)$/);

const isCoordinateField = (value: string): boolean =>
  /\b(?:coordinates?|northing|easting)\b/i.test(value);

const isPickableField = (field: A2UIInputField): boolean =>
  field.type !== 'checkbox' && field.type !== 'select';

/**
 * Find the fields a canvas point pick can fill. Returns null when the form has
 * no meaningful point target (for example, a radius-only parameter form).
 */
export function findA2UIPointPickTargets(form: A2UIInputFormSpec): A2UIPointPickTargets | null {
  const fields = form.fields.filter(isPickableField);
  const northingField = fields.find(isNorthingField);
  const eastingField = fields.find(isEastingField);
  const hasCoordinatePair = Boolean(northingField && eastingField);
  const pointNumberField =
    fields.find(isPointNumberField) ??
    (hasCoordinatePair ? fields.find(isShortPointNumberField) : undefined);
  const remaining = fields.filter(
    field => field !== northingField && field !== eastingField && field !== pointNumberField,
  );
  const combinedField =
    remaining.find(field => isCoordinateField(field.label) && isCoordinateField(field.id)) ??
    remaining.find(field => isCoordinateField(field.label)) ??
    remaining.find(field => /^(?:point|pt)$/i.test(field.label.trim())) ??
    remaining.find(field => /^(?:point|pt)$/i.test(field.id));

  if (!combinedField && !hasCoordinatePair && !pointNumberField) return null;

  return {
    combinedFieldId: combinedField?.id,
    northingFieldId: hasCoordinatePair ? northingField?.id : undefined,
    eastingFieldId: hasCoordinatePair ? eastingField?.id : undefined,
    pointNumberFieldId: pointNumberField?.id,
  };
}

const formatCoordinate = (value: number): string => String(Number(value.toFixed(3)));

/** Fill the recognized point fields with the picked point without touching the rest. */
export function applyA2UIPointPickResult(
  targets: A2UIPointPickTargets,
  values: Record<string, string>,
  pick: A2UIPointPickResult,
): Record<string, string> {
  const next = { ...values };
  if (targets.northingFieldId && targets.eastingFieldId) {
    next[targets.northingFieldId] = formatCoordinate(pick.northing);
    next[targets.eastingFieldId] = formatCoordinate(pick.easting);
  }
  if (targets.pointNumberFieldId && pick.pointNumber) {
    next[targets.pointNumberFieldId] = pick.pointNumber;
  }
  if (targets.combinedFieldId) {
    next[targets.combinedFieldId] = pick.pointNumber
      ? `Pt ${pick.pointNumber}`
      : `${formatCoordinate(pick.northing)}, ${formatCoordinate(pick.easting)}`;
  }
  return next;
}

export function describeA2UIPointPickResult(pick: A2UIPointPickResult): string {
  const point = pick.pointNumber ? ` · Pt ${pick.pointNumber}` : '';
  return `N ${pick.northing.toFixed(2)}, E ${pick.easting.toFixed(2)}${point}`;
}
