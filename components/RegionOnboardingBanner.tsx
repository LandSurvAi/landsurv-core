import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, type Settings } from '../types.ts';
import {
  detectBrowserRegion,
  getRegionConfig,
  regionPresetForNewProject,
  type RegionCrsOption,
} from '../utils/regions.ts';
import { ensureCrsRegistered } from '../utils/crs/registry.ts';
import { trackGrowthEvent } from '../utils/analytics.ts';

const DISMISS_KEY = 'landsurv_region_banner_dismissed_v1';

interface RegionOnboardingBannerProps {
  /** Opens the bundled UAE student sample with metric units and EPSG:3997. */
  onOpenUaeSample?: () => void;
}

/**
 * First-run offer for Gulf visitors. It is deliberately opt-in: this component
 * never mutates settings until the user clicks, and it only appears while the
 * project has no projection yet. Applying is reversible from the same card.
 */
const RegionOnboardingBanner: React.FC<RegionOnboardingBannerProps> = ({ onOpenUaeSample }) => {
  const { settings, setSettings } = useSettings();
  const detection = useMemo(() => detectBrowserRegion(), []);
  const config = getRegionConfig(detection.region);
  const preset = regionPresetForNewProject(detection.region, {
    currentProjectionEpsg: settings.projection?.epsg ?? null,
  });

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(DISMISS_KEY) === '1';
  });
  const [showCrs, setShowCrs] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ units: Settings['linearUnits']; epsg: number | null } | null>(null);
  const previousRef = useRef<{
    linearUnits: Settings['linearUnits'];
    projection: Settings['projection'];
  } | null>(null);
  const shownTracked = useRef(false);

  useEffect(() => {
    if (!preset || dismissed || shownTracked.current) return;
    shownTracked.current = true;
    trackGrowthEvent('region_preset_shown', {
      region: detection.region,
      source: detection.source,
    });
  }, [detection.region, detection.source, dismissed, preset]);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode: the banner is still dismissed for this session.
    }
    trackGrowthEvent('region_preset_dismissed', { region: detection.region });
  };

  const apply = async (option?: RegionCrsOption) => {
    if (!preset) return;
    setError(null);
    if (option) {
      setApplying(option.epsg);
      const resolved = await ensureCrsRegistered(option.epsg);
      if (!resolved?.proj4) {
        setApplying(null);
        setError(`EPSG:${option.epsg} could not be loaded. Try another local CRS.`);
        return;
      }
    }

    previousRef.current = {
      linearUnits: settings.linearUnits,
      projection: settings.projection,
    };
    setSettings(prev => ({
      ...prev,
      linearUnits: preset.linearUnits,
      ...(option
        ? {
          projection: {
            state: config.name,
            zoneName: option.name,
            epsg: option.epsg,
            epoch: null,
          },
        }
        : {}),
    }));
    setApplying(null);
    setApplied({ units: preset.linearUnits, epsg: option?.epsg ?? null });
    trackGrowthEvent('region_preset_applied', {
      region: detection.region,
      units: preset.linearUnits,
      epsg: option?.epsg ?? null,
    });
    if (option) {
      trackGrowthEvent('region_preset_crs_selected', {
        region: detection.region,
        epsg: option.epsg,
      });
    }
  };

  const undo = () => {
    if (previousRef.current) {
      setSettings(prev => ({
        ...prev,
        linearUnits: previousRef.current!.linearUnits,
        projection: previousRef.current!.projection,
      }));
    }
    setApplied(null);
    setShowCrs(false);
    trackGrowthEvent('region_preset_undone', { region: detection.region });
  };

  const openSample = () => {
    trackGrowthEvent('region_sample_opened', { region: detection.region });
    onOpenUaeSample?.();
  };

  const isUae = detection.region === 'AE';

  if (applied) {
    return (
      <div
        role="status"
        aria-label="Regional setup applied"
        className="relative z-30 mx-auto mb-3 w-full max-w-5xl rounded-xl border border-emerald-500/40 bg-slate-950/90 px-4 py-3 text-left shadow-xl shadow-emerald-950/20 backdrop-blur-md light-theme:border-emerald-300 light-theme:bg-emerald-50"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-300 light-theme:text-emerald-800">
              {applied.units === 'meter' ? 'Metres' : 'US survey feet'} applied
              {applied.epsg ? ` · EPSG:${applied.epsg}` : ' · no CRS change'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400 light-theme:text-gray-600">
              Only this project was changed. Existing work was not touched.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isUae && onOpenUaeSample && (
              <button
                type="button"
                onClick={openSample}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Open UAE sample project
              </button>
            )}
            {!applied.epsg && preset && (
              <button
                type="button"
                onClick={() => {
                  setApplied(null);
                  setShowCrs(true);
                }}
                className="rounded-md border border-emerald-500/50 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-600/30"
              >
                Choose local CRS
              </button>
            )}
            <button
              type="button"
              onClick={undo}
              className="rounded-md border border-slate-500/50 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-emerald-400/50 hover:text-emerald-200 light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-700"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200 light-theme:text-gray-500 light-theme:hover:text-gray-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!preset) return null;

  return (
    <div
      role="status"
      aria-label="Regional setup"
      className="relative z-30 mx-auto mb-3 w-full max-w-5xl rounded-xl border border-emerald-500/30 bg-slate-950/90 px-4 py-3 text-left shadow-xl shadow-emerald-950/20 backdrop-blur-md light-theme:border-emerald-300 light-theme:bg-emerald-50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-300 light-theme:text-emerald-800">
            {isUae ? 'Working in the UAE?' : 'Working in Saudi Arabia?'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 light-theme:text-gray-600">
            Start new projects in metres{isUae ? ' with prices in AED' : ''}. Existing projects are never changed.
            {isUae ? ' AED prices include 5% VAT.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={applying !== null}
            className="rounded-md border border-emerald-500/50 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-600/30 disabled:opacity-50 light-theme:border-emerald-400 light-theme:bg-emerald-100 light-theme:text-emerald-900"
          >
            Use metric units
          </button>
          <button
            type="button"
            onClick={() => setShowCrs(value => !value)}
            className="rounded-md border border-slate-500/50 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-emerald-400/50 hover:text-emerald-200 light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-700"
            aria-expanded={showCrs}
          >
            Choose local CRS
          </button>
          {isUae && onOpenUaeSample && (
            <button
              type="button"
              onClick={openSample}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Open UAE sample
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200 light-theme:text-gray-500 light-theme:hover:text-gray-800"
          >
            Not now
          </button>
        </div>
      </div>

      {showCrs && (
        <div className="mt-3 grid gap-2 border-t border-slate-700/60 pt-3 sm:grid-cols-3 light-theme:border-emerald-200">
          {preset.crsOptions.map(option => (
            <button
              key={option.epsg}
              type="button"
              onClick={() => void apply(option)}
              disabled={applying !== null}
              className="rounded-lg border border-slate-600/60 bg-slate-900/70 px-3 py-2 text-left transition-colors hover:border-emerald-400/60 hover:bg-slate-800/80 disabled:opacity-50 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:border-emerald-400"
            >
              <span className="block text-xs font-semibold text-gray-200 light-theme:text-gray-800">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[10px] text-gray-500 light-theme:text-gray-500">
                {applying === option.epsg ? 'Loading CRS…' : option.name}
              </span>
            </button>
          ))}
          <p className="sm:col-span-3 text-[10px] leading-relaxed text-gray-500 light-theme:text-gray-500">
            Dubai submissions use Dubai Local TM (EPSG:3997). Abu Dhabi and most UAE
            datasets use WGS 84 / UTM 40N. Confirm the grid required by your authority
            before submission.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
};

export default RegionOnboardingBanner;
