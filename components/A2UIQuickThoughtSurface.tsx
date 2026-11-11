import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  SettingsContext,
  type A2UIInputFormSpec,
  type A2UISurfaceSize,
  type ChatMessage,
  type ComplianceSourceMode,
  type SessionFile,
  type StandardsComplianceCheckId,
  type StandardsComplianceCheckSelection,
  type SurveyPoint,
} from '../types.ts';
import type { LinearUnit } from '../utils/linearUnits.ts';
import { LINEAR_UNIT_OPTIONS } from '../utils/linearUnits.ts';
import {
  getGpuPowerPreference,
  isWebGpuEnabled,
  WEBGPU_ENABLED_KEY,
  WEBGPU_POWER_KEY,
  WEBGPU_PREF_EVENT,
  type GpuPowerPreference,
} from '../utils/webgpuBasemap.ts';
import { A2UIHostContext, WORKSPACE_TOOL_LABELS } from './A2UISurface.tsx';
import { BoundaryDeedIntake } from './BoundaryDeedIntake.tsx';
import { A2UIBoundarySummary } from './A2UIBoundarySummary.tsx';
import { DockModeControl } from './DockModeControl.tsx';
import { LegendQuickActions } from './LegendQuickActions.tsx';
import type { A2UIQuickThoughtBreakdown } from '../services/a2uiQuickThought.ts';
import { closeCanvasFlashInput, flashCanvasMessage, openCanvasFlashForInputForm } from '../services/canvasFlashes.ts';
import { isSurfaceNameField, projectInputChoices } from '../services/projectInputChoices.ts';
import { exampleFileContent, exampleFileName } from '../assets/example.raw.ts';
import { exampleHighwayCl } from '../assets/example.highway.cl.ts';
import { exampleDeedContent } from '../assets/example.deed.ts';
import { getBrowserPosition, reverseGeocodeUs } from '../utils/reverseGeocode.ts';
import { projectLocationZoningSeed, stateNameForZoning } from '../utils/zoningJurisdiction.ts';

interface A2UIQuickThoughtSurfaceProps {
  breakdown: A2UIQuickThoughtBreakdown;
  message: ChatMessage;
  isLoading?: boolean;
  onSendMessage?: (query: string) => void;
  onOpenConversation: () => void;
  onDock?: () => void;
  onPopOut?: () => void;
  onChat?: () => void;
  boundaryQuickActions?: {
    onUpload: () => void;
    onAuthor: () => void;
    onGis: () => void;
  };
}

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming','District of Columbia',
];

const COMPLIANCE_CHECK_ITEMS: ReadonlyArray<{ id: StandardsComplianceCheckId; label: string }> = [
  { id: 'title_block', label: 'Title block' },
  { id: 'north_arrow', label: 'North arrow' },
  { id: 'annotation_completeness', label: 'Annotations' },
  { id: 'required_layers', label: 'Required layers' },
  { id: 'linetype_compliance', label: 'Linetypes' },
  { id: 'scale_and_sheet_metadata', label: 'Scale & metadata' },
  { id: 'legend_symbol_consistency', label: 'Legend & symbols' },
  { id: 'revision_block', label: 'Revision block' },
  { id: 'zoning_table_and_dimensional_compliance', label: 'Zoning table' },
  { id: 'site_location_map', label: 'Site location map' },
  { id: 'impervious_coverage_chart', label: 'Impervious chart' },
];

const DEFAULT_COMPLIANCE_CHECKS: StandardsComplianceCheckSelection = {
  title_block: true,
  north_arrow: true,
  annotation_completeness: true,
  required_layers: true,
  linetype_compliance: true,
  scale_and_sheet_metadata: true,
  legend_symbol_consistency: true,
  revision_block: true,
  zoning_table_and_dimensional_compliance: true,
  site_location_map: true,
  impervious_coverage_chart: true,
};

