import React, { useState, useMemo } from 'react';
import { PARCEL_GIS_SERVICES, PARCEL_LAYER_TAG, type ParcelFeatureSummary } from '../services/parcelGisService.ts';
import { type AnnotationCategoryStyle, type ParcelCadTextStyle, type ParcelLabelFormatter, DEFAULT_PARCEL_LABEL_FORMATTER } from '../types.ts';
import { applyAnnotationTextCase } from '../utils/annotationTextStyle.ts';
import { buildParcelLabelLines, resolveEffectiveParcelTextStyle } from '../utils/parcelLabelFormatter.ts';

export interface ParcelPanelProps {
  /** Number of inclusion-line segments currently drawn — used to enable/disable "Use inclusion area". */
  inclusionSegmentCount: number;
  /** Count of parcel line segments currently rendered (lines whose layer === PARCEL_LAYER_TAG). */
  parcelLineCount: number;
  /** Most recent fetch summary (parcels with id/owner). */
  lastFetchedParcels: ParcelFeatureSummary[];
  /** True while a fetch is in flight. */
  isFetching: boolean;
  /** Trigger a fetch — App.tsx builds the bbox (inclusion or description) and calls the service. */
  onFetchParcels: (
    serviceUrl: string,
    mode: 'inclusion' | 'description',
    descriptionText?: string,
  ) => void;
  /** Remove every line in the project tagged with PARCEL_LAYER_TAG. */
  onClearParcels: () => void;
  /** Current parcel label formatter settings. */
  parcelLabelFormatter: ParcelLabelFormatter;
  /** CAD Manager text style catalog. */
  cadTextStyles: ParcelCadTextStyle[];
  /** Property-owner annotation category (project-wide styling source of truth). */
  propertyOwnerCategory?: AnnotationCategoryStyle | null;
  /** Update parcel label formatter settings. */
  onParcelLabelFormatterChange: (formatter: ParcelLabelFormatter) => void;
}

/**
 * Boundary-Agent side panel for fetching public county parcel (tax-boundary)
 * layers from ArcGIS REST services.  Mirrors the contour-fetch UX:
 *   - pick a county/service from the registry
 *   - choose Inclusion mode (use lines already drawn with the canvas
 *     Inclusion tool) or Describe mode (free-text geocoded via Nominatim)
 *   - hit Fetch — results draw on the canvas as 'parcel' lines
 *
 * Starts with Montgomery County, PA; the PARCEL_GIS_SERVICES registry in
 * services/parcelGisService.ts is the single place to add more counties.
 */
