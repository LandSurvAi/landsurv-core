import type { A2UIInputFormSpec } from '../types.ts';

/**
 * The subset of an input-form spec needed to collect and submit values. The
 * full A2UI form and the tiny cursor-anchored surface both render this shape,
 * so validation and the message handed back to the agent cannot drift apart.
 */
export type A2UIInputFormLike = Pick<A2UIInputFormSpec, 'fields' | 'requireOneOf'>;

export function buildA2UIInputInitialValues(form: A2UIInputFormLike): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.type === 'checkbox') {
      next[field.id] = field.defaultChecked ? 'true' : 'false';
    } else {
      next[field.id] = field.type === 'select' ? (field.options?.[0] ?? '') : '';
    }
  }
  return next;
}

export function validateA2UIInputValues(
  form: A2UIInputFormLike,
  values: Record<string, string>,
): string | null {
  for (const field of form.fields) {
    const value = (values[field.id] ?? '').trim();
    if (field.required && !value) {
      return `${field.label} is required.`;
    }
    if (value && field.type === 'number' && !Number.isFinite(Number(value))) {
      return `${field.label} must be a number.`;
    }
  }

  if (form.requireOneOf && form.requireOneOf.length > 0) {
    const satisfied = form.requireOneOf.some(group =>
      group.every(id => (values[id] ?? '').trim().length > 0),
    );
    if (!satisfied) {
      const choices = form.requireOneOf.map(group =>
        group
          .map(id => form.fields.find(field => field.id === id)?.label ?? id)
          .join(' + '),
      );
      return `Provide ${choices.join(' or ')}.`;
    }
  }

  return null;
}

export function buildA2UIInputSubmission(
  form: A2UIInputFormLike,
  values: Record<string, string>,
): string {
  const lines = form.fields.flatMap(field => {
    const raw = (values[field.id] ?? '').trim();
    if (field.type === 'checkbox') {
      return [`${field.label}: ${raw === 'true' ? 'Yes' : 'No'}`];
    }
    if (!raw) return [];
    const value =
      field.type === 'number' && Number.isFinite(Number(raw))
        ? String(Number(raw))
        : raw;
    return [`${field.label}: ${value}${field.unit ? ` ${field.unit}` : ''}`];
  });

  return `Here are the requested values:\n${lines.join('\n')}`;
}
