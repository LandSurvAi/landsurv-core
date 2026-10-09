import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { PARCEL_GIS_SERVICES, PARCEL_LAYER_TAG, type ParcelFeatureSummary } from '../services/parcelGisService.ts';
import { type AnnotationCategoryStyle, type ParcelCadTextStyle, type ParcelLabelFormatter, DEFAULT_PARCEL_LABEL_FORMATTER } from '../types.ts';
import { applyAnnotationTextCase } from '../utils/annotationTextStyle.ts';
import { buildParcelLabelLines, resolveEffectiveParcelTextStyle } from '../utils/parcelLabelFormatter.ts';
import { 
  ArrowTopRightOnSquareIcon, 
  ArrowDownOnSquareIcon, 
  ChevronUpIcon, 
  ChevronDownIcon, 
  XMarkIcon,
  GisAgentIcon,
  LayersIcon,
  PencilSquareIcon,
  CrosshairsIcon
} from './icons.tsx';

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
  /** Whether the panel is docked inside chat / drawer or floating on canvas. Defaults to true. */
  isDocked?: boolean;
  /** Toggle between docked in drawer and floating on canvas. */
  onToggleDock?: () => void;
  /** Whether the panel is minimized (header only). */
  isMinimized?: boolean;
  /** Toggle minimized state. */
  onToggleMinimize?: () => void;
  /** Close callback (e.g. when floating window is closed). */
  onClose?: () => void;
  /** Space reserved on the right (e.g. open chat panel) for screen boundary clamping. */
  reservedRight?: number;
  /** Space reserved at the bottom (e.g. mobile chat panel) for screen boundary clamping. */
  reservedBottom?: number;
}

export type ParcelPanelMode = 'query' | 'labels' | 'parcels';

