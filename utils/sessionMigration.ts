// utils/sessionMigration.ts
// Pure utility functions for session management - NO STATE, NO HOOKS, NO DEPENDENCIES

import {
  AgentType,
  type ChatMessage,
  MessageRole,
  type SessionState,
  type Settings,
  type VisualPanel,
  DEFAULT_PARCEL_LABEL_FORMATTER,
} from '../types';

type LegacyPointLayerFlags = {
  pointNumber?: boolean;
  description?: boolean;
  elevation?: boolean;
};

type LegacyUiState = Partial<SessionState['uiState']> & {
  isCanvasVisible?: boolean;
  isCutSheetVisible?: boolean;
  isFieldbookVisible?: boolean;
  isPdfViewerVisible?: boolean;
  isTextEditorVisible?: boolean;
  isGpsStakeoutVisible?: boolean;
  isFileManagerVisible?: boolean;
  isImageAnalyzerVisible?: boolean;
  isWmsPanelVisible?: boolean;
  pointLayers?: SessionState['uiState']['pointLayers'] | LegacyPointLayerFlags;
};

const hasLegacyUiFlags = (uiState: LegacyUiState): boolean => {
  return Boolean(
    uiState.isCanvasVisible
    || uiState.isCutSheetVisible
    || uiState.isFieldbookVisible
    || uiState.isPdfViewerVisible
    || uiState.isTextEditorVisible
    || uiState.isGpsStakeoutVisible
    || uiState.isFileManagerVisible
    || uiState.isImageAnalyzerVisible
    || uiState.isWmsPanelVisible
  );
};

const DEFAULT_POINT_LAYERS: SessionState['uiState']['pointLayers'] = {
  pointNumber: { visible: true, color: '#00FFFF' },
  description: { visible: true, color: '#FF00FF' },
  elevation: { visible: true, color: '#00FF00' },
};

const DEFAULT_CUT_SHEET_INFO: SessionState['cutSheetInfo'] = {
  projectName: '',
  projectNumber: '',
  date: '',
  companyName: '',
  crewChief: '',
};

const resolveLegacyVisualPanel = (uiState: LegacyUiState): VisualPanel => {
  if (uiState.activeVisualPanel) return uiState.activeVisualPanel;

  if (uiState.isCutSheetVisible) return 'cutsheet';
  if (uiState.isFieldbookVisible) return 'fieldbook';
  if (uiState.isPdfViewerVisible) return 'pdfviewer';
  if (uiState.isTextEditorVisible) return 'texteditor';
  if (uiState.isGpsStakeoutVisible) return 'gpsstakeout';
  if (uiState.isFileManagerVisible) return 'filemanager';
  if (uiState.isImageAnalyzerVisible) return 'imageanalyzer';
  if (uiState.isWmsPanelVisible) return 'wms';

  return 'canvas';
};

const normalizePointLayers = (
  pointLayers: LegacyUiState['pointLayers'] | undefined
): SessionState['uiState']['pointLayers'] => {
  if (!pointLayers) return DEFAULT_POINT_LAYERS;

  if (typeof (pointLayers as LegacyPointLayerFlags).pointNumber === 'boolean') {
    const oldLayers = pointLayers as LegacyPointLayerFlags;
    return {
      pointNumber: { visible: oldLayers.pointNumber ?? true, color: '#00FFFF' },
      description: { visible: oldLayers.description ?? true, color: '#FF00FF' },
      elevation: { visible: oldLayers.elevation ?? true, color: '#00FF00' },
    };
  }

  return pointLayers as SessionState['uiState']['pointLayers'];
};

/**
 * Returns user-facing notes describing which legacy compatibility transforms
 * were applied while normalizing a loaded session.
 */
export const getSessionNormalizationWarnings = (rawSession: Partial<SessionState>): string[] => {
  const warnings: string[] = [];
  const rawUiState = (rawSession.uiState || {}) as LegacyUiState;

  if (!rawSession.uiState) {
    warnings.push('Missing UI state was reconstructed using defaults.');
  }

  if (!rawSession.pointLists && (rawSession as any).points) {
    warnings.push('Legacy points were migrated into point lists.');
  }

  if (!rawUiState.activeVisualPanel && hasLegacyUiFlags(rawUiState)) {
    warnings.push('Legacy panel visibility flags were mapped to the modern visual-panel layout.');
  }

  if (rawUiState.pointLayers && typeof (rawUiState.pointLayers as LegacyPointLayerFlags).pointNumber === 'boolean') {
    warnings.push('Legacy point-layer visibility format was upgraded to include per-layer colors.');
  }

  return warnings;
};

/**
 * Best-effort manifest normalizer for legacy .lsvz files.
 * Required fields are defaulted so loading can proceed even when older
 * manifests are missing newer shape requirements.
 */
