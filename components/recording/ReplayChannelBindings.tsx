/**
 * Playback bindings for the pilot surfaces.
 *
 * These hooks register existing provider setters as replay channels. They are
 * inert in live mode. Point-editor local state, PDF/CAD and timeline bindings
 * follow in the surface-expansion slice.
 */

import { useEffect } from 'react';
import { useCanvasState } from '../../contexts/CanvasStateContext.tsx';
import { useUIState } from '../../contexts/UIStateContext.tsx';
import { useAppState } from '../../contexts/AppStateContext.tsx';
import { useChatState } from '../../contexts/ChatStateContext.tsx';
import { useCadManager } from '../../contexts/CadManagerContext.tsx';
import { useFileState } from '../../contexts/FileStateContext.tsx';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import { useTimeline } from '../../contexts/TimelineContext.tsx';
import { useReplayChannel } from '../../hooks/useReplayChannel';
import { AgentType } from '../../types';
import type { RecordedChatThread } from '../../utils/recording/types';
import type {
  JsonValue,
  ReplayChannelDefinition,
  ReplaySurfaceId,
} from '../../utils/recording/v2';

const channel = <T,>(
  id: string,
  surface: ReplaySurfaceId,
  diff: 'replace' | 'keyed-array' = 'replace',
): ReplayChannelDefinition<T> => ({
  id,
  surface,
  version: 1,
  keyframe: true,
  diff,
  serialize: value => value as unknown as JsonValue,
  deserialize: value => value as unknown as T,
});

const pointLists = channel<any>('canvas.pointLists', 'canvas', 'keyed-array');
const lines = channel<any>('canvas.lines', 'canvas', 'keyed-array');
const centerlines = channel<any>('canvas.centerlines', 'canvas', 'keyed-array');
const contourLabels = channel<any>('canvas.contourLabels', 'canvas', 'keyed-array');
const boundaryFiles = channel<any>('canvas.boundaryFiles', 'canvas', 'keyed-array');
const customSymbols = channel<any>('canvas.customSymbols', 'canvas', 'keyed-array');
const cadLayerVisibility = channel<any>('canvas.cadLayerVisibility', 'canvas');
const cadLayerColors = channel<any>('canvas.cadLayerColors', 'canvas');
const pointLayers = channel<any>('canvas.pointLayers', 'canvas');
const contourSettings = channel<any>('canvas.contourSettings', 'canvas');
const orientationTuple = channel<any>('canvas.orientationTuple', 'canvas');
const pendingPointDeletes = {
  ...channel<Set<string>>('canvas.pendingPointDeletes', 'canvas'),
  serialize: (value: Set<string>) => Array.from(value),
  deserialize: (value: JsonValue) => new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []),
} satisfies ReplayChannelDefinition<Set<string>>;

const activeVisualPanel = channel<any>('viewport.activeVisualPanel', 'tool-shelf');
const isChatPanelVisible = channel<boolean>('viewport.isChatPanelVisible', 'tool-shelf');
const isToolShelfVisible = channel<boolean>('viewport.isToolShelfVisible', 'tool-shelf');
const isToolsDrawerOpen = channel<boolean>('viewport.isToolsDrawerOpen', 'tool-shelf');
const isVisualPanelFullscreen = channel<boolean>('viewport.isVisualPanelFullscreen', 'tool-shelf');
const isPdfViewerFullscreen = channel<boolean>('viewport.isPdfViewerFullscreen', 'tool-shelf');
const isPointEditorExpanded = channel<boolean>('viewport.isPointEditorExpanded', 'point-editor');
const pointEditorHeight = channel<number>('viewport.pointEditorHeight', 'point-editor');
const contourPanelHeight = channel<number>('viewport.contourPanelHeight', 'tool-shelf');
const chatPanelWidth = channel<number>('viewport.chatPanelWidth', 'chat');
const toolShelfWidth = channel<number>('viewport.toolShelfWidth', 'tool-shelf');
const fabPosition = channel<any>('viewport.fabPosition', 'tool-shelf');
const modals = channel<Record<string, boolean>>('viewport.modals', 'modals');
const notifications = channel<any>('app.notifications', 'notifications', 'keyed-array');
const criticalError = channel<string | null>('app.criticalError', 'notifications');
const cadManager = channel<any>('cad.manager', 'cad');

