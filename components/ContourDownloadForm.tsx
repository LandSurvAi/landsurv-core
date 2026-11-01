import React from 'react';

export interface ContourDownloadFormProps {
  mode: 'inclusion' | 'description';
  onModeChange: (mode: 'inclusion' | 'description') => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  hasInclusionBoundary: boolean;
  inclusionSegmentCount: number;
  /**
   * When provided, inclusion mode additionally requires a project projection.
   * ESRI queries need georeferenced coordinates; the chat panel omits this
   * check because it does not render the projection warning.
   */
  hasProjectProjection?: boolean;
  isFetching: boolean;
  /** Called with the chosen mode; description is undefined in inclusion mode. */
  onDownload: (mode: 'inclusion' | 'description', description?: string) => void;
}

/** Shared area-of-interest + download controls for contour services. */
export const ContourDownloadForm: React.FC<ContourDownloadFormProps> = ({
  mode,
  onModeChange,
  description,
  onDescriptionChange,
  hasInclusionBoundary,
  inclusionSegmentCount,
  hasProjectProjection,
  isFetching,
  onDownload,
}) => {
  const inclusionReady = hasInclusionBoundary && hasProjectProjection !== false;
  const inclusionWarning = !hasInclusionBoundary
    ? '⚠ No inclusion line drawn — use the canvas toolbar to draw an inclusion boundary first'
    : hasProjectProjection === false
      ? '⚠ Inclusion mode also needs a project projection/EPSG. Without it, local drafting coordinates are not georeferenced for ESRI queries.'
      : `✓ Inclusion boundary detected (${inclusionSegmentCount} segment${inclusionSegmentCount !== 1 ? 's' : ''})`;

  return (
    <div className="border-t border-gray-600/50 px-3 py-2.5 space-y-2.5 bg-gray-800/50">
      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange('inclusion')}
          className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
            mode === 'inclusion'
              ? 'bg-green-700/40 border-green-500/50 text-green-200'
              : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'
          }`}
        >
          Inclusion Boundary
        </button>
        <button
          type="button"
          onClick={() => onModeChange('description')}
          className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
            mode === 'description'
              ? 'bg-blue-700/40 border-blue-500/50 text-blue-200'
              : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'
          }`}
        >
          Describe Area
        </button>
      </div>

      {/* Inclusion mode info */}
      {mode === 'inclusion' && (
        <div className={`text-[10px] rounded px-2 py-1.5 border ${
          inclusionReady
            ? 'bg-green-900/20 border-green-700/40 text-green-300'
            : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-400'
        }`}>
          {inclusionWarning}
        </div>
      )}

      {/* Description mode input */}
      {mode === 'description' && (
        <div className="space-y-1">
          <input
            type="text"
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && description.trim()) {
                onDownload('description', description.trim());
              }
            }}
            placeholder="e.g. Lancaster County PA, downtown Philadelphia…"
            className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 placeholder-gray-500"
          />
          <p className="text-[10px] text-gray-500">
            Area will be geocoded via OpenStreetMap to build the bounding box.
          </p>
        </div>
      )}

      {/* Download button */}
      <button
        type="button"
        onClick={() => {
          if (mode === 'inclusion') {
            onDownload('inclusion');
          } else {
            onDownload('description', description.trim());
          }
        }}
        disabled={
          isFetching ||
          (mode === 'inclusion' && !inclusionReady) ||
          (mode === 'description' && !description.trim())
        }
        className="w-full py-1.5 text-xs font-semibold rounded border bg-teal-700/50 hover:bg-teal-600/60 text-teal-100 border-teal-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isFetching ? (
          <><span className="w-3 h-3 border border-teal-300 border-t-transparent rounded-full animate-spin" />Fetching…</>
        ) : (
          '↓ Download Contours'
        )}
      </button>
    </div>
  );
};

export default ContourDownloadForm;