export const normalizeLoadedSession = (rawSession: Partial<SessionState>): SessionState => {
  const rawUiState = (rawSession.uiState || {}) as LegacyUiState;
  const resolvedPanel = resolveLegacyVisualPanel(rawUiState);
  const pointLists = rawSession.pointLists
    || ((rawSession as any).points
      ? [{ id: 'working', name: 'Loaded Points', points: (rawSession as any).points, isVisible: true }]
      : [{ id: 'working', name: 'Unsaved Points', points: [], isVisible: true }]);

  const baseScale = rawUiState.attributeScale ?? 1;
  const mergedUiState: SessionState['uiState'] = {
    activeAgent: rawUiState.activeAgent || AgentType.LSVZ_AGENT,
    activeModel: rawUiState.activeModel || 'gemini-3.7-flash',
    activeVisualPanel: resolvedPanel,
    isPdfViewerFullscreen: rawUiState.isPdfViewerFullscreen ?? false,
    isVisualPanelFullscreen: rawUiState.isVisualPanelFullscreen ?? false,
    isPointEditorFullscreen: rawUiState.isPointEditorFullscreen ?? false,
    isChatPanelVisible: rawUiState.isChatPanelVisible ?? true,
    attributeScale: baseScale,
    lineLabelScale: rawUiState.lineLabelScale ?? baseScale,
    dimensionScale: rawUiState.dimensionScale ?? 1,
    symbolScale: rawUiState.symbolScale ?? 1,
    pointLayers: normalizePointLayers(rawUiState.pointLayers),
    activeTextEditorFile: rawUiState.activeTextEditorFile || null,
    linesVisible: rawUiState.linesVisible ?? true,
    centerlinesVisible: rawUiState.centerlinesVisible ?? true,
    activeBoundaryFileId: rawUiState.activeBoundaryFileId,
    showRotatedBearings: rawUiState.showRotatedBearings,
    parcelLabelFormatter: {
      ...DEFAULT_PARCEL_LABEL_FORMATTER,
      ...(rawUiState.parcelLabelFormatter || {}),
    },
    canvasTransform: rawUiState.canvasTransform,
  };

  return {
    version: rawSession.version || 'legacy',
    savedAt: rawSession.savedAt || new Date().toISOString(),
    sessionMetadata: rawSession.sessionMetadata,
    settings: (rawSession.settings || {}) as Settings,
    rawFile: rawSession.rawFile || null,
    deedFile: rawSession.deedFile || null,
    planFiles: rawSession.planFiles || null,
    dxfFile: rawSession.dxfFile || null,
    clFile: rawSession.clFile || null,
    imageFiles: rawSession.imageFiles || null,
    gisFile: rawSession.gisFile || null,
    generatedFiles: rawSession.generatedFiles || [],
    pdfViewerFiles: rawSession.pdfViewerFiles || rawSession.planFiles || null,
    pdfHighlights: rawSession.pdfHighlights || [],
    customSymbols: rawSession.customSymbols || [],
    customAnnotations: rawSession.customAnnotations || [],
    annotationScale: rawSession.annotationScale,
    closureReports: rawSession.closureReports || [],
    boundaryFiles: rawSession.boundaryFiles || [],
    deedBatchJob: rawSession.deedBatchJob,
    dimensions: rawSession.dimensions || [],
    tinSurfaces: rawSession.tinSurfaces || [],
    contourGenerations: rawSession.contourGenerations,
    steepSlopeRuns: rawSession.steepSlopeRuns,
    streetLabels: rawSession.streetLabels,
    parcelLabels: rawSession.parcelLabels,
    annotationCategories: rawSession.annotationCategories,
    inclusionBoundaries: rawSession.inclusionBoundaries || [],
    activeInclusionBoundaryId: rawSession.activeInclusionBoundaryId ?? null,
    floodFirmette: rawSession.floodFirmette ?? null,
    jobInfo: rawSession.jobInfo || { jobName: 'Project Name', jobNo: 'Project No.' },
    rawChatHistory: rawSession.rawChatHistory || [],
    deedChatHistory: rawSession.deedChatHistory || [],
    civilDrafterChatHistory: rawSession.civilDrafterChatHistory || [],
    dxfChatHistory: rawSession.dxfChatHistory || [],
    stationingChatHistory: rawSession.stationingChatHistory || [],
    pointEditorChatHistory: rawSession.pointEditorChatHistory || [],
    fieldbookChatHistory: rawSession.fieldbookChatHistory || [],
    gpsStakeoutChatHistory: rawSession.gpsStakeoutChatHistory || [],
    lsvzChatHistory: rawSession.lsvzChatHistory || [],
    planExpertChatHistory: rawSession.planExpertChatHistory || [],
    imageAnalyzerChatHistory: rawSession.imageAnalyzerChatHistory || [],
    gisChatHistory: rawSession.gisChatHistory || [],
    contouringChatHistory: rawSession.contouringChatHistory || [],
    steepSlopeChatHistory: rawSession.steepSlopeChatHistory || [],
    profileChatHistory: rawSession.profileChatHistory || [],
    cogoChatHistory: rawSession.cogoChatHistory || [],
    rinexChatHistory: rawSession.rinexChatHistory || [],
    zoningChatHistory: rawSession.zoningChatHistory || [],
    soilsChatHistory: rawSession.soilsChatHistory || [],
    standardsComplianceChatHistory: rawSession.standardsComplianceChatHistory || [],
    standardsComplianceControlFile: rawSession.standardsComplianceControlFile || null,
    standardsComplianceSubjectFile: rawSession.standardsComplianceSubjectFile || null,
    standardsComplianceSourceMode: rawSession.standardsComplianceSourceMode,
    standardsComplianceChecks: rawSession.standardsComplianceChecks,
    standardsComplianceLastReport: rawSession.standardsComplianceLastReport || null,
    profileData: rawSession.profileData || [],
    profileInfo: rawSession.profileInfo || null,
    fieldbookNotes: rawSession.fieldbookNotes || '',
    pointLists,
    lines: rawSession.lines || [],
    contourLabels: rawSession.contourLabels || [],
    centerlines: rawSession.centerlines || [],
    gisFeatures: rawSession.gisFeatures || [],
    wmsServices: rawSession.wmsServices || [],
    activeWmsLayers: rawSession.activeWmsLayers || [],
    offlineMapAreas: rawSession.offlineMapAreas || [],
    cutSheetData: rawSession.cutSheetData || [],
    cutSheetInfo: rawSession.cutSheetInfo || DEFAULT_CUT_SHEET_INFO,
    cacpReservations: rawSession.cacpReservations || [],
    knowledgeFacts: rawSession.knowledgeFacts || [],
    draftingStyleLibrary: rawSession.draftingStyleLibrary || [],
    soilMapUnits: rawSession.soilMapUnits || [],
    uiState: mergedUiState,
  };
};

