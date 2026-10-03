// TitleblockEditor.tsx — feature-rich titleblock layout editor (v26.05.17.34).
//
// A modal canvas editor for designing a custom titleblock that lives in the
// lower-right corner of every sheet. The titleblock is a fixed-size paper-space
// box (defaults to 3.75" × 1.75"); inside it the user composes "elements":
//
//   • Text elements with font / size / weight / alignment and dynamic
//     placeholders ({PROJECT_NAME}, {SHEET_NUMBER}, {DRAWN_BY}, {DATE},
//     {NOTES}, {SHEET_SIZE}, {SCALE}, {DATE_TODAY}, {PAGE_OF}).
//   • Rectangle elements (filled or stroked) — useful for cells / dividers.
//   • Line elements — horizontal or vertical dividers.
//   • Image elements (logo) loaded from PNG / JPG / SVG / DXF (DXF rendered
//     as an inline SVG path via the existing dxfParser).
//
// Positions are stored in inches relative to the titleblock's top-left and
// rendered identically in the live sheet preview and the PDF export.

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { parseDxfForSymbol } from '../utils/dxfParser.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TitleblockElement =
  | TitleblockTextElement
  | TitleblockRectElement
  | TitleblockLineElement
  | TitleblockImageElement;

interface BaseElement {
  id: string;
  /** Position in inches relative to titleblock top-left. */
  x: number;
  y: number;
}

export interface TitleblockTextElement extends BaseElement {
  type: 'text';
  /** Text including placeholders such as {PROJECT_NAME}. */
  text: string;
  /** Font size in points (pt). */
  fontSize: number;
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  color: string;
  /** Optional width in inches; if set, text wraps and align is honored. */
  width?: number;
}

export interface TitleblockRectElement extends BaseElement {
  type: 'rect';
  w: number;
  h: number;
  fill: string;       // CSS color or 'none'
  stroke: string;     // CSS color or 'none'
  strokeWidth: number; // pt
}

