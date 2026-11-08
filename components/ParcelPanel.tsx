import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  PARCEL_LAYER_TAG,
  findParcelServiceForJurisdiction,
  type ParcelServiceMatch,
  type ParcelFeatureSummary,
  type ParcelGisServiceDef,
  type ParcelServiceCandidate,
  getAllParcelServices,
  saveCustomParcelService,
  deleteCustomParcelService,
  describeParcelService,
} from '../services/parcelGisService.ts';
import { type AnnotationCategoryStyle, type ParcelCadTextStyle, type ParcelLabelFormatter, type SurveyLine, type SurveyPoint, DEFAULT_PARCEL_LABEL_FORMATTER } from '../types.ts';
import { applyAnnotationTextCase } from '../utils/annotationTextStyle.ts';
import { metadataEntries } from '../utils/featureMetadata.ts';
import { buildParcelLabelLines, resolveEffectiveParcelTextStyle } from '../utils/parcelLabelFormatter.ts';
import {
  detectJurisdictionFromBrowser,
  inferJurisdictionFromEpsg,
  resolveProjectJurisdiction,
  type ProjectJurisdiction,
} from '../utils/projectJurisdiction.ts';
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
import { DockModeControl, type DockMode } from './DockModeControl.tsx';
import { SectionChip } from './common/SectionChip.tsx';

