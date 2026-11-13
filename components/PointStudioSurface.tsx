import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Paintbrush,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import type {
  A2UIPointStudioFocus,
  A2UIPointStudioSpec,
  PointEfficiencyStyle,
  PointHighlightStyle,
  PointLabelStyle,
  PointList,
  PointMarkerShape,
  PointMarkerStyle,
  PointStudioState,
  PointStyle,
  PointStyleAssignment,
  PointStyleTarget,
} from '../types.ts';
import {
  clonePointStudioState,
  createPointStyle,
  createStyleAssignment,
  exportPointStylePack,
  getBuiltinPointStyle,
  getPointStyleUsage,
  clampNumber,
  isCssColor,
  mergePointStylePack,
  parsePointStylePack,
  SURVEY_STANDARD_STYLE_ID,
} from '../services/pointStyles.ts';
import { collectPointPrimitiveCells, getPointDotSize } from '../utils/pointEfficiency.ts';

export interface PointStudioSurfaceProps {
  state: PointStudioState;
  pointLists: PointList[];
  onChange: (next: PointStudioState) => void;
  onNotify?: (message: string, tone?: 'info' | 'error') => void;
  /** Deep-link and optional patch from a conversational A2UI request. */
  a2uiSpec?: A2UIPointStudioSpec;
}

type StudioTab = 'marker' | 'labels' | 'efficiency' | 'assignments' | 'export';
type SaveStatus = 'saved' | 'pending' | 'error';
type AssignmentKind = PointStyleTarget['kind'];

const TAB_LABELS: Array<{ id: StudioTab; label: string }> = [
  { id: 'marker', label: 'Marker' },
  { id: 'labels', label: 'Labels' },
  { id: 'efficiency', label: 'Efficiency' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'export', label: 'Export' },
];

const MARKER_SHAPES: PointMarkerShape[] = ['dot', 'circle', 'square', 'triangle', 'cross', 'x', 'diamond', 'ring'];

const BUILTIN_IDS = new Set(['builtin-survey-standard', 'builtin-boundary', 'builtin-topo', 'builtin-stakeout', 'builtin-presentation']);

const inputClass =
  'w-full rounded-md border border-white/[0.09] bg-black/30 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-fuchsia-400/60';
const labelClass = 'mb-1 block text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500';
const smallButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.035] px-2 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white';
const primaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-fuchsia-400/35 bg-fuchsia-500/15 px-2.5 py-1.5 text-[10.5px] font-bold text-fuchsia-100 transition-colors hover:border-fuchsia-300/60 hover:bg-fuchsia-500/25';

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
  settingId?: string;
  highlight?: boolean;
}> = ({ label, value, min, max, step = 1, onChange, suffix, settingId, highlight }) => (
  <label
    data-point-setting={settingId}
    className={highlight ? 'block rounded-md bg-fuchsia-500/[0.07] p-1 ring-1 ring-fuchsia-400/40' : 'block'}
  >
    <span className={labelClass}>{label}</span>
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? value : min}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(Number(event.target.value))}
        className={inputClass}
      />
      {suffix && <span className="shrink-0 text-[9.5px] text-slate-500">{suffix}</span>}
    </div>
  </label>
);

const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  settingId?: string;
  highlight?: boolean;
}> = ({ label, value, onChange, settingId, highlight }) => (
  <label
    data-point-setting={settingId}
    className={highlight ? 'block rounded-md bg-fuchsia-500/[0.07] p-1 ring-1 ring-fuchsia-400/40' : 'block'}
  >
    <span className={labelClass}>{label}</span>
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
        onChange={event => onChange(event.target.value)}
        aria-label={`${label} color picker`}
        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        className={`${inputClass} font-mono`}
      />
    </div>
  </label>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}> = ({ label, checked, onChange, hint }) => (
  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-fuchsia-400"
    />
    <span>
      <span className="block text-[10.5px] font-medium text-slate-200">{label}</span>
      {hint && <span className="mt-0.5 block text-[9.5px] leading-snug text-slate-500">{hint}</span>}
    </span>
  </label>
);

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2.5">
    <div className="mb-2">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">{title}</h4>
      {hint && <p className="mt-0.5 text-[9.5px] leading-snug text-slate-500">{hint}</p>}
    </div>
    {children}
  </section>
);

// ─── Preview ────────────────────────────────────────────────────────────────

interface PreviewPoint {
  x: number;
  y: number;
  pn: string;
  elev: string;
  desc: string;
}

function buildPreviewPoints(count: number): PreviewPoint[] {
  const sampleCount = Math.min(Math.max(1, count), 6000);
  const points: PreviewPoint[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < sampleCount; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand());
    const x = 0.5 + Math.cos(angle) * radius * 0.38 + (rand() - 0.5) * 0.02;
    const y = 0.5 + Math.sin(angle) * radius * 0.32 + (rand() - 0.5) * 0.02;
    points.push({
      x,
      y,
      pn: String(1000 + i),
      elev: `${1240 + Math.round(rand() * 40)}.${String(Math.round(rand() * 99)).padStart(2, '0')}`,
      desc: ['MH', 'TREE', 'IP', 'FL', 'CL'][i % 5],
    });
  }
  return points;
}