const pageMode = channel<any>('viewport.pageMode', 'app');
const showWelcome = channel<boolean>('viewport.showWelcome', 'modals');
const isInitialScreen = channel<boolean>('viewport.isInitialScreen', 'app');
const jobInfo = channel<any>('app.jobInfo', 'app');
const activeAgent = channel<any>('app.activeAgent', 'app');
const lastActiveAgent = channel<any>('app.lastActiveAgent', 'app');
const activeModel = channel<string>('app.activeModel', 'app');
const initializedAgents = {
  ...channel<Set<AgentType>>('app.initializedAgents', 'app'),
  serialize: (value: Set<AgentType>) => Array.from(value),
  deserialize: (value: JsonValue) => new Set(Array.isArray(value) ? value as AgentType[] : []),
} satisfies ReplayChannelDefinition<Set<AgentType>>;

const histories = channel<RecordedChatThread[]>('chat.histories', 'chat', 'keyed-array');
const fieldbookNotes = channel<string>('chat.fieldbookNotes', 'chat');

const rawFile = channel<any>('files.rawFile', 'files');
const deedFile = channel<any>('files.deedFile', 'files');
const planFiles = channel<any>('files.planFiles', 'files');
const dxfFile = channel<any>('files.dxfFile', 'files');
const clFile = channel<any>('files.clFile', 'files');
const imageFiles = channel<any>('files.imageFiles', 'files');
const gisFile = channel<any>('files.gisFile', 'files');
const gisFeatures = channel<any>('files.gisFeatures', 'files', 'keyed-array');
const generatedFiles = channel<any>('files.generatedFiles', 'files', 'keyed-array');
const pdfViewerFiles = channel<any>('files.pdfViewerFiles', 'files');
const textEditorContent = channel<string>('app.textEditorContent', 'text-editor');
const activeTextEditorFile = channel<string | null>('app.activeTextEditorFile', 'text-editor');
const settingsDisplay = channel<any>('app.settingsDisplay', 'settings');
const timelineDocument = channel<any>('timeline.document', 'timeline');

