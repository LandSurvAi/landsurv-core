import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react';
import type { A2UIInputFormSpec } from '../types.ts';

interface A2UIInputFormProps {
  form: A2UIInputFormSpec;
  /** Send the completed values back to the agent that requested them. */
  onSubmit?: (message: string) => void;
}

const inputClass =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2.5 py-1.5 text-[11.5px] text-slate-100 placeholder:text-slate-600 outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60';

export const A2UIInputForm: React.FC<A2UIInputFormProps> = ({ form, onSubmit }) => {
  const formId = useId();
  const initialValues = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of form.fields) {
      next[field.id] = field.type === 'select' ? (field.options?.[0] ?? '') : '';
    }
    return next;
  }, [form]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setValues(initialValues);
    setError(null);
    setSubmitted(false);
  }, [initialValues]);

  const updateValue = (id: string, value: string) => {
    setValues(previous => ({ ...previous, [id]: value }));
    setError(null);
    setSubmitted(false);
  };

  const validate = (): string | null => {
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
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSubmit) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSubmitted(false);
      return;
    }

    const lines = form.fields.flatMap(field => {
      const raw = (values[field.id] ?? '').trim();
      if (!raw) return [];
      const value =
        field.type === 'number' && Number.isFinite(Number(raw))
          ? String(Number(raw))
          : raw;
      return [`${field.label}: ${value}${field.unit ? ` ${field.unit}` : ''}`];
    });

    onSubmit(`Here are the requested values:\n${lines.join('\n')}`);
    setError(null);
    setSubmitted(true);
  };

  return (
    <div
      data-testid="a2ui-input-form"
      className="overflow-hidden rounded-lg border border-cyan-500/25 bg-[#08111c]"
    >
      <div className="border-b border-cyan-400/15 bg-cyan-400/[0.055] px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <ListChecks className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-[12px] font-semibold text-slate-100">
              {form.title || 'Inputs needed'}
            </h4>
            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">
              {form.description || 'Fill in the values the agent asked for.'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 p-3 sm:grid-cols-2">
          {form.fields.map((field, index) => {
            const inputId = `${formId}-${field.id}`;
            const hintId = field.hint ? `${inputId}-hint` : undefined;
            const showGroup =
              Boolean(field.group) && field.group !== form.fields[index - 1]?.group;
            const fieldValue = values[field.id] ?? '';

            return (
              <React.Fragment key={field.id}>
                {showGroup && (
                  <div className="col-span-full mt-0.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300/75">
                    <span>{field.group}</span>
                    <span className="h-px flex-1 bg-white/[0.07]" />
                  </div>
                )}

                <div className={field.span === 2 ? 'sm:col-span-2' : undefined}>
                  <label
                    htmlFor={inputId}
                    className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-slate-400"
                  >
                    {field.label}
                    {field.required && (
                      <span aria-hidden="true" className="text-cyan-300">
                        *
                      </span>
                    )}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      id={inputId}
                      value={fieldValue}
                      onChange={event => updateValue(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      aria-describedby={hintId}
                      rows={2}
                      spellCheck={false}
                      className={`${inputClass} resize-y`}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={inputId}
                      value={fieldValue}
                      onChange={event => updateValue(field.id, event.target.value)}
                      aria-describedby={hintId}
                      className={`${inputClass} appearance-none`}
                    >
                      {(field.options ?? []).map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <input
                        id={inputId}
                        type={field.type === 'number' ? 'number' : 'text'}
                        inputMode={field.type === 'number' ? 'decimal' : undefined}
                        step={field.type === 'number' ? 'any' : undefined}
                        value={fieldValue}
                        onChange={event => updateValue(field.id, event.target.value)}
                        placeholder={field.placeholder}
                        aria-describedby={hintId}
                        aria-required={field.required || undefined}
                        autoComplete="off"
                        spellCheck={false}
                        className={`${inputClass} ${field.unit ? 'pr-10' : ''}`}
                      />
                      {field.unit && (
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {field.unit}
                        </span>
                      )}
                    </div>
                  )}

                  {field.hint && (
                    <p id={hintId} className="mt-1 text-[9.5px] leading-snug text-slate-500">
                      {field.hint}
                    </p>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {error && (
            <div
              role="alert"
              className="col-span-full rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200"
            >
              {error}
            </div>
          )}

          {submitted && (
            <div
              role="status"
              className="col-span-full flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] text-emerald-200"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Values sent. The agent will continue in the conversation.
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] bg-black/10 px-3 py-2">
          <p className="text-[9.5px] leading-snug text-slate-500">
            These values go straight back to the agent — no retyping in chat.
          </p>
          <button
            type="submit"
            disabled={!onSubmit}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-400/15 px-2.5 py-1 text-[10.5px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {submitted ? 'Send updated values' : form.submitLabel || 'Send values'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default A2UIInputForm;
