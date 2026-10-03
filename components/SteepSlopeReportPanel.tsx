import React from 'react';
import { type SteepSlopeRunResult, type SteepSlopeBand, type TinSurface } from '../types.ts';
import { DownloadIcon } from './icons.tsx';
import { triggerDownload } from '../utils/download.ts';

interface SteepSlopeReportPanelProps {
  runs: SteepSlopeRunResult[];
  tinSurfaces: TinSurface[];
}

interface BandStat {
  band: SteepSlopeBand;
  triangleCount: number;
  planAreaSqFt: number;
  minSlope: number;
  maxSlope: number;
  avgSlope: number;
}

const ACRES_PER_SQFT = 1 / 43560;

/** Plan-projected (horizontal) area of a triangle via the shoelace formula. */
function planAreaForTriangle(tin: TinSurface | undefined, triangleIndex: number): number {
  if (!tin) return 0;
  const tri = tin.triangles[triangleIndex];
  if (!tri) return 0;
  const a = tin.vertices[tri[0]];
  const b = tin.vertices[tri[1]];
  const c = tin.vertices[tri[2]];
  if (!a || !b || !c) return 0;
  return Math.abs(
    (b.easting - a.easting) * (c.northing - a.northing) -
    (c.easting - a.easting) * (b.northing - a.northing)
  ) / 2;
}

function computeBandStats(run: SteepSlopeRunResult, tin: TinSurface | undefined): BandStat[] {
  const byBand = new Map<string, { count: number; area: number; min: number; max: number; sum: number }>();
  for (const band of run.settings.bands) {
    byBand.set(band.id, { count: 0, area: 0, min: Infinity, max: -Infinity, sum: 0 });
  }
  for (const t of run.triangles) {
    const acc = byBand.get(t.bandId);
    if (!acc) continue;
    acc.count += 1;
    acc.area += planAreaForTriangle(tin, t.triangleIndex);
    acc.min = Math.min(acc.min, t.slopePercent);
    acc.max = Math.max(acc.max, t.slopePercent);
    acc.sum += t.slopePercent;
  }
  return run.settings.bands.map(band => {
    const acc = byBand.get(band.id)!;
    return {
      band,
      triangleCount: acc.count,
      planAreaSqFt: acc.area,
      minSlope: acc.count > 0 ? acc.min : 0,
      maxSlope: acc.count > 0 ? acc.max : 0,
      avgSlope: acc.count > 0 ? acc.sum / acc.count : 0,
    };
  });
}

function bandLabel(band: SteepSlopeBand): string {
  const max = Number.isFinite(band.maxPercent) ? `${band.maxPercent}%` : '∞';
  return `${band.minPercent}% – ${max}`;
}