function parsePointFileContent(content: string): SurveyPoint[] {
  const points: SurveyPoint[] = [];
  const lines = content.trim().split(/\r?\n/);

  for (const line of lines) {
    const cleanedLine = line.trim();
    if (!cleanedLine || /^[a-zA-Z#]/.test(cleanedLine)) continue;

    const parts = cleanedLine.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 3) continue;

    const pn = parts[0];
    const n = parseFloat(parts[1]);
    const e = parseFloat(parts[2]);
    const z = parts.length > 3 ? parseFloat(parts[3]) : 0;
    const d = parts.length > 4 ? parts.slice(4).join(' ') : '';

    if (pn && !isNaN(n) && !isNaN(e)) {
      points.push({
        pointNumber: pn,
        northing: n,
        easting: e,
        elevation: isNaN(z) ? 0 : z,
        description: d,
      });
    }
  }
  return points;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const btnClass =
  'flex min-h-[28px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

const primaryBtnClass =
  'flex min-h-[28px] items-center justify-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-400/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

const compactInputClass =
  'w-full rounded-md border border-white/15 bg-[#060d17] px-2 py-1 text-[11px] text-white placeholder:text-white/35 outline-none transition-colors focus:border-cyan-400/50';

const QUICK_HATCH_PATTERNS: readonly string[] = [
  'ANSI31',
  'ANSI37',
  'AR-CONC',
  'AR-SAND',
  'EARTH',
  'GRAVEL',
  'SOLID',
];

function formatHatchNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

const OpenChatFooter: React.FC<{ onOpenConversation: () => void; label?: string }> = ({
  onOpenConversation,
  label = 'Open conversation',
}) => (
  <div className="mt-2 flex items-center justify-end border-t border-white/[0.06] pt-1.5">
    <button
      type="button"
      data-no-drag
      onClick={onOpenConversation}
      className="group inline-flex shrink-0 items-center gap-1 text-[9px] font-medium text-white/45 transition-colors hover:text-white"
    >
      {label}
      <span aria-hidden="true" className="text-white/60 transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </button>
  </div>
);

/**
 * Compact inline form renderer for Quick Thought (`input-form` & `needsInput`).
 */
const QuickThoughtInputForm: React.FC<{
  form: A2UIInputFormSpec;
  needsInput?: boolean;
  onSubmit: (messageText: string) => void;
  onOpenConversation: () => void;
}> = ({ form, needsInput, onSubmit, onOpenConversation }) => {
  const formId = useId();
  const surfaceNames = useSyncExternalStore(
    projectInputChoices.subscribe,
    projectInputChoices.getSnapshot,
    projectInputChoices.getSnapshot,
  ).surfaceNames;
  const initialValues = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.type === 'checkbox') {
        next[field.id] = field.defaultChecked ? 'true' : 'false';
      } else if (field.type === 'select') {
        next[field.id] = field.options?.[0] ?? '';
      } else {
        next[field.id] = '';
      }
    }
    return next;
  }, [form]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues);
    setError(null);
  }, [initialValues]);

  const updateValue = (id: string, value: string) => {
    setValues(prev => ({ ...prev, [id]: value }));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const field of form.fields) {
      if (field.type === 'checkbox') continue;
      const val = (values[field.id] ?? '').trim();
      if (field.required && !val) {
        setError(`${field.label} is required.`);
        return;
      }
      if (val && field.type === 'number' && !Number.isFinite(Number(val))) {
        setError(`${field.label} must be a number.`);
        return;
      }
    }

    if (form.requireOneOf && form.requireOneOf.length > 0) {
      const satisfied = form.requireOneOf.some(group =>
        group.every(id => (values[id] ?? '').trim().length > 0),
      );
      if (!satisfied) {
        const choices = form.requireOneOf.map(group =>
          group
            .map(id => form.fields.find(f => f.id === id)?.label ?? id)
            .join(' + '),
        );
        setError(`Provide ${choices.join(' or ')}.`);
        return;
      }
    }

    if (form.fields.length === 1 && form.fields[0].id === 'answer' && form.fields[0].type !== 'checkbox') {
      const single = (values.answer ?? '').trim();
      if (single) {
        onSubmit(single);
        return;
      }
    }

    const lines = form.fields.flatMap(field => {
      const raw = (values[field.id] ?? '').trim();
      if (field.type === 'checkbox') {
        return [`${field.label}: ${raw === 'true' ? 'Yes' : 'No'}`];
      }
      if (!raw) return [];
      const val =
        field.type === 'number' && Number.isFinite(Number(raw))
          ? String(Number(raw))
          : raw;
      return [`${field.label}: ${val}${field.unit ? ` ${field.unit}` : ''}`];
    });

    onSubmit(`Here are the requested values:\n${lines.join('\n')}`);
  };

  return (
    <div data-testid="quick-thought-input-form" className="mt-2.5 space-y-2">
      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        {form.fields.map(field => {
          const inputId = `${formId}-${field.id}`;
          const val = values[field.id] ?? '';
          const surfaceSuggestions = isSurfaceNameField(field) ? surfaceNames : [];

          if (field.type === 'checkbox') {
            return (
              <label
                key={field.id}
                htmlFor={inputId}
                data-no-drag
                className="flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/85 transition-colors hover:border-white/30"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={val === 'true'}
                  onChange={e => updateValue(field.id, e.target.checked ? 'true' : 'false')}
                  className="h-3.5 w-3.5 rounded border-white/25 accent-cyan-400"
                />
                <span className="truncate font-medium">{field.label}</span>
              </label>
            );
          }

          return (
            <div key={field.id} className="space-y-1">
              <label
                htmlFor={inputId}
                className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/60"
              >
                {field.label}
                {field.required ? <span className="ml-0.5 text-cyan-300">*</span> : null}
              </label>
              {field.type === 'select' ? (
                <select
                  id={inputId}
                  data-no-drag
                  value={val}
                  onChange={e => updateValue(field.id, e.target.value)}
                  className={compactInputClass}
                >
                  {(field.options ?? []).map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={inputId}
                  data-no-drag
                  rows={2}
                  value={val}
                  onChange={e => updateValue(field.id, e.target.value)}
                  placeholder={field.placeholder || field.hint}
                  className={`${compactInputClass} resize-y`}
                />
              ) : (
                <>
                  <input
                    id={inputId}
                    data-no-drag
                    type={field.type === 'number' ? 'number' : 'text'}
                    step={field.type === 'number' ? 'any' : undefined}
                    list={surfaceSuggestions.length > 0 ? `${inputId}-surfaces` : undefined}
                    value={val}
                    onChange={e => updateValue(field.id, e.target.value)}
                    placeholder={
                      field.placeholder ||
                      field.hint ||
                      (surfaceSuggestions.length > 0
                        ? 'Select or type a surface…'
                        : `Enter ${field.label.toLowerCase()}…`)
                    }
                    className={compactInputClass}
                  />
                  {surfaceSuggestions.length > 0 && (
                    <datalist id={`${inputId}-surfaces`}>
                      {surfaceSuggestions.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-[10px] text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          data-no-drag
          data-testid="quick-thought-submit-form"
          className={`${primaryBtnClass} w-full`}
        >
          {form.submitLabel || 'Send to agent'}
        </button>
      </form>

      {needsInput ? (
        <button
          type="button"
          data-no-drag
          onClick={onOpenConversation}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
        >
          Answer in chat
          <span aria-hidden="true" className="text-white/70">
            →
          </span>
        </button>
      ) : (
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      )}
    </div>
  );
};

export const A2UIQuickThoughtSurface: React.FC<A2UIQuickThoughtSurfaceProps> = ({
  breakdown,
  message,
  isLoading = false,
  onSendMessage,
  onOpenConversation,
  onDock,
  onPopOut,
  onChat,
  boundaryQuickActions,
}) => {
  const host = useContext(A2UIHostContext);
  const settingsCtx = useContext(SettingsContext);

  // Shared hidden file input refs for upload widgets
  const cadFileInputRef = useRef<HTMLInputElement>(null);
  const pointFileInputRef = useRef<HTMLInputElement>(null);
  const pointFolderInputRef = useRef<HTMLInputElement | null>(null);
  const rawFileInputRef = useRef<HTMLInputElement>(null);
  const civilFileInputRef = useRef<HTMLInputElement>(null);
  const dxfFileInputRef = useRef<HTMLInputElement>(null);
  const clFileInputRef = useRef<HTMLInputElement>(null);
  const gisFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const planFileInputRef = useRef<HTMLInputElement>(null);
  const complianceSubjectInputRef = useRef<HTMLInputElement>(null);

  const setPointFolderInput = useCallback((el: HTMLInputElement | null) => {
    pointFolderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
      el.setAttribute('mozdirectory', '');
    }
  }, []);

  // DXF widget state
  const [smoothSplines, setSmoothSplines] = useState(false);
  const [quantizationBits, setQuantizationBits] = useState<16 | 32>(16);

  // Deed / Title Search paste state
  const [pastedDeedText, setPastedDeedText] = useState('');

  // GIS URL state
  const [gisLayerUrl, setGisLayerUrl] = useState('');

  // Zoning intake state. The live project location is the preferred source;
  // every prefilled field stays editable and GPS remains an optional fallback.
  const initialZoningSeed = useMemo(
    () => projectLocationZoningSeed(host.getProjectLocationSnapshot?.()),
    // The snapshot is read once when the Quick Thought mounts; later renders
    // must not overwrite edits the user has already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [zoningState, setZoningState] = useState(() =>
    initialZoningSeed?.state ??
    stateNameForZoning(
      host.jobInfo?.siteAddress?.match(/,\s*([A-Za-z ]+?)(?:\s+\d{5})?\s*$/)?.[1]?.trim() ?? '',
    ),
  );
  const [zoningCounty, setZoningCounty] = useState(() => initialZoningSeed?.county ?? '');
  const [zoningMuni, setZoningMuni] = useState(
    () => initialZoningSeed?.municipality ?? host.jobInfo?.siteMunicipality ?? '',
  );
  const [zoningDistrict, setZoningDistrict] = useState(() => host.jobInfo?.zoningDistrict ?? '');
  const [zoningAutofillSource, setZoningAutofillSource] = useState<'project-location' | 'gps' | null>(
    () => (initialZoningSeed ? 'project-location' : null),
  );
  const [zoningLookupMessage, setZoningLookupMessage] = useState<string | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const zoningAutoFilledRef = useRef(Boolean(initialZoningSeed));

  // The project-location resolver is asynchronous. If the card mounts while it
  // is still resolving, fill the fields once it lands rather than making the
  // user reopen the Quick Thought.
  useEffect(() => {
    if (zoningAutoFilledRef.current) return;
    if (zoningState.trim() || zoningCounty.trim() || zoningMuni.trim()) {
      zoningAutoFilledRef.current = true;
      return;
    }
    const seed = projectLocationZoningSeed(host.getProjectLocationSnapshot?.());
    if (!seed) return;
    if (seed.state) setZoningState(seed.state);
    if (seed.county) setZoningCounty(seed.county);
    if (seed.municipality) setZoningMuni(seed.municipality);
    setZoningAutofillSource('project-location');
    zoningAutoFilledRef.current = true;
  }, [host, zoningState, zoningCounty, zoningMuni]);

  const applyProjectZoningLocation = () => {
    const seed = projectLocationZoningSeed(host.getProjectLocationSnapshot?.());
    if (!seed) {
      setZoningLookupMessage('No project location yet — add georeferenced points or use GPS.');
      return;
    }
    if (seed.state) setZoningState(seed.state);
    if (seed.county) setZoningCounty(seed.county);
    if (seed.municipality) setZoningMuni(seed.municipality);
    setZoningAutofillSource('project-location');
    setZoningLookupMessage('Filled from the project location — adjust anything below.');
    zoningAutoFilledRef.current = true;
  };

  // Standards compliance intake state
  const [complianceSourceMode, setComplianceSourceMode] = useState<ComplianceSourceMode>('ask-each-run');
  const [complianceChecks, setComplianceChecks] = useState<StandardsComplianceCheckSelection>(DEFAULT_COMPLIANCE_CHECKS);
  const [showComplianceChecks, setShowComplianceChecks] = useState(false);

  // Hatch Studio quick controls
  const hatchSpecPattern = breakdown.a2ui?.hatchStudio?.patternName;
  const hatchSpecScale = breakdown.a2ui?.hatchStudio?.scale;
  const hatchSpecAngle = breakdown.a2ui?.hatchStudio?.angleDeg;
  const [hatchPattern, setHatchPattern] = useState(hatchSpecPattern || 'ANSI31');
  const [hatchScale, setHatchScale] = useState(hatchSpecScale ?? 1);
  const [hatchAngle, setHatchAngle] = useState(hatchSpecAngle ?? 0);
  useEffect(() => {
    setHatchPattern(hatchSpecPattern || 'ANSI31');
    setHatchScale(typeof hatchSpecScale === 'number' ? hatchSpecScale : 1);
    setHatchAngle(typeof hatchSpecAngle === 'number' ? hatchSpecAngle : 0);
  }, [hatchSpecPattern, hatchSpecScale, hatchSpecAngle]);

  // Inline markdown checkboxes state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (breakdown.checkboxes) {
      const next: Record<string, boolean> = {};
      for (const item of breakdown.checkboxes) {
        next[item.id] = item.defaultChecked;
      }
      setCheckedItems(next);
    }
  }, [breakdown.checkboxes]);

  // WebGPU settings state for quick settings surface
  const [webgpuEnabled, setWebgpuEnabled] = useState<boolean>(() => isWebGpuEnabled());
  const [gpuPower, setGpuPower] = useState<GpuPowerPreference>(() => getGpuPowerPreference());

  const handlePointFilesSelected = useCallback(
    async (files: File[]) => {
      if (!host.onPointsUploaded) {
        host.onPointEditorSessionStart?.();
        return;
      }
      const supported = files.filter(
        f =>
          f.name.toLowerCase().endsWith('.csv') ||
          f.name.toLowerCase().endsWith('.txt') ||
          f.type === 'text/plain' ||
          f.type === 'text/csv',
      );
      if (supported.length === 0) return;
      const allPoints: SurveyPoint[] = [];
      const names: string[] = [];
      for (const file of supported) {
        try {
          const text = await readFileAsText(file);
          const pts = parsePointFileContent(text);
          if (pts.length > 0) {
            allPoints.push(...pts);
            names.push(file.name);
          }
        } catch {
          /* skip unreadable file */
        }
      }
      if (allPoints.length > 0) {
        host.onPointsUploaded(allPoints, names.length === 1 ? names[0] : `${names.length} files`);
      }
    },
    [host],
  );

  // 1. Options list (explicit `questionOptions` or extracted inline prose options)
  if (breakdown.kind === 'options' && breakdown.options && breakdown.options.length > 0) {
    return (
      <div className="mt-2.5">
        <div className="flex flex-col gap-1">
          {breakdown.options.map((opt, optIdx) => (
            <button
              key={optIdx}
              type="button"
              data-no-drag
              disabled={isLoading}
              onClick={() => {
                closeCanvasFlashInput();
                onSendMessage?.(opt);
              }}
              className="group flex w-full items-center gap-2 rounded-md border border-white/15 bg-white/[0.035] px-2 py-1.5 text-left text-[11px] font-medium leading-snug text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[8px] font-bold"
                style={{
                  borderColor: 'rgba(255,255,255,0.24)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {String.fromCharCode(65 + optIdx)}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1">{opt}</span>
              <span aria-hidden="true" className="shrink-0 text-white/35 transition-colors group-hover:text-white">
                ›
              </span>
            </button>
          ))}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 2. Inline checkboxes extracted from message body
  if (breakdown.kind === 'checkboxes' && breakdown.checkboxes && breakdown.checkboxes.length > 0) {
    const items = breakdown.checkboxes;
    return (
      <div data-testid="quick-thought-checkboxes" className="mt-2.5 space-y-1.5">
        <div className="space-y-1">
          {items.map(item => (
            <label
              key={item.id}
              data-no-drag
              className="flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/15 bg-white/[0.035] px-2 py-1.5 text-[11px] text-white/85 transition-colors hover:border-white/30"
            >
              <input
                type="checkbox"
                checked={Boolean(checkedItems[item.id])}
                onChange={e =>
                  setCheckedItems(prev => ({ ...prev, [item.id]: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-white/25 accent-cyan-400"
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          data-no-drag
          data-testid="quick-thought-submit-checkboxes"
          disabled={isLoading}
          onClick={() => {
            const selected = items.filter(i => checkedItems[i.id]).map(i => i.label);
            onSendMessage?.(
              selected.length > 0
                ? `Selected options: ${selected.join(', ')}`
                : 'None selected',
            );
          }}
          className={`${primaryBtnClass} w-full`}
        >
          Apply selection
        </button>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 3. Input form (`a2ui.kind === 'input-form'`, derived parameter form, or `needsInput`)
  if (breakdown.kind === 'input-form' && breakdown.inputForm) {
    if (breakdown.datasetTooLarge) {
      return (
        <div className="mt-2.5 space-y-1.5">
          <p className="text-[10px] text-white/55">
            {breakdown.totalItemCount} input fields requested — open the form in chat to complete all values.
          </p>
          <button
            type="button"
            data-no-drag
            onClick={onOpenConversation}
            className={`${primaryBtnClass} w-full`}
          >
            {message.needsInput ? 'Answer in chat' : 'Open form in chat'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      );
    }

    return (
      <QuickThoughtInputForm
        form={breakdown.inputForm}
        needsInput={message.needsInput}
        onSubmit={msgText => {
          closeCanvasFlashInput();
          flashCanvasMessage('Sent — the agent is continuing.', { tone: 'success' });
          if (breakdown.a2ui && host.onSubmitInput) {
            host.onSubmitInput(msgText, breakdown.a2ui);
          } else {
            onSendMessage?.(msgText);
          }
        }}
        onOpenConversation={onOpenConversation}
      />
    );
  }

  // 4. Upload / Intake Widgets (`a2ui.kind === 'upload-widget'`)
  if (breakdown.kind === 'upload-widget') {
    const widgetType = breakdown.widgetType;

    switch (widgetType) {
      case 'cad-manager-intake':
        return (
          <div
            data-testid="quick-thought-cad-manager-intake"
            className="mt-2.5 space-y-1.5"
            onDragOver={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={async e => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              if (host.onCadManagerFileUploaded) {
                const content = await readFileAsText(file);
                host.onCadManagerFileUploaded(content, file.name);
              } else {
                host.onCadManagerSessionStart?.();
              }
            }}
          >
            <input
              ref={cadFileInputRef}
              data-testid="quick-thought-cad-file-input"
              type="file"
              className="hidden"
              accept=".lay,.dsc,.lin,.json,.md,.markdown,.csv,.txt,.xml,.fxl,.fcl"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (host.onCadManagerFileUploaded) {
                  const content = await readFileAsText(file);
                  host.onCadManagerFileUploaded(content, file.name);
                } else {
                  host.onCadManagerSessionStart?.();
                }
              }}
            />
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                data-no-drag
                data-testid="quick-thought-cad-upload"
                onClick={() => {
                  if (host.onCadManagerFileUploaded) {
                    cadFileInputRef.current?.click();
                  } else {
                    onOpenConversation();
                  }
                }}
                className={primaryBtnClass}
              >
                Upload standards file
              </button>
              <button
                type="button"
                data-no-drag
                data-testid="quick-thought-cad-start"
                onClick={() => {
                  if (host.onCadManagerSessionStart) {
                    host.onCadManagerSessionStart();
                  } else {
                    onSendMessage?.('Start new standards session');
                  }
                }}
                className={btnClass}
              >
                Start new standards session
              </button>
              {host.onOpenSpreadsheetEditor && (
                <button
                  type="button"
                  data-no-drag
                  data-testid="quick-thought-cad-spreadsheet"
                  onClick={() => host.onOpenSpreadsheetEditor?.()}
                  className={btnClass}
                >
                  Edit spreadsheet
                </button>
              )}
            </div>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'point-upload':
        return (
          <div data-testid="quick-thought-point-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={pointFileInputRef}
              data-testid="quick-thought-point-file-input"
              type="file"
              multiple
              className="hidden"
              accept=".csv,.txt,text/plain,text/csv"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  void handlePointFilesSelected(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />
            <input
              ref={setPointFolderInput}
              data-testid="quick-thought-point-folder-input"
              type="file"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  void handlePointFilesSelected(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-no-drag
                onClick={() => pointFileInputRef.current?.click()}
                className={primaryBtnClass}
              >
                Choose files
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() => pointFolderInputRef.current?.click()}
                className={btnClass}
              >
                Choose folder
              </button>
            </div>
            <button
              type="button"
              data-no-drag
              onClick={() => {
                if (host.onPointEditorSessionStart) {
                  host.onPointEditorSessionStart();
                } else {
                  onSendMessage?.('Start empty session');
                }
              }}
              className={`${btnClass} w-full`}
            >
              Start empty session
            </button>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'raw-upload':
        return (
          <div data-testid="quick-thought-raw-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={rawFileInputRef}
              data-testid="quick-thought-raw-file-input"
              type="file"
              className="hidden"
              accept=".raw,text/plain"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await readFileAsText(file);
                host.onRawFileUploaded?.(content, file.name);
              }}
            />
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                data-no-drag
                onClick={() => rawFileInputRef.current?.click()}
                className={primaryBtnClass}
              >
                Upload .RAW file
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() => {
                  if (host.onRawFileUploaded) {
                    host.onRawFileUploaded(exampleFileContent, exampleFileName);
                  } else {
                    onSendMessage?.('Load an example .RAW file');
                  }
                }}
                className={btnClass}
              >
                Load an example .RAW file
              </button>
            </div>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'civil-drafter-upload':
        return (
          <div data-testid="quick-thought-civil-drafter-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={civilFileInputRef}
              data-testid="quick-thought-civil-file-input"
              type="file"
              className="hidden"
              accept=".raw,.txt,.csv,.pts,.pnezd,text/plain"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await readFileAsText(file);
                host.onCivilDrafterFileUploaded?.(content, file.name);
              }}
            />
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                data-no-drag
                onClick={() => civilFileInputRef.current?.click()}
                className={primaryBtnClass}
              >
                Upload point / .RAW file
              </button>
              {(host.existingPointCount ?? 0) > 0 && host.onCivilDrafterUseExistingPoints && (
                <button
                  type="button"
                  data-no-drag
                  onClick={() => host.onCivilDrafterUseExistingPoints?.()}
                  className={btnClass}
                >
                  Use existing points ({host.existingPointCount})
                </button>
              )}
              <button
                type="button"
                data-no-drag
                onClick={onOpenConversation}
                className={btnClass}
              >
                Upload PDF plan sheet
              </button>
            </div>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'deed-upload':
        return (
          <div className="mt-2.5">
            <BoundaryDeedIntake
              variant="quick"
              onDeedSubmitted={host.onDeedSubmitted}
              onDeedBatchSubmitted={host.onDeedBatchSubmitted}
              onStartFromScratch={
                host.onDeedStartFromScratch ??
                boundaryQuickActions?.onAuthor ??
                (() => onSendMessage?.('Start a blank manual boundary'))
              }
              onOpenGis={
                host.onOpenBoundaryGis ??
                boundaryQuickActions?.onGis ??
                (() => onSendMessage?.('Look up parcel in County GIS'))
              }
              onPasteFallback={text => onSendMessage?.(`Draft this legal description:\n\n${text}`)}
              onUploadFallback={
                boundaryQuickActions
                  ? () => {
                      onOpenConversation();
                      boundaryQuickActions.onUpload();
                    }
                  : onOpenConversation
              }
              onOpenConversation={onOpenConversation}
            />
          </div>
        );

      case 'dxf-upload':
        return (
          <div data-testid="quick-thought-dxf-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={dxfFileInputRef}
              data-testid="quick-thought-dxf-file-input"
              type="file"
              className="hidden"
              accept=".dxf,application/dxf,image/vnd.dxf,text/plain"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await readFileAsText(file);
                host.onDxfUploaded?.(content, file.name, { smoothSplines, quantizationBits });
              }}
            />
            <label
              data-no-drag
              className="flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-white/85 transition-colors hover:border-white/30"
            >
              <input
                type="checkbox"
                data-testid="quick-thought-dxf-smooth-splines"
                checked={smoothSplines}
                onChange={e => setSmoothSplines(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/25 accent-indigo-400"
              />
              <span className="flex-1 truncate font-medium">Smooth splines (T-splines)</span>
            </label>
            {smoothSplines && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/70">
                <span>Quantization</span>
                <div className="inline-flex overflow-hidden rounded border border-white/15">
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => setQuantizationBits(16)}
                    className={`px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      quantizationBits === 16 ? 'bg-indigo-500/80 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                    }`}
                  >
                    16-bit
                  </button>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => setQuantizationBits(32)}
                    className={`border-l border-white/15 px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      quantizationBits === 32 ? 'bg-indigo-500/80 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                    }`}
                  >
                    32-bit
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              data-no-drag
              data-testid="quick-thought-dxf-choose"
              onClick={() => dxfFileInputRef.current?.click()}
              className={`${primaryBtnClass} w-full`}
            >
              Upload .DXF file
            </button>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'centerline-upload':
        return (
          <div data-testid="quick-thought-centerline-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={clFileInputRef}
              data-testid="quick-thought-cl-file-input"
              type="file"
              className="hidden"
              accept=".cl,text/plain"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await readFileAsText(file);
                host.onClFileUploaded?.(content, file.name);
              }}
            />
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                data-no-drag
                onClick={() => clFileInputRef.current?.click()}
                className={primaryBtnClass}
              >
                Upload .CL file
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() => {
                  if (host.onClFileUploaded) {
                    host.onClFileUploaded(exampleHighwayCl, 'example.highway.cl');
                  } else {
                    onSendMessage?.('Load 1.5-mile highway example');
                  }
                }}
                className={btnClass}
              >
                Load 1.5-mile highway example
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() => {
                  if (host.onCenterlineSessionStart) {
                    host.onCenterlineSessionStart();
                  } else {
                    onSendMessage?.('Start a blank centerline');
                  }
                }}
                className={btnClass}
              >
                Start a blank centerline
              </button>
            </div>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'plan-upload':
        return (
          <div data-testid="quick-thought-plan-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={planFileInputRef}
              data-testid="quick-thought-plan-file-input"
              type="file"
              multiple
              className="hidden"
              accept=".pdf,application/pdf"
              onChange={async e => {
                const selected = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (selected.length === 0) return;
                if (host.onPlansSubmitted) {
                  const processed: SessionFile[] = [];
                  for (const file of selected) {
                    const fileData = await readFileAsDataUrl(file);
                    processed.push({ name: file.name, content: `PDF Plan: ${file.name}`, fileData, selectedPages: [1] });
                  }
                  host.onPlansSubmitted(processed);
                } else {
                  onOpenConversation();
                }
              }}
            />
            <button
              type="button"
              data-no-drag
              onClick={() => {
                if (host.onPlansSubmitted) {
                  planFileInputRef.current?.click();
                } else {
                  onOpenConversation();
                }
              }}
              className={`${primaryBtnClass} w-full`}
            >
              Upload PDF plan sheets
            </button>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'image-upload':
        return (
          <div data-testid="quick-thought-image-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={imageFileInputRef}
              data-testid="quick-thought-image-file-input"
              type="file"
              multiple
              className="hidden"
              accept="image/*"
              onChange={async e => {
                const selected = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
                e.target.value = '';
                if (selected.length === 0) return;
                const processed: SessionFile[] = [];
                for (const file of selected) {
                  const fileData = await readFileAsDataUrl(file);
                  processed.push({ name: file.name, content: `Image file: ${file.name}`, fileData });
                }
                host.onImagesSubmitted?.(processed);
              }}
            />
            <button
              type="button"
              data-no-drag
              onClick={() => imageFileInputRef.current?.click()}
              className={`${primaryBtnClass} w-full`}
            >
              Upload site photos
            </button>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'title-search-upload':
        return (
          <div data-testid="quick-thought-title-search-upload" className="mt-2.5 space-y-1.5">
            <form
              onSubmit={e => {
                e.preventDefault();
                const trimmed = pastedDeedText.trim();
                if (!trimmed) return;
                host.onTitleSearchDeedSubmitted?.({ name: 'Pasted Deed', content: trimmed });
                setPastedDeedText('');
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                data-no-drag
                value={pastedDeedText}
                onChange={e => setPastedDeedText(e.target.value)}
                placeholder="Paste deed description…"
                className={compactInputClass}
              />
              <button
                type="submit"
                data-no-drag
                disabled={!pastedDeedText.trim()}
                className={`${primaryBtnClass} shrink-0`}
              >
                Analyze
              </button>
            </form>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-no-drag
                onClick={onOpenConversation}
                className={btnClass}
              >
                Upload PDF / image
              </button>
              <button
                type="button"
                data-no-drag
                onClick={() =>
                  host.onTitleSearchDeedSubmitted?.({
                    name: 'example.deed',
                    content: exampleDeedContent,
                  })
                }
                className={btnClass}
              >
                Load example deed
              </button>
            </div>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'zoning-intake':
        return (
          <div data-testid="quick-thought-zoning-intake" className="mt-2.5 space-y-1.5">
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!zoningState.trim() || !zoningCounty.trim() || !zoningMuni.trim()) return;
                host.onZoningSearch?.({
                  state: zoningState.trim(),
                  county: zoningCounty.trim(),
                  municipality: zoningMuni.trim(),
                  zoningDistrict: zoningDistrict.trim() || undefined,
                });
              }}
              className="space-y-1.5"
            >
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  aria-label="State"
                  data-no-drag
                  value={zoningState}
                  onChange={e => setZoningState(e.target.value)}
                  className={compactInputClass}
                >
                  <option value="">State…</option>
                  {US_STATES.map(st => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="County"
                  data-no-drag
                  value={zoningCounty}
                  onChange={e => setZoningCounty(e.target.value)}
                  placeholder="County *"
                  className={compactInputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  aria-label="Municipality"
                  data-no-drag
                  value={zoningMuni}
                  onChange={e => setZoningMuni(e.target.value)}
                  placeholder="Municipality *"
                  className={compactInputClass}
                />
                <input
                  type="text"
                  aria-label="Zoning district"
                  data-no-drag
                  value={zoningDistrict}
                  onChange={e => setZoningDistrict(e.target.value)}
                  placeholder="District (optional)"
                  className={compactInputClass}
                />
              </div>
              {zoningAutofillSource && (
                <p className="text-[10px] text-cyan-300/80">
                  {zoningAutofillSource === 'project-location'
                    ? 'Filled from project location'
                    : 'Filled from GPS'}{' '}
                  — edit anything below.
                </p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-no-drag
                  disabled={isLocatingGps}
                  onClick={applyProjectZoningLocation}
                  className={btnClass}
                >
                  Use project location
                </button>
                <button
                  type="button"
                  data-no-drag
                  disabled={isLocatingGps}
                  onClick={async () => {
                    setIsLocatingGps(true);
                    setZoningLookupMessage(null);
                    try {
                      const pos = await getBrowserPosition();
                      const rev = await reverseGeocodeUs(pos.coords.latitude, pos.coords.longitude);
                      if (rev.state) setZoningState(stateNameForZoning(rev.state));
                      if (rev.county) setZoningCounty(rev.county);
                      if (rev.place) setZoningMuni(rev.place);
                      setZoningAutofillSource('gps');
                      zoningAutoFilledRef.current = true;
                    } catch {
                      setZoningLookupMessage('GPS unavailable — enter the jurisdiction manually.');
                    } finally {
                      setIsLocatingGps(false);
                    }
                  }}
                  className={btnClass}
                >
                  {isLocatingGps ? 'Locating…' : 'Use GPS'}
                </button>
              </div>
              <button
                type="submit"
                data-no-drag
                disabled={!zoningState.trim() || !zoningCounty.trim() || !zoningMuni.trim()}
                className={`${primaryBtnClass} w-full`}
              >
                Research zoning
              </button>
              {zoningLookupMessage && (
                <p className="text-[10px] text-amber-300/80">{zoningLookupMessage}</p>
              )}
            </form>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );

      case 'gis-upload':
        return (
          <div data-testid="quick-thought-gis-upload" className="mt-2.5 space-y-1.5">
            <input
              ref={gisFileInputRef}
              data-testid="quick-thought-gis-file-input"
              type="file"
              className="hidden"
              accept=".geojson,.json,application/json"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await readFileAsText(file);
                host.onGisUploaded?.(content, file.name, 'file');
              }}
            />
            <button
              type="button"
              data-no-drag
              onClick={() => gisFileInputRef.current?.click()}
              className={`${primaryBtnClass} w-full`}
            >
              Upload .GeoJSON file
            </button>
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!gisLayerUrl.trim()) return;
                onSendMessage?.(`Load GIS layer from ${gisLayerUrl.trim()}`);
                setGisLayerUrl('');
              }}
              className="flex items-center gap-1"
            >
              <input
                type="url"
                data-no-drag
                value={gisLayerUrl}
                onChange={e => setGisLayerUrl(e.target.value)}
                placeholder="Or paste ArcGIS REST URL…"
                className={compactInputClass}
              />
              <button
                type="submit"
                data-no-drag
                disabled={!gisLayerUrl.trim()}
                className={`${btnClass} shrink-0`}
              >
                Load
              </button>
            </form>
            <OpenChatFooter onOpenConversation={onOpenConversation} label="Browse catalog in chat" />
          </div>
        );

      case 'standards-compliance-intake': {
        const selectedCount = Object.values(complianceChecks).filter(Boolean).length;
        return (
          <div data-testid="quick-thought-standards-compliance-intake" className="mt-2.5 space-y-1.5">
            <input
              ref={complianceSubjectInputRef}
              data-testid="quick-thought-compliance-subject-input"
              type="file"
              className="hidden"
              accept=".pdf,application/pdf"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (host.onStandardsComplianceSessionStart) {
                  const fileData = await readFileAsDataUrl(file);
                  host.onStandardsComplianceSessionStart({
                    controlFiles: [],
                    subjectFile: {
                      name: file.name,
                      content: `Subject PDF: ${file.name}`,
                      fileData,
                      selectedPages: [1],
                    },
                    checks: complianceChecks,
                    sourceMode: complianceSourceMode,
                  });
                } else {
                  onOpenConversation();
                }
              }}
            />
            <div className="space-y-1">
              <label className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/60">
                Source mode
              </label>
              <select
                aria-label="Source mode"
                data-no-drag
                value={complianceSourceMode}
                onChange={e => setComplianceSourceMode(e.target.value as ComplianceSourceMode)}
                className={compactInputClass}
              >
                <option value="ask-each-run">Ask each run</option>
                <option value="cad-manager">CAD Manager only</option>
                <option value="control-pdf">Control PDF only</option>
                <option value="combined">Combined</option>
              </select>
            </div>

            <button
              type="button"
              data-no-drag
              onClick={() => setShowComplianceChecks(prev => !prev)}
              className={`${btnClass} w-full justify-between`}
            >
              <span>Compliance checks ({selectedCount}/{COMPLIANCE_CHECK_ITEMS.length})</span>
              <span aria-hidden="true">{showComplianceChecks ? '▲' : '▼'}</span>
            </button>

            {showComplianceChecks && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-white/10 bg-black/25 p-1.5">
                {COMPLIANCE_CHECK_ITEMS.map(item => (
                  <label
                    key={item.id}
                    data-no-drag
                    className="flex cursor-pointer select-none items-center gap-2 rounded px-1.5 py-1 text-[10.5px] text-white/80 hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={complianceChecks[item.id]}
                      onChange={e =>
                        setComplianceChecks(prev => ({
                          ...prev,
                          [item.id]: e.target.checked,
                        }))
                      }
                      className="h-3 w-3 rounded border-white/25 accent-cyan-400"
                    />
                    <span className="truncate">{item.label}</span>
                  </label>
                ))}
              </div>
            )}

            <button
              type="button"
              data-no-drag
              onClick={() => {
                if (host.onStandardsComplianceSessionStart) {
                  complianceSubjectInputRef.current?.click();
                } else {
                  onOpenConversation();
                }
              }}
              className={`${primaryBtnClass} w-full`}
            >
              Select subject PDF &amp; run audit
            </button>
            <OpenChatFooter onOpenConversation={onOpenConversation} />
          </div>
        );
      }

      default:
        break;
    }
  }

  // 5. Deed summary (`a2ui.kind === 'deed-summary'`)
  // The uploaded deed's descriptions are usable directly from Quick Thought,
  // without opening the full agent feed.
  if (breakdown.kind === 'deed-summary' && breakdown.a2ui) {
    const summary = breakdown.a2ui.deedSummary ?? host.boundaryDeedSummary;
    if (summary) {
      return (
        <div
          data-testid="quick-thought-deed-summary"
          className="mt-2.5 max-h-[min(62vh,540px)] overflow-y-auto pr-0.5"
        >
          <A2UIBoundarySummary
            summary={summary}
            files={host.boundaryDeedFiles ?? []}
            computingTractIds={new Set(host.boundaryComputingTractIds ?? [])}
            activeFileId={host.boundaryActiveFileId}
            onProcessSelected={(tractIds) => host.onBoundaryProcessTracts?.(tractIds, summary)}
            onParseFullDeed={() => host.onBoundaryParseFullDeed?.()}
            onOpenEditor={(fileId) => host.onBoundaryOpenEditor?.(fileId)}
            onOpenDescription={(tractId, snippet) => host.onBoundaryOpenDescription?.(tractId, snippet)}
          />
          <OpenChatFooter onOpenConversation={onOpenConversation} label="Open the full deed conversation" />
        </div>
      );
    }
  }

  // 6. Selection prompt (`a2ui.kind === 'selection-prompt'`)
  if (breakdown.kind === 'selection-prompt') {
    const prompt = breakdown.selectionPrompt;
    const count = prompt?.pointCount;
    return (
      <div data-testid="quick-thought-selection-prompt" className="mt-2.5 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-no-drag
            onClick={() => host.onStartCanvasSelection?.()}
            className={btnClass}
          >
            Select on canvas
          </button>
          <button
            type="button"
            data-no-drag
            onClick={() => breakdown.a2ui && host.onUseCanvasSelection?.(breakdown.a2ui)}
            className={primaryBtnClass}
          >
            {prompt?.actionLabel || `Divide selected${count ? ` (${count})` : ''}`}
          </button>
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 6. CAD Manager workspace card (`a2ui.kind === 'cad-manager'`)
  if (breakdown.kind === 'cad-manager') {
    return (
      <div data-testid="quick-thought-cad-manager" className="mt-2.5 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          {(host.onOpenCadWorkspace || onDock) && (
            <button
              type="button"
              data-no-drag
              onClick={() => (host.onOpenCadWorkspace ? host.onOpenCadWorkspace() : onDock?.())}
              className={primaryBtnClass}
            >
              Dock workspace
            </button>
          )}
          {host.onOpenSpreadsheetEditor && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onOpenSpreadsheetEditor?.()}
              className={btnClass}
            >
              Edit spreadsheet
            </button>
          )}
          {host.onOpenCadStandards && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onOpenCadStandards?.()}
              className={btnClass}
            >
              Standards sheet
            </button>
          )}
          {(onPopOut || onDock || onChat) && (
            <DockModeControl
              mode="chat"
              onChange={next => {
                if (next === 'floating') onPopOut?.();
                else if (next === 'toolshelf') onDock?.();
                else onChat?.();
              }}
            />
          )}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 7. Zoning Research / Zoning Sources (`a2ui.kind === 'zoning-research' | 'zoning-sources'`)
  if (breakdown.kind === 'zoning-research' || breakdown.kind === 'zoning-sources') {
    const ask = host.onZoningAskQuestion ?? onSendMessage;
    return (
      <div data-testid="quick-thought-zoning-research" className="mt-2.5 space-y-1.5">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            data-no-drag
            onClick={() => ask?.('What are the setback requirements?')}
            className={btnClass}
          >
            Setbacks
          </button>
          <button
            type="button"
            data-no-drag
            onClick={() => ask?.('What is the maximum building height?')}
            className={btnClass}
          >
            Max height
          </button>
          <button
            type="button"
            data-no-drag
            onClick={() => ask?.('What uses are permitted by right?')}
            className={btnClass}
          >
            Permitted uses
          </button>
        </div>
        {(onPopOut || onDock || onChat) && (
          <div className="flex justify-end">
            <DockModeControl
              mode="chat"
              onChange={next => {
                if (next === 'floating') onPopOut?.();
                else if (next === 'toolshelf') onDock?.();
                else onChat?.();
              }}
            />
          </div>
        )}
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 8. Live Settings surface (`a2ui.kind === 'settings'`)
  if (breakdown.kind === 'settings' && breakdown.a2ui) {
    const sec = breakdown.a2ui.settingsSection ?? 'all';
    const settings = settingsCtx?.settings;
    const setSettings = settingsCtx?.setSettings;

    return (
      <div data-testid="quick-thought-settings" className="mt-2.5 space-y-1.5">
        {sec === 'graphics' && (
          <div className="space-y-1.5">
            <label
              data-no-drag
              className="flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-white/85"
            >
              <input
                type="checkbox"
                checked={webgpuEnabled}
                onChange={e => {
                  const next = e.target.checked;
                  setWebgpuEnabled(next);
                  try {
                    if (next) localStorage.removeItem(WEBGPU_ENABLED_KEY);
                    else localStorage.setItem(WEBGPU_ENABLED_KEY, 'off');
                    window.dispatchEvent(new CustomEvent(WEBGPU_PREF_EVENT));
                  } catch {
                    /* ignore */
                  }
                }}
                className="h-3.5 w-3.5 rounded border-white/25 accent-cyan-400"
              />
              <span>Enable WebGPU Acceleration</span>
            </label>
            <select
              aria-label="GPU Power Preference"
              data-no-drag
              value={gpuPower}
              onChange={e => {
                const next = e.target.value as GpuPowerPreference;
                setGpuPower(next);
                try {
                  localStorage.setItem(WEBGPU_POWER_KEY, next);
                  window.dispatchEvent(new CustomEvent(WEBGPU_PREF_EVENT));
                } catch {
                  /* ignore */
                }
              }}
              className={compactInputClass}
            >
              <option value="high-performance">High performance (Discrete GPU)</option>
              <option value="low-power">Low power (Integrated GPU)</option>
            </select>
          </div>
        )}

        {sec === 'display' && settings && setSettings && (
          <div className="grid grid-cols-2 gap-1.5">
            <select
              aria-label="Linear units"
              data-no-drag
              value={settings.linearUnit}
              onChange={e =>
                setSettings(prev => ({ ...prev, linearUnit: e.target.value as LinearUnit }))
              }
              className={compactInputClass}
            >
              {LINEAR_UNIT_OPTIONS.map(u => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Coordinate precision"
              data-no-drag
              value={settings.coordinatePrecision}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  coordinatePrecision: Number(e.target.value),
                }))
              }
              className={compactInputClass}
            >
              {[0, 1, 2, 3, 4].map(p => (
                <option key={p} value={p}>
                  {p} decimals
                </option>
              ))}
            </select>
          </div>
        )}

        {sec === 'a2ui' && settings && setSettings && (
          <div className="space-y-1.5">
            <label
              data-no-drag
              className="flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-white/85"
            >
              <input
                type="checkbox"
                checked={settings.a2ui?.autoOpenCacpReview === true}
                onChange={e =>
                  setSettings(prev => ({
                    ...prev,
                    a2ui: { ...prev.a2ui, autoOpenCacpReview: e.target.checked },
                  }))
                }
                className="h-3.5 w-3.5 rounded border-white/25 accent-cyan-400"
              />
              <span>Auto-open CACP review</span>
            </label>
            <select
              aria-label="Default surface size"
              data-no-drag
              value={settings.a2ui?.defaultSize ?? 'standard'}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  a2ui: { ...prev.a2ui, defaultSize: e.target.value as A2UISurfaceSize },
                }))
              }
              className={compactInputClass}
            >
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="wide">Wide</option>
              <option value="fullscreen">Fullscreen</option>
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1">
          {host.onOpenFullscreen && (
            <button
              type="button"
              data-no-drag
              onClick={() => breakdown.a2ui && host.onOpenFullscreen?.(breakdown.a2ui)}
              className={primaryBtnClass}
            >
              Fullscreen
            </button>
          )}
          {(onPopOut || onDock || onChat) && (
            <div className="col-span-2 flex justify-end">
              <DockModeControl
                mode="chat"
                onChange={next => {
                  if (next === 'floating') onPopOut?.();
                  else if (next === 'toolshelf') onDock?.();
                  else onChat?.();
                }}
              />
            </div>
          )}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 9. Hatch Studio surface (`a2ui.kind === 'hatch-studio'`)
  if (breakdown.kind === 'hatch-studio') {
    const hatchSpec = breakdown.a2ui?.hatchStudio;
    const surface = breakdown.a2ui;
    const patternOptions = QUICK_HATCH_PATTERNS.includes(hatchPattern)
      ? [...QUICK_HATCH_PATTERNS]
      : [hatchPattern, ...QUICK_HATCH_PATTERNS];
    const hatchOptions = {
      patternName: hatchPattern,
      scale: hatchScale,
      angleDeg: hatchAngle,
      opacity: hatchSpec?.opacity ?? 0.45,
      color: hatchSpec?.color,
      layer: hatchSpec?.layer,
    };
    const circleCount =
      hatchSpec?.target === 'circles' ? host.onCountHatchCircles?.() : undefined;
    const canHatchCircles =
      hatchSpec?.target === 'circles' &&
      (circleCount ?? 0) > 0 &&
      Boolean(host.onHatchCircles);
    const openInDialog =
      onPopOut ??
      (surface && host.onOpenFullscreen ? () => host.onOpenFullscreen?.(surface) : undefined);

    const openHatchNumbersAtCursor = () => {
      openCanvasFlashForInputForm({
        id: 'hatch-numbers',
        form: {
          title: 'Hatch numbers',
          description: `${hatchPattern} · leave blank to keep current`,
          fields: [
            {
              id: 'scale',
              label: 'Scale',
              type: 'number',
              unit: '×',
              placeholder: formatHatchNumber(hatchScale),
              hint: 'Current scale',
            },
            {
              id: 'angle',
              label: 'Angle',
              type: 'number',
              unit: '°',
              placeholder: formatHatchNumber(hatchAngle),
              hint: 'Current angle',
            },
          ],
          submitLabel: 'Use values',
        },
        onSubmit: text => {
          const scaleMatch = text.match(/Scale:\s*(-?\d+(?:\.\d+)?)/i);
          const angleMatch = text.match(/Angle:\s*(-?\d+(?:\.\d+)?)/i);
          const nextScale = scaleMatch ? Math.max(0.05, Number(scaleMatch[1])) : hatchScale;
          const nextAngle = angleMatch ? Number(angleMatch[1]) : hatchAngle;
          setHatchScale(nextScale);
          setHatchAngle(nextAngle);
          flashCanvasMessage(
            `Hatch numbers set: ${formatHatchNumber(nextScale)}× at ${formatHatchNumber(nextAngle)}°.`,
            { tone: 'success' },
          );
        },
      });
    };

    return (
      <div data-testid="quick-thought-hatch-studio" className="mt-2.5 space-y-1.5">
        <div className="flex items-stretch gap-1.5">
          <select
            aria-label="Hatch pattern"
            data-no-drag
            value={hatchPattern}
            onChange={e => setHatchPattern(e.target.value)}
            className={`${compactInputClass} min-w-0 flex-1`}
          >
            {patternOptions.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-no-drag
            onClick={openHatchNumbersAtCursor}
            title="Set hatch scale and angle at the cursor"
            className={`${btnClass} shrink-0 font-mono`}
          >
            {formatHatchNumber(hatchScale)}× · {formatHatchNumber(hatchAngle)}°
          </button>
        </div>

        <p className="text-[9.5px] leading-snug text-white/50">
          {hatchSpec?.target === 'circles'
            ? circleCount == null
              ? 'Visible circles will use these settings.'
              : `${circleCount} circle${circleCount === 1 ? '' : 's'} visible · ${hatchSpec?.layer ?? 'current layer'}`
            : `${hatchSpec?.layer ?? 'Current layer'} · choose an area or closed objects`}
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {canHatchCircles ? (
            <button
              type="button"
              data-no-drag
              data-testid="quick-thought-hatch-circles"
              onClick={() => host.onHatchCircles?.(hatchOptions)}
              className={primaryBtnClass}
            >
              Hatch {circleCount ?? 0} circle{circleCount === 1 ? '' : 's'}
            </button>
          ) : (
            <button
              type="button"
              data-no-drag
              data-testid="quick-thought-hatch-area"
              disabled={!host.onStartCanvasHatch}
              onClick={() => host.onStartCanvasHatch?.({ ...hatchOptions, mode: 'pick-area' })}
              className={primaryBtnClass}
            >
              Pick area
            </button>
          )}
          <button
            type="button"
            data-no-drag
            data-testid="quick-thought-hatch-select"
            disabled={!host.onStartCanvasHatch}
            onClick={() => host.onStartCanvasHatch?.({ ...hatchOptions, mode: 'select-object' })}
            className={btnClass}
          >
            Select objects
          </button>
          {host.onApplyHatchToSelection && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onApplyHatchToSelection?.(hatchOptions)}
              className={btnClass}
            >
              Use selection
            </button>
          )}
          {openInDialog && (
            <button
              type="button"
              data-no-drag
              data-testid="quick-thought-hatch-dialog"
              onClick={openInDialog}
              className={btnClass}
            >
              Open as dialog
            </button>
          )}
        </div>

        {hatchSpec?.target === 'circles' && circleCount === 0 && (
          <p className="text-[10px] leading-snug text-sky-200/80">
            No circles found on this drawing — pick an area or select the objects to hatch.
          </p>
        )}
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 10. Workspace Tool surface (`a2ui.kind === 'workspace-tool'`)
  if (breakdown.kind === 'workspace-tool' && breakdown.a2ui) {
    const toolId = breakdown.a2ui.workspaceTool ?? breakdown.a2ui.widgetType;
    const toolLabel =
      (toolId in WORKSPACE_TOOL_LABELS
        ? WORKSPACE_TOOL_LABELS[toolId as keyof typeof WORKSPACE_TOOL_LABELS]
        : null) ?? 'Workspace Tool';

    return (
      <div data-testid="quick-thought-workspace-tool" className="mt-2.5 space-y-1.5">
        {toolId === 'legend' && <LegendQuickActions showAddAll={false} />}
        <div className="grid grid-cols-2 gap-1.5">
          {(onPopOut || onDock || onChat) && (
            <div className="col-span-2 flex justify-end">
              <DockModeControl
                mode="chat"
                onChange={next => {
                  if (next === 'floating') onPopOut?.();
                  else if (next === 'toolshelf') onDock?.();
                  else onChat?.();
                }}
              />
            </div>
          )}
          {host.onOpenFullscreen && (
            <button
              type="button"
              data-no-drag
              onClick={() => breakdown.a2ui && host.onOpenFullscreen?.(breakdown.a2ui)}
              className={btnClass}
            >
              Fullscreen
            </button>
          )}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 10. CACP review / manifests surface (`a2ui.kind === 'cacp-review' | 'cacp-manifests'`)
  if (breakdown.kind === 'cacp-surface' && breakdown.a2ui) {
    const items = breakdown.a2ui.cacpReview?.items ?? [];
    return (
      <div data-testid="quick-thought-cacp-surface" className="mt-2.5 space-y-1.5">
        {!breakdown.datasetTooLarge && items.length > 0 && (
          <div className="space-y-1">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px]"
              >
                <span className="truncate font-mono text-white/80">{item.command}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {host.onRetryCacpItem && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => void host.onRetryCacpItem?.(item)}
                      className="rounded border border-cyan-400/40 bg-cyan-400/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-cyan-100 hover:bg-cyan-400/25"
                    >
                      Retry
                    </button>
                  )}
                  {host.onInspectCacpAgent && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => host.onInspectCacpAgent?.(item.to)}
                      className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-semibold text-white/80 hover:bg-white/[0.08]"
                    >
                      Manifest
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1">
          {host.onOpenFullscreen && (
            <button
              type="button"
              data-no-drag
              onClick={() => breakdown.a2ui && host.onOpenFullscreen?.(breakdown.a2ui)}
              className={primaryBtnClass}
            >
              Fullscreen
            </button>
          )}
          {(onPopOut || onDock || onChat) && (
            <div className="col-span-2 flex justify-end">
              <DockModeControl
                mode="chat"
                onChange={next => {
                  if (next === 'floating') onPopOut?.();
                  else if (next === 'toolshelf') onDock?.();
                  else onChat?.();
                }}
              />
            </div>
          )}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 11. PA E&S soil limitations report (`a2ui.kind === 'soil-limitations'`)
  if (breakdown.kind === 'soil-limitations' && breakdown.a2ui?.soilLimitations) {
    const report = breakdown.a2ui.soilLimitations;
    const unitCount = report.units.length;
    const acres =
      report.soilAcres > 0 && report.soilAcres < 0.01
        ? '<0.01'
        : report.soilAcres.toFixed(2);
    return (
      <div data-testid="quick-thought-soil-limitations" className="mt-2.5 space-y-1.5">
        <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold text-amber-100">
              PA E&amp;S soil limitations
            </span>
            <span className="shrink-0 text-[10px] text-white/60">
              {unitCount} unit{unitCount === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-white/70">
            {acres} ac · {report.areaLabel}
            {!report.boundaryPresent ? ' · project AOI' : ''}
          </p>
        </div>

        <div className="space-y-1">
          {report.units.slice(0, 3).map((unit, index) => {
            const limitationLabels = unit.limitations.map(item =>
              item.label + (item.valueLabel ? ` (${item.valueLabel})` : ''),
            );
            return (
              <div
                key={`${unit.mukey}-${unit.musym}-${index}`}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] text-white/85">
                    <span className="font-mono font-semibold text-stone-200">
                      {unit.musym || '—'}
                    </span>{' '}
                    {unit.muname || unit.seriesName}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-white/50">
                    {unit.acres.toFixed(2)} ac
                  </span>
                </div>
                <p
                  className="mt-0.5 truncate text-[9.5px] text-amber-200/80"
                  title={
                    limitationLabels.length > 0
                      ? limitationLabels.join('; ')
                      : 'No Table E.1 limitations marked'
                  }
                >
                  {limitationLabels.length > 0
                    ? limitationLabels.join('; ')
                    : 'No Table E.1 limitations marked'}
                </p>
              </div>
            );
          })}
        </div>
        {unitCount > 3 && (
          <p className="text-[9.5px] text-white/45">
            +{unitCount - 3} more map unit{unitCount - 3 === 1 ? '' : 's'} in the full report
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {host.onDownloadSoilLimitations && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onDownloadSoilLimitations?.()}
              disabled={host.isDownloadingSoilLimitations}
              className={primaryBtnClass}
            >
              {host.isDownloadingSoilLimitations ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
          {host.onAddSoilLimitationsToSheet && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onAddSoilLimitationsToSheet?.()}
              className={btnClass}
            >
              Add to sheet
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {host.onOpenFullscreen && (
            <button
              type="button"
              data-no-drag
              onClick={() => breakdown.a2ui && host.onOpenFullscreen?.(breakdown.a2ui)}
              className={btnClass}
            >
              Fullscreen
            </button>
          )}
          {(onPopOut || onDock || onChat) && (
            <div className="flex justify-end">
              <DockModeControl
                mode="chat"
                onChange={next => {
                  if (next === 'floating') onPopOut?.();
                  else if (next === 'toolshelf') onDock?.();
                  else onChat?.();
                }}
              />
            </div>
          )}
        </div>
        <OpenChatFooter onOpenConversation={onOpenConversation} />
      </div>
    );
  }

  // 12. Large dataset fallback (`standards-explorer` table or > MAX_QUICK_THOUGHT_OPTIONS items)
  if (breakdown.a2ui?.kind === 'standards-explorer') {
    return (
      <div data-testid="quick-thought-standards-explorer" className="mt-2.5 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          {host.onOpenSpreadsheetEditor && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onOpenSpreadsheetEditor?.()}
              className={primaryBtnClass}
            >
              Edit spreadsheet
            </button>
          )}
          {host.onOpenCadWorkspace && (
            <button
              type="button"
              data-no-drag
              onClick={() => host.onOpenCadWorkspace?.()}
              className={btnClass}
            >
              CAD Workspace
            </button>
          )}
          {(onPopOut || onDock || onChat) && (
            <div className="col-span-2 flex justify-end">
              <DockModeControl
                mode="chat"
                onChange={next => {
                  if (next === 'floating') onPopOut?.();
                  else if (next === 'toolshelf') onDock?.();
                  else onChat?.();
                }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          data-no-drag
          onClick={onOpenConversation}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
        >
          Review the panel
          <span aria-hidden="true" className="text-white/70">
            →
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-no-drag
      onClick={onOpenConversation}
      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
    >
      {message.needsInput
        ? 'Answer in chat'
        : breakdown.a2ui
          ? 'Review the panel'
          : 'Read full answer'}
      <span aria-hidden="true" className="text-white/70">
        →
      </span>
    </button>
  );
};

export default A2UIQuickThoughtSurface;