export interface TitleblockLineElement extends BaseElement {
  type: 'line';
  /** Line end relative to titleblock top-left, in inches. */
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface TitleblockImageElement extends BaseElement {
  type: 'image';
  w: number;
  h: number;
  /** Either a data: URL (PNG/JPG/SVG) or null when using svgPath instead. */
  dataUrl: string | null;
  /** When provided, render this DXF-derived SVG path inside the box. */
  dxfPath?: string;
  dxfViewBox?: string;
  fit?: 'contain' | 'cover' | 'stretch';
}

export interface TitleblockLayout {
  /** Titleblock box size in inches. */
  widthIn: number;
  heightIn: number;
  /** Background fill — 'none' for transparent. */
  background: string;
  /** Outer border stroke color & weight. */
  borderColor: string;
  borderWidth: number;
  elements: TitleblockElement[];
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

export interface TitleblockContext {
  projectName: string;
  sheetNumber: string;
  drawnBy: string;
  date: string;
  notes: string;
  sheetSize: string;
  scale: string;
  pageOf: string;
}

export const substitutePlaceholders = (text: string, ctx: TitleblockContext): string => {
  return text
    .replace(/\{PROJECT_NAME\}/g, ctx.projectName)
    .replace(/\{SHEET_NUMBER\}/g, ctx.sheetNumber)
    .replace(/\{DRAWN_BY\}/g, ctx.drawnBy)
    .replace(/\{DATE\}/g, ctx.date)
    .replace(/\{NOTES\}/g, ctx.notes)
    .replace(/\{SHEET_SIZE\}/g, ctx.sheetSize)
    .replace(/\{SCALE\}/g, ctx.scale)
    .replace(/\{PAGE_OF\}/g, ctx.pageOf)
    .replace(/\{DATE_TODAY\}/g, new Date().toLocaleDateString());
};

// ---------------------------------------------------------------------------
// Default layout — a classic civil titleblock
// ---------------------------------------------------------------------------

export const DEFAULT_TITLEBLOCK_LAYOUT: TitleblockLayout = {
  widthIn: 3.75,
  heightIn: 1.75,
  background: '#ffffff',
  borderColor: '#111111',
  borderWidth: 2,
  elements: [
    { id: 'div-top',    type: 'line', x: 0,    y: 0.45, x2: 3.75, y2: 0.45, stroke: '#111', strokeWidth: 1 },
    { id: 'div-mid',    type: 'line', x: 1.5,  y: 0.45, x2: 1.5,  y2: 1.75, stroke: '#111', strokeWidth: 0.5 },
    { id: 'div-bottom', type: 'line', x: 0,    y: 1.35, x2: 3.75, y2: 1.35, stroke: '#111', strokeWidth: 0.5 },
    { id: 'project',    type: 'text', x: 0.08, y: 0.30, text: '{PROJECT_NAME}', fontSize: 14, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#111', width: 3.6 },
    { id: 'sheet-lbl',  type: 'text', x: 0.08, y: 0.60, text: 'SHEET:', fontSize: 7, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#555' },
    { id: 'sheet-num',  type: 'text', x: 0.08, y: 0.85, text: '{SHEET_NUMBER}', fontSize: 12, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#111' },
    { id: 'drawn-lbl',  type: 'text', x: 1.58, y: 0.60, text: 'DRAWN BY:', fontSize: 7, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#555' },
    { id: 'drawn',      type: 'text', x: 1.58, y: 0.82, text: '{DRAWN_BY}', fontSize: 10, fontFamily: 'sans-serif', fontWeight: 'normal', align: 'left', color: '#111' },
    { id: 'date-lbl',   type: 'text', x: 1.58, y: 1.05, text: 'DATE:', fontSize: 7, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#555' },
    { id: 'date',       type: 'text', x: 1.58, y: 1.27, text: '{DATE}', fontSize: 10, fontFamily: 'sans-serif', fontWeight: 'normal', align: 'left', color: '#111' },
    { id: 'scale-lbl',  type: 'text', x: 0.08, y: 1.05, text: 'SCALE:', fontSize: 7, fontFamily: 'sans-serif', fontWeight: 'bold', align: 'left', color: '#555' },
    { id: 'scale',      type: 'text', x: 0.08, y: 1.27, text: '{SCALE}', fontSize: 10, fontFamily: 'sans-serif', fontWeight: 'normal', align: 'left', color: '#111' },
    { id: 'notes',      type: 'text', x: 0.08, y: 1.55, text: '{NOTES}', fontSize: 7, fontFamily: 'sans-serif', fontWeight: 'normal', align: 'left', color: '#555', width: 3.6 },
  ],
};

// ---------------------------------------------------------------------------
// Inline renderer — used by both the editor canvas and the live sheet preview
// ---------------------------------------------------------------------------

interface TitleblockRendererProps {
  layout: TitleblockLayout;
  ctx: TitleblockContext;
  /** Pixels per inch when rendering (sheet preview uses sheet ppi). */
  ppi: number;
  /** Optional selection ring for editor mode. */
  selectedId?: string | null;
  onElementMouseDown?: (id: string, e: React.MouseEvent) => void;
}

export const TitleblockRenderer: React.FC<TitleblockRendererProps> = ({ layout, ctx, ppi, selectedId, onElementMouseDown }) => {
  const W = layout.widthIn * ppi;
  const H = layout.heightIn * ppi;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: layout.background }}>
      <rect x={0} y={0} width={W} height={H}
        fill={layout.background === 'none' ? 'transparent' : layout.background}
        stroke={layout.borderColor}
        strokeWidth={layout.borderWidth}
      />
      {layout.elements.map(el => {
        const isSel = selectedId === el.id;
        const sel = isSel ? <rect x={el.x * ppi - 2} y={el.y * ppi - 2}
            width={getElWidthPx(el, ppi) + 4} height={getElHeightPx(el, ppi) + 4}
            fill="none" stroke="#f59e0b" strokeDasharray="3 3" pointerEvents="none" /> : null;
        const handler = onElementMouseDown ? (e: React.MouseEvent) => onElementMouseDown(el.id, e) : undefined;
        if (el.type === 'text') {
          const baseY = (el.y * ppi) + el.fontSize * 1.0; // baseline approx 1× font
          const x = el.align === 'right' && el.width != null
            ? (el.x + el.width) * ppi
            : el.align === 'center' && el.width != null
              ? (el.x + el.width / 2) * ppi
              : el.x * ppi;
          return (
            <g key={el.id} onMouseDown={handler} style={{ cursor: handler ? 'move' : 'default' }}>
              <text
                x={x}
                y={baseY}
                fontSize={el.fontSize}
                fontFamily={el.fontFamily}
                fontWeight={el.fontWeight}
                fill={el.color}
                textAnchor={el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'}
              >
                {substitutePlaceholders(el.text, ctx)}
              </text>
              {sel}
            </g>
          );
        }
        if (el.type === 'rect') {
          return (
            <g key={el.id} onMouseDown={handler} style={{ cursor: handler ? 'move' : 'default' }}>
              <rect x={el.x * ppi} y={el.y * ppi}
                width={el.w * ppi} height={el.h * ppi}
                fill={el.fill === 'none' ? 'transparent' : el.fill}
                stroke={el.stroke}
                strokeWidth={el.strokeWidth}
              />
              {sel}
            </g>
          );
        }
        if (el.type === 'line') {
          return (
            <g key={el.id} onMouseDown={handler} style={{ cursor: handler ? 'move' : 'default' }}>
              <line x1={el.x * ppi} y1={el.y * ppi} x2={el.x2 * ppi} y2={el.y2 * ppi}
                stroke={el.stroke} strokeWidth={el.strokeWidth} />
              {sel}
            </g>
          );
        }
        // image
        if (el.dxfPath && el.dxfViewBox) {
          const [vbx, vby, vbw, vbh] = el.dxfViewBox.split(/\s+/).map(parseFloat);
          return (
            <g key={el.id} onMouseDown={handler} style={{ cursor: handler ? 'move' : 'default' }}>
              <svg x={el.x * ppi} y={el.y * ppi} width={el.w * ppi} height={el.h * ppi}
                viewBox={`${vbx} ${vby} ${vbw} ${vbh}`}
                preserveAspectRatio={el.fit === 'stretch' ? 'none' : 'xMidYMid meet'}
              >
                <path d={el.dxfPath} fill="none" stroke="#111" strokeWidth={Math.max(vbw, vbh) / 200} />
              </svg>
              {sel}
            </g>
          );
        }
        if (el.dataUrl) {
          return (
            <g key={el.id} onMouseDown={handler} style={{ cursor: handler ? 'move' : 'default' }}>
              <image href={el.dataUrl}
                x={el.x * ppi} y={el.y * ppi}
                width={el.w * ppi} height={el.h * ppi}
                preserveAspectRatio={el.fit === 'stretch' ? 'none' : 'xMidYMid meet'}
              />
              {sel}
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
};

const getElWidthPx = (el: TitleblockElement, ppi: number): number => {
  if (el.type === 'text') return (el.width ?? 1) * ppi;
  if (el.type === 'rect' || el.type === 'image') return el.w * ppi;
  return Math.abs(el.x2 - el.x) * ppi;
};
const getElHeightPx = (el: TitleblockElement, ppi: number): number => {
  if (el.type === 'text') return el.fontSize * 1.2;
  if (el.type === 'rect' || el.type === 'image') return el.h * ppi;
  return Math.abs(el.y2 - el.y) * ppi;
};

// ---------------------------------------------------------------------------
// Serialize layout to standalone SVG markup (for PDF export embedding).
// ---------------------------------------------------------------------------

export const titleblockToSvgMarkup = (layout: TitleblockLayout, ctx: TitleblockContext, ppi: number): string => {
  const W = layout.widthIn * ppi;
  const H = layout.heightIn * ppi;
  const esc = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' } as Record<string,string>)[c]);
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${layout.background === 'none' ? 'none' : layout.background}" stroke="${layout.borderColor}" stroke-width="${layout.borderWidth}" />`);
  for (const el of layout.elements) {
    if (el.type === 'text') {
      const baseY = el.y * ppi + el.fontSize * 1.0;
      const x = el.align === 'right' && el.width != null ? (el.x + el.width) * ppi
              : el.align === 'center' && el.width != null ? (el.x + el.width / 2) * ppi
              : el.x * ppi;
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
      parts.push(`<text x="${x.toFixed(2)}" y="${baseY.toFixed(2)}" font-size="${el.fontSize}" font-family="${el.fontFamily}" font-weight="${el.fontWeight}" fill="${el.color}" text-anchor="${anchor}">${esc(substitutePlaceholders(el.text, ctx))}</text>`);
    } else if (el.type === 'rect') {
      parts.push(`<rect x="${(el.x*ppi).toFixed(2)}" y="${(el.y*ppi).toFixed(2)}" width="${(el.w*ppi).toFixed(2)}" height="${(el.h*ppi).toFixed(2)}" fill="${el.fill === 'none' ? 'none' : el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" />`);
    } else if (el.type === 'line') {
      parts.push(`<line x1="${(el.x*ppi).toFixed(2)}" y1="${(el.y*ppi).toFixed(2)}" x2="${(el.x2*ppi).toFixed(2)}" y2="${(el.y2*ppi).toFixed(2)}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" />`);
    } else if (el.type === 'image') {
      if (el.dxfPath && el.dxfViewBox) {
        const [vbx, vby, vbw, vbh] = el.dxfViewBox.split(/\s+/).map(parseFloat);
        const sw = Math.max(vbw, vbh) / 200;
        parts.push(`<svg x="${(el.x*ppi).toFixed(2)}" y="${(el.y*ppi).toFixed(2)}" width="${(el.w*ppi).toFixed(2)}" height="${(el.h*ppi).toFixed(2)}" viewBox="${vbx} ${vby} ${vbw} ${vbh}" preserveAspectRatio="${el.fit === 'stretch' ? 'none' : 'xMidYMid meet'}"><path d="${el.dxfPath}" fill="none" stroke="#111" stroke-width="${sw}" /></svg>`);
      } else if (el.dataUrl) {
        parts.push(`<image href="${el.dataUrl}" x="${(el.x*ppi).toFixed(2)}" y="${(el.y*ppi).toFixed(2)}" width="${(el.w*ppi).toFixed(2)}" height="${(el.h*ppi).toFixed(2)}" preserveAspectRatio="${el.fit === 'stretch' ? 'none' : 'xMidYMid meet'}" />`);
      }
    }
  }
  return parts.join('');
};

// ---------------------------------------------------------------------------
// Modal editor
// ---------------------------------------------------------------------------

interface TitleblockEditorProps {
  layout: TitleblockLayout;
  ctx: TitleblockContext;
  onSave: (layout: TitleblockLayout) => void;
  onClose: () => void;
}

const newId = () => `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const TitleblockEditor: React.FC<TitleblockEditorProps> = ({ layout: initial, ctx, onSave, onClose }) => {
  const [layout, setLayout] = useState<TitleblockLayout>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ppi = 96; // editor zoom
  const { reportError } = useErrorReporter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => layout.elements.find(e => e.id === selectedId) ?? null, [layout, selectedId]);

  const updateLayout = (patch: Partial<TitleblockLayout>) => setLayout(prev => ({ ...prev, ...patch }));
  const updateElement = (id: string, patch: Partial<TitleblockElement>) => {
    setLayout(prev => ({
      ...prev,
      elements: prev.elements.map(e => e.id === id ? { ...e, ...patch } as TitleblockElement : e),
    }));
  };
  const deleteElement = (id: string) => {
    setLayout(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    const el = layout.elements.find(e => e.id === id);
    if (!el) return;
    const dup = { ...el, id: newId(), x: el.x + 0.1, y: el.y + 0.1 } as TitleblockElement;
    setLayout(prev => ({ ...prev, elements: [...prev.elements, dup] }));
    setSelectedId(dup.id);
  };

  const addText = () => {
    const el: TitleblockTextElement = { id: newId(), type: 'text', x: 0.1, y: 0.1, text: 'New text', fontSize: 10, fontFamily: 'sans-serif', fontWeight: 'normal', align: 'left', color: '#111' };
    setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };
  const addRect = () => {
    const el: TitleblockRectElement = { id: newId(), type: 'rect', x: 0.1, y: 0.1, w: 1, h: 0.4, fill: 'none', stroke: '#111', strokeWidth: 0.5 };
    setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };
  const addLine = () => {
    const el: TitleblockLineElement = { id: newId(), type: 'line', x: 0.1, y: 0.5, x2: 1.5, y2: 0.5, stroke: '#111', strokeWidth: 0.5 };
    setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  };
  const onImagePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const el: TitleblockImageElement = { id: newId(), type: 'image', x: 0.1, y: 0.1, w: 1, h: 0.6, dataUrl: ev.target?.result as string, fit: 'contain' };
      setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
      setSelectedId(el.id);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }, []);
  const onDxfPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const { svgPath, viewBox } = parseDxfForSymbol(ev.target?.result as string);
        if (!svgPath) { reportError({ title: 'Invalid DXF', message: 'No drawable LINE/LWPOLYLINE entities found in this DXF.' }); return; }
        const el: TitleblockImageElement = { id: newId(), type: 'image', x: 0.1, y: 0.1, w: 1.5, h: 0.8, dataUrl: null, dxfPath: svgPath, dxfViewBox: viewBox, fit: 'contain' };
        setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
        setSelectedId(el.id);
      } catch (err) {
        reportError({ title: 'DXF parse failed', message: err instanceof Error ? err.message : String(err), error: err });
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  }, [reportError]);

  // ── Drag elements within the titleblock box ────────────────────────────
  const dragRef = useRef<{ id: string; ox: number; oy: number; sx: number; sy: number } | null>(null);
  const onElementMouseDown = (id: string, e: React.MouseEvent) => {
    setSelectedId(id);
    const el = layout.elements.find(x => x.id === id); if (!el) return;
    dragRef.current = { id, ox: el.x, oy: el.y, sx: e.clientX, sy: e.clientY };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.sx) / ppi;
      const dy = (ev.clientY - dragRef.current.sy) / ppi;
      const target = layout.elements.find(x => x.id === dragRef.current!.id); if (!target) return;
      const newX = Math.max(0, Math.min(layout.widthIn - 0.1, dragRef.current.ox + dx));
      const newY = Math.max(0, Math.min(layout.heightIn - 0.1, dragRef.current.oy + dy));
      // For line elements also shift end-point.
      if (target.type === 'line') {
        const ddx = newX - target.x;
        const ddy = newY - target.y;
        updateElement(target.id, { x: newX, y: newY, x2: target.x2 + ddx, y2: target.y2 + ddy } as Partial<TitleblockLineElement>);
      } else {
        updateElement(target.id, { x: newX, y: newY });
      }
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const PLACEHOLDERS: { tag: string; label: string }[] = [
    { tag: '{PROJECT_NAME}', label: 'Project Name' },
    { tag: '{SHEET_NUMBER}', label: 'Sheet Number' },
    { tag: '{DRAWN_BY}',     label: 'Drawn By' },
    { tag: '{DATE}',         label: 'Date (manual)' },
    { tag: '{DATE_TODAY}',   label: "Today's Date" },
    { tag: '{NOTES}',        label: 'Notes' },
    { tag: '{SHEET_SIZE}',   label: 'Sheet Size' },
    { tag: '{SCALE}',        label: 'Primary Scale' },
    { tag: '{PAGE_OF}',      label: 'Page X of Y' },
  ];

  const insertPlaceholderIntoSelected = (tag: string) => {
    if (!selected || selected.type !== 'text') return;
    updateElement(selected.id, { text: ((selected as TitleblockTextElement).text + ' ' + tag).trim() });
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-amber-500/40 rounded-lg shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-amber-400">Titleblock Editor</h2>
            <p className="text-[11px] text-gray-400">Compose a custom titleblock with text, shapes, and DXF/PNG logos. Position in inches relative to the box.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLayout(DEFAULT_TITLEBLOCK_LAYOUT)} className="px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Reset</button>
            <button onClick={onClose} className="px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Cancel</button>
            <button onClick={() => { onSave(layout); onClose(); }} className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold">Save</button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          {/* Left: element list + add */}
          <aside className="w-56 flex-shrink-0 border-r border-gray-700 p-2 space-y-2 overflow-y-auto">
            <div className="grid grid-cols-2 gap-1">
              <button onClick={addText} className="px-2 py-1 text-[11px] rounded bg-sky-700/40 hover:bg-sky-600/50 text-sky-100">+ Text</button>
              <button onClick={addRect} className="px-2 py-1 text-[11px] rounded bg-teal-700/40 hover:bg-teal-600/50 text-teal-100">+ Rect</button>
              <button onClick={addLine} className="px-2 py-1 text-[11px] rounded bg-fuchsia-700/40 hover:bg-fuchsia-600/50 text-fuchsia-100">+ Line</button>
              <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-[11px] rounded bg-amber-700/40 hover:bg-amber-600/50 text-amber-100">+ Image</button>
              <button onClick={() => dxfRef.current?.click()} className="col-span-2 px-2 py-1 text-[11px] rounded bg-emerald-700/40 hover:bg-emerald-600/50 text-emerald-100">+ DXF Logo</button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImagePick} />
              <input ref={dxfRef}  type="file" accept=".dxf"   className="hidden" onChange={onDxfPick} />
            </div>

            <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2">Elements</div>
            <div className="space-y-0.5">
              {layout.elements.length === 0 && <div className="text-[11px] text-gray-500 italic px-1">No elements yet.</div>}
              {layout.elements.map(el => (
                <div key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`px-2 py-1 rounded text-[11px] cursor-pointer flex items-center justify-between ${selectedId === el.id ? 'bg-amber-900/40 border border-amber-500/60' : 'bg-gray-800 hover:bg-gray-700/60 border border-transparent'}`}>
                  <span className="truncate">
                    <span className="text-gray-500 mr-1">{el.type}</span>
                    {el.type === 'text' ? <span className="text-gray-200">{(el as TitleblockTextElement).text}</span> : <span className="text-gray-400">{el.id}</span>}
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); duplicateElement(el.id); }} title="Duplicate" className="text-gray-400 hover:text-gray-200 text-[10px]">⎘</button>
                    <button onClick={e => { e.stopPropagation(); deleteElement(el.id); }} title="Delete" className="text-rose-400 hover:text-rose-300 text-[10px]">×</button>
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700 pt-2 mt-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Titleblock Box</div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <label className="text-gray-400">W (in)
                  <input type="number" step="0.1" min={0.5} value={layout.widthIn}
                    onChange={e => updateLayout({ widthIn: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                </label>
                <label className="text-gray-400">H (in)
                  <input type="number" step="0.1" min={0.5} value={layout.heightIn}
                    onChange={e => updateLayout({ heightIn: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                </label>
                <label className="text-gray-400">Border
                  <input type="color" value={layout.borderColor}
                    onChange={e => updateLayout({ borderColor: e.target.value })}
                    className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                </label>
                <label className="text-gray-400">Bg
                  <input type="color" value={layout.background === 'none' ? '#ffffff' : layout.background}
                    onChange={e => updateLayout({ background: e.target.value })}
                    className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                </label>
              </div>
              <label className="block text-[11px] text-gray-400">Border weight (pt)
                <input type="number" step="0.5" min={0} value={layout.borderWidth}
                  onChange={e => updateLayout({ borderWidth: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
              </label>
            </div>
          </aside>

          {/* Center: editor canvas */}
          <div className="flex-1 min-w-0 overflow-auto bg-gray-800 p-6 flex items-center justify-center">
            <div className="shadow-2xl" style={{ background: '#fff' }}>
              <TitleblockRenderer
                layout={layout}
                ctx={ctx}
                ppi={ppi}
                selectedId={selectedId}
                onElementMouseDown={onElementMouseDown}
              />
            </div>
          </div>

          {/* Right: element properties */}
          <aside className="w-72 flex-shrink-0 border-l border-gray-700 p-3 overflow-y-auto space-y-3">
            {!selected && <div className="text-[11px] text-gray-500 italic">Select an element to edit its properties.</div>}
            {selected && (
              <>
                <div className="text-xs font-semibold text-amber-300 uppercase">{selected.type} properties</div>

                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <label className="text-gray-400">X (in)
                    <input type="number" step="0.05" value={selected.x}
                      onChange={e => updateElement(selected.id, { x: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                  </label>
                  <label className="text-gray-400">Y (in)
                    <input type="number" step="0.05" value={selected.y}
                      onChange={e => updateElement(selected.id, { y: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                  </label>
                </div>

                {selected.type === 'text' && (
                  <>
                    <label className="block text-[11px] text-gray-400">Text
                      <textarea rows={2} value={(selected as TitleblockTextElement).text}
                        onChange={e => updateElement(selected.id, { text: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <label className="text-gray-400">Size (pt)
                        <input type="number" step="0.5" min={4} value={(selected as TitleblockTextElement).fontSize}
                          onChange={e => updateElement(selected.id, { fontSize: parseFloat(e.target.value) || 8 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                      </label>
                      <label className="text-gray-400">Color
                        <input type="color" value={(selected as TitleblockTextElement).color}
                          onChange={e => updateElement(selected.id, { color: e.target.value })}
                          className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                      </label>
                      <label className="text-gray-400">Family
                        <select value={(selected as TitleblockTextElement).fontFamily}
                          onChange={e => updateElement(selected.id, { fontFamily: e.target.value as TitleblockTextElement['fontFamily'] })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                          <option value="sans-serif">sans-serif</option>
                          <option value="serif">serif</option>
                          <option value="monospace">monospace</option>
                        </select>
                      </label>
                      <label className="text-gray-400">Weight
                        <select value={(selected as TitleblockTextElement).fontWeight}
                          onChange={e => updateElement(selected.id, { fontWeight: e.target.value as TitleblockTextElement['fontWeight'] })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                          <option value="normal">normal</option>
                          <option value="bold">bold</option>
                        </select>
                      </label>
                      <label className="text-gray-400">Align
                        <select value={(selected as TitleblockTextElement).align}
                          onChange={e => updateElement(selected.id, { align: e.target.value as TitleblockTextElement['align'] })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                      <label className="text-gray-400">Width (in)
                        <input type="number" step="0.1" value={(selected as TitleblockTextElement).width ?? ''}
                          placeholder="auto"
                          onChange={e => updateElement(selected.id, { width: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                      </label>
                    </div>

                    <div className="border-t border-gray-700 pt-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Insert placeholder</div>
                      <div className="flex flex-wrap gap-1">
                        {PLACEHOLDERS.map(p => (
                          <button key={p.tag} onClick={() => insertPlaceholderIntoSelected(p.tag)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-mono"
                            title={p.label}>
                            {p.tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selected.type === 'rect' && (
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <label className="text-gray-400">W (in)
                      <input type="number" step="0.05" value={(selected as TitleblockRectElement).w}
                        onChange={e => updateElement(selected.id, { w: parseFloat(e.target.value) || 0.1 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="text-gray-400">H (in)
                      <input type="number" step="0.05" value={(selected as TitleblockRectElement).h}
                        onChange={e => updateElement(selected.id, { h: parseFloat(e.target.value) || 0.1 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="text-gray-400">Fill
                      <input type="color" value={(selected as TitleblockRectElement).fill === 'none' ? '#ffffff' : (selected as TitleblockRectElement).fill}
                        onChange={e => updateElement(selected.id, { fill: e.target.value })}
                        className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                    </label>
                    <label className="text-gray-400">Stroke
                      <input type="color" value={(selected as TitleblockRectElement).stroke}
                        onChange={e => updateElement(selected.id, { stroke: e.target.value })}
                        className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                    </label>
                    <label className="text-gray-400 col-span-2">Stroke weight (pt)
                      <input type="number" step="0.25" min={0} value={(selected as TitleblockRectElement).strokeWidth}
                        onChange={e => updateElement(selected.id, { strokeWidth: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <button onClick={() => updateElement(selected.id, { fill: 'none' })}
                      className="col-span-2 px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-[10px]">Set fill = none</button>
                  </div>
                )}

                {selected.type === 'line' && (
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <label className="text-gray-400">X2 (in)
                      <input type="number" step="0.05" value={(selected as TitleblockLineElement).x2}
                        onChange={e => updateElement(selected.id, { x2: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="text-gray-400">Y2 (in)
                      <input type="number" step="0.05" value={(selected as TitleblockLineElement).y2}
                        onChange={e => updateElement(selected.id, { y2: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="text-gray-400">Color
                      <input type="color" value={(selected as TitleblockLineElement).stroke}
                        onChange={e => updateElement(selected.id, { stroke: e.target.value })}
                        className="w-full h-6 bg-gray-800 border border-gray-700 rounded"/>
                    </label>
                    <label className="text-gray-400">Weight (pt)
                      <input type="number" step="0.25" min={0} value={(selected as TitleblockLineElement).strokeWidth}
                        onChange={e => updateElement(selected.id, { strokeWidth: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                  </div>
                )}

                {selected.type === 'image' && (
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <label className="text-gray-400">W (in)
                      <input type="number" step="0.05" value={(selected as TitleblockImageElement).w}
                        onChange={e => updateElement(selected.id, { w: parseFloat(e.target.value) || 0.1 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="text-gray-400">H (in)
                      <input type="number" step="0.05" value={(selected as TitleblockImageElement).h}
                        onChange={e => updateElement(selected.id, { h: parseFloat(e.target.value) || 0.1 })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5"/>
                    </label>
                    <label className="col-span-2 text-gray-400">Fit
                      <select value={(selected as TitleblockImageElement).fit ?? 'contain'}
                        onChange={e => updateElement(selected.id, { fit: e.target.value as TitleblockImageElement['fit'] })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
                        <option value="contain">contain</option>
                        <option value="cover">cover</option>
                        <option value="stretch">stretch</option>
                      </select>
                    </label>
                    {(selected as TitleblockImageElement).dxfPath && (
                      <div className="col-span-2 text-[10px] text-emerald-400">✓ Loaded from DXF</div>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TitleblockEditor;
