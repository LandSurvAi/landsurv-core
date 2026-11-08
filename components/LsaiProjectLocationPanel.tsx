import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LandPlot,
  Loader2,
  RefreshCw,
  ServerOff,
} from 'lucide-react';
import type {
  CountyGisStatus,
  ProjectLocationCluster,
  ProjectLocationClusterSet,
} from '../types.ts';

export type ProjectLocationAction = 'parcels' | 'flood' | 'soils';

interface LsaiProjectLocationPanelProps {
  clusterSet: ProjectLocationClusterSet;
  /** True while the state/county/municipality lookup is in flight. */
  isResolving?: boolean;
  error?: string | null;
  /** Cluster + action currently running a GIS request. */
  busy?: { clusterId: string; action: ProjectLocationAction } | null;
  onRefresh?: () => void;
  onFocusCluster?: (cluster: ProjectLocationCluster) => void;
  onFetchParcels?: (cluster: ProjectLocationCluster) => void;
  onFetchFlood?: (cluster: ProjectLocationCluster) => void;
  onFetchSoils?: (cluster: ProjectLocationCluster) => void;
  /** Live County (parcel GIS) status, including fallbacks and errors. */
  countyStatus?: CountyGisStatus | null;
  /** Retry the last County fetch for the same cluster. */
  onCountyRetry?: () => void;
  /** Open the County Parcels workspace to pick or add a server. */
  onOpenCountyGis?: () => void;
  /** Active inclusion boundary, offered as an alternate query area. */
  inclusionArea?: { id: string; name: string; segmentCount: number } | null;
  /** Fetch a layer for the inclusion area instead of a cluster footprint. */
  onFetchInclusion?: (action: ProjectLocationAction) => void;
}

const CARD = 'rounded-xl border border-white/[0.08] bg-white/[0.025]';
const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide';
const ACTION =
  'inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function confidenceClass(confidence: string): string {
  switch (confidence) {
    case 'high':
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
    case 'medium':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
    case 'low':
      return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
    default:
      return 'border-slate-500/30 bg-slate-500/10 text-slate-400';
  }
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function jurisdictionValue(value: string | undefined, pending: boolean): string {
  if (value) return value;
  return pending ? 'Resolving…' : 'Unavailable';
}

function jurisdictionSourceLabel(cluster: ProjectLocationCluster): string {
  const jurisdiction = cluster.jurisdiction;
  if (!jurisdiction) return 'Not resolved yet';
  if (jurisdiction.source === 'census-geocoder') return 'US Census geocoder';
  if (jurisdiction.source === 'nominatim') return 'OpenStreetMap';
  if (jurisdiction.source === 'projection') return 'Project CRS only';
  return jurisdiction.error ?? 'No US jurisdiction matched';
}

const COUNTY_TONE = {
  loading: {
    border: 'border-cyan-400/25',
    background: 'bg-cyan-400/[0.05]',
    chip: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    icon: 'text-cyan-300',
    Icon: Loader2,
  },
  success: {
    border: 'border-emerald-400/25',
    background: 'bg-emerald-400/[0.05]',
    chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    icon: 'text-emerald-300',
    Icon: CheckCircle2,
  },
  warning: {
    border: 'border-amber-400/30',
    background: 'bg-amber-400/[0.06]',
    chip: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    icon: 'text-amber-300',
    Icon: AlertTriangle,
  },
  error: {
    border: 'border-rose-400/30',
    background: 'bg-rose-400/[0.06]',
    chip: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    icon: 'text-rose-300',
    Icon: ServerOff,
  },
} as const;

