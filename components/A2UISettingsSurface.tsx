import React, { useContext, useEffect, useState } from 'react';
import {
  SettingsContext,
  type A2UISettingsSection,
  type A2UISettingsSummary,
  type A2UISurfaceSize,
  type NtripSettings,
  type PointLabelingSettings,
  type ProjectionSetting,
  type Settings,
} from '../types.ts';
import { DEFAULT_SETTINGS } from '../utils/sessionDefaults.ts';
import { LINEAR_UNIT_OPTIONS, type LinearUnit } from '../utils/linearUnits.ts';
import { projectionStates, projectionZones } from '../utils/projections.ts';
import { detectProjectionFromBrowser } from '../utils/autoProjection.ts';
import GlobalCrsPicker from './GlobalCrsPicker.tsx';
import {
  WebGpuBasemap,
  getGpuPowerPreference,
  isWebGpuEnabled,
  probeWebGpuAdapter,
  WEBGPU_ENABLED_KEY,
  WEBGPU_POWER_KEY,
  WEBGPU_PREF_EVENT,
  type GpuPowerPreference,
  type WebGpuProbeResult,
} from '../utils/webgpuBasemap.ts';

interface A2UISettingsSurfaceProps {
  initialSection?: A2UISettingsSection;
  settingsSummary?: A2UISettingsSummary;
  onOpenFullscreen?: () => void;
  activeModel?: string;
  availableModels?: string[];
  onModelChange?: (model: string) => void;
  autoHighThinkingModel?: string;
  autoHighThinkingOptions?: string[];
  onAutoHighThinkingModelChange?: (model: string) => void;
  /** Apply the CRS recommended by the georeferenced point clusters. */
  onApplyClusterProjection?: () => Promise<{ projection: ProjectionSetting; label: string } | null>;
  /** WGS84 [west, south, east, north] of the project boundary, for CRS suggestions. */
  projectBboxWgs84?: [number, number, number, number] | null;
  /** Latest GPS fix, for CRS suggestions. */
  gpsPosition?: { latitude: number; longitude: number } | null;
  /** Record the fix used to detect the CRS so project location can reuse it. */
  onGpsFixDetected?: (fix: { latitude: number; longitude: number }) => void;
}

const SECTION_META: Record<
  A2UISettingsSection,
  { label: string; title: string; subtitle: string }
> = {
  all: {
    label: 'Overview',
    title: 'Project Settings',
    subtitle: 'Projection, units, precision, model, graphics, and CAD standards. Pick any section below or open fullscreen.',
  },
  graphics: {
    label: 'Graphics & GPU',
    title: 'Graphics & WebGPU Acceleration',
    subtitle: 'Toggle WebGPU hardware acceleration and select discrete or integrated GPU power preference.',
  },
  display: {
    label: 'Canvas & Display',
    title: 'Canvas & Display Settings',
    subtitle: 'Linear units, coordinate precision, point symbols, attribute scaling, and north arrow.',
  },
  crs: {
    label: 'Coordinate System',
    title: 'Coordinate System & State Plane',
    subtitle: 'Bind a State Plane zone or EPSG code for GPS and GIS reprojection.',
  },
  imagery: {
    label: 'Map Imagery',
    title: 'Map Imagery Overlay',
    subtitle: 'Enable NAIP or Google Static Maps imagery overlay, map type, resolution, and opacity.',
  },
  'command-bar': {
    label: 'Command Bar',
    title: 'Command Bar Preferences',
    subtitle: 'Adjust docked command bar text scale, shortcut hints, and SNAP/ORTHO badges.',
  },
  'point-labeling': {
    label: 'Point Labeling',
    title: 'Point Labeling & Numbering',
    subtitle: 'Configure numeric or alphabetic numbering, point prefix, and next point number.',
  },
  'ai-model': {
    label: 'AI Model',
    title: 'AI Behavior & Model Selection',
    subtitle: 'Switch the active model, high-thinking route, and PDF uncertainty sensitivity.',
  },
  'geo-ai': {
    label: 'Geo-AI Engine',
    title: 'Geospatial AI Engine (SamGeo & SAM-Road)',
    subtitle: 'Choose between Local Workstation GPU worker and Cloud Run scale-to-zero inference.',
  },
  ntrip: {
    label: 'NTRIP RTK',
    title: 'NTRIP Caster Settings',
    subtitle: 'Configure RTK GNSS corrections host, port, mountpoint, and credentials.',
  },
  cutsheet: {
    label: 'Cut Sheet',
    title: 'Cut Sheet Defaults',
    subtitle: 'Default company name and crew chief for stakeout cut sheets.',
  },
  notion: {
    label: 'Notion',
    title: 'Notion Integration',
    subtitle: 'Connect a Notion integration token to export fieldbook notes and points.',
  },
  a2ui: {
    label: 'Surfaces',
    title: 'Agent Surfaces',
    subtitle: 'Configure CACP traffic auto-review and default surface window size.',
  },
};

