import React, { useContext, useMemo, useState } from 'react';
import { Box, Download, Eye, EyeOff, FileUp, Focus, Frame, Mountain, Plus } from 'lucide-react';
import type { TinSurface } from '../types.ts';
import {
  tinSurfaceBounds,
  tinSurfaceDisplayMode,
  tinSurfacePlanArea,
  type TinSurfaceDisplayMode,
} from '../services/TinService.ts';
import { A2UIHostContext } from './A2UISurface.tsx';

export interface A2UITinSurfacesProps {
  surfaces?: TinSurface[];
  /** Number of contour generations available as a TIN source. */
  contourGenerationCount?: number;
  isImporting?: boolean;
  importStatus?: string | null;
  /** Workspace-wide style for surfaces without an explicit displayMode. */
  defaultDisplayMode?: TinSurfaceDisplayMode;
  onImport?: () => void;
  onCreateFromContours?: () => void;
  onExport?: (tinId: string, format: 'landxml' | 'native') => void;
  /** Draw, hide, or restyle one surface on the canvas. */
  onSetDisplayMode?: (tinId: string, mode: TinSurfaceDisplayMode | 'hidden') => void;
  onToggleVisibility?: (tinId: string) => void;
  /** Unhide, draw, show the canvas, and zoom to the surface. */
  onShowOnCanvas?: (tinId: string, mode?: TinSurfaceDisplayMode) => void;
}

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const formatNumber = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

/**
 * A2UI "TIN Surfaces" workspace surface.
 *
 * This is the single place to draw a loaded `.tin`, LandXML, or contour-built
 * surface on the canvas. Each surface carries its own wireframe/shaded display
 * mode, so a site plan can keep one surface shaded while another is wireframe.
 * The same component is mounted from the surface catalog, chat intent, and the
 * workspace tool renderer; app-owned callbacks keep the actions identical.
 */
