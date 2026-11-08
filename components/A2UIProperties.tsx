import React, { useMemo } from 'react';
import { Copy, Layers3, Type } from 'lucide-react';
import type { A2UIPropertiesSpec, A2UIPropertyField } from '../types.ts';

const formatValue = (field: A2UIPropertyField): string => {
  if (field.mixed) return '(mixed)';
  if (field.value === null || field.value === undefined || field.value === '') return '—';
  if (typeof field.value === 'boolean') return field.value ? 'Yes' : 'No';
  return `${field.value}${field.unit ? ` ${field.unit}` : ''}`;
};

/**
 * Read-only A2UI property inspector. It consumes the same canonical schema as
 * the canvas Properties panel, so an agent can reason about exact field ids and
 * values without scraping the DOM.
 */
export const A2UIProperties: React.FC<{ spec: A2UIPropertiesSpec }> = ({ spec }) => {
  const groups = useMemo(() => {
    const result = new Map<string, A2UIPropertyField[]>();
    for (const field of spec.fields) {
      const key = field.group ?? 'Properties';
      const list = result.get(key) ?? [];
      list.push(field);
      result.set(key, list);
    }
    return Array.from(result.entries());
  }, [spec.fields]);

  const copySchema = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    } catch {
      // Clipboard access can be unavailable in embedded webviews.
    }
  };

  return (
    <div data-testid="a2ui-properties" className="space-y-3 p-3 text-xs text-slate-200">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <Layers3 className="h-3 w-3" />
            A2UI Properties
          </div>
          <div className="mt-1 font-semibold text-white">
            {spec.title ?? 'Selected object properties'}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {spec.objectCount === 0
              ? 'No objects selected'
              : `${spec.objectCount} object${spec.objectCount === 1 ? '' : 's'} · ${spec.objectTypes.join(' + ')}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void copySchema()}
          className="shrink-0 rounded border border-white/15 p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          title="Copy property schema as JSON"
          aria-label="Copy property schema as JSON"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      {spec.description && (
        <p className="text-[10px] leading-relaxed text-slate-400">{spec.description}</p>
      )}

      {groups.map(([group, fields]) => (
        <section key={group} className="overflow-hidden rounded-lg border border-white/10">
          <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
            {group === 'Text' || group === 'Wipeout' ? <Type className="h-3 w-3" /> : <Layers3 className="h-3 w-3" />}
            {group}
          </div>
          <dl className="divide-y divide-white/5">
            {fields.map(field => (
              <div key={field.key} className="grid grid-cols-[minmax(7rem,0.8fr),1fr] gap-2 px-2.5 py-1.5">
                <dt className="truncate text-[10px] text-slate-400" title={field.label}>{field.label}</dt>
                <dd className={`truncate text-right font-mono text-[10px] ${field.mixed ? 'text-amber-300' : 'text-slate-100'}`}>
                  {formatValue(field)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {spec.fields.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[11px] text-slate-400">
          Select linework or text on the canvas to inspect its properties.
        </p>
      )}
    </div>
  );
};

export default A2UIProperties;
