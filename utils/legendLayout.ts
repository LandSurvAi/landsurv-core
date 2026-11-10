/**
 * legendLayout — paperspace placement + SVG markup for the shared legend.
 *
 * The live sheet renders the same layout through `LegendBlock`, and PDF export
 * calls `legendToSvgMarkup`, so both outputs place and size the legend
 * identically from the one `LegendSettings` model.
 */

import {
  legendEntryResolvedStyle,
  type LegendEntry,
  type LegendEntryStyle,
  type LegendSettings,
} from '../services/legendStudio.ts';

export type ResolvedLegendEntry = LegendEntry & LegendEntryStyle;

export interface LegendLayout {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  headerIn: number;
  rowIn: number;
  padIn: number;
  swatchWIn: number;
  gapIn: number;
  columns: number;
  rows: number;
  visibleEntries: ResolvedLegendEntry[];
}

const SHEET_MARGIN_IN = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveLegendEntries(settings: LegendSettings): ResolvedLegendEntry[] {
  return (settings.entries ?? [])
    .filter(entry => entry.visible !== false)
    .map(entry => ({ ...entry, ...legendEntryResolvedStyle(entry) }));
}

export function layoutLegend(
  settings: LegendSettings,
  sheetWidthIn: number,
  sheetHeightIn: number,
): LegendLayout {
  const visibleEntries = resolveLegendEntries(settings);
  const fontScale = clamp(settings.fontScale ?? 1, 0.7, 1.8);
  const padIn = 0.09;
  const headerIn = 0.26 * fontScale;
  const rowIn = 0.2 * fontScale;
  const swatchWIn = 0.32;
  const gapIn = 0.07;

  const columns = Math.min(
    Math.max(1, settings.columns ?? 2),
    Math.max(1, visibleEntries.length),
  );
  const rows = Math.max(1, Math.ceil(visibleEntries.length / columns));
  const widthIn = clamp(settings.widthIn ?? 2.6, 1.4, Math.max(1.4, sheetWidthIn - 0.8));
  const heightIn = padIn * 2 + headerIn + (visibleEntries.length > 0 ? rows * rowIn : 0);

  const xRight = Math.max(SHEET_MARGIN_IN, sheetWidthIn - widthIn - SHEET_MARGIN_IN);
  const yBottom = Math.max(SHEET_MARGIN_IN, sheetHeightIn - heightIn - SHEET_MARGIN_IN);
  const xIn = settings.position === 'bottom-right' || settings.position === 'top-right'
    ? xRight
    : SHEET_MARGIN_IN;
  const yIn = settings.position === 'top-left' || settings.position === 'top-right'
    ? SHEET_MARGIN_IN
    : yBottom;

  return {
    xIn,
    yIn,
    widthIn,
    heightIn,
    headerIn,
    rowIn,
    padIn,
    swatchWIn,
    gapIn,
    columns,
    rows,
    visibleEntries,
  };
}

