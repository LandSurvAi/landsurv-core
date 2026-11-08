import React, { useSyncExternalStore } from 'react';
import { legendStore, legendEntryResolvedStyle } from '../services/legendStudio.ts';
import { layoutLegend } from '../utils/legendLayout.ts';

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

  if (!settings.showOnSheet) return null;
  const layout = layoutLegend(settings, sheetWidthIn, sheetHeightIn);
  if (layout.visibleEntries.length === 0) return null;

  const px = (inches: number) => inches * ppi;
  const fontScale = Math.min(1.8, Math.max(0.7, settings.fontScale ?? 1));
  const titleSize = Math.max(6, px(0.13 * fontScale));
  const entrySize = Math.max(5.5, px(0.1 * fontScale));

  return (
    <div
      data-testid="paperspace-legend"
      onDoubleClick={() => onOpenEditor?.()}
      title="Double-click to edit the legend"
      style={{
        position: 'absolute',
        left: px(layout.xIn),
        top: px(layout.yIn),
        width: px(layout.widthIn),
        height: px(layout.heightIn),
        boxSizing: 'border-box',
        padding: px(layout.padIn),
        background: 'rgba(255,255,255,0.94)',
        border: settings.showBorder ? '1px solid #111827' : '1px solid transparent',
        color: '#111827',
        zIndex: 36,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: px(0.05),
          height: px(layout.headerIn),
          fontSize: titleSize,
          fontWeight: 700,
          letterSpacing: '0.08em',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {settings.title || 'LEGEND'}
        </span>
        {onOpenEditor && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onOpenEditor();
            }}
            aria-label="Edit legend"
            title="Edit legend"
            style={{
              border: '1px solid #0f766e',
              background: '#ccfbf1',
              color: '#0f766e',
              fontSize: Math.max(5, entrySize * 0.85),
              lineHeight: 1,
              padding: `${Math.max(1, px(0.015))}px ${Math.max(2, px(0.03))}px`,
              borderRadius: 2,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Edit
          </button>
        )}
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
              title={`${entry.layer}${resolved.patternName ? ` · ${resolved.patternName}` : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: px(layout.gapIn),
                height: px(layout.rowIn),
                padding: 0,
                border: selected ? '1px solid #0f766e' : '1px solid transparent',
                background: selected ? 'rgba(13,148,136,0.16)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: px(layout.swatchWIn),
                  height: px(layout.rowIn * 0.56),
                  flexShrink: 0,
                  background: resolved.color,
                  opacity: 0.85,
                  border: `1px solid ${resolved.color}`,
                  backgroundImage: hatch
                    ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.55) 0 1px, transparent 1px 4px)'
                    : undefined,
                }}
              />
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
    </div>
  );
};

export default LegendBlock;
