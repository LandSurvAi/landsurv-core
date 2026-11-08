import React, { useContext, useMemo, useState } from 'react';
import { Download, FileUp, Mountain, Plus } from 'lucide-react';
import type { TinSurface } from '../types.ts';
import { A2UIHostContext } from './A2UISurface.tsx';

export interface A2UITinSurfacesProps {
  surfaces?: TinSurface[];
  /** Number of contour generations available as a TIN source. */
  contourGenerationCount?: number;
  isImporting?: boolean;
  importStatus?: string | null;
  onImport?: () => void;
  onCreateFromContours?: () => void;
  onExport?: (tinId: string, format: 'landxml' | 'native') => void;
}

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

/**
 * A2UI "TIN Surfaces" workspace surface.
 *
 * Surfaces are available to every agent: the same component is mounted from the
 * surface catalog, chat intent ("open TIN surfaces"), and the workspace tool
 * renderer. Import/create/export callbacks are owned by the app so CACP and the
 * canvas panel share one implementation.
 */
export const A2UITinSurfaces: React.FC<A2UITinSurfacesProps> = ({
  surfaces: surfacesProp,
  contourGenerationCount: contourGenerationCountProp,
  isImporting: isImportingProp,
  importStatus: importStatusProp,
  onImport: onImportProp,
  onCreateFromContours: onCreateFromContoursProp,
  onExport: onExportProp,
}) => {
  // Catalog-launched surfaces are stored as React nodes by the bus, so live
  // values come from the host context. The workspace-tool path passes props.
  const host = useContext(A2UIHostContext);
  const surfaces = surfacesProp ?? host.tinSurfaces ?? [];
  const contourGenerationCount = contourGenerationCountProp ?? host.contourGenerationCount ?? 0;
  const isImporting = isImportingProp ?? host.isImportingTin ?? false;
  const importStatus = importStatusProp ?? host.tinImportStatus ?? null;
  const onImport = onImportProp ?? host.onImportTinSurface ?? (() => {});
  const onCreateFromContours = onCreateFromContoursProp ?? host.onCreateTinFromContours ?? (() => {});
  const onExport = onExportProp ?? host.onExportTinSurface ?? (() => {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => surfaces.find(surface => surface.id === selectedId) ?? surfaces[surfaces.length - 1] ?? null,
    [selectedId, surfaces],
  );

  return (
    <div data-testid="a2ui-tin-surfaces" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/[0.07] px-3.5 py-3">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          <Mountain className="h-3 w-3" /> TIN Surfaces
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Create a surface from contours, import <code>.tin</code> / LandXML, and export.
          The latest surface is available to contour generation, steep-slope analysis, and CACP peers.
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
          <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-6 text-center text-[11px] text-slate-500">
            No TIN surfaces in this session yet. Import a surface or create one from contours.
          </div>
        ) : (
          <div className="space-y-1.5">
            {surfaces.map(surface => {
              const active = selected?.id === surface.id;
              return (
                <div
                  key={surface.id}
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
                      <span className="block truncate text-[11.5px] font-semibold text-slate-100">
                        {surface.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {surface.vertices.length.toLocaleString()} vertices ·{' '}
                        {surface.triangles.length.toLocaleString()} triangles
                      </span>
                      <span className="mt-0.5 block text-[9.5px] text-slate-500">
                        {formatDate(surface.createdAt)}
                      </span>
                    </span>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${surface.hidden ? 'bg-slate-600' : 'bg-cyan-400'}`} />
                  </button>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onExport(surface.id, 'landxml')}
                      className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      LandXML
                    </button>
                    <button
                      type="button"
                      onClick={() => onExport(surface.id, 'native')}
                      className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      .tin
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="border-t border-white/[0.07] px-3 py-2 text-[9px] text-slate-500">
        CACP: <code>create_tin_from_contours</code>, <code>import_tin_surface</code>,{' '}
        <code>export_tin_surface</code>, <code>open_tin_surfaces</code>.
      </p>
    </div>
  );
};

export default A2UITinSurfaces;
