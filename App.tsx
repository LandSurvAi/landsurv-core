// FUTURE GEMINI: This is the root component of the LandSurv.ai application.
// It manages all major state, component composition, and core application logic.
// - The overall layout (Sidebar, Main Panel, Chat Panel) is CRUCIAL. Do not change it without explicit instruction.
// - All agent-specific data (files, chat histories) is managed here. When adding new data, ensure it's handled in `handleSaveSession` and `handleLoadSession`.
// - The `activeAgent` state determines which agent is currently in use. The `handleAgentChange` function is the primary way to switch between agents.

import React, { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect, Suspense, lazy } from 'react';
import FileUpload from './components/FileUpload.tsx';
import CivilDrafterFileUpload from './components/CivilDrafterFileUpload.tsx';
import DeedInput from './components/DeedInput.tsx';
import CenterlineInput from './components/CenterlineInput.tsx';
import PointEditorInput from './components/PointEditorInput.tsx';
import CadManagerInput from './components/CadManagerInput.tsx';
import PlanInput from './components/PlanInput.tsx';
import DxfInput from './components/DxfInput.tsx';
import ImageInput from './components/ImageInput.tsx';
// FIX: Import GisInput for the new GIS Agent.
import GisInput from './components/GisInput.tsx';
import ZoningInput from './components/ZoningInput.tsx';
import StandardsComplianceInput from './components/StandardsComplianceInput.tsx';
import ClawStatusBadge from './components/ClawStatusBadge.tsx';
import SourceBlockedNotice from './components/SourceBlockedNotice.tsx';
import PermissiveSourcesExplainer from './components/PermissiveSourcesExplainer.tsx';
import ZoningResultsPanel from './components/ZoningResultsPanel.tsx';
import { TitleSearchPanel } from './components/TitleSearchPanel.tsx';
// FIX: Changed default import to named import for ChatInterface.
import { ChatInterface } from './components/ChatInterface.tsx';
import StationingChat from './components/StationingChat.tsx';
import { PointEditorChat } from './components/PointEditorChat.tsx';
import { PointListPanel } from './components/PointListPanel.tsx';
import { EnvironmentBanner } from './components/EnvironmentBanner.tsx';
// FIX: Import ContourPanel for the new contouring controls.
// FIX: Changed default import to a named import for ContourPanel and added ProfilePanel import.
import { ContourPanel, ProfilePanel } from './components/ContourPanel.tsx';
// FIX: Import ContourChat for integrating contouring tools into the chat interface.
import { ContourChat } from './components/ContourChat.tsx';
import { ParcelPanel } from './components/ParcelPanel.tsx';
// FIX: Import CogoPanel for the COGO Agent coordinate geometry tools.
import { CogoPanel } from './components/CogoPanel.tsx';
// FIX: Changed the import for DrawingCanvas to a named import to match the updated export style of the component.
import { DrawingCanvas } from './components/DrawingCanvas.tsx';
import CutSheetPanel from './components/CutSheetPanel.tsx';
import FieldbookPanel from './components/FieldbookPanel.tsx';
import { CadManagerPage } from './components/CadManager/CadManagerPage.tsx';
import LinetypeManagerPanel from './components/CadManager/LinetypeManagerPanel.tsx';
import SheetView from './components/SheetView.tsx';
import { DraftingStyleLibrary } from './components/CadManager/DraftingStyleLibrary.tsx';
import CivilDrafterVisionHUD from './components/CadManager/CivilDrafterVisionHUD.tsx';
import AutoDraftPanel from './components/CadManager/AutoDraftPanel.tsx';
import {
  captureVisionSurvey,
  buildVisionParts,
  isDrawIntent,
  type VisionSurvey,
  type VisionAerialImage,
} from './utils/civilDrafterVision.ts';
import { type ZoningContext, type AutoDraftImage } from './utils/autoDraftOrchestrator.ts';
import { getStaticMap } from './services/staticMapsService.ts';
import { buildSymbolMatchers, resolveSymbol } from './utils/symbolResolver.ts';
import { parseSymbolCommand, type SymbolVisibilityCommand } from './utils/symbolCommandParser.ts';
import { SURVEY_SYMBOL_LIBRARY } from './data/surveySymbolLibrary.ts';
import { parsePointFile, pointListToString } from './utils/pointFile.ts';
import { buildTinFromPoints } from './services/TinService.ts';
import { runSteepSlopeAnalysis, steepSlopeRunToSurveyLines } from './services/SteepSlopeService.ts';
import { ESRI_STATE_SERVICES } from './utils/esriStateServices.ts';
import { runClawDirectives, parseClawDirectives } from './utils/clawClient.ts';
import { sanitizeZoningAnswer, extractZoningJsonBlock } from './utils/zoningRender.ts';
import { setBootstrapStatus } from './utils/zoningBootstrap.ts';
import { isDemoApiKey } from './services/proxyGenAI.ts';
import { APP_VERSION as APP_VERSION_CONST } from './utils/appVersion.ts';
import { createSessionZip, generateSessionFileName } from './utils/sessionZip.ts';
import { isOssBuild } from './utils/ossMode.ts';
// Defer non-critical page components for faster initial load
const TechnologiesPage = lazy(() => import('./components/TechnologiesPage.tsx'));
const SettingsPage = lazy(() => import('./components/SettingsPage.tsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const ReleaseLog = lazy(() => import('./components/ReleaseLog.tsx'));
const LsvzDocumentation = lazy(() => import('./components/LsvzDocumentation.tsx'));
const ConnectorDownloadPage = lazy(() => import('./pages/ConnectorDownload.tsx').then(m => ({ default: m.ConnectorDownload })));
const DevOpsConsolePage = lazy(() => import('./pages/DevOpsConsole.tsx').then(m => ({ default: m.DevOpsConsole })));

// Loading fallback component for lazy-loaded pages
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-slate-700 animate-pulse">
        <div className="w-8 h-8 rounded-full border-2 border-slate-500 border-t-blue-500 animate-spin"></div>
      </div>
      <p className="text-slate-300 text-sm font-medium">Loading...</p>
    </div>
  </div>
);
import { RawAgentContent } from './components/landing/RawAgentContent.tsx';
import { DeedAgentContent } from './components/landing/DeedAgentContent.tsx';
import { PlanAgentContent } from './components/landing/PlanAgentContent.tsx';
import { DxfAgentContent } from './components/landing/DxfAgentContent.tsx';
import { StationAgentContent } from './components/landing/StationAgentContent.tsx';
import { PointAgentContent } from './components/landing/PointAgentContent.tsx';
import { GpsAgentContent } from './components/landing/GpsAgentContent.tsx';
import { ImageAgentContent } from './components/landing/ImageAgentContent.tsx';
// FIX: Import GisAgentContent for the new GIS Agent landing page.
import { GisAgentContent } from './components/landing/GisAgentContent.tsx';
// FIX: Import ContourAgentContent for the new Contouring Agent landing page.
// FIX: Import ProfileAgentContent for the new Profile Agent landing page.
import { ContourAgentContent, ProfileAgentContent } from './components/landing/ContourAgentContent.tsx';
// FIX: Import CogoAgentContent for the COGO Agent landing page.
import { CogoAgentContent } from './components/landing/CogoAgentContent.tsx';
import { GpxAgentContent } from './components/landing/GpxAgentContent.tsx';
// FIX: Import AgentsPageContent for the agents directory landing page.
import { AgentsPageContent } from './components/landing/AgentsPageContent.tsx';
import { ARAgentContent } from './components/landing/ARAgentContent.tsx';
import { CadManagerContent } from './components/landing/CadManagerContent.tsx';
import { CivilDrafterContent } from './components/landing/CivilDrafterContent.tsx';
import { Civil3DLandingPage } from './components/Civil3DLandingPage.tsx';

// Import all modal and panel components
import { Sidebar } from './components/Sidebar.tsx';
import InitialAgentSelection from './components/InitialAgentSelection.tsx';
import { PdfViewerPanel } from './components/PdfViewerPanel.tsx';
import NotificationCenter from './components/NotificationCenter.tsx';
import NotificationScopeMarker from './components/NotificationScopeMarker.tsx';
import GlobalErrorDialog from './components/GlobalErrorDialog.tsx';
import TextEditorPanel from './components/TextEditorPanel.tsx';
import SessionSaveModal from './components/SessionSaveModal.tsx';
import GpsStakeoutPanel from './components/GpsStakeoutPanel.tsx';
import FileManagerPanel from './components/FileManagerPanel.tsx';
import ImageAnalyzerPanel from './components/ImageAnalyzerPanel.tsx';
import { SymbolManagerPanel } from './components/SymbolManagerPanel.tsx';
import { AnnotateManagerPanel } from './components/AnnotateManagerPanel.tsx';
import { AnnotationCategoryPanel } from './components/AnnotationCategoryPanel.tsx';
import WelcomeScreen from './components/WelcomeScreen.tsx';
import GNSSProcessingPanel from './components/GNSSProcessingPanel.tsx';
import DroneProcessingPanel from './components/DroneProcessingPanel.tsx';
import ARView from './components/ARView.tsx';
import { RinexSubdomainPage } from './components/RinexSubdomainPage.tsx';
import { LegalSubdomainPage } from './components/LegalSubdomainPage.tsx';
import { TosSubdomainPage } from './components/TosSubdomainPage.tsx';
import { CacpSubdomainPage } from './components/CacpSubdomainPage.tsx';
import { GatewaySubdomainPage } from './components/GatewaySubdomainPage.tsx';
import { ComplianceSubdomainPage } from './components/ComplianceSubdomainPage.tsx';
import { PrivacyPolicySubdomainPage } from './components/PrivacyPolicySubdomainPage.tsx';
import { DataProcessingAddendumSubdomainPage } from './components/DataProcessingAddendumSubdomainPage.tsx';
import { SubprocessorsSubdomainPage } from './components/SubprocessorsSubdomainPage.tsx';
import { StandardsSubdomainPage } from './components/StandardsSubdomainPage.tsx';
import { DocumentationSubdomainPage } from './components/DocumentationSubdomainPage.tsx';
import { OpenSourceSubdomainPage } from './components/OpenSourceSubdomainPage.tsx';
import { Roadmap2026Page } from './components/Roadmap2026Page.tsx';
import InvestorInquiryForm from './components/InvestorInquiryForm.tsx';
import HelpModal from './components/HelpModal.tsx';
import AboutPage from './components/AboutPage.tsx';
import ForwardThinkingPage from './components/ForwardThinkingPage.tsx';
import DisclaimerPage from './components/DisclaimerPage.tsx';
import LegalPage from './components/LegalPage.tsx';
import LegalAgreementGate from './components/LegalAgreementGate.tsx';
import { hasSignedLegalAgreement, getSignatureRecord } from './components/SignatureForm.tsx';
import FloatingPanel from './components/FloatingPanel.tsx';
import FloodPanel from './components/FloodPanel.tsx';
import StructuresPanel from './components/StructuresPanel.tsx';
import SoilsPanel from './components/SoilsPanel.tsx';
import ShrinkwrapPanel from './components/ShrinkwrapPanel.tsx';
import InclusionBoundariesPanel from './components/InclusionBoundariesPanel.tsx';
import { ContourGenerationPanel } from './components/ContourGenerationPanel.tsx';
import { ContourEsriPanel } from './components/ContourEsriPanel.tsx';
import ContourManagementPanel from './components/ContourManagementPanel.tsx';
import { SteepSlopePanel } from './components/SteepSlopePanel.tsx';
import SteepSlopeReportPanel from './components/SteepSlopeReportPanel.tsx';
import ClaudeSettingsPanel from './components/ClaudeSettingsPanel.tsx';
import { ProfileGenerationPanel } from './components/ProfileGenerationPanel.tsx';
import type { ProfileGenerateParams } from './components/ProfileGenerationPanel.tsx';
import ErrorConsole from './components/ErrorConsole.tsx';
import ApiKeyOrPayModal, { type CheckoutSelection, type CurrentKeyDetails } from './components/ApiKeyOrPayModal.tsx';
import { UpgradeModal } from './components/UpgradeModal.tsx';
import { HostCostReminderModal } from './components/HostCostReminderModal.tsx';
import { executeCheckoutRecaptcha } from './utils/recaptcha.ts';
import AppLockOverlay from './components/AppLockOverlay.tsx';
import { ConciergeOverlay } from './components/PublicConciergeChat.tsx';
import { C3DConnectPanel } from './components/C3DConnectPanel.tsx';
import { C3DDebugDialog } from './components/C3DDebugDialog.tsx';
import { useC3DStateSync } from './hooks/useC3DStateSync.ts';
import { C3DSyncCenter } from './components/C3DSyncCenter.tsx';
import type { C3DSyncSnapshot, SyncApplyPlan, SyncBaseline, C3DLineRecord } from './services/c3dSyncProtocol.ts';
import { ReleaseStagesModal } from './components/ReleaseStagesModal.tsx';
import { QuickConverter } from './components/QuickConverter.tsx';

import DxfExportModal from './components/DxfExportModal.tsx';
import ProjectionSelectionModal from './components/ProjectionSelectionModal.tsx';
import UserFriendlyErrorBoundary from './components/UserFriendlyErrorBoundary.tsx';
import { TechnologiesPageContent } from './components/TechnologiesPageContent.tsx';
import { ReleaseLogContent } from './components/ReleaseLogContent.tsx';
import { AboutPageContent } from './components/AboutPageContent.tsx';
import { SitemapPageContent } from './components/SitemapPageContent.tsx';
import { LsvzDocumentationContent } from './components/LsvzDocumentationContent.tsx';
import Gemini3ControlsPanel from './components/Gemini3ControlsPanel.tsx';
import CivilDrafterContextPanel from './components/CivilDrafterContextPanel.tsx';
import CacpManifestModal from './components/CacpManifestModal.tsx';
import { CacpActivityIndicator } from './components/CacpActivityIndicator.tsx';
import { loadGemini3Config } from './services/gemini3Config.ts';
import {
  loadCivilDrafterContextConfig,
  getCivilDrafterContextConfig,
  EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  type CivilDrafterContextVolume,
} from './services/civilDrafterContextConfig.ts';
import { loadClaudeConfig, setClaudeConfig, type ClaudeModel } from './services/claudeConfig.ts';
import { generateDxf } from './utils/dxf.ts';
import { parseDxfGeometry } from './utils/dxfGeometryParser.ts';
import { expandChainsToLines, expandWidthCodedChains, repairBankCorridorChains, type DrafterChain } from './utils/linework.ts';
import {
  addLineToList,
  addPointToList,
  deleteLineFromList,
  deletePointFromLists,
  updateLineLabelOffset,
  updatePointAnnotationOffset,
  updatePointInLists,
  updatePointLabelOffset,
} from './utils/geometryOperations.ts';
import { parseClFile, calculateCenterlineLength, calculatePointFromStationOffset, formatStation, getCenterlineKeyStations } from './utils/stationing.ts';
// FIX: Import the new `calculateClosure` function to enable robust, client-side closure calculations.
import { parseBearingToRadians, parseDistance, inverse, direct, directCurve, calculateChordDistance, calculateClosure, formatBearing, swapBearingDirection } from './utils/cogo.ts';
// FIX: Import the new `generateProfile` function to enable client-side profile calculations.
import { generateContours, generateProfile, generateContoursAsIsoPaths, isoPathsToSurveyLines, suppressEsriContoursInsidePolygon, buildPolygonFromSegments, pointInPolygon, getSegPairs, clipSegmentToPolygon } from './utils/contouring.ts';
// FIX: Import `CustomSymbol`, `ContourSettings` and `ContourLabel` to be used with new features.
import { type ChatMessage, MessageRole, type SurveyPoint, type SurveyLine, type CutSheetRow, type CutSheetInfo, AgentType, type SessionFile, type SessionState, type Centerline, JobInfo, Settings, PdfHighlight, type PointList, WmsService, ActiveWmsLayer, DxfExportOptions, VisualPanel, type OfflineMapArea, type ChatMessageAction, SettingsContext, AgentContext, UIContext, HighlightContext, Chat, Modality, Part, ProjectionSetting, type CustomSymbol, type AnnotationRule, type ContourSettings, type ContourLabel, type StreetLabel, type ProfilePoint, type ProfileInfo, type ClosureReport, type GisFeature, type DeedMetadata, type TitleSearchData, type BoundaryFile, type BoundaryFileCall, type AnnotationDimension, type EsriServiceInfo, type InclusionBoundary, type DraftingStyleEntry, type ContourGeneration, type IsoPath, type ParcelLabel, type AnnotationCategoryStyle, type DeedSummary, type AppNotification, type TinSurface, type SteepSlopeBand, type SteepSlopeRunResult, DEFAULT_ANNOTATION_CATEGORIES, type ParcelLabelFormatter, type ParcelCadTextStyle, DEFAULT_PARCEL_LABEL_FORMATTER, type StandardsComplianceCheckSelection, type StandardsComplianceReport, type ComplianceSourceMode, type SessionSaveOptions } from './types.ts';
import { DEFAULT_PARCEL_CAD_TEXT_STYLES } from './utils/parcelLabelFormatter.ts';
// FIX: Corrected import of startGeminiChat. Renamed import 'startChat' to 'startGeminiChat' to match export.
import { startGeminiChat, selectContextSources, getModelForAgent, getAutoModelForAgent, summarizeDeed, investigateDeedClosure, isClaudeModel, isOpenAIModel, isGrokModel, extractZoningDistrictsFromMap, runVisualStandardsComplianceAudit, processAndCorrectCoordinates, AUTO_FAST_MODEL, type DeedClosureReview, type DeedClosureHypothesis } from './services/geminiService.ts';
import { GisService } from './services/gisService.ts';
import { interAgentComm } from './services/InterAgentCommunication.ts';
import type { AgentMessage } from './services/InterAgentCommunication.ts';
import { PointAgent } from './services/PointAgent.ts';
import { connectGatewayRelay, disconnectGatewayRelay } from './services/gatewayRelayClient.ts';
import { agentRegistry } from './services/AgentRegistry.ts';
import { useCogoExtendedSkills } from './services/cogoSkillHandlers.ts';
import { knowledgeBase, extractDeedMetadataFacts, extractRowFactsFromLines, extractZoningFacts } from './services/KnowledgeBase.ts';
import './services/LsvzOrchestrator.ts';
import { CacpBadge } from './components/CacpBadge.tsx';
import { hashKey } from './utils/hashKey';
import { isConfirmedForKey, confirmKey, clearConfirmed, migrateLegacyConfirm } from './utils/apiKeyConfirmation';
import { shouldSuppressApiKeyModalForSurface } from './utils/apiKeyModalGuard.ts';
import { fetchApiKeyEntitlements } from './services/apiAuth.ts';
import { getProviderApiKey, setProviderApiKey, clearProviderApiKey, resolveKeyProvider, PROVIDER_LABELS, type ByokProvider, type KnownKeyProvider } from './services/providerKeys.ts';

// ============================================================================
// REFACTORING: New Context Providers (Strangler Pattern)
// ============================================================================
import { FileStateProvider, useFileState } from './contexts/FileStateContext.tsx';
import { ChatStateProvider, useChatState } from './contexts/ChatStateContext.tsx';
import { UIStateProvider, useUIState } from './contexts/UIStateContext.tsx';
import { CanvasStateProvider, useCanvasState } from './contexts/CanvasStateContext.tsx';
import { useCanvasHistory, useHistorySlice } from './contexts/CanvasHistoryContext.tsx';
import { useUndoShortcuts } from './hooks/useUndoShortcuts.ts';
import HistoryPanel from './components/HistoryPanel.tsx';
import { useHistorySkills } from './services/historySkillHandlers.ts';
import { AppStateProvider, useAppState } from './contexts/AppStateContext.tsx';
import { CadManagerProvider, useCadManager } from './contexts/CadManagerContext.tsx';
import {
  buildStandardFromDrawingLayers,
  snapshotLayersToPulled,
  type SnapshotLayerRecord,
} from './utils/c3dLayerStandard.ts';
import {
  saveSession as saveCadManagerSession,
  setActiveSessionId as setActiveCadManagerSessionId,
  findSessionIdByName as findCadManagerSessionIdByName,
} from './components/CadManager/CadManagerSessionStorage.ts';

// ============================================================================
// REFACTORING: Custom Hooks (Strangler Pattern - Phase 2)
// ============================================================================
import { useThinkingTimer } from './hooks/useThinkingTimer.ts';
import { useAppHeight } from './hooks/useAppHeight.ts';
import { useThemeManager } from './hooks/useThemeManager.ts';
import { useProjectionInit } from './hooks/useProjectionInit.ts';
import { useFabDrag } from './hooks/useFabDrag.ts';
import { useDesktopEffect } from './hooks/useDesktopEffect.ts';
import { useVerticalPanelResize } from './hooks/useVerticalPanelResize.ts';
import { useChatPanelResize } from './hooks/useChatPanelResize.ts';
import { useGeolocation } from './hooks/useGeolocation.ts';
import { useInitialLoader } from './hooks/useInitialLoader.ts';
import { useSubdomainRouting } from './hooks/useSubdomainRouting.ts';
import { useUsageTimer } from './hooks/useUsageTimer.ts';
import { useCheckoutRouting } from './hooks/useCheckoutRouting.tsx';

// ============================================================================
// REFACTORING: Extracted Constants
// ============================================================================
import { 
  agentConfig, 
  agentThemeColors, 
  agentGradientClasses,
  agentIcons,
  addDataButtonLabels,
  hexToRgb,
  getAgentThemeColor 
} from './constants/agents.ts';
import { 
} from './constants/agents.ts';
import { DEFAULT_SETTINGS, COMPATIBLE_VERSIONS, isVersionCompatible } from './utils/sessionDefaults.ts';
import { mergeSettingsWithDefaults, migrateMessage } from './utils/sessionMigration.ts';
// FIX: Added ProfileIcon to the imports for the new Profile Agent.
import { HomeIcon, DownloadIcon, EraserIcon, CutSheetIcon, BrainCircuitIcon, CourthouseIcon, ChevronDownIcon, ChevronLeftIcon, FullscreenIcon, ExitFullscreenIcon, ChatBubbleIcon, LsvzIcon, CpuChipIcon, ArrowUpTrayIcon, RoadIcon, ChevronUpIcon, TableCellsIcon, BookOpenIcon, MapPinIcon, ClipboardDocumentListIcon, LogClockIcon, SparklesIcon, Bars3Icon, DocumentDuplicateIcon, CrosshairsIcon, CameraIcon, DroneIcon, InfoIcon, CurrencyDollarIcon, SunIcon, MoonIcon, GlobeAltIcon, BugAntIcon, QuestionMarkCircleIcon, DxfAnalyzerIcon, PlumbBobIcon, ScaleIcon, ChevronRightIcon, GisAgentIcon, ChevronDoubleRightIcon, PencilSquareIcon, ContourIcon, SlopeIcon, ExclamationTriangleIcon, ProfileIcon, LayersIcon, EnvelopeIcon, MonitorIcon, SatelliteIcon, XMarkIcon, AdjustmentsHorizontalIcon, GridIcon, UndoIcon, RedoIcon, MapIcon, ZoomExtentsIcon, AttributeScaleIcon, ZoomToPointIcon, ListBulletIcon } from './components/icons.tsx';
import { suggestedQuestionsText } from './assets/suggested_questions.ts';
import { userSuggestedQuestionsText } from './assets/user_suggested_questions.ts';
import { deedSuggestedQuestionsText } from './assets/deed_suggested_questions.ts';
import { exampleFileName, exampleFileContent } from './assets/example.raw.ts';
import { exampleDeedContent } from './assets/example.deed.ts';
import JSZip from 'jszip';
import proj4 from 'proj4';
// REFACTORING NOTE: initProjections moved to useProjectionInit hook (Phase 2)
// OLD: import { initProjections } from './utils/projections.ts';
import { fetchWmsCapabilities } from './utils/wms.ts';
import WmsPanel from './components/WmsPanel.tsx';
import ZoningPanel from './components/ZoningPanel.tsx';
import ClosureReportPanel from './components/ClosureReportPanel.tsx';
import LegalWriterPanel from './components/LegalWriterPanel.tsx';
import LayerManagerPanel, { type CadLayerEntry } from './components/LayerManagerPanel.tsx';
import BoundaryEditor from './components/BoundaryEditor.tsx';
import DeedSummaryPanel from './components/DeedSummaryPanel.tsx';
import StandardsComplianceSummaryPanel from './components/StandardsComplianceSummaryPanel.tsx';


// FUTURE GEMINI: These context functions are CRITICAL for the LSVZ Meta-Agent.
// `getSummarizedLsvzContext` provides a high-level overview.
// `getDynamicLsvzContext` provides specific, detailed data based on the AI's own analysis of the user's query.
// Do not modify the truncation limits or logic without careful consideration of the Gemini API's token limits.
const getSummarizedLsvzContext = (sessionState: Omit<SessionState, 'version' | 'savedAt' | 'lsvzChatHistory'>): string => {
    // Stricter limits to prevent token overflow
    const MAX_FILE_CHARS = 1500;
    const MAX_HISTORY_MESSAGES = 6; // last 6 messages only
    const MAX_DATA_ITEMS = 5; // preview first 5 items

    const truncateString = (str: string, len: number) => {
        if (!str || str.length <= len) return str;
        return str.substring(0, len) + `\n... (content truncated, ${str.length} total chars) ...`;
    };

    const truncateHistory = (history: ChatMessage[]) => {
        if (history.length <= MAX_HISTORY_MESSAGES) return history;
        return [
            { role: MessageRole.MODEL, text: `... (${history.length - MAX_HISTORY_MESSAGES} messages truncated) ...` },
            ...history.slice(-MAX_HISTORY_MESSAGES)
        ];
    };

    const summarizeData = (data: any[] | undefined, name: string): Record<string, any> => {
        if (!data || data.length === 0) return { [`${name}Count`]: 0 };
        return {
            [`${name}Count`]: data.length,
            [`${name}Preview`]: data.slice(0, MAX_DATA_ITEMS)
        };
    };

    const summarizedContext = {
        jobInfo: sessionState.jobInfo,
        settings: sessionState.settings,
        fieldbookNotes: truncateString(sessionState.fieldbookNotes, 1000),
        pointLists: sessionState.pointLists.map(l => ({ id: l.id, name: l.name, pointCount: l.points.length, isVisible: l.isVisible })),
        ...summarizeData(sessionState.lines, 'lines'),
        ...summarizeData(sessionState.cutSheetData, 'cutSheet'),
        centerlines: sessionState.centerlines?.map(cl => ({
            id: cl.id,
            name: cl.name,
            beginStation: cl.beginStation,
            ...summarizeData(cl.pis, 'pis'),
        })),
        cutSheetInfo: sessionState.cutSheetInfo,
        customSymbols: sessionState.customSymbols.map(s => ({ name: s.name, associatedTerms: s.associatedTerms })),

        files: {
            raw: sessionState.rawFile ? { name: sessionState.rawFile.name, content: truncateString(sessionState.rawFile.content, MAX_FILE_CHARS) } : null,
            deed: sessionState.deedFile ? { name: sessionState.deedFile.name, content: truncateString(sessionState.deedFile.content, MAX_FILE_CHARS) } : null,
            dxf: sessionState.dxfFile ? { name: sessionState.dxfFile.name, content: truncateString(sessionState.dxfFile.content, MAX_FILE_CHARS) } : null,
            cl: sessionState.clFile ? { name: sessionState.clFile.name, content: truncateString(sessionState.clFile.content, MAX_FILE_CHARS) } : null,
            plans: sessionState.planFiles?.map(f => ({ name: f.name, content: truncateString(f.content, MAX_FILE_CHARS) })),
            images: sessionState.imageFiles?.map(f => ({ name: f.name, tags: f.tags })),
            generated: sessionState.generatedFiles?.map(f => ({ name: f.name, content: truncateString(f.content, MAX_FILE_CHARS) })),
        },
        
        chatHistories: {
            raw: truncateHistory(sessionState.rawChatHistory),
            deed: truncateHistory(sessionState.deedChatHistory),
            dxf: truncateHistory(sessionState.dxfChatHistory),
            stationing: truncateHistory(sessionState.stationingChatHistory),
            pointEditor: truncateHistory(sessionState.pointEditorChatHistory),
            fieldbook: truncateHistory(sessionState.fieldbookChatHistory),
            gpsStakeout: truncateHistory(sessionState.gpsStakeoutChatHistory),
            planExpert: sessionState.planExpertChatHistory ? truncateHistory(sessionState.planExpertChatHistory) : [],
            imageAnalyzer: sessionState.imageAnalyzerChatHistory ? truncateHistory(sessionState.imageAnalyzerChatHistory) : [],
            // FIX: Add contouring chat history to summarized context for the LSVZ agent.
            contouring: sessionState.contouringChatHistory ? truncateHistory(sessionState.contouringChatHistory) : [],
        }
    };

    return JSON.stringify(summarizedContext, null, 2);
};

const getDynamicLsvzContext = (sessionState: Omit<SessionState, 'version' | 'savedAt' | 'lsvzChatHistory'>, requiredSources: string[]): string => {
    const context: { [key: string]: any } = {};

    const allDataSources = {
        rawFile: sessionState.rawFile,
        deedFile: sessionState.deedFile,
        planFiles: sessionState.planFiles,
        dxfFile: sessionState.dxfFile,
        clFile: sessionState.clFile,
        imageFiles: sessionState.imageFiles,
        gisFile: sessionState.gisFile,
        generatedFiles: sessionState.generatedFiles,
        pointLists: sessionState.pointLists,
        lines: sessionState.lines,
        centerlines: sessionState.centerlines,
        cutSheetData: sessionState.cutSheetData,
        fieldbookNotes: sessionState.fieldbookNotes,
        jobInfo: sessionState.jobInfo,
        settings: sessionState.settings,
        offlineMapAreas: sessionState.offlineMapAreas,
        customSymbols: sessionState.customSymbols,
        rawChatHistory: sessionState.rawChatHistory,
        deedChatHistory: sessionState.deedChatHistory,
        planExpertChatHistory: sessionState.planExpertChatHistory,
        dxfChatHistory: sessionState.dxfChatHistory,
        stationingChatHistory: sessionState.stationingChatHistory,
        pointEditorChatHistory: sessionState.pointEditorChatHistory,
        fieldbookChatHistory: sessionState.fieldbookChatHistory,
        gpsStakeoutChatHistory: sessionState.gpsStakeoutChatHistory,
        imageAnalyzerChatHistory: sessionState.imageAnalyzerChatHistory,
        gisChatHistory: sessionState.gisChatHistory,
        // FIX: Add contouring chat history to dynamic context sources for the LSVZ agent.
        contouringChatHistory: sessionState.contouringChatHistory,
        // FIX: Add profile chat history to dynamic context sources for the LSVZ agent.
        profileChatHistory: sessionState.profileChatHistory,
        cogoChatHistory: sessionState.cogoChatHistory,
        rinexChatHistory: sessionState.rinexChatHistory,
    };

    // If source selection fails or is not specific, provide a summary of available data keys.
    // This helps the model ask clarifying questions if needed.
    if (requiredSources.length === 0) {
        context.dataSourcesAvailable = Object.keys(allDataSources).filter(key => {
            const data = (allDataSources as any)[key];
            if (data === null || data === undefined) return false;
            if (Array.isArray(data) && data.length === 0) return false;
            if (typeof data === 'string' && data.length === 0) return false;
            return true;
        });
        // Always include jobInfo in summary view for basic context.
        context.jobInfo = allDataSources.jobInfo;
        return JSON.stringify(context, null, 2);
    }
    
    // Include only the specifically requested data sources.
    for (const source of requiredSources) {
        if (source in allDataSources) {
            context[source] = (allDataSources as any)[source];
        }
    }

    return JSON.stringify(context, null, 2);
};


const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    
    setMatches(mediaQueryList.matches);

    mediaQueryList.addEventListener('change', listener);
    return () => mediaQueryList.removeEventListener('change', listener);
  }, [query]);

  return matches;
};

const AUTO_MODEL_OPTION = 'auto';
const CURRENT_GEMINI_MODEL = 'gemini-3.7-flash';
const AUTO_FAST_GEMINI_MODEL = AUTO_FAST_MODEL;
const FABLE_5_MODEL_ID = 'claude-fable-5';
const FABLE_5_PERMISSION = 'model:claude-fable-5';
const DEFAULT_AUTO_HIGH_THINKING_MODEL = CURRENT_GEMINI_MODEL;
const LEGACY_GEMINI_MODEL_IDS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-pro',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.6-flash-lite',
  'gemini-3.7-flash-lite',
]);
const REMOVED_MODEL_IDS = new Set(['glm-5.2-fp8', 'nvidia-nemotron-v3-ultra', ...LEGACY_GEMINI_MODEL_IDS]);
const autoHighThinkingOptions = [
  DEFAULT_AUTO_HIGH_THINKING_MODEL,
  'gemini-3.8-flash',
  'claude-sonnet-5',
  'claude-opus-5',
  FABLE_5_MODEL_ID,
];
const RESTRICTED_MODEL_IDS = new Set(['claude-sonnet-5', 'claude-opus-5', FABLE_5_MODEL_ID]);

// BYOK models: require the user's own provider key (browser-direct calls).
const OPENAI_FLAGSHIP_MODEL = 'gpt-5.6-terra';
const OPENAI_FAST_MODEL = 'gpt-5.4-mini';
const GROK_FLAGSHIP_MODEL = 'grok-4.3';
const GROK_FAST_MODEL = 'grok-4.1-fast';

// Human-readable label for a resolved model id, used by the chat-interface
// model badge so users can see exactly which model an agent is running.
const getModelDisplayLabel = (modelName: string): string => (
  modelName === AUTO_MODEL_OPTION ? 'Auto (smart routing)'
  : modelName === 'claude-sonnet-5' ? 'Claude Sonnet 5'
  : modelName === 'claude-opus-5' ? 'Claude Opus 5'
  : modelName === FABLE_5_MODEL_ID ? 'Claude Fable 5'
  : modelName === CURRENT_GEMINI_MODEL ? 'Gemini 3.7 Flash'
  : modelName === AUTO_FAST_GEMINI_MODEL ? 'Gemini 3.5 Flash Lite'
  : modelName === OPENAI_FLAGSHIP_MODEL ? 'GPT-5.6 Terra (your OpenAI key)'
  : modelName === OPENAI_FAST_MODEL ? 'GPT-5.4 Mini (your OpenAI key)'
  : modelName === GROK_FLAGSHIP_MODEL ? 'Grok 4.3 (your xAI key)'
  : modelName === GROK_FAST_MODEL ? 'Grok 4.1 Fast (your xAI key)'
  : modelName
);
const availableModels = [
  AUTO_MODEL_OPTION,
  CURRENT_GEMINI_MODEL,
  'claude-sonnet-5',
  'claude-opus-5',
  FABLE_5_MODEL_ID,
  OPENAI_FLAGSHIP_MODEL,
  OPENAI_FAST_MODEL,
  GROK_FLAGSHIP_MODEL,
  GROK_FAST_MODEL,
];

const normalizeSelectedModel = (model: string | null | undefined): string => {
  if (!model) return AUTO_MODEL_OPTION;
  if (model === AUTO_MODEL_OPTION) return model;
  if (LEGACY_GEMINI_MODEL_IDS.has(model)) return CURRENT_GEMINI_MODEL;
  if (availableModels.includes(model)) return model;
  if (model.startsWith('gemini-')) return CURRENT_GEMINI_MODEL;
  return AUTO_MODEL_OPTION;
};

interface DrawingCanvasHandles {
  zoomExtents: () => void;
  /** Zoom canvas to a specific bounding box (project coordinates). Avoids the "zoom to all geometry" problem when large GIS layers are loaded. */
  zoomToBbox: (minE: number, maxE: number, minN: number, maxN: number, padding?: number) => void;
  redraw: () => void;
  finishDrawing: () => void;
  cancelDeleteMode: () => void;
  confirmDelete: () => void;
  getTransform: () => { scale: number; offsetX: number; offsetY: number };
  setTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}
interface CutSheetPanelHandles {
  downloadDocx: () => void;
}
interface ConfirmationModalState {
  newPoint: SurveyPoint;
  existingPoint: SurveyPoint;
  position: GeolocationPosition; // Need to keep the original position for renumbering
}
interface ProjectionPromptState {
  file: SessionFile;
}

// ============================================================================
// REFACTORING NOTE: parsePointFile and pointListToString now imported from utils/pointFile.ts
// REFACTORING NOTE: addDataButtonLabels, agentConfig, agentThemeColors, etc. now imported from constants/agents.ts
// ============================================================================

// Keep getRandomHighlightColor here as it's not yet extracted
const getRandomHighlightColor = () => {
    const h = Math.random() * 360; // hue
    const s = 90 + Math.random() * 10; // saturation (90-100% for bright colors)
    const l = 65 + Math.random() * 10; // lightness (65-75% for pastel-like highlights)

    const fill = `hsla(${h}, ${s}%, ${l}%, 0.4)`;
    const border = `hsla(${h}, ${s}%, ${l-15}%, 0.8)`; // darker border

    return { fill, border };
};

const generateSitemapXml = (): string => {
    const mainLinks = [
        { url: 'https://landsurv.ai', title: 'Main Application' },
        { url: 'https://about.landsurv.ai', title: 'About LandSurv.ai' },
        { url: 'https://civil3d.landsurv.ai', title: 'Civil 3D Cloud Integration' },
        { url: 'https://release.landsurv.ai', title: 'Release Log' },
        { url: 'https://technologies.landsurv.ai', title: 'Technologies & Licenses' },
        { url: 'https://lsvz.landsurv.ai', title: '.lsvz File Format Documentation' },
        { url: 'https://sitemap.landsurv.ai', title: 'Sitemap' },
        { url: 'https://agents.landsurv.ai', title: 'LandSurv.ai Agents' },
        { url: 'https://legal.landsurv.ai', title: 'Legal & Compliance' },
        { url: 'https://compliance.landsurv.ai', title: 'Security & Compliance Trust Center' },
        { url: 'https://privacy.landsurv.ai', title: 'Privacy Policy' },
        { url: 'https://dpa.landsurv.ai', title: 'Data Processing Addendum' },
        { url: 'https://subprocessors.landsurv.ai', title: 'Subprocessors' },
        { url: 'https://tos.landsurv.ai', title: 'Terms of Service' },
        { url: 'https://donate.landsurv.ai', title: 'Support LandSurv.ai' },
    ];

    const agentLinks = [
        { url: 'https://raw.landsurv.ai', title: 'RAW Crawler Agent' },
        { url: 'https://deed.landsurv.ai', title: 'Boundary Agent (formerly Deed Reader & Plotter)' },
        { url: 'https://plan.landsurv.ai', title: 'Civil Plan Expert Agent' },
        { url: 'https://dxf.landsurv.ai', title: 'DXF Agent' },
        { url: 'https://station.landsurv.ai', title: 'Stationing & CL Agent' },
        { url: 'https://point.landsurv.ai', title: 'Point Editor Agent' },
        { url: 'https://gps.landsurv.ai', title: 'GPS Stakeout Agent' },
        { url: 'https://image.landsurv.ai', title: 'Image Analyzer Agent' },
        { url: 'https://gis.landsurv.ai', title: 'GIS Agent' },
        // FIX: Add sitemap link for the new Contouring Agent.
        { url: 'https://contour.landsurv.ai', title: 'Contouring Agent' },
        // FIX: Add sitemap link for the new Profile Agent.
        { url: 'https://profile.landsurv.ai', title: 'Profile & Cross Section Agent' },
        // FIX: Add sitemap links for COGO and GPX agents.
        { url: 'https://cogo.landsurv.ai', title: 'COGO Agent' },
        { url: 'https://gpx.landsurv.ai', title: 'GPX Data Tools' },
        { url: 'https://rinex.landsurv.ai', title: 'RINEX Agent' },
        { url: 'https://civildrafter.landsurv.ai', title: 'Civil Drafter Agent' },
    ];

    const allLinks = [...mainLinks, ...agentLinks];
    const today = new Date().toISOString().split('T')[0];

    const urls = allLinks.map(link => `
    <url>
        <loc>${link.url}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
};

type PageMode = 'app' | 'landing' | 'xml_sitemap';

// FUTURE GEMINI: This configuration drives the subdomain-based routing for informational pages.
// To add a new informational page, add an entry here and create the corresponding content component.
// Do not change this routing mechanism.
const landingPageConfig = {
    'lsvz': { title: ".lsvz File Format Documentation", content: LsvzDocumentationContent },
    'about': { title: "About LandSurv.ai", content: AboutPageContent },
    'release': { title: "Application Release Log", content: ReleaseLogContent },
    'technologies': { title: "Technologies & Licenses", content: TechnologiesPageContent },
    'sitemap': { title: "Sitemap", content: SitemapPageContent },
    'agents': { title: "LandSurv.ai Agents", content: AgentsPageContent },
    'raw': { title: "RAW Crawler Agent", content: RawAgentContent },
    'deed': { title: "Boundary Agent (formerly Deed Reader & Plotter)", content: DeedAgentContent },
    'plan': { title: "Civil Plan Expert Agent", content: PlanAgentContent },
    'dxf': { title: "DXF Agent", content: DxfAgentContent },
    'station': { title: "Stationing & CL Agent", content: StationAgentContent },
    'point': { title: "Point Editor Agent", content: PointAgentContent },
    'gps': { title: "GPS Stakeout Agent", content: GpsAgentContent },
    'image': { title: "Image Analyzer Agent", content: ImageAgentContent },
    'gis': { title: "GIS Agent", content: GisAgentContent },
    // FIX: Add landing page configuration for the new Contouring Agent.
    'contour': { title: "Contouring Agent", content: ContourAgentContent },
    // FIX: Add landing page configuration for the new Profile Agent.
    'profile': { title: "Profile & Cross Section Agent", content: ProfileAgentContent },
    // FIX: Add landing page configuration for the COGO Agent.
    'cogo': { title: "COGO Agent", content: CogoAgentContent },
    'gpx': { title: "GPX Data Tools", content: GpxAgentContent },
    // RINEX agent subdomain - uses separate React component instead of content wrapper
    'rinex': { title: "RINEX Agent", component: RinexSubdomainPage, isFullPage: true },
    // AR agent subdomain
    'ar': { title: "Augmented Reality Agent", content: ARAgentContent },
    // Civil 3D plugin subdomain - full page landing
    'civil3d': { title: "Civil 3D Cloud Integration", component: Civil3DLandingPage, isFullPage: true },
    // Short alias: c3d.landsurv.ai serves the same Civil 3D landing page
    'c3d': { title: "Civil 3D Cloud Integration", component: Civil3DLandingPage, isFullPage: true },
    // Connector download page
    'connector-download': { title: "LandsurvConnector Download", component: ConnectorDownloadPage, isFullPage: true },
    // DevOps console — proprietary admin surface, not shipped in the OSS/local-mode build.
    ...(isOssBuild() ? {} : { 'devops': { title: "DevOps Console", component: DevOpsConsolePage, isFullPage: true } }),
    // CAD Manager subdomain
    'cadmanager': { title: "CAD Manager - Description Key Builder", content: CadManagerContent },
    // Civil Drafter subdomain
    'civildrafter': { title: "Civil Drafter Agent", content: CivilDrafterContent },
    // 2026 Roadmap subdomain
    '2026': { title: "LandSurv.ai 2026 Roadmap", component: Roadmap2026Page, isFullPage: true },
    // Legal & Compliance subdomain
    'legal': { title: "Legal & Compliance", component: LegalSubdomainPage, isFullPage: true },
    // Security and compliance trust-center subdomain
    'compliance': { title: "Security & Compliance Trust Center", component: ComplianceSubdomainPage, isFullPage: true },
    // Typo alias support for legacy links.
    'complance': { title: "Security & Compliance Trust Center", component: ComplianceSubdomainPage, isFullPage: true },
    // Standards and specifications subdomain
    'standards': { title: "Industry Standards & Specifications", component: StandardsSubdomainPage, isFullPage: true },
    // Privacy Policy subdomain
    'privacy': { title: "Privacy Policy", component: PrivacyPolicySubdomainPage, isFullPage: true },
    // Data Processing Addendum subdomain
    'dpa': { title: "Data Processing Addendum", component: DataProcessingAddendumSubdomainPage, isFullPage: true },
    // Subprocessors subdomain
    'subprocessors': { title: "Subprocessors", component: SubprocessorsSubdomainPage, isFullPage: true },
    // Terms of Service subdomain � full commercial contract layer (companion to /legal)
    'tos': { title: "Terms of Service", component: TosSubdomainPage, isFullPage: true },
    // CACP � Cross-Agent Communications Protocol (open source spec)
    'cacp': { title: "CACP � Cross-Agent Communications Protocol", component: CacpSubdomainPage, isFullPage: true },
    // AI Gateway � Claude/ChatGPT/Grok integration hub (informative + live sandbox)
    'gateway': { title: "LandSurv.ai AI Gateway", component: GatewaySubdomainPage, isFullPage: true },
    // Documentation subdomains
    'documentation': { title: "LandSurv.ai Documentation", component: DocumentationSubdomainPage, isFullPage: true },
    'staging-documentation': { title: "LandSurv.ai Documentation (Staging)", component: DocumentationSubdomainPage, isFullPage: true },
    'docs': { title: "LandSurv.ai Documentation", component: DocumentationSubdomainPage, isFullPage: true },
    'staging-docs': { title: "LandSurv.ai Documentation (Staging)", component: DocumentationSubdomainPage, isFullPage: true },
    // Open Source Initiative & Licenses portal
    'opensource': { title: "Open Source Initiative", component: OpenSourceSubdomainPage, isFullPage: true },
    'staging-opensource': { title: "Open Source Initiative (Staging)", component: OpenSourceSubdomainPage, isFullPage: true },
};

const numberToAlpha = (num: number): string => {
    let alpha = '';
    for (; num > 0; num = Math.floor((num - 1) / 26)) {
        alpha = String.fromCharCode(((num - 1) % 26) + 65) + alpha;
    }
    return alpha;
};

// FIX: A robust, single download function to replace all uses of `showSaveFilePicker` and legacy fallbacks.
// Hardened: guards against empty/invalid blobs and defers URL revocation so the browser has time to
// start streaming the download. Revoking synchronously after click() can cancel the download and is a
// common cause of "save file not working / nothing downloads".
const triggerDownload = (blob: Blob, fileName: string) => {
    if (!blob || !(blob instanceof Blob)) {
        throw new Error('Download failed: no data was produced.');
    }
    if (blob.size === 0) {
        throw new Error('Download failed: the generated file is empty (0 bytes).');
    }

    const safeName = (fileName && fileName.trim()) || 'download';

    const legacySave = (navigator as unknown as {
        msSaveOrOpenBlob?: (b: Blob, name: string) => boolean;
    }).msSaveOrOpenBlob;
    if (typeof legacySave === 'function') {
        legacySave.call(navigator, blob, safeName);
        return;
    }

    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = safeName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        // Defer revocation so the browser has time to begin the download.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
};

/**
 * Andrew's monotone-chain 2-D convex hull on (easting=x, northing=y).
 * Returns hull vertices in CCW order without duplicates / colinear vertices.
 * Shared by the cogo_shrinkwrap CACP handler and the live recompute effect.
 */
function computeConvexHullPoints<T extends { easting: number; northing: number }>(pts: T[]): T[] {
  if (pts.length < 3) return pts.slice();
  const sorted = [...pts].sort((a, b) =>
    a.easting === b.easting ? a.northing - b.northing : a.easting - b.easting
  );
  const cross = (o: T, a: T, b: T) =>
    (a.easting - o.easting) * (b.northing - o.northing) -
    (a.northing - o.northing) * (b.easting - o.easting);
  const lower: T[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: T[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * 2-D segment intersection test (proper interior crossings only � shared
 * endpoints don't count). Used by the concave-hull walker to reject candidate
 * edges that would cross previously-laid hull segments.
 */
function _segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/**
 * Concave hull (Moreira-Santos KNN algorithm).
 *
 * Walks the point cloud from the lowest point, at each step choosing the
 * neighbor that produces the largest right-hand (clockwise) turn from among
 * the K nearest unvisited candidates � and skipping any candidate whose edge
 * would intersect a prior hull segment. K controls concavity:
 *   - Small K (3-5)  ? very tight, follows every notch (can self-cross on dense
 *                       clouds ? falls back to a larger K).
 *   - Medium K (10-20) ? typical "wraps the boundary" surveyor look.
 *   - Large K (>50)   ? asymptotically equals the convex hull.
 *
 * If the walker dead-ends or produces a degenerate hull at the requested K,
 * K is incremented and retried. On total failure the convex hull is returned
 * so the user is never left with no boundary at all.
 */
function computeConcaveHullPoints<T extends { easting: number; northing: number }>(
  pts: T[],
  k: number,
): T[] {
  if (pts.length < 3) return pts.slice();
  // Dedupe by xy � duplicate points break the angle-sort and the visited set.
  const seen = new Map<string, T>();
  for (const p of pts) seen.set(`${p.easting.toFixed(4)},${p.northing.toFixed(4)}`, p);
  const unique = Array.from(seen.values());
  if (unique.length < 3) return unique;
  if (unique.length === 3) return unique;

  const startK = Math.max(3, Math.min(k, unique.length - 1));

  const tryHull = (kk: number): T[] | null => {
    // Start at the bottom-most point (tie-break leftmost) � guaranteed to be on
    // the boundary, and the initial "previous direction" of due-west gives a
    // deterministic first step.
    let startIdx = 0;
    for (let i = 1; i < unique.length; i++) {
      const p = unique[i];
      const s = unique[startIdx];
      if (p.northing < s.northing || (p.northing === s.northing && p.easting < s.easting)) startIdx = i;
    }
    const start = unique[startIdx];
    const hull: T[] = [start];
    const visited = new Set<T>([start]);
    let current = start;
    // Initial previous-direction: pointing west, so first right-turn selects
    // the candidate nearest to "south of east" ? which on a bottom-start means
    // the rightmost candidate, kicking off a CCW traversal.
    let prevAngle = Math.PI;
    let step = 2;

    while (step <= unique.length) {
      // Re-admit the start point after 3 steps so the walker can close the ring.
      if (step === 5) visited.delete(start);

      // K nearest unvisited candidates.
      const candidates = unique
        .filter(p => p !== current && !visited.has(p))
        .map(p => ({
          pt: p,
          dist: Math.hypot(p.easting - current.easting, p.northing - current.northing),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, kk);

      if (candidates.length === 0) return null;

      // Sort by right-hand (clockwise) turn from the previous-direction vector.
      const angled = candidates
        .map(c => {
          const ang = Math.atan2(c.pt.northing - current.northing, c.pt.easting - current.easting);
          let turn = prevAngle - ang;
          while (turn <= 0) turn += 2 * Math.PI;
          while (turn > 2 * Math.PI) turn -= 2 * Math.PI;
          return { ...c, turn };
        })
        .sort((a, b) => a.turn - b.turn);

      // Pick the first candidate whose edge doesn't cross any prior hull edge.
      let chosen: typeof angled[number] | null = null;
      for (const cand of angled) {
        let intersects = false;
        // Skip the immediately-previous edge (shared endpoint) � check all
        // earlier edges only.
        for (let i = 0; i < hull.length - 1; i++) {
          if (_segmentsIntersect(
            current.easting, current.northing,
            cand.pt.easting, cand.pt.northing,
            hull[i].easting, hull[i].northing,
            hull[i + 1].easting, hull[i + 1].northing,
          )) { intersects = true; break; }
        }
        if (!intersects) { chosen = cand; break; }
      }
      if (!chosen) return null;

      if (chosen.pt === start) {
        // Closed the ring.
        return hull;
      }

      hull.push(chosen.pt);
      visited.add(chosen.pt);
      prevAngle = Math.atan2(
        current.northing - chosen.pt.northing,
        current.easting - chosen.pt.easting,
      );
      current = chosen.pt;
      step++;
    }
    return null;
  };

  // Auto-retry with larger K when the requested K dead-ends. Cap retries so we
  // never spend more than ~10 attempts on very stubborn clouds.
  const maxAttempts = Math.min(10, unique.length - startK);
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const kk = Math.min(unique.length - 1, startK + attempt);
    const result = tryHull(kk);
    if (result && result.length >= 3) return result;
  }
  // Last-resort fallback � convex hull is always defined.
  return computeConvexHullPoints(pts);
}

// FIX: Changed to a named export to resolve the module resolution error in index.tsx.
// REFACTORING: Split into AppContent (uses context) and App (provides context)
const AppContent = () => {
  const APP_VERSION = APP_VERSION_CONST;
  
  // ============================================================================
  // REFACTORING: Use FileStateContext (Strangler Pattern - Phase 1)
  // ============================================================================
  const {
    rawFile, setRawFile,
    deedFile, setDeedFile,
    planFiles, setPlanFiles,
    dxfFile, setDxfFile,
    clFile, setClFile,
    imageFiles, setImageFiles,
    gisFile, setGisFile,
    // FIX: Added state for GIS features
    gisFeatures, setGisFeatures,
    generatedFiles, setGeneratedFiles,
    pdfViewerFiles, setPdfViewerFiles,
    addGeneratedFile,
    addGeneratedFiles,
    addPlanFiles,
    addImageFiles,
  } = useFileState();
  
  // ============================================================================
  // REFACTORING: Use ChatStateContext (Strangler Pattern - Phase 3)
  // ============================================================================
  const {
    rawChat, setRawChat,
    deedChat, setDeedChat,
    dxfChat, setDxfChat,
    stationingChat, setStationingChat,
    pointEditorChat, setPointEditorChat,
    gpsStakeoutChat, setGpsStakeoutChat,
    lsvzChat, setLsvzChat,
    planExpertChat, setPlanExpertChat,
    imageAnalyzerChat, setImageAnalyzerChat,
    gisChat, setGisChat,
    contouringChat, setContouringChat,
    steepSlopeChat, setSteepSlopeChat,
    profileChat, setProfileChat,
    cogoChat, setCogoChat,
    rinexChat, setRinexChat,
    droneChat, setDroneChat,
    rawChatHistory, setRawChatHistory,
    deedChatHistory, setDeedChatHistory,
    dxfChatHistory, setDxfChatHistory,
    stationingChatHistory, setStationingChatHistory,
    pointEditorChatHistory, setPointEditorChatHistory,
    fieldbookLog, setFieldbookLog,
    gpsStakeoutChatHistory, setGpsStakeoutChatHistory,
    lsvzChatHistory, setLsvzChatHistory,
    planExpertChatHistory, setPlanExpertChatHistory,
    imageAnalyzerChatHistory, setImageAnalyzerChatHistory,
    gisChatHistory, setGisChatHistory,
    contouringChatHistory, setContouringChatHistory,
    steepSlopeChatHistory, setSteepSlopeChatHistory,
    profileChatHistory, setProfileChatHistory,
    cogoChatHistory, setCogoChatHistory,
    rinexChatHistory, setRinexChatHistory,
    droneChatHistory, setDroneChatHistory,
    arChat, setArChat,
    arChatHistory, setArChatHistory,
    zoningChat, setZoningChat,
    zoningChatHistory, setZoningChatHistory,
    titleSearchChat, setTitleSearchChat,
    titleSearchChatHistory, setTitleSearchChatHistory,
    civilDrafterChat, setCivilDrafterChat,
    civilDrafterChatHistory, setCivilDrafterChatHistory,
    cadManagerChat, setCadManagerChat,
    cadManagerChatHistory, setCadManagerChatHistory,
    standardsComplianceChat, setStandardsComplianceChat,
    standardsComplianceChatHistory, setStandardsComplianceChatHistory,
    structuresChat, setStructuresChat,
    structuresChatHistory, setStructuresChatHistory,
    soilsChat, setSoilsChat,
    soilsChatHistory, setSoilsChatHistory,
    fieldbookNotes, setFieldbookNotes,
  } = useChatState();
  
  // REFACTORING NOTE: UI state moved to UIStateContext
  const {
    pageMode, setPageMode,
    landingContent, setLandingContent,
    showWelcome, setShowWelcome,
    isInitialScreen, setIsInitialScreen,
    isAddingData, setIsAddingData,
    isLoading, setIsLoading,
    isSessionLoading, setIsSessionLoading,
    error, setError,
    isDocVisible, setIsDocVisible,
    isTechPageVisible, setIsTechPageVisible,
    isCivil3DPageVisible, setIsCivil3DPageVisible,
    isInvestorFormVisible, setIsInvestorFormVisible,
    isReleaseLogVisible, setIsReleaseLogVisible,
    isHelpModalVisible, setIsHelpModalVisible,
    isSettingsVisible, setIsSettingsVisible,
    isAboutVisible, setIsAboutVisible,
    isForwardThinkingVisible, setIsForwardThinkingVisible,
    isDisclaimerVisible, setIsDisclaimerVisible,
    isLegalPageVisible, setIsLegalPageVisible,
    isDxfExportModalOpen, setIsDxfExportModalOpen,
    isMobileMenuOpen, setIsMobileMenuOpen,
    projectionPrompt, setProjectionPrompt,
    confirmationModal, setConfirmationModal,
    isVisualPanelFullscreen, setIsVisualPanelFullscreen,
    isPdfViewerFullscreen, setIsPdfViewerFullscreen,
    isStationingPanelExpanded, setIsStationingPanelExpanded,
    isPointEditorExpanded, setIsPointEditorExpanded,
    isChatPanelVisible, setIsChatPanelVisible,
    toggleChatPanel,
    activeVisualPanel, setActiveVisualPanel,
    isResizingPointEditor, setIsResizingPointEditor,
    pointEditorHeight, setPointEditorHeight,
    chatPanelWidth, setChatPanelWidth,
    isResizingChat, setIsResizingChat,
    fabPosition, setFabPosition,
    navigationHistory, pushNavigation, goBack, canGoBack,
  } = useUIState();
  
  // REFACTORING NOTE: Canvas and geometry state moved to CanvasStateContext
  const {
    pointLists, setPointLists,
    lines, setLines,
    contourLabels, setContourLabels,
    profileData, setProfileData,
    profileInfo, setProfileInfo,
    centerlines, setCenterlines,
    linesVisible, setLinesVisible,
    centerlinesVisible, setCenterlinesVisible,
    cadLayerVisibility, setCadLayerVisibility,
    cadLayerColors, setCadLayerColors,
    points,
    pointMap,  // Fast O(1) lookup by point number for lightning-fast line drawing
    visibleLines,
    visibleCenterlines,
    wmsServices, setWmsServices,
    activeWmsLayers, setActiveWmsLayers,
    offlineMapAreas, setOfflineMapAreas,
    customSymbols, setCustomSymbols,
    customAnnotations, setCustomAnnotations,
    closureReports, setClosureReports,
    steepSlopeRuns, setSteepSlopeRuns,
    cutSheetData, setCutSheetData,
    cutSheetInfo, setCutSheetInfo,
    attributeScale, setAttributeScale,
    lineLabelScale, setLineLabelScale,
    dimensionScale, setDimensionScale,
    symbolScale, setSymbolScale,
    annotationScale, setAnnotationScale,
    lineThickness, setLineThickness,
    isLayerPanelOpen, setIsLayerPanelOpen,
    zoomTarget, setZoomTarget,
    pendingPointDeletes, setPendingPointDeletes,
    pointLayers, setPointLayers,
    highlights, setHighlights,
    zoomTargetHighlightId, setZoomTargetHighlightId,
    addHighlights,
    clearHighlights,
    goToHighlight,
    contourSettings, setContourSettings,
    isGeneratingContours, setIsGeneratingContours,
    currentPosition, setCurrentPosition,
    geolocationError, setGeolocationError,
    stakeoutTargetPointNumber, setStakeoutTargetPointNumber,
    suggestedQuestions, setSuggestedQuestions,
    nextAvailablePointNumber, setNextAvailablePointNumber,
    orientationTuple, setOrientationTuple,
    canUndo, canRedo, undo, redo, pushHistory,
  } = useCanvasState();

  const canvasHistory = useCanvasHistory();
  const { beginTransaction, commitTransaction, undoLabel, redoLabel } = canvasHistory;
  useUndoShortcuts({ undo, redo, canUndo, canRedo });
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  
  // REFACTORING NOTE: Application-level state moved to AppStateContext
  const {
    jobInfo, setJobInfo,
    settings, setSettings,
    initializedAgents, setInitializedAgents,
    textEditorContent, setTextEditorContent,
    activeTextEditorFile, setActiveTextEditorFile,
    hasUnsavedChanges, setHasUnsavedChanges,
    activeAgent, setActiveAgent,
    lastActiveAgent, setLastActiveAgent,
    activeModel, setActiveModel,
    thinkingTime, setThinkingTime,
    notifications: appNotifications,
    addNotification,
    reportError,
    dismissNotification,
    clearNotifications,
  } = useAppState();
  const [isSessionSaveModalOpen, setIsSessionSaveModalOpen] = useState(false);

  // ERROR ROUTING: Mirror the legacy global `error` state into the unified
  // reporter. Every `setError('...')` now surfaces in the notification bell;
  // when the bell is out of scope (landing / subdomain / pre-mount), the
  // reporter also raises the red FloatingErrorBanner via GlobalErrorDialog.
  // The in-shell red banner has been removed so in-scope errors are bell-only.
  useEffect(() => {
    if (!error) return;
    const clean = error.replace(/^\s*(Initialization\s+Error|Error):\s*/i, '').trim();
    reportError({
      title: 'Error',
      message: clean || error,
      kind: 'app-error',
      dedupeKey: `app-error:${error}`,
      autoDismissMs: 8000,
    });
  }, [error, reportError]);

  // Mirror geolocation errors (GPS/stakeout) into the notification bell too.
  useEffect(() => {
    if (!geolocationError) return;
    reportError({
      title: 'Location error',
      message: geolocationError,
      kind: 'geolocation-error',
      dedupeKey: `geolocation-error:${geolocationError}`,
      autoDismissMs: 8000,
    });
  }, [geolocationError, reportError]);
  
  // CAD Manager state for C3D sync
  const cadManagerContext = useCadManager();
  const cadManagerState = cadManagerContext.state;
  const cadStandardsLoaded = Boolean(cadManagerContext.state.standard?.codes?.length);
  
  // --- CORE STATE MANAGEMENT ---
  // FUTURE GEMINI: The state variables below are the single source of truth for the application.
  // - `pageMode` and `landingContent` handle the subdomain routing for info pages.
  // - `activeAgent` is the most important state for controlling the UI and agent logic.
  // - Data states (`rawFile`, `pointLists`, etc.) hold all project data.
  // - Chat history states (`rawChatHistory`, etc`) persist conversations for each agent.
  // When adding new state, consider if it needs to be saved in the session file (`.lsvz`).
  // REFACTORING NOTE: Page and Navigation state moved to UIStateContext (see above)
  // OLD: const [pageMode, setPageMode] = useState<PageMode | null>(null);
  // OLD: const [landingContent, setLandingContent] = useState<{title: string, content: React.FC<any>} | null>(null);
  // OLD: const [showWelcome, setShowWelcome] = useState<boolean>(true);
  // OLD: const [isInitialScreen, setIsInitialScreen] = useState(true);
  // OLD: const [isAddingData, setIsAddingData] = useState(false);

  // --- LEGAL AGREEMENT GATE (v26.05.17.15) ---
  // On first agent click (after splash + API key) we block the user with a
  // signature form. Persisted in localStorage so it appears only once per device.
  const [showLegalGate, setShowLegalGate] = useState(false);
  const pendingLegalLaunchRef = useRef<'blank' | 'sample' | 'existing' | null>(null);
  const [hasLegalSignature, setHasLegalSignature] = useState<boolean>(() => {
    try { return hasSignedLegalAgreement(); } catch { return false; }
  });

  // --- FLOOD AGENT (v26.05.17.16) ---
  // Pilot floating-dialog UX. The panel is visible whenever activeAgent ===
  // FLOOD_AGENT (auto-shown on agent activation) and can be closed/re-opened
  // independently of the docked sidebar.
  const [isFloodPanelVisible, setIsFloodPanelVisible] = useState(false);
  const [isFetchingFlood, setIsFetchingFlood] = useState(false);
  const [lastFloodResult, setLastFloodResult] = useState<{ zoneCounts: Record<string, number>; featureCount: number } | null>(null);
  // FIRMETTE (v26.05.19.1) � cached FEMA NFHL map image stored in session.
  const [floodFirmetteData, setFloodFirmetteData] = useState<{ url: string; bbox: string; fetchedAt: string; imageDataUrl?: string } | null>(null);
  const [isFetchingFirmette, setIsFetchingFirmette] = useState(false);
  const [isFirmetteViewerVisible, setIsFirmetteViewerVisible] = useState(false);

  // STRUCTURES_AGENT � auto-shown floating panel; mirrors Flood Agent pattern.
  const [isStructuresPanelVisible, setIsStructuresPanelVisible] = useState(false);
  const [isFetchingStructures, setIsFetchingStructures] = useState(false);
  const [isSynthesizingStructures, setIsSynthesizingStructures] = useState(false);
  const [lastStructuresResult, setLastStructuresResult] = useState<import('./services/structuresService.ts').StructuresFetchResult | null>(null);
  // v26.05.31 � OSM building footprints (real polygons) joined with NSI attributes
  // populate the rectifier. Stored as `osmFootprints` so subsequent rectify
  // calls don't refetch. `lastRectifyStats` is surfaced in the panel UI.
  const [lastOsmFootprints, setLastOsmFootprints] = useState<
    Array<import('./services/osmBuildingsService.ts').BuildingFootprint & {
      nsi?: import('./services/structuresService.ts').NsiStructureProps & { matchedCount?: number; pointNumbers?: string[] };
    }> | null
  >(null);
  const [lastRectifyStats, setLastRectifyStats] = useState<import('./services/buildingRectifier.ts').RectifyStats | null>(null);

  // SOILS_AGENT � auto-shown floating panel; mirrors Structures Agent pattern.
  const [isSoilsPanelVisible, setIsSoilsPanelVisible] = useState(false);
  const [isFetchingSoils, setIsFetchingSoils] = useState(false);
  const [isFetchingSoilReport, setIsFetchingSoilReport] = useState(false);
  const [lastSoilsResult, setLastSoilsResult] = useState<import('./services/soilsService.ts').SoilsFetchResult | null>(null);
  const [soilMapUnits, setSoilMapUnits] = useState<SoilMapUnit[]>([]);
  const [soilReportData, setSoilReportData] = useState<Record<string, { hydgrpdcd?: string; drclassdcd?: string; taxclname?: string; farmlndcl?: string }> | null>(null);

  const DEFAULT_STANDARDS_CHECKS: StandardsComplianceCheckSelection = {
    title_block: true,
    north_arrow: true,
    annotation_completeness: true,
    required_layers: true,
    linetype_compliance: true,
    scale_and_sheet_metadata: true,
    legend_symbol_consistency: true,
    revision_block: true,
  };
  const [standardsComplianceControlFile, setStandardsComplianceControlFile] = useState<SessionFile | null>(null);
  const [standardsComplianceSubjectFile, setStandardsComplianceSubjectFile] = useState<SessionFile | null>(null);
  const [standardsComplianceSourceMode, setStandardsComplianceSourceMode] = useState<ComplianceSourceMode>('ask-each-run');
  const [standardsComplianceChecks, setStandardsComplianceChecks] = useState<StandardsComplianceCheckSelection>(DEFAULT_STANDARDS_CHECKS);
  const [standardsComplianceLastReport, setStandardsComplianceLastReport] = useState<StandardsComplianceReport | null>(null);
  const [isStandardsComplianceRunning, setIsStandardsComplianceRunning] = useState(false);

  // PROFILE_AGENT � direct UI panel (no AI round-trip; client-side generateProfile).
  const [isProfileGenPanelVisible, setIsProfileGenPanelVisible] = useState(false);

  // STREET LABELS (v26.05.19.4) � named road text objects aligned with road bearing.
  const [streetLabels, setStreetLabels] = useState<import('./types.ts').StreetLabel[]>([]);
  const [isFetchingStreetLabels, setIsFetchingStreetLabels] = useState(false);

  // PARCEL LABELS (v26.05.19.15) � GIS parcel centroid annotations with N/F owner.
  const [parcelLabels, setParcelLabels] = useState<ParcelLabel[]>([]);

  // ANNOTATION CATEGORIES (v26.05.19.15) � per-category style overrides.
  const [annotationCategories, setAnnotationCategories] = useState<AnnotationCategoryStyle[]>(DEFAULT_ANNOTATION_CATEGORIES);

  // PARCEL LABEL FORMATTER � Boundary Agent parcel label field include/exclude + typography controls.
  const [parcelLabelFormatter, setParcelLabelFormatter] = useState<ParcelLabelFormatter>(DEFAULT_PARCEL_LABEL_FORMATTER);
  // CAD Manager text style catalog (falls back to built-in parcel-owner presets when no standard is loaded).
  const parcelCadTextStyles: ParcelCadTextStyle[] = (cadManagerState.standard?.textStyles && cadManagerState.standard.textStyles.length > 0)
    ? cadManagerState.standard.textStyles
    : DEFAULT_PARCEL_CAD_TEXT_STYLES;

  // --- DATA STATE: Files, Job Info, Settings ---
  // REFACTORING NOTE: File state moved to FileStateContext (see top of component)
  // OLD: const [rawFile, setRawFile] = useState<SessionFile | null>(null);
  // OLD: const [deedFile, setDeedFile] = useState<SessionFile | null>(null);
  // OLD: const [planFiles, setPlanFiles] = useState<SessionFile[] | null>(null);
  // OLD: const [dxfFile, setDxfFile] = useState<SessionFile | null>(null);
  // OLD: const [clFile, setClFile] = useState<SessionFile | null>(null);
  // OLD: const [imageFiles, setImageFiles] = useState<SessionFile[] | null>(null);
  // OLD: const [gisFile, setGisFile] = useState<SessionFile | null>(null);
  // OLD: const [generatedFiles, setGeneratedFiles] = useState<SessionFile[]>([]);
  // OLD: const [pdfViewerFiles, setPdfViewerFiles] = useState<SessionFile[] | null>(null);
  
  // REFACTORING NOTE: Job info and settings moved to AppStateContext (see top of component)
  // OLD: const [jobInfo, setJobInfo] = useState<JobInfo>({ jobName: 'Project Name', jobNo: 'Project No.'});
  // OLD: const [settings, setSettings] = useState<Settings>({ ... });

  // --- DATA STATE: AI Chat & Histories ---
  // REFACTORING NOTE: Chat state moved to ChatStateContext (see top of component)
  // OLD: const [rawChat, setRawChat] = useState<Chat | null>(null);
  // OLD: const [deedChat, setDeedChat] = useState<Chat | null>(null);
  // OLD: const [dxfChat, setDxfChat] = useState<Chat | null>(null);
  // OLD: const [stationingChat, setStationingChat] = useState<Chat | null>(null);
  // OLD: const [pointEditorChat, setPointEditorChat] = useState<Chat | null>(null);
  // OLD: const [gpsStakeoutChat, setGpsStakeoutChat] = useState<Chat | null>(null);
  // OLD: const [lsvzChat, setLsvzChat] = useState<Chat | null>(null);
  // OLD: const [planExpertChat, setPlanExpertChat] = useState<Chat | null>(null);
  // OLD: const [imageAnalyzerChat, setImageAnalyzerChat] = useState<Chat | null>(null);
  // OLD: const [gisChat, setGisChat] = useState<Chat | null>(null);
  // OLD: const [contouringChat, setContouringChat] = useState<Chat | null>(null);
  // OLD: const [profileChat, setProfileChat] = useState<Chat | null>(null);
  // OLD: const [rawChatHistory, setRawChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [deedChatHistory, setDeedChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [dxfChatHistory, setDxfChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [stationingChatHistory, setStationingChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [pointEditorChatHistory, setPointEditorChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [fieldbookLog, setFieldbookLog] = useState<ChatMessage[]>([]);
  // OLD: const [gpsStakeoutChatHistory, setGpsStakeoutChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [lsvzChatHistory, setLsvzChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [planExpertChatHistory, setPlanExpertChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [imageAnalyzerChatHistory, setImageAnalyzerChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [gisChatHistory, setGisChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [contouringChatHistory, setContouringChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [profileChatHistory, setProfileChatHistory] = useState<ChatMessage[]>([]);
  // OLD: const [fieldbookNotes, setFieldbookNotes] = useState<string>('');
  
  // --- UI & LOADING STATE ---
  // REFACTORING NOTE: UI and loading state moved to UIStateContext (see top of component)
  // OLD: const [isLoading, setIsLoading] = useState<boolean>(false);
  // OLD: const [isSessionLoading, setIsSessionLoading] = useState<boolean>(false);
  // OLD: const [error, setError] = useState<string | null>(null);
  
  // REFACTORING NOTE: initializedAgents moved to AppStateContext (see top of component)
  // OLD: const [initializedAgents, setInitializedAgents] = useState<Set<AgentType>>(new Set());
  
  // --- DATA STATE: Geometric & Tabular Data ---
  // REFACTORING NOTE: Canvas and geometry state moved to CanvasStateContext (see top of component)
  // OLD: const [pointLists, setPointLists] = useState<PointList[]>([...]);
  // OLD: const [lines, setLines] = useState<SurveyLine[]>([]);
  // OLD: const [contourLabels, setContourLabels] = useState<ContourLabel[]>([]);
  // OLD: const [profileData, setProfileData] = useState<ProfilePoint[]>([]);
  // OLD: const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  // OLD: const [centerlines, setCenterlines] = useState<Centerline[]>([]);
  // OLD: const [wmsServices, setWmsServices] = useState<WmsService[]>([]);
  // OLD: const [activeWmsLayers, setActiveWmsLayers] = useState<ActiveWmsLayer[]>([]);
  // OLD: const [offlineMapAreas, setOfflineMapAreas] = useState<OfflineMapArea[]>([]);
  // OLD: const [customSymbols, setCustomSymbols] = useState<CustomSymbol[]>([defaultSymbol]);
  // OLD: const [closureReports, setClosureReports] = useState<ClosureReport[]>([]);
  // OLD: const [linesVisible, setLinesVisible] = useState(true);
  // OLD: const [centerlinesVisible, setCenterlinesVisible] = useState(true);
  // OLD: const points = useMemo(...);
  // OLD: const visibleLines = useMemo(...);
  // OLD: const visibleCenterlines = useMemo(...);
  // OLD: const [cutSheetData, setCutSheetData] = useState<CutSheetRow[]>([]);
  // OLD: const [cutSheetInfo, setCutSheetInfo] = useState<CutSheetInfo>({...});
  // OLD: const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  // OLD: const [nextAvailablePointNumber, setNextAvailablePointNumber] = useState<string>('1');
  
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  // --- UI STATE: Panels and View Management ---
  // REFACTORING NOTE: UI state moved to UIStateContext (see top of component)
  // OLD: const [activeVisualPanel, setActiveVisualPanel] = useState<VisualPanel>('canvas');
  // REFACTORING NOTE: Text editor state moved to AppStateContext (see top of component)
  // OLD: const [textEditorContent, setTextEditorContent] = useState('');
  // OLD: const [activeTextEditorFile, setActiveTextEditorFile] = useState<string | null>(null);
  // OLD: const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // REFACTORING NOTE: pdfViewerFiles moved to FileStateContext (see top of component)
  // OLD: const [pdfViewerFiles, setPdfViewerFiles] = useState<SessionFile[] | null>(null);
  // REFACTORING NOTE: PDF highlights and GPS state moved to CanvasStateContext (see top of component)
  // OLD: const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  // OLD: const [zoomTargetHighlightId, setZoomTargetHighlightId] = useState<string | null>(null);
  // OLD: const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  // OLD: const [geolocationError, setGeolocationError] = useState<string | null>(null);
  // OLD: const [stakeoutTargetPointNumber, setStakeoutTargetPointNumber] = useState<string>('');



  // --- UI STATE: Modals and Menus ---
  // REFACTORING NOTE: Modal visibility moved to UIStateContext (see top of component)
  // OLD: const [isDocVisible, setIsDocVisible] = useState<boolean>(false);
  // OLD: const [isTechPageVisible, setIsTechPageVisible] = useState<boolean>(false);
  // OLD: const [isInvestorFormVisible, setIsInvestorFormVisible] = useState<boolean>(false);
  // OLD: const [isReleaseLogVisible, setIsReleaseLogVisible] = useState<boolean>(false);
  // OLD: const [isHelpModalVisible, setIsHelpModalVisible] = useState<boolean>(false);
  // OLD: const [isSettingsVisible, setIsSettingsVisible] = useState<boolean>(false);
  // OLD: const [isAboutVisible, setIsAboutVisible] = useState<boolean>(false);
  // OLD: const [isDisclaimerVisible, setIsDisclaimerVisible] = useState<boolean>(false);
  // OLD: const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // OLD: const [isDxfExportModalOpen, setIsDxfExportModalOpen] = useState(false);
  // OLD: const [projectionPrompt, setProjectionPrompt] = useState<ProjectionPromptState | null>(null);

  // CACP manifest viewer modal � opened by clicking the CacpBadge.
  const [cacpManifestAgent, setCacpManifestAgent] = useState<AgentType | null>(null);

  // Boundary files � created when the Boundary Agent generates a traverse; linked to canvas editor
  const [boundaryFiles, setBoundaryFiles] = useState<BoundaryFile[]>([]);
  // Boundary files live in App state rather than CanvasStateContext, so they opt
  // into undo/redo explicitly. Without this, editing a deed traverse would not be
  // undoable even though the points and lines it produces are.
  useHistorySlice('boundaryFiles', boundaryFiles, setBoundaryFiles);
  const [isBoundaryEditorVisible, setIsBoundaryEditorVisible] = useState(false);
  /** Bumped each time the user clicks "Align" in the BoundaryEditor. The token
   *  forces DrawingCanvas to re-arm the boundary-align tool even when the same
   *  movableBfId is requested twice in a row. */
  const [boundaryAlignRequest, setBoundaryAlignRequest] = useState<{ token: number; movableBfId: string } | null>(null);
  /** Arms the canvas corner-align tool: pick deed corners, then the found points they belong on. */
  const [boundaryCornerAlignRequest, setBoundaryCornerAlignRequest] = useState<{ token: number; movableBfId: string } | null>(null);
  /** Currently-active boundary file in the editor. Lifted from BoundaryEditor so
   *  newly-computed tracts can be auto-selected and so the canvas can render the
   *  active file in a distinct color (blue) vs inactive (amber). */
  const [activeBoundaryFileId, setActiveBoundaryFileId] = useState<string>('');
  /** When true, the BFOverlay bearing labels for the active boundary use the
   *  rotated (as-drawn) bearing instead of the original deed bearing. Toggled
   *  from BoundaryEditor and only meaningful when the active file has a
   *  non-zero rotationDeg. */
  const [showRotatedBearings, setShowRotatedBearings] = useState<boolean>(false);
  /** IDs of boundary files in the most-recently-ingested deed batch � shown in the DeedSummaryPanel. */
  const [deedSummaryFileIds, setDeedSummaryFileIds] = useState<string[]>([]);
  /** Lightweight document-level summary produced immediately after deed upload
   *  by the cheap `summarizeDeed()` pass. Drives the "Pending Tracts" list in
   *  the DeedSummaryPanel � each entry gets a per-tract Compute Preview button
   *  that triggers the heavy DEED_READER parse on demand. */
  const [deedSummary, setDeedSummary] = useState<DeedSummary | null>(null);
  /** Set of summary `tractId`s whose DEED_READER parse is currently in flight,
   *  so the panel can disable the button + show a spinner. */
  const [computingTractIds, setComputingTractIds] = useState<Set<string>>(new Set());
  /** TractId of the most-recently-requested per-tract parse � used to tag the
   *  resulting BoundaryFile(s) with `sourceTractId` so the summary panel can
   *  mark that row as ? computed. Cleared after the next BF batch arrives. */
  const pendingTractIdRef = useRef<string | null>(null);
  /** Optional POB the user typed in for the pending tract being computed.
   *  Stamped onto the resulting BoundaryFile as `pobOverride` so the amber
   *  preview anchors where the user wants (instead of (0,0)). */
  const pendingTractPobRef = useRef<{ easting: number; northing: number } | null>(null);

  // Legal Writer panel state � populated when "Write Legal" is pressed on a
  // boundary file; cleared when user navigates away. The panel itself owns
  // edit state for the text; we only retain the seed + the source fileId
  // so Regenerate can re-run writeLegalDescription with new style prefs.
  const [legalWriterState, setLegalWriterState] = useState<{
    fileId: string;
    fileName: string;
    text: string;
    stylePrefs: import('./types.ts').LegalWriterStylePrefs;
  } | null>(null);

  // Drafting Style Library � CAD Manager sub-tool for training the Civil Drafter.
  const [draftingStyleLibrary, setDraftingStyleLibrary] = useState<DraftingStyleEntry[]>([]);

  // Closure investigation modal � combines deterministic geometry findings
  // with a source-aware deed review. Changes remain inert until confirmed.
  const [closureInvestigation, setClosureInvestigation] = useState<{
    fileId: string;
    fileName: string;
    ambiguities: import('./types.ts').Ambiguity[];
    reviewStatus: 'loading' | 'complete' | 'unavailable';
    humanReview?: DeedClosureReview;
    reviewError?: string;
  } | null>(null);

  // Floating point list panel (canvas toolbar)
  const [isPointListPanelVisible, setIsPointListPanelVisible] = useState(false);
  // Pulses the point list toolbar button pink to hint the user can open the floating
  // list (set when entering the Point Editor or after points are uploaded).
  const [isPointListButtonPulsing, setIsPointListButtonPulsing] = useState(false);
  const [isBoundaryEditorButtonPulsing, setIsBoundaryEditorButtonPulsing] = useState(false);

  // Floating Data Visibility panel (canvas toolbar Layers button)
  const [dataVisibilityPos, setDataVisibilityPos] = useState<{ x: number; y: number } | null>(null);
  const dataVisibilityDragState = React.useRef<{ dragging: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({ dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  // Active drawing layer � used when manually drawing polylines
  const [activeDrawingLayer, setActiveDrawingLayer] = useState<string>('');

  // Annotation dimensions � aligned dimension annotations drawn on the canvas
  const [dimensions, setDimensions] = useState<AnnotationDimension[]>([]);

  // --- UI STATE: Layout and Resizing ---
  // REFACTORING NOTE: Layout and resizing state moved to UIStateContext (see top of component)
  // OLD: const [isVisualPanelFullscreen, setIsVisualPanelFullscreen] = useState<boolean>(false);
  // OLD: const [isPdfViewerFullscreen, setIsPdfViewerFullscreen] = useState<boolean>(false);
  // OLD: const [isStationingPanelExpanded, setIsStationingPanelExpanded] = useState(false);
  // OLD: const [isPointEditorExpanded, setIsPointEditorExpanded] = useState(true);
  // OLD: const [isChatPanelVisible, setIsChatPanelVisible] = useState(true);
  // OLD: const toggleChatPanel = useCallback(() => setIsChatPanelVisible(prev => !prev), []);
  // OLD: const [isResizingPointEditor, setIsResizingPointEditor] = useState<boolean>(false);
  // OLD: const [pointEditorHeight, setPointEditorHeight] = useState<number>(320);
  // OLD: const [isResizingContourPanel, setIsResizingContourPanel] = useState<boolean>(false);
  // OLD: const [contourPanelHeight, setContourPanelHeight] = useState<number>(240);
  // OLD: const [chatPanelWidth, setChatPanelWidth] = useState(450);
  // OLD: const [isResizingChat, setIsResizingChat] = useState(false);

  const mainContentRef = useRef<HTMLDivElement>(null);
  const visualPanelAndEditorContainerRef = useRef<HTMLDivElement>(null);

  // --- MISC STATE & REFS ---
  const stopGenerationRef = useRef<boolean>(false);

  // --- LIVE STREAMING PREVIEW ---
  // While an agent is mid-response and writing the JSON block, we incrementally
  // parse completed point/line objects out of the partial text and render them
  // on the canvas immediately. State is cleared when the stream ends, errors,
  // or the final authoritative JSON is committed by the main parser.
  const [streamPreviewPoints, setStreamPreviewPoints] = useState<SurveyPoint[]>([]);
  const [streamPreviewLines, setStreamPreviewLines] = useState<SurveyLine[]>([]);

  // --- CIVIL DRAFTER VISION SYSTEM ---
  // Cached VisionSurvey from the most recent gimbal scan.  Reused across
  // messages until the point set changes significantly (>5% delta).
  const [civilDrafterVisionSurvey, setCivilDrafterVisionSurvey] = useState<VisionSurvey | null>(null);
  const [isVisionScanning, setIsVisionScanning] = useState(false);
  // Gimbal Vision HUD: defaults to closed/shaded. Auto-opens when a new
  // file is loaded (App.tsx ~2247) or when a Civil Drafter scan begins
  // (~5482) � i.e. only appears when there's something to look at.
  const [showVisionHUD, setShowVisionHUD] = useState(false);
  const [showAutoDraftPanel, setShowAutoDraftPanel] = useState(false);
  const [isHeaderZoomMenuOpen, setIsHeaderZoomMenuOpen] = useState(false);
  const [isHeaderZoomToPointOpen, setIsHeaderZoomToPointOpen] = useState(false);
  const [isHeaderFindPointsOpen, setIsHeaderFindPointsOpen] = useState(false);
  const [headerZoomPointNumber, setHeaderZoomPointNumber] = useState('');
  const [headerFindPointsQuery, setHeaderFindPointsQuery] = useState('');
  const [isHeaderScaleMenuOpen, setIsHeaderScaleMenuOpen] = useState(false);
  // Track point count when last scan ran so we know when to re-scan
  const lastVisionPointCountRef = useRef<number>(0);
  // Civil Drafter turns since the underlying chat was last reset (for auto-reset).
  const civilDrafterTurnsSinceResetRef = useRef<number>(0);
  const [civilDrafterContextVolume, setCivilDrafterContextVolume] = useState<CivilDrafterContextVolume>(
    EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  );
  // Cached NAIP aerial of the survey extent � fetched alongside the gimbal scan
  // and attached to every vision briefing as the ground-truth reference.
  const visionAerialRef = useRef<VisionAerialImage[] | null>(null);
  // OLD: const [activeAgent, setActiveAgent] = useState<AgentType>(AgentType.RAW_CRAWLER);
  // OLD: const [lastActiveAgent, setLastActiveAgent] = useState<AgentType>(AgentType.RAW_CRAWLER);
  // OLD: const [activeModel, setActiveModel] = useState<string>(availableModels[0]);
  // REFACTORING NOTE: confirmationModal moved to UIStateContext (see top of component)
  // OLD: const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);
  // REFACTORING NOTE: fabPosition moved to UIStateContext (see top of component)
  // OLD: const [fabPosition, setFabPosition] = useState({ x: 0, y: 0, initialized: false });

  const fabRef = useRef<HTMLButtonElement>(null);
  // REFACTORING NOTE: fabDragState moved to useFabDrag hook (Phase 2)
  // OLD: const fabDragState = useRef({ isDragging: false, hasMoved: false, startPos: { x: 0, y: 0 }, offset: { x: 0, y: 0 } });


  // REFACTORING NOTE: Canvas scale, layer, and zoom state moved to CanvasStateContext (see top of component)
  // OLD: const [attributeScale, setAttributeScale] = useState(1);
  // OLD: const [lineLabelScale, setLineLabelScale] = useState(1);
  // OLD: const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  // OLD: const [zoomTarget, setZoomTarget] = useState<SurveyPoint | null>(null);

  const isSessionActive = initializedAgents.size > 0;
  const isCurrentAgentInitialized = initializedAgents.has(activeAgent);

  // User API key confirmation state

  // REFACTORING NOTE: pointLayers moved to CanvasStateContext (see top of component)
  // OLD: const [pointLayers, setPointLayers] = useState({ ... });


  // REFACTORING NOTE: Thinking time and donation modal state moved to AppStateContext (see top of component)
  // OLD: const [thinkingTime, setThinkingTime] = useState<number>(0);
  // REFACTORING NOTE: Timer logic moved to useThinkingTimer hook (Phase 2)
  // OLD: const timerRef = useRef<number | null>(null);
  // OLD: const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  // REFACTORING NOTE: Donation timer logic moved to useDonationTimer hook (Phase 2)
  // OLD: const donationTimerRef = useRef<number | null>(null);

  // REFACTORING NOTE: Contour settings and generation state moved to CanvasStateContext (see top of component)
  // OLD: const [contourSettings, setContourSettings] = useState<ContourSettings>({ ... });
  // OLD: const [isGeneratingContours, setIsGeneratingContours] = useState(false);

  // ESRI contour service discovery state (framework � discovery logic TBD)
  const [isDiscoveringContourServices, setIsDiscoveringContourServices] = useState(false);
  const [discoveredContourServices, setDiscoveredContourServices] = useState<EsriServiceInfo[]>([]);
  const [isFetchingEsri, setIsFetchingEsri] = useState(false);

  // County parcel (tax-boundary) GIS fetch state � Boundary Agent feature.
  const [isFetchingParcels, setIsFetchingParcels] = useState(false);
  const [lastFetchedParcels, setLastFetchedParcels] = useState<import('./services/parcelGisService.ts').ParcelFeatureSummary[]>([]);

  // REFACTORING NOTE: PDF highlight helper functions moved to CanvasStateContext (see top of component)
  // OLD: const addHighlights = useCallback(...);
  // OLD: const clearHighlights = useCallback(...);
  // OLD: const goToHighlight = useCallback(...);


  const canvas2dRef = useRef<DrawingCanvasHandles>(null);
  const cutSheetRef = useRef<CutSheetPanelHandles>(null);
  const [canvasTransform, setCanvasTransform] = useState<{ scale: number; offsetX: number; offsetY: number } | null>(null);
  
  // Ref to always access current pointLists (avoids stale closure in async handlers)
  const pointListsRef = useRef(pointLists);
  useEffect(() => {
    pointListsRef.current = pointLists;
  }, [pointLists]);

  // Faint futuristic background grid on the drawing canvas � purely cosmetic,
  // toggled from the header next to the notification bell.
  const [isGridVisible, setIsGridVisible] = useState(true);

  // Agent draw mode: controls what the AI agents plot in response to requests
  const [agentDrawMode, setAgentDrawMode] = useState<'both' | 'points' | 'lines'>('both');
  const agentDrawModeRef = useRef<'both' | 'points' | 'lines'>('both');
  useEffect(() => {
    agentDrawModeRef.current = agentDrawMode;
  }, [agentDrawMode]);
  const cycleAgentDrawMode = useCallback(() => {
    setAgentDrawMode(prev => prev === 'both' ? 'points' : prev === 'points' ? 'lines' : 'both');
  }, []);

  // Annotation mode: controls what is shown on line labels and boundary overlay labels.
  // Lifted from DrawingCanvas so the toggle button can live in the app header.
  const [agentAnnotMode, setAgentAnnotMode] = useState<'both' | 'bearing' | 'distance'>('both');
  const cycleAgentAnnotMode = useCallback(() => {
    setAgentAnnotMode(prev => prev === 'both' ? 'bearing' : prev === 'bearing' ? 'distance' : 'both');
  }, []);

  // -- Built-in survey symbol visibility (opt-in, request-scoped) -----------
  // Built-in library symbols (tree, manhole, hydrant, �) default to OFF. They
  // only render for the specific symbol ids the user explicitly asked for via
  // chat ("draw tree symbols") or the Symbol Manager eye toggle. This replaces
  // the earlier always-on fallback. Persisted so a session's choices survive a
  // reload. The special sentinel '*' means "all built-in symbols enabled".
  const ENABLED_BUILTIN_STORAGE_KEY = 'landsurv.enabledBuiltinSymbolIds.v1';
  const [enabledBuiltinSymbolIds, setEnabledBuiltinSymbolIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(ENABLED_BUILTIN_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr.filter((s): s is string => typeof s === 'string')) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ENABLED_BUILTIN_STORAGE_KEY, JSON.stringify([...enabledBuiltinSymbolIds]));
    } catch { /* quota / privacy mode � ignore */ }
  }, [enabledBuiltinSymbolIds]);

  // One-time migration: the earlier always-on fix persisted synthesized
  // `builtin:`-prefixed entries directly into customSymbols. Those would keep
  // rendering (via the priority-1 custom-symbol path) even after we flip the
  // default to off, silently defeating the gate. Strip them once on mount.
  const didStripStaleBuiltinsRef = useRef(false);
  useEffect(() => {
    if (didStripStaleBuiltinsRef.current) return;
    didStripStaleBuiltinsRef.current = true;
    setCustomSymbols(prev => {
      const cleaned = prev.filter(s => !s.id.startsWith('builtin:'));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [setCustomSymbols]);

  // Apply a parsed symbol-visibility command to the enabled-ids set. Uses the
  // '*' sentinel to mean "all built-in symbols enabled". Disabling specific
  // ids while '*' is active expands '*' to the full id set minus the removed
  // ones so the toggle stays coherent.
  const ALL_BUILTIN_IDS = useMemo(() => SURVEY_SYMBOL_LIBRARY.map(s => s.id), []);
  const applySymbolVisibilityCommand = useCallback((cmd: SymbolVisibilityCommand) => {
    setEnabledBuiltinSymbolIds(prev => {
      const next = new Set(prev);
      if (cmd.ids === 'all') {
        if (cmd.action === 'enable') return new Set(['*']);
        return new Set(); // disable all
      }
      if (cmd.action === 'enable') {
        cmd.ids.forEach(id => next.add(id));
        return next;
      }
      // disable specific ids
      if (next.has('*')) {
        // Expand the "all" sentinel to concrete ids, then remove requested.
        const expanded = new Set(ALL_BUILTIN_IDS);
        cmd.ids.forEach(id => expanded.delete(id));
        return expanded;
      }
      cmd.ids.forEach(id => next.delete(id));
      return next;
    });
  }, [ALL_BUILTIN_IDS, setEnabledBuiltinSymbolIds]);

  
  // Canvas tool state
  const [canvasToolState, setCanvasToolState] = useState<{
    isDrawing: boolean;
    isTrimming: boolean;
    isExtending: boolean;
    isDeleting: boolean;
    selectedCount?: number;
    segmentCount?: number;
    lineType?: 'normal' | 'breakline' | 'inclusion' | 'exclusion';
  }>({
    isDrawing: false,
    isTrimming: false,
    isExtending: false,
    isDeleting: false,
    selectedCount: 0,
    segmentCount: 0,
    lineType: 'normal'
  });

  // AR View selected point state
  const [selectedPoint, setSelectedPoint] = useState<SurveyPoint | null>(null);

  // Zoning Agent state
  const [zoningMapUrl, setZoningMapUrl] = useState<string | undefined>(undefined);
  const [zoningState, setZoningState] = useState<string | undefined>(undefined);
  const [zoningCounty, setZoningCounty] = useState<string | undefined>(undefined);
  const [zoningPlace, setZoningPlace] = useState<string | undefined>(undefined);
  const [zoningPlaceType, setZoningPlaceType] = useState<string | undefined>(undefined);
  const [zoningAddress, setZoningAddress] = useState<string | undefined>(undefined);
  const [zoningDistrict, setZoningDistrict] = useState<string | undefined>(undefined);
  const [zoningApiResponse, setZoningApiResponse] = useState<any>(null);
  const [zoningDebugExpanded, setZoningDebugExpanded] = useState(false);
  const [zoningRequestHistory, setZoningRequestHistory] = useState<any[]>([]);

  // Title Search state
  const [titleSearchData, setTitleSearchData] = useState<TitleSearchData>({
    deeds: [],
    liens: [],
    chainOfTitle: [],
    titleStatus: 'pending-review',
    issues: [],
  });
  const [selectedDeedId, setSelectedDeedId] = useState<string | undefined>(undefined);
  const [selectedLienId, setSelectedLienId] = useState<string | undefined>(undefined);

  // Projection pulse state
  const [pulseProjection, setPulseProjection] = useState(false);
  // API Key pulse state (for flashing the API Key input when accessed from home screen)
  const [pulseApiKey, setPulseApiKey] = useState(false);
  // Triggered by the "Load Points" CTA on the home screen \u2014 routes user to Point Editor and auto-opens the upload picker.
  const [autoOpenPointUpload, setAutoOpenPointUpload] = useState(false);
  // Triggered by the "Stakeout" / "Collect" CTAs on the GPS Rover home card \u2014 forwarded to the panel as `initialTab`.
  const [gpsInitialTab, setGpsInitialTab] = useState<'stakeout' | 'collect' | 'benchmark' | undefined>(undefined);
  // GPS Rover independent floating panels (v26.05.19.1) � persistent across agent context changes like Point List.
  const [isGpsStakeoutFloatingVisible, setIsGpsStakeoutFloatingVisible] = useState(false);
  const [isGpsCollectFloatingVisible, setIsGpsCollectFloatingVisible] = useState(false);
  const [contourAutoOpenGis, setContourAutoOpenGis] = useState<boolean>(false);
  // Floating Contour dialogs (v26.05.17.33) � replace the in-chat ContourChat with two draggable panels.
  const [isContourGenPanelVisible, setIsContourGenPanelVisible] = useState<boolean>(false);
  const [isContourGenMinimized, setIsContourGenMinimized] = useState<boolean>(false);
  const [isContourEsriPanelVisible, setIsContourEsriPanelVisible] = useState<boolean>(false);
  const [isContourEsriMinimized, setIsContourEsriMinimized] = useState<boolean>(false);
  const [isSteepSlopePanelVisible, setIsSteepSlopePanelVisible] = useState<boolean>(false);
  const [isSteepSlopePanelMinimized, setIsSteepSlopePanelMinimized] = useState<boolean>(false);
  const [isAutoDraftTinHidden, setIsAutoDraftTinHidden] = useState<boolean>(false);
  // Multi-generation contour objects (v26.05.19.3) � each ContourGeneration stores
  // IsoPaths (mathematical representation) + settings for auto-regen and blend.
  const [contourGenerations, setContourGenerations] = useState<ContourGeneration[]>([]);
  const [isContourManagementVisible, setIsContourManagementVisible] = useState<boolean>(false);
  // Ref mirrors for use inside effects without dependency churn.
  const linesRef = useRef<SurveyLine[]>([]);
  // Map imagery queued by the Auto Draft orchestrator � consumed by the next
  // CIVIL_DRAFTER message in handleSendMessage as Gemini Vision inlineData parts.
  const pendingAutoDraftImagesRef = useRef<AutoDraftImage[]>([]);
  const contourGenerationsRef = useRef<ContourGeneration[]>([]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { contourGenerationsRef.current = contourGenerations; }, [contourGenerations]);
  // Claude 4.7 Vertex AI settings panel.
  const [isClaudeSettingsVisible, setIsClaudeSettingsVisible] = useState<boolean>(false);

  // Shrinkwrap session (v26.05.17.37) � when the COGO Agent draws a hull, we
  // remember the source point set plus any user exclusions so the panel can
  // recompute on the fly. Cleared when the user dismisses the panel.
  //
  // v26.05.26.3 � Exclusion edits are now BATCHED. `pendingExcludedPns` is the
  // user-editable draft set; the hull only recomputes when the user clicks
  // "Update" in the panel, which copies pending ? excludedPns.
  const [shrinkwrap, setShrinkwrap] = useState<{
    sourcePns: string[];
    excludedPns: string[];
    pendingExcludedPns: string[];
    /** KNN tightness for the concave hull. Lower = tighter (more concave),
     *  higher = looser (asymptotically convex). Default 15 wraps most parcel
     *  boundaries cleanly. Live-recomputes when changed. */
    concavityK: number;
    /** Construction-line "cuts" � each is a chord between two existing points.
     *  At recompute time the points on the SMALLER-area side of each cut are
     *  auto-excluded (or the larger side if `flipped` is set), so the cut
     *  becomes a forced edge of the new boundary. */
    cuts: Array<{ a: string; b: string; flipped: boolean }>;
    /** When true, canvas clicks build cut chords instead of staging exclusions.
     *  Explicit mode avoids the dual-purpose-click confusion. */
    cutMode: boolean;
    /** First endpoint of an in-progress cut. The next canvas click in cut mode
     *  resolves the cut against this point and clears the field. */
    cutStartPn: string | null;
    layer: string;
    /** Preview-only canvas sessions become usable by agents only after Draw Inclusion. */
    isCommitted: boolean;
    /** Unique per session � every line generated by this shrinkwrap carries this polylineId. */
    polylineId: string;
  } | null>(null);
  const [isShrinkwrapPanelVisible, setIsShrinkwrapPanelVisible] = useState(false);
  const [isShrinkwrapPanelMinimized, setIsShrinkwrapPanelMinimized] = useState(false);
  // Ref mirror so the CACP `cogo_shrinkwrap` handler (registered once inside a
  // useEffect) can tell whether a session is already active without adding the
  // shrinkwrap state to its dependency array and re-subscribing on every edit.
  const shrinkwrapRef = useRef(shrinkwrap);
  useEffect(() => { shrinkwrapRef.current = shrinkwrap; }, [shrinkwrap]);

  // Inclusion Boundaries manager (v26.05.17.38) � named, show/hide-able groups
  // of `type:'inclusion'` SurveyLines. Auto-registered from any inclusion lines
  // that have a polylineId. `activeInclusionBoundaryId` is the default boundary
  // consumed by Contour, Flood, and any other agent that needs ONE boundary.
  const [inclusionBoundaries, setInclusionBoundaries] = useState<InclusionBoundary[]>([]);
  const [activeInclusionBoundaryId, setActiveInclusionBoundaryId] = useState<string | null>(null);
  const [isInclusionBoundariesPanelVisible, setIsInclusionBoundariesPanelVisible] = useState(false);
  const [isInclusionBoundariesPanelMinimized, setIsInclusionBoundariesPanelMinimized] = useState(false);
  // Ref mirror so existing useCallback handlers (Contour / Flood / Parcel) can
  // narrow `type:'inclusion'` lines to the active boundary without forcing all
  // those callbacks to re-create when the active boundary changes.
  const activeInclusionBoundaryRef = useRef<InclusionBoundary | null>(null);
  useEffect(() => {
    activeInclusionBoundaryRef.current =
      inclusionBoundaries.find(b => b.id === activeInclusionBoundaryId) || null;
  }, [activeInclusionBoundaryId, inclusionBoundaries]);

  // Auto-regenerate all ContourGenerations when survey points change (v26.05.19.3).
  // Uses refs to avoid circular deps � only triggered by point set changes.
  useEffect(() => {
    const currentGens = contourGenerationsRef.current;
    if (currentGens.length === 0 || points.length < 3) return;
    const currentLines = linesRef.current;
    const nonContourLines = currentLines.filter(l => !l.contourGenId);
    const updatedGens: ContourGeneration[] = [];
    const newContourLines: SurveyLine[] = [];
    const newLabels: ContourLabel[] = [];
    for (const gen of currentGens) {
      const ignoredSet = new Set(gen.settings.ignoredPointNumbers ?? []);
      let pts = points.filter(p => !ignoredSet.has(p.pointNumber));
      const flt = gen.settings.pointFilterDescription.trim().toUpperCase();
      if (flt) pts = pts.filter(p => p.description?.toUpperCase().includes(flt));
      if (pts.length < 3) { updatedGens.push(gen); continue; }
      const activeB = gen.activeInclusionBoundaryId
        ? inclusionBoundaries.find(b => b.id === gen.activeInclusionBoundaryId)
        : null;
      const inclLines = currentLines.filter(l => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
      const exclLines = currentLines.filter(l => l.type === 'exclusion');
      const brkLines = currentLines.filter(l => l.type === 'breakline');
      try {
        const { isoPaths, labels, elevationReport } = generateContoursAsIsoPaths(
          pts,
          gen.settings.contourInterval,
          gen.settings.majorInterval,
          gen.settings.smoothing,
          gen.settings.showLabels,
          gen.settings.labelDensity,
          brkLines,
          inclLines,
          exclLines,
          {
            mode: gen.settings.elevationFilterMode ?? 'auto',
            minElevation: gen.settings.minElevation ?? null,
            maxElevation: gen.settings.maxElevation ?? null,
          }
        );
        const updatedGen: ContourGeneration = {
          ...gen,
          isoPaths,
          labels,
          lastGeneratedAt: new Date().toISOString(),
          pointCount: pts.length,
          excludedPointCount: elevationReport.missingElevation + elevationReport.outOfRange,
          elevationRange: elevationReport.acceptedMin !== null && elevationReport.acceptedMax !== null
            ? { min: elevationReport.acceptedMin, max: elevationReport.acceptedMax }
            : null,
          elevationFilterSuppressed: elevationReport.suppressed,
        };
        updatedGens.push(updatedGen);
        if (gen.visible) {
          newContourLines.push(...isoPathsToSurveyLines(isoPaths, gen.id));
          newLabels.push(...labels);
        }
      } catch {
        updatedGens.push(gen);
      }
    }
    setContourGenerations(updatedGens);
    setLines([...nonContourLines, ...newContourLines]);
    setContourLabels(newLabels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]); // intentionally only triggered by point changes

  // Error console visibility
  const [isErrorConsoleVisible, setIsErrorConsoleVisible] = useState(false);

  // Release stages modal visibility
  const [isReleaseStagesModalVisible, setIsReleaseStagesModalVisible] = useState(false);

  // REFACTORING: Use custom hook for projection initialization (Phase 2)
  useProjectionInit();

  // Calculate showUploadScreen early for useFabDrag dependency
  const agentNeedsInitialScreen = [
    AgentType.RAW_CRAWLER,
    AgentType.CIVIL_DRAFTER,
    AgentType.DEED_READER,
    AgentType.CIVIL_PLAN_EXPERT,
    AgentType.DXF_ANALYZER,
    AgentType.GIS_AGENT,
    AgentType.CENTERLINE_STATIONING,
    AgentType.IMAGE_ANALYZER,
    AgentType.ZONING_AGENT,
    AgentType.TITLE_SEARCH,
    AgentType.STANDARDS_COMPLIANCE,
    AgentType.POINT_EDITOR,
    AgentType.CAD_MANAGER,
  ].includes(activeAgent);

  const showUploadScreen = (agentNeedsInitialScreen && !isCurrentAgentInitialized) || isAddingData;

  // REFACTORING: Use custom hook for FAB drag and position logic (Phase 2)
  const { handleFabPointerDown, fabDragState } = useFabDrag(
    fabPosition,
    setFabPosition,
    mainContentRef,
    fabRef,
    isDesktop,
    isInitialScreen,
    showUploadScreen,
    isChatPanelVisible
  );

  // REFACTORING: Use custom hook for subdomain routing (Phase 2)
  useSubdomainRouting(setPageMode, setLandingContent, landingPageConfig);

  // Check for checkout page routing
  const { isCheckoutPage, page: checkoutPage } = useCheckoutRouting();

  // REFACTORING: Use custom hook for usage timer and API key enforcement (Phase 2)
  const { 
    remainingTime,
    timeUntilAvailable,
    hasApiKey,
    hasLandSurvKey,
    hasServiceAccess,
    serviceAccessExpiresAt,
    isSuperUser,
    computeCredits,
    isLocked,
    isInitialized: usageTimerInitialized,
    addCredits,
    unlockWithApiKey,
    unlockWithServiceKey,
    resetTimer
  } = useUsageTimer();

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showHostCostReminder, setShowHostCostReminder] = useState(false);
  const [welcomeInitialMode, setWelcomeInitialMode] = useState<WelcomeMode>('main');
  const [isLockDismissed, setIsLockDismissed] = useState(false);
  const [apiKeyModalTrigger, setApiKeyModalTrigger] = useState<'apikey' | 'rinex' | 'lsvz'>('apikey');
  const [apiKeyModalInitialTab, setApiKeyModalInitialTab] = useState<'apikey' | 'service' | 'payment'>('apikey');
  const [showApiKeyConfirmation, setShowApiKeyConfirmation] = useState(false);
  const [pendingKeyProvider, setPendingKeyProvider] = useState<KnownKeyProvider>('google');
  const [showC3DConnectPanel, setShowC3DConnectPanel] = useState(false);
  const [showC3DDebugDialog, setShowC3DDebugDialog] = useState(false);
  const [showModelConfigPopup, setShowModelConfigPopup] = useState(false);
  const [showGemini3Panel, setShowGemini3Panel] = useState(false);
  const [showCivilDrafterContextPanel, setShowCivilDrafterContextPanel] = useState(false);
  const [c3dSessionToken, setC3dSessionToken] = useState<string | null>(null);
  const [hasConfirmedApiKey, setHasConfirmedApiKey] = useState(false);
  const [demoKeyInfo, setDemoKeyInfo] = useState<{
    remainingMs: number | null;
    expiresAt: string | null;
    activatedAt: string | null;
    expiresInHours: number | null;
  } | null>(null);
  const [apiKeyEntitlements, setApiKeyEntitlements] = useState<{ accessProfile?: 'standard' | 'restricted'; deniedFeatures?: string[]; permissions?: string[] } | null>(null);
  const [claudeSettingsModel, setClaudeSettingsModel] = useState<ClaudeModel | null>(null);
  const [currentKeyDetails, setCurrentKeyDetails] = useState<CurrentKeyDetails | null>(null);

  const appUserId = useMemo(() => {
    if (typeof window === 'undefined') return 'anonymous';
    let stored = localStorage.getItem('landsurv_user_id');
    if (!stored) {
      stored = crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      localStorage.setItem('landsurv_user_id', stored);
    }
    return stored;
  }, []);

  const appUserEmail = useMemo(() => {
    if (!hasLegalSignature) return undefined;
    return getSignatureRecord()?.email;
  }, [hasLegalSignature]);

  // Per-agent model override state - allows overriding the default model for specific agents
  const [agentModelOverrides, setAgentModelOverrides] = useState<Partial<Record<AgentType, string>>>({});
  const [autoHighThinkingModel, setAutoHighThinkingModel] = useState<string>(DEFAULT_AUTO_HIGH_THINKING_MODEL);
  const [showQuickModelSelector, setShowQuickModelSelector] = useState(false);

  const shouldSuppressApiKeyModal = useMemo(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return shouldSuppressApiKeyModalForSurface({
      hostname,
      pageMode,
      isCheckoutPage,
    });
  }, [pageMode, isCheckoutPage]);

  // Full-blown LandSurv Enabling Key / Service Access check:
  // A user with an active LSAI key is not subject to the 4hr free-tier off cycle timer.
  const hasLsaiEnablingKey = Boolean(
    isSuperUser ||
    hasServiceAccess ||
    hasLandSurvKey ||
    isDemoApiKey(settings.userApiKey) ||
    Boolean(settings.userApiKey?.startsWith('lsa_')) ||
    Boolean(typeof window !== 'undefined' && (
      localStorage.getItem('landsurv_service_key')?.startsWith('lsa_') ||
      localStorage.getItem('landsurv_user_api_key')?.startsWith('lsa_')
    )) ||
    (currentKeyDetails?.keyType === 'LandSurv Enabling Key' && currentKeyDetails?.status !== 'expired')
  );

  // Free-tier time lock: only pauses free users who do not have an active LSAI enabling key.
  const isFreeTierTimeLocked = Boolean(isLocked && !hasLsaiEnablingKey);

  const isServiceEnabled = hasLsaiEnablingKey;
  const isInferenceEnabled = Boolean(
    isSuperUser ||
    computeCredits > 0 ||
    hasApiKey ||
    Boolean(settings.userApiKey?.trim()) ||
    Boolean(settings.openaiApiKey?.trim()) ||
    Boolean(settings.xaiApiKey?.trim()) ||
    Boolean(settings.anthropicApiKey?.trim())
  );
  const hasServiceAndInference = Boolean(isServiceEnabled && isInferenceEnabled);

  const isRestrictedApiKey = apiKeyEntitlements?.accessProfile === 'restricted';
  const hasFable5Entitlement = isSuperUser || Boolean(
    apiKeyEntitlements?.permissions?.includes('*')
    || apiKeyEntitlements?.permissions?.includes(FABLE_5_PERMISSION)
  );
  const visibleAvailableModels = useMemo(
    () => {
      let models = isRestrictedApiKey
        ? availableModels.filter(model => !RESTRICTED_MODEL_IDS.has(model))
        : [...availableModels];
      if (!hasFable5Entitlement) {
        models = models.filter(model => model !== FABLE_5_MODEL_ID);
      }
      // BYOK provider models are only selectable when the matching key is present.
      if (!settings.openaiApiKey?.trim() && !getProviderApiKey('openai')) {
        models = models.filter(model => !isOpenAIModel(model));
      }
      if (!settings.xaiApiKey?.trim() && !getProviderApiKey('xai')) {
        models = models.filter(model => !isGrokModel(model));
      }
      return models;
    },
    [isRestrictedApiKey, hasFable5Entitlement, settings.openaiApiKey, settings.xaiApiKey]
  );
  const visibleAutoHighThinkingOptions = useMemo(
    () => {
      let options = isRestrictedApiKey
        ? autoHighThinkingOptions.filter(model => !RESTRICTED_MODEL_IDS.has(model))
        : [...autoHighThinkingOptions];
      if (!hasFable5Entitlement) {
        options = options.filter(model => model !== FABLE_5_MODEL_ID);
      }
      return options;
    },
    [isRestrictedApiKey, hasFable5Entitlement]
  );

  const resolveModelForAgent = useCallback((agentType: AgentType, baseModel: string): string => {
    if (baseModel === AUTO_MODEL_OPTION) {
      return getAutoModelForAgent(agentType, autoHighThinkingModel);
    }
    return getModelForAgent(agentType, baseModel);
  }, [autoHighThinkingModel]);

  // Get current model name for the active agent
  const currentModelName = useMemo(() => {
    // Check for per-agent override first
    if (agentModelOverrides[activeAgent]) {
      return agentModelOverrides[activeAgent]!;
    }
    return resolveModelForAgent(activeAgent, activeModel);
  }, [activeAgent, activeModel, agentModelOverrides, resolveModelForAgent]);

  // True when the active agent is running under Auto smart-routing (no per-agent
  // override and the global selector is set to Auto).
  const isAutoRoutingForActive = !agentModelOverrides[activeAgent] && activeModel === AUTO_MODEL_OPTION;

  const openClaudeModelSettings = useCallback((model: ClaudeModel) => {
    setClaudeConfig({ ...loadClaudeConfig(), enabled: true, model });
    setClaudeSettingsModel(model);
    setIsClaudeSettingsVisible(true);
  }, []);

  const openContextAwareModelSettings = useCallback(() => {
    setShowQuickModelSelector(false);
    if (isAutoRoutingForActive) {
      setShowModelConfigPopup(true);
      return;
    }
    if (isClaudeModel(currentModelName)) {
      openClaudeModelSettings(currentModelName as ClaudeModel);
      return;
    }
    if (currentModelName.startsWith('gemini-3')) {
      setShowGemini3Panel(true);
      return;
    }
    setShowModelConfigPopup(true);
  }, [currentModelName, isAutoRoutingForActive, openClaudeModelSettings]);

  const formatDuration = useCallback((remainingMs: number | null): string => {
    if (remainingMs === null || !Number.isFinite(remainingMs)) return 'unknown time';
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, []);

  const [isAccessStatusExpanded, setIsAccessStatusExpanded] = useState(false);

  const activeKeyStatusLabel = useMemo(() => {
    if (isSuperUser) return '👑 SUPERUSER';
    if (hasServiceAndInference) {
      if (isDemoApiKey(settings.userApiKey) || settings.userApiKey?.startsWith('lsa_')) {
        return '🔑 LandSurv Enabling Key (Active)';
      }
      return '🟢 Service & Inference Active';
    }
    if (!hasApiKey) {
      if (computeCredits > 0) return `⚡ Credits: ${computeCredits.toLocaleString()}`;
      return '⚠️ No API Key';
    }
    if (isDemoApiKey(settings.userApiKey)) {
      if (typeof demoKeyInfo?.remainingMs === 'number') {
        return `? Purchased key � ${formatDuration(demoKeyInfo.remainingMs)} left`;
      }
      if (typeof demoKeyInfo?.expiresInHours === 'number' && demoKeyInfo.expiresInHours > 0) {
        return `? Purchased key � ${demoKeyInfo.expiresInHours}h on first use`;
      }
      return '? Purchased key';
    }
    return '🔑 Using your API Key';
  }, [computeCredits, demoKeyInfo, formatDuration, hasApiKey, isSuperUser, settings.userApiKey, hasServiceAndInference]);

  const activeKeyStatusDetail = useMemo(() => {
    if (isSuperUser) return 'superuser mode | all access limits bypassed';
    if (hasServiceAndInference) {
      return 'service and inference enabled | continuous 24/7 access';
    }
    if (!hasApiKey) {
      if (computeCredits > 0) return `inference: ${computeCredits.toLocaleString()} hosted units | click to manage`;
      return 'inference unavailable until a key or hosted units are added';
    }
    if (isDemoApiKey(settings.userApiKey)) return 'inference: hosted (purchased key) | click to open Settings';
    return 'inference: your API key | BYOK | click to open Settings';
  }, [computeCredits, hasApiKey, isSuperUser, settings.userApiKey, hasServiceAndInference]);

  const activeKeyStatusTone = isSuperUser
    ? 'text-red-400 border-red-500/50'
    : hasServiceAndInference
      ? 'text-emerald-400 border-emerald-500/50'
      : !hasApiKey
        ? (computeCredits > 0 ? 'text-emerald-300 border-emerald-500/50' : 'text-[#ff9b91] border-[#ff9b91]/50')
        : isDemoApiKey(settings.userApiKey)
          ? 'text-cyan-300 border-cyan-500/50'
          : 'text-yellow-300 border-yellow-500/50';

  // The experimental Gemini 3 controls apply when a Gemini 3.x model is active
  // (directly or via Auto high-thinking). Reachable only from context-aware
  // model settings � not surfaced as a chat-header button on any agent.
  const canConfigureGemini3 = currentModelName.startsWith('gemini-3')
    || (isAutoRoutingForActive && autoHighThinkingModel.startsWith('gemini-3'));

  // Never auto-open model controls. Close Gemini controls when they no longer
  // apply; users can open them explicitly from the chat header.
  useEffect(() => {
    if (!canConfigureGemini3) setShowGemini3Panel(false);
  }, [canConfigureGemini3]);

  const confirmFableSelection = useCallback((model: string): boolean => {
    if (model !== FABLE_5_MODEL_ID) return true;
    if (!hasFable5Entitlement) {
      window.alert('Claude Fable 5 is not enabled for this API key. Ask DevOps to enable Fable 5 entitlement for your key.');
      return false;
    }
    return window.confirm('Use Claude Fable 5? Gemini is now the default model path. Choose Fable only if you intentionally want Claude for this agent.');
  }, [hasFable5Entitlement]);

  useEffect(() => {
    if (!autoHighThinkingOptions.includes(autoHighThinkingModel) || LEGACY_GEMINI_MODEL_IDS.has(autoHighThinkingModel)) {
      setAutoHighThinkingModel(DEFAULT_AUTO_HIGH_THINKING_MODEL);
    }
  }, [autoHighThinkingModel]);

  useEffect(() => {
    if (hasFable5Entitlement) return;
    if (activeModel === FABLE_5_MODEL_ID) {
      setActiveModel(AUTO_MODEL_OPTION);
    }
    if (autoHighThinkingModel === FABLE_5_MODEL_ID) {
      setAutoHighThinkingModel(DEFAULT_AUTO_HIGH_THINKING_MODEL);
    }
    setAgentModelOverrides(prev => {
      let changed = false;
      const next: Partial<Record<AgentType, string>> = { ...prev };
      for (const [agentKey, model] of Object.entries(prev) as Array<[AgentType, string]>) {
        if (model === FABLE_5_MODEL_ID) {
          delete next[agentKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeModel, autoHighThinkingModel, hasFable5Entitlement, setActiveModel]);

  useEffect(() => {
    if (!isRestrictedApiKey) return;
    if (RESTRICTED_MODEL_IDS.has(activeModel)) {
      setActiveModel(AUTO_MODEL_OPTION);
    }
    if (RESTRICTED_MODEL_IDS.has(autoHighThinkingModel)) {
      setAutoHighThinkingModel(DEFAULT_AUTO_HIGH_THINKING_MODEL);
    }
  }, [activeModel, autoHighThinkingModel, isRestrictedApiKey, setActiveModel]);

  // If the active model needs a BYOK provider key that is no longer present,
  // fall back to Auto so chat doesn't fail on the next send.
  useEffect(() => {
    const hasOpenAI = Boolean(settings.openaiApiKey?.trim()) || Boolean(getProviderApiKey('openai'));
    const hasXai = Boolean(settings.xaiApiKey?.trim()) || Boolean(getProviderApiKey('xai'));
    if ((!hasOpenAI && isOpenAIModel(activeModel)) || (!hasXai && isGrokModel(activeModel))) {
      setActiveModel(AUTO_MODEL_OPTION);
    }
  }, [activeModel, settings.openaiApiKey, settings.xaiApiKey, setActiveModel]);

  useEffect(() => {
    setAgentModelOverrides(prev => {
      let changed = false;
      const next: Partial<Record<AgentType, string>> = { ...prev };
      for (const [agentKey, model] of Object.entries(prev) as Array<[AgentType, string]>) {
        if (REMOVED_MODEL_IDS.has(model) || (model.startsWith('gemini-') && model !== CURRENT_GEMINI_MODEL)) {
          delete next[agentKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Helper to start a chat with the appropriate model override for the agent
  // Injects CAD Manager layer context when a standard is loaded � every agent gets the layer table.
  const startChatWithOverride = useCallback((
    agentType: AgentType,
    fileContext: string | SessionFile | SessionFile[],
    trainingContext?: SessionFile
  ) => {
    const override = agentModelOverrides[agentType];
    const cadLayerContext = cadManagerContext.state.standard
      ? cadManagerContext.getLayersContextString('condensed')
      : undefined;
    // Pass Drafting Style Library to the Civil Drafter so it receives training context.
    const styleEntries = agentType === AgentType.CIVIL_DRAFTER && draftingStyleLibrary.length > 0
      ? draftingStyleLibrary
      : undefined;
    return startGeminiChat(agentType, fileContext, activeModel, settings, trainingContext, override, cadLayerContext, styleEntries, autoHighThinkingModel);
  }, [activeModel, settings, agentModelOverrides, cadManagerContext, draftingStyleLibrary, autoHighThinkingModel]);

  // Load C3D session token from localStorage on app startup
  useEffect(() => {
    const storedToken = localStorage.getItem('landsurv_c3d_session_token');
    if (storedToken) {
      console.log('[C3D Token] Restored from localStorage:', storedToken);
      setC3dSessionToken(storedToken);
    }
    // Hydrate experimental Gemini 3 controls config from localStorage so the
    // chat factory sees prior settings on first chat creation.
    loadGemini3Config();
    // Hydrate Civil Drafter context-management config so handleSendMessage sees
    // prior settings on the first request.
    loadCivilDrafterContextConfig();
  }, []);

  // Save C3D session token to localStorage when it changes
  useEffect(() => {
    if (c3dSessionToken) {
      console.log('[C3D Token] Saved to localStorage:', c3dSessionToken);
      localStorage.setItem('landsurv_c3d_session_token', c3dSessionToken);
    } else {
      localStorage.removeItem('landsurv_c3d_session_token');
    }
  }, [c3dSessionToken]);

  // Civil 3D State Sync - maintains WebSocket connection for on-demand data requests
  // isConnected = webapp-sync WebSocket is connected to backend
  // isC3DClientConnected = true when a C3D client (DLL) is connected to this session
  // sendToC3D = function to send commands directly via WebSocket (bypasses HTTP for Cloud Run compatibility)
  // c3dClientVersion = version of the connected C3D DLL
  const { isConnected: isWebSocketConnected, isC3DClientConnected, c3dClientVersion, sendToC3D, sendRaw: sendC3DRaw, reconnect: reconnectWebSocket, subscribeSyncEvents } = useC3DStateSync(c3dSessionToken, {
    pointLists,
    lines,
    deedFile,
    centerlines,
    jobInfo,
    settings,
    cadManagerState,
    customSymbols,
    customAnnotations,
    annotationScale,
    streetLabels,
    parcelLabels,
    annotationCategories,
  });

  // C3D is truly connected only if BOTH WebSocket channel is open AND C3D client is connected
  const isC3DConnected = isWebSocketConnected && isC3DClientConnected;

  // -- C3D Sync Center + drawing mirror (connector overhaul Phase 2/4) ---------
  const [showSyncCenter, setShowSyncCenter] = useState(false);
  const [c3dSyncActive, setC3dSyncActive] = useState(false);
  const [c3dLiveSyncEnabled, setC3dLiveSyncEnabled] = useState(false);
  const [c3dSyncProgress, setC3dSyncProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  // Live drawing list mirrored from the connected DLL (pushed via drawings_update).
  const [c3dDrawings, setC3dDrawings] = useState<Array<{ name: string; fullPath: string; isActive: boolean; layerCount: number }>>([]);
  const [c3dActiveDrawing, setC3dActiveDrawing] = useState<string | null>(null);
  const [c3dDrawingsMenuOpen, setC3dDrawingsMenuOpen] = useState(false);

  // Persisted per-browser baseline for sync conflict detection.
  const c3dSyncBaselineKey = 'landsurv_c3d_sync_baseline';
  const loadSyncBaseline = useCallback((): SyncBaseline | null => {
    try {
      const raw = localStorage.getItem(c3dSyncBaselineKey);
      return raw ? (JSON.parse(raw) as SyncBaseline) : null;
    } catch { return null; }
  }, []);
  const saveSyncBaseline = useCallback((baseline: SyncBaseline) => {
    try { localStorage.setItem(c3dSyncBaselineKey, JSON.stringify(baseline)); } catch { /* quota */ }
  }, []);

  // Live sync events from the relay (DLL wizard progress, mutex notices, and
  // sync_lsai_apply requests that we must apply into React state).
  //
  // The connector's chat hands drafting work here over CACP, so the relay can
  // reach the real agents. Those callbacks are declared much further down, so
  // refs carry them into this early-mounted subscription.
  const handleSendMessageRef = useRef<((query: string, agentOverride?: AgentType) => Promise<void>) | null>(null);
  const handleAgentChangeRef = useRef<((agent: AgentType) => void) | null>(null);
  const pendingAgenticCadLaunchRef = useRef<'blank' | 'sample' | 'existing' | null>(null);
  const civilDrafterChatHistoryRef = useRef<ChatMessage[]>([]);
  const answerC3DAgentRequestRef = useRef<((requestId: string, agentId: string, prompt: string) => Promise<void>) | null>(null);

  // Kept current every render so a finished hand-off can read the agent's reply.
  civilDrafterChatHistoryRef.current = civilDrafterChatHistory;

  useEffect(() => {
    if (!subscribeSyncEvents) return;
    return subscribeSyncEvents((event) => {
      if (event.type === 'sync_started') {
        setC3dSyncActive(true);
        setC3dSyncProgress(null);
        addNotification({ kind: 'c3d-sync', severity: 'info', title: 'C3D Sync',
          message: 'A sync started from Civil 3D.' });
      } else if (event.type === 'sync_progress') {
        setC3dSyncActive(true);
        setC3dSyncProgress({
          current: event.current ?? 0,
          total: event.total ?? 0,
          message: event.message ?? '',
        });
      } else if (event.type === 'sync_completed' || event.type === 'sync_canceled') {
        setC3dSyncActive(false);
        setC3dSyncProgress(null);
        addNotification({ kind: 'c3d-sync', severity: 'info',
          title: 'C3D Sync', message: event.type === 'sync_completed'
            ? (event.summary || 'Sync from Civil 3D completed.')
            : (event.reason || 'Sync was canceled.') });
      } else if (event.type === 'drawings_update') {
        // DLL pushed its drawing list (connect / switch / refresh) � mirror in header.
        setC3dDrawings(event.drawings ?? []);
        const active = (event.drawings ?? []).find(d => d.isActive);
        setC3dActiveDrawing(active?.name ?? null);
      } else if (event.type === 'sync_mode') {
        setC3dLiveSyncEnabled(event.enabled === true);
      } else if (event.type === 'c3d_agent_request' && event.syncId) {
        // Connector chat handed a request to a LandSurv.ai agent over CACP.
        void answerC3DAgentRequestRef.current?.(event.syncId, event.agent ?? '', event.prompt ?? '');
      } else if (event.type === 'sync_lsai_apply' && event.plan) {
        // DLL wizard applied CAD side; apply the LSAI-side actions now.
        try {
          const result = applyLsaiActionsRef.current(
            event.plan as SyncApplyPlan,
            (event.cadSnapshot as C3DSyncSnapshot) ?? emptySnapshot(),
          );
          sendC3DRaw({
            type: 'sync_lsai_result', requestId: event.syncId,
            success: true, summary: result.summary,
          });
          addNotification({ kind: 'c3d-sync', severity: 'info', title: 'C3D Sync',
            message: `LandSurv.ai updated from CAD sync: ${result.summary}` });
        } catch (err) {
          sendC3DRaw({
            type: 'sync_lsai_result', requestId: event.syncId,
            success: false, error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeSyncEvents, sendC3DRaw]);

  const emptySnapshot = (): C3DSyncSnapshot => ({
    points: [], layers: [], linework: [], annotations: [], symbols: [],
  });


  // Log when C3D session token changes
  useEffect(() => {
    if (c3dSessionToken) {
      console.log('[App] C3D Session Token set:', c3dSessionToken.substring(0, 8) + '...');
    } else {
      console.log('[App] C3D Session Token cleared');
    }
  }, [c3dSessionToken]);

  // Load user API keys from localStorage on app startup and check if the Google/LSA
  // key is already confirmed. BYOK provider keys (OpenAI/xAI/Anthropic) live in their
  // own slots and are loaded alongside.
  useEffect(() => {
    (async () => {
      const storedApiKey = localStorage.getItem('landsurv_user_api_key');
      const storedServiceKey = localStorage.getItem('landsurv_service_key');
      const effectiveApiKey = storedApiKey || (storedServiceKey?.startsWith('lsa_') ? storedServiceKey : null);
      const storedOpenaiKey = getProviderApiKey('openai');
      const storedXaiKey = getProviderApiKey('xai');
      const storedAnthropicKey = getProviderApiKey('anthropic');
      if (effectiveApiKey || storedOpenaiKey || storedXaiKey || storedAnthropicKey) {
        setSettings(prev => ({
          ...prev,
          userApiKey: effectiveApiKey || prev.userApiKey,
          openaiApiKey: storedOpenaiKey || prev.openaiApiKey,
          xaiApiKey: storedXaiKey || prev.xaiApiKey,
          anthropicApiKey: storedAnthropicKey || prev.anthropicApiKey,
        }));
        setHasConfirmedApiKey(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isSuperUser) {
      setDemoKeyInfo(null);
      setApiKeyEntitlements(null);
      setCurrentKeyDetails(null);
      return;
    }

    const apiKey = settings.userApiKey;
    if (!apiKey) {
      setDemoKeyInfo(null);
      setApiKeyEntitlements(null);
      setCurrentKeyDetails(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const isDemoKey = isDemoApiKey(apiKey);
      if (!isDemoKey) {
        const signature = hasLegalSignature ? getSignatureRecord() : null;
        const fallback: CurrentKeyDetails = {
          source: 'google',
          keyType: 'Google Gemini API Key',
          keyId: null,
          keyName: 'User-provided Google API Key',
          ownerUserId: appUserId || null,
          ownerEmail: appUserEmail || signature?.email || null,
          keyPurpose: 'api',
          tier: 'user-key',
          status: 'active',
          isStoredLocally: true,
          permissions: ['read', 'write', 'generateContent'],
        };
        if (!cancelled) {
          setCurrentKeyDetails(fallback);
          setDemoKeyInfo(null);
          setApiKeyEntitlements(null);
        }
        return;
      }

      const [entitlements, info] = await Promise.all([
        fetchApiKeyEntitlements(apiKey).catch(() => null),
        fetch('/api/demo/gemini/keyinfo', {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
          .then(async resp => (resp.ok ? resp.json() : null))
          .catch(() => null),
      ]);

      if (cancelled) return;

      setApiKeyEntitlements(entitlements);
      setDemoKeyInfo(info ? {
        remainingMs: typeof info.remainingMs === 'number' ? info.remainingMs : null,
        expiresAt: typeof info.expiresAt === 'string' ? info.expiresAt : null,
        activatedAt: typeof info.activatedAt === 'string' ? info.activatedAt : null,
        expiresInHours: typeof info.expiresInHours === 'number' ? info.expiresInHours : null,
      } : null);

      try {
        const verifyResponse = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const verifyData = verifyResponse.ok ? await verifyResponse.json() : null;
        const user = verifyData?.user || {};
        const keyId = typeof user.keyId === 'string' ? user.keyId : (typeof user.id === 'string' ? user.id : null);
        const ownerEmail = typeof user.ownerEmail === 'string'
          ? user.ownerEmail
          : (typeof user.customerEmail === 'string' ? user.customerEmail : (appUserEmail || getSignatureRecord()?.email || null));

        if (!cancelled) {
          setCurrentKeyDetails({
            source: 'service',
            keyType: 'LandSurv Enabling Key',
            keyId,
            keyName: typeof user.name === 'string' ? user.name : 'LandSurv Enabling Key',
            ownerUserId: typeof user.userId === 'string' ? user.userId : (typeof user.id === 'string' ? user.id : appUserId || null),
            ownerEmail,
            tier: typeof user.tier === 'string' ? user.tier : 'pro',
            keyPurpose: typeof user.keyPurpose === 'string' ? user.keyPurpose : 'service',
            createdAt: typeof user.createdAt === 'string' ? user.createdAt : null,
            expiresAt: typeof user.expiresAt === 'string' ? user.expiresAt : (typeof user.serviceAccessExpiresAt === 'string' ? user.serviceAccessExpiresAt : info?.expiresAt || null),
            activatedAt: typeof user.activatedAt === 'string' ? user.activatedAt : (typeof info?.activatedAt === 'string' ? info.activatedAt : null),
            status: verifyResponse.ok ? 'active' : 'unknown',
            accessProfile: typeof user.accessProfile === 'string' ? user.accessProfile : entitlements?.accessProfile || 'standard',
            permissions: Array.isArray(user.permissions) ? user.permissions : ['demo:ai', 'read', 'write'],
            isStoredLocally: true,
          });
        }
      } catch {
        if (!cancelled) {
          setCurrentKeyDetails({
            source: 'service',
            keyType: 'LandSurv Enabling Key',
            keyId: null,
            keyName: 'LandSurv Enabling Key',
            ownerUserId: appUserId || null,
            ownerEmail: appUserEmail || getSignatureRecord()?.email || null,
            keyPurpose: 'service',
            tier: 'pro',
            status: 'active',
            accessProfile: entitlements?.accessProfile || 'standard',
            permissions: ['demo:ai', 'read', 'write'],
            isStoredLocally: true,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settings.userApiKey, isSuperUser, appUserId, appUserEmail, hasLegalSignature]);

  useEffect(() => {
    if (!demoKeyInfo?.expiresAt) return;
    const timer = window.setInterval(() => {
      setDemoKeyInfo(prev => {
        if (!prev?.expiresAt) return prev;
        const remainingMs = Math.max(0, new Date(prev.expiresAt).getTime() - Date.now());
        return { ...prev, remainingMs };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [demoKeyInfo?.expiresAt]);

  useEffect(() => {
    if (!isRestrictedApiKey) return;
    if (RESTRICTED_MODEL_IDS.has(activeModel)) {
      setActiveModel(AUTO_MODEL_OPTION);
    }
    if (autoHighThinkingModel === 'claude-fable-5') {
      setAutoHighThinkingModel(DEFAULT_AUTO_HIGH_THINKING_MODEL);
    }
  }, [activeModel, autoHighThinkingModel, isRestrictedApiKey, setActiveModel]);

  // Reset dismiss state whenever the lock becomes active (e.g. key removed)
  useEffect(() => {
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
    }
  }, [isFreeTierTimeLocked]);

  // REMOVED: Auto-open API key modal when 4hr timer trips.
  // Instead, the app does nothing when the timer trips; the 15-minute host cost reminder dialog
  // is shown only when the user attempts inference without a key.

  // Ensure modal is closed on SEO/info/checkouts and other non-app modes.
  useEffect(() => {
    if (shouldSuppressApiKeyModal && showApiKeyModal) {
      setShowApiKeyModal(false);
    }
  }, [shouldSuppressApiKeyModal]);

  // Periodic host cost reminder (every 15 minutes, independent of the 4h on / 4h off lock)
  // Shows a polite popup that hosting costs money, linking to Upgrade/Payments and the Zelle open-source contribution card.
  // Suppressed for superusers, service-enabled users, users with an active LandSurv Enabling Key, or users with service access.
  useEffect(() => {
    if (shouldSuppressApiKeyModal) return;
    if (isSuperUser || hasServiceAccess || hasLsaiEnablingKey || hasLandSurvKey || isServiceEnabled) return;

    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const interval = window.setInterval(() => {
      // Don't show if user is already looking at payment or key dialog, or welcome screen, or has an enabling key/access
      setShowHostCostReminder((prev) => {
        if (prev || showApiKeyModal || showUpgradeModal || showWelcome || isSuperUser || hasServiceAccess || hasLsaiEnablingKey || hasLandSurvKey || isServiceEnabled) {
          return false;
        }
        return true;
      });
    }, FIFTEEN_MINUTES_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [shouldSuppressApiKeyModal, isSuperUser, hasServiceAccess, hasLsaiEnablingKey, hasLandSurvKey, isServiceEnabled, showApiKeyModal, showUpgradeModal, showWelcome]);

  // Immediately close and dismiss host cost reminder if an enabling key or service access becomes active
  useEffect(() => {
    if (isSuperUser || hasServiceAccess || hasLsaiEnablingKey || hasLandSurvKey || isServiceEnabled) {
      setShowHostCostReminder(false);
    }
  }, [isSuperUser, hasServiceAccess, hasLsaiEnablingKey, hasLandSurvKey, isServiceEnabled]);

  // When settings.userApiKey changes, check if it's already confirmed for this specific key.
  useEffect(() => {
    (async () => {
      const key = settings.userApiKey;
      if (!key) {
        setHasConfirmedApiKey(false);
        return;
      }
      if (isSuperUser) {
        setHasConfirmedApiKey(false);
        return;
      }
      setHasConfirmedApiKey(true);
    })();
  }, [settings.userApiKey, isSuperUser]);

  // BYOK session check-in � once per app load, ping the backend with just the
  // signed legal name+email so a row appears in the DevOps API-Keys table for
  // users running with their own Gemini key. Backend dedupes per email per
  // hour (recordByokSession cooldown); the ref here keeps us from firing on
  // every render. The API key itself is never transmitted.
  const byokCheckinFiredRef = useRef(false);
  useEffect(() => {
    if (byokCheckinFiredRef.current) return;
    if (isSuperUser) return;
    if (!hasConfirmedApiKey) return;
    if (!settings.userApiKey) return;
    if (!hasLegalSignature) return;
    const sig = getSignatureRecord();
    if (!sig?.name || !sig?.email) return;
    byokCheckinFiredRef.current = true;
    fetch('/api/demo/byok-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sig.name, email: sig.email }),
    }).catch(() => { /* best-effort � backend logs failures */ });
  }, [hasConfirmedApiKey, settings.userApiKey, hasLegalSignature, isSuperUser]);

  const handleUnlockClick = () => {
    if (shouldSuppressApiKeyModal) return;
    setShowApiKeyModal(true);
  };

  // Route a submitted key into the Settings field for its provider.
  // Google/LandSurv keys keep the legacy userApiKey field; OpenAI/xAI/Anthropic
  // keys fill their own fields so several provider keys can coexist.
  const applyKeyToSettings = (apiKey: string): KnownKeyProvider => {
    const provider = resolveKeyProvider(apiKey);
    setSettings(prev => {
      switch (provider) {
        case 'openai': return { ...prev, openaiApiKey: apiKey };
        case 'xai': return { ...prev, xaiApiKey: apiKey };
        case 'anthropic': return { ...prev, anthropicApiKey: apiKey };
        default: return { ...prev, userApiKey: apiKey };
      }
    });
    return provider;
  };

  const handleApiKeySubmit = (apiKey: string): boolean => {
    const trimmed = apiKey.trim();
    if (trimmed.startsWith('lsa_')) {
      void unlockWithServiceKey(trimmed);
    }
    const success = unlockWithApiKey(apiKey);
    if (success) {
      setShowApiKeyModal(false);

      const isSuperUserPassword = apiKey.trim() === 's3cur3s3cur3';
      const isLandSurvKey = isDemoApiKey(apiKey);
      if (!isSuperUserPassword) {
        const provider = applyKeyToSettings(apiKey);
        if (isLandSurvKey) {
          setHasConfirmedApiKey(true);
          addNotification({
            kind: 'api-key',
            severity: 'info',
            title: 'Enabling key saved',
            message: 'Your LandSurv Enabling Key is active and ready to use.',
          });
        } else {
          setPendingKeyProvider(provider);
          setHasConfirmedApiKey(false);
          setShowApiKeyConfirmation(true);
        }
      } else {
        setSettings(prev => ({ ...prev, userApiKey: undefined }));
        setHasConfirmedApiKey(true); // Allow bypass access
      }
    }
    return success;
  };

  const handleServiceKeySubmit = useCallback(async (serviceKey: string): Promise<boolean> => {
    const trimmed = serviceKey.trim();
    if (!trimmed) return false;
    applyKeyToSettings(trimmed);
    const result = await unlockWithServiceKey(trimmed);
    if (result !== 'invalid') {
      setShowApiKeyModal(false);
      setHasConfirmedApiKey(true);
      addNotification({
        kind: 'api-key',
        severity: 'info',
        title: 'Enabling key active',
        message: 'Your LandSurv Enabling Key is active and verified.',
      });
      return true;
    }
    return handleApiKeySubmit(trimmed);
  }, [unlockWithServiceKey]);

  const handleSettingsApiKeySubmit = (apiKey: string): boolean => {
    // If empty, clear the stored key and confirmation
    if (!apiKey || apiKey.trim() === '') {
  localStorage.removeItem('landsurv_user_api_key');
      clearConfirmed();
      setSettings(prev => ({ ...prev, userApiKey: undefined }));
      setHasConfirmedApiKey(false);
      return true;
    }

    const success = unlockWithApiKey(apiKey);
    if (success) {
      const isSuperUserPassword = apiKey.trim() === 's3cur3s3cur3';
      const isLandSurvKey = isDemoApiKey(apiKey);
      if (!isSuperUserPassword) {
          const provider = applyKeyToSettings(apiKey);
        if (isLandSurvKey) {
          setHasConfirmedApiKey(true);
          addNotification({
            kind: 'api-key',
            severity: 'info',
            title: 'Enabling key saved',
            message: 'Your LandSurv Enabling Key is active and ready to use.',
          });
        } else {
            setPendingKeyProvider(provider);
            setHasConfirmedApiKey(false);
            setShowApiKeyConfirmation(true);
          }
        } else {
          setSettings(prev => ({ ...prev, userApiKey: undefined }));
          setHasConfirmedApiKey(true); // Allow bypass access
        }
      }
      return success;
    };

    // Per-provider key management from the Settings "AI Provider Keys" section.
    // An empty key clears that provider's slot; a non-empty key is validated,
    // stored in the provider's slot, and confirmed (billing notice) as needed.
    const handleProviderKeySubmit = (provider: ByokProvider, apiKey: string): boolean => {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        clearProviderApiKey(provider);
        setSettings(prev => ({
          ...prev,
          ...(provider === 'google' ? { userApiKey: undefined } : {}),
          ...(provider === 'openai' ? { openaiApiKey: undefined } : {}),
          ...(provider === 'xai' ? { xaiApiKey: undefined } : {}),
          ...(provider === 'anthropic' ? { anthropicApiKey: undefined } : {}),
        }));
        return true;
      }

      if (trimmed.length < 20) return false;

      setProviderApiKey(provider, trimmed);
      setSettings(prev => ({
        ...prev,
        ...(provider === 'google' ? { userApiKey: trimmed } : {}),
        ...(provider === 'openai' ? { openaiApiKey: trimmed } : {}),
        ...(provider === 'xai' ? { xaiApiKey: trimmed } : {}),
        ...(provider === 'anthropic' ? { anthropicApiKey: trimmed } : {}),
      }));

      if (provider === 'google' && isDemoApiKey(trimmed)) {
        setHasConfirmedApiKey(true);
      } else if (!isConfirmedForKey(trimmed)) {
        setPendingKeyProvider(provider);
        setHasConfirmedApiKey(false);
        setShowApiKeyConfirmation(true);
      }
      return true;
    };

  // CACP: PointAgent is the sole authority for next-point-number computation.
  // We mirror its result into local state so existing UI keeps working.
  useEffect(() => {
    const agent = PointAgent.getInstance();
    agent.setLabelingSettings(settings.pointLabelingSettings);
    const allPoints = pointLists.flatMap(l => l.points);
    agent.setAvailablePoints(allPoints);
    const [next] = agent.getNextNumbers(1);
    setNextAvailablePointNumber(next);
  }, [pointLists, settings.pointLabelingSettings]);

  const projectedPosition = useMemo(() => {
    if (!currentPosition || !settings.projection.epsg) {
      return null;
    }
    try {
      const fromProj = 'EPSG:4326'; // WGS84
      const toProj = `EPSG:${settings.projection.epsg}`;
      const [easting, northing] = proj4(fromProj, toProj, [currentPosition.coords.longitude, currentPosition.coords.latitude]);
      return { northing, easting };
    } catch (e) {
      console.error("Error projecting current position:", e);
      return null;
    }
  }, [currentPosition, settings.projection.epsg]);
  
  // REFACTORING: Use custom hook for geolocation tracking (Phase 2)
  // Only enable geolocation when GPS Stakeout agent is active to avoid requesting permission on page load
  useGeolocation(setCurrentPosition, setGeolocationError, activeAgent === AgentType.GPS_STAKEOUT || isGpsStakeoutFloatingVisible || isGpsCollectFloatingVisible);

  // REFACTORING: Use custom hook for initial loader removal (Phase 2)
  // Skip loader removal for XML sitemap pages to ensure clean crawlability
  useInitialLoader(500, pageMode === 'xml_sitemap');

  // REFACTORING: Use custom hook for theme management (Phase 2)
  useThemeManager(settings.theme);

  // REFACTORING: Use custom hook for managing app height CSS variable (Phase 2)
  useAppHeight();

  // REFACTORING: Use custom hook for thinking timer (Phase 2)
  useThinkingTimer(isLoading, setThinkingTime);

  // FIX: The logic for toggling layer visibility is updated to work with the new state structure that includes both visibility and color.
  const handleLayerToggle = useCallback((layerName: keyof typeof pointLayers) => {
    setPointLayers(prev => ({ 
        ...prev, 
        [layerName]: { 
            ...prev[layerName], 
            visible: !prev[layerName].visible 
        } 
    }));
  }, []);

  // FIX: Added a handler to manage color changes for point layers, which will be passed to the DrawingCanvas.
  const handleLayerColorChange = useCallback((layer: 'pointNumber' | 'description' | 'elevation', color: string) => {
    setPointLayers(prev => ({
      ...prev,
      [layer]: { ...prev[layer], color }
    }));
  }, []);

  // -- CAD Layer visibility handlers (from CAD Manager SSOT) -----------------
  const handleToggleCadLayer = useCallback((layerName: string) => {
    setCadLayerVisibility(prev => ({
      ...prev,
      [layerName]: prev[layerName] === false ? true : false,
    }));
  }, [setCadLayerVisibility]);

  const handleCadLayerColorChange = useCallback((layerName: string, color: string) => {
    setCadLayerColors(prev => ({ ...prev, [layerName]: color }));
  }, [setCadLayerColors]);
  // -------------------------------------------------------------------------

  /**
   * Dynamic list of CAD layers for the Data Visibility panel.
   * Merges:
   *  1. Layers defined in the loaded CAD Manager standard (the authoritative list)
   *  2. Any additional layers currently in use by lines or points (e.g. default layers
   *     assigned by agents before a standard was loaded)
   * Sorted alphabetically; deduped by name.
   */
  const activeCadLayers = useMemo((): CadLayerEntry[] => {
    const map = new Map<string, CadLayerEntry>();
    // Standard-defined layers (from CAD Manager SSOT)
    for (const l of cadManagerContext.getAllLayers()) {
      map.set(l.name, { name: l.name, isPointLayer: l.isPointLayer, isLineLayer: l.isLineLayer, description: l.description });
    }
    // Layers from active lines
    for (const line of lines) {
      if (line.layer && !map.has(line.layer)) {
        map.set(line.layer, { name: line.layer, isPointLayer: false, isLineLayer: true });
      }
    }
    // Layers from active points (new layer field)
    for (const list of pointLists) {
      for (const pt of list.points) {
        if (pt.layer && !map.has(pt.layer)) {
          map.set(pt.layer, { name: pt.layer, isPointLayer: true, isLineLayer: false });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cadManagerContext, lines, pointLists]);

  /**
   * Map of CAD layer name ? default linetype name, derived from the standard.
   * Used by DrawingCanvas to resolve a line's effective linetype when the line
   * itself carries no `lineType` (BYLAYER behavior, matching AutoCAD).
   */
  const layerLinetypeMap = useMemo((): Record<string, string> => {
    const map: Record<string, string> = {};
    const std = cadManagerState.standard;
    if (!std) return map;
    if (Array.isArray(std.layers)) {
      for (const l of std.layers) {
        if (l && l.name && l.lineType) map[l.name] = l.lineType;
      }
    }
    if (Array.isArray(std.codes)) {
      for (const c of std.codes) {
        if (c && c.lineLayer && c.lineType && !map[c.lineLayer]) {
          map[c.lineLayer] = c.lineType;
        }
      }
    }
    return map;
  }, [cadManagerState.standard]);

  // -- Symbol Library Sync � CAD Standards ? Symbols view (SSOT) --------------
  // Any code in the CAD Manager standard whose `symbol` field is a full
  // SymbolDefinition (svgPath present) is mirrored into the shared
  // `customSymbols[]` library so that:
  //   (a) the Symbols view sees it,
  //   (b) the drawing canvas auto-applies it (via utils/symbolResolver),
  //   (c) the CACP `cad_resolve_symbol_for_code` skill returns it.
  // Mirrored entries are tagged with id prefix `cadmgr:` so they round-trip
  // cleanly without colliding with user-uploaded symbols from the Symbols view.
  useEffect(() => {
    const std = cadManagerState.standard;
    if (!std || !Array.isArray(std.codes)) return;

    const mirrored: CustomSymbol[] = [];
    for (const code of std.codes) {
      const sym = code.symbol;
      if (!sym || typeof sym === 'string') continue;     // string = block name only, no SVG to mirror
      if (!sym.svgPath) continue;                        // need at least a vector outline
      const id = `cadmgr:${(sym.name || code.code).toLowerCase()}`;
      // Associated terms: the master code, the symbol name, and any legacy aliases.
      const terms = new Set<string>();
      if (code.code)  terms.add(code.code.toLowerCase());
      if (sym.name)   terms.add(sym.name.toLowerCase());
      (code.aliases ?? []).forEach(a => a && terms.add(a.toLowerCase()));
      mirrored.push({
        id,
        name: sym.name || code.code,
        description: sym.description || code.description || '',
        associatedTerms: Array.from(terms),
        svgPath: sym.svgPath,
        fillPath: sym.fillPath,
        viewBox: sym.viewBox || '0 0 24 24',
        scale: 1,
      });
    }

    if (mirrored.length === 0) return;

    setCustomSymbols(prev => {
      // Preserve user-added (non `cadmgr:`) symbols verbatim; replace any
      // existing `cadmgr:` entries with the fresh mirror set so renames /
      // deletions / svg changes from CAD Standards propagate.
      const userEntries = prev.filter(s => !s.id.startsWith('cadmgr:'));
      const prevMirroredById = new Map(
        prev.filter(s => s.id.startsWith('cadmgr:')).map(s => [s.id, s])
      );
      // Carry forward any user-adjusted scale from the previous mirror entry
      // so switching views / standard reloads do NOT reset the per-symbol scale.
      const mirroredWithScale = mirrored.map(m => {
        const prior = prevMirroredById.get(m.id);
        return prior && typeof prior.scale === 'number' ? { ...m, scale: prior.scale } : m;
      });
      // Deep-equality check before writing � prevents the effect from
      // re-firing in a loop when nothing actually changed.
      const prevMirrored = prev.filter(s => s.id.startsWith('cadmgr:'));
      const same =
        prevMirrored.length === mirroredWithScale.length &&
        prevMirrored.every((p, i) => {
          const m = mirroredWithScale[i];
          return p.id === m.id && p.name === m.name && p.svgPath === m.svgPath && p.fillPath === m.fillPath && p.viewBox === m.viewBox && p.scale === m.scale && p.associatedTerms.join('|') === m.associatedTerms.join('|');
        });
      if (same) return prev;
      return [...userEntries, ...mirroredWithScale];
    });
  }, [cadManagerState.standard, setCustomSymbols]);

  // REFACTORING: Use custom hook for desktop mode transitions (Phase 2)
  useDesktopEffect(isDesktop, setActiveVisualPanel);
  // REFACTORING: Use custom hook for PointEditor vertical panel resizing (Phase 2)
  // NOTE: PointEditor is now in chat interface, so this resize handler is no longer needed
  // Kept context states for backward compatibility
  /*
  const { handleMouseDown: handlePointEditorResizeMouseDown } = useVerticalPanelResize(
    isResizingPointEditor,
    setIsResizingPointEditor,
    visualPanelAndEditorContainerRef,
    pointEditorHeight,
    setPointEditorHeight,
    150,
    200
  );
  */

  // REFACTORING: Use custom hook for ContourPanel vertical panel resizing (Phase 2)
  // REFACTORING: Use custom hook for horizontal chat panel resizing (Phase 2)
  const { handleChatResizeMouseDown } = useChatPanelResize(
    isResizingChat,
    setIsResizingChat,
    setChatPanelWidth,
    320,  // minWidth
    400   // maxWidthOffset (space for main panel)
  );

  const showView = useCallback((viewToShow: VisualPanel) => {
      // Push current state to history before changing view
      if (isSessionActive && !isInitialScreen && viewToShow !== activeVisualPanel) {
        pushNavigation(activeAgent, activeVisualPanel);
      }
      
      setActiveVisualPanel(viewToShow);
      
      if (viewToShow === 'gpsstakeout') {
        setActiveAgent(AgentType.GPS_STAKEOUT);
      } else if (viewToShow === 'imageanalyzer') {
        setActiveAgent(AgentType.IMAGE_ANALYZER);
      } else if (viewToShow === 'profile') {
        setActiveAgent(AgentType.PROFILE_AGENT);
      } else if (viewToShow === 'cadmanager' || viewToShow === 'cadstandards') {
        setActiveAgent(AgentType.CAD_MANAGER);
      } else if (viewToShow === 'sheetview') {
        // Sheet View is logically part of the CAD Manager agent surface.
        setActiveAgent(AgentType.CAD_MANAGER);
      } else if (viewToShow === 'draftstylelib') {
        // Drafting Style Library is a CAD Manager sub-tool.
        setActiveAgent(AgentType.CAD_MANAGER);
      } else if (viewToShow === 'compliance') {
        setActiveAgent(AgentType.STANDARDS_COMPLIANCE);
      } else if (viewToShow === 'texteditor') {
        setLastActiveAgent(activeAgent);
      }

      if (isPdfViewerFullscreen) setIsPdfViewerFullscreen(false);
      if(!isDesktop) setIsMobileMenuOpen(false);
  }, [isDesktop, isPdfViewerFullscreen, activeAgent, isSessionActive, isInitialScreen, activeVisualPanel, pushNavigation]);
  
  // REFACTORING NOTE: handleFabPointerDown moved to useFabDrag hook (Phase 2)
  // OLD: const handleFabPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => { ... }, []);

  const handleFabClick = useCallback(() => {
    if (fabDragState.current.hasMoved) return;
    toggleChatPanel();
  }, [toggleChatPanel]);

  // REFACTORING NOTE: agentNeedsInitialScreen and showUploadScreen moved earlier for useFabDrag dependency (Phase 2)
  // OLD: const agentNeedsInitialScreen = [...].includes(activeAgent);
  // OLD: const showUploadScreen = (agentNeedsInitialScreen && !isCurrentAgentInitialized) || isAddingData;

  // REFACTORING NOTE: FAB positioning and drag logic moved to useFabDrag hook (Phase 2)
  // OLD: Two useEffect hooks for FAB positioning and dragging - see useFabDrag hook

  // FUTURE GEMINI: This `handleReset` function is critical for starting a new session.
  // When adding new state to the app, ensure it is reset to its default value here.
  const handleReset = useCallback(() => {
    setShowWelcome(true);
    setIsInitialScreen(true);
    setInitializedAgents(new Set());
    setIsAddingData(false);
    setRawFile(null);
    setDeedFile(null);
    setPlanFiles(null);
    setDxfFile(null);
    setClFile(null);
    setImageFiles(null);
    setGisFile(null);
    setGeneratedFiles([]);
    setPdfViewerFiles(null);
    clearHighlights();
    setWmsServices([]);
    setActiveWmsLayers([]);
    setOfflineMapAreas([]);
    setCustomSymbols([]);
    setJobInfo({ jobName: 'Project Name', jobNo: 'Project No.' });
    setIsAboutVisible(false);
    setIsForwardThinkingVisible(false);
    setIsHelpModalVisible(false);
    setIsSettingsVisible(false);
    setIsChatPanelVisible(true);

    setRawChat(null);
    setDeedChat(null);
    setDxfChat(null);
    setStationingChat(null);
    setPointEditorChat(null);
    setGpsStakeoutChat(null);
    setLsvzChat(null);
    setPlanExpertChat(null);
    setImageAnalyzerChat(null);
    setGisChat(null);
    // FIX: Reset contouring agent chat state.
    setContouringChat(null);
    // FIX: Reset profile agent chat state.
    setProfileChat(null);
    setCogoChat(null);
    setRinexChat(null);
    setDroneChat(null);
    setStandardsComplianceChat(null);
    setRawChatHistory([]);
    setDeedChatHistory([]);
    setDxfChatHistory([]);
    setStationingChatHistory([]);
    setPointEditorChatHistory([]);
    setFieldbookLog([]);
    setGpsStakeoutChatHistory([]);
    setLsvzChatHistory([]);
    setPlanExpertChatHistory([]);
    setImageAnalyzerChatHistory([]);
    setGisChatHistory([]);
    // FIX: Reset contouring agent chat history state.
    setContouringChatHistory([]);
    setSteepSlopeChatHistory([]);
    // FIX: Reset profile agent chat history state.
    setProfileChatHistory([]);
    setCogoChatHistory([]);
    setRinexChatHistory([]);
    setDroneChatHistory([]);
    setStandardsComplianceChatHistory([]);
    setStandardsComplianceControlFile(null);
    setStandardsComplianceSubjectFile(null);
    setStandardsComplianceSourceMode('ask-each-run');
    setStandardsComplianceChecks(DEFAULT_STANDARDS_CHECKS);
    setStandardsComplianceLastReport(null);
    // FIX: Reset profile data and info states.
    setProfileData([]);
    setProfileInfo(null);
    setFieldbookNotes('');
    setActiveTextEditorFile(null);
    setTextEditorContent('');
    setHasUnsavedChanges(false);
    setClosureReports([]);
    setBoundaryFiles([]);
    setIsBoundaryEditorVisible(false);
    setIsBoundaryEditorButtonPulsing(false);
    setDimensions([]);
    setDraftingStyleLibrary([]);
    setCanvasTransform(null);
    
    setIsLoading(false);
    setError(null);
    setSuggestedQuestions([]);
    
    setPointLists([{ id: 'working', name: 'Unsaved Points', points: [], isVisible: true }]);
    setLines([]);
    setContourLabels([]);
    setLineLabelScale(1);
    setCenterlines([]);
    setLinesVisible(true);
    setCenterlinesVisible(true);
     setCutSheetInfo({
      projectName: 'Project Name',
      projectNumber: 'Project No.',
      date: new Date().toLocaleDateString(),
      ...settings.defaultCutSheetInfo,
    });
    
    setActiveVisualPanel('canvas');
    setIsVisualPanelFullscreen(false);
    setIsPdfViewerFullscreen(false);
    setIsStationingPanelExpanded(false);
    if(!isDesktop) setIsMobileMenuOpen(false);
  }, [isDesktop, settings.defaultCutSheetInfo, clearHighlights]);

  const handleSuperUserReset = useCallback(() => {
    if (!isSuperUser) return;
    
  if (confirm('?? SUPERUSER RESET\n\nThis will:\n- Clear all app data\n- Clear any stored API key\n- Restore default settings\n\nContinue?')) {
      handleReset();
      resetTimer();
      setSettings(prev => ({ ...prev, userApiKey: undefined }));
    }
  }, [isSuperUser, handleReset, resetTimer]);

  const handleToggleTheme = useCallback(() => {
    setSettings(prev => ({
        ...prev,
        theme: prev.theme === 'dark' ? 'light' : 'dark'
    }));
  }, []);

  const initializeFieldbook = useCallback(() => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const initialMessage: ChatMessage = {
      role: MessageRole.MODEL,
      text: `${timestamp} - Fieldbook session initialized. Key actions will be logged automatically.`
    };
    setFieldbookLog([initialMessage]);
  }, []);

  const logActionToFieldbook = useCallback((actionText: string, action?: ChatMessageAction) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logEntry: ChatMessage = {
      role: MessageRole.MODEL,
      text: `${timestamp} - ${actionText}`,
      action: action
    };
    setFieldbookLog(prev => [...prev, logEntry]);
    // KNOWLEDGE BASE: also mirror every fieldbook entry as a fact so agents
    // can recall what's happened this session via kb_query / recallFact.
    try {
      knowledgeBase.recordFact({
        category: 'fieldbook',
        subject: timestamp,
        predicate: 'entry',
        value: actionText,
        source: 'system',
        confidence: 1,
      });
    } catch { /* non-fatal */ }
  }, []);

  // Natural-language undo ("undo the last boundary edit") � registers the
  // history_query / history_undo_to CACP skills against the canvas history.
  useHistorySkills({ logActionToFieldbook });
  
  const startSession = useCallback(() => {
    if (initializedAgents.size === 0) {
      initializeFieldbook();
    }
  }, [initializedAgents, initializeFieldbook]);

  const handleFileUploaded = useCallback((content: string, name: string) => {
    try {
        if (initializedAgents.has(AgentType.RAW_CRAWLER)) {
            if (rawFile) {
                setGeneratedFiles(prev => [...prev, { ...rawFile, name: `(Archived) ${rawFile.name}` }]);
            }
            logActionToFieldbook(`Replaced RAW file with: ${name}`);
            const newChat = startChatWithOverride(AgentType.RAW_CRAWLER, content);
            setRawChat(newChat);
            setRawFile({ name, content });
            setRawChatHistory([{ 
                role: MessageRole.MODEL, 
                text: `The <strong style="color: ${agentThemeColors[AgentType.RAW_CRAWLER]};">RAW Crawler</strong> agent has been reset. The new active file is <strong style="color: ${agentThemeColors[AgentType.RAW_CRAWLER]};">"${name}"</strong>. The previous conversation has been cleared.`
            }]);
            setPointLists(prev => prev.map(l => l.id === 'working' ? { ...l, points: [] } : l));
            setLines([]);
            setContourLabels([]);
            setIsAddingData(false);
            return;
        }

        startSession();
        logActionToFieldbook(`Loaded RAW file: ${name}`);
        const newChat = startChatWithOverride(AgentType.RAW_CRAWLER, content);
        setRawChat(newChat);
        setRawFile({ name, content });
        setRawChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.RAW_CRAWLER]};">RAW Crawler</strong> agent. I have successfully loaded the file <strong style="color: ${agentThemeColors[AgentType.RAW_CRAWLER]};">"${name}"</strong> and am ready to assist.`,
        }]);
        
        const questionsSource = name === exampleFileName ? suggestedQuestionsText : userSuggestedQuestionsText;
        const questions = questionsSource.split('\n').filter(q => q.trim() !== '');
        setSuggestedQuestions(questions);
        
        setError(null);
        
        // Push navigation history so user can go back to file upload screen
        pushNavigation(AgentType.RAW_CRAWLER, 'canvas');
        
        setActiveAgent(AgentType.RAW_CRAWLER);
        setInitializedAgents(prev => new Set(prev).add(AgentType.RAW_CRAWLER));
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, rawFile, settings, startChatWithOverride]);
  
  // Civil Drafter file upload handler - similar to RAW Crawler but uses intelligent linework generation
  const handleCivilDrafterFileUploaded = useCallback((content: string, name: string) => {
    try {
        // Get training DXF if one has been marked for training
        const trainingDxf = dxfFile?.forTraining ? dxfFile : undefined;
        
        // Parse points from the file and add to point lists for canvas rendering
        const parsedPoints = parsePointFile(content);
        const listName = name.replace(/\.[^/.]+$/, ""); // Remove file extension
        
        if (initializedAgents.has(AgentType.CIVIL_DRAFTER)) {
            if (rawFile) {
                setGeneratedFiles(prev => [...prev, { ...rawFile, name: `(Archived) ${rawFile.name}` }]);
            }
            logActionToFieldbook(`Replaced Civil Drafter RAW file with: ${name}`);
            const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, content, trainingDxf);
            setCivilDrafterChat(newChat);
            setRawFile({ name, content });
            setCivilDrafterChatHistory([{ 
                role: MessageRole.MODEL, 
                text: trainingDxf 
                    ? `The <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent has been reset. The new active file is <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${name}"</strong>. I'm using <strong>"${trainingDxf.name}"</strong> as my drafting template. The previous conversation has been cleared.`
                    : `The <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent has been reset. The new active file is <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${name}"</strong>. The previous conversation has been cleared.`
            }]);
            // Replace working points with parsed points from new file
            if (parsedPoints.length > 0) {
                setPointLists(prev => {
                    // Remove any existing list with the same name, then add the new one
                    const filtered = prev.filter(l => l.id !== 'civil-drafter-points');
                    return [...filtered.map(l => l.id === 'working' ? { ...l, points: [] } : l), 
                            { id: 'civil-drafter-points', name: listName, points: parsedPoints, isVisible: true }];
                });
                logActionToFieldbook(`Parsed ${parsedPoints.length} points from ${name} for canvas rendering.`);
            } else {
                setPointLists(prev => prev.map(l => l.id === 'working' ? { ...l, points: [] } : l));
            }
            setLines([]);
            setContourLabels([]);
            setIsAddingData(false);
            // Clear vision cache � new file, fresh gimbal scan on next draw request
            setCivilDrafterVisionSurvey(null);
            lastVisionPointCountRef.current = 0;
            visionAerialRef.current = null;
            setShowVisionHUD(true);
            return;
        }

        startSession();
        logActionToFieldbook(`Loaded RAW file for Civil Drafter: ${name}` + (trainingDxf ? ` (using training template: ${trainingDxf.name})` : ''));
        try {
          const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, content, trainingDxf);
          setCivilDrafterChat(newChat);
        } catch (chatErr) {
          console.warn('[Civil Drafter] AI chat deferred (no API key configured):', chatErr);
        }
        setRawFile({ name, content });
        setCivilDrafterChatHistory([{
            role: MessageRole.MODEL,
            text: trainingDxf
                ? `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I have loaded the file <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${name}"</strong> and am ready to create intelligent linework. I'm using <strong>"${trainingDxf.name}"</strong> as my template to learn your preferred drafting conventions.`
                : `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I have loaded the file <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${name}"</strong> and am ready to create intelligent linework. I specialize in recognizing road corridors (parallel lines), building footprints, and other civil features.`,
        }]);
        
        // Add parsed points to canvas
        if (parsedPoints.length > 0) {
            setPointLists(prev => [...prev, { id: 'civil-drafter-points', name: listName, points: parsedPoints, isVisible: true }]);
            logActionToFieldbook(`Parsed ${parsedPoints.length} points from ${name} for canvas rendering.`);
        }
        
        setSuggestedQuestions([
            'Draw the road edges as parallel lines',
            'Create centerline from survey shots',
            'Plot building footprints',
            'Analyze the point descriptions',
        ]);
        
        setError(null);
        
        // Push navigation history
        pushNavigation(AgentType.CIVIL_DRAFTER, 'canvas');
        
        setActiveAgent(AgentType.CIVIL_DRAFTER);
        setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_DRAFTER));
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Civil Drafter agent.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, rawFile, dxfFile, settings, startChatWithOverride]);

  const handleCivilDrafterPdfUploaded = useCallback((files: SessionFile[]) => {
    try {

        if (initializedAgents.has(AgentType.CIVIL_DRAFTER)) {
            const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, files);
            setCivilDrafterChat(newChat);
            setPlanFiles(files);
            setCivilDrafterChatHistory(prev => [...prev, {
                role: MessageRole.MODEL,
                text: `Added <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">${files.length} PDF plan(s)</strong>. I'll use these to help generate linework.`,
            }]);
            setIsAddingData(false);
            return;
        }

        startSession();
        logActionToFieldbook(`Loaded ${files.length} PDF plan(s) for Civil Drafter: ${files.map(f => f.name).join(', ')}`);
        const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, files);
        setCivilDrafterChat(newChat);
        setPlanFiles(files);
        setPdfViewerFiles(files);
        setCivilDrafterChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I have loaded <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">${files.length} PDF plan(s)</strong> and am ready to help generate intelligent linework from your civil plans.`,
        }]);
        setSuggestedQuestions([
            'Draw the road edges as parallel lines',
            'Create centerline from the plan',
            'Plot building footprints',
            'Extract lot boundaries',
        ]);
        setError(null);
        pushNavigation(AgentType.CIVIL_DRAFTER, 'canvas');
        setActiveAgent(AgentType.CIVIL_DRAFTER);
        setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_DRAFTER));
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Civil Drafter agent.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  // Start Civil Drafter directly from points that are already loaded (e.g. from the
  // Point Editor) without requiring the user to upload another file.
  const handleCivilDrafterUseExistingPoints = useCallback(() => {
    try {
        const existingPoints = pointLists.flatMap(l => l.points);
        if (existingPoints.length === 0) {
            setError('No points are currently loaded to draw from.');
            setTimeout(() => setError(null), 3000);
            return;
        }

        const trainingDxf = dxfFile?.forTraining ? dxfFile : undefined;
        const name = 'Loaded Points';
        const content = pointListToString(
            { id: 'civil-drafter-loaded', name, points: existingPoints, isVisible: true },
            settings
        );

        const alreadyInitialized = initializedAgents.has(AgentType.CIVIL_DRAFTER);
        if (!alreadyInitialized) {
            startSession();
        }
        logActionToFieldbook(`Started Civil Drafter from ${existingPoints.length} already-loaded point(s).`);

        const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, content, trainingDxf);
        setCivilDrafterChat(newChat);
        setRawFile({ name, content });
        setCivilDrafterChatHistory([{
            role: MessageRole.MODEL,
            text: trainingDxf
                ? `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I'm working directly from the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">${existingPoints.length} points</strong> you already have loaded. I'm using <strong>"${trainingDxf.name}"</strong> as my template to learn your preferred drafting conventions.`
                : `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I'm working directly from the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">${existingPoints.length} points</strong> you already have loaded and am ready to create intelligent linework.`,
        }]);

        setSuggestedQuestions([
            'Draw the road edges as parallel lines',
            'Create centerline from survey shots',
            'Plot building footprints',
            'Analyze the point descriptions',
        ]);

        // Reset vision cache so the next draw request rescans the loaded points.
        setCivilDrafterVisionSurvey(null);
        lastVisionPointCountRef.current = 0;
        visionAerialRef.current = null;
        setShowVisionHUD(true);

        setError(null);
        setIsAddingData(false);
        pushNavigation(AgentType.CIVIL_DRAFTER, 'canvas');
        setActiveAgent(AgentType.CIVIL_DRAFTER);
        setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_DRAFTER));
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Civil Drafter agent.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [pointLists, dxfFile, settings, initializedAgents, startSession, logActionToFieldbook, startChatWithOverride, pushNavigation, showView]);

  const handleLaunchAgenticCad = useCallback((mode: 'blank' | 'sample' | 'existing' = 'blank') => {
    // First-time legal gate check
    if (!hasLegalSignature && !hasSignedLegalAgreement()) {
      pendingLegalLaunchRef.current = mode;
      setShowLegalGate(true);
      setShowWelcome(false);
      return;
    }

    if (mode === 'sample') {
      handleCivilDrafterFileUploaded(exampleFileContent, exampleFileName);
      setIsInitialScreen(false);
      setShowWelcome(false);
      return;
    }

    if (mode === 'existing') {
      handleCivilDrafterUseExistingPoints();
      setIsInitialScreen(false);
      setShowWelcome(false);
      return;
    }

    // Direct jump to canvas in Civil Drafter: Hybrid AI / Manual drafting, no dummy points
    try {
      startSession();
      logActionToFieldbook('Launched Agentic CAD directly to Canvas in Civil Drafter (Hybrid AI / Manual Drafting).');
      const trainingDxf = dxfFile?.forTraining ? dxfFile : undefined;
      const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, '', trainingDxf);
      setCivilDrafterChat(newChat);
      setRawFile({ name: 'agentic_canvas.dxf', content: '' });
      // Ensure completely clean canvas - NO dummy points
      setPointLists(prev => prev.map(l => l.id === 'working' ? { ...l, points: [] } : l));
      setLines([]);
      setContourLabels([]);
      setCivilDrafterChatHistory([{
        role: MessageRole.MODEL,
        text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent for <strong>Hybrid AI / Manual Drafting</strong>. Canvas is ready with a clean workspace (no dummy points loaded). You can draw lines and points manually with the CAD toolbar, or ask me to draft boundaries, alignments, building footprints, and road corridors using natural language.`,
      }]);
      setSuggestedQuestions([
        'Draw a boundary starting at 5000, 5000 with bearings N 45° E 100 ft',
        'Create a 30 ft roadway corridor with parallel edges',
        'Plot a 40x60 ft building footprint with a 25 ft front setback',
        'Draft easement lines offset 10 ft from right property line',
      ]);
      setCivilDrafterVisionSurvey(null);
      lastVisionPointCountRef.current = 0;
      visionAerialRef.current = null;
      setShowVisionHUD(true);
      setError(null);
      setIsAddingData(false);
      setIsInitialScreen(false);
      setActiveAgent(AgentType.CIVIL_DRAFTER);
      setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_DRAFTER));
      setActiveVisualPanel('canvas');
      showView('canvas');
      setIsChatPanelVisible(true);
      pushNavigation(AgentType.CIVIL_DRAFTER, 'canvas');
      setShowWelcome(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to launch Agentic CAD.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [
    hasLegalSignature,
    handleCivilDrafterFileUploaded,
    handleCivilDrafterUseExistingPoints,
    startSession,
    logActionToFieldbook,
    dxfFile,
    startChatWithOverride,
    setCivilDrafterChat,
    setCivilDrafterChatHistory,
    setSuggestedQuestions,
    setCivilDrafterVisionSurvey,
    setShowVisionHUD,
    setError,
    setIsAddingData,
    setIsInitialScreen,
    setActiveAgent,
    setInitializedAgents,
    setActiveVisualPanel,
    showView,
    setIsChatPanelVisible,
    pushNavigation,
    setShowWelcome,
    setPointLists,
    setLines,
    setContourLabels,
  ]);

  const handleGoHome = useCallback(() => {
    setShowWelcome(false);
    setIsInitialScreen(true);
  }, [setShowWelcome, setIsInitialScreen]);

  const handleDeedSubmitted = useCallback((file: SessionFile) => {
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
      setShowHostCostReminder(true);
      return;
    }
    try {
      if (initializedAgents.has(AgentType.DEED_READER)) {
            if (deedFile) {
                setGeneratedFiles(prev => [...prev, { ...deedFile, name: `(Archived) ${deedFile.name}` }]);
            }
            logActionToFieldbook(`Replaced Deed Text with: ${file.name}`);
            const newChat = startChatWithOverride(AgentType.DEED_READER, file);
            setDeedChat(newChat);
            setDeedFile(file);
            clearHighlights(); // Clear old highlights
            setPdfViewerFiles(file.fileData ? [file] : null);
            setDeedChatHistory([{ 
                role: MessageRole.MODEL, 
                text: `The <strong style="color: ${agentThemeColors[AgentType.DEED_READER]};">Boundary Agent</strong> has been reset with the new file <strong style="color: ${agentThemeColors[AgentType.DEED_READER]};">"${file.name}"</strong>.`
            }]);
            setIsAddingData(false);
            // Re-run cheap deed summarizer for the replacement file.
            setDeedSummaryFileIds(['__pending__']);
            setDeedSummary(null);
            setComputingTractIds(new Set());
            pendingTractIdRef.current = null;
            pendingTractPobRef.current = null;
            void (async () => {
              try {
                const summary = await summarizeDeed(file, CURRENT_GEMINI_MODEL, settings.userApiKey);
                setDeedSummary(summary);
              } catch (err) {
                console.warn('[handleDeedSubmitted/replace] summarizeDeed threw:', err);
              }
            })();
            return;
      }
      
      startSession();
      logActionToFieldbook(`Loaded deed description: ${file.name}`);
      const newChat = startChatWithOverride(AgentType.DEED_READER, file);
      setDeedChat(newChat);
      setDeedFile(file);
      setPdfViewerFiles(file.fileData ? [file] : null);
      setDeedChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.DEED_READER]};">Boundary Agent</strong>. I have loaded the deed description from <strong style="color: ${agentThemeColors[AgentType.DEED_READER]};">"${file.name}"</strong> and am ready to assist.`,
        }]);
      const questions = deedSuggestedQuestionsText.split('\n').filter(q => q.trim() !== '');
      setSuggestedQuestions(questions);
      
      setError(null);
      
      // Push navigation history so user can go back to file upload screen
      pushNavigation(AgentType.DEED_READER, 'canvas');
      
      setActiveAgent(AgentType.DEED_READER);
      setInitializedAgents(prev => new Set(prev).add(AgentType.DEED_READER));
      setIsPointListButtonPulsing(false);
      showView('canvas');

      // Show the Deed Summary panel immediately � we will populate it
      // asynchronously with the cheap `summarizeDeed()` result so the user
      // sees a tract list (with per-tract Compute Preview buttons) BEFORE
      // any heavy geometry parse runs.
      setDeedSummaryFileIds(['__pending__']);
      setDeedSummary(null);
      setComputingTractIds(new Set());
      pendingTractIdRef.current = null;
      pendingTractPobRef.current = null;
      void (async () => {
        try {
          const summary = await summarizeDeed(file, CURRENT_GEMINI_MODEL, settings.userApiKey);
          setDeedSummary(summary);
          if (summary.tracts.length > 0) {
            logActionToFieldbook(`Deed summary: detected ${summary.tracts.length} tract${summary.tracts.length === 1 ? '' : 's'} � ${summary.tracts.map(t => t.tractId).join(', ')}.`);
          } else {
            logActionToFieldbook('Deed summary returned no tracts � use "Compute All" to force a full parse.');
          }
        } catch (err) {
          console.warn('[handleDeedSubmitted] summarizeDeed threw:', err);
        }
      })();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeTierTimeLocked, activeModel, showView, startSession, logActionToFieldbook, initializedAgents, deedFile, settings, clearHighlights, startChatWithOverride]);



  /**
   * Answer a connector chat request with a LandSurv.ai agent.
   *
   * Opens the agent (which auto-initializes it against the points already on
   * the canvas), runs the request through the normal chat path so it gets the
   * full agent — tools, drafting style library, CAD standard — then returns its
   * reply to the connector. Anything drawn live-syncs back to Civil 3D.
   */
  const answerC3DAgentRequest = useCallback(async (requestId: string, agentId: string, prompt: string) => {
    const agent = agentId === 'CIVIL_DRAFTER' ? AgentType.CIVIL_DRAFTER : null;
    if (!agent || !prompt?.trim() || !handleSendMessageRef.current) {
      sendC3DRaw({ type: 'c3d_agent_response', requestId, success: false,
        error: `LandSurv.ai cannot route "${agentId}" requests yet.` });
      return;
    }

    try {
      handleAgentChangeRef.current?.(agent);
      // Let the agent switch (and its auto-initialization) commit before asking.
      await new Promise(resolve => setTimeout(resolve, 0));

      const before = civilDrafterChatHistoryRef.current.length;
      await handleSendMessageRef.current(prompt, agent);

      // The streamed reply lands in state; yield once so the ref sees the final text.
      await new Promise(resolve => setTimeout(resolve, 50));
      const history = civilDrafterChatHistoryRef.current;
      const reply = history.length > before
        ? [...history].reverse().find(m => m.role === MessageRole.MODEL && m.text?.trim())
        : undefined;
      const text = (reply?.text ?? '').replace(/<[^>]+>/g, '').trim();

      if (!text) {
        // The agent never engaged — usually no session/points loaded in the web
        // app. Report it so the connector answers locally instead of implying
        // the drafting happened.
        sendC3DRaw({ type: 'c3d_agent_response', requestId, success: false,
          error: 'Civil Drafter is not ready in LandSurv.ai (open the app and load your points).' });
        return;
      }

      sendC3DRaw({ type: 'c3d_agent_response', requestId, success: true, text });
      logActionToFieldbook(`Civil 3D asked the Civil Drafter: "${prompt}"`);
    } catch (err) {
      sendC3DRaw({ type: 'c3d_agent_response', requestId, success: false,
        error: err instanceof Error ? err.message : String(err) });
    }
  }, [sendC3DRaw, logActionToFieldbook]);

  answerC3DAgentRequestRef.current = answerC3DAgentRequest;

  /**
   * Adopt a Civil 3D layer table as the active CAD Manager standard.
   *
   * Shared by the Sync wizard's "Use layers from CAD" answer and (via the same
   * builder) the CAD Manager's Pull Layers button. Codes are generated for the
   * drawing's layers because agent layer lookups resolve through codes — a bare
   * layer list would leave every agent drawing on the previous standard.
   */
  const adoptCadLayerStandard = useCallback((records: SnapshotLayerRecord[]) => {
    const drawingLabel = (c3dActiveDrawing || 'Civil 3D')
      .replace(/^.*[\\/]/, '')
      .replace(/\.dwg$/i, '')
      .trim() || 'Civil 3D';

    const standard = buildStandardFromDrawingLayers(snapshotLayersToPulled(records), drawingLabel);
    if (standard.codes.length === 0) return;

    try {
      const sessionName = `${drawingLabel} — C3D Layers`;
      const session = saveCadManagerSession({
        id: findCadManagerSessionIdByName(sessionName) || undefined,
        name: sessionName,
        description: standard.description,
        standard,
        generatedMarkdown: null,
        chatHistory: [],
        unknownCodes: [],
        surveyFileName: undefined,
        aliases: {},
        standardsTab: 'pull',
      });
      setActiveCadManagerSessionId(session.id);
    } catch (err) {
      console.warn('[C3D Sync] Could not persist the adopted layer session:', err);
    }

    cadManagerContext.dispatch({ type: 'SET_STANDARD', payload: standard });
    logActionToFieldbook(
      `CAD Manager: adopted ${standard.layers?.length ?? 0} layers from ${drawingLabel} as the active standard.`
    );
  }, [c3dActiveDrawing, cadManagerContext, logActionToFieldbook]);

  const adoptCadLayerStandardRef = useRef(adoptCadLayerStandard);
  adoptCadLayerStandardRef.current = adoptCadLayerStandard;

  // -- LSAI-side apply (shared by webapp Sync Center AND DLL wizard round-trip) --
  // Applies create-lsai/update-lsai/delete-lsai actions into React state inside a
  // single canvas-history transaction so the whole sync is one undo entry.
  const applyLsaiActions = useCallback((plan: SyncApplyPlan, cadSnapshot: C3DSyncSnapshot): { summary: string; applied: number; failed: number } => {
    let applied = 0;
    let failed = 0;
    const notes: string[] = [];

    canvasHistory.withLabel('C3D Sync (from Civil 3D)', () => {
      for (const cat of plan.categories) {
        const cadByKey = new Map<string, any>();
        const cadList = (cadSnapshot as any)[cat.category === 'annotation' ? 'annotations' : cat.category] ?? [];

        // "Use layers from CAD" is an adoption, not a merge: the drawing's
        // layer table becomes a new CAD Manager standard (with codes bound to
        // those layers) so every agent draws on the company's layers from
        // here on. Identical to pressing "Pull Layers" in the CAD Manager.
        // Nothing to adopt when the tables already agree — that would only
        // churn the session list.
        if (cat.category === 'layers' && cat.direction === 'cad-wins' && cadList.length > 0) {
          const pending = cat.entries.filter(e => e.action.endsWith('-lsai')).length;
          if (pending > 0) {
            adoptCadLayerStandardRef.current(cadList as SnapshotLayerRecord[]);
            applied += pending;
            continue;
          }
        }

        for (const rec of cadList) {
          const k = cat.category === 'points' ? (rec.pointNumber ?? '').toUpperCase()
            : cat.category === 'layers' ? (rec.name ?? '').toUpperCase()
            : cat.category === 'symbols' ? (rec.name ?? '').toUpperCase()
            : rec.id;
          if (k) cadByKey.set(k, rec);
        }

        for (const entry of cat.entries) {
          if (!entry.action.endsWith('-lsai')) continue;
          const key = cat.category === 'points' || cat.category === 'layers' || cat.category === 'symbols'
            ? entry.key.toUpperCase() : entry.key;
          const cadRec = cadByKey.get(key);
          try {
            switch (cat.category) {
              case 'points': applyLsaiPoint(entry.action, key, cadRec); break;
              case 'layers': applyLsaiLayer(entry.action, key, cadRec); break;
              case 'linework': applyLsaiLinework(entry.action, key, cadRec); break;
              case 'annotation': applyLsaiAnnotation(entry.action, key, cadRec); break;
              case 'symbols': applyLsaiSymbol(entry.action, key, cadRec); break;
            }
            applied++;
          } catch (err) {
            failed++;
            notes.push(`${entry.action} ${entry.key} failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    });

    if (applied > 0) logActionToFieldbook(`C3D sync applied ${applied} change(s) to LandSurv.ai from Civil 3D.`);
    return {
      summary: `${applied} LSAI-side change(s) applied${failed > 0 ? `, ${failed} failed (${notes.slice(0, 2).join('; ')})` : ''}`,
      applied,
      failed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasHistory, logActionToFieldbook, pointLists, lines, centerlines, streetLabels, parcelLabels, customSymbols, cadManagerState]);

  const applyLsaiActionsRef = useRef(applyLsaiActions);
  applyLsaiActionsRef.current = applyLsaiActions;

  // Per-category LSAI mutators (close over current state setters).
  const applyLsaiPoint = useCallback((action: string, key: string, cadRec?: { pointNumber: string; easting: number; northing: number; elevation: number; description: string; layer?: string | null }) => {
    setPointLists(prev => {
      const lists = [...prev];
      let listIdx = lists.findIndex(l => l.points.some(p => p.pointNumber.toUpperCase() === key));
      if (listIdx < 0) listIdx = lists.findIndex(l => l.isVisible);
      if (listIdx < 0) listIdx = 0;
      if (lists.length === 0) {
        lists.push({ id: 'working', name: 'Unsaved Points', points: [], isVisible: true });
        listIdx = 0;
      }

      if (action === 'delete-lsai') {
        const list = lists[listIdx];
        lists[listIdx] = { ...list, points: list.points.filter(p => p.pointNumber.toUpperCase() !== key) };
        return lists;
      }

      if (!cadRec) throw new Error(`CAD point ${key} missing from snapshot`);
      const newPoint = {
        pointNumber: cadRec.pointNumber,
        northing: cadRec.northing,
        easting: cadRec.easting,
        elevation: cadRec.elevation,
        description: cadRec.description,
        layer: cadRec.layer ?? undefined,
      };
      const list = lists[listIdx];
      const existingIdx = list.points.findIndex(p => p.pointNumber.toUpperCase() === key);
      if (existingIdx >= 0) {
        const points = [...list.points];
        points[existingIdx] = { ...points[existingIdx], ...newPoint };
        lists[listIdx] = { ...list, points };
      } else {
        lists[listIdx] = { ...list, points: [...list.points, newPoint] };
      }
      return lists;
    });
  }, [setPointLists]);

  const applyLsaiLayer = useCallback((action: string, key: string, cadRec?: { name: string; color?: string | null; lineType?: string | null; lineWeight?: number | null }) => {
    const std = cadManagerState.standard;
    if (!std) return;
    const layers = [...(std.layers ?? [])];
    const idx = layers.findIndex(l => l.name.toUpperCase() === key);

    if (action === 'delete-lsai') {
      if (idx >= 0) layers.splice(idx, 1);
    } else {
      if (!cadRec) throw new Error(`CAD layer ${key} missing from snapshot`);
      const def = {
        name: cadRec.name,
        color: undefined as number | undefined, // hex from CAD not mappable to ACI here
        lineType: cadRec.lineType ?? undefined,
        lineWeight: cadRec.lineWeight ?? undefined,
      };
      if (idx >= 0) layers[idx] = { ...layers[idx], ...def };
      else layers.push(def);
    }
    cadManagerContext.dispatch({ type: 'SET_STANDARD', payload: { ...std, layers } });
  }, [cadManagerState.standard, cadManagerContext]);

  const applyLsaiLinework = useCallback((action: string, key: string, cadRec?: C3DLineRecord) => {
    // Convert a polyline record back into segments (bulge ? curve params).
    const toSegments = (rec: C3DLineRecord): SurveyLine[] => {
      const segs: SurveyLine[] = [];
      const verts = rec.closed ? [...rec.vertices, rec.vertices[0]] : rec.vertices;
      for (let i = 0; i < verts.length - 1; i++) {
        const a = verts[i]; const b = verts[i + 1];
        const seg: SurveyLine = {
          id: `${rec.id}-seg-${i}`,
          from: `${rec.id}-v${i}`,
          to: `${rec.id}-v${i + 1}`,
          fromPt: { x: a.x, y: a.y, z: 0 },
          toPt: { x: b.x, y: b.y, z: 0 },
          layer: rec.layer ?? undefined,
          polylineId: rec.id,
        };
        if (a.bulge && Math.abs(a.bulge) > 1e-9) {
          // Reconstruct arc: bulge b = tan(?/4); chord c; radius R = c / (2�sin(?/2))
          const theta = 4 * Math.atan(Math.abs(a.bulge));
          const chord = Math.hypot(b.x - a.x, b.y - a.y);
          const radius = chord / (2 * Math.sin(theta / 2));
          seg.isCurve = true;
          seg.curveRadius = radius;
          seg.arcLength = radius * theta;
          seg.chordDistance = chord;
          seg.curveDirection = a.bulge > 0 ? 'left' : 'right';
        }
        segs.push(seg);
      }
      return segs;
    };

    setLines(prev => {
      const without = prev.filter(l => (l.polylineId ?? `seg:${l.id}`) !== key);
      if (action === 'delete-lsai') return without;
      if (!cadRec) throw new Error(`CAD linework ${key} missing from snapshot`);
      return [...without, ...toSegments(cadRec)];
    });
  }, [setLines]);

  const applyLsaiAnnotation = useCallback((action: string, key: string, cadRec?: { id: string; kind: string; x: number; y: number; angle: number; text: string }) => {
    if (key.startsWith('street:')) {
      setStreetLabels(prev => {
        const idOf = (s: typeof prev[number]) => `street:${s.text.trim().toUpperCase()}@${Math.round(s.x * 10) / 10},${Math.round(s.y * 10) / 10}`;
        const without = prev.filter(s => idOf(s) !== key);
        if (action === 'delete-lsai') return without;
        if (!cadRec) throw new Error(`CAD annotation ${key} missing from snapshot`);
        return [...without, { x: cadRec.x, y: cadRec.y, text: cadRec.text, angle: cadRec.angle }];
      });
    } else if (key.startsWith('parcel:')) {
      setParcelLabels(prev => {
        const idOf = (p: typeof prev[number]) => `parcel:${p.id ?? `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`}`;
        const without = prev.filter(p => idOf(p) !== key);
        if (action === 'delete-lsai') return without;
        if (!cadRec) throw new Error(`CAD annotation ${key} missing from snapshot`);
        const existing = prev.find(p => idOf(p) === key);
        return [...without, {
          ...(existing ?? { parcelId: null, owner: null }),
          id: key.replace(/^parcel:/, ''),
          x: cadRec.x, y: cadRec.y, angle: cadRec.angle,
          // Text decomposition is lossy; keep existing owner/parcel metadata when present.
        } as typeof prev[number]];
      });
    }
  }, [setStreetLabels, setParcelLabels]);

  const applyLsaiSymbol = useCallback((action: string, key: string, _cadRec?: unknown) => {
    // Symbol definitions live only in LSAI (SVG source); CAD blocks are derived.
    // create/update from CAD would lose fidelity, so only delete is meaningful �
    // and only when the user explicitly chose it.
    if (action === 'delete-lsai') {
      setCustomSymbols(prev => prev.filter(s => s.name.toUpperCase() !== key));
    }
  }, [setCustomSymbols]);

  // Start the Boundary Agent with no file � empty boundary editor for manual entry.
  const handleDeedStartFromScratch = useCallback(() => {
    try {
      startSession();
      logActionToFieldbook('Started a blank Boundary Agent session (manual entry).');

      const placeholder: SessionFile = { name: 'Manual Entry', content: '' };
      const newChat = startChatWithOverride(AgentType.DEED_READER, placeholder);
      setDeedChat(newChat);
      setDeedFile(placeholder);
      setPdfViewerFiles(null);
      setDeedChatHistory([{
        role: MessageRole.MODEL,
        text: `Started a <strong style="color: ${agentThemeColors[AgentType.DEED_READER]};">blank Boundary Agent</strong> session. Use the pulsing Boundary toolbar button to add bearings and distances by hand, or paste a deed at any time.`,
      }]);
      setSuggestedQuestions([]);
      setError(null);

      // NOTE: We intentionally do NOT seed a phantom POB at (0,0) here.
      // Doing so used to leave a dangling "1 / 0,0 / POB" point sitting on
      // the canvas regardless of where the user's actual deed eventually
      // landed (and inflated the auto-fit bbox so the real boundary
      // appeared off-screen). The Boundary Editor's POB row + Draw
      // Boundary's (0,0) fallback already cover the manual-entry case.

      // Create an empty boundary file and hint the toolbar editor button.
      const blankFile: import('./types.ts').BoundaryFile = {
        id: `bf-blank-${Date.now()}`,
        name: 'Manual Boundary',
        createdAt: new Date().toISOString(),
        calls: [],
      };
      setBoundaryFiles(prev => [...prev, blankFile]);
      setIsBoundaryEditorVisible(false);
      setIsBoundaryEditorButtonPulsing(true);

      pushNavigation(AgentType.DEED_READER, 'canvas');
      setActiveAgent(AgentType.DEED_READER);
      setInitializedAgents(prev => new Set(prev).add(AgentType.DEED_READER));
      setIsAddingData(false);
      setIsPointListButtonPulsing(false);
      showView('canvas');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize blank Boundary Agent.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [showView, startSession, logActionToFieldbook, startChatWithOverride, pushNavigation, setIsAddingData]);

  const handlePlansSubmitted = useCallback((files: SessionFile[]) => {
    try {
        if (initializedAgents.has(AgentType.CIVIL_PLAN_EXPERT)) {
            const combinedFiles = [...(planFiles || []), ...files];
            logActionToFieldbook(`Added ${files.length} plan files: ${files.map(f => f.name).join(', ')}`);
            const newChat = startChatWithOverride(AgentType.CIVIL_PLAN_EXPERT, combinedFiles);
            setPlanExpertChat(newChat);
            setPlanFiles(combinedFiles);
            setPdfViewerFiles(combinedFiles);
            setPlanExpertChatHistory(prev => [...prev, { 
                role: MessageRole.MODEL, 
                text: `Added <strong style="color: ${agentThemeColors[AgentType.CIVIL_PLAN_EXPERT]};">${files.length} new plan(s)</strong>. I will now consider all <strong style="color: ${agentThemeColors[AgentType.CIVIL_PLAN_EXPERT]};">${combinedFiles.length} plans</strong> in my analysis.`
            }]);
            setIsAddingData(false);
            return;
        }

      startSession();
      logActionToFieldbook(`Loaded ${files.length} plan files: ${files.map(f => f.name).join(', ')}`);
      const newChat = startChatWithOverride(AgentType.CIVIL_PLAN_EXPERT, files);
      setPlanExpertChat(newChat);
      setPlanFiles(files);
      setPdfViewerFiles(files);
      setPlanExpertChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_PLAN_EXPERT]};">Civil Plan Expert</strong> agent. I have successfully loaded and processed <strong style="color: ${agentThemeColors[AgentType.CIVIL_PLAN_EXPERT]};">${files.length} plan sheet(s)</strong>. How can I assist you?`,
        }]);
      setSuggestedQuestions([
          "Plot the storm drain network.",
          "Draw lot 5 and label its dimensions.",
          "What is the elevation of the sanitary manhole in the intersection?",
      ]);
      setError(null);
      setActiveAgent(AgentType.CIVIL_PLAN_EXPERT);
      setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_PLAN_EXPERT));
      showView('canvas');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, planFiles, settings, startChatWithOverride]);

  const extractTokenSet = useCallback((content: string, kind: 'layer' | 'linetype'): Set<string> => {
    const tokens = new Set<string>();
    // Broadened label variants � real plan sheets rarely use the bare words
    // "layer:"/"lt:"; legends/tables use "layer name", "object layer", "line style", etc.
    const layerRegex = /(?:layer\s*name|object\s*layer|existing\s*layer|proposed\s*layer|layer|lyr)\s*[:=#-]?\s*([A-Z0-9][A-Z0-9_\-]{1,})/gi;
    const linetypeRegex = /(?:line\s*type|linetype|line\s*style|ltype|lt)\s*[:=#-]?\s*([A-Z0-9][A-Z0-9_\-]{1,})/gi;
    const regex = kind === 'layer' ? layerRegex : linetypeRegex;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const token = String(match[1] || '').toUpperCase();
      if (token) tokens.add(token);
    }
    return tokens;
  }, []);

  // Escapes regex metacharacters so a raw CAD layer/linetype name (which may
  // contain hyphens, underscores, etc.) can be used safely inside a RegExp.
  const escapeRegExp = useCallback((s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), []);

  // Whole-word, case-insensitive containment check. Used to test whether a
  // KNOWN required layer/linetype name (from CAD Manager or a control PDF)
  // appears anywhere in the subject PDF's extracted text � this is far more
  // reliable than requiring the subject text to spell out "Layer: <name>",
  // since plan sheets usually print bare layer/linetype names in legends,
  // tables, or callouts without that label.
  const containsToken = useCallback((content: string, token: string): boolean => {
    if (!token) return false;
    const pattern = new RegExp(`(?<![A-Z0-9_-])${escapeRegExp(token)}(?![A-Z0-9_-])`, 'i');
    return pattern.test(content);
  }, [escapeRegExp]);

  const containsAny = useCallback((content: string, fragments: string[]): boolean => {
    const lower = content.toLowerCase();
    return fragments.some(f => lower.includes(f));
  }, []);

  const formatComplianceReportText = useCallback((report: StandardsComplianceReport): string => {
    const status = report.passed ? 'PASS' : 'FAIL';
    const issueLines = report.issues.length > 0
      ? report.issues.map((i, idx) =>
          `${idx + 1}. [${i.severity.toUpperCase()}] ${i.title}: ${i.detail}${i.evidence ? ` Evidence: ${i.evidence}` : ''}${i.recommendation ? ` Recommendation: ${i.recommendation}` : ''}`,
        ).join('\n')
      : 'No issues found.';
    return [
      `Standards Compliance Result: ${status}`,
      report.summary,
      '',
      `Source Mode: ${report.sourceMode}`,
      `Standards Source: ${report.metadata.standardsSource}`,
      report.controlFileName ? `Control PDF: ${report.controlFileName}` : 'Control PDF: none',
      `Subject PDF: ${report.subjectFileName}`,
      '',
      'Issues:',
      issueLines,
    ].join('\n');
  }, []);

  const buildStandardsComplianceReport = useCallback((mode: ComplianceSourceMode): StandardsComplianceReport | null => {
    if (!standardsComplianceSubjectFile) return null;

    const issues: StandardsComplianceReport['issues'] = [];
    const subjectContent = standardsComplianceSubjectFile.content || '';
    const controlContent = standardsComplianceControlFile?.content || '';
    const cadStandard = cadManagerContext.state.standard;
    const cadLayers = new Set((cadManagerContext.getAllLayers() || []).map(l => String(l.name || '').toUpperCase()));
    const cadLineTypes = new Set((cadStandard?.linetypes || []).map(lt => String(lt.name || '').toUpperCase()));
    const controlLayers = extractTokenSet(controlContent, 'layer');
    const controlLineTypes = extractTokenSet(controlContent, 'linetype');

    const getRequiredLayers = (): Set<string> => {
      if (mode === 'cad-manager') return cadLayers;
      if (mode === 'control-pdf') return controlLayers;
      if (mode === 'combined') return new Set([...cadLayers, ...controlLayers]);
      return new Set<string>();
    };

    const getRequiredLineTypes = (): Set<string> => {
      if (mode === 'cad-manager') return cadLineTypes;
      if (mode === 'control-pdf') return controlLineTypes;
      if (mode === 'combined') return new Set([...cadLineTypes, ...controlLineTypes]);
      return new Set<string>();
    };

    if ((mode === 'control-pdf' || mode === 'combined') && !standardsComplianceControlFile) {
      issues.push({
        checkId: 'required_layers',
        severity: 'error',
        title: 'Control PDF missing',
        detail: 'This source mode requires a control PDF, but none is loaded.',
        recommendation: 'Upload a control PDF or switch to CAD Manager mode.',
      });
    }

    if ((mode === 'cad-manager' || mode === 'combined') && !cadStandard) {
      issues.push({
        checkId: 'required_layers',
        severity: 'warning',
        title: 'CAD standard unavailable',
        detail: 'CAD Manager has no loaded standard for this audit run.',
        recommendation: 'Load a CAD standard in CAD Manager or run control-PDF mode.',
      });
    }

    if (standardsComplianceChecks.title_block) {
      const hasTitleBlock = containsAny(subjectContent, ['title block', 'sheet title', 'drawn by', 'checked by', 'project name']);
      if (!hasTitleBlock) {
        issues.push({
          checkId: 'title_block',
          severity: 'error',
          title: 'Title block not detected',
          detail: 'Expected title block fields were not detected in extracted text.',
          recommendation: 'Confirm title block text is present and machine-readable.',
        });
      }
    }

    if (standardsComplianceChecks.north_arrow) {
      const hasNorthArrow = containsAny(subjectContent, ['north arrow', 'true north', 'north']);
      if (!hasNorthArrow) {
        issues.push({
          checkId: 'north_arrow',
          severity: 'warning',
          title: 'North arrow not detected',
          detail: 'North arrow text markers were not found in extracted content.',
          recommendation: 'Verify north arrow graphic or text callout is present on the sheet.',
        });
      }
    }

    if (standardsComplianceChecks.annotation_completeness) {
      const hasAnnotations = containsAny(subjectContent, ['note', 'label', 'callout', 'elev', 'station']);
      if (!hasAnnotations) {
        issues.push({
          checkId: 'annotation_completeness',
          severity: 'warning',
          title: 'Annotation completeness uncertain',
          detail: 'Few annotation indicators were detected from extracted text.',
          recommendation: 'Review annotation density and run a visual spot-check.',
        });
      }
    }

    if (standardsComplianceChecks.required_layers) {
      const requiredLayers = getRequiredLayers();
      if (requiredLayers.size === 0) {
        issues.push({
          checkId: 'required_layers',
          severity: 'warning',
          title: 'No reference layers available',
          detail: 'No required layer set was available from selected standards source.',
          recommendation: 'Load CAD standards or provide a control PDF with layer references.',
        });
      } else {
        // Real PDF Optional Content Group (layer) names, when the subject PDF
        // was plotted with layer info retained � authoritative over text
        // matching since it reads actual PDF structure, not visible text.
        const subjectPdfLayers = new Set((standardsComplianceSubjectFile.pdfLayerNames || []).map(l => l.toUpperCase()));
        // Compare each KNOWN required layer name directly against the subject
        // text (word-boundary containment) rather than against a separately
        // "Layer:"-labeled extraction of the subject � the subject PDF rarely
        // labels layer names that way, which previously caused false positives.
        const missing = Array.from(requiredLayers)
          .filter(l => !subjectPdfLayers.has(l) && !containsToken(subjectContent, l))
          .slice(0, 20);
        if (missing.length > 0) {
          issues.push({
            checkId: 'required_layers',
            severity: 'warning',
            title: 'Potential layer omissions',
            detail: subjectPdfLayers.size > 0
              ? `${missing.length} expected layer(s) were not found among the subject PDF's ${subjectPdfLayers.size} detected OCG layer(s), nor in its extracted text.`
              : `${missing.length} expected layer token(s) were not detected in the subject PDF text. This PDF carries no Optional Content Group (layer) metadata, so only text matching could be used.`,
            evidence: missing.join(', '),
            recommendation: subjectPdfLayers.size > 0
              ? 'Verify these layers are actually drafted/present on the subject sheet.'
              : 'The subject PDF may have been plotted without "include layer information" � verify layer list in source CAD/PDF and rerun with full OCR pages.',
          });
        }
      }
    }

    if (standardsComplianceChecks.linetype_compliance) {
      const requiredLineTypes = getRequiredLineTypes();
      if (requiredLineTypes.size > 0) {
        // Distinct stroke dash patterns actually drawn on the subject sheet
        // (from vector path setDash operators) � the closest browser-readable
        // proxy for CAD linetypes, since PDFs have no named "linetype" concept.
        const subjectDashPatterns = new Set(standardsComplianceSubjectFile.pdfDashPatterns || []);
        const hasNonSolidDash = Array.from(subjectDashPatterns).some(p => p !== 'solid');
        const NONCONTINUOUS_HINTS = ['DASH', 'HIDDEN', 'CENTER', 'PHANTOM', 'DOT', 'DIVIDE'];
        const missing = Array.from(requiredLineTypes).filter(lt => {
          const expectsNonContinuous = NONCONTINUOUS_HINTS.some(hint => lt.includes(hint));
          if (expectsNonContinuous && subjectDashPatterns.size > 0) {
            return !hasNonSolidDash;
          }
          return !containsToken(subjectContent, lt);
        }).slice(0, 20);
        if (missing.length > 0) {
          issues.push({
            checkId: 'linetype_compliance',
            severity: 'warning',
            title: 'Potential linetype mismatches',
            detail: subjectDashPatterns.size > 0
              ? `${missing.length} expected linetype(s) do not match the dash patterns actually drawn on the subject sheet (detected: ${Array.from(subjectDashPatterns).join(', ')}).`
              : `${missing.length} expected linetype token(s) were not detected in the subject PDF text.`,
            evidence: missing.join(', '),
            recommendation: 'Confirm linetype legend and CAD export settings.',
          });
        }
      }
    }

    if (standardsComplianceChecks.scale_and_sheet_metadata) {
      const hasScale = /scale\s*[:=]|\b1\s*[:=]\s*\d+|\b1"\s*=\s*\d+/i.test(subjectContent);
      if (!hasScale) {
        issues.push({
          checkId: 'scale_and_sheet_metadata',
          severity: 'warning',
          title: 'Scale metadata not detected',
          detail: 'No scale expression was detected in extracted text.',
          recommendation: 'Verify scale callout and sheet metadata are present on title block.',
        });
      }
    }

    if (standardsComplianceChecks.legend_symbol_consistency) {
      const hasLegend = containsAny(subjectContent, ['legend', 'symbols', 'abbreviation']);
      if (!hasLegend) {
        issues.push({
          checkId: 'legend_symbol_consistency',
          severity: 'warning',
          title: 'Legend or symbol key not detected',
          detail: 'Legend/symbol indicators were not found in extracted text.',
          recommendation: 'Confirm the sheet includes a legend for symbols and linetypes.',
        });
      }
    }

    if (standardsComplianceChecks.revision_block) {
      const hasRevision = containsAny(subjectContent, ['revision', 'rev.', 'issued for', 'issue date']);
      if (!hasRevision) {
        issues.push({
          checkId: 'revision_block',
          severity: 'warning',
          title: 'Revision block not detected',
          detail: 'Revision markers were not found in extracted text.',
          recommendation: 'Verify revision table/date block placement and OCR readability.',
        });
      }
    }

    const passed = issues.length === 0;
    const sourceLabel = mode === 'combined'
      ? 'combined'
      : mode === 'cad-manager'
        ? 'cad-manager'
        : mode === 'control-pdf'
          ? 'control-pdf'
          : 'none';
    // When the user has designated the control PDF as the sole source of
    // truth, CAD Manager/CACP layer data must not appear in the report at
    // all � the agent can know it exists, but must not consider or surface it.
    const cadDataIsInScope = mode === 'cad-manager' || mode === 'combined';

    return {
      reportId: `standards-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceMode: mode,
      checksRequested: standardsComplianceChecks,
      controlFileName: standardsComplianceControlFile?.name,
      subjectFileName: standardsComplianceSubjectFile.name,
      passed,
      summary: passed
        ? 'All enabled checks passed based on available extracted evidence.'
        : `${issues.length} issue(s) found across enabled checks.`,
      issues,
      metadata: {
        standardsSource: sourceLabel,
        cadCodeCount: cadDataIsInScope ? cadStandard?.codes?.length : undefined,
        cadLayerCount: cadDataIsInScope ? cadLayers.size : undefined,
        selectedPages: standardsComplianceSubjectFile.selectedPages,
        controlSelectedPages: standardsComplianceControlFile?.selectedPages,
        analysisMethod: 'text-heuristic',
        subjectPdfLayerCount: standardsComplianceSubjectFile.pdfLayerNames?.length,
        subjectPdfDashPatterns: standardsComplianceSubjectFile.pdfDashPatterns,
      },
    };
  }, [cadManagerContext, containsAny, containsToken, extractTokenSet, standardsComplianceChecks, standardsComplianceControlFile, standardsComplianceSubjectFile]);

  // Computes the required layer/linetype token sets and any source-availability
  // warnings for a given mode, WITHOUT running the text-heuristic checks �
  // shared by both the deterministic report builder above and the visual
  // (multimodal) audit below so both paths agree on what's "required".
  const computeStandardsAuditContext = useCallback((mode: ComplianceSourceMode) => {
    const controlContent = standardsComplianceControlFile?.content || '';
    const cadStandard = cadManagerContext.state.standard;
    const cadLayers = new Set((cadManagerContext.getAllLayers() || []).map(l => String(l.name || '').toUpperCase()));
    const cadLineTypes = new Set((cadStandard?.linetypes || []).map(lt => String(lt.name || '').toUpperCase()));
    const controlLayers = extractTokenSet(controlContent, 'layer');
    const controlLineTypes = extractTokenSet(controlContent, 'linetype');

    const requiredLayers = mode === 'cad-manager' ? cadLayers
      : mode === 'control-pdf' ? controlLayers
      : mode === 'combined' ? new Set([...cadLayers, ...controlLayers])
      : new Set<string>();
    const requiredLineTypes = mode === 'cad-manager' ? cadLineTypes
      : mode === 'control-pdf' ? controlLineTypes
      : mode === 'combined' ? new Set([...cadLineTypes, ...controlLineTypes])
      : new Set<string>();

    const preIssues: StandardsComplianceReport['issues'] = [];
    if ((mode === 'control-pdf' || mode === 'combined') && !standardsComplianceControlFile) {
      preIssues.push({
        checkId: 'required_layers',
        severity: 'error',
        title: 'Control PDF missing',
        detail: 'This source mode requires a control PDF, but none is loaded.',
        recommendation: 'Upload a control PDF or switch to CAD Manager mode.',
      });
    }
    if ((mode === 'cad-manager' || mode === 'combined') && !cadStandard) {
      preIssues.push({
        checkId: 'required_layers',
        severity: 'warning',
        title: 'CAD standard unavailable',
        detail: 'CAD Manager has no loaded standard for this audit run.',
        recommendation: 'Load a CAD standard in CAD Manager or run control-PDF mode.',
      });
    }

    const sourceLabel: 'cad-manager' | 'control-pdf' | 'combined' | 'none' = mode === 'combined' ? 'combined' : mode === 'cad-manager' ? 'cad-manager' : mode === 'control-pdf' ? 'control-pdf' : 'none';
    const cadDataIsInScope = mode === 'cad-manager' || mode === 'combined';

    return { cadStandard, cadLayers, cadLineTypes, requiredLayers, requiredLineTypes, preIssues, sourceLabel, cadDataIsInScope };
  }, [cadManagerContext, extractTokenSet, standardsComplianceControlFile]);

  // Vision-based audit � sends the actual rasterized PDF pages (subject, and
  // control if provided) to the model so it looks at the drawing the way a
  // human reviewer would, instead of pattern-matching previously-extracted
  // text. Returns null (caller falls back to the text-heuristic builder above)
  // when there are no page images to look at or no API key is configured.
  const runVisualComplianceAudit = useCallback(async (mode: ComplianceSourceMode): Promise<StandardsComplianceReport | null> => {
    if (isFreeTierTimeLocked) return null;
    if (!standardsComplianceSubjectFile) return null;
    const subjectImages = standardsComplianceSubjectFile.rasterImageData;
    if (!subjectImages || subjectImages.length === 0) return null;
    if (!settings.userApiKey) return null;

    const ctx = computeStandardsAuditContext(mode);
    const model = getModelForAgent(AgentType.STANDARDS_COMPLIANCE, activeModel);

    try {
      const result = await runVisualStandardsComplianceAudit({
        subjectImages,
        controlImages: standardsComplianceControlFile?.rasterImageData,
        enabledChecks: standardsComplianceChecks,
        requiredLayers: Array.from(ctx.requiredLayers),
        requiredLineTypes: Array.from(ctx.requiredLineTypes),
        sourceMode: mode,
        // Real PDF structure (OCG layer names / drawn dash patterns), when
        // available, grounds the model in facts instead of pixel guesses.
        detectedSubjectLayers: standardsComplianceSubjectFile.pdfLayerNames,
        detectedSubjectDashPatterns: standardsComplianceSubjectFile.pdfDashPatterns,
      }, model, settings.userApiKey);

      const issues = [...ctx.preIssues, ...result.issues];
      const passed = issues.length === 0 && result.passed;

      return {
        reportId: `standards-${Date.now()}`,
        createdAt: new Date().toISOString(),
        sourceMode: mode,
        checksRequested: standardsComplianceChecks,
        controlFileName: standardsComplianceControlFile?.name,
        subjectFileName: standardsComplianceSubjectFile.name,
        passed,
        summary: result.summary,
        issues,
        metadata: {
          standardsSource: ctx.sourceLabel,
          cadCodeCount: ctx.cadDataIsInScope ? ctx.cadStandard?.codes?.length : undefined,
          cadLayerCount: ctx.cadDataIsInScope ? ctx.cadLayers.size : undefined,
          selectedPages: standardsComplianceSubjectFile.selectedPages,
          controlSelectedPages: standardsComplianceControlFile?.selectedPages,
          analysisMethod: 'visual-ai',
          subjectPdfLayerCount: standardsComplianceSubjectFile.pdfLayerNames?.length,
          subjectPdfDashPatterns: standardsComplianceSubjectFile.pdfDashPatterns,
        },
      };
    } catch (e) {
      console.warn('[StandardsCompliance] Visual audit failed, falling back to text heuristic:', e);
      return null;
    }
  }, [activeModel, computeStandardsAuditContext, settings.userApiKey, standardsComplianceChecks, standardsComplianceControlFile, standardsComplianceSubjectFile]);

  // Resolves the source mode (falling back to best-available when "ask-each-run"
  // is selected), runs the visual (multimodal) audit when page images and an
  // API key are available � falling back to the deterministic text-heuristic
  // audit otherwise � and stores the report. Used by both the default Summary
  // Panel and CACP/chat entry points so results stay concise and repeatable.
  const runStandardsComplianceAudit = useCallback(async (explicitMode?: ComplianceSourceMode): Promise<StandardsComplianceReport | null> => {
    const requestedMode = explicitMode ?? standardsComplianceSourceMode;
    // A loaded control PDF is the user's declared source of truth and always
    // wins over CACP/CAD Manager data when the mode is ambiguous � CAD Manager
    // is only used as a fallback when no control PDF has been provided.
    const modeToRun: ComplianceSourceMode = requestedMode === 'ask-each-run'
      ? (standardsComplianceControlFile ? 'control-pdf' : (cadManagerContext.state.standard ? 'cad-manager' : 'combined'))
      : requestedMode;
    setIsStandardsComplianceRunning(true);
    try {
      const report = (await runVisualComplianceAudit(modeToRun)) ?? buildStandardsComplianceReport(modeToRun);
      if (report) {
        setStandardsComplianceLastReport(report);
        const method = report.metadata.analysisMethod === 'visual-ai' ? 'visual AI' : 'text heuristic';
        logActionToFieldbook(`Standards Compliance audit (${modeToRun}, ${method}) -> ${report.passed ? 'PASS' : 'FAIL'} (${report.issues.length} issue(s)).`);
      }
      return report;
    } finally {
      setIsStandardsComplianceRunning(false);
    }
  }, [buildStandardsComplianceReport, cadManagerContext.state.standard, logActionToFieldbook, runVisualComplianceAudit, standardsComplianceControlFile, standardsComplianceSourceMode]);

  const handleStandardsComplianceSessionStart = useCallback((payload: {
    controlFile: SessionFile | null;
    subjectFile: SessionFile;
    checks: StandardsComplianceCheckSelection;
    sourceMode: ComplianceSourceMode;
  }) => {
    try {
      const isReload = initializedAgents.has(AgentType.STANDARDS_COMPLIANCE);
      if (!isReload) {
        startSession();
      }

      setStandardsComplianceControlFile(payload.controlFile);
      setStandardsComplianceSubjectFile(payload.subjectFile);
      setStandardsComplianceChecks(payload.checks);
      setStandardsComplianceSourceMode(payload.sourceMode);
      setStandardsComplianceLastReport(null);

      const activeChecks = Object.entries(payload.checks)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id)
        .join(', ');
      const seed = [
        'Standards Compliance intake loaded.',
        `Source mode: ${payload.sourceMode}`,
        `Active checks: ${activeChecks}`,
        payload.controlFile ? `Control PDF: ${payload.controlFile.name}` : 'Control PDF: none',
        `Subject PDF: ${payload.subjectFile.name}`,
        '',
        `---BEGIN SUBJECT PDF CONTENT---\n${payload.subjectFile.content}\n---END SUBJECT PDF CONTENT---`,
        payload.controlFile
          ? `\n---BEGIN CONTROL PDF CONTENT---\n${payload.controlFile.content}\n---END CONTROL PDF CONTENT---`
          : '',
      ].join('\n');

      const newChat = startChatWithOverride(AgentType.STANDARDS_COMPLIANCE, seed);
      setStandardsComplianceChat(newChat);
      setStandardsComplianceChatHistory([{
        role: MessageRole.MODEL,
        text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.STANDARDS_COMPLIANCE]};">Standards Compliance</strong> agent. I loaded your subject PDF <strong>${payload.subjectFile.name}</strong>${payload.controlFile ? ` and control PDF <strong>${payload.controlFile.name}</strong>` : ''}. Ask me to <strong>run compliance</strong> any time.`,
      }]);
      setSuggestedQuestions([
        'Run compliance now.',
        'Run compliance using CAD Manager mode.',
        'Show likely layer and linetype mismatches.',
      ]);

      logActionToFieldbook(`Standards Compliance intake loaded (${payload.subjectFile.name}${payload.controlFile ? ` + ${payload.controlFile.name}` : ''}).`);
      setError(null);
      setActiveAgent(AgentType.STANDARDS_COMPLIANCE);
      setInitializedAgents(prev => new Set(prev).add(AgentType.STANDARDS_COMPLIANCE));
      setIsAddingData(false);
      showView('compliance');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Standards Compliance agent.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [initializedAgents, logActionToFieldbook, setIsAddingData, showView, startChatWithOverride, startSession]);

  const handleDxfUploaded = useCallback((content: string, name: string, options?: { smoothSplines?: boolean; quantizationBits?: 16 | 32; splineLayers?: string[] }) => {
    try {
        // Parse geometry immediately so DXF drawing is rendered on canvas without delay
        const existingPointCount = pointListsRef.current.flatMap(l => l.points).length;
        const smoothSplines = Boolean(options?.smoothSplines);
        const quantizationBits = options?.quantizationBits ?? 16;
        const parsedDxf = parseDxfGeometry(content, {
            startingPointNumber: existingPointCount + 1,
            smoothSplines,
            splineLayers: options?.splineLayers,
            splineOptions: {
                quantizationBits,
                adaptiveQuantization: true,
            },
        });

        const splineLayerNote = options?.splineLayers?.length ? ` on layers ${options.splineLayers.join(', ')}` : '';
        const splineSuffix = smoothSplines ? ` (smooth ${quantizationBits}-bit weighted T-splines applied${splineLayerNote})` : '';
        const drawnSummary = `${parsedDxf.lines.length} lines/curves and ${parsedDxf.points.length} points across ${parsedDxf.layers.length} layers${splineSuffix}`;

        // Add parsed points and lines to the project state
        if (parsedDxf.points.length > 0) {
            setPointLists(prev => {
                const workingList = prev.find(l => l.id === 'working');
                if (!workingList) {
                    return [...prev, { id: 'working', name: 'Unsaved Points', points: parsedDxf.points, isVisible: true }];
                }
                return prev.map(l => l.id === 'working' ? { ...l, points: [...l.points, ...parsedDxf.points] } : l);
            });
        }
        if (parsedDxf.lines.length > 0) {
            setLines(prev => [...prev, ...parsedDxf.lines]);
        }

        if (initializedAgents.has(AgentType.DXF_ANALYZER)) {
             if (dxfFile) {
                setGeneratedFiles(prev => [...prev, { ...dxfFile, name: `(Archived) ${dxfFile.name}` }]);
            }
             logActionToFieldbook(`Replaced DXF file with: ${name} (${drawnSummary})`);
            const newChat = startChatWithOverride(AgentType.DXF_ANALYZER, content);
            setDxfChat(newChat);
            setDxfFile({ name, content });
            setDxfChatHistory([{ 
                role: MessageRole.MODEL, 
                text: `The <strong style="color: ${agentThemeColors[AgentType.DXF_ANALYZER]};">DXF Agent</strong> has loaded <strong style="color: ${agentThemeColors[AgentType.DXF_ANALYZER]};">"${name}"</strong> and immediately drawn <strong>${drawnSummary}</strong> on your canvas. Ask me anything about layers, entities, or geometry!`
            }]);
            setIsAddingData(false);
            showView('canvas');
            setTimeout(() => canvas2dRef.current?.zoomExtents(), 100);
            return;
        }

        startSession();
        logActionToFieldbook(`Loaded DXF file: ${name} (Drew ${drawnSummary})`);
        const newChat = startChatWithOverride(AgentType.DXF_ANALYZER, content);
        setDxfChat(newChat);
        setDxfFile({ name, content });
        setDxfChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I'm the <strong style="color: ${agentThemeColors[AgentType.DXF_ANALYZER]};">DXF Agent</strong>. I have loaded <strong style="color: ${agentThemeColors[AgentType.DXF_ANALYZER]};">"${name}"</strong> and immediately drawn <strong>${drawnSummary}</strong> on your canvas. What would you like to inspect or calculate?`,
        }]);
        setSuggestedQuestions([
            "How many layers are in this DXF?",
            "List all entities by layer and type.",
            "What is the total length of all polylines?",
            "Inspect the layer colors and linetypes."
        ]);
        setError(null);
        
        // Push navigation history so user can go back to file upload screen
        pushNavigation(AgentType.DXF_ANALYZER, 'canvas');
        
        setActiveAgent(AgentType.DXF_ANALYZER);
        setInitializedAgents(prev => new Set(prev).add(AgentType.DXF_ANALYZER));
        showView('canvas');
        setTimeout(() => canvas2dRef.current?.zoomExtents(), 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, dxfFile, settings, startChatWithOverride, setPointLists, setLines, canvas2dRef]);



  const plotGeoJsonFile = useCallback((file: SessionFile, currentSettings: Settings) => {
    if (!file) return;
    
    logActionToFieldbook(`Attempting to plot GeoJSON features from file: "${file.name}"`);
    try {
      const geoJsonContent = JSON.parse(file.content);
      const existingPointNumbers = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
      
      // Use GisService to parse
      const { features, points: newPoints, lines: newLines } = GisService.parseGeoJson(
          geoJsonContent, 
          currentSettings, 
          existingPointNumbers
      );
      
      // Store rich features for the agent
      setGisFeatures(features);

      if (newPoints.length > 0 || newLines.length > 0) {
        logActionToFieldbook(`Plotted ${newPoints.length} points and ${newLines.length} lines from GeoJSON file: "${file.name}"`);
        setPointLists(prev => {
            const workingList = prev.find(l => l.id === 'working');
            if (!workingList) {
                return [...prev, { id: 'working', name: 'Unsaved Points', points: newPoints, isVisible: true }];
            }
            // Note: existingPointNumbers was updated in place by parseGeoJson, so we don't need to check again here
            // but for safety in React state updates, we just append since we ensured uniqueness.
            const updatedWorkingList = { ...workingList, points: [...workingList.points, ...newPoints] };
            return prev.map(l => l.id === 'working' ? updatedWorkingList : l);
        });
        setLines(prev => [...prev, ...newLines]);
        showView('canvas');
        // Auto-zoom after the state update has had a chance to render.
        setTimeout(() => canvas2dRef.current?.zoomExtents(), 100);
      } else {
          setError("Could not parse any valid points or lines from the GeoJSON file. The file might be empty or in an unsupported format.");
          setTimeout(() => setError(null), 5000);
      }
    } catch (e) {
      setError(`Failed to plot GeoJSON: ${(e as Error).message}`);
      setTimeout(() => setError(null), 5000);
    }
  }, [logActionToFieldbook, showView, pointLists, setGisFeatures]);

  const processGisFile = useCallback((file: SessionFile, currentSettings: Settings, source: 'file' | 'url' = 'file') => {
    const { name, content } = file;
    try {
        // Parse GeoJSON using GisService
        const geoJsonContent = JSON.parse(content);
        const existingPointNumbers = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
        
        const { features, points: newPoints, lines: newLines } = GisService.parseGeoJson(
            geoJsonContent, 
            currentSettings, 
            existingPointNumbers
        );
        
        // Store rich features for the agent
        setGisFeatures(features);

        // Plot immediately for both file uploads and URL loads � the user
        // explicitly confirmed the data (file pick / "Parse N Features"), so
        // there is no reason to wait for a chat instruction.
        if (newPoints.length > 0 || newLines.length > 0) {
            logActionToFieldbook(`Plotted ${newPoints.length} points and ${newLines.length} lines from GeoJSON ${source === 'url' ? 'URL' : 'file'}: "${file.name}"`);
            setPointLists(prev => {
                const workingList = prev.find(l => l.id === 'working');
                if (!workingList) {
                    return [...prev, { id: 'working', name: 'Unsaved Points', points: newPoints, isVisible: true }];
                }
                const updatedWorkingList = { ...workingList, points: [...workingList.points, ...newPoints] };
                return prev.map(l => l.id === 'working' ? updatedWorkingList : l);
            });
            setLines(prev => [...prev, ...newLines]);
            showView('canvas');
            // Auto-zoom after the state update has had a chance to render.
            setTimeout(() => canvas2dRef.current?.zoomExtents(), 100);
        } else {
             setError("Could not parse any valid points or lines from the GeoJSON file. The file might be empty or in an unsupported format.");
             setTimeout(() => setError(null), 5000);
        }

        // Generate summarized context for the AI
        const aiContext = GisService.getGisContext(features);

        if (initializedAgents.has(AgentType.GIS_AGENT)) {
             if (gisFile) {
                setGeneratedFiles(prev => [...prev, { ...gisFile, name: `(Archived) ${gisFile.name}` }]);
            }
             logActionToFieldbook(`Replaced GeoJSON file with: ${name}`);
            const newChat = startChatWithOverride(AgentType.GIS_AGENT, aiContext);
            setGisChat(newChat);
            setGisFile(file);
            setGisChatHistory([{ 
                role: MessageRole.MODEL, 
                text: `The <strong style="color: ${agentThemeColors[AgentType.GIS_AGENT]};">GIS Agent</strong> has been reset. The new active file is <strong style="color: ${agentThemeColors[AgentType.GIS_AGENT]};">"${name}"</strong>.`
            }]);
            setIsAddingData(false);
            return;
        }

        startSession();
        logActionToFieldbook(`Loaded GeoJSON file: ${name}`);
        const newChat = startChatWithOverride(AgentType.GIS_AGENT, aiContext);
        setGisChat(newChat);
        setGisFile(file);
        setGisChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I'm the <strong style="color: ${agentThemeColors[AgentType.GIS_AGENT]};">GIS Agent</strong>. I have loaded the file <strong style="color: ${agentThemeColors[AgentType.GIS_AGENT]};">"${name}"</strong> and am ready to analyze its contents. I have processed ${features.length} features.`,
        }]);
        setSuggestedQuestions([
            "How many features are in this file?",
            "List all features with a 'PARCEL_ID' property.",
            "Re-plot all features on the canvas.",
            "What is the total area of all polygon features?"
        ]);
        setError(null);
        
        // Push navigation history so user can go back to file upload screen
        pushNavigation(AgentType.GIS_AGENT, 'canvas');
        
        setActiveAgent(AgentType.GIS_AGENT);
        setInitializedAgents(prev => new Set(prev).add(AgentType.GIS_AGENT));
        showView('canvas');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
}, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, gisFile, pointLists, setGisFeatures, setPointLists, setLines, startChatWithOverride, canvas2dRef]);

  const handleGisUploaded = useCallback((content: string, name: string, source: 'file' | 'url' = 'file') => {
    const newFile: SessionFile = { name, content };
    if (!settings.projection.epsg) {
        setProjectionPrompt({
            file: newFile,
            source,
            onConfirm: () => {},
            onCancel: () => {}
        });
    } else {
        processGisFile(newFile, settings, source);
    }
  }, [settings, processGisFile]);

  const handleConfirmProjection = useCallback((newProjection: ProjectionSetting) => {
    if (projectionPrompt && projectionPrompt.file) {
        const newSettings = {
            ...settings,
            projection: newProjection
        };
        setSettings(newSettings);
        processGisFile(projectionPrompt.file, newSettings, projectionPrompt.source);
        setProjectionPrompt(null);
    } else if (projectionPrompt && projectionPrompt.onConfirm) {
        // Handle other projection prompt types (e.g., GPS Stakeout)
        setSettings(prev => ({
            ...prev,
            projection: newProjection
        }));
        projectionPrompt.onConfirm();
        setProjectionPrompt(null);
    }
  }, [projectionPrompt, settings, processGisFile]);

  /**
   * Compute the WGS84 envelope of the project's inclusion lines (optionally
   * narrowed to one named inclusion boundary). Used by the GIS Agent to load
   * only the features intersecting the surveyed site. Returns null when no
   * inclusion geometry exists or no projection is set.
   */
  const getInclusionBboxWgs84 = useCallback((boundaryId: string | null): [number, number, number, number] | null => {
    const boundary = boundaryId ? inclusionBoundaries.find(b => b.id === boundaryId) ?? null : null;
    const inclusionLines = lines.filter((l: SurveyLine) =>
      l.type === 'inclusion' && (!boundary || l.polylineId === boundary.polylineId));
    if (inclusionLines.length === 0) return null;

    const pointMap = new Map(points.map((p: SurveyPoint) => [p.pointNumber, p]));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let found = false;
    for (const line of inclusionLines) {
      // Prefer embedded coordinates; fall back to the referenced survey point.
      const fromC = line.fromPt
        ? { x: line.fromPt.x, y: line.fromPt.y }
        : pointMap.get(line.from)
          ? { x: pointMap.get(line.from)!.easting, y: pointMap.get(line.from)!.northing }
          : null;
      const toC = line.toPt
        ? { x: line.toPt.x, y: line.toPt.y }
        : pointMap.get(line.to)
          ? { x: pointMap.get(line.to)!.easting, y: pointMap.get(line.to)!.northing }
          : null;
      for (const c of [fromC, toC]) {
        if (c && isFinite(c.x) && isFinite(c.y)) {
          x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
          x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y);
          found = true;
        }
      }
    }
    if (!found) return null;

    const epsg = settings.projection?.epsg;
    if (!epsg || epsg === 4326) return [x0, y0, x1, y1];

    // Reproject all four corners � state-plane axes are rotated relative to
    // lon/lat, so two corners alone can under-cover the true extent.
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    let lon0 = Infinity, lat0 = Infinity, lon1 = -Infinity, lat1 = -Infinity;
    for (const corner of corners) {
      try {
        const [lon, lat] = proj4(`EPSG:${epsg}`, 'EPSG:4326', corner);
        if (isFinite(lon) && isFinite(lat)) {
          lon0 = Math.min(lon0, lon); lat0 = Math.min(lat0, lat);
          lon1 = Math.max(lon1, lon); lat1 = Math.max(lat1, lat);
        }
      } catch { /* skip unprojectable corner */ }
    }
    if (!isFinite(lon0)) return null;

    // Small pad so features touching the boundary line are not clipped.
    const padLon = (lon1 - lon0) * 0.05 || 0.001;
    const padLat = (lat1 - lat0) * 0.05 || 0.001;
    return [lon0 - padLon, lat0 - padLat, lon1 + padLon, lat1 + padLat];
  }, [lines, points, inclusionBoundaries, settings.projection?.epsg]);

  const handleImagesSubmitted = useCallback((files: SessionFile[]) => {
    try {
        if (initializedAgents.has(AgentType.IMAGE_ANALYZER)) {
            const combinedFiles = [...(imageFiles || []), ...files];
            logActionToFieldbook(`Added ${files.length} image files: ${files.map(f => f.name).join(', ')}`);
            const newChat = startChatWithOverride(AgentType.IMAGE_ANALYZER, combinedFiles);
            setImageAnalyzerChat(newChat);
            setImageFiles(combinedFiles);
            setImageAnalyzerChatHistory(prev => [...prev, { 
                role: MessageRole.MODEL, 
                text: `Added <strong style="color: ${agentThemeColors[AgentType.IMAGE_ANALYZER]};">${files.length} new image(s)</strong>. I can now analyze all <strong style="color: ${agentThemeColors[AgentType.IMAGE_ANALYZER]};">${combinedFiles.length} images</strong>.`
            }]);
            setIsAddingData(false);
            return;
        }

      startSession();
      logActionToFieldbook(`Loaded ${files.length} image files: ${files.map(f => f.name).join(', ')}`);
      const newChat = startChatWithOverride(AgentType.IMAGE_ANALYZER, files);
      setImageAnalyzerChat(newChat);
      setImageFiles(files);
      setImageAnalyzerChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello, I am the <strong style="color: ${agentThemeColors[AgentType.IMAGE_ANALYZER]};">Image Analyzer</strong> agent. I have loaded <strong style="color: ${agentThemeColors[AgentType.IMAGE_ANALYZER]};">${files.length} image(s)</strong> and am ready to assist.`,
        }]);
      setSuggestedQuestions([
          "Describe what you see in the first image.",
          "Are there any utility markings visible in these photos?",
          "Associate IMG_01.jpg with point 501.",
          "In IMG_02.jpg, draw a circle around the fire hydrant.",
      ]);
      setError(null);
      setActiveAgent(AgentType.IMAGE_ANALYZER);
      showView('imageanalyzer');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, imageFiles, settings, startChatWithOverride]);

  const handleCenterlineSessionStart = useCallback(() => {
    const newCL: Centerline = {
      id: Date.now().toString(),
      name: 'CL-1',
      beginStation: 0,
      pis: [],
    };
    setCenterlines([newCL]);
    
    try {
        startSession();
        logActionToFieldbook('Started a new blank centerline session.');
        // Include the project point database so the agent can chain points by
        // description/number in MODE 3 (cl_create_from_points).
        const allPoints = pointLists.flatMap(l => l.points);
        const pointsContext = allPoints.length > 0
          ? `\n\n---PROJECT POINTS---\n${allPoints.map(p =>
              `${p.pointNumber}\t${p.northing.toFixed(4)}\t${p.easting.toFixed(4)}${p.elevation !== undefined ? `\t${p.elevation.toFixed(4)}` : ''}\t${p.description ?? ''}`
            ).join('\n')}\n---END PROJECT POINTS---`
          : '';
        const newChat = startChatWithOverride(AgentType.CENTERLINE_STATIONING, pointsContext);
        setStationingChat(newChat);
        setStationingChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">Stationing & CL</strong> agent. A new session has started for <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">Centerline "CL-1"</strong>. You can now add Points of Intersection (PIs) to define the alignment.`,
        }]);
        setSuggestedQuestions([]);
        setError(null);
        setActiveAgent(AgentType.CENTERLINE_STATIONING);
        setInitializedAgents(prev => new Set(prev).add(AgentType.CENTERLINE_STATIONING));
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, settings, startChatWithOverride, pointLists]);
  
  const handleClFileUploaded = useCallback((content: string, name: string) => {
    if (initializedAgents.has(AgentType.CENTERLINE_STATIONING)) {
        if (clFile) {
            setGeneratedFiles(prev => [...prev, { ...clFile, name: `(Archived) ${clFile.name}` }]);
        }
        logActionToFieldbook(`Replaced Centerline file with: ${name}`);
        const parsedCL = parseClFile(content);
        if (!parsedCL) {
            setError('Failed to parse .cl file. Please check the file format.');
            return;
        }
        parsedCL.name = name.replace(/\.[^/.]+$/, "");
        setCenterlines([parsedCL]);
        setClFile({ name, content });
        const newChat = startChatWithOverride(AgentType.CENTERLINE_STATIONING, JSON.stringify(parsedCL, null, 2));
        setStationingChat(newChat);
        setStationingChatHistory([{ 
            role: MessageRole.MODEL, 
            text: `The <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">Stationing & CL</strong> agent has been reset with the centerline from <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">"${name}"</strong>.`
        }]);
        setIsAddingData(false);
        return;
    }

    const parsedCL = parseClFile(content);
    if (!parsedCL) {
        setError('Failed to parse .cl file. Please check the file format.');
        return;
    }
    parsedCL.name = name.replace(/\.[^/.]+$/, "");

    if (name === 'example.highway.cl') {
        parsedCL.pis[1].curveRadius = 1000;
        parsedCL.pis[2].curveRadius = 800;
        parsedCL.pis[3].curveRadius = 1200;
        parsedCL.pis[4].curveRadius = 900;
    }

    setCenterlines([parsedCL]);
    setClFile({ name, content });

    try {
        startSession();
        logActionToFieldbook(`Loaded centerline file: ${name}`);
        const newChat = startChatWithOverride(AgentType.CENTERLINE_STATIONING, JSON.stringify(parsedCL, null, 2));
        setStationingChat(newChat);
        setStationingChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">Stationing & CL</strong> agent. I have successfully loaded the centerline from <strong style="color: ${agentThemeColors[AgentType.CENTERLINE_STATIONING]};">"${name}"</strong>.`,
        }]);
        setSuggestedQuestions([]);
        setError(null);
        
        // Push navigation history so user can go back to file upload screen
        pushNavigation(AgentType.CENTERLINE_STATIONING, 'canvas');
        
        setActiveAgent(AgentType.CENTERLINE_STATIONING);
        setInitializedAgents(prev => new Set(prev).add(AgentType.CENTERLINE_STATIONING));
        showView('canvas');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, initializedAgents, clFile, settings, startChatWithOverride]);

  // Zoning Agent handlers
  const handleZoningSearch = useCallback(async (searchData: { state: string; county: string; municipality: string; zoningDistrict?: string; desiredUse?: string }) => {
    console.log('[Zoning] 🔍 handleZoningSearch called with:', searchData);
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
      setShowHostCostReminder(true);
      return;
    }
    try {
      startSession();
      const { state: zState, county: zCounty, municipality: zMuni, zoningDistrict: zDistrict, desiredUse: zUse } = searchData;

      setZoningState(zState);
      setZoningCounty(zCounty);
      setZoningPlace(zMuni);
      setZoningPlaceType('municipality');
      if (zDistrict) setZoningDistrict(zDistrict);
      setZoningAddress(`${zMuni}, ${zCounty} County, ${zState}`);

      logActionToFieldbook(`Zoning Agent: ${zMuni}, ${zCounty} County, ${zState}${zDistrict ? ` � District ${zDistrict}` : ''}${zUse ? ` � Use: ${zUse}` : ''}`);

      const newChat = startChatWithOverride(AgentType.ZONING_AGENT, '');
      console.log('[Zoning] ?? startChatWithOverride returned:', newChat ? 'chat instance ?' : 'NULL ? (no API key or model init failure)');
      setZoningChat(newChat);

      let opening = `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.ZONING_AGENT]};">Zoning Agent</strong> � powered by live Google Search grounding.\n\n`;
      opening += `**Jurisdiction loaded:** ${zMuni}, ${zCounty} County, ${zState}`;
      if (zDistrict) opening += `\n**District:** ${zDistrict}`;
      if (zUse) opening += `\n**Desired use:** ${zUse}`;
      opening += `\n\nI'm ready to research zoning requirements. What would you like to know?`;
      opening += `\n\n*Suggested questions:*\n- What are the setback requirements${zDistrict ? ` for ${zDistrict}` : ''}?\n- What uses are permitted${zDistrict ? ` in ${zDistrict}` : ''}?\n- What is the maximum building height?\n- Are there any overlay districts I should know about?`;

      setZoningChatHistory([{ role: MessageRole.MODEL, text: opening }]);
      setActiveAgent(AgentType.ZONING_AGENT);
      setInitializedAgents(prev => new Set(prev).add(AgentType.ZONING_AGENT));
      setIsInitialScreen(false);
      showView('zoning');
      setIsChatPanelVisible(true);

      // -------------------------------------------------------------------
      // SILENT BOOTSTRAP � always runs as soon as the jurisdiction is loaded.
      // Asks the agent for the zoning district map URL + a full list of
      // districts in the municipality, then pins both to the KnowledgeBase so
      // the ZoningResultsPanel can render the Map & Districts card. No chat
      // history entries are added � the user sees the map card populate
      // instead of a redundant Q&A bubble.
      // -------------------------------------------------------------------
      let bootstrapPromise: Promise<void> | null = null;
      if (newChat) {
        console.log('[Zoning] ?? bootstrap IIFE starting in 400ms');
        bootstrapPromise = (async () => {
          await new Promise(r => setTimeout(r, 400));
          console.log('[Zoning] ?? bootstrap sending prompt to model');
          setBootstrapStatus({ stage: 'starting', message: 'Starting research�', detail: `${zMuni}, ${zCounty} County, ${zState}` });
          try {
            const bootstrapPrompt = `[BACKGROUND BOOTSTRAP � do not narrate, do not chat. Return ONE \`\`\`json\`\`\` block as the entire answer.]\n\nFor the municipality below, run SEARCH-FIRST research using grounded Google Search. Claw is optional for follow-up extraction only.\n  1. Find the OFFICIAL zoning district map URL from municipal/county/state sources. Valid map URLs include PDF, ArcGIS, county GIS portals, and other interactive zoning viewers on official domains.\n  2. Provide a hostable preview image URL if available (thumbnail/export/screenshot URL). Optional.\n  3. Provide the COMPLETE zoning district list (code + short name).\n\nMunicipality: ${zMuni}\nCounty: ${zCounty} County\nState: ${zState}\n\n**MANDATORY ORDER**\n1) First use grounded Google Search queries such as:\n   - \`"${zMuni}" "${zState}" zoning map\`\n   - \`"${zMuni}" "${zCounty} County" zoning map\`\n   - \`"${zMuni}" GIS zoning map\`\n   - \`"${zMuni}" zoning ordinance district list\`\n2) Use the real URLs that appear in those results as candidates.\n3) Use Claw only when needed to drill into listing pages or follow links.\n\n**DRILLING RULE**\nIf you hit a listing page (Maps/Documents/Planning), extract and return the DIRECT map resource URL (PDF OR ArcGIS/GIS viewer), not just the listing page.\n\n**NO FABRICATION**\nEvery URL must be verbatim from grounded search results or Claw output from this session. Never guess URL paths. If no verifiable URL exists, set null.\n\n**OUTPUT RULE**\nAlways return the JSON shell, even when fields are null/empty. No prose, no THINKING, no extra text.\n\nOutput EXACTLY this JSON shape and NOTHING else:\n\`\`\`json\n{\n  "zoningMapUrl": "https://... or null",\n  "zoningMapImage": "https://... or null",\n  "zoningDistricts": [\n    { "code": "R-1", "name": "Single-Family Residential" }\n  ],\n  "sources": ["https://..."]\n}\n\`\`\``;
            setBootstrapStatus({ stage: 'streaming', message: 'Searching for zoning map & districts�', detail: 'Talking to the model with Google Search grounding' });
            const stream = await newChat.sendMessageStream({ message: bootstrapPrompt });
            let resp = '';
            for await (const chunk of stream) {
              resp += chunk.text;
              setBootstrapStatus({ stage: 'streaming', message: 'Searching for zoning map & districts�', bytes: resp.length });
            }
            // Keep a running transcript so we can scan ALL hops for the JSON
            // block, not just the most recent. The model often answers in
            // hop 1 (with grounded search results) and then refines in
            // follow-ups; the JSON might live in either response.
            let transcript = resp;

            // Walk through any Claw directives the model emits (up to MAX_HOPS).
            // Claw is optional: if it fails (401/unauthorized), pivot to
            // grounded-search-only synthesis instead of failing the bootstrap.
            const MAX_HOPS = 3;
            let clawHadAuthError = false;
            for (let hop = 0; hop < MAX_HOPS; hop++) {
              const directives = parseClawDirectives(resp);
              if (directives.length === 0) break;
              const toolNames = directives.map(d => d.tool).join(', ');
              setBootstrapStatus({ stage: 'tool-call', message: `Fetching from municipality website�`, detail: `Hop ${hop + 1}: ${toolNames}`, hop: hop + 1 });
              let toolBlock: string | null = null;
              try { toolBlock = await runClawDirectives(resp); } catch { toolBlock = null; }
              if (!toolBlock) break;
              if (/\b401\b|unauthorized/i.test(toolBlock)) {
                clawHadAuthError = true;
                transcript += '\n' + toolBlock;
                setBootstrapStatus({
                  stage: 'streaming-followup',
                  message: 'Claw unavailable � continuing with grounded search only�',
                  detail: `Hop ${hop + 1} authorization error`,
                  hop: hop + 1,
                });
                break;
              }
              setBootstrapStatus({ stage: 'streaming-followup', message: 'Analyzing fetched content�', detail: `Hop ${hop + 1} response`, hop: hop + 1 });
              let hopResp = '';
              try {
                const followStream = await newChat.sendMessageStream({ message: toolBlock });
                for await (const chunk of followStream) {
                  hopResp += chunk.text;
                  setBootstrapStatus({ stage: 'streaming-followup', message: 'Analyzing fetched content�', detail: `Hop ${hop + 1} response`, bytes: hopResp.length, hop: hop + 1 });
                }
              } catch { break; }
              resp = hopResp;
              transcript += '\n' + hopResp;
            }

            setBootstrapStatus({ stage: 'parsing', message: 'Extracting structured data�' });
            let parsed = extractZoningJsonBlock(transcript) as any;

            // If the model fetched pages but never restated the JSON block,
            // ask it once more � explicitly � for just the JSON. One last
            // round-trip without tool calls.
            if (!parsed) {
              setBootstrapStatus({ stage: 'streaming-followup', message: 'Asking model to restate the JSON�' });
              try {
                const reminderPrompt = clawHadAuthError
                  ? `Claw returned authorization errors, so continue with grounded Google Search evidence only. Output ONLY the final JSON block I asked for at the start: one \`\`\`json\`\`\` block with keys zoningMapUrl, zoningMapImage, zoningDistricts, sources. A URL is valid if it appeared in grounded search results this session (Claw confirmation is optional when Claw is unavailable). Use \`null\` only when no verifiable URL exists. Use an empty array \`[]\` for lists you could not verify. The JSON shell is REQUIRED even when every field is null/empty. No prose, no claw directives, no THINKING.`
                  : `You have everything you need. Output ONLY the final JSON block I asked for at the start: one \`\`\`json\`\`\` block with keys zoningMapUrl, zoningMapImage, zoningDistricts, sources. A URL is valid when it is verifiable from grounded Google Search results and/or Claw outputs from this session. Use \`null\` only when no verifiable URL exists. Use an empty array \`[]\` for lists you have nothing for. The JSON shell is REQUIRED even when every field is null/empty. No prose, no claw directives, no THINKING.`;
                const reStream = await newChat.sendMessageStream({ message: reminderPrompt });
                let reResp = '';
                for await (const chunk of reStream) {
                  reResp += chunk.text;
                  setBootstrapStatus({ stage: 'streaming-followup', message: 'Asking model to restate the JSON�', bytes: reResp.length });
                }
                transcript += '\n' + reResp;
                parsed = extractZoningJsonBlock(transcript) as any;
              } catch { /* fall through to salvage */ }
            }

            // Last-ditch salvage: if the model still didn't emit JSON, fall
            // forward with a null/empty shell instead of crashing into a
            // "couldn't complete" state. The verification step still runs and
            // the user simply sees "Done � no usable data" � which is the
            // truthful answer when the jurisdiction has no findable map and
            // is much friendlier than an error banner.
            if (!parsed) {
              console.warn('[Zoning] bootstrap returned no parseable JSON after reminder � falling back to empty shell. Transcript head:', transcript.slice(0, 600));
              console.warn('[Zoning] transcript tail:', transcript.slice(-600));
              parsed = { zoningMapUrl: null, zoningMapImage: null, zoningDistricts: [], sources: [] };
            }

            // Absolute guardrail: never surface "No structured data returned"
            // for bootstrap. If parsing still failed, force a null/empty shell
            // so deterministic candidate discovery + verification can continue.
            if (!parsed || typeof parsed !== 'object') {
              parsed = { zoningMapUrl: null, zoningMapImage: null, zoningDistricts: [], sources: [] };
            }

            if (parsed && typeof parsed === 'object') {
              setBootstrapStatus({ stage: 'pinning', message: 'Verifying URLs & saving to project knowledge base�' });
              console.log('[Zoning] ?? bootstrap parsed JSON OK:', parsed);

              // Reachability probe via our /api/proxy-fetch endpoint. We
              // request the URL, grab the status + content-type, then cancel
              // the body � we only need to know whether the host resolves
              // and the response is an acceptable PDF/image. This guards
              // against Gemini hallucinating zoning-map URLs (NXDOMAIN hosts,
              // wrong paths, HTML 404 pages, etc.) before they get pinned to
              // the KB and shown in the UI.
              const verifyUrlReachable = async (u: string): Promise<{ ok: boolean; contentType?: string }> => {
                try {
                  const proxyUrl = `/api/proxy-fetch?probe=1&url=${encodeURIComponent(u)}`;
                  const r = await fetch(proxyUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10_000),
                  });
                  if (!r.ok) { try { await r.body?.cancel(); } catch { /* ignore */ } return { ok: false }; }
                  // Probe mode returns a tiny JSON {ok, contentType}; fall back
                  // to the response header if an older proxy streams the body.
                  let contentType = r.headers.get('content-type') || undefined;
                  try {
                    const j = await r.json();
                    if (j && typeof j.contentType === 'string') contentType = j.contentType;
                    return { ok: j?.ok !== false, contentType };
                  } catch {
                    try { await r.body?.cancel(); } catch { /* ignore */ }
                    return { ok: true, contentType };
                  }
                } catch {
                  return { ok: false };
                }
              };

              const subj = [zMuni, zCounty, zState].filter(Boolean).join('|') || 'current_jurisdiction';
              const ctx = `${zMuni}, ${zCounty} County, ${zState}`;
              const pin = (predicate: string, value: unknown) => {
                if (value == null || value === '') return;
                knowledgeBase.recordFact({
                  category: 'zoning.requirements', subject: subj, predicate, value,
                  source: AgentType.ZONING_AGENT, context: ctx,
                });
              };

              // Verify the two URL fields in parallel before pinning either.
              // ----------------------------------------------------------
              // DETERMINISTIC MAP SELECTION
              // Don't trust whichever single URL the model dropped into
              // `zoningMapUrl`. Instead harvest EVERY url that surfaced this
              // session � the model's JSON, its `sources[]`, and any link it
              // wrote in prose (which is where grounded-search hits land) �
              // score them by how map-like they are, verify each through the
              // proxy, and use the first candidate that actually resolves to a
              // real PDF/image. This is the "follow the grounded link ? verify
              // ? show the map" loop the user asked for, and it's robust to the
              // model mis-filing the correct URL.
              // ----------------------------------------------------------
              const muniSlug = String(zMuni).toLowerCase().replace(/[^a-z0-9]+/g, '');
              const harvestUrls = (text: string): string[] => {
                const out: string[] = [];
                const re = /https?:\/\/[^\s"'`)<>\]}]+/gi;
                let m: RegExpExecArray | null;
                while ((m = re.exec(text)) !== null) {
                  out.push(m[0].replace(/[.,;:!?)\]}>"']+$/, ''));
                }
                return out;
              };
              const scoreUrl = (u: string): number => {
                const lo = u.toLowerCase();
                let s = 0;
                if (/\.pdf(\?|#|$)/.test(lo)) s += 100;
                if (lo.includes('zoning')) s += 40;
                if (lo.includes('map')) s += 25;
                if (lo.includes('gis') || lo.includes('arcgis') || lo.includes('esri') || lo.includes('webmap') || lo.includes('mapserver') || lo.includes('featurelayer')) s += 35;
                if (muniSlug && lo.replace(/[^a-z0-9]+/g, '').includes(muniSlug)) s += 30;
                if (/google\.com|bing\.com|wikipedia|facebook|youtube|linkedin/.test(lo)) s -= 200;
                if (/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/.test(lo)) s -= 50;
                return s;
              };
              const candidateSet = new Map<string, number>();
              const addCandidate = (u: unknown) => {
                if (typeof u !== 'string') return;
                const cleaned = u.trim();
                if (!/^https?:\/\//i.test(cleaned)) return;
                const sc = scoreUrl(cleaned);
                if (!candidateSet.has(cleaned) || (candidateSet.get(cleaned) ?? -Infinity) < sc) candidateSet.set(cleaned, sc);
              };
              addCandidate(parsed.zoningMapUrl);
              addCandidate(parsed.zoningMapImage);
              if (Array.isArray(parsed.sources)) parsed.sources.forEach(addCandidate);
              harvestUrls(transcript).forEach(addCandidate);

              // DETERMINISTIC DISCOVERY (Google Custom Search, server-side).
              // Before trusting the model's links, ask the backend for the real
              // top Google hits for zoning-map discovery queries (PDF + general).
              // These are authoritative #1-result links, so we give them a large
              // score bonus to rank ahead of anything the model wrote � but we
              // STILL verify each through the proxy below before pinning. No-ops
              // gracefully (configured:false) when the CSE key isn't set.
              const cseUrls = new Set<string>();
              const muniMatchUrls = new Set<string>();
              let cseConfigured = false;
              try {
                const cseRes = await fetch('/api/zoning/search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ state: zState, county: zCounty, place: zMuni, placeType: '' }),
                  signal: AbortSignal.timeout(12_000),
                });
                if (cseRes.ok) {
                  const cseJson = await cseRes.json();
                  cseConfigured = cseJson?.configured !== false;
                  const cands: unknown[] = Array.isArray(cseJson?.candidates) ? cseJson.candidates : [];
                  for (const c of cands) {
                    const obj = (c && typeof c === 'object') ? (c as { url?: string; score?: number; muniMatch?: boolean }) : null;
                    const u = typeof c === 'string' ? c : obj?.url;
                    if (typeof u === 'string' && /^https?:\/\//i.test(u)) {
                      cseUrls.add(u);
                      if (obj?.muniMatch) muniMatchUrls.add(u);
                      // Trust the server's title+snippet+municipality-aware score;
                      // only fall back to URL-only scoring if it's missing. (URL-only
                      // scoring mis-ranks maps served without a .pdf extension.)
                      const base = typeof obj?.score === 'number' ? obj.score : scoreUrl(u);
                      const sc = base + 1000; // authoritative search hit ? rank first
                      if (!candidateSet.has(u) || (candidateSet.get(u) ?? -Infinity) < sc) candidateSet.set(u, sc);
                    }
                  }
                  console.log(`[Zoning] CSE candidates: ${cands.length} (configured=${cseJson?.configured !== false})`, [...cseUrls]);
                } else {
                  console.warn(`[Zoning] CSE lookup HTTP ${cseRes.status} � continuing with model URLs`);
                }
              } catch (cseErr) {
                console.warn('[Zoning] CSE lookup failed (continuing with model URLs):', cseErr);
              }

              let ranked = [...candidateSet.entries()]
                .filter(([u]) => /^https?:\/\//i.test(u))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([u]) => u);

              // When server-side search is configured, only trust URLs returned
              // by that search endpoint. This prevents transcript/model spillover
              // from neighboring municipalities from ever being pinned.
              if (cseConfigured) {
                ranked = ranked.filter(u => cseUrls.has(u));
              }
              console.log('[Zoning] map candidates (ranked):', ranked);

              setBootstrapStatus({ stage: 'pinning', message: 'Verifying candidate map links�', detail: `${ranked.length} candidate${ranked.length === 1 ? '' : 's'} from search results` });
              const checks = await Promise.all(ranked.map(async u => ({ u, ...(await verifyUrlReachable(u)) })));
              const verified = checks.filter(c => c.ok);
              const isPdf = (c: { contentType?: string }) => (c.contentType || '').toLowerCase().includes('pdf');
              const isImg = (c: { contentType?: string }) => (c.contentType || '').toLowerCase().startsWith('image/');
              const isImgFile = (c: { u: string; contentType?: string }) => isImg(c) && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(c.u);
              // Prefer a verified PDF, then a verified image file, then any reachable candidate.
              const pickBest = (list: typeof verified) =>
                list.find(c => isPdf(c)) || list.find(c => isImgFile(c)) || list[0] || null;
              // SANITY GATE before finalizing: if ANY candidate positively
              // references the target municipality (server muniMatch flag), we
              // MUST pin only from that set. If none verify, return no map
              // rather than pinning the wrong municipality.
              const matchedVerified = verified.filter(c => muniMatchUrls.has(c.u));
              const hasMuniMatchedCandidates = muniMatchUrls.size > 0;
              const bestMap = pickBest(matchedVerified);
              const bestMapMuniMatched = !!bestMap && muniMatchUrls.has(bestMap.u);

              if (bestMap) {
                pin('zoningMapUrl', bestMap.u);
                // Pin the verified content-type so the results panel can embed
                // extensionless PDFs (e.g. eastpikeland.org/media/3756 is served
                // as application/pdf with no .pdf in the URL) via the proxy
                // <object> instead of falling through to a raw, blocked <iframe>.
                pin('zoningMapContentType', bestMap.contentType || '');
                if (isImg(bestMap)) pin('zoningMapImage', bestMap.u);
              }
              // Verify an explicit preview image separately if the model gave
              // one and it wasn't already chosen as the map.
              let imgOk = false;
              if (typeof parsed.zoningMapImage === 'string' && parsed.zoningMapImage && parsed.zoningMapImage !== bestMap?.u) {
                const ic = await verifyUrlReachable(parsed.zoningMapImage);
                if (ic.ok) { pin('zoningMapImage', parsed.zoningMapImage); imgOk = true; }
              }
              // ----------------------------------------------------------
              // DISTRICT-LIST FALLBACK
              // The district legend lives INSIDE the map graphic (PDF/PNG), so
              // the first grounded pass � which only sees search-result
              // snippets � frequently returns an empty zoningDistricts array
              // even when the map itself pins perfectly (exactly this East
              // Pikeland case). If we have no districts yet, fire ONE focused
              // grounded pass that reads the municipal zoning ORDINANCE text
              // (where the districts are enumerated as a schedule) and merge.
              // ----------------------------------------------------------
              let districts: any[] = Array.isArray(parsed.zoningDistricts) ? parsed.zoningDistricts : [];
              if (districts.length === 0) {
                setBootstrapStatus({ stage: 'streaming-followup', message: 'Extracting the zoning district list�', detail: 'Reading the zoning ordinance' });
                try {
                  const distPrompt = `[BACKGROUND � no chat, no THINKING. Return ONE \`\`\`json\`\`\` block only.]\n\nUsing grounded Google Search (and Claw scrape_html if needed), find the COMPLETE list of zoning districts for:\nMunicipality: ${zMuni}\nCounty: ${zCounty} County\nState: ${zState}\n\nThe district schedule lives in the municipal ZONING ORDINANCE (often the Article/Part that "establishes districts") or the legend of the official zoning map. Issue searches like \`"${zMuni}" zoning districts "R-1"\` or \`"${zMuni}" "${zState}" zoning ordinance establishment of districts\`, open the ordinance, and read the district list. Include every base district AND overlay district.\n\nReturn EXACTLY this and nothing else (codes verbatim, e.g. R-1, RC, V-1; empty array only if truly none found):\n\`\`\`json\n{ "zoningDistricts": [ { "code": "R-1", "name": "Single-Family Residential" } ] }\n\`\`\``;
                  let dResp = '';
                  const dStream = await newChat.sendMessageStream({ message: distPrompt });
                  for await (const chunk of dStream) { dResp += chunk.text; setBootstrapStatus({ stage: 'streaming-followup', message: 'Extracting the zoning district list�', bytes: dResp.length }); }
                  let dTranscript = dResp;
                  for (let hop = 0; hop < 2; hop++) {
                    const dirs = parseClawDirectives(dResp);
                    if (dirs.length === 0) break;
                    setBootstrapStatus({ stage: 'tool-call', message: 'Reading the zoning ordinance�', detail: `District hop ${hop + 1}`, hop: hop + 1 });
                    let dBlock: string | null = null;
                    try { dBlock = await runClawDirectives(dResp); } catch { dBlock = null; }
                    if (!dBlock) break;
                    let dHop = '';
                    try {
                      const dFollow = await newChat.sendMessageStream({ message: dBlock });
                      for await (const chunk of dFollow) { dHop += chunk.text; }
                    } catch { break; }
                    dResp = dHop;
                    dTranscript += '\n' + dHop;
                  }
                  const dParsed = extractZoningJsonBlock(dTranscript) as any;
                  if (dParsed && Array.isArray(dParsed.zoningDistricts) && dParsed.zoningDistricts.length > 0) {
                    districts = dParsed.zoningDistricts;
                    console.log(`[Zoning] district fallback recovered ${districts.length} districts`);
                  }
                } catch (dErr) { console.warn('[Zoning] district fallback failed:', dErr); }
              }
              // ----------------------------------------------------------
              // OCR FALLBACK (last resort) � districts STILL empty after the
              // cheap grounded pass. Read them straight off the pinned map
              // graphic with a single multimodal pass. We only spend this when
              // grounded search came up empty AND we actually have a map to read.
              // ----------------------------------------------------------
              if (districts.length === 0 && bestMap) {
                setBootstrapStatus({ stage: 'streaming-followup', message: 'Reading districts from the map (OCR)�', detail: 'Last-resort multimodal pass' });
                try {
                  const r = await fetch(`/api/proxy-fetch?url=${encodeURIComponent(bestMap.u)}`, { signal: AbortSignal.timeout(30_000) });
                  if (r.ok) {
                    const buf = await r.arrayBuffer();
                    const bytes = new Uint8Array(buf);
                    let binary = '';
                    const CHUNK = 0x8000;
                    for (let i = 0; i < bytes.length; i += CHUNK) {
                      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
                    }
                    const b64 = btoa(binary);
                    const mime = bestMap.contentType || r.headers.get('content-type') || 'application/pdf';
                    const zoningModel = resolveModelForAgent(AgentType.ZONING_AGENT, activeModel);
                    const ocrModel = zoningModel.startsWith('gemini-') ? zoningModel : CURRENT_GEMINI_MODEL;
                    const ocrDistricts = await extractZoningDistrictsFromMap(b64, mime, ocrModel, settings.userApiKey);
                    if (ocrDistricts.length > 0) {
                      districts = ocrDistricts;
                      console.log(`[Zoning] OCR recovered ${districts.length} districts from the map`);
                    }
                  } else {
                    try { await r.body?.cancel(); } catch { /* ignore */ }
                  }
                } catch (ocrErr) { console.warn('[Zoning] OCR fallback failed:', ocrErr); }
              }
              if (districts.length > 0) pin('zoningDistricts', districts);
              if (Array.isArray(parsed.sources) && parsed.sources.length > 0) pin('zoningMapSources', parsed.sources);

              const counts: string[] = [];
              if (bestMap) counts.push(isPdf(bestMap) ? 'map PDF' : 'map URL');
              if (imgOk || (bestMap && isImg(bestMap))) counts.push('preview image');
              if (districts.length) counts.push(`${districts.length} districts`);
              const dropped: string[] = [];
              if (parsed.zoningMapUrl && !bestMap) dropped.push('map URL (no candidate verified)');
              if (!bestMap && (hasMuniMatchedCandidates || cseConfigured) && verified.length > 0) {
                dropped.push('non-municipality map candidates (rejected by municipality guard)');
              }
              const detail = dropped.length > 0
                ? `Dropped ${dropped.join(', ')}`
                : (bestMap && cseUrls.has(bestMap.u)
                    ? `Used verified ${isPdf(bestMap) ? 'PDF' : 'link'} from Google search${bestMapMuniMatched ? '' : ' (municipality not confirmed)'}`
                    : (bestMap && bestMap.u !== parsed.zoningMapUrl ? `Used verified ${isPdf(bestMap) ? 'PDF' : 'link'} from search results${bestMapMuniMatched ? '' : ' (municipality not confirmed)'}` : undefined));
              setBootstrapStatus({
                stage: 'done',
                message: `Done � found ${counts.join(', ') || 'no usable data'}`,
                detail,
              });
              console.log('[Zoning] bootstrap pinned map + districts to KB', { pinned: counts, bestMap, dropped, parsed });
            }
          } catch (e: any) {
            setBootstrapStatus({ stage: 'failed', message: 'Lookup failed', detail: String(e?.message || e) });
            console.warn('[Zoning] bootstrap failed:', e);
          }
        })();
      }

      // If a desired use was specified, kick off an initial auto-query AFTER
      // bootstrap completes � they share `newChat` and the SDK serializes per
      // chat instance, so running them concurrently corrupts conversation state.
      if (zUse && newChat) {
        (async () => {
          if (bootstrapPromise) { try { await bootstrapPromise; } catch { /* ignore */ } }
          await new Promise(r => setTimeout(r, 150));
          try {
            const autoQuery = `Is "${zUse}" a permitted use${zDistrict ? ` in the ${zDistrict} district` : ''} in ${zMuni}, ${zCounty} County, ${zState}? Please search the zoning ordinance and provide the specific section reference.`;
            setZoningChatHistory(prev => [...prev, { role: MessageRole.USER, text: autoQuery }]);
            setZoningChatHistory(prev => [...prev, { role: MessageRole.MODEL, text: '' }]);
            const stream = await newChat.sendMessageStream({ message: autoQuery });
            let resp = '';
            for await (const chunk of stream) {
              resp += chunk.text;
              setZoningChatHistory(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: MessageRole.MODEL, text: resp };
                return next;
              });
            }

            // Post-stream Claw loop � same shape as handleSendMessage.
            const MAX_CLAW_HOPS = 3;
            for (let hop = 0; hop < MAX_CLAW_HOPS; hop++) {
              const directives = parseClawDirectives(resp);
              console.log(`[Claw] (auto-query) hop ${hop}: detected ${directives.length} directive(s)`, directives.map(d => d.tool));
              if (directives.length === 0) break;
              let toolBlock: string | null = null;
              try {
                toolBlock = await runClawDirectives(resp);
              } catch (e: any) {
                toolBlock = `Claw tool error: ${e?.message || e}`;
              }
              if (!toolBlock) break;
              // Reuse the active MODEL bubble � overwrite its text with the new
              // hop's output. Per-hop bubbles flooded the chat with empties.
              let hopResp = '';
              try {
                const followStream = await newChat.sendMessageStream({ message: toolBlock });
                for await (const chunk of followStream) {
                  hopResp += chunk.text;
                  setZoningChatHistory(prev => {
                    const next = [...prev];
                    next[next.length - 1] = { role: MessageRole.MODEL, text: hopResp };
                    return next;
                  });
                }
              } catch (e) {
                console.error('[Claw] (auto-query) follow-up stream failed:', e);
                break;
              }
              resp = hopResp;
            }

            // Synthesis fallback � if the loop exited with no visible prose
            // (model burned all hops on directives, or every page 403'd),
            // ask the model one final time with NO tools allowed so the user
            // always sees an answer instead of the "Researching�" placeholder.
            if (!sanitizeZoningAnswer(resp)) {
              try {
                const synthMsg = '[SYNTHESIS REQUIRED] You exhausted your Claw browser hops or some pages failed (e.g., 403 Cloudflare). Write the FINAL answer NOW from whatever data you have so far. Do NOT emit any more ```claw``` directives. If some numbers could not be verified, say so plainly and cite what you DID find. End with the ```json``` block per schema.';
                let synthResp = '';
                const synthStream = await newChat.sendMessageStream({ message: synthMsg });
                for await (const chunk of synthStream) {
                  synthResp += chunk.text;
                  setZoningChatHistory(prev => {
                    const next = [...prev];
                    next[next.length - 1] = { role: MessageRole.MODEL, text: synthResp };
                    return next;
                  });
                }
                resp = synthResp;
              } catch (e) {
                console.error('[Claw] (auto-query) synthesis fallback failed:', e);
              }
            }

            // Pin any structured zoning data the model emitted so other agents
            // (Boundary, Civil Drafter, �) can reuse it via CACP + KnowledgeBase
            // without re-asking. Same shape as the inter-agent CACP handler.
            try {
              const parsed = extractZoningJsonBlock(resp);
              if (parsed) {
                interAgentComm.cacheResult(
                  'get_zoning_requirements',
                  { state: zState, county: zCounty, municipality: zMuni, district: zDistrict || '' },
                  parsed,
                  AgentType.ZONING_AGENT,
                  600_000
                );
                extractZoningFacts(parsed, { state: zState, county: zCounty, municipality: zMuni, district: zDistrict });
                console.log('[Zoning] auto-query pinned facts to KB', parsed);
              }
            } catch (kbErr) {
              console.warn('[Zoning] auto-query KB pin failed:', kbErr);
            }
          } catch (e) {
            console.error('[ZoningAgent] auto-query failed:', e);
          }
        })();
      }

      console.log('[handleZoningSearch] Zoning agent initialized');

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Zoning Agent.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, settings, startChatWithOverride]);



  const handleTitleSearchDeedSubmitted = useCallback((file: SessionFile) => {
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
      setShowHostCostReminder(true);
      return;
    }
    try {
      if (!initializedAgents.has(AgentType.TITLE_SEARCH)) {
        startSession();
        logActionToFieldbook(`Title Search initialized with first deed: ${file.name}`);
        const newChat = startChatWithOverride(AgentType.TITLE_SEARCH, file);
        setTitleSearchChat(newChat);
        setTitleSearchChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.TITLE_SEARCH]};">Title Search Agent</strong>. I will help you trace the property's ownership history and identify any liens or encumbrances. I've received the first deed: <strong>"${file.name}"</strong>. Please add more deeds to build the chain of title.`,
        }]);
        setSuggestedQuestions([
          "Analyze this deed and extract the key information.",
          "Who is the current owner?",
          "Are there any active liens?",
          "Show me the chain of title.",
        ]);
        setActiveAgent(AgentType.TITLE_SEARCH);
        setInitializedAgents(prev => new Set(prev).add(AgentType.TITLE_SEARCH));
        showView('titlesearch');
        setError(null);
      }
      
      // Add deed to Title Search by sending it to AI
      logActionToFieldbook(`Added deed to title search: ${file.name}`);
      setTitleSearchChatHistory(prev => [...prev, {
        role: MessageRole.USER,
        text: `Analyze this deed document: "${file.name}"`,
      }]);
      
      // AI will extract deed information and update the title search data
      // The response will be handled in handleSendMessage
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Title Search Agent.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [isFreeTierTimeLocked, activeModel, showView, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  const initializePointEditor = useCallback(() => {
    if (initializedAgents.has(AgentType.POINT_EDITOR)) return;
    // Always start the session shell + a friendly opener so the user can upload
    // points and view them client-side. The Gemini chat is best-effort: if no
    // API key is configured we skip the AI hookup silently � freemium path.
    startSession();
    logActionToFieldbook('Point Editor agent activated.');
    let aiAvailable = true;
    try {
        const newChat = startChatWithOverride(AgentType.POINT_EDITOR, '');
        setPointEditorChat(newChat);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/api key/i.test(msg)) {
            aiAvailable = false;
        } else {
            setError(`Initialization Error: ${msg}`);
        }
    }
    setPointEditorChatHistory([{
        role: MessageRole.MODEL,
        text: aiAvailable
            ? `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.POINT_EDITOR]};">Point Editor</strong> agent. I am now managing the project's <strong style="color: ${agentThemeColors[AgentType.POINT_EDITOR]};">Point Database</strong>. You can ask me to perform calculations or plot subsets of points.`
            : `<strong style="color: ${agentThemeColors[AgentType.POINT_EDITOR]};">Point Editor</strong> ready. Upload a point file (.csv / .txt) or enter points manually — everything works without a Gemini API key. Add a key in Settings whenever you want AI calculations and plotting.`,
    }]);
    setSuggestedQuestions(aiAvailable ? [
        "What is the inverse between two points?",
        "Draw all points with 'tree' in the description",
        "Are there any duplicate points?",
        "What is the average elevation of all points?",
    ] : []);
    setError(null);
    setInitializedAgents(prev => new Set(prev).add(AgentType.POINT_EDITOR));
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);
  
  const initializeGpsStakeoutAgent = useCallback(() => {
    if (initializedAgents.has(AgentType.GPS_STAKEOUT)) return;
    
    // Check if projection is set; if not, prompt user to select one
    if (!settings.projection || !settings.projection.zoneName) {
        setProjectionPrompt({
            message: 'GPS Stakeout requires a projection to be set. Please select your coordinate system.',
            onConfirm: () => {
                setProjectionPrompt(null);
                // Retry initialization after projection is set
                setTimeout(() => {
                    if (settings.projection && settings.projection.zoneName) {
                        initializeGpsStakeoutAgent();
                    }
                }, 500);
            },
            onCancel: () => {
                setProjectionPrompt(null);
                setError('GPS Stakeout requires a projection. Configuration cancelled.');
                setTimeout(() => setError(null), 3000);
            }
        });
        return;
    }
    
    try {
        startSession();
        logActionToFieldbook('GPS Stakeout agent activated.');
        // GPS Stakeout does not use AI chat - it's a pure GPS tool
        setError(null);
        setInitializedAgents(prev => new Set(prev).add(AgentType.GPS_STAKEOUT));
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize GPS Stakeout.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [startSession, logActionToFieldbook, initializedAgents, settings, setProjectionPrompt]);

  // FIX: Add initialization for the new Contouring Agent.
  const initializeContouringAgent = useCallback(() => {
    try {
        if (!initializedAgents.has(AgentType.CONTOURING_AGENT)) {
            startSession();
            logActionToFieldbook('Contouring agent activated.');
            const newChat = startChatWithOverride(AgentType.CONTOURING_AGENT, '');
            setContouringChat(newChat);
            setContouringChatHistory([{
                role: MessageRole.MODEL,
                text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CONTOURING_AGENT]};">Contouring Agent</strong>. I can generate contour lines from your project's points. What contour interval would you like?`,
            }]);
            setSuggestedQuestions([
                "Generate contours at a 1-foot interval.",
                "Create 5-foot contours using only points with 'GROUND' in the description.",
                "What is the highest and lowest elevation in the project?",
            ]);
            setError(null);
            setInitializedAgents(prev => new Set(prev).add(AgentType.CONTOURING_AGENT));
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  const initializeSteepSlopeAgent = useCallback(() => {
    try {
      if (!initializedAgents.has(AgentType.STEEP_SLOPE_AGENT)) {
        startSession();
        logActionToFieldbook('Steep Slope agent activated.');
        const newChat = startChatWithOverride(AgentType.STEEP_SLOPE_AGENT, '');
        setSteepSlopeChat(newChat);
        setSteepSlopeChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.STEEP_SLOPE_AGENT]};">Steep Slope Agent</strong>. I can classify terrain by slope-percent bands on a TIN and remove connected components below your minimum vertical-span threshold.`,
        }]);
        setSuggestedQuestions([
          'Run steep slope analysis using 15%, 30%, and 45% bands.',
          'Set minimum vertical span to 8 feet and rerun.',
          'Create CAD layers for each slope band with distinct colors.',
        ]);
        setError(null);
        setInitializedAgents(prev => new Set(prev).add(AgentType.STEEP_SLOPE_AGENT));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
  }, [startSession, logActionToFieldbook, initializedAgents, startChatWithOverride]);

  // FIX: Add initialization for the new Profile Agent.
  const initializeProfileAgent = useCallback(() => {
    try {
        if (!initializedAgents.has(AgentType.PROFILE_AGENT)) {
            startSession();
            logActionToFieldbook('Profile & Cross Section agent activated.');
            const newChat = startChatWithOverride(AgentType.PROFILE_AGENT, '');
            setProfileChat(newChat);
            setProfileChatHistory([{
                role: MessageRole.MODEL,
                text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.PROFILE_AGENT]};">Profile & Cross Section Agent</strong>. I can generate elevation profiles along lines or centerlines. How can I assist?`,
            }]);
            setSuggestedQuestions([
                "Generate a profile along line from point 1 to 2.",
                "Create a profile of CL-1 from station 0+00 to 10+00.",
                "Show cross sections every 50 feet along the highway.",
            ]);
            setError(null);
            setInitializedAgents(prev => new Set(prev).add(AgentType.PROFILE_AGENT));
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  // FIX: Add initialization for the new COGO Agent.
  const initializeCogoAgent = useCallback(() => {
    try {
        if (!initializedAgents.has(AgentType.COGO_AGENT)) {
            startSession();
            logActionToFieldbook('COGO agent activated.');
            const newChat = startChatWithOverride(AgentType.COGO_AGENT, '');
            setCogoChat(newChat);
            setCogoChatHistory([{
                role: MessageRole.MODEL,
                text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.COGO_AGENT]};">COGO Agent</strong>. I can perform coordinate geometry calculations including inverse calculations and intersection computations. How can I assist?`,
            }]);
            setSuggestedQuestions([
                "Calculate the bearing and distance between two points.",
                "Find the intersection of two lines.",
                "Compute coordinates from a known point using bearing and distance.",
            ]);
            setError(null);
            setInitializedAgents(prev => new Set(prev).add(AgentType.COGO_AGENT));
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  // FIX: Add initialization for the new RINEX/GNSS Agent.
  const initializeRinexAgent = useCallback(() => {
    try {
        if (!initializedAgents.has(AgentType.GNSS_AGENT)) {
            startSession();
            logActionToFieldbook('RINEX Agent activated.');
            const newChat = startChatWithOverride(AgentType.GNSS_AGENT, '');
            setRinexChat(newChat);
            setRinexChatHistory([{
                role: MessageRole.MODEL,
                text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.GNSS_AGENT]};">RINEX Post-Processor</strong> agent. <br/><br/>I can help you process RINEX observation files from raw GNSS receivers to generate precise positioning solutions.<br/><br/><strong>Available Features:</strong><br/><ul style="margin-top: 8px; margin-left: 20px;"><li>Process RINEX files to generate precise positioning solutions</li><li>Single Point Positioning (SPP) with least-squares optimization</li><li>Support multi-constellation processing (GPS, GLONASS, Galileo, BeiDou)</li><li>Export results in multiple formats (CSV, GeoJSON, KML, JSON)</li><li>Analyze solution quality with DOP calculations</li></ul><br/><strong>To get started:</strong> Click the "RINEX Tools" button below to upload a RINEX file and configure processing parameters. You'll need an API key for premium features.`,
            }]);
            setSuggestedQuestions([
                "What RINEX file formats are supported?",
                "How do I use RTK mode with a reference station?",
                "When will this feature be available?",
            ]);
            setError(null);
            setInitializedAgents(prev => new Set(prev).add(AgentType.GNSS_AGENT));
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

    const initializeDroneAgent = useCallback(() => {
    try {
      if (!initializedAgents.has(AgentType.DRONE_AGENT)) {
        startSession();
        logActionToFieldbook('Drone Agent activated.');
        const newChat = startChatWithOverride(AgentType.DRONE_AGENT, '');
        setDroneChat(newChat);
        setDroneChatHistory([{
          role: MessageRole.MODEL,
          text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.DRONE_AGENT]};">Drone Agent</strong> agent.<br/><br/>I can help you stage aerial imagery in <strong>temporary processing storage</strong>, run NodeODM photogrammetry, and export orthomosaics and meshes back to <strong>connected destination storage</strong> such as Google Drive, Dropbox, or customer-owned object storage.<br/><br/><strong>To get started:</strong> Click the <strong>Drone Tools</strong> button below and paste temporary image URLs from the same overlapping flight set.`,
        }]);
        setSuggestedQuestions([
          'What image overlap do I need for a good orthomosaic?',
          'How does temporary processing storage get cleaned up?',
          'What outputs will the Drone Agent produce?',
        ]);
        setError(null);
        setInitializedAgents(prev => new Set(prev).add(AgentType.DRONE_AGENT));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AI chat.';
      setError(`Initialization Error: ${errorMessage}`);
    }
    }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings, startChatWithOverride]);

  // Initialize AR Agent
  const initializeARAgent = useCallback(() => {
    try {
        if (!initializedAgents.has(AgentType.AR_AGENT)) {
            startSession();
            logActionToFieldbook('AR Agent activated.');
            const newChat = startChatWithOverride(AgentType.AR_AGENT, '');
            setArChat(newChat);
            setArChatHistory([{
                role: MessageRole.MODEL,
                text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.AR_AGENT]};">AR (Augmented Reality)</strong> agent. <br/><br/>I help you visualize and interact with your survey data in 3D augmented reality on your Meta Quest headset. I can help you:<br/><ul style="margin-top: 8px; margin-left: 20px;"><li>View survey points as 3D markers in your physical environment</li><li>Stake out points using AR visualization</li><li>Analyze point data and relationships in 3D space</li><li>Plan fieldwork with spatial awareness</li><li>Answer questions about your project data</li></ul><br/>Ask me questions about your survey points or ask me to help you visualize specific data in AR!`,
            }]);
            setSuggestedQuestions([
                "Show me all points in AR mode",
                "Which points need stakeout?",
                "What's the elevation range of my points?",
            ]);
            setError(null);
            setInitializedAgents(prev => new Set(prev).add(AgentType.AR_AGENT));
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize AR Agent.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, startSession, logActionToFieldbook, initializedAgents, settings]);

  // NOTE: Point Editor auto-initialization removed - now uses upload screen with handlePointEditorSessionStart
  // EXCEPTION: if the session already has points (e.g. user came from the Boundary Agent or
  // loaded a previous .lsvz), the upload screen is pointless � skip it and initialize
  // the agent in place. The floating Point List panel is NOT auto-opened; instead the
  // toolbar button pulses pink so the user knows they can open it.
  useEffect(() => {
    if (
      activeAgent === AgentType.POINT_EDITOR &&
      !isInitialScreen &&
      !initializedAgents.has(AgentType.POINT_EDITOR) &&
      pointLists.some(l => l.points.length > 0)
    ) {
      handlePointEditorSessionStart();
      setIsPointListButtonPulsing(true);
    }
    // handlePointEditorSessionStart is defined later via useCallback; it's stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent, isInitialScreen, initializedAgents, pointLists]);
  
  useEffect(() => {
    if (activeAgent === AgentType.GPS_STAKEOUT && !isInitialScreen && !initializedAgents.has(AgentType.GPS_STAKEOUT)) {
        initializeGpsStakeoutAgent();
    }
  }, [activeAgent, isInitialScreen, initializedAgents, initializeGpsStakeoutAgent]);

  // FIX: Add useEffect hook to initialize the Contouring Agent when it's selected.
  useEffect(() => {
    if (activeAgent === AgentType.CONTOURING_AGENT && !isInitialScreen) {
        initializeContouringAgent();
    }
  }, [activeAgent, isInitialScreen, initializeContouringAgent]);

  useEffect(() => {
    if (activeAgent === AgentType.STEEP_SLOPE_AGENT && !isInitialScreen) {
      initializeSteepSlopeAgent();
    }
  }, [activeAgent, isInitialScreen, initializeSteepSlopeAgent]);

  // FIX: Add useEffect hook to initialize the Profile Agent when it's selected.
  useEffect(() => {
    if (activeAgent === AgentType.PROFILE_AGENT && !isInitialScreen) {
        initializeProfileAgent();
        setIsProfileGenPanelVisible(true);
    } else {
        setIsProfileGenPanelVisible(false);
    }
  }, [activeAgent, isInitialScreen, initializeProfileAgent]);

  // Flood Agent (v26.05.17.16): auto-show floating panel when agent activated;
  // auto-hide when switching away so the floating dialog doesn't linger.
  useEffect(() => {
    if (activeAgent === AgentType.FLOOD_AGENT && !isInitialScreen) {
      setIsFloodPanelVisible(true);
    } else {
      setIsFloodPanelVisible(false);
    }
  }, [activeAgent, isInitialScreen]);

  // Structures Agent: auto-show floating panel when agent activated; auto-hide when leaving.
  // Also auto-initialize the Gemini chat on first activation so the Synthesize button works.
  useEffect(() => {
    if (activeAgent === AgentType.STRUCTURES_AGENT && !isInitialScreen) {
      setIsStructuresPanelVisible(true);
      if (!initializedAgents.has(AgentType.STRUCTURES_AGENT)) {
        try {
          startSession();
          const newChat = startChatWithOverride(AgentType.STRUCTURES_AGENT, '');
          setStructuresChat(newChat);
          setStructuresChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: #fb923c;">Structures Agent</strong>. I pull <strong>FEMA NSI attributes</strong> (occupancy, sqft, stories) and <strong>OpenStreetMap building polygons</strong> (real geometry) for your project area, then deterministically rectify them against your survey BLDG corner shots \u2014 Helmert-snapping OSM polygons to surveyed corners, COGO-completing partial clusters (1, 2, 3, or 4+ corners), and only falling back to synthetic squares when no other data is available. Click <strong>Fetch FEMA Structures</strong>, then <strong>Rectify Building Footprints</strong>.`,
          }]);
          setSuggestedQuestions([
            'What occupancy types are in the loaded structures?',
            'Rectify the building footprints',
            'How do the FEMA NSI centroids compare to my survey BLDG points?',
          ]);
          setInitializedAgents(prev => new Set(prev).add(AgentType.STRUCTURES_AGENT));
          showView('canvas');
          setError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Structures Agent init: ${msg}`);
        }
      }
    } else {
      setIsStructuresPanelVisible(false);
    }
  }, [activeAgent, isInitialScreen, initializedAgents, startSession, startChatWithOverride, showView]);

  // Soils Agent: auto-show floating panel when agent activated; auto-hide when leaving.
  // Auto-initialize Gemini chat on first activation so the AI description tab works.
  useEffect(() => {
    if (activeAgent === AgentType.SOILS_AGENT && !isInitialScreen) {
      setIsSoilsPanelVisible(true);
      if (!initializedAgents.has(AgentType.SOILS_AGENT)) {
        try {
          startSession();
          const newChat = startChatWithOverride(AgentType.SOILS_AGENT, '');
          setSoilsChat(newChat);
          setSoilsChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: #a8a29e;">Soils Agent</strong>. I can overlay USDA NRCS SSURGO soil survey map-unit polygons for your project area and fetch detailed tabular reports � hydrologic group, drainage class, farmland classification, and tax class. Use the <strong>Fetch Soils</strong> button to load SSURGO linework, then click <strong>Fetch Soil Report</strong> to pull tabular data from the USDA Soil Data Access database.`,
          }]);
          setSuggestedQuestions([
            'What soil types are present in this area?',
            'Fetch soil report for all map units',
            'Clear soil linework',
          ]);
          setInitializedAgents(prev => new Set(prev).add(AgentType.SOILS_AGENT));
          showView('canvas');
          setError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Soils Agent init: ${msg}`);
        }
      }
    } else {
      setIsSoilsPanelVisible(false);
    }
  }, [activeAgent, isInitialScreen, initializedAgents, startSession, startChatWithOverride, showView]);

  // Contouring Agent (v26.05.17.33): auto-show Generation panel; auto-hide both panels
  // when leaving the agent so the floating dialogs stay in-context.
  useEffect(() => {
    if (activeAgent === AgentType.CONTOURING_AGENT && !isInitialScreen) {
      setIsContourGenPanelVisible(true);
      setIsContourGenMinimized(false);
    } else {
      setIsContourGenPanelVisible(false);
      setIsContourEsriPanelVisible(false);
      setIsContourGenMinimized(false);
      setIsContourEsriMinimized(false);
    }
  }, [activeAgent, isInitialScreen]);

  // Steep Slope Agent: auto-show slope tools panel while active.
  useEffect(() => {
    if (activeAgent === AgentType.STEEP_SLOPE_AGENT && !isInitialScreen) {
      setIsSteepSlopePanelVisible(true);
      setIsSteepSlopePanelMinimized(false);
    } else {
      setIsSteepSlopePanelVisible(false);
      setIsSteepSlopePanelMinimized(false);
    }
  }, [activeAgent, isInitialScreen]);

  // FIX: Add useEffect hook to initialize the COGO Agent when it's selected.
  useEffect(() => {
    if (activeAgent === AgentType.COGO_AGENT && !isInitialScreen) {
        initializeCogoAgent();
    }
  }, [activeAgent, isInitialScreen, initializeCogoAgent]);

  // FIX: Add useEffect hook to initialize the RINEX Agent when it's selected.
  useEffect(() => {
    if (activeAgent === AgentType.GNSS_AGENT && !isInitialScreen && !initializedAgents.has(AgentType.GNSS_AGENT)) {
        initializeRinexAgent();
    }
  }, [activeAgent, isInitialScreen, initializedAgents, initializeRinexAgent]);

  useEffect(() => {
    if (activeAgent === AgentType.DRONE_AGENT && !isInitialScreen && !initializedAgents.has(AgentType.DRONE_AGENT)) {
        initializeDroneAgent();
    }
  }, [activeAgent, isInitialScreen, initializedAgents, initializeDroneAgent]);

  // CACP: Register Zoning Agent command handlers so other agents can request zoning data
  useEffect(() => {
    const unsub1 = interAgentComm.onCommand('get_zoning_requirements', async (message) => {
      if (!zoningChat) return;
      const d = message.data as Record<string, unknown>;
      const s = (d.state as string) || zoningState;
      const c = (d.county as string) || zoningCounty;
      const m = (d.municipality as string) || zoningPlace;
      const dist = (d.district as string) || zoningDistrict || '';
      const fields = (d.fields as string[]) || [];
      const query = `Provide zoning requirements for ${m}, ${c} County, ${s}${dist ? `, district ${dist}` : ''}. Return structured JSON with fields: district, setbacks{front, side, rear}, maxHeight, minLotArea, lotCoverage, permittedUses[], sources[], confidence, disclaimer.${fields.length ? ` Focus on: ${fields.join(', ')}.` : ''}`;
      try {
        const stream = await zoningChat.sendMessageStream({ message: query });
        let resp = '';
        for await (const chunk of stream) resp += chunk.text;
        const jsonMatch = resp.match(/```json\s*([\s\S]*?)\s*```/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : { rawText: resp };
        // CACP: cache the zoning answer so peer agents (Boundary, Civil Drafter, etc.)
        // can reuse it without re-asking. 10-min TTL matches the default.
        try {
          interAgentComm.cacheResult(
            'get_zoning_requirements',
            { state: s, county: c, municipality: m, district: dist },
            parsed,
            AgentType.ZONING_AGENT,
            600_000
          );
          // KNOWLEDGE BASE: also pin the structured zoning numbers so any agent
          // can recall them later (the Boundary Agent doesn't need to know
          // about CACP cache TTLs � it just queries the KB).
          extractZoningFacts(parsed, { state: s, county: c, municipality: m, district: dist });
        } catch (cacheErr) {
          console.warn('[CACP] Failed to cache zoning result:', cacheErr);
        }
        return { requestId: message.id, from: AgentType.ZONING_AGENT, success: true, data: parsed, timestamp: Date.now() };
      } catch (e) {
        return { requestId: message.id, from: AgentType.ZONING_AGENT, success: false, error: String(e), timestamp: Date.now() };
      }
    });

    const unsub2 = interAgentComm.onCommand('query_zoning', async (message) => {
      if (!zoningChat) return;
      const d = message.data as Record<string, unknown>;
      const question = (d.question as string) || (d.query as string) || '';
      if (!question) return { requestId: message.id, from: AgentType.ZONING_AGENT, success: false, error: 'No question provided', timestamp: Date.now() };
      try {
        const stream = await zoningChat.sendMessageStream({ message: question });
        let resp = '';
        for await (const chunk of stream) resp += chunk.text;
        return { requestId: message.id, from: AgentType.ZONING_AGENT, success: true, data: { answer: resp }, timestamp: Date.now() };
      } catch (e) {
        return { requestId: message.id, from: AgentType.ZONING_AGENT, success: false, error: String(e), timestamp: Date.now() };
      }
    });

    return () => { unsub1(); unsub2(); };
  }, [zoningChat, zoningPlace, zoningCounty, zoningState, zoningDistrict]);

  // CACP: Register CAD Manager skill handlers � these let any agent (or
  // UI component) ask the CAD Manager Agent to resolve a symbol for a given
  // code/description against the shared CustomSymbol library, OR batch-
  // resolve symbols across all points missing one. The matching logic is the
  // same the canvas uses at render time, so previewed assignments match
  // what's drawn.
  useEffect(() => {
    // Resolves a code against the live customSymbols library first, then the
    // built-in SURVEY_SYMBOL_LIBRARY (tree, manhole, hydrant, �). This is
    // purely informational: unlike before, it does NOT persist synthesized
    // `builtin:` entries into customSymbols. Built-in symbols now render only
    // when their id is in enabledBuiltinSymbolIds (the opt-in gate), so any
    // materialization here would silently defeat that gate via the priority-1
    // custom-symbol path. Instead we report the match and, for the explicit
    // "auto apply" action, enable the matched ids through the gate.
    const resolveWithBuiltinFallback = async (
      code: string,
      description: string | undefined,
      library: CustomSymbol[],
    ): Promise<{ symbol: CustomSymbol | null; source: string; confidence: number; builtinId?: string }> => {
      const { resolveSymbol } = await import('./utils/symbolResolver.ts');
      const res = resolveSymbol(code, library);
      if (res.symbol && res.source !== 'none') {
        return { symbol: res.symbol, source: res.source, confidence: res.confidence };
      }
      const { findMatchingSymbol, libraryToSymbolDefinition } = await import('./data/surveySymbolLibrary.ts');
      const libMatch = findMatchingSymbol(code, description);
      if (libMatch) {
        const def = libraryToSymbolDefinition(libMatch, code);
        // Ephemeral synthesized symbol � used only to report a name/id back to
        // the caller. Never added to customSymbols.
        const synthesized: CustomSymbol = {
          id: `builtin:${libMatch.id}`,
          name: def.name,
          description: def.description || '',
          associatedTerms: [code.toLowerCase()],
          svgPath: def.svgPath!,
          fillPath: def.fillPath,
          viewBox: def.viewBox || '0 0 24 24',
          scale: 1,
        };
        return { symbol: synthesized, source: 'library-builtin', confidence: 0.7, builtinId: libMatch.id };
      }
      // Nothing matched � caller should treat the point as a plain marker.
      return { symbol: res.symbol, source: res.source, confidence: res.confidence };
    };

    const unsubSym = interAgentComm.onCommand('cad_resolve_symbol_for_code', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const code = String(d.code ?? '');
      if (!code) {
        return { requestId: message.id, from: AgentType.CAD_MANAGER, success: false, error: 'Missing code', timestamp: Date.now() };
      }
      const res = await resolveWithBuiltinFallback(code, code, customSymbols);
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: {
          symbolId:   res.symbol?.id ?? null,
          symbolName: res.symbol?.name ?? null,
          source:     res.source === 'name-exact' ? 'standard-exact' : res.source === 'fuzzy-term' ? 'library-fuzzy' : res.source === 'library-builtin' ? 'library-builtin' : 'none',
          confidence: res.confidence,
        },
        timestamp: Date.now(),
      };
    });

    const unsubAuto = interAgentComm.onCommand('cad_auto_apply_symbols', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const scope = Array.isArray(d.pointIds) ? new Set(d.pointIds as string[]) : null;
      const targets = points.filter(p => p.description && (!scope || scope.has(p.pointNumber)));
      const builtinIdsToEnable = new Set<string>();
      const assignments = [];
      for (const p of targets) {
        const res = await resolveWithBuiltinFallback(p.description ?? '', p.description, customSymbols);
        if (res.builtinId) builtinIdsToEnable.add(res.builtinId);
        assignments.push({
          pointId:    p.pointNumber,
          symbolId:   res.symbol?.id ?? null,
          symbolName: res.symbol?.name ?? null,
          source:     res.source,
          confidence: res.confidence,
        });
      }
      // This is an explicit "apply symbols" action, so honor it by turning on
      // the matched built-in symbol ids through the opt-in gate (rather than
      // mutating customSymbols). The canvas then renders them via the gated
      // built-in fallback path.
      if (builtinIdsToEnable.size > 0) {
        setEnabledBuiltinSymbolIds(prev => {
          const next = new Set(prev);
          builtinIdsToEnable.forEach(id => next.add(id));
          return next;
        });
      }
      const unresolved = assignments
        .filter(a => a.source === 'none')
        .map(a => targets.find(t => t.pointNumber === a.pointId)?.description ?? '');
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: { assignments, unresolved },
        timestamp: Date.now(),
      };
    });

    return () => { unsubSym(); unsubAuto(); };
  }, [customSymbols, points, setEnabledBuiltinSymbolIds]);

  // CACP � CAD Manager layer-resolution skills. Any agent that generates
  // points or lines is documented to call `cad_get_layer_for_code` before
  // assigning a layer so the output conforms to the loaded standard.
  // v26.05.17.24 � previously only `cad_resolve_symbol_for_code` was wired,
  // so Point Editor's askPeer calls were dead-ending with
  // "No handler responded to cad_get_layer_for_code". Hook the existing
  // cadManagerContext.resolveCode helper into CACP for single + batch.
  useEffect(() => {
    const unsubLayer = interAgentComm.onCommand('cad_get_layer_for_code', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const code = String(d.code ?? '').trim();
      if (!code) {
        return { requestId: message.id, from: AgentType.CAD_MANAGER, success: false, error: 'Missing code', timestamp: Date.now() };
      }
      const res = cadManagerContext.resolveCode(code);
      const standardLoaded = !!cadManagerContext.state.standard;
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: {
          pointLayer: res?.pointLayer || (standardLoaded ? null : 'V-NODE'),
          lineLayer:  res?.lineLayer  || (standardLoaded ? null : 'V-TOPO'),
          lineType:   res?.lineType   || 'CONTINUOUS',
          source:     res ? 'standard' : (standardLoaded ? 'unknown' : 'default'),
          confidence: res ? 1 : (standardLoaded ? 0 : 0.4),
        },
        timestamp: Date.now(),
      };
    });

    const unsubBatch = interAgentComm.onCommand('cad_resolve_batch', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const codes = Array.isArray(d.codes) ? (d.codes as unknown[]).map(c => String(c)) : [];
      const standardLoaded = !!cadManagerContext.state.standard;
      const results = codes.map(code => {
        const res = cadManagerContext.resolveCode(code);
        return {
          code,
          pointLayer: res?.pointLayer || (standardLoaded ? null : 'V-NODE'),
          lineLayer:  res?.lineLayer  || (standardLoaded ? null : 'V-TOPO'),
          lineType:   res?.lineType   || 'CONTINUOUS',
          source:     res ? 'standard' : (standardLoaded ? 'unknown' : 'default'),
          confidence: res ? 1 : (standardLoaded ? 0 : 0.4),
        };
      });
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: { results },
        timestamp: Date.now(),
      };
    });

    const unsubCtx = interAgentComm.onCommand('cad_get_layers_context', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const format = (d.format === 'full' ? 'full' : 'condensed') as 'condensed' | 'full';
      const contextString = cadManagerContext.getLayersContextString(format);
      const allLayers = cadManagerContext.getAllLayers();
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: {
          contextString,
          codeCount: cadManagerContext.state.standard?.codes?.length ?? 0,
          layerCount: allLayers.length,
        },
        timestamp: Date.now(),
      };
    });

    const unsubList = interAgentComm.onCommand('cad_list_all_layers', async (message) => {
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: {
          layers: cadManagerContext.getAllLayers(),
          standardName: cadManagerContext.state.standard?.name ?? null,
        },
        timestamp: Date.now(),
      };
    });

    // v26.05.17.41 � cad_create_layer lets peer agents (Deed Reader, Boundary
    // Agent, Civil Drafter) author layer triples on demand. Falls back to a
    // minimal seeded standard if none is loaded yet.
    const unsubCreate = interAgentComm.onCommand('cad_create_layer', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const code = String(d.code ?? '').trim();
      if (!code) {
        return { requestId: message.id, from: AgentType.CAD_MANAGER, success: false, error: 'Missing code', timestamp: Date.now() };
      }
      const before = cadManagerContext.state.standard?.codes?.length ?? 0;
      const added = cadManagerContext.addCodes([{
        code,
        description: typeof d.description === 'string' ? d.description : code,
        pointLayer: typeof d.pointLayer === 'string' ? d.pointLayer : 'V-NODE',
        lineLayer: typeof d.lineLayer === 'string' ? d.lineLayer : undefined,
        lineType: typeof d.lineType === 'string' ? d.lineType : 'CONTINUOUS',
        category: typeof d.category === 'string' ? d.category : undefined,
      }]);
      const after = cadManagerContext.state.standard?.codes?.length ?? before;
      const wasInserted = added.length > 0 || after > before;
      logActionToFieldbook(`CAD Manager: ${wasInserted ? 'created' : 'updated'} layer code "${code}" (lineLayer="${typeof d.lineLayer === 'string' ? d.lineLayer : '-'}").`);
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: {
          added: wasInserted,
          code,
          pointLayer: typeof d.pointLayer === 'string' ? d.pointLayer : 'V-NODE',
          lineLayer: typeof d.lineLayer === 'string' ? d.lineLayer : undefined,
          lineType: typeof d.lineType === 'string' ? d.lineType : 'CONTINUOUS',
        },
        timestamp: Date.now(),
      };
    });

    const unsubEnsure = interAgentComm.onCommand('cad_ensure_default_layers', async (message) => {
      const added = cadManagerContext.ensureDefaultBoundaryCodes();
      if (added.length > 0) {
        logActionToFieldbook(`CAD Manager: seeded default boundary layers (${added.map(c => c.code).join(', ')}).`);
      }
      return {
        requestId: message.id,
        from: AgentType.CAD_MANAGER,
        success: true,
        data: { addedCodes: added.map(c => c.code) },
        timestamp: Date.now(),
      };
    });

    return () => { unsubLayer(); unsubBatch(); unsubCtx(); unsubList(); unsubCreate(); unsubEnsure(); };
  }, [cadManagerContext, logActionToFieldbook]);

  useEffect(() => {
    const unsubRun = interAgentComm.onCommand('standards_run_compliance_audit', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const requestedMode =
        d.sourceMode === 'cad-manager' || d.sourceMode === 'control-pdf' || d.sourceMode === 'combined' || d.sourceMode === 'ask-each-run'
          ? (d.sourceMode as ComplianceSourceMode)
          : standardsComplianceSourceMode;
      // A loaded control PDF is the user's declared source of truth and always
      // wins over CACP/CAD Manager data when the mode is ambiguous.
      const modeToRun = requestedMode === 'ask-each-run'
        ? (standardsComplianceControlFile ? 'control-pdf' : (cadManagerContext.state.standard ? 'cad-manager' : 'combined'))
        : requestedMode;
      const report = (await runVisualComplianceAudit(modeToRun)) ?? buildStandardsComplianceReport(modeToRun);
      if (!report) {
        return {
          requestId: message.id,
          from: AgentType.STANDARDS_COMPLIANCE,
          success: false,
          error: 'No subject PDF loaded for standards compliance audit.',
          timestamp: Date.now(),
        };
      }
      setStandardsComplianceLastReport(report);
      logActionToFieldbook(`Standards Compliance audit via CACP (${modeToRun}, ${report.metadata.analysisMethod === 'visual-ai' ? 'visual AI' : 'text heuristic'}) -> ${report.passed ? 'PASS' : 'FAIL'} (${report.issues.length} issue(s)).`);
      return {
        requestId: message.id,
        from: AgentType.STANDARDS_COMPLIANCE,
        success: true,
        data: {
          passed: report.passed,
          summary: report.summary,
          issueCount: report.issues.length,
          reportId: report.reportId,
        },
        timestamp: Date.now(),
      };
    });

    const unsubLast = interAgentComm.onCommand('standards_get_last_report', async (message) => {
      return {
        requestId: message.id,
        from: AgentType.STANDARDS_COMPLIANCE,
        success: true,
        data: {
          hasReport: !!standardsComplianceLastReport,
          report: standardsComplianceLastReport ?? null,
        },
        timestamp: Date.now(),
      };
    });

    const unsubChecklist = interAgentComm.onCommand('standards_get_checklist', async (message) => {
      return {
        requestId: message.id,
        from: AgentType.STANDARDS_COMPLIANCE,
        success: true,
        data: {
          sourceMode: standardsComplianceSourceMode,
          checks: standardsComplianceChecks,
          hasControlFile: !!standardsComplianceControlFile,
          hasSubjectFile: !!standardsComplianceSubjectFile,
        },
        timestamp: Date.now(),
      };
    });

    return () => {
      unsubRun();
      unsubLast();
      unsubChecklist();
    };
  }, [
    buildStandardsComplianceReport,
    cadManagerContext.state.standard,
    logActionToFieldbook,
    runVisualComplianceAudit,
    standardsComplianceChecks,
    standardsComplianceControlFile,
    standardsComplianceLastReport,
    standardsComplianceSourceMode,
    standardsComplianceSubjectFile,
  ]);

  // CACP � GPS Rover skills. Lets peer agents (Point Editor, Boundary Agent,
  // Civil Drafter, etc.) read the operator's live position, list/stake project
  // points, and reserve a fresh point number via the Point Editor.
  // Refs are used so each registered handler always sees the latest state
  // without re-registering on every GPS fix (which arrives ~1Hz).
  const gpsCurrentPositionRef = useRef<GeolocationPosition | null>(currentPosition);
  const gpsProjectedPositionRef = useRef<{ northing: number; easting: number } | null>(projectedPosition);
  const gpsPointsRef = useRef<SurveyPoint[]>(points);
  const gpsSettingsRef = useRef<Settings>(settings);
  const gpsTargetRef = useRef<string>(stakeoutTargetPointNumber);
  useEffect(() => { gpsCurrentPositionRef.current = currentPosition; }, [currentPosition]);
  useEffect(() => { gpsProjectedPositionRef.current = projectedPosition; }, [projectedPosition]);
  useEffect(() => { gpsPointsRef.current = points; }, [points]);
  useEffect(() => { gpsSettingsRef.current = settings; }, [settings]);
  useEffect(() => { gpsTargetRef.current = stakeoutTargetPointNumber; }, [stakeoutTargetPointNumber]);
  const setStakeoutTargetPointNumberRef = useRef(setStakeoutTargetPointNumber);
  useEffect(() => { setStakeoutTargetPointNumberRef.current = setStakeoutTargetPointNumber; }, [setStakeoutTargetPointNumber]);

  useEffect(() => {
    const respond = (message: AgentMessage, success: boolean, data?: Record<string, unknown>, error?: string): AgentMessage => ({
      requestId: message.id,
      from: AgentType.GPS_STAKEOUT,
      success,
      data,
      error,
      timestamp: Date.now(),
    });

    const unsubPos = interAgentComm.onCommand('gps_get_current_position', async (message) => {
      const pos = gpsCurrentPositionRef.current;
      const proj = gpsProjectedPositionRef.current;
      const epsg = gpsSettingsRef.current.projection?.epsg;
      if (!pos) {
        return respond(message, true, { hasFix: false });
      }
      return respond(message, true, {
        hasFix: true,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        northing: proj?.northing ?? null,
        easting:  proj?.easting  ?? null,
        epsg: epsg ?? null,
        timestamp: pos.timestamp,
      });
    });

    const unsubGetTarget = interAgentComm.onCommand('gps_get_target_point', async (message) => {
      const target = gpsTargetRef.current || '';
      const pt = target ? gpsPointsRef.current.find(p => p.pointNumber === target) : null;
      return respond(message, true, {
        pointNumber: target,
        description: pt?.description ?? '',
        northing:    pt?.northing ?? null,
        easting:     pt?.easting  ?? null,
        elevation:   pt?.elevation ?? null,
      });
    });

    const unsubSetTarget = interAgentComm.onCommand('gps_set_target_point', async (message) => {
      const payload = (message.data ?? {}) as { pointNumber?: string };
      const pn = (payload.pointNumber || '').trim();
      if (!pn) return respond(message, false, undefined, 'pointNumber is required');
      const pt = gpsPointsRef.current.find(p => p.pointNumber === pn);
      if (!pt) return respond(message, false, undefined, `Point ${pn} not found in project.`);
      try {
        setStakeoutTargetPointNumberRef.current(pn);
        return respond(message, true, { accepted: true, pointNumber: pt.pointNumber, description: pt.description ?? '' });
      } catch (e) {
        return respond(message, false, undefined, e instanceof Error ? e.message : String(e));
      }
    });

    const unsubList = interAgentComm.onCommand('gps_list_stakeout_points', async (message) => {
      const payload = (message.data ?? {}) as { listId?: string; byDescription?: string };
      let src = gpsPointsRef.current;
      if (payload.listId && payload.listId !== 'all') {
        const list = pointLists.find(l => l.id === payload.listId);
        src = list ? list.points : [];
      }
      if (payload.byDescription) {
        const needle = payload.byDescription.toLowerCase();
        src = src.filter(p => (p.description ?? '').toLowerCase().includes(needle));
      }
      const out = src.map(p => ({
        pointNumber: p.pointNumber,
        description: p.description ?? '',
        northing:    p.northing,
        easting:     p.easting,
        elevation:   p.elevation,
      }));
      return respond(message, true, { points: out, totalCount: out.length });
    });

    const unsubReq = interAgentComm.onCommand('gps_request_collect_point_number', async (message) => {
      const payload = (message.data ?? {}) as { count?: number };
      const count = Math.max(1, Math.floor(payload.count ?? 1));
      try {
        // Pass-through to Point Editor's request_next_point_number. If Point
        // Editor hasn't yet wired its handler, fall back to the local
        // nextAvailablePointNumber so collect still works.
        const peer = await interAgentComm.askPeer(
          AgentType.POINT_EDITOR,
          'request_next_point_number',
          { count },
          { timeoutMs: 5000 }
        ).catch(() => null);
        if (peer?.success && peer.data && Array.isArray((peer.data as { numbers?: unknown[] }).numbers)) {
          return respond(message, true, { numbers: (peer.data as { numbers: string[] }).numbers });
        }
        // Fallback � generate sequential PNs starting at nextAvailablePointNumber
        const base = parseInt(nextAvailablePointNumber, 10);
        if (!Number.isFinite(base)) {
          return respond(message, false, undefined, 'Could not derive next point number.');
        }
        const numbers = Array.from({ length: count }, (_, i) => String(base + i));
        return respond(message, true, { numbers });
      } catch (e) {
        return respond(message, false, undefined, e instanceof Error ? e.message : String(e));
      }
    });

    return () => { unsubPos(); unsubGetTarget(); unsubSetTarget(); unsubList(); unsubReq(); };
  }, [pointLists, nextAvailablePointNumber]);

  const handleOpenShrinkwrapFromCanvas = useCallback(() => {
    const usable = pointLists
      .flatMap(list => list.isVisible ? list.points : [])
      .filter(point => Number.isFinite(point.northing) && Number.isFinite(point.easting));

    if (usable.length < 3) {
      setError(`Shrinkwrap needs at least 3 visible points with coordinates (have ${usable.length}).`);
      return;
    }

    const hull = computeConvexHullPoints(usable);
    if (hull.length < 3) {
      setError('Shrinkwrap could not form a boundary because the visible points are colinear.');
      return;
    }

    const layer = 'L-SURV-SHRINKWRAP';
    const existing = shrinkwrapRef.current;
    const reuseExisting = !!existing && existing.layer === layer;
    const polylineId = reuseExisting
      ? existing!.polylineId
      : `shrinkwrap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (!reuseExisting) {
      setLines(prev => prev.filter(line =>
        !(line.layer === layer && (line.polylineId || '').startsWith('shrinkwrap_'))
      ));
    }

    setShrinkwrap({
      sourcePns: usable.map(point => point.pointNumber),
      excludedPns: [],
      pendingExcludedPns: [],
      concavityK: 15,
      cuts: [],
      cutMode: false,
      cutStartPn: null,
      layer,
      isCommitted: false,
      polylineId,
    });
    setIsShrinkwrapPanelVisible(true);
    setIsShrinkwrapPanelMinimized(false);
    logActionToFieldbook(`Shrinkwrap preview opened from canvas with ${usable.length} visible source points.`);
  }, [logActionToFieldbook, pointLists]);

  // CACP � COGO Agent skills. Owns `cogo_inverse` (bearing/distance between two
  // points) and `cogo_shrinkwrap` (2D convex hull around a point set, drawn as
  // a closed polyline on layer "L-SURV-SHRINKWRAP"). Any peer agent � or the
  // COGO chat itself via askPeer � can invoke these without UI context-switching.
  useEffect(() => {
    const respondCogo = (message: AgentMessage, success: boolean, data?: Record<string, unknown>, error?: string): AgentMessage => ({
      requestId: message.id,
      from: AgentType.COGO_AGENT,
      success,
      data,
      error,
      timestamp: Date.now(),
    });

    const unsubInverse = interAgentComm.onCommand('cogo_inverse', async (message) => {
      const d = (message.data ?? {}) as { fromPointNumber?: string; toPointNumber?: string };
      const fromPn = (d.fromPointNumber || '').trim();
      const toPn = (d.toPointNumber || '').trim();
      if (!fromPn || !toPn) return respondCogo(message, false, undefined, 'fromPointNumber and toPointNumber are required.');
      const all = pointListsRef.current.flatMap(l => l.points);
      const p1 = all.find(p => p.pointNumber === fromPn);
      const p2 = all.find(p => p.pointNumber === toPn);
      if (!p1) return respondCogo(message, false, undefined, `Point ${fromPn} not found.`);
      if (!p2) return respondCogo(message, false, undefined, `Point ${toPn} not found.`);
      const inv = inverse({ northing: p1.northing, easting: p1.easting }, { northing: p2.northing, easting: p2.easting });
      return respondCogo(message, true, { distance: inv.distance, bearing: formatBearing(inv.bearing) });
    });

    const unsubShrinkwrap = interAgentComm.onCommand('cogo_shrinkwrap', async (message) => {
      const d = (message.data ?? {}) as { pointNumbers?: string[]; layer?: string; replace?: boolean };
      const layer = (d.layer && d.layer.trim()) || 'L-SURV-SHRINKWRAP';
      // Schema default is true: "removes any existing shrinkwrap on the target
      // layer before drawing the new one". Only an explicit `replace:false`
      // opts into stacking a second, independent hull.
      const replace = d.replace !== false;

      // Resolve candidate points: explicit subset if provided, else every point
      // on every currently visible list (matches what the user sees on canvas).
      const lists = pointListsRef.current;
      const allVisible = lists.flatMap(l => l.isVisible ? l.points : []);
      let candidates = allVisible;
      let skipped = 0;
      if (Array.isArray(d.pointNumbers) && d.pointNumbers.length > 0) {
        const wanted = new Set(d.pointNumbers.map(s => String(s)));
        const all = lists.flatMap(l => l.points);
        candidates = all.filter(p => wanted.has(p.pointNumber));
        skipped = d.pointNumbers.length - candidates.length;
      }
      const usable = candidates.filter(p => Number.isFinite(p.northing) && Number.isFinite(p.easting));
      skipped += candidates.length - usable.length;

      if (usable.length < 3) {
        return respondCogo(message, false, undefined, `Need at least 3 points with coordinates to build a hull (have ${usable.length}).`);
      }

      const sourcePns = usable.map(p => p.pointNumber);
      const hull = computeConvexHullPoints(usable);
      if (hull.length < 3) {
        return respondCogo(message, false, undefined, 'Convex hull degenerated to <3 vertices (points may be colinear).');
      }

      // Be aware of an already-present shrinkwrap. When replacing (the default)
      // and a session is already active on the same target layer, REFRESH it in
      // place by reusing its polylineId � this avoids stacking a second
      // overlapping hull and a duplicate "Shrinkwrap N" boundary entry every
      // time the user re-runs the command. A unique id is minted only for a
      // genuinely new session (replace:false, or a different target layer).
      const existing = shrinkwrapRef.current;
      const reuseExisting = replace && !!existing && existing.layer === layer;
      const polylineId = reuseExisting
        ? existing!.polylineId
        : `shrinkwrap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Replacing without reuse (e.g. a stale hull lingering on this layer from a
      // reload, or a switch to a fresh layer): strip any prior shrinkwrap lines
      // on the target layer so we never leave an orphaned hull behind.
      if (replace && !reuseExisting) {
        setLines(prev => prev.filter(l =>
          !(l.layer === layer && (l.polylineId || '').startsWith('shrinkwrap_'))
        ));
      }

      setShrinkwrap({ sourcePns, excludedPns: [], pendingExcludedPns: [], concavityK: 15, cuts: [], cutMode: false, cutStartPn: null, layer, isCommitted: true, polylineId });
      setIsShrinkwrapPanelVisible(true);
      // Always un-minimize on (re)open � a stale minimized flag from a prior
      // session would otherwise reopen the panel as a collapsed chip, making it
      // look like "the tool didn't appear".
      setIsShrinkwrapPanelMinimized(false);
      // Auto-open the Inclusion Boundaries manager so the user can name/store/show-hide.
      setIsInclusionBoundariesPanelVisible(true);

      const hullPns = hull.map(h => h.pointNumber);
      hullPns.push(hullPns[0]);

      logActionToFieldbook(
        `COGO shrinkwrap � ${hull.length}-vertex hull ${reuseExisting ? 'refreshed' : 'queued'} on ${layer} ` +
        `(${sourcePns.length} source points).`,
      );

      return respondCogo(message, true, {
        hullPointNumbers: hullPns,
        addedLines: hull.length,
        layer,
        skippedCount: skipped,
        polylineId,
        replaced: reuseExisting,
      });
    });

    return () => { unsubInverse(); unsubShrinkwrap(); };
  }, [logActionToFieldbook]);

  // CACP � Extended COGO skill suite (forward, intersections, curves, traverse,
  // area, transforms, geodetic, subdivide, offset, self-test). All handlers
  // live in services/cogoSkillHandlers.ts; schemas in services/cogoSkillSchemas.ts.
  useCogoExtendedSkills({ pointListsRef, logActionToFieldbook });

  // Recompute the shrinkwrap polyline whenever the session, the source points,
  // or the exclusion list changes. Output lines are typed 'inclusion' with no
  // bearing/distance so the canvas does not render B&D labels on the hull.
  //
  // v26.05.26.4 � Pool widened from `sourcePns` (whatever COGO was originally
  // handed) to ALL currently-visible points. Without this, when CIVIL_DRAFTER
  // hands COGO just the hull vertices and the user excludes one, the hull
  // recomputes from N-1 points that are ALL still on the hull ? it just
  // contracts with a straight chord across the gap. Using the full visible
  // pool lets interior points "promote" to fill the void, matching surveyor
  // mental model of "detour inward around the removed point".
  useEffect(() => {
    if (!shrinkwrap) return;
    const { sourcePns, excludedPns, layer, polylineId, concavityK, cuts } = shrinkwrap;
    const excludeSet = new Set(excludedPns);
    // Build candidate pool: union of original sourcePns and every currently-
    // visible point. Original sourcePns is preserved so an intentional subset
    // request is honored when nothing else is visible; visible points are
    // unioned in so vertex removal has interior candidates to promote.
    const visiblePool = new Map<string, SurveyPoint>();
    for (const l of pointListsRef.current) {
      if (!l.isVisible) continue;
      for (const p of l.points) visiblePool.set(p.pointNumber, p);
    }
    // Always include the original sourcePns even if their list was toggled off.
    const allMap = new Map<string, SurveyPoint>();
    for (const l of pointListsRef.current) for (const p of l.points) allMap.set(p.pointNumber, p);
    for (const pn of sourcePns) {
      const p = allMap.get(pn);
      if (p) visiblePool.set(pn, p);
    }
    const usable: SurveyPoint[] = [];
    for (const p of visiblePool.values()) {
      if (excludeSet.has(p.pointNumber)) continue;
      if (Number.isFinite(p.northing) && Number.isFinite(p.easting)) usable.push(p);
    }
    // Apply construction-line cuts: for each cut chord (a,b), classify pool
    // points by sign of the cross product against the cut line; auto-exclude
    // the smaller-area side (or the larger if cut.flipped). Endpoint points
    // themselves are kept so the cut becomes a forced edge of the new hull.
    // The chord itself is NOT drawn � it's a pure construction aid that lives
    // only as an entry in shrinkwrap.cuts (see the panel for the list).
    if (cuts && cuts.length > 0) {
      for (let ci = 0; ci < cuts.length; ci++) {
        const c = cuts[ci];
        const a = allMap.get(c.a);
        const b = allMap.get(c.b);
        if (!a || !b) continue;
        const dx = b.easting - a.easting;
        const dy = b.northing - a.northing;
        const sidePos: SurveyPoint[] = [];
        const sideNeg: SurveyPoint[] = [];
        for (const p of usable) {
          if (p.pointNumber === c.a || p.pointNumber === c.b) continue;
          const s = dx * (p.northing - a.northing) - dy * (p.easting - a.easting);
          if (s > 1e-6) sidePos.push(p);
          else if (s < -1e-6) sideNeg.push(p);
        }
        // Default = amputate minority side; flipped = amputate majority.
        const amputate = c.flipped
          ? (sidePos.length >= sideNeg.length ? sidePos : sideNeg)
          : (sidePos.length <  sideNeg.length ? sidePos : sideNeg);
        for (const p of amputate) excludeSet.add(p.pointNumber);
      }
      // Re-derive `usable` now that cuts have widened the exclusion set.
      for (let i = usable.length - 1; i >= 0; i--) {
        if (excludeSet.has(usable[i].pointNumber)) usable.splice(i, 1);
      }
    }
    if (usable.length < 3) {
      // Not enough left to form a hull � strip any prior polyline in this group.
      setLines(prev => prev.filter(l => l.polylineId !== polylineId));
      return;
    }
    // Concave hull (edge-crawling) � controllable via concavityK.
    // Falls back internally to convex hull if the walker can't close.
    const k = Math.max(3, Math.min(concavityK ?? 15, usable.length - 1));
    const hull = computeConcaveHullPoints(usable, k);
    if (hull.length < 3) {
      setLines(prev => prev.filter(l => l.polylineId !== polylineId));
      return;
    }
    const newLines: SurveyLine[] = [];
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      newLines.push({
        id: `${polylineId}_${i}`,
        from: a.pointNumber,
        to:   b.pointNumber,
        type: shrinkwrap.isCommitted ? 'inclusion' : 'shrinkwrap-preview',
        fromPt: { x: a.easting, y: a.northing, z: a.elevation ?? 0 },
        toPt:   { x: b.easting, y: b.northing, z: b.elevation ?? 0 },
        layer,
        lineType: 'CONTINUOUS',
        polylineId,
      });
    }
    setLines(prev => {
      // Preserve hidden state across recomputation � if the boundary was
      // hidden via the manager before exclusion changes, keep it hidden.
      const wasHidden = prev.some(l => l.polylineId === polylineId && l.hidden);
      const final = wasHidden ? newLines.map(l => ({ ...l, hidden: true })) : newLines;
      // Strip prior hull lines AND any stale cut-chord lines from previous
      // sessions (they should never persist, but be defensive in case the
      // app was loaded from a save that has them).
      const cutPidPrefix = `${polylineId}_cut_`;
      return [
        ...prev.filter(l => l.polylineId !== polylineId && !(l.polylineId || '').startsWith(cutPidPrefix)),
        ...final,
      ];
    });
  }, [shrinkwrap]);

  // Auto-register Inclusion Boundaries from any inclusion lines that carry a
  // polylineId. Each unique polylineId becomes one InclusionBoundary entry �
  // shrinkwraps get a default "Shrinkwrap N" name, other inclusion groups get
  // "Inclusion N". Existing user-renamed boundaries are preserved on re-scan;
  // boundaries whose polylineId no longer has any inclusion line are dropped.
  useEffect(() => {
    const inclusionByPid = new Map<string, number>();
    for (const l of lines) {
      if (l.type !== 'inclusion' || !l.polylineId) continue;
      inclusionByPid.set(l.polylineId, (inclusionByPid.get(l.polylineId) || 0) + 1);
    }
    setInclusionBoundaries(prev => {
      const kept = prev.filter(b => inclusionByPid.has(b.polylineId));
      const knownPids = new Set(kept.map(b => b.polylineId));
      const additions: InclusionBoundary[] = [];
      let shrinkN = kept.filter(b => b.polylineId.startsWith('shrinkwrap_')).length;
      let incN    = kept.filter(b => !b.polylineId.startsWith('shrinkwrap_')).length;
      for (const pid of inclusionByPid.keys()) {
        if (knownPids.has(pid)) continue;
        if (pid.startsWith('shrinkwrap_')) {
          shrinkN += 1;
          additions.push({ id: pid, polylineId: pid, name: `Shrinkwrap ${shrinkN}` });
        } else {
          incN += 1;
          additions.push({ id: pid, polylineId: pid, name: `Inclusion ${incN}` });
        }
      }
      if (kept.length === prev.length && additions.length === 0) return prev;
      return [...kept, ...additions];
    });
  }, [lines]);

  // Keep activeInclusionBoundaryId valid � if the user deletes the active
  // boundary (or it auto-drops because all its lines were removed), unset it.
  useEffect(() => {
    if (activeInclusionBoundaryId && !inclusionBoundaries.some(b => b.id === activeInclusionBoundaryId)) {
      setActiveInclusionBoundaryId(null);
    }
  }, [inclusionBoundaries, activeInclusionBoundaryId]);

  // CACP � Project Knowledge Base skill. Any agent can ask the KB for facts
  // via askPeer('kb_query', {category?, subject?, predicate?, query?}).
  // This is the central "super brain" lookup that ties together everything
  // every other agent has learned this session (deed ROW widths, zoning
  // setbacks, parcel ids, monuments, etc.) so an agent doesn't have to
  // re-fetch or re-parse to use it.
  useEffect(() => {
    const unsubKb = interAgentComm.onCommand('kb_query', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      try {
        let facts;
        if (typeof d.query === 'string' && d.query) {
          facts = knowledgeBase.search(d.query as string, Number(d.limit) || 20);
        } else {
          facts = knowledgeBase.queryFacts({
            category: d.category as any,
            subject: d.subject as string,
            predicate: d.predicate as string,
            source: d.source as any,
            minConfidence: d.minConfidence as number,
            limit: Number(d.limit) || 20,
          });
        }
        return {
          requestId: message.id,
          from: AgentType.LSVZ_AGENT,
          success: true,
          data: { facts, count: facts.length },
          timestamp: Date.now(),
        };
      } catch (e) {
        return {
          requestId: message.id,
          from: AgentType.LSVZ_AGENT,
          success: false,
          error: String(e),
          timestamp: Date.now(),
        };
      }
    });
    const unsubKbRecord = interAgentComm.onCommand('kb_record', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      try {
        if (Array.isArray(d.facts)) {
          const n = knowledgeBase.recordFacts(d.facts as any);
          return { requestId: message.id, from: AgentType.LSVZ_AGENT, success: true, data: { recorded: n }, timestamp: Date.now() };
        }
        const f = knowledgeBase.recordFact(d as any);
        return { requestId: message.id, from: AgentType.LSVZ_AGENT, success: true, data: { fact: f }, timestamp: Date.now() };
      } catch (e) {
        return { requestId: message.id, from: AgentType.LSVZ_AGENT, success: false, error: String(e), timestamp: Date.now() };
      }
    });
    return () => { unsubKb(); unsubKbRecord(); };
  }, []);

  const handleStartGpsStakeoutSession = useCallback(() => {
    initializeGpsStakeoutAgent();
    setActiveAgent(AgentType.GPS_STAKEOUT);
    showView('gpsstakeout');
  }, [initializeGpsStakeoutAgent, showView]);

  // FIX: Add handler for generating contours from the new ContourPanel.
  const handleGenerateContours = useCallback(() => {
    setIsGeneratingContours(true);
    setError(null);
    try {
        let pointsToContour = points;
        const ignoredSet = new Set(contourSettings.ignoredPointNumbers ?? []);
        const ignoredCount = ignoredSet.size > 0 ? points.filter(p => ignoredSet.has(p.pointNumber)).length : 0;
        if (ignoredSet.size > 0) {
            pointsToContour = pointsToContour.filter(p => !ignoredSet.has(p.pointNumber));
        }
        const filter = contourSettings.pointFilterDescription.trim().toUpperCase();
        if (filter) {
            pointsToContour = pointsToContour.filter(p => p.description?.toUpperCase().includes(filter));
            logActionToFieldbook(`Generating ${contourSettings.contourInterval}' contours with smoothing level ${contourSettings.smoothing}, using ${pointsToContour.length} points matching "${contourSettings.pointFilterDescription}"${ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''}.`);
        } else {
            logActionToFieldbook(`Generating ${contourSettings.contourInterval}' contours with smoothing level ${contourSettings.smoothing}, using ${pointsToContour.length} points${ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''}.`);
        }

        if (pointsToContour.length < 3) {
            throw new Error("Not enough points to generate contours. At least 3 points are required.");
        }

        const breaklines = lines.filter(l => l.type === 'breakline');
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter(l => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        const exclusionLines = lines.filter(l => l.type === 'exclusion');

        // Generate as IsoPaths (mathematical representation) for the new ContourGeneration system.
        const { isoPaths, labels: newLabels, elevationReport } = generateContoursAsIsoPaths(
            pointsToContour,
            contourSettings.contourInterval,
            contourSettings.majorInterval,
            contourSettings.smoothing,
            contourSettings.showLabels,
            contourSettings.labelDensity,
            breaklines,
            inclusionLines,
            exclusionLines,
            {
                mode: contourSettings.elevationFilterMode ?? 'auto',
                minElevation: contourSettings.minElevation ?? null,
                maxElevation: contourSettings.maxElevation ?? null,
            }
        );

        const excludedPointCount = elevationReport.missingElevation + elevationReport.outOfRange;
        if (excludedPointCount > 0) {
            const parts: string[] = [];
            if (elevationReport.missingElevation > 0) parts.push(`${elevationReport.missingElevation} with no elevation`);
            if (elevationReport.outOfRange > 0) parts.push(`${elevationReport.outOfRange} out-of-range`);
            logActionToFieldbook(`Excluded ${excludedPointCount} point(s) from contouring (${parts.join(', ')}). Contoured range ${elevationReport.acceptedMin?.toFixed(2)}' to ${elevationReport.acceptedMax?.toFixed(2)}'.`);
        } else if (elevationReport.suppressed) {
            logActionToFieldbook(`Warning: some elevations look detached from the surface but were kept because excluding them would drop too many points. Review the survey for elevation blunders.`);
        }

        const now = new Date().toISOString();
        const existingGens = contourGenerationsRef.current;
        const genName = `Survey ${contourSettings.contourInterval}ft (Gen ${existingGens.length + 1})`;
        const genId = `gen-${Date.now()}`;

        const newGeneration: ContourGeneration = {
            id: genId,
            name: genName,
            createdAt: now,
            lastGeneratedAt: now,
            settings: { ...contourSettings },
            activeInclusionBoundaryId: activeInclusionBoundaryRef.current?.id ?? null,
            pointCount: pointsToContour.length,
            excludedPointCount,
            elevationRange: elevationReport.acceptedMin !== null && elevationReport.acceptedMax !== null
                ? { min: elevationReport.acceptedMin, max: elevationReport.acceptedMax }
                : null,
            elevationFilterSuppressed: elevationReport.suppressed,
            isoPaths,
            labels: newLabels,
            visible: true,
        };

        // Convert IsoPaths to SurveyLine segments tagged with contourGenId.
        const contourLines = isoPathsToSurveyLines(isoPaths, genId);

        setLines(prevLines => {
            // Keep non-contour lines and lines from OTHER generations; replace this generation's lines.
            const existingLines = prevLines.filter(l => !l.type?.startsWith('contour') || (l.contourGenId && l.contourGenId !== genId));
            return [...existingLines, ...contourLines];
        });
        setContourLabels(newLabels);
        setContourGenerations(prev => [...prev, newGeneration]);
        setIsContourManagementVisible(true);

        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Contour Generation Error: ${errorMessage}`);
        setTimeout(() => setError(null), 5000);
    } finally {
        setIsGeneratingContours(false);
    }
  }, [points, lines, contourSettings, logActionToFieldbook, showView]);

  // -- ContourGeneration management callbacks (v26.05.19.3) ------------------
  const handleContourGenToggleVisible = useCallback((id: string, visible: boolean) => {
    setContourGenerations(prev => prev.map(g => {
      if (g.id !== id) return g;
      const updated = { ...g, visible };
      // Sync lines: insert or remove this generation's segments.
      setLines(pl => {
        const without = pl.filter(l => l.contourGenId !== id);
        if (!visible) return without;
        return [...without, ...isoPathsToSurveyLines(g.isoPaths, id)];
      });
      return updated;
    }));
  }, []);

  const handleContourGenRename = useCallback((id: string, name: string) => {
    setContourGenerations(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }, []);

  const handleContourGenSetColor = useCallback((id: string, color: string | undefined) => {
    setContourGenerations(prev => prev.map(g => g.id === id ? { ...g, color } : g));
  }, []);

  const handleContourGenSetOpacity = useCallback((id: string, opacity: number) => {
    setContourGenerations(prev => prev.map(g => g.id === id ? { ...g, opacity } : g));
  }, []);

  const handleContourGenToggleBlend = useCallback((id: string, enabled: boolean) => {
    const currentLines = linesRef.current;
    setContourGenerations(prev => prev.map(g => {
      if (g.id !== id) return g;
      const updated = { ...g, esriBlendEnabled: enabled };
      // Apply or remove ESRI suppression for this blend polygon.
      if (enabled && g.esriBlendInclusionPolylineId) {
        const segs = getSegPairs(currentLines.filter(l => l.type === 'inclusion' && l.polylineId === g.esriBlendInclusionPolylineId));
        if (segs.length >= 3) {
          const poly = buildPolygonFromSegments(segs);
          if (poly.length >= 3) {
            setLines(pl => suppressEsriContoursInsidePolygon(pl, poly));
          }
        }
      } else if (!enabled) {
        // Restore hidden ESRI lines for this polygon.
        setLines(pl => pl.map(l => {
          if ((l.layer === 'ESRI-CONTOUR' || l.source === 'esri') && l.hidden) {
            return { ...l, hidden: false };
          }
          return l;
        }));
      }
      return updated;
    }));
  }, []);

  const handleContourGenSetBlendPolylineId = useCallback((id: string, polylineId: string | null) => {
    const currentLines = linesRef.current;
    setContourGenerations(prev => prev.map(g => {
      if (g.id !== id) return g;
      const updated = { ...g, esriBlendInclusionPolylineId: polylineId };
      if (g.esriBlendEnabled && polylineId) {
        const segs = getSegPairs(currentLines.filter(l => l.type === 'inclusion' && l.polylineId === polylineId));
        if (segs.length >= 3) {
          const poly = buildPolygonFromSegments(segs);
          if (poly.length >= 3) {
            setLines(pl => suppressEsriContoursInsidePolygon(pl, poly));
          }
        }
      }
      return updated;
    }));
  }, []);

  const handleContourGenDelete = useCallback((id: string) => {
    setContourGenerations(prev => prev.filter(g => g.id !== id));
    setLines(pl => pl.filter(l => l.contourGenId !== id));
  }, []);

  // Build a deterministic in-session TIN from current survey points so both
  // Auto Draft and Steep Slope tools operate on the same source surface.
  const steepSlopeTinSurfaces = useMemo<TinSurface[]>(() => {
    const tin = buildTinFromPoints(points, { name: 'Survey Points TIN' });
    if (!tin) return [];
    return [{
      ...tin,
      id: 'tin-autodraft-survey-points',
      name: 'Survey Points TIN',
      hidden: isAutoDraftTinHidden,
    }];
  }, [points, isAutoDraftTinHidden]);

  const steepSlopeSegmentCount = useMemo(
    () => lines.filter(l => l.type === 'steep-slope').length,
    [lines],
  );

  const handleRunSteepSlopeFromPanel = useCallback((
    tinId: string,
    minComponentLinearSpan: number,
    bands: SteepSlopeBand[],
    includeBoundaryId: string | null,
  ): SteepSlopeRunResult | null => {
    const tin = steepSlopeTinSurfaces.find(t => t.id === tinId);
    if (!tin) {
      setError('Steep Slope: selected TIN surface is unavailable.');
      return null;
    }

    try {
      const run = runSteepSlopeAnalysis(tin, {
        sourceTinId: tin.id,
        minComponentLinearSpan,
        minComponentVerticalSpan: minComponentLinearSpan,
        bands,
        includeBoundaryId,
      });
      const ssLines = steepSlopeRunToSurveyLines(tin, run);
      setSteepSlopeRuns(prev => [...prev, run]);
      setLines(prev => [
        ...prev.filter(l => l.type !== 'steep-slope'),
        ...ssLines,
      ]);
      setLinesVisible(true);
      logActionToFieldbook(
        `Steep Slope run ${run.id}: ${run.keptTriangleCount}/${run.analyzedTriangleCount} triangles kept.`
      );
      return run;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Steep Slope Error: ${msg}`);
      return null;
    }
  }, [steepSlopeTinSurfaces, setSteepSlopeRuns, setLines, setLinesVisible, logActionToFieldbook]);

  const handleToggleSteepSlopeGeometryVisibility = useCallback(() => {
    setLines(prev => {
      const anyVisible = prev.some(l => l.type === 'steep-slope' && !l.hidden);
      return prev.map(l => l.type === 'steep-slope' ? { ...l, hidden: anyVisible ? true : undefined } : l);
    });
  }, [setLines]);

  const handleToggleSteepSlopeTinSurfaceVisibility = useCallback((tinId: string) => {
    if (tinId === 'tin-autodraft-survey-points') {
      setIsAutoDraftTinHidden(v => !v);
    }
  }, []);

  const handleClearSteepSlopeGeometry = useCallback(() => {
    setLines(prev => prev.filter(l => l.type !== 'steep-slope'));
  }, [setLines]);

  const handleOpenSteepSlopeReport = useCallback(() => {
    showView('steepslopereport');
  }, [showView]);

  const handleDiscoverPublicContourServices = useCallback(async (searchTerm: string) => {
    setIsDiscoveringContourServices(true);
    setDiscoveredContourServices([]);
    try {
      // Framework: in a future iteration this will call an AI service or GIS hub API.
      // For now, return a placeholder so the UI skeleton is wired end-to-end.
      const placeholder: EsriServiceInfo[] = [
        {
          name: `Public contour services for "${searchTerm}" (discovery not yet implemented)`,
          url: '',
          region: searchTerm,
          description: 'Connect an AI discovery backend to populate real results here.',
          dataType: 'contours',
        },
      ];
      setDiscoveredContourServices(placeholder);
    } finally {
      setIsDiscoveringContourServices(false);
    }
  }, []);

  /** Fire-and-forget POST to backend debug log � appears in Cloud Logging.
   *  Read via: gcloud logging read "textPayload:[DEBUG-ESRI]" --limit=50
   */
  const dbgLog = useCallback((tag: string, data: object) => {
    fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, data }),
    }).catch(() => { /* non-critical */ });
    // Also log to browser console for DevTools
    console.debug(`[DEBUG-${tag}]`, data);
  }, []);

  /**
   * Translate an ArcGIS REST error (from the service-info probe or a /query
   * response) into a clear, actionable message. The raw upstream text is
   * often something like "Service PAMAP_Contours/MapServer not started"
   * which is technically accurate but leaves the operator wondering whether
   * it's a bug in landsurv.ai. This helper adds context so the user knows
   * it's an upstream outage and what to try next.
   */
  const translateEsriUpstreamError = useCallback((
    input: { arcgisError?: { code?: number | string; message?: string; details?: string[] }; httpStatus?: number; httpStatusText?: string },
    serviceUrl: string
  ): string => {
    const rawMessage = input.arcgisError?.message?.trim() || '';
    const code = input.arcgisError?.code;
    const httpStatus = input.httpStatus;
    const serviceName = (() => {
      try {
        const url = new URL(serviceUrl);
        return url.pathname.replace(/\/(MapServer|FeatureServer)(\/\d+)?\/?$/i, '').split('/').pop() || serviceUrl;
      } catch { return serviceUrl; }
    })();

    // Upstream server is up but the specific service has been stopped by the
    // publisher. Very common with academic/state hosting (PASDA restarts
    // services under load).
    if (/not started/i.test(rawMessage)) {
      return (
        `Source service is offline (upstream reported "${rawMessage}").\n\n` +
        `The "${serviceName}" service at the publisher's ArcGIS server has been stopped. ` +
        `This is a server-side outage, not a bug in landsurv.ai. Try again in a few minutes, ` +
        `or add a different contour source via the Custom Service URL box.`
      );
    }
    if (/not authorized|token required|401|invalid token/i.test(rawMessage)) {
      return (
        `Source service refused the request (upstream reported "${rawMessage}").\n\n` +
        `The "${serviceName}" service requires authentication that landsurv.ai does not have. ` +
        `Use a different contour source via the Custom Service URL box.`
      );
    }
    if (code === 404 || httpStatus === 404 || /not found/i.test(rawMessage)) {
      return (
        `Source service was not found at that URL.\n\n` +
        `Check the pinned or custom Service URL � the publisher may have moved or renamed the "${serviceName}" service.`
      );
    }
    if (httpStatus && httpStatus >= 500) {
      return (
        `Source server error ${httpStatus} ${input.httpStatusText || ''}.\n\n` +
        `The publisher's ArcGIS server had a problem serving "${serviceName}". Try again shortly, ` +
        `or switch to a different contour source via the Custom Service URL box.`
      );
    }
    if (rawMessage) {
      return `Service error ${code ?? ''}: ${rawMessage}`.trim();
    }
    return `Service request failed: ${httpStatus ?? '?'} ${input.httpStatusText || ''}`.trim();
  }, []);

  /**
   * Fetch contours from a pinned ESRI REST Feature/Map Service layer.
   * Mode 'inclusion': builds a bbox from drawn inclusion lines ? queries service.
   * Mode 'description': geocodes the text via Nominatim then queries service.
   */
  const handleFetchEsriContours = useCallback(async (
    serviceUrl: string,
    mode: 'inclusion' | 'description',
    descriptionText?: string
  ) => {
    setIsFetchingEsri(true);
    setError(null);
    try {
      const epsg = settings.projection?.epsg;

      // -- 1. Determine bbox --------------------------------------------------
      let xmin: number, ymin: number, xmax: number, ymax: number;
      let inSR: number;
      // Inclusion polygon (project coords) used to trim returned contours to the
      // actual boundary shape rather than just its bounding rectangle.
      let inclusionPolygon: { x: number; y: number }[] | null = null;

      dbgLog('ESRI', { step: '1-start', serviceUrl, mode, descriptionText, epsg });

      if (mode === 'inclusion') {
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter(l => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        if (inclusionLines.length === 0) {
          throw new Error(activeB ? `Active inclusion boundary "${activeB.name}" has no lines.` : 'No inclusion lines drawn. Use the canvas Inclusion tool to draw a boundary first.');
        }
        // Build point lookup from all flat survey points
        const pointMap = new Map(points.map((p: { pointNumber: string; easting: number; northing: number }) => [p.pointNumber, p]));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let found = false;
        const inclSegPairs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        for (const line of inclusionLines) {
          const coords = [
            line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } :
              pointMap.get(line.from) ? { x: (pointMap.get(line.from) as { easting: number; northing: number }).easting, y: (pointMap.get(line.from) as { easting: number; northing: number }).northing } : null,
            line.toPt ? { x: line.toPt.x, y: line.toPt.y } :
              pointMap.get(line.to) ? { x: (pointMap.get(line.to) as { easting: number; northing: number }).easting, y: (pointMap.get(line.to) as { easting: number; northing: number }).northing } : null,
          ];
          for (const c of coords) {
            if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); found = true; }
          }
          if (coords[0] && coords[1]) {
            inclSegPairs.push({ x1: coords[0].x, y1: coords[0].y, x2: coords[1].x, y2: coords[1].y });
          }
        }
        if (!found || !isFinite(x0)) throw new Error('Could not read coordinates from inclusion lines. Ensure points are placed on the canvas.');
        xmin = x0; ymin = y0; xmax = x1; ymax = y1;
        inSR = epsg || 4326;
        // Chain the inclusion segments into a closed ring for polygon trimming.
        const ring = inclSegPairs.length >= 3 ? buildPolygonFromSegments(inclSegPairs) : [];
        inclusionPolygon = ring.length >= 3 ? ring : null;
        dbgLog('ESRI', { step: '1-bbox-inclusion', xmin, ymin, xmax, ymax, inSR, polygonVertices: inclusionPolygon?.length ?? 0 });
      } else {
        // Description mode: geocode via Nominatim (OpenStreetMap)
        const desc = (descriptionText || '').trim();
        if (!desc) throw new Error('Please enter an area description.');
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(desc)}&format=json&limit=1`;
        const geoResp = await fetch(geocodeUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'LandSurv.ai/1.0' } });
        if (!geoResp.ok) throw new Error(`Geocoding failed: ${geoResp.statusText}`);
        const geoData = await geoResp.json();
        if (!geoData || geoData.length === 0) throw new Error(`No location found for "${desc}". Try a more specific description.`);
        const hit = geoData[0];
        const bbox = hit.boundingbox; // [south, north, west, east] in WGS84
        let [south, north, west, east] = bbox.map(Number);
        // Nominatim sometimes returns a tiny bbox for point results (e.g. a node
        // rather than a polygon relation). Guarantee a minimum 0.1� span (~11 km)
        // using the result centroid so we always capture the surrounding area.
        const centerLat = parseFloat(hit.lat);
        const centerLon = parseFloat(hit.lon);
        const MIN_SPAN = 0.1; // degrees � sufficient for a township/small area query
        if ((north - south) < MIN_SPAN) { south = centerLat - MIN_SPAN / 2; north = centerLat + MIN_SPAN / 2; }
        if ((east - west) < MIN_SPAN)  { west  = centerLon - MIN_SPAN / 2; east  = centerLon + MIN_SPAN / 2; }
        // Always keep WGS84 from Nominatim for the service query.
        // Step 2 converts to the service's native SR; outSR requests
        // features back in the project coordinate system if epsg is set.
        xmin = west; ymin = south; xmax = east; ymax = north;
        inSR = 4326;
        dbgLog('ESRI', { step: '1-bbox-description', nominatimHit: hit.display_name, rawBbox: hit.boundingbox, xmin, ymin, xmax, ymax, inSR, epsg });

        // -- 1c. Clip description bbox to survey-points extent --------------
        // If the project already has survey points (and an EPSG), clamp the
        // query bbox to those points (plus a 20 % buffer).  This prevents the
        // ESRI service from hitting its transfer-limit on a large area (e.g. an
        // entire county) and returning features from only a random corner of it.
        if (epsg && points.length > 0) {
          try {
            const proj4mod = (await import('proj4')).default;
            const ptXmin = Math.min(...(points as Array<{ easting: number }>).map(p => p.easting));
            const ptYmin = Math.min(...(points as Array<{ northing: number }>).map(p => p.northing));
            const ptXmax = Math.max(...(points as Array<{ easting: number }>).map(p => p.easting));
            const ptYmax = Math.max(...(points as Array<{ northing: number }>).map(p => p.northing));
            const swWgs = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [ptXmin, ptYmin]) as [number, number];
            const neWgs = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [ptXmax, ptYmax]) as [number, number];
            // Only clip if the survey points actually fall inside the Nominatim bbox
            if (swWgs[0] >= xmin - 0.01 && neWgs[0] <= xmax + 0.01 &&
                swWgs[1] >= ymin - 0.01 && neWgs[1] <= ymax + 0.01) {
              const bufX = Math.max((neWgs[0] - swWgs[0]) * 0.2, 0.01);
              const bufY = Math.max((neWgs[1] - swWgs[1]) * 0.2, 0.01);
              xmin = swWgs[0] - bufX; xmax = neWgs[0] + bufX;
              ymin = swWgs[1] - bufY; ymax = neWgs[1] + bufY;
              dbgLog('ESRI', { step: '1c-bbox-clipped-to-points', xmin, ymin, xmax, ymax, pointCount: points.length });
            }
          } catch { /* proj4 unavailable � keep Nominatim bbox */ }
        }
      }

      // -- 1b. Normalize inclusion bbox to WGS84 -----------------------------
      // The inclusion mode bbox is in the project coordinate system (inSR=epsg).
      // Step 2 only converts coordinates when inSR===4326, so we convert here
      // first. Description mode is already WGS84 and skips this.
      if (mode === 'inclusion' && inSR !== 4326 && inSR) {
        try {
          const proj4mod = (await import('proj4')).default;
          const sw = proj4mod(`EPSG:${inSR}`, 'EPSG:4326', [xmin, ymin]);
          const ne = proj4mod(`EPSG:${inSR}`, 'EPSG:4326', [xmax, ymax]);
          xmin = sw[0]; ymin = sw[1]; xmax = ne[0]; ymax = ne[1];
          inSR = 4326;
          dbgLog('ESRI', { step: '1b-inclusion-to-wgs84', originalEpsg: epsg, xmin, ymin, xmax, ymax });
        } catch (e) {
          dbgLog('ESRI', { step: '1b-inclusion-to-wgs84-error', error: String(e) });
          /* keep project coords � query will still run, may return 0 features */
        }
      }

      // -- 2. Query ESRI REST service -----------------------------------------
      // First, fetch service metadata to get its native spatial reference so we
      // can convert the bbox into the service's own coordinate system rather than
      // relying on the server to reproject WGS84 input (many older ArcGIS Server
      // instances silently return 0 features when both inSR and outSR differ from
      // their native SR).
      let queryXmin = xmin, queryYmin = ymin, queryXmax = xmax, queryYmax = ymax;
      let queryInSR = inSR;
      let queryOutSR = epsg || inSR;

      // Preflight: probe the service metadata. Cheaper than the query endpoint
      // and lets us surface upstream outages ("Service ... not started", auth
      // failures, wrong URL) with a clear, actionable message instead of the
      // opaque relayed 500 that shows up later on /query.
      let svcInfo: any = null;
      try {
        const svcInfoResp = await fetch(`${serviceUrl}?f=json`);
        if (!svcInfoResp.ok) {
          throw new Error(translateEsriUpstreamError({ httpStatus: svcInfoResp.status, httpStatusText: svcInfoResp.statusText }, serviceUrl));
        }
        const svcInfoJson = await svcInfoResp.json();
        if (svcInfoJson?.error) {
          throw new Error(translateEsriUpstreamError({ arcgisError: svcInfoJson.error }, serviceUrl));
        }
        svcInfo = svcInfoJson;
      } catch (svcErr) {
        dbgLog('ESRI', { step: '2-preflight-error', error: String(svcErr) });
        throw svcErr;
      }

      if (inSR === 4326 && svcInfo) {
        // Layer endpoints (/MapServer/N) put spatialReference inside extent;
        // service-level endpoints (/MapServer) put it at the top level.
        const srObj = svcInfo?.spatialReference ?? svcInfo?.extent?.spatialReference;
        const nativeWkid: number | undefined = srObj?.latestWkid ?? srObj?.wkid;
        dbgLog('ESRI', { step: '2-svc-info', srObj, nativeWkid, svcInfoTopLevelKeys: Object.keys(svcInfo) });
        if (nativeWkid && nativeWkid !== 4326) {
          // Convert WGS84 bbox to the service's native SR
          try {
            const proj4mod = (await import('proj4')).default;
            const sw = proj4mod('EPSG:4326', `EPSG:${nativeWkid}`, [xmin, ymin]);
            const ne = proj4mod('EPSG:4326', `EPSG:${nativeWkid}`, [xmax, ymax]);
            queryXmin = sw[0]; queryYmin = sw[1]; queryXmax = ne[0]; queryYmax = ne[1];
            queryInSR = nativeWkid;
            // Always request output in the service's native SR so ArcGIS Server
            // will definitely support it. If the project uses a different EPSG we
            // convert each point client-side after parsing (see step 4).
            queryOutSR = nativeWkid;
            dbgLog('ESRI', { step: '2-converted', nativeWkid, queryXmin, queryYmin, queryXmax, queryYmax, queryInSR, queryOutSR, projectEpsg: epsg });
          } catch (proj4err) {
            dbgLog('ESRI', { step: '2-proj4-error', error: String(proj4err) });
            /* proj4 unavailable � keep WGS84 */
          }
        } else {
          dbgLog('ESRI', { step: '2-no-conversion', reason: nativeWkid ? 'nativeWkid is 4326' : 'nativeWkid undefined', nativeWkid });
        }
      }

      // -- 3. Query helper (single tile) --------------------------------------
      type EsriFeature = { geometry?: { paths?: number[][][] }; attributes?: Record<string, unknown> };
      const fetchTile = async (qXmin: number, qYmin: number, qXmax: number, qYmax: number) => {
        const tileParams = new URLSearchParams({
          where: '1=1',
          geometry: `${qXmin},${qYmin},${qXmax},${qYmax}`,
          geometryType: 'esriGeometryEnvelope',
          inSR: String(queryInSR),
          spatialRel: 'esriSpatialRelIntersects',
          outFields: '*',
          returnGeometry: 'true',
          outSR: String(queryOutSR),
          f: 'json',
        });
        const url = `${serviceUrl}/query?${tileParams.toString()}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(translateEsriUpstreamError({ httpStatus: r.status, httpStatusText: r.statusText }, serviceUrl));
        const d = await r.json();
        if (d.error) throw new Error(translateEsriUpstreamError({ arcgisError: d.error }, serviceUrl));
        return { features: (d.features ?? []) as EsriFeature[], exceeded: !!d.exceededTransferLimit, url };
      };

      const rootTile = await fetchTile(queryXmin, queryYmin, queryXmax, queryYmax);
      const queryUrl = rootTile.url;
      dbgLog('ESRI', { step: '3-query', queryUrl });
      dbgLog('ESRI', { step: '4-response', featureCount: rootTile.features.length, exceededTransferLimit: rootTile.exceeded });
      let features: EsriFeature[] = rootTile.features;
      let exceededTransferLimit = rootTile.exceeded;
      let tilesFetched = 1;
      let tilesSubdivided = 0;
      let userStoppedTiling = false;

      // -- 3b. Auto-tile if transfer limit hit --------------------------------
      if (rootTile.exceeded && typeof window !== 'undefined') {
        const proceed = window.confirm(
          'Transfer limit reached on the initial ESRI query � only a partial set of contours was returned.\n\n' +
          'Auto-tile this area into smaller pieces to capture full coverage?\n' +
          '(Multiple requests will be made � you will be prompted again every 8 tiles.)'
        );
        if (proceed) {
          // BFS subdivision: split the root bbox into quadrants and recurse on
          // any tile that still hits the transfer limit, bounded by a minimum
          // tile size (~1/64 of the original span) to prevent runaway depth.
          const rootW = queryXmax - queryXmin;
          const rootH = queryYmax - queryYmin;
          const MIN_W = rootW / 64;
          const MIN_H = rootH / 64;
          const queue: Array<[number, number, number, number]> = [];
          const splitInto4 = (a: number, b: number, c: number, d: number) => {
            const mx = (a + c) / 2, my = (b + d) / 2;
            queue.push([a, b, mx, my], [mx, b, c, my], [a, my, mx, d], [mx, my, c, d]);
          };
          // Discard the partial root result and start fresh from the four quadrants
          // (each tile re-queries its full sub-bbox so we don't lose coverage).
          features = [];
          exceededTransferLimit = false;
          splitInto4(queryXmin, queryYmin, queryXmax, queryYmax);

          const BATCH_PROMPT = 8;
          let sinceLastPrompt = 0;
          while (queue.length > 0) {
            if (sinceLastPrompt >= BATCH_PROMPT) {
              const cont = window.confirm(
                `Fetched ${tilesFetched} tile(s) so far (${features.length} features).\n` +
                `${queue.length} more tile(s) queued � continue?`
              );
              if (!cont) {
                userStoppedTiling = true;
                exceededTransferLimit = true;
                break;
              }
              sinceLastPrompt = 0;
            }
            const [a, b, c, d] = queue.shift()!;
            const tile = await fetchTile(a, b, c, d);
            tilesFetched++;
            sinceLastPrompt++;
            if (tile.features.length > 0) features = features.concat(tile.features);
            if (tile.exceeded) {
              const w = c - a, h = d - b;
              if (w > MIN_W && h > MIN_H) {
                tilesSubdivided++;
                splitInto4(a, b, c, d);
              } else {
                exceededTransferLimit = true; // hit floor � accept partial here
              }
            }
          }
          dbgLog('ESRI', { step: '4-tiling-done', tilesFetched, tilesSubdivided, queueRemaining: queue.length, totalFeatures: features.length, userStoppedTiling, stillExceeded: exceededTransferLimit });
        }
      }

      if (features.length === 0) {
        const hint = exceededTransferLimit ? ' (transfer limit reached � try a smaller area)' : '';
        throw new Error(`Service returned no contour features for that area${hint}. Query: ${queryUrl.substring(0, 200)}`);
      }

      // -- 3. Find elevation attribute ----------------------------------------
      const findElev = (attrs: Record<string, unknown>): number | null => {
        const candidates = ['CONTOUR', 'CONTOUR_FT', 'CONTOUR_M', 'CONTOURELEV', 'ContourElevation',
          'Contour_Elevation', 'Elevation', 'ELEV', 'ELEVATION', 'ElevFt', 'ElevM', 'ContLevel',
          'contour', 'elev', 'elevation'];
        for (const k of candidates) {
          if (k in attrs && typeof attrs[k] === 'number') return attrs[k] as number;
        }
        for (const [k, v] of Object.entries(attrs)) {
          const lo = k.toLowerCase();
          if (typeof v === 'number' && !lo.includes('length') && !lo.includes('area') && !lo.includes('oid') && !lo.includes('objectid') && !lo.includes('_id')) return v;
        }
        return null;
      };

      // -- 4. Convert to SurveyLines ------------------------------------------
      // If the project EPSG differs from the queryOutSR (service native SR),
      // convert each coordinate client-side so points land in the right canvas space.
      let ptConvert: ((xy: [number, number]) => [number, number]) | null = null;
      if (epsg && epsg !== queryOutSR) {
        try {
          const proj4mod = (await import('proj4')).default;
          ptConvert = (xy) => proj4mod(`EPSG:${queryOutSR}`, `EPSG:${epsg}`, xy) as [number, number];
          dbgLog('ESRI', { step: '4-client-convert', from: queryOutSR, to: epsg });
          // Log a sample coordinate so alignment can be verified in the browser console
          const samplePath = features[0]?.geometry?.paths?.[0];
          if (samplePath?.[0]) {
            const raw: [number, number] = [samplePath[0][0], samplePath[0][1]];
            dbgLog('ESRI', { step: '4-sample-vertex', raw, converted: ptConvert(raw) });
          }
        } catch { /* proj4 unavailable � keep native coords */ }
      }

      const newLines: SurveyLine[] = [];
      const major = contourSettings.majorInterval;
      for (const feature of features) {
        const paths = feature.geometry?.paths;
        if (!paths) continue;
        const elev = findElev(feature.attributes ?? {});
        const isMajor = elev !== null && major > 0 && (Math.abs(elev % major) < 1e-6 || Math.abs((elev % major) - major) < 1e-6);
        for (const path of paths) {
          for (let i = 0; i < path.length - 1; i++) {
            let [x1, y1] = path[i];
            let [x2, y2] = path[i + 1];
            if (ptConvert) { [x1, y1] = ptConvert([x1, y1]); [x2, y2] = ptConvert([x2, y2]); }
            newLines.push({
              from: '', to: '',
              fromPt: { x: x1, y: y1, z: elev ?? 0 },
              toPt: { x: x2, y: y2, z: elev ?? 0 },
              type: (isMajor ? 'contour-major' : 'contour-minor') as SurveyLine['type'],
              layer: 'ESRI-CONTOUR',
            });
          }
        }
      }
      if (newLines.length === 0) throw new Error('No valid polyline geometry in service response.');

      // -- 4b. Trim contours to the inclusion polygon -------------------------
      // The ESRI query only trims to the inclusion boundary's bounding box, so
      // clip each segment against the actual polygon and keep the inside pieces.
      let outputLines = newLines;
      if (mode === 'inclusion' && inclusionPolygon && inclusionPolygon.length >= 3) {
        const clipped: SurveyLine[] = [];
        for (const l of newLines) {
          if (!l.fromPt || !l.toPt) continue;
          const z = l.fromPt.z ?? 0;
          const pieces = clipSegmentToPolygon(
            { x: l.fromPt.x, y: l.fromPt.y },
            { x: l.toPt.x, y: l.toPt.y },
            inclusionPolygon,
          );
          for (const seg of pieces) {
            clipped.push({
              ...l,
              fromPt: { x: seg.a.x, y: seg.a.y, z },
              toPt: { x: seg.b.x, y: seg.b.y, z },
            });
          }
        }
        dbgLog('ESRI', { step: '4b-clip-to-inclusion', before: newLines.length, after: clipped.length });
        if (clipped.length === 0) {
          throw new Error('No contour segments fell inside the inclusion boundary. Check that the boundary and project projection are correct.');
        }
        outputLines = clipped;
      }

      setLines((prev: SurveyLine[]) => [...prev.filter((l: SurveyLine) => l.layer !== 'ESRI-CONTOUR'), ...outputLines]);
      dbgLog('ESRI', { step: '5-success', newLineCount: outputLines.length, exceededTransferLimit, tilesFetched });
      const tileSummary = tilesFetched > 1 ? ` across ${tilesFetched} tile(s)${tilesSubdivided > 0 ? ` (${tilesSubdivided} further subdivided)` : ''}` : '';
      const partialNote = exceededTransferLimit
        ? (userStoppedTiling ? ' � tiling stopped by user, coverage is partial' : ' � transfer limit reached on the deepest tile(s), coverage may be partial')
        : '';
      logActionToFieldbook(`Fetched ${outputLines.length} ESRI contour segments from ${serviceUrl} (${features.length} features${tileSummary}${partialNote}).`);
      showView('canvas');
      if (exceededTransferLimit) {
        setError(userStoppedTiling
          ? `?? Tiling stopped after ${tilesFetched} tile(s) � coverage is partial.`
          : '?? Transfer limit still reached on the smallest tiles � coverage may be partial. Draw a tighter Inclusion boundary for full coverage.');
        setTimeout(() => setError(null), 10000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dbgLog('ESRI', { step: 'error', message: msg });
      setError(`ESRI Contour Fetch: ${msg}`);
      // Multi-line, actionable messages need longer to read than a simple
      // transfer-limit warning.
      const displayMs = msg.length > 120 || msg.includes('\n') ? 20000 : 7000;
      setTimeout(() => setError(null), displayMs);
    } finally {
      setIsFetchingEsri(false);
    }
  }, [lines, points, settings, contourSettings, logActionToFieldbook, showView, dbgLog]);

  /**
   * Flood Agent (v26.05.17.16) \u2014 fetch FEMA NFHL flood-hazard polygons for
   * either a drawn inclusion boundary or a geocoded area description, convert
   * polygon rings to SurveyLines tagged layer='FEMA-FLOOD-<ZONE>' / type='flood'.
   */
  const handleFetchFloodZones = useCallback(async (
    mode: 'inclusion' | 'description',
    descriptionText?: string,
  ) => {
    setIsFetchingFlood(true);
    setError(null);
    try {
      const { fetchFemaFloodHazards, geocodeAreaDescription } = await import('./services/floodService.ts');
      const epsg = settings.projection?.epsg;
      let bboxWgs84: [number, number, number, number];

      if (mode === 'inclusion') {
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter((l: SurveyLine) => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        if (inclusionLines.length === 0) throw new Error(activeB ? `Active inclusion boundary "${activeB.name}" has no lines.` : 'No inclusion lines drawn. Use the canvas Inclusion tool to draw a boundary first.');
        const pointMap = new Map(points.map((p: { pointNumber: string; easting: number; northing: number }) => [p.pointNumber, p]));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let found = false;
        for (const line of inclusionLines) {
          const coords = [
            line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } :
              pointMap.get(line.from) ? { x: (pointMap.get(line.from) as { easting: number }).easting, y: (pointMap.get(line.from) as { northing: number }).northing } : null,
            line.toPt ? { x: line.toPt.x, y: line.toPt.y } :
              pointMap.get(line.to) ? { x: (pointMap.get(line.to) as { easting: number }).easting, y: (pointMap.get(line.to) as { northing: number }).northing } : null,
          ];
          for (const c of coords) {
            if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); found = true; }
          }
        }
        if (!found || !isFinite(x0)) throw new Error('Could not read coordinates from inclusion lines.');
        // Convert inclusion bbox (project EPSG) \u2192 WGS84 for FEMA NFHL.
        if (epsg && epsg !== 4326) {
          const proj4mod = (await import('proj4')).default;
          const sw = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x0, y0]) as [number, number];
          const ne = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x1, y1]) as [number, number];
          bboxWgs84 = [sw[0], sw[1], ne[0], ne[1]];
        } else {
          bboxWgs84 = [x0, y0, x1, y1];
        }
      } else {
        bboxWgs84 = await geocodeAreaDescription(descriptionText || '');
      }

      const result = await fetchFemaFloodHazards(bboxWgs84, epsg);
      if (result.lines.length === 0) {
        throw new Error(`FEMA NFHL returned no flood-hazard polygons for that area${result.exceededTransferLimit ? ' (transfer limit reached \u2014 try a smaller area)' : ''}.`);
      }
      setLines((prev: SurveyLine[]) => [...prev.filter((l: SurveyLine) => !(l.layer || '').startsWith('FEMA-FLOOD-')), ...result.lines]);
      setLastFloodResult({ zoneCounts: result.zoneCounts, featureCount: result.featureCount });
      logActionToFieldbook(`Fetched ${result.lines.length} FEMA NFHL flood-hazard segments (${result.featureCount} polygons across ${Object.keys(result.zoneCounts).length} zone codes).`);
      showView('canvas');
      if (result.exceededTransferLimit) {
        setError('\u26a0\ufe0f FEMA NFHL transfer limit reached \u2014 only a partial set of polygons was returned. For full coverage, draw an Inclusion boundary around your project area.');
        setTimeout(() => setError(null), 10000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Flood Zone Fetch: ${msg}`);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsFetchingFlood(false);
    }
  }, [lines, points, settings, logActionToFieldbook, showView]);

  const handleClearFloodLines = useCallback(() => {
    setLines((prev: SurveyLine[]) => prev.filter((l: SurveyLine) => !(l.layer || '').startsWith('FEMA-FLOOD-')));
    setLastFloodResult(null);
    logActionToFieldbook('Cleared FEMA NFHL flood-zone linework.');
  }, [logActionToFieldbook]);

  /**
   * handleFetchFirmette � fetches a FEMA NFHL firmette-style map image for the
   * current flood query bbox and caches it in session state (and .lsvz).
   *
   * Uses the FEMA Hazard Layer ArcGIS REST export endpoint with all NFHL
   * layers for an authentic FIRM-style image.  The result is stored as a
   * base64 data URL so the viewer works offline once loaded.
   */
  const handleFetchFirmette = useCallback(async () => {
    if (isFetchingFirmette) return;
    // Derive bbox from current flood lines (FEMA-FLOOD-* layers).
    const floodLines = lines.filter((l: SurveyLine) => (l.layer || '').startsWith('FEMA-FLOOD-'));
    if (floodLines.length === 0) {
      setError('Fetch flood zones first to define the firmette area.');
      setTimeout(() => setError(null), 5000);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of floodLines) {
      // Lines are in project coords � re-project to WGS84 for FEMA API.
      try {
        const fromProjDef = proj4.defs(`EPSG:${settings.projection.epsg}`);
        if (fromProjDef) {
          const [fx, fy] = proj4(`EPSG:${settings.projection.epsg}`, 'WGS84', [l.fromPt.x, l.fromPt.y]);
          const [tx, ty] = proj4(`EPSG:${settings.projection.epsg}`, 'WGS84', [l.toPt.x, l.toPt.y]);
          minX = Math.min(minX, fx, tx); minY = Math.min(minY, fy, ty);
          maxX = Math.max(maxX, fx, tx); maxY = Math.max(maxY, fy, ty);
        }
      } catch { /* skip unprojectable lines */ }
    }
    if (!isFinite(minX)) {
      setError('Could not determine firmette area from flood lines.');
      setTimeout(() => setError(null), 5000);
      return;
    }
    // Pad bbox slightly so boundary features aren't clipped.
    const padLng = (maxX - minX) * 0.08;
    const padLat = (maxY - minY) * 0.08;
    const bboxStr = `${(minX - padLng).toFixed(6)},${(minY - padLat).toFixed(6)},${(maxX + padLng).toFixed(6)},${(maxY + padLat).toFixed(6)}`;
    // Portrait firmette size (roughly half-letter, proportional to 8.5�11).
    const width = 850; const height = 1100;
    const url = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=${bboxStr}&bboxSR=4326&size=${width},${height}&imageSR=4326&layers=show%3A0%2C1%2C2%2C3%2C4%2C5%2C6%2C7%2C8%2C9%2C10%2C11%2C12%2C13%2C14%2C15%2C16%2C19%2C20%2C21%2C24%2C25%2C27%2C28&format=png32&transparent=false&f=image&dpi=96`;
    setIsFetchingFirmette(true);
    logActionToFieldbook(`Fetching FEMA FIRMETTE for bbox ${bboxStr}�`);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const firmette = { url, bbox: bboxStr, fetchedAt: new Date().toISOString(), imageDataUrl: dataUrl };
      setFloodFirmetteData(firmette);
      setIsFirmetteViewerVisible(true);
      logActionToFieldbook(`FIRMETTE stored � bbox ${bboxStr}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`FIRMETTE fetch failed: ${msg}`);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsFetchingFirmette(false);
    }
  }, [isFetchingFirmette, lines, settings.projection.epsg, logActionToFieldbook]);

  // --- STRUCTURES AGENT ----------------------------------------------------
  const handleFetchStructures = useCallback(async (
    mode: 'inclusion' | 'description',
    descriptionText?: string,
  ) => {
    setIsFetchingStructures(true);
    setError(null);
    try {
      const { fetchNsiStructures } = await import('./services/structuresService.ts');
      const { geocodeAreaDescription } = await import('./services/floodService.ts');
      const epsg = settings.projection?.epsg;
      let bboxWgs84: [number, number, number, number];

      if (mode === 'inclusion') {
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter((l: SurveyLine) => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        if (inclusionLines.length === 0) throw new Error(activeB ? `Active inclusion boundary "${activeB.name}" has no lines.` : 'No inclusion lines drawn. Use the canvas Inclusion tool to draw a boundary first.');
        const pointMap = new Map(points.map((p: { pointNumber: string; easting: number; northing: number }) => [p.pointNumber, p]));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let found = false;
        for (const line of inclusionLines) {
          const coords = [
            line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : pointMap.get(line.from) ? { x: (pointMap.get(line.from) as { easting: number }).easting, y: (pointMap.get(line.from) as { northing: number }).northing } : null,
            line.toPt ? { x: line.toPt.x, y: line.toPt.y } : pointMap.get(line.to) ? { x: (pointMap.get(line.to) as { easting: number }).easting, y: (pointMap.get(line.to) as { northing: number }).northing } : null,
          ];
          for (const c of coords) {
            if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); found = true; }
          }
        }
        if (!found || !isFinite(x0)) throw new Error('Could not read coordinates from inclusion lines.');
        if (epsg && epsg !== 4326) {
          const proj4mod = (await import('proj4')).default;
          const sw = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x0, y0]) as [number, number];
          const ne = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x1, y1]) as [number, number];
          bboxWgs84 = [sw[0], sw[1], ne[0], ne[1]];
        } else {
          bboxWgs84 = [x0, y0, x1, y1];
        }
      } else {
        bboxWgs84 = await geocodeAreaDescription(descriptionText || '');
      }

      const result = await fetchNsiStructures(bboxWgs84, epsg);
      // Fetch real OSM building footprints in parallel � NSI only ships
      // centroids, so without OSM the rectifier has no geometry to align.
      // Failure here is non-fatal: we still surface NSI as before.
      let osmFootprints: typeof lastOsmFootprints = null;
      try {
        const { fetchOsmBuildings } = await import('./services/osmBuildingsService.ts');
        const { joinNsiToFootprints } = await import('./services/structuresService.ts');
        const osm = await fetchOsmBuildings(bboxWgs84, epsg ?? undefined);
        osmFootprints = joinNsiToFootprints(osm.buildings, result.points, result.attrsByPointNumber);
      } catch (osmErr) {
        const m = osmErr instanceof Error ? osmErr.message : String(osmErr);
        console.warn('[Structures] OSM Overpass fetch failed; rectifier will fall back to NSI/COGO only:', m);
      }
      if (result.featureCount === 0 && (!osmFootprints || osmFootprints.length === 0)) {
        throw new Error('Neither FEMA NSI nor OSM returned any structures for that area. Try a larger bounding box or a different location.');
      }
      // Replace existing FEMA-NSI points with fresh results.
      // Points live in `pointLists` after the state refactor; we use a
      // dedicated list (id 'fema-nsi') so a fresh fetch fully replaces the prior set
      // and other lists (working, civil-drafter-points, etc.) are untouched.
      setPointLists(prev => {
        const cleaned = prev
          .map(l => l.id === 'fema-nsi'
            ? l
            : { ...l, points: l.points.filter((p: SurveyPoint) => p.layer !== 'FEMA-NSI') })
          .filter(l => l.id !== 'fema-nsi');
        return [
          ...cleaned,
          { id: 'fema-nsi', name: 'FEMA NSI Structures', points: result.points, isVisible: true },
        ];
      });
      setLastStructuresResult(result);
      setLastOsmFootprints(osmFootprints);
      setLastRectifyStats(null);
      const osmMsg = osmFootprints && osmFootprints.length > 0
        ? ` + ${osmFootprints.length} OSM building polygon${osmFootprints.length === 1 ? '' : 's'}`
        : '';
      logActionToFieldbook(`Fetched ${result.featureCount} FEMA NSI structures${osmMsg} (${Object.keys(result.categoryCounts).length} occupancy categories).`);
      showView('canvas');
      if (result.exceededTransferLimit) {
        setError('?? NSI result set may be truncated (=5,000 features). Try a smaller area.');
        setTimeout(() => setError(null), 10000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Detect known USACE upstream outage for a more actionable message.
      const isNsiDown = msg.includes('NSI upstream error') || msg.includes('Internal Server Error');
      const displayMsg = isNsiDown
        ? 'The USACE NSI server is currently unavailable (upstream outage). Structure data cannot be fetched until the service is restored at nsi.sec.usace.army.mil.'
        : `Structures Fetch: ${msg}`;
      setError(displayMsg);
      setTimeout(() => setError(null), 12000);
    } finally {
      setIsFetchingStructures(false);
    }
  }, [lines, points, settings, logActionToFieldbook, showView, setPointLists]);

  const handleClearStructures = useCallback(() => {
    setPointLists(prev => prev
      .map(l => l.id === 'fema-nsi'
        ? l
        : { ...l, points: l.points.filter((p: SurveyPoint) => p.layer !== 'FEMA-NSI') })
      .filter(l => l.id !== 'fema-nsi'));
    setLines(prev => prev.filter((l: SurveyLine) => (l.layer ?? '').toUpperCase() !== 'STRUCTURES'));
    setLastStructuresResult(null);
    setLastOsmFootprints(null);
    setLastRectifyStats(null);
    logActionToFieldbook('Cleared FEMA NSI centroids, OSM building footprints, and STRUCTURES linework.');
  }, [logActionToFieldbook, setPointLists]);

  // --- SOILS AGENT (v26.05.20.1) -------------------------------------------
  // Fetches USDA NRCS SSURGO soil map-unit polygons for the inclusion bbox
  // or a geocoded description and renders them as SurveyLines per map unit.
  const handleFetchSoils = useCallback(async (
    mode: 'inclusion' | 'description',
    descriptionText?: string,
  ) => {
    setIsFetchingSoils(true);
    setError(null);
    try {
      const { fetchSsurgoSoils } = await import('./services/soilsService.ts');
      const { geocodeAreaDescription } = await import('./services/floodService.ts');
      const epsg = settings.projection?.epsg;
      let bboxWgs84: [number, number, number, number];

      if (mode === 'inclusion') {
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter((l: SurveyLine) => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        if (inclusionLines.length === 0) throw new Error(activeB ? `Active inclusion boundary "${activeB.name}" has no lines.` : 'No inclusion lines drawn. Use the canvas Inclusion tool to draw a boundary first.');
        const pointMap = new Map(points.map((p: { pointNumber: string; easting: number; northing: number }) => [p.pointNumber, p]));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let found = false;
        for (const line of inclusionLines) {
          const coords = [
            line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } : pointMap.get(line.from) ? { x: (pointMap.get(line.from) as { easting: number }).easting, y: (pointMap.get(line.from) as { northing: number }).northing } : null,
            line.toPt ? { x: line.toPt.x, y: line.toPt.y } : pointMap.get(line.to) ? { x: (pointMap.get(line.to) as { easting: number }).easting, y: (pointMap.get(line.to) as { northing: number }).northing } : null,
          ];
          for (const c of coords) {
            if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); found = true; }
          }
        }
        if (!found || !isFinite(x0)) throw new Error('Could not read coordinates from inclusion lines.');
        if (epsg && epsg !== 4326) {
          const proj4mod = (await import('proj4')).default;
          const sw = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x0, y0]) as [number, number];
          const ne = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x1, y1]) as [number, number];
          bboxWgs84 = [sw[0], sw[1], ne[0], ne[1]];
        } else {
          bboxWgs84 = [x0, y0, x1, y1];
        }
      } else {
        bboxWgs84 = await geocodeAreaDescription(descriptionText || '');
      }

      const result = await fetchSsurgoSoils(bboxWgs84, epsg);
      if (result.featureCount === 0) {
        throw new Error('SSURGO returned no soil map units for that area. Try a larger bounding box or a different location.');
      }
      // Replace existing SOILS-* lines with fresh results.
      setLines((prev: SurveyLine[]) => [
        ...prev.filter((l: SurveyLine) => !l.layer?.startsWith('SOILS-')),
        ...result.lines,
      ]);
      setSoilMapUnits(result.mapUnits);
      setLastSoilsResult(result);
      setSoilReportData(null); // clear stale tabular data on fresh fetch
      logActionToFieldbook(`Fetched ${result.featureCount} SSURGO soil map-unit polygons (${Object.keys(result.zoneCounts).length} map unit symbols).`);
      showView('canvas');
      if (result.exceededTransferLimit) {
        setError('?? SSURGO result set may be truncated (service transfer limit reached). Try a smaller area.');
        setTimeout(() => setError(null), 10000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Soils Fetch: ${msg}`);
      setTimeout(() => setError(null), 12000);
    } finally {
      setIsFetchingSoils(false);
    }
  }, [lines, points, settings, logActionToFieldbook, showView]);

  const handleClearSoilsLines = useCallback(() => {
    setLines((prev: SurveyLine[]) => prev.filter((l: SurveyLine) => !l.layer?.startsWith('SOILS-')));
    setSoilMapUnits([]);
    setLastSoilsResult(null);
    setSoilReportData(null);
    logActionToFieldbook('Cleared SSURGO soil map-unit linework.');
  }, [logActionToFieldbook]);

  const handleFetchSoilReport = useCallback(async () => {
    const mukeys = soilMapUnits.map(u => u.mukey).filter(Boolean);
    if (mukeys.length === 0) {
      setError('No soil map units loaded. Fetch SSURGO soils first.');
      setTimeout(() => setError(null), 6000);
      return;
    }
    setIsFetchingSoilReport(true);
    setError(null);
    try {
      const { fetchSoilReport } = await import('./services/soilsService.ts');
      const data = await fetchSoilReport(mukeys);
      setSoilReportData(data);
      logActionToFieldbook(`Fetched tabular soil report for ${mukeys.length} map units from USDA Soil Data Access.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Soil Report: ${msg}`);
      setTimeout(() => setError(null), 12000);
    } finally {
      setIsFetchingSoilReport(false);
    }
  }, [soilMapUnits, logActionToFieldbook]);

  // --- STREET LABELS (v26.05.19.4) -----------------------------------------
  // Fetches named road centerlines within the active inclusion boundary bbox
  // and places StreetLabel text objects on the canvas aligned to road bearing.
  const handleFetchStreetNames = useCallback(async () => {
    setIsFetchingStreetLabels(true);
    setError(null);
    try {
      const { fetchStreetLabels } = await import('./services/streetNameService.ts');
      const epsg = settings.projection?.epsg;
      const activeB = activeInclusionBoundaryRef.current;
      const inclusionLines = lines.filter((l: SurveyLine) =>
        l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId)
      );
      if (inclusionLines.length === 0) {
        throw new Error('Draw an inclusion boundary first � street names are fetched within that area.');
      }
      const pointMap = new Map(points.map((p: SurveyPoint) => [p.pointNumber, p]));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const l of inclusionLines) {
        const fp = l.fromPt ?? (l.from ? pointMap.get(l.from) && { x: pointMap.get(l.from)!.easting, y: pointMap.get(l.from)!.northing } : null);
        const tp = l.toPt ?? (l.to ? pointMap.get(l.to) && { x: pointMap.get(l.to)!.easting, y: pointMap.get(l.to)!.northing } : null);
        if (fp) { x0 = Math.min(x0, fp.x); y0 = Math.min(y0, fp.y); x1 = Math.max(x1, fp.x); y1 = Math.max(y1, fp.y); }
        if (tp) { x0 = Math.min(x0, tp.x); y0 = Math.min(y0, tp.y); x1 = Math.max(x1, tp.x); y1 = Math.max(y1, tp.y); }
      }
      if (!isFinite(x0) || !isFinite(y0)) {
        throw new Error('Could not compute inclusion boundary extent.');
      }
      let bboxWgs84: [number, number, number, number];
      if (epsg && epsg !== 4326) {
        const proj4mod = (await import('proj4')).default;
        const sw = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x0, y0]) as [number, number];
        const ne = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x1, y1]) as [number, number];
        bboxWgs84 = [sw[0], sw[1], ne[0], ne[1]];
      } else {
        bboxWgs84 = [x0, y0, x1, y1];
      }

      const newLabels = await fetchStreetLabels(bboxWgs84, epsg ?? undefined);
      if (newLabels.length === 0) {
        throw new Error('No named roads found in the inclusion area. Try a larger boundary.');
      }
      setStreetLabels(newLabels);
      logActionToFieldbook(`Placed ${newLabels.length} street-name label(s) on the plan.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Street Names: ${msg}`);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsFetchingStreetLabels(false);
    }
  }, [lines, points, settings, logActionToFieldbook]);

  // CACP: Register Flood Agent command handlers so peer drawing agents
  // (Civil Drafter, Boundary, Civil Plan Expert) can request FEMA NFHL
  // flood-hazard linework without context-switching the user into the
  // Flood Agent UI. The handler delegates to the same handleFetchFloodZones
  // pipeline the UI uses, so behavior is identical.
  // NOTE: Must be declared AFTER handleFetchFloodZones / handleClearFloodLines
  // or else the const closure references hit a TDZ error and the whole app
  // fails to mount (regression 26.05.17.19).
  useEffect(() => {
    const unsubFetch = interAgentComm.onCommand('fetch_flood_zones', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const mode = (d.mode as 'inclusion' | 'description') || 'inclusion';
      const descriptionText = (d.descriptionText as string) || (d.description as string) || undefined;
      if (mode !== 'inclusion' && mode !== 'description') {
        return { requestId: message.id, from: AgentType.FLOOD_AGENT, success: false, error: `Invalid mode "${mode}" � must be 'inclusion' or 'description'.`, timestamp: Date.now() };
      }
      if (mode === 'description' && !descriptionText) {
        return { requestId: message.id, from: AgentType.FLOOD_AGENT, success: false, error: 'mode=description requires descriptionText.', timestamp: Date.now() };
      }
      try {
        await handleFetchFloodZones(mode, descriptionText);
        // Inspect lines state after the async update via setLines callback
        // (microtask read so React commit lands first).
        const result = await new Promise<{ addedLines: number; layers: string[]; zoneCounts: Record<string, number> }>((resolve) => {
          setLines((prev: SurveyLine[]) => {
            const flood = prev.filter((l: SurveyLine) => (l.layer || '').startsWith('FEMA-FLOOD-'));
            const layers = Array.from(new Set(flood.map((l: SurveyLine) => l.layer || ''))).filter(Boolean);
            const zoneCounts: Record<string, number> = {};
            for (const l of flood) {
              const z = (l.layer || '').replace(/^FEMA-FLOOD-/, '');
              zoneCounts[z] = (zoneCounts[z] || 0) + 1;
            }
            resolve({ addedLines: flood.length, layers, zoneCounts });
            return prev;
          });
        });
        return {
          requestId: message.id,
          from: AgentType.FLOOD_AGENT,
          success: result.addedLines > 0,
          data: result,
          error: result.addedLines === 0 ? 'No FEMA NFHL flood polygons returned for that area.' : undefined,
          timestamp: Date.now(),
        };
      } catch (e) {
        return { requestId: message.id, from: AgentType.FLOOD_AGENT, success: false, error: e instanceof Error ? e.message : String(e), timestamp: Date.now() };
      }
    });

    const unsubClear = interAgentComm.onCommand('clear_flood_zones', async (message) => {
      try {
        const removed = await new Promise<number>((resolve) => {
          setLines((prev: SurveyLine[]) => {
            const before = prev.filter((l: SurveyLine) => (l.layer || '').startsWith('FEMA-FLOOD-')).length;
            const next = prev.filter((l: SurveyLine) => !(l.layer || '').startsWith('FEMA-FLOOD-'));
            resolve(before);
            return next;
          });
        });
        setLastFloodResult(null);
        logActionToFieldbook(`CACP clear_flood_zones � removed ${removed} FEMA NFHL segments.`);
        return { requestId: message.id, from: AgentType.FLOOD_AGENT, success: true, data: { removedLines: removed }, timestamp: Date.now() };
      } catch (e) {
        return { requestId: message.id, from: AgentType.FLOOD_AGENT, success: false, error: e instanceof Error ? e.message : String(e), timestamp: Date.now() };
      }
    });

    return () => { unsubFetch(); unsubClear(); };
  }, [handleFetchFloodZones, logActionToFieldbook]);

  /**
   * Fetch county tax-parcel boundaries (Boundary Agent feature).
   * Mirrors handleFetchEsriContours: 'inclusion' uses a drawn polygon for the
   * bbox; 'description' geocodes a free-text query via Nominatim. Returned
   * polygon rings become SurveyLines tagged layer='COUNTY-PARCEL', type='parcel'.
   */
  const handleFetchParcels = useCallback(async (
    serviceUrl: string,
    mode: 'inclusion' | 'description',
    descriptionText?: string,
  ) => {
    setIsFetchingParcels(true);
    setError(null);
    try {
      const { PARCEL_GIS_SERVICES, PARCEL_LAYER_TAG, fetchParcelsForBbox } = await import('./services/parcelGisService.ts');
      const service = PARCEL_GIS_SERVICES.find(s => s.url === serviceUrl) ?? PARCEL_GIS_SERVICES[0];
      if (!service) throw new Error('No parcel GIS service configured.');
      const epsg = settings.projection?.epsg;

      // -- 1. bbox (WGS84) ----------------------------------------------
      let xmin: number, ymin: number, xmax: number, ymax: number;
      if (mode === 'inclusion') {
        const activeB = activeInclusionBoundaryRef.current;
        const inclusionLines = lines.filter(l => l.type === 'inclusion' && (!activeB || l.polylineId === activeB.polylineId));
        if (inclusionLines.length === 0) {
          throw new Error(activeB ? `Active inclusion boundary "${activeB.name}" has no lines.` : 'No inclusion lines drawn. Use the canvas Inclusion tool first.');
        }
        const pointMap = new Map(points.map((p: { pointNumber: string; easting: number; northing: number }) => [p.pointNumber, p]));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, found = false;
        for (const line of inclusionLines) {
          const coords = [
            line.fromPt ? { x: line.fromPt.x, y: line.fromPt.y } :
              pointMap.get(line.from) ? { x: (pointMap.get(line.from) as { easting: number; northing: number }).easting, y: (pointMap.get(line.from) as { easting: number; northing: number }).northing } : null,
            line.toPt ? { x: line.toPt.x, y: line.toPt.y } :
              pointMap.get(line.to) ? { x: (pointMap.get(line.to) as { easting: number; northing: number }).easting, y: (pointMap.get(line.to) as { easting: number; northing: number }).northing } : null,
          ];
          for (const c of coords) {
            if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); found = true; }
          }
        }
        if (!found || !isFinite(x0)) throw new Error('Could not read inclusion coordinates.');
        // Reproject project EPSG ? WGS84 for the service query.
        if (epsg && epsg !== 4326) {
          try {
            const proj4mod = (await import('proj4')).default;
            const sw = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x0, y0]);
            const ne = proj4mod(`EPSG:${epsg}`, 'EPSG:4326', [x1, y1]);
            xmin = sw[0]; ymin = sw[1]; xmax = ne[0]; ymax = ne[1];
          } catch {
            // proj4 unavailable � assume already WGS84
            xmin = x0; ymin = y0; xmax = x1; ymax = y1;
          }
        } else {
          xmin = x0; ymin = y0; xmax = x1; ymax = y1;
        }
      } else {
        const desc = (descriptionText || '').trim();
        if (!desc) throw new Error('Please enter an area description.');
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(desc)}&format=json&limit=1`;
        const geoResp = await fetch(geocodeUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'LandSurv.ai/1.0' } });
        if (!geoResp.ok) throw new Error(`Geocoding failed: ${geoResp.statusText}`);
        const geoData = await geoResp.json();
        if (!geoData || geoData.length === 0) throw new Error(`No location found for "${desc}".`);
        const hit = geoData[0];
        let [south, north, west, east] = (hit.boundingbox || []).map(Number);
        const centerLat = parseFloat(hit.lat);
        const centerLon = parseFloat(hit.lon);
        // Parcel layers are dense � keep the minimum span tighter than contours
        // so a description like "Norristown PA" doesn't blow the transfer limit.
        const MIN_SPAN = 0.01; // ~1 km
        if (!isFinite(north - south) || (north - south) < MIN_SPAN) { south = centerLat - MIN_SPAN / 2; north = centerLat + MIN_SPAN / 2; }
        if (!isFinite(east - west)  || (east - west)  < MIN_SPAN) { west  = centerLon - MIN_SPAN / 2; east  = centerLon + MIN_SPAN / 2; }
        xmin = west; ymin = south; xmax = east; ymax = north;
      }

      // -- 2. Delegate to service module --------------------------------
      const result = await fetchParcelsForBbox(
        service,
        { xmin, ymin, xmax, ymax },
        epsg,
        (msg, payload) => dbgLog('Parcel', { msg, ...((payload as object) ?? {}) }),
      );

      if (result.lines.length === 0) {
        const hint = result.exceededTransferLimit ? ' (transfer limit reached � try a smaller area)' : '';
        throw new Error(`No parcels found for that area${hint}.`);
      }

      setLines((prev: SurveyLine[]) => [
        ...prev.filter((l: SurveyLine) => l.layer !== PARCEL_LAYER_TAG),
        ...result.lines,
      ]);
      setLastFetchedParcels(result.parcels);

      // Create parcel centroid annotation labels with N/F owner notation.
      if (result.labelPoints.length > 0) {
        const ts = Date.now();
        const newLabels: ParcelLabel[] = result.labelPoints.map((lp, i) => ({
          id: `PARCEL-LBL-${i}-${ts}`,
          x: lp.x,
          y: lp.y,
          parcelId: lp.parcelId ?? null,
          owner: lp.owner ?? null,
          angle: 0,
        }));
        setParcelLabels(newLabels);
      }
      logActionToFieldbook(
        `Fetched ${result.parcels.length} parcels (${result.lines.length} segments) from ${service.label}` +
        `${result.exceededTransferLimit ? ' � transfer limit reached, try a smaller area' : ''}.`
      );
      showView('canvas');
      if (result.exceededTransferLimit) {
        setError('?? Parcel transfer limit reached � try Inclusion mode with a smaller area for full coverage.');
        setTimeout(() => setError(null), 10000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dbgLog('Parcel', { step: 'error', message: msg });
      setError(`Parcel Fetch: ${msg}`);
      setTimeout(() => setError(null), 7000);
    } finally {
      setIsFetchingParcels(false);
    }
  }, [lines, points, settings, logActionToFieldbook, showView, dbgLog]);

  /** Remove all county-parcel lines from the canvas. */
  const handleClearParcels = useCallback(() => {
    setLines((prev: SurveyLine[]) => prev.filter((l: SurveyLine) => l.layer !== 'COUNTY-PARCEL'));
    setLastFetchedParcels([]);
    setParcelLabels([]);
  }, []);

  const handleSaveProfile = useCallback(() => {
    if (!profileData || profileData.length === 0 || !profileInfo) {
      setError("No profile data to save.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const header = 'Station,Elevation';
    const rows = profileData.map(p =>
      `${p.station.toFixed(settings.coordinatePrecision)},${p.elevation.toFixed(settings.coordinatePrecision)}`
    ).join('\n');
    const csvContent = `${header}\n${rows}`;

    let baseName = profileInfo.name.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
    if (!baseName.endsWith('.csv')) {
      baseName += '.csv';
    }

    let finalName = baseName;
    let counter = 1;
    const allFileNames = new Set(generatedFiles.map(f => f.name));
    while (allFileNames.has(finalName)) {
      finalName = baseName.replace('.csv', `_${counter++}.csv`);
    }
    
    const newFile: SessionFile = {
      name: finalName,
      content: csvContent,
    };

    setGeneratedFiles(prev => [...prev, newFile]);
    logActionToFieldbook(`Saved profile "${finalName}" to file manager.`);
  }, [profileData, profileInfo, settings.coordinatePrecision, generatedFiles, logActionToFieldbook]);

  const handleSaveBoundaryToFileManager = useCallback((file: import('./types.ts').BoundaryFile) => {
    const header = 'Call #,From,To,Bearing,Distance,Curve,Radius,Arc Length,Chord Bearing';
    const rows = file.calls.map((c, idx) =>
      [
        idx + 1,
        c.from,
        c.to,
        c.bearing,
        c.distance,
        c.isCurve ? 'Yes' : 'No',
        c.curveRadius != null ? c.curveRadius.toString() : '',
        c.arcLength != null ? c.arcLength.toString() : '',
        c.chordBearing ?? '',
      ].join(',')
    ).join('\n');
    const csvContent = `${header}\n${rows}`;

    const baseName = file.name.replace(/[^a-z0-9._-]/gi, '_').replace(/\.csv$/i, '') + '.csv';
    let finalName = baseName;
    let counter = 1;
    const allFileNames = new Set(generatedFiles.map(f => f.name));
    while (allFileNames.has(finalName)) {
      finalName = baseName.replace('.csv', `_${counter++}.csv`);
    }

    setGeneratedFiles(prev => [...prev, { name: finalName, content: csvContent }]);
    logActionToFieldbook(`Saved deed "${file.name}" to file manager as "${finalName}".`);
  }, [generatedFiles, logActionToFieldbook]);

  const handleStopGenerating = useCallback(() => {
    stopGenerationRef.current = true;
  }, []);
  
  const handleOpenFileInEditor = useCallback((fileName: string, newFiles: SessionFile[] = []) => {
    const allFiles = [rawFile, deedFile, dxfFile, clFile, gisFile, ...(planFiles || []), ...(generatedFiles || []), ...newFiles].filter(f => f !== null) as SessionFile[];
    const fileToOpen = allFiles.find(f => f.name === fileName);

    if (fileToOpen) {
        setTextEditorContent(fileToOpen.content);
        setActiveTextEditorFile(fileName);
        setHasUnsavedChanges(false);
        showView('texteditor');
    } else {
        const pointListToOpen = pointLists.find(l => l.name === fileName);
        if (pointListToOpen) {
            const pointListContent = pointListToString(pointListToOpen, settings);
            setTextEditorContent(pointListContent);
            setActiveTextEditorFile(fileName);
            setHasUnsavedChanges(false);
            showView('texteditor');
        }
    }
  }, [rawFile, deedFile, dxfFile, clFile, gisFile, planFiles, generatedFiles, showView, pointLists, settings]);

  const handleDeleteFile = useCallback((fileName: string) => {
    logActionToFieldbook(`Deleted file: ${fileName}`);

    if (rawFile?.name === fileName) {
        setRawFile(null);
        setRawChat(null);
        setRawChatHistory([]);
        setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.RAW_CRAWLER); return next; });
    }
    if (deedFile?.name === fileName) {
        setDeedFile(null);
        setDeedChat(null);
        setDeedChatHistory([]);
        setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.DEED_READER); return next; });
    }
    if (dxfFile?.name === fileName) {
        setDxfFile(null);
        setDxfChat(null);
        setDxfChatHistory([]);
        setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.DXF_ANALYZER); return next; });
    }
    if (clFile?.name === fileName) {
        setClFile(null);
        setCenterlines([]);
        setStationingChat(null);
        setStationingChatHistory([]);
        setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.CENTERLINE_STATIONING); return next; });
    }
    if (gisFile?.name === fileName) {
        setGisFile(null);
        setGisChat(null);
        setGisChatHistory([]);
        setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.GIS_AGENT); return next; });
    }
    
    setPlanFiles(prev => {
        const newFiles = prev?.filter(f => f.name !== fileName);
        if (prev && newFiles && prev.length !== newFiles.length) {
            if (newFiles.length === 0) {
                 setPlanExpertChat(null);
                 setPlanExpertChatHistory([]);
                 setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.CIVIL_PLAN_EXPERT); return next; });
            } else {
                 setPlanExpertChat(startChatWithOverride(AgentType.CIVIL_PLAN_EXPERT, newFiles));
            }
        }
        return newFiles && newFiles.length > 0 ? newFiles : null;
    });

    setImageFiles(prev => {
        const newFiles = prev?.filter(f => f.name !== fileName);
        if (prev && newFiles && newFiles.length !== newFiles.length) {
            if (newFiles.length === 0) {
                 setImageAnalyzerChat(null);
                 setImageAnalyzerChatHistory([]);
                 setInitializedAgents(prev => { const next = new Set(prev); next.delete(AgentType.IMAGE_ANALYZER); return next; });
            } else {
                 setImageAnalyzerChat(startChatWithOverride(AgentType.IMAGE_ANALYZER, newFiles));
            }
        }
        return newFiles && newFiles.length > 0 ? newFiles : null;
    });

    setGeneratedFiles(prev => prev.filter(f => f.name !== fileName));
    
    if (activeTextEditorFile === fileName) {
        setActiveTextEditorFile(null);
        setTextEditorContent('');
        setHasUnsavedChanges(false);
        if (activeVisualPanel === 'texteditor') showView('canvas');
    }
    
    setPdfViewerFiles(prev => {
        const newFiles = prev?.filter(f => f.name !== fileName);
        if (prev && newFiles && newFiles.length === 0 && activeVisualPanel === 'pdfviewer') {
            showView('canvas');
        }
        return newFiles && newFiles.length > 0 ? newFiles : null;
    });

  }, [logActionToFieldbook, rawFile, deedFile, dxfFile, clFile, gisFile, activeTextEditorFile, activeVisualPanel, showView, activeModel, settings]);

  // FIX: Add handleFileSwitch function definition.
  const handleFileSwitch = useCallback((fileName: string) => {
    const allFiles: SessionFile[] = [
        rawFile, deedFile, dxfFile, clFile, gisFile,
        ...generatedFiles,
    ].filter((f): f is SessionFile => f !== null);
    
    const fileToSwitch = allFiles.find(f => f.name === fileName);
    if (!fileToSwitch) return;

    switch (activeAgent) {
        case AgentType.RAW_CRAWLER:
            handleFileUploaded(fileToSwitch.content, fileToSwitch.name);
            break;
        case AgentType.DEED_READER:
            handleDeedSubmitted(fileToSwitch);
            break;
        case AgentType.DXF_ANALYZER:
            handleDxfUploaded(fileToSwitch.content, fileToSwitch.name);
            break;
        case AgentType.GIS_AGENT:
            handleGisUploaded(fileToSwitch.content, fileToSwitch.name);
            break;
        case AgentType.CENTERLINE_STATIONING:
            handleClFileUploaded(fileToSwitch.content, fileToSwitch.name);
            break;
    }
  }, [activeAgent, rawFile, deedFile, dxfFile, clFile, gisFile, generatedFiles, handleFileUploaded, handleDeedSubmitted, handleDxfUploaded, handleGisUploaded, handleClFileUploaded, settings.userApiKey, hasConfirmedApiKey, addNotification]);

  const handleSendMessage = useCallback(async (query: string, agentOverride?: AgentType) => {
    console.log('[handleSendMessage] Called with query:', query, 'activeAgent:', activeAgent, 'override:', agentOverride);

    // Deterministic symbol-visibility intercept: if the user issued a command
    // like "draw tree symbols" or "hide all manholes", toggle the built-in
    // symbol group here (no LLM in the loop � see utils/symbolCommandParser).
    // This runs as a side-effect; the message still flows to the agent so it
    // can acknowledge conversationally.
    const symbolCmd = parseSymbolCommand(query);
    if (symbolCmd) {
      applySymbolVisibilityCommand(symbolCmd);
      const label = symbolCmd.ids === 'all' ? 'all built-in symbols' : symbolCmd.phrase;
      addNotification({
        kind: 'symbol-manager',
        severity: 'info',
        title: 'Symbols updated',
        message: settings.showPointSymbols === true
          ? `${symbolCmd.action === 'enable' ? 'Showing' : 'Hiding'} ${label} on the canvas.`
          : `${symbolCmd.action === 'enable' ? 'Enabled' : 'Disabled'} ${label}, but point symbols are hidden until Enable Point Symbols is turned on in Settings.`,
      });
    }

    // Free-trial off period: block inference when 4hr timer trips unless continuous service access or superuser is present.
    // Instead of bringing up the API key box, show the 15-minute host cost reminder dialog.
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
      setShowHostCostReminder(true);
      return;
    }

    const hasAnyInferenceKey = Boolean(
      isSuperUser ||
      computeCredits > 0 ||
      hasApiKey ||
      hasLandSurvKey ||
      hasServiceAccess ||
      settings.userApiKey?.trim() ||
      settings.openaiApiKey?.trim() ||
      settings.xaiApiKey?.trim() ||
      settings.anthropicApiKey?.trim()
    );

    if (!hasAnyInferenceKey) {
      setShowApiKeyModal(true);
      return;
    }

    // Check if user has their own API key and hasn't confirmed yet
    if (settings.userApiKey && !hasConfirmedApiKey) {
      if (isDemoApiKey(settings.userApiKey)) {
        setHasConfirmedApiKey(true);
        addNotification({
          kind: 'api-key',
          severity: 'info',
          title: 'Enabling key active',
          message: 'Your LandSurv Enabling Key is active and will be used for this session.',
        });
      } else {
        setShowApiKeyConfirmation(true);
        addNotification({
          kind: 'api-key',
          severity: 'warning',
          title: 'API Key Confirmation Required',
          message: 'Please confirm your API key in the confirmation dialog to proceed with inference.',
        });
        return;
      }
    }

    // A CACP hand-off names the agent that must answer; interactive use follows
    // whichever agent the user has open.
    const agent = agentOverride ?? activeAgent;
    let chat: Chat | null = null;
    let setHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>> | null = null;
    
    switch (agent) {
        case AgentType.RAW_CRAWLER: chat = rawChat; setHistory = setRawChatHistory; break;
        case AgentType.CIVIL_DRAFTER: chat = civilDrafterChat; setHistory = setCivilDrafterChatHistory; break;
        case AgentType.DEED_READER: chat = deedChat; setHistory = setDeedChatHistory; break;
        case AgentType.CIVIL_PLAN_EXPERT: chat = planExpertChat; setHistory = setPlanExpertChatHistory; break;
        case AgentType.DXF_ANALYZER: chat = dxfChat; setHistory = setDxfChatHistory; break;
        case AgentType.IMAGE_ANALYZER: chat = imageAnalyzerChat; setHistory = setImageAnalyzerChatHistory; break;
        // FIX: Replaced `gisFile` with `gisChat` to correctly assign the Gemini chat instance for the GIS agent.
        case AgentType.GIS_AGENT: chat = gisChat; setHistory = setGisChatHistory; break;
        case AgentType.GPS_STAKEOUT: chat = gpsStakeoutChat; setHistory = setGpsStakeoutChatHistory; break;
        case AgentType.LSVZ_AGENT: chat = lsvzChat; setHistory = setLsvzChatHistory; break;
        case AgentType.CENTERLINE_STATIONING: chat = stationingChat; setHistory = setStationingChatHistory; break;
        case AgentType.POINT_EDITOR: chat = pointEditorChat; setHistory = setPointEditorChatHistory; break;
        // FIX: Add case for the new Contouring Agent to handle sending messages.
        case AgentType.CONTOURING_AGENT: chat = contouringChat; setHistory = setContouringChatHistory; break;
        case AgentType.STEEP_SLOPE_AGENT: chat = steepSlopeChat; setHistory = setSteepSlopeChatHistory; break;
        // FIX: Add case for the new Profile Agent to handle sending messages.
        case AgentType.PROFILE_AGENT: chat = profileChat; setHistory = setProfileChatHistory; break;
        case AgentType.COGO_AGENT: chat = cogoChat; setHistory = setCogoChatHistory; break;
        case AgentType.GNSS_AGENT: chat = rinexChat; setHistory = setRinexChatHistory; break;
        case AgentType.DRONE_AGENT: chat = droneChat; setHistory = setDroneChatHistory; break;
        case AgentType.ZONING_AGENT: chat = zoningChat; setHistory = setZoningChatHistory; break;
        case AgentType.TITLE_SEARCH: chat = titleSearchChat; setHistory = setTitleSearchChatHistory; break;
        case AgentType.CAD_MANAGER: chat = cadManagerChat; setHistory = setCadManagerChatHistory; break;
        case AgentType.STANDARDS_COMPLIANCE: chat = standardsComplianceChat; setHistory = setStandardsComplianceChatHistory; break;
        case AgentType.FLOOD_AGENT: return; // Flood Agent uses the FloatingPanel, not the chat box
        case AgentType.STRUCTURES_AGENT: chat = structuresChat; setHistory = setStructuresChatHistory; break;
        case AgentType.SOILS_AGENT: chat = soilsChat; setHistory = setSoilsChatHistory; break;
        case AgentType.AR_AGENT: return; // AR agent doesn't use chat
        case AgentType.FIELD_BOOK: return; // Field book uses notepad, not chat
        case AgentType.FILE_MANAGER: return; // File manager doesn't use chat
        case AgentType.TEXT_EDITOR: return; // Text editor doesn't use chat
        default: return;
    }

    // Auto-initialize chat on-demand if it hasn't been started yet
    if (!chat && setHistory && query.trim() !== '') {
      try {
        let initialFileContext: string | SessionFile | SessionFile[] = '';
        let initialTrainingContext: SessionFile | undefined;
        if (agent === AgentType.RAW_CRAWLER) initialFileContext = rawFile?.content || '';
        else if (agent === AgentType.CIVIL_DRAFTER) {
          initialFileContext = (planFiles && planFiles.length > 0) ? planFiles : (rawFile?.content || '');
          initialTrainingContext = dxfFile?.forTraining ? dxfFile : undefined;
        }
        else if (agent === AgentType.DEED_READER) initialFileContext = deedFile || { name: 'deed.txt', content: '' };
        else if (agent === AgentType.CIVIL_PLAN_EXPERT) initialFileContext = planFiles || [];
        else if (agent === AgentType.DXF_ANALYZER) initialFileContext = dxfFile?.content || '';
        else if (agent === AgentType.IMAGE_ANALYZER) initialFileContext = imageFiles || [];
        else if (agent === AgentType.GIS_AGENT) initialFileContext = gisFile?.content || '';
        else if (agent === AgentType.CENTERLINE_STATIONING) initialFileContext = clFile ? JSON.stringify(clFile, null, 2) : '';
        else if (agent === AgentType.TITLE_SEARCH) initialFileContext = deedFile || { name: 'title_search.txt', content: '' };

        const freshChat = startChatWithOverride(agent, initialFileContext, initialTrainingContext);
        chat = freshChat;

        switch (agent) {
          case AgentType.RAW_CRAWLER: setRawChat(freshChat); break;
          case AgentType.CIVIL_DRAFTER: setCivilDrafterChat(freshChat); break;
          case AgentType.DEED_READER: setDeedChat(freshChat); break;
          case AgentType.CIVIL_PLAN_EXPERT: setPlanExpertChat(freshChat); break;
          case AgentType.DXF_ANALYZER: setDxfChat(freshChat); break;
          case AgentType.IMAGE_ANALYZER: setImageAnalyzerChat(freshChat); break;
          case AgentType.GIS_AGENT: setGisChat(freshChat); break;
          case AgentType.GPS_STAKEOUT: setGpsStakeoutChat(freshChat); break;
          case AgentType.LSVZ_AGENT: setLsvzChat(freshChat); break;
          case AgentType.CENTERLINE_STATIONING: setStationingChat(freshChat); break;
          case AgentType.POINT_EDITOR: setPointEditorChat(freshChat); break;
          case AgentType.CONTOURING_AGENT: setContouringChat(freshChat); break;
          case AgentType.STEEP_SLOPE_AGENT: setSteepSlopeChat(freshChat); break;
          case AgentType.PROFILE_AGENT: setProfileChat(freshChat); break;
          case AgentType.COGO_AGENT: setCogoChat(freshChat); break;
          case AgentType.GNSS_AGENT: setRinexChat(freshChat); break;
          case AgentType.DRONE_AGENT: setDroneChat(freshChat); break;
          case AgentType.ZONING_AGENT: setZoningChat(freshChat); break;
          case AgentType.TITLE_SEARCH: setTitleSearchChat(freshChat); break;
          case AgentType.CAD_MANAGER: setCadManagerChat(freshChat); break;
          case AgentType.STANDARDS_COMPLIANCE: setStandardsComplianceChat(freshChat); break;
          case AgentType.STRUCTURES_AGENT: setStructuresChat(freshChat); break;
          case AgentType.SOILS_AGENT: setSoilsChat(freshChat); break;
        }
        setInitializedAgents(prev => new Set(prev).add(agent));
      } catch (initErr: any) {
        const initErrMsg = initErr?.message || String(initErr);
        console.error(`[handleSendMessage] Failed to auto-initialize chat for ${agent}:`, initErrMsg);
        setError(initErrMsg);
        addNotification({
          kind: 'api-key',
          severity: 'error',
          title: 'Chat Initialization Failed',
          message: initErrMsg,
        });
        setHistory(prev => [
          ...prev,
          { role: MessageRole.USER, text: query },
          { role: MessageRole.MODEL, text: `⚠️ **Could not initialize AI chat session.**\n\n${initErrMsg}` }
        ]);
        return;
      }
    }
    
    console.log('[handleSendMessage] chat:', chat, 'setHistory:', !!setHistory, 'query:', query);
    
    if (!chat || query.trim() === '' || !setHistory) {
      console.log('[handleSendMessage] Exiting early - chat:', !!chat, 'query valid:', query.trim() !== '', 'setHistory:', !!setHistory);
      return;
    }

    // -- CIVIL DRAFTER: context management --------------------------------
    // The chat objects re-send their full history on every turn. With a large
    // point database and vision imagery attached to each draw request, that
    // history grows until the input exceeds the model's token window (a 400
    // "input exceeds maximum tokens" error) after several back-to-back draws.
    // When enabled, rebuild the chat so each draw (or every N turns) starts
    // from a clean context: system prompt + point database + imagery + the one
    // new instruction. Rebuilding is the uniform way to clear history across
    // the Gemini SDK, Vertex, and Claude chat implementations.
    if (agent === AgentType.CIVIL_DRAFTER) {
      const cdCtx = getCivilDrafterContextConfig();
      if (cdCtx) {
        civilDrafterTurnsSinceResetRef.current += 1;
        const drawIntent = isDrawIntent(query);
        const hitTurnLimit = cdCtx.autoResetTurns > 0
          && civilDrafterTurnsSinceResetRef.current > cdCtx.autoResetTurns;
        const wantReset = (cdCtx.freshContextPerDraw && drawIntent) || hitTurnLimit;
        const cdFileContext: string | SessionFile[] | null =
          (planFiles && planFiles.length > 0) ? planFiles
          : (rawFile ? rawFile.content : null);
        if (wantReset && cdFileContext !== null) {
          const cdTraining = dxfFile?.forTraining ? dxfFile : undefined;
          const freshChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, cdFileContext, cdTraining);
          setCivilDrafterChat(freshChat);
          chat = freshChat;
          civilDrafterTurnsSinceResetRef.current = 1;
          const fixedTextChars = typeof cdFileContext === 'string'
            ? cdFileContext.length
            : cdFileContext.reduce((total, file) => total + (file.content?.length ?? 0), 0);
          setCivilDrafterContextVolume(previous => ({
            ...EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
            fixedTextChars,
            resetCount: previous.resetCount + 1,
          }));
          logActionToFieldbook('Civil Drafter context reset � this request runs with a clean conversation.');
        }
      }
    }

    if (agent === AgentType.STANDARDS_COMPLIANCE) {
      const lowered = query.toLowerCase();
      if (lowered.includes('last report') || lowered.includes('latest report')) {
        const userMessage: ChatMessage = { role: MessageRole.USER, text: query };
        const modelText = standardsComplianceLastReport
          ? formatComplianceReportText(standardsComplianceLastReport)
          : 'No compliance report is available yet. Ask me to run compliance first.';
        setHistory(prev => [...prev, userMessage, { role: MessageRole.MODEL, text: modelText }]);
        return;
      }

      const shouldRunAudit = /(run|audit|check|validate)\s+(compliance|standards)|run\s+compliance|check\s+compliance/.test(lowered);
      if (shouldRunAudit) {
        const requestedMode =
          lowered.includes('cad manager') || lowered.includes('cad-manager') ? 'cad-manager' :
          lowered.includes('control') ? 'control-pdf' :
          lowered.includes('combined') || lowered.includes('both') ? 'combined' :
          null;

        if (!standardsComplianceSubjectFile) {
          const userMessage: ChatMessage = { role: MessageRole.USER, text: query };
          setHistory(prev => [...prev, userMessage, {
            role: MessageRole.MODEL,
            text: 'No subject PDF is loaded. Use Add Data to upload the subject file before running compliance.',
          }]);
          return;
        }

        if (standardsComplianceSourceMode === 'ask-each-run' && !requestedMode) {
          const userMessage: ChatMessage = { role: MessageRole.USER, text: query };
          setHistory(prev => [...prev, userMessage, {
            role: MessageRole.MODEL,
            text: 'Source mode is set to ask each run. Reply with one of: "run compliance using CAD Manager", "run compliance using control PDF", or "run compliance using combined mode".',
          }]);
          return;
        }

        const modeToRun = requestedMode || standardsComplianceSourceMode;
        const report = (await runVisualComplianceAudit(modeToRun)) ?? buildStandardsComplianceReport(modeToRun);
        const userMessage: ChatMessage = { role: MessageRole.USER, text: query };
        if (!report) {
          setHistory(prev => [...prev, userMessage, {
            role: MessageRole.MODEL,
            text: 'Could not run compliance because required intake data is incomplete.',
          }]);
          return;
        }

        setStandardsComplianceLastReport(report);
        setHistory(prev => [...prev, userMessage, {
          role: MessageRole.MODEL,
          text: formatComplianceReportText(report),
        }]);
        return;
      }
    }

    stopGenerationRef.current = false;
    const userMessage: ChatMessage = { role: MessageRole.USER, text: query };
    setHistory(prev => [...prev, userMessage, { role: MessageRole.MODEL, text: '' }]);
    setIsLoading(true);
    setError(null);
    
    let context = '';
    let queryPrefix = '';
    const activeCL = (agent === AgentType.CENTERLINE_STATIONING && centerlines.length > 0) ? centerlines[0] : null;
    // Only include lists the user has opted into agent context (undefined = included by default).
    const contextPointLists = pointLists.filter(l => l.includeInContext !== false);

    if (agent === AgentType.LSVZ_AGENT) {
        // FIX: In `handleSendMessage`, add `contourLabels`, `profileChatHistory`, `profileData`, and `profileInfo` to the session context for the LSVZ agent to resolve a TypeScript error.
        const currentSessionForAgent: Omit<SessionState, 'version' | 'savedAt'> = {
            rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, generatedFiles, jobInfo, settings, rawChatHistory,
            deedChatHistory, civilDrafterChatHistory, dxfChatHistory, stationingChatHistory, pointEditorChatHistory,
            fieldbookChatHistory: fieldbookLog, gpsStakeoutChatHistory, lsvzChatHistory, planExpertChatHistory,
            imageAnalyzerChatHistory, gisChatHistory, contouringChatHistory, profileChatHistory, cogoChatHistory, rinexChatHistory, zoningChatHistory, fieldbookNotes, pointLists, lines, contourLabels, centerlines, cutSheetData, cutSheetInfo,
            profileData, profileInfo,
            closureReports,
            gisFeatures, // Added gisFeatures
            pdfViewerFiles, pdfHighlights: highlights, offlineMapAreas,
            wmsServices, activeWmsLayers,
            customSymbols,
            uiState: {
                activeAgent, activeModel, activeVisualPanel, isPdfViewerFullscreen, isVisualPanelFullscreen,
                attributeScale, lineLabelScale, dimensionScale, symbolScale, pointLayers, activeTextEditorFile,
                isPointEditorFullscreen: false, isChatPanelVisible,
                linesVisible,
                centerlinesVisible,
            }
        };

        const contextSelectorModel = activeModel.startsWith('gemini-') ? activeModel : CURRENT_GEMINI_MODEL;
        const requiredSources = await selectContextSources(query, contextSelectorModel, settings.userApiKey);
        logActionToFieldbook(`LSVZ agent identified required data sources for query: [${requiredSources.join(', ')}]`);

        const { lsvzChatHistory: _, ...sessionForContext } = currentSessionForAgent;
        context = `---BEGIN CURRENT SESSION STATE---\n${getDynamicLsvzContext(sessionForContext, requiredSources)}\n---END CURRENT SESSION STATE---\n\n`;
        if (activeVisualPanel === 'texteditor' && activeTextEditorFile) {
            context += `---BEGIN CURRENTLY OPEN TEXT FILE (${activeTextEditorFile})---\n${textEditorContent}\n---END CURRENTLY OPEN TEXT FILE---\n\n`;
        }

    } else if (agent === AgentType.CENTERLINE_STATIONING) {
        if (activeCL) {
            context = `---BEGIN CENTERLINE DATA---\n${JSON.stringify(activeCL, null, 2)}\n---END CENTERLINE DATA---\n\n`;
        }
        // Make point context public - always include point database for all agents
        context += `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.POINT_EDITOR) {
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.DEED_READER) {
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.CONTOURING_AGENT) {
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.STEEP_SLOPE_AGENT) {
      context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
      context += `---BEGIN INCLUSION BOUNDARIES---\n${JSON.stringify(inclusionBoundaries, null, 2)}\n---END INCLUSION BOUNDARIES---\n\n`;
    } else if (agent === AgentType.PROFILE_AGENT) {
        // Exclude contour/ESRI lines � they can contain tens of thousands of segments
        // and blow the token budget. The profile is computed locally from survey points;
        // the agent only needs to know point numbers and centerline geometry.
        const profileLines = lines.filter(l => !l.type?.startsWith('contour') && l.layer !== 'ESRI-CONTOUR');
        context = `---BEGIN PROJECT DATA---\n${JSON.stringify({ pointLists: contextPointLists, lines: profileLines, centerlines }, null, 2)}\n---END PROJECT DATA---\n\n`;
    } else if (agent === AgentType.RAW_CRAWLER) {
        // RAW_CRAWLER (COGO agent) - make point context public and always available
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.GIS_AGENT) {
        // Include summarized GIS features and WMS layers
        if (gisFeatures && gisFeatures.length > 0) {
             context = GisService.getGisContext(gisFeatures) + "\n\n";
        }
        // Also include point database
        context += `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
        
        // Include WMS info
        if (activeWmsLayers.length > 0) {
             context += `---BEGIN ACTIVE WMS LAYERS---\n${JSON.stringify(activeWmsLayers, null, 2)}\n---END ACTIVE WMS LAYERS---\n\n`;
        }
    } else if (agent === AgentType.COGO_AGENT) {
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.GNSS_AGENT || agent === AgentType.DRONE_AGENT) {
      // GNSS and Drone agents have their own context handling
    } else if (agent === AgentType.CIVIL_DRAFTER) {
        // Civil Drafter gets the full point database so it can reference session points
        // in addition to the uploaded file content baked into its system prompt.
        // The context panel can suppress this large per-turn block to shrink requests.
        const cdCtx = getCivilDrafterContextConfig();
        if (!cdCtx || cdCtx.includePointDatabase) {
            context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
        }
    } else if (agent === AgentType.DXF_ANALYZER || agent === AgentType.CIVIL_PLAN_EXPERT || agent === AgentType.IMAGE_ANALYZER) {
        // Make point context public for all data analysis agents
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.STRUCTURES_AGENT || agent === AgentType.SOILS_AGENT) {
        // Structures and Soils agents need the full point database for spatial matching
        context = `---BEGIN POINT DATABASE---\n${JSON.stringify(contextPointLists, null, 2)}\n---END POINT DATABASE---\n\n`;
    } else if (agent === AgentType.STANDARDS_COMPLIANCE) {
      context = `---BEGIN STANDARDS COMPLIANCE INTAKE---\n${JSON.stringify({
        sourceMode: standardsComplianceSourceMode,
        checks: standardsComplianceChecks,
        controlFileName: standardsComplianceControlFile?.name ?? null,
        subjectFileName: standardsComplianceSubjectFile?.name ?? null,
        hasControlFile: !!standardsComplianceControlFile,
        hasSubjectFile: !!standardsComplianceSubjectFile,
        cadStandardLoaded: !!cadManagerContext.state.standard,
      }, null, 2)}\n---END STANDARDS COMPLIANCE INTAKE---\n\n`;
      if (standardsComplianceLastReport) {
        context += `---BEGIN LAST COMPLIANCE REPORT---\n${JSON.stringify(standardsComplianceLastReport, null, 2)}\n---END LAST COMPLIANCE REPORT---\n\n`;
      }
    } else if (agent === AgentType.ZONING_AGENT) {
        // Include zoning search context
        const zoningInfo: Record<string, string> = {};
        if (zoningState) zoningInfo.state = zoningState;
        if (zoningPlace) zoningInfo.place = zoningPlace;
        if (zoningPlaceType) zoningInfo.placeType = zoningPlaceType;
        if (zoningDistrict) zoningInfo.district = zoningDistrict;
        if (zoningMapUrl) zoningInfo.mapUrl = zoningMapUrl;
        
        context = `---BEGIN ZONING INFORMATION---\n${JSON.stringify(zoningInfo, null, 2)}\n---END ZONING INFORMATION---\n\n`;
        context += `You are a zoning research assistant. Your job is to help users understand zoning regulations for their property. Search the web for official zoning ordinances and provide accurate information about setbacks, building heights, permitted uses, lot coverage, parking requirements, and other zoning restrictions.\n\n`;
    } else if (agent === AgentType.GPS_STAKEOUT && currentPosition) {
        const { latitude, longitude, altitude } = currentPosition.coords;
        queryPrefix = `My current GPS location is Latitude: ${latitude.toFixed(8)}, Longitude: ${longitude.toFixed(8)}, Altitude: ${(altitude ?? 0).toFixed(2) ?? 'N/A'}. All project points are already in the correct coordinate system. \n\n`;
    }
    
    let fullResponse = '';
    let queryToSend: string | Part[] = context + queryPrefix + query;

    // -- CIVIL DRAFTER: GIMBAL VISION SURVEY ----------------------------------
    // When the user sends a draw-intent message to the Civil Drafter and there
    // are survey points loaded, we render the scene at multiple zoom levels and
    // inject the resulting PNG frames as Gemini Vision inlineData Parts.  This
    // gives the model spatial context it would otherwise never have.
    if (agent === AgentType.CIVIL_DRAFTER && points.length > 0 && isDrawIntent(query) && (getCivilDrafterContextConfig()?.attachVisionImagery ?? true)) {
        // Decide whether to re-scan: first time, or point set changed >5 %
        const prevCount  = lastVisionPointCountRef.current;
        const needScan   = !civilDrafterVisionSurvey
            || Math.abs(points.length - prevCount) / Math.max(prevCount, 1) > 0.05;

        let activeSurvey = civilDrafterVisionSurvey;

        if (needScan) {
            setIsVisionScanning(true);
            setShowVisionHUD(true);
            try {
                activeSurvey = await captureVisionSurvey(points, visibleLines);
                setCivilDrafterVisionSurvey(activeSurvey);
                lastVisionPointCountRef.current = points.length;
            } catch (visionErr) {
                console.warn('[CivilDrafterVision] scan failed:', visionErr);
                activeSurvey = null;
            } finally {
                setIsVisionScanning(false);
            }
        }

        // Best-effort NAIP aerial of the survey extent � fetched once per scan and
        // cached so every draw request carries georeferenced imagery as reference.
        const projEpsg = settings.projection?.epsg;
        if ((needScan || !visionAerialRef.current) && typeof projEpsg === 'number') {
            if (needScan) visionAerialRef.current = null;
            try {
                let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
                for (const p of points) {
                    if (!Number.isFinite(p.easting) || !Number.isFinite(p.northing)) continue;
                    if (p.easting < minE) minE = p.easting;
                    if (p.easting > maxE) maxE = p.easting;
                    if (p.northing < minN) minN = p.northing;
                    if (p.northing > maxN) maxN = p.northing;
                }
                if (Number.isFinite(minE) && maxE > minE && maxN > minN) {
                    const padX = Math.max((maxE - minE) * 0.1, 25);
                    const padY = Math.max((maxN - minN) * 0.1, 25);
                    const w = (maxE - minE) + padX * 2;
                    const h = (maxN - minN) + padY * 2;
                    // LOW-RES on purpose: the gimbal aerial is only for rough
                    // feature identification (roads/buildings/tree lines), so a
                    // small tile keeps image tokens cheap. AutoDraft attaches its
                    // own high-res imagery when precise rectification is needed.
                    const pxScale = 640 / Math.max(w, h);
                    const naip = await getStaticMap({
                        lat: 0, lng: 0,
                        maptype: 'naip',
                        projectedBbox: [minE - padX, minN - padY, maxE + padX, maxN + padY],
                        sr: projEpsg,
                        width: Math.max(128, Math.round(w * pxScale)),
                        height: Math.max(128, Math.round(h * pxScale)),
                    }, { geminiKey: settings.userApiKey, mapsKey: settings.googleMaps?.apiKey });
                    visionAerialRef.current = [{
                        mimeType: naip.mimeType,
                        data: naip.base64,
                        label: 'NAIP aerial � full survey extent, north up, same coordinate frame as the survey. Low resolution: use it only for rough feature identification (road corridors, building locations, tree lines), not precise geometry.',
                    }];
                }
            } catch (aerialErr) {
                console.warn('[CivilDrafterVision] aerial reference fetch failed:', aerialErr);
            }
        }

        if (activeSurvey && activeSurvey.frames.length > 0) {
            // Skip the cached aerial when Auto Draft imagery is already queued for
            // this message (it rides along separately below) to avoid duplicates.
            const aerial = pendingAutoDraftImagesRef.current.length > 0
                ? []
                : (visionAerialRef.current ?? []);
            queryToSend = buildVisionParts(activeSurvey, query, context + queryPrefix, aerial) as Part[];
        }
    }
    // -------------------------------------------------------------------------

    if (agent === AgentType.IMAGE_ANALYZER && imageFiles && imageFiles.length > 0) {
        const parts: Part[] = [{ text: query }];
        const filenameRegex = new RegExp(`\\b(${imageFiles.map(f => f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
        const mentionedFiles = query.match(filenameRegex) || [];
        const uniqueMentionedFiles = [...new Set(mentionedFiles)];

        let filesToSend: SessionFile[] = [];

        if (uniqueMentionedFiles.length > 0) {
            filesToSend = imageFiles.filter(f => uniqueMentionedFiles.some(mf => mf.toLowerCase() === f.name.toLowerCase()));
        } else {
            filesToSend = imageFiles;
        }

        for (const file of filesToSend) {
            if (file.fileData) {
                const [header, base64Data] = file.fileData.split(',');
                const mimeTypeMatch = header.match(/:(.*?);/);
                if (mimeTypeMatch && mimeTypeMatch[1] && base64Data) {
                    parts.push({
                        inlineData: {
                            mimeType: mimeTypeMatch[1],
                            data: base64Data
                        }
                    });
                }
            }
        }
        if (parts.length > 1) {
            queryToSend = parts;
        }
    }

    if ((agent === AgentType.DEED_READER && deedFile?.rasterImageData) || (agent === AgentType.CIVIL_PLAN_EXPERT && planFiles?.some(f => f.rasterImageData)) || (agent === AgentType.STANDARDS_COMPLIANCE && (standardsComplianceSubjectFile?.rasterImageData || standardsComplianceControlFile?.rasterImageData))) {
        const parts: Part[] = [{ text: query }];
        const filesToProcess: SessionFile[] = [];

        if (agent === AgentType.DEED_READER && deedFile) {
            filesToProcess.push(deedFile);
        } else if (agent === AgentType.CIVIL_PLAN_EXPERT && planFiles) {
            filesToProcess.push(...planFiles);
        } else if (agent === AgentType.STANDARDS_COMPLIANCE) {
            // Control pages first (reference), then subject pages, so free-form
            // follow-up chat questions can also visually compare both documents.
            if (standardsComplianceControlFile) filesToProcess.push(standardsComplianceControlFile);
            if (standardsComplianceSubjectFile) filesToProcess.push(standardsComplianceSubjectFile);
        }

        for (const file of filesToProcess) {
            if (file.rasterImageData && Array.isArray(file.rasterImageData)) {
                for (const imageData of file.rasterImageData) {
                    const [header, base64Data] = imageData.split(',');
                    const mimeTypeMatch = header.match(/:(.*?);/);
                    if (mimeTypeMatch && mimeTypeMatch[1] && base64Data) {
                        parts.push({
                            inlineData: {
                                mimeType: mimeTypeMatch[1],
                                data: base64Data
                            }
                        });
                    }
                }
            }
        }
        
        if (parts.length > 1) {
            queryToSend = parts;
        }
    }

    // -- CIVIL DRAFTER: AUTO-DRAFT MAP IMAGERY ----------------------------
    // Satellite / roadmap tiles queued by the Auto Draft orchestrator ride along
    // with this message as Vision parts, then the queue is cleared.
    if (agent === AgentType.CIVIL_DRAFTER && pendingAutoDraftImagesRef.current.length > 0) {
        const imgs = pendingAutoDraftImagesRef.current;
        pendingAutoDraftImagesRef.current = [];
        const imageParts: Part[] = imgs.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.data } }));
        queryToSend = typeof queryToSend === 'string'
            ? [{ text: queryToSend }, ...imageParts]
            : [...queryToSend, ...imageParts];
    }

    let civilDrafterRequestVolume: Pick<
      CivilDrafterContextVolume,
      'lastRequestTextChars' | 'lastRequestImageBytes' | 'lastRequestImageCount'
    > | null = null;
    let civilDrafterRequestCompleted = false;
    if (agent === AgentType.CIVIL_DRAFTER) {
      const parts = typeof queryToSend === 'string' ? [{ text: queryToSend }] : queryToSend;
      let requestTextChars = 0;
      let requestImageBytes = 0;
      let requestImageCount = 0;
      for (const part of parts) {
        if ('text' in part && typeof part.text === 'string') {
          requestTextChars += part.text.length;
        }
        if ('inlineData' in part && part.inlineData?.data) {
          requestImageCount += 1;
          requestImageBytes += Math.floor(part.inlineData.data.length * 3 / 4);
        }
      }
      civilDrafterRequestVolume = {
        lastRequestTextChars: requestTextChars,
        lastRequestImageBytes: requestImageBytes,
        lastRequestImageCount: requestImageCount,
      };
      const fixedTextChars = (planFiles && planFiles.length > 0)
        ? planFiles.reduce((total, file) => total + (file.content?.length ?? 0), 0)
        : (rawFile?.content.length ?? 0);
      setCivilDrafterContextVolume(previous => ({
        ...previous,
        fixedTextChars: previous.fixedTextChars || fixedTextChars,
        ...civilDrafterRequestVolume,
      }));
    }

    let skipFinallyUpdate = false; // Flag to prevent finally block from overwriting early returns
    
    try {
      console.log('[handleSendMessage] Sending message to chat.sendMessageStream...');
      
      // For Zoning Agent: inject jurisdiction context so Google Search grounding has proper scope
      if (agent === AgentType.ZONING_AGENT) {
        const jurisdiction = [zoningPlace, zoningCounty ? `${zoningCounty} County` : null, zoningState].filter(Boolean).join(', ');
        const districtCtx = zoningDistrict ? ` Zoning district: ${zoningDistrict}.` : '';
        queryToSend = `${context}Jurisdiction: ${jurisdiction}.${districtCtx}\n\nUser question: ${query}`;
      }
      
      const responseStream = await chat.sendMessageStream({ message: queryToSend });
      console.log('[handleSendMessage] Got response stream, processing chunks...');

      // Streaming preview throttle � re-parse partial JSON at most every ~120ms.
      // Cheap enough to run on every chunk for short responses but caps CPU on
      // long deed traverses with hundreds of points/lines.
      let lastPreviewAt = 0;
      let lastPreviewPointCount = 0;
      let lastPreviewLineCount = 0;

      for await (const chunk of responseStream) {
        if (stopGenerationRef.current) {
          break;
        }
        const chunkText = chunk.text;
        fullResponse += chunkText;
        setHistory(prev => {
            const newHistory = [...prev];
            const lastMessage = newHistory[newHistory.length - 1];
            if (lastMessage && lastMessage.role === MessageRole.MODEL) {
                lastMessage.text += chunkText;
            }
            return newHistory;
        });

        // Live canvas preview: pull whatever complete point/line objects exist
        // in the partial JSON so far. Throttled, idempotent, fault-tolerant.
        // v26.05.25.2 � suppress streaming preview for DEED_READER. Deed
        // traverses are previewed exclusively through the amber BoundaryFile
        // overlay (the canonical "Boundary Object"), so injecting intermediate
        // streaming points caused a brief flash of mis-located vertices with
        // bearing/distance labels before the final BF replaced them. The user
        // only ever wants to see the amber overlay during Compute, and the
        // styled SurveyPoints once they press Draft (Commit).
        const now = Date.now();
        if (now - lastPreviewAt > 120 && agent !== AgentType.DEED_READER) {
          lastPreviewAt = now;
          try {
            const { points: livePts, lines: liveLines } = extractStreamingPointsAndLines(fullResponse);
            if (livePts.length !== lastPreviewPointCount) {
              lastPreviewPointCount = livePts.length;
              const coerced: SurveyPoint[] = livePts
                .filter(p => p && (p.northing !== undefined || p.latitude !== undefined) && (p.easting !== undefined || p.longitude !== undefined))
                .map((p, idx) => ({
                  pointNumber: String(p.pointNumber ?? p.id ?? `STREAM-${idx}`),
                  northing: Number(p.northing ?? 0),
                  easting: Number(p.easting ?? 0),
                  elevation: p.elevation !== undefined ? Number(p.elevation) : 0,
                  description: p.description ? String(p.description) : '',
                  layer: p.layer ? String(p.layer) : undefined,
                }));
              setStreamPreviewPoints(coerced);
            }
            if (liveLines.length !== lastPreviewLineCount) {
              lastPreviewLineCount = liveLines.length;
              const coerced: SurveyLine[] = liveLines
                .filter(l => l && l.from !== undefined && l.to !== undefined)
                .map(l => {
                  const isCirc = Boolean(l.isCircle) || (l.from === l.to && Boolean(l.isCurve) && l.curveRadius !== undefined);
                  return {
                    from: String(l.from),
                    to: String(l.to),
                    bearing: l.bearing ? String(l.bearing) : undefined,
                    distance: l.distance !== undefined ? String(l.distance) : undefined,
                    isCurve: Boolean(l.isCurve) || isCirc,
                    isCircle: isCirc,
                    circleCenter: l.circleCenter,
                    curveRadius: l.curveRadius !== undefined ? Number(l.curveRadius) : undefined,
                    arcLength: l.arcLength !== undefined ? Number(l.arcLength) : (isCirc && l.curveRadius ? 2 * Math.PI * Number(l.curveRadius) : undefined),
                    chordBearing: l.chordBearing ? String(l.chordBearing) : undefined,
                    curveDirection: l.curveDirection === 'left' || l.curveDirection === 'right' ? l.curveDirection : undefined,
                    layer: l.layer ? String(l.layer) : undefined,
                    lineType: l.lineType ? String(l.lineType) : undefined,
                  };
                });
              setStreamPreviewLines(coerced);
            }
          } catch {
            // Streaming preview is best-effort � never let it abort the chat.
          }
        }
      }
      civilDrafterRequestCompleted = !stopGenerationRef.current;
      
      console.log('[handleSendMessage] Finished processing chunks. Full response length:', fullResponse.length);

      // -----------------------------------------------------------------
      // LandSurv Claw � browser-automation tool loop (Zoning Agent only)
      // -----------------------------------------------------------------
      // If the agent emitted one or more ```claw fences in its turn, execute
      // them against the Claw MCP server (via /api/claw proxy), feed the
      // results back as a synthetic user turn, and re-stream. Capped so a
      // misbehaving model can't burn the page.
      if (agent === AgentType.ZONING_AGENT) {
        const MAX_CLAW_HOPS = 3;
        for (let hop = 0; hop < MAX_CLAW_HOPS; hop++) {
          if (stopGenerationRef.current) break;
          const directives = parseClawDirectives(fullResponse);
          console.log(`[Claw] hop ${hop}: detected ${directives.length} directive(s)`, directives.map(d => d.tool));
          if (directives.length === 0) break;

          let toolBlock: string | null = null;
          try {
            toolBlock = await runClawDirectives(fullResponse);
          } catch (e: any) {
            toolBlock = `Claw tool error: ${e?.message || e}`;
          }
          if (!toolBlock) break;

          // Reuse the active MODEL bubble � overwrite its text with the new
          // hop's output. Per-hop bubbles flooded the chat with empties.
          let hopResponse = '';
          try {
            const followStream = await chat.sendMessageStream({ message: toolBlock });
            for await (const chunk of followStream) {
              if (stopGenerationRef.current) break;
              const t = chunk.text;
              hopResponse += t;
              setHistory(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === MessageRole.MODEL) last.text = hopResponse;
                return next;
              });
            }
          } catch (e: any) {
            console.error('[Claw hop] follow-up stream failed:', e);
            break;
          }
          fullResponse = hopResponse;
        }

        // Synthesis fallback � if the loop exited with no visible prose
        // (model burned all hops on directives, or every page 403'd), ask
        // the model one final time with NO tools allowed so the user always
        // sees an answer instead of the "Researching�" placeholder.
        if (!stopGenerationRef.current && !sanitizeZoningAnswer(fullResponse)) {
          try {
            const synthMsg = '[SYNTHESIS REQUIRED] You exhausted your Claw browser hops or some pages failed (e.g., 403 Cloudflare). Write the FINAL answer NOW from whatever data you have so far. Do NOT emit any more ```claw``` directives. If some numbers could not be verified, say so plainly and cite what you DID find. End with the ```json``` block per schema.';
            let synthResp = '';
            const synthStream = await chat.sendMessageStream({ message: synthMsg });
            for await (const chunk of synthStream) {
              if (stopGenerationRef.current) break;
              const t = chunk.text;
              synthResp += t;
              setHistory(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === MessageRole.MODEL) last.text = synthResp;
                return next;
              });
            }
            fullResponse = synthResp;
          } catch (e) {
            console.error('[Claw] synthesis fallback failed:', e);
          }
        }

        // Pin any structured zoning data the model emitted so other agents
        // (Boundary, Civil Drafter, �) can reuse it via CACP + KnowledgeBase
        // without re-asking. Same shape as the inter-agent CACP handler.
        try {
          const parsed = extractZoningJsonBlock(fullResponse);
          if (parsed) {
            interAgentComm.cacheResult(
              'get_zoning_requirements',
              { state: zoningState, county: zoningCounty, municipality: zoningPlace, district: zoningDistrict || '' },
              parsed,
              AgentType.ZONING_AGENT,
              600_000
            );
            extractZoningFacts(parsed, { state: zoningState, county: zoningCounty, municipality: zoningPlace, district: zoningDistrict });
            console.log('[Zoning] chat answer pinned facts to KB', parsed);
          }
        } catch (kbErr) {
          console.warn('[Zoning] chat KB pin failed:', kbErr);
        }

        // ----------------------------------------------------------------
        // DETERMINISTIC SOURCE VERIFICATION (option A: verify-then-cite)
        // The answer is freeform synthesis, but DIRECT DOCUMENT links the
        // model cites (PDFs / images � the real hallucination risk) are run
        // through our proxy probe. Any that don't resolve to a real document
        // are stripped from the visible answer and summarized in a footer.
        // We deliberately DO NOT touch plain HTML page citations or Google
        // grounding-redirect URLs: the proxy only serves PDF/image, so it
        // can't validate ordinary web pages, and stripping them would gut
        // legitimate sources. Only verifiable file links are gated here.
        // FUTURE UPGRADE (option B): retrieve-then-synthesize � fetch the
        // verified ordinance text first and ground the answer strictly in it.
        // ----------------------------------------------------------------
        if (!stopGenerationRef.current && fullResponse) {
          try {
            const urlRe = /https?:\/\/[^\s"'`)<>\]}]+/gi;
            const allUrls = Array.from(new Set((fullResponse.match(urlRe) || []).map(u => u.replace(/[.,;:!?)\]}>"']+$/, ''))));
            // Only verify direct document links; leave HTML pages + grounding
            // redirects (vertexaisearch) untouched.
            const docUrls = allUrls.filter(u =>
              /\.(pdf|png|jpe?g|webp|gif|tiff?)(\?|#|$)/i.test(u) &&
              !/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/i.test(u)
            );
            if (docUrls.length > 0) {
              const verifyOne = async (u: string): Promise<boolean> => {
                try {
                  const r = await fetch(`/api/proxy-fetch?probe=1&url=${encodeURIComponent(u)}`, { method: 'GET', signal: AbortSignal.timeout(10_000) });
                  if (!r.ok) { try { await r.body?.cancel(); } catch { /* ignore */ } return false; }
                  try { const j = await r.json(); return j?.ok !== false; } catch { try { await r.body?.cancel(); } catch { /* ignore */ } return true; }
                } catch { return false; }
              };
              const results = await Promise.all(docUrls.map(async u => ({ u, ok: await verifyOne(u) })));
              const dead = results.filter(r => !r.ok).map(r => r.u);
              if (dead.length > 0) {
                let cleaned = fullResponse;
                for (const u of dead) {
                  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // Markdown links: [text](deadUrl) ? text _(unverified � removed)_
                  cleaned = cleaned.replace(new RegExp(`\\[([^\\]]+)\\]\\(${esc}\\)`, 'g'), '$1 _(unverified � removed)_');
                  // Bare occurrences elsewhere.
                  cleaned = cleaned.split(u).join('_(unverified link removed)_');
                }
                const verifiedCount = results.length - dead.length;
                cleaned += `\n\n> ?? ${dead.length} cited document link${dead.length === 1 ? '' : 's'} could not be verified and ${dead.length === 1 ? 'was' : 'were'} removed${verifiedCount ? ` � ${verifiedCount} verified` : ''}.`;
                fullResponse = cleaned;
                setHistory(prev => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === MessageRole.MODEL) last.text = cleaned;
                  return next;
                });
                console.log('[Zoning] source verification: removed', dead.length, 'unreachable document link(s)', dead);
              } else {
                console.log('[Zoning] source verification: all', docUrls.length, 'cited document link(s) reachable');
              }
            }
          } catch (verErr) {
            console.warn('[Zoning] source verification failed:', verErr);
          }
        }
      }

    } catch (err) {
      skipFinallyUpdate = true;
      if (stopGenerationRef.current) {
        console.log("Stream stopped by user.");
      } else {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`An unexpected error occurred: ${errorMessage}`);
        const modelErrorMessage: ChatMessage = { role: MessageRole.MODEL, text: `⚠️ **I encountered an error trying to process your request.**\n\n${errorMessage}` };
        setHistory(prev => {
           const newHistory = [...prev];
           const lastMessageIndex = newHistory.length - 1;
           if(lastMessageIndex >= 0 && newHistory[lastMessageIndex].role === MessageRole.MODEL) {
               newHistory[lastMessageIndex] = modelErrorMessage;
               return newHistory;
           }
            return [...prev, modelErrorMessage];
        });
      }
    } finally {
      if (agent === AgentType.CIVIL_DRAFTER && civilDrafterRequestCompleted && civilDrafterRequestVolume) {
        setCivilDrafterContextVolume(previous => ({
          ...previous,
          retainedTextChars: previous.retainedTextChars
            + civilDrafterRequestVolume.lastRequestTextChars
            + fullResponse.length,
          retainedImageBytes: previous.retainedImageBytes + civilDrafterRequestVolume.lastRequestImageBytes,
          retainedImageCount: previous.retainedImageCount + civilDrafterRequestVolume.lastRequestImageCount,
          retainedTurns: previous.retainedTurns + 1,
        }));
      }
      setIsLoading(false);
      const wasStopped = stopGenerationRef.current;
      stopGenerationRef.current = false;

      // Check if response was empty (e.g. model produced no text or stream ended prematurely)
      if (!wasStopped && !skipFinallyUpdate && fullResponse.trim() === '') {
        skipFinallyUpdate = true;
        const emptyMsg = `⚠️ **No response received from the model.**\n\n- If running locally with Vertex AI, ensure backend ADC credentials (or GCP_PROJECT_ID) are configured, or switch to direct API keys in **Settings → AI Provider Keys**.\n- If using high-reasoning models, the output token limit may have been consumed during thinking.`;
        setHistory(prev => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === MessageRole.MODEL) {
            next[lastIndex] = { role: MessageRole.MODEL, text: emptyMsg };
          }
          return next;
        });
        addNotification({
          kind: 'ai',
          severity: 'warning',
          title: 'Empty Model Response',
          message: 'The model returned 0 output tokens. Check API keys, backend connectivity, or reasoning limits.',
        });
      }

      // Tear down the live preview overlay � either the authoritative parser
      // below commits real points/lines (replacing the preview), or there's
      // no JSON to commit, in which case the preview was transient artifacts.
      setStreamPreviewPoints([]);
      setStreamPreviewLines([]);

      const delimiter = "\n---\n";
      const delimiterIndex = fullResponse.indexOf(delimiter);

      let thinking: string | undefined;
      let resultText: string = fullResponse;
      let isExpanded = true; 
      
      if (delimiterIndex !== -1) {
          thinking = fullResponse.substring(0, delimiterIndex).trim();
          resultText = fullResponse.substring(delimiterIndex + delimiter.length).trim();
          isExpanded = false; // Collapse by default when there's a thinking part
      }

      // FILTER: Strip raw THINKING blocks that appear in the result text
      // (model sometimes emits THINKING markers even after the delimiter)
      const stripThinkingBlocks = (text: string): string => {
        return text
          .replace(/^THINKING\s*\n/gim, '')  // Remove THINKING prefix lines
          .replace(/\n+THINKING\s*\n/gm, '\n')  // Remove embedded THINKING markers
          .split('\n')
          .map((line, idx, arr) => {
            // Filter out lines that are ONLY "THINKING" or are THINKING continuation
            if (line.trim().toUpperCase() === 'THINKING') return '';
            return line;
          })
          .join('\n')
          .trim();
      };
      
      resultText = stripThinkingBlocks(resultText);

      const jsonRegex = /```json\s*([\s\S]*?)\s*```/s;
      const match = resultText.match(jsonRegex);

      console.log('[JSON EXTRACTION] Agent:', agent, 'JSON match found:', !!match);

      // Fallback: Gemini 3 sometimes returns raw JSON without ```json fences.
      // Extract the first balanced { ... } or [ ... ] block if no fenced match.
      // Scans for candidates and only returns one that actually JSON-parses �
      // this prevents bracketed status markers like "[CACP RESULT]" or "[OK]"
      // from being mistaken for JSON arrays.
      const extractBalancedJson = (text: string): string | null => {
        const tryExtract = (start: number, openCh: string, closeCh: string): string | null => {
          let depth = 0;
          let inStr = false;
          let escape = false;
          for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inStr) {
              if (escape) { escape = false; continue; }
              if (ch === '\\') { escape = true; continue; }
              if (ch === '"') inStr = false;
              continue;
            }
            if (ch === '"') { inStr = true; continue; }
            if (ch === openCh) depth++;
            else if (ch === closeCh) {
              depth--;
              if (depth === 0) return text.substring(start, i + 1);
            }
          }
          return null;
        };
        let searchFrom = 0;
        while (searchFrom < text.length) {
          const firstObj = text.indexOf('{', searchFrom);
          const firstArr = text.indexOf('[', searchFrom);
          if (firstObj === -1 && firstArr === -1) return null;
          let start: number;
          let openCh: string;
          let closeCh: string;
          if (firstObj === -1 || (firstArr !== -1 && firstArr < firstObj)) {
            start = firstArr; openCh = '['; closeCh = ']';
          } else {
            start = firstObj; openCh = '{'; closeCh = '}';
          }
          const candidate = tryExtract(start, openCh, closeCh);
          if (!candidate) return null;
          // Validate this candidate is actually JSON � not a bracketed marker
          // like "[CACP RESULT]". If it parses, return it; otherwise keep
          // scanning past this candidate for the next bracketed block.
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            searchFrom = start + candidate.length;
          }
        }
        return null;
      };

      let fallbackJsonRaw: string | null = null;
      if (!match) {
        fallbackJsonRaw = extractBalancedJson(resultText);
        if (fallbackJsonRaw) {
          console.log('[JSON EXTRACTION] Fenced block missing � recovered balanced JSON, length:', fallbackJsonRaw.length);
        } else {
          console.log('[JSON EXTRACTION] No JSON block found. First 500 chars of response:', resultText.substring(0, 500));
        }
      }

      const disclaimer = "\n\n*Disclaimer: Your requested data is ready for professional review.*";
      let jsonContentToParse: string | null = null;
      let finalFullResponse = fullResponse;
      let finalResultText = stripThinkingBlocks(resultText);

      if (match && match[1]) {
          jsonContentToParse = match[1];
          console.log('[JSON EXTRACTION] Extracted JSON content, length:', jsonContentToParse.length);
          // If JSON is found, only add disclaimer to the text part, not the JSON block
          finalFullResponse = stripThinkingBlocks(fullResponse).replace(jsonRegex, '```json\n' + jsonContentToParse + '\n```') + disclaimer;
          finalResultText = stripThinkingBlocks(resultText).replace(jsonRegex, '```json\n' + jsonContentToParse + '\n```') + disclaimer;
      } else if (fallbackJsonRaw) {
          jsonContentToParse = fallbackJsonRaw;
          // Re-render the response with a synthetic ```json fence so the chat UI displays it consistently
          const fenced = '```json\n' + fallbackJsonRaw + '\n```';
          finalFullResponse = stripThinkingBlocks(fullResponse).replace(fallbackJsonRaw, fenced) + disclaimer;
          finalResultText = stripThinkingBlocks(resultText).replace(fallbackJsonRaw, fenced) + disclaimer;
      } else {
          // If no JSON, append disclaimer to the whole text
          finalFullResponse = stripThinkingBlocks(fullResponse) + disclaimer;
          finalResultText = stripThinkingBlocks(resultText) + disclaimer;
      }


      // Only update history if we didn't already handle it in an early return
      if (!skipFinallyUpdate) {
        setHistory(prev => {
          const newHistory = [...prev];
          const lastMessage = newHistory[newHistory.length - 1];
          if (lastMessage && lastMessage.role === MessageRole.MODEL) {
            newHistory[newHistory.length - 1] = {
              role: MessageRole.MODEL,
              text: finalFullResponse,
              thinking: thinking,
              result: finalResultText,
              isExpanded: isExpanded,
              model: currentModelName,
            };
          }
          return newHistory;
        });
      }

      if (jsonContentToParse) {
        let contentToParse = jsonContentToParse;
        try {
          // Sanitize the string to remove invalid control characters before parsing.
          // This prevents "Bad control character in string literal" errors.
          // We preserve common whitespace characters like newline, tab, and carriage return.
          const sanitizedJsonString = jsonContentToParse.replace(/[\x00-\x1F\x7F]/g, (char) => {
            return (char === '\n' || char === '\r' || char === '\t') ? char : '';
          });

          // To handle cases where the model might add extra text after a valid JSON block,
          // we try to isolate the JSON object/array before parsing.
          const lastBrace = sanitizedJsonString.lastIndexOf('}');
          const lastBracket = sanitizedJsonString.lastIndexOf(']');
          const endOfJsonIndex = Math.max(lastBrace, lastBracket);

          contentToParse = sanitizedJsonString;
          if (endOfJsonIndex > -1) {
              contentToParse = sanitizedJsonString.substring(0, endOfJsonIndex + 1);
          }
      
          const parsedJson = JSON.parse(contentToParse);
          console.log('[JSON PARSING] Successfully parsed JSON. Keys:', Object.keys(parsedJson));
          if (parsedJson.lines) {
            console.log('[JSON PARSING] Found lines array, length:', parsedJson.lines.length);
          }

          // CACP � recallFact tool call: agent is asking us to look up a fact
          // in the Project Knowledge Base. Cheap, local � no LLM round-trip
          // on the peer side. We answer and re-run the original query.
          if (parsedJson.recallFact && typeof parsedJson.recallFact === 'object') {
            const rf = parsedJson.recallFact as { category?: string; subject?: string; predicate?: string; query?: string; reason?: string };
            try {
              let facts;
              if (rf.query) {
                facts = knowledgeBase.search(rf.query, 20);
              } else {
                facts = knowledgeBase.queryFacts({
                  category: rf.category as any,
                  subject: rf.subject,
                  predicate: rf.predicate,
                  limit: 20,
                });
              }
              logActionToFieldbook(`CACP recall: ${agent} ? recallFact ${JSON.stringify(rf)} ? ${facts.length} hit${facts.length === 1 ? '' : 's'}`);
              const factsBlock = '```json\n' + JSON.stringify({ knowledgeBaseHits: facts }, null, 2) + '\n```';
              setHistory(prev => ([
                ...prev,
                {
                  role: MessageRole.MODEL,
                  text: `?? Knowledge Base � ${facts.length} fact${facts.length === 1 ? '' : 's'} found${rf.reason ? ` (${rf.reason})` : ''}. Re-running your request with the recalled data�\n\n${factsBlock}`,
                  result: factsBlock,
                  isExpanded: true,
                },
              ]));
              const followUp = `[KB RECALL � ${facts.length} fact(s)]\n${JSON.stringify(facts)}\n\nUsing the knowledge above, please complete the original request: ${query}`;
              setTimeout(() => { void handleSendMessage(followUp); }, 0);
              skipFinallyUpdate = true;
              return;
            } catch (kbErr) {
              console.error('[KB] recallFact dispatch failed:', kbErr);
              // fall through � don't block the rest of the parser
            }
          }

          // CACP � askPeer tool call: agent is asking us to dispatch a skill
          // request to a peer agent. We fire it, then auto-resend the user's
          // query to the same agent with the answer injected so it can finish
          // the original task on the next turn.
          if (parsedJson.askPeer && typeof parsedJson.askPeer === 'object') {
            const ap = parsedJson.askPeer as { skillId?: string; payload?: Record<string, unknown>; reason?: string };
            const skillId = ap.skillId;
            const payload = (ap.payload ?? {}) as Record<string, unknown>;
            const reason = ap.reason ?? '';
            if (skillId) {
              try {
                logActionToFieldbook(`CACP delegation: ${agent} ? askPeer "${skillId}" (${reason || 'no reason given'})`);
                const peerResponse = await interAgentComm.askPeer(agent, skillId, payload, { timeoutMs: 30_000 });
                const isActionSkill = agentRegistry.findSkill(skillId)?.type === 'action';
                if (peerResponse?.success && peerResponse.data) {
                  // Peer answered � re-send the original query with the data injected.
                  // CACP success is logged in the DevOps CACP Activity Log; no chat noise here.
                  const followUp = isActionSkill
                    ? `[CACP COMPLETED � ${skillId}]\nResult: ${JSON.stringify(peerResponse.data)}\n\nThe action above has already been executed by the peer agent. Please confirm the outcome to the user in a natural sentence (e.g. "Point X has been deleted."). Do NOT call askPeer again � the task is done.`
                    : `[CACP RESULT � ${skillId} from ${peerResponse.from}]\n${JSON.stringify(peerResponse.data)}\n\nUsing the data above, please complete the original request: ${query}`;
                  // Fire-and-forget; user sees streaming as usual.
                  setTimeout(() => { void handleSendMessage(followUp); }, 0);
                  skipFinallyUpdate = true;
                  return;
                } else {
                  // Peer failed � re-run with an error note so the agent can respond gracefully.
                  // CACP failure is logged in the DevOps CACP Activity Log; no chat noise here.
                  const errDetail = peerResponse ? (peerResponse.error ?? 'no data returned') : 'no agent owns this skill';
                  const followUp = isActionSkill
                    ? `[CACP FAILED � ${skillId}: ${errDetail}]\n\nThe action could not be completed. Please inform the user of this failure. Do NOT retry askPeer.`
                    : `[CACP FAILED � ${skillId}: ${errDetail}]\n\nThe peer agent could not fulfill the "${skillId}" request. Please handle this gracefully and complete the user's original request as best you can without the external data: ${query}`;
                  setTimeout(() => { void handleSendMessage(followUp); }, 0);
                  skipFinallyUpdate = true;
                  return;
                }
              } catch (peerErr) {
                console.error('[CACP] askPeer dispatch failed:', peerErr);
                // Error logged in DevOps CACP Activity Log � re-run so the agent can recover.
                const errMsg = peerErr instanceof Error ? peerErr.message : String(peerErr);
                const isActionSkillOnErr = agentRegistry.findSkill(skillId)?.type === 'action';
                const followUp = isActionSkillOnErr
                  ? `[CACP ERROR � ${skillId}: ${errMsg}]\n\nThe action failed with an error. Please inform the user. Do NOT retry askPeer.`
                  : `[CACP ERROR � ${skillId}: ${errMsg}]\n\nThe peer agent threw an error. Please handle this gracefully and complete the user's original request as best you can without the external data: ${query}`;
                setTimeout(() => { void handleSendMessage(followUp); }, 0);
                skipFinallyUpdate = true;
                return;
              }
            }
          }
          let visualDataFound = false;
          let uncertaintyFound = false;
          let closureReportFound = false;

          // EXTRACT DEED METADATA (for DEED_READER agent)
          if (agent === AgentType.DEED_READER && parsedJson.deedMetadata && deedFile) {
              console.log('[DEED METADATA] Extracted from AI response:', parsedJson.deedMetadata);
              // Map AI response fields to DeedMetadata interface
              const metadata: DeedMetadata = {
                  owners: parsedJson.deedMetadata.owner ? [parsedJson.deedMetadata.owner] : parsedJson.deedMetadata.owners,
                  deedBook: parsedJson.deedMetadata.book || parsedJson.deedMetadata.deedBook,
                  deedPage: parsedJson.deedMetadata.page || parsedJson.deedMetadata.deedPage,
                  parcelId: parsedJson.deedMetadata.parcelId
              };
              // Update the deedFile in session state with the extracted metadata
              setDeedFile({ ...deedFile, deedMetadata: metadata });
              // KNOWLEDGE BASE: persist metadata so every other agent can recall it.
              try { extractDeedMetadataFacts(parsedJson.deedMetadata, deedFile.name); } catch (kbErr) { console.warn('[KB] deed metadata extraction failed:', kbErr); }
          }

          // KNOWLEDGE BASE: scan deed lines for ROW (right-of-way) widths so the
          // Civil Drafter / GIS Agent can later draw them without re-parsing.
          if (agent === AgentType.DEED_READER && Array.isArray(parsedJson.lines)) {
              try {
                  const rowFacts = extractRowFactsFromLines(parsedJson.lines, deedFile?.name);
                  if (rowFacts.length > 0) {
                      console.log('[KB] Recorded', rowFacts.length, 'ROW facts from deed lines.');
                      logActionToFieldbook(`Knowledge Base: stored ${rowFacts.length} right-of-way fact${rowFacts.length === 1 ? '' : 's'} from deed (now reusable across agents).`);
                  }
              } catch (kbErr) { console.warn('[KB] ROW extraction failed:', kbErr); }
          }

          // EXTRACT TITLE SEARCH DATA (for TITLE_SEARCH agent)
          if (agent === AgentType.TITLE_SEARCH && (parsedJson.deeds || parsedJson.liens || parsedJson.chainOfTitle)) {
              console.log('[TITLE SEARCH] Extracted title data from AI response:', parsedJson);
              setTitleSearchData(prev => ({
                  propertyAddress: parsedJson.propertyAddress || prev.propertyAddress,
                  parcelId: parsedJson.parcelId || prev.parcelId,
                  deeds: parsedJson.deeds || prev.deeds,
                  liens: parsedJson.liens || prev.liens,
                  chainOfTitle: parsedJson.chainOfTitle || prev.chainOfTitle,
                  titleStatus: parsedJson.titleStatus || prev.titleStatus,
                  issues: parsedJson.issues || prev.issues,
              }));
          }

          // SCHEMA ADAPTER: Multi-tract deed responses sometimes come back as
          // { deedMetadata, boundaries: [...], uncertainties } where each boundary
          // entry contains its own points/lines (or a calls[] list). The downstream
          // pipeline only knows the flat { points, lines } shape, so flatten here
          // before the correction engine runs. Without this, multi-tract deeds
          // parse "successfully" but produce zero boundary files � no amber draw.
          if (agent === AgentType.DEED_READER && Array.isArray(parsedJson.boundaries) && parsedJson.boundaries.length > 0 && (!parsedJson.points || !parsedJson.lines)) {
              try {
                  const flatPoints: any[] = [];
                  const flatLines: any[] = [];
                  parsedJson.boundaries.forEach((b: any, bIdx: number) => {
                      const tractId = b?.tractId || b?.name || b?.tractName || `TRACT-${bIdx + 1}`;
                      if (Array.isArray(b?.points)) {
                          b.points.forEach((p: any) => flatPoints.push({ ...p, tractId }));
                      }
                      if (Array.isArray(b?.lines)) {
                          b.lines.forEach((l: any) => flatLines.push({ ...l, tractId }));
                      } else if (Array.isArray(b?.calls)) {
                          // Some responses use "calls" instead of "lines"
                          b.calls.forEach((c: any) => flatLines.push({ ...c, tractId }));
                      }
                  });
                  if (flatPoints.length > 0) parsedJson.points = flatPoints;
                  if (flatLines.length > 0) parsedJson.lines = flatLines;
                  console.log('[DEED_PARSE_SHAPE] Flattened boundaries[] ? points/lines:', {
                      tracts: parsedJson.boundaries.length,
                      points: flatPoints.length,
                      lines: flatLines.length,
                  });
                  logActionToFieldbook(`Flattened ${parsedJson.boundaries.length} tract${parsedJson.boundaries.length === 1 ? '' : 's'} from multi-tract deed (${flatPoints.length} pts, ${flatLines.length} lines).`);
              } catch (flattenErr) {
                  console.warn('[DEED_PARSE_SHAPE] Failed to flatten boundaries[]:', flattenErr);
              }
          }
          if (agent === AgentType.DEED_READER) {
              console.log('[DEED_PARSE_SHAPE]', {
                  hasPoints: Array.isArray(parsedJson.points),
                  pointsLen: Array.isArray(parsedJson.points) ? parsedJson.points.length : 0,
                  hasLines: Array.isArray(parsedJson.lines),
                  linesLen: Array.isArray(parsedJson.lines) ? parsedJson.lines.length : 0,
                  hasBoundaries: Array.isArray(parsedJson.boundaries),
                  hasDescriptionsFound: Array.isArray(parsedJson.descriptionsFound),
              });
          }

          // SURFACE descriptionsFound to the user. When the AI detects multiple
          // deed descriptions but can't (or didn't) extract them all, it lists
          // them under `descriptionsFound`. Without this branch the list is
          // dropped silently and the user sees only the first tract drawn.
          if (agent === AgentType.DEED_READER && Array.isArray(parsedJson.descriptionsFound) && parsedJson.descriptionsFound.length > 0) {
              const items = parsedJson.descriptionsFound as Array<{ tractId?: string; label?: string; tractName?: string; page?: number; sourcePage?: number; extracted?: boolean; reason?: string }>;
              const bulletList = items.map((d, i) => {
                  const id = d.tractId || d.tractName || `Tract ${i + 1}`;
                  const label = d.label || d.tractName || '';
                  const page = d.page ?? d.sourcePage;
                  const status = d.extracted === false ? '?? NOT extracted' : '? extracted';
                  const reason = d.reason ? ` � ${d.reason}` : '';
                  const pageStr = page != null ? ` (page ${page})` : '';
                  return `- **${id}**${label && label !== id ? `: ${label}` : ''}${pageStr} � ${status}${reason}`;
              }).join('\n');
              const extractedCount = items.filter(d => d.extracted !== false).length;
              const totalCount = items.length;
              const summaryMsg = `?? **${totalCount} deed description${totalCount === 1 ? '' : 's'} detected** (${extractedCount} extracted, ${totalCount - extractedCount} pending):\n\n${bulletList}\n\n${totalCount - extractedCount > 0 ? '_Ask me to "extract the remaining descriptions" or to "extract Tract N" for each one not yet drawn._' : ''}`;
              setHistory(prev => ([
                  ...prev,
                  { role: MessageRole.MODEL, text: summaryMsg },
              ]));
              logActionToFieldbook(`Deed parser detected ${totalCount} description${totalCount === 1 ? '' : 's'} (${extractedCount} extracted).`);
          }

          // CLIENT-SIDE CORRECTION ENGINE FOR THE BOUNDARY AGENT
          if (parsedJson.points && Array.isArray(parsedJson.points) && parsedJson.lines && Array.isArray(parsedJson.lines) && agent === AgentType.DEED_READER) {

              // FILTER: Remove AI-generated intermediate curve points (INT-X-Y pattern).
              // These are used only for visual rendering reference by the AI, but the
              // application renders arcs directly from curve parameters � no intermediate
              // points are needed. PC and PT endpoints are kept (they are deed calls).
              const intermediatePattern = /^INT-\d/i;
              const beforeFilter = parsedJson.points.length;
              parsedJson.points = parsedJson.points.filter((p: any) =>
                  p && !intermediatePattern.test(String(p?.pointNumber || '')) &&
                  p?.isIntermediateCurvePoint !== true &&
                  !String(p?.description || '').toLowerCase().startsWith('intermediate curve')
              );
              const filteredIntCount = beforeFilter - parsedJson.points.length;
              if (filteredIntCount > 0) {
                  logActionToFieldbook(`Suppressed ${filteredIntCount} intermediate curve rendering point(s) from canvas.`);
              }

              // CURVE BEARING CORRECTION via tangent continuity.
              // When a deed gives only R and arc length (no chord bearing), the AI often
              // guesses the chord bearing incorrectly. Tangent continuity is a surveying law:
              //   - A straight line FOLLOWING a curve is exactly the curve's exit tangent.
              //   - A straight line PRECEDING a curve is exactly the curve's entry tangent.
              // We use this to recompute chord bearing from adjacent straight calls, which
              // are always reliable because the deed states them explicitly.
              {
                  const linesArr = parsedJson.lines as SurveyLine[];
                  for (let ci = 0; ci < linesArr.length; ci++) {
                      const cline = linesArr[ci];
                      if (!cline.isCurve || !cline.curveRadius || !cline.arcLength || !cline.curveDirection) continue;
                      // Preserve explicit chord bearings from the deed (non-tangent-out curves).
                      // The tangent-continuity correction below only applies when the deed
                      // gave R + arc length without a chord bearing.
                      if (cline.chordBearing && parseBearingToRadians(cline.chordBearing) !== null) continue;
                      const deltaM = cline.arcLength / cline.curveRadius;
                      const deltaS = cline.curveDirection === 'left' ? -deltaM : deltaM;

                      // Priority 1: straight line PRECEDING the curve ? its bearing = entry tangent.
                      // Also check the LAST line in the traverse as cyclic predecessor
                      // (deeds are closed traverses; the last call precedes the first call).
                      const linearPrev = ci > 0 ? linesArr[ci - 1] : null;
                      const cyclicPrev = ci === 0 && linesArr.length > 1 ? linesArr[linesArr.length - 1] : null;
                      const prevLine = (linearPrev && !linearPrev.isCurve && linearPrev.bearing) ? linearPrev
                                     : (cyclicPrev && !cyclicPrev.isCurve && cyclicPrev.bearing) ? cyclicPrev
                                     : null;
                      if (prevLine) {
                          const entryRad = parseBearingToRadians(prevLine.bearing!);
                          if (entryRad !== null) {
                              const chordRad = entryRad + deltaS / 2;
                              const chordDist = calculateChordDistance(cline.curveRadius, Math.abs(deltaS));
                              cline.tangentBearing = formatBearing(entryRad);
                              cline.chordBearing   = formatBearing(chordRad);
                              cline.bearing        = formatBearing(chordRad);
                              cline.distance       = chordDist.toFixed(4);
                              cline.chordDistance  = chordDist;
                              logActionToFieldbook(`Curve ${cline.from}?${cline.to}: chord bearing corrected from preceding tangent: ${cline.bearing}`);
                              continue;
                          }
                      }
                      // Priority 2: straight line FOLLOWING the curve ? its bearing = exit tangent.
                      // Also check the FIRST line as cyclic successor for a curve at end of traverse.
                      const linearNext = ci < linesArr.length - 1 ? linesArr[ci + 1] : null;
                      const cyclicNext = ci === linesArr.length - 1 && linesArr.length > 1 ? linesArr[0] : null;
                      const nextLine = (linearNext && !linearNext.isCurve && linearNext.bearing) ? linearNext
                                     : (cyclicNext && !cyclicNext.isCurve && cyclicNext.bearing) ? cyclicNext
                                     : null;
                      if (nextLine) {
                          const exitRad = parseBearingToRadians(nextLine.bearing!);
                          if (exitRad !== null) {
                              const entryRad = exitRad - deltaS;
                              const chordRad = entryRad + deltaS / 2;
                              const chordDist = calculateChordDistance(cline.curveRadius, Math.abs(deltaS));
                              cline.tangentBearing = formatBearing(entryRad);
                              cline.chordBearing   = formatBearing(chordRad);
                              cline.bearing        = formatBearing(chordRad);
                              cline.distance       = chordDist.toFixed(4);
                              cline.chordDistance  = chordDist;
                              logActionToFieldbook(`Curve ${cline.from}?${cline.to}: chord bearing corrected from following tangent: ${cline.bearing}`);
                              continue;
                          }
                      }
                  }
              }
              
              // CONFLICT RESOLUTION FOR DEED PLOTTING
              // Scoped to DEED_READER: when re-parsing the same deed we want a
              // suffixed copy ('-A'), not an in-place overwrite of the original tract.
              // For every other agent a collision means the LLM wants to MOVE/UPDATE
              // the existing point (see verb-semantics rule in system prompt) � let
              // that case fall through to the renumber loop, which now honors numeric
              // re-emits as updates.
              let newPoints = parsedJson.points as SurveyPoint[];
              let newLines = parsedJson.lines as SurveyLine[] || [];
              const allExistingPointNumbers = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
              const hasConflict = agent === AgentType.DEED_READER
                && parsedJson.replacePoints !== true
                && newPoints.some(p => allExistingPointNumbers.has(p.pointNumber));
      
              if (hasConflict) {
                  let suffix = '';
                  let renumberingSuccessful = false;
                  
                  // Find a suitable alphabetic suffix ('-A', '-B', ...)
                  for (let i = 0; i < 26; i++) {
                      const potentialSuffix = '-' + String.fromCharCode(65 + i);
                      const conflictWithSuffix = newPoints.some(p => allExistingPointNumbers.has(p.pointNumber + potentialSuffix));
                      if (!conflictWithSuffix) {
                          suffix = potentialSuffix;
                          renumberingSuccessful = true;
                          break;
                      }
                  }
                  
                  // Fallback to numeric if all alphabetic are taken
                  if (!renumberingSuccessful) {
                      for (let i = 1; i < 100; i++) {
                          const potentialSuffix = `-${i}`;
                          const conflictWithSuffix = newPoints.some(p => allExistingPointNumbers.has(p.pointNumber + potentialSuffix));
                          if (!conflictWithSuffix) {
                              suffix = potentialSuffix;
                              renumberingSuccessful = true;
                              break;
                          }
                      }
                  }
      
                  if (renumberingSuccessful) {
                      logActionToFieldbook(`Deed points renumbered with suffix '${suffix}' to avoid conflicts with existing points.`);
                      const renumberingMap = new Map<string, string>();
                      
                      const renumberedPoints = newPoints.map(p => {
                          const newPointNumber = p.pointNumber + suffix;
                          renumberingMap.set(p.pointNumber, newPointNumber);
                          return { ...p, pointNumber: newPointNumber };
                      });
      
                      const renumberedLines = newLines.map(l => ({
                          ...l,
                          from: renumberingMap.get(l.from) || l.from,
                          to: renumberingMap.get(l.to) || l.to,
                      }));
                      
                      parsedJson.points = renumberedPoints;
                      parsedJson.lines = renumberedLines;
                  } else {
                       setError("Could not plot deed. Unable to find a unique suffix to resolve point number conflicts after many attempts.");
                       // Stop processing these points/lines if renumbering fails
                       delete parsedJson.points;
                       delete parsedJson.lines;
                  }
              }
              // END CONFLICT RESOLUTION

              const correctedPoints = JSON.parse(JSON.stringify(parsedJson.points)); // Deep copy
              const pointMap = new Map<string, SurveyPoint>(correctedPoints.map((p: SurveyPoint) => [p.pointNumber, p]));
              const correctionsLog: string[] = [];

              parsedJson.lines.forEach((line: SurveyLine) => {
                  // Skip curve lines: the AI computes PT via circular geometry, not direct().
                  // Using direct(fromPt, tangentBearing, arcLength) gives wrong coordinates.
                  if (line.isCurve) return;
                  if (!line.bearing || !line.distance) return;

                  const fromPoint = pointMap.get(line.from);
                  const toPoint = pointMap.get(line.to);
                  if (!fromPoint || !toPoint) return;

                  const bearingRad = parseBearingToRadians(line.bearing);
                  const distNum = parseDistance(line.distance);
                  
                  if (bearingRad === null || distNum === null) {
                      correctionsLog.push(`Could not parse call for line ${line.from}-${line.to} ('${line.bearing}', '${line.distance}'). Using AI-provided coordinates.`);
                      return;
                  }

                  const { distance: inversedDist, bearing: inversedBearingRad } = inverse(fromPoint, toPoint);

                  const toleranceDist = 0.005; // survey feet
                  const toleranceRad = 0.00002424; // ~5 seconds of arc in radians

                  let deltaBearing = Math.abs(inversedBearingRad - bearingRad);
                  // Handle wrapping around 0/360 degrees (north)
                  if (deltaBearing > Math.PI) {
                      deltaBearing = 2 * Math.PI - deltaBearing;
                  }

                  if (Math.abs(inversedDist - distNum) > toleranceDist || deltaBearing > toleranceRad) {
                      const reasons: string[] = [];
                      if (Math.abs(inversedDist - distNum) > toleranceDist) {
                          reasons.push(`distance mismatch: ${inversedDist.toFixed(4)}' vs ${distNum.toFixed(4)}'`);
                      }
                      if (deltaBearing > toleranceRad) {
                          const bearingDiffSeconds = deltaBearing * (180 / Math.PI) * 3600;
                          reasons.push(`bearing mismatch by ${bearingDiffSeconds.toFixed(1)}"`);
                      }
                      
                      correctionsLog.push(`Correcting point ${toPoint.pointNumber}. Reason: ${reasons.join(' and ')}.`);
                      
                      const correctedToCoords = direct(fromPoint, bearingRad, distNum);

                      const pointToUpdate = pointMap.get(toPoint.pointNumber);
                      if(pointToUpdate){
                          pointToUpdate.northing = correctedToCoords.northing;
                          pointToUpdate.easting = correctedToCoords.easting;
                      }
                  }
              });

              if (correctionsLog.length > 0) {
                  logActionToFieldbook(`Client-side correction engine applied: \n- ${correctionsLog.join('\n- ')}`);
              }

              // Replace the original points with our corrected version
              parsedJson.points = Array.from(pointMap.values());
          }
          // END CORRECTION ENGINE
            // If AI included a raw table text, try to parse it into points
            if ((!parsedJson.points || !Array.isArray(parsedJson.points) || parsedJson.points.length === 0) && parsedJson.tableText && typeof parsedJson.tableText === 'string') {
              try {
                const rows = planTableParser.parseCoordinateTableFromText(parsedJson.tableText as string);
                const autocorrected = planTableParser.attemptAutoFixRows(rows);
                const parsedPoints = planTableParser.convertRowsToPoints(autocorrected.rows);
                if (parsedPoints.length > 0) {
                  parsedJson.points = parsedPoints;
                  logActionToFieldbook(`Parsed ${parsedPoints.length} points from AI-provided table text.`);
                  if (autocorrected.fixed) {
                    logActionToFieldbook(`Auto-fix applied to table rows: ${autocorrected.reason}`);
                  }
                }
              } catch (e) {
                console.error('Failed to parse tableText into points:', (e as Error).message);
              }
            }

            // If AI included a rows array (text rows), parse as well
            if ((!parsedJson.points || !Array.isArray(parsedJson.points) || parsedJson.points.length === 0) && parsedJson.tableRows && Array.isArray(parsedJson.tableRows)) {
              try {
                const rows = parsedJson.tableRows.map((r: any) => (typeof r === 'string' ? r : (r.originalRow || ''))).join('\n');
                const parsedRows = planTableParser.parseCoordinateTableFromText(rows);
                const autocorrected = planTableParser.attemptAutoFixRows(parsedRows);
                const parsedPoints = planTableParser.convertRowsToPoints(autocorrected.rows);
                if (parsedPoints.length > 0) {
                  parsedJson.points = parsedPoints;
                  logActionToFieldbook(`Parsed ${parsedPoints.length} points from AI-provided table rows.`);
                  if (autocorrected.fixed) {
                    logActionToFieldbook(`Auto-fix applied to table rows: ${autocorrected.reason}`);
                  }
                }
              } catch (e) {
                console.error('Failed to parse tableRows into points:', (e as Error).message);
              }
            }

            // --- Sanity check: run the COGO points_sanity_check skill on the
            // extracted points BEFORE they enter state. Surfaces 6 independent
            // geometric/statistical checks (cluster, duplicate, inverse vs
            // companion line table, closure, area, triangulation). Non-blocking:
            // results are logged + emitted as notification; user can re-extract.
            if (parsedJson.points && Array.isArray(parsedJson.points) && parsedJson.points.length > 0) {
              try {
                const sanityPayload: Record<string, unknown> = {
                  points: parsedJson.points.map((p: any) => ({
                    pointNumber: String(p.pointNumber ?? p.label ?? p.id ?? ''),
                    northing: Number(p.northing),
                    easting: Number(p.easting),
                    elevation: typeof p.elevation === 'number' ? p.elevation : undefined,
                    description: p.description,
                  })),
                  units: 'ft',
                };
                if (Array.isArray(parsedJson.lines) && parsedJson.lines.length > 0) {
                  sanityPayload.expectedSegments = parsedJson.lines
                    .filter((l: any) => l && l.from && l.to && (l.bearing || typeof l.distance === 'number'))
                    .map((l: any) => ({ from: String(l.from), to: String(l.to), bearing: l.bearing, distance: l.distance, radius: l.curveRadius }));
                }
                if (typeof parsedJson.parcelArea === 'number') {
                  sanityPayload.expectedArea = parsedJson.parcelArea;
                  sanityPayload.expectedAreaUnit = parsedJson.parcelAreaUnit ?? 'acres';
                  sanityPayload.expectedClosed = true;
                } else if (parsedJson.isClosed === true) {
                  sanityPayload.expectedClosed = true;
                }
                const sanityResp = await interAgentComm.request(
                  AgentType.LSVZ_AGENT, AgentType.COGO_AGENT, 'points_sanity_check', sanityPayload, 5000,
                );
                if (sanityResp?.success) {
                  const sr = sanityResp.data as {
                    passed: boolean; score: number; summary: string;
                    checksRun: string[]; issues: Array<{ check: string; severity: string; pn?: string; relatedPns?: string[]; message: string }>;
                    closure?: { perimeter?: number; misclosureLinear?: number; precision?: string; areaAcres?: number };
                  };
                  const red = sr.issues.filter(i => i.severity === 'red');
                  const yellow = sr.issues.filter(i => i.severity === 'yellow');
                  const header = `Points sanity check � ${sr.passed ? '? PASSED' : '?? FAILED'} ` +
                    `(${sr.checksRun.length} checks, ${red.length} red, ${yellow.length} yellow, score ${(sr.score * 100).toFixed(0)}%).`;
                  const detailLines = sr.issues.slice(0, 12).map(i =>
                    `  [${i.severity.toUpperCase()}|${i.check}]${i.pn ? ` ${i.pn}:` : ''} ${i.message}`,
                  );
                  logActionToFieldbook([header, sr.summary, ...detailLines].join('\n'));
                  if (sr.closure?.misclosureLinear !== undefined) {
                    logActionToFieldbook(`Closure: gap=${sr.closure.misclosureLinear.toFixed(3)} ft, precision=${sr.closure.precision}, area=${sr.closure.areaAcres?.toFixed(4)} ac.`);
                  }
                  if (red.length > 0) {
                    setError(`?? Points extracted from table failed ${red.length} sanity check(s). Review the fieldbook for details and verify against the source PDF before drafting.`);
                  } else if (yellow.length > 0) {
                    logActionToFieldbook(`?? ${yellow.length} yellow warning(s) on extracted points � review recommended but not required.`);
                  }
                }
              } catch (e) {
                console.warn('[App] points_sanity_check failed (non-fatal):', (e as Error).message);
              }
            }

          // Mapping from AI-assigned label ? CACP number, used to remap line from/to references below.
          // Declared at outer scope so the lines block (sibling) can read it.
          const aiToCacpMap = new Map<string, string>();
          // Hold the final validated/renumbered points so lines can look them up synchronously
          // (setPointLists is async so pointListsRef won't have them yet)
          let currentBatchPoints: SurveyPoint[] = [];

            if (parsedJson.points && Array.isArray(parsedJson.points) && parsedJson.points.length > 0) {
              visualDataFound = true;
              logActionToFieldbook(`Processing ${parsedJson.points.length} points from query: "${query}"`);

              let skippedPointsCount = 0;
              // Deduplicate on coordinate pair, not AI-assigned label (which may be
              // station names like "SR6011_16+50" that repeat across sessions).
              const seenCoords = new Set<string>();

              const newValidPoints = parsedJson.points
                  .map((p: any): SurveyPoint | null => {
                      if (!p) return null;

                      const northing = parseFloat(p.northing);
                      const easting = parseFloat(p.easting);
                      const elevation = parseFloat(p.elevation);

                      if (isNaN(northing) || isNaN(easting)) {
                          return null; // Invalid coordinates
                      }
                      
                      return {
                          // Use AI label as a temp placeholder; PointAgent will replace it below.
                          pointNumber: String(p.pointNumber || ''),
                          northing: northing,
                          easting: easting,
                          elevation: isNaN(elevation) ? 0 : elevation,
                          description: p.description || '',
                          symbol: p.symbol,
                      };
                  })
                  .filter((p: SurveyPoint | null): p is SurveyPoint => {
                      if (p === null) {
                          skippedPointsCount++;
                          return false;
                      }
                      // Deduplicate within this batch only when the AI emitted the SAME
                      // pointNumber/label twice at the same coordinate. Two DIFFERENT labels
                      // at coincident coordinates are semantically distinct points (e.g. the
                      // tangent point where two circles meet, or a monument over a monument)
                      // and must be kept � otherwise the lines block loses an endpoint and
                      // the dependent curve/segment silently fails to render.
                      const coordKey = `${p.northing.toFixed(3)},${p.easting.toFixed(3)}|${p.pointNumber}`;
                      if (seenCoords.has(coordKey)) {
                          skippedPointsCount++;
                          return false;
                      }
                      seenCoords.add(coordKey);
                      return true;
                  });
              
              if (skippedPointsCount > 0) {
                  setError(`${skippedPointsCount} point(s) were skipped due to duplicate point numbers or invalid data.`);
                  setTimeout(() => setError(null), 4000);
              }

                if (newValidPoints.length > 0) {
                  // Replace AI-provided point names/labels with sequential CACP numbers.
                  // The AI often returns station labels (e.g. "SR6011_16+50") as pointNumber;
                  // those belong in the description, not the point number field.
                  //
                  // MOVE/UPDATE intent: when the LLM re-emits a *numeric* pointNumber
                  // that already exists in the project, the system prompt promises the
                  // host will overwrite that point in place. Honor that contract by
                  // skipping new-number issuance for those entries.
                  const ptAgent = PointAgent.getInstance();
                  ptAgent.setLabelingSettings(settings.pointLabelingSettings);
                  ptAgent.setAvailablePoints(pointLists.flatMap(l => l.points));
                  const existingPnSet = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
                  const isUpdateIntent = (pn: string) => /^\d+$/.test(pn) && existingPnSet.has(pn);
                  const newCount = newValidPoints.reduce((n: number, pt: SurveyPoint) => n + (isUpdateIntent(pt.pointNumber) ? 0 : 1), 0);
                  const issuedNumbers = ptAgent.getNextNumbers(newCount);
                  let issueIdx = 0;
                  newValidPoints.forEach((pt: SurveyPoint) => {
                    const aiLabel = pt.pointNumber;
                    if (isUpdateIntent(aiLabel)) {
                      // Keep the AI-emitted PN � the merge step below will overwrite the existing point.
                      aiToCacpMap.set(aiLabel, aiLabel);
                      return;
                    }
                    pt.pointNumber = issuedNumbers[issueIdx++];
                    // Track AI label ? CACP number so line from/to refs can be remapped
                    aiToCacpMap.set(aiLabel, pt.pointNumber);
                    // Preserve AI-assigned label in description only if it looks like a
                    // non-numeric name (station label, road name, etc.) and description is empty.
                    if (!pt.description && aiLabel && !/^\d+$/.test(aiLabel)) {
                      pt.description = aiLabel;
                    }
                  });

                  // Apply advanced coordinate correction for Civil Plan Expert
                  if (agent === AgentType.CIVIL_PLAN_EXPERT) {
                    console.log('[App] Applying coordinate correction to Civil Plan Expert points...');
                    const corrected = processAndCorrectCoordinates(
                      newValidPoints.map(p => ({
                        pointName: p.pointNumber,
                        northing: p.northing,
                        easting: p.easting
                      }))
                    );
                    // Replace with corrected coordinates
                    newValidPoints.forEach((p, i) => {
                      if (corrected[i]) {
                        p.northing = corrected[i].northing;
                        p.easting = corrected[i].easting;
                        if (corrected[i].corrections && corrected[i].corrections.length > 0) {
                          console.log(`[App] Corrected ${p.pointNumber}:`, corrected[i].corrections);
                        }
                      }
                    });
                  }
                  
                  // Validate coordinates and attempt autocorrect if necessary
                  try {
                    const validation = validateCoordinates(newValidPoints, 'workpoints');
                    if (!validation.isValid || (validation.warnings && validation.warnings.length > 0)) {
                      // Attempt to auto-fix common issues like swapped columns
                      const autocorrect = attemptAutoFixPoints(newValidPoints);
                      if (autocorrect.fixed) {
                        logActionToFieldbook(`Auto-fix applied: ${autocorrect.reason}`);
                        newValidPoints.splice(0, newValidPoints.length, ...autocorrect.fixedPoints);
                        setError('Applied client-side autocorrect for suspicious coordinates. Please verify visually.');
                        setTimeout(() => setError(null), 8000);
                      } else {
                        // If no fix, still warn the user
                        if (!validation.isValid) {
                          setError('Coordinate validation found issues - please review.');
                          setTimeout(() => setError(null), 10000);
                        }
                      }
                    }
                  } catch (e) {
                    console.error('Coordinate validation/auto-fix error:', (e as Error).message);
                  }
                  // -- CAD Manager: assign layer to every generated point --------------
                  // For each point, resolve its layer from the CAD Manager standard (if loaded).
                  // Falls back gracefully: if no standard is loaded OR code is unknown, we assign
                  // a sensible default layer based on the producing agent.
                  if (newValidPoints.length > 0) {
                    const defaultPointLayerByAgent: Partial<Record<AgentType, string>> = {
                      [AgentType.DEED_READER]:            'L-DEED-POINT',
                      [AgentType.CIVIL_DRAFTER]:          'L-SURV-POINT',
                      [AgentType.RAW_CRAWLER]:            'L-SURV-POINT',
                      [AgentType.CENTERLINE_STATIONING]:  'L-CENTERLINE-POINT',
                      [AgentType.CIVIL_PLAN_EXPERT]:      'L-PLAN-POINT',
                      [AgentType.DXF_ANALYZER]:           'L-IMPORT-POINT',
                      [AgentType.GIS_AGENT]:              'L-GIS-POINT',
                    };
                    const agentDefaultPointLayer = defaultPointLayerByAgent[agent] ?? 'L-SURV-POINT';
                    newValidPoints.forEach((pt: SurveyPoint) => {
                      if (!pt.layer) {
                        // Try CAD Manager standard first
                        const resolved = pt.description
                          ? cadManagerContext.resolveCode(pt.description)
                          : null;
                        if (resolved && resolved.source !== 'unknown' && resolved.layer) {
                          pt.layer = resolved.layer;
                        } else {
                          // Fall back to the agent-specific default
                          pt.layer = agentDefaultPointLayer;
                        }
                      }
                    });
                  }
                  // ----------------------------------------------------------------------

                  // Always retain the validated/renumbered points so the lines block (sibling) can resolve
                  // from/to endpoints. In 'lines' mode we still need them for geometry lookup, just not on the canvas.
                  currentBatchPoints = newValidPoints;

                  // DEED_READER: points are only intermediate COGO nodes � never plot them on canvas.
                  // The BoundaryFile (DeedSummaryPanel) is the sole canvas representation until
                  // the user explicitly commits via "Draw (Commit) ? CAD".
                  if (agentDrawModeRef.current !== 'lines' && agent !== AgentType.DEED_READER) {
                    // Upsert by pointNumber: any newValidPoint whose PN already exists
                    // anywhere in the project overwrites that point in place (MOVE intent).
                    // Truly new points get appended to the 'working' list as before.
                    setPointLists(prevLists => {
                        const incomingByPn = new Map<string, SurveyPoint>(newValidPoints.map((p: SurveyPoint) => [p.pointNumber, p]));
                        let updatedCount = 0;
                        const updatedLists = prevLists.map(l => {
                            let listMutated = false;
                            const nextPoints = l.points.map(existing => {
                                const replacement = incomingByPn.get(existing.pointNumber);
                                if (replacement) {
                                    incomingByPn.delete(existing.pointNumber);
                                    listMutated = true;
                                    updatedCount++;
                                    // Preserve list-owned metadata (layer if the AI omitted one).
                                    return { ...existing, ...replacement, layer: replacement.layer ?? existing.layer };
                                }
                                return existing;
                            });
                            return listMutated ? { ...l, points: nextPoints } : l;
                        });
                        const remainingNew = Array.from(incomingByPn.values());
                        if (updatedCount > 0) {
                            logActionToFieldbook(`Updated ${updatedCount} existing point${updatedCount === 1 ? '' : 's'} in place.`);
                        }
                        if (remainingNew.length === 0) return updatedLists;
                        logActionToFieldbook(`Plotted ${remainingNew.length} new point${remainingNew.length === 1 ? '' : 's'}.`);
                        const workingListIndex = updatedLists.findIndex(l => l.id === 'working');
                        if (workingListIndex === -1) {
                            return [...updatedLists, { id: 'working', name: 'Unsaved Points', points: remainingNew, isVisible: true }];
                        }
                        const newLists = [...updatedLists];
                        const workingList = newLists[workingListIndex];
                        if (workingList) {
                            newLists[workingListIndex] = { ...workingList, points: [...workingList.points, ...remainingNew] };
                        }
                        return newLists;
                    });

                    // Auto-zoom after the state update has had a chance to render.
                    setTimeout(() => {
                        canvas2dRef.current?.zoomExtents();
                    }, 100);
                  } else {
                    logActionToFieldbook(`Skipped plotting ${newValidPoints.length} points (agent draw mode: lines only).`);
                  }
              }
          }
           // CIVIL DRAFTER � deterministic chain ordering.
           // The drafter classifies points into feature groups ("chains": one
           // per bank / edge / bench) instead of sequencing them itself. We
           // order each chain along its principal axis here (utils/linework.ts)
           // so bank lines run smoothly down the corridor instead of zigzagging
           // across it, and fold the resulting segments into parsedJson.lines
           // so the normal line pipeline (layer resolution, CACP remap, etc.)
           // handles them unchanged.
           if (Array.isArray(parsedJson.chains) && parsedJson.chains.length > 0) {
             const chainPointLists = pointListsRef.current;
             const chainPoints = [...chainPointLists.flatMap(pl => pl.points), ...currentBatchPoints];
             const chainLookup = new Map<string, SurveyPoint>(chainPoints.map(p => [p.pointNumber, p]));
             // Remap AI labels ? CACP numbers so chain point refs match the point DB.
             const remappedChains: DrafterChain[] = (parsedJson.chains as DrafterChain[]).map(ch => ({
               ...ch,
               pointNumbers: Array.isArray(ch.pointNumbers)
                 ? ch.pointNumbers.map(pn => aiToCacpMap.get(String(pn)) ?? String(pn))
                 : [],
             }));
             const widthExpanded = agent === AgentType.CIVIL_DRAFTER
               ? expandWidthCodedChains(remappedChains, (pn) => chainLookup.get(pn))
               : { chains: remappedChains, points: [] };
             if (widthExpanded.points.length > 0) {
               currentBatchPoints = [...currentBatchPoints, ...widthExpanded.points];
               widthExpanded.points.forEach(point => chainLookup.set(point.pointNumber, point));
               setPointLists(prev => {
                 const workingIndex = prev.findIndex(list => list.id === 'working');
                 if (workingIndex === -1) {
                   return [...prev, { id: 'working', name: 'Derived Width Features', points: widthExpanded.points, isVisible: true }];
                 }
                 const next = [...prev];
                 const working = next[workingIndex];
                 if (working) next[workingIndex] = { ...working, points: [...working.points, ...widthExpanded.points] };
                 return next;
               });
             }
             const repairedChains = agent === AgentType.CIVIL_DRAFTER
               ? repairBankCorridorChains(widthExpanded.chains, (pn) => chainLookup.get(pn))
               : widthExpanded.chains;
             const chainLines = expandChainsToLines(repairedChains, (pn) => {
               const p = chainLookup.get(pn);
               return p ? { easting: p.easting, northing: p.northing } : undefined;
             });
             if (chainLines.length > 0) {
               parsedJson.lines = Array.isArray(parsedJson.lines)
                 ? [...parsedJson.lines, ...chainLines]
                 : chainLines;
               logActionToFieldbook(`Ordered ${repairedChains.length} feature chain(s) into ${chainLines.length} line segment(s) (deterministic bank/edge ordering).`);
             }
           }
           if (parsedJson.lines && Array.isArray(parsedJson.lines)) {
            visualDataFound = true;
            logActionToFieldbook(`Plotted ${parsedJson.lines.length} lines from query: "${query}"`);
            
            // Build a point lookup map from all point lists for coordinate resolution.
            // Use ref to get CURRENT pointLists (avoids stale closure from async callback),
            // and also include currentBatchPoints since setPointLists above is async.
            const currentPointLists = pointListsRef.current;
            const allPoints = [...currentPointLists.flatMap(pl => pl.points), ...currentBatchPoints];
            const pointLookup = new Map<string, SurveyPoint>(allPoints.map(p => [p.pointNumber, p]));

            // Remap AI-assigned from/to labels ? CACP numbers (populated during point renumbering above)
            const remappedLines: SurveyLine[] = (parsedJson.lines as SurveyLine[]).map((line: SurveyLine) => ({
              ...line,
              from: aiToCacpMap.get(line.from) ?? line.from,
              to: aiToCacpMap.get(line.to) ?? line.to,
            }));
            
            // Enrich lines with fromPt/toPt coordinates if points exist
            // Also resolve layers via CAD Manager (SSOT) based on the "from" point's description.
            // Agent-specific defaults apply when CAD Manager standard is not loaded.
            const defaultLineLayerByAgent: Partial<Record<AgentType, string>> = {
              [AgentType.DEED_READER]:            'L-DEED-BOUNDARY',
              [AgentType.CIVIL_DRAFTER]:          'L-LINEWORK',
              [AgentType.RAW_CRAWLER]:            'L-LINEWORK',
              [AgentType.CENTERLINE_STATIONING]:  'L-CENTERLINE',
              [AgentType.CIVIL_PLAN_EXPERT]:      'L-LINEWORK',
              [AgentType.DXF_ANALYZER]:           'L-IMPORT',
              [AgentType.GIS_AGENT]:              'L-GIS',
            };
            const agentDefaultLineLayer = defaultLineLayerByAgent[agent] ?? 'L-LINEWORK';

            const enrichedLines = remappedLines.map((line: SurveyLine) => {
              const fromPoint = pointLookup.get(line.from);
              const toPoint = pointLookup.get(line.to);
              
              // Layer resolution order:
              // 1. CAD Manager standard (from point description)
              // 2. AI's suggested layer (from JSON output)
              // 3. Agent-specific default
              let resolvedLayer = line.layer; // Start with AI's layer (if any)
              let resolvedLineType = line.lineType; // Start with AI's lineType (if any)
              
              // Debug: Log what we're working with (only when CAD standard is loaded)
              if (cadManagerContext.state.standard) {
                console.log(`[CAD Manager] Processing line ${line.from}-${line.to}:`, {
                  fromPointFound: !!fromPoint,
                  fromPointDescription: fromPoint?.description,
                  originalLayer: line.layer,
                });
              }
              
              if (fromPoint?.description && cadManagerContext.state.standard) {
                // Try resolving with the full description first
                let resolution = cadManagerContext.resolveCode(fromPoint.description);
                
                // If not found, try just the first word/code (e.g., "EP BLDG" ? "EP")
                if (resolution.source === 'unknown' && fromPoint.description.includes(' ')) {
                  const firstCode = fromPoint.description.split(' ')[0].trim();
                  const altResolution = cadManagerContext.resolveCode(firstCode);
                  if (altResolution.source !== 'unknown') {
                    resolution = altResolution;
                    console.log(`[CAD Manager] Matched via first code: "${firstCode}" instead of full "${fromPoint.description}"`);
                  }
                }
                
                // If still not found, try uppercase
                if (resolution.source === 'unknown') {
                  const upperDesc = fromPoint.description.toUpperCase();
                  const upperResolution = cadManagerContext.resolveCode(upperDesc);
                  if (upperResolution.source !== 'unknown') {
                    resolution = upperResolution;
                    console.log(`[CAD Manager] Matched via uppercase: "${upperDesc}"`);
                  }
                }
                
                if (resolution.lineLayer) {
                  resolvedLayer = resolution.lineLayer;
                  console.log(`[CAD Manager] ? Resolved layer for line ${line.from}-${line.to}: "${fromPoint.description}" ? "${resolvedLayer}"`);
                }
                if (resolution.lineType) {
                  resolvedLineType = resolution.lineType;
                  console.log(`[CAD Manager] ? Resolved lineType for line ${line.from}-${line.to}: "${fromPoint.description}" ? "${resolvedLineType}"`);
                }
                if (resolution.source === 'unknown') {
                  // Log unresolved codes so user knows to add them to CAD Manager
                  console.log(`[CAD Manager] ? Unresolved code for line: "${fromPoint.description}" - add to standard for layer mapping`);
                  // Also log what codes ARE available
                  const availableCodes = cadManagerContext.state.standard.codes.slice(0, 10).map(c => c.code);
                  console.log(`[CAD Manager] Available codes (first 10): ${availableCodes.join(', ')}`);
                }
              } else {
                // Log why we couldn't resolve
                if (!fromPoint) {
                  console.log(`[CAD Manager] ?? No fromPoint found for point number "${line.from}"`);
                } else if (!fromPoint.description) {
                  console.log(`[CAD Manager] ?? fromPoint has no description`);
                } else if (!cadManagerContext.state.standard) {
                  console.log(`[CAD Manager] ?? No CAD Manager standard loaded - using AI's layer: "${line.layer}"`);
                }
              }
              
              // Boundary Agent: only fall back to L-DEED-BOUNDARY if CAD Manager didn't resolve a layer
              if (agent === AgentType.DEED_READER) {
                if (!resolvedLayer) resolvedLayer = 'L-DEED-BOUNDARY';
                if (!resolvedLineType) resolvedLineType = 'CONTINUOUS';
              }

              return {
                ...line,
                fromPt: fromPoint ? { x: fromPoint.easting, y: fromPoint.northing, z: fromPoint.elevation || 0 } : line.fromPt,
                toPt: toPoint ? { x: toPoint.easting, y: toPoint.northing, z: toPoint.elevation || 0 } : line.toPt,
                // Layer priority: CAD Manager standard > AI's suggestion > agent default
                layer: resolvedLayer ?? agentDefaultLineLayer,
                lineType: resolvedLineType, // Use CAD Manager resolved lineType or AI's fallback
              };
            });

            // Normalize single circles and fuse legacy/AI-emitted semicircle pairs into single circle entities
            const normalizedLines: SurveyLine[] = [];
            const usedCircleIndices = new Set<number>();

            for (let i = 0; i < enrichedLines.length; i++) {
              if (usedCircleIndices.has(i)) continue;
              const l1 = enrichedLines[i];

              const isDirectCircle = l1.isCircle || (l1.from === l1.to && l1.isCurve && l1.curveRadius);
              if (isDirectCircle && l1.curveRadius) {
                const fromPoint = pointLookup.get(l1.from);
                const center = l1.circleCenter || (fromPoint ? { x: fromPoint.easting, y: fromPoint.northing, z: fromPoint.elevation || 0 } : l1.fromPt);
                normalizedLines.push({
                  ...l1,
                  isCircle: true,
                  isCurve: true,
                  circleCenter: center,
                  fromPt: center || l1.fromPt,
                  toPt: center || l1.toPt,
                  arcLength: l1.arcLength || 2 * Math.PI * l1.curveRadius,
                });
                usedCircleIndices.add(i);
                continue;
              }

              // Semicircle pair detection: two curved segments with same radius connecting P1<->P2
              if (l1.isCurve && l1.curveRadius && l1.curveRadius > 0 && l1.from !== l1.to) {
                let pairedIdx = -1;
                for (let j = i + 1; j < enrichedLines.length; j++) {
                  if (usedCircleIndices.has(j)) continue;
                  const l2 = enrichedLines[j];
                  if (l2.isCurve && l2.curveRadius && Math.abs(l2.curveRadius - l1.curveRadius) < 1e-4) {
                    if (l1.from === l2.to && l1.to === l2.from) {
                      const halfCirc = Math.PI * l1.curveRadius;
                      const isL1Half = !l1.arcLength || Math.abs(l1.arcLength - halfCirc) < Math.max(0.2, halfCirc * 0.2);
                      const isL2Half = !l2.arcLength || Math.abs(l2.arcLength - halfCirc) < Math.max(0.2, halfCirc * 0.2);
                      if (isL1Half && isL2Half) {
                        pairedIdx = j;
                        break;
                      }
                    }
                  }
                }

                if (pairedIdx >= 0) {
                  const l2 = enrichedLines[pairedIdx];
                  const p1 = pointLookup.get(l1.from) || (l1.fromPt ? { easting: l1.fromPt.x, northing: l1.fromPt.y, elevation: l1.fromPt.z } : null);
                  const p2 = pointLookup.get(l1.to) || (l1.toPt ? { easting: l1.toPt.x, northing: l1.toPt.y, elevation: l1.toPt.z } : null);
                  let center = undefined;
                  if (p1 && p2) {
                    center = {
                      x: (p1.easting + p2.easting) / 2,
                      y: (p1.northing + p2.northing) / 2,
                      z: ((p1.elevation || 0) + (p2.elevation || 0)) / 2,
                    };
                  }
                  normalizedLines.push({
                    ...l1,
                    from: l1.from,
                    to: l1.from,
                    isCircle: true,
                    isCurve: true,
                    circleCenter: center,
                    fromPt: center || l1.fromPt,
                    toPt: center || l1.toPt,
                    arcLength: 2 * Math.PI * l1.curveRadius,
                  });
                  usedCircleIndices.add(i);
                  usedCircleIndices.add(pairedIdx);
                  continue;
                }
              }

              normalizedLines.push(l1);
              usedCircleIndices.add(i);
            }

            // Global shrinkwrap guard: ANY agent (Civil Drafter, etc.) that
            // echoes the COGO Agent's shrinkwrap output as chat-emitted lines
            // would duplicate the hull already drawn via the dedicated
            // cogo_shrinkwrap channel. Strip those lines here regardless of
            // which agent produced them - the recompute effect is the single
            // source of truth for shrinkwrap polylines.
            const isShrinkwrapLine = (l: SurveyLine) => {
              const layer = (l.layer || '').toUpperCase();
              const pid = (l.polylineId || '').toLowerCase();
              return layer === 'L-SURV-SHRINKWRAP'
                || pid === 'convex-hull'
                || pid.startsWith('shrinkwrap_');
            };
            const swSuppressed = normalizedLines.filter(isShrinkwrapLine).length;
            const enrichedLinesFiltered = swSuppressed > 0
              ? normalizedLines.filter((l: SurveyLine) => !isShrinkwrapLine(l))
              : normalizedLines;
            if (swSuppressed > 0) {
              logActionToFieldbook(`Suppressed ${swSuppressed} shrinkwrap-style line(s) echoed by ${agent} - hull already drawn via cogo_shrinkwrap.`);
            }

            if (agentDrawModeRef.current !== 'points') {
              // COGO_AGENT never draws lines directly from chat � its only
              // line-producing path is `cogo_shrinkwrap`, which emits typed
              // inclusion lines through the dedicated recompute effect. If the
              // model hallucinates a `lines:[�]` array alongside its askPeer
              // (or instead of one), drop it so we don't pollute the canvas
              // with stray regular polylines.
              if (agent === AgentType.COGO_AGENT) {
                if (enrichedLinesFiltered.length > 0) {
                  logActionToFieldbook(`Suppressed ${enrichedLinesFiltered.length} chat-emitted line(s) from COGO Agent � shrinkwrap output is the only allowed channel.`);
                }
                // intentionally do not setLines
              } else {
              // For DEED_READER, the un-typed boundary lines (raw deed traverse)
              // are NOT pushed into the global `lines` array � they live exclusively
              // as a `BoundaryFile` and are rendered by the canvas's boundary
              // overlay (amber dashed misclosure preview). This makes the
              // BoundaryFile the single source of truth ("Boundary Object").
              // Typed lines (breakline / inclusion / exclusion / contour / parcel)
              // are still drawn as regular SurveyLines.
              // Until the user clicks "Draw Boundary" in the editor, no CAD-Manager-
              // styled linework exists on the canvas for deed traverses.
              const linesToPlot = agent === AgentType.DEED_READER
                ? enrichedLinesFiltered.filter(l => !!l.type)
                : enrichedLinesFiltered;
              if (linesToPlot.length > 0) {
                setLines(prevLines => [...prevLines, ...linesToPlot]);
              }
              if (agent === AgentType.DEED_READER) {
                const suppressed = enrichedLinesFiltered.length - linesToPlot.length;
                if (suppressed > 0) {
                  logActionToFieldbook(`Deferred ${suppressed} deed boundary line(s) � represented as Boundary Object. Use "Draw Boundary" in editor to plot with CAD Manager rules.`);
                }
              }
              }
            } else {
              logActionToFieldbook(`Skipped plotting ${enrichedLinesFiltered.length} lines (agent draw mode: points only).`);
            }

            // Create one BoundaryFile per tract for deed-reader traverses, so
            // each described parcel can be hidden/named/edited independently.
            if (agent === AgentType.DEED_READER) {
              console.log('[DEED_PARSE_BF] entering BoundaryFile creation. enrichedLines:', enrichedLines.length,
                'untyped (boundary):', enrichedLines.filter(l => !l.type).length);
              // Build per-vertex description lookup so the Draft step can stamp
              // meaningful corner descriptions (e.g. "iron rod found") instead of
              // regurgitating bearing/distance strings. Source: parsedJson.points
              // carrying the DEED_READER prompt's mandated section 8 monument
              // descriptions. CRITICAL: parsedJson.points still holds the AI's
              // ORIGINAL labels � only the cloned newValidPoints[] was CACP-
              // renumbered. Lines, however, are remapped to CACP numbers via
              // aiToCacpMap (see ~L6213). So we must key descByPn by the CACP
              // number too, or every Draft falls back to "calc'd pt (...)".
              const descByPn = new Map<string, string>();
              if (Array.isArray(parsedJson.points)) {
                for (const p of parsedJson.points) {
                  if (!p || typeof p.description !== 'string' || !p.description.trim()) continue;
                  const aiLabel = p.pointNumber != null ? String(p.pointNumber) : '';
                  const cacpPn = aiToCacpMap.get(aiLabel) ?? aiLabel;
                  if (cacpPn) descByPn.set(cacpPn, p.description.trim());
                  // Also store under the raw AI label as a fallback for cases
                  // where aiToCacpMap wasn't populated (e.g. points-only path).
                  if (aiLabel && aiLabel !== cacpPn) descByPn.set(aiLabel, p.description.trim());
                }
              }
              console.log('[DEED_PARSE_BF] descByPn built:', { size: descByPn.size, sample: Array.from(descByPn.entries()).slice(0, 5) });
              const boundaryLineCalls = enrichedLines
                .filter(l => !l.type)  // boundary lines have no type
                .map(l => ({
                  id: l.id || `${l.from}-${l.to}-${Date.now()}`,
                  from: l.from,
                  to: l.to,
                  bearing: l.bearing || '',
                  distance: l.distance || '',
                  isCurve: l.isCurve,
                  curveRadius: l.curveRadius,
                  arcLength: l.arcLength,
                  chordBearing: l.chordBearing,
                  chordDistance: typeof l.chordDistance === 'number' ? l.chordDistance : undefined,
                  tangentBearing: l.tangentBearing,
                  curveDirection: l.curveDirection,
                  toDescription: descByPn.get(l.to),
                } as import('./types.ts').BoundaryFileCall));

              if (boundaryLineCalls.length > 0) {
                // Split the bag of boundary calls into separate tracts by
                // walking `from ? to` chains; every closed loop (or terminal
                // chain that can't be closed) becomes its own BoundaryFile.
                const tractCallGroups: import('./types.ts').BoundaryFileCall[][] = [];
                const consumed = new Set<string>();

                for (let startIdx = 0; startIdx < boundaryLineCalls.length; startIdx++) {
                  const seed = boundaryLineCalls[startIdx];
                  if (consumed.has(seed.id)) continue;

                  const chain: import('./types.ts').BoundaryFileCall[] = [seed];
                  consumed.add(seed.id);
                  const startFrom = seed.from;
                  let cursor = seed.to;
                  const loopGuard = boundaryLineCalls.length + 5;
                  let safety = 0;

                  while (safety < loopGuard) {
                    safety++;
                    const next = boundaryLineCalls.find(c => !consumed.has(c.id) && c.from === cursor);
                    if (!next) break;
                    chain.push(next);
                    consumed.add(next.id);
                    cursor = next.to;
                    if (cursor === startFrom) break; // closed
                  }

                  tractCallGroups.push(chain);
                }

                // A deed that STARTS with a curve � or ends on a cul-de-sac
                // curve whose chord bearing was never stated � gives the model
                // no tangent reference, so that curve's chord direction is a
                // guess. A wrong guess displaces the whole tract and miscloses
                // at the POB. Recover the required chord by inverting between
                // the curve's walked start and end (rotate the curve until its
                // endpoint touches) and keep it only when the patched traverse
                // then closes within tolerance.
                try {
                  const { tryRotateCurveChordsIntoTolerance } = await import('./utils/closureSolver.ts');
                  for (let g = 0; g < tractCallGroups.length; g++) {
                    const rotation = tryRotateCurveChordsIntoTolerance(tractCallGroups[g], pointMap);
                    if (rotation.ok) {
                      tractCallGroups[g] = rotation.patchedCalls;
                      logActionToFieldbook(`Curve-chord fix: ${rotation.summary}`);
                    }
                  }
                } catch { /* best-effort � preview proceeds with the unrotated geometry */ }

                // For per-tract Compute requests, prefer the specific tract's
                // descriptive metadata (tractName / tractId / parcelId from the
                // deedSummary) over the deed-file-level fallback chain. Without
                // this the FIRST tract computed lands with the raw PDF filename
                // because deedFile.deedMetadata isn't populated until later.
                const pendingTract = pendingTractIdRef.current
                    ? deedSummary?.tracts.find(t => t.tractId === pendingTractIdRef.current)
                    : undefined;
                const tractDerivedName = pendingTract
                    ? (pendingTract.tractName || pendingTract.tractId || pendingTract.parcelId)
                    : undefined;

                const baseName =
                  tractDerivedName ||
                  deedFile?.deedMetadata?.parcelId ||
                  deedFile?.deedMetadata?.owners?.[0] ||
                  deedFile?.name?.replace(/\.[^/.]+$/, '') ||
                  `Boundary ${new Date().toLocaleTimeString()}`;

                // Resolve AI self-rated confidence, with a client-side fallback
                // derived from uncertainty count when the model omits it.
                const aiConf = (parsedJson as any)?.deedConfidence;
                const uncertaintyCount = Array.isArray((parsedJson as any)?.uncertainties)
                    ? (parsedJson as any).uncertainties.length
                    : 0;
                let resolvedConfidence: import('./types.ts').DeedConfidence | undefined;
                if (aiConf && typeof aiConf === 'object'
                    && (aiConf.level === 'high' || aiConf.level === 'medium' || aiConf.level === 'low')) {
                    resolvedConfidence = {
                        level: aiConf.level,
                        reasons: Array.isArray(aiConf.reasons)
                            ? aiConf.reasons.filter((r: any) => typeof r === 'string' && r.trim()).slice(0, 6)
                            : [],
                        source: 'ai',
                    };
                } else {
                    const level: 'high' | 'medium' | 'low' =
                        uncertaintyCount === 0 ? 'high'
                        : uncertaintyCount <= 2 ? 'medium'
                        : 'low';
                    resolvedConfidence = {
                        level,
                        reasons: uncertaintyCount === 0
                            ? ['No uncertainties flagged by the AI.']
                            : [`AI flagged ${uncertaintyCount} uncertaint${uncertaintyCount === 1 ? 'y' : 'ies'} on this deed.`],
                        source: 'derived',
                    };
                }

                const newFiles: BoundaryFile[] = tractCallGroups.map((group, idx) => ({
                  id: `bf-${Date.now()}-${idx}`,
                  name: tractCallGroups.length > 1 ? `${baseName} - Tract ${idx + 1}` : baseName,
                  createdAt: new Date().toISOString(),
                  calls: group,
                  hidden: false,  // v26.05.22.2 � show amber preview immediately
                                  // so the user can see what the parser produced
                                  // without first having to find the eye toggle.
                  // If this batch was produced by a per-tract Compute Preview
                  // request from the DeedSummaryPanel, tag every resulting BF
                  // with the originating tractId so the panel can mark that
                  // pending-summary row as ? computed.
                  sourceTractId: pendingTractIdRef.current ?? undefined,
                  // If the user typed a POB into the pending-tract row, anchor
                  // the amber preview there. Without this the boundary starts
                  // at (0,0) and the user has to manually re-locate it.
                  pobOverride: pendingTractPobRef.current ?? undefined,
                  deedConfidence: resolvedConfidence,
                }));

                console.log('[DEED_PARSE_BF] About to setBoundaryFiles. newFiles:', newFiles.length,
                  'tractCallGroups sizes:', tractCallGroups.map(g => g.length));
                setBoundaryFiles(prev => [...prev, ...newFiles]);
                setDeedSummaryFileIds(newFiles.map(f => f.id));
                // Make the freshly-computed tract active in the editor so the
                // user doesn't have to manually switch to it after each Compute.
                if (newFiles.length > 0) {
                  setActiveBoundaryFileId(newFiles[0].id);
                }
                // Clear the per-tract "in flight" marker now that the parse
                // has landed BoundaryFiles in state. The DeedSummaryPanel
                // uses `computingTractIds` to disable buttons + show a
                // spinner; `pendingTractIdRef` is single-shot per request.
                if (pendingTractIdRef.current) {
                  const justComputed = pendingTractIdRef.current;
                  setComputingTractIds(prev => {
                    const next = new Set(prev);
                    next.delete(justComputed);
                    return next;
                  });
                  pendingTractIdRef.current = null;
                  pendingTractPobRef.current = null;
                } else {
                  // "Compute All" path � clear everything that was pending.
                  setComputingTractIds(new Set());
                  pendingTractPobRef.current = null;
                }
                // v26.05.25.3 � switch the visual panel to the canvas so the
                // DrawingCanvas component actually mounts and renders the amber
                // preview. Without this the canvas isn't in the DOM and the
                // boundaryFiles prop has nowhere to be drawn.
                showView('canvas');
                setIsBoundaryEditorVisible(false);
                setIsBoundaryEditorButtonPulsing(true);
                if (newFiles.length === 1) {
                  logActionToFieldbook(`Created boundary file "${newFiles[0].name}" with ${newFiles[0].calls.length} calls.`);
                } else {
                  logActionToFieldbook(`Detected ${newFiles.length} tracts in deed � created separate boundary files: ${newFiles.map(f => f.name).join(', ')}.`);
                }
                // v26.05.22.3 � Auto-zoom canvas to amber overlay bbox so the
                // user actually sees the preview. Otherwise the synthesized
                // geometry starts at {0,0} which is usually off-screen.
                setTimeout(() => {
                  try {
                    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
                    for (const file of newFiles) {
                      if (file.calls.length === 0) continue;
                      const firstCall = file.calls[0];
                      const pobFromMap = pointMap.get(firstCall.from);
                      const anchor: { easting: number; northing: number } = pobFromMap
                        ? { easting: pobFromMap.easting, northing: pobFromMap.northing }
                        : { easting: 0, northing: 0 };
                      let cursor = anchor;
                      const consume = (pt: { easting: number; northing: number }) => {
                        if (pt.easting < minE) minE = pt.easting;
                        if (pt.easting > maxE) maxE = pt.easting;
                        if (pt.northing < minN) minN = pt.northing;
                        if (pt.northing > maxN) maxN = pt.northing;
                      };
                      consume(anchor);
                      for (const call of file.calls) {
                        let endPt: { easting: number; northing: number } | null = null;
                        if (call.isCurve && typeof call.curveRadius === 'number' && isFinite(call.curveRadius)
                            && typeof call.arcLength === 'number' && isFinite(call.arcLength) && call.arcLength !== 0) {
                          const centralAngle = call.arcLength / call.curveRadius;
                          const left = (call as any).curveDirection === 'left';
                          const signedDelta = left ? -centralAngle : centralAngle;
                          const chordStr = call.chordBearing || call.bearing;
                          const chordRad = chordStr ? parseBearingToRadians(chordStr) : null;
                          const tRad = chordRad !== null
                            ? chordRad - signedDelta / 2
                            : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
                          if (tRad !== null) endPt = directCurve(cursor, tRad, call.curveRadius, signedDelta);
                        } else {
                          const bStr = call.bearing || call.chordBearing;
                          const bRad = bStr ? parseBearingToRadians(bStr) : null;
                          const dist = call.distance ? parseDistance(call.distance) : null;
                          if (bRad !== null && typeof dist === 'number' && isFinite(dist)) {
                            endPt = direct(cursor, bRad, dist);
                          }
                        }
                        if (endPt && isFinite(endPt.easting) && isFinite(endPt.northing)) {
                          consume(endPt);
                          cursor = endPt;
                        }
                      }
                    }
                    if (isFinite(minE) && isFinite(maxE) && isFinite(minN) && isFinite(maxN)
                        && (maxE > minE || maxN > minN)) {
                      canvas2dRef.current?.zoomToBbox(minE, maxE, minN, maxN, 0.25);
                    }
                  } catch (err) {
                    console.warn('[DEED_PARSE] auto-zoom to amber bbox failed:', err);
                  }
                }, 120);
              }
            }
          }
          if (parsedJson.cutSheet && Array.isArray(parsedJson.cutSheet)) {
            logActionToFieldbook(`Generated cut sheet data from query: "${query}"`);
            setCutSheetData(prev => [...prev, ...parsedJson.cutSheet]);
            showView('cutsheet');
          }
          if (parsedJson.modifiedContent) {
            setTextEditorContent(parsedJson.modifiedContent);
            setHasUnsavedChanges(true);
            logActionToFieldbook(`AI modified content of ${activeTextEditorFile}.`);
          }
          
          if (parsedJson.newFile && parsedJson.newFile.name && typeof parsedJson.newFile.content === 'string') {
              const newFile: SessionFile = {
                  name: parsedJson.newFile.name,
                  content: parsedJson.newFile.content
              };
              setGeneratedFiles(prev => [...prev, newFile]);
              logActionToFieldbook(`AI generated file: ${newFile.name}`);
              
              if (newFile.name.toLowerCase().endsWith('.csv') || newFile.name.toLowerCase().endsWith('.txt')) {
                  const newPoints = parsePointFile(newFile.content);
                  if (newPoints.length > 0) {
                      setPointLists(prevLists => {
                          const listName = newFile.name.replace(/\.[^/.]+$/, "");
                          const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
                          const uniqueNewPoints = newPoints.filter(p => !allExistingPointNumbers.has(p.pointNumber));

                          if (uniqueNewPoints.length > 0) {
                              const newList: PointList = { id: Date.now().toString(), name: listName, points: uniqueNewPoints, isVisible: true };
                              return [...prevLists, newList];
                          }
                          return prevLists;
                      });
                      showView('canvas');
                      return; // Don't also open in text editor
                  }
              }
              handleOpenFileInEditor(newFile.name, [newFile]); 
          }

          if (parsedJson.newPointList && parsedJson.newPointList.name && Array.isArray(parsedJson.newPointList.points)) {
            visualDataFound = true;
            const newListName = parsedJson.newPointList.name;
            const newPointsForList = parsedJson.newPointList.points;

            logActionToFieldbook(`Created new point list "${newListName}" with ${newPointsForList.length} points from query: "${query}"`);
            setPointLists(prevLists => {
                const newListId = Date.now().toString();
                const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
                const uniqueNewPoints = newPointsForList.filter((p: SurveyPoint) => !allExistingPointNumbers.has(p.pointNumber));
                
                if (uniqueNewPoints.length < newPointsForList.length) {
                    const skippedCount = newPointsForList.length - uniqueNewPoints.length;
                    setError(`${skippedCount} point(s) were skipped due to duplicate point numbers.`);
                    setTimeout(() => setError(null), 4000);
                }
                
                if(uniqueNewPoints.length === 0) {
                    return prevLists;
                }

                const newList: PointList = {
                    id: newListId,
                    name: newListName,
                    points: uniqueNewPoints,
                    isVisible: true,
                };

                return [...prevLists, newList];
            });

            showView('canvas');
          }
          
          if (parsedJson.stationingParameters) {
            const params = parsedJson.stationingParameters;
            const { startStation, endStation, interval, offset, pointNumberPrefix, description, keyStations } = params;

            // Normalize offset: accept number or number[]. An empty/missing
            // offset is invalid.
            const offsetList: number[] = Array.isArray(offset)
                ? offset.filter((v: unknown) => typeof v === 'number' && isFinite(v as number)) as number[]
                : (typeof offset === 'number' && isFinite(offset) ? [offset] : []);

            // keyStations mode places points at every PC/PT (and BOP/EOP) of
            // the alignment; interval is ignored. Standard interval mode still
            // requires startStation + interval. Single-station mode places one
            // point at startStation when interval and endStation are omitted
            // (e.g. "give me a point at 13+00 75' left").
            const useKeyStations = keyStations === true;
            const singleStation = !useKeyStations
                && typeof startStation === 'number'
                && (interval === undefined || interval === null)
                && (endStation === undefined || endStation === null);
            const hasValidParams = useKeyStations
                ? offsetList.length > 0
                : (typeof startStation === 'number'
                    && offsetList.length > 0
                    && (singleStation || typeof interval === 'number'));

            if (!hasValidParams) {
                const missing: string[] = [];
                if (useKeyStations) {
                    if (offsetList.length === 0) missing.push('offset');
                } else {
                    if (typeof startStation !== 'number') missing.push('startStation');
                    if (offsetList.length === 0) missing.push('offset');
                    // interval is only missing if the request implies a range
                    // (endStation provided but no interval).
                    if (typeof startStation === 'number'
                        && (endStation !== undefined && endStation !== null)
                        && typeof interval !== 'number') {
                        missing.push('interval');
                    }
                }
                setError(`Invalid stationing parameters from AI - missing: ${missing.join(', ')}`);
                setTimeout(() => setError(null), 5000);
            } else if (!activeCL || centerlines.length === 0) {
                setError("? No centerline loaded. Please load a centerline file first, then request stationing points.");
                setTimeout(() => setError(null), 5000);
                console.warn('[App] Stationing request received but no centerline is loaded. centerlines.length:', centerlines.length);
            } else {
                const totalLength = calculateCenterlineLength(activeCL);
                const alignmentEnd = activeCL.beginStation + totalLength;
                // Allow endStation === "end" magic value (or omitted) to mean
                // the end of the alignment.
                const finalStation = (endStation === undefined || endStation === null || endStation === 'end')
                    ? alignmentEnd
                    : (typeof endStation === 'number' ? endStation : alignmentEnd);

                // Build the list of stations to place.
                type StationEntry = { station: number; label?: string };
                const stationList: StationEntry[] = [];
                if (useKeyStations) {
                    const keys = getCenterlineKeyStations(activeCL);
                    const rangeStart = typeof startStation === 'number' ? startStation : activeCL.beginStation;
                    for (const k of keys) {
                        if (k.station >= rangeStart - 1e-6 && k.station <= finalStation + 1e-6) {
                            stationList.push({ station: k.station, label: k.label });
                        }
                    }
                    logActionToFieldbook(`Generating points at ${stationList.length} key station(s) (PC/PT/BOP/EOP) along centerline "${activeCL.name}" from STA ${formatStation(rangeStart)} to ${formatStation(finalStation)} at offset(s) ${offsetList.join(', ')}'.`);
                } else if (singleStation) {
                    logActionToFieldbook(`Generating single-station point(s) at STA ${formatStation(startStation)} on centerline "${activeCL.name}" at offset(s) ${offsetList.join(', ')}'.`);
                    stationList.push({ station: startStation });
                } else {
                    logActionToFieldbook(`Generating points along centerline "${activeCL.name}" from STA ${formatStation(startStation)} to ${formatStation(finalStation)} with ${interval}' interval at offset(s) ${offsetList.join(', ')}'.`);
                    for (let s = startStation; s <= finalStation + 0.001; s += interval) {
                        stationList.push({ station: s });
                    }
                }

                // Cross product: every station � every offset.
                const stationsToPlace: { station: number; offset: number; label?: string; coords: { northing: number; easting: number } }[] = [];
                for (const s of stationList) {
                    for (const off of offsetList) {
                        const coords = calculatePointFromStationOffset(activeCL, s.station, off);
                        if (coords) stationsToPlace.push({ station: s.station, offset: off, label: s.label, coords });
                    }
                }

                const agent = PointAgent.getInstance();
                agent.setLabelingSettings(settings.pointLabelingSettings);
                agent.setAvailablePoints(pointLists.flatMap(l => l.points));
                const issuedNumbers = agent.getNextNumbers(stationsToPlace.length);

                const newPoints: SurveyPoint[] = [];
                stationsToPlace.forEach((entry, idx) => {
                    const stationLabel = formatStation(entry.station);
                    const sideTag = `${Math.abs(entry.offset)}' ${entry.offset >= 0 ? 'RT' : 'LT'}`;
                    const keyTag = entry.label ? `${entry.label} ` : '';
                    const pointDesc = description
                        || `${pointNumberPrefix ? pointNumberPrefix + ' ' : ''}${keyTag}STA ${stationLabel} OFF ${sideTag}`;
                    newPoints.push({
                        pointNumber: issuedNumbers[idx],
                        northing: entry.coords.northing,
                        easting: entry.coords.easting,
                        elevation: 0,
                        description: pointDesc,
                    });
                });

                if (newPoints.length > 0) {
                    logActionToFieldbook(`Client-side calculation placed ${newPoints.length} new points from stationing parameters.`);
                    setPointLists(prevLists => {
                        const workingListIndex = prevLists.findIndex(l => l.id === 'working');
                        const workingList = workingListIndex !== -1 ? prevLists[workingListIndex] : { id: 'working', name: 'Unsaved Points', points: [], isVisible: true };
                        const updatedWorkingList = { ...workingList, points: [...workingList.points, ...newPoints] };
                        if (workingListIndex !== -1) {
                            const newLists = [...prevLists];
                            newLists[workingListIndex] = updatedWorkingList;
                            return newLists;
                        } else {
                            return [...prevLists, updatedWorkingList];
                        }
                    });
                    visualDataFound = true;
                } else {
                    setError("Could not generate any points. The specified station range might be outside the centerline's limits.");
                    setTimeout(() => setError(null), 5000);
                }
            }
          }

          if (parsedJson.contourParameters) {
            const { contourInterval, majorInterval, pointFilterDescription } = parsedJson.contourParameters;
            if (typeof contourInterval === 'number' && typeof majorInterval === 'number') {
                const newSettings: ContourSettings = {
                    ...contourSettings, // Keep existing smoothing, labels, density
                    contourInterval,
                    majorInterval,
                    pointFilterDescription: pointFilterDescription || '',
                };
                setContourSettings(newSettings);
                
                // Allow state to update, then generate contours
                setTimeout(() => {
                    let pointsToContour = points;
                    const ignoredSet = new Set(newSettings.ignoredPointNumbers ?? []);
                    if (ignoredSet.size > 0) pointsToContour = pointsToContour.filter(p => !ignoredSet.has(p.pointNumber));
                    const filter = newSettings.pointFilterDescription.trim().toUpperCase();
                    if (filter) {
                        pointsToContour = pointsToContour.filter(p => p.description?.toUpperCase().includes(filter));
                    }
                    
                    if (pointsToContour.length < 3) {
                        setError("Not enough points to generate contours. At least 3 points are required.");
                        setTimeout(() => setError(null), 4000);
                        return;
                    }

                    setIsGeneratingContours(true);
                    try {
                        const breaklines = lines.filter(l => l.type === 'breakline');
                        // FIX: The `generateContours` function now returns labels. Capture and set them.
                        const { lines: contourLines, labels: newLabels } = generateContours(
                            pointsToContour, 
                            newSettings.contourInterval, 
                            newSettings.majorInterval, 
                            newSettings.smoothing,
                            newSettings.showLabels,
                            newSettings.labelDensity,
                            breaklines
                        );
                        setLines(prevLines => {
                            const existingLines = prevLines.filter(l => !l.type?.startsWith('contour'));
                            return [...existingLines, ...contourLines];
                        });
                        setContourLabels(newLabels);
                        showView('canvas');
                    } catch (e) {
                         setError(`Contour Generation Error: ${(e as Error).message}`);
                         setTimeout(() => setError(null), 5000);
                    } finally {
                        setIsGeneratingContours(false);
                    }
                }, 0);
            }
          }

          if (parsedJson.profileParameters) {
            let { type, from, to, centerlineId, startStation, endStation } = parsedJson.profileParameters;
            // Fallback: model sometimes returns identifiers:["from","to"] instead of from/to fields
            if ((!from || !to) && Array.isArray((parsedJson.profileParameters as any).identifiers)) {
                const ids = (parsedJson.profileParameters as any).identifiers;
                if (ids.length >= 2) { from = String(ids[0]); to = String(ids[1]); }
            }
            if (type === 'line' && from && to) {
                const allPoints = pointLists.flatMap(l => l.points);
                const fromPoint = allPoints.find(p => p.pointNumber === from);
                const toPoint = allPoints.find(p => p.pointNumber === to);
                
                if (fromPoint && toPoint) {
                    try {
                        const contourSegments = lines.filter(l => l.type?.startsWith('contour'));
                        const profilePoints = generateProfile(fromPoint, toPoint, allPoints, contourSegments);
                        setProfileData(profilePoints);
                        setProfileInfo({ name: `Line ${from}-${to}`, type: 'line' });
                        logActionToFieldbook(`Generated profile for line ${from}-${to}.`);
                        showView('profile');
                        visualDataFound = true;
                    } catch (e) {
                        setError(`Profile Generation Error: ${(e as Error).message}`);
                    }
                } else {
                    setError(`Could not find start point "${from}" or end point "${to}" for profile generation.`);
                }
            }
            // Future: Add handler for centerline profiles here.
          }

          if (parsedJson.contourParameters) {
            // Handle contour generation request from CONTOURING_AGENT chat
            const params = parsedJson.contourParameters;
            try {
              setContourSettings({
                contourInterval: params.contourInterval || 1.0,
                majorInterval: params.majorInterval || 5.0,
                pointFilterDescription: params.pointFilterDescription || '',
                smoothing: params.smoothing !== undefined ? params.smoothing : 2,
                showLabels: params.showLabels !== undefined ? params.showLabels : true,
                labelDensity: params.labelDensity || 0.5,
                labelScale: params.labelScale || 1.0,
                esriServiceUrls: contourSettings.esriServiceUrls,
                ignoredPointNumbers: contourSettings.ignoredPointNumbers,
              });
              
              // Trigger contour generation with these settings
              setTimeout(() => {
                setIsGeneratingContours(true);
                setError(null);
                try {
                    let pointsToContour = points;
                    const ignoredSet = new Set(contourSettings.ignoredPointNumbers ?? []);
                    if (ignoredSet.size > 0) pointsToContour = pointsToContour.filter(p => !ignoredSet.has(p.pointNumber));
                    const filter = (params.pointFilterDescription || '').trim().toUpperCase();
                    if (filter) {
                        pointsToContour = pointsToContour.filter(p => p.description?.toUpperCase().includes(filter));
                        logActionToFieldbook(`Generating ${params.contourInterval}' contours with smoothing level ${params.smoothing}, using ${pointsToContour.length} points matching "${params.pointFilterDescription}".`);
                    } else {
                        logActionToFieldbook(`Generating ${params.contourInterval}' contours with smoothing level ${params.smoothing}, using ${pointsToContour.length} points.`);
                    }

                    const breaklines = lines.filter(l => l.type === 'breakline');
                    const { lines: contourLines, labels: newLabels } = generateContours(
                        pointsToContour,
                        params.contourInterval,
                        params.majorInterval,
                        params.smoothing,
                        params.showLabels,
                        params.labelDensity,
                        breaklines
                    );

                    setLines(prevLines => {
                        const existingLines = prevLines.filter(l => !l.type?.startsWith('contour'));
                        return [...existingLines, ...contourLines];
                    });
                    setContourLabels(newLabels);

                    showView('canvas');
                    visualDataFound = true;
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
                    setError(`Contour Generation Error: ${errorMessage}`);
                    setTimeout(() => setError(null), 5000);
                } finally {
                    setIsGeneratingContours(false);
                }
              }, 0);
            } catch (e) {
              setError(`Error processing contour parameters: ${(e as Error).message}`);
            }
          }

          if (parsedJson.uncertainties && Array.isArray(parsedJson.uncertainties)) {
            const allSearchablePDFFiles: SessionFile[] = [
                ...(deedFile ? [deedFile] : []),
                ...(planFiles || []),
            ];

            const newHighlights = parsedJson.uncertainties.map((u: any, i: number) => {
                const fileIndex = allSearchablePDFFiles.findIndex(f => f.name === u.fileName);
                
                if (fileIndex === -1) {
                    console.warn(`File "${u.fileName}" not found in current session for uncertainty highlight.`);
                    return null;
                }

                const colors = getRandomHighlightColor();

                // Prefer text-anchor; fall back to Gemini-native normalized box_2d;
                // last-resort legacy {x, y, width, height} for back-compat.
                const textSnippet = typeof u.textSnippet === 'string' ? u.textSnippet : undefined;
                const contextBefore = typeof u.contextBefore === 'string' ? u.contextBefore : undefined;
                const contextAfter = typeof u.contextAfter === 'string' ? u.contextAfter : undefined;

                let box2dNorm: [number, number, number, number] | undefined;
                if (Array.isArray(u.box_2d) && u.box_2d.length === 4 && u.box_2d.every((n: any) => typeof n === 'number')) {
                    box2dNorm = [u.box_2d[0], u.box_2d[1], u.box_2d[2], u.box_2d[3]];
                }

                let legacyBox: { x1: number; y1: number; x2: number; y2: number } | undefined;
                if (u.boundingBox && typeof u.boundingBox.x === 'number') {
                    legacyBox = {
                        x1: u.boundingBox.x,
                        y1: u.boundingBox.y,
                        x2: u.boundingBox.x + u.boundingBox.width,
                        y2: u.boundingBox.y + u.boundingBox.height,
                    };
                }

                if (!textSnippet && !box2dNorm && !legacyBox) {
                    console.warn(`Uncertainty for "${u.fileName}" page ${u.pageNumber} has no usable anchor; skipping.`, u);
                    return null;
                }
                if (!box2dNorm && !legacyBox) {
                    // textSnippet alone is fragile on raster scans � warn loudly.
                    console.warn(`Uncertainty for "${u.fileName}" page ${u.pageNumber} has only a textSnippet anchor (no box_2d). Highlight will fail if the PDF text layer doesn't contain the snippet.`, u);
                }

                return {
                    id: `${Date.now()}-${i}`,
                    fileIndex: fileIndex,
                    pageIndex: u.pageNumber - 1,
                    reason: u.reason,
                    textSnippet,
                    contextBefore,
                    contextAfter,
                    box2dNorm,
                    boundingBox: legacyBox,
                    pageWidth: 0,
                    pageHeight: 0,
                    color: colors.fill,
                    borderColor: colors.border,
                };
            }).filter((h: any): h is PdfHighlight => h !== null);
            
            if (newHighlights.length > 0) {
                const newHighlightIds = newHighlights.map(h => h.id);
                addHighlights(newHighlights);

                logActionToFieldbook(
                    `AI reported ${newHighlights.length} uncertainties for review.`, 
                    { type: 'VIEW_UNCERTAINTIES', payload: { highlightIds: newHighlightIds } }
                );
                
                uncertaintyFound = true;
            }
          }

          if (parsedJson.closureParameters) {
            const params = parsedJson.closureParameters;
            try {
                // Perform client-side calculation for accuracy, using AI's selected points/lines
                const pointsForClosureMap = new Map(params.points.map((p: SurveyPoint) => [p.pointNumber, p]));
                // FIX: Cast pointsForClosureMap to `any` to resolve TypeScript error due to Map type invariance
                // between SurveyPoint and the unexported ClosurePoint type in cogo.ts.
                const clientSideCalc = calculateClosure(params.lines, pointsForClosureMap as any);
                
                const newReport: ClosureReport = {
                    ...clientSideCalc,
                    id: Date.now().toString(),
                    createdAt: new Date().toISOString(),
                    name: params.name, // Keep the name from the AI
                };
          
                setClosureReports(prev => [...prev, newReport]);
                logActionToFieldbook(`Generated closure report: "${newReport.name}"`);
                closureReportFound = true;
          
            } catch (calcError) {
                console.error("Client-side closure calculation failed:", calcError);
                setError(`Client-side closure calculation failed: ${(calcError as Error).message}`);
            }
          }

          if (parsedJson.stakeoutPoints && Array.isArray(parsedJson.stakeoutPoints)) {
            const pointsToStake: SurveyPoint[] = parsedJson.stakeoutPoints;
            logActionToFieldbook(`AI initiated stakeout for ${pointsToStake.length} points from ${activeTextEditorFile}.`);
            
            setPointLists(prevLists => {
                const workingListIndex = prevLists.findIndex(l => l.id === 'working');
                const workingList = workingListIndex !== -1 ? prevLists[workingListIndex] : { id: 'working', name: 'Unsaved Points', points: [], isVisible: true };

                const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
                const newPoints = pointsToStake.filter((p: SurveyPoint) => !allExistingPointNumbers.has(p.pointNumber));
                
                const updatedWorkingList = { ...workingList, points: [...workingList.points, ...newPoints] };

                if (workingListIndex !== -1) {
                    const newLists = [...prevLists];
                    newLists[workingListIndex] = updatedWorkingList;
                    return newLists;
                } else {
                    return [...prevLists, updatedWorkingList];
                }
            });
            
            setActiveAgent(AgentType.GPS_STAKEOUT);
            showView('gpsstakeout');
          }
          if (parsedJson.plotGisFeature && gisFeatures) {
             const featureIdOrName = parsedJson.plotGisFeature;
             
             // Parse reference like "OBJECTID 2" into property name and value
             const parsePropertyRef = (ref: string): { propName: string | null; propValue: string | null } => {
                 const parts = ref.trim().split(/\s+/);
                 if (parts.length === 2) {
                     return { propName: parts[0], propValue: parts[1] };
                 }
                 return { propName: null, propValue: null };
             };
             
             const { propName, propValue } = parsePropertyRef(featureIdOrName);
             
             // Find feature by ID, property reference (e.g., "OBJECTID 2"), or any matching property value
             const feature = gisFeatures.find(f => 
                 f.id === featureIdOrName || 
                 // Try matching "PropertyName value" format (e.g., "OBJECTID 2")
                 (propName && propValue && f.properties[propName] !== undefined && String(f.properties[propName]) === propValue) ||
                 // Fall back to matching any property value
                 Object.values(f.properties).some(v => String(v) === featureIdOrName)
             );

             if (feature) {
                 visualDataFound = true;
                 logActionToFieldbook(`Plotting GIS feature: "${featureIdOrName}"`);
                 
                 // Create a temporary FeatureCollection to pass to parseGeoJson
                 const tempGeoJson = {
                     type: 'FeatureCollection',
                     features: [{
                         type: 'Feature',
                         geometry: feature.geometry,
                         properties: feature.properties
                     }]
                 };

                 const existingPointNumbers = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
                 const { points, lines } = GisService.parseGeoJson(tempGeoJson, settings, existingPointNumbers);
                 
                 setPointLists(prev => {
                    const workingListIndex = prev.findIndex(l => l.id === 'working');
                    const workingList = workingListIndex !== -1 ? prev[workingListIndex] : { id: 'working', name: 'Unsaved Points', points: [], isVisible: true };
                    
                    // Filter out duplicates just in case, though parseGeoJson handles it
                    const newPoints = points.filter(p => !workingList.points.some(wp => wp.pointNumber === p.pointNumber));
                    
                    const updatedWorkingList = { ...workingList, points: [...workingList.points, ...newPoints] };
                    
                    if (workingListIndex !== -1) {
                        const newLists = [...prev];
                        newLists[workingListIndex] = updatedWorkingList;
                        return newLists;
                    } else {
                        return [...prev, updatedWorkingList];
                    }
                 });
                 setLines(prev => [...prev, ...lines]);
                 showView('canvas');
             } else {
                 setError(`Could not find GIS feature "${featureIdOrName}" in the loaded data.`);
             }
          }

          if (parsedJson.plotGeoJson === true && gisFile) {
            visualDataFound = true;
            plotGeoJsonFile(gisFile, settings);
          }
          else if (parsedJson.geojson) {
            visualDataFound = true;
            logActionToFieldbook(`Plotted GeoJSON features from query: "${query}"`);
            const existingPointNumbers = new Set(pointLists.flatMap(l => l.points).map(p => p.pointNumber));
            const { points, lines } = GisService.parseGeoJson(parsedJson.geojson, settings, existingPointNumbers);
            setPointLists(prev => {
                const workingList = prev.find(l => l.id === 'working')!;
                // Note: parseGeoJson handles uniqueness against existingPointNumbers, so we can just append
                const updatedWorkingList = { ...workingList, points: [...workingList.points, ...points] };
                return prev.map(l => l.id === 'working' ? updatedWorkingList : l);
            });
            setLines(prev => [...prev, ...lines]);
            showView('canvas');
          }

          // Handle centerline JSON from Stationing & CL agent
          if (parsedJson.centerline && typeof parsedJson.centerline === 'object') {
            const newCenterline = parsedJson.centerline as Centerline;
            if (newCenterline.id && newCenterline.name && Array.isArray(newCenterline.pis)) {
              logActionToFieldbook(`AI updated centerline: "${newCenterline.name}" with ${newCenterline.pis.length} PIs.`);
              setCenterlines(prev => {
                const existing = prev.findIndex(cl => cl.id === newCenterline.id);
                if (existing !== -1) {
                  const updated = [...prev];
                  updated[existing] = newCenterline;
                  return updated;
                } else {
                  return [...prev, newCenterline];
                }
              });
              visualDataFound = true;
              showView('canvas');
            }
          }

          // Prioritized view switching
          // NOTE: uncertainties no longer auto-switch the view. The user is
          // alerted via the NotificationCenter bell in the canvas header and
          // can choose when to open the PDF Reviewer. Auto-switching was
          // disruptive to the parse ? review ? accept flow.
          if (closureReportFound) {
            showView('closurereport');
          } else if (visualDataFound && activeVisualPanel !== 'cutsheet' && activeVisualPanel !== 'profile') {
            showView('canvas');
          }


        } catch (e) {
          console.error("Failed to parse JSON from model response:", e, "\nContent was:", contentToParse);
          setError(`Failed to parse JSON from model response:\n${(e as Error).message}`);
        }
      }
    }
  }, [
    isFreeTierTimeLocked, isLocked, isSuperUser, hasApiKey,
    activeAgent, rawChat, deedChat, stationingChat, pointEditorChat, gpsStakeoutChat, lsvzChat, planExpertChat, dxfChat, imageAnalyzerChat, gisFile, gisChat, gisChatHistory, contouringChat, profileChat,
    standardsComplianceChat, standardsComplianceChatHistory, standardsComplianceSourceMode, standardsComplianceChecks,
    standardsComplianceControlFile, standardsComplianceSubjectFile, standardsComplianceLastReport,
    centerlines, pointLists, lines, rawFile, deedFile, clFile, planFiles, dxfFile, imageFiles, generatedFiles, jobInfo, settings, rawChatHistory, deedChatHistory, dxfChatHistory,
    stationingChatHistory, pointEditorChatHistory, fieldbookLog, gpsStakeoutChatHistory, lsvzChatHistory, planExpertChatHistory, profileChatHistory,
    imageAnalyzerChatHistory, fieldbookNotes, cutSheetData, cutSheetInfo, activeModel, activeVisualPanel, closureReports,
    isPdfViewerFullscreen, isVisualPanelFullscreen, isChatPanelVisible,
    attributeScale, pointLayers, showView, logActionToFieldbook, highlights, pdfViewerFiles, textEditorContent, activeTextEditorFile, currentPosition, handleOpenFileInEditor, offlineMapAreas,
    wmsServices, activeWmsLayers, addHighlights, plotGeoJsonFile, customSymbols, handleGenerateContours, points, contourSettings, contourLabels, linesVisible, centerlinesVisible,
    lineLabelScale, hasConfirmedApiKey, setStandardsComplianceLastReport, formatComplianceReportText, buildStandardsComplianceReport, runVisualComplianceAudit, cadManagerContext,
    applySymbolVisibilityCommand, addNotification
  ]);

  // CACP hand-offs from the Civil 3D connector arrive on the sync socket, which
  // is wired up long before these callbacks are declared — refs bridge the gap.
  handleSendMessageRef.current = handleSendMessage;

  // Structures Agent: deterministic, client-side rectifier (v26.05.31).
  // Replaces the prior Gemini-prompt approach (which produced only centroids
  // or nothing). Pipeline:
  //   1. OSM polygon + BLDG points ? Helmert rigid-body snap (HIGH confidence)
  //   2. OSM polygon, no BLDG match ? emit as-is (MEDIUM)
  //   3. BLDG-only clusters ? COGO completion (1/2/3 corners) or MER (=4)
  //   4. Lone NSI centroid + sqft ? synthetic square (LOW)
  // Output is appended to `lines` on layer STRUCTURES, replacing any prior
  // STRUCTURES linework so successive Rectify clicks idempotently rebuild.
  const handleSynthesizeStructures = useCallback(async () => {
    setIsSynthesizingStructures(true);
    setActiveAgent(AgentType.STRUCTURES_AGENT);
    try {
      const { rectifyBuildings } = await import('./services/buildingRectifier.ts');
      const bldgPoints = points.filter((p: SurveyPoint) =>
        (p.description?.toUpperCase().includes('BLDG') || (p.layer ?? '').toUpperCase().includes('BLDG'))
      );
      const nsiCentroids = lastStructuresResult?.points ?? [];
      const nsiAttrs = lastStructuresResult?.attrsByPointNumber ?? {};
      const osmFootprints = lastOsmFootprints ?? [];

      if (osmFootprints.length === 0 && nsiCentroids.length === 0 && bldgPoints.length === 0) {
        setError('Nothing to rectify � fetch FEMA/OSM structures or add BLDG survey points first.');
        setTimeout(() => setError(null), 6000);
        return;
      }

      // Heuristic foot-vs-meter detection from the active EPSG. Most U.S.
      // surveys run on State Plane US ft (2200-series, 3450+). UTM/web-merc
      // and metric SP codes resolve to meters. When in doubt assume feet.
      const epsg = settings.projection?.epsg ?? 0;
      let unitsPerFoot = 1;
      try {
        const proj4mod = (await import('proj4')).default;
        const def = (proj4mod as unknown as { defs: (code: string) => { units?: string } | undefined }).defs(`EPSG:${epsg}`);
        const u = (def?.units ?? '').toLowerCase();
        if (u === 'm' || u === 'meter' || u === 'metre') unitsPerFoot = 0.3048;
        else if (u.includes('ft') || u === 'us-ft') unitsPerFoot = 1;
      } catch { /* default 1 */ }

      const result = rectifyBuildings({
        bldgPoints,
        osmFootprints,
        nsiCentroids,
        nsiAttrs,
        options: { unitsPerFoot, layer: 'STRUCTURES' },
      });

      // Replace any prior STRUCTURES linework so reruns are idempotent.
      setLines(prev => [
        ...prev.filter((l: SurveyLine) => (l.layer ?? '').toUpperCase() !== 'STRUCTURES'),
        ...result.lines,
      ]);
      setLastRectifyStats(result.stats);

      const s = result.stats;
      const parts: string[] = [];
      if (s.osmSnapped) parts.push(`${s.osmSnapped} OSM+BLDG snapped`);
      if (s.osmAsIs)    parts.push(`${s.osmAsIs} OSM as-is`);
      if (s.cogoMer)    parts.push(`${s.cogoMer} BLDG-MER`);
      if (s.cogo3)      parts.push(`${s.cogo3} BLDG-3pt`);
      if (s.cogo2)      parts.push(`${s.cogo2} BLDG-2pt`);
      if (s.cogo1)      parts.push(`${s.cogo1} BLDG-1pt`);
      if (s.nsiOnly)    parts.push(`${s.nsiOnly} NSI-only`);
      const summary = `Rectified ${result.buildings.length} building(s): ${parts.join(', ') || 'none'}.`;
      logActionToFieldbook(summary);
      if (result.buildings.length === 0) {
        setError('Rectifier produced no footprints � try fetching a larger area or adding survey BLDG points.');
        setTimeout(() => setError(null), 6000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Structures Rectify: ${msg}`);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsSynthesizingStructures(false);
    }
  }, [points, lastStructuresResult, lastOsmFootprints, settings, logActionToFieldbook]);

  // Profile Agent � direct client-side profile generator (no AI round-trip).
  const handleGenerateProfileDirect = useCallback((params: ProfileGenerateParams) => {
    const allPts = pointLists.flatMap((l: import('./types.ts').PointList) => l.points);
    const fromPoint = allPts.find((p: SurveyPoint) => p.pointNumber === params.fromPointNumber);
    const toPoint   = allPts.find((p: SurveyPoint) => p.pointNumber === params.toPointNumber);

    if (!fromPoint) {
      setError(`Profile: point "${params.fromPointNumber}" not found.`);
      setTimeout(() => setError(null), 5000);
      return;
    }
    if (!toPoint) {
      setError(`Profile: point "${params.toPointNumber}" not found.`);
      setTimeout(() => setError(null), 5000);
      return;
    }

    try {
      const contourSegments = lines.filter((l: import('./types.ts').SurveyLine) => l.type?.startsWith('contour'));
      const profilePts = generateProfile(fromPoint, toPoint, allPts, contourSegments);
      setProfileData(profilePts);
      setProfileInfo({ name: params.name ?? `Line ${params.fromPointNumber}-${params.toPointNumber}`, type: 'line' });
      logActionToFieldbook(`Generated profile "${params.name ?? `Line ${params.fromPointNumber}-${params.toPointNumber}`}" (${profilePts.length} pts) client-side.`);
      showView('profile');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Profile Error: ${msg}`);
      setTimeout(() => setError(null), 6000);
    }
  }, [pointLists, lines, setProfileData, setProfileInfo, logActionToFieldbook, showView]);

  const handleToggleExpandMessage = useCallback((msgIndex: number) => {
    let setHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>> | null = null;
    switch (activeAgent) {
        case AgentType.RAW_CRAWLER: setHistory = setRawChatHistory; break;
        case AgentType.CIVIL_DRAFTER: setHistory = setCivilDrafterChatHistory; break;
        case AgentType.DEED_READER: setHistory = setDeedChatHistory; break;
        case AgentType.CIVIL_PLAN_EXPERT: setHistory = setPlanExpertChatHistory; break;
        case AgentType.DXF_ANALYZER: setHistory = setDxfChatHistory; break;
        case AgentType.IMAGE_ANALYZER: setHistory = setImageAnalyzerChatHistory; break;
        case AgentType.GIS_AGENT: setHistory = setGisChatHistory; break;
        case AgentType.CENTERLINE_STATIONING: setHistory = setStationingChatHistory; break;
        case AgentType.POINT_EDITOR: setHistory = setPointEditorChatHistory; break;
        case AgentType.GPS_STAKEOUT: setHistory = setGpsStakeoutChatHistory; break;
        case AgentType.LSVZ_AGENT: setHistory = setLsvzChatHistory; break;
        // FIX: Add case for the new Contouring Agent to handle message expansion.
        case AgentType.CONTOURING_AGENT: setHistory = setContouringChatHistory; break;
        case AgentType.STEEP_SLOPE_AGENT: setHistory = setSteepSlopeChatHistory; break;
        // FIX: Add case for the new Profile Agent to handle message expansion.
        case AgentType.PROFILE_AGENT: setHistory = setProfileChatHistory; break;
        case AgentType.COGO_AGENT: setHistory = setCogoChatHistory; break;
        case AgentType.GNSS_AGENT: setHistory = setRinexChatHistory; break;
        default: return;
    }

    if (setHistory) {
        setHistory(prev => {
            return prev.map((msg, index) => {
                if (index === msgIndex && msg.role === MessageRole.MODEL) {
                    return { ...msg, isExpanded: !msg.isExpanded };
                }
                return msg;
            });
        });
    }
  }, [activeAgent]);
    
  const handleOverwritePoint = useCallback(async () => {
    if (!confirmationModal) return;
    const { newPoint } = confirmationModal;
    logActionToFieldbook(`Overwrote point ${newPoint.pointNumber} with new GPS data.`);

    setPointLists(prevLists => 
        prevLists.map(list => ({
            ...list,
            points: list.points.map(p => p.pointNumber === newPoint.pointNumber ? newPoint : p)
        }))
    );
    
    const query = `Acknowledged overwriting point ${newPoint.pointNumber} with new data. Details: N: ${newPoint.northing.toFixed(settings.coordinatePrecision)}, E: ${newPoint.easting.toFixed(settings.coordinatePrecision)}, Elev: ${(newPoint.elevation || 0).toFixed(settings.coordinatePrecision)}, Desc: "${newPoint.description || 'GPS'}"`;
    await handleSendMessage(query);
    
    setConfirmationModal(null);
  }, [confirmationModal, logActionToFieldbook, handleSendMessage, settings.coordinatePrecision]);

  // CACP: delegate to PointAgent so settings + reservations are honored.
  // The `basePointNumber` arg is kept for backward-compat but ignored � the
  // agent always issues the next number per the user's labeling settings.
  const findNextAvailablePointNumber = useCallback((_basePointNumber: string): string => {
      const agent = PointAgent.getInstance();
      agent.setLabelingSettings(settings.pointLabelingSettings);
      agent.setAvailablePoints(pointLists.flatMap(l => l.points));
      const [next] = agent.getNextNumbers(1);
      return next;
  }, [pointLists, settings.pointLabelingSettings]);

  const handleRenumberAndStorePoint = useCallback(async () => {
      if (!confirmationModal) return;
      const { newPoint, position } = confirmationModal;
      
      const nextPointNumber = findNextAvailablePointNumber(newPoint.pointNumber);
      logActionToFieldbook(`Duplicate point ${newPoint.pointNumber} found. Renumbering and storing as ${nextPointNumber}.`);

      // Close modal first to allow the next point storage to proceed
      setConfirmationModal(null);
      // Re-call the store point function with the new, available point number
      await handleStoreGpsPoint(nextPointNumber, newPoint.description || 'GPS (Renumbered)', position);

  }, [confirmationModal, findNextAvailablePointNumber, logActionToFieldbook]);

  const handleCancelOverwrite = () => {
      setConfirmationModal(null);
  };


  const handleStoreGpsPoint = useCallback(async (pointNumber: string, description: string, position: { x: number; y: number } | GeolocationPosition) => {
    if (!settings.projection.epsg) {
      setError("Please select a State Plane projection in the Settings menu first.");
      setTimeout(() => setError(null), 4000);
      return;
    }

    // FIX: Removed the check for gpsStakeoutChat to allow storing points even if the chat agent isn't active.
    // if (!gpsStakeoutChat) {
    //   setError("GPS agent not initialized.");
    //   return;
    // }

    try {
        // Handle both GeolocationPosition and {x, y} coordinate formats
        let latitude: number;
        let longitude: number;
        let altitude: number | undefined;

        if ('coords' in position) {
            // GeolocationPosition
            ({ latitude, longitude, altitude } = position.coords);
        } else {
            // {x, y} format (easting, northing)
            longitude = position.x;
            latitude = position.y;
            altitude = undefined;
        }

        const fromProj = 'EPSG:4326'; // WGS84
        const toProj = `EPSG:${settings.projection.epsg}`;
        
        const [easting, northing] = proj4(fromProj, toProj, [longitude, latitude]);

        const newPoint: SurveyPoint = {
            pointNumber,
            northing,
            easting,
            elevation: altitude ?? 0,
            description: description || 'GPS',
        };

        const existingPoint = pointLists.flatMap(l => l.points).find(p => p.pointNumber === pointNumber);

        if (existingPoint) {
            setConfirmationModal({
                title: 'Point Already Exists',
                message: `Point ${pointNumber} already exists. Renumber and store as new point?`,
                onConfirm: handleRenumberAndStorePoint,
                onCancel: handleCancelOverwrite,
                newPoint,
                existingPoint,
                position: { x: longitude, y: latitude }
            });
            return;
        }

        logActionToFieldbook(`Stored GPS point ${pointNumber} using projection ${settings.projection.zoneName}.`);
        setPointLists(prevLists => {
            const workingListIndex = prevLists.findIndex(l => l.id === 'working');
            if (workingListIndex === -1) return [...prevLists, { id: 'working', name: 'Unsaved Points', points: [newPoint], isVisible: true }];
            const newLists = [...prevLists];
            newLists[workingListIndex] = { ...newLists[workingListIndex], points: [...newLists[workingListIndex].points, newPoint] };
            return newLists;
        });
        
        if (gpsStakeoutChat) {
            const query = `Acknowledge storage of point ${pointNumber}. Details: N: ${northing.toFixed(settings.coordinatePrecision)}, E: ${easting.toFixed(settings.coordinatePrecision)}, Elev: ${(altitude ?? 0).toFixed(settings.coordinatePrecision)}, Desc: "${description || 'GPS'}"`;
            await handleSendMessage(query);
        }

    } catch(err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during projection.';
        setError(`Coordinate Projection Error: ${errorMessage}`);
        console.error("Projection error:", err);
    }
  }, [gpsStakeoutChat, handleSendMessage, settings.projection, logActionToFieldbook, settings.coordinatePrecision, pointLists]);

  const handleStoreStakedGpsPoint = useCallback(async (
    designPointNumber: string,
    stakedPointNumber: string,
    description: string,
    position: GeolocationPosition
  ) => {
    if (!settings.projection.epsg) {
      setError("Please select a State Plane projection in the Settings menu first.");
      setTimeout(() => setError(null), 4000);
      return;
    }

    // FIX: Removed the check for gpsStakeoutChat to allow storing points even if the chat agent isn't active.
    // if (!gpsStakeoutChat) {
    //   setError("GPS agent not initialized.");
    //   return;
    // }

    try {
      const { latitude, longitude, altitude } = position.coords;
      const fromProj = 'EPSG:4326'; // WGS84
      const toProj = `EPSG:${settings.projection.epsg}`;

      const [easting, northing] = proj4(fromProj, toProj, [longitude, latitude]);

      const newPoint: SurveyPoint = {
        pointNumber: stakedPointNumber,
        northing,
        easting,
        elevation: altitude ?? 0,
        description,
        designPointNumber, // Link to the design point
      };

      const existingPoint = pointLists.flatMap(l => l.points).find(p => p.pointNumber === stakedPointNumber);

      if (existingPoint) {
        setError(`Point number "${stakedPointNumber}" already exists. Please choose a different number.`);
        setTimeout(() => setError(null), 4000);
        return;
      }

      logActionToFieldbook(`Stored as-staked point ${stakedPointNumber} for design point ${designPointNumber}.`);
      setPointLists(prevLists => {
        const workingListIndex = prevLists.findIndex(l => l.id === 'working');
        if (workingListIndex === -1) {
          return [...prevLists, { id: 'working', name: 'Unsaved Points', points: [newPoint], isVisible: true }];
        }
        const newLists = [...prevLists];
        newLists[workingListIndex] = { ...newLists[workingListIndex], points: [...newLists[workingListIndex].points, newPoint] };
        return newLists;
      });

      if (gpsStakeoutChat) {
        const query = `Acknowledge storage of as-staked point ${stakedPointNumber} for design point ${designPointNumber}. Details: N: ${northing.toFixed(settings.coordinatePrecision)}, E: ${easting.toFixed(settings.coordinatePrecision)}, Elev: ${(altitude ?? 0).toFixed(settings.coordinatePrecision)}`;
        await handleSendMessage(query);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during projection.';
      setError(`Coordinate Projection Error: ${errorMessage}`);
      console.error("Projection error:", err);
    }
  }, [gpsStakeoutChat, handleSendMessage, settings.projection, logActionToFieldbook, settings.coordinatePrecision, pointLists]);


  const handleCadManagerSessionStart = useCallback(() => {
    try {
        startSession();
        logActionToFieldbook('Started a new CAD Manager session.');
        // Initialize the agent chat (system prompt lives in geminiService ? CAD_MANAGER case).
        try {
          const newChat = startChatWithOverride(AgentType.CAD_MANAGER, '');
          setCadManagerChat(newChat);
          setCadManagerChatHistory([{
            role: MessageRole.MODEL,
            text:
              "Hi � I'm the **CAD Manager Agent**. Open the **CAD Standards** view (View tab ? CAD Standards) " +
              "to author description keys, layers, linetypes, and the shared symbol library. Ask me anything " +
              "about CAD standards, layer naming, symbol strategy, or why a specific code isn't resolving. " +
              "I'm also the CACP source-of-truth other agents call when they need a layer or symbol for a code.",
          }]);
        } catch (chatErr) {
          console.warn('[CAD Manager] Failed to initialize chat:', chatErr);
        }
        setInitializedAgents(prev => new Set(prev).add(AgentType.CAD_MANAGER));
        showView('cadstandards');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize CAD Manager.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [showView, startSession, logActionToFieldbook, startChatWithOverride, setCadManagerChat, setCadManagerChatHistory]);

  // FUTURE GEMINI: This function is the primary mechanism for switching between agents.
  // The logic to manage `activeAgent`, `isInitialScreen`, and `isAddingData` is crucial. Do not change it.
  const handleAgentChange = useCallback((agent: AgentType) => {
    // FIRST-TIME LEGAL GATE (v26.05.17.15) � block the user on the very first
    // agent click until they sign the agreement. Once signed (localStorage flag),
    // this short-circuit never fires again on this device.
    if (!hasLegalSignature && !hasSignedLegalAgreement()) {
      setShowLegalGate(true);
      return;
    }

    // Push current state to navigation history before changing
    if (isSessionActive && !isInitialScreen) {
      pushNavigation(activeAgent, activeVisualPanel);
    }
    
    setIsInitialScreen(false);
    if (activeVisualPanel === 'texteditor') {
        setLastActiveAgent(activeAgent);
    } else {
        setLastActiveAgent(agent);
    }
    setActiveAgent(agent);
    setIsAddingData(false);
    if (!isDesktop) setIsMobileMenuOpen(false);

    // Only the Point Editor should imply "you probably want the point list
    // open" and only the Boundary Agent should imply "you probably want the
    // boundary editor open" � clear the other button's pulse so switching
    // agents doesn't leave a stale hint flashing on an unrelated toolbar icon.
    if (agent !== AgentType.POINT_EDITOR) setIsPointListButtonPulsing(false);
    if (agent !== AgentType.DEED_READER) setIsBoundaryEditorButtonPulsing(false);
    
    // Ensure chat panel is visible for agents with tools
    const agentsWithTools = [
      AgentType.COGO_AGENT,
      AgentType.CENTERLINE_STATIONING,
      AgentType.CONTOURING_AGENT,
      AgentType.POINT_EDITOR,
      AgentType.GNSS_AGENT,
      AgentType.DRONE_AGENT,
      AgentType.STANDARDS_COMPLIANCE,
    ];
    if (agentsWithTools.includes(agent)) {
      setIsChatPanelVisible(true);
    }

    if (agent === AgentType.CAD_MANAGER && cadStandardsLoaded && !initializedAgents.has(AgentType.CAD_MANAGER)) {
      handleCadManagerSessionStart();
      return;
    }

    // If starting a new session with an agent that doesn't require a file upload screen
    if (!isSessionActive) {
      if (agent === AgentType.GPS_STAKEOUT) {
        handleStartGpsStakeoutSession();
        return;
      }
      if (agent === AgentType.GNSS_AGENT) {
        initializeRinexAgent();
        return;
      }
      if (agent === AgentType.DRONE_AGENT) {
        initializeDroneAgent();
        return;
      }
      if (agent === AgentType.AR_AGENT) {
        initializeARAgent();
        return;
      }
      // CAD_MANAGER now uses upload screen - handled via agentNeedsInitialScreen
    }

    if (isSessionActive) {
        // Civil Drafter UX: if the user has already loaded points (any visible
        // point list) and switches to Civil Drafter mid-session, skip the file
        // upload screen and auto-initialize the agent against the points
        // already on the canvas. This matches user expectation: "I have points
        // in front of me � just give me the agent."
        if (agent === AgentType.CIVIL_DRAFTER && !initializedAgents.has(AgentType.CIVIL_DRAFTER)) {
            const visibleListWithPoints = pointLists.find(l => l.isVisible && l.points.length > 0)
                                       ?? pointLists.find(l => l.points.length > 0);
            if (visibleListWithPoints) {
                try {
                    const trainingDxf = dxfFile?.forTraining ? dxfFile : undefined;
                    const syntheticName = `${visibleListWithPoints.name || 'Canvas Points'}.csv`;
                    const syntheticContent = pointListToString(visibleListWithPoints, settings);
                    const newChat = startChatWithOverride(AgentType.CIVIL_DRAFTER, syntheticContent, trainingDxf);
                    setCivilDrafterChat(newChat);
                    setRawFile({ name: syntheticName, content: syntheticContent });
                    setCivilDrafterChatHistory([{
                        role: MessageRole.MODEL,
                        text: trainingDxf
                            ? `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I'm working with the <strong>${visibleListWithPoints.points.length}</strong> points already on your canvas (<strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${visibleListWithPoints.name}"</strong>) and using <strong>"${trainingDxf.name}"</strong> as my drafting template.`
                            : `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">Civil Drafter</strong> agent. I'm working with the <strong>${visibleListWithPoints.points.length}</strong> points already on your canvas (<strong style="color: ${agentThemeColors[AgentType.CIVIL_DRAFTER]};">"${visibleListWithPoints.name}"</strong>). Ask me to draw road edges, building footprints, or any other linework from these points.`,
                    }]);
                    setSuggestedQuestions([
                        'Draw the road edges as parallel lines',
                        'Create centerline from survey shots',
                        'Plot building footprints',
                        'Analyze the point descriptions',
                    ]);
                    setInitializedAgents(prev => new Set(prev).add(AgentType.CIVIL_DRAFTER));
                    logActionToFieldbook(`Civil Drafter auto-initialized from canvas (${visibleListWithPoints.points.length} pts in "${visibleListWithPoints.name}").`);
                    showView('canvas');
                    setIsChatPanelVisible(true);
                    setError(null);
                    return;
                } catch (err) {
                    // Fall through to the standard upload-screen path on any failure.
                    console.warn('Civil Drafter auto-init from canvas failed; falling back to upload screen.', err);
                }
            }
        }

        const isViewAgent = [AgentType.GPS_STAKEOUT, AgentType.IMAGE_ANALYZER, AgentType.PROFILE_AGENT, AgentType.AR_AGENT, AgentType.CAD_MANAGER, AgentType.STANDARDS_COMPLIANCE].includes(agent);
        if (isViewAgent) {
            const targetPanel = agent === AgentType.GPS_STAKEOUT ? 'gpsstakeout' : (agent === AgentType.IMAGE_ANALYZER ? 'imageanalyzer' : (agent === AgentType.PROFILE_AGENT ? 'profile' : (agent === AgentType.AR_AGENT ? 'ar' : (agent === AgentType.STANDARDS_COMPLIANCE ? 'compliance' : 'cadmanager'))));
            showView(targetPanel);
        } else {
              const panelsToReset: Partial<Record<VisualPanel, boolean>> = {
                gpsstakeout: true,
                filemanager: true,
                imageanalyzer: true,
                pdfviewer: true,
                wms: true,
                texteditor: true,
                symbolmanager: true,
                profile: true,
                closurereport: true,
                layermanager: true,
                gnssprocessor: true,
                ar: true,
                cadmanager: true,
              };
              if (panelsToReset[activeVisualPanel]) {
                showView('canvas');
              }
        }
    }
  }, [isDesktop, isSessionActive, showView, activeVisualPanel, activeAgent, handleStartGpsStakeoutSession, pushNavigation, isInitialScreen, initializedAgents, pointLists, settings, dxfFile, startChatWithOverride, setCivilDrafterChat, setCivilDrafterChatHistory, setRawFile, logActionToFieldbook, cadStandardsLoaded, handleCadManagerSessionStart, initializeDroneAgent]);

  handleAgentChangeRef.current = handleAgentChange;
  
  const handleModelChange = useCallback((model: string) => {
    const normalizedModel = normalizeSelectedModel(model);
    if (normalizedModel === activeModel) return;
    if (!confirmFableSelection(normalizedModel)) return;
    setActiveModel(normalizedModel);
    handleReset();
  }, [activeModel, confirmFableSelection, handleReset]);

  const handleGoBackToInitialScreen = useCallback(() => {
    setIsInitialScreen(true);
  }, []);

  // Smart navigation back handler
  const handleNavigateBack = useCallback(() => {
    const previous = goBack();
    if (previous) {
      // Check if going back to upload screen (history shows same agent with canvas)
      // This happens when navigating back from first file load
      if (previous.agent === activeAgent && previous.panel === 'canvas') {
        // Going back to file upload screen - uninitialize the agent
        setInitializedAgents(prev => {
          const next = new Set(prev);
          next.delete(activeAgent);
          return next;
        });
        setIsInitialScreen(false);
      } else {
        // Navigate to previous agent and panel
        setActiveAgent(previous.agent as AgentType);
        setActiveVisualPanel(previous.panel);
      }
    } else {
      // No history, go to initial screen
      handleGoBackToInitialScreen();
    }
  }, [goBack, handleGoBackToInitialScreen, setActiveAgent, setActiveVisualPanel, activeAgent]);

  const handleCancelAddData = useCallback(() => {
    setIsAddingData(false);
  }, []);
  
  // Smart back handler: go to home if not in session, cancel if adding data
  const handleGoBackFromUpload = useCallback(() => {
    if (isAddingData) {
      handleCancelAddData();
    } else {
      handleGoBackToInitialScreen();
    }
  }, [isAddingData, handleCancelAddData, handleGoBackToInitialScreen]);

  const handleClearCanvas = useCallback(() => {
    logActionToFieldbook('Cleared canvas view by hiding all elements.');
    setPointLists(prev => hideAllPointLists(prev));
    setLinesVisible(false);
    setCenterlinesVisible(false);
  }, [logActionToFieldbook]);

  const handleRedrawAndShowAll = useCallback(() => {
    logActionToFieldbook('Redrew canvas and made all elements visible.');
    setPointLists(prev => showAllPointLists(prev));
    setLinesVisible(true);
    setCenterlinesVisible(true);
  }, [logActionToFieldbook]);

  const handleClearCutSheet = useCallback(() => {
    logActionToFieldbook('Cleared all data from the cut sheet.');
    setCutSheetData(clearCutSheetData());
  }, [logActionToFieldbook]);
  
  const handleToggleVisualPanelFullscreen = useCallback(() => {
    setIsVisualPanelFullscreen(prev => toggleFullscreen(prev));
  }, []);

  const handleTogglePdfViewerFullscreen = useCallback(() => {
      setIsPdfViewerFullscreen(p => !p);
  }, []);
  
  // NOTE: handleTogglePointEditorPanel removed - PointEditor is now in chat interface
  
   const handleUpdateCenterline = useCallback((updatedCL: Centerline) => {
    setCenterlines(prev => prev.map(cl => cl.id === updatedCL.id ? updatedCL : cl));
  }, []);
  
  const handlePlaceStationOffsetPoint = useCallback((northing: number, easting: number, pointNumber: string, description: string) => {
    logActionToFieldbook(`Calculated and placed point ${pointNumber} by station/offset.`);
    const newPoint: SurveyPoint = {
        pointNumber,
        northing,
        easting,
        elevation: 0,
        description,
    };
    setPointLists(prevLists => {
        const workingListIndex = prevLists.findIndex(l => l.id === 'working');
        if (workingListIndex === -1) return [...prevLists, { id: 'working', name: 'Unsaved Points', points: [newPoint], isVisible: true }];
        const newLists = [...prevLists];
        newLists[workingListIndex] = { ...newLists[workingListIndex], points: [...newLists[workingListIndex].points, newPoint] };
        return newLists;
    });
  }, [logActionToFieldbook]);

  const handlePointsUploaded = useCallback((newPoints: SurveyPoint[], fileName: string) => {
    logActionToFieldbook(`Uploaded and added ${newPoints.length} points from file: ${fileName}`);
    setPointLists(prevLists => {
        const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
        const uniqueNewPoints = newPoints.filter(p => !allExistingPointNumbers.has(p.pointNumber));
        if (uniqueNewPoints.length < newPoints.length) {
            const skippedCount = newPoints.length - uniqueNewPoints.length;
            setError(`${skippedCount} point(s) were skipped due to duplicate point numbers.`);
            setTimeout(() => setError(null), 4000);
        }

        const workingListIndex = prevLists.findIndex(l => l.id === 'working');
        if (workingListIndex === -1) return [...prevLists, { id: 'working', name: 'Unsaved Points', points: uniqueNewPoints, isVisible: true }];
        
        const newLists = [...prevLists];
        newLists[workingListIndex] = { ...newLists[workingListIndex], points: [...newLists[workingListIndex].points, ...uniqueNewPoints] };
        return newLists;
    });
    setIsAddingData(false); // Go back to main view
    setIsPointListButtonPulsing(true);
    setIsBoundaryEditorButtonPulsing(false);
    showView('canvas');
  }, [logActionToFieldbook, showView]);

  // Handler to start Point Editor with an empty session (no file upload)
  const handlePointEditorSessionStart = useCallback(() => {
    try {
        startSession();
        logActionToFieldbook('Started a new blank Point Editor session.');
        
        // Initialize the point editor chat
        const pointContext = JSON.stringify([{ id: 'working', name: 'Working Points', points: [], isVisible: true }], null, 2);
        const newChat = startChatWithOverride(AgentType.POINT_EDITOR, pointContext);
        setPointEditorChat(newChat);
        setPointEditorChatHistory([{
            role: MessageRole.MODEL,
            text: `Hello! I am the <strong style="color: ${agentThemeColors[AgentType.POINT_EDITOR]};">Point Editor</strong> agent. A new empty session has started. You can manually enter points in the panel, upload a file later, or ask me for COGO calculations.`,
        }]);
        setSuggestedQuestions([
            'Calculate inverse from 100 to 101',
            'Add a point at N: 5000, E: 5000',
            'Filter points by description',
        ]);
        setError(null);
        setActiveAgent(AgentType.POINT_EDITOR);
        setInitializedAgents(prev => new Set(prev).add(AgentType.POINT_EDITOR));
        setIsPointListButtonPulsing(true);
        setIsBoundaryEditorButtonPulsing(false);
        showView('canvas');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Point Editor.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [activeModel, showView, startSession, logActionToFieldbook, settings, startChatWithOverride]);

  // Handler to start CAD Manager session (from the new input screen)
  const handleImportPointList = useCallback((content: string, fileName: string) => {
    const newPoints = parsePointFile(content);
    if (newPoints.length === 0) {
      setError("No valid points found in the imported file.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    logActionToFieldbook(`Imported ${newPoints.length} points as new list from file: ${fileName}`);
    
    setPointLists(prevLists => {
      const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
      const uniqueNewPoints = newPoints.filter(p => !allExistingPointNumbers.has(p.pointNumber));
      
      if (uniqueNewPoints.length < newPoints.length) {
        const skippedCount = newPoints.length - uniqueNewPoints.length;
        setError(`${skippedCount} point(s) were skipped due to duplicate point numbers.`);
        setTimeout(() => setError(null), 4000);
      }
      
      if (uniqueNewPoints.length === 0) {
        return prevLists;
      }

      const listName = fileName.replace(/\.[^/.]+$/, ""); // remove extension
      const newList: PointList = {
        id: Date.now().toString(),
        name: listName,
        points: uniqueNewPoints,
        isVisible: true,
      };

      return [...prevLists, newList];
    });
    
    showView('canvas');
  }, [logActionToFieldbook, showView]);

  // Handler for importing points from Civil 3D
  const handleImportPointsFromC3D = useCallback((importedPoints: SurveyPoint[], sourceListName: string) => {
    if (importedPoints.length === 0) {
      setError("No points to import from Civil 3D.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    logActionToFieldbook(`Imported ${importedPoints.length} points from Civil 3D: ${sourceListName}`);
    
    setPointLists(prevLists => {
      const allExistingPointNumbers = new Set(prevLists.flatMap(l => l.points).map(p => p.pointNumber));
      const uniqueNewPoints = importedPoints.filter(p => !allExistingPointNumbers.has(p.pointNumber));
      
      if (uniqueNewPoints.length < importedPoints.length) {
        const skippedCount = importedPoints.length - uniqueNewPoints.length;
        setError(`${skippedCount} point(s) were skipped due to duplicate point numbers.`);
        setTimeout(() => setError(null), 4000);
      }
      
      if (uniqueNewPoints.length === 0) {
        return prevLists;
      }

      const listName = `C3D - ${sourceListName}`;
      const newList: PointList = {
        id: `c3d-${Date.now().toString()}`,
        name: listName,
        points: uniqueNewPoints,
        isVisible: true,
      };

      return [...prevLists, newList];
    });
    
    showView('canvas');
  }, [logActionToFieldbook, showView]);

  const handleAddLine = useCallback((newLine: SurveyLine) => {
    pushHistory(`Drew line ${newLine.from}�${newLine.to}`);
    const lineWithId = addLineToList(newLine);
    setLines(prev => [...prev, lineWithId]);
    logActionToFieldbook(`Drew line from ${lineWithId.from} to ${lineWithId.to}.`);
  }, [pushHistory, logActionToFieldbook]);

  // Forward-propagate COGO from a given index through the rest of a traverse.
  // Returns updated calls (with derived chord fields filled in) plus a working
  // point-coord map reflecting moved endpoints, and a list of brand-new points
  // that did not previously exist in any point list.
  const propagateBoundaryCalls = useCallback((
    calls: BoundaryFileCall[],
    startIdx: number,
  ): { calls: BoundaryFileCall[]; workingPtMap: Map<string, SurveyPoint>; newPointNums: Set<string> } => {
    const anchorPtNum = calls[0]?.from;
    const workingPtMap = new Map(pointLists.flatMap(l => l.points).map(p => [p.pointNumber, { ...p }]));
    const newPointNums = new Set<string>();
    const out = calls.slice();

    for (let i = Math.max(0, startIdx); i < out.length; i++) {
      const call = out[i];
      const fromPt = workingPtMap.get(call.from);
      if (!fromPt) continue;

      let newCoords: { northing: number; easting: number } | null = null;

      if (call.isCurve && call.curveRadius && call.arcLength) {
        const dir: 'left' | 'right' = call.curveDirection ?? 'right';
        const deltaAngle = (call.arcLength / call.curveRadius) * (dir === 'left' ? -1 : 1);
        const computedChordDist = calculateChordDistance(call.curveRadius, deltaAngle);
        // Decide whether the chord geometry is user-driven (chord bearing typed in)
        // or derived from radius+arc+direction. We MUST NOT overwrite a user's
        // chord/tangent entries on every propagation tick, or clicking between
        // curve fields will visibly mutate them.
        const userChordRad = parseBearingToRadians(call.chordBearing ?? '');
        const userTangentRad = parseBearingToRadians(call.tangentBearing ?? '');
        let chordRad: number | null = null;
        let tangentRad: number | null = null;
        if (userChordRad !== null) {
          chordRad = userChordRad;
          tangentRad = chordRad - deltaAngle / 2;
        } else if (userTangentRad !== null) {
          tangentRad = userTangentRad;
          chordRad = tangentRad + deltaAngle / 2;
        } else {
          // Fall back to the previous straight bearing as a tangent guess.
          const fallback = parseBearingToRadians(call.bearing);
          if (fallback !== null) {
            tangentRad = fallback;
            chordRad = tangentRad + deltaAngle / 2;
          }
        }
        if (chordRad !== null && tangentRad !== null) {
          newCoords = directCurve(fromPt, tangentRad, call.curveRadius, deltaAngle);
          const chordStr = formatBearing(chordRad);
          const distStr = computedChordDist.toFixed(2);
          // Only set curve-detail fields if the user hasn't entered them yet.
          // (Empty string / undefined ? fill in; otherwise leave alone.)
          out[i] = {
            ...call,
            curveDirection: dir,
            chordBearing: call.chordBearing && call.chordBearing.trim() ? call.chordBearing : chordStr,
            chordDistance: (typeof call.chordDistance === 'number' && isFinite(call.chordDistance)) ? call.chordDistance : computedChordDist,
            tangentBearing: call.tangentBearing && call.tangentBearing.trim() ? call.tangentBearing : formatBearing(tangentRad),
            // Mirror chord into bearing/distance for closure / SurveyLine consumers.
            bearing: chordStr,
            distance: distStr,
          };
        }
      } else {
        const brRad = parseBearingToRadians(call.bearing);
        const dist = parseDistance(call.distance);
        if (brRad !== null && dist !== null) {
          newCoords = direct(fromPt, brRad, dist);
        }
      }

      if (!newCoords) continue;
      // Closing call must not move the POB
      if (call.to === anchorPtNum) continue;
      const toPt = workingPtMap.get(call.to);
      if (toPt) {
        workingPtMap.set(call.to, { ...toPt, northing: newCoords.northing, easting: newCoords.easting });
      } else {
        // Brand-new endpoint � create it
        workingPtMap.set(call.to, {
          pointNumber: call.to,
          northing: newCoords.northing,
          easting: newCoords.easting,
          elevation: 0,
          description: 'BP',
        });
        newPointNums.add(call.to);
      }
    }

    return { calls: out, workingPtMap, newPointNums };
  }, [pointLists]);

  // Apply the propagated calls + point map to React state and sync SurveyLines.
  const applyBoundaryPropagation = useCallback((
    fileId: string,
    updatedCalls: BoundaryFileCall[],
    workingPtMap: Map<string, SurveyPoint>,
    newPointNums: Set<string>,
  ) => {
    // Points, lines and the boundary file all move together here; the
    // transaction makes the whole propagation a single undo step.
    beginTransaction('Edited boundary');
    pushHistory('Edited boundary');
    // Update existing points + append brand-new ones to the working list
    setPointLists(prev => {
      const updated = prev.map(list => ({
        ...list,
        points: list.points.map(p => {
          const moved = workingPtMap.get(p.pointNumber);
          if (!moved) return p;
          if (moved.northing === p.northing && moved.easting === p.easting) return p;
          return { ...p, northing: moved.northing, easting: moved.easting };
        }),
      }));
      if (newPointNums.size === 0) return updated;
      const fresh: SurveyPoint[] = [];
      newPointNums.forEach(n => { const pt = workingPtMap.get(n); if (pt) fresh.push(pt); });
      const workingIdx = updated.findIndex(l => l.id === 'working');
      if (workingIdx === -1) {
        return [...updated, { id: 'working', name: 'Unsaved Points', points: fresh, isVisible: true }];
      }
      const workingList = updated[workingIdx];
      updated[workingIdx] = { ...workingList, points: [...workingList.points, ...fresh] };
      return updated;
    });

    setLines(prev => {
      // Update existing matching lines
      const next = prev.map(l => {
        const matchCall = updatedCalls.find(c => c.from === l.from && c.to === l.to);
        const fromUpdated = workingPtMap.get(l.from);
        const toUpdated = workingPtMap.get(l.to);
        return {
          ...l,
          ...(matchCall ? {
            bearing: matchCall.bearing,
            distance: matchCall.distance,
            isCurve: matchCall.isCurve,
            curveRadius: matchCall.curveRadius,
            arcLength: matchCall.arcLength,
            curveDirection: matchCall.curveDirection,
            chordBearing: matchCall.chordBearing,
            chordDistance: matchCall.chordDistance,
            tangentBearing: matchCall.tangentBearing,
          } : {}),
          ...(fromUpdated ? { fromPt: { x: fromUpdated.easting, y: fromUpdated.northing, z: fromUpdated.elevation ?? 0 } } : {}),
          ...(toUpdated ? { toPt: { x: toUpdated.easting, y: toUpdated.northing, z: toUpdated.elevation ?? 0 } } : {}),
        };
      });
      // Append SurveyLines for any boundary calls that have no matching line yet
      const haveLine = new Set(next.map(l => `${l.from}>${l.to}`));
      updatedCalls.forEach(c => {
        const key = `${c.from}>${c.to}`;
        if (haveLine.has(key)) return;
        const fromUpdated = workingPtMap.get(c.from);
        const toUpdated = workingPtMap.get(c.to);
        const newLine = addLineToList({
          from: c.from,
          to: c.to,
          bearing: c.bearing,
          distance: c.distance,
          isCurve: c.isCurve,
          curveRadius: c.curveRadius,
          arcLength: c.arcLength,
          curveDirection: c.curveDirection,
          chordBearing: c.chordBearing,
          chordDistance: c.chordDistance,
          tangentBearing: c.tangentBearing,
          ...(fromUpdated ? { fromPt: { x: fromUpdated.easting, y: fromUpdated.northing, z: fromUpdated.elevation ?? 0 } } : {}),
          ...(toUpdated ? { toPt: { x: toUpdated.easting, y: toUpdated.northing, z: toUpdated.elevation ?? 0 } } : {}),
        });
        next.push(newLine);
      });
      return next;
    });

    setBoundaryFiles(prev => prev.map(f => f.id === fileId ? { ...f, calls: updatedCalls } : f));
    commitTransaction();
  }, [pushHistory, beginTransaction, commitTransaction, setPointLists, setLines]);

  // Patch one or more fields on a single call, then propagate forward.
  const handleBoundaryCallUpdate = useCallback((fileId: string, callId: string, patch: Partial<BoundaryFileCall>) => {
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    const changedIdx = targetFile.calls.findIndex(c => c.id === callId);
    if (changedIdx < 0) return;
    const patched: BoundaryFileCall[] = targetFile.calls.map(c => c.id === callId ? { ...c, ...patch } : c);
    const { calls, workingPtMap, newPointNums } = propagateBoundaryCalls(patched, changedIdx);
    applyBoundaryPropagation(fileId, calls, workingPtMap, newPointNums);
  }, [boundaryFiles, propagateBoundaryCalls, applyBoundaryPropagation]);

  // Append a blank call at the end of the traverse, anchored to the previous call's `to`.
  const handleBoundaryRowAdd = useCallback((fileId: string) => {
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    const last = targetFile.calls[targetFile.calls.length - 1];
    const ptAgent = PointAgent.getInstance();
    ptAgent.setLabelingSettings(settings.pointLabelingSettings);
    // Reserve every endpoint already referenced by any boundary file so PointAgent
    // doesn't hand back a number that's already in use by a pending (un-propagated) call.
    const existing = pointLists.flatMap(l => l.points);
    const existingNums = new Set(existing.map(p => p.pointNumber));
    const reservedFromCalls: SurveyPoint[] = [];
    boundaryFiles.forEach(bf => bf.calls.forEach(c => {
      [c.from, c.to].forEach(n => {
        if (n && !existingNums.has(n)) {
          existingNums.add(n);
          reservedFromCalls.push({ pointNumber: n, northing: 0, easting: 0, elevation: 0, description: 'BP' });
        }
      });
    }));
    ptAgent.setAvailablePoints([...existing, ...reservedFromCalls]);
    const [newPtNum] = ptAgent.getNextNumbers(1);
    const newCall: BoundaryFileCall = {
      id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: last?.to ?? '1',
      to: newPtNum,
      bearing: '',
      distance: '',
    };
    pushHistory();
    setBoundaryFiles(prev => prev.map(f => f.id === fileId ? { ...f, calls: [...f.calls, newCall] } : f));
  }, [boundaryFiles, pointLists, settings.pointLabelingSettings, pushHistory]);

  // Remove a call (and its matching SurveyLine), then propagate forward from that index.
  const handleBoundaryRowRemove = useCallback((fileId: string, callId: string) => {
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    const removedIdx = targetFile.calls.findIndex(c => c.id === callId);
    if (removedIdx < 0) return;
    const removed = targetFile.calls[removedIdx];
    const remaining = targetFile.calls.filter(c => c.id !== callId);

    if (remaining.length === 0) {
      pushHistory();
      setBoundaryFiles(prev => prev.map(f => f.id === fileId ? { ...f, calls: [] } : f));
      setLines(prev => prev.filter(l => !(l.from === removed.from && l.to === removed.to)));
      return;
    }

    // Re-link: the call after the removed one now starts at the removed call's `from`.
    if (removedIdx < remaining.length) {
      remaining[removedIdx] = { ...remaining[removedIdx], from: removed.from };
    }

    const { calls, workingPtMap, newPointNums } = propagateBoundaryCalls(remaining, removedIdx);
    pushHistory();
    setLines(prev => prev.filter(l => !(l.from === removed.from && l.to === removed.to)));
    applyBoundaryPropagation(fileId, calls, workingPtMap, newPointNums);
  }, [boundaryFiles, propagateBoundaryCalls, applyBoundaryPropagation, pushHistory, setLines]);

  // Generate a ClosureReport from a manual boundary. If a single piece of data is
  // missing but the polygon is closed, attempt to auto-solve it (e.g. inverse the
  // closing leg for a single unknown bearing/distance, or back-solve a chord bearing).
  const handleGenerateBoundaryClosureReport = useCallback(async (fileId: string) => {
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    if (targetFile.calls.length < 3) {
      setError('Need at least 3 boundary calls to compute a closure report.');
      return;
    }
    let workingCalls = targetFile.calls;
    const { solveSingleMissing } = await import('./utils/closureSolver.ts');
    const solve = solveSingleMissing(workingCalls, pointMap);
    if (!solve.ok) {
      // Only block if the data is actually incomplete. If everything was fine,
      // solver returns "No missing data detected." � that's a successful path.
      const hasMissing = workingCalls.some(c => c.isCurve
        ? !(c.curveRadius && c.arcLength)
        : !(c.bearing && c.distance));
      if (hasMissing) {
        setError(`Closure solver: ${solve.reason}`);
        return;
      }
    } else {
      workingCalls = solve.patchedCalls;
      logActionToFieldbook(`Auto-solve: ${solve.summary}`);
      // Persist the patch back into the boundary file so subsequent edits see it.
      const { calls: propCalls, workingPtMap, newPointNums } = propagateBoundaryCalls(workingCalls, solve.fixedIndex);
      applyBoundaryPropagation(fileId, propCalls, workingPtMap, newPointNums);
      workingCalls = propCalls;
    }
    try {
      const closurePoints = Array.from(pointMap.values()).map(p => ({
        pointNumber: p.pointNumber,
        northing: p.northing,
        easting: p.easting,
      }));
      const closureMap = new Map(closurePoints.map(p => [p.pointNumber, p]));
      const calc = calculateClosure(workingCalls.map(c => ({
        from: c.from, to: c.to, bearing: c.bearing, distance: c.distance,
        isCurve: c.isCurve, curveRadius: c.curveRadius, arcLength: c.arcLength,
        chordBearing: c.chordBearing, tangentBearing: c.tangentBearing,
        curveDirection: c.curveDirection, deltaAngle: undefined,
      })), closureMap);
      const newReport: ClosureReport = {
        ...calc,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        name: targetFile.name,
      };
      setClosureReports(prev => [...prev, newReport]);
      logActionToFieldbook(`Generated closure report: "${newReport.name}" � precision ${newReport.precision}, misclosure ${newReport.misclosureDistance.toFixed(4)}'`);
      showView('closurereport');
    } catch (e) {
      setError(`Closure calculation failed: ${(e as Error).message}`);
    }
  }, [boundaryFiles, pointMap, propagateBoundaryCalls, applyBoundaryPropagation, logActionToFieldbook, setClosureReports, setError, showView]);

  // Generate a metes-and-bounds legal description for a boundary file and
  // open the Legal Writer panel (replaces the canvas in the Boundary Agent).
  const handleWriteBoundaryLegal = useCallback(async (fileId: string) => {
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    if (targetFile.calls.length === 0) {
      setError('Boundary has no calls � nothing to describe.');
      return;
    }
    const { writeLegalDescription } = await import('./utils/legalWriter.ts');
    // Try to compute area for the closing sentence; non-fatal if it fails.
    let areaAcres: number | null = null;
    try {
      const calc = calculateClosure(targetFile.calls.map(c => ({
        from: c.from, to: c.to, bearing: c.bearing, distance: c.distance,
        isCurve: c.isCurve, curveRadius: c.curveRadius, arcLength: c.arcLength,
        chordBearing: c.chordBearing, tangentBearing: c.tangentBearing,
        curveDirection: c.curveDirection, deltaAngle: undefined,
      })), pointMap as any);
      areaAcres = calc.area / 43560;
    } catch { /* area is optional */ }

    const initialPrefs: import('./types.ts').LegalWriterStylePrefs = {
      includeHeading: true,
      includeAcreage: true,
      includePobCoords: true,
      preset: 'default',
    };
    const text = writeLegalDescription(targetFile, pointMap, {
      name: targetFile.name,
      areaAcres,
      stylePrefs: initialPrefs,
    });
    setLegalWriterState({
      fileId,
      fileName: targetFile.name,
      text,
      stylePrefs: initialPrefs,
    });
    showView('legalwriter');
    logActionToFieldbook(`Opened Legal Writer for "${targetFile.name}" (${targetFile.calls.length} calls).`);
  }, [boundaryFiles, pointMap, logActionToFieldbook, setError, showView]);

  // Regenerate the legal description with new style prefs (called from the panel).
  const handleRegenerateLegal = useCallback(async (
    stylePrefs: import('./types.ts').LegalWriterStylePrefs,
  ): Promise<string> => {
    if (!legalWriterState) return '';
    const targetFile = boundaryFiles.find(f => f.id === legalWriterState.fileId);
    if (!targetFile) return legalWriterState.text;
    const { writeLegalDescription } = await import('./utils/legalWriter.ts');
    let areaAcres: number | null = null;
    try {
      const calc = calculateClosure(targetFile.calls.map(c => ({
        from: c.from, to: c.to, bearing: c.bearing, distance: c.distance,
        isCurve: c.isCurve, curveRadius: c.curveRadius, arcLength: c.arcLength,
        chordBearing: c.chordBearing, tangentBearing: c.tangentBearing,
        curveDirection: c.curveDirection, deltaAngle: undefined,
      })), pointMap as any);
      areaAcres = calc.area / 43560;
    } catch { /* optional */ }
    const text = writeLegalDescription(targetFile, pointMap, {
      name: targetFile.name,
      areaAcres,
      stylePrefs,
    });
    setLegalWriterState(prev => prev ? { ...prev, stylePrefs, text } : prev);
    return text;
  }, [legalWriterState, boundaryFiles, pointMap]);

  // Investigate closure deterministically, then compare the parsed calls with
  // the uploaded deed to explain likely transcription or source errors.
  const handleInvestigateClosure = useCallback(async (fileId: string) => {
    if (isFreeTierTimeLocked) {
      setIsLockDismissed(false);
      setShowHostCostReminder(true);
      return;
    }
    const targetFile = boundaryFiles.find(f => f.id === fileId);
    if (!targetFile) return;
    const { investigateClosure } = await import('./utils/closureSolver.ts');
    const report = investigateClosure(targetFile.calls, pointMap, fileId);

    // Announce findings via CACP � purely informational; the activity indicator
    // pill will pulse so the user sees the cross-agent traffic.
    try {
      interAgentComm.sendMessage(
        AgentType.DEED_READER,
        'broadcast',
        'closure_investigation',
        {
          fileId,
          fileName: targetFile.name,
          ambiguityCount: report.ambiguities.length,
          ambiguities: report.ambiguities.map(a => ({ id: a.id, kind: a.kind, severity: a.severity, reason: a.reason })),
          sourceReviewRequested: true,
        },
        { context: 'Boundary editor Investigate Closure' },
      );
    } catch { /* CACP errors are non-fatal here */ }

    setClosureInvestigation({
      fileId,
      fileName: targetFile.name,
      ambiguities: report.ambiguities,
      reviewStatus: 'loading',
    });
    logActionToFieldbook(`Investigated closure of "${targetFile.name}": ${report.ambiguities.length} geometric item(s) flagged; source review started.`);
    try {
      if (!deedFile) throw new Error('The source deed is no longer loaded, so only the geometry checks are available.');
      const reviewModel = agentModelOverrides[AgentType.DEED_READER]
        ?? resolveModelForAgent(AgentType.DEED_READER, activeModel);
      const humanReview = await investigateDeedClosure(
        deedFile,
        targetFile,
        report.ambiguities.map(item => item.reason),
        reviewModel,
        settings.userApiKey,
      );
      setClosureInvestigation(current => current?.fileId === fileId
        ? { ...current, reviewStatus: 'complete', humanReview }
        : current);
      logActionToFieldbook(`Source-aware closure review of "${targetFile.name}" produced ${humanReview.hypotheses.length} hypothesis(es).`);
    } catch (error) {
      const reviewError = error instanceof Error ? error.message : String(error);
      setClosureInvestigation(current => current?.fileId === fileId
        ? { ...current, reviewStatus: 'unavailable', reviewError }
        : current);
    }
  }, [isFreeTierTimeLocked, boundaryFiles, pointMap, deedFile, agentModelOverrides, resolveModelForAgent, activeModel, settings.userApiKey, logActionToFieldbook]);

  const handleApplyClosureHypothesis = useCallback((hypothesis: DeedClosureHypothesis) => {
    if (!closureInvestigation || hypothesis.rowIndex === undefined || !hypothesis.proposedPatch) return;
    const targetFile = boundaryFiles.find(file => file.id === closureInvestigation.fileId);
    const currentCall = targetFile?.calls[hypothesis.rowIndex];
    if (!targetFile || !currentCall) return;

    const changes = Object.entries(hypothesis.proposedPatch)
      .filter(([field, value]) => currentCall[field as keyof BoundaryFileCall] !== value)
      .map(([field, value]) => `${field}: ${String(currentCall[field as keyof BoundaryFileCall] ?? '(blank)')} ? ${String(value)}`);
    if (changes.length === 0) return;
    const confirmed = window.confirm(
      `Apply this proposed deed correction to row ${hypothesis.rowIndex + 1}?\n\n` +
      `${hypothesis.title}\n${hypothesis.reason}\n\n${changes.join('\n')}\n\n` +
      'This changes the boundary geometry. Confirm only after checking the deed evidence.',
    );
    if (!confirmed) return;

    const patchedCalls = targetFile.calls.map((call, index) => index === hypothesis.rowIndex
      ? { ...call, ...hypothesis.proposedPatch }
      : call);
    const { calls: propagatedCalls, workingPtMap, newPointNums } = propagateBoundaryCalls(patchedCalls, hypothesis.rowIndex);
    applyBoundaryPropagation(targetFile.id, propagatedCalls, workingPtMap, newPointNums);
    logActionToFieldbook(`User confirmed closure correction on row ${hypothesis.rowIndex + 1} of "${targetFile.name}": ${changes.join('; ')}.`);
    setClosureInvestigation(null);
  }, [closureInvestigation, boundaryFiles, propagateBoundaryCalls, applyBoundaryPropagation, logActionToFieldbook]);

  // Called by DrawingCanvas when user completes a bearing+distance boundary call.
  // Creates the endpoint and the SurveyLine, then calls back with the new point.
  const handleAddBoundaryCall = useCallback((
    from: SurveyPoint,
    bearing: string,
    distance: string,
    onComplete: (endPt: SurveyPoint) => void,
    curveOptions?: { curveRadius: number; arcLength: number; curveDirection: 'left' | 'right' },
  ) => {
    const brRad = parseBearingToRadians(bearing);
    if (brRad === null) return;

    const ptAgent = PointAgent.getInstance();
    ptAgent.setLabelingSettings(settings.pointLabelingSettings);
    ptAgent.setAvailablePoints(pointLists.flatMap(l => l.points));
    const [ptNumber] = ptAgent.getNextNumbers(1);

    let newCoords: { northing: number; easting: number };
    let newLine: SurveyLine;

    if (curveOptions) {
      const { curveRadius, arcLength, curveDirection } = curveOptions;
      const deltaAngle = (arcLength / curveRadius) * (curveDirection === 'left' ? -1 : 1);
      newCoords = directCurve(from, brRad, curveRadius, deltaAngle);
      const chordDist = calculateChordDistance(curveRadius, deltaAngle);
      const chordBearingRad = brRad + deltaAngle / 2;
      const chordBearingStr = formatBearing(chordBearingRad);
      newLine = addLineToList({
        from: from.pointNumber,
        to: ptNumber,
        bearing: chordBearingStr,
        distance: chordDist.toFixed(2),
        isCurve: true,
        curveRadius,
        arcLength,
        curveDirection,
        tangentBearing: bearing,
        chordBearing: chordBearingStr,
        chordDistance: chordDist.toFixed(2),
      });
    } else {
      const dist = parseDistance(distance);
      if (dist === null) return;
      newCoords = direct(from, brRad, dist);
      newLine = addLineToList({ from: from.pointNumber, to: ptNumber, bearing, distance });
    }

    const endPt: SurveyPoint = { pointNumber: ptNumber, northing: newCoords.northing, easting: newCoords.easting, elevation: 0, description: 'BP' };

    pushHistory();
    setPointLists(prev => {
      const workingIdx = prev.findIndex(l => l.id === 'working');
      if (workingIdx === -1) return [...prev, { id: 'working', name: 'Unsaved Points', points: [endPt], isVisible: true }];
      const updated = [...prev];
      updated[workingIdx] = { ...updated[workingIdx], points: [...updated[workingIdx].points, endPt] };
      return updated;
    });

    setLines(prev => [...prev, newLine]);
    if (curveOptions) {
      logActionToFieldbook(`Drew curve from ${from.pointNumber} to ${ptNumber} (tangent: ${bearing}, R=${curveOptions.curveRadius}, L=${curveOptions.arcLength}, ${curveOptions.curveDirection}).`);
    } else {
      logActionToFieldbook(`Drew boundary line from ${from.pointNumber} to ${ptNumber} (${bearing}, ${distance}).`);
    }
    onComplete(endPt);
  }, [settings.pointLabelingSettings, pointLists, pushHistory, setPointLists, setLines, logActionToFieldbook]);
  const handleAddDimension = useCallback((dim: AnnotationDimension) => {
    setDimensions(prev => [...prev, dim]);
  }, []);

  // Computes closure for boundary calls drawn in the DrawingCanvas boundary-line mode.
  // Returns a summary or null if insufficient data.
  const handleComputeCurrentClosure = useCallback((
    calls: Array<{ from: string; to: string; bearing: string; distance: string; isCurve?: boolean; curveRadius?: number; arcLength?: number; curveDirection?: 'left' | 'right'; tangentBearing?: string }>
  ): { precision: string; area: number; misclosureDistance: number; misclosureBearing: string } | null => {
    if (calls.length < 2) return null;
    try {
      const closureLines = calls.map(c => ({
        from: c.from,
        to: c.to,
        bearing: c.bearing,
        distance: c.distance,
        isCurve: c.isCurve,
        curveRadius: c.curveRadius,
        arcLength: c.arcLength,
        curveDirection: c.curveDirection,
        tangentBearing: c.tangentBearing,
        deltaAngle: undefined as number | undefined,
      }));
      const result = calculateClosure(closureLines, pointMap);
      return {
        precision: result.precision,
        area: result.area,
        misclosureDistance: result.misclosureDistance,
        misclosureBearing: result.misclosureBearing,
      };
    } catch {
      return null;
    }
  }, [pointMap]);

  const handleConvertSelectionToBoundary = useCallback((selectedLines: import('./types.ts').SurveyLine[]) => {
    if (selectedLines.length === 0) return;
    const calls: import('./types.ts').BoundaryFileCall[] = [];
    for (const line of selectedLines) {
      const p1 = pointMap.get(line.from);
      const p2 = pointMap.get(line.to);
      const p1c = p1 ? { northing: p1.northing, easting: p1.easting } : (line.fromPt ? { northing: line.fromPt.y, easting: line.fromPt.x } : null);
      const p2c = p2 ? { northing: p2.northing, easting: p2.easting } : (line.toPt ? { northing: line.toPt.y, easting: line.toPt.x } : null);
      // Use pre-computed bearing/distance if available, otherwise compute via inverse
      let bearing = line.bearing ?? '';
      let distance = line.distance ?? '';
      if ((!bearing || !distance) && p1c && p2c) {
        const inv = inverse(p1c, p2c);
        bearing = formatBearing(inv.bearing);
        distance = inv.distance.toFixed(2);
      }
      if (!bearing || !distance) continue; // skip lines with no resolvable geometry
      const fromNum = p1 ? line.from : (line.fromPt ? `BFPT_${calls.length + 1}` : line.from);
      const toNum = p2 ? line.to : (line.toPt ? `BFPT_${calls.length + 2}` : line.to);
      calls.push({
        id: `bfc-${Date.now()}-${calls.length}`,
        from: fromNum,
        to: toNum,
        bearing,
        distance,
        isCurve: line.isCurve,
        curveRadius: line.curveRadius,
        arcLength: line.arcLength,
        chordBearing: line.chordBearing,
        tangentBearing: line.tangentBearing,
      });
    }
    if (calls.length === 0) return;
    const name = `Boundary ${new Date().toLocaleTimeString()}`;
    const newBoundaryFile: import('./types.ts').BoundaryFile = {
      id: `bf-sel-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      calls,
    };
    setBoundaryFiles(prev => [...prev, newBoundaryFile]);
    setIsBoundaryEditorVisible(false);
    setIsBoundaryEditorButtonPulsing(true);
    logActionToFieldbook(`Converted ${calls.length} selected line(s) to boundary file "${name}".`);
  }, [pointMap, setBoundaryFiles, setIsBoundaryEditorVisible, setIsBoundaryEditorButtonPulsing, logActionToFieldbook]);

  const handleRenameBoundaryFile = useCallback((id: string, name: string) => {
    setBoundaryFiles(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  }, []);

  const handleToggleBoundaryVisibility = useCallback((id: string) => {
    // v26.05.20.2 � only hide the amber boundary overlay on the canvas.
    // The drawn SurveyLines/points are independent linework and must not be
    // affected by toggling the boundary editor object's visibility.
    setBoundaryFiles(prev => prev.map(f => f.id === id ? { ...f, hidden: !f.hidden } : f));
  }, []);

  /** Associate the given point numbers with a boundary so they follow its visibility and persist in the .lsvz BoundaryFile. v26.05.17.40. */
  const handleAssociatePointsToBoundary = useCallback((fileId: string, pointIds: string[]) => {
    if (pointIds.length === 0) return;
    setBoundaryFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      const existing = new Set(f.associatedPointIds ?? []);
      pointIds.forEach(id => existing.add(id));
      return { ...f, associatedPointIds: Array.from(existing) };
    }));
    logActionToFieldbook(`Associated ${pointIds.length} point(s) with boundary.`);
  }, [logActionToFieldbook]);

  /** Remove an associated point from a boundary (does not delete the point). v26.05.17.40. */
  const handleDisassociatePointFromBoundary = useCallback((fileId: string, pointId: string) => {
    setBoundaryFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      const next = (f.associatedPointIds ?? []).filter(id => id !== pointId);
      return { ...f, associatedPointIds: next };
    }));
  }, []);

  /**
   * 2D rigid-body best-fit: compute the Helmert (translation + rotation, no
   * scale) transformation that minimises the sum of squared residuals between
   * deed traverse vertices and the corresponding associated survey points.
   *
   * Matching is done by point number � the deed calls' `from`/`to` field
   * must equal the survey point number.  At least 1 match is required; 2+
   * gives a meaningful rotation estimate.
   *
   * The result is written into `translationE/N` and `rotationDeg` on the
   * boundary file, and if the boundary was already drawn its linework is
   * silently redrawn at the new position.
   */
  const handleBestFitBoundaryToPoints = useCallback((fileId: string) => {
    const file = boundaryFilesRef.current.find(f => f.id === fileId);
    if (!file || file.calls.length === 0) return;

    const assocIds = new Set(file.associatedPointIds ?? []);
    if (assocIds.size === 0) {
      setError('Associate at least one survey point before running Best Fit.');
      setTimeout(() => setError(null), 5000);
      return;
    }

    // -------------------------------------------------------------------
    // 0. Resolve the same POB the draw function will use.
    //    v26.05.20.4 � The draw function marches from pob (world coords) and
    //    then calls applyTransform which computes:
    //        drawn = R�(cursor - pob) + pob + T_stored
    //    For local vertex v (cursor - pob), drawn = R�v + pob + T_stored.
    //    The Helmert below solves R�v + T_helmert = sp, so:
    //        T_stored = T_helmert - pob
    //    Without this correction the stored ?E/?N includes the full state-
    //    plane POB coordinate (~2,642,500 ft) as an extra offset.
    // -------------------------------------------------------------------
    const firstFrom = file.calls[0].from;
    const priorIds = new Set(file.drawnPointIds ?? []);
    const existingPob = firstFrom ? pointMap.get(firstFrom) : undefined;
    const externalPoints = points.filter(p => !priorIds.has(p.pointNumber));
    let pobE = 0, pobN = 0;
    if (existingPob && !priorIds.has(existingPob.pointNumber)) {
      pobE = existingPob.easting; pobN = existingPob.northing;
    } else if (file.pobOverride) {
      pobE = file.pobOverride.easting; pobN = file.pobOverride.northing;
    } else if (externalPoints.length > 0) {
      pobE = externalPoints.reduce((s, p) => s + p.easting, 0) / externalPoints.length;
      pobN = externalPoints.reduce((s, p) => s + p.northing, 0) / externalPoints.length;
    }
    // If pob is still (0,0) that's fine � it means draw will also start at (0,0)
    // and no correction is needed.

    // -------------------------------------------------------------------
    // 1. March the deed from origin (0, 0) to get LOCAL deed vertices.
    //    v26.05.20.3 � cursor uses {x=easting, y=northing} internally; convert
    //    to Point{northing,easting} at every COGO call boundary (same fix as
    //    the draw function � previous code passed {x,y} and got NaN vertices).
    // -------------------------------------------------------------------
    const localVerts: { pn: string; x: number; y: number }[] = [];
    let cursor = { x: 0, y: 0 };
    localVerts.push({ pn: firstFrom || 'POB', x: 0, y: 0 });

    for (let i = 0; i < file.calls.length; i++) {
      const call = file.calls[i];
      let next: { x: number; y: number } | null = null;
      try {
        const cogoCursor = { northing: cursor.y, easting: cursor.x };
        if (call.isCurve && typeof call.curveRadius === 'number' && typeof call.arcLength === 'number') {
          const tangentRad = parseBearingToRadians(call.tangentBearing || call.bearing || '');
          if (tangentRad == null) continue;
          const deltaAngle = call.arcLength / call.curveRadius;
          const signedDelta = call.curveDirection === 'left' ? -deltaAngle : deltaAngle;
          const pt = directCurve(cogoCursor, tangentRad, call.curveRadius, signedDelta);
          next = { x: pt.easting, y: pt.northing };
        } else if (call.bearing && call.distance) {
          const brRad = parseBearingToRadians(call.bearing);
          const dist = parseDistance(call.distance);
          if (brRad == null || dist == null) continue;
          const pt = direct(cogoCursor, brRad, dist);
          next = { x: pt.easting, y: pt.northing };
        }
      } catch { continue; }
      if (!next) continue;
      const isClosing = call.to === firstFrom;
      if (!isClosing && call.to) {
        localVerts.push({ pn: call.to, x: next.x, y: next.y });
      }
      cursor = next;
    }

    // -------------------------------------------------------------------
    // 2. Mode A: Point-number matching (deed From/To == survey point number).
    // -------------------------------------------------------------------
    type Pair = { src: { x: number; y: number }; tgt: { x: number; y: number } };
    let pairs: Pair[] = [];
    for (const v of localVerts) {
      if (!assocIds.has(v.pn)) continue;
      const sp = pointMap.get(v.pn);
      if (!sp) continue;
      pairs.push({ src: { x: v.x, y: v.y }, tgt: { x: sp.easting, y: sp.northing } });
    }

    // -------------------------------------------------------------------
    // 3. Mode B: Geometric distance-matrix matching � fallback when PN
    //    matching finds nothing.  Handles the common field scenario where a
    //    surveyor found 2 (or more) monuments whose point numbers don't match
    //    the deed call labels but whose physical positions identify real deed
    //    corners.  The algorithm:
    //      a. Build pairwise Euclidean distance matrices for both the found
    //         monuments and the deed local vertices.
    //      b. Find the deed corner pair (i,j) whose chord distance best
    //         matches the distance between monuments M0 and M1 � this is
    //         the anchor match.
    //      c. Try both orientations (M0?Vi,M1?Vj) and (M0?Vj,M1?Vi);
    //         pick the one whose 2-point Helmert produces the smaller
    //         absolute rotation (deed should be close to true orientation).
    //      d. For every additional monument Mk, find the deed corner Vm
    //         whose distances to the two anchor corners best match Mk's
    //         distances to M0/M1 (greedy extension).
    //    This preserves the rigid body � angles and distances are unchanged;
    //    only a rigid translation+rotation is solved for.  v26.05.20.3
    // -------------------------------------------------------------------
    let usedGeometricMatch = false;
    if (pairs.length === 0) {
      const assocPts = Array.from(assocIds)
        .map(pn => pointMap.get(pn))
        .filter((p): p is SurveyPoint => !!p);

      if (assocPts.length === 0) {
        setError('Best Fit: associated point(s) not found in the point database.');
        setTimeout(() => setError(null), 6000);
        return;
      }

      const eDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

      // Inline 2D Helmert for orientation comparison.
      const solveH = (ps: Pair[]): { txE: number; txN: number; rotRad: number } => {
        if (ps.length === 1) return { txE: ps[0].tgt.x - ps[0].src.x, txN: ps[0].tgt.y - ps[0].src.y, rotRad: 0 };
        const n = ps.length;
        const msx = ps.reduce((s, p) => s + p.src.x, 0) / n, msy = ps.reduce((s, p) => s + p.src.y, 0) / n;
        const mtx = ps.reduce((s, p) => s + p.tgt.x, 0) / n, mty = ps.reduce((s, p) => s + p.tgt.y, 0) / n;
        let sc = 0, sd = 0;
        for (const { src, tgt } of ps) {
          const sx = src.x - msx, sy = src.y - msy, tx = tgt.x - mtx, ty = tgt.y - mty;
          sc += sx * ty - sy * tx; sd += sx * tx + sy * ty;
        }
        const r = Math.atan2(sc, sd), c = Math.cos(r), s2 = Math.sin(r);
        return { txE: mtx - (c * msx - s2 * msy), txN: mty - (s2 * msx + c * msy), rotRad: r };
      };

      if (assocPts.length === 1) {
        // Single monument: translate POB to it (no rotation info available).
        pairs = [{ src: localVerts[0], tgt: { x: assocPts[0].easting, y: assocPts[0].northing } }];
        usedGeometricMatch = true;
      } else {
        // =2 monuments: find deed corner pair whose chord distance best matches |M0-M1|.
        const d01 = eDist(assocPts[0].easting, assocPts[0].northing, assocPts[1].easting, assocPts[1].northing);
        let bestPair = { i: 0, j: Math.min(1, localVerts.length - 1), residual: Infinity };
        for (let ii = 0; ii < localVerts.length; ii++) {
          for (let jj = ii + 1; jj < localVerts.length; jj++) {
            const dij = eDist(localVerts[ii].x, localVerts[ii].y, localVerts[jj].x, localVerts[jj].y);
            const res = Math.abs(dij - d01);
            if (res < bestPair.residual) bestPair = { i: ii, j: jj, residual: res };
          }
        }
        // Try both orientations; prefer the one with smaller absolute rotation.
        const o1: Pair[] = [
          { src: localVerts[bestPair.i], tgt: { x: assocPts[0].easting, y: assocPts[0].northing } },
          { src: localVerts[bestPair.j], tgt: { x: assocPts[1].easting, y: assocPts[1].northing } },
        ];
        const o2: Pair[] = [
          { src: localVerts[bestPair.i], tgt: { x: assocPts[1].easting, y: assocPts[1].northing } },
          { src: localVerts[bestPair.j], tgt: { x: assocPts[0].easting, y: assocPts[0].northing } },
        ];
        const h1 = solveH(o1), h2 = solveH(o2);
        const useO1 = Math.abs(h1.rotRad) <= Math.abs(h2.rotRad);
        pairs = useO1 ? o1 : o2;

        // For M=3: greedily assign remaining monuments to deed corners using
        // their distance relationships to the two anchor corners.
        if (assocPts.length >= 3) {
          const anchA = useO1 ? assocPts[0] : assocPts[1];
          const anchB = useO1 ? assocPts[1] : assocPts[0];
          const assigned = new Set([bestPair.i, bestPair.j]);
          for (let k = 2; k < assocPts.length; k++) {
            const pk = assocPts[k];
            const dak = eDist(anchA.easting, anchA.northing, pk.easting, pk.northing);
            const dbk = eDist(anchB.easting, anchB.northing, pk.easting, pk.northing);
            let bestK = { idx: -1, residual: Infinity };
            for (let m = 0; m < localVerts.length; m++) {
              if (assigned.has(m)) continue;
              const dam = eDist(localVerts[bestPair.i].x, localVerts[bestPair.i].y, localVerts[m].x, localVerts[m].y);
              const dbm = eDist(localVerts[bestPair.j].x, localVerts[bestPair.j].y, localVerts[m].x, localVerts[m].y);
              const res = Math.abs(dam - dak) + Math.abs(dbm - dbk);
              if (res < bestK.residual) bestK = { idx: m, residual: res };
            }
            if (bestK.idx >= 0) {
              assigned.add(bestK.idx);
              pairs.push({ src: localVerts[bestK.idx], tgt: { x: pk.easting, y: pk.northing } });
            }
          }
        }
        usedGeometricMatch = true;
      }
    }

    if (pairs.length === 0) {
      setError('Best Fit: could not match associated points to deed corners. Ensure points are loaded in the database.');
      setTimeout(() => setError(null), 7000);
      return;
    }

    // -------------------------------------------------------------------
    // 4. 2D Helmert (translation + rotation, no scale) via least squares.
    //    Rigid body: deed angles and distances are fully preserved.
    // -------------------------------------------------------------------
    let rotRad = 0;
    let txE = 0;
    let txN = 0;

    if (pairs.length === 1) {
      txE = pairs[0].tgt.x - pairs[0].src.x;
      txN = pairs[0].tgt.y - pairs[0].src.y;
    } else {
      const N = pairs.length;
      const muSrcX = pairs.reduce((s, p) => s + p.src.x, 0) / N;
      const muSrcY = pairs.reduce((s, p) => s + p.src.y, 0) / N;
      const muTgtX = pairs.reduce((s, p) => s + p.tgt.x, 0) / N;
      const muTgtY = pairs.reduce((s, p) => s + p.tgt.y, 0) / N;
      let sumCross = 0, sumDot = 0;
      for (const { src, tgt } of pairs) {
        const sx = src.x - muSrcX, sy = src.y - muSrcY;
        const tx = tgt.x - muTgtX, ty = tgt.y - muTgtY;
        sumCross += sx * ty - sy * tx;
        sumDot   += sx * tx + sy * ty;
      }
      rotRad = Math.atan2(sumCross, sumDot);
      const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
      txE = muTgtX - (cosR * muSrcX - sinR * muSrcY);
      txN = muTgtY - (sinR * muSrcX + cosR * muSrcY);
    }

    const rotDeg = rotRad * (180 / Math.PI);
    const round4 = (v: number) => Math.round(v * 10000) / 10000;

    // Guard against NaN (e.g., single degenerate vertex at origin).
    if (!isFinite(txE) || !isFinite(txN) || !isFinite(rotDeg)) {
      setError('Best Fit: computed transform has invalid values. Check that bearings/distances are valid.');
      setTimeout(() => setError(null), 6000);
      return;
    }

    // v26.05.20.4 � Subtract the POB so the stored translation matches what
    // applyTransform expects.  The draw function anchors rotation around pob
    // and then adds T_stored, i.e.:  drawn = R�localV + pob + T_stored
    // The Helmert gave us T such that: R�localV + T = sp
    // Therefore: T_stored = T - pob
    txE -= pobE;
    txN -= pobN;

    // -------------------------------------------------------------------
    // 5. Apply: update transform fields and (if previously drawn) silently
    //    redraw so the linework follows the new position immediately.
    // -------------------------------------------------------------------
    setBoundaryFiles(prev => prev.map(f =>
      f.id !== fileId ? f : { ...f, translationE: round4(txE), translationN: round4(txN), rotationDeg: round4(rotDeg) }
    ));

    const matchMode = usedGeometricMatch ? 'geometric distance-matrix match' : 'PN match';
    logActionToFieldbook(
      `Best Fit [${matchMode}]: ${pairs.length} pair(s) ? ?E=${round4(txE).toFixed(4)}, ?N=${round4(txN).toFixed(4)}, Rot=${round4(rotDeg).toFixed(4)}�. Transform set on boundary "${file.name}".`
    );

    const wasDrawn = (file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0;
    if (wasDrawn) {
      setTimeout(() => {
        const fn = handleDrawBoundaryToLineworkRef.current;
        if (fn) fn(fileId, { silent: true });
      }, 80);
    }
  }, [pointMap, points, setBoundaryFiles, logActionToFieldbook, setError]);

  /**
   * Update the per-BoundaryFile transform (translation E/N and rotation in
   * degrees). Applied to both the preview overlay and any subsequent
   * "Draw Boundary" linework. Passing `null` for a field clears it.
   *
   * v26.05.17.19 � if the boundary was already drawn onto the canvas, this
   * also schedules a silent re-draw so the previously-laid linework follows
   * the move/rotation. Debounced 220ms so live typing in the ?E/?N/Rot inputs
   * doesn't redraw on every keystroke.
   */
  const transformRedrawTimerRef = useRef<{ [id: string]: ReturnType<typeof setTimeout> }>({});
  // Always-current pointer to handleDrawBoundaryToLinework so debounced
  // redraws (and any other deferred caller) don't fire with a stale closure
  // capturing old `points` / `boundaryFiles` state. v26.05.17.21.
  const handleDrawBoundaryToLineworkRef = useRef<((fileId: string, opts?: { silent?: boolean }) => void) | null>(null);
  // Always-current snapshot of boundaryFiles used by the transform handler
  // so we can read `drawnPointIds` synchronously (outside of setState) to
  // decide whether a silent redraw is needed without side-effecting a pure updater.
  const boundaryFilesRef = useRef(boundaryFiles);
  boundaryFilesRef.current = boundaryFiles;

  const handleBoundaryTransformChange = useCallback((
    id: string,
    patch: { translationE?: number | null; translationN?: number | null; rotationDeg?: number | null }
  ) => {
    // Read "was already drawn?" synchronously from the stable ref � don't
    // rely on a side-effect mutation inside the state updater (unreliable in
    // React 18 concurrent / StrictMode where updaters can run twice).
    const currentFile = boundaryFilesRef.current.find(f => f.id === id);
    const wasDrawn = (currentFile?.drawnPointIds?.length ?? 0) > 0 ||
                     (currentFile?.drawnLineIds?.length ?? 0) > 0;

    setBoundaryFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const next = { ...f };
      if ('translationE' in patch) {
        if (patch.translationE === null || patch.translationE === undefined) delete next.translationE;
        else next.translationE = patch.translationE;
      }
      if ('translationN' in patch) {
        if (patch.translationN === null || patch.translationN === undefined) delete next.translationN;
        else next.translationN = patch.translationN;
      }
      if ('rotationDeg' in patch) {
        if (patch.rotationDeg === null || patch.rotationDeg === undefined) delete next.rotationDeg;
        else next.rotationDeg = patch.rotationDeg;
      }
      return next;
    }));
    if (wasDrawn) {
      // Debounce so typing in the input doesn't redraw per keystroke.
      const timers = transformRedrawTimerRef.current;
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        // Use the ref so we always pick up the latest captured-state handler;
        // useCallback([]) would otherwise pin this to the first-render
        // handler, leaving the redraw operating on stale points/files.
        const fn = handleDrawBoundaryToLineworkRef.current;
        if (fn) fn(id, { silent: true });
        delete timers[id];
      }, 220);
    }
  }, []);

  /**
   * v26.05.22.1 � Update the POB for a boundary file. Two independent levers:
   *   � `pointNumber`: rename the first call's `from` (and propagate the
   *     rename through any subsequent call whose `from`/`to` matched the old
   *     value, so the COGO chain stays intact).
   *   � `pobOverride`: explicit world (E,N). Pass `null` to clear and fall
   *     back to the normal pointMap / centroid / origin cascade.
   * If the boundary is already on canvas, a silent redraw is scheduled so the
   * preview moves to the new anchor without user friction.
   */
  const handleBoundaryPobChange = useCallback((
    id: string,
    patch: { pointNumber?: string; pobOverride?: { easting: number; northing: number } | null }
  ) => {
    const currentFile = boundaryFilesRef.current.find(f => f.id === id);
    const wasDrawn = (currentFile?.drawnPointIds?.length ?? 0) > 0 ||
                     (currentFile?.drawnLineIds?.length ?? 0) > 0;

    setBoundaryFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const next = { ...f };
      if ('pobOverride' in patch) {
        if (patch.pobOverride === null || patch.pobOverride === undefined) delete next.pobOverride;
        else next.pobOverride = patch.pobOverride;
      }
      if (typeof patch.pointNumber === 'string') {
        const newPn = patch.pointNumber.trim();
        const oldPn = (f.calls[0]?.from ?? '').trim();
        if (newPn && newPn !== oldPn) {
          next.calls = f.calls.map(c => ({
            ...c,
            // Rename every reference to oldPn so the from/to chain stays linked.
            from: c.from === oldPn ? newPn : c.from,
            to:   c.to   === oldPn ? newPn : c.to,
          }));
        }
      }
      return next;
    }));

    if (wasDrawn) {
      const timers = transformRedrawTimerRef.current;
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        const fn = handleDrawBoundaryToLineworkRef.current;
        if (fn) fn(id, { silent: true });
        delete timers[id];
      }, 220);
    }
  }, []);

  const handleLoadBoundaryFile = useCallback((file: import('./types.ts').BoundaryFile) => {
    setBoundaryFiles(prev => [...prev, file]);
    setIsBoundaryEditorVisible(false);
    setIsBoundaryEditorButtonPulsing(true);
    logActionToFieldbook(`Loaded boundary "${file.name}" from CSV (${file.calls.length} calls).`);
  }, [logActionToFieldbook]);

  /**
   * Draw a boundary file's calls onto the canvas as real survey points + lines
   * on the configured CAD layers. Useful when a boundary was loaded from a CSV
   * or hand-entered (i.e. has no backing linework yet) and the user wants the
   * traverse rendered like any other surveyed boundary.
   *
   * - POB resolution: prefers the first call's `from` point if it exists in
   *   `pointMap`; otherwise falls back to the file's `pobOverride`; otherwise
   *   anchors the traverse at (0, 0).
   * - Layer resolution: uses the CAD Manager standard's deed/boundary layer
   *   when available (via `resolveCode`), else `L-DEED-BOUNDARY` for lines
   *   and `V-NODE` for points.
   * - Re-draw safety: if this boundary was previously drawn, the prior
   *   points + lines are removed before the new geometry is laid down (after
   *   a confirm prompt) so successive draws don't leave duplicate artwork.
   */
  const handleDrawBoundaryToLinework = useCallback((fileId: string, opts?: { silent?: boolean }) => {
    try {
    const file = boundaryFiles.find(f => f.id === fileId);
    if (!file) return;
    if (file.calls.length === 0) {
      setError('This boundary has no calls to draw.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Every user-initiated Draft entry point passes through this handler. Warn
    // before committing a materially open traverse, but never alter its calls;
    // Draft must preserve the deed geometry exactly as entered.
    if (!opts?.silent) {
      try {
        const closure = calculateClosure(file.calls.map(call => ({
          from: call.from,
          to: call.to,
          bearing: call.bearing,
          distance: call.distance,
          isCurve: call.isCurve,
          curveRadius: call.curveRadius,
          arcLength: call.arcLength,
          chordBearing: call.chordBearing,
          tangentBearing: call.tangentBearing,
          curveDirection: call.curveDirection,
          deltaAngle: undefined,
        })), pointMap as any);
        const denomMatch = /1\s*in\s*([\d,]+)/i.exec(closure.precision);
        const denominator = denomMatch ? parseInt(denomMatch[1].replace(/,/g, ''), 10) : NaN;
        const hasMaterialMisclosure = closure.misclosureDistance >= 0.1
          || (isFinite(denominator) && denominator < 5000);
        if (hasMaterialMisclosure) {
          const confirmed = window.confirm(
            `This deed misses closure by ${closure.misclosureDistance.toFixed(4)} ft ` +
            `(${closure.precision}).\n\nInvestigate or correct the closure before drafting. ` +
            'Draft exactly as entered anyway? No geometry will be added, adjusted, or snapped closed.',
          );
          if (!confirmed) return;
        }
      } catch {
        // Existing per-call validation below will report malformed rows.
      }
    }

    // v26.05.25.1 � guarantee the DrawingCanvas is mounted before we attempt
    // to commit geometry + auto-zoom. Without this, the active visual panel
    // may be the PDF viewer / file manager / etc., so canvas2dRef.current is
    // null, the bbox zoom silently no-ops, and the user sees no result.
    showView('canvas');

    // v26.05.25.6 � Re-drafting the same boundary just replaces its OWN
    // drawnPointIds/drawnLineIds (see oldPointIds filtering below), and a
    // different boundary file never touches the first one. The "Replace
    // existing geometry?" confirm dialog was firing on every subsequent
    // tract-Draft click and naming the prior tract, confusing users into
    // thinking they had to delete the first deed before drafting the second.
    // Drop the prompt entirely; the operation is idempotent and safe.

    // Resolve POB (point of beginning) in real-world coordinates.
    // v26.05.17.19 � if no POB resolvable AND project already has points,
    // fall back to the centroid of existing points so the new traverse lands
    // near the rest of the project instead of crashing the canvas at (0,0)
    // (which is millions of feet away when the project is in State Plane).
    let pob: { easting: number; northing: number } | null = null;
    const firstFrom = file.calls[0].from;
    const existingPob = firstFrom ? pointMap.get(firstFrom) : undefined;
    // Filter out any previously-drawn points from THIS boundary so a re-draw
    // doesn't anchor on the old transformed positions.
    const priorIds = new Set(file.drawnPointIds ?? []);
    // CRITICAL (v26.05.30): the centroid fallback must EXCLUDE points drawn by
    // ANY boundary file, not just this one. Otherwise drafting tract 2 dumps
    // its 9 vertices into the points[] array and shifts tract 1's centroid (and
    // tract 1's amber overlay) toward tract 2 the next time anything re-renders.
    // Mirrors the same fix in DrawingCanvas.tsx BFOverlay.
    const allBoundaryDrawnIds = new Set<string>();
    boundaryFiles.forEach(other => {
      (other.drawnPointIds ?? []).forEach(id => allBoundaryDrawnIds.add(id));
    });
    const externalPoints = points.filter(p => !allBoundaryDrawnIds.has(p.pointNumber));
    // CRITICAL (v26.05.30): existingPob lookup must also exclude ALL boundary-drawn
    // points. Without this, tract 2's POB resolves to tract 1's drafted POB entry in
    // pointMap (because both tracts share PN "1"), causing tract 2 to anchor on tract 1.
    if (existingPob && !allBoundaryDrawnIds.has(existingPob.pointNumber)) {
      pob = { easting: existingPob.easting, northing: existingPob.northing };
    } else if (file.pobOverride) {
      pob = file.pobOverride;
    } else if (externalPoints.length > 0) {
      // Centroid fallback � keeps the new linework near existing geometry so
      // the canvas auto-fit doesn't zoom out to (0,0) and effectively hide it.
      const sumE = externalPoints.reduce((s, p) => s + p.easting, 0);
      const sumN = externalPoints.reduce((s, p) => s + p.northing, 0);
      pob = { easting: sumE / externalPoints.length, northing: sumN / externalPoints.length };
      if (!opts?.silent) {
        logActionToFieldbook(`Draw Boundary: no resolvable POB � anchored at centroid of existing points (E=${pob.easting.toFixed(2)}, N=${pob.northing.toFixed(2)}).`);
      }
    } else {
      // v26.05.22.1 � No POB resolvable and no existing points to anchor to.
      // Default to local (0, 0) so a freshly-loaded deed (or a manual-entry
      // session) can still be drafted. The user can set an explicit POB
      // through the new POB row in the Boundary Editor, or by loading a
      // matching control point.
      pob = { easting: 0, northing: 0 };
      if (!opts?.silent) {
        logActionToFieldbook(`Draft "${file.name}": no POB resolvable � starting at local origin (0, 0). Set a POB in the editor to relocate.`);
      }
    }

    // Resolve target layers: prefer CAD Manager standard (via deed-style
    // description), fall back to historical deed-boundary defaults.
    // v26.05.17.41 � seed the four boundary-special codes first so Draw
    // Boundary always lands on a real layer (DEED/INCL/EXCL/BRKL) instead
    // of the hard-coded "L-DEED-BOUNDARY" string.
    try { cadManagerContext.ensureDefaultBoundaryCodes(); } catch { /* non-fatal */ }
    const deedResolution = cadManagerContext.resolveCode('DEED');
    const lineLayer = deedResolution?.lineLayer || 'L-DEED-BOUNDARY';
    const pointLayer = deedResolution?.pointLayer || 'V-NODE';
    const lineType = deedResolution?.lineType || 'CONTINUOUS';

    // March the traverse forward, generating one new SurveyPoint at every
    // vertex and one SurveyLine per call. We use COGO `direct`/`directCurve`
    // so curve calls drop the correct PT vertex.
    const tractStamp = Date.now();
    let cursor = { x: pob.easting, y: pob.northing };

    // Boundary Object transform (translate + rotate around POB). Applied as a
    // post-processing step on every vertex so the marched COGO geometry stays
    // numerically stable; the transform only re-frames the result.
    // v26.05.20.3 � guard against NaN (e.g. from a previously-failed bestFit)
    // so a corrupt transform doesn't silently produce invisible NaN coords.
    const txE = isFinite(file.translationE ?? 0) ? (file.translationE ?? 0) : 0;
    const txN = isFinite(file.translationN ?? 0) ? (file.translationN ?? 0) : 0;
    const rotRad = (isFinite(file.rotationDeg ?? 0) ? (file.rotationDeg ?? 0) : 0) * Math.PI / 180;
    const anchorX = pob.easting;
    const anchorY = pob.northing;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const applyTransform = (p: { x: number; y: number }) => {
      const rx = (p.x - anchorX) * cosR - (p.y - anchorY) * sinR + anchorX + txE;
      const ry = (p.x - anchorX) * sinR + (p.y - anchorY) * cosR + anchorY + txN;
      return { x: rx, y: ry };
    };

    const newPoints: SurveyPoint[] = [];
    const newLines: SurveyLine[] = [];
    const usedPointNumbers = new Set(points.map(p => p.pointNumber));

    // CACP authority: delegate point numbering to PointAgent so deed-drafted
    // points follow the user's labeling settings (prefix / style / next number)
    // and integrate with the project's PN sequence instead of preserving the
    // deed reader's parser-internal names like "1", "2", or "1-39-0-1".
    // Exclude THIS file's previously-drawn IDs so re-drafting reuses the same
    // PN range instead of advancing the counter on every redraw.
    const pointAgent = PointAgent.getInstance();
    const priorOwnIds = new Set(file.drawnPointIds ?? []);
    pointAgent.setAvailablePoints(points.filter(p => !priorOwnIds.has(p.pointNumber)));

    // Build the ordered list of unique deed-side names we need PNs for.
    // The same name reused across calls (e.g. chain stitching: call N's `to`
    // equals call N+1's `from`) must map to the SAME allocated PN.
    const orderedKeys: string[] = [];
    const keySeen = new Set<string>();
    const pobKey = firstFrom || `POB-${tractStamp}`;
    const misclosureKey = `MIS-CLOSE-${file.id}-${tractStamp}`;
    orderedKeys.push(pobKey);
    keySeen.add(pobKey);
    for (let i = 0; i < file.calls.length; i++) {
      const isLastClosing = i === file.calls.length - 1 && file.calls[i].to === firstFrom;
      const k = isLastClosing
        ? misclosureKey
        : (file.calls[i].to || `PT-${tractStamp}-${i + 1}`);
      if (!keySeen.has(k)) { orderedKeys.push(k); keySeen.add(k); }
    }
    // Batch-allocate ALL PNs in one CACP call so PointAgent guarantees they
    // are unique relative to each other (a single getNextNumbers(N) advances
    // its internal cursor between picks; repeated getNextNumbers(1) calls do
    // NOT, because PointAgent rebuilds `taken` from availablePoints each time).
    const allocatedPNs = pointAgent.getNextNumbers(orderedKeys.length, AgentType.DEED_READER);
    const allocCache = new Map<string, string>();
    orderedKeys.forEach((k, idx) => allocCache.set(k, allocatedPNs[idx]));
    allocatedPNs.forEach(pn => usedPointNumbers.add(pn));

    const allocPointNumber = (preferred: string): string => {
      const key = preferred || `__anon__${allocCache.size}`;
      const cached = allocCache.get(key);
      if (cached) return cached;
      // Anonymous / unforeseen key (shouldn't happen for normal deeds, but be
      // safe): request one more PN on the fly and add it to availablePoints so
      // the next ad-hoc request doesn't collide.
      const [next] = pointAgent.getNextNumbers(1, AgentType.DEED_READER);
      allocCache.set(key, next);
      usedPointNumbers.add(next);
      pointAgent.setAvailablePoints([
        ...points.filter(p => !priorOwnIds.has(p.pointNumber)),
        ...Array.from(usedPointNumbers).map(pn => ({ pointNumber: pn })),
      ]);
      return next;
    };

    // Seed POB vertex
    const pobNum = allocPointNumber(firstFrom || `POB-${tractStamp}`);
    {
      const pobXY = applyTransform(cursor);
      const lotInfo = [file.parcelId, file.ownerName, file.lotDescription].filter(Boolean).join(' | ');
      newPoints.push({
        pointNumber: pobNum,
        easting: pobXY.x,
        northing: pobXY.y,
        description: lotInfo ? `POB ${file.name} | ${lotInfo}` : `POB ${file.name}`,
        layer: pointLayer,
      });
    }

    let prevPointNumber = pobNum;
    let drewAny = false;

    for (let i = 0; i < file.calls.length; i++) {
      const call = file.calls[i];
      let nextXY: { x: number; y: number } | null = null;

      try {
        // v26.05.20.1 � cursor is kept in canvas {x=easting, y=northing} format for
        // applyTransform compatibility, but direct()/directCurve() from cogo.ts use
        // the Point{northing, easting} interface.  Convert at the call boundary so
        // runtime values are never undefined (the previous code passed {x,y} to a
        // function expecting {northing,easting}, making every vertex NaN).
        const cogoCursor = { northing: cursor.y, easting: cursor.x };
        if (call.isCurve && typeof call.curveRadius === 'number' && typeof call.arcLength === 'number') {
          // Curve handling MUST mirror BFOverlay (DrawingCanvas.tsx ~1860�1895)
          // so the amber preview and the white draft trace the same arc.
          // The deed editor's visible "Bearing" column is conventionally the
          // CHORD bearing; treating it as the tangent (the old behavior) made
          // every curved deed land in the wrong place.
          //
          // Algorithm (kept inline rather than factored � see boundary-agent
          // memory note for the unified spec):
          //   1. determine left/right (explicit field, else infer from chord vs
          //      expected R/L bearings: chord � tangent � ?/2)
          //   2. signedDelta = arcLength / radius, negated for left
          //   3. tangent = chord - signedDelta/2 if a chord/bearing exists;
          //      else fall back to explicit tangentBearing
          //   4. hand off to directCurve(cursor, tangent, radius, signedDelta)
          const deltaAngle = call.arcLength / call.curveRadius;

          // (1) direction
          let left = false;
          if (call.curveDirection === 'left') {
            left = true;
          } else if (call.curveDirection === 'right') {
            left = false;
          } else {
            const tempTRad = call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null;
            const dirStr = call.chordBearing || call.bearing;
            const dirRad = dirStr ? parseBearingToRadians(dirStr) : null;
            if (tempTRad != null && dirRad != null) {
              const TWO_PI = 2 * Math.PI;
              const norm = (a: number) => { let n = a % TWO_PI; if (n < 0) n += TWO_PI; return n; };
              const half = deltaAngle / 2;
              const expR = norm(tempTRad + half);
              const expL = norm(tempTRad - half);
              const dN = norm(dirRad);
              const dR = Math.min(Math.abs(dN - expR), TWO_PI - Math.abs(dN - expR));
              const dL = Math.min(Math.abs(dN - expL), TWO_PI - Math.abs(dN - expL));
              if (dL < dR) left = true;
            }
          }

          // (2) signed delta
          const signedDelta = left ? -deltaAngle : deltaAngle;

          // (3) derive tangent from chord; fall back to explicit tangentBearing
          const chordStr = call.chordBearing || call.bearing;
          const chordRad = chordStr ? parseBearingToRadians(chordStr) : null;
          const tangentRad: number | null = chordRad != null
            ? chordRad - signedDelta / 2
            : (call.tangentBearing ? parseBearingToRadians(call.tangentBearing) : null);
          if (tangentRad == null) throw new Error('curve missing chord/tangent bearing');

          // (4) march
          const pt = directCurve(cogoCursor, tangentRad, call.curveRadius, signedDelta);
          nextXY = { x: pt.easting, y: pt.northing };
        } else if (call.bearing && call.distance) {
          const brRad = parseBearingToRadians(call.bearing);
          const dist = parseDistance(call.distance);
          if (brRad == null || dist == null) throw new Error('bad bearing/distance');
          const pt = direct(cogoCursor, brRad, dist);
          nextXY = { x: pt.easting, y: pt.northing };
        }
      } catch (err) {
        console.warn(`[DrawBoundary] Skipping call ${call.id}:`, err);
        continue;
      }

      if (!nextXY) continue;

      const hasClosingLabel = i === file.calls.length - 1 && call.to === firstFrom;
      const closesGeometrically = hasClosingLabel
        && Math.hypot(nextXY.x - pob.easting, nextXY.y - pob.northing) < 0.01;
      const endPointNumber = closesGeometrically
        ? pobNum
        : allocPointNumber(hasClosingLabel ? misclosureKey : (call.to || `PT-${tractStamp}-${i + 1}`));

      if (!closesGeometrically) {
        const vtXY = applyTransform(nextXY);
        // Prefer the per-corner monument description captured at deed-parse
        // time (e.g. "iron rod found", "stone at fence corner"). Fall back to
        // a generic "calc'd pt" so the Fieldbook / canvas labels never echo
        // the bearing/distance text � that information already lives on the
        // line itself.
        const cornerDesc =
          (call.toDescription && call.toDescription.trim())
          || `calc'd pt (${file.name} call ${i + 1})`;
        newPoints.push({
          pointNumber: endPointNumber,
          easting: vtXY.x,
          northing: vtXY.y,
          description: cornerDesc,
          layer: pointLayer,
        });
      }

      // Rotate stored bearings by the boundary file's rotation so they stay in
      // the same coordinate frame as the (already-rotated) from/to endpoints.
      // Without this the DXF exporter computes arc centers off an unrotated
      // tangent + rotated endpoints, producing a curve in the wrong place.
      const rotateBearing = (b: string | undefined): string | undefined => {
        if (!b || rotRad === 0) return b;
        const r = parseBearingToRadians(b);
        return r == null ? b : formatBearing(r + rotRad);
      };
      newLines.push({
        id: `bf-draw-${file.id}-${i}-${tractStamp}`,
        from: prevPointNumber,
        to: endPointNumber,
        bearing: rotateBearing(call.bearing),
        distance: call.distance,
        isCurve: call.isCurve,
        curveRadius: call.curveRadius,
        arcLength: call.arcLength,
        chordBearing: rotateBearing(call.chordBearing),
        chordDistance: typeof call.chordDistance === 'number' ? call.chordDistance : undefined,
        tangentBearing: rotateBearing(call.tangentBearing),
        curveDirection: call.curveDirection,
        layer: lineLayer,
        lineType,
        polylineId: `bf-draw-${file.id}`,
      });

      cursor = nextXY;
      prevPointNumber = endPointNumber;
      drewAny = true;
    }

    if (!drewAny) {
      setError(`Could not draw "${file.name}" � no calls had valid bearing/distance.`);
      setTimeout(() => setError(null), 4000);
      return;
    }

    const newPointIds = newPoints.map(p => p.pointNumber);
    const newLineIds = newLines.map(l => l.id!).filter(Boolean);
    const oldPointIds = new Set(file.drawnPointIds ?? []);
    const oldLineIds = new Set(file.drawnLineIds ?? []);

    // Replace any previously-drawn geometry for this boundary, then push the
    // new geometry into a per-tract point list via the PointAgent CACP skill.
    // Each BoundaryFile gets its own named list (id `boundary-<fileId>`) so
    // multi-tract drafts stay grouped by tract instead of bucketed into a
    // single Working list.
    interAgentComm.sendMessage(
      AgentType.DEED_READER,
      AgentType.POINT_EDITOR,
      'update_point_list',
      {
        listId: `boundary-${file.id}`,
        listName: file.name,
        points: newPoints,
        removePointIds: Array.from(oldPointIds),
        replacePoints: true,
        isVisible: true,
      }
    );

    setLines(prev => {
      const kept = oldLineIds.size > 0 ? prev.filter(l => !(l.id && oldLineIds.has(l.id))) : prev;
      return [...kept, ...newLines];
    });

    setBoundaryFiles(prev => prev.map(f =>
      f.id === fileId
        ? {
            ...f,
            drawnPointIds: newPointIds,
            drawnLineIds: newLineIds,
            hidden: false,
            // Snapshot the transform values we just baked into pointMap.
            // BFOverlay applies (current - baked) so post-Draft edits to ?E/?N/Rot�
            // move the amber preview by exactly the delta instead of doubling.
            bakedTransform: {
              translationE: txE,
              translationN: txN,
              rotationDeg: (rotRad * 180) / Math.PI,
            },
          }
        : f
    ));

    logActionToFieldbook(`Drew boundary "${file.name}" onto canvas: ${newPoints.length} point(s), ${newLines.length} line(s) on layer "${lineLayer}".`);

    // v26.05.17.40 � auto-fit the canvas to the NEWLY DRAWN boundary only, not
    // all geometry (which would zoom way out when large GIS layers are loaded).
    if (!opts?.silent) {
      setTimeout(() => {
        try {
          if (newPoints.length > 0) {
            // v26.05.20.1 � filter NaN coords (shouldn't happen with the
            // cursor fix but defend anyway so a single bad point can't
            // corrupt the bbox and produce an Infinity/NaN zoom transform).
            const validPts = newPoints.filter(
              p => isFinite(p.easting) && isFinite(p.northing)
            );
            if (validPts.length === 0) {
              console.warn('[DrawBoundary] zoom skipped: no valid points');
              return;
            }
            const minE = Math.min(...validPts.map(p => p.easting));
            const maxE = Math.max(...validPts.map(p => p.easting));
            const minN = Math.min(...validPts.map(p => p.northing));
            const maxN = Math.max(...validPts.map(p => p.northing));
            console.log('[DrawBoundary] zoomToBbox', { count: validPts.length, minE, maxE, minN, maxN, canvasReady: !!canvas2dRef.current });
            if (canvas2dRef.current) {
              canvas2dRef.current.zoomToBbox(minE, maxE, minN, maxN, 0.2);
            } else {
              // v26.05.25.1 � canvas not yet mounted; retry once after it has time to mount.
              setTimeout(() => {
                console.log('[DrawBoundary] zoomToBbox retry', { canvasReady: !!canvas2dRef.current });
                canvas2dRef.current?.zoomToBbox(minE, maxE, minN, maxN, 0.2);
              }, 400);
            }
          }
        } catch (e) { console.warn('[DrawBoundary] zoom failed', e); }
      }, 350);
    }
    } catch (err) {
      // v26.05.17.21 � last-ditch guard so an unexpected throw inside the
      // Draw Boundary pipeline (resolveCode failure, malformed call, etc.)
      // surfaces as a toast instead of unmounting the React tree.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DrawBoundary] crashed:', err);
      if (!opts?.silent) {
        setError(`Draw Boundary failed: ${msg}`);
        setTimeout(() => setError(null), 5000);
      }
    }
  }, [boundaryFiles, pointMap, points, cadManagerContext, setPointLists, setLines, setBoundaryFiles, logActionToFieldbook, setError, showView]);

  // Keep the ref in sync with the latest captured-state handler so the
  // debounced transform redraw (declared earlier) never fires with stale
  // state. See v26.05.17.21 notes on handleBoundaryTransformChange.
  handleDrawBoundaryToLineworkRef.current = handleDrawBoundaryToLinework;

  const handleDeleteLine = useCallback((lineId: string) => {
    pushHistory('Deleted line');
    setLines(prev => deleteLineFromList(lineId, prev));
    logActionToFieldbook(`Deleted line with ID: ${lineId}`);
  }, [pushHistory, logActionToFieldbook]);

  const handleAddPoint = useCallback((newPoint: SurveyPoint) => {
      try {
        const newLists = addPointToList(newPoint, pointLists);
        logActionToFieldbook(`Manually added point: ${newPoint.pointNumber} (N: ${newPoint.northing}, E: ${newPoint.easting})`);
        setPointLists(newLists);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add point';
        setError(message);
        setTimeout(() => setError(null), 3000);
      }
  }, [pointLists, logActionToFieldbook]);
  
  const handleUpdatePoint = useCallback((updatedPoint: SurveyPoint) => {
      setPointLists(prev => updatePointInLists(updatedPoint, prev));
  }, []);
  
  const handleDeletePoint = useCallback((pointNumber: string) => {
      logActionToFieldbook(`Deleted point: ${pointNumber}`);
      setPointLists(prev => deletePointFromLists(pointNumber, prev));
  }, [logActionToFieldbook]);

  const handleUpdatePointLabelOffset = useCallback((pointNumber: string, offset: { x: number; y: number }) => {
    setPointLists(prev => updatePointLabelOffset(pointNumber, offset, prev));
  }, []);

  const handleUpdatePointAnnotationOffset = useCallback((pointNumber: string, offset: { dx: number; dy: number }) => {
    setPointLists(prev => updatePointAnnotationOffset(pointNumber, offset, prev));
  }, []);

  const handleUpdateLineLabelOffset = useCallback((lineId: string, offset: { x: number; y: number }) => {
    setLines(prev => updateLineLabelOffset(lineId, offset, prev));
  }, []);

  const handleToggleLineLabelRotation = useCallback((lineId: string) => {
    setLines(prev => toggleLineLabelRotation(lineId, prev));
  }, []);

  const handleSwapLineBearingDirection = useCallback((lineId: string) => {
    setLines(prev => swapLineBearingDirection(lineId, prev));
  }, []);

  const handleUpdateLine = useCallback((lineId: string, changes: Partial<import('./types.ts').SurveyLine>) => {
    setLines(prev => prev.map(l => {
      const id = l.id || `${l.from}-${l.to}`;
      return id === lineId ? { ...l, ...changes } : l;
    }));
  }, []);

  const handleToggleBoundaryCallLabelRotation = useCallback((fileId: string, callId: string) => {
    setBoundaryFiles(prev => prev.map(bf => {
      if (bf.id !== fileId) return bf;
      return {
        ...bf,
        calls: bf.calls.map(c => c.id !== callId ? c : { ...c, labelRotation: c.labelRotation === 180 ? 0 : 180 }),
      };
    }));
  }, []);

  const handleSwapBoundaryCallBearingDirection = useCallback((fileId: string, callId: string) => {
    setBoundaryFiles(prev => prev.map(bf => {
      if (bf.id !== fileId) return bf;
      return {
        ...bf,
        calls: bf.calls.map(c => {
          if (c.id !== callId) return c;
          const newBearing = c.bearing ? swapBearingDirection(c.bearing) : c.bearing;
          return { ...c, bearing: newBearing, from: c.to, to: c.from };
        }),
      };
    }));
  }, []);

  const handleUpdateDeedMetadataOffset = useCallback((offset: { x: number; y: number }) => {
    if (deedFile) {
      setDeedFile({ ...deedFile, deedMetadataOffset: offset });
    }
  }, [deedFile]);

  const handleUpdateOwnerNameOffset = useCallback((offset: { x: number; y: number }) => {
    if (deedFile) {
      setDeedFile({ ...deedFile, ownerNameOffset: offset });
    }
  }, [deedFile]);

  const convertLatLon = useCallback((lat: number, lon: number): { northing: number; easting: number } | null => {
    try {
      const epsg = settings.projection?.epsg;
      if (!epsg) return null;
      const [easting, northing] = proj4('EPSG:4326', `EPSG:${epsg}`, [lon, lat]);
      return { northing, easting };
    } catch {
      return null;
    }
  }, [settings.projection?.epsg]);

  const handleAddPhotoToPoint = useCallback((pointNumber: string, photoData: string) => {
    setPointLists(prevLists =>
      prevLists.map(list => ({
        ...list,
        points: list.points.map(p => {
          if (p.pointNumber === pointNumber) {
            const newPhotos = [...(p.photos || []), photoData];
            return { ...p, photos: newPhotos };
          }
          return p;
        })
      }))
    );
    logActionToFieldbook(`Added a photo to point ${pointNumber}.`);
  }, [logActionToFieldbook]);

  const handleDeletePhotoFromPoint = useCallback((pointNumber: string, photoIndex: number) => {
    setPointLists(prevLists =>
      prevLists.map(list => ({
        ...list,
        points: list.points.map(p => {
          if (p.pointNumber === pointNumber) {
            const newPhotos = (p.photos || []).filter((_, index) => index !== photoIndex);
            return { ...p, photos: newPhotos };
          }
          return p;
        })
      }))
    );
    logActionToFieldbook(`Deleted a photo from point ${pointNumber}.`);
  }, [logActionToFieldbook]);

  const handleSaveUnsavedPointsAsList = useCallback((name: string) => {
    setPointLists(prevLists => {
        const workingList = prevLists.find(l => l.id === 'working');
        if (!workingList || workingList.points.length === 0) {
            setError("No unsaved points to save.");
            setTimeout(() => setError(null), 3000);
            return prevLists;
        }
        const newList: PointList = {
            id: Date.now().toString(),
            name,
            points: workingList.points,
            isVisible: true,
        };
        const updatedWorkingList = { ...workingList, points: [] };
        logActionToFieldbook(`Saved ${newList.points.length} unsaved points to new list "${name}".`);
        return [...prevLists.filter(l => l.id !== 'working'), updatedWorkingList, newList];
    });
  }, [logActionToFieldbook]);
  
  const handleMergeUnsavedPointsIntoList = useCallback((targetListId: string) => {
      setPointLists(prevLists => {
          const workingList = prevLists.find(l => l.id === 'working');
          const targetList = prevLists.find(l => l.id === targetListId);

          if (!workingList || workingList.points.length === 0 || !targetList) {
              setError("No unsaved points or target list found.");
              setTimeout(() => setError(null), 3000);
              return prevLists;
          }

          const targetPointNumbers = new Set(targetList.points.map(p => p.pointNumber));
          const pointsToMerge = workingList.points.filter(p => !targetPointNumbers.has(p.pointNumber));
          
          if (pointsToMerge.length < workingList.points.length) {
              const skippedCount = workingList.points.length - pointsToMerge.length;
              setError(`${skippedCount} point(s) were skipped to avoid duplicates in the target list.`);
              setTimeout(() => setError(null), 4000);
          }
          
          if (pointsToMerge.length === 0) {
               setError("All unsaved points already exist in the target list.");
               setTimeout(() => setError(null), 3000);
              return prevLists;
          }

          logActionToFieldbook(`Merged ${pointsToMerge.length} points from Unsaved Points into list "${targetList.name}".`);

          const updatedTargetList = {
              ...targetList,
              points: [...targetList.points, ...pointsToMerge]
          };

          const updatedWorkingList = { ...workingList, points: [] };

          return prevLists.map(l => {
              if (l.id === targetListId) return updatedTargetList;
              if (l.id === 'working') return updatedWorkingList;
              return l;
          });
      });
  }, [logActionToFieldbook]);

  const handleRenamePointList = useCallback((listId: string, newName: string) => {
      setPointLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName } : l));
  }, []);

  const handleDeletePointList = useCallback((listId: string) => {
      setPointLists(prev => prev.filter(l => l.id !== listId));
      logActionToFieldbook(`Deleted point list.`);
  }, [logActionToFieldbook]);

  const handleTogglePointListVisibility = useCallback((listId: string) => {
      setPointLists(prev => prev.map(l => l.id === listId ? { ...l, isVisible: !l.isVisible } : l));
  }, []);

  const handleTogglePointListContext = useCallback((listId: string) => {
      setPointLists(prev => prev.map(l => l.id === listId ? { ...l, includeInContext: l.includeInContext === false } : l));
  }, []);

  const handleToggleOfflineMapAreaVisibility = useCallback((id: string) => {
    setOfflineMapAreas(prev => prev.map(area => area.id === id ? { ...area, isVisible: !area.isVisible } : area));
  }, []);

  const handleToggleStationingPanel = useCallback(() => {
      setIsStationingPanelExpanded(prev => !prev);
  }, []);

  const handleTextEditorContentChange = useCallback((newContent: string) => {
    setTextEditorContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  const handleSaveChanges = useCallback(() => {
    if (!activeTextEditorFile || !hasUnsavedChanges) return;

    logActionToFieldbook(`Saved changes to ${activeTextEditorFile}.`);

    let isFileUpdated = false;
    const updateFileContent = (file: SessionFile | null) => {
        if (file?.name === activeTextEditorFile) {
            isFileUpdated = true;
            return { ...file, content: textEditorContent };
        }
        return file;
    };
    
    setRawFile(updateFileContent(rawFile));
    setDeedFile(updateFileContent(deedFile));
    setDxfFile(updateFileContent(dxfFile));
    setClFile(updateFileContent(clFile));
    setPlanFiles(prev => prev?.map(updateFileContent) || null);
    setGeneratedFiles(prev => prev.map(f => f.name === activeTextEditorFile ? { ...f, content: textEditorContent } : f));
    if (generatedFiles.some(f => f.name === activeTextEditorFile)) isFileUpdated = true;

    if (!isFileUpdated) {
        try {
            const newPoints = parsePointFile(textEditorContent);
            setPointLists(prevLists =>
                prevLists.map(list =>
                    list.name === activeTextEditorFile ? { ...list, points: newPoints } : list
                )
            );
            logActionToFieldbook(`Updated point list "${activeTextEditorFile}" from text editor.`);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error parsing point file.';
            setError(`Could not save point list: ${errorMessage}`);
            return;
        }
    }

    setHasUnsavedChanges(false);
  }, [activeTextEditorFile, hasUnsavedChanges, textEditorContent, rawFile, deedFile, dxfFile, clFile, planFiles, generatedFiles, logActionToFieldbook, pointLists]);

  /**
   * Initialize and update PointAgent with available points
   * This enables inter-agent coordination for deed + point pushing
   */
  // CACP: keep PointAgent in sync with the canonical points + settings on every change.
  useEffect(() => {
    try {
      const pointAgent = PointAgent.getInstance();
      pointAgent.setLabelingSettings(settings.pointLabelingSettings);
      const allPoints = pointLists.flatMap(list => list.points);
      pointAgent.setAvailablePoints(allPoints);
      pointAgent.broadcastPointStatus();
    } catch (err) {
      console.warn('[App] Error initializing PointAgent:', err);
    }
  }, [pointLists, settings.pointLabelingSettings]);

  // CACP: register the React-side bridge for the `update_point_list` skill so
  // PointAgent stays the canonical entry for point-list mutations. The Draft
  // handler (and any other producer) sends a CACP message; this bridge applies
  // it to the React-owned `pointLists` state.
  useEffect(() => {
    const pointAgent = PointAgent.getInstance();
    pointAgent.registerPointListBridge((req) => {
      const listId = req.listId
        ?? `list-${req.listName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const removeSet = new Set(req.removePointIds ?? []);
      setPointLists(prev => {
        const cleaned = removeSet.size > 0
          ? prev.map(l => ({ ...l, points: l.points.filter(p => !removeSet.has(p.pointNumber)) }))
          : prev;
        const idx = cleaned.findIndex(l => l.id === listId);
        if (idx >= 0) {
          const existing = cleaned[idx];
          const merged = req.replacePoints
            ? req.points
            : [...existing.points, ...req.points];
          const next = [...cleaned];
          next[idx] = { ...existing, name: req.listName, points: merged };
          return next;
        }
        return [
          ...cleaned,
          {
            id: listId,
            name: req.listName,
            points: req.points,
            isVisible: req.isVisible !== false,
          },
        ];
      });
      return { listId };
    });
  }, [setPointLists]);

  // Connect the AI gateway relay so external platforms (Claude/ChatGPT/Grok)
  // can stage points / reserve numbers into this open session via the CACP bus.
  useEffect(() => {
    connectGatewayRelay();
    return () => { disconnectGatewayRelay(); };
  }, []);

  // CACP: Point Editor is the authoritative owner of point deletion. Any agent
  // that the user asks to "remove / delete / get rid of" point(s) must delegate
  // here via askPeer('remove_points', { pointNumbers: [...] }).
  //
  // Before any destructive removal we show the user exactly which points are
  // about to go: the canvas zooms to their bounding box and each one gets a
  // pulsing red ring, then a confirmation dialog gates the actual delete.
  // Programmatic callers that already have user intent (tests, scripted
  // cleanup) can skip the prompt by passing `confirm: true` in the payload.
  useEffect(() => {
    const unsub = interAgentComm.onCommand('remove_points', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const raw = d.pointNumbers ?? d.pointNumber ?? d.numbers ?? d.pn;
      const list: string[] = Array.isArray(raw)
        ? raw.map(String).filter(Boolean)
        : (raw == null ? [] : [String(raw)]);
      if (list.length === 0) {
        return { requestId: message.id, from: AgentType.POINT_EDITOR, success: false, error: 'No pointNumbers provided', timestamp: Date.now() };
      }
      const reason = typeof d.reason === 'string' ? d.reason : '';
      const skipConfirm = d.confirm === true;
      const allPoints = pointLists.flatMap(l => l.points);
      const existing = new Map(allPoints.map(p => [String(p.pointNumber), p] as const));
      const targets = list.filter(pn => existing.has(pn));
      const notFound = list.filter(pn => !existing.has(pn));
      if (targets.length === 0) {
        return { requestId: message.id, from: AgentType.POINT_EDITOR, success: false, error: `No matching points found (not found: ${notFound.join(', ')})`, timestamp: Date.now() };
      }

      if (!skipConfirm) {
        // Highlight the targets on the canvas, then zoom to them so the user
        // can see exactly what will be deleted.
        setPendingPointDeletes(new Set(targets));
        showView('canvas');
        const pts = targets.map(pn => existing.get(pn)!).filter(Boolean);
        if (pts.length > 0) {
          let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
          for (const p of pts) {
            minE = Math.min(minE, p.easting); maxE = Math.max(maxE, p.easting);
            minN = Math.min(minN, p.northing); maxN = Math.max(maxN, p.northing);
          }
          // Pad the bbox a little so a single point still gets a sane zoom.
          if (maxE - minE < 1e-6 && maxN - minN < 1e-6) {
            minE -= 25; maxE += 25; minN -= 25; maxN += 25;
          }
          // Defer one tick so the canvas has mounted before we call its handle.
          setTimeout(() => {
            canvas2dRef.current?.zoomToBbox(minE, maxE, minN, maxN, 0.4);
          }, 150);
        }
        const label = targets.length === 1 ? `point ${targets[0]}` : `${targets.length} points (${targets.join(', ')})`;
        const confirmed = window.confirm(
          `Delete ${label}?\n\nThe canvas is zoomed to the highlighted point${targets.length === 1 ? '' : 's'} (red rings).${reason ? `\n\nReason: ${reason}` : ''}`
        );
        setPendingPointDeletes(new Set());
        if (!confirmed) {
          logActionToFieldbook(`CACP remove_points (from ${message.from}) � user cancelled deletion of ${label}.`);
          return { requestId: message.id, from: AgentType.POINT_EDITOR, success: false, error: 'User cancelled the deletion after preview.', timestamp: Date.now() };
        }
      }

      const removed: string[] = [];
      for (const pn of targets) {
        removed.push(pn);
        handleDeletePoint(pn);
      }
      logActionToFieldbook(
        `CACP remove_points (from ${message.from}) � removed ${removed.length} point${removed.length === 1 ? '' : 's'}: ${removed.join(', ')}${reason ? ` (${reason})` : ''}${notFound.length ? `; not found: ${notFound.join(', ')}` : ''}`
      );
      return {
        requestId: message.id,
        from: AgentType.POINT_EDITOR,
        success: true,
        data: { removed, notFound, removedCount: removed.length },
        timestamp: Date.now(),
      };
    });
    return unsub;
  }, [pointLists, handleDeletePoint, logActionToFieldbook, showView, setPendingPointDeletes]);

    const handleUpdateImageTags = useCallback((fileName: string, tags: string[]) => {
        setImageFiles(prevFiles => {
            if (!prevFiles) return null;
            return prevFiles.map(file => 
                file.name === fileName ? { ...file, tags } : file
            );
        });
        logActionToFieldbook(`Updated tags for image: ${fileName}`);
    }, [logActionToFieldbook]);
  
  const handleOpenDxfExportModal = useCallback(() => {
    if (points.length === 0 && visibleLines.length === 0 && visibleCenterlines.length === 0 && contourLabels.length === 0) {
      setError("Nothing to export. Add some points or lines to the canvas.");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setIsDxfExportModalOpen(true);
  }, [points, visibleLines, visibleCenterlines, contourLabels]);

  const handleExportDxf = useCallback(async (options: DxfExportOptions) => {
    if (points.length === 0 && visibleLines.length === 0 && visibleCenterlines.length === 0 && contourLabels.length === 0) {
        setIsDxfExportModalOpen(false);
        return;
    }
    try {
        // FIX: Added contourLabels to the generateDxf call to include them in the export. This resolves an argument mismatch implied by the error.
        const dxfContent = generateDxf(points, visibleLines, contourLabels, visibleCenterlines, options, settings, customSymbols);
        const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
        triggerDownload(blob, options.fileName);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during DXF generation.';
        setError(`DXF Export Error: ${errorMessage}`);
    }
    setIsDxfExportModalOpen(false);
  }, [points, visibleLines, visibleCenterlines, settings, customSymbols, contourLabels]);


   const handleExportPoints = useCallback((format: 'csv' | 'txt_comma' | 'txt_space') => {
    if (points.length === 0) return;

    let content = '';
    let fileExtension = '';
    let mimeType = 'text/plain;charset=utf-8';
    const header = 'Point,Northing,Easting,Elevation,Description';
    const disclaimer = '# Disclaimer: Your requested data is ready for professional review.\n';

    if (format === 'csv') {
      const rows = points.map(p =>
          [p.pointNumber, p.northing.toFixed(settings.coordinatePrecision), p.easting.toFixed(settings.coordinatePrecision), (p.elevation || 0).toFixed(settings.coordinatePrecision), p.description || ''].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      content = disclaimer + header + '\n' + rows;
      fileExtension = 'csv';
      mimeType = 'text/csv;charset=utf-8';
    } else {
      const delimiter = format === 'txt_space' ? ' ' : ',';
      const rows = points.map(p =>
          [p.pointNumber, p.northing.toFixed(settings.coordinatePrecision), p.easting.toFixed(settings.coordinatePrecision), (p.elevation || 0).toFixed(settings.coordinatePrecision), p.description || ''].join(delimiter)
      ).join('\n');
      content = disclaimer + header.replace(/,/g, delimiter) + '\n' + rows;
      fileExtension = 'txt';
    }

    const blob = new Blob([content], { type: mimeType });
    const fileNameBase = (rawFile?.name || deedFile?.name || centerlines[0]?.name || 'points').replace(/\.[^/.]+$/, "");
    triggerDownload(blob, `landsurvai_points_${fileNameBase}.${fileExtension}`);
  }, [points, rawFile, deedFile, centerlines, settings.coordinatePrecision]);

  // FUTURE GEMINI: This `handleSaveSession` function is CRITICAL. It packages the entire application state into a `.lsvz` file.
  // If you add any new piece of state that needs to be saved between sessions (e.g., a new type of data),
  // you MUST add it to the `sessionState` object here and update the `SessionState` interface in `types.ts`.
  const handleOpenSaveSessionModal = useCallback(() => {
    if (!isSessionActive) return;
    setIsSessionSaveModalOpen(true);
  }, [isSessionActive]);

  const handleSaveSession = useCallback(async (saveOptions?: SessionSaveOptions) => {
    if (!isSessionActive) return;

    const savedAt = new Date().toISOString();
    const suggestedName = generateSessionFileName(
      jobInfo.jobName,
      [rawFile?.name, deedFile?.name, centerlines[0]?.name],
      {
        ...saveOptions,
        jobNumber: jobInfo.jobNo,
        activeAgent,
        savedAt,
      }
    );

    // FIX: Update session version and include gisFile, gisChatHistory and contouringChatHistory to match the updated SessionState type. Also add profileChatHistory.
    const sessionState: Omit<SessionState, 'fileManagerChatHistory' | 'textEditorChatHistory'> = {
        version: APP_VERSION,
        savedAt,
        sessionMetadata: {
            author: saveOptions?.author?.trim() || undefined,
            note: saveOptions?.note?.trim() || undefined,
            exportFileName: suggestedName,
            exportedByAgent: activeAgent,
            includeTimestampInName: Boolean(saveOptions?.includeTimestampInName),
            includeJobNumberInName: Boolean(saveOptions?.includeJobNumberInName),
            includeActiveAgentInName: Boolean(saveOptions?.includeActiveAgentInName),
            includeAuthorInName: Boolean(saveOptions?.includeAuthorInName),
        },
        settings,
        rawFile,
        deedFile,
        planFiles,
        dxfFile,
        clFile,
        imageFiles,
        gisFile,
        generatedFiles,
        pdfViewerFiles,
        pdfHighlights: highlights,
        customSymbols,
        customAnnotations,
        annotationScale,
        closureReports,
        boundaryFiles,
        dimensions,
        inclusionBoundaries,
        activeInclusionBoundaryId,
        floodFirmette: floodFirmetteData ?? null,
        contourGenerations: contourGenerations.length > 0 ? contourGenerations : undefined,
        streetLabels: streetLabels.length > 0 ? streetLabels : undefined,
        parcelLabels: parcelLabels.length > 0 ? parcelLabels : undefined,
        annotationCategories: annotationCategories,
        jobInfo,
        rawChatHistory,
        deedChatHistory,
        civilDrafterChatHistory,
        dxfChatHistory,
        stationingChatHistory, 
        pointEditorChatHistory,
        fieldbookChatHistory: fieldbookLog,
        gpsStakeoutChatHistory,
        lsvzChatHistory,
        planExpertChatHistory,
        imageAnalyzerChatHistory,
        gisChatHistory,
        contouringChatHistory,
        steepSlopeChatHistory,
        profileChatHistory,
        cogoChatHistory,
        rinexChatHistory, // Added rinexChatHistory
        zoningChatHistory,
        standardsComplianceChatHistory,
        standardsComplianceControlFile,
        standardsComplianceSubjectFile,
        standardsComplianceSourceMode,
        standardsComplianceChecks,
        standardsComplianceLastReport,
        // FIX: Add profile data and info to the session state.
        profileData,
        profileInfo,
        fieldbookNotes,
        pointLists,
        lines,
        contourLabels,
        centerlines,
        gisFeatures, // Added gisFeatures
        wmsServices,
        activeWmsLayers,
        offlineMapAreas,
        cutSheetData,
        cutSheetInfo,
        // CACP: persist PointAgent reservations so continuation across agents survives reload.
        cacpReservations: PointAgent.getInstance().exportReservations(),
        // CACP: persist the Project Knowledge Base so every fact learned this session (deed ROW
        // widths, zoning setbacks, parcel ids, monuments) travels with the .lsvz file.
        knowledgeFacts: knowledgeBase.exportFacts() as any,
        // Drafting Style Library � CAD Manager sub-tool training data
        draftingStyleLibrary: draftingStyleLibrary.length > 0 ? draftingStyleLibrary : undefined,
        // Soils Agent � SSURGO map units and chat history
        soilMapUnits: soilMapUnits.length > 0 ? soilMapUnits : undefined,
        soilsChatHistory: soilsChatHistory.length > 0 ? soilsChatHistory : undefined,
        uiState: {
            activeAgent,
            activeModel,
            activeVisualPanel,
            isPdfViewerFullscreen,
            isVisualPanelFullscreen,
            attributeScale,
            lineLabelScale,
            dimensionScale,
            pointLayers,
            activeTextEditorFile,
            isPointEditorFullscreen: false,
            isChatPanelVisible,
            linesVisible,
            centerlinesVisible,
            activeBoundaryFileId,
            showRotatedBearings,
            parcelLabelFormatter,
            canvasTransform: canvas2dRef.current?.getTransform() ?? canvasTransform ?? undefined,
        }
    };

    try {
        // Collect all files to include in ZIP
        const filesToInclude = [
            rawFile,
            deedFile,
            dxfFile,
            clFile,
            gisFile,
            ...(planFiles || []),
            ...(imageFiles || []),
            ...(generatedFiles || [])
        ].filter(f => f !== null && f !== undefined);

        // Use utility to create ZIP
        const blob = await createSessionZip(sessionState, filesToInclude);
        
        triggerDownload(blob, suggestedName);
        setIsSessionSaveModalOpen(false);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session file.';
        console.error('[handleSaveSession] Failed to save .lsvz session file:', err);
        setError(`Save Error: ${errorMessage}`);
    }
  }, [
    isSessionActive, settings, rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, generatedFiles, jobInfo, rawChatHistory, deedChatHistory, civilDrafterChatHistory, dxfChatHistory, stationingChatHistory, 
    pointEditorChatHistory, fieldbookLog, gpsStakeoutChatHistory, lsvzChatHistory, planExpertChatHistory, imageAnalyzerChatHistory, gisChatHistory, contouringChatHistory, steepSlopeChatHistory, profileChatHistory, fieldbookNotes,
    pointLists, lines, contourLabels, centerlines, wmsServices, activeWmsLayers, offlineMapAreas, cutSheetData, cutSheetInfo, activeAgent, activeModel,
    activeVisualPanel, pdfViewerFiles, highlights, customSymbols, closureReports, boundaryFiles,
    inclusionBoundaries, activeInclusionBoundaryId, floodFirmetteData, contourGenerations, streetLabels,
    isVisualPanelFullscreen, attributeScale, pointLayers, activeTextEditorFile, isChatPanelVisible, linesVisible, centerlinesVisible,
    profileData, profileInfo, APP_VERSION, lineLabelScale, draftingStyleLibrary,
    soilMapUnits, soilsChatHistory, standardsComplianceChatHistory, standardsComplianceControlFile,
    standardsComplianceSubjectFile, standardsComplianceSourceMode, standardsComplianceChecks, standardsComplianceLastReport,
    setIsSessionSaveModalOpen
  ]);

  // FUTURE GEMINI: This `handleLoadSession` function is CRITICAL. It unpacks a `.lsvz` file and restores the application state.
  // It includes logic for migrating older session file versions. If you change the `SessionState` interface,
  // you may need to add migration logic here to support loading older files.
  const handleLoadSession = useCallback(() => {
    if(!isDesktop) setIsMobileMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lsvz,.zip,application/zip';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            setIsSessionLoading(true);
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                const zip = await JSZip.loadAsync(arrayBuffer);
                const manifestFile = zip.file("manifest.json");
                if (!manifestFile) {
                    throw new Error("Invalid .lsvz file: manifest.json not found.");
                }
                const manifestContent = await manifestFile.async("string");
                const sessionState = JSON.parse(manifestContent) as SessionState;
                
                // Use flexible version check that accepts date-based (YY.MM.DD.xx) and semantic (X.Y.Z) versions
                if (!isVersionCompatible(sessionState.version) || !sessionState.uiState) {
                     throw new Error(`Invalid or incompatible session file version: ${sessionState.version || 'missing'}`);
                }
                
                handleReset();

                const loadedAgents = new Set<AgentType>();
                if (sessionState.rawFile) loadedAgents.add(AgentType.RAW_CRAWLER);
                if (sessionState.deedFile) loadedAgents.add(AgentType.DEED_READER);
                if (sessionState.planFiles) loadedAgents.add(AgentType.CIVIL_PLAN_EXPERT);
                if (sessionState.dxfFile) loadedAgents.add(AgentType.DXF_ANALYZER);
                if (sessionState.clFile) loadedAgents.add(AgentType.CENTERLINE_STATIONING);
                if (sessionState.imageFiles) loadedAgents.add(AgentType.IMAGE_ANALYZER);
                if (sessionState.gisFile) loadedAgents.add(AgentType.GIS_AGENT);
                // FIX: Add Civil Drafter to initialized agents if its chat history exists.
                if (sessionState.civilDrafterChatHistory && sessionState.civilDrafterChatHistory.length > 0) loadedAgents.add(AgentType.CIVIL_DRAFTER);
                // FIX: Add Contouring Agent to initialized agents if its history exists.
                if (sessionState.contouringChatHistory && sessionState.contouringChatHistory.length > 0) loadedAgents.add(AgentType.CONTOURING_AGENT);
                if (sessionState.steepSlopeChatHistory && sessionState.steepSlopeChatHistory.length > 0) loadedAgents.add(AgentType.STEEP_SLOPE_AGENT);
                // FIX: Add Profile Agent to initialized agents if its history exists.
                if (sessionState.profileChatHistory && sessionState.profileChatHistory.length > 0) loadedAgents.add(AgentType.PROFILE_AGENT);
                if (sessionState.cogoChatHistory && sessionState.cogoChatHistory.length > 0) loadedAgents.add(AgentType.COGO_AGENT);
                if (sessionState.standardsComplianceChatHistory && sessionState.standardsComplianceChatHistory.length > 0) loadedAgents.add(AgentType.STANDARDS_COMPLIANCE);
                loadedAgents.add(AgentType.POINT_EDITOR);
                if (sessionState.gpsStakeoutChatHistory) loadedAgents.add(AgentType.GPS_STAKEOUT);
                loadedAgents.add(AgentType.LSVZ_AGENT);
                setInitializedAgents(loadedAgents);

                const needsMigration = !sessionState.version || parseFloat(sessionState.version) < 1.8;
                
                if (sessionState.pointLists) {
                    setPointLists(sessionState.pointLists);
                } else if ((sessionState as any).points) { // Migration for older versions
                    setPointLists([{ id: 'working', name: 'Loaded Points', points: (sessionState as any).points, isVisible: true }]);
                } else {
                    setPointLists([{ id: 'working', name: 'Unsaved Points', points: [], isVisible: true }]);
                }
                
                setRawFile(sessionState.rawFile);
                setDeedFile(sessionState.deedFile);
                setDxfFile(sessionState.dxfFile || null);
                setClFile(sessionState.clFile || null);
                setPlanFiles(sessionState.planFiles || null);
                setImageFiles(sessionState.imageFiles || null);
                setGisFile(sessionState.gisFile || null);
                setGeneratedFiles(sessionState.generatedFiles || []);
                setPdfViewerFiles(sessionState.pdfViewerFiles || sessionState.planFiles || null);
                const loadedHighlights = (sessionState.pdfHighlights || []).map(h => ({
                    ...h,
                    color: h.color || 'rgba(255, 255, 0, 0.4)', // Default to yellow if missing
                    borderColor: h.borderColor || 'rgba(255, 200, 0, 0.8)',
                }));
                setHighlights(loadedHighlights);
                setWmsServices(sessionState.wmsServices || []);
                setActiveWmsLayers(sessionState.activeWmsLayers || []);
                setOfflineMapAreas(sessionState.offlineMapAreas || []);
                setCustomSymbols((sessionState.customSymbols || []).filter(s => !s.isDefault));
                setCustomAnnotations(sessionState.customAnnotations || []);
                if (typeof sessionState.annotationScale === 'number') setAnnotationScale(sessionState.annotationScale);
                setClosureReports(sessionState.closureReports || []);
                setBoundaryFiles(sessionState.boundaryFiles || []);
                setDimensions(sessionState.dimensions || []);
                setInclusionBoundaries(sessionState.inclusionBoundaries || []);
                setActiveInclusionBoundaryId(sessionState.activeInclusionBoundaryId ?? null);
                if (sessionState.floodFirmette) {
                  setFloodFirmetteData(sessionState.floodFirmette);
                }
                if (sessionState.contourGenerations && sessionState.contourGenerations.length > 0) {
                  setContourGenerations(sessionState.contourGenerations);
                  setIsContourManagementVisible(true);
                }
                if (sessionState.streetLabels && sessionState.streetLabels.length > 0) {
                  setStreetLabels(sessionState.streetLabels);
                }
                if (sessionState.parcelLabels && sessionState.parcelLabels.length > 0) {
                  setParcelLabels(sessionState.parcelLabels);
                }
                if (sessionState.annotationCategories && sessionState.annotationCategories.length > 0) {
                  setAnnotationCategories(sessionState.annotationCategories);
                }
                if ((sessionState.boundaryFiles || []).length > 0) {
                  setIsBoundaryEditorVisible(false);
                  setIsBoundaryEditorButtonPulsing(true);
                }
                setJobInfo(sessionState.jobInfo || { jobName: 'Project Name', jobNo: 'Project No.' });
                
                const loadedSettings = mergeSettingsWithDefaults(sessionState.settings, DEFAULT_SETTINGS);
                setSettings(loadedSettings);

                setRawChatHistory(needsMigration ? sessionState.rawChatHistory.map(migrateMessage) : sessionState.rawChatHistory);
                setDeedChatHistory(needsMigration ? sessionState.deedChatHistory.map(migrateMessage) : sessionState.deedChatHistory);
                setCivilDrafterChatHistory(needsMigration ? (sessionState.civilDrafterChatHistory || []).map(migrateMessage) : sessionState.civilDrafterChatHistory || []);
                setDxfChatHistory(needsMigration ? (sessionState.dxfChatHistory || []).map(migrateMessage) : sessionState.dxfChatHistory || []);
                setStationingChatHistory(needsMigration ? (sessionState.stationingChatHistory || []).map(migrateMessage) : sessionState.stationingChatHistory || []);
                setPointEditorChatHistory(needsMigration ? (sessionState.pointEditorChatHistory || []).map(migrateMessage) : sessionState.pointEditorChatHistory || []);
                setFieldbookLog(needsMigration ? (sessionState.fieldbookChatHistory || []).map(migrateMessage) : sessionState.fieldbookChatHistory || []);
                setGpsStakeoutChatHistory(needsMigration ? (sessionState.gpsStakeoutChatHistory || []).map(migrateMessage) : sessionState.gpsStakeoutChatHistory || []);
                setLsvzChatHistory(needsMigration ? (sessionState.lsvzChatHistory || []).map(migrateMessage) : sessionState.lsvzChatHistory || []);
                setPlanExpertChatHistory(needsMigration ? (sessionState.planExpertChatHistory || []).map(migrateMessage) : sessionState.planExpertChatHistory || []);
                setGisChatHistory(needsMigration ? (sessionState.gisChatHistory || []).map(migrateMessage) : sessionState.gisChatHistory || []);
                // FIX: Load contouring agent chat history from the session file.
                setContouringChatHistory(needsMigration ? (sessionState.contouringChatHistory || []).map(migrateMessage) : sessionState.contouringChatHistory || []);
                setSteepSlopeChatHistory(needsMigration ? (sessionState.steepSlopeChatHistory || []).map(migrateMessage) : sessionState.steepSlopeChatHistory || []);
                // FIX: Load profile agent chat history from the session file.
                setProfileChatHistory(needsMigration ? (sessionState.profileChatHistory || []).map(migrateMessage) : sessionState.profileChatHistory || []);
                setCogoChatHistory(needsMigration ? (sessionState.cogoChatHistory || []).map(migrateMessage) : sessionState.cogoChatHistory || []);
                setStandardsComplianceChatHistory(needsMigration ? (sessionState.standardsComplianceChatHistory || []).map(migrateMessage) : sessionState.standardsComplianceChatHistory || []);
                setStandardsComplianceControlFile(sessionState.standardsComplianceControlFile || null);
                setStandardsComplianceSubjectFile(sessionState.standardsComplianceSubjectFile || null);
                setStandardsComplianceSourceMode(sessionState.standardsComplianceSourceMode || 'ask-each-run');
                setStandardsComplianceChecks(sessionState.standardsComplianceChecks || DEFAULT_STANDARDS_CHECKS);
                setStandardsComplianceLastReport(sessionState.standardsComplianceLastReport || null);
                setFieldbookNotes(sessionState.fieldbookNotes || '');
                setLines(sessionState.lines);
                // FIX: Load contour labels from session state.
                setContourLabels(sessionState.contourLabels || []);
                // FIX: Load profile data and info from session state.
                setProfileData(sessionState.profileData || []);
                setProfileInfo(sessionState.profileInfo || null);
                setCenterlines(sessionState.centerlines || []);
                setCutSheetData(sessionState.cutSheetData);
                setCutSheetInfo(sessionState.cutSheetInfo);
                // Restore Drafting Style Library
                setDraftingStyleLibrary(sessionState.draftingStyleLibrary || []);
                // Restore Soils Agent map units and chat history
                setSoilMapUnits(sessionState.soilMapUnits ?? []);
                setSoilsChatHistory(needsMigration ? (sessionState.soilsChatHistory || []).map(migrateMessage) : sessionState.soilsChatHistory || []);
                
                const { uiState } = sessionState;

                if (uiState.activeVisualPanel) {
                    setActiveVisualPanel(uiState.activeVisualPanel);
                } else if ((uiState as any).isCanvasVisible) {
                    // Backwards compatibility for versions < 1.15.0
                    let panelToShow: VisualPanel = 'canvas';
                    if ((uiState as any).isCutSheetVisible) panelToShow = 'cutsheet';
                    else if ((uiState as any).isFieldbookVisible) panelToShow = 'fieldbook';
                    else if ((uiState as any).isPdfViewerVisible) panelToShow = 'pdfviewer';
                    else if ((uiState as any).isTextEditorVisible) panelToShow = 'texteditor';
                    else if ((uiState as any).isGpsStakeoutVisible) panelToShow = 'gpsstakeout';
                    else if ((uiState as any).isFileManagerVisible) panelToShow = 'filemanager';
                    else if ((uiState as any).isImageAnalyzerVisible) panelToShow = 'imageanalyzer';
                    else if ((uiState as any).isWmsPanelVisible) panelToShow = 'wms';
                    setActiveVisualPanel(panelToShow);
                } else {
                    // Default to canvas if no visual panel is saved (prevents blank workspace)
                    setActiveVisualPanel('canvas');
                }

                setActiveModel(uiState.activeModel);
                setActiveTextEditorFile(uiState.activeTextEditorFile || null);
                setIsPdfViewerFullscreen(uiState.isPdfViewerFullscreen || false);
                setIsVisualPanelFullscreen(uiState.isVisualPanelFullscreen);
                setIsChatPanelVisible(uiState.isChatPanelVisible ?? true);
                setAttributeScale(uiState.attributeScale || 1);
                setLineLabelScale(uiState.lineLabelScale || uiState.attributeScale || 1);
                setDimensionScale(uiState.dimensionScale || 1);
                setSymbolScale(uiState.symbolScale || 1);
                
                // FIX: Added backward compatibility for loading older session files where 'pointLayers' stored booleans instead of objects.
                const loadedPointLayers = uiState.pointLayers;
                if (loadedPointLayers && typeof (loadedPointLayers as any).pointNumber === 'boolean') {
                    setPointLayers({
                        pointNumber: { visible: (loadedPointLayers as any).pointNumber, color: '#00FFFF' },
                        description: { visible: (loadedPointLayers as any).description, color: '#FF00FF' },
                        elevation: { visible: (loadedPointLayers as any).elevation, color: '#00FF00' },
                    });
                } else {
                    setPointLayers(loadedPointLayers);
                }

                setLinesVisible(uiState.linesVisible ?? true);
                setCenterlinesVisible(uiState.centerlinesVisible ?? true);
                if (uiState.activeBoundaryFileId !== undefined) setActiveBoundaryFileId(uiState.activeBoundaryFileId);
                if (uiState.showRotatedBearings !== undefined) setShowRotatedBearings(uiState.showRotatedBearings);
                if (uiState.parcelLabelFormatter) setParcelLabelFormatter({ ...DEFAULT_PARCEL_LABEL_FORMATTER, ...uiState.parcelLabelFormatter });
                setCanvasTransform(uiState.canvasTransform || null);

                if (uiState.activeTextEditorFile && activeVisualPanel === 'texteditor') {
                    const allFiles = [sessionState.rawFile, sessionState.deedFile, sessionState.dxfFile, sessionState.clFile, ...(sessionState.planFiles || []), ...(sessionState.generatedFiles || [])].filter(f => f !== null) as SessionFile[];
                    const fileToOpen = allFiles.find(f => f.name === uiState.activeTextEditorFile);
                    if (fileToOpen) {
                        setTextEditorContent(fileToOpen.content);
                    }
                }
                
                // Only initialize chats if an API key is available
                if (loadedSettings.userApiKey) {
                    try {
                        if (sessionState.rawFile) { setRawChat(startGeminiChat(AgentType.RAW_CRAWLER, sessionState.rawFile.content, uiState.activeModel, loadedSettings)); }
                        if (sessionState.deedFile) { setDeedChat(startGeminiChat(AgentType.DEED_READER, sessionState.deedFile, uiState.activeModel, loadedSettings)); }
                        if (sessionState.planFiles) { setPlanExpertChat(startGeminiChat(AgentType.CIVIL_PLAN_EXPERT, sessionState.planFiles, uiState.activeModel, loadedSettings)); }
                        if (sessionState.dxfFile) { setDxfChat(startGeminiChat(AgentType.DXF_ANALYZER, sessionState.dxfFile.content, uiState.activeModel, loadedSettings)); }
                        if (sessionState.imageFiles) { setImageAnalyzerChat(startGeminiChat(AgentType.IMAGE_ANALYZER, sessionState.imageFiles, uiState.activeModel, loadedSettings)); }
                        if (sessionState.gisFile) { setGisChat(startGeminiChat(AgentType.GIS_AGENT, sessionState.gisFile.content, uiState.activeModel, loadedSettings)); }
                        // FIX: Initialize Civil Drafter chat when loading a session with its chat history.
                        // Also pass training DXF if one is marked for training
                        if (sessionState.civilDrafterChatHistory && sessionState.civilDrafterChatHistory.length > 0 && sessionState.rawFile) { 
                            const trainingDxf = sessionState.dxfFile?.forTraining ? sessionState.dxfFile : undefined;
                            setCivilDrafterChat(startGeminiChat(AgentType.CIVIL_DRAFTER, sessionState.rawFile.content, uiState.activeModel, loadedSettings, trainingDxf, undefined, undefined, sessionState.draftingStyleLibrary)); 
                        }
                        
                        const clContext = (sessionState.centerlines && sessionState.centerlines.length > 0) ? JSON.stringify(sessionState.centerlines[0], null, 2) : '';
                        setStationingChat(startGeminiChat(AgentType.CENTERLINE_STATIONING, clContext, uiState.activeModel, loadedSettings));
                        
                        const pointContext = JSON.stringify(sessionState.pointLists || ((sessionState as any).points ? [{ id: 'working', name: 'Loaded Points', points: (sessionState as any).points, isVisible: true }] : []), null, 2);
                        setPointEditorChat(startGeminiChat(AgentType.POINT_EDITOR, pointContext, uiState.activeModel, loadedSettings));
                        // FIX: Initialize the contouring agent chat when loading a session.
                        setContouringChat(startGeminiChat(AgentType.CONTOURING_AGENT, pointContext, uiState.activeModel, loadedSettings));
                        // FIX: Initialize the profile agent chat when loading a session.
                        setProfileChat(startGeminiChat(AgentType.PROFILE_AGENT, pointContext, uiState.activeModel, loadedSettings));
                        if (sessionState.standardsComplianceSubjectFile || (sessionState.standardsComplianceChatHistory && sessionState.standardsComplianceChatHistory.length > 0)) {
                          const standardsSeed = JSON.stringify({
                            sourceMode: sessionState.standardsComplianceSourceMode || 'ask-each-run',
                            checks: sessionState.standardsComplianceChecks || DEFAULT_STANDARDS_CHECKS,
                            subject: sessionState.standardsComplianceSubjectFile?.name || null,
                            control: sessionState.standardsComplianceControlFile?.name || null,
                          }, null, 2);
                          setStandardsComplianceChat(startGeminiChat(AgentType.STANDARDS_COMPLIANCE, standardsSeed, uiState.activeModel, loadedSettings));
                        }

                        setGpsStakeoutChat(startGeminiChat(AgentType.GPS_STAKEOUT, '', uiState.activeModel, loadedSettings));
                        
                        const sessionContext = JSON.stringify(sessionState, null, 2);
                        setLsvzChat(startGeminiChat(AgentType.LSVZ_AGENT, sessionContext, uiState.activeModel, loadedSettings));
                    } catch (chatInitErr) {
                        console.warn("Chat initialization skipped:", chatInitErr instanceof Error ? chatInitErr.message : 'Unknown error');
                    }
                }
                if (!sessionState.lsvzChatHistory || sessionState.lsvzChatHistory.length === 0) {
                    setLsvzChatHistory([{ role: MessageRole.MODEL, text: 'Session loaded. I am the LSVZ Meta-Agent. Ask me anything about this project.' }]);
                }

                setIsInitialScreen(false);
                // Restore the active agent from the session, or default to LSVZ_AGENT if not saved
                setActiveAgent(uiState.activeAgent || AgentType.LSVZ_AGENT);

                // CACP: restore PointAgent reservations.
                try {
                    PointAgent.getInstance().importReservations(sessionState.cacpReservations || []);
                } catch (e) {
                    console.warn('[CACP] Failed to restore reservations:', e);
                }

                // CACP: restore Project Knowledge Base facts so every agent re-opens with
                // the same shared memory the session was saved with.
                try {
                    if (Array.isArray(sessionState.knowledgeFacts)) {
                        knowledgeBase.importFacts(sessionState.knowledgeFacts as any);
                        console.log('[KB] Restored', sessionState.knowledgeFacts.length, 'knowledge facts from session.');
                    }
                } catch (e) {
                    console.warn('[KB] Failed to restore knowledge facts:', e);
                }
                
                setError(null);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to parse session file.';
                console.error('[handleLoadSession] Failed to load .lsvz session file:', err);
                setError(`Load Error: ${errorMessage}`);
                handleReset();
            } finally {
                setIsSessionLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
  }, [handleReset, isDesktop]);

  useEffect(() => {
    if (activeAgent === AgentType.CENTERLINE_STATIONING && centerlines.length > 0 && isSessionActive) {
        const cl = centerlines[0];
        if (cl.pis.length < 2) {
             setPointLists(prevLists => {
                const workingListIndex = prevLists.findIndex(l => l.id === 'working');
                if (workingListIndex === -1) return prevLists;
                const newLists = [...prevLists];
                // CACP: identify CL/PI markers by description, not by PN format.
                newLists[workingListIndex].points = newLists[workingListIndex].points.filter(
                    p => p.description !== 'CL' && p.description !== 'PI' && !p.pointNumber.includes('+')
                );
                return newLists;
            });
            return;
        };

        const newPoints: SurveyPoint[] = [];
        cl.pis.forEach(pi => {
            newPoints.push({
                pointNumber: pi.pointNumber,
                northing: pi.northing,
                easting: pi.easting,
                elevation: 0,
                description: 'PI'
            });
        });

        const totalLength = calculateCenterlineLength(cl);
        // CACP: collect stations first, batch-issue PNs from PointAgent so the
        // station value lives in the description only.
        const clStations: { station: number; coords: { northing: number; easting: number } }[] = [];
        let currentStation = Math.ceil(cl.beginStation / 100) * 100;
        while (currentStation < cl.beginStation + totalLength) {
            const coords = calculatePointFromStationOffset(cl, currentStation, 0);
            if (coords) clStations.push({ station: currentStation, coords });
            currentStation += 100;
        }
        const clAgent = PointAgent.getInstance();
        clAgent.setLabelingSettings(settings.pointLabelingSettings);
        clAgent.setAvailablePoints(pointLists.flatMap(l => l.points));
        const clNumbers = clAgent.getNextNumbers(clStations.length);
        clStations.forEach((entry, idx) => {
            newPoints.push({
                pointNumber: clNumbers[idx],
                northing: entry.coords.northing,
                easting: entry.coords.easting,
                elevation: 0,
                description: `CL STA ${formatStation(entry.station)}`,
            });
        });
        
        setPointLists(prevLists => {
            const workingListIndex = prevLists.findIndex(l => l.id === 'working');
            const workingList = workingListIndex !== -1 ? prevLists[workingListIndex] : { id: 'working', name: 'Unsaved Points', points: [], isVisible: true };
            
            // CACP: identify CL/PI markers by description, not by PN pattern.
            const nonClPoints = workingList.points.filter(p => p.description !== 'PI' && p.description !== 'CL' && !(p.description || '').startsWith('CL STA '));

            const otherListsPointNumbers = new Set(prevLists.filter(l => l.id !== 'working').flatMap(l => l.points).map(p => p.pointNumber));
            const existingNonClPointNumbers = new Set([...nonClPoints.map(p => p.pointNumber), ...otherListsPointNumbers]);
            
            const filteredNewPoints = newPoints.filter(p => !existingNonClPointNumbers.has(p.pointNumber));
            
            const updatedWorkingList = { ...workingList, points: [...nonClPoints, ...filteredNewPoints] };

            if (workingListIndex !== -1) {
                const newLists = [...prevLists];
                newLists[workingListIndex] = updatedWorkingList;
                return newLists;
            } else {
                return [...prevLists, updatedWorkingList];
            }
        });
    }
  }, [centerlines, activeAgent, isSessionActive]);

  const initializeLsvzAgent = useCallback(() => {
    try {
        // FIX: Add contouringChatHistory, profileChatHistory and contourLabels to the session context for the LSVZ agent to resolve TypeScript errors.
        const currentSessionForAgent: Omit<SessionState, 'version' | 'savedAt'> = {
            rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, generatedFiles, jobInfo, settings, rawChatHistory, deedChatHistory, civilDrafterChatHistory, dxfChatHistory,
            stationingChatHistory, pointEditorChatHistory, fieldbookChatHistory: fieldbookLog, gpsStakeoutChatHistory, lsvzChatHistory, cogoChatHistory, rinexChatHistory, zoningChatHistory,
            planExpertChatHistory: planExpertChatHistory || [], imageAnalyzerChatHistory, gisChatHistory, contouringChatHistory, profileChatHistory, fieldbookNotes, pointLists, lines, contourLabels, centerlines, cutSheetData, cutSheetInfo,
            // FIX: Add profile data and info to LSVZ agent context.
            profileData, profileInfo, closureReports,
            gisFeatures, // Added gisFeatures
            pdfViewerFiles, pdfHighlights: highlights, offlineMapAreas,
            wmsServices, activeWmsLayers,
            customSymbols,
            uiState: {symbolScale, 
                activeAgent: AgentType.LSVZ_AGENT, activeModel, activeVisualPanel, isPdfViewerFullscreen, isVisualPanelFullscreen, attributeScale, lineLabelScale, dimensionScale, pointLayers, activeTextEditorFile,
                isPointEditorFullscreen: false, isChatPanelVisible, linesVisible, centerlinesVisible
            }
        };
        const { lsvzChatHistory: _, ...sessionForContext } = currentSessionForAgent;
        let finalContext = getSummarizedLsvzContext(sessionForContext);
        
        // Phase 2 & 3: Adaptive context loading based on project size
        const pointCount = pointLists.length;
        
        if (pointCount > 1000) {
          // Phase 3: Vector search / RAG for unlimited context
          finalContext += '\n\n[SYSTEM: Vector Search / RAG enabled. For large projects, use semantic search for detailed analysis.]';
        } else if (pointCount > 500) {
          // Phase 2: Cloud-based BigQuery context available
          finalContext += '\n\n[SYSTEM: Cloud context service available for enhanced analysis.]';
        }
        
        const newChat = startChatWithOverride(AgentType.LSVZ_AGENT, finalContext);
        setLsvzChat(newChat);
        if (lsvzChatHistory.length === 0) {
             setLsvzChatHistory([{ role: MessageRole.MODEL, text: 'LSVZ Meta-Agent initialized. Ask me anything about this project.' }]);
        }
        setInitializedAgents(prev => new Set(prev).add(AgentType.LSVZ_AGENT));
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize LSVZ agent.';
        setError(`Initialization Error: ${errorMessage}`);
    }
  }, [
    rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, generatedFiles, jobInfo, settings, rawChatHistory, deedChatHistory, civilDrafterChatHistory, dxfChatHistory, stationingChatHistory, pointEditorChatHistory,
    fieldbookLog, gpsStakeoutChatHistory, lsvzChatHistory, planExpertChatHistory, imageAnalyzerChatHistory, gisChatHistory, contouringChatHistory, profileChatHistory, fieldbookNotes, pointLists, lines, centerlines,
    cutSheetData, cutSheetInfo, activeModel, activeVisualPanel, isPdfViewerFullscreen, pdfViewerFiles, highlights, offlineMapAreas, customSymbols,
    isVisualPanelFullscreen, attributeScale, lineLabelScale, pointLayers, activeTextEditorFile, isChatPanelVisible, linesVisible, centerlinesVisible,
    profileData, profileInfo, closureReports, startChatWithOverride,
  ]);

  useEffect(() => {
    if (activeAgent === AgentType.LSVZ_AGENT && !initializedAgents.has(AgentType.LSVZ_AGENT) && isSessionActive) {
        // LSVZ Agent is a premium feature
        if (!settings.userApiKey) {
            setApiKeyModalTrigger('lsvz');
            setShowApiKeyModal(true);
            setActiveAgent(null);
            return;
        }
        initializeLsvzAgent();
    }
  }, [activeAgent, initializedAgents, isSessionActive, initializeLsvzAgent, settings.userApiKey]);

  // Check GNSS agent on initial session start to show API key dialog once
  useEffect(() => {
    if (activeAgent === AgentType.GNSS_AGENT && isSessionActive && !initializedAgents.has(AgentType.GNSS_AGENT)) {
        // GNSS (RINEX) Agent is a premium feature
        // Show dialog only once when session starts, but allow viewing tools while dialog is being handled
        if (!settings.userApiKey && !hasConfirmedApiKey) {
            setApiKeyModalTrigger('rinex');
            setShowApiKeyModal(true);
            // Don't clear the agent - let user see it while handling the dialog
            return;
        }
    }
  }, [activeAgent, isSessionActive, initializedAgents, settings.userApiKey, hasConfirmedApiKey]);

  useEffect(() => {
    if (activeAgent === AgentType.AR_AGENT && !initializedAgents.has(AgentType.AR_AGENT) && isSessionActive) {
        initializeARAgent();
    }
  }, [activeAgent, initializedAgents, isSessionActive, initializeARAgent]);

  const handleStakeoutPoint = useCallback((pointNumber: string) => {
    setStakeoutTargetPointNumber(pointNumber);
    showView('gpsstakeout');
  }, [showView]);

  const handleZoomToPoint = useCallback((point: SurveyPoint) => {
    setZoomTarget(point);
    showView('canvas');
  }, [showView]);

  const handleZoomComplete = useCallback(() => {
    setZoomTarget(null);
  }, []);

  const handleARMenuAction = useCallback((action: string, point: SurveyPoint) => {
    switch (action) {
      case 'stake':
      case 'stakeout':
        // Trigger stakeout mode for the selected point
        setStakeoutTargetPointNumber(point.pointNumber);
        showView('gpsstakeout');
        break;
      case 'details':
        // Show point details in a notification or panel
        console.log('Point details:', point);
        // Could show a toast or details panel
        break;
      case 'edit':
        // Navigate to point editor with this point selected
        setActiveAgent(AgentType.POINT_EDITOR);
        break;
      default:
        console.log('AR action:', action, 'for point:', point.pointNumber);
    }
  }, [showView, setActiveAgent]);

   const handleConnectWms = useCallback(async (url: string) => {
    if (wmsServices.some(s => s.url === url)) {
        setError('This WMS service has already been added.');
        setTimeout(() => setError(null), 3000);
        return;
    }
    try {
        const service = await fetchWmsCapabilities(url);
        setWmsServices(prev => [...prev, service]);
        logActionToFieldbook(`Connected to WMS service: ${service.title}`);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`WMS Error: ${errorMessage}`);
    }
  }, [wmsServices, logActionToFieldbook]);

  const handleToggleWmsLayer = useCallback((serviceUrl: string, layerName: string, isVisible: boolean) => {
    setActiveWmsLayers(prev => {
      const existingLayerIndex = prev.findIndex(l => l.serviceUrl === serviceUrl && l.layerName === layerName);
      if (existingLayerIndex > -1) {
        const updated = [...prev];
        updated[existingLayerIndex].isVisible = isVisible;
        return updated;
      } else if (isVisible) {
        return [...prev, { serviceUrl, layerName, isVisible: true, opacity: 0.7 }];
      }
      return prev;
    });
  }, []);

  const handleUpdateWmsLayer = useCallback((serviceUrl: string, layerName: string, updates: Partial<ActiveWmsLayer>) => {
    setActiveWmsLayers(prev => prev.map(l => (l.serviceUrl === serviceUrl && l.layerName === layerName) ? { ...l, ...updates } : l));
  }, []);

  const handleRemoveWmsService = useCallback((serviceUrl: string) => {
    setWmsServices(prev => prev.filter(s => s.url !== serviceUrl));
    setActiveWmsLayers(prev => prev.filter(l => l.serviceUrl !== serviceUrl));
  }, []);

  const handleDownloadMapArea = useCallback(async (name: string, centerPointNumber: string, radius: number) => {
    setIsLoading(true); // Can use a more specific loader later
    setError(null);
    try {
        const centerPoint = points.find(p => p.pointNumber === centerPointNumber);
        if (!centerPoint) throw new Error(`Point number "${centerPointNumber}" not found.`);
        if (radius <= 0) throw new Error("Radius must be a positive number.");
        if (!settings.projection.epsg) throw new Error("A State Plane projection must be set in Settings to download map areas.");

        const bbox: [number, number, number, number] = [
            centerPoint.easting - radius,
            centerPoint.northing - radius,
            centerPoint.easting + radius,
            centerPoint.northing + radius
        ];

        const resolution = 2048; // Fixed resolution for simplicity

        const layersToDownload = activeWmsLayers.filter(l => l.isVisible);
        if (layersToDownload.length === 0) {
            throw new Error("No WMS layers are currently visible to download.");
        }

        const downloadedLayersPromises = layersToDownload.map(async (activeLayer) => {
            const service = wmsServices.find(s => s.url === activeLayer.serviceUrl);
            if (!service) return null;

            const wmsUrl = new URL(service.url);
            wmsUrl.searchParams.set('service', 'WMS');
            wmsUrl.searchParams.set('request', 'GetMap');
            wmsUrl.searchParams.set('layers', activeLayer.layerName);
            wmsUrl.searchParams.set('styles', '');
            wmsUrl.searchParams.set('version', '1.3.0');
            wmsUrl.searchParams.set('width', resolution.toString());
            wmsUrl.searchParams.set('height', resolution.toString());
            wmsUrl.searchParams.set('crs', `EPSG:${settings.projection.epsg}`);
            wmsUrl.searchParams.set('bbox', bbox.join(','));
            wmsUrl.searchParams.set('format', 'image/png');
            wmsUrl.searchParams.set('transparent', 'true');

            const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(wmsUrl.toString())}`;

            const response = await fetch(proxiedUrl);
            if (!response.ok) throw new Error(`Failed to fetch map from ${service.title}`);

            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) {
                const errorText = await blob.text();
                console.error(`WMS service returned non-image content for ${service.title}:`, errorText);
                throw new Error(`WMS service "${service.title}" did not return a valid image.`);
            }
            
            const imageData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            return {
                serviceUrl: activeLayer.serviceUrl,
                layerName: activeLayer.layerName,
                opacity: activeLayer.opacity,
                imageData: imageData,
            };
        });

        const downloadedLayers = (await Promise.all(downloadedLayersPromises)).filter((l): l is NonNullable<typeof l> => l !== null);
        
        // FIX: Added the missing `isVisible` property to the new OfflineMapArea object to match the type definition.
        const newArea: OfflineMapArea = {
            id: Date.now().toString(),
            name,
            bbox,
            width: radius * 2,
            height: radius * 2,
            layers: downloadedLayers,
            isVisible: true,
        };

        setOfflineMapAreas(prev => [...prev, newArea]);
        logActionToFieldbook(`Downloaded offline map area "${name}".`);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Offline Map Error: ${errorMessage}`);
        setTimeout(() => setError(null), 5000);
    } finally {
        setIsLoading(false);
    }
  }, [points, activeWmsLayers, wmsServices, settings.projection.epsg, logActionToFieldbook]);

  const handleDeleteOfflineMapArea = useCallback((id: string) => {
      setOfflineMapAreas(prev => prev.filter(area => area.id !== id));
      logActionToFieldbook(`Deleted offline map area.`);
  }, [logActionToFieldbook]);

  const handleFieldbookAction = useCallback((action: ChatMessageAction) => {
      if (!action) return;
      switch (action.type) {
          case 'VIEW_UNCERTAINTIES': {
              const allSearchablePDFFiles: SessionFile[] = [
                  ...(deedFile ? [deedFile] : []),
                  ...(planFiles || []),
              ];
              if (allSearchablePDFFiles.length > 0) {
                  setPdfViewerFiles(allSearchablePDFFiles);
                  showView('pdfviewer');
                  if (action.payload?.highlightIds?.length > 0) {
                    goToHighlight(action.payload.highlightIds[0]);
                  }
              }
              break;
          }
          default:
              break;
      }
  }, [showView, deedFile, planFiles, goToHighlight]);

  const handleExportToNotion = useCallback(async () => {
    if (!settings.notion?.enabled || !settings.notion?.accessToken) {
      setError('Notion integration is not configured. Please connect Notion in Settings.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      // For now, show a simple prompt for database ID
      // In the future, we can add a database selector in settings
      const databaseId = settings.notion.databaseId || prompt('Enter Notion Database ID:\n\nYou can find this in the URL of your database page.');
      
      if (!databaseId) return;

      // Collect fieldbook entries
      const entries = [
        '=== MANUAL FIELD NOTES ===',
        fieldbookNotes || '(No manual notes)',
        '',
        '=== CHRONOLOGICAL LOG ===',
        ...fieldbookLog
          .filter(msg => msg.role === MessageRole.MODEL)
          .map((msg, idx) => `${idx + 1}. ${msg.text}`)
      ];

      // Dynamic import to avoid loading service unless needed
      const { exportFieldbookToNotion } = await import('./services/notionService');
      
      const result = await exportFieldbookToNotion(
        settings.notion.accessToken,
        databaseId,
        jobInfo.jobName,
        entries
      );

      if (result) {
        logActionToFieldbook(`Exported fieldbook to Notion: ${result.url}`);
        setSettings(prev => ({
          ...prev,
          notion: {
            ...prev.notion!,
            databaseId,
            lastSync: new Date().toISOString(),
          }
        }));
        alert(`Successfully exported to Notion!\n\nPage: ${result.title}\nURL: ${result.url}`);
      } else {
        throw new Error('Failed to create Notion page');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Notion Export Error: ${errorMessage}`);
      setTimeout(() => setError(null), 5000);
    }
  }, [settings, fieldbookNotes, fieldbookLog, jobInfo, logActionToFieldbook, setSettings, setError]);

  const handleAddSymbol = useCallback((symbol: CustomSymbol) => {
    setCustomSymbols(prev => [...prev, symbol]);
    logActionToFieldbook(`Created new symbol: "${symbol.name}"`);
  }, [logActionToFieldbook]);

  const handleUpdateSymbol = useCallback((updatedSymbol: CustomSymbol) => {
    setCustomSymbols(prev => prev.map(s => s.id === updatedSymbol.id ? updatedSymbol : s));
    logActionToFieldbook(`Updated symbol: "${updatedSymbol.name}"`);
  }, [logActionToFieldbook]);

  const handleDeleteSymbol = useCallback((symbolId: string) => {
    const symbolToDelete = customSymbols.find(s => s.id === symbolId);
    if (symbolToDelete?.isDefault) {
        setError("The default symbol cannot be deleted.");
        setTimeout(() => setError(null), 3000);
        return;
    }
    setCustomSymbols(prev => prev.filter(s => s.id !== symbolId));
    if (symbolToDelete) {
        logActionToFieldbook(`Deleted symbol: "${symbolToDelete.name}"`);
    }
  }, [customSymbols, logActionToFieldbook]);

  const handleAddAnnotationRule = useCallback((rule: AnnotationRule) => {
    setCustomAnnotations(prev => [...prev, rule]);
    logActionToFieldbook(`Created annotation rule: "${rule.name}"`);
  }, [logActionToFieldbook, setCustomAnnotations]);

  const handleUpdateAnnotationRule = useCallback((rule: AnnotationRule) => {
    setCustomAnnotations(prev => prev.map(r => r.id === rule.id ? rule : r));
    logActionToFieldbook(`Updated annotation rule: "${rule.name}"`);
  }, [logActionToFieldbook, setCustomAnnotations]);

  const handleDeleteAnnotationRule = useCallback((ruleId: string) => {
    const ruleToDelete = customAnnotations.find(r => r.id === ruleId);
    setCustomAnnotations(prev => prev.filter(r => r.id !== ruleId));
    if (ruleToDelete) logActionToFieldbook(`Deleted annotation rule: "${ruleToDelete.name}"`);
  }, [customAnnotations, logActionToFieldbook, setCustomAnnotations]);
  
  const showDoc = useCallback(() => setIsDocVisible(true), []);
  const showTech = useCallback(() => setIsTechPageVisible(true), []);
  const showCivil3D = useCallback(() => setIsCivil3DPageVisible(true), []);
  const showInvestorForm = useCallback(() => setIsInvestorFormVisible(true), []);
  const showReleaseLog = useCallback(() => setIsReleaseLogVisible(true), []);
  const showSettings = useCallback(() => {
    setIsSettingsVisible(true);
    setPulseProjection(true);
    setTimeout(() => setPulseProjection(false), 3000); // Stop pulsing after 3 seconds
  }, []);
  const showAbout = useCallback(() => setIsAboutVisible(true), []);
  const showForwardThinking = useCallback(() => setIsForwardThinkingVisible(true), []);
  const showDisclaimer = useCallback(() => setIsDisclaimerVisible(true), []);
  const showLegal = useCallback(() => setIsLegalPageVisible(true), []);
  const showReleaseStages = useCallback(() => setIsReleaseStagesModalVisible(true), []);

  const currentChatHistory = 
    activeAgent === AgentType.RAW_CRAWLER ? rawChatHistory : 
    activeAgent === AgentType.CIVIL_DRAFTER ? civilDrafterChatHistory :
    activeAgent === AgentType.DEED_READER ? deedChatHistory : 
    activeAgent === AgentType.CIVIL_PLAN_EXPERT ? planExpertChatHistory :
    activeAgent === AgentType.DXF_ANALYZER ? dxfChatHistory :
    activeAgent === AgentType.IMAGE_ANALYZER ? imageAnalyzerChatHistory :
    activeAgent === AgentType.GIS_AGENT ? gisChatHistory :
    activeAgent === AgentType.CENTERLINE_STATIONING ? stationingChatHistory : 
    activeAgent === AgentType.POINT_EDITOR ? pointEditorChatHistory : 
    activeAgent === AgentType.LSVZ_AGENT ? lsvzChatHistory : 
    // FIX: Add case for Contouring Agent to display its chat history.
    activeAgent === AgentType.CONTOURING_AGENT ? contouringChatHistory :
    activeAgent === AgentType.STEEP_SLOPE_AGENT ? steepSlopeChatHistory :
    // FIX: Add case for Profile Agent to display its chat history.
    activeAgent === AgentType.PROFILE_AGENT ? profileChatHistory :
    activeAgent === AgentType.COGO_AGENT ? cogoChatHistory :
    activeAgent === AgentType.GNSS_AGENT ? rinexChatHistory :
    activeAgent === AgentType.DRONE_AGENT ? droneChatHistory :
    activeAgent === AgentType.AR_AGENT ? arChatHistory :
    activeAgent === AgentType.ZONING_AGENT ? zoningChatHistory :
    activeAgent === AgentType.TITLE_SEARCH ? titleSearchChatHistory :
    activeAgent === AgentType.CAD_MANAGER ? cadManagerChatHistory :
    activeAgent === AgentType.STANDARDS_COMPLIANCE ? standardsComplianceChatHistory :
    gpsStakeoutChatHistory;
  
  // DEBUG: Log chat history and agent
  useEffect(() => {
    console.log('[App] activeAgent:', activeAgent, 'currentChatHistory.length:', currentChatHistory?.length);
  }, [activeAgent, currentChatHistory]);
  
  // DEBUG: Log zoning chat history changes
  useEffect(() => {
    if (activeAgent === AgentType.ZONING_AGENT) {
      console.log('[App] zoningChatHistory updated. Length:', zoningChatHistory.length, 'Last message:', zoningChatHistory[zoningChatHistory.length - 1]);
      
      // Auto-scroll to show latest messages
      setTimeout(() => {
        const resultsArea = document.getElementById('zoning-results-area');
        if (resultsArea) {
          resultsArea.scrollTop = 0; // Scroll to top to see latest messages
        }
      }, 100);
    }
  }, [zoningChatHistory, activeAgent]);
  
  const currentFileName = useMemo(() => {
    if (activeVisualPanel === 'texteditor') {
        return activeTextEditorFile || 'Text Editor';
    }
    const agent = agentConfig[activeAgent];
    if (agent) {
        switch (activeAgent) {
            case AgentType.RAW_CRAWLER: return rawFile?.name || 'No file';
            case AgentType.DEED_READER: return deedFile?.name || 'No file';
            case AgentType.CIVIL_PLAN_EXPERT: return planFiles && planFiles.length > 0 ? `${planFiles.length} Plan(s)` : 'No plans';
            case AgentType.DXF_ANALYZER: return dxfFile?.name || 'No file';
            case AgentType.GIS_AGENT: return gisFile?.name || 'No file';
            case AgentType.IMAGE_ANALYZER: return imageFiles && imageFiles.length > 0 ? `${imageFiles.length} Image(s)` : 'No images';
            case AgentType.CENTERLINE_STATIONING: return centerlines[0]?.name || clFile?.name || 'New Centerline';
            case AgentType.LSVZ_AGENT: return jobInfo.jobName && jobInfo.jobName !== 'Project Name' ? jobInfo.jobName : '.lsvz Session';
            case AgentType.ZONING_AGENT: return zoningPlace && zoningState ? `${zoningPlace}, ${zoningState}` : 'Zoning Research';
            case AgentType.TITLE_SEARCH: return titleSearchData.propertyAddress || 'Title Search';
            case AgentType.STANDARDS_COMPLIANCE: return standardsComplianceSubjectFile?.name || 'Standards Compliance';
            default: return agent.label;
        }
    }
    return 'No file';
  }, [activeAgent, activeVisualPanel, rawFile, deedFile, planFiles, dxfFile, clFile, gisFile, imageFiles, centerlines, activeTextEditorFile, jobInfo.jobName, standardsComplianceSubjectFile]);

  const relevantFilesForAgent = useMemo(() => {
    const allFiles: SessionFile[] = [
        rawFile, deedFile, dxfFile, clFile, gisFile,
        ...generatedFiles,
    ].filter((f): f is SessionFile => f !== null);

    let files: SessionFile[] = [];
    switch (activeAgent) {
        case AgentType.RAW_CRAWLER:
            files = allFiles.filter(f => f.name.toLowerCase().endsWith('.raw'));
            break;
        case AgentType.DEED_READER:
            files = [deedFile, ...generatedFiles.filter(f => f.name.startsWith('(Archived)'))].filter((f): f is SessionFile => f !== null);
            break;
        case AgentType.DXF_ANALYZER:
             files = allFiles.filter(f => f.name.toLowerCase().endsWith('.dxf'));
             break;
        case AgentType.GIS_AGENT:
             files = allFiles.filter(f => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'));
             break;
        case AgentType.CENTERLINE_STATIONING:
             files = allFiles.filter(f => f.name.toLowerCase().endsWith('.cl'));
             break;
        default:
            return [];
    }
    // De-duplicate and ensure the active file is first if it exists
    const fileMap = new Map(files.map(item => [item.name, item]));
    const uniqueFiles = Array.from(fileMap.values());
    const activeFileName = (
        activeAgent === AgentType.RAW_CRAWLER ? rawFile?.name :
        activeAgent === AgentType.DEED_READER ? deedFile?.name :
        activeAgent === AgentType.DXF_ANALYZER ? dxfFile?.name :
        activeAgent === AgentType.GIS_AGENT ? gisFile?.name :
        activeAgent === AgentType.CENTERLINE_STATIONING ? clFile?.name : null
    );
    const activeFile = uniqueFiles.find(f => f.name === activeFileName);
    if (activeFile) {
        return [activeFile, ...uniqueFiles.filter(f => f.name !== activeFileName)];
    }
    return uniqueFiles;

  }, [activeAgent, rawFile, deedFile, dxfFile, clFile, gisFile, generatedFiles]);


  const activeAccent = agentConfig[activeAgent]?.color ? `accent-${agentConfig[activeAgent].color}-500` : 'accent-slate-500';
  const canSwitchFiles = relevantFilesForAgent.length > 1;
  const color = agentConfig[activeAgent]?.color || 'slate';
  const hexColor = agentThemeColors[activeAgent] || '#94a3b8';
  const rgbColor = hexToRgb(hexColor);
  const ActiveAgentIcon = agentIcons[activeAgent] || ChatBubbleIcon;

  // FIX: Added default file name logic for DXF export modal.
  const defaultFileNameBase = (
    jobInfo.jobName && jobInfo.jobName !== 'Project Name'
      ? jobInfo.jobName
      : rawFile?.name || deedFile?.name || centerlines[0]?.name || 'landsurvai_export'
  ).replace(/\.[^/.]+$/, "").replace(/[^a-z0-9._-]/gi, '_');

  // App-wide notifications surfaced via the header NotificationCenter. New
  // sources should append entries here rather than adding another header
  // button. Must live above any conditional early-return to satisfy the
  // Rules of Hooks.
  const headerNotifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];

    if (highlights.length > 0) {
      list.push({
        id: 'pdf-uncertainties',
        kind: 'pdf-uncertainties',
        severity: 'warning',
        title: 'AI uncertainties to review',
        message: `${highlights.length} flagged region${highlights.length === 1 ? '' : 's'} across your PDFs. Click to open the PDF Reviewer.`,
        count: highlights.length,
        onActivate: () => {
          const allSearchablePDFFiles: SessionFile[] = [
            ...(deedFile ? [deedFile] : []),
            ...(planFiles || []),
          ];
          if (allSearchablePDFFiles.length > 0) {
            setPdfViewerFiles(allSearchablePDFFiles);
            showView('pdfviewer');
          }
        },
      });
    }

    // Context-driven notifications (map imagery, GPS, agents, etc.) raised via
    // AppStateContext.addNotification. Appended so they surface in the header
    // bell alongside derived entries.
    for (const n of appNotifications) {
      list.push(n);
    }

    return list;
  }, [highlights, deedFile, planFiles, setPdfViewerFiles, showView, appNotifications]);

  if (pageMode === null) {
    return null; // Or a loading spinner
  }
  
  if (pageMode === 'xml_sitemap') {
      const xmlContent = generateSitemapXml();
      // Return XML as plain text/html with meta tag to indicate it's XML
      // For SPAs, we can't truly serve application/xml from the client without a backend
      // but we can render it cleanly so crawlers can parse it
      return (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e5e7eb', backgroundColor: '#111827', margin: 0, padding: '1rem', height: '100vh', fontFamily: 'monospace', fontSize: '12px', overflow: 'auto' }}>
          {xmlContent}
        </div>
      );
  }

  // Checkout pages (payment success/cancel)
  if (isCheckoutPage) {
    return checkoutPage;
  }

  if (pageMode === 'landing' && landingContent) {
    // Handle full-page components (like RINEX) - use type assertion for component property
    const landingContentWithComponent = landingContent as any;
    if (landingContentWithComponent.component && landingContentWithComponent.isFullPage) {
      const ComponentPage = landingContentWithComponent.component;
      return (
        <div className="flex flex-col min-h-screen">
          <EnvironmentBanner />
          <ComponentPage />
        </div>
      );
    }
    
    // Handle content wrapper components
    const ContentComponent = landingContent.content;
    return (
        <Suspense fallback={<LoadingFallback />}>
        <div className="flex flex-col min-h-screen">
          <EnvironmentBanner />
          <LandingPage title={landingContent.title}>
              <ContentComponent activeAgent={AgentType.RAW_CRAWLER} />
          </LandingPage>
        </div>
        </Suspense>
    );
  }


  
  const chatHeaderControls = (
    <>
      <CacpBadge agent={activeAgent} onClick={(a) => setCacpManifestAgent(a)} />
      {activeAgent === AgentType.CIVIL_DRAFTER && isCurrentAgentInitialized && (
        <button
          onClick={() => setShowCivilDrafterContextPanel(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-200 ${showCivilDrafterContextPanel ? 'bg-fuchsia-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-white'} light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:hover:bg-gray-300`}
          title="Context settings � control how much conversation the Civil Drafter carries between requests (fixes 'input exceeds maximum tokens' after several draws)"
        >
          <AdjustmentsHorizontalIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Context</span>
        </button>
      )}
      {canSwitchFiles && (
        <div className="relative">
          <select
            value={currentFileName}
            onChange={(e) => handleFileSwitch(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs font-semibold rounded-md pl-3 pr-8 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-white/50 max-w-[120px] sm:max-w-xs appearance-none light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:border-gray-300"
            title="Switch active file for this agent"
          >
            {relevantFilesForAgent.map(file => (
              <option key={file.name} value={file.name}>
                {file.name.replace(/^\(Archived\)\s*/, '')}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      )}
      {isCurrentAgentInitialized && addDataButtonLabels[activeAgent] && (
        <button
          onClick={() => setIsAddingData(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-200 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-white light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:hover:bg-gray-300"
          title={addDataButtonLabels[activeAgent]}
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          <span className="hidden sm:inline">{addDataButtonLabels[activeAgent]?.replace('...', '')}</span>
        </button>
      )}
    </>
  );

  // ============================================================================
  // REFACTORING: Removed FileStateProvider from here - now in App wrapper
  // ============================================================================
  return (
      <SettingsContext.Provider value={{ settings, setSettings }}>
        <AgentContext.Provider value={{ activeAgent, onAgentChange: handleAgentChange }}>
          <UIContext.Provider value={{ 
          isChatPanelVisible, 
          toggleChatPanel, 
          activeVisualPanel, 
          showView,
          showDoc,
          showTech,
          showInvestorForm,
          showReleaseLog,
          showSettings,
          showAbout,
          showDisclaimer,
          showLegal
        }}>
        <HighlightContext.Provider value={{ highlights, addHighlights, clearHighlights, goToHighlight, zoomTargetHighlightId }}>
        <div className="h-[var(--app-height,100dvh)] bg-gray-900 text-gray-100 flex flex-col font-sans light-theme:bg-gray-100 light-theme:text-gray-900 overflow-hidden">
          <EnvironmentBanner />
          <div className="flex flex-1 min-h-0 relative">
          <NotificationScopeMarker />
          {!isInitialScreen && <Sidebar 
            isSessionActive={isSessionActive}
            onSaveSession={handleOpenSaveSessionModal}
            onLoadSession={handleLoadSession}
            hasPdfFiles={(planFiles && planFiles.length > 0) || !!deedFile?.fileData}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            isDesktop={isDesktop}
            jobInfo={jobInfo}
            setJobInfo={setJobInfo}
            isLoading={isLoading}
            onConnectC3D={() => setShowC3DConnectPanel(true)}
            isC3DConnected={isC3DConnected}
            c3dClientVersion={c3dClientVersion}
            c3dSessionToken={c3dSessionToken}
            onShowC3DDebug={() => setShowC3DDebugDialog(true)}
            currentModelName={currentModelName}
            isAutoRouting={!agentModelOverrides[activeAgent] && activeModel === AUTO_MODEL_OPTION}
            onModelClick={openContextAwareModelSettings}
            availableModels={visibleAvailableModels}
            onModelSelect={(model) => {
              if (model === AUTO_MODEL_OPTION) {
                setAgentModelOverrides(prev => {
                  const next = { ...prev };
                  delete next[activeAgent];
                  return next;
                });
                return;
              }
              const normalizedModel = normalizeSelectedModel(model);
              if (!confirmFableSelection(normalizedModel)) return;
              setAgentModelOverrides(prev => ({...prev, [activeAgent]: normalizedModel}));
            }}
            showQuickModelSelector={showQuickModelSelector}
            setShowQuickModelSelector={setShowQuickModelSelector}
            autoHighThinkingModel={autoHighThinkingModel}
            autoHighThinkingOptions={visibleAutoHighThinkingOptions}
            onAutoHighThinkingModelChange={(model) => {
              if (!confirmFableSelection(model)) return;
              setAutoHighThinkingModel(model);
            }}
          />}
          
          <main ref={mainContentRef} className={`flex-1 flex flex-col min-w-0 h-full ${isVisualPanelFullscreen ? 'absolute inset-0 z-20' : ''}`}>
             {isCivil3DPageVisible ? (
              <div className="flex-grow min-h-0 bg-gray-900">
                <Suspense fallback={<LoadingFallback />}><ConnectorDownloadPage onClose={() => setIsCivil3DPageVisible(false)} /></Suspense>
              </div>
            ) : isInitialScreen || showUploadScreen ? (
              <div className="flex-grow min-h-0 bg-gray-900">
                {isInitialScreen ? (
                   <InitialAgentSelection 
                        onSelectAgent={handleAgentChange} 
                        onLoadSession={handleLoadSession}
                        onShowDoc={showDoc}
                        onShowReleaseLog={showReleaseLog}
                        onShowTech={showTech}
                        onShowInvestor={showInvestorForm}
                        onShowAbout={showAbout}
                        onShowCivil3D={showCivil3D}
                        onShowC3DConnect={() => isC3DConnected ? setShowC3DDebugDialog(true) : setShowC3DConnectPanel(true)}
                        onShowReleaseStages={showReleaseStages}
                        isC3DConnected={isC3DConnected}
                        hasApiKey={hasApiKey}
                        geolocationError={geolocationError}
                        currentPosition={currentPosition}
                        version={APP_VERSION}
                        onShowSettings={showSettings}
                        onShowLegal={showLegal}
                        jobInfo={jobInfo}
                        setJobInfo={setJobInfo}
                        hideRestrictedFeatures={isRestrictedApiKey}
                        onShowApiKeySettings={() => {
                          setApiKeyModalInitialTab('apikey');
                          setShowApiKeyModal(true);
                        }}
                        onShowUpgrade={() => {
                          setShowUpgradeModal(true);
                        }}
                        cadStandardsLoaded={cadStandardsLoaded}
                        onLoadPoints={() => {
                          // Don't queue any auto-open or session-start work until
                          // the legal gate is cleared, otherwise the deferred
                          // setTimeout can advance state behind the modal.
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          setAutoOpenPointUpload(true);
                          handleAgentChange(AgentType.POINT_EDITOR);
                        }}
                        onOpenBoundaryEditor={() => {
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          handleAgentChange(AgentType.DEED_READER);
                          // Defer one tick so handleAgentChange's state updates settle
                          // before we open the Boundary Editor scratch session.
                          setTimeout(() => { handleDeedStartFromScratch(); }, 0);
                        }}
                        onOpenCadStandards={() => {
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          handleAgentChange(AgentType.CAD_MANAGER);
                        }}
                        onOpenGpsStakeout={() => {
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          initializeGpsStakeoutAgent();
                          setActiveAgent(AgentType.GPS_STAKEOUT);
                          setIsGpsStakeoutFloatingVisible(true);
                        }}
                        onOpenGpsCollect={() => {
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          initializeGpsStakeoutAgent();
                          setActiveAgent(AgentType.GPS_STAKEOUT);
                          setIsGpsCollectFloatingVisible(true);
                        }}
                        onOpenContouringFromGis={() => {
                          if (!hasLegalSignature && !hasSignedLegalAgreement()) {
                            setShowLegalGate(true);
                            return;
                          }
                          setContourAutoOpenGis(true);
                          setIsContourEsriPanelVisible(true);
                          setIsContourEsriMinimized(false);
                          handleAgentChange(AgentType.CONTOURING_AGENT);
                        }}
                        currentProjectionEpsg={settings.projection.epsg}
                        onShowClaudeSettings={() => setIsClaudeSettingsVisible(true)}
                        onProjectionSelect={(state, zoneName, epsg, proj4def) => {
                          try {
                            proj4.defs(`EPSG:${epsg}`, proj4def);
                          } catch { /* ignore */ }
                          setSettings(prev => ({
                            ...prev,
                            projection: { state, zoneName, epsg },
                          }));
                        }}
                    />
                ) : (
                  <>
                    {activeAgent === AgentType.RAW_CRAWLER && <FileUpload onFileUploaded={handleFileUploaded} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.CIVIL_DRAFTER && <CivilDrafterFileUpload onFileUploaded={handleCivilDrafterFileUploaded} onPdfUploaded={handleCivilDrafterPdfUploaded} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} existingPointCount={pointLists.reduce((sum, l) => sum + l.points.length, 0)} onUseExistingPoints={handleCivilDrafterUseExistingPoints} />}
                    {activeAgent === AgentType.DEED_READER && <DeedInput onDeedSubmitted={handleDeedSubmitted} onStartFromScratch={handleDeedStartFromScratch} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.CIVIL_PLAN_EXPERT && <PlanInput onPlansSubmitted={handlePlansSubmitted} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.DXF_ANALYZER && <DxfInput onDxfUploaded={handleDxfUploaded} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.GIS_AGENT && <GisInput onGisUploaded={handleGisUploaded} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} inclusionBoundaries={inclusionBoundaries} activeInclusionBoundaryId={activeInclusionBoundaryId} hasInclusionLines={lines.some((l: SurveyLine) => l.type === 'inclusion')} getInclusionBboxWgs84={getInclusionBboxWgs84} />}
                    {activeAgent === AgentType.ZONING_AGENT && <ZoningInput onZoningSearch={handleZoningSearch} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} jobInfo={jobInfo} />}
                    {activeAgent === AgentType.TITLE_SEARCH && <DeedInput onDeedSubmitted={handleTitleSearchDeedSubmitted} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Add More Deeds" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.STANDARDS_COMPLIANCE && <StandardsComplianceInput onSessionStart={handleStandardsComplianceSessionStart} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.IMAGE_ANALYZER && <ImageInput onImagesSubmitted={handleImagesSubmitted} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.CENTERLINE_STATIONING && <CenterlineInput onSessionStart={handleCenterlineSessionStart} onClFileUploaded={handleClFileUploaded} onGoBack={handleGoBackFromUpload} backButtonTitle={isAddingData ? "Cancel" : "Go to Home Screen"} />}
                    {activeAgent === AgentType.POINT_EDITOR && <PointEditorInput onSessionStart={handlePointEditorSessionStart} onPointsUploaded={handlePointsUploaded} onGoBack={handleGoBackFromUpload} autoOpenUpload={autoOpenPointUpload} onAutoOpenHandled={() => setAutoOpenPointUpload(false)} />}
                    {activeAgent === AgentType.CAD_MANAGER && <CadManagerInput onSessionStart={handleCadManagerSessionStart} onGoBack={handleGoBackFromUpload} />}
                  </>
                )}
              </div>
            ) : (
                <div className={`flex flex-1 min-h-0 ${!isDesktop && 'flex-col'}`}>
                    <div ref={visualPanelAndEditorContainerRef} className={`flex flex-col min-w-0 transition-all duration-300 ${isDesktop ? 'flex-1' : (isChatPanelVisible ? 'h-1/2' : 'h-full')}`}>
                        {/* Main Header Bar */}
                        <div className="relative z-[80] overflow-visible flex-shrink-0 flex items-center gap-2 p-2 h-[50px] bg-gray-900/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-white/40 light-theme:border-gray-300/30">
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 md:hidden"><Bars3Icon className="w-6 h-6"/></button>
                            {canGoBack && (
                                <button 
                                    onClick={handleNavigateBack} 
                                    className="p-2 rounded-full hover:bg-gray-700 text-cyan-400 transition-colors animate-pulse" 
                                    title="Go Back"
                                >
                                    <ChevronLeftIcon className="w-6 h-6"/>
                                </button>
                            )}
                            {activeVisualPanel !== 'canvas' && (
                                <button onClick={() => showView('canvas')} className="p-2 rounded-full hover:bg-gray-700 transition-colors animate-pulse" title="Return to Canvas"><MonitorIcon className="w-6 h-6 text-cyan-400"/></button>
                            )}
                            <button onClick={handleGoBackToInitialScreen} className="p-2 rounded-full hover:bg-gray-700 text-gray-300 transition-colors" title="Go to Home Screen"><HomeIcon className="w-6 h-6"/></button>
                            
                            
                            
                            {activeVisualPanel === 'canvas' && (
                                <>
                                    <button onClick={() => handleOpenDxfExportModal()} className="p-2 rounded-full hover:bg-gray-700 transition-colors flex items-center gap-1" title="Export DXF"><DownloadIcon className="w-5 h-5 text-gray-300"/><span className="text-xs font-medium text-gray-300">DXF</span></button>
                                    <button onClick={() => undo()} disabled={!canUndo} className={`p-2 rounded-full transition-colors ${canUndo ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`} title={canUndo && undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}><UndoIcon className="w-5 h-5 text-gray-300"/></button>
                                    <button onClick={() => redo()} disabled={!canRedo} className={`p-2 rounded-full transition-colors ${canRedo ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`} title={canRedo && redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}><RedoIcon className="w-5 h-5 text-gray-300"/></button>
                                    <button
                                        onClick={() => setIsHistoryPanelOpen(v => !v)}
                                        className={`p-2 rounded-full transition-colors text-xs font-medium ${isHistoryPanelOpen ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                                        title="Edit history � jump to any earlier state"
                                    >
                                        Hist
                                    </button>
                                    <button
                                        onClick={cycleAgentDrawMode}
                                        className={`p-2 rounded-full transition-colors flex items-center gap-1 text-xs font-medium ${agentDrawMode === 'points' ? 'bg-yellow-600 hover:bg-yellow-700' : agentDrawMode === 'lines' ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-gray-700'}`}
                                        title={`Agent draws: ${agentDrawMode === 'both' ? 'Points & Lines' : agentDrawMode === 'points' ? 'Points only' : 'Lines only'} � click to cycle`}
                                    >
                                        {agentDrawMode === 'both' && <><span>P</span><span className="text-gray-400">+</span><span>L</span></>}
                                        {agentDrawMode === 'points' && <span>P</span>}
                                        {agentDrawMode === 'lines' && <span>L</span>}
                                    </button>
                                    <button
                                        onClick={cycleAgentAnnotMode}
                                        className={`p-2 rounded-full transition-colors flex items-center gap-1 text-xs font-medium ${agentAnnotMode === 'bearing' ? 'bg-teal-600 hover:bg-teal-700' : agentAnnotMode === 'distance' ? 'bg-orange-600 hover:bg-orange-700' : 'hover:bg-gray-700'}`}
                                        title={`Line annotation: ${agentAnnotMode === 'both' ? 'Bearing & Distance' : agentAnnotMode === 'bearing' ? 'Bearing only' : 'Distance only'} � click to cycle`}
                                    >
                                        {agentAnnotMode === 'both' && <><span>B</span><span className="text-gray-400">+</span><span>D</span></>}
                                        {agentAnnotMode === 'bearing' && <span>B</span>}
                                        {agentAnnotMode === 'distance' && <span>D</span>}
                                    </button>
                                </>
                            )}
                            
                            <button onClick={() => setIsGridVisible(v => !v)} className={`p-2 rounded-full transition-colors ${isGridVisible ? 'bg-cyan-600 hover:bg-cyan-700' : 'hover:bg-gray-700'}`} title={isGridVisible ? 'Hide background grid' : 'Show background grid'}><GridIcon className={`w-6 h-6 ${isGridVisible ? 'text-white' : 'text-gray-400'}`}/></button>
                            <button
                                onClick={() => {
                                    setSettings(prev => ({
                                        ...prev,
                                        googleMaps: {
                                            ...prev.googleMaps,
                                            enabled: !prev.googleMaps?.enabled,
                                            ...(!prev.googleMaps?.enabled ? { mapType: 'naip' as const, scale: 2 } : {}),
                                        },
                                    }));
                                }}
                                className={`px-2.5 py-1 rounded text-xs font-bold font-mono transition-colors ${settings.googleMaps?.enabled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                                title={settings.googleMaps?.enabled ? 'Map Imagery: ON (Click to toggle)' : 'Map Imagery: OFF (Click to toggle)'}
                            >
                                MAP
                            </button>
                            {/* C3D Sync — mirror of the DLL connector: Sync button + active-drawing dropdown */}
                            {isC3DConnected && (
                                <div className="relative flex items-center">
                                    <span
                                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                                            c3dLiveSyncEnabled
                                                ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-500/50'
                                                : 'bg-gray-800 text-gray-400 border border-gray-700'
                                        }`}
                                        title={c3dLiveSyncEnabled
                                            ? 'Live sync is enabled by the Civil 3D connector'
                                            : 'Start Sync in the Civil 3D connector to enable live sync'}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${c3dLiveSyncEnabled ? 'bg-emerald-400' : 'bg-gray-500'}`}></span>
                                        <span>{c3dLiveSyncEnabled ? 'Sync live' : 'Sync off'}</span>
                                    </span>
                                    <button
                                        onClick={() => setC3dDrawingsMenuOpen(v => !v)}
                                        className="ml-1 px-1.5 py-2 rounded hover:bg-gray-700 text-gray-300 flex items-center gap-1 max-w-[180px]"
                                        title="Active Civil 3D drawing — click to switch"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                                        <span className="text-[10px] truncate">{c3dActiveDrawing ?? 'Civil 3D'}</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    {c3dDrawingsMenuOpen && (
                                        <div className="absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                                            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-700">
                                                Civil 3D drawings ({c3dDrawings.length})
                                            </div>
                                            {c3dDrawings.length === 0 && (
                                                <div className="px-2.5 py-2 text-[11px] text-gray-500">No drawing list received yet.</div>
                                            )}
                                            {c3dDrawings.map(d => (
                                                <button
                                                    key={d.fullPath}
                                                    onClick={() => {
                                                        setC3dDrawingsMenuOpen(false);
                                                        if (!d.isActive) {
                                                            void sendToC3D('set_active_drawing', { drawingName: d.fullPath }).catch(err =>
                                                                addNotification({ kind: 'c3d-sync', severity: 'error', title: 'C3D', message: String(err) }));
                                                        }
                                                    }}
                                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-gray-700 flex items-center gap-2 ${d.isActive ? 'text-cyan-300' : 'text-gray-200'}`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.isActive ? 'bg-cyan-400' : 'bg-transparent'}`}></span>
                                                    <span className="truncate flex-grow">{d.name}</span>
                                                    {d.layerCount >= 0 && <span className="text-gray-500 text-[9px] shrink-0">{d.layerCount} layers</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <NotificationCenter notifications={headerNotifications} onDismiss={dismissNotification} onClearAll={clearNotifications} />
                            
                            <div className="flex-grow"></div>
                        </div>
                        {/* Visual Panel Area */}
                        <div className="flex-grow min-h-0 relative">
                           {activeVisualPanel === 'canvas' && isHistoryPanelOpen && (
                             <div className="absolute top-0 right-0 z-30 w-72 max-h-full shadow-2xl border-l border-b border-gray-700 rounded-bl-lg overflow-hidden">
                               <HistoryPanel onClose={() => setIsHistoryPanelOpen(false)} />
                             </div>
                           )}
                           <div className="absolute inset-0">
                             {activeVisualPanel === 'canvas' ? (
                                    <>
                                    <DrawingCanvas 
                                        ref={canvas2dRef}
                                        isDesktop={isDesktop}
                                        isChatPanelVisible={isChatPanelVisible}
                                        chatPanelWidth={chatPanelWidth}
                                        keyInfo={{
                                            label: activeKeyStatusLabel,
                                            detail: activeKeyStatusDetail,
                                            tone: activeKeyStatusTone,
                                            hasServiceAndInference,
                                            isServiceEnabled,
                                            isInferenceEnabled,
                                            onClick: isSuperUser
                                                ? handleSuperUserReset
                                                : hasApiKey
                                                  ? () => setIsSettingsVisible(true)
                                                  : handleUnlockClick,
                                        }}
                                        initialTransform={canvasTransform}
                                        points={streamPreviewPoints.length > 0 ? [...points, ...streamPreviewPoints.filter(sp => !points.some(p => p.pointNumber === sp.pointNumber))] : points} 
                                        lines={streamPreviewLines.length > 0 ? [...visibleLines, ...streamPreviewLines] : visibleLines} 
                                        contourLabels={contourLabels}
                                        streetLabels={streetLabels}
                                        centerlines={visibleCenterlines}
                                        customSymbols={customSymbols}
                                        enabledBuiltinSymbolIds={enabledBuiltinSymbolIds}
                                        tinSurfaces={activeAgent === AgentType.STEEP_SLOPE_AGENT ? steepSlopeTinSurfaces : undefined}
                                        pointLayers={pointLayers} 
                                        onLayerToggle={handleLayerToggle}
                                        onLayerColorChange={handleLayerColorChange}
                                        attributeScale={attributeScale}
                                        setAttributeScale={setAttributeScale}
                                        lineLabelScale={lineLabelScale}
                                        setLineLabelScale={setLineLabelScale}
                                        lineThickness={lineThickness}
                                        setLineThickness={setLineThickness}
                                        contourLabelScale={contourSettings.labelScale}
                                        activeAgent={activeAgent}
                                        settings={settings}
                                        zoomTarget={zoomTarget}
                                        onZoomComplete={handleZoomComplete}
                                        pendingDeletePointNumbers={pendingPointDeletes}
                                        onUpdatePointLabelOffset={handleUpdatePointLabelOffset}
                                        onUpdatePointAnnotationOffset={handleUpdatePointAnnotationOffset}
                                        onUpdateLineLabelOffset={handleUpdateLineLabelOffset}
                                        onToggleLineLabelRotation={handleToggleLineLabelRotation}
                                        onSwapLineBearingDirection={handleSwapLineBearingDirection}
                                        onUpdateDeedMetadataOffset={handleUpdateDeedMetadataOffset}
                                        onUpdateOwnerNameOffset={handleUpdateOwnerNameOffset}
                                        deedMetadata={deedFile?.deedMetadata}
                                        deedMetadataOffset={deedFile?.deedMetadataOffset}
                                        ownerNameOffset={deedFile?.ownerNameOffset}
                                        onAddLine={handleAddLine}
                                        onDeleteLine={handleDeleteLine}
                                        canUndo={canUndo}
                                        canRedo={canRedo}
                                        onUndo={undo}
                                        onRedo={redo}
                                        wmsServices={wmsServices}
                                        activeWmsLayers={activeWmsLayers}
                                        offlineMapAreas={offlineMapAreas}
                                        onRedrawAndShowAll={handleRedrawAndShowAll}
                                        onOpenDxfExportModal={handleOpenDxfExportModal}
                                        isLayerPanelOpen={isLayerPanelOpen}
                                        setIsLayerPanelOpen={setIsLayerPanelOpen}
                                        activeAccent={activeAccent}
                                        currentPosition={currentPosition}
                                        projectedPosition={projectedPosition}
                                        onZoomToPoint={handleZoomToPoint}
                                        linesVisible={linesVisible}
                                        onSetLinesVisible={setLinesVisible}
                                        centerlinesVisible={centerlinesVisible}
                                        // FIX: Added the missing onSetCenterlinesVisible prop to the DrawingCanvas component to satisfy its props interface and resolve the TypeScript error.
                                        onSetCenterlinesVisible={setCenterlinesVisible}
                                        pointLists={pointLists}
                                        orientationTuple={orientationTuple}
                                        onSetOrientationTuple={setOrientationTuple}
                                        onTogglePointListVisibility={handleTogglePointListVisibility}
                                        onToolStateChange={setCanvasToolState}
                                        onShowSettings={showSettings}
                                        isC3DConnected={isC3DConnected}
                                        agentDrawMode={agentDrawMode}
                                        onCycleAgentDrawMode={cycleAgentDrawMode}
                                        agentAnnotMode={agentAnnotMode}
                                        onCycleAgentAnnotMode={cycleAgentAnnotMode}
                                        isGridVisible={isGridVisible}
                                        onAddBoundaryCall={handleAddBoundaryCall}
                                        onConvertSelectionToBoundary={handleConvertSelectionToBoundary}
                                        onComputeCurrentClosure={handleComputeCurrentClosure}
                                        dimensions={dimensions}
                                        onAddDimension={handleAddDimension}
                                        dimensionScale={dimensionScale}
                                        setDimensionScale={setDimensionScale}
                                        symbolScale={symbolScale}
                                        setSymbolScale={setSymbolScale}
                                        customAnnotations={customAnnotations}
                                        annotationScale={annotationScale}
                                        setAnnotationScale={setAnnotationScale}
                                        parcelLabels={parcelLabels}
                                        parcelLabelFormatter={parcelLabelFormatter}
                                        parcelCadTextStyles={parcelCadTextStyles}
                                        annotationCategories={annotationCategories}
                                        boundaryFiles={boundaryFiles}
                                        activeBoundaryFileId={activeBoundaryFileId}
                                        showRotatedBearings={showRotatedBearings}
                                        onToggleBoundaryCallLabelRotation={handleToggleBoundaryCallLabelRotation}
                                        onSwapBoundaryCallBearingDirection={handleSwapBoundaryCallBearingDirection}
                                        onUpdateLine={handleUpdateLine}
                                        onUpdateBoundaryTransform={handleBoundaryTransformChange}
                                        boundaryAlignRequest={boundaryAlignRequest}
                                        onBoundaryAlignRequestHandled={() => setBoundaryAlignRequest(null)}
                                        boundaryCornerAlignRequest={boundaryCornerAlignRequest}
                                        onBoundaryCornerAlignRequestHandled={() => setBoundaryCornerAlignRequest(null)}
                                        onBoundaryCornerAlignCommitted={(bfId, pointIds) => {
                                            handleAssociatePointsToBoundary(bfId, pointIds);
                                            logActionToFieldbook(`Aligned deed to ${pointIds.length} found point(s) by corner pairing.`);
                                        }}
                                        availableLayers={activeCadLayers.map(l => l.name)}
                                        activeDrawingLayer={activeDrawingLayer}
                                        onSetActiveDrawingLayer={setActiveDrawingLayer}
                                        linetypes={cadManagerState.standard?.linetypes}
                                        globalLinetypeScale={cadManagerState.standard?.globalLinetypeScale ?? 1}
                                        layerLinetypeMap={layerLinetypeMap}
                                        onOpenPointListPanel={() => { setIsPointListButtonPulsing(false); setIsPointListPanelVisible(p => !p); }}
                                        isPointListPanelOpen={isPointListPanelVisible}
                                        isPointListButtonPulsing={isPointListButtonPulsing}
                                        onOpenBoundaryEditor={() => {
                                            setIsBoundaryEditorButtonPulsing(false);
                                            setIsBoundaryEditorVisible(p => !p);
                                        }}
                                        isBoundaryEditorOpen={isBoundaryEditorVisible}
                                        isBoundaryEditorButtonPulsing={isBoundaryEditorButtonPulsing}
                                        onOpenShrinkwrap={handleOpenShrinkwrapFromCanvas}
                                        isShrinkwrapOpen={isShrinkwrapPanelVisible}
                                        onPointSelected={setSelectedPoint}
                                        shrinkwrapSourcePns={
                                            shrinkwrap && isShrinkwrapPanelVisible
                                                ? (() => {
                                                    // Only highlight actual hull vertices (not all source points).
                                                    // Interior source points don't affect the convex hull, so
                                                    // making them clickable was causing "no visual change" confusion.
                                                    const hullLines = lines.filter(l => l.polylineId === shrinkwrap.polylineId);
                                                    const hullPns = new Set<string>();
                                                    for (const l of hullLines) { hullPns.add(l.from); hullPns.add(l.to); }
                                                    // In cut mode every point (including interior ones, source set, and
                                                    // already-excluded points) is a valid cut endpoint. We expose the
                                                    // entire source pool so the surveyor can strike a chord anywhere.
                                                    if (shrinkwrap.cutMode) {
                                                        return shrinkwrap.sourcePns;
                                                    }
                                                    // Hide both committed and pending-staged exclusions from the
                                                    // clickable hull set so the user can't double-stage a point.
                                                    const pending = shrinkwrap.pendingExcludedPns ?? [];
                                                    return [...hullPns].filter(pn =>
                                                        !shrinkwrap.excludedPns.includes(pn)
                                                        && !pending.includes(pn)
                                                    );
                                                  })()
                                                : undefined
                                        }
                                        onShrinkwrapPointClick={
                                            shrinkwrap && isShrinkwrapPanelVisible
                                                ? (pn) => setShrinkwrap(prev => {
                                                    if (!prev) return prev;
                                                    // CUT MODE � the next click is either the start of a cut or
                                                    // the second endpoint that completes it.
                                                    if (prev.cutMode) {
                                                        if (!prev.cutStartPn) {
                                                            return { ...prev, cutStartPn: pn };
                                                        }
                                                        if (prev.cutStartPn === pn) {
                                                            // Tapping the start point again cancels.
                                                            return { ...prev, cutStartPn: null };
                                                        }
                                                        // Complete cut. Dedupe identical chords.
                                                        const a = prev.cutStartPn;
                                                        const b = pn;
                                                        const exists = (prev.cuts ?? []).some(c =>
                                                            (c.a === a && c.b === b) || (c.a === b && c.b === a)
                                                        );
                                                        if (!exists) logActionToFieldbook(`Shrinkwrap cut added: ${a} - ${b}.`);
                                                        const nextCuts = exists
                                                            ? prev.cuts
                                                            : [...(prev.cuts ?? []), { a, b, flipped: false }];
                                                        return { ...prev, cuts: nextCuts, cutStartPn: null };
                                                    }
                                                    // EXCLUDE MODE � stage the point for removal on next Update.
                                                    if ((prev.pendingExcludedPns ?? []).includes(pn)) return prev;
                                                    return { ...prev, pendingExcludedPns: [...(prev.pendingExcludedPns ?? []), pn] };
                                                  })
                                                : undefined
                                        }
                                    />
                                    {/* Civil Drafter Gimbal Vision HUD � debug-only (Settings ? Developer/Testing) */}
                                    {activeAgent === AgentType.CIVIL_DRAFTER && showVisionHUD && !!settings.debugGimbalHud && (
                                        <CivilDrafterVisionHUD
                                            isScanning={isVisionScanning}
                                            survey={civilDrafterVisionSurvey}
                                            onDismiss={() => setShowVisionHUD(false)}
                                        />
                                    )}
                                    {/* Civil Drafter Auto Draft panel */}
                                    {activeAgent === AgentType.CIVIL_DRAFTER && showAutoDraftPanel && (
                                        <AutoDraftPanel
                                            points={points}
                                            lines={lines}
                                            jobInfo={jobInfo}
                                            zoningContext={{
                                                state:    zoningState,
                                                county:   zoningCounty,
                                                place:    zoningPlace,
                                                district: zoningDistrict,
                                            } satisfies ZoningContext}
                                            projectEpsg={settings.projection?.epsg ?? null}
                                            mapKeys={{
                                                geminiKey: settings.userApiKey || undefined,
                                                mapsKey: settings.googleMaps?.apiKey || undefined,
                                            }}
                                            onDraft={async (prompt, images) => {
                                                pendingAutoDraftImagesRef.current = images ?? [];
                                                await handleSendMessage(prompt);
                                            }}
                                            getCanvasLineCount={() => linesRef.current.length}
                                            onCanvasLines={(newLines, sourceTag) => {
                                                setLines(prev => [
                                                    ...prev.filter(l => !(l.layer ?? '').startsWith(sourceTag)),
                                                    ...newLines,
                                                ]);
                                            }}
                                            onParcelResult={(result) => {
                                                setLastFetchedParcels(result.parcels);
                                                if (result.labelPoints.length > 0) {
                                                    const ts = Date.now();
                                                    setParcelLabels(result.labelPoints.map((lp, i) => ({
                                                        id: `PARCEL-LBL-${i}-${ts}`,
                                                        x: lp.x,
                                                        y: lp.y,
                                                        parcelId: lp.parcelId ?? null,
                                                        owner: lp.owner ?? null,
                                                        angle: 0,
                                                    })));
                                                }
                                            }}
                                            onStreetLabels={(labels) => setStreetLabels(labels)}
                                            getSymbolCoverage={(pts) => {
                                                const matchers = buildSymbolMatchers(customSymbols);
                                                const unmatchedCounts = new Map<string, number>();
                                                let matched = 0;
                                                let total = 0;
                                                for (const p of pts) {
                                                    const code = (p.description || '').trim();
                                                    if (!code) continue;
                                                    total++;
                                                    const res = resolveSymbol(code, customSymbols, matchers);
                                                    if (res.symbol) {
                                                        matched++;
                                                    } else {
                                                        const key = code.toUpperCase().split(/\s+/)[0];
                                                        unmatchedCounts.set(key, (unmatchedCounts.get(key) ?? 0) + 1);
                                                    }
                                                }
                                                return {
                                                    matched,
                                                    total,
                                                    unmatched: [...unmatchedCounts.entries()]
                                                        .map(([code, count]) => ({ code, count }))
                                                        .sort((a, b) => b.count - a.count),
                                                };
                                            }}
                                            onAddSymbols={(symbols) => setCustomSymbols(prev => [...prev, ...symbols])}
                                            onGenerateContours={() => { handleGenerateContours(); }}
                                            onFetchGisContours={async (ctx) => {
                                                const stateName = (ctx.state || zoningState || '').trim();
                                                const entry = ESRI_STATE_SERVICES.find(s =>
                                                    s.state.toLowerCase() === stateName.toLowerCase() ||
                                                    s.abbr.toLowerCase() === stateName.toLowerCase());
                                                if (!entry || entry.layers.length === 0) {
                                                    throw new Error(
                                                        `No public contour service registered for ${stateName || 'this state'}` +
                                                        `${entry?.portalUrl ? ` � browse ${entry.portalUrl} and use the Contours agent's custom URL instead` : ''}.`
                                                    );
                                                }
                                                const desc = [
                                                    ctx.place || zoningPlace,
                                                    (ctx.county || zoningCounty) ? `${ctx.county || zoningCounty} County` : null,
                                                    stateName,
                                                ].filter(Boolean).join(', ');
                                                await handleFetchEsriContours(entry.layers[0].url, 'description', desc);
                                            }}
                                            onSteepSlopes={async () => {
                                                // Reuse the shared survey-points TIN when available so the run's
                                                // sourceTinId resolves in the Steep Slope agent's report panel.
                                                const tin = steepSlopeTinSurfaces[0]
                                                    ?? buildTinFromPoints(points, { name: 'Auto Draft TIN' });
                                                if (!tin) throw new Error('Need at least 3 points with elevations to build a TIN.');
                                                const run = runSteepSlopeAnalysis(tin, { sourceTinId: tin.id });
                                                const ssLines = steepSlopeRunToSurveyLines(tin, run);
                                                setSteepSlopeRuns(prev => [...prev, run]);
                                                setLines(prev => [
                                                    ...prev.filter(l => l.type !== 'steep-slope'),
                                                    ...ssLines,
                                                ]);
                                                logActionToFieldbook(
                                                    `Auto Draft: steep-slope analysis � ${run.keptTriangleCount}/${run.analyzedTriangleCount} triangles in kept slope bands.`
                                                );
                                                return { kept: run.keptTriangleCount, analyzed: run.analyzedTriangleCount };
                                            }}
                                            onDismiss={() => setShowAutoDraftPanel(false)}
                                        />
                                    )}
                                    
                                    {/* Floating Point List Panel */}
                                    {isPointListPanelVisible && (
                                        <PointListPanel
                                          pointLists={pointLists}
                                          onClose={() => setIsPointListPanelVisible(false)}
                                          onZoomToPoint={handleZoomToPoint}
                                          onToggleContext={handleTogglePointListContext}
                                          onTogglePointListVisibility={handleTogglePointListVisibility}
                                        />
                                    )}
                                    {/* Floating Data Visibility dialog (canvas toolbar Layers button) */}
                                    {isLayerPanelOpen && (() => {
                                        const defaultPos = { x: Math.max(0, window.innerWidth - 400), y: 60 };
                                        const dvPos = dataVisibilityPos || defaultPos;
                                        const handleDvDrag = (e: React.MouseEvent) => {
                                            e.preventDefault();
                                            dataVisibilityDragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPosX: dvPos.x, startPosY: dvPos.y };
                                            const onMove = (ev: MouseEvent) => {
                                                if (!dataVisibilityDragState.current.dragging) return;
                                                setDataVisibilityPos({ x: dataVisibilityDragState.current.startPosX + (ev.clientX - dataVisibilityDragState.current.startX), y: dataVisibilityDragState.current.startPosY + (ev.clientY - dataVisibilityDragState.current.startY) });
                                            };
                                            const onUp = () => { dataVisibilityDragState.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                            window.addEventListener('mousemove', onMove);
                                            window.addEventListener('mouseup', onUp);
                                        };
                                        return (
                                            <div className="fixed z-40 flex flex-col bg-gray-900 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden" style={{ left: dvPos.x, top: dvPos.y, width: 360, maxHeight: '80vh' }}>
                                                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/80 border-b border-cyan-500/20 cursor-grab active:cursor-grabbing select-none flex-shrink-0" onMouseDown={handleDvDrag}>
                                                    <div className="flex items-center gap-2">
                                                        <LayersIcon className="w-4 h-4 text-cyan-400" />
                                                        <span className="text-sm font-semibold text-gray-200">Data Visibility</span>
                                                    </div>
                                                    <button onClick={() => setIsLayerPanelOpen(false)} className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white" title="Close">
                                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                                    </button>
                                                </div>
                                                {/* Current drawing layer selector */}
                                                <div className="flex-shrink-0 px-4 py-2.5 bg-gray-800/40 border-b border-gray-700/40">
                                                    <div className="flex items-center gap-2">
                                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                                        <span className="text-xs text-gray-400 flex-shrink-0">Drawing Layer</span>
                                                        {activeCadLayers.length > 0 ? (
                                                            <select
                                                                value={activeDrawingLayer}
                                                                onChange={e => setActiveDrawingLayer(e.target.value)}
                                                                className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-500"
                                                                title="Layer assigned to manually drawn lines"
                                                            >
                                                                <option value="">(AI selects layer)</option>
                                                                {activeCadLayers.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                                                            </select>
                                                        ) : (
                                                            <span className="text-xs text-gray-500 italic">No CAD standard loaded � AI selects layer</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-600 mt-1 pl-5">Manual lines use this layer � AI agents always smart-select</p>
                                                </div>
                                                <div className="flex-1 overflow-y-auto">
                                                    <LayerManagerPanel
                                                        hideHeader
                                                        pointLists={pointLists}
                                                        onTogglePointListVisibility={handleTogglePointListVisibility}
                                                        linesVisible={linesVisible}
                                                        onSetLinesVisible={setLinesVisible}
                                                        centerlinesVisible={centerlinesVisible}
                                                        onSetCenterlinesVisible={setCenterlinesVisible}
                                                        pointLayers={pointLayers}
                                                        onLayerToggle={handleLayerToggle}
                                                        onLayerColorChange={handleLayerColorChange}
                                                        wmsServices={wmsServices}
                                                        activeWmsLayers={activeWmsLayers}
                                                        onToggleWmsLayer={handleToggleWmsLayer}
                                                        offlineMapAreas={offlineMapAreas}
                                                        onToggleOfflineMapAreaVisibility={handleToggleOfflineMapAreaVisibility}
                                                        cadLayers={activeCadLayers}
                                                        cadLayerVisibility={cadLayerVisibility}
                                                        cadLayerColors={cadLayerColors}
                                                        onToggleCadLayer={handleToggleCadLayer}
                                                        onCadLayerColorChange={handleCadLayerColorChange}
                                                        inclusionBoundaries={inclusionBoundaries.map(b => ({ id: b.id, name: b.name, polylineId: b.polylineId }))}
                                                        inclusionBoundaryVisibility={(() => {
                                                            const v: Record<string, boolean> = {};
                                                            for (const b of inclusionBoundaries) {
                                                                const any = lines.find(l => l.polylineId === b.polylineId);
                                                                v[b.polylineId] = any ? !any.hidden : true;
                                                            }
                                                            return v;
                                                        })()}
                                                        inclusionBoundarySegmentCounts={(() => {
                                                            const m: Record<string, number> = {};
                                                            for (const l of lines) {
                                                                if (l.type === 'inclusion' && l.polylineId) {
                                                                    m[l.polylineId] = (m[l.polylineId] || 0) + 1;
                                                                }
                                                            }
                                                            return m;
                                                        })()}
                                                        onToggleInclusionBoundary={(id) => {
                                                            const b = inclusionBoundaries.find(x => x.id === id);
                                                            if (!b) return;
                                                            // Determine current visibility from ANY line in the group,
                                                            // then write the inverted state to EVERY line in the group.
                                                            const any = lines.find(l => l.polylineId === b.polylineId);
                                                            const isHidden = !!(any && any.hidden);
                                                            const nextHidden = !isHidden;
                                                            setLines(prev => prev.map(l =>
                                                                l.polylineId === b.polylineId
                                                                    ? { ...l, hidden: nextHidden ? true : undefined }
                                                                    : l
                                                            ));
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {/* Boundary Editor overlay � shown when there are boundary files */}
                                    {isBoundaryEditorVisible && boundaryFiles.length > 0 && (
                                        <BoundaryEditor
                                            boundaryFiles={boundaryFiles}
                                            pointMap={pointMap}
                                          reservedRight={isDesktop && isChatPanelVisible ? chatPanelWidth : 0}
                                          reservedBottom={!isDesktop && isChatPanelVisible ? Math.floor(window.innerHeight / 2) : 0}
                                            onUpdateCall={handleBoundaryCallUpdate}
                                            onAddCall={handleBoundaryRowAdd}
                                            onRemoveCall={handleBoundaryRowRemove}
                                            onGenerateClosureReport={handleGenerateBoundaryClosureReport}
                                            onInvestigateClosure={handleInvestigateClosure}
                                            onWriteLegal={handleWriteBoundaryLegal}
                                            onDrawToLinework={handleDrawBoundaryToLinework}
                                            onClose={() => setIsBoundaryEditorVisible(false)}
                                            onSaveToFileManager={handleSaveBoundaryToFileManager}
                                            onRenameFile={handleRenameBoundaryFile}
                                            onToggleVisibility={handleToggleBoundaryVisibility}
                                            onLoadFile={handleLoadBoundaryFile}
                                            onTransformChange={handleBoundaryTransformChange}
                                            onPobChange={handleBoundaryPobChange}
                                            selectedPointNumber={selectedPoint?.pointNumber}
                                            selectedFileId={activeBoundaryFileId}
                                            onSelectFile={setActiveBoundaryFileId}
                                            showRotatedBearings={showRotatedBearings}
                                            onShowRotatedBearingsChange={setShowRotatedBearings}
                                            onAssociatePoints={handleAssociatePointsToBoundary}
                                            onDisassociatePoint={handleDisassociatePointFromBoundary}
                                            onBestFitToPoints={handleBestFitBoundaryToPoints}
                                            onAlignToOtherBoundary={(movableBfId) => setBoundaryAlignRequest({ token: Date.now(), movableBfId })}
                                            onAlignCornersToPoints={(bfId) => {
                                                setActiveBoundaryFileId(bfId);
                                                setBoundaryCornerAlignRequest({ token: Date.now(), movableBfId: bfId });
                                            }}
                                        />
                                    )}
                                    {/* Deed Summary Panel � shown immediately on deed upload; pre-parse state until AI extracts calls */}
                                    {(deedSummaryFileIds.length > 0 || deedSummary) && (() => {
                                        const summaryFiles = boundaryFiles.filter(f => deedSummaryFileIds.includes(f.id));
                                        return (
                                            <DeedSummaryPanel
                                                files={summaryFiles}
                                                pendingFileName={summaryFiles.length === 0 && !deedSummary ? (deedFile?.name ?? 'Deed') : undefined}
                                                summary={deedSummary ?? undefined}
                                                computingTractIds={computingTractIds}
                                                onComputeTract={(tractId, pob) => {
                                                    if (isFreeTierTimeLocked) {
                                                        setIsLockDismissed(false);
                                                        setShowHostCostReminder(true);
                                                        return;
                                                    }
                                                    const t = deedSummary?.tracts.find(x => x.tractId === tractId);
                                                    if (!t) return;
                                                    pendingTractIdRef.current = tractId;
                                                    pendingTractPobRef.current = pob;
                                                    setComputingTractIds(prev => new Set(prev).add(tractId));
                                                    const pageHint = t.sourcePage != null ? ` (source page ${t.sourcePage})` : '';
                                                    const nameHint = t.tractName ? ` ("${t.tractName}")` : '';
                                                    const pobHint = pob
                                                        ? ` Start the boundary at the Point of Beginning E=${pob.easting.toFixed(4)}, N=${pob.northing.toFixed(4)}.`
                                                        : '';
                                                    void handleSendMessage(
                                                        `Extract ONLY ${t.tractId}${nameHint}${pageHint} from this deed. ` +
                                                        `Return JSON with points[] and lines[] (or boundaries: [{ tractId: "${t.tractId}", points, lines }]) for this tract only. ` +
                                                        `Do not include any other tract.` +
                                                        pobHint
                                                    );
                                                }}
                                                onComputeAll={() => {
                                                    if (isFreeTierTimeLocked) {
                                                        setIsLockDismissed(false);
                                                        setShowHostCostReminder(true);
                                                        return;
                                                    }
                                                    pendingTractIdRef.current = null;
                                                    pendingTractPobRef.current = null;
                                                    if (deedSummary) {
                                                        setComputingTractIds(new Set(deedSummary.tracts.map(t => t.tractId)));
                                                    }
                                                    void handleSendMessage('Extract all boundary descriptions from this deed.');
                                                }}
                                                onParseNow={() => {
                                                    if (isFreeTierTimeLocked) {
                                                        setIsLockDismissed(false);
                                                        setShowHostCostReminder(true);
                                                        return;
                                                    }
                                                    void handleSendMessage('Extract all boundary descriptions from this deed.');
                                                }}
                                                pointMap={pointMap}
                                                selectedPointNumber={selectedPoint?.pointNumber}
                                                onCompute={(id, pob) => {
                                                    // v26.05.22.5 � User explicitly clicked "Compute Preview". Switch
                                                    // to the canvas panel so the DrawingCanvas actually mounts and the
                                                    // amber overlay can render. Without this the user sees nothing
                                                    // because the deed-text / PDF panel is occupying the visual area.
                                                    showView('canvas');
                                                    // Flip overlay visible and store the optional POB override.
                                                    // Preserve the user's current viewport; computing a silhouette
                                                    // must not recenter or change their zoom.
                                                    setBoundaryFiles(prev => prev.map(f =>
                                                        f.id === id ? { ...f, hidden: false, pobOverride: pob ?? undefined } : f
                                                    ));
                                                }}
                                                onAssociatePoints={handleAssociatePointsToBoundary}
                                                onDisassociatePoint={handleDisassociatePointFromBoundary}
                                                onBestFit={handleBestFitBoundaryToPoints}
                                                onAlignCorners={(id) => {
                                                    setActiveBoundaryFileId(id);
                                                    setBoundaryCornerAlignRequest({ token: Date.now(), movableBfId: id });
                                                }}
                                                onCommitDraw={(id) => handleDrawBoundaryToLinework(id)}
                                                onOpenInEditor={(id) => {
                                                    setIsBoundaryEditorButtonPulsing(false);
                                                    setIsBoundaryEditorVisible(true);
                                                }}
                                                onClose={() => { setDeedSummaryFileIds([]); setDeedSummary(null); }}
                                            />
                                        );
                                    })()}
                                    </>
                                ) : activeVisualPanel === 'cutsheet' ? (
                                    <CutSheetPanel ref={cutSheetRef} data={cutSheetData} info={cutSheetInfo} setInfo={setCutSheetInfo} settings={settings} />
                                ) : activeVisualPanel === 'fieldbook' ? (
                                    <FieldbookPanel 
                                      notes={fieldbookNotes} 
                                      onNotesChange={setFieldbookNotes} 
                                      messages={fieldbookLog} 
                                      onAction={handleFieldbookAction}
                                      settings={settings}
                                      jobInfo={jobInfo}
                                      onExportToNotion={handleExportToNotion}
                                    />
                                ) : activeVisualPanel === 'pdfviewer' && pdfViewerFiles ? (
                                    <PdfViewerPanel files={pdfViewerFiles} onClose={() => showView('canvas')} isFullscreen={isPdfViewerFullscreen} onToggleFullscreen={handleTogglePdfViewerFullscreen} isDesktop={isDesktop} />
                                ) : activeVisualPanel === 'texteditor' ? (
                                    <TextEditorPanel 
                                        files={[rawFile, deedFile, dxfFile, clFile, gisFile, ...planFiles || []]} 
                                        generatedFiles={generatedFiles}
                                        pointLists={pointLists}
                                        activeFile={activeTextEditorFile} 
                                        onFileSelect={handleOpenFileInEditor}
                                        content={textEditorContent}
                                        onContentChange={handleTextEditorContentChange}
                                        onSaveChanges={handleSaveChanges}
                                        hasUnsavedChanges={hasUnsavedChanges}
                                    />
                                ) : activeVisualPanel === 'gpsstakeout' ? (
                                    <GpsStakeoutPanel 
                                        isOverlay={false}
                                        currentPosition={currentPosition}
                                        projectedPosition={projectedPosition}
                                        projectPoints={points}
                                        pointLists={pointLists}
                                        onStorePoint={handleStoreGpsPoint}
                                        onStoreStakedPoint={handleStoreStakedGpsPoint}
                                        settings={settings}
                                        targetPointNumber={stakeoutTargetPointNumber}
                                        setTargetPointNumber={setStakeoutTargetPointNumber}
                                        nextAvailablePointNumber={nextAvailablePointNumber}
                                        initialTab={gpsInitialTab}
                                    />
                                ) : activeVisualPanel === 'filemanager' ? (
                                    <FileManagerPanel
                                        rawFile={rawFile} deedFile={deedFile} dxfFile={dxfFile} gisFile={gisFile} planFiles={planFiles} imageFiles={imageFiles}
                                        generatedFiles={generatedFiles}
                                        pointLists={pointLists}
                                        onOpenFileInEditor={handleOpenFileInEditor}
                                        onDeleteFile={handleDeleteFile}
                                        onToggleDxfTraining={(forTraining) => {
                                            if (dxfFile) {
                                                setDxfFile({ ...dxfFile, forTraining });
                                                logActionToFieldbook(forTraining 
                                                    ? `Marked DXF "${dxfFile.name}" as training template for Civil Drafter` 
                                                    : `Removed training template status from DXF "${dxfFile.name}"`);
                                            }
                                        }}
                                    />
                                ) : activeVisualPanel === 'imageanalyzer' ? (
                                    <ImageAnalyzerPanel imageFiles={imageFiles} onUpdateImageTags={handleUpdateImageTags}/>
                                ) : activeVisualPanel === 'wms' ? (
                                    <WmsPanel services={wmsServices} activeLayers={activeWmsLayers} onConnect={handleConnectWms} onToggleLayer={handleToggleWmsLayer} onUpdateLayer={handleUpdateWmsLayer} onRemoveService={handleRemoveWmsService} onDownloadMapArea={handleDownloadMapArea} onDeleteOfflineMapArea={handleDeleteOfflineMapArea} offlineMapAreas={offlineMapAreas} points={points} />
                                ) : activeVisualPanel === 'titlesearch' ? (
                                    <TitleSearchPanel 
                                        titleData={titleSearchData}
                                        onDeedSelect={setSelectedDeedId}
                                        onLienSelect={setSelectedLienId}
                                        selectedDeedId={selectedDeedId}
                                        selectedLienId={selectedLienId}
                                    />
                                ) : activeVisualPanel === 'zoning' ? (
                                    <ZoningResultsPanel
                                        chatHistory={zoningChatHistory}
                                        place={zoningPlace}
                                        county={zoningCounty}
                                        state={zoningState}
                                        district={zoningDistrict}
                                        onAskQuestion={handleSendMessage}
                                    />
                                ) : activeVisualPanel === 'symbolmanager' ? (
                                    <SymbolManagerPanel
                                        symbols={customSymbols}
                                        onAddSymbol={handleAddSymbol}
                                        onUpdateSymbol={handleUpdateSymbol}
                                        onDeleteSymbol={handleDeleteSymbol}
                                        settings={settings}
                                        enabledBuiltinSymbolIds={enabledBuiltinSymbolIds}
                                        onToggleBuiltinSymbol={(libId, enabled) =>
                                            applySymbolVisibilityCommand({ action: enabled ? 'enable' : 'disable', ids: [libId], phrase: libId })
                                        }
                                        onToggleAllBuiltins={(enabled) =>
                                            applySymbolVisibilityCommand({ action: enabled ? 'enable' : 'disable', ids: 'all', phrase: 'all symbols' })
                                        }
                                    />
                                ) : activeVisualPanel === 'annotatemanager' ? (
                                    <>
                                    <AnnotateManagerPanel
                                        rules={customAnnotations}
                                        onAddRule={handleAddAnnotationRule}
                                        onUpdateRule={handleUpdateAnnotationRule}
                                        onDeleteRule={handleDeleteAnnotationRule}
                                        points={points}
                                        globalScale={annotationScale}
                                        onChangeGlobalScale={setAnnotationScale}
                                        settings={settings}
                                        streetLabels={streetLabels}
                                        isFetchingStreetLabels={isFetchingStreetLabels}
                                        onFetchStreetNames={handleFetchStreetNames}
                                        onClearStreetLabels={() => setStreetLabels([])}
                                        hasInclusionBoundary={lines.some((l: SurveyLine) => l.type === 'inclusion')}
                                    />
                                    <div className="mt-3 border-t border-white/10 pt-3">
                                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Annotation Categories</p>
                                        <AnnotationCategoryPanel
                                            categories={annotationCategories}
                                            onChange={setAnnotationCategories}
                                            globalScale={annotationScale}
                                            onChangeGlobalScale={setAnnotationScale}
                                            cadTextStyles={parcelCadTextStyles}
                                        />
                                    </div>
                                    </>
                                ) : activeVisualPanel === 'profile' ? (
                                    <ProfilePanel profileData={profileData} profileInfo={profileInfo} onSaveProfile={handleSaveProfile} />
                                ) : activeVisualPanel === 'closurereport' ? (
                                    <ClosureReportPanel reports={closureReports} />
                                ) : activeVisualPanel === 'steepslopereport' ? (
                                  <SteepSlopeReportPanel runs={steepSlopeRuns} tinSurfaces={steepSlopeTinSurfaces} />
                                ) : activeVisualPanel === 'legalwriter' ? (
                                    legalWriterState ? (
                                        <LegalWriterPanel
                                            initialText={legalWriterState.text}
                                            fileName={legalWriterState.fileName}
                                            initialStylePrefs={legalWriterState.stylePrefs}
                                            onRegenerate={handleRegenerateLegal}
                                            onBack={() => showView('canvas')}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                                            No legal description generated yet. Open the Boundary Editor and click "Write Legal".
                                        </div>
                                    )
                                ) : activeVisualPanel === 'layermanager' ? (
                                    <LayerManagerPanel
                                        pointLists={pointLists}
                                        onTogglePointListVisibility={handleTogglePointListVisibility}
                                        linesVisible={linesVisible}
                                        onSetLinesVisible={setLinesVisible}
                                        centerlinesVisible={centerlinesVisible}
                                        onSetCenterlinesVisible={setCenterlinesVisible}
                                        pointLayers={pointLayers}
                                        onLayerToggle={handleLayerToggle}
                                        onLayerColorChange={handleLayerColorChange}
                                        wmsServices={wmsServices}
                                        activeWmsLayers={activeWmsLayers}
                                        onToggleWmsLayer={handleToggleWmsLayer}
                                        offlineMapAreas={offlineMapAreas}
                                        onToggleOfflineMapAreaVisibility={handleToggleOfflineMapAreaVisibility}
                                        cadLayers={activeCadLayers}
                                        cadLayerVisibility={cadLayerVisibility}
                                        cadLayerColors={cadLayerColors}
                                        onToggleCadLayer={handleToggleCadLayer}
                                        onCadLayerColorChange={handleCadLayerColorChange}
                                    />
                                ) : activeVisualPanel === 'ar' ? (
                                    <ARView
                                        isActive={true}
                                        points={points}
                                        selectedPoint={selectedPoint}
                                        onPointSelected={setSelectedPoint}
                                        onMenuAction={(action, point) => {
                                            // Handle AR menu actions
                                            console.log(`AR action: ${action} on point`, point);
                                        }}
                                        onClose={() => showView('canvas')}
                                    />
                                ) : activeVisualPanel === 'compliance' ? (
                                    <StandardsComplianceSummaryPanel
                                      report={standardsComplianceLastReport}
                                      subjectFileName={standardsComplianceSubjectFile?.name}
                                      controlFileName={standardsComplianceControlFile?.name}
                                      checks={standardsComplianceChecks}
                                      sourceMode={standardsComplianceSourceMode}
                                      isRunning={isStandardsComplianceRunning}
                                      onChecksChange={setStandardsComplianceChecks}
                                      onSourceModeChange={setStandardsComplianceSourceMode}
                                      onRunAudit={runStandardsComplianceAudit}
                                      onAddFiles={() => setIsAddingData(true)}
                                      onOpenChat={() => showView('canvas')}
                                    />
                                ) : activeVisualPanel === 'cadmanager' || activeVisualPanel === 'cadstandards' ? (
                                    <CadManagerPage 
                                      c3dSessionToken={c3dSessionToken}
                                      isC3DConnected={isC3DConnected}
                                      sendToC3D={sendToC3D}
                                      reconnectWebSocket={reconnectWebSocket}
                                    />
                                ) : activeVisualPanel === 'sheetview' ? (
                                    <SheetView
                                      points={points}
                                      lines={lines}
                                      projectName={jobInfo?.jobName}
                                      cadLayerColors={cadLayerColors}
                                      profileData={profileData}
                                      profileInfo={profileInfo}
                                    />
                                ) : activeVisualPanel === 'draftstylelib' ? (
                                    <DraftingStyleLibrary
                                      entries={draftingStyleLibrary}
                                      onChange={setDraftingStyleLibrary}
                                    />
                                ) : activeVisualPanel === 'linetypemanager' ? (
                                    <LinetypeManagerPanel
                                      isC3DConnected={isC3DConnected}
                                      onClose={() => showView('canvas')}
                                    />
                                ) : (
                                    <WelcomeScreen 
                                      version={APP_VERSION} 
                                      onClose={() => setShowWelcome(false)}
                                      onLaunchAgenticCad={handleLaunchAgenticCad}
                                      onGoHome={handleGoHome}
                                      hasExistingPoints={pointLists.some(l => l.points.length > 0)}
                                      existingPointCount={pointLists.reduce((sum, l) => sum + l.points.length, 0)}
                                    />
                                )}
                           </div>
                        </div>
                    </div>
                    
                    {isChatPanelVisible && activeVisualPanel !== 'cadmanager' && activeVisualPanel !== 'gpsstakeout' && activeVisualPanel !== 'sheetview' && activeVisualPanel !== 'draftstylelib' && activeVisualPanel !== 'linetypemanager' && activeVisualPanel !== 'compliance' && (
                        <div className={`relative transition-all duration-300 ${isDesktop ? 'flex-shrink-0' : 'h-1/2'}`} style={isDesktop ? { width: `${chatPanelWidth}px` } : {}}>
                            {isDesktop && (
                                <div
                                    onMouseDown={handleChatResizeMouseDown}
                                    className="absolute top-0 left-0 h-full w-2 cursor-col-resize z-10"
                                    title="Resize Chat Panel"
                                />
                            )}
                            <div className="h-full w-full flex flex-col">
                                <ChatInterface
                                    messages={currentChatHistory}
                                    onSendMessage={handleSendMessage}
                                    isLoading={isLoading}
                                    suggestedQuestions={suggestedQuestions}
                                    onStopGenerating={handleStopGenerating}
                                    onToggleExpand={handleToggleExpandMessage}
                                    thinkingTime={thinkingTime}
                                    currentModelName={currentModelName}
                                    headerControls={chatHeaderControls}
                                    chatBarAccessories={
                                        activeAgent === AgentType.CIVIL_DRAFTER ? (
                                            <div className="flex items-center gap-2 px-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAutoDraftPanel(true)}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border border-violet-400/40 text-white text-xs font-bold shadow-md shadow-violet-950/40 transition-all active:scale-95"
                                                    title="Open Auto Draft workflow panel"
                                                >
                                                    <span className="text-sm">⚡</span>
                                                    <span>Auto Draft</span>
                                                </button>
                                                <span className="text-[11px] text-gray-400">
                                                    One-shot automated survey &amp; linework drafting
                                                </span>
                                            </div>
                                        ) : undefined
                                    }
                                    toolsContent={
                                        activeAgent === AgentType.COGO_AGENT ? (
                                            <CogoPanel 
                                                pointLists={pointLists} 
                                                onAddPoint={handleAddPoint} 
                                                activeAgent={activeAgent} 
                                                settings={settings} 
                                            />
                                        ) : activeAgent === AgentType.CENTERLINE_STATIONING ? (
                                            <StationingChat
                                                centerlines={centerlines}
                                                onUpdateCenterline={handleUpdateCenterline}
                                                onPlacePoint={handlePlaceStationOffsetPoint}
                                                activeAgent={activeAgent}
                                                settings={settings}
                                            />
                                        ) : activeAgent === AgentType.DEED_READER ? (
                                            <ParcelPanel
                                                inclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'inclusion').length}
                                                parcelLineCount={lines.filter((l: SurveyLine) => l.layer === 'COUNTY-PARCEL').length}
                                                lastFetchedParcels={lastFetchedParcels}
                                                isFetching={isFetchingParcels}
                                                onFetchParcels={handleFetchParcels}
                                                onClearParcels={handleClearParcels}
                                                parcelLabelFormatter={parcelLabelFormatter}
                                                cadTextStyles={parcelCadTextStyles}
                                                propertyOwnerCategory={annotationCategories.find(c => c.id === 'property-owners') ?? null}
                                                onParcelLabelFormatterChange={setParcelLabelFormatter}
                                            />
                                        ) : activeAgent === AgentType.CONTOURING_AGENT ? (
                                            <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col p-4 light-theme:bg-gray-50 light-theme:text-gray-600">
                                                <h3 className="text-lg font-semibold text-amber-400 mb-3 flex-shrink-0">Contouring Agent</h3>
                                                <p className="text-xs text-gray-400 leading-snug mb-4">
                                                    Contour tools now live in floating dialogs. Use the buttons below to open them � they appear only while the Contouring Agent is active and minimize to a small chip at the bottom of the screen.
                                                </p>
                                                <div className="space-y-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsContourGenPanelVisible(true); setIsContourGenMinimized(false); }}
                                                        className="w-full py-2 text-sm font-semibold rounded-md border border-amber-500/40 bg-amber-700/30 hover:bg-amber-600/40 text-amber-100 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        Open Contour Generation
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsContourManagementVisible(true)}
                                                        className="w-full py-2 text-sm font-semibold rounded-md border border-amber-400/40 bg-amber-800/30 hover:bg-amber-700/40 text-amber-100 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        Manage Generations ({contourGenerations.length})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsContourEsriPanelVisible(true); setIsContourEsriMinimized(false); }}
                                                        className="w-full py-2 text-sm font-semibold rounded-md border border-teal-500/40 bg-teal-700/30 hover:bg-teal-600/40 text-teal-100 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        Open ESRI REST Sources
                                                    </button>
                                                </div>
                                                <div className="mt-4 text-[10px] text-gray-500 leading-snug">
                                                    Tip: Use the <span className="text-amber-300">Generate Contours</span> button in the floating dialog. The <span className="text-amber-300">Ignore Points</span> section lets you exclude specific points (e.g. inverts) by typing in the search box and selecting matches � or click <span className="text-fuchsia-300">? AI Smart Match</span> to fuzzy-match similar descriptions.
                                                </div>
                                            </div>
                                            ) : activeAgent === AgentType.STEEP_SLOPE_AGENT ? (
                                              <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col p-4 light-theme:bg-gray-50 light-theme:text-gray-600">
                                                <h3 className="text-lg font-semibold text-rose-400 mb-3 flex-shrink-0">Steep Slope Agent</h3>
                                                <p className="text-xs text-gray-400 leading-snug mb-4">
                                                  Steep-slope tools run in a floating dialog. Use the buttons below to run and manage analyses.
                                                </p>
                                                <div className="space-y-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => { setIsSteepSlopePanelVisible(true); setIsSteepSlopePanelMinimized(false); }}
                                                    className="w-full py-2 text-sm font-semibold rounded-md border border-rose-500/40 bg-rose-700/30 hover:bg-rose-600/40 text-rose-100 transition-colors flex items-center justify-center gap-2"
                                                  >
                                                    Open Steep Slope Tools
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={handleOpenSteepSlopeReport}
                                                    className="w-full py-2 text-sm font-semibold rounded-md border border-rose-400/40 bg-rose-800/30 hover:bg-rose-700/40 text-rose-100 transition-colors flex items-center justify-center gap-2"
                                                  >
                                                    Open Report ({steepSlopeRuns.length})
                                                  </button>
                                                </div>
                                                <div className="mt-4 text-[10px] text-gray-500 leading-snug">
                                                  Auto Draft steep-slope runs are registered and available here for the same standard report and controls.
                                                </div>
                                              </div>
                                        ) : activeAgent === AgentType.POINT_EDITOR ? (
                                            <PointEditorChat
                                                pointLists={pointLists}
                                                onAddPoint={handleAddPoint}
                                                onUpdatePoint={handleUpdatePoint}
                                                onDeletePoint={handleDeletePoint}
                                                activeAgent={activeAgent}
                                                onSaveUnsavedPoints={handleSaveUnsavedPointsAsList}
                                                onMergeUnsavedPoints={handleMergeUnsavedPointsIntoList}
                                                onRenameList={handleRenamePointList}
                                                onDeleteList={handleDeletePointList}
                                                onToggleVisibility={handleTogglePointListVisibility}
                                                onToggleContext={handleTogglePointListContext}
                                                onImportPointList={handleImportPointList}
                                                onAddPhotoToPoint={handleAddPhotoToPoint}
                                                onDeletePhotoFromPoint={handleDeletePhotoFromPoint}
                                                onStakeoutPoint={handleStakeoutPoint}
                                                onZoomToPoint={handleZoomToPoint}
                                                nextAvailablePointNumber={nextAvailablePointNumber}
                                                settings={settings}
                                                c3dSessionToken={c3dSessionToken}
                                                onImportPointsFromC3D={handleImportPointsFromC3D}
                                                convertLatLon={convertLatLon}
                                            />
                                        ) : activeAgent === AgentType.GNSS_AGENT ? (
                                            <GNSSProcessingPanel
                                                onClose={() => {}}
                                                hasApiKey={!!settings.userApiKey || hasConfirmedApiKey}
                                                onShowApiKeyModal={() => {
                                                  setApiKeyModalTrigger('rinex');
                                                  setShowApiKeyModal(true);
                                                }}
                                                onGoHome={() => {
                                                  setActiveAgent(null);
                                                  setIsInitialScreen(true);
                                                }}
                                            />
                                        ) : activeAgent === AgentType.DRONE_AGENT ? (
                                            isRestrictedApiKey ? (
                                              <div className="max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
                                                <h2 className="mb-2 text-2xl font-bold text-amber-300">Drone Agent unavailable for this key</h2>
                                                <p className="text-sm text-amber-100/90">
                                                  This API key is restricted from drone photogrammetry processing. Use a full-access key if you need Drone Agent or RINEX processing.
                                                </p>
                                              </div>
                                            ) : (
                                              <DroneProcessingPanel onClose={() => {}} />
                                            )
                                        ) : undefined
                                    }
                                    toolsIcon={
                                        activeAgent === AgentType.COGO_AGENT ? <CrosshairsIcon className="w-4 h-4" /> :
                                        activeAgent === AgentType.CENTERLINE_STATIONING ? <ScaleIcon className="w-4 h-4" /> :
                                        activeAgent === AgentType.CONTOURING_AGENT ? <ContourIcon className="w-4 h-4" /> :
                                      activeAgent === AgentType.STEEP_SLOPE_AGENT ? <SlopeIcon className="w-4 h-4" /> :
                                        activeAgent === AgentType.POINT_EDITOR ? <MapPinIcon className="w-4 h-4" /> :
                                        activeAgent === AgentType.GNSS_AGENT ? <SatelliteIcon className="w-4 h-4" /> :
                                        activeAgent === AgentType.DRONE_AGENT ? <DroneIcon className="w-4 h-4" /> :
                                        undefined
                                    }
                                    toolsTitle={
                                        activeAgent === AgentType.COGO_AGENT ? 'COGO Tools' :
                                        activeAgent === AgentType.CENTERLINE_STATIONING ? 'Stationing Tools' :
                                        activeAgent === AgentType.CONTOURING_AGENT ? 'Contour Tools' :
                                      activeAgent === AgentType.STEEP_SLOPE_AGENT ? 'Steep Slope Tools' :
                                        activeAgent === AgentType.POINT_EDITOR ? 'Point Tools' :
                                        activeAgent === AgentType.GNSS_AGENT ? 'RINEX Tools' :
                                        activeAgent === AgentType.DRONE_AGENT ? 'Drone Tools' :
                                        undefined
                                    }
                                />
                            </div>
                        </div>
                    )}
                    
                    {!isChatPanelVisible && (
                        <button
                            ref={fabRef}
                            onClick={handleFabClick}
                            onMouseDown={handleFabPointerDown as any}
                            onTouchStart={handleFabPointerDown as any}
                            className={`fixed p-4 rounded-full bg-gray-800/80 border-2 border-${color}-400 text-white shadow-lg transition-transform duration-200 z-30 ${isLoading ? 'animate-pulse-thinking' : 'animate-pulse-border'}`}
                            style={{
                                left: fabPosition.initialized ? fabPosition.x : undefined,
                                top: fabPosition.initialized ? fabPosition.y : undefined,
                                right: fabPosition.initialized ? undefined : '1.5rem',
                                bottom: fabPosition.initialized ? undefined : '1.5rem',
                                transform: fabDragState.current.hasMoved ? 'translate3d(0, 0, 0) scale(1.1)' : 'translate3d(0, 0, 0) scale(1)',
                                touchAction: 'none',
                                willChange: 'transform',
                                '--pulse-color': rgbColor,
                            } as React.CSSProperties}
                            title="Show Chat"
                        >
                            <ActiveAgentIcon className="w-6 h-6" />
                        </button>
                    )}
                </div>
            )}
          </main>
          
          {isSettingsVisible && <Suspense fallback={<LoadingFallback />}><SettingsPage settings={settings} onSettingsChange={setSettings} onClose={() => { setIsSettingsVisible(false); setPulseApiKey(false); }} onReset={handleReset} activeAgent={activeAgent} activeModel={activeModel} availableModels={visibleAvailableModels} onModelChange={handleModelChange} jobInfo={jobInfo} onJobInfoChange={setJobInfo} pulseProjection={pulseProjection} pulseApiKey={pulseApiKey} onApiKeySubmit={handleSettingsApiKeySubmit} onProviderKeySubmit={handleProviderKeySubmit} isSuperUser={isSuperUser} hasApiKey={hasApiKey} autoHighThinkingModel={autoHighThinkingModel} autoHighThinkingOptions={visibleAutoHighThinkingOptions} onAutoHighThinkingModelChange={(model) => {
            if (!confirmFableSelection(model)) return;
            setAutoHighThinkingModel(model);
          }} onTriggerHostCostReminder={() => setShowHostCostReminder(true)} /></Suspense>}

          {/* LandSurv Claw: live browser-tool status (Zoning Agent only; backend-dependent, hidden in OSS build) */}
          {!isOssBuild() && <ClawStatusBadge visible={activeAgent === AgentType.ZONING_AGENT} />}

          {/* TOS-restricted hosts are HARD-BLOCKED at the clawClient layer.
              This toast surfaces any blocked attempt so the user knows the
              agent tried, and can read the source manually in their own
              browser if they wish. Always mounted; self-hides when idle. */}
          <SourceBlockedNotice />

          {/* Modal explainer of the permissive-source policy. Opens from the
              toast's �Why?� button, from the ClawStatusBadge footer link, or
              from `window.__landsurvLegal.open()`. Always mounted. */}
          <PermissiveSourcesExplainer />
          
          {/* Model Config Popup - Quick access to current model info and Gemini settings */}
          {showModelConfigPopup && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowModelConfigPopup(false)}>
              <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">Model Configuration</h2>
                  <button onClick={() => setShowModelConfigPopup(false)} className="text-gray-400 hover:text-white">
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-700/50 rounded-lg">
                    <div className="text-sm text-gray-400 mb-1">Selected Mode</div>
                    <div className="text-lg font-semibold text-purple-400">
                      {isAutoRoutingForActive ? 'Auto' : getModelDisplayLabel(currentModelName)}
                    </div>
                  </div>
                  {isAutoRoutingForActive ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-gray-600 bg-gray-700/40 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fast route</div>
                          <div className="mt-1 font-semibold text-cyan-300">Gemini 3.5 Flash Lite</div>
                          <p className="mt-1 text-xs text-gray-400">Used automatically for lighter, lower-reasoning tasks.</p>
                        </div>
                        <div className="rounded-lg border border-gray-600 bg-gray-700/40 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">High-thinking route</div>
                          <div className="mt-1 font-semibold text-purple-300">{getModelDisplayLabel(autoHighThinkingModel)}</div>
                          <p className="mt-1 text-xs text-gray-400">Used automatically for complex agents and reasoning-heavy work.</p>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="modelPopupHighThinking" className="mb-1 block text-sm font-medium text-gray-300">
                          High-thinking model
                        </label>
                        <select
                          id="modelPopupHighThinking"
                          value={autoHighThinkingModel}
                          onChange={(event) => {
                            const model = event.target.value;
                            if (!confirmFableSelection(model)) return;
                            setAutoHighThinkingModel(model);
                          }}
                          className="w-full rounded-lg border border-gray-600 bg-gray-700 p-2 text-sm text-gray-100"
                        >
                          {visibleAutoHighThinkingOptions.map(model => (
                            <option key={model} value={model}>{getModelDisplayLabel(model)}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelConfigPopup(false);
                          if (isClaudeModel(autoHighThinkingModel)) {
                            openClaudeModelSettings(autoHighThinkingModel as ClaudeModel);
                          } else {
                            setShowGemini3Panel(true);
                          }
                        }}
                        className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white transition-colors hover:bg-blue-500"
                      >
                        Configure {getModelDisplayLabel(autoHighThinkingModel)}
                      </button>
                    </>
                  ) : (
                    <div className="text-sm text-gray-300">
                      <p>{getModelDisplayLabel(currentModelName)} is the only model selected for this agent.</p>
                      {currentModelName === AUTO_FAST_GEMINI_MODEL && (
                        <p className="mt-2 text-gray-400">Flash Lite uses fixed balanced settings optimized for fast, lower-reasoning work.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {!showWelcome && isDocVisible && <Suspense fallback={<LoadingFallback />}><LsvzDocumentation onClose={() => setIsDocVisible(false)} activeAgent={activeAgent} /></Suspense>}
          {!showWelcome && isTechPageVisible && <Suspense fallback={<LoadingFallback />}><TechnologiesPage onClose={() => setIsTechPageVisible(false)} activeAgent={activeAgent}/></Suspense>}
          {!showWelcome && isInvestorFormVisible && <InvestorInquiryForm onClose={() => setIsInvestorFormVisible(false)} activeAgent={activeAgent} />}
          {!showWelcome && isReleaseLogVisible && <Suspense fallback={<LoadingFallback />}><ReleaseLog onClose={() => setIsReleaseLogVisible(false)} activeAgent={activeAgent} /></Suspense>}
          {/* Experimental Gemini 3 controls � visible for Civil Plan Expert, Boundary Agent, and Civil Drafter when gemini-3.x is selected. Toggle from the chat header "Gemini 3" button. */}
          {!showWelcome && canConfigureGemini3 && showGemini3Panel && (
            <Gemini3ControlsPanel activeAgent={activeAgent} onClose={() => setShowGemini3Panel(false)} />
          )}
          {!showWelcome && activeAgent === AgentType.CIVIL_DRAFTER && showCivilDrafterContextPanel && (
            <CivilDrafterContextPanel
              volume={civilDrafterContextVolume}
              modelName={currentModelName}
              onClose={() => setShowCivilDrafterContextPanel(false)}
            />
          )}
          {!showWelcome && cacpManifestAgent && (
            <CacpManifestModal agent={cacpManifestAgent} onClose={() => setCacpManifestAgent(null)} />
          )}
          {!showWelcome && isHelpModalVisible && <HelpModal onClose={() => setIsHelpModalVisible(false)} activeAgent={activeAgent} onShowAbout={showAbout} onShowForwardThinking={showForwardThinking} onShowTech={showTech} onShowDisclaimer={showDisclaimer} onShowErrorConsole={() => setIsErrorConsoleVisible(true)} onShowReleaseLog={showReleaseLog} />}
          {!showWelcome && isAboutVisible && <AboutPage onClose={() => setIsAboutVisible(false)} onShowTech={showTech} onShowDoc={showDoc} onShowReleaseLog={showReleaseLog} />}
          {!showWelcome && isForwardThinkingVisible && <ForwardThinkingPage onClose={() => setIsForwardThinkingVisible(false)} />}
          {!showWelcome && isDisclaimerVisible && <DisclaimerPage onClose={() => setIsDisclaimerVisible(false)} />}
          {!showWelcome && isLegalPageVisible && <LegalPage onClose={() => setIsLegalPageVisible(false)} />}
          {!showWelcome && showLegalGate && (
            <LegalAgreementGate
              onSigned={() => {
                setHasLegalSignature(true);
                setShowLegalGate(false);
                const pendingLaunch = pendingLegalLaunchRef.current;
                pendingLegalLaunchRef.current = null;
                if (pendingLaunch) handleLaunchAgenticCad(pendingLaunch);
              }}
            />
          )}
          {isFloodPanelVisible && (
            <FloatingPanel
              title="Flood Zone Agent"
              onClose={() => setIsFloodPanelVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 480) : 120}
              initialY={120}
            >
              <FloodPanel
                onFetchFloodZones={handleFetchFloodZones}
                isFetching={isFetchingFlood}
                hasInclusionBoundary={lines.some((l: SurveyLine) => l.type === 'inclusion')}
                inclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'inclusion').length}
                lastResult={lastFloodResult}
                onClearFloodLines={handleClearFloodLines}
                inclusionBoundaries={inclusionBoundaries}
                activeInclusionBoundaryId={activeInclusionBoundaryId}
                onSelectInclusionBoundary={setActiveInclusionBoundaryId}
                onManageInclusionBoundaries={() => setIsInclusionBoundariesPanelVisible(true)}
                floodHatch={settings.floodHatch}
                onFloodHatchChange={(patch) => setSettings(prev => ({
                  ...prev,
                  floodHatch: { style: 'lines', scale: 50, opacity: 0.18, ...(prev.floodHatch ?? {}), ...patch },
                }))}
                onFetchFirmette={handleFetchFirmette}
                isFetchingFirmette={isFetchingFirmette}
                hasFirmette={!!floodFirmetteData}
                onViewFirmette={() => setIsFirmetteViewerVisible(true)}
              />
            </FloatingPanel>
          )}
          {/* FIRMETTE viewer (v26.05.19.1) � cached FEMA NFHL map image */}
          {isFirmetteViewerVisible && floodFirmetteData && (
            <FloatingPanel
              title="FEMA FIRMETTE"
              accentBorder="border-indigo-500/40"
              onClose={() => setIsFirmetteViewerVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(40, window.innerWidth / 2 - 240) : 80}
              initialY={60}
              width="min(500px, 96vw)"
              maxHeight="90vh"
            >
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] truncate text-gray-500">bbox: {floodFirmetteData.bbox}</span>
                  <a
                    href={floodFirmetteData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 ml-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-900/50 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-800/60"
                  >
                    Open in new tab ?
                  </a>
                </div>
                <img
                  src={floodFirmetteData.imageDataUrl ?? floodFirmetteData.url}
                  alt="FEMA FIRMETTE"
                  className="w-full rounded border border-gray-700 shadow-lg"
                  style={{ imageRendering: 'crisp-edges' }}
                />
                <p className="text-[10px] text-gray-600 text-center">
                  Source: FEMA NFHL � fetched {new Date(floodFirmetteData.fetchedAt).toLocaleString()} � stored in .lsvz
                </p>
              </div>
            </FloatingPanel>
          )}
          {isStructuresPanelVisible && (
            <FloatingPanel
              title="Structures Agent"
              onClose={() => setIsStructuresPanelVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 480) : 120}
              initialY={160}
            >
              <StructuresPanel
                onFetchStructures={handleFetchStructures}
                isFetching={isFetchingStructures}
                hasInclusionBoundary={lines.some((l: SurveyLine) => l.type === 'inclusion')}
                inclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'inclusion').length}
                lastResult={lastStructuresResult}
                osmFootprintCount={lastOsmFootprints?.length ?? 0}
                lastRectifyStats={lastRectifyStats}
                onClearStructures={handleClearStructures}
                onSynthesize={handleSynthesizeStructures}
                isSynthesizing={isSynthesizingStructures}
                surveyBldgCount={points.filter((p: SurveyPoint) =>
                  (p.description?.toUpperCase().includes('BLDG') || (p.layer ?? '').toUpperCase().includes('BLDG'))
                ).length}
                inclusionBoundaries={inclusionBoundaries}
                activeInclusionBoundaryId={activeInclusionBoundaryId}
                onSelectInclusionBoundary={setActiveInclusionBoundaryId}
                onManageInclusionBoundaries={() => setIsInclusionBoundariesPanelVisible(true)}
              />
            </FloatingPanel>
          )}
          {/* Soils Agent � SSURGO soil map-unit overlay floating panel */}
          {isSoilsPanelVisible && (
            <FloatingPanel
              title="Soils Agent"
              onClose={() => setIsSoilsPanelVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 480) : 120}
              initialY={220}
            >
              <SoilsPanel
                onFetchSoils={handleFetchSoils}
                isFetching={isFetchingSoils}
                hasInclusionBoundary={lines.some((l: SurveyLine) => l.type === 'inclusion')}
                lastResult={lastSoilsResult}
                onClearSoils={handleClearSoilsLines}
                soilMapUnits={soilMapUnits}
                onFetchReport={handleFetchSoilReport}
                isFetchingReport={isFetchingSoilReport}
                soilReportData={soilReportData}
                inclusionBoundaries={inclusionBoundaries}
                activeInclusionBoundaryId={activeInclusionBoundaryId}
                onSelectInclusionBoundary={setActiveInclusionBoundaryId}
              />
            </FloatingPanel>
          )}
          {/* Profile Agent � client-side profile generator panel */}
          {isProfileGenPanelVisible && (
            <ProfileGenerationPanel
              allPoints={pointLists.flatMap((l: import('./types.ts').PointList) => l.points)}
              profilePointCount={profileData?.length ?? 0}
              profileElevMin={profileData && profileData.length > 0 ? Math.min(...profileData.map((p: import('./types.ts').ProfilePoint) => p.elevation)) : undefined}
              profileElevMax={profileData && profileData.length > 0 ? Math.max(...profileData.map((p: import('./types.ts').ProfilePoint) => p.elevation)) : undefined}
              profileLength={profileData && profileData.length > 0 ? Math.max(...profileData.map((p: import('./types.ts').ProfilePoint) => p.station)) : undefined}
              profileName={profileInfo?.name}
              isGenerating={false}
              onGenerateProfile={handleGenerateProfileDirect}
              onViewProfile={() => showView('profile')}
              onSaveProfile={handleSaveProfile}
              onClose={() => setIsProfileGenPanelVisible(false)}
            />
          )}
          {/* GPS Rover � independent Stakeout floating panel (v26.05.19.1) */}
          {isGpsStakeoutFloatingVisible && (
            <FloatingPanel
              title="? Stakeout"
              accentBorder="border-blue-500/50"
              onClose={() => setIsGpsStakeoutFloatingVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(20, window.innerWidth / 2 - 220) : 80}
              initialY={80}
              width="min(460px, 96vw)"
              maxHeight="88vh"
            >
              <GpsStakeoutPanel
                isOverlay={false}
                currentPosition={currentPosition}
                projectedPosition={projectedPosition}
                projectPoints={points}
                pointLists={pointLists}
                onStorePoint={handleStoreGpsPoint}
                onStoreStakedPoint={handleStoreStakedGpsPoint}
                settings={settings}
                targetPointNumber={stakeoutTargetPointNumber}
                setTargetPointNumber={setStakeoutTargetPointNumber}
                nextAvailablePointNumber={nextAvailablePointNumber}
                initialTab="stakeout"
                lockedTab
              />
            </FloatingPanel>
          )}
          {/* GPS Rover � independent Collect floating panel (v26.05.19.1) */}
          {isGpsCollectFloatingVisible && (
            <FloatingPanel
              title="?? Collect"
              accentBorder="border-emerald-500/50"
              onClose={() => setIsGpsCollectFloatingVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(20, window.innerWidth / 2 + 20) : 80}
              initialY={80}
              width="min(400px, 96vw)"
              maxHeight="88vh"
            >
              <GpsStakeoutPanel
                isOverlay={false}
                currentPosition={currentPosition}
                projectedPosition={projectedPosition}
                projectPoints={points}
                pointLists={pointLists}
                onStorePoint={handleStoreGpsPoint}
                onStoreStakedPoint={handleStoreStakedGpsPoint}
                settings={settings}
                targetPointNumber={stakeoutTargetPointNumber}
                setTargetPointNumber={setStakeoutTargetPointNumber}
                nextAvailablePointNumber={nextAvailablePointNumber}
                initialTab="collect"
                lockedTab
              />
            </FloatingPanel>
          )}
          {shrinkwrap && isShrinkwrapPanelVisible && (
            <FloatingPanel
              title="Shrinkwrap"
              accentBorder="border-violet-500/40"
              onClose={() => setIsShrinkwrapPanelVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 460) : 120}
              initialY={160}
              width="min(380px, 94vw)"
              maxHeight="80vh"
              minimized={isShrinkwrapPanelMinimized}
              onToggleMinimize={() => setIsShrinkwrapPanelMinimized(v => !v)}
              minimizedAnchor="right"
              minimizedOffset={16}
            >
              <ShrinkwrapPanel
                sourceCount={(() => {
                  // Match the recompute pool: visible points ? original sourcePns.
                  const pool = new Set<string>(shrinkwrap.sourcePns);
                  for (const l of pointLists) {
                    if (!l.isVisible) continue;
                    for (const p of l.points) pool.add(p.pointNumber);
                  }
                  return pool.size;
                })()}
                hullCount={(() => {
                  const pts = new Set<string>();
                  for (const l of lines.filter(ll => ll.polylineId === shrinkwrap.polylineId)) {
                    pts.add(l.from); pts.add(l.to);
                  }
                  return pts.size;
                })()}
                layer={shrinkwrap.layer}
                excludedPns={shrinkwrap.excludedPns}
                pendingExcludedPns={shrinkwrap.pendingExcludedPns ?? []}
                concavityK={shrinkwrap.concavityK ?? 15}
                onConcavityChange={(k) => setShrinkwrap(prev => prev ? { ...prev, concavityK: k } : prev)}
                cuts={shrinkwrap.cuts ?? []}
                cutMode={shrinkwrap.cutMode ?? false}
                cutStartPn={shrinkwrap.cutStartPn ?? null}
                onToggleCutMode={() => setShrinkwrap(prev => prev ? {
                  ...prev,
                  cutMode: !prev.cutMode,
                  // Always clear any in-progress cut when toggling the mode.
                  cutStartPn: null,
                } : prev)}
                onFlipCut={(idx) => setShrinkwrap(prev => {
                  if (!prev) return prev;
                  const next = [...(prev.cuts ?? [])];
                  if (!next[idx]) return prev;
                  next[idx] = { ...next[idx], flipped: !next[idx].flipped };
                  return { ...prev, cuts: next };
                })}
                onRemoveCut={(idx) => setShrinkwrap(prev => {
                  if (!prev) return prev;
                  const next = (prev.cuts ?? []).filter((_, i) => i !== idx);
                  return { ...prev, cuts: next };
                })}
                selectedPoint={selectedPoint}
                onStageExclude={(pn) => setShrinkwrap(prev =>
                  prev && !(prev.pendingExcludedPns ?? []).includes(pn)
                    ? { ...prev, pendingExcludedPns: [...(prev.pendingExcludedPns ?? []), pn] }
                    : prev
                )}
                onUnstageExclude={(pn) => setShrinkwrap(prev =>
                  prev ? { ...prev, pendingExcludedPns: (prev.pendingExcludedPns ?? []).filter(x => x !== pn) } : prev
                )}
                onStageRestore={(pn) => setShrinkwrap(prev =>
                  prev ? { ...prev, pendingExcludedPns: (prev.pendingExcludedPns ?? []).filter(x => x !== pn) } : prev
                )}
                onStageRestoreAll={() => setShrinkwrap(prev =>
                  prev ? { ...prev, pendingExcludedPns: [] } : prev
                )}
                onApplyUpdate={() => setShrinkwrap(prev => {
                  if (!prev) return prev;
                  const pending = prev.pendingExcludedPns ?? [];
                  const before = prev.excludedPns.length;
                  const after = pending.length;
                  const delta = after - before;
                  logActionToFieldbook(
                    `Shrinkwrap update via COGO � excluded set now ${after} point(s)` +
                    (delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta} from prior).` : ' (no change).')
                  );
                  return { ...prev, excludedPns: [...pending] };
                })}
                isCommitted={shrinkwrap.isCommitted}
                onDrawInclusion={() => {
                  setShrinkwrap(prev => prev ? {
                    ...prev,
                    excludedPns: [...(prev.pendingExcludedPns ?? [])],
                    isCommitted: true,
                  } : prev);
                  setIsInclusionBoundariesPanelVisible(true);
                  logActionToFieldbook(`Shrinkwrap committed as an inclusion boundary on ${shrinkwrap.layer}.`);
                }}
                onClearShrinkwrap={() => {
                  const pid = shrinkwrap.polylineId;
                  const layer = shrinkwrap.layer;
                  setLines(prev => prev.filter(l =>
                    l.polylineId !== pid && !(l.polylineId || '').startsWith(`${pid}_cut_`)
                  ));
                  setShrinkwrap(null);
                  setIsShrinkwrapPanelVisible(false);
                  logActionToFieldbook(`Shrinkwrap on ${layer} cleared by user.`);
                }}
              />
            </FloatingPanel>
          )}
          {isInclusionBoundariesPanelVisible && (
            <FloatingPanel
              title="Inclusion Boundaries"
              accentBorder="border-emerald-500/40"
              onClose={() => setIsInclusionBoundariesPanelVisible(false)}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 480) : 120}
              initialY={200}
              width="min(420px, 94vw)"
              maxHeight="78vh"
              minimized={isInclusionBoundariesPanelMinimized}
              onToggleMinimize={() => setIsInclusionBoundariesPanelMinimized(v => !v)}
              minimizedAnchor="right"
              minimizedOffset={56}
            >
              <InclusionBoundariesPanel
                boundaries={inclusionBoundaries}
                activeBoundaryId={activeInclusionBoundaryId}
                segmentCounts={(() => {
                  const m: Record<string, number> = {};
                  for (const l of lines) {
                    if (l.type === 'inclusion' && l.polylineId) {
                      m[l.polylineId] = (m[l.polylineId] || 0) + 1;
                    }
                  }
                  return m;
                })()}
                visibility={(() => {
                  const v: Record<string, boolean> = {};
                  for (const b of inclusionBoundaries) {
                    const any = lines.find(l => l.polylineId === b.polylineId);
                    v[b.polylineId] = any ? !any.hidden : true;
                  }
                  return v;
                })()}
                onSetActive={(id) => setActiveInclusionBoundaryId(id)}
                onRename={(id, name) => setInclusionBoundaries(prev =>
                  prev.map(b => b.id === id ? { ...b, name } : b)
                )}
                onToggleVisible={(id) => {
                  const b = inclusionBoundaries.find(x => x.id === id);
                  if (!b) return;
                  // Determine current visibility from ANY line in the group,
                  // then write the inverted state to EVERY line in the group.
                  const any = lines.find(l => l.polylineId === b.polylineId);
                  const isHidden = !!(any && any.hidden);
                  const nextHidden = !isHidden;
                  setLines(prev => prev.map(l =>
                    l.polylineId === b.polylineId
                      ? { ...l, hidden: nextHidden ? true : undefined }
                      : l
                  ));
                }}
                onDelete={(id) => {
                  const b = inclusionBoundaries.find(x => x.id === id);
                  if (!b) return;
                  setLines(prev => prev.filter(l => l.polylineId !== b.polylineId));
                  // auto-register effect will drop the entry on next pass
                  if (activeInclusionBoundaryId === id) setActiveInclusionBoundaryId(null);
                  // also close any active shrinkwrap session for this group
                  setShrinkwrap(prev => prev && prev.polylineId === b.polylineId ? null : prev);
                }}
                onAdjust={(id) => {
                  // Reopen the Shrinkwrap editor for an existing boundary. We
                  // rebuild the source-point list from the unique endpoints of
                  // its inclusion lines (the current hull vertices). The user
                  // can then exclude / restore points and the hull live-updates.
                  const b = inclusionBoundaries.find(x => x.id === id);
                  if (!b) return;
                  const groupLines = lines.filter(l => l.polylineId === b.polylineId);
                  if (groupLines.length === 0) return;
                  const pnSet = new Set<string>();
                  for (const l of groupLines) { if (l.from) pnSet.add(l.from); if (l.to) pnSet.add(l.to); }
                  const sourcePns = Array.from(pnSet);
                  const layer = groupLines[0].layer || 'L-SURV-SHRINKWRAP';
                  setShrinkwrap({ sourcePns, excludedPns: [], pendingExcludedPns: [], concavityK: 15, cuts: [], cutMode: false, cutStartPn: null, layer, isCommitted: true, polylineId: b.polylineId });
                  setIsShrinkwrapPanelVisible(true);
                  setIsShrinkwrapPanelMinimized(false);
                  setActiveInclusionBoundaryId(id);
                  logActionToFieldbook(`Reopened "${b.name}" in Shrinkwrap editor (${sourcePns.length} source points).`);
                }}
              />
            </FloatingPanel>
          )}
          {activeAgent === AgentType.CONTOURING_AGENT && isContourGenPanelVisible && (
            <FloatingPanel
              title="Contour Generation"
              accentBorder="border-amber-500/30"
              onClose={() => setIsContourGenPanelVisible(false)}
              minimized={isContourGenMinimized}
              onToggleMinimize={() => setIsContourGenMinimized(v => !v)}
              minimizedAnchor="left"
              minimizedOffset={16}
              initialX={typeof window !== 'undefined' ? Math.max(80, window.innerWidth - 880) : 80}
              initialY={100}
              width="min(420px, 94vw)"
              maxHeight="84vh"
            >
              <ContourGenerationPanel
                settings={contourSettings}
                onSettingsChange={setContourSettings}
                onGenerate={handleGenerateContours}
                isGenerating={isGeneratingContours}
                points={points}
                inclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'inclusion').length}
                breaklineCount={lines.filter((l: SurveyLine) => l.type === 'breakline').length}
                exclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'exclusion').length}
                inclusionBoundaries={inclusionBoundaries}
                activeInclusionBoundaryId={activeInclusionBoundaryId}
                onSelectInclusionBoundary={setActiveInclusionBoundaryId}
                onManageInclusionBoundaries={() => setIsInclusionBoundariesPanelVisible(true)}
              />
            </FloatingPanel>
          )}
          {activeAgent === AgentType.CONTOURING_AGENT && isContourEsriPanelVisible && (
            <FloatingPanel
              title="ESRI REST Contour Sources"
              accentBorder="border-teal-500/30"
              onClose={() => setIsContourEsriPanelVisible(false)}
              minimized={isContourEsriMinimized}
              onToggleMinimize={() => setIsContourEsriMinimized(v => !v)}
              minimizedAnchor="right"
              minimizedOffset={16}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 460) : 120}
              initialY={140}
              width="min(440px, 94vw)"
              maxHeight="82vh"
            >
              <ContourEsriPanel
                settings={contourSettings}
                onSettingsChange={setContourSettings}
                onDiscoverPublicServices={handleDiscoverPublicContourServices}
                isDiscovering={isDiscoveringContourServices}
                discoveredServices={discoveredContourServices}
                hasInclusionBoundary={lines.some((l: SurveyLine) => l.type === 'inclusion')}
                inclusionSegmentCount={lines.filter((l: SurveyLine) => l.type === 'inclusion').length}
                hasProjectProjection={!!settings.projection?.epsg}
                isFetchingEsri={isFetchingEsri}
                onFetchEsriContours={handleFetchEsriContours}
              />
            </FloatingPanel>
          )}
          {activeAgent === AgentType.STEEP_SLOPE_AGENT && isSteepSlopePanelVisible && (
            <FloatingPanel
              title="Steep Slope"
              accentBorder="border-rose-500/30"
              onClose={() => setIsSteepSlopePanelVisible(false)}
              minimized={isSteepSlopePanelMinimized}
              onToggleMinimize={() => setIsSteepSlopePanelMinimized(v => !v)}
              minimizedAnchor="right"
              minimizedOffset={16}
              initialX={typeof window !== 'undefined' ? Math.max(120, window.innerWidth - 460) : 120}
              initialY={160}
              width="min(440px, 94vw)"
              maxHeight="84vh"
            >
              <SteepSlopePanel
                tinSurfaces={steepSlopeTinSurfaces}
                onToggleTinSurfaceVisibility={handleToggleSteepSlopeTinSurfaceVisibility}
                onRunAnalysis={handleRunSteepSlopeFromPanel}
                inclusionBoundaries={inclusionBoundaries}
                steepSlopeSegmentCount={steepSlopeSegmentCount}
                onToggleGeometryVisibility={handleToggleSteepSlopeGeometryVisibility}
                onClearGeometry={handleClearSteepSlopeGeometry}
                onOpenReport={handleOpenSteepSlopeReport}
              />
            </FloatingPanel>
          )}
          {showWelcome && (
            <WelcomeScreen 
              version={APP_VERSION} 
              initialMode={welcomeInitialMode}
              onClose={() => {
                setShowWelcome(false);
                setWelcomeInitialMode('main');
              }}
              onLaunchAgenticCad={handleLaunchAgenticCad}
              onGoHome={handleGoHome}
              hasExistingPoints={pointLists.some(l => l.points.length > 0)}
              existingPointCount={pointLists.reduce((sum, l) => sum + l.points.length, 0)}
            />
          )}

          {/* Periodic 15-minute Host Cost Reminder Popup */}
          <HostCostReminderModal
            isOpen={!showWelcome && showHostCostReminder && !hasLsaiEnablingKey && !hasServiceAccess && !hasLandSurvKey && !isSuperUser}
            onClose={() => setShowHostCostReminder(false)}
            onOpenUpgrade={() => {
              setShowHostCostReminder(false);
              setShowUpgradeModal(true);
            }}
            onOpenOpenSource={() => {
              setShowHostCostReminder(false);
              setWelcomeInitialMode('free-code');
              setShowWelcome(true);
            }}
          />
          {!showWelcome && isErrorConsoleVisible && <ErrorConsole isOpen={isErrorConsoleVisible} onClose={() => setIsErrorConsoleVisible(false)} />}
          {!showWelcome && isReleaseStagesModalVisible && <ReleaseStagesModal isOpen={isReleaseStagesModalVisible} onClose={() => setIsReleaseStagesModalVisible(false)} />}

          {/* Contour Generations Manager � persistent across agents (v26.05.19.3) */}
          {!showWelcome && isContourManagementVisible && (
            <ContourManagementPanel
              generations={contourGenerations}
              inclusionBoundaries={inclusionBoundaries}
              onToggleVisible={handleContourGenToggleVisible}
              onRename={handleContourGenRename}
              onSetColor={handleContourGenSetColor}
              onSetOpacity={handleContourGenSetOpacity}
              onToggleEsriBlend={handleContourGenToggleBlend}
              onSetEsriBlendPolylineId={handleContourGenSetBlendPolylineId}
              onDelete={handleContourGenDelete}
              onNewGeneration={() => setIsContourGenPanelVisible(true)}
              onClose={() => setIsContourManagementVisible(false)}
            />
          )}

          {/* Claude 4.7 Vertex AI settings panel (v26.05.19.3) */}
          {!showWelcome && isClaudeSettingsVisible && (
            <ClaudeSettingsPanel
              selectedModel={claudeSettingsModel || undefined}
              lockModel={Boolean(claudeSettingsModel)}
              onClose={() => {
                setIsClaudeSettingsVisible(false);
                setClaudeSettingsModel(null);
              }}
            />
          )}
          
          {/* Dedicated Keys Modal */}
          <ApiKeyOrPayModal 
            isOpen={!shouldSuppressApiKeyModal && !showWelcome && showApiKeyModal} 
            onSubmitApiKey={handleApiKeySubmit}
            onSubmitServiceKey={handleServiceKeySubmit}
            trigger={apiKeyModalTrigger}
            initialTab={apiKeyModalInitialTab}
            onOpenUpgrade={() => {
              setShowApiKeyModal(false);
              setShowUpgradeModal(true);
            }}
            computeCredits={computeCredits}
            hasGoogleApiKey={Boolean(settings.userApiKey && !isDemoApiKey(settings.userApiKey))}
            hasLandSurvKey={hasLandSurvKey}
            hasServiceAccess={hasServiceAccess}
            serviceAccessExpiresAt={serviceAccessExpiresAt}
            isFreeTierLocked={isFreeTierTimeLocked}
            remainingTime={remainingTime}
            timeUntilAvailable={timeUntilAvailable}
            currentKeyDetails={currentKeyDetails}
            customerEmail={appUserEmail}
            isPremium={apiKeyModalTrigger === 'rinex' || apiKeyModalTrigger === 'lsvz'}
            onGoHome={() => {
              // Close modal and reset to initial screen
              setShowApiKeyModal(false);
              setActiveAgent(null);
              setIsInitialScreen(true);
            }}
            onClose={() => {
              setShowApiKeyModal(false);
              // If locked, X acts the same as Browse Without Key
              if (isFreeTierTimeLocked && !isSuperUser) setIsLockDismissed(true);
            }}
            onDismiss={isFreeTierTimeLocked && !isSuperUser ? () => {
              setIsLockDismissed(true);
              setShowApiKeyModal(false);
            } : undefined}
          />

          {/* Dedicated Upgrade and Payment Modal */}
          <UpgradeModal
            isOpen={!showWelcome && showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            onOpenKeyModal={() => {
              setShowUpgradeModal(false);
              setShowApiKeyModal(true);
            }}
            onSubmitApiKey={handleApiKeySubmit}
            customerEmail={appUserEmail}
            hasServiceAccess={hasServiceAccess}
            serviceAccessExpiresAt={serviceAccessExpiresAt}
            computeCredits={computeCredits}
            onProceedWithPayment={async (creditPackage: '1K' | '5K' | '10K') => {
              try {
                let appUserId = localStorage.getItem('landsurv_user_id');
                if (!appUserId) {
                  appUserId = crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
                  localStorage.setItem('landsurv_user_id', appUserId);
                }

                const frontendUrl = window.location.origin;
                const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                  ? '/api'
                  : 'https://landsurv-backend-237999774959.us-west1.run.app';
                
                const fullUrl = `${backendUrl}/api/billing/purchase-credits`;
                
                const resp = await fetch(fullUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': appUserId,
                    'x-user-email': settings.userApiKey ? `${appUserId}@landsurv.ai` : '',
                  },
                  body: JSON.stringify({ creditPackage, successUrl: `${frontendUrl}/checkout/success?type=credits&credits=${creditPackage}`, cancelUrl: `${frontendUrl}/checkout/cancel?type=credits` }),
                });
                
                if (!resp.ok) {
                  const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
                  throw new Error(err.message || 'Failed to create checkout session');
                }
                const data = await resp.json();
                
                if (data?.url) {
                  window.location.href = data.url;
                } else if (data?.sessionId) {
                  window.location.href = `https://checkout.stripe.com/pay/${data.sessionId}`;
                } else if (data?.checkoutUrl) {
                  window.location.href = data.checkoutUrl;
                } else {
                  throw new Error('Invalid response from backend - no redirect URL');
                }
              } catch (e: any) {
                alert('Failed to start checkout flow: ' + (e?.message || 'Unknown error'));
                setShowUpgradeModal(true);
              }
            }}
            onProceedWithCheckout={async (selection: CheckoutSelection) => {
              const customerEmail = selection.customerEmail?.trim().toLowerCase();
              if (selection.servicePlan && !customerEmail) {
                throw new Error('Enter a valid email address for service access');
              }

              let userId = localStorage.getItem('landsurv_user_id');
              if (!userId) {
                userId = crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
                localStorage.setItem('landsurv_user_id', userId);
              }

              const recaptchaToken = await executeCheckoutRecaptcha();
              const checkoutType = selection.servicePlan && selection.creditPackage
                ? 'bundle'
                : selection.servicePlan ? 'service' : 'credits';
              const successParams = new URLSearchParams({ type: checkoutType });
              if (selection.servicePlan) successParams.set('service', selection.servicePlan);
              if (selection.creditPackage) successParams.set('credits', selection.creditPackage);
              const response = await fetch('/api/billing/purchase-bundle', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-idempotency-key': crypto?.randomUUID
                    ? crypto.randomUUID()
                    : `checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  'x-recaptcha-token': recaptchaToken,
                },
                body: JSON.stringify({
                  ...selection,
                  userId,
                  customerEmail,
                  successUrl: `${window.location.origin}/checkout/success?${successParams.toString()}`,
                  cancelUrl: `${window.location.origin}/checkout/cancel?type=${checkoutType}`,
                }),
              });
              const result = await response.json().catch(() => null);
              if (!response.ok) {
                throw new Error(result?.error || `Checkout failed (HTTP ${response.status})`);
              }
              if (typeof result?.url !== 'string') {
                throw new Error('Checkout session was created but no redirect URL was returned');
              }
              window.location.href = result.url;
            }}
          />

          {/* BYOK API Key Confirmation Modal (Google / OpenAI / xAI / Anthropic) */}
          {!showWelcome && showApiKeyConfirmation && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-gray-800 border border-cyan-500 rounded-lg shadow-xl p-6 max-w-md w-full animate-modal-panel-fade-in-down">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">Using Your API Key</h3>
                <p className="text-gray-300 mb-4">
                  You have configured your own {PROVIDER_LABELS[pendingKeyProvider]} API key. Using this key will incur costs on your {PROVIDER_LABELS[pendingKeyProvider]} account based on your usage. The key is stored only in this browser and sent directly to {PROVIDER_LABELS[pendingKeyProvider]} � never to LandSurv servers.
                </p>
                <p className="text-gray-400 text-sm mb-6">
                  You can change or remove your API key in Settings at any time.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowApiKeyConfirmation(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setHasConfirmedApiKey(true);
                      setShowApiKeyConfirmation(false);
                      addNotification({
                        kind: 'api-key',
                        severity: 'info',
                        title: `${PROVIDER_LABELS[pendingKeyProvider]} key confirmed`,
                        message: `Your ${PROVIDER_LABELS[pendingKeyProvider]} API key is active and ready to use.`,
                      });
                    }}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 font-semibold"
                  >
                    I Understand, Continue
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* FIX: Passed missing onExport and defaultFileName props to DxfExportModal to resolve a TypeScript error. */}
          {!showWelcome && isDxfExportModalOpen && <DxfExportModal
            isOpen={isDxfExportModalOpen}
            onClose={() => setIsDxfExportModalOpen(false)}
            onExport={handleExportDxf}
            defaultFileName={defaultFileNameBase}
          />}
          {!showWelcome && isSessionSaveModalOpen && <SessionSaveModal
            isOpen={isSessionSaveModalOpen}
            onClose={() => setIsSessionSaveModalOpen(false)}
            onSave={handleSaveSession}
            defaultFileName={defaultFileNameBase}
            defaultAuthor={settings.defaultCutSheetInfo?.crewChief || ''}
            jobName={jobInfo.jobName}
            jobNumber={jobInfo.jobNo}
            activeAgent={activeAgent}
            associatedFiles={[rawFile?.name, deedFile?.name, centerlines[0]?.name]}
          />}
           {!showWelcome && projectionPrompt && <ProjectionSelectionModal onConfirm={handleConfirmProjection} onClose={() => setProjectionPrompt(null)} />}

          {/* C3D Sync Center — webapp-side sync wizard (Phase 2) */}
          <C3DSyncCenter
            isOpen={!showWelcome && showSyncCenter}
            onClose={() => setShowSyncCenter(false)}
            isC3DConnected={isC3DConnected}
            sendToC3D={sendToC3D}
            pointLists={pointLists}
            lines={lines}
            centerlines={centerlines}
            customSymbols={customSymbols}
            streetLabels={streetLabels}
            parcelLabels={parcelLabels}
            cadLayers={cadManagerState.standard?.layers ?? []}
            applyLsaiActions={applyLsaiActions}
            loadBaseline={loadSyncBaseline}
            saveBaseline={saveSyncBaseline}
          />

          {confirmationModal && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-gray-800 border border-yellow-500 rounded-lg shadow-xl p-6 max-w-md w-full animate-modal-panel-fade-in-down">
                <h3 className="text-lg font-bold text-yellow-400">Point Number Conflict</h3>
                <p className="text-gray-300 mt-2">Point <strong className="font-mono">{confirmationModal.newPoint.pointNumber}</strong> already exists in your project. What would you like to do?</p>
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={handleCancelOverwrite} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md">Cancel</button>
                  <button onClick={handleRenumberAndStorePoint} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md">Renumber &amp; Store</button>
                  <button onClick={handleOverwritePoint} className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md">Overwrite</button>
                </div>
              </div>
            </div>
          )}

          {/* Closure investigation modal � deterministic geometry findings plus
              source-aware, review-only hypotheses. */}
          {closureInvestigation && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-gray-800 border border-amber-500 rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-modal-panel-fade-in-down">
                <h3 className="text-lg font-bold text-amber-400">
                  Closure Investigation � {closureInvestigation.fileName}
                </h3>
                <p className="text-gray-300 text-sm mt-1">
                  {closureInvestigation.ambiguities.length === 0
                    ? 'No deterministic geometry issues detected.'
                    : `${closureInvestigation.ambiguities.length} geometry item(s) flagged.`}
                </p>
                {closureInvestigation.ambiguities.length > 0 && (
                  <ul className="mt-4 max-h-64 overflow-y-auto space-y-2 text-xs">
                    {closureInvestigation.ambiguities.map(a => (
                      <li key={a.id} className="p-2 rounded border border-gray-700 bg-gray-900/50">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.severity === 'error' ? 'bg-rose-700 text-rose-100' : a.severity === 'warning' ? 'bg-amber-700 text-amber-100' : 'bg-sky-700 text-sky-100'}`}>
                            {a.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold text-gray-200">{a.kind}</span>
                        </div>
                        <p className="mt-1 text-gray-400">{a.reason}</p>
                        {a.proposedFix && (
                          <p className="mt-1 text-gray-500 italic">Computed possibility: {a.proposedFix.summary}. This is not applied automatically.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-bold text-sky-300">Deed evidence review</h4>
                  {closureInvestigation.reviewStatus === 'loading' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                      Comparing the traverse with the source deed and testing likely transcription errors�
                    </div>
                  )}
                  {closureInvestigation.reviewStatus === 'unavailable' && (
                    <p className="mt-2 text-sm text-amber-300">
                      Source review unavailable: {closureInvestigation.reviewError}
                    </p>
                  )}
                  {closureInvestigation.humanReview && (
                    <>
                      <p className="mt-2 text-sm text-gray-200">{closureInvestigation.humanReview.summary}</p>
                      {closureInvestigation.humanReview.hypotheses.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-400">No evidence-based cause could be isolated. Verify the deed image, adjoining descriptions, and survey records manually.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {closureInvestigation.humanReview.hypotheses.map(hypothesis => (
                            <div key={hypothesis.id} className="p-3 rounded border border-gray-600 bg-gray-900/60 text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${hypothesis.confidence === 'high' ? 'bg-emerald-700 text-emerald-100' : hypothesis.confidence === 'medium' ? 'bg-amber-700 text-amber-100' : 'bg-gray-600 text-gray-100'}`}>
                                  {hypothesis.confidence.toUpperCase()}
                                </span>
                                <span className="font-semibold text-gray-100">{hypothesis.title}</span>
                                {hypothesis.rowIndex !== undefined && <span className="text-gray-500">row {hypothesis.rowIndex + 1}</span>}
                              </div>
                              <p className="mt-1.5 text-gray-300">{hypothesis.reason}</p>
                              {hypothesis.sourceQuote && (
                                <blockquote className="mt-2 border-l-2 border-sky-600 pl-2 text-sky-200 italic">
                                  �{hypothesis.sourceQuote}�{hypothesis.sourcePage ? ` � page ${hypothesis.sourcePage}` : ''}
                                </blockquote>
                              )}
                              <p className="mt-2 text-gray-400"><span className="font-semibold text-gray-300">Geometry:</span> {hypothesis.geometricEvidence}</p>
                              {hypothesis.rowIndex !== undefined && hypothesis.proposedPatch && (
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className="font-mono text-emerald-300">
                                    Proposed: {Object.entries(hypothesis.proposedPatch).map(([field, value]) => `${field}=${String(value)}`).join(', ')}
                                  </span>
                                  <button
                                    onClick={() => handleApplyClosureHypothesis(hypothesis)}
                                    className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded"
                                  >
                                    Review and apply�
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {closureInvestigation.humanReview.cautions.length > 0 && (
                        <div className="mt-4 p-3 rounded border border-amber-700/50 bg-amber-950/20 text-xs text-amber-200">
                          <div className="font-semibold">Verify before changing the deed calls</div>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            {closureInvestigation.humanReview.cautions.map((caution, index) => <li key={index}>{caution}</li>)}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setClosureInvestigation(null)}
                    className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* In-scope errors now surface in the NotificationCenter bell; the
              red banner is only shown out of scope via GlobalErrorDialog. */}

          {isSessionLoading && (
            <div className="fixed inset-0 bg-gray-900/80 z-[200] flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-semibold text-lg">Loading Session...</p>
                </div>
            </div>
          )}

          {/* Civil 3D Integration Panels — live cloud session/QR auth requires the backend, hidden in OSS build */}
          {!isOssBuild() && (
          <C3DConnectPanel
            isOpen={!showWelcome && showC3DConnectPanel}
            onClose={() => setShowC3DConnectPanel(false)}
            isTrialActive={hasApiKey}
            hasApiKey={!!settings.userApiKey}
            onSessionCreated={(token) => {
              // Just save the token, don't close the panel
              // User needs to see and copy the token!
              setC3dSessionToken(token);
            }}
            existingToken={c3dSessionToken}
          />
          )}
          
          {/* C3D Debug Dialog - shows when clicking connected indicator */}
          <C3DDebugDialog
            isOpen={!showWelcome && showC3DDebugDialog}
            onClose={() => setShowC3DDebugDialog(false)}
            sessionToken={c3dSessionToken}
            isConnected={isC3DConnected}
          />
          
          {/* Quick Unit Converter - only on homepage */}
          {isInitialScreen && <QuickConverter />}

          {/* CACP inter-agent activity indicator � unobtrusive bottom-left pill */}
          <CacpActivityIndicator enabled={!!settings.showCacpNotifications} />
          </div>
        </div>
        </HighlightContext.Provider>
        </UIContext.Provider>
      </AgentContext.Provider>
    </SettingsContext.Provider>
  );
};

// ============================================================================
// REFACTORING: App wrapper provides all context providers
// ============================================================================
export const App = () => {
  return (
    <UserFriendlyErrorBoundary>
      <FileStateProvider>
        <ChatStateProvider>
          <UIStateProvider>
            <CanvasStateProvider defaultCutSheetInfo={{ companyName: 'Your Company', crewChief: 'Crew Chief' }}>
              <AppStateProvider availableModels={availableModels}>
                <CadManagerProvider>
                  <AppContent />
                  <ConciergeOverlay />
                  <GlobalErrorDialog />
                </CadManagerProvider>
              </AppStateProvider>
            </CanvasStateProvider>
          </UIStateProvider>
        </ChatStateProvider>
      </FileStateProvider>
    </UserFriendlyErrorBoundary>
  );
};