export function escapeLegendXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function fitLegendLabel(label: string, maxChars: number): string {
  const text = String(label ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** SVG stroke-dasharray for a legend line sample; undefined means continuous. */
export function legendSwatchDashArray(linetype?: string): string | undefined {
  const value = String(linetype ?? '').toUpperCase();
  if (/DOT|DOTTED/.test(value)) return '1.5 1.5';
  if (/DASH|HIDDEN|PHANTOM|CENTER/.test(value)) return '5 2.5';
  return undefined;
}

function swatchMarkup(
  entry: ResolvedLegendEntry,
  x: number,
  y: number,
  width: number,
  height: number,
  ppi: number,
): string {
  const color = entry.color || '#9ca3af';
  const hatch = Boolean(entry.patternName);
  const parts: string[] = [];
  if (hatch) {
    parts.push(
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="${escapeLegendXml(color)}" fill-opacity="0.22" stroke="${escapeLegendXml(color)}" stroke-width="0.8" />`,
    );
    parts.push(
      `<path d="M ${x.toFixed(2)} ${(y + height).toFixed(2)} L ${(x + width).toFixed(2)} ${y.toFixed(2)} M ${(x + width * 0.32).toFixed(2)} ${(y + height).toFixed(2)} L ${(x + width).toFixed(2)} ${(y + height * 0.36).toFixed(2)}" stroke="${escapeLegendXml(color)}" stroke-width="0.8" fill="none" />`,
    );
  } else {
    const dash = legendSwatchDashArray(entry.linetype);
    const midY = y + height / 2;
    parts.push(
      `<line x1="${x.toFixed(2)}" y1="${midY.toFixed(2)}" x2="${(x + width).toFixed(2)}" y2="${midY.toFixed(2)}" stroke="${escapeLegendXml(color)}" stroke-width="${Math.max(1, ppi * 0.018).toFixed(2)}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`,
    );
  }
  return parts.join('');
}

/**
 * SVG fragment for PDF export. Returns an empty string when the legend is off
 * or has no visible entries.
 */
export function legendToSvgMarkup(
  settings: LegendSettings,
  ppi: number,
  sheetWidthIn: number,
  sheetHeightIn: number,
): string {
  if (!settings.showOnSheet) return '';
  const layout = layoutLegend(settings, sheetWidthIn, sheetHeightIn);
  if (layout.visibleEntries.length === 0) return '';

  const px = (inches: number) => inches * ppi;
  const fontScale = clamp(settings.fontScale ?? 1, 0.7, 1.8);
  const titleFont = px(0.13 * fontScale);
  const entryFont = px(0.1 * fontScale);
  const x = px(layout.xIn);
  const y = px(layout.yIn);
  const width = px(layout.widthIn);
  const height = px(layout.heightIn);
  const pad = px(layout.padIn);
  const colWidth = (width - pad * 2) / layout.columns;
  const swatchW = px(layout.swatchWIn);
  const swatchH = px(layout.rowIn * 0.56);
  const labelLimit = Math.max(6, Math.floor((colWidth - swatchW - px(layout.gapIn)) / Math.max(1, entryFont * 0.56)));

  const rows: string[] = [];
  layout.visibleEntries.forEach((entry, index) => {
    const column = Math.floor(index / layout.rows);
    const row = index % layout.rows;
    const itemX = x + pad + column * colWidth;
    const itemY = y + pad + px(layout.headerIn) + row * px(layout.rowIn);
    const swatchY = itemY + (px(layout.rowIn) - swatchH) / 2;
    rows.push(swatchMarkup(entry, itemX, swatchY, swatchW, swatchH, ppi));
    rows.push(
      `<text x="${(itemX + swatchW + px(layout.gapIn)).toFixed(2)}" y="${(itemY + px(layout.rowIn) * 0.5).toFixed(2)}" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${entryFont.toFixed(2)}" fill="#111827">${escapeLegendXml(fitLegendLabel(entry.label, labelLimit))}</text>`,
    );
  });

  // The legend plots as text, line samples, and an optional border — never a
  // filled panel, so the sheet reads as one drawing.
  const border = settings.showBorder
    ? `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="none" stroke="#111827" stroke-width="1" />`
    : '';
  const ruleY = y + pad + px(layout.headerIn) - 0.75;
  return `<g data-legend="paperspace">
    ${border}
    <text x="${(x + pad).toFixed(2)}" y="${(y + pad + px(layout.headerIn) * 0.62).toFixed(2)}" font-family="Arial, sans-serif" font-size="${titleFont.toFixed(2)}" font-weight="bold" letter-spacing="0.8" fill="#111827">${escapeLegendXml(settings.title || 'LEGEND')}</text>
    <line x1="${(x + pad).toFixed(2)}" y1="${ruleY.toFixed(2)}" x2="${(x + width - pad).toFixed(2)}" y2="${ruleY.toFixed(2)}" stroke="#111827" stroke-width="0.8" />
    ${rows.join('')}
  </g>`;
}