export const ReplayChannelBindings: React.FC = () => {
  const canvas = useCanvasState();
  const ui = useUIState();
  const app = useAppState();
  const chat = useChatState();
  const files = useFileState();
  const recording = useRecording();
  const timeline = useTimeline();
  const cad = useCadManager();
  const displaySettings = {
    theme: app.settings.theme,
    projection: app.settings.projection,
    coordinatePrecision: app.settings.coordinatePrecision,
    defaultCutSheetInfo: app.settings.defaultCutSheetInfo,
  };
  const modalState = {
    isDocVisible: ui.isDocVisible,
    isTechPageVisible: ui.isTechPageVisible,
    isCivil3DPageVisible: ui.isCivil3DPageVisible,
    isInvestorFormVisible: ui.isInvestorFormVisible,
    isReleaseLogVisible: ui.isReleaseLogVisible,
    isHelpModalVisible: ui.isHelpModalVisible,
    isSettingsVisible: ui.isSettingsVisible,
    isAboutVisible: ui.isAboutVisible,
    isForwardThinkingVisible: ui.isForwardThinkingVisible,
    isDisclaimerVisible: ui.isDisclaimerVisible,
    isLegalPageVisible: ui.isLegalPageVisible,
    isDxfExportModalOpen: ui.isDxfExportModalOpen,
    isMobileMenuOpen: ui.isMobileMenuOpen,
  };

  useReplayChannel(pointLists, canvas.pointLists, canvas.setPointLists);
  useReplayChannel(lines, canvas.lines, canvas.setLines);
  useReplayChannel(centerlines, canvas.centerlines, canvas.setCenterlines);
  useReplayChannel(contourLabels, canvas.contourLabels, canvas.setContourLabels);
  useReplayChannel(boundaryFiles, canvas.boundaryFiles, canvas.setBoundaryFiles);
  useReplayChannel(customSymbols, canvas.customSymbols, canvas.setCustomSymbols);
  useReplayChannel(cadLayerVisibility, canvas.cadLayerVisibility, canvas.setCadLayerVisibility);
  useReplayChannel(cadLayerColors, canvas.cadLayerColors, canvas.setCadLayerColors);
  useReplayChannel(pointLayers, canvas.pointLayers, canvas.setPointLayers);
  useReplayChannel(contourSettings, canvas.contourSettings, canvas.setContourSettings);
  useReplayChannel(orientationTuple, canvas.orientationTuple, canvas.setOrientationTuple);
  useReplayChannel(pendingPointDeletes, canvas.pendingPointDeletes, canvas.setPendingPointDeletes);

  useReplayChannel(activeVisualPanel, ui.activeVisualPanel, ui.setActiveVisualPanel);
  useReplayChannel(isChatPanelVisible, ui.isChatPanelVisible, ui.setIsChatPanelVisible);
  useReplayChannel(isToolShelfVisible, ui.isToolShelfVisible, ui.setIsToolShelfVisible);
  useReplayChannel(isToolsDrawerOpen, ui.isToolsDrawerOpen, ui.setIsToolsDrawerOpen);
  useReplayChannel(isVisualPanelFullscreen, ui.isVisualPanelFullscreen, ui.setIsVisualPanelFullscreen);
  useReplayChannel(isPdfViewerFullscreen, ui.isPdfViewerFullscreen, ui.setIsPdfViewerFullscreen);
  useReplayChannel(isPointEditorExpanded, ui.isPointEditorExpanded, ui.setIsPointEditorExpanded);
  useReplayChannel(pointEditorHeight, ui.pointEditorHeight, ui.setPointEditorHeight);
  useReplayChannel(contourPanelHeight, ui.contourPanelHeight, ui.setContourPanelHeight);
  useReplayChannel(chatPanelWidth, ui.chatPanelWidth, ui.setChatPanelWidth);
  useReplayChannel(toolShelfWidth, ui.toolShelfWidth, ui.setToolShelfWidth);
  useReplayChannel(fabPosition, ui.fabPosition, ui.setFabPosition);
  useReplayChannel(modals, modalState, next => {
    if (typeof next.isDocVisible === 'boolean') ui.setIsDocVisible(next.isDocVisible);
    if (typeof next.isTechPageVisible === 'boolean') ui.setIsTechPageVisible(next.isTechPageVisible);
    if (typeof next.isCivil3DPageVisible === 'boolean') ui.setIsCivil3DPageVisible(next.isCivil3DPageVisible);
    if (typeof next.isInvestorFormVisible === 'boolean') ui.setIsInvestorFormVisible(next.isInvestorFormVisible);
    if (typeof next.isReleaseLogVisible === 'boolean') ui.setIsReleaseLogVisible(next.isReleaseLogVisible);
    if (typeof next.isHelpModalVisible === 'boolean') ui.setIsHelpModalVisible(next.isHelpModalVisible);
    if (typeof next.isSettingsVisible === 'boolean') ui.setIsSettingsVisible(next.isSettingsVisible);
    if (typeof next.isAboutVisible === 'boolean') ui.setIsAboutVisible(next.isAboutVisible);
    if (typeof next.isForwardThinkingVisible === 'boolean') ui.setIsForwardThinkingVisible(next.isForwardThinkingVisible);
    if (typeof next.isDisclaimerVisible === 'boolean') ui.setIsDisclaimerVisible(next.isDisclaimerVisible);
    if (typeof next.isLegalPageVisible === 'boolean') ui.setIsLegalPageVisible(next.isLegalPageVisible);
    if (typeof next.isDxfExportModalOpen === 'boolean') ui.setIsDxfExportModalOpen(next.isDxfExportModalOpen);
    if (typeof next.isMobileMenuOpen === 'boolean') ui.setIsMobileMenuOpen(next.isMobileMenuOpen);
  });
  useReplayChannel(pageMode, ui.pageMode, ui.setPageMode);
  useReplayChannel(showWelcome, ui.showWelcome, ui.setShowWelcome);
  useReplayChannel(isInitialScreen, ui.isInitialScreen, ui.setIsInitialScreen);

  useReplayChannel(jobInfo, app.jobInfo, app.setJobInfo);
  useReplayChannel(activeAgent, app.activeAgent, app.setActiveAgent);
  useReplayChannel(lastActiveAgent, app.lastActiveAgent, app.setLastActiveAgent);
  useReplayChannel(activeModel, app.activeModel, app.setActiveModel);
  useReplayChannel(initializedAgents, app.initializedAgents, app.setInitializedAgents);
  useReplayChannel(notifications, app.notifications, next => {
    app.clearNotifications();
    if (!Array.isArray(next)) return;
    for (const notification of next) {
      if (notification && typeof notification === 'object') app.addNotification(notification);
    }
  });
  useReplayChannel(criticalError, app.criticalError, next => {
    if (next) app.reportError({ title: 'Recorded error', message: next });
    else app.dismissCriticalError();
  });
  useReplayChannel(cadManager, {
    standard: cad.state.standard,
    aliases: cad.state.aliases,
    pendingReview: cad.state.pendingReview,
  }, next => {
    if (!next) return;
    if (next.standard) cad.dispatch({ type: 'SET_STANDARD', payload: next.standard });
    if (next.aliases) cad.dispatch({ type: 'SET_ALIASES', payload: next.aliases });
    if (Array.isArray(next.pendingReview)) {
      cad.dispatch({ type: 'SET_PENDING_REVIEW', payload: next.pendingReview });
    }
  });

  useReplayChannel(histories, [
    { agent: AgentType.LSVZ_AGENT, messages: chat.lsvzChatHistory },
    { agent: AgentType.POINT_EDITOR, messages: chat.pointEditorChatHistory },
    { agent: AgentType.RAW_REPLAY, messages: chat.rawChatHistory },
    { agent: AgentType.DEED_READER, messages: chat.deedChatHistory },
    { agent: AgentType.DXF_ANALYZER, messages: chat.dxfChatHistory },
    { agent: AgentType.CENTERLINE_STATIONING, messages: chat.stationingChatHistory },
    { agent: AgentType.GPS_STAKEOUT, messages: chat.gpsStakeoutChatHistory },
  ], threads => {
    for (const thread of threads) {
      if (thread.agent === AgentType.LSVZ_AGENT) chat.setLsvzChatHistory(thread.messages);
      else if (thread.agent === AgentType.POINT_EDITOR) chat.setPointEditorChatHistory(thread.messages);
      else if (thread.agent === AgentType.RAW_REPLAY) chat.setRawChatHistory(thread.messages);
      else if (thread.agent === AgentType.DEED_READER) chat.setDeedChatHistory(thread.messages);
      else if (thread.agent === AgentType.DXF_ANALYZER) chat.setDxfChatHistory(thread.messages);
      else if (thread.agent === AgentType.CENTERLINE_STATIONING) chat.setStationingChatHistory(thread.messages);
      else if (thread.agent === AgentType.GPS_STAKEOUT) chat.setGpsStakeoutChatHistory(thread.messages);
    }
  });
  useReplayChannel(fieldbookNotes, chat.fieldbookNotes, chat.setFieldbookNotes);

  useReplayChannel(rawFile, files.rawFile, files.setRawFile);
  useReplayChannel(deedFile, files.deedFile, files.setDeedFile);
  useReplayChannel(planFiles, files.planFiles, files.setPlanFiles);
  useReplayChannel(dxfFile, files.dxfFile, files.setDxfFile);
  useReplayChannel(clFile, files.clFile, files.setClFile);
  useReplayChannel(imageFiles, files.imageFiles, files.setImageFiles);
  useReplayChannel(gisFile, files.gisFile, files.setGisFile);
  useReplayChannel(gisFeatures, files.gisFeatures, files.setGisFeatures);
  useReplayChannel(generatedFiles, files.generatedFiles, files.setGeneratedFiles);
  useReplayChannel(pdfViewerFiles, files.pdfViewerFiles, files.setPdfViewerFiles);

  useReplayChannel(textEditorContent, app.textEditorContent, app.setTextEditorContent);
  useReplayChannel(activeTextEditorFile, app.activeTextEditorFile, app.setActiveTextEditorFile);
  useReplayChannel(settingsDisplay, displaySettings, next => {
    app.setSettings(previous => ({ ...previous, ...next }));
  });
  useReplayChannel(timelineDocument, timeline.getSerializableDocument(), next => {
    timeline.loadTimeline(next);
  });

  useEffect(() => {
    if (recording.phase !== 'recording') return;
    recording.recordChannel('app.activeModel', app.activeModel);
    recording.recordChannel('app.initializedAgents', Array.from(app.initializedAgents));
    recording.recordChannel('app.textEditorContent', app.textEditorContent);
    recording.recordChannel('app.activeTextEditorFile', app.activeTextEditorFile);
    recording.recordChannel('app.settingsDisplay', {
      theme: app.settings.theme,
      projection: app.settings.projection,
      coordinatePrecision: app.settings.coordinatePrecision,
      defaultCutSheetInfo: app.settings.defaultCutSheetInfo,
    });
    recording.recordChannel('chat.fieldbookNotes', chat.fieldbookNotes);
    recording.recordChannel('timeline.document', timeline.getSerializableDocument());
    recording.recordChannel('files.rawFile', files.rawFile);
    recording.recordChannel('files.deedFile', files.deedFile);
    recording.recordChannel('files.planFiles', files.planFiles);
    recording.recordChannel('files.dxfFile', files.dxfFile);
    recording.recordChannel('files.clFile', files.clFile);
    recording.recordChannel('files.imageFiles', files.imageFiles);
    recording.recordChannel('files.gisFile', files.gisFile);
    recording.recordChannel('files.gisFeatures', files.gisFeatures);
    recording.recordChannel('files.generatedFiles', files.generatedFiles);
    recording.recordChannel('files.pdfViewerFiles', files.pdfViewerFiles);
    recording.recordChannel('viewport.isToolsDrawerOpen', ui.isToolsDrawerOpen);
    recording.recordChannel('viewport.isVisualPanelFullscreen', ui.isVisualPanelFullscreen);
    recording.recordChannel('viewport.isPdfViewerFullscreen', ui.isPdfViewerFullscreen);
    recording.recordChannel('viewport.isPointEditorExpanded', ui.isPointEditorExpanded);
    recording.recordChannel('viewport.pointEditorHeight', ui.pointEditorHeight);
    recording.recordChannel('viewport.contourPanelHeight', ui.contourPanelHeight);
    recording.recordChannel('viewport.chatPanelWidth', ui.chatPanelWidth);
    recording.recordChannel('viewport.toolShelfWidth', ui.toolShelfWidth);
    recording.recordChannel('viewport.fabPosition', ui.fabPosition);
    recording.recordChannel('viewport.modals', modalState);
    recording.recordChannel('app.notifications', app.notifications);
    recording.recordChannel('app.criticalError', app.criticalError);
    recording.recordChannel('cad.manager', {
      standard: cad.state.standard,
      aliases: cad.state.aliases,
      pendingReview: cad.state.pendingReview,
    });
    recording.recordChannel('viewport.pageMode', ui.pageMode);
    recording.recordChannel('viewport.showWelcome', ui.showWelcome);
    recording.recordChannel('viewport.isInitialScreen', ui.isInitialScreen);
  }, [
    recording.phase,
    recording.recordChannel,
    app.activeModel,
    app.initializedAgents,
    app.textEditorContent,
    app.activeTextEditorFile,
    app.settings.theme,
    app.settings.projection,
    app.settings.coordinatePrecision,
    app.settings.defaultCutSheetInfo,
    chat.fieldbookNotes,
    timeline.document,
    files.rawFile,
    files.deedFile,
    files.planFiles,
    files.dxfFile,
    files.clFile,
    files.imageFiles,
    files.gisFile,
    files.gisFeatures,
    files.generatedFiles,
    files.pdfViewerFiles,
    ui.isToolsDrawerOpen,
    ui.isVisualPanelFullscreen,
    ui.isPdfViewerFullscreen,
    ui.isPointEditorExpanded,
    ui.pointEditorHeight,
    ui.contourPanelHeight,
    ui.chatPanelWidth,
    ui.toolShelfWidth,
    ui.fabPosition,
    ui.isDocVisible,
    ui.isTechPageVisible,
    ui.isCivil3DPageVisible,
    ui.isInvestorFormVisible,
    ui.isReleaseLogVisible,
    ui.isHelpModalVisible,
    ui.isSettingsVisible,
    ui.isAboutVisible,
    ui.isForwardThinkingVisible,
    ui.isDisclaimerVisible,
    ui.isLegalPageVisible,
    ui.isDxfExportModalOpen,
    ui.isMobileMenuOpen,
    app.notifications,
    app.criticalError,
    cad.state.standard,
    cad.state.aliases,
    cad.state.pendingReview,
    ui.pageMode,
    ui.showWelcome,
    ui.isInitialScreen,
  ]);

  return null;
};
