import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from 'react';
import { 
  PointList, 
  SurveyLine, 
  ContourLabel, 
  ProfilePoint, 
  ProfileInfo, 
  Centerline, 
  WmsService, 
  ActiveWmsLayer, 
  OfflineMapArea, 
  CustomSymbol, 
  AnnotationRule,
  ClosureReport,
  SteepSlopeRunResult,
  CutSheetRow,
  CutSheetInfo,
  SurveyPoint,
  PdfHighlight,
  ContourSettings
} from '../types.ts';
import { CanvasHistoryProvider, useCanvasHistory } from './CanvasHistoryContext.tsx';

// Default symbol
const defaultSymbol: CustomSymbol = {
  id: 'default-point',
  name: 'Default Point',
  description: 'A simple X, like x-marks-the-spot, used for points without a specific symbol.',
  associatedTerms: [],
  svgPath: 'M 2.5 2.5 L 21.5 21.5 M 21.5 2.5 L 2.5 21.5',
  viewBox: '0 0 24 24',
  scale: 1,
  isDefault: true,
};

interface CanvasState {
  // Point & Line Data
  pointLists: PointList[];
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>;
  lines: SurveyLine[];
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  contourLabels: ContourLabel[];
  setContourLabels: React.Dispatch<React.SetStateAction<ContourLabel[]>>;
  profileData: ProfilePoint[];
  setProfileData: React.Dispatch<React.SetStateAction<ProfilePoint[]>>;
  profileInfo: ProfileInfo | null;
  setProfileInfo: React.Dispatch<React.SetStateAction<ProfileInfo | null>>;
  centerlines: Centerline[];
  setCenterlines: React.Dispatch<React.SetStateAction<Centerline[]>>;
  
  // Undo/Redo — backed by the history engine (utils/historyEngine.ts).
  // Capture is automatic; every tracked change is undoable without the caller
  // doing anything.
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /**
   * Optional label hint for the change about to be made. Retained for backward
   * compatibility with existing call sites; capture no longer depends on it.
   */
  pushHistory: (label?: string) => void;
  
  // Visibility Toggles
  linesVisible: boolean;
  setLinesVisible: React.Dispatch<React.SetStateAction<boolean>>;
  centerlinesVisible: boolean;
  setCenterlinesVisible: React.Dispatch<React.SetStateAction<boolean>>;

  /** Per-CAD-layer visibility. Missing entry = visible. false = hidden. */
  cadLayerVisibility: Record<string, boolean>;
  setCadLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** Per-CAD-layer canvas color override (hex string). */
  cadLayerColors: Record<string, string>;
  setCadLayerColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  
  // Derived Data (computed)
  points: SurveyPoint[];
  pointMap: Map<string, SurveyPoint>;  // Fast O(1) lookup by point number
  visibleLines: SurveyLine[];
  visibleCenterlines: Centerline[];
  
  // Map & WMS
  wmsServices: WmsService[];
  setWmsServices: React.Dispatch<React.SetStateAction<WmsService[]>>;
  activeWmsLayers: ActiveWmsLayer[];
  setActiveWmsLayers: React.Dispatch<React.SetStateAction<ActiveWmsLayer[]>>;
  offlineMapAreas: OfflineMapArea[];
  setOfflineMapAreas: React.Dispatch<React.SetStateAction<OfflineMapArea[]>>;
  
  // Symbols & Reports
  customSymbols: CustomSymbol[];
  setCustomSymbols: React.Dispatch<React.SetStateAction<CustomSymbol[]>>;
  customAnnotations: AnnotationRule[];
  setCustomAnnotations: React.Dispatch<React.SetStateAction<AnnotationRule[]>>;
  closureReports: ClosureReport[];
  setClosureReports: React.Dispatch<React.SetStateAction<ClosureReport[]>>;
  steepSlopeRuns: SteepSlopeRunResult[];
  setSteepSlopeRuns: React.Dispatch<React.SetStateAction<SteepSlopeRunResult[]>>;
  
  // Cut Sheet
  cutSheetData: CutSheetRow[];
  setCutSheetData: React.Dispatch<React.SetStateAction<CutSheetRow[]>>;
  cutSheetInfo: CutSheetInfo;
  setCutSheetInfo: React.Dispatch<React.SetStateAction<CutSheetInfo>>;
  