export const A2UITinSurfaces: React.FC<A2UITinSurfacesProps> = ({
  surfaces: surfacesProp,
  contourGenerationCount: contourGenerationCountProp,
  isImporting: isImportingProp,
  importStatus: importStatusProp,
  defaultDisplayMode: defaultDisplayModeProp,
  onImport: onImportProp,
  onCreateFromContours: onCreateFromContoursProp,
  onExport: onExportProp,
  onSetDisplayMode: onSetDisplayModeProp,
  onToggleVisibility: onToggleVisibilityProp,
  onShowOnCanvas: onShowOnCanvasProp,
}) => {
  // Catalog-launched surfaces are stored as React nodes by the bus, so live
  // values come from the host context. The workspace-tool path passes props.
  const host = useContext(A2UIHostContext);
  const surfaces = surfacesProp ?? host.tinSurfaces ?? [];
  const contourGenerationCount = contourGenerationCountProp ?? host.contourGenerationCount ?? 0;
  const isImporting = isImportingProp ?? host.isImportingTin ?? false;
  const importStatus = importStatusProp ?? host.tinImportStatus ?? null;
  const defaultDisplayMode = defaultDisplayModeProp ?? host.tinDefaultDisplayMode ?? 'wireframe';
  const onImport = onImportProp ?? host.onImportTinSurface ?? (() => {});
  const onCreateFromContours = onCreateFromContoursProp ?? host.onCreateTinFromContours ?? (() => {});
  const onExport = onExportProp ?? host.onExportTinSurface ?? (() => {});
  const onSetDisplayMode = onSetDisplayModeProp ?? host.onSetTinSurfaceDisplayMode ?? (() => {});
  const onToggleVisibility = onToggleVisibilityProp ?? host.onToggleTinSurfaceVisibility ?? (() => {});
  const onShowOnCanvas = onShowOnCanvasProp ?? host.onShowTinSurfaceOnCanvas ?? (() => {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => surfaces.find(surface => surface.id === selectedId) ?? surfaces[surfaces.length - 1] ?? null,
    [selectedId, surfaces],
  );

  const stats = useMemo(() => {
    const map = new Map<
      string,
      { mode: TinSurfaceDisplayMode; bounds: ReturnType<typeof tinSurfaceBounds>; area: number }
    >();
    for (const surface of surfaces) {
      map.set(surface.id, {
        mode: tinSurfaceDisplayMode(surface, defaultDisplayMode === 'shaded'),
        bounds: tinSurfaceBounds(surface),
        area: tinSurfacePlanArea(surface),
      });
    }
    return map;
  }, [surfaces, defaultDisplayMode]);

  return (
    <div data-testid="a2ui-tin-surfaces" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/[0.07] px-3.5 py-3">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          <Mountain className="h-3 w-3" /> TIN Surfaces
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Draw a loaded <code>.tin</code>, LandXML, or contour-built surface on the canvas as a
          <strong className="text-slate-200"> wireframe</strong> or a
          <strong className="text-slate-200"> shaded</strong> elevation model. Each surface keeps its
          own display style.
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <button
            type="button"
            onClick={onImport}
            disabled={isImporting}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[11px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 disabled:cursor-wait disabled:opacity-60"
          >
            <FileUp className="h-3.5 w-3.5" />
            {isImporting ? 'Importing…' : 'Import .TIN / LandXML'}
          </button>
          <button
            type="button"
            onClick={onCreateFromContours}
            disabled={contourGenerationCount === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Create from Contours
          </button>
          <button
            type="button"
            onClick={() => selected && onExport(selected.id, 'landxml')}
            disabled={!selected}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export LandXML
          </button>
        </div>
        {isImporting && (
          <p className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[10px] text-cyan-200">
            {importStatus ?? 'Parsing surface…'}
          </p>
        )}
        {contourGenerationCount === 0 && (
          <p className="mt-2 text-[10px] text-slate-500">
            Generate contours first to enable <strong>Create from Contours</strong>.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {surfaces.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-6 text-center">
            <Mountain className="mx-auto h-5 w-5 text-slate-600" />
            <p className="mt-1.5 text-[11px] font-semibold text-slate-300">No surfaces loaded</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
              Import a <code>.tin</code> or LandXML surface, or build one from the latest contour
              generation. It will appear here ready to draw.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {surfaces.map(surface => {
              const active = selected?.id === surface.id;
              const stat = stats.get(surface.id);
              const mode = stat?.mode ?? 'wireframe';
              const hidden = surface.hidden === true;
              return (
                <div
                  key={surface.id}
                  data-testid={`tin-surface-${surface.id}`}
                  className={`rounded-lg border px-2.5 py-2 transition-colors ${
                    active
                      ? 'border-cyan-400/40 bg-cyan-400/[0.07]'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(surface.id)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: surface.color || '#22d3ee' }}
                        />
                        <span className="truncate text-[11.5px] font-semibold text-slate-100">
                          {surface.name}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {formatNumber(surface.vertices.length)} vertices ·{' '}
                        {formatNumber(surface.triangles.length)} triangles
                      </span>
                      <span className="mt-0.5 block text-[9.5px] text-slate-500">
                        {stat?.bounds
                          ? `Z ${formatNumber(stat.bounds.minZ, 1)}–${formatNumber(stat.bounds.maxZ, 1)} · ~${formatNumber(stat.area)} sq project units`
                          : 'No elevation geometry'}
                        {' · '}
                        {formatDate(surface.createdAt)}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${
                        hidden
                          ? 'border-white/10 bg-white/[0.04] text-slate-500'
                          : mode === 'shaded'
                            ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                            : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
                      }`}
                    >
                      {hidden ? 'Hidden' : mode === 'shaded' ? 'Shaded' : 'Wireframe'}
                    </span>
                  </button>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <div
                      role="group"
                      aria-label={`Canvas display for ${surface.name}`}
                      className="inline-flex overflow-hidden rounded-md border border-white/10"
                    >
                      <button
                        type="button"
                        aria-pressed={mode === 'wireframe' && !hidden}
                        onClick={() => onSetDisplayMode(surface.id, 'wireframe')}
                        className={`inline-flex items-center gap-1 px-1.5 py-1 text-[9.5px] font-semibold transition-colors ${
                          mode === 'wireframe' && !hidden
                            ? 'bg-cyan-400/15 text-cyan-200'
                            : 'bg-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                        }`}
                        title="Draw this surface as a triangle wireframe"
                      >
                        <Frame className="h-3 w-3" /> Wireframe
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === 'shaded' && !hidden}
                        onClick={() => onSetDisplayMode(surface.id, 'shaded')}
                        className={`inline-flex items-center gap-1 border-l border-white/10 px-1.5 py-1 text-[9.5px] font-semibold transition-colors ${
                          mode === 'shaded' && !hidden
                            ? 'bg-amber-400/15 text-amber-200'
                            : 'bg-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                        }`}
                        title="Draw this surface with elevation shading"
                      >
                        <Box className="h-3 w-3" /> Shaded
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleVisibility(surface.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[9.5px] font-semibold text-slate-300 transition-colors hover:border-white/25 hover:text-white"
                      title={hidden ? 'Show this surface on the canvas' : 'Hide this surface from the canvas'}
                    >
                      {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {hidden ? 'Show' : 'Hide'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onShowOnCanvas(surface.id, mode)}
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-1 text-[9.5px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15"
                      title="Unhide, draw, and zoom the canvas to this surface"
                    >
                      <Focus className="h-3 w-3" /> Show on canvas
                    </button>

                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onExport(surface.id, 'landxml')}
                        className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                        title="Export this surface as LandXML"
                      >
                        LandXML
                      </button>
                      <button
                        type="button"
                        onClick={() => onExport(surface.id, 'native')}
                        className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                        title="Export this surface as native .tin"
                      >
                        .tin
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="border-t border-white/[0.07] px-3 py-2 text-[9px] text-slate-500">
        CACP: <code>set_tin_surface_display</code>, <code>create_tin_from_contours</code>,{' '}
        <code>import_tin_surface</code>, <code>export_tin_surface</code>, <code>open_tin_surfaces</code>.
      </p>
    </div>
  );
};

export default A2UITinSurfaces;
