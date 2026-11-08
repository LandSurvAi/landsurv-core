import React, { useSyncExternalStore } from 'react';
import { QuickChip } from './common/QuickChip.tsx';
import { legendStore, type LegendDrawingLayer } from '../services/legendStudio.ts';

export interface LegendQuickActionsProps {
  /** Layers currently on the drawing; enables the bulk add action. */
  availableLayers?: LegendDrawingLayer[];
  onOpenEditor?: () => void;
  onOpenSheetView?: () => void;
  /** Hide the bulk add chip where the drawing's layers are not known. */
  showAddAll?: boolean;
}

/**
 * The quick-thought strip of the linked legend. Every chip is a real action on
 * the same store the canvas and paperspace block read, so no chat round trip is
 * needed to show/hide the sheet legend or bulk-edit entries.
 */
export const LegendQuickActions: React.FC<LegendQuickActionsProps> = ({
  availableLayers = [],
  onOpenEditor,
  onOpenSheetView,
  showAddAll = true,
}) => {
  const settings = useSyncExternalStore(
    legendStore.subscribe,
    legendStore.getSnapshot,
    legendStore.getSnapshot,
  );
  const allVisible =
    settings.entries.length > 0 && settings.entries.every(entry => entry.visible !== false);

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="legend-quick-actions">
      <QuickChip
        tone={settings.showOnSheet ? 'accent' : 'neutral'}
        label={settings.showOnSheet ? 'Hide on sheet' : 'Show on sheet'}
        onClick={() => legendStore.update({ showOnSheet: !settings.showOnSheet })}
      />
      {showAddAll && (
        <QuickChip
          label="Add all drawn"
          onClick={() => legendStore.syncFromDrawing(availableLayers)}
          disabled={availableLayers.length === 0}
          title="Add a legend entry for every layer currently on the drawing"
        />
      )}
      <QuickChip
        label={allVisible ? 'Hide all' : 'Show all'}
        onClick={() => legendStore.setAllVisible(!allVisible)}
        disabled={settings.entries.length === 0}
        title={allVisible ? 'Hide every legend entry' : 'Show every legend entry'}
      />
      {onOpenEditor && <QuickChip label="Edit legend" onClick={onOpenEditor} />}
      {onOpenSheetView && <QuickChip label="Sheet View" onClick={onOpenSheetView} />}
    </div>
  );
};

export default LegendQuickActions;