const SECTION_ORDER: readonly A2UISettingsSection[] = [
  'all',
  'graphics',
  'display',
  'crs',
  'imagery',
  'command-bar',
  'point-labeling',
  'ai-model',
  'geo-ai',
  'ntrip',
  'cutsheet',
  'notion',
  'a2ui',
];

const inputClass =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2.5 py-1.5 text-[11px] text-slate-100 outline-none transition-colors focus:border-sky-400/60';

export const A2UISettingsSurface: React.FC<A2UISettingsSurfaceProps> = ({
  initialSection = 'all',
  settingsSummary,
  onOpenFullscreen,
  activeModel,
  availableModels = ['auto', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-4-argon', 'claude-sonnet-5', 'claude-opus-5'],
  onModelChange,
  autoHighThinkingModel,
  autoHighThinkingOptions = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-4-argon', 'claude-sonnet-5', 'claude-opus-5'],
  onAutoHighThinkingModelChange,
  onApplyClusterProjection,
  projectBboxWgs84,
  gpsPosition,
  onGpsFixDetected,
}) => {
  const settingsCtx = useContext(SettingsContext);
  const [fallbackSettings, setFallbackSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const settings = settingsCtx?.settings ?? fallbackSettings;
  const setSettings = settingsCtx?.setSettings ?? setFallbackSettings;

  const [section, setSection] = useState<A2UISettingsSection>(initialSection);
  const [webgpuEnabled, setWebgpuEnabled] = useState<boolean>(() => isWebGpuEnabled());
  const [gpuPower, setGpuPower] = useState<GpuPowerPreference>(() => getGpuPowerPreference());
  const webgpuSupported = typeof WebGpuBasemap?.isSupported === 'function' ? WebGpuBasemap.isSupported() : false;
  const [gpuProbe, setGpuProbe] = useState<WebGpuProbeResult | null>(null);
  const gpuReady = webgpuEnabled && gpuProbe?.adapterAvailable === true;
  const gpuProbeFailed = webgpuEnabled && gpuProbe !== null && !gpuProbe.adapterAvailable;

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!webgpuEnabled || !webgpuSupported) {
      setGpuProbe(null);
      return;
    }
    let cancelled = false;
    setGpuProbe(null);
    probeWebGpuAdapter().then(result => {
      if (!cancelled) setGpuProbe(result);
    });
    return () => { cancelled = true; };
  }, [webgpuEnabled, webgpuSupported, gpuPower]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const [isDetectingProjection, setIsDetectingProjection] = useState(false);
  const [isApplyingClusterProjection, setIsApplyingClusterProjection] = useState(false);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [projectionStatus, setProjectionStatus] = useState<string | null>(null);

  const handleDetectProjectionFromGps = async () => {
    setIsDetectingProjection(true);
    setProjectionError(null);
    setProjectionStatus(null);
    try {
      const detected = await detectProjectionFromBrowser();
      updateSetting('projection', detected.projection);
      onGpsFixDetected?.({ latitude: detected.latitude, longitude: detected.longitude });
      setProjectionStatus(
        `Applied ${detected.projection.zoneName ?? 'the local CRS'} (EPSG:${detected.projection.epsg ?? '—'}) from your GPS location.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProjectionError(
        /denied|permission/i.test(message)
          ? 'Location permission denied. Allow location access or search the EPSG registry below.'
          : `Could not detect a projection: ${message}`,
      );
    } finally {
      setIsDetectingProjection(false);
    }
  };

  const handleApplyClusterProjection = async () => {
    if (!onApplyClusterProjection) return;
    setIsApplyingClusterProjection(true);
    setProjectionError(null);
    setProjectionStatus(null);
    try {
      const applied = await onApplyClusterProjection();
      if (!applied) {
        setProjectionError('No georeferenced point cluster is available yet.');
        return;
      }
      updateSetting('projection', applied.projection);
      setProjectionStatus(`Applied ${applied.label} from the point cluster.`);
    } catch (error) {
      setProjectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingClusterProjection(false);
    }
  };

  const handleWebgpuEnabledChange = (enabled: boolean) => {
    setWebgpuEnabled(enabled);
    try {
      if (enabled) localStorage.removeItem(WEBGPU_ENABLED_KEY);
      else localStorage.setItem(WEBGPU_ENABLED_KEY, 'off');
    } catch {
      /* ignore storage errors */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(WEBGPU_PREF_EVENT));
    }
  };

  const handleGpuPowerChange = (preference: GpuPowerPreference) => {
    setGpuPower(preference);
    try {
      localStorage.setItem(WEBGPU_POWER_KEY, preference);
    } catch {
      /* ignore storage errors */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(WEBGPU_PREF_EVENT));
    }
  };

  const updatePointLabeling = <K extends keyof PointLabelingSettings>(
    key: K,
    value: PointLabelingSettings[K],
  ) => {
    setSettings(prev => ({
      ...prev,
      pointLabelingSettings: {
        ...prev.pointLabelingSettings,
        [key]: value,
      },
    }));
  };

  const updateNtrip = <K extends keyof NtripSettings>(key: K, value: NtripSettings[K]) => {
    setSettings(prev => ({
      ...prev,
      ntrip: {
        ...prev.ntrip,
        [key]: value,
      },
    }));
  };

  const updateGoogleMaps = (patch: Partial<NonNullable<Settings['googleMaps']>>) => {
    setSettings(prev => ({
      ...prev,
      googleMaps: {
        enabled: false,
        apiKey: '',
        mapType: 'naip',
        opacity: 1.0,
        scale: 2,
        showLabels: true,
        ...(prev.googleMaps ?? {}),
        ...patch,
      },
    }));
  };

  const updateCommandBar = (patch: Partial<NonNullable<Settings['commandBar']>>) => {
    setSettings(prev => ({
      ...prev,
      commandBar: {
        textScale: 1.15,
        showShortcutHints: true,
        showStatusBadges: true,
        ...(prev.commandBar ?? {}),
        ...patch,
      },
    }));
  };

  const availableZones = settings.projection?.state
    ? projectionZones[projectionStates.find(s => s.name === settings.projection.state)?.code || ''] || []
    : [];

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: 'Model', value: settingsSummary?.model ?? activeModel ?? 'Current agent model' },
    { label: 'Units', value: settingsSummary?.units ?? String(settings.linearUnits ?? 'usSurveyFoot') },
    {
      label: 'Precision',
      value:
        settingsSummary?.precision != null
          ? `${settingsSummary.precision} decimal places`
          : `${settings.coordinatePrecision ?? 2} decimal places`,
    },
    { label: 'Theme', value: settingsSummary?.theme ?? settings.theme ?? 'dark' },
  ];

  const meta = SECTION_META[section] ?? SECTION_META.all;

  return (
    <div className="overflow-hidden rounded-xl border border-sky-400/25 bg-sky-400/[0.04]">
      <div className="flex items-start justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-100">{meta.title}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{meta.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onOpenFullscreen}
          disabled={!onOpenFullscreen}
          data-testid="a2ui-settings-fullscreen"
          className="shrink-0 rounded-md border border-sky-400/35 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold text-sky-200 transition-colors hover:border-sky-300/60 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Open fullscreen
        </button>
      </div>

      {/* Section selector pills */}
      <div className="flex flex-wrap gap-1 border-t border-white/[0.07] bg-black/20 px-3.5 py-2">
        {SECTION_ORDER.map(sec => {
          const active = section === sec;
          return (
            <button
              key={sec}
              type="button"
              aria-pressed={active}
              data-testid={`a2ui-settings-tab-${sec}`}
              onClick={() => setSection(sec)}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                active
                  ? 'border-sky-400/50 bg-sky-400/20 text-sky-100'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
              }`}
            >
              {SECTION_META[sec].label}
            </button>
          );
        })}
      </div>

      {/* Section body */}
      {section === 'all' && (
        <>
          <dl className="grid grid-cols-2 gap-px border-t border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
            {summaryRows.map(row => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{row.label}</dt>
                <dd className="mt-0.5 truncate font-mono text-[10px] text-slate-300">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-3 sm:grid-cols-3">
            {(
              [
                ['graphics', 'Graphics & WebGPU'],
                ['display', 'Units & Display'],
                ['crs', 'Projection / CRS'],
                ['imagery', 'Map Imagery'],
                ['point-labeling', 'Point Defaults'],
                ['ai-model', 'AI Model & Keys'],
              ] as const
            ).map(([sec, label]) => (
              <button
                key={sec}
                type="button"
                onClick={() => setSection(sec)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left text-[10px] font-semibold text-slate-200 transition-colors hover:border-sky-400/40 hover:bg-sky-400/10"
              >
                {label} →
              </button>
            ))}
          </div>
        </>
      )}

      {section === 'graphics' && (
        <div data-testid="a2ui-settings-section-graphics" className="space-y-3 border-t border-white/[0.07] p-3.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={webgpuEnabled}
              onChange={e => handleWebgpuEnabledChange(e.target.checked)}
              aria-label="Enable WebGPU Hardware Acceleration"
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-slate-100">
                Enable WebGPU Hardware Acceleration
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">
                Renders basemap imagery, anti-aliased linework, and compressed point clouds on the GPU. Turn off to force the Canvas2D fallback.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="a2ui-webgpu-power" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              GPU Power Preference
            </label>
            <select
              id="a2ui-webgpu-power"
              value={gpuPower}
              onChange={e => handleGpuPowerChange(e.target.value as GpuPowerPreference)}
              className={inputClass}
            >
              <option value="high-performance">High Performance (Discrete GPU)</option>
              <option value="low-power">Low Power (Integrated GPU / Battery Saver)</option>
              <option value="default">Default (System Decision)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[10px] text-slate-400">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                !webgpuSupported || gpuProbeFailed ? 'bg-rose-500' : gpuReady ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              {!webgpuSupported
                ? 'Browser WebGPU unavailable — using Canvas2D fallback.'
                : !webgpuEnabled
                  ? 'WebGPU paused — using Canvas2D fallback.'
                  : !gpuProbe
                    ? 'Checking for a compatible GPU adapter…'
                    : !gpuProbe.adapterAvailable
                      ? `WebGPU enabled but the adapter did not initialize${gpuProbe.error ? ` (${gpuProbe.error})` : ''}. Using Canvas2D.`
                      : `WebGPU adapter ready${gpuProbe.adapterLabel ? ` — ${gpuProbe.adapterLabel}` : ''}.`}
            </span>
          </div>
        </div>
      )}

      {section === 'display' && (
        <div data-testid="a2ui-settings-section-display" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="a2ui-linear-units" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Linear Units
            </label>
            <select
              id="a2ui-linear-units"
              value={settings.linearUnits || 'usSurveyFoot'}
              onChange={e => updateSetting('linearUnits', e.target.value as LinearUnit)}
              className={inputClass}
            >
              {LINEAR_UNIT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.abbreviation})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="a2ui-coord-precision" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Coordinate Precision (Decimals)
            </label>
            <input
              id="a2ui-coord-precision"
              type="number"
              min={0}
              max={6}
              value={settings.coordinatePrecision ?? 2}
              onChange={e => updateSetting('coordinatePrecision', Math.max(0, Math.min(6, Number(e.target.value) || 0)))}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="a2ui-attr-scaling" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Point Attribute Scaling
            </label>
            <select
              id="a2ui-attr-scaling"
              value={settings.pointAttributeScaling || 'screen'}
              onChange={e => updateSetting('pointAttributeScaling', e.target.value as 'screen' | 'world')}
              className={inputClass}
            >
              <option value="screen">Locked Screen Size (Fast)</option>
              <option value="world">Scale with Zoom (World)</option>
            </select>
          </div>

          <div>
            <label htmlFor="a2ui-north-arrow" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              North Arrow Style
            </label>
            <select
              id="a2ui-north-arrow"
              value={settings.northArrowStyle || 'classic'}
              onChange={e => updateSetting('northArrowStyle', e.target.value as 'classic' | 'modern' | 'elegant')}
              className={inputClass}
            >
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="elegant">Elegant</option>
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.showPointSymbols === true}
              onChange={e => updateSetting('showPointSymbols', e.target.checked)}
              aria-label="Enable Point Symbols"
              className="h-4 w-4 accent-cyan-400"
            />
            <span className="text-[11px] font-medium text-slate-200">
              Enable Point Symbols on Canvas (custom, CAD Manager, and built-in symbols)
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.pointEfficiencyMode === true}
              onChange={e => updateSetting('pointEfficiencyMode', e.target.checked)}
              aria-label="Point Efficiency Mode"
              className="h-4 w-4 accent-cyan-400"
            />
            <span className="text-[11px] font-medium text-slate-200">
              Point Efficiency Mode — on by default; compress crowded points into dots and skip labels until zoomed in
            </span>
          </label>
        </div>
      )}

      {section === 'crs' && (
        <div data-testid="a2ui-settings-section-crs" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <div className="flex flex-wrap items-start justify-between gap-2 sm:col-span-2">
            <p className="max-w-[52ch] text-[10.5px] leading-relaxed text-slate-400">
              Bind a State Plane zone, search the worldwide EPSG registry, or derive the CRS from the point clusters or your GPS fix.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {onApplyClusterProjection && (
                <button
                  type="button"
                  onClick={() => void handleApplyClusterProjection()}
                  disabled={isApplyingClusterProjection}
                  className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isApplyingClusterProjection ? 'Resolving…' : 'Use point cluster'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDetectProjectionFromGps()}
                disabled={isDetectingProjection}
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDetectingProjection ? 'Locating…' : 'Use my GPS location'}
              </button>
            </div>
          </div>
          {(projectionError || projectionStatus) && (
            <p
              role={projectionError ? 'alert' : 'status'}
              className={`text-[10.5px] sm:col-span-2 ${projectionError ? 'text-rose-300' : 'text-emerald-300'}`}
            >
              {projectionError ?? projectionStatus}
            </p>
          )}
          <div>
            <label htmlFor="a2ui-crs-state" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              State
            </label>
            <select
              id="a2ui-crs-state"
              value={settings.projection?.state || ''}
              onChange={e => {
                const selectedStateName = e.target.value;
                const selectedState = projectionStates.find(s => s.name === selectedStateName);
                updateSetting('projection', {
                  state: selectedState ? selectedState.name : null,
                  zoneName: null,
                  epsg: null,
                });
              }}
              className={inputClass}
            >
              <option value="">Select State…</option>
              {projectionStates.map(s => (
                <option key={s.code} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="a2ui-crs-zone" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              State Plane Zone
            </label>
            <select
              id="a2ui-crs-zone"
              value={settings.projection?.epsg || ''}
              disabled={!settings.projection?.state}
              onChange={e => {
                const selectedEpsg = parseInt(e.target.value, 10);
                const selectedZone = availableZones.find(z => z.epsg === selectedEpsg);
                updateSetting('projection', {
                  ...settings.projection,
                  zoneName: selectedZone ? selectedZone.name : null,
                  epsg: selectedZone ? selectedZone.epsg : null,
                });
              }}
              className={`${inputClass} disabled:opacity-50`}
            >
              <option value="">Select Zone…</option>
              {availableZones.map(z => (
                <option key={z.epsg} value={z.epsg}>
                  {z.name} (EPSG:{z.epsg})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[10px] text-slate-400 sm:col-span-2">
            Active CRS:{' '}
            <strong className="font-mono text-sky-200">
              {settings.projection?.epsg
                ? `${settings.projection.zoneName || 'Custom'} (EPSG:${settings.projection.epsg})`
                : 'None selected'}
            </strong>
          </div>

          <div className="border-t border-white/[0.07] pt-3 sm:col-span-2">
            <GlobalCrsPicker
              currentEpsg={settings.projection?.epsg}
              bbox={projectBboxWgs84 ?? null}
              gpsPosition={gpsPosition ?? null}
              onSelect={projection => {
                updateSetting('projection', projection);
                setProjectionError(null);
                setProjectionStatus(
                  `Applied ${projection.zoneName ?? 'custom CRS'} (EPSG:${projection.epsg ?? '—'}).`,
                );
              }}
            />
          </div>
        </div>
      )}

      {section === 'imagery' && (
        <div data-testid="a2ui-settings-section-imagery" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.googleMaps?.enabled ?? false}
              onChange={e => updateGoogleMaps({ enabled: e.target.checked })}
              aria-label="Enable map imagery overlay on canvas"
              className="h-4 w-4 accent-emerald-400"
            />
            <span className="text-[11px] font-semibold text-slate-100">
              Enable map imagery overlay on canvas
            </span>
          </label>

          <div>
            <label htmlFor="a2ui-imagery-type" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Map Type
            </label>
            <select
              id="a2ui-imagery-type"
              value={settings.googleMaps?.mapType ?? 'naip'}
              onChange={e => updateGoogleMaps({ mapType: e.target.value as any })}
              className={inputClass}
            >
              <option value="naip">NAIP (USDA Aerial) — default</option>
              <option value="satellite">Satellite (Google)</option>
              <option value="hybrid">Hybrid (Satellite + Labels)</option>
              <option value="roadmap">Roadmap</option>
              <option value="terrain">Terrain</option>
            </select>
          </div>

          <div>
            <label htmlFor="a2ui-imagery-opacity" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Opacity: {Math.round((settings.googleMaps?.opacity ?? 1.0) * 100)}%
            </label>
            <input
              id="a2ui-imagery-opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.googleMaps?.opacity ?? 1.0}
              onChange={e => updateGoogleMaps({ opacity: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      )}

      {section === 'command-bar' && (
        <div data-testid="a2ui-settings-section-command-bar" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="a2ui-cmd-scale" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Command Bar Text Scale
            </label>
            <select
              id="a2ui-cmd-scale"
              value={settings.commandBar?.textScale ?? 1.15}
              onChange={e => updateCommandBar({ textScale: Number(e.target.value) })}
              className={inputClass}
            >
              <option value={0.9}>Compact (90%)</option>
              <option value={1}>Standard (100%)</option>
              <option value={1.15}>Comfortable (115%)</option>
              <option value={1.3}>Large (130%)</option>
              <option value={1.45}>Extra large (145%)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={settings.commandBar?.showShortcutHints ?? true}
                onChange={e => updateCommandBar({ showShortcutHints: e.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
              <span className="text-[11px] text-slate-200">Show Shortcut Hints (Space / Shift+Space)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={settings.commandBar?.showStatusBadges ?? true}
                onChange={e => updateCommandBar({ showStatusBadges: e.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
              <span className="text-[11px] text-slate-200">Show SNAP / ORTHO Status Badges</span>
            </label>
          </div>
        </div>
      )}

      {section === 'point-labeling' && (
        <div data-testid="a2ui-settings-section-point-labeling" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-3">
          <div>
            <label htmlFor="a2ui-pt-style" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Numbering Style
            </label>
            <select
              id="a2ui-pt-style"
              value={settings.pointLabelingSettings?.style ?? 'numeric'}
              onChange={e => updatePointLabeling('style', e.target.value as 'numeric' | 'alphabetic')}
              className={inputClass}
            >
              <option value="numeric">Numeric (1, 2, 3…)</option>
              <option value="alphabetic">Alphabetic (A, B, C…)</option>
            </select>
          </div>
          <div>
            <label htmlFor="a2ui-pt-prefix" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Prefix
            </label>
            <input
              id="a2ui-pt-prefix"
              type="text"
              value={settings.pointLabelingSettings?.prefix ?? ''}
              onChange={e => updatePointLabeling('prefix', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="a2ui-pt-next" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Next Number
            </label>
            <input
              id="a2ui-pt-next"
              type="number"
              min={1}
              value={settings.pointLabelingSettings?.nextNumber ?? 1}
              onChange={e => updatePointLabeling('nextNumber', parseInt(e.target.value, 10) || 1)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {section === 'ai-model' && (
        <div data-testid="a2ui-settings-section-ai-model" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          {onModelChange && (
            <div>
              <label htmlFor="a2ui-ai-model" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                Active AI Model
              </label>
              <select
                id="a2ui-ai-model"
                value={activeModel || 'auto'}
                onChange={e => onModelChange(e.target.value)}
                className={inputClass}
              >
                {availableModels.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onAutoHighThinkingModelChange && (
            <div>
              <label htmlFor="a2ui-high-thinking" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                Auto High-Thinking Model
              </label>
              <select
                id="a2ui-high-thinking"
                value={autoHighThinkingModel || 'gemini-3.7-flash'}
                onChange={e => onAutoHighThinkingModelChange(e.target.value)}
                className={inputClass}
              >
                {autoHighThinkingOptions.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="a2ui-uncertainty" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              PDF Uncertainty Sensitivity
            </label>
            <select
              id="a2ui-uncertainty"
              value={settings.uncertaintySensitivity || 'medium'}
              onChange={e => updateSetting('uncertaintySensitivity', e.target.value as any)}
              className={inputClass}
            >
              <option value="low">Low (Fewer flags)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="high">High (More flags)</option>
              <option value="strict">Strict (Flag any ambiguity)</option>
            </select>
          </div>
        </div>
      )}

      {section === 'geo-ai' && (
        <div data-testid="a2ui-settings-section-geo-ai" className="space-y-3 border-t border-white/[0.07] p-3.5">
          <div className="grid grid-cols-2 gap-2">
            {(['local', 'cloud'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => updateSetting('geoAiMode', mode)}
                className={`rounded-lg border px-3 py-2 text-left text-[10.5px] font-semibold transition-colors ${
                  (settings.geoAiMode ?? 'local') === mode
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'local' ? 'Local Workstation Worker ($0)' : 'Cloud Run (Scale-to-Zero)'}
              </button>
            ))}
          </div>
          {(settings.geoAiMode ?? 'local') === 'local' && (
            <div>
              <label htmlFor="a2ui-geoai-endpoint" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                Local Daemon Endpoint URL
              </label>
              <input
                id="a2ui-geoai-endpoint"
                type="text"
                value={settings.localGeoAiEndpoint ?? 'http://127.0.0.1:8765'}
                onChange={e => updateSetting('localGeoAiEndpoint', e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          )}
        </div>
      )}

      {section === 'ntrip' && (
        <div data-testid="a2ui-settings-section-ntrip" className="grid grid-cols-1 gap-2.5 border-t border-white/[0.07] p-3.5 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center gap-2 sm:col-span-3">
            <input
              type="checkbox"
              checked={settings.ntrip?.enabled ?? false}
              onChange={e => updateNtrip('enabled', e.target.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            <span className="text-[11px] font-semibold text-slate-100">Enable NTRIP RTK Corrections</span>
          </label>
          <div>
            <label htmlFor="a2ui-ntrip-host" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Host
            </label>
            <input
              id="a2ui-ntrip-host"
              type="text"
              value={settings.ntrip?.host ?? ''}
              onChange={e => updateNtrip('host', e.target.value)}
              placeholder="caster.example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="a2ui-ntrip-port" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Port
            </label>
            <input
              id="a2ui-ntrip-port"
              type="number"
              value={settings.ntrip?.port ?? 2101}
              onChange={e => updateNtrip('port', parseInt(e.target.value, 10) || 2101)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="a2ui-ntrip-mount" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Mountpoint
            </label>
            <input
              id="a2ui-ntrip-mount"
              type="text"
              value={settings.ntrip?.mountpoint ?? ''}
              onChange={e => updateNtrip('mountpoint', e.target.value)}
              placeholder="RTCM3_NEAR"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {section === 'cutsheet' && (
        <div data-testid="a2ui-settings-section-cutsheet" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="a2ui-cs-company" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Company Name
            </label>
            <input
              id="a2ui-cs-company"
              type="text"
              value={settings.defaultCutSheetInfo?.companyName ?? ''}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  defaultCutSheetInfo: { ...prev.defaultCutSheetInfo, companyName: e.target.value },
                }))
              }
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="a2ui-cs-crew" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Crew Chief
            </label>
            <input
              id="a2ui-cs-crew"
              type="text"
              value={settings.defaultCutSheetInfo?.crewChief ?? ''}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  defaultCutSheetInfo: { ...prev.defaultCutSheetInfo, crewChief: e.target.value },
                }))
              }
              className={inputClass}
            />
          </div>
        </div>
      )}

      {section === 'notion' && (
        <div data-testid="a2ui-settings-section-notion" className="space-y-2.5 border-t border-white/[0.07] p-3.5">
          <div>
            <label htmlFor="a2ui-notion-token" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Notion Integration Token
            </label>
            <input
              id="a2ui-notion-token"
              type="password"
              value={settings.notion?.accessToken ?? ''}
              placeholder="secret_…"
              onChange={e => {
                const token = e.target.value;
                setSettings(prev => ({
                  ...prev,
                  notion: {
                    enabled: Boolean(token.trim()),
                    accessToken: token || undefined,
                    workspaceName: prev.notion?.workspaceName || 'My Workspace',
                  },
                }));
              }}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {section === 'a2ui' && (
        <div data-testid="a2ui-settings-section-a2ui" className="grid grid-cols-1 gap-3 border-t border-white/[0.07] p-3.5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={settings.a2ui?.autoOpenCacpReview === true}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  a2ui: { ...prev.a2ui, autoOpenCacpReview: e.target.checked },
                }))
              }
              className="h-4 w-4 accent-emerald-400"
            />
            <span className="text-[11px] font-medium text-slate-200">Auto-open CACP traffic review</span>
          </label>
          <div>
            <label htmlFor="a2ui-default-size" className="mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Default Surface Size
            </label>
            <select
              id="a2ui-default-size"
              value={settings.a2ui?.defaultSize ?? 'standard'}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  a2ui: { ...prev.a2ui, defaultSize: e.target.value as A2UISurfaceSize },
                }))
              }
              className={inputClass}
            >
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="wide">Wide</option>
              <option value="fullscreen">Fullscreen</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default A2UISettingsSurface;