export const ParcelPanel: React.FC<ParcelPanelProps> = ({
  inclusionSegmentCount,
  parcelLineCount,
  lastFetchedParcels,
  isFetching,
  onFetchParcels,
  onClearParcels,
  parcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
  cadTextStyles = [],
  propertyOwnerCategory,
  onParcelLabelFormatterChange,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(PARCEL_GIS_SERVICES[0]?.id ?? '');
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [descriptionText, setDescriptionText] = useState<string>('');

  const selectedService = useMemo(
    () => PARCEL_GIS_SERVICES.find(s => s.id === selectedServiceId) ?? PARCEL_GIS_SERVICES[0],
    [selectedServiceId],
  );

  const hasInclusion = inclusionSegmentCount > 0;
  const stylePresetOptions: Array<{ value: NonNullable<ParcelLabelFormatter['stylePreset']>; label: string }> = [
    { value: 'narrow-cad', label: 'Narrow CAD (default)' },
    { value: 'classic-cad', label: 'Classic CAD' },
    { value: 'plan-readable', label: 'Plan Readable' },
    { value: 'field-compact', label: 'Field Compact' },
  ];
  const parcelFontOptions = ['Arial Narrow', 'Arial', 'Calibri', 'Romans', 'Simplex'];
  const propertyOwnerStyleManagedByCategory = propertyOwnerCategory?.styleSource === 'cad-manager' && !!propertyOwnerCategory.cadTextStyleName;
  const typographyLockedByCad = propertyOwnerStyleManagedByCategory || (parcelLabelFormatter.styleSource ?? 'local') === 'cad-manager';
  const effectiveParcelTextStyle = resolveEffectiveParcelTextStyle(parcelLabelFormatter, cadTextStyles, propertyOwnerCategory);
  const canFetch =
    !!selectedService &&
    !isFetching &&
    (mode === 'inclusion' ? hasInclusion : descriptionText.trim().length > 0);

  const handleFetch = () => {
    if (!selectedService || !canFetch) return;
    onFetchParcels(selectedService.url, mode, mode === 'description' ? descriptionText.trim() : undefined);
  };

  return (
    <div className="p-3 space-y-3 text-sm text-gray-200 overflow-y-auto h-full">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-orange-300">🏛️ County Parcels (Tax Boundaries)</h3>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Boundary Agent</span>
        </div>
        <p className="text-xs text-gray-400 leading-snug">
          Pull public county GIS tax-parcel polygons directly into the project.
          Use Inclusion mode to limit the query to an area you drew, or describe
          an area (address, neighborhood, township).
        </p>
      </div>

      {/* County / service picker */}
      <label className="block">
        <span className="text-xs text-gray-400 mb-1 block">County GIS Service</span>
        <select
          value={selectedServiceId}
          onChange={e => setSelectedServiceId(e.target.value)}
          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
        >
          {PARCEL_GIS_SERVICES.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {selectedService && (
          <span className="text-[10px] text-gray-500 mt-0.5 block truncate" title={selectedService.url}>
            {selectedService.region} · {selectedService.url}
          </span>
        )}
      </label>

      <div className="rounded border border-gray-700/60 bg-gray-900/40 p-2 space-y-2">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Label Formatter</div>
        {propertyOwnerStyleManagedByCategory && (
          <div className="rounded border border-cyan-800/70 bg-cyan-950/30 px-2 py-1.5 text-[11px] text-cyan-200">
            Typography is managed project-wide by Annotation Categories → Property Owners using
            {' '}
            <span className="font-semibold">{propertyOwnerCategory?.cadTextStyleName}</span>.
          </div>
        )}
        <label className="block text-[11px] text-gray-500">
          <span className="block mb-1">Style source</span>
          <select
            value={parcelLabelFormatter.styleSource ?? 'local'}
            disabled={propertyOwnerStyleManagedByCategory}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, styleSource: e.target.value as 'local' | 'cad-manager' })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
          >
            <option value="local">Local Parcel Overrides</option>
            <option value="cad-manager">CAD Manager Style Catalog</option>
          </select>
        </label>
        {((parcelLabelFormatter.styleSource ?? 'local') === 'cad-manager' || propertyOwnerStyleManagedByCategory) && (
          <label className="block text-[11px] text-gray-500">
            <span className="block mb-1">CAD Manager text style</span>
            <select
              value={propertyOwnerStyleManagedByCategory
                ? (propertyOwnerCategory?.cadTextStyleName ?? '')
                : (parcelLabelFormatter.cadTextStyleName ?? cadTextStyles[0]?.name ?? '')}
              disabled={propertyOwnerStyleManagedByCategory}
              onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, cadTextStyleName: e.target.value })}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
            >
              {cadTextStyles.map(style => (
                <option key={style.name} value={style.name}>{style.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-[11px] text-gray-500">
          <span className="block mb-1">Style preset</span>
          <select
            value={parcelLabelFormatter.stylePreset ?? 'narrow-cad'}
            disabled={typographyLockedByCad}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, stylePreset: e.target.value as NonNullable<ParcelLabelFormatter['stylePreset']> })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
          >
            {stylePresetOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={parcelLabelFormatter.includeParcelId}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeParcelId: e.target.checked })}
          />
          Include parcel ID
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={parcelLabelFormatter.includeOwner}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeOwner: e.target.checked })}
          />
          Include owner
        </label>
        <label className="flex items-center gap-2 pl-5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={parcelLabelFormatter.prependOwnerPrefix}
            disabled={!parcelLabelFormatter.includeOwner}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, prependOwnerPrefix: e.target.checked })}
          />
          Append owner prefix at start
        </label>
        <label className="block text-[11px] text-gray-500 pl-5">
          <span className="block mb-1">Owner prefix</span>
          <input
            type="text"
            value={parcelLabelFormatter.ownerPrefix}
            disabled={!parcelLabelFormatter.includeOwner || !parcelLabelFormatter.prependOwnerPrefix}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, ownerPrefix: e.target.value })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
            placeholder="N/F"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={parcelLabelFormatter.includeDeedBookPage}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeDeedBookPage: e.target.checked })}
          />
          Include deed book/page
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={parcelLabelFormatter.includeBlockUnit}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeBlockUnit: e.target.checked })}
          />
          Include block/unit
        </label>
        <label className="block text-[11px] text-gray-500">
          <span className="block mb-1">Lot owner font (canvas + DXF)</span>
          <select
            value={parcelLabelFormatter.fontFamily ?? 'Arial Narrow'}
            disabled={typographyLockedByCad}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, fontFamily: e.target.value })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
          >
            {parcelFontOptions.map(font => (
              <option key={font} value={font}>{font}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={parcelLabelFormatter.fontBold ?? false}
              disabled={typographyLockedByCad}
              onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, fontBold: e.target.checked })}
            />
            Bold
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={parcelLabelFormatter.fontItalic ?? true}
              disabled={typographyLockedByCad}
              onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, fontItalic: e.target.checked })}
            />
            Italic
          </label>
        </div>
        <label className="block text-[11px] text-gray-500">
          <span className="block mb-1">Text case</span>
          <select
            value={parcelLabelFormatter.textCase ?? 'uppercase'}
            disabled={typographyLockedByCad}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, textCase: e.target.value as 'original' | 'uppercase' })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
          >
            <option value="uppercase">UPPERCASE</option>
            <option value="original">Original Case</option>
          </select>
        </label>
        <label className="block text-[11px] text-gray-500">
          <span className="block mb-1">Line spacing {(parcelLabelFormatter.lineSpacing ?? 1.2).toFixed(2)}x</span>
          <input
            type="range"
            min="0.8"
            max="2"
            step="0.05"
            value={parcelLabelFormatter.lineSpacing ?? 1.2}
            disabled={typographyLockedByCad}
            onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, lineSpacing: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      </div>

      {/* Mode toggle */}
      <div>
        <span className="text-xs text-gray-400 mb-1 block">Query Area</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('inclusion')}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
              mode === 'inclusion'
                ? 'bg-green-700 border-green-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Inclusion Area {hasInclusion ? `(${inclusionSegmentCount})` : '(none drawn)'}
          </button>
          <button
            type="button"
            onClick={() => setMode('description')}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
              mode === 'description'
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Describe Area
          </button>
        </div>
      </div>

      {/* Description input */}
      {mode === 'description' && (
        <label className="block">
          <span className="text-xs text-gray-400 mb-1 block">Area Description</span>
          <input
            type="text"
            value={descriptionText}
            onChange={e => setDescriptionText(e.target.value)}
            placeholder='e.g. "Lower Merion Township, PA" or "1234 Main St, Norristown"'
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500"
            onKeyDown={e => { if (e.key === 'Enter' && canFetch) handleFetch(); }}
          />
          <span className="text-[10px] text-gray-500 mt-0.5 block">
            Geocoded via OpenStreetMap (Nominatim); a 0.1° minimum span is enforced.
          </span>
        </label>
      )}

      {mode === 'inclusion' && !hasInclusion && (
        <div className="text-xs text-amber-300/90 bg-amber-950/40 border border-amber-800/50 rounded p-2">
          Draw an inclusion polygon on the canvas first (Drawing Tools → Inclusion).
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleFetch}
          disabled={!canFetch}
          className={`flex-1 px-3 py-2 rounded text-sm font-semibold transition-colors ${
            canFetch
              ? 'bg-orange-600 hover:bg-orange-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isFetching ? 'Fetching…' : 'Fetch Parcels'}
        </button>
        <button
          type="button"
          onClick={onClearParcels}
          disabled={parcelLineCount === 0 || isFetching}
          className={`px-3 py-2 rounded text-sm font-medium border transition-colors ${
            parcelLineCount === 0 || isFetching
              ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
          }`}
          title="Remove all fetched parcel lines from the canvas"
        >
          Clear
        </button>
      </div>

      {/* Status / result list */}
      <div className="pt-2 border-t border-gray-700/60">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{parcelLineCount} segment{parcelLineCount === 1 ? '' : 's'} on canvas</span>
          <span>{lastFetchedParcels.length} parcel{lastFetchedParcels.length === 1 ? '' : 's'} last fetch</span>
        </div>
        {lastFetchedParcels.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-800/60 text-xs">
            {lastFetchedParcels.slice(0, 50).map((p, i) => (
              <li key={`${p.parcelId ?? 'parcel'}-${i}`} className="py-1.5">
                {buildParcelLabelLines(p, parcelLabelFormatter)
                  .map(line => applyAnnotationTextCase(line, effectiveParcelTextStyle.textCase))
                  .map((line, lineIndex) => (
                  <div
                    key={`${p.parcelId ?? 'parcel'}-${i}-${lineIndex}`}
                    className={lineIndex === 0 ? 'font-mono text-gray-300' : 'text-gray-500 truncate'}
                    title={line}
                  >
                    {line}
                  </div>
                ))}
              </li>
            ))}
            {lastFetchedParcels.length > 50 && (
              <li className="py-1.5 text-gray-500 italic">…and {lastFetchedParcels.length - 50} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};
