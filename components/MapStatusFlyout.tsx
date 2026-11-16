import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExclamationTriangleIcon, MapIcon, XMarkIcon } from './icons.tsx';
import type { MapImageryStatus } from '../utils/mapImageryStatus.ts';

interface MapStatusFlyoutProps {
  status: MapImageryStatus | null;
  enabled: boolean;
  position: { top: number; right: number };
  onClose: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSelectProjection: () => void;
  onOpenSettings: () => void;
}

const sourceLabel = (source?: string): string => {
  switch (source) {
    case 'naip-proxy': return 'NAIP';
    case 'user-maps': return 'Google Maps key';
    case 'user-gemini': return 'Google AI key';
    case 'proxy': return 'LandSurv proxy';
    default: return 'Map service';
  }
};

const mapTypeLabel = (mapType?: string): string => {
  switch (mapType) {
    case 'naip': return 'NAIP aerial';
    case 'hybrid': return 'Hybrid';
    case 'satellite': return 'Satellite';
    case 'terrain': return 'Terrain';
    case 'roadmap': return 'Roadmap';
    default: return 'Aerial';
  }
};

const statusLabel = (kind: MapImageryStatus['kind']): string => {
  switch (kind) {
    case 'disabled': return 'Off';
    case 'no-projection': return 'Projection required';
    case 'loading': return 'Loading imagery';
    case 'ready': return 'Imagery ready';
    case 'error': return 'Load failed';
    default: return 'On · waiting for a view';
  }
};

const statusTone = (kind: MapImageryStatus['kind']): string => {
  switch (kind) {
    case 'ready': return 'text-emerald-300';
    case 'loading': return 'text-cyan-300';
    case 'no-projection': return 'text-amber-300';
    case 'error': return 'text-rose-300';
    case 'disabled': return 'text-slate-400';
    default: return 'text-slate-300';
  }
};

const statusDot = (kind: MapImageryStatus['kind']): string => {
  switch (kind) {
    case 'ready': return 'bg-emerald-400';
    case 'loading': return 'bg-cyan-400 animate-pulse';
    case 'no-projection': return 'bg-amber-400';
    case 'error': return 'bg-rose-400';
    case 'disabled': return 'bg-slate-500';
    default: return 'bg-slate-400';
  }
};

export const MapStatusFlyout: React.FC<MapStatusFlyoutProps> = ({
  status,
  enabled,
  position,
  onClose,
  onToggleEnabled,
  onSelectProjection,
  onOpenSettings,
}) => {
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-map-flyout], [data-map-button]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const kind = status?.kind ?? 'idle';
  const total = status?.total ?? 0;
  const completed = status?.completed ?? 0;
  const percent = total > 0
    ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
    : null;

  return createPortal(
    <div
      data-map-flyout
      role="dialog"
      aria-label="Map imagery status"
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        zIndex: 10050,
      }}
      className="w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-800"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 light-theme:border-gray-200">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <MapIcon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Map imagery</h3>
            <p className={`flex items-center gap-1.5 text-[11px] ${statusTone(kind)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(kind)}`} />
              {statusLabel(kind)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map status"
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white light-theme:hover:bg-gray-100 light-theme:hover:text-gray-900"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-4 text-xs">
        {kind === 'no-projection' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
              <div>
                <p className="font-semibold text-amber-200">This is why the map cannot load</p>
                <p className="mt-1 leading-relaxed text-amber-100/80">
                  {status?.message || 'Map imagery needs a project coordinate system.'}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-amber-100/65">
                  Aerial tiles are requested in the project coordinate system. Without a CRS (EPSG),
                  LandSurv cannot place them on your drawing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSelectProjection}
              className="mt-3 w-full rounded-md bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300"
            >
              Select projection
            </button>
          </div>
        )}

        {kind === 'loading' && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-cyan-100">{status?.message || 'Loading map imagery…'}</span>
              {percent !== null && <span className="font-mono text-[11px] text-cyan-300">{percent}%</span>}
            </div>
            <div
              role="progressbar"
              aria-label="Map imagery loading progress"
              aria-valuemin={0}
              aria-valuemax={total || undefined}
              aria-valuenow={total > 0 ? completed : undefined}
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800 light-theme:bg-gray-200"
            >
              <div
                className={`h-full rounded-full bg-cyan-400 transition-[width] duration-200 ${total > 0 ? '' : 'animate-pulse'}`}
                style={{ width: total > 0 ? `${percent ?? 0}%` : '38%' }}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] text-slate-400">
              {total > 0 ? `${completed} of ${total} tiles received` : 'Preparing the view and checking the cache…'}
            </p>
          </div>
        )}

        {kind === 'error' && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="font-semibold text-rose-200">Map imagery could not be loaded</p>
            <p className="mt-1 max-h-28 overflow-y-auto break-words font-mono text-[10px] leading-relaxed text-rose-100/80">
              {status?.message || 'The map service did not return an image.'}
            </p>
            <p className="mt-2 text-[11px] text-rose-100/65">Pan or zoom to retry, or check the map settings.</p>
          </div>
        )}

        {kind === 'ready' && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
            <p className="font-semibold text-emerald-200">Aerial imagery is on the canvas</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-100/75">
              <span>{mapTypeLabel(status?.mapType)}</span>
              <span className="text-emerald-500/50">·</span>
              <span>{sourceLabel(status?.source)}</span>
              {status?.tileCount ? (
                <>
                  <span className="text-emerald-500/50">·</span>
                  <span>{status.tileCount} tile{status.tileCount === 1 ? '' : 's'}</span>
                </>
              ) : null}
            </div>
          </div>
        )}

        {(kind === 'idle' || kind === 'disabled') && (
          <p className="leading-relaxed text-slate-400 light-theme:text-gray-600">
            {kind === 'disabled'
              ? 'Map imagery is off. Turn it on to load aerial tiles for the current view.'
              : 'Map imagery is on. Pan or zoom the canvas to load tiles. Cached views appear instantly.'}
          </p>
        )}

        {!status && (
          <p className="leading-relaxed text-slate-400">Waiting for the canvas to report its map status…</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 light-theme:border-gray-200">
        <button
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white light-theme:border-gray-300 light-theme:text-gray-700 light-theme:hover:text-gray-900"
        >
          {enabled ? 'Turn off' : 'Turn on'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md border border-cyan-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/10 light-theme:border-cyan-600/30 light-theme:text-cyan-700"
        >
          Map settings
        </button>
      </div>
    </div>,
    document.body,
  );
};