  // Canvas Display Settings
  attributeScale: number;
  setAttributeScale: React.Dispatch<React.SetStateAction<number>>;
  lineLabelScale: number;
  setLineLabelScale: React.Dispatch<React.SetStateAction<number>>;
  dimensionScale: number;
  setDimensionScale: React.Dispatch<React.SetStateAction<number>>;
  symbolScale: number;
  setSymbolScale: React.Dispatch<React.SetStateAction<number>>;
  annotationScale: number;
  setAnnotationScale: React.Dispatch<React.SetStateAction<number>>;
  lineThickness: number;
  setLineThickness: React.Dispatch<React.SetStateAction<number>>;
  isLayerPanelOpen: boolean;
  setIsLayerPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  zoomTarget: SurveyPoint | null;
  setZoomTarget: React.Dispatch<React.SetStateAction<SurveyPoint | null>>;
  /** Point numbers pending a confirmed deletion — rendered as pulsing rings. */
  pendingPointDeletes: Set<string>;
  setPendingPointDeletes: React.Dispatch<React.SetStateAction<Set<string>>>;
  pointLayers: {
    pointNumber: { visible: boolean; color: string };
    description: { visible: boolean; color: string };
    elevation: { visible: boolean; color: string };
  };
  setPointLayers: React.Dispatch<React.SetStateAction<{
    pointNumber: { visible: boolean; color: string };
    description: { visible: boolean; color: string };
    elevation: { visible: boolean; color: string };
  }>>;
  
  // PDF Highlights
  highlights: PdfHighlight[];
  setHighlights: React.Dispatch<React.SetStateAction<PdfHighlight[]>>;
  zoomTargetHighlightId: string | null;
  setZoomTargetHighlightId: React.Dispatch<React.SetStateAction<string | null>>;
  addHighlights: (newHighlights: PdfHighlight[]) => void;
  clearHighlights: () => void;
  goToHighlight: (highlightId: string | null) => void;
  
  // Contour Settings
  contourSettings: ContourSettings;
  setContourSettings: React.Dispatch<React.SetStateAction<ContourSettings>>;
  isGeneratingContours: boolean;
  setIsGeneratingContours: React.Dispatch<React.SetStateAction<boolean>>;
  
  // GPS/Geolocation
  currentPosition: GeolocationPosition | null;
  setCurrentPosition: React.Dispatch<React.SetStateAction<GeolocationPosition | null>>;
  geolocationError: string | null;
  setGeolocationError: React.Dispatch<React.SetStateAction<string | null>>;
  stakeoutTargetPointNumber: string;
  setStakeoutTargetPointNumber: React.Dispatch<React.SetStateAction<string>>;
  
  // Misc
  suggestedQuestions: string[];
  setSuggestedQuestions: React.Dispatch<React.SetStateAction<string[]>>;
  nextAvailablePointNumber: string;
  setNextAvailablePointNumber: React.Dispatch<React.SetStateAction<string>>;
  
  // Orientation Tuple (OT / UCS)
  orientationTuple: {
    angle: number;
    originX: number;
    originY: number;
    mode?: 'drafting' | 'view';
    draftingAngle?: number;
    draftingOriginX?: number;
    draftingOriginY?: number;
    viewAngle?: number;
    viewOriginX?: number;
    viewOriginY?: number;
    placed?: boolean;
  };
  setOrientationTuple: React.Dispatch<React.SetStateAction<{
    angle: number;
    originX: number;
    originY: number;
    mode?: 'drafting' | 'view';
    draftingAngle?: number;
    draftingOriginX?: number;
    draftingOriginY?: number;
    viewAngle?: number;
    viewOriginX?: number;
    viewOriginY?: number;
    placed?: boolean;
  }>>;
}

const CanvasStateContext = createContext<CanvasState | undefined>(undefined);

