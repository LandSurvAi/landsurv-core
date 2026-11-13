import React, { useSyncExternalStore } from 'react';
import { legendStore, legendEntryResolvedStyle } from '../services/legendStudio.ts';
import { layoutLegend, legendSwatchDashArray } from '../utils/legendLayout.ts';
import { PaperObjectLockButton, PaperResizeHandle } from './PaperObjectChrome.tsx';
import { clampPaperPosition, paperScaleFromDrag } from '../utils/paperObjects.ts';

interface LegendBlockProps {
  /** Pixels per sheet inch (SheetView's effectivePpi). */
  ppi: number;
  sheetWidthIn: number;
  sheetHeightIn: number;
  /** Open the Legend A2UI editor from the sheet. */
  onOpenEditor?: () => void;
}

/**
 * The paperspace legend. It reads the shared legend store directly, so every
 * edit in the Legend A2UI appears here immediately, and clicking an entry
 * selects the same entry in the editor.
 *
 * The block is a first-class paper object: drag it to move, drag the corner
 * handle to proportionally scale it, and lock it to prevent both. Position and
 * size are stored in the same settings the PDF exporter reads.
 */
export const LegendBlock: React.FC<LegendBlockProps> = ({
  ppi,
  sheetWidthIn,
  sheetHeightIn,
  onOpenEditor,
}) => {
  const settings = useSyncExternalStore(
    legendStore.subscribe,
    legendStore.getSnapshot,
    legendStore.getSnapshot,
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Consume the click even while locked so it cannot start a sheet pan.
    e.stopPropagation();
    if (settings.locked) return;
    // Capture the gesture before the layout recomputes from the new position.
    const startX = e.clientX;
    const startY = e.clientY;
    const layout = layoutLegend(settings, sheetWidthIn, sheetHeightIn);
    const origX = layout.xIn;
    const origY = layout.yIn;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';

    const onMove = (ev: MouseEvent) => {
      const next = clampPaperPosition({
        xIn: origX + (ev.clientX - startX) / ppi,
        yIn: origY + (ev.clientY - startY) / ppi,
        widthIn: layout.widthIn,
        heightIn: layout.heightIn,
      }, sheetWidthIn, sheetHeightIn);
      legendStore.update({ xIn: next.xIn, yIn: next.yIn });
    };
    const onUp = () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (settings.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const layout = layoutLegend(settings, sheetWidthIn, sheetHeightIn);
    const startX = e.clientX;
    const origWidth = settings.widthIn ?? layout.widthIn;
    const origFontScale = settings.fontScale ?? 1;
    const maxWidth = Math.max(1.4, sheetWidthIn - layout.xIn - 0.1);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'nwse-resize';

    const onMove = (ev: MouseEvent) => {
      const ratio = paperScaleFromDrag(origWidth, (ev.clientX - startX) / ppi, { min: 0.5, max: 2.5 });
      const widthIn = Math.min(origWidth * ratio, maxWidth);
      const applied = widthIn / origWidth;
      legendStore.update({
        widthIn,
        fontScale: Math.min(1.8, Math.max(0.7, origFontScale * applied)),
      });
    };
    const onUp = () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
  };

  if (!settings.showOnSheet) return null;
  const layout = layoutLegend(settings, sheetWidthIn, sheetHeightIn);
  if (layout.visibleEntries.length === 0) return null;

  const px = (inches: number) => inches * ppi;
  const fontScale = Math.min(1.8, Math.max(0.7, settings.fontScale ?? 1));
  const titleSize = Math.max(6, px(0.13 * fontScale));
  const entrySize = Math.max(5.5, px(0.1 * fontScale));
  const swatchW = Math.max(4, px(layout.swatchWIn));
  const swatchH = Math.max(3, px(layout.rowIn * 0.56));
  const ruleWidth = Math.max(0.75, px(0.012));
  const locked = settings.locked === true;

  return (
    <div
      data-testid="paperspace-legend"
      className="group"
      onMouseDown={onMouseDown}
      onDoubleClick={() => onOpenEditor?.()}
      title={locked
        ? 'Legend locked — unlock to move or scale'
        : 'Legend — drag to move, corner handle to scale, double-click to edit'}
      style={{
        position: 'absolute',
        left: px(layout.xIn),
        top: px(layout.yIn),
        width: px(layout.widthIn),
        height: px(layout.heightIn),
        boxSizing: 'border-box',
        padding: px(layout.padIn),
        background: 'transparent',
        border: settings.showBorder ? '1px solid #111827' : 'none',
        color: '#111827',
        zIndex: 36,
        pointerEvents: 'auto',
        overflow: 'hidden',
        cursor: locked ? 'default' : 'move',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: px(0.05),
          height: px(layout.headerIn),
          boxSizing: 'border-box',
          fontSize: titleSize,
          fontWeight: 700,
          letterSpacing: '0.08em',
          fontFamily: 'Arial, sans-serif',
          borderBottom: `${ruleWidth}px solid #111827`,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {settings.title || 'LEGEND'}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          columnGap: px(layout.gapIn),
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {layout.visibleEntries.map(entry => {
          const resolved = legendEntryResolvedStyle(entry);
          const selected = settings.selectedEntryId === entry.id;
          const hatch = Boolean(resolved.patternName);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => legendStore.select(entry.id)}
              aria-pressed={selected}
              title={`${entry.layer}${resolved.patternName ? ` · ${resolved.patternName}` : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: px(layout.gapIn),
                height: px(layout.rowIn),
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 0,
              }}
            >
              <svg
                width={swatchW}
                height={swatchH}
                viewBox={`0 0 ${swatchW} ${swatchH}`}
                aria-hidden="true"
                style={{ display: 'block', flexShrink: 0 }}
              >
                {hatch ? (
                  <>
                    <rect
                      x={0.5}
                      y={0.5}
                      width={Math.max(0, swatchW - 1)}
                      height={Math.max(0, swatchH - 1)}
                      fill={resolved.color}
                      fillOpacity={0.22}
                      stroke={resolved.color}
                      strokeWidth={ruleWidth}
                    />
                    <path
                      d={`M 0 ${swatchH} L ${swatchW} 0 M ${swatchW * 0.32} ${swatchH} L ${swatchW} ${swatchH * 0.36}`}
                      stroke={resolved.color}
                      strokeWidth={ruleWidth}
                      fill="none"
                    />
                  </>
                ) : (
                  <line
                    x1={0}
                    y1={swatchH / 2}
                    x2={swatchW}
                    y2={swatchH / 2}
                    stroke={resolved.color}
                    strokeWidth={Math.max(1, px(0.018))}
                    strokeDasharray={legendSwatchDashArray(resolved.linetype)}
                  />
                )}
              </svg>
              <span
                style={{
                  fontSize: entrySize,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {resolved.label}
              </span>
            </button>
          );
        })}
      </div>

      <PaperObjectLockButton
        locked={locked}
        name="legend"
        onToggle={() => legendStore.update({ locked: !locked })}
      />
      {!locked && (
        <PaperResizeHandle
          onMouseDown={onResizeMouseDown}
          title="Drag to scale the legend"
        />
      )}
    </div>
  );
};

export default LegendBlock;