/**
 * Boundary-Agent GIS panel for fetching public county parcel (tax-boundary)
 * layers from ArcGIS REST services.
 * Features:
 *   - Multi-modal view tabs: Query & Fetch, Label Formatting, and Fetched Parcels List.
 *   - Dockable in chat/tools drawer or poppable into a smooth floating draggable window on canvas.
 *   - Minimizable and closeable with Welcome Screen aesthetic accents.
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
  isDocked = true,
  onToggleDock,
  isMinimized = false,
  onToggleMinimize,
  onClose,
  reservedRight = 0,
  reservedBottom = 0,
}) => {
  const [activeMode, setActiveMode] = useState<ParcelPanelMode>('query');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(PARCEL_GIS_SERVICES[0]?.id ?? '');
  const [queryMode, setQueryMode] = useState<'inclusion' | 'description'>('description');
  const [descriptionText, setDescriptionText] = useState<string>('');
  const [parcelSearchFilter, setParcelSearchFilter] = useState<string>('');

  // Floating window position & drag handling
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{
    isDragging: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    offset: { x: number; y: number };
    width: number;
    height: number;
    currentX: number;
    currentY: number;
    rafPending: boolean;
  }>({
    isDragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    offset: { x: 0, y: 0 },
    width: 520,
    height: 480,
    currentX: 0,
    currentY: 0,
    rafPending: false,
  });

  const panelEdgeGap = 10;
  const panelTopLimit = 56;

  const getDefaultPos = useCallback(() => {
    const panelWidth = panelRef.current?.getBoundingClientRect().width ?? Math.min(520, window.innerWidth - panelEdgeGap * 2);
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 460;
    return {
      x: Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap - 20),
      y: Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap - 20),
    };
  }, [reservedBottom, reservedRight]);

  const clampPosition = useCallback((candidate: { x: number; y: number }) => {
    const rect = panelRef.current?.getBoundingClientRect();
    const panelWidth = rect?.width ?? Math.min(520, window.innerWidth - panelEdgeGap * 2);
    const panelHeight = rect?.height ?? 460;
    const maxX = Math.max(panelEdgeGap, window.innerWidth - reservedRight - panelWidth - panelEdgeGap);
    const maxY = Math.max(panelTopLimit, window.innerHeight - reservedBottom - panelHeight - panelEdgeGap);
    return {
      x: Math.max(panelEdgeGap, Math.min(maxX, candidate.x)),
      y: Math.max(panelTopLimit, Math.min(maxY, candidate.y)),
    };
  }, [reservedBottom, reservedRight]);

  useLayoutEffect(() => {
    if (isDocked) return;
    const clamp = () => {
      if (dragState.current.isDragging) return;
      setPos(previous => {
        const next = clampPosition(previous ?? getDefaultPos());
        return previous && previous.x === next.x && previous.y === next.y ? previous : next;
      });
    };
    clamp();
    const observer = typeof ResizeObserver !== 'undefined' && panelRef.current
      ? new ResizeObserver(clamp)
      : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener('resize', clamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', clamp);
    };
  }, [isDocked, clampPosition, getDefaultPos]);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isDocked) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, textarea')) return;

    const isTouch = 'touches' in e;
    const point = isTouch ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    if (!point) return;

    const rect = panelRef.current?.getBoundingClientRect();
    const current = pos ?? getDefaultPos();
    const width = rect?.width ?? Math.min(520, window.innerWidth - panelEdgeGap * 2);
    const height = rect?.height ?? 460;
    const origX = rect?.left ?? current.x;
    const origY = rect?.top ?? current.y;

    dragState.current = {
      isDragging: true,
      hasMoved: false,
      startX: point.clientX,
      startY: point.clientY,
      origX,
      origY,
      offset: {
        x: point.clientX - origX,
        y: point.clientY - origY,
      },
      width,
      height,
      currentX: origX,
      currentY: origY,
      rafPending: false,
    };

    if (!isTouch) {
      e.preventDefault();
    }
  }, [isDocked, pos, getDefaultPos]);

  useEffect(() => {
    if (isDocked) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const state = dragState.current;
      if (!state.isDragging) return;

      const isTouch = 'touches' in e;
      const point = isTouch ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      if (!point) return;

      const dist = Math.hypot(point.clientX - state.startX, point.clientY - state.startY);
      if (dist > 3 && !state.hasMoved) {
        state.hasMoved = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        if (panelRef.current) {
          panelRef.current.style.transition = 'none';
          panelRef.current.style.willChange = 'left, top';
        }
      }

      if (!state.hasMoved) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      const maxX = Math.max(panelEdgeGap, window.innerWidth - reservedRight - state.width - panelEdgeGap);
      const maxY = Math.max(panelTopLimit, window.innerHeight - reservedBottom - state.height - panelEdgeGap);

      const nextX = Math.max(panelEdgeGap, Math.min(maxX, point.clientX - state.offset.x));
      const nextY = Math.max(panelTopLimit, Math.min(maxY, point.clientY - state.offset.y));

      state.currentX = nextX;
      state.currentY = nextY;

      if (!state.rafPending) {
        state.rafPending = true;
        requestAnimationFrame(() => {
          state.rafPending = false;
          if (state.isDragging && panelRef.current) {
            panelRef.current.style.left = `${state.currentX}px`;
            panelRef.current.style.top = `${state.currentY}px`;
          }
        });
      }
    };

    const handlePointerUp = () => {
      const state = dragState.current;
      if (!state.isDragging) return;
      state.isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (panelRef.current) {
        panelRef.current.style.transition = '';
        panelRef.current.style.willChange = 'auto';
      }

      if (state.hasMoved) {
        setPos({ x: state.currentX, y: state.currentY });
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isDocked, reservedBottom, reservedRight]);

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
    (queryMode === 'inclusion' ? hasInclusion : descriptionText.trim().length > 0);

  const handleFetch = () => {
    if (!selectedService || !canFetch) return;
    onFetchParcels(selectedService.url, queryMode, queryMode === 'description' ? descriptionText.trim() : undefined);
  };

  // Sample preview data for typography tab
  const sampleParcel: ParcelFeatureSummary = useMemo(() => {
    if (lastFetchedParcels.length > 0) {
      return lastFetchedParcels[0];
    }
    return {
      parcelId: '40-00-12345-00-1',
      owner: 'SMITH JOHN & JANE',
      deedBook: '5420',
      deedPage: '182',
      block: '12',
      unit: '4',
      coordinates: [],
    };
  }, [lastFetchedParcels]);

  // Filtered parcels list
  const filteredParcels = useMemo(() => {
    if (!parcelSearchFilter.trim()) return lastFetchedParcels;
    const q = parcelSearchFilter.trim().toLowerCase();
    return lastFetchedParcels.filter(p => 
      (p.parcelId && p.parcelId.toLowerCase().includes(q)) ||
      (p.owner && p.owner.toLowerCase().includes(q)) ||
      (p.deedBook && p.deedBook.toLowerCase().includes(q)) ||
      (p.deedPage && p.deedPage.toLowerCase().includes(q))
    );
  }, [lastFetchedParcels, parcelSearchFilter]);

  const currentPos = pos ?? getDefaultPos();
  const maxPanelHeight = Math.max(220, window.innerHeight - reservedBottom - panelTopLimit - panelEdgeGap);

  return (
    <div
      ref={isDocked ? undefined : panelRef}
      style={isDocked ? {
        fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      } : { 
        left: currentPos.x, 
        top: currentPos.y, 
        width: Math.min(520, typeof window !== 'undefined' ? window.innerWidth - panelEdgeGap * 2 : 520), 
        maxHeight: maxPanelHeight,
        fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      }}
      className={isDocked ? (
        "w-full bg-gray-900/95 border-0 text-xs text-gray-200 select-none light-theme:bg-white light-theme:text-gray-800 flex flex-col overflow-hidden antialiased"
      ) : (
        `fixed z-30 max-w-[calc(100vw-1rem)] bg-gray-900/95 border border-orange-500/40 border-dashed rounded-xl shadow-2xl backdrop-blur-md text-xs text-gray-200 select-none light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800 flex flex-col overflow-hidden antialiased transition-shadow ${
          isMinimized ? 'shadow-lg' : 'shadow-2xl'
        }`
      )}
    >
      {/* Header — drag handle with Welcome Screen styling */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 bg-gray-950/80 border-b border-gray-800/80 ${
          isDocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        } light-theme:bg-gray-100/90 light-theme:border-gray-200 shrink-0 gap-2 select-none ${
          isMinimized && !isDocked ? 'rounded-xl border-b-0' : ''
        }`}
        style={{ touchAction: isDocked ? 'auto' : 'none' }}
        onMouseDown={isDocked ? undefined : handlePointerDown}
        onTouchStart={isDocked ? undefined : handlePointerDown}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 overflow-hidden">
          {/* Accent bar */}
          <div className="w-2.5 h-6 rounded-l-md bg-orange-500 shrink-0" />
          <GisAgentIcon className="w-5 h-5 text-orange-400 shrink-0" />
          <div className="flex items-baseline gap-1.5 shrink-0">
            <h2 className="text-sm font-extrabold tracking-tight text-white light-theme:text-gray-900 whitespace-nowrap">
              Boundary<span className="text-cyan-400">Agent</span>
            </h2>
            <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 uppercase tracking-wider shrink-0 whitespace-nowrap">
              GIS
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-300 truncate hidden xs:inline light-theme:text-gray-700">
            County Parcels
          </span>
        </div>

        {/* Window controls: Dock/Pop-out, Minimize, Close */}
        <div className="flex items-center gap-1 shrink-0">
          {onToggleDock && (
            <button
              onClick={onToggleDock}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-cyan-400 transition-colors light-theme:hover:bg-gray-200"
              title={isDocked ? 'Pop out GIS dialog to a floating window on canvas' : 'Dock GIS dialog back into chat'}
              aria-label={isDocked ? 'Pop out GIS dialog' : 'Dock GIS dialog'}
            >
              {isDocked ? (
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              ) : (
                <ArrowDownOnSquareIcon className="w-4 h-4" />
              )}
            </button>
          )}
          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors light-theme:hover:bg-gray-200"
              title={isDocked ? 'Minimize in chat' : (isMinimized ? 'Expand dialog' : 'Minimize dialog')}
              aria-label={isDocked ? 'Minimize in chat' : (isMinimized ? 'Expand dialog' : 'Minimize dialog')}
            >
              {isMinimized && !isDocked ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronUpIcon className="w-4 h-4" />
              )}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-950/60 text-gray-400 hover:text-rose-400 transition-colors light-theme:hover:bg-rose-100"
              title="Close GIS dialog"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-modal Tab Bar — rendered when not minimized */}
      {!isMinimized && (
        <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-gray-800/80 bg-gray-950/40 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode('query')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMode === 'query'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <CrosshairsIcon className="w-3.5 h-3.5" />
            <span>Query</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('labels')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMode === 'labels'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            <span>Labels</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('parcels')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMode === 'parcels'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <LayersIcon className="w-3.5 h-3.5" />
            <span>Parcels</span>
            {lastFetchedParcels.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                {lastFetchedParcels.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Main Content Area — split by active mode */}
      {!isMinimized && (
        <div className={`flex-1 overflow-y-auto px-3.5 py-3 space-y-3 ${isDocked ? 'max-h-[60vh]' : ''}`}>
          {/* ========================================================= */}
          {/* MODE 1: QUERY & FETCH                                     */}
          {/* ========================================================= */}
          {activeMode === 'query' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-orange-950/20 border border-orange-500/30 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-orange-300 flex items-center gap-1.5">
                    🏛️ Public County GIS Tax Boundaries
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">ArcGIS REST</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed light-theme:text-gray-600">
                  Fetch live parcel polygons directly from county GIS servers into your canvas linework.
                </p>
              </div>

              {/* County / service picker */}
              <label className="block">
                <span className="text-xs font-semibold text-gray-300 mb-1 block light-theme:text-gray-700">
                  County GIS Service
                </span>
                <select
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 focus:outline-none focus:border-orange-500 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-800"
                >
                  {PARCEL_GIS_SERVICES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.region})
                    </option>
                  ))}
                </select>
                {selectedService && (
                  <span className="text-[10px] text-gray-500 mt-1 block truncate" title={selectedService.url}>
                    {selectedService.region} · {selectedService.url}
                  </span>
                )}
              </label>

              {/* Query Area Mode Selector */}
              <div>
                <span className="text-xs font-semibold text-gray-300 mb-1.5 block light-theme:text-gray-700">
                  Query Area
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQueryMode('inclusion')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      queryMode === 'inclusion'
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-700'
                    }`}
                  >
                    Inclusion Area {hasInclusion ? `(${inclusionSegmentCount})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryMode('description')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      queryMode === 'description'
                        ? 'bg-cyan-600 border-cyan-400 text-white shadow-sm'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-700'
                    }`}
                  >
                    Describe Area
                  </button>
                </div>
              </div>

              {/* Inclusion area status hint */}
              {queryMode === 'inclusion' && (
                hasInclusion ? (
                  <div className="text-xs text-emerald-300/90 bg-emerald-950/40 border border-emerald-800/50 rounded-md p-2.5 flex items-center justify-between">
                    <span>Inclusion area defined ({inclusionSegmentCount} segments). Ready to query.</span>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300/90 bg-amber-950/40 border border-amber-800/50 rounded-md p-2.5">
                    Draw an inclusion polygon on the canvas first (Drawing Tools → Inclusion).
                  </div>
                )
              )}

              {/* Description input */}
              {queryMode === 'description' && (
                <label className="block">
                  <span className="text-xs font-semibold text-gray-300 mb-1 block light-theme:text-gray-700">
                    Area Description or Address
                  </span>
                  <input
                    type="text"
                    value={descriptionText}
                    onChange={e => setDescriptionText(e.target.value)}
                    placeholder='e.g. "Lower Merion Township, PA" or "1234 Main St, Norristown"'
                    className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-800"
                    onKeyDown={e => { if (e.key === 'Enter' && canFetch) handleFetch(); }}
                  />
                  <span className="text-[10px] text-gray-500 mt-1 block">
                    Geocoded via OpenStreetMap (Nominatim); a 0.1° minimum span is enforced.
                  </span>
                </label>
              )}

              {/* Action Buttons: Fetch & Clear */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={!canFetch}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 ${
                    canFetch
                      ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white border border-orange-400/50'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
                  }`}
                >
                  {isFetching ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Fetching Parcels…</span>
                    </>
                  ) : (
                    <>
                      <GisAgentIcon className="w-4 h-4 text-orange-300" />
                      <span>Fetch Parcels</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClearParcels}
                  disabled={parcelLineCount === 0 || isFetching}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    parcelLineCount === 0 || isFetching
                      ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border-gray-600 light-theme:bg-gray-100 light-theme:border-gray-300'
                  }`}
                  title="Remove all fetched parcel lines from the canvas"
                >
                  Clear
                </button>
              </div>

              {/* Quick Status Bar */}
              <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{parcelLineCount}</span>
                  <span>segment{parcelLineCount === 1 ? '' : 's'} on canvas</span>
                </div>
                {lastFetchedParcels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveMode('parcels')}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                  >
                    View {lastFetchedParcels.length} parcels →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODE 2: LABELS & TYPOGRAPHY                               */}
          {/* ========================================================= */}
          {activeMode === 'labels' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-cyan-950/20 border border-cyan-500/30 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                    🏷️ Parcel Typography &amp; Formatting
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Canvas + DXF</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed light-theme:text-gray-600">
                  Control how tax parcel boundary labels appear on the canvas and in CAD exports.
                </p>
              </div>

              {propertyOwnerStyleManagedByCategory && (
                <div className="rounded-md border border-cyan-800/70 bg-cyan-950/30 px-2.5 py-2 text-xs text-cyan-200">
                  Typography is managed project-wide by Annotation Categories → Property Owners using
                  {' '}
                  <span className="font-semibold text-white">{propertyOwnerCategory?.cadTextStyleName}</span>.
                </div>
              )}

              {/* Style Source & Preset */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-gray-400 mb-1 block">Style Source</span>
                  <select
                    value={parcelLabelFormatter.styleSource ?? 'local'}
                    disabled={propertyOwnerStyleManagedByCategory}
                    onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, styleSource: e.target.value as 'local' | 'cad-manager' })}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 disabled:text-gray-500 light-theme:bg-gray-100 light-theme:border-gray-300"
                  >
                    <option value="local">Local Overrides</option>
                    <option value="cad-manager">CAD Manager</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-gray-400 mb-1 block">Style Preset</span>
                  <select
                    value={parcelLabelFormatter.stylePreset ?? 'narrow-cad'}
                    disabled={typographyLockedByCad}
                    onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, stylePreset: e.target.value as NonNullable<ParcelLabelFormatter['stylePreset']> })}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 disabled:text-gray-500 light-theme:bg-gray-100 light-theme:border-gray-300"
                  >
                    {stylePresetOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {((parcelLabelFormatter.styleSource ?? 'local') === 'cad-manager' || propertyOwnerStyleManagedByCategory) && (
                <label className="block">
                  <span className="text-xs text-gray-400 mb-1 block">CAD Manager Text Style</span>
                  <select
                    value={propertyOwnerStyleManagedByCategory
                      ? (propertyOwnerCategory?.cadTextStyleName ?? '')
                      : (parcelLabelFormatter.cadTextStyleName ?? cadTextStyles[0]?.name ?? '')}
                    disabled={propertyOwnerStyleManagedByCategory}
                    onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, cadTextStyleName: e.target.value })}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 disabled:text-gray-500 light-theme:bg-gray-100 light-theme:border-gray-300"
                  >
                    {cadTextStyles.map(style => (
                      <option key={style.name} value={style.name}>{style.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Label Content Options */}
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 space-y-2">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Label Content Fields
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeParcelId}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeParcelId: e.target.checked })}
                      className="rounded border-gray-700 text-orange-500 focus:ring-0"
                    />
                    <span>Parcel ID</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeOwner}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeOwner: e.target.checked })}
                      className="rounded border-gray-700 text-orange-500 focus:ring-0"
                    />
                    <span>Owner Name</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeDeedBookPage}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeDeedBookPage: e.target.checked })}
                      className="rounded border-gray-700 text-orange-500 focus:ring-0"
                    />
                    <span>Deed Book/Page</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeBlockUnit}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeBlockUnit: e.target.checked })}
                      className="rounded border-gray-700 text-orange-500 focus:ring-0"
                    />
                    <span>Block / Unit</span>
                  </label>
                </div>

                {/* Owner prefix sub-option */}
                <div className="pt-1.5 border-t border-gray-800/80 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.prependOwnerPrefix}
                      disabled={!parcelLabelFormatter.includeOwner}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, prependOwnerPrefix: e.target.checked })}
                      className="rounded border-gray-700 text-orange-500 focus:ring-0"
                    />
                    <span>Prefix</span>
                  </label>
                  <input
                    type="text"
                    value={parcelLabelFormatter.ownerPrefix}
                    disabled={!parcelLabelFormatter.includeOwner || !parcelLabelFormatter.prependOwnerPrefix}
                    onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, ownerPrefix: e.target.value })}
                    className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 disabled:text-gray-500"
                    placeholder="N/F"
                  />
                  <span className="text-[11px] text-gray-500 italic">e.g. N/F (Now or Formerly)</span>
                </div>
              </div>

              {/* Typography Settings */}
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 space-y-2">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Font &amp; Layout
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs text-gray-400 mb-1 block">Font Family</span>
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

                  <label className="block">
                    <span className="text-xs text-gray-400 mb-1 block">Letter Case</span>
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
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parcelLabelFormatter.fontBold ?? false}
                        disabled={typographyLockedByCad}
                        onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, fontBold: e.target.checked })}
                      />
                      <span>Bold</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parcelLabelFormatter.fontItalic ?? true}
                        disabled={typographyLockedByCad}
                        onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, fontItalic: e.target.checked })}
                      />
                      <span>Italic</span>
                    </label>
                  </div>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Spacing: {(parcelLabelFormatter.lineSpacing ?? 1.2).toFixed(2)}x
                  </span>
                </div>

                <input
                  type="range"
                  min="0.8"
                  max="2"
                  step="0.05"
                  value={parcelLabelFormatter.lineSpacing ?? 1.2}
                  disabled={typographyLockedByCad}
                  onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, lineSpacing: Number(e.target.value) })}
                  className="w-full accent-orange-500"
                />
              </div>

              {/* Live Preview Box */}
              <div className="rounded-lg border border-gray-700/80 bg-gray-950 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
                    Live Sample Preview
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {effectiveParcelTextStyle.fontFamily} · {effectiveParcelTextStyle.lineSpacing}x
                  </span>
                </div>
                <div 
                  className="p-2 bg-gray-900 border border-gray-800 rounded font-sans space-y-0.5 text-gray-200"
                  style={{
                    fontFamily: effectiveParcelTextStyle.fontFamily,
                    fontWeight: effectiveParcelTextStyle.bold ? 'bold' : 'normal',
                    fontStyle: effectiveParcelTextStyle.italic ? 'italic' : 'normal',
                    lineHeight: effectiveParcelTextStyle.lineSpacing,
                  }}
                >
                  {buildParcelLabelLines(sampleParcel, parcelLabelFormatter)
                    .map(line => applyAnnotationTextCase(line, effectiveParcelTextStyle.textCase))
                    .map((line, idx) => (
                      <div key={idx} className={idx === 0 ? 'text-orange-300 font-semibold' : 'text-gray-300 text-[11px]'}>
                        {line}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODE 3: PARCELS LIST / RESULTS                            */}
          {/* ========================================================= */}
          {activeMode === 'parcels' && (
            <div className="space-y-3">
              {lastFetchedParcels.length === 0 ? (
                <div className="p-6 text-center space-y-3 rounded-lg border border-dashed border-gray-800 bg-gray-950/30">
                  <div className="inline-flex items-center justify-center p-3 rounded-full bg-orange-950/30 text-orange-400 border border-orange-500/20">
                    <LayersIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-200">No Parcels Fetched Yet</h4>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    Fetch county tax parcels from the Query tab by selecting a county and defining an area.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveMode('query')}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                  >
                    Go to Query Tab →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-300">
                      {lastFetchedParcels.length} Total Parcels
                    </span>
                    <button
                      type="button"
                      onClick={onClearParcels}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      Clear Canvas Lines
                    </button>
                  </div>

                  {/* Search filter */}
                  <div className="relative">
                    <input
                      type="text"
                      value={parcelSearchFilter}
                      onChange={e => setParcelSearchFilter(e.target.value)}
                      placeholder="Filter parcels by ID or owner…"
                      className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 light-theme:bg-gray-100 light-theme:border-gray-300"
                    />
                    {parcelSearchFilter && (
                      <button
                        type="button"
                        onClick={() => setParcelSearchFilter('')}
                        className="absolute right-2 top-1.5 text-gray-400 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Parcels list */}
                  <ul className="divide-y divide-gray-800/80 rounded-lg border border-gray-800 bg-gray-950/50 max-h-72 overflow-y-auto">
                    {filteredParcels.slice(0, 100).map((p, i) => (
                      <li key={`${p.parcelId ?? 'parcel'}-${i}`} className="p-2 hover:bg-gray-900/60 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-orange-300 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-500/20 truncate">
                            {p.parcelId || 'Unnamed Parcel'}
                          </span>
                          {p.coordinates && p.coordinates.length > 0 && (
                            <span className="text-[10px] text-gray-500 font-mono shrink-0">
                              {p.coordinates.length} pts
                            </span>
                          )}
                        </div>
                        {buildParcelLabelLines(p, parcelLabelFormatter)
                          .map(line => applyAnnotationTextCase(line, effectiveParcelTextStyle.textCase))
                          .map((line, lineIndex) => (
                            <div
                              key={lineIndex}
                              className={`text-[11px] truncate ${lineIndex === 0 ? 'text-gray-300 font-medium' : 'text-gray-400'}`}
                              title={line}
                            >
                              {line}
                            </div>
                          ))}
                      </li>
                    ))}
                    {filteredParcels.length > 100 && (
                      <li className="p-2 text-center text-xs text-gray-500 italic">
                        …and {filteredParcels.length - 100} more parcels
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