export interface ParcelPanelProps {
  /** Number of inclusion-line segments currently drawn — used to enable/disable "Use inclusion area". */
  inclusionSegmentCount: number;
  /** Count of parcel line segments currently rendered (lines whose layer === PARCEL_LAYER_TAG). */
  parcelLineCount: number;
  /** Most recent fetch summary (parcels with id/owner). */
  lastFetchedParcels: ParcelFeatureSummary[];
  /** Set when owner/deed attributes came from a secondary county layer. */
  lastEnrichment?: {
    source: string;
    sourceName?: string;
    matched: number;
    enriched: number;
    auto: boolean;
  } | null;
  /** True while a fetch is in flight. */
  isFetching: boolean;
  /** Trigger a fetch — App.tsx builds the bbox (inclusion or description) and calls the service. */
  onFetchParcels: (
    service: ParcelGisServiceDef,
    mode: ParcelQueryMode,
    descriptionText?: string,
  ) => void;
  /**
   * Discover ArcGIS Online parcel layers covering the current AOI. This is the
   * nationwide path: it finds the local county's layer on demand instead of
   * relying on a hand-curated list.
   */
  onSearchParcelServices?: (
    mode: ParcelQueryMode,
    descriptionText?: string,
  ) => Promise<ParcelServiceCandidate[]>;
  /** Georeferenced survey points on the canvas — used to detect the jurisdiction. */
  projectPoints?: SurveyPoint[];
  /** Canvas linework; an inclusion boundary, when present, defines the AOI. */
  projectLines?: SurveyLine[];
  /** Project EPSG — required to convert project coordinates to WGS84. */
  projectEpsg?: number | null;
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
  /** Tri-state placement across chat, canvas, and the Tool Shelf. */
  dockMode?: DockMode;
  onDockModeChange?: (mode: DockMode) => void;
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

/** How the parcel query area is defined. 'project' uses the georeferenced
 *  point extent, so no inclusion polygon or typed address is needed. */
export type ParcelQueryMode = 'inclusion' | 'description' | 'project';

const LAST_SERVICE_KEY = 'landsurv.parcel.lastService';

function rememberServiceId(id: string): void {
  try { localStorage.setItem(LAST_SERVICE_KEY, id); } catch { /* private mode */ }
}

/** Default to the last service used on this device, then the PA county fabric
 *  the Boundary Agent shipped with, then whatever is first in the registry. */
function readInitialServiceId(epsg?: number | null): string {
  const all = getAllParcelServices();
  const guess = inferJurisdictionFromEpsg(epsg);
  const suggested = guess ? findParcelServiceForJurisdiction(guess) : null;
  try {
    const saved = localStorage.getItem(LAST_SERVICE_KEY);
    const savedDef = saved ? all.find(s => s.id === saved) : null;
    if (savedDef) {
      // A saved layer from the project's own state still wins; one from
      // another state must not override the project's coordinate system.
      if (!suggested?.service.state || !savedDef.state) return savedDef.id;
      if (savedDef.state === suggested.service.state) return savedDef.id;
    }
  } catch { /* private mode */ }
  return suggested?.service.id ?? all.find(s => s.id === 'montco-pa')?.id ?? all[0]?.id ?? '';
}

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
  lastEnrichment = null,
  isFetching,
  onFetchParcels,
  onSearchParcelServices,
  projectPoints = [],
  projectLines = [],
  projectEpsg = null,
  onClearParcels,
  parcelLabelFormatter = DEFAULT_PARCEL_LABEL_FORMATTER,
  cadTextStyles = [],
  propertyOwnerCategory,
  onParcelLabelFormatterChange,
  isDocked: isDockedProp = true,
  onToggleDock,
  dockMode,
  onDockModeChange,
  isMinimized = false,
  onToggleMinimize,
  onClose,
  reservedRight = 0,
  reservedBottom = 0,
}) => {
  const mode: DockMode = dockMode ?? (isDockedProp ? 'toolshelf' : 'floating');
  const isDocked = mode !== 'floating';
  const [activeMode, setActiveMode] = useState<ParcelPanelMode>('query');
  const [services, setServices] = useState<ParcelGisServiceDef[]>(() => getAllParcelServices());
  const [selectedServiceId, setSelectedServiceIdRaw] = useState<string>(() => readInitialServiceId(projectEpsg));
  // Default to the points already on the canvas when they are georeferenced —
  // the user should not have to type an address or select a county first.
  const [queryMode, setQueryMode] = useState<ParcelQueryMode>(() =>
    inclusionSegmentCount === 0 && projectPoints.length > 0 && !!projectEpsg ? 'project' : 'description');
  const [descriptionText, setDescriptionText] = useState<string>('');
  const [parcelSearchFilter, setParcelSearchFilter] = useState<string>('');

  // Jurisdiction detected from the project's georeferenced points.
  const [jurisdiction, setJurisdiction] = useState<ProjectJurisdiction | null>(null);
  const [jurisdictionStatus, setJurisdictionStatus] = useState<'idle' | 'detecting' | 'found' | 'error'>('idle');
  const [jurisdictionError, setJurisdictionError] = useState<string | null>(null);
  const [serviceMatch, setServiceMatch] = useState<ParcelServiceMatch | null>(null);
  const userPickedServiceRef = useRef(false);

  // Custom-server + discovery state (nationwide coverage).
  const [showCustomServer, setShowCustomServer] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [isProbing, setIsProbing] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customNotice, setCustomNotice] = useState<string | null>(null);
  const [discoveries, setDiscoveries] = useState<ParcelServiceCandidate[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

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

  // ── Auto-detect the jurisdiction from the georeferenced project ─────────
  // The loaded points (or inclusion boundary) already say where the site is;
  // reverse-geocode that center once and pre-select the matching county layer
  // so state/county/service never has to be picked by hand.
  const projectDataRef = useRef({ points: projectPoints, lines: projectLines, epsg: projectEpsg });
  projectDataRef.current = { points: projectPoints, lines: projectLines, epsg: projectEpsg };

  const detectionSignature = useMemo(() => {
    if (!projectEpsg || projectPoints.length === 0) return '';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of projectPoints) {
      if (!Number.isFinite(p.easting) || !Number.isFinite(p.northing)) continue;
      x0 = Math.min(x0, p.easting); x1 = Math.max(x1, p.easting);
      y0 = Math.min(y0, p.northing); y1 = Math.max(y1, p.northing);
    }
    if (!Number.isFinite(x0)) return '';
    const q = (n: number) => Math.round(n / 10) * 10; // ~10 project units
    return `${projectEpsg}:${q(x0)},${q(y0)},${q(x1)},${q(y1)}:${projectPoints.length}`;
  }, [projectEpsg, projectPoints]);

  const applyJurisdiction = useCallback((j: ProjectJurisdiction) => {
    setJurisdiction(j);
    setJurisdictionStatus('found');
    setJurisdictionError(null);
    const match = findParcelServiceForJurisdiction(j);
    setServiceMatch(match ?? null);
    // A manual pick always wins; otherwise select the county fabric for them.
    if (match && !userPickedServiceRef.current) {
      setSelectedServiceIdRaw(match.service.id);
      rememberServiceId(match.service.id);
    }
  }, []);

  const handleDetectFromBrowser = useCallback(async () => {
    setJurisdictionStatus('detecting');
    setJurisdictionError(null);
    try {
      const result = await detectJurisdictionFromBrowser();
      if (result) applyJurisdiction(result);
      else {
        setJurisdictionStatus('error');
        setJurisdictionError('No US state/county matched this device location.');
      }
    } catch (err) {
      setJurisdictionStatus('error');
      setJurisdictionError(err instanceof Error ? err.message : String(err));
    }
  }, [applyJurisdiction]);

  const lastDetectionSignatureRef = useRef('');
  const [detectionRetry, setDetectionRetry] = useState(0);
  const retryDetection = useCallback(() => {
    if (!lastDetectionSignatureRef.current) return;
    lastDetectionSignatureRef.current = '';
    setDetectionRetry(n => n + 1);
  }, []);

  useEffect(() => {
    if (!detectionSignature) {
      if (lastDetectionSignatureRef.current) {
        lastDetectionSignatureRef.current = '';
        setJurisdiction(null);
        setServiceMatch(null);
        setJurisdictionStatus('idle');
      }
      return;
    }
    if (lastDetectionSignatureRef.current === detectionSignature) return;
    lastDetectionSignatureRef.current = detectionSignature;
    let cancelled = false;
    let settled = false;
    const { points: pts, lines: lns, epsg } = projectDataRef.current;

    // The project's State Plane zone names its state, so a matching statewide
    // parcel layer can be selected instantly — no geocoder round-trip needed.
    const stateGuess = inferJurisdictionFromEpsg(epsg);
    let stateFallbackLabel: string | null = null;
    if (stateGuess) {
      setJurisdiction(stateGuess);
      const guessMatch = findParcelServiceForJurisdiction(stateGuess);
      setServiceMatch(guessMatch ?? null);
      if (guessMatch?.match === 'statewide') stateFallbackLabel = guessMatch.service.label;
      if (guessMatch && !userPickedServiceRef.current) {
        setSelectedServiceIdRaw(guessMatch.service.id);
        rememberServiceId(guessMatch.service.id);
      }
    }

    setJurisdictionStatus('detecting');
    setJurisdictionError(null);

    const noCountyAdvice = stateGuess
      ? (stateFallbackLabel
          ? ' Using ' + stateFallbackLabel + '.'
          : ' Pick a county layer above, or use “Find layers here”.')
      : ' Pick the GIS service manually, or use this device’s location.';

    // Hard ceiling: both geocoders time out internally, but the spinner must
    // never be able to run forever if something else stalls.
    const watchdog = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setJurisdictionStatus('error');
      setJurisdictionError('County lookup timed out.' + noCountyAdvice);
    }, 10_000);

    resolveProjectJurisdiction({ points: pts, lines: lns, epsg })
      .then((result) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (result) {
          applyJurisdiction(result);
        } else if (stateGuess) {
          setJurisdictionStatus('error');
          setJurisdictionError(
            'Located ' + stateGuess.state + ' from the project coordinate system, but the county lookup returned no match.' +
            noCountyAdvice,
          );
        } else {
          setJurisdictionStatus('error');
          setJurisdictionError('No US state/county matched the project coordinates.');
        }
      })
      .catch((err) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(watchdog);
        setJurisdictionStatus('error');
        const reason = err instanceof Error ? err.message : String(err);
        setJurisdictionError('County lookup failed (' + reason + ').' + noCountyAdvice);
      });
    return () => { cancelled = true; clearTimeout(watchdog); };
  }, [detectionSignature, detectionRetry, applyJurisdiction]);

  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );

  const statewideServices = useMemo(() => services.filter(s => s.scope === 'statewide'), [services]);
  const countyServices = useMemo(
    () => services.filter(s => s.scope !== 'statewide' && s.scope !== 'custom'),
    [services],
  );
  const customServices = useMemo(() => services.filter(s => s.scope === 'custom'), [services]);

  const setSelectedServiceId = useCallback((id: string) => {
    setSelectedServiceIdRaw(id);
    userPickedServiceRef.current = true;
    rememberServiceId(id);
  }, []);

  const addService = useCallback((def: ParcelGisServiceDef) => {
    saveCustomParcelService(def);
    setServices(getAllParcelServices());
    setSelectedServiceId(def.id);
    setCustomError(null);
    setCustomUrl('');
    setCustomLabel('');
    setShowCustomServer(false);
  }, []);

  const handleCheckCustomServer = useCallback(async () => {
    const url = customUrl.trim();
    if (!url || isProbing) return;
    setIsProbing(true);
    setCustomError(null);
    setCustomNotice(null);
    try {
      const probe = await describeParcelService(url, { label: customLabel });
      addService(probe.def);
      setCustomNotice(
        `✓ ${probe.layerName} · ${probe.def.parcelIdFields?.length ? probe.def.parcelIdFields.slice(0, 2).join(' / ') : 'no id field detected'} · added to your servers`,
      );
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProbing(false);
    }
  }, [addService, customLabel, customUrl, isProbing, setSelectedServiceId]);

  const currentQueryText = queryMode === 'description' ? descriptionText.trim() : undefined;
  const canQueryByProject = !!projectEpsg && projectPoints.length > 0;
  const canQuery = queryMode === 'inclusion'
    ? inclusionSegmentCount > 0
    : queryMode === 'project'
      ? canQueryByProject
      : (currentQueryText ?? '').length > 0;

  const handleDiscover = useCallback(async () => {
    if (!onSearchParcelServices || isDiscovering) return;
    setIsDiscovering(true);
    setDiscoverError(null);
    setDiscoveries([]);
    try {
      const found = await onSearchParcelServices(queryMode, currentQueryText);
      setDiscoveries(found);
      if (found.length === 0) {
        setDiscoverError('No parcel layers found for this area in ArcGIS Online. Try a nearby town name, or paste your county GIS server URL.');
      }
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDiscovering(false);
    }
  }, [currentQueryText, isDiscovering, onSearchParcelServices, queryMode]);

  const handleUseDiscovery = useCallback(async (candidate: ParcelServiceCandidate) => {
    setIsProbing(true);
    setCustomError(null);
    setCustomNotice(null);
    try {
      const probe = await describeParcelService(candidate.url, { label: candidate.title });
      addService(probe.def);
      setDiscoveries([]);
      setCustomNotice(`✓ ${probe.layerName} added — Fetch Parcels will use it.`);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProbing(false);
    }
  }, [addService, setSelectedServiceId]);

  const handleRemoveCustom = useCallback(() => {
    if (!selectedService || selectedService.scope !== 'custom') return;
    deleteCustomParcelService(selectedService.id);
    const next = getAllParcelServices();
    setServices(next);
    setSelectedServiceId(next[0]?.id ?? '');
    setCustomNotice(null);
  }, [selectedService, setSelectedServiceId]);

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
  
  const canFetch = !!selectedService && !isFetching && canQuery;

  const handleFetch = () => {
    if (!selectedService || !canFetch) return;
    onFetchParcels(selectedService, queryMode, currentQueryText);
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
      attributes: {},
    };
  }, [lastFetchedParcels]);

  // Filtered parcels list
  const filteredParcels = useMemo(() => {
    if (!parcelSearchFilter.trim()) return lastFetchedParcels;
    const q = parcelSearchFilter.trim().toLowerCase();
    return lastFetchedParcels.filter(p => {
      const metadataText = Object.values(p.attributes ?? {})
        .map(value => String(value ?? ''))
        .join(' ')
        .toLowerCase();
      return (
        (p.parcelId && p.parcelId.toLowerCase().includes(q)) ||
        (p.owner && p.owner.toLowerCase().includes(q)) ||
        (p.deedBook && p.deedBook.toLowerCase().includes(q)) ||
        (p.deedPage && p.deedPage.toLowerCase().includes(q)) ||
        metadataText.includes(q)
      );
    });
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
        "panel-dense w-full bg-[#0a0f16] border-0 text-[11px] leading-snug text-slate-200 select-none light-theme:bg-white light-theme:text-gray-800 flex flex-col overflow-hidden antialiased"
      ) : (
        `panel-dense fixed z-30 max-w-[calc(100vw-1rem)] bg-[#0a0f16]/97 border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 backdrop-blur-md text-[11px] leading-snug text-slate-200 select-none light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800 flex flex-col overflow-hidden antialiased transition-shadow ${
          isMinimized ? 'shadow-lg' : 'shadow-2xl'
        }`
      )}
    >
      {/* Header — drag handle with Welcome Screen styling */}
      <div
        className={`flex items-center justify-between gap-2 border-b border-white/[0.08] bg-[#070e18] px-3 py-1.5 ${
          isDocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        } light-theme:bg-gray-50 light-theme:border-gray-200 shrink-0 select-none ${
          isMinimized && !isDocked ? 'rounded-xl border-b-0' : ''
        }`}
        style={{ touchAction: isDocked ? 'auto' : 'none' }}
        onMouseDown={isDocked ? undefined : handlePointerDown}
        onTouchStart={isDocked ? undefined : handlePointerDown}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 shadow-sm light-theme:border-cyan-200 light-theme:bg-cyan-50">
            <GisAgentIcon className="h-3.5 w-3.5 text-cyan-300 light-theme:text-cyan-700" />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-xs font-semibold tracking-tight text-slate-100 light-theme:text-gray-900">
              <span>Boundary <span className="text-cyan-300">Agent</span></span>
              <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-cyan-200">
                GIS
              </span>
            </h2>
            <p className="truncate text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 light-theme:text-gray-500">
              County parcels → canvas
            </p>
          </div>
        </div>

        {/* Window controls: Dock/Pop-out, Minimize, Close */}
        <div className="flex items-center gap-1 shrink-0">
          {(onDockModeChange || onToggleDock) && (
            onDockModeChange ? (
              <DockModeControl mode={mode} onChange={onDockModeChange} />
            ) : (
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
            )
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

      {/* Multi-modal Tab Bar — grouped segmented control */}
      {!isMinimized && (
        <div className="flex shrink-0 items-center border-b border-white/[0.07] bg-black/20 px-2.5 py-1.5">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/20 p-0.5">
            <button
              type="button"
              aria-pressed={activeMode === 'query'}
              onClick={() => setActiveMode('query')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                activeMode === 'query'
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <CrosshairsIcon className="w-3.5 h-3.5" />
              <span>Query</span>
            </button>
            <button
              type="button"
              aria-pressed={activeMode === 'labels'}
              onClick={() => setActiveMode('labels')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                activeMode === 'labels'
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <PencilSquareIcon className="w-3.5 h-3.5" />
              <span>Labels</span>
            </button>
            <button
              type="button"
              aria-pressed={activeMode === 'parcels'}
              onClick={() => setActiveMode('parcels')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                activeMode === 'parcels'
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <LayersIcon className="w-3.5 h-3.5" />
              <span>Parcels</span>
              {lastFetchedParcels.length > 0 && (
                <span className="ml-0.5 rounded-full border border-emerald-500/40 bg-emerald-950 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-300">
                  {lastFetchedParcels.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area — split by active mode */}
      {!isMinimized && (
        <div className={`flex-1 overflow-y-auto px-2.5 py-2 space-y-2 ${isDocked ? 'max-h-[60vh]' : ''}`}>
          {/* ========================================================= */}
          {/* MODE 1: QUERY & FETCH                                     */}
          {/* ========================================================= */}
          {activeMode === 'query' && (
            <div className="space-y-2">
              <div className="panel-surface relative overflow-hidden rounded-lg border border-white/[0.08] bg-[#070e18]/80 py-2 pl-4 pr-2.5">
                <SectionChip color="query" />
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    🏛️ Public County GIS Tax Boundaries
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">ArcGIS REST</span>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed light-theme:text-gray-600">
                  Fetch live parcel polygons directly from county GIS servers into your canvas linework.
                </p>
              </div>

              {/* Project location — auto-detected from georeferenced points */}
              <div className="panel-surface relative overflow-hidden rounded-lg border border-cyan-700/40 bg-cyan-950/15 py-2 pl-4 pr-2.5 space-y-1">
                <SectionChip color="location" />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white flex items-center gap-1.5 min-w-0">
                    <span aria-hidden="true">📍</span>
                    <span className="truncate">{jurisdiction ? jurisdiction.label : 'Project Location'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDetectFromBrowser}
                    disabled={jurisdictionStatus === 'detecting'}
                    className="shrink-0 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 disabled:text-gray-500"
                    title="Use this device's location to pick the parcel layer"
                  >
                    Use my location
                  </button>
                </div>
                {jurisdictionStatus === 'detecting' && (
                  <p className="text-[11px] text-white/60 flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin" />
                    {jurisdiction?.state
                      ? 'Locating the county in ' + jurisdiction.state + '…'
                      : 'Locating the project from georeferenced points…'}
                  </p>
                )}
                {jurisdictionStatus === 'found' && jurisdiction && (
                  <p className="text-[11px] text-white/60 leading-relaxed light-theme:text-gray-600">
                    Auto-detected {jurisdiction.aoiSource === 'browser' ? 'from this device' : 'from the project coordinates'}.{' '}
                    {serviceMatch ? (
                      serviceMatch.service.id === selectedServiceId ? (
                        <>Using <span className="font-semibold text-cyan-200">{serviceMatch.service.label}</span>
                          {serviceMatch.match === 'statewide' ? ' (statewide fabric — no curated county layer)' : ''}.</>
                      ) : (
                        <>Suggested <span className="font-semibold text-cyan-200">{serviceMatch.service.label}</span> —{' '}
                          <button
                            type="button"
                            onClick={() => setSelectedServiceId(serviceMatch.service.id)}
                            className="font-semibold text-cyan-300 hover:text-cyan-200 underline"
                          >
                            use it
                          </button>
                        </>
                      )
                    ) : (
                      'No built-in parcel layer for this jurisdiction — use “Find layers here”.'
                    )}
                  </p>
                )}
                {jurisdictionStatus === 'error' && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-cyan-300 leading-relaxed">
                      {jurisdictionError ?? 'Could not resolve the project jurisdiction.'}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={retryDetection}
                        className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200"
                      >
                        Retry lookup
                      </button>
                      <span className="text-[10px] text-gray-500">or pick the GIS service manually</span>
                    </div>
                  </div>
                )}
                {jurisdictionStatus === 'idle' && (
                  <p className="text-[11px] text-gray-400 leading-relaxed light-theme:text-gray-500">
                    {projectPoints.length > 0 && !projectEpsg
                      ? 'Set the project EPSG in Settings to auto-detect the county from the loaded points.'
                      : 'Load georeferenced points to auto-detect the county, or use this device’s location.'}
                  </p>
                )}
              </div>

              {/* County / state / custom service picker */}
              <label className="panel-surface relative block overflow-hidden rounded-lg pl-3.5">
                <SectionChip color="service" />
                <span className="flex items-baseline justify-between text-xs font-semibold text-white/80 mb-1 light-theme:text-gray-700">
                  <span>Parcel GIS Service</span>
                  <span className="text-[10px] font-normal text-white/35">{services.length} available</span>
                </span>
                <select
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 focus:outline-none focus:border-sky-500 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-800"
                >
                  {statewideServices.length > 0 && (
                    <optgroup label="Statewide (all counties)">
                      {statewideServices.map(s => (
                        <option key={s.id} value={s.id}>{s.region}</option>
                      ))}
                    </optgroup>
                  )}
                  {countyServices.length > 0 && (
                    <optgroup label="Counties">
                      {countyServices.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {customServices.length > 0 && (
                    <optgroup label="Your servers">
                      {customServices.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {selectedService && (
                  <span className="text-[10px] text-white/35 mt-1 block truncate" title={selectedService.url}>
                    {selectedService.region} · {selectedService.url}
                  </span>
                )}
                {selectedService?.scope === 'custom' && (
                  <button
                    type="button"
                    onClick={handleRemoveCustom}
                    className="mt-1 text-[10px] font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Remove this server
                  </button>
                )}
              </label>

              {/* Nationwide helpers: discover near the AOI, or add any ArcGIS server */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDiscover}
                  disabled={!onSearchParcelServices || !canQuery || isDiscovering || isProbing}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    onSearchParcelServices && canQuery && !isDiscovering
                      ? 'bg-gray-800 border-cyan-700/70 text-cyan-300 hover:bg-gray-700 light-theme:bg-gray-100 light-theme:border-gray-300'
                      : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                  }`}
                  title="Search ArcGIS Online for parcel layers covering this area"
                >
                  {isDiscovering
                    ? <><div className="w-3 h-3 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin" /><span>Searching…</span></>
                    : <><span aria-hidden="true">🔎</span><span>Find layers here</span></>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomServer(v => !v); setCustomError(null); }}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 transition-all flex items-center justify-center gap-1.5 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-700"
                  title="Use your own county / consultant ArcGIS REST layer"
                >
                  <span aria-hidden="true">＋</span>
                  <span>Add server URL</span>
                </button>
              </div>

              {showCustomServer && (
                <div className="panel-surface relative overflow-hidden rounded-lg border border-sky-500/30 bg-sky-950/10 py-2 pl-4 pr-2.5 space-y-2">
                  <SectionChip color="custom" />
                  <p className="text-[11px] text-white/60 leading-relaxed light-theme:text-gray-600">
                    Paste the county's ArcGIS REST layer URL (usually ends in{' '}
                    <span className="font-mono text-sky-300">/FeatureServer/0</span>). A service root also works — we
                    probe it and pick the parcel polygon layer. It is saved on this device.
                  </p>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    placeholder="https://gis.examplecounty.gov/arcgis/rest/services/Parcels/FeatureServer/0"
                    className="w-full px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-[11px] font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500"
                    onKeyDown={e => { if (e.key === 'Enter') handleCheckCustomServer(); }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                      placeholder="Label (optional) — e.g. York County, PA"
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={handleCheckCustomServer}
                      disabled={!customUrl.trim() || isProbing}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                        customUrl.trim() && !isProbing
                          ? 'bg-sky-600 border-sky-400 text-white hover:bg-sky-500'
                          : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {isProbing && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {isProbing ? 'Checking…' : 'Test & add'}
                    </button>
                  </div>
                </div>
              )}

              {customError && (
                <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-md p-2">
                  {customError}
                </div>
              )}
              {customNotice && (
                <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-md p-2">
                  {customNotice}
                </div>
              )}
              {discoverError && (
                <div className="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 rounded-md p-2">
                  {discoverError}
                </div>
              )}

              {discoveries.length > 0 && (
                <div className="panel-surface relative overflow-hidden rounded-lg border border-cyan-700/40 bg-gray-950/60 py-2 pl-4 pr-2 space-y-1.5">
                  <SectionChip color="discovery" />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-300">{discoveries.length} parcel layers near this area</span>
                    <button type="button" onClick={() => setDiscoveries([])} className="text-[10px] text-gray-500 hover:text-gray-300">Dismiss</button>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {discoveries.map(c => (
                      <div key={c.itemId || c.url} className="flex items-start gap-2 rounded-md bg-gray-900/70 border border-gray-800 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold text-white/90 truncate" title={c.title}>{c.title}</div>
                          <div className="text-[10px] text-white/40 truncate" title={c.url}>{c.publisher || 'unknown publisher'} · {c.url}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUseDiscovery(c)}
                          disabled={isProbing}
                          className="shrink-0 px-2 py-1 rounded text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-gray-700 disabled:text-gray-500"
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query Area Mode Selector */}
              <div className="panel-surface relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015] p-2 pl-3.5">
                <SectionChip color="area" />
                <span className="text-xs font-semibold text-white/80 mb-1.5 block light-theme:text-gray-700">
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
                    onClick={() => setQueryMode('project')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      queryMode === 'project'
                        ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 light-theme:bg-gray-100 light-theme:border-gray-300 light-theme:text-gray-700'
                    }`}
                  >
                    Project Points{projectPoints.length > 0 ? ` (${projectPoints.length})` : ''}
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
                  <div className="text-xs text-emerald-300/90 bg-emerald-950/40 border border-emerald-800/50 rounded-md p-2 flex items-center justify-between">
                    <span>Inclusion area defined ({inclusionSegmentCount} segments). Ready to query.</span>
                  </div>
                ) : (
                  <div className="text-xs text-cyan-300/90 bg-cyan-950/40 border border-cyan-800/50 rounded-md p-2">
                    Draw an inclusion polygon on the canvas first (Drawing Tools → Inclusion).
                  </div>
                )
              )}

              {/* Project-points status hint */}
              {queryMode === 'project' && (
                <div className={`text-xs rounded-md p-2 border ${
                  canQueryByProject
                    ? 'text-emerald-300/90 bg-emerald-950/40 border-emerald-800/50'
                    : 'text-cyan-300/90 bg-cyan-950/40 border-cyan-800/50'
                }`}>
                  {canQueryByProject
                    ? `Project extent from ${projectPoints.length} georeferenced point${projectPoints.length === 1 ? '' : 's'} — no inclusion polygon or address needed.`
                    : projectPoints.length === 0
                      ? 'Load georeferenced points first, or draw an inclusion polygon.'
                      : 'Set the project EPSG in Settings so point coordinates can be georeferenced.'}
                </div>
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
                      ? 'bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/50'
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
                      <GisAgentIcon className="w-4 h-4 text-white" />
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

              {/* Owner / deed enrichment source (second-layer lookup) */}
              {lastEnrichment && lastEnrichment.enriched > 0 && (
                <div className="rounded-md border border-cyan-800/60 bg-cyan-950/25 px-2.5 py-1.5 text-[10px] leading-relaxed text-cyan-200">
                  ✍️ Owner / deed data for{' '}
                  <span className="font-bold">{lastEnrichment.enriched} parcel{lastEnrichment.enriched === 1 ? '' : 's'}</span>{' '}
                  came from{' '}
                  <span className="font-semibold">{lastEnrichment.sourceName ?? 'the county attribute layer'}</span>
                  {lastEnrichment.auto ? ' (auto-detected)' : ''}.
                </div>
              )}

              {/* Quick Status Bar */}
              <div className="relative border-t border-gray-800/80 pt-1.5 pl-2.5 flex items-center justify-between text-xs text-gray-400">
                <SectionChip color="status" />
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
            <div className="space-y-2">
              <div className="panel-surface relative overflow-hidden rounded-lg border border-teal-500/30 bg-teal-950/20 py-2 pl-4 pr-2.5">
                <SectionChip color="labels" />
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    🏷️ Parcel Typography &amp; Formatting
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Canvas + DXF</span>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed light-theme:text-gray-600">
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
              <div className="panel-surface relative overflow-hidden rounded-lg border border-gray-800 bg-gray-950/40 p-2 pl-3.5 space-y-2">
                <SectionChip color="fields" />
                <span className="text-xs font-bold text-white/85 uppercase tracking-wider block">
                  Label Content Fields
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeParcelId}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeParcelId: e.target.checked })}
                      className="rounded border-gray-700 text-sky-500 focus:ring-0"
                    />
                    <span>Parcel ID</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeOwner}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeOwner: e.target.checked })}
                      className="rounded border-gray-700 text-sky-500 focus:ring-0"
                    />
                    <span>Owner Name</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeDeedBookPage}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeDeedBookPage: e.target.checked })}
                      className="rounded border-gray-700 text-sky-500 focus:ring-0"
                    />
                    <span>Deed Book/Page</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parcelLabelFormatter.includeBlockUnit}
                      onChange={e => onParcelLabelFormatterChange({ ...parcelLabelFormatter, includeBlockUnit: e.target.checked })}
                      className="rounded border-gray-700 text-sky-500 focus:ring-0"
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
                      className="rounded border-gray-700 text-sky-500 focus:ring-0"
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
              <div className="panel-surface relative overflow-hidden rounded-lg border border-gray-800 bg-gray-950/40 p-2 pl-3.5 space-y-2">
                <SectionChip color="typography" />
                <span className="text-xs font-bold text-white/85 uppercase tracking-wider block">
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
                  className="w-full accent-sky-500"
                />
              </div>

              {/* Live Preview Box */}
              <div className="panel-surface relative overflow-hidden rounded-lg border border-gray-700/80 bg-gray-950 p-2 pl-3.5">
                <SectionChip color="preview" />
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-white/85 font-bold">
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
                      <div key={idx} className={idx === 0 ? 'text-sky-300 font-semibold' : 'text-gray-300 text-[11px]'}>
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
            <div className="space-y-2">
              {lastFetchedParcels.length === 0 ? (
                <div className="relative overflow-hidden p-5 text-center space-y-2.5 rounded-lg border border-dashed border-gray-800 bg-gray-950/30">
                  <SectionChip color="parcels" />
                  <div className="inline-flex items-center justify-center p-2 rounded-full bg-emerald-950/30 text-emerald-400 border border-emerald-500/20">
                    <LayersIcon className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white/90">No Parcels Fetched Yet</h4>
                  <p className="text-xs text-white/50 max-w-xs mx-auto">
                    Fetch county tax parcels from the Query tab by selecting a county and defining an area.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveMode('query')}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                  >
                    Go to Query Tab →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white/80">
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
                      placeholder="Filter by ID, owner, book/page, or any metadata…"
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
                  <ul className="relative divide-y divide-gray-800/80 overflow-hidden rounded-lg border border-gray-800 bg-gray-950/50 pl-2.5 max-h-72 overflow-y-auto">
                    <SectionChip color="parcels" />
                    {filteredParcels.slice(0, 100).map((p, i) => (
                      <li key={`${p.parcelId ?? 'parcel'}-${i}`} className="p-2 hover:bg-gray-900/60 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-sky-300 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-500/20 truncate">
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
                        {(() => {
                          const entries = metadataEntries(p.attributes);
                          if (entries.length === 0) return null;
                          return (
                            <details className="mt-1.5 border-t border-gray-800/70 pt-1">
                              <summary className="cursor-pointer text-[10px] font-medium text-cyan-400/90 hover:text-cyan-300">
                                All metadata · {entries.length} fields
                              </summary>
                              <dl className="mt-1 space-y-0.5">
                                {entries.map(entry => (
                                  <div key={entry.key} className="grid grid-cols-[minmax(5.5rem,0.75fr),1fr] gap-2">
                                    <dt className="truncate text-[10px] text-gray-500" title={entry.key}>{entry.label}</dt>
                                    <dd className="break-words text-right font-mono text-[10px] text-gray-300" title={entry.value}>
                                      {entry.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          );
                        })()}
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