const SteepSlopeReportPanel: React.FC<SteepSlopeReportPanelProps> = ({ runs, tinSurfaces }) => {

  const handleExportTxt = (run: SteepSlopeRunResult) => {
    const tin = tinSurfaces.find(t => t.id === (run.sourceTinId ?? run.settings.sourceTinId));
    const stats = computeBandStats(run, tin);
    const totalArea = stats.reduce((s, b) => s + b.planAreaSqFt, 0);

    let content = `STEEP SLOPE ANALYSIS REPORT: ${run.name}\n`;
    content += `Generated: ${new Date(run.createdAt).toLocaleString()}\n`;
    content += `Source Surface: ${tin?.name ?? run.sourceTinId ?? 'Unknown'}\n`;
    content += `-------------------------------------------------\n\n`;
    content += `SUMMARY:\n`;
    content += `  Triangles analyzed: ${run.analyzedTriangleCount}\n`;
    content += `  Triangles kept:     ${run.keptTriangleCount}\n`;
    content += `  Triangles filtered: ${run.removedTriangleCount}\n`;
    content += `  Min component span: ${run.settings.minComponentLinearSpan ?? run.settings.minComponentVerticalSpan} ft\n`;
    content += `\n`;
    content += `SLOPE BANDS:\n`;
    stats.forEach(s => {
      content += `  ${bandLabel(s.band).padEnd(16)} ${String(s.triangleCount).padStart(6)} tris  ${s.planAreaSqFt.toFixed(0).padStart(12)} sq ft  (${(s.planAreaSqFt * ACRES_PER_SQFT).toFixed(4)} ac)  avg ${s.avgSlope.toFixed(1)}%\n`;
    });
    content += `  ${'TOTAL'.padEnd(16)} ${String(run.triangles.length).padStart(6)} tris  ${totalArea.toFixed(0).padStart(12)} sq ft  (${(totalArea * ACRES_PER_SQFT).toFixed(4)} ac)\n`;
    content += `\n`;
    content += `COMPONENTS (${run.components.length}):\n`;
    run.components.forEach(c => {
      content += `  ${c.id.padEnd(18)} ${String(c.triangleCount).padStart(5)} tris  span ${(c.linearSpan ?? 0).toFixed(1)} ft  elev ${c.minElevation.toFixed(2)}–${c.maxElevation.toFixed(2)}  ${c.kept ? 'KEPT' : 'filtered'}\n`;
    });
    content += `\n-------------------------------------------------\n`;
    content += `Disclaimer: Provided for professional review.`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const safeName = run.name.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
    triggerDownload(blob, `steep_slope_report_${safeName}.txt`);
  };

  const handleExportCsv = (run: SteepSlopeRunResult) => {
    const tin = tinSurfaces.find(t => t.id === (run.sourceTinId ?? run.settings.sourceTinId));
    const stats = computeBandStats(run, tin);

    const rows: string[] = [];
    rows.push('Section,Label,Triangles,Plan Area (sq ft),Plan Area (acres),Avg Slope %,Min Slope %,Max Slope %');
    stats.forEach(s => {
      rows.push([
        'Band',
        `"${bandLabel(s.band)}"`,
        s.triangleCount,
        s.planAreaSqFt.toFixed(2),
        (s.planAreaSqFt * ACRES_PER_SQFT).toFixed(4),
        s.avgSlope.toFixed(2),
        s.minSlope.toFixed(2),
        s.maxSlope.toFixed(2),
      ].join(','));
    });
    rows.push('');
    rows.push('Section,Component,Triangles,Linear Span (ft),Min Elev,Max Elev,Vertical Span,Kept');
    run.components.forEach(c => {
      rows.push([
        'Component',
        c.id,
        c.triangleCount,
        (c.linearSpan ?? 0).toFixed(2),
        c.minElevation.toFixed(2),
        c.maxElevation.toFixed(2),
        c.verticalSpan.toFixed(2),
        c.kept ? 'Yes' : 'No',
      ].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const safeName = run.name.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
    triggerDownload(blob, `steep_slope_report_${safeName}.csv`);
  };

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-gray-300 light-theme:text-gray-700">Steep Slope Reports</h3>
        <p className="text-sm text-gray-400">Slope band areas and components from terrain analysis runs.</p>
      </header>
      <div className="flex-grow overflow-auto p-4 space-y-4">
        {runs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Run a steep slope analysis to see reports here.
          </div>
        ) : (
          runs.map(run => {
            const tin = tinSurfaces.find(t => t.id === (run.sourceTinId ?? run.settings.sourceTinId));
            const stats = computeBandStats(run, tin);
            const totalArea = stats.reduce((s, b) => s + b.planAreaSqFt, 0);
            return (
              <div key={run.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-lg text-rose-400">{run.name}</h4>
                    <p className="text-xs text-gray-400">
                      Generated: {new Date(run.createdAt).toLocaleString()} · Surface: {tin?.name ?? run.sourceTinId ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleExportTxt(run)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-200 bg-rose-600 text-white hover:bg-rose-700">
                      <DownloadIcon className="w-4 h-4" />
                      .txt
                    </button>
                    <button onClick={() => handleExportCsv(run)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-200 bg-orange-600 text-white hover:bg-orange-700">
                      <DownloadIcon className="w-4 h-4" />
                      .csv
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div className="bg-gray-900/50 p-3 rounded-md light-theme:bg-gray-200/50">
                    <p className="text-xs text-gray-400">Analyzed</p>
                    <p className="font-semibold text-gray-200 light-theme:text-gray-700">{run.analyzedTriangleCount}</p>
                  </div>
                  <div className="bg-gray-900/50 p-3 rounded-md light-theme:bg-gray-200/50">
                    <p className="text-xs text-gray-400">Kept</p>
                    <p className="font-semibold text-emerald-400">{run.keptTriangleCount}</p>
                  </div>
                  <div className="bg-gray-900/50 p-3 rounded-md light-theme:bg-gray-200/50">
                    <p className="text-xs text-gray-400">Filtered</p>
                    <p className="font-semibold text-gray-400">{run.removedTriangleCount}</p>
                  </div>
                </div>

                <h5 className="font-semibold text-gray-300 mb-2 light-theme:text-gray-600">Slope Bands</h5>
                <div className="overflow-x-auto bg-gray-900/50 rounded-md light-theme:bg-gray-200/50 mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700 light-theme:border-gray-300">
                        <th className="text-left p-2">Band</th>
                        <th className="text-right p-2">Triangles</th>
                        <th className="text-right p-2">Plan Area (sq ft)</th>
                        <th className="text-right p-2">Acres</th>
                        <th className="text-right p-2">Avg Slope</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {stats.map(s => (
                        <tr key={s.band.id} className="border-b border-gray-800/50 light-theme:border-gray-300/50">
                          <td className="p-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.band.color }} />
                              {bandLabel(s.band)}
                            </span>
                          </td>
                          <td className="text-right p-2">{s.triangleCount}</td>
                          <td className="text-right p-2">{s.planAreaSqFt.toFixed(0)}</td>
                          <td className="text-right p-2">{(s.planAreaSqFt * ACRES_PER_SQFT).toFixed(4)}</td>
                          <td className="text-right p-2">{s.avgSlope.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-gray-200 light-theme:text-gray-700">
                        <td className="p-2">Total</td>
                        <td className="text-right p-2">{run.triangles.length}</td>
                        <td className="text-right p-2">{totalArea.toFixed(0)}</td>
                        <td className="text-right p-2">{(totalArea * ACRES_PER_SQFT).toFixed(4)}</td>
                        <td className="text-right p-2">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h5 className="font-semibold text-gray-300 mb-2 light-theme:text-gray-600">Components ({run.components.length})</h5>
                <div className="max-h-48 overflow-y-auto bg-gray-900/50 p-2 rounded-md font-mono text-xs light-theme:bg-gray-200/50">
                  {run.components.map(c => (
                    <p key={c.id} className={c.kept ? 'text-gray-300 light-theme:text-gray-700' : 'text-gray-500'}>
                      {c.id.padEnd(18)} {String(c.triangleCount).padStart(5)} tris · span {(c.linearSpan ?? 0).toFixed(1)} ft · elev {c.minElevation.toFixed(1)}–{c.maxElevation.toFixed(1)} · {c.kept ? 'KEPT' : 'filtered'}
                    </p>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SteepSlopeReportPanel;