export function CanvasStateProvider({ children, defaultCutSheetInfo }: { children: ReactNode; defaultCutSheetInfo?: { companyName: string; crewChief: string } }) {
  // Point & Line Data
  const [pointLists, setPointLists] = useState<PointList[]>([{ id: 'working', name: 'Unsaved Points', points: [], isVisible: true }]);
  const [lines, setLines] = useState<SurveyLine[]>([]);
  const [contourLabels, setContourLabels] = useState<ContourLabel[]>([]);
  const [profileData, setProfileData] = useState<ProfilePoint[]>([]);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [centerlines, setCenterlines] = useState<Centerline[]>([]);
  
  // Undo/Redo is provided by the history engine (utils/historyEngine.ts) via
  // CanvasHistoryProvider, which observes the tracked slices below and captures
  // every change automatically. See CanvasStateBridge at the bottom of this file
  // for how the engine's controls are merged onto this context.
  const historyTracked = useMemo(() => ({
    pointLists,
    lines,
    centerlines,
    contourLabels,
  }), [pointLists, lines, centerlines, contourLabels]);

  const historySetters = useMemo(() => ({
    pointLists: setPointLists as (v: never) => void,
    lines: setLines as (v: never) => void,
    centerlines: setCenterlines as (v: never) => void,
    contourLabels: setContourLabels as (v: never) => void,
  }), []);
  
  // Visibility Toggles
  const [linesVisible, setLinesVisible] = useState(true);
  const [centerlinesVisible, setCenterlinesVisible] = useState(true);
  const [cadLayerVisibility, setCadLayerVisibility] = useState<Record<string, boolean>>({});
  const [cadLayerColors, setCadLayerColors] = useState<Record<string, string>>({});
  
  // Derived Data (memoized for performance)
  const points = useMemo(() => 
    pointLists
      .filter(list => list.isVisible)
      .flatMap(list => list.points)
      .filter(p => !p.hidden && (!p.layer || cadLayerVisibility[p.layer] !== false)),
    [pointLists, cadLayerVisibility]
  );
  // Fast O(1) point lookup by point number - used for lightning-fast line drawing
  const pointMap = useMemo(() => new Map(points.map(p => [p.pointNumber, p])), [points]);
  const visibleLines = useMemo(() => {
    if (!linesVisible) return [];
    return lines.filter(l => !l.hidden && (!l.layer || cadLayerVisibility[l.layer] !== false));
  }, [lines, linesVisible, cadLayerVisibility]);
  const visibleCenterlines = useMemo(() => centerlinesVisible ? centerlines : [], [centerlines, centerlinesVisible]);
  
  // Map & WMS
  const [wmsServices, setWmsServices] = useState<WmsService[]>([]);
  const [activeWmsLayers, setActiveWmsLayers] = useState<ActiveWmsLayer[]>([]);
  const [offlineMapAreas, setOfflineMapAreas] = useState<OfflineMapArea[]>([]);
  
  // Symbols & Reports
  const [customSymbols, setCustomSymbols] = useState<CustomSymbol[]>([defaultSymbol]);
  const [customAnnotations, setCustomAnnotations] = useState<AnnotationRule[]>([]);
  const [closureReports, setClosureReports] = useState<ClosureReport[]>([]);
  const [steepSlopeRuns, setSteepSlopeRuns] = useState<SteepSlopeRunResult[]>([]);
  
  // Cut Sheet
  const [cutSheetData, setCutSheetData] = useState<CutSheetRow[]>([]);
  const [cutSheetInfo, setCutSheetInfo] = useState<CutSheetInfo>({
    projectName: 'Project Name',
    projectNumber: 'Project No.',
    date: new Date().toLocaleDateString(),
    ...(defaultCutSheetInfo || { companyName: 'Your Company', crewChief: 'Crew Chief' }),
  });
  
  // Canvas Display Settings
  const [attributeScale, setAttributeScale] = useState(1);
  const [lineLabelScale, setLineLabelScale] = useState(1);
  const [dimensionScale, setDimensionScale] = useState(1);
  const [symbolScale, setSymbolScale] = useState(1);
  const [annotationScale, setAnnotationScale] = useState(1);
  const [lineThickness, setLineThickness] = useState(1);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [zoomTarget, setZoomTarget] = useState<SurveyPoint | null>(null);
  // Points queued for a confirmed removal — pulsing red rings on canvas.
  const [pendingPointDeletes, setPendingPointDeletes] = useState<Set<string>>(new Set());
  const [pointLayers, setPointLayers] = useState({
    pointNumber: { visible: true, color: '#00FFFF' },
    description: { visible: true, color: '#FF00FF' },
    elevation: { visible: true, color: '#00FF00' },
  });
  
  // PDF Highlights
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [zoomTargetHighlightId, setZoomTargetHighlightId] = useState<string | null>(null);
  
  const addHighlights = useCallback((newHighlights: PdfHighlight[]) => {
    setHighlights(prev => [...prev, ...newHighlights]);
  }, []);
  
  const clearHighlights = useCallback(() => {
    setHighlights([]);
  }, []);
  
  const goToHighlight = useCallback((highlightId: string | null) => {
    setZoomTargetHighlightId(highlightId);
  }, []);
  
  // Contour Settings
  const [contourSettings, setContourSettings] = useState<ContourSettings>({
    contourInterval: 1,
    majorInterval: 5,
    smoothing: 0,
    pointFilterDescription: '',
    showLabels: true,
    labelDensity: 0.5,
    labelScale: 1.0,
    sourceType: 'points',
    sourceTinId: null,
  });
  const [isGeneratingContours, setIsGeneratingContours] = useState(false);
  
  // GPS/Geolocation
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [stakeoutTargetPointNumber, setStakeoutTargetPointNumber] = useState<string>('');
  
  // Misc
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [nextAvailablePointNumber, setNextAvailablePointNumber] = useState<string>('1');

  // Orientation Tuple (OT / UCS) state
  const [orientationTuple, setOrientationTuple] = useState<{
    angle: number;
    originX: number;
    originY: number;
    mode?: 'drafting' | 'view';
    draftingAngle?: number;
    draftingOriginX?: number;
    draftingOriginY?: number;
    viewAngle?: number;
    viewOriginX?: number;
    viewOriginY?: number;
  }>({
    angle: 0,
    originX: 0,
    originY: 0,
    mode: 'drafting',
    draftingAngle: 0,
    draftingOriginX: 0,
    draftingOriginY: 0,
    viewAngle: 0,
    viewOriginX: 0,
    viewOriginY: 0,
  });

  const baseValue: Omit<CanvasState, 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'pushHistory'> = {
    // Point & Line Data
    pointLists,
    setPointLists,
    lines,
    setLines,
    contourLabels,
    setContourLabels,
    profileData,
    setProfileData,
    profileInfo,
    setProfileInfo,
    centerlines,
    setCenterlines,
    
    // Visibility Toggles
    linesVisible,
    setLinesVisible,
    centerlinesVisible,
    setCenterlinesVisible,
    cadLayerVisibility,
    setCadLayerVisibility,
    cadLayerColors,
    setCadLayerColors,
    
    // Derived Data
    points,
    pointMap,  // Fast O(1) lookup by point number
    visibleLines,
    visibleCenterlines,
    
    // Map & WMS
    wmsServices,
    setWmsServices,
    activeWmsLayers,
    setActiveWmsLayers,
    offlineMapAreas,
    setOfflineMapAreas,
    
    // Symbols & Reports
    customSymbols,
    setCustomSymbols,
    customAnnotations,
    setCustomAnnotations,
    closureReports,
    steepSlopeRuns,
    setSteepSlopeRuns,
    setClosureReports,
    
    // Cut Sheet
    cutSheetData,
    setCutSheetData,
    cutSheetInfo,
    setCutSheetInfo,
    
    // Canvas Display Settings
    attributeScale,
    setAttributeScale,
    lineLabelScale,
    setLineLabelScale,
    dimensionScale,
    symbolScale,
    setSymbolScale,
    annotationScale,
    setAnnotationScale,
    setDimensionScale,
    lineThickness,
    setLineThickness,
    isLayerPanelOpen,
    setIsLayerPanelOpen,
    zoomTarget,
    setZoomTarget,
    pendingPointDeletes,
    setPendingPointDeletes,
    pointLayers,
    setPointLayers,
    
    // PDF Highlights
    highlights,
    setHighlights,
    zoomTargetHighlightId,
    setZoomTargetHighlightId,
    addHighlights,
    clearHighlights,
    goToHighlight,
    
    // Contour Settings
    contourSettings,
    setContourSettings,
    isGeneratingContours,
    setIsGeneratingContours,
    
    // GPS/Geolocation
    currentPosition,
    setCurrentPosition,
    geolocationError,
    setGeolocationError,
    stakeoutTargetPointNumber,
    setStakeoutTargetPointNumber,
    
    // Misc
    suggestedQuestions,
    setSuggestedQuestions,
    nextAvailablePointNumber,
    setNextAvailablePointNumber,
    orientationTuple,
    setOrientationTuple,
  };

  return (
    <CanvasHistoryProvider tracked={historyTracked} setters={historySetters}>
      <CanvasStateBridge baseValue={baseValue}>
        {children}
      </CanvasStateBridge>
    </CanvasHistoryProvider>
  );
}

/**
 * Merges the history engine's controls onto the canvas state context.
 *
 * The undo/redo surface (canUndo, canRedo, undo, redo, pushHistory) is
 * unchanged from the previous implementation so existing consumers keep working,
 * but it is now backed by the engine. `pushHistory` no longer performs the
 * capture — capture is automatic — so it is reinterpreted as an optional label
 * hint for the change that is about to happen.
 */
function CanvasStateBridge({
  baseValue,
  children,
}: {
  baseValue: Omit<CanvasState, 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'pushHistory'>;
  children: ReactNode;
}) {
  const history = useCanvasHistory();

  const pushHistory = useCallback((label?: string) => {
    history.hintNextLabel(label);
  }, [history]);

  const value = useMemo<CanvasState>(() => ({
    ...baseValue,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,
    pushHistory,
  }), [baseValue, history, pushHistory]);

  return <CanvasStateContext.Provider value={value}>{children}</CanvasStateContext.Provider>;
}

export function useCanvasState() {
  const context = useContext(CanvasStateContext);
  if (context === undefined) {
    throw new Error('useCanvasState must be used within a CanvasStateProvider');
  }
  return context;
}