/**
 * Migrate a chat message from older session formats to current format.
 * For v1.8+ compatibility, ensures ChatMessage has 'result' field when role is MODEL.
 * 
 * @param msg - The chat message to migrate
 * @returns The migrated message
 */
export const migrateMessage = (msg: ChatMessage): ChatMessage => {
  if (msg.role === MessageRole.MODEL && msg.result === undefined) {
    return { ...msg, result: msg.text, isExpanded: true };
  }
  return msg;
};

/**
 * Merge loaded settings with defaults to handle missing fields.
 * Only use this if you need to merge partial settings with defaults.
 * 
 * @param loadedSettings - Loaded settings (may be partial)
 * @param defaultSettings - Default settings template
 * @returns Merged settings with proper defaults
 */
export const mergeSettingsWithDefaults = (loadedSettings: any, defaultSettings: any) => {
  const validLinearUnits = new Set([
    'millimeter',
    'centimeter',
    'meter',
    'inch',
    'foot',
    'usSurveyFoot',
    'yard',
    'chain',
    'link',
    'mile',
    'kilometer',
  ]);

  return {
    ...defaultSettings,
    ...loadedSettings,
    projection: {
      ...defaultSettings.projection,
      ...(loadedSettings?.projection),
    },
    defaultCutSheetInfo: {
      ...defaultSettings.defaultCutSheetInfo,
      ...(loadedSettings?.defaultCutSheetInfo),
    },
    ntrip: {
      ...defaultSettings.ntrip,
      ...(loadedSettings?.ntrip),
    },
    pointLabelingSettings: {
      ...defaultSettings.pointLabelingSettings,
      ...(loadedSettings?.pointLabelingSettings),
    },
    googleMaps: {
      ...defaultSettings.googleMaps,
      ...(loadedSettings?.googleMaps),
      opacity: loadedSettings?.googleMaps?.opacity ?? defaultSettings?.googleMaps?.opacity ?? 1.0,
    },
    zoomToPointLevel: loadedSettings?.zoomToPointLevel ?? 20,
    northArrowStyle: loadedSettings?.northArrowStyle || 'classic',
    northArrowPosition: loadedSettings?.northArrowPosition || 'right',
    linearUnits: validLinearUnits.has(loadedSettings?.linearUnits)
      ? loadedSettings.linearUnits
      : (defaultSettings?.linearUnits || 'usSurveyFoot'),
  };
};