const CountyStatusCard: React.FC<{
  status: CountyGisStatus;
  onRetry?: () => void;
  onOpenCountyGis?: () => void;
}> = ({ status, onRetry, onOpenCountyGis }) => {
  const tone = COUNTY_TONE[status.state];
  const StatusIcon = tone.Icon;
  return (
    <section
      data-testid="county-gis-status"
      data-state={status.state}
      className={`rounded-xl border ${tone.border} ${tone.background} p-3 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.9)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={`mt-0.5 rounded-lg border p-1.5 ${tone.chip}`}>
            <LandPlot className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-100">County</p>
              <span className={`rounded-full border px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide ${tone.chip}`}>
                {status.state === 'loading' ? 'Contacting GIS' : status.state}
              </span>
              {status.aoi === 'inclusion' && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-emerald-200">
                  Inclusion AOI
                </span>
              )}
              {status.usedStatewide && (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-amber-200">
                  Statewide fallback
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] font-medium leading-snug text-slate-100">{status.message}</p>
            {status.jurisdictionLabel && (
              <p className="mt-0.5 truncate text-[9.5px] text-slate-400">
                {status.jurisdictionLabel}
                {status.serviceLabel ? ` · ${status.serviceLabel}` : ''}
              </p>
            )}
          </div>
        </div>
        <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon} ${status.state === 'loading' ? 'animate-spin' : ''}`} />
      </div>

      {status.attempts.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {status.attempts.map(attempt => (
            <li
              key={`${attempt.match}-${attempt.label}`}
              className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-black/20 px-2 py-1"
            >
              <span className="min-w-0 truncate text-[10px] text-slate-300">{attempt.label}</span>
              <span className={`shrink-0 font-mono text-[9px] font-semibold ${attempt.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                {attempt.ok ? `${attempt.featureCount.toLocaleString()} features` : (attempt.issue ?? 'failed').replace(/-/g, ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {status.guidance && (
        <p className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[10px] leading-snug text-slate-300">
          {status.guidance}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {status.state !== 'loading' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`${ACTION} border-cyan-400/35 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20`}
          >
            <RefreshCw className="h-3 w-3" />
            Retry county
          </button>
        )}
        {onOpenCountyGis && (
          <button
            type="button"
            onClick={onOpenCountyGis}
            className={`${ACTION} border-white/[0.14] bg-white/[0.04] text-slate-200 hover:border-white/[0.25] hover:bg-white/[0.07]`}
          >
            <ExternalLink className="h-3 w-3" />
            Open County Parcels
          </button>
        )}
      </div>
    </section>
  );
};

/**
 * LSAI Agent — Project Location.
 *
 * One card per detected point cluster, each with its own state, county,
 * municipality, footprint, and GIS actions. This is the single UI that answers
 * "where is this project?"; the same data is published over CACP
 * (`lsvz_project_locations`) and in the Project Knowledge Base so every agent
 * gives the same answer.
 */
export const LsaiProjectLocationPanel: React.FC<LsaiProjectLocationPanelProps> = ({
  clusterSet,
  isResolving = false,
  error = null,
  busy = null,
  onRefresh,
  onFocusCluster,
  onFetchParcels,
  onFetchFlood,
  onFetchSoils,
  countyStatus = null,
  onCountyRetry,
  onOpenCountyGis,
  inclusionArea = null,
  onFetchInclusion,
}) => {
  const pending = isResolving || clusterSet.clusters.some(cluster => !cluster.jurisdiction);
  const inclusionBusy = busy?.clusterId === 'inclusion-area' ? busy.action : null;

  return (
    <div className="space-y-2.5 p-3" data-testid="lsai-project-location-panel">
      <header className={`${CARD} px-3 py-2.5`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Project location
            </p>
            <p className="mt-0.5 text-[12px] text-slate-200">
              {clusterSet.clusters.length === 0
                ? 'No point clusters yet'
                : `${clusterSet.clusters.length === 1 ? '1 cluster' : `${clusterSet.clusters.length} clusters`} · ${countLabel(clusterSet.totalPoints, 'point')}`}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {clusterSet.epsg ? `EPSG:${clusterSet.epsg}` : 'No projection set'}
              {' · '}
              nearby shots merged into one location
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isResolving || clusterSet.clusters.length === 0}
              className={`${ACTION} border-white/[0.12] bg-white/[0.04] text-slate-200 hover:border-white/[0.25]`}
            >
              {isResolving ? 'Resolving…' : 'Refresh'}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          CACP: <code className="font-mono text-slate-400">lsvz_project_locations</code> · shared
          through the Project Knowledge Base for every agent.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10.5px] leading-snug text-rose-200">
          {error}
        </p>
      )}

      {countyStatus && (
        <CountyStatusCard
          status={countyStatus}
          onRetry={onCountyRetry}
          onOpenCountyGis={onOpenCountyGis}
        />
      )}

      {inclusionArea && (
        <section className={`${CARD} overflow-hidden`} data-testid="project-location-inclusion">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Inclusion area
              </p>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-100">
                {inclusionArea.name}
              </p>
            </div>
            <span className={`${CHIP} border-emerald-400/30 bg-emerald-400/10 text-emerald-200`}>
              Alternate AOI · {countLabel(inclusionArea.segmentCount, 'segment')}
            </span>
          </div>
          <p className="px-3 pt-2 text-[10px] leading-snug text-slate-400">
            Query the drawn inclusion boundary instead of a cluster footprint. Useful when the
            boundary is the intended project limit.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
            <button
              type="button"
              onClick={() => onFetchInclusion?.('parcels')}
              disabled={inclusionBusy != null}
              className={`${ACTION} border-emerald-400/35 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/60 hover:bg-emerald-400/20`}
            >
              <LandPlot className="h-3 w-3" />
              {inclusionBusy === 'parcels' ? 'Fetching county…' : 'County'}
            </button>
            <button
              type="button"
              onClick={() => onFetchInclusion?.('flood')}
              disabled={inclusionBusy != null}
              className={`${ACTION} border-cyan-400/35 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20`}
            >
              {inclusionBusy === 'flood' ? 'Fetching flood zones…' : 'Flood lines'}
            </button>
            <button
              type="button"
              onClick={() => onFetchInclusion?.('soils')}
              disabled={inclusionBusy != null}
              className={`${ACTION} border-stone-400/35 bg-stone-400/10 text-stone-200 hover:border-stone-300/60 hover:bg-stone-400/20`}
            >
              {inclusionBusy === 'soils' ? 'Fetching soils…' : 'Soils'}
            </button>
          </div>
        </section>
      )}

      {clusterSet.clusters.length === 0 && (
        <section className={`${CARD} px-3 py-4`}>
          <p className="text-[11.5px] leading-snug text-slate-300">
            Upload a point file (or collect points with GPS Rover) and this panel splits them into
            separate sites, then resolves each site's state, county, and municipality.
          </p>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
            Once points are loaded, ask for “county GIS tax lines”, “flood lines”, or “soils” and the
            matching layer is fetched for the site.
          </p>
        </section>
      )}

      {clusterSet.clusters.map(cluster => {
        const { estimate } = cluster;
        const jurisdiction = cluster.jurisdiction;
        const clusterPending = pending && !jurisdiction;
        const clusterBusy = busy?.clusterId === cluster.id ? busy.action : null;
        const disabled = !estimate.center;

        return (
          <section
            key={cluster.id}
            className={CARD}
            data-testid="project-location-cluster"
            data-cluster-id={cluster.id}
          >
            <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {cluster.label}
                </p>
                <p className="mt-0.5 text-[12px] font-semibold leading-snug text-slate-100">
                  {cluster.jurisdiction?.label ?? (clusterPending ? 'Resolving jurisdiction…' : 'Jurisdiction unavailable')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`${CHIP} ${confidenceClass(estimate.confidence)}`}>
                  {estimate.confidence}
                </span>
                <span className={`${CHIP} border-slate-500/30 bg-slate-500/10 text-slate-300`}>
                  {countLabel(cluster.pointCount, 'point')}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-px bg-white/[0.04]">
              {[
                ['State', jurisdictionValue(jurisdiction?.state, clusterPending)],
                ['County', jurisdictionValue(jurisdiction?.county, clusterPending)],
                ['Municipality', jurisdictionValue(jurisdiction?.place, clusterPending)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-[#070e18]/70 px-3 py-2">
                  <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate text-[10.5px] font-semibold text-slate-200" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <dl className="grid grid-cols-2 gap-px border-t border-white/[0.04] bg-white/[0.04] sm:grid-cols-4">
              {[
                ['Centre', estimate.centerWgs84
                  ? `${estimate.centerWgs84.latitude.toFixed(5)}, ${estimate.centerWgs84.longitude.toFixed(5)}`
                  : '—'],
                ['Extent', estimate.width > 0 || estimate.height > 0
                  ? `${estimate.width.toFixed(0)} × ${estimate.height.toFixed(0)} ft`
                  : '—'],
                ['Area', estimate.areaAcres > 0 ? `${estimate.areaAcres.toFixed(2)} ac` : '—'],
                ['Lines', String(estimate.lineCount)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-[#070e18]/70 px-3 py-1.5">
                  <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate font-mono text-[10px] text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>

            {estimate.warnings.length > 0 && (
              <ul className="space-y-1 border-t border-white/[0.06] px-3 py-1.5">
                {estimate.warnings.map(warning => (
                  <li key={warning} className="text-[9.5px] leading-snug text-amber-200/80">
                    • {warning}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
              <button
                type="button"
                onClick={() => onFocusCluster?.(cluster)}
                disabled={disabled}
                className={`${ACTION} border-blue-400/35 bg-blue-400/10 text-blue-200 hover:border-blue-300/60 hover:bg-blue-400/20`}
              >
                Centre on canvas
              </button>
              <button
                type="button"
                onClick={() => onFetchParcels?.(cluster)}
                disabled={disabled || clusterBusy != null}
                className={`${ACTION} border-emerald-400/35 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/60 hover:bg-emerald-400/20`}
              >
                <LandPlot className="h-3 w-3" />
                {clusterBusy === 'parcels' ? 'Fetching county…' : 'County'}
              </button>
              <button
                type="button"
                onClick={() => onFetchFlood?.(cluster)}
                disabled={disabled || clusterBusy != null}
                className={`${ACTION} border-cyan-400/35 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20`}
              >
                {clusterBusy === 'flood' ? 'Fetching flood zones…' : 'Flood lines'}
              </button>
              <button
                type="button"
                onClick={() => onFetchSoils?.(cluster)}
                disabled={disabled || clusterBusy != null}
                className={`${ACTION} border-stone-400/35 bg-stone-400/10 text-stone-200 hover:border-stone-300/60 hover:bg-stone-400/20`}
              >
                {clusterBusy === 'soils' ? 'Fetching soils…' : 'Soils'}
              </button>
              <span className="ml-auto text-[9px] text-slate-500" title={jurisdictionSourceLabel(cluster)}>
                {jurisdictionSourceLabel(cluster)}
              </span>
            </div>
          </section>
        );
      })}

      {clusterSet.warnings.length > 0 && clusterSet.clusters.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          {clusterSet.warnings.map(warning => (
            <li key={warning} className="text-[9.5px] leading-snug text-slate-400">
              • {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