const StylePreview: React.FC<{
  style: PointStyle;
  count: number;
  zoom: number;
  forceCompressed: boolean;
  forceLabels: boolean;
}> = ({ style, count, zoom, forceCompressed, forceLabels }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => buildPreviewPoints(count), [count]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Hidden surfaces and jsdom have no layout box; skip the draw entirely.
    if (canvas.clientWidth === 0 && canvas.clientHeight === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth || 520;
    const height = canvas.clientHeight || 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#070d16';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const scale = 0.82 * Math.min(1.6, Math.max(0.55, zoom / 2));
    const projected = points.map(point => ({
      x: width / 2 + (point.x - 0.5) * width * scale,
      y: height / 2 + (point.y - 0.5) * height * scale,
    }));
    const compressed = forceCompressed || (
      style.efficiency.enabled
      && (zoom < style.efficiency.detailScaleCutoff || count > style.efficiency.screenPointBudget)
    );

    if (compressed) {
      const cells = collectPointPrimitiveCells(projected, style.efficiency.cellSizePx);
      ctx.globalAlpha = style.efficiency.opacity;
      ctx.fillStyle = style.efficiency.color;
      for (const cell of cells.values()) {
        const size = getPointDotSize(style.efficiency, cell.count);
        if (style.efficiency.dotShape === 'circle') {
          ctx.beginPath();
          ctx.arc(cell.x + size / 2, cell.y + size / 2, size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(cell.x, cell.y, size, size);
        }
      }
      ctx.globalAlpha = 1;
    } else {
      const marker = style.marker;
      ctx.globalAlpha = marker.opacity;
      for (let index = 0; index < projected.length; index += 1) {
        const { x, y } = projected[index];
        ctx.fillStyle = marker.color;
        ctx.strokeStyle = marker.strokeColor;
        ctx.lineWidth = marker.strokeWidthPx;
        ctx.beginPath();
        const half = marker.sizePx / 2;
        switch (marker.shape) {
          case 'dot':
            ctx.arc(x, y, Math.max(1, half * 0.55), 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'circle':
            ctx.arc(x, y, half, 0, Math.PI * 2);
            ctx.fill();
            if (marker.strokeWidthPx > 0) ctx.stroke();
            break;
          case 'ring':
            ctx.arc(x, y, half, 0, Math.PI * 2);
            if (marker.strokeWidthPx > 0) ctx.stroke();
            break;
          case 'square':
            ctx.rect(x - half, y - half, marker.sizePx, marker.sizePx);
            ctx.fill();
            if (marker.strokeWidthPx > 0) ctx.stroke();
            break;
          case 'triangle':
            ctx.moveTo(x, y - half);
            ctx.lineTo(x - half, y + half);
            ctx.lineTo(x + half, y + half);
            ctx.closePath();
            ctx.fill();
            break;
          case 'diamond':
            ctx.moveTo(x, y - half);
            ctx.lineTo(x + half, y);
            ctx.lineTo(x, y + half);
            ctx.lineTo(x - half, y);
            ctx.closePath();
            ctx.fill();
            break;
          case 'cross':
            ctx.moveTo(x - half, y);
            ctx.lineTo(x + half, y);
            ctx.moveTo(x, y - half);
            ctx.lineTo(x, y + half);
            ctx.stroke();
            break;
          case 'x':
            ctx.moveTo(x - half, y - half);
            ctx.lineTo(x + half, y + half);
            ctx.moveTo(x + half, y - half);
            ctx.lineTo(x - half, y + half);
            ctx.stroke();
            break;
          default:
            ctx.arc(x, y, Math.max(1, half * 0.55), 0, Math.PI * 2);
            ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (!forceLabels && style.efficiency.suppressLabels) {
        // compressed only; labels always render in the uncompressed preview
      }
      const labels = style.labels;
      const showLabels = !compressed || forceLabels || !style.efficiency.suppressLabels;
      if (showLabels && (labels.showPointNumber || labels.showElevation || labels.showDescription)) {
        const fontSize = Math.max(6, Math.min(14, labels.fontSizePx * 0.72));
        ctx.font = `${fontSize}px ${labels.fontFamily || 'Arial'}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let index = 0; index < projected.length; index += 1) {
          if (projected.length > 1200 && index % 6 !== 0) continue;
          const point = points[index];
          const { x, y } = projected[index];
          let offsetY = -fontSize;
          if (labels.showPointNumber) {
            ctx.fillStyle = labels.pointNumberColor;
            ctx.fillText(point.pn, x + labels.offsetXPx, y + labels.offsetYPx + offsetY);
            offsetY += fontSize;
          }
          if (labels.showElevation) {
            ctx.fillStyle = labels.elevationColor;
            ctx.fillText(point.elev, x + labels.offsetXPx, y + labels.offsetYPx + offsetY);
            offsetY += fontSize;
          }
          if (labels.showDescription) {
            ctx.fillStyle = labels.descriptionColor;
            ctx.fillText(point.desc, x + labels.offsetXPx, y + labels.offsetYPx + offsetY);
          }
        }
      }
    }

    ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const cellCount = compressed
      ? collectPointPrimitiveCells(projected, style.efficiency.cellSizePx).size
      : 0;
    ctx.fillText(
      compressed
        ? `compressed · ${cellCount.toLocaleString()} dots · ${Math.min(count, points.length).toLocaleString()} sampled`
        : `detail · ${Math.min(count, points.length).toLocaleString()} points · ${Math.max(0, Math.round(zoom * 100))}% zoom`,
      8,
      8,
    );
  }, [style, points, count, zoom, forceCompressed, forceLabels]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Point Studio live preview"
      className="h-[220px] w-full rounded-lg border border-white/[0.08] bg-[#070d16]"
    />
  );
};

// ─── Surface ────────────────────────────────────────────────────────────────

export const PointStudioSurface: React.FC<PointStudioSurfaceProps> = ({
  state,
  pointLists,
  onChange,
  onNotify,
  a2uiSpec,
}) => {
  const [draft, setDraft] = useState<PointStudioState>(() => clonePointStudioState(state));
  const draftRef = useRef(draft);
  const [activeStyleId, setActiveStyleId] = useState(() => {
    const requested = a2uiSpec?.styleId
      ? state.styles.find(style => style.id === a2uiSpec.styleId)
      : undefined;
    return requested?.id ?? state.defaultStyleId;
  });
  const [tab, setTab] = useState<StudioTab>(a2uiSpec?.tab ?? 'marker');
  const [focusedSetting, setFocusedSetting] = useState<A2UIPointStudioFocus | null>(a2uiSpec?.focus ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [statusMessage, setStatusMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [newStyleName, setNewStyleName] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [previewCount, setPreviewCount] = useState(5000);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [forceCompressed, setForceCompressed] = useState(false);
  const [forceLabels, setForceLabels] = useState(false);
  const [assignmentKind, setAssignmentKind] = useState<AssignmentKind>('point-list');
  const [assignmentTarget, setAssignmentTarget] = useState('');
  const [assignmentMatchMode, setAssignmentMatchMode] = useState<'exact' | 'wildcard'>('exact');
  const [canUndo, setCanUndo] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const undoRef = useRef<PointStudioState[]>([]);
  const burstRef = useRef<string | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<PointStudioState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appliedA2UISpecRef = useRef<A2UIPointStudioSpec | null>(null);

  const activeStyle = useMemo(
    () => draft.styles.find(style => style.id === activeStyleId)
      ?? draft.styles.find(style => style.id === draft.defaultStyleId)
      ?? draft.styles[0],
    [draft, activeStyleId],
  );

  useEffect(() => {
    if (pendingRef.current) return;
    const next = clonePointStudioState(state);
    draftRef.current = next;
    setDraft(next);
    setActiveStyleId(current => (
      next.styles.some(style => style.id === current) ? current : next.defaultStyleId
    ));
  }, [state]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
  }, []);

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setStatusMessage({ tone, text });
    onNotify?.(text, tone);
  }, [onNotify]);

  const commit = useCallback((next: PointStudioState, coalesceKey: string, addUndo = true) => {
    if (addUndo && burstRef.current !== coalesceKey) {
      undoRef.current = [...undoRef.current.slice(-49), clonePointStudioState(draftRef.current)];
      setCanUndo(true);
    }
    burstRef.current = coalesceKey;
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(() => {
      burstRef.current = null;
    }, 500);

    draftRef.current = next;
    setDraft(next);
    pendingRef.current = next;
    setSaveStatus('pending');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        try {
          onChange(pending);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
          notify('Could not save the point style. Your edit is still open.', 'error');
        }
      }
    }, 200);
  }, [notify, onChange]);

  // A conversational request selects its target style/tab and applies only the
  // values the user actually named. The regular controls remain the source of
  // truth, so the user can immediately fine-tune or undo the change.
  useEffect(() => {
    if (!a2uiSpec || appliedA2UISpecRef.current === a2uiSpec) return;
    appliedA2UISpecRef.current = a2uiSpec;
    if (a2uiSpec.tab) setTab(a2uiSpec.tab);
    if (a2uiSpec.focus) setFocusedSetting(a2uiSpec.focus);

    const requestedStyleId = a2uiSpec.styleId
      && draftRef.current.styles.some(style => style.id === a2uiSpec.styleId)
      ? a2uiSpec.styleId
      : undefined;
    if (requestedStyleId) setActiveStyleId(requestedStyleId);

    const hasPatch = Boolean(
      a2uiSpec.marker
      || a2uiSpec.labels
      || a2uiSpec.efficiency
      || a2uiSpec.sizeScale !== undefined
      || a2uiSpec.labelSizeScale !== undefined,
    );
    if (!hasPatch) return;

    const next = clonePointStudioState(draftRef.current);
    const targetId = requestedStyleId ?? next.defaultStyleId;
    const style = next.styles.find(candidate => candidate.id === targetId);
    if (!style) return;
    if (a2uiSpec.marker) style.marker = { ...style.marker, ...a2uiSpec.marker };
    if (a2uiSpec.labels) style.labels = { ...style.labels, ...a2uiSpec.labels };
    if (a2uiSpec.efficiency) style.efficiency = { ...style.efficiency, ...a2uiSpec.efficiency };
    if (a2uiSpec.sizeScale !== undefined) {
      const scale = clampNumber(a2uiSpec.sizeScale, 0.25, 2, 1);
      style.marker.sizePx = clampNumber(style.marker.sizePx * scale, 1, 32, style.marker.sizePx);
      style.efficiency.minDotSizePx = clampNumber(style.efficiency.minDotSizePx * scale, 1, 32, style.efficiency.minDotSizePx);
      style.efficiency.maxDotSizePx = clampNumber(style.efficiency.maxDotSizePx * scale, style.efficiency.minDotSizePx, 32, style.efficiency.maxDotSizePx);
    }
    if (a2uiSpec.labelSizeScale !== undefined) {
      const scale = clampNumber(a2uiSpec.labelSizeScale, 0.25, 2, 1);
      style.labels.fontSizePx = clampNumber(style.labels.fontSizePx * scale, 6, 48, style.labels.fontSizePx);
    }

    const now = new Date().toISOString();
    style.updatedAt = now;
    next.updatedAt = now;
    commit(next, `a2ui-point-style-${Date.now()}`, true);
    notify(`Applied ${a2uiSpec.summary ?? 'the requested point style change'}.`);
  }, [a2uiSpec, commit, notify]);

  useEffect(() => {
    if (!focusedSetting) return;
    const target = document.querySelector<HTMLElement>(`[data-point-setting="${focusedSetting}"]`);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focusedSetting, tab]);

  const mutateActiveStyle = useCallback((
    mutator: (style: PointStyle) => void,
    coalesceKey: string,
  ) => {
    const next = clonePointStudioState(draftRef.current);
    const style = next.styles.find(candidate => candidate.id === activeStyleId);
    if (!style) return;
    mutator(style);
    style.updatedAt = new Date().toISOString();
    next.updatedAt = style.updatedAt;
    commit(next, coalesceKey);
  }, [activeStyleId, commit]);

  const undo = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    pendingRef.current = null;
    const previous = undoRef.current.pop();
    if (!previous) return;
    setCanUndo(undoRef.current.length > 0);
    draftRef.current = previous;
    setDraft(previous);
    setActiveStyleId(current => previous.styles.some(style => style.id === current) ? current : previous.defaultStyleId);
    onChange(previous);
    setSaveStatus('saved');
  }, [onChange]);

  const selectStyle = (styleId: string) => {
    setActiveStyleId(styleId);
    setStatusMessage(null);
    setTab('marker');
  };

  const createStyle = (base?: PointStyle) => {
    const name = newStyleName.trim() || (base ? `${base.name} copy` : 'New style');
    const next = clonePointStudioState(draftRef.current);
    if (next.styles.some(style => style.name.trim().toUpperCase() === name.toUpperCase())) {
      notify(`A style named "${name}" already exists.`, 'error');
      return;
    }
    const style = createPointStyle(name, base);
    next.styles.push(style);
    next.updatedAt = style.updatedAt;
    setNewStyleName('');
    setActiveStyleId(style.id);
    commit(next, `create-${style.id}`);
    notify(`Created "${name}".`);
  };

  const duplicateStyle = () => {
    if (activeStyle) createStyle(activeStyle);
  };

  const deleteStyle = () => {
    if (!activeStyle) return;
    if (activeStyle.id === draft.defaultStyleId) {
      notify('Choose another default style before deleting this one.', 'error');
      return;
    }
    const usage = getPointStyleUsage(draft, activeStyle.id);
    if (usage > 0) {
      notify(`"${activeStyle.name}" is used by ${usage} target${usage === 1 ? '' : 's'}. Reassign them first.`, 'error');
      return;
    }
    const next = clonePointStudioState(draftRef.current);
    next.styles = next.styles.filter(style => style.id !== activeStyle.id);
    next.updatedAt = new Date().toISOString();
    setActiveStyleId(next.defaultStyleId);
    commit(next, `delete-${activeStyle.id}`);
    notify(`Deleted "${activeStyle.name}".`);
  };

  const resetBuiltin = () => {
    if (!activeStyle) return;
    const builtin = getBuiltinPointStyle(activeStyle.id);
    if (!builtin) return;
    const next = clonePointStudioState(draftRef.current);
    const index = next.styles.findIndex(style => style.id === activeStyle.id);
    if (index === -1) return;
    next.styles[index] = builtin;
    next.updatedAt = new Date().toISOString();
    commit(next, `reset-${activeStyle.id}`);
    notify(`Reset "${builtin.name}" to its factory defaults.`);
  };

  const makeDefault = () => {
    if (!activeStyle) return;
    const next = clonePointStudioState(draftRef.current);
    next.defaultStyleId = activeStyle.id;
    next.updatedAt = new Date().toISOString();
    commit(next, `default-${activeStyle.id}`);
    notify(`"${activeStyle.name}" is now the project default.`);
  };

  const applyEfficiencyPreset = (preset: PointEfficiencyStyle['preset']) => {
    mutateActiveStyle(style => {
      const values: Record<string, Partial<PointEfficiencyStyle>> = {
        current: {
          detailScaleCutoff: 3,
          screenPointBudget: 240,
          cellSizePx: 4,
          dotShape: 'square',
          minDotSizePx: 2,
          maxDotSizePx: 4,
          densityGrowth: 1,
          color: '#FFD700',
          lightThemeColor: '#111827',
          opacity: 1,
        },
        performance: {
          detailScaleCutoff: 6,
          screenPointBudget: 120,
          cellSizePx: 5,
          dotShape: 'square',
          minDotSizePx: 2,
          maxDotSizePx: 3,
          densityGrowth: 0.75,
          color: '#FFD700',
          lightThemeColor: '#111827',
          opacity: 0.9,
        },
        balanced: {
          detailScaleCutoff: 4,
          screenPointBudget: 500,
          cellSizePx: 4,
          dotShape: 'square',
          minDotSizePx: 2,
          maxDotSizePx: 4,
          densityGrowth: 1,
          color: '#FFD700',
          lightThemeColor: '#111827',
          opacity: 1,
        },
        detail: {
          detailScaleCutoff: 2,
          screenPointBudget: 1500,
          cellSizePx: 3,
          dotShape: 'circle',
          minDotSizePx: 1.5,
          maxDotSizePx: 3,
          densityGrowth: 0.75,
          color: '#FFD700',
          lightThemeColor: '#111827',
          opacity: 1,
        },
        custom: {},
      };
      style.efficiency = { ...style.efficiency, ...(values[preset] ?? {}), preset };
    }, `efficiency-preset-${preset}`);
  };

  const addAssignment = () => {
    if (!activeStyle) return;
    const targetText = assignmentTarget.trim();
    if (!targetText) {
      notify('Choose or type a target first.', 'error');
      return;
    }
    let target: PointStyleTarget;
    switch (assignmentKind) {
      case 'point-list':
        target = { kind: 'point-list', listId: targetText };
        break;
      case 'description':
        target = { kind: 'description', match: targetText, matchMode: assignmentMatchMode };
        break;
      case 'layer':
        target = { kind: 'layer', layer: targetText };
        break;
      case 'point':
        target = { kind: 'point', pointNumber: targetText };
        break;
      default:
        return;
    }
    const next = clonePointStudioState(draftRef.current);
    const duplicate = next.assignments.some(assignment => {
      if (assignment.styleId !== activeStyle.id) return false;
      if (assignment.target.kind !== target.kind) return false;
      if (target.kind === 'point-list' && assignment.target.kind === 'point-list') return assignment.target.listId === target.listId;
      if (target.kind === 'description' && assignment.target.kind === 'description') {
        return assignment.target.match.toUpperCase() === target.match.toUpperCase();
      }
      if (target.kind === 'layer' && assignment.target.kind === 'layer') {
        return assignment.target.layer.toUpperCase() === target.layer.toUpperCase();
      }
      if (target.kind === 'point' && assignment.target.kind === 'point') {
        return assignment.target.pointNumber === target.pointNumber;
      }
      return false;
    });
    if (duplicate) {
      notify('That target already has this style.', 'error');
      return;
    }
    next.assignments.push(createStyleAssignment(target, activeStyle.id));
    next.updatedAt = new Date().toISOString();
    setAssignmentTarget('');
    commit(next, `assignment-${Date.now()}`);
    notify('Assignment added.');
  };

  const removeAssignment = (assignment: PointStyleAssignment) => {
    const next = clonePointStudioState(draftRef.current);
    next.assignments = next.assignments.filter(candidate => candidate.id !== assignment.id);
    next.updatedAt = new Date().toISOString();
    commit(next, `assignment-remove-${assignment.id}`);
  };

  const downloadPack = () => {
    const pack = exportPointStylePack(draft, true);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `landsurv-point-styles-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('Style pack downloaded.');
  };

  const importPack = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parsePointStylePack(JSON.parse(text));
      if (parsed.ok === false) {
        setImportError(parsed.error);
        return;
      }
      const next = mergePointStylePack(draftRef.current, parsed.pack);
      commit(next, `import-${Date.now()}`);
      notify(`Imported ${parsed.pack.styles.length} style${parsed.pack.styles.length === 1 ? '' : 's'}.`);
    } catch {
      setImportError('Could not read that style pack. Check that it is valid JSON.');
    }
  };

  const copyPack = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPointStylePack(draft, true), null, 2));
      notify('Style pack JSON copied.');
    } catch {
      notify('Clipboard access is unavailable in this browser.', 'error');
    }
  };

  const listName = useCallback((listId: string) => (
    pointLists.find(list => list.id === listId)?.name ?? listId
  ), [pointLists]);

  const assignmentTargets = useMemo(() => {
    const allPoints = pointLists.flatMap(list => list.points);
    switch (assignmentKind) {
      case 'point-list':
        return pointLists.map(list => ({ value: list.id, label: list.name }));
      case 'description':
        return [...new Set(allPoints.map(point => (point.description ?? '').trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 300)
          .map(code => ({ value: code, label: code }));
      case 'layer':
        return [...new Set(allPoints.map(point => (point.layer ?? '').trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
          .map(layer => ({ value: layer, label: layer }));
      case 'point':
        return allPoints
          .slice(0, 500)
          .map(point => ({ value: point.pointNumber, label: point.pointNumber }));
      default:
        return [];
    }
  }, [assignmentKind, pointLists]);

  const filteredStyles = useMemo(() => {
    const query = librarySearch.trim().toUpperCase();
    if (!query) return draft.styles;
    return draft.styles.filter(style => `${style.name} ${style.description ?? ''}`.toUpperCase().includes(query));
  }, [draft.styles, librarySearch]);

  const activeAssignments = useMemo(
    () => draft.assignments.filter(assignment => assignment.styleId === activeStyle?.id),
    [draft.assignments, activeStyle?.id],
  );
  const hasA2UIRequestPatch = Boolean(
    a2uiSpec?.marker
    || a2uiSpec?.labels
    || a2uiSpec?.efficiency
    || a2uiSpec?.sizeScale !== undefined
    || a2uiSpec?.labelSizeScale !== undefined,
  );

  if (!activeStyle) {
    return (
      <div className="p-4 text-xs text-slate-300" data-testid="point-studio-surface">
        Point Studio has no styles to edit.
      </div>
    );
  }

  const marker = activeStyle.marker;
  const labels = activeStyle.labels;
  const efficiency = activeStyle.efficiency;
  const highlights = activeStyle.highlights;

  return (
    <div
      data-testid="point-studio-surface"
      className="flex min-h-[620px] flex-col bg-[#0b111a] text-slate-200 light-theme:bg-gray-50 light-theme:text-gray-700"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200">
            <Paintbrush className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-slate-100">Point Studio</h2>
              <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-fuchsia-200">
                A2UI
              </span>
            </div>
            <p className="truncate text-[10px] text-slate-500">
              {activeStyle.name} · {getPointStyleUsage(draft, activeStyle.id)} assignment{getPointStyleUsage(draft, activeStyle.id) === 1 ? '' : 's'}
              {activeStyle.id === draft.defaultStyleId ? ' · Project default' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${
              saveStatus === 'pending'
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                : saveStatus === 'error'
                  ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                  : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            }`}
            data-testid="point-studio-save-status"
          >
            {saveStatus === 'pending' ? 'Saving…' : saveStatus === 'error' ? 'Save error' : <><Check className="h-2.5 w-2.5" /> Saved</>}
          </span>
          <button type="button" className={smallButtonClass} onClick={undo} disabled={!canUndo} title="Undo the last style edit">
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
          <button type="button" className={smallButtonClass} onClick={duplicateStyle} title="Duplicate the active style">
            <Copy className="h-3 w-3" />
            Duplicate
          </button>
        </div>
      </header>

      {a2uiSpec?.summary && (
        <div
          data-testid="point-studio-request"
          className="flex flex-wrap items-center gap-2 border-b border-fuchsia-400/20 bg-fuchsia-500/[0.08] px-3 py-1.5 text-[10px] text-fuchsia-100"
        >
          <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-fuchsia-300">A2UI request</span>
          <span className="flex-1">{a2uiSpec.summary}</span>
          <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-fuchsia-200">
            {hasA2UIRequestPatch ? 'Applied' : 'Focused'}
          </span>
        </div>
      )}

      {(statusMessage || importError) && (
        <div
          className={`flex items-start gap-1.5 border-b px-3 py-1.5 text-[10px] ${
            importError || statusMessage?.tone === 'error'
              ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
              : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
          }`}
          role={importError || statusMessage?.tone === 'error' ? 'alert' : 'status'}
        >
          {importError || statusMessage?.tone === 'error'
            ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            : <Check className="mt-0.5 h-3 w-3 shrink-0" />}
          <span className="flex-1">{importError ?? statusMessage?.text}</span>
          <button type="button" onClick={() => { setStatusMessage(null); setImportError(null); }} className="text-current opacity-60 hover:opacity-100" aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 p-2.5 md:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="min-h-0 rounded-lg border border-white/[0.07] bg-black/20 p-2">
          <div className="mb-2 flex items-center justify-between gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Style library</span>
            <span className="text-[9px] text-slate-600">{draft.styles.length}</span>
          </div>
          <input
            type="search"
            value={librarySearch}
            onChange={event => setLibrarySearch(event.target.value)}
            placeholder="Search styles…"
            aria-label="Search point styles"
            className={`${inputClass} mb-2`}
          />
          <div className="max-h-[310px] space-y-1 overflow-y-auto pr-0.5">
            {filteredStyles.map(style => {
              const usage = getPointStyleUsage(draft, style.id);
              const selected = style.id === activeStyle.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => selectStyle(style.id)}
                  aria-pressed={selected}
                  className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                    selected
                      ? 'border-fuchsia-400/45 bg-fuchsia-500/12'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                      style={{ backgroundColor: style.marker.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-slate-200">{style.name}</span>
                    {style.id === draft.defaultStyleId && <Star className="h-2.5 w-2.5 shrink-0 fill-amber-300 text-amber-300" />}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-1 text-[8.5px] text-slate-500">
                    <span className="capitalize">{style.source}</span>
                    <span>{usage > 0 ? `${usage} use${usage === 1 ? '' : 's'}` : 'unused'}</span>
                  </span>
                </button>
              );
            })}
            {filteredStyles.length === 0 && (
              <p className="px-1 py-2 text-[10px] text-slate-500">No styles match.</p>
            )}
          </div>
          <div className="mt-2 space-y-1.5 border-t border-white/[0.07] pt-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={newStyleName}
                onChange={event => setNewStyleName(event.target.value)}
                placeholder="New style name"
                aria-label="New point style name"
                className={`${inputClass} min-w-0`}
              />
              <button type="button" onClick={() => createStyle()} className={primaryButtonClass} title="Create a new style">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={makeDefault} className={smallButtonClass} disabled={activeStyle.id === draft.defaultStyleId}>
                <Star className="h-3 w-3" />
                Default
              </button>
              {BUILTIN_IDS.has(activeStyle.id) && (
                <button type="button" onClick={resetBuiltin} className={smallButtonClass} title="Reset this built-in style">
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
              <button type="button" onClick={deleteStyle} className={`${smallButtonClass} text-rose-200`} title="Delete this style">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-2.5">
          <div className="rounded-lg border border-white/[0.07] bg-black/20 p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Live preview</span>
              <div className="flex flex-wrap items-center gap-2 text-[9.5px] text-slate-400">
                <label className="flex items-center gap-1">
                  Points
                  <select
                    value={previewCount}
                    onChange={event => setPreviewCount(Number(event.target.value))}
                    aria-label="Preview point count"
                    className="rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[9.5px] text-slate-200"
                  >
                    <option value={500}>500</option>
                    <option value={5000}>5,000</option>
                    <option value={50000}>50,000</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Zoom
                  <input
                    type="range"
                    min={0.5}
                    max={20}
                    step={0.5}
                    value={previewZoom}
                    onChange={event => setPreviewZoom(Number(event.target.value))}
                    aria-label="Preview zoom"
                    className="w-20 accent-fuchsia-400"
                  />
                  <span className="w-8 font-mono text-[9px] text-slate-400">{previewZoom.toFixed(1)}×</span>
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={forceCompressed} onChange={event => setForceCompressed(event.target.checked)} className="h-3 w-3 accent-fuchsia-400" />
                  Force compressed
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={forceLabels} onChange={event => setForceLabels(event.target.checked)} className="h-3 w-3 accent-fuchsia-400" />
                  Force labels
                </label>
              </div>
            </div>
            <StylePreview
              style={activeStyle}
              count={previewCount}
              zoom={previewZoom}
              forceCompressed={forceCompressed}
              forceLabels={forceLabels}
            />
          </div>

          <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.015]">
            <div className="flex overflow-x-auto border-b border-white/[0.07] px-1">
              {TAB_LABELS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-pressed={tab === item.id}
                  className={`relative shrink-0 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                    tab === item.id ? 'text-fuchsia-200' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {item.label}
                  {tab === item.id && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-fuchsia-400" />}
                </button>
              ))}
            </div>

            <div className="max-h-[370px] overflow-y-auto p-2.5">
              {tab === 'marker' && (
                <div className="space-y-2.5">
                  <Section title="Glyph" hint="Marker size is screen-space; symbols and annotations keep their own scale.">
                    <div
                      data-point-setting="marker-shape"
                      className={`mb-2 flex flex-wrap gap-1 ${focusedSetting === 'marker-shape' ? 'rounded-md bg-fuchsia-500/[0.07] p-1 ring-1 ring-fuchsia-400/40' : ''}`}
                    >
                      {MARKER_SHAPES.map(shape => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => mutateActiveStyle(style => { style.marker.shape = shape; }, 'marker-shape')}
                          aria-pressed={marker.shape === shape}
                          className={`rounded border px-2 py-1 text-[9.5px] capitalize ${
                            marker.shape === shape
                              ? 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100'
                              : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {shape}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Size" value={marker.sizePx} min={1} max={32} step={0.5} suffix="px" settingId="marker-size" highlight={focusedSetting === 'marker-size'} onChange={value => mutateActiveStyle(style => { style.marker.sizePx = value; }, 'marker-size')} />
                      <NumberField label="Stroke width" value={marker.strokeWidthPx} min={0} max={4} step={0.25} suffix="px" settingId="marker-stroke-width" highlight={focusedSetting === 'marker-stroke-width'} onChange={value => mutateActiveStyle(style => { style.marker.strokeWidthPx = value; }, 'marker-stroke-width')} />
                      <ColorField label="Fill" value={marker.color} settingId="marker-fill" highlight={focusedSetting === 'marker-fill'} onChange={value => mutateActiveStyle(style => { style.marker.color = value; }, 'marker-color')} />
                      <ColorField label="Light theme fill" value={marker.lightThemeColor || marker.color} settingId="marker-light-fill" highlight={focusedSetting === 'marker-light-fill'} onChange={value => mutateActiveStyle(style => { style.marker.lightThemeColor = value; }, 'marker-light-color')} />
                      <ColorField label="Stroke" value={marker.strokeColor} settingId="marker-stroke" highlight={focusedSetting === 'marker-stroke'} onChange={value => mutateActiveStyle(style => { style.marker.strokeColor = value; }, 'marker-stroke-color')} />
                      <NumberField label="Opacity" value={marker.opacity} min={0} max={1} step={0.05} settingId="marker-opacity" highlight={focusedSetting === 'marker-opacity'} onChange={value => mutateActiveStyle(style => { style.marker.opacity = value; }, 'marker-opacity')} />
                    </div>
                  </Section>
                  <Section title="Selection & hover">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Toggle label="Selection ring" checked={highlights.selectionRing.enabled} onChange={value => mutateActiveStyle(style => { style.highlights.selectionRing.enabled = value; }, 'selection-enabled')} />
                      <ColorField label="Selection color" value={highlights.selectionRing.color} onChange={value => mutateActiveStyle(style => { style.highlights.selectionRing.color = value; }, 'selection-color')} />
                      <Toggle label="Hover ring" checked={highlights.hoverRing.enabled} onChange={value => mutateActiveStyle(style => { style.highlights.hoverRing.enabled = value; }, 'hover-enabled')} />
                      <ColorField label="Hover color" value={highlights.hoverRing.color} onChange={value => mutateActiveStyle(style => { style.highlights.hoverRing.color = value; }, 'hover-color')} />
                    </div>
                  </Section>
                  <Section title="Canvas overlays">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Toggle label="Shrinkwrap badges" checked={highlights.shrinkwrapBadges} onChange={value => mutateActiveStyle(style => { style.highlights.shrinkwrapBadges = value; }, 'shrinkwrap-badges')} />
                      <Toggle label="Pending-delete rings" checked={highlights.pendingDeleteRing} onChange={value => mutateActiveStyle(style => { style.highlights.pendingDeleteRing = value; }, 'pending-delete-rings')} />
                    </div>
                  </Section>
                </div>
              )}

              {tab === 'labels' && (
                <div className="space-y-2.5">
                  <Section title="Attributes" hint="Per-point label offsets still win over this base offset.">
                    <div className="mb-2 grid gap-1.5 sm:grid-cols-3">
                      <Toggle label="Point number" checked={labels.showPointNumber} onChange={value => mutateActiveStyle(style => { style.labels.showPointNumber = value; }, 'label-pn')} />
                      <Toggle label="Elevation" checked={labels.showElevation} onChange={value => mutateActiveStyle(style => { style.labels.showElevation = value; }, 'label-elev')} />
                      <Toggle label="Description" checked={labels.showDescription} onChange={value => mutateActiveStyle(style => { style.labels.showDescription = value; }, 'label-desc')} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ColorField label="Point number" value={labels.pointNumberColor} settingId="label-number-color" highlight={focusedSetting === 'label-number-color'} onChange={value => mutateActiveStyle(style => { style.labels.pointNumberColor = value; }, 'label-pn-color')} />
                      <ColorField label="Elevation" value={labels.elevationColor} settingId="label-elevation-color" highlight={focusedSetting === 'label-elevation-color'} onChange={value => mutateActiveStyle(style => { style.labels.elevationColor = value; }, 'label-elev-color')} />
                      <ColorField label="Description" value={labels.descriptionColor} settingId="label-description-color" highlight={focusedSetting === 'label-description-color'} onChange={value => mutateActiveStyle(style => { style.labels.descriptionColor = value; }, 'label-desc-color')} />
                      <NumberField label="Font size" value={labels.fontSizePx} min={6} max={48} suffix="px" settingId="label-font-size" highlight={focusedSetting === 'label-font-size'} onChange={value => mutateActiveStyle(style => { style.labels.fontSizePx = value; }, 'label-font-size')} />
                      <NumberField label="Offset X" value={labels.offsetXPx} min={-200} max={200} suffix="px" onChange={value => mutateActiveStyle(style => { style.labels.offsetXPx = value; }, 'label-offset-x')} />
                      <NumberField label="Offset Y" value={labels.offsetYPx} min={-200} max={200} suffix="px" onChange={value => mutateActiveStyle(style => { style.labels.offsetYPx = value; }, 'label-offset-y')} />
                      <label className="block">
                        <span className={labelClass}>Scale mode</span>
                        <select
                          value={labels.scaleMode}
                          onChange={event => mutateActiveStyle(style => { style.labels.scaleMode = event.target.value as 'screen' | 'world'; }, 'label-scale-mode')}
                          className={inputClass}
                        >
                          <option value="screen">Screen-fixed</option>
                          <option value="world">Scale with zoom</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelClass}>Leader</span>
                        <select
                          value={labels.leader}
                          onChange={event => mutateActiveStyle(style => { style.labels.leader = event.target.value as PointLabelStyle['leader']; }, 'label-leader')}
                          className={inputClass}
                        >
                          <option value="none">None</option>
                          <option value="when-offset">When offset</option>
                          <option value="always">Always</option>
                        </select>
                      </label>
                      <ColorField label="Leader color" value={labels.leaderColor} onChange={value => mutateActiveStyle(style => { style.labels.leaderColor = value; }, 'label-leader-color')} />
                      <NumberField label="Leader width" value={labels.leaderWidthPx} min={0} max={6} step={0.25} suffix="px" onChange={value => mutateActiveStyle(style => { style.labels.leaderWidthPx = value; }, 'label-leader-width')} />
                    </div>
                  </Section>
                  <Section title="Label background">
                    <Toggle label="Draw a background behind labels" checked={labels.labelBackground.enabled} onChange={value => mutateActiveStyle(style => { style.labels.labelBackground.enabled = value; }, 'label-bg-enabled')} />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <ColorField label="Background" value={labels.labelBackground.color} onChange={value => mutateActiveStyle(style => { style.labels.labelBackground.color = value; }, 'label-bg-color')} />
                      <NumberField label="Padding" value={labels.labelBackground.paddingPx} min={0} max={12} suffix="px" onChange={value => mutateActiveStyle(style => { style.labels.labelBackground.paddingPx = value; }, 'label-bg-padding')} />
                    </div>
                  </Section>
                </div>
              )}

              {tab === 'efficiency' && (
                <div className="space-y-2.5">
                  <Section title="Activation" hint="Compression starts when the view is zoomed out or the screen is crowded.">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Toggle label="Point Efficiency Mode" checked={efficiency.enabled} onChange={value => mutateActiveStyle(style => { style.efficiency.enabled = value; }, 'efficiency-enabled')} />
                      {(['current', 'performance', 'balanced', 'detail'] as const).map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => applyEfficiencyPreset(preset)}
                          className={`rounded border px-2 py-1 text-[9px] capitalize ${
                            efficiency.preset === preset
                              ? 'border-fuchsia-400/45 bg-fuchsia-500/15 text-fuchsia-100'
                              : 'border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Detail zoom cutoff" value={efficiency.detailScaleCutoff} min={0.1} max={100} step={0.1} suffix="×" onChange={value => mutateActiveStyle(style => { style.efficiency.detailScaleCutoff = value; style.efficiency.preset = 'custom'; }, 'efficiency-cutoff')} />
                      <NumberField label="Screen point budget" value={efficiency.screenPointBudget} min={1} max={1000000} suffix="pts" onChange={value => mutateActiveStyle(style => { style.efficiency.screenPointBudget = value; style.efficiency.preset = 'custom'; }, 'efficiency-budget')} />
                    </div>
                  </Section>
                  <Section title="Dot geometry">
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Cell size" value={efficiency.cellSizePx} min={2} max={16} suffix="px" onChange={value => mutateActiveStyle(style => { style.efficiency.cellSizePx = value; style.efficiency.preset = 'custom'; }, 'efficiency-cell')} />
                      <label data-point-setting="efficiency-shape" className={focusedSetting === 'efficiency-shape' ? 'block rounded-md bg-fuchsia-500/[0.07] p-1 ring-1 ring-fuchsia-400/40' : 'block'}>
                        <span className={labelClass}>Shape</span>
                        <select
                          value={efficiency.dotShape}
                          onChange={event => mutateActiveStyle(style => { style.efficiency.dotShape = event.target.value as 'square' | 'circle'; style.efficiency.preset = 'custom'; }, 'efficiency-shape')}
                          className={inputClass}
                        >
                          <option value="square">Square</option>
                          <option value="circle">Circle</option>
                        </select>
                      </label>
                      <NumberField label="Min dot size" value={efficiency.minDotSizePx} min={1} max={32} step={0.5} suffix="px" settingId="efficiency-size" highlight={focusedSetting === 'efficiency-size'} onChange={value => mutateActiveStyle(style => { style.efficiency.minDotSizePx = value; style.efficiency.preset = 'custom'; }, 'efficiency-min-dot')} />
                      <NumberField label="Max dot size" value={efficiency.maxDotSizePx} min={efficiency.minDotSizePx} max={32} step={0.5} suffix="px" highlight={focusedSetting === 'efficiency-size'} onChange={value => mutateActiveStyle(style => { style.efficiency.maxDotSizePx = value; style.efficiency.preset = 'custom'; }, 'efficiency-max-dot')} />
                      <NumberField label="Density growth" value={efficiency.densityGrowth} min={0} max={4} step={0.25} suffix="px" onChange={value => mutateActiveStyle(style => { style.efficiency.densityGrowth = value; style.efficiency.preset = 'custom'; }, 'efficiency-growth')} />
                    </div>
                  </Section>
                  <Section title="Dot appearance">
                    <div className="grid grid-cols-2 gap-2">
                      <ColorField label="Dark theme" value={efficiency.color} settingId="efficiency-color" highlight={focusedSetting === 'efficiency-color'} onChange={value => mutateActiveStyle(style => { style.efficiency.color = value; style.efficiency.preset = 'custom'; }, 'efficiency-color')} />
                      <ColorField label="Light theme" value={efficiency.lightThemeColor} settingId="efficiency-light-color" highlight={focusedSetting === 'efficiency-light-color'} onChange={value => mutateActiveStyle(style => { style.efficiency.lightThemeColor = value; style.efficiency.preset = 'custom'; }, 'efficiency-light-color')} />
                      <NumberField label="Opacity" value={efficiency.opacity} min={0} max={1} step={0.05} settingId="efficiency-opacity" highlight={focusedSetting === 'efficiency-opacity'} onChange={value => mutateActiveStyle(style => { style.efficiency.opacity = value; style.efficiency.preset = 'custom'; }, 'efficiency-opacity')} />
                    </div>
                  </Section>
                  <Section title="Suppression" hint="Turning any of these off keeps detail in compressed mode and costs more.">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <Toggle label="Hide labels" checked={efficiency.suppressLabels} onChange={value => mutateActiveStyle(style => { style.efficiency.suppressLabels = value; }, 'efficiency-suppress-labels')} />
                      <Toggle label="Suppress symbols" checked={efficiency.suppressSymbols} onChange={value => mutateActiveStyle(style => { style.efficiency.suppressSymbols = value; }, 'efficiency-suppress-symbols')} />
                      <Toggle label="Suppress callouts" checked={efficiency.suppressCallouts} onChange={value => mutateActiveStyle(style => { style.efficiency.suppressCallouts = value; }, 'efficiency-suppress-callouts')} />
                    </div>
                  </Section>
                  <Section title="Highlights">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <Toggle label="Selection rings" checked={efficiency.keepSelectionRing} onChange={value => mutateActiveStyle(style => { style.efficiency.keepSelectionRing = value; }, 'efficiency-keep-selection')} />
                      <Toggle label="Hover rings" checked={efficiency.keepHoverRing} onChange={value => mutateActiveStyle(style => { style.efficiency.keepHoverRing = value; }, 'efficiency-keep-hover')} />
                      <Toggle label="Shrinkwrap badges" checked={efficiency.keepShrinkwrapBadges} onChange={value => mutateActiveStyle(style => { style.efficiency.keepShrinkwrapBadges = value; }, 'efficiency-keep-shrinkwrap')} />
                      <Toggle label="Pending-delete rings" checked={efficiency.keepPendingDeleteRings} onChange={value => mutateActiveStyle(style => { style.efficiency.keepPendingDeleteRings = value; }, 'efficiency-keep-pending')} />
                    </div>
                  </Section>
                </div>
              )}

              {tab === 'assignments' && (
                <div className="space-y-2.5">
                  <Section title={`Where ${activeStyle.name} applies`} hint="Specificity: point override → description code → point list → layer → project default.">
                    <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                      <label className="block">
                        <span className={labelClass}>Target type</span>
                        <select
                          value={assignmentKind}
                          onChange={event => { setAssignmentKind(event.target.value as AssignmentKind); setAssignmentTarget(''); }}
                          className={inputClass}
                        >
                          <option value="point-list">Point list</option>
                          <option value="description">Description code</option>
                          <option value="layer">CAD layer</option>
                          <option value="point">Individual point</option>
                        </select>
                      </label>
                      {assignmentKind === 'point-list' ? (
                        <label className="block">
                          <span className={labelClass}>Point list</span>
                          <select value={assignmentTarget} onChange={event => setAssignmentTarget(event.target.value)} className={inputClass}>
                            <option value="">Choose a list…</option>
                            {pointLists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
                          </select>
                        </label>
                      ) : (
                        <label className="block">
                          <span className={labelClass}>{assignmentKind === 'description' ? 'Code or wildcard' : assignmentKind === 'layer' ? 'Layer name' : 'Point number'}</span>
                          <input
                            type="text"
                            value={assignmentTarget}
                            onChange={event => setAssignmentTarget(event.target.value)}
                            list="point-studio-assignment-options"
                            placeholder={assignmentKind === 'description' ? 'MH or TREE*' : assignmentKind === 'layer' ? 'C-TOPO' : '1042'}
                            className={inputClass}
                          />
                          <datalist id="point-studio-assignment-options">
                            {assignmentTargets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </datalist>
                        </label>
                      )}
                      <div className="flex items-end">
                        <button type="button" onClick={addAssignment} className={primaryButtonClass}>
                          <Plus className="h-3 w-3" />
                          Add
                        </button>
                      </div>
                    </div>
                    {assignmentKind === 'description' && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                        <label className="flex items-center gap-1">
                          <input type="radio" checked={assignmentMatchMode === 'exact'} onChange={() => setAssignmentMatchMode('exact')} className="accent-fuchsia-400" />
                          Exact
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" checked={assignmentMatchMode === 'wildcard'} onChange={() => setAssignmentMatchMode('wildcard')} className="accent-fuchsia-400" />
                          Wildcard (* and ?)
                        </label>
                      </div>
                    )}
                  </Section>
                  <Section title={`Assignments (${activeAssignments.length})`}>
                    {activeAssignments.length === 0 ? (
                      <p className="text-[10.5px] text-slate-500">This style is not assigned anywhere. Make it the default or add a target above.</p>
                    ) : (
                      <div className="space-y-1">
                        {activeAssignments.map(assignment => (
                          <div key={assignment.id} className="flex items-center justify-between gap-2 rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                            <span className="min-w-0">
                              <span className="block truncate text-[10.5px] text-slate-200">
                                {assignment.target.kind === 'point-list'
                                  ? listName(assignment.target.listId)
                                  : assignment.target.kind === 'description'
                                    ? `${assignment.target.match}${assignment.target.matchMode === 'wildcard' ? ' (wildcard)' : ''}`
                                    : assignment.target.kind === 'layer'
                                      ? assignment.target.layer
                                      : `Point ${assignment.target.pointNumber}`}
                              </span>
                              <span className="text-[8.5px] uppercase tracking-[0.1em] text-slate-500">{assignment.target.kind.replace('-', ' ')}</span>
                            </span>
                            <button type="button" onClick={() => removeAssignment(assignment)} className="rounded p-1 text-rose-300 hover:bg-rose-500/15" aria-label="Remove assignment">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </div>
              )}

              {tab === 'export' && (
                <div className="space-y-2.5">
                  <Section title="Export names" hint="Style names travel with DXF/C3D metadata. Point Studio does not create Civil 3D point styles.">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>DXF style name</span>
                        <input type="text" value={activeStyle.dxfStyleName ?? activeStyle.name} onChange={event => mutateActiveStyle(style => { style.dxfStyleName = event.target.value; }, 'dxf-style-name')} className={inputClass} />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Civil 3D style name</span>
                        <input type="text" value={activeStyle.c3dStyleName ?? activeStyle.name} onChange={event => mutateActiveStyle(style => { style.c3dStyleName = event.target.value; }, 'c3d-style-name')} className={inputClass} />
                      </label>
                    </div>
                  </Section>
                  <Section title="Style pack">
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={downloadPack} className={primaryButtonClass}>
                        <Download className="h-3 w-3" />
                        Export style pack
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className={smallButtonClass}>
                        <Upload className="h-3 w-3" />
                        Import style pack
                      </button>
                      <button type="button" onClick={copyPack} className={smallButtonClass}>
                        <Copy className="h-3 w-3" />
                        Copy JSON
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        aria-label="Import point style pack"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) void importPack(file);
                          event.target.value = '';
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[9.5px] leading-snug text-slate-500">
                      Exports every style plus assignments. Importing merges new styles, renames id conflicts, and never overwrites built-ins.
                    </p>
                  </Section>
                  <Section title="Project state">
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Changes save automatically to this project and are included in the <code>.lsvz</code> manifest.
                      Per-point overrides are render-only and never rewrite point records.
                    </p>
                  </Section>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[9.5px] text-slate-500">
            <span>
              Applies to: {activeStyle.id === draft.defaultStyleId ? 'Project default' : `${activeAssignments.length} assignment${activeAssignments.length === 1 ? '' : 's'}`}
            </span>
            <span>{saveStatus === 'pending' ? 'Saving in 200 ms…' : 'All changes saved'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointStudioSurface;
