import React, { createContext, Suspense, lazy, useContext, useEffect, useState } from 'react';
import { FileText, KeyRound, Maximize2, Settings2, Table2, Wrench } from 'lucide-react';
import {
  type AgentType,
  type A2UIPayload,
  type AoiBoundary,
  type BoundaryFile,
  type DeedSummary,
  type A2UICacpReviewItem,
  type A2UIContourChipId,
  type A2UIGpsRoverSnapshot,
  type A2UIProjectLocationSnapshot,
  type A2UIWorkspaceToolId,
  type ProjectionSetting,
  type ComplianceSourceMode,
  type ContourBlendStats,
  type ContourGeneration,
  type ContourSettings,
  type InclusionBoundary,
  type JobInfo,
  type SessionFile,
  type StandardsComplianceCheckSelection,
  type SurveyPoint,
  type TinSurface,
} from '../types.ts';
import { agentThemeColors } from '../constants/agents.ts';
import { A2UIEmbeddedContext } from './UploadShell.tsx';
import { RoadLinksSurface } from './RoadLinksSurface.tsx';
import { useA2UIFileDrop } from './a2uiFileDrop.tsx';
import { BoundaryDeedIntake } from './BoundaryDeedIntake.tsx';
import { A2UIBoundarySummary } from './A2UIBoundarySummary.tsx';
import PointEditorInput from './PointEditorInput.tsx';
import FileUpload from './FileUpload.tsx';
import DxfInput from './DxfInput.tsx';
import GisInput from './GisInput.tsx';
import ZoningInput, { type ZoningSearchData } from './ZoningInput.tsx';
import ImageInput from './ImageInput.tsx';
import CenterlineInput from './CenterlineInput.tsx';
import RoadingInput from './RoadingInput.tsx';
import RedlineInput from './Redline/RedlineInput.tsx';
import CadManagerInput from './CadManagerInput.tsx';
import { A2UIStandardsTable } from './A2UIStandardsTable.tsx';
import { A2UIHatchStudio } from './A2UIHatchStudio.tsx';
import { A2UIPointEntry } from './A2UIPointEntry.tsx';
import { A2UIGpsRover } from './A2UIGpsRover.tsx';
import { LsaiProjectLocationPanel } from './LsaiProjectLocationPanel.tsx';
import { A2UIZoningResearch } from './A2UIZoningResearch.tsx';
import { A2UIZoningSources } from './A2UIZoningSources.tsx';
import { A2UICadManager } from './A2UICadManager.tsx';
import { A2UIInputForm } from './A2UIInputForm.tsx';
import { A2UISelectionPrompt } from './A2UISelectionPrompt.tsx';
import { A2UICacpManifestExplorer } from './A2UICacpManifestExplorer.tsx';
import { A2UICacpReview } from './A2UICacpReview.tsx';
import { A2UISettingsSurface } from './A2UISettingsSurface.tsx';
import { A2UIExperimentalAgentDialog } from './A2UIExperimentalAgentDialog.tsx';
import { A2UIProperties } from './A2UIProperties.tsx';
import { A2UISoilLimitations } from './A2UISoilLimitations.tsx';
import { A2UITextEditor } from './A2UITextEditor.tsx';
import { A2UISpreadsheet } from './A2UISpreadsheet.tsx';
import { A2UIContourChip } from './A2UIContourChips.tsx';
import { KeyManagementPanel } from './KeyManagementPanel.tsx';
import { DockModeControl, type DockMode } from './DockModeControl.tsx';
import type { KeyDetailSnapshot } from '../services/keySources.ts';
import type { ByokProvider } from '../services/providerKeys.ts';

// Lazy-load PDF-backed intake components so pdfjs-dist is only loaded when a PDF intake widget is rendered
const CivilDrafterFileUpload = lazy(() => import('./CivilDrafterFileUpload.tsx'));
const DeedInput = lazy(() => import('./DeedInput.tsx'));
const PlanInput = lazy(() => import('./PlanInput.tsx'));
const StandardsComplianceInput = lazy(() => import('./StandardsComplianceInput.tsx'));

export const WORKSPACE_TOOL_LABELS: Record<A2UIWorkspaceToolId, string> = {
  'symbol-manager': 'Symbol Manager',
  'linetype-manager': 'Linetype Manager',
  'hatch-manager': 'Hatch Manager',
  'raster-underlay': 'Image & PDF Underlays',
  'annotate-manager': 'Annotate Manager',
  'stationing-controls': 'Stationing Controls',
  'centerline-list': 'Centerlines & Baselines',
  'drafting-style-library': 'Drafting Style Library',
  'layer-manager': 'Data Visibility & Layers',
  'compliance-summary': 'Standards Compliance Audit',
  'title-search-panel': 'Title Search Workspace',
  'wms-manager': 'WMS & Offline Maps',
  'file-manager': 'File Manager',
  'fieldbook-panel': 'Survey Field Book',
  'cutsheet-panel': 'Stakeout Cut Sheet',
  'closure-report': 'Closure Reports',
  'steep-slope-report': 'Steep Slope Report',
  'legal-writer': 'Legal Description Writer',
  'sheet-view': 'Sheet View',
  'roading-panel': 'Roading Studio',
  'road-links': 'Road Links',
  'stormwater-quick-check': 'Stormwater Quick-Check',
  'dirt-volume-panel': 'Dirt Volume',
  'redline-workspace': 'Redline Workspace',
  'road-paint-studio': 'Road Paint Studio',
  'tin-surfaces': 'TIN Surfaces',
  'point-studio': 'Point Studio',
  'point-tools': 'Point Tools',
  'surveyors-eye': 'Surveyors Eye',
  'legend': 'Legend',
  'area-of-interest': 'Area of Interest',
  'draw-menu': 'Draw & Edit',
  'command-help': 'Command Help',
};

export interface A2UIKeyEntryStatus {
  hasLandSurvKey?: boolean;
  hasGoogleApiKey?: boolean;
  hasServiceAccess?: boolean;
  serviceAccessExpiresAt?: string | null;
  computeCredits?: number;
  connectedProviders?: Partial<Record<ByokProvider, boolean>>;
  currentKeyDetails?: KeyDetailSnapshot | null;
}

export interface A2UIHostContextValue {
  // Point Editor
  onPointsUploaded?: (points: SurveyPoint[], fileName: string) => void;
  onPointEditorSessionStart?: () => void;
  // Point entry (A2UI)
  /** Store a point from the A2UI point-entry surface. */
  onAddPointFromSurface?: (point: SurveyPoint) => { ok: boolean; message?: string; pointNumber?: string } | void;
  /** CACP PointAgent next-available point number. */
  getNextPointNumber?: (excludePointNumber?: string) => string;
  /** Duplicate check across all project point lists. */
  isPointNumberTaken?: (pointNumber: string) => boolean;
  /** Arm the canvas add-point tool from the A2UI point-entry surface. */
  onStartPointPlacement?: (options: {
    pointNumber: string;
    elevation: string;
    description: string;
  }) => void;
  /** Pick a snapped point/coordinate from the canvas for an A2UI input form. */
  onPickCanvasPoint?: () => Promise<{
    northing: number;
    easting: number;
    pointNumber?: string;
  } | null>;
  /** Project WGS84 coordinates to the active CRS for Plus Code entry. */
  convertLatLon?: (lat: number, lon: number) => { northing: number; easting: number } | null;
  /** Project centre or GPS fix used to recover shortened Plus Codes. */
  plusCodeReference?: { latitude: number; longitude: number } | null;
  // RAW Crawler
  onRawFileUploaded?: (content: string, fileName: string) => void;
  // Civil Drafter
  onCivilDrafterFileUploaded?: (content: string, fileName: string) => void;
  onCivilDrafterPdfUploaded?: (files: SessionFile[]) => void;
  onCivilDrafterUseExistingPoints?: () => void;
  existingPointCount?: number;
  // Boundary Agent
  onDeedSubmitted?: (file: SessionFile) => void;
  onDeedBatchSubmitted?: (files: SessionFile[]) => void;
  onDeedStartFromScratch?: () => void;
  onOpenBoundaryGis?: () => void;
  /** Live deed summary and tract/file status for the chat-hosted summary card. */
  boundaryDeedSummary?: DeedSummary | null;
  boundaryDeedFiles?: BoundaryFile[];
  boundaryComputingTractIds?: string[];
  boundaryActiveFileId?: string;
  onBoundaryProcessTracts?: (tractIds: string[], summary?: DeedSummary) => void;
  onBoundaryParseFullDeed?: () => void;
  onBoundaryOpenEditor?: (fileId?: string) => void;
  onBoundaryOpenDescription?: (tractId: string, snippet?: string) => void;
  freeDeedsRemaining?: number | null;
  freeDeedsLimit?: number;
  freeDeedsUnlimited?: boolean;
  freeDeedsUnverified?: boolean;
  onShowUpgrade?: () => void;
  // Civil Plan Expert
  onPlansSubmitted?: (files: SessionFile[]) => void;
  // DXF Agent
  onDxfUploaded?: (
    content: string,
    fileName: string,
    options?: { smoothSplines?: boolean; quantizationBits?: 16 | 32; splineLayers?: string[] }
  ) => void;
  // GIS Agent
  onGisUploaded?: (content: string, fileName: string, source?: 'file' | 'url') => void;
  inclusionBoundaries?: InclusionBoundary[];
  activeInclusionBoundaryId?: string | null;
  /** Held AOIs; active AOI takes precedence over inclusion clipping. */
  aoiBoundaries?: AoiBoundary[];
  activeAoiBoundaryId?: string | null;
  onStartAoiDraw?: () => void;
  onSetActiveAoi?: (id: string | null) => void;
  onDeleteAoi?: (id: string) => void;
  onCreateAoiFromInclusion?: (id: string) =>
    | { ok: boolean; message?: string }
    | Promise<{ ok: boolean; message?: string }>;
  onCreateAoiFromBoundaryFile?: (id: string) =>
    | { ok: boolean; message?: string }
    | Promise<{ ok: boolean; message?: string }>;
  onCreateAoiFromAddress?: (address: string) =>
    | { ok: boolean; message?: string }
    | Promise<{ ok: boolean; message?: string }>;
  hasInclusionLines?: boolean;
  getInclusionBboxWgs84?: (boundaryId: string | null) => [number, number, number, number] | null;
  // Zoning Agent
  onZoningSearch?: (searchData: ZoningSearchData) => void;
  onZoningSelectDistrict?: (district: string) => void;
  onZoningAskQuestion?: (question: string) => void;
  jobInfo?: JobInfo;
  // Title Search
  onTitleSearchDeedSubmitted?: (file: SessionFile) => void;
  // Standards Compliance
  onStandardsComplianceSessionStart?: (payload: {
    controlFiles: SessionFile[];
    subjectFile: SessionFile;
    checks: StandardsComplianceCheckSelection;
    sourceMode: ComplianceSourceMode;
  }) => void;
  // Image Analyzer
  onImagesSubmitted?: (files: SessionFile[]) => void;
  // Stationing & CL
  onCenterlineSessionStart?: () => void;
  onClFileUploaded?: (content: string, fileName: string) => void;
  // Roading Agent
  centerlineCount?: number;
  onRoadingSynthesizeExisting?: () => void;
  onRoadingDesignCorridor?: (opts: {
    name: string;
    laneCount: number;
    laneWidthFt: number;
    includeCurbAndGutter: boolean;
    includeSidewalk: boolean;
    rowWidthFt: number;
  }) => void;
  onOpenRoadingStudio?: () => void;
  // Redline Agent
  onRedlinePackageSubmitted?: (files: SessionFile[], mode: import('../types.ts').RedlineReadingMode) => void;
  onOpenRedlineWorkspace?: () => void;
  // CAD Manager
  onCadManagerSessionStart?: () => void;
  onCadManagerFileUploaded?: (content: string, fileName: string) => void;
  /** Open the live CAD standards sheet in chat. */
  onOpenCadStandards?: () => void;
  /** Open the CAD Manager workspace inside the A2UI float/dock host. */
  onOpenCadWorkspace?: () => void;
  /** Open the full-screen CAD standards spreadsheet editor directly. */
  onOpenSpreadsheetEditor?: () => void;
  /** Start interactive Hatch mode on the canvas from Hatch Studio. */
  onStartCanvasHatch?: (options: {
    mode: 'pick-area' | 'select-object';
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  /** Apply hatch to currently selected canvas entities from Hatch Studio. */
  onApplyHatchToSelection?: (options: {
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  /** Hatch every visible circle using the supplied hatch parameters. */
  onHatchCircles?: (options: {
    patternName: string;
    scale: number;
    angleDeg: number;
    opacity: number;
    color?: string;
    layer?: string;
  }) => void;
  /** Count visible circles so a hatch prompt can name the target. */
  onCountHatchCircles?: () => number;
  /** Open the Hatch Manager A2UI surface. */
  onOpenHatchManager?: () => void;
  /** Render a workspace manager/tool panel inside an A2UI surface. */
  renderWorkspaceTool?: (
    toolId: A2UIWorkspaceToolId,
    presentation: 'inline' | 'floating' | 'docked',
    payload?: A2UIPayload,
  ) => React.ReactNode;
  /** Project files available to the in-chat text editor. */
  textFiles?: SessionFile[];
  /** Persist an edit made in the A2UI text editor. */
  onSaveTextFile?: (fileName: string, content: string) => void;
  /** Add a New text file to the project from the A2UI text editor. */
  onCreateTextFile?: (fileName: string, content: string) => void;
  /** Add an imported .txt/.md file to the project. */
  onImportTextFile?: (fileName: string, content: string) => void;
  /** Open the active text file in the full workspace editor. */
  onOpenFullTextEditor?: (fileName: string, content: string) => void;
  /** Send values collected by an A2UI input form back to the owning agent. */
  onSubmitInput?: (message: string, payload: A2UIPayload) => void;
  /** Live credential state for the inline key-entry surface. */
  keyEntryStatus?: A2UIKeyEntryStatus;
  /** Save a LandSurv Enabling Key without routing it through chat. */
  onSubmitServiceKey?: (serviceKey: string) => boolean | Promise<boolean>;
  /** Save a generic BYOK key when no provider-specific handler is wired. */
  onSubmitApiKey?: (apiKey: string) => boolean | Promise<boolean>;
  /** Save a BYOK key into its provider slot. */
  onSubmitProviderKey?: (provider: ByokProvider, apiKey: string) => boolean | Promise<boolean>;
  /** Remove one stored BYOK key. */
  onClearProviderKey?: (provider: ByokProvider) => void;
  /** Open the plan upgrade flow from the key surface. */
  onOpenKeyUpgrade?: () => void;
  /** Enter canvas entity-selection mode from an A2UI prompt. */
  onStartCanvasSelection?: () => void;
  /** Apply the current canvas selection to an A2UI selection prompt. */
  onUseCanvasSelection?: (payload: A2UIPayload) => void;
  /** Expand this payload into the fullscreen surface presentation. */
  onOpenFullscreen?: (payload: A2UIPayload) => void;
  /** Re-dispatch a CACP item from an inline review card. */
  onRetryCacpItem?: (item: A2UICacpReviewItem) => Promise<unknown> | void;
  /** Inspect the owning manifest from an inline review card. */
  onInspectCacpAgent?: (agent: AgentType) => void;
  /** Live GPS Rover state (fix, target, and guidance). */
  getGpsRoverSnapshot?: () => A2UIGpsRoverSnapshot | null;
  /** Open the dockable GPS Rover dialog focused on a mode. */
  onGpsOpenPanel?: (mode: 'stakeout' | 'collect' | 'benchmark') => void;
  /** Live LSAI project-location clusters and resolution state. */
  getProjectLocationSnapshot?: () => A2UIProjectLocationSnapshot | null;
  /** Centre the canvas on one project-location cluster. */
  onProjectLocationFocus?: (clusterIndex: number) => void;
  /** Fetch a GIS layer for one project-location cluster. */
  onProjectLocationFetch?: (
    action: 'parcels' | 'flood' | 'soils',
    clusterIndex: number
  ) => void;
  /** Re-run the state/county/municipality lookup. */
  onProjectLocationRefresh?: () => void;
  /** Compile/download the PA E&S limitations report from a chat-hosted report. */
  onDownloadSoilLimitations?: () => void;
  /** Place the compiled limitations/resolutions block on the active sheet. */
  onAddSoilLimitationsToSheet?: () => void;
  isDownloadingSoilLimitations?: boolean;
  /** Apply the CRS recommended by the georeferenced point clusters. */
  onApplyClusterProjection?: () => Promise<{ projection: ProjectionSetting; label: string } | null>;
  /** WGS84 bbox used to suggest a CRS in the A2UI settings surface. */
  projectBboxWgs84?: [number, number, number, number] | null;
  /** Latest GPS fix used to suggest a CRS in the A2UI settings surface. */
  gpsPosition?: { latitude: number; longitude: number } | null;
  /** Record the fix used by "Use my GPS location" so project location can reuse it. */
  onGpsFixDetected?: (fix: { latitude: number; longitude: number }) => void;
  /** Retry the last County parcel fetch. */
  onProjectLocationCountyRetry?: () => void;
  /** Open the County Parcels workspace to pick or add a server. */
  onOpenCountyGis?: () => void;
  /** Fetch a layer over the drawn inclusion area instead of a cluster. */
  onProjectLocationFetchInclusion?: (action: 'parcels' | 'flood' | 'soils') => void;
  /** Live contour settings, shared by every independently addressable contour chip. */
  contourSettings?: ContourSettings;
  contourGenerations?: ContourGeneration[];
  /** Survey points used for cleanup counts and ignore-point search. */
  contourPoints?: SurveyPoint[];
  contourBlendStatsById?: Record<string, ContourBlendStats>;
  contourLabelCount?: number;
  contourLabelTool?: 'place' | 'erase' | null;
  contourBreaklineCount?: number;
  contourInclusionSegmentCount?: number;
  contourExclusionSegmentCount?: number;
  isGeneratingContours?: boolean;
  isFetchingEsriContours?: boolean;
  creatingContourTinGenerationId?: string | null;
  onContourSettingsChange?: (settings: ContourSettings) => void;
  onGenerateContours?: () => void;
  onContourSetLabelTool?: (tool: 'place' | 'erase' | null) => void;
  onContourClearLabels?: () => void;
  onContourAutoLabel?: () => void;
  onContourToggleGenerationVisible?: (id: string, visible: boolean) => void;
  onContourRenameGeneration?: (id: string, name: string) => void;
  onContourSetGenerationColor?: (id: string, color: string | undefined) => void;
  onContourSetGenerationOpacity?: (id: string, opacity: number) => void;
  onContourDeleteGeneration?: (id: string) => void;
  onContourToggleBlend?: (id: string, enabled: boolean) => void;
  onContourSetBlendBoundary?: (id: string, polylineId: string | null) => void;
  onContourCreateTinFromGeneration?: (id: string) => void;
  /** Raise one born contour generation as its own chip in chat. */
  onContourOpenGenerationChip?: (id: string) => void;
  onContourSelectBoundary?: (id: string | null) => void;
  onContourManageBoundaries?: () => void;
  onContourAddEsriService?: (url: string) => void;
  onContourRemoveEsriService?: (url: string) => void;
  onContourFetchEsri?: (
    serviceUrl: string,
    mode: 'inclusion' | 'project',
    sourceId?: string
  ) => void;
  /** Loaded TIN surfaces, shared with the A2UI TIN Surfaces workspace surface. */
  tinSurfaces?: TinSurface[];
  /** Contour generations available for "Create from Contours". */
  contourGenerationCount?: number;
  isImportingTin?: boolean;
  tinImportStatus?: string | null;
  onImportTinSurface?: () => void;
  onCreateTinFromContours?: () => void;
  onExportTinSurface?: (tinId: string, format: 'landxml' | 'native') => void;
  /** Default style for surfaces without an explicit display mode. */
  tinDefaultDisplayMode?: 'wireframe' | 'shaded';
  /** Draw, hide, or restyle one surface on the canvas. */
  onSetTinSurfaceDisplayMode?: (tinId: string, mode: 'wireframe' | 'shaded' | 'hidden') => void;
  onToggleTinSurfaceVisibility?: (tinId: string) => void;
  /** Unhide, draw, show the canvas, and zoom to the surface. */
  onShowTinSurfaceOnCanvas?: (tinId: string, mode?: 'wireframe' | 'shaded') => void;
  /** Bind a project point as the live stakeout target. */
  onGpsSetTarget?: (pointNumber: string) => void;
  /** Store a collected GPS point at the current fix. */
  onGpsCollectPoint?: (
    pointNumber: string,
    description: string
  ) => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string } | void;
  /** Stop the active live Scout discovery run. */
  onScoutStop?: () => void;
  /** Open the experimental-agent explainer as its own A2UI dialog. */
  onOpenExperimentalAgentDialog?: (agent: AgentType) => void;
  /** Enable an experimental agent from its A2UI dialog and activate it. */
  onEnableExperimentalAgent?: (agent: AgentType) => void;
  /** Dismiss the experimental-agent prompt without enabling it. */
  onDismissExperimentalAgentPrompt?: (agent: AgentType) => void;
}

export const A2UIHostContext = createContext<A2UIHostContextValue>({});

interface A2UISurfaceProps {
  payload: A2UIPayload;
  /** Optional: move this surface into the agent tool shelf. */
  onDock?: () => void;
  /** Optional: move this surface into a floating dialog on the canvas. */
  onPopOut?: () => void;
  /** Optional: return this surface to the inline chat feed. */
  onChat?: () => void;
  /** Inline chat card vs. the same surface hosted in a float/dock. */
  presentation?: 'inline' | 'floating' | 'docked';
  /** Current placement when the surface is rendered by one of the hosts. */
  dockMode?: DockMode;
  /** Full CAD Manager workspace rendered by the floating/docked presentation. */
  cadManagerContent?: React.ReactNode;
}

const DataViewTabs: React.FC<{
  view: 'text' | 'spreadsheet';
  onChange: (view: 'text' | 'spreadsheet') => void;
  showText?: boolean;
  showSheet?: boolean;
}> = ({ view, onChange, showText = true, showSheet = true }) => {
  if (!showText || !showSheet) return null;
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors ${
      active
        ? 'bg-cyan-400/15 text-cyan-200'
        : 'text-slate-500 hover:text-slate-300'
    }`;
  return (
    <div className="flex items-center gap-0.5 rounded border border-white/10 bg-black/20 p-0.5">
      <button
        type="button"
        data-testid="a2ui-view-text"
        onClick={() => onChange('text')}
        className={tabClass(view === 'text')}
      >
        <FileText className="h-2.5 w-2.5" />
        Text
      </button>
      <button
        type="button"
        data-testid="a2ui-view-sheet"
        onClick={() => onChange('spreadsheet')}
        className={tabClass(view === 'spreadsheet')}
      >
        <Table2 className="h-2.5 w-2.5" />
        Sheet
      </button>
    </div>
  );
};

const SurfaceActions: React.FC<{
  onPopOut?: () => void;
  onDock?: () => void;
  onChat?: () => void;
  dockMode?: DockMode;
  onFullscreen?: () => void;
  onMinimize?: () => void;
}> = ({ onPopOut, onDock, onChat, dockMode, onFullscreen, onMinimize }) => {
  if (!onPopOut && !onDock && !onChat && !onFullscreen && !onMinimize) return null;
  const mode: DockMode = dockMode ?? (onDock && onPopOut ? 'chat' : onDock ? 'toolshelf' : 'floating');
  const buttonClass =
    'inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100';
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {(onDock || onPopOut || onChat) && (
        <DockModeControl
          mode={mode}
          onChange={next => {
            if (next === 'floating') onPopOut?.();
            else if (next === 'toolshelf') onDock?.();
            else onChat?.();
          }}
        />
      )}
      {onFullscreen && (
        <button
          type="button"
          onClick={onFullscreen}
          data-testid="a2ui-fullscreen-button"
          className={buttonClass}
          title="Open this surface fullscreen"
        >
          <Maximize2 className="h-2.5 w-2.5" />
          Fullscreen
        </button>
      )}
      {onMinimize && (
        <button
          type="button"
          onClick={onMinimize}
          data-testid="a2ui-minimize-button"
          className="text-[10.5px] font-medium text-slate-400 transition-colors hover:text-slate-200"
          title="Minimize this surface in chat"
        >
          Minimize ▲
        </button>
      )}
    </div>
  );
};

export const A2UISurface: React.FC<A2UISurfaceProps> = ({
  payload,
  onDock,
  onPopOut,
  onChat,
  presentation = 'inline',
  dockMode,
  cadManagerContent,
}) => {
  const host = useContext(A2UIHostContext);
  const fileDrop = useA2UIFileDrop({
    host,
    widgetType: payload.widgetType,
    enabled:
      payload.kind === 'upload-widget' &&
      presentation === 'inline' &&
      payload.widgetType !== 'standards-compliance-intake',
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    payload.status === 'completed' || payload.status === 'dismissed'
  );
  const [dataView, setDataView] = useState<'text' | 'spreadsheet'>(
    payload.kind === 'spreadsheet' ? 'spreadsheet' : 'text'
  );

  useEffect(() => {
    if (payload.status === 'completed' || payload.status === 'dismissed') {
      setIsCollapsed(true);
    } else if (payload.status === 'expanded') {
      setIsCollapsed(false);
    }
  }, [payload.status]);

  useEffect(() => {
    setDataView(payload.kind === 'spreadsheet' ? 'spreadsheet' : 'text');
  }, [payload.kind, payload.textEditor?.fileName, payload.spreadsheet?.title]);

  const onFullscreen =
    presentation === 'inline' && host.onOpenFullscreen
      ? () => host.onOpenFullscreen?.(payload)
      : undefined;

  const onMinimize =
    presentation === 'inline' ? () => setIsCollapsed(true) : undefined;

  if (payload.kind === 'intake-prompt') {
    return null;
  }

  // Chat-first deed summary. The message owns a snapshot of the summary, while
  // live tract status comes from the host so this card stays linked to the
  // compute/draft pipeline without being re-created. The summary is a full
  // A2UI surface: it can stay inline, move to the tool shelf, float, or go
  // fullscreen just like the other panels.
  if (payload.kind === 'deed-summary' && !(isCollapsed && presentation === 'inline')) {
    const summary = payload.deedSummary ?? host.boundaryDeedSummary;
    if (!summary) return null;
    return (
      <div data-testid={`a2ui-surface-${payload.widgetType}`} className={presentation === 'inline' ? 'mt-3 w-full' : 'flex h-full min-h-0 flex-col'}>
        <div className={presentation === 'inline' ? '' : 'min-h-0 flex-1 overflow-y-auto' }>
          <A2UIBoundarySummary
            summary={summary}
            files={host.boundaryDeedFiles ?? []}
            computingTractIds={new Set(host.boundaryComputingTractIds ?? [])}
            activeFileId={host.boundaryActiveFileId}
            actions={
              <SurfaceActions
                onPopOut={onPopOut}
                onDock={onDock}
                onChat={onChat}
                onFullscreen={onFullscreen}
                onMinimize={onMinimize}
              />
            }
            onProcessSelected={(tractIds) => host.onBoundaryProcessTracts?.(tractIds, summary)}
            onParseFullDeed={() => host.onBoundaryParseFullDeed?.()}
            onOpenEditor={(fileId) => host.onBoundaryOpenEditor?.(fileId)}
            onOpenDescription={(tractId, snippet) => host.onBoundaryOpenDescription?.(tractId, snippet)}
          />
        </div>
      </div>
    );
  }

  // Collapsed presentation for non-upload surfaces when minimized in chat
  if (isCollapsed && presentation === 'inline' && payload.kind !== 'upload-widget') {
    return (
      <div
        data-testid={`a2ui-collapsed-${payload.widgetType}`}
        className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs text-slate-300"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
          <span className="truncate font-medium">
            {payload.completedSummary || 'Surface minimized'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(onPopOut || onDock || onChat) && (
            <DockModeControl
              mode={dockMode ?? 'chat'}
              onChange={next => {
                if (next === 'floating') onPopOut?.();
                else if (next === 'toolshelf') onDock?.();
                else onChat?.();
              }}
            />
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            Expand ▼
          </button>
        </div>
      </div>
    );
  }

  if (payload.kind === 'properties' && payload.properties) {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-properties"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <Settings2 className="h-3 w-3" />
            Object Properties
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-cyan-200">
              A2UI
            </span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/90">
          <A2UIProperties spec={payload.properties} />
        </div>
      </div>
    );
  }

  if (payload.kind === 'settings') {
    return (
      <div data-testid="a2ui-surface-settings" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            <Settings2 className="h-3 w-3" />
            Project Settings
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-sky-200">
              Live
            </span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <A2UISettingsSurface
          initialSection={payload.settingsSection ?? 'all'}
          settingsSummary={payload.settingsSummary}
          onOpenFullscreen={onFullscreen}
          onApplyClusterProjection={host.onApplyClusterProjection}
          projectBboxWgs84={host.projectBboxWgs84}
          gpsPosition={host.gpsPosition}
          onGpsFixDetected={host.onGpsFixDetected}
        />
      </div>
    );
  }

  if (payload.kind === 'key-entry') {
    const status = host.keyEntryStatus ?? {};
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-key-entry"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            <KeyRound className="h-3 w-3" />
            API Keys
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-emerald-200">
              A2UI
            </span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <div className={embedded ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
          <KeyManagementPanel
            variant="surface"
            currentKeyDetails={status.currentKeyDetails}
            hasLandSurvKey={status.hasLandSurvKey}
            hasGoogleApiKey={status.hasGoogleApiKey}
            hasServiceAccess={status.hasServiceAccess}
            serviceAccessExpiresAt={status.serviceAccessExpiresAt}
            computeCredits={status.computeCredits}
            connectedProviders={status.connectedProviders}
            initialSource={payload.keyEntry?.focus}
            onSubmitApiKey={host.onSubmitApiKey ?? (() => false)}
            onSubmitServiceKey={host.onSubmitServiceKey}
            onSubmitProviderKey={host.onSubmitProviderKey}
            onClearProviderKey={host.onClearProviderKey}
            onOpenUpgrade={host.onOpenKeyUpgrade}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === 'text-editor') {
    const embedded = presentation !== 'inline';
    const spec = payload.textEditor ?? {};
    return (
      <div
        data-testid="a2ui-surface-text-editor"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <FileText className="h-3 w-3" />
            Text Editor
            <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1 py-0.5 text-[8px] tracking-[0.08em] text-cyan-200">
              TXT / CSV / MD
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {payload.spreadsheet && (
              <DataViewTabs
                view={dataView}
                onChange={setDataView}
                showText
                showSheet
              />
            )}
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/90 ${
            embedded ? 'min-h-0 flex-1' : 'h-[min(62vh,560px)]'
          }`}
        >
          {dataView === 'spreadsheet' && payload.spreadsheet ? (
            <A2UISpreadsheet spec={payload.spreadsheet} />
          ) : (
            <A2UITextEditor
              files={host.textFiles ?? []}
              initialFileName={spec.fileName ?? null}
              initialContent={spec.content ?? null}
              initialMode={spec.mode ?? 'edit'}
              onSaveFile={host.onSaveTextFile}
              onCreateFile={host.onCreateTextFile}
              onImportFile={host.onImportTextFile}
              onOpenFullEditor={host.onOpenFullTextEditor}
            />
          )}
        </div>
      </div>
    );
  }

  if (payload.kind === 'spreadsheet') {
    if (!payload.spreadsheet) return null;
    const embedded = presentation !== 'inline';
    const spec = payload.textEditor ?? {};
    return (
      <div
        data-testid="a2ui-surface-spreadsheet"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            <Table2 className="h-3 w-3" />
            Spreadsheet
            <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1 py-0.5 text-[8px] tracking-[0.08em] text-emerald-200">
              A2UI
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <DataViewTabs
              view={dataView}
              onChange={setDataView}
              showText={Boolean(payload.textEditor)}
              showSheet
            />
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-emerald-400/25 bg-[#070e18]/90 ${
            embedded ? 'min-h-0 flex-1' : 'h-[min(62vh,560px)]'
          }`}
        >
          {dataView === 'text' && payload.textEditor ? (
            <A2UITextEditor
              files={host.textFiles ?? []}
              initialFileName={spec.fileName ?? null}
              initialContent={spec.content ?? null}
              initialMode={spec.mode ?? 'edit'}
              onSaveFile={host.onSaveTextFile}
              onCreateFile={host.onCreateTextFile}
              onImportFile={host.onImportTextFile}
              onOpenFullEditor={host.onOpenFullTextEditor}
            />
          ) : (
            <A2UISpreadsheet spec={payload.spreadsheet} />
          )}
        </div>
      </div>
    );
  }

  if (payload.kind === 'contour-chip') {
    const chip = (payload.contourChip?.chip ?? payload.widgetType) as A2UIContourChipId;
    const generationId = payload.contourChip?.generationId;
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid={`a2ui-surface-${chip}`}
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className={embedded ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
          <A2UIContourChip chip={chip} generationId={generationId} />
        </div>
      </div>
    );
  }

  if (payload.kind === 'workspace-tool') {
    const toolId = (payload.workspaceTool ?? payload.widgetType) as A2UIWorkspaceToolId;
    const toolLabel = WORKSPACE_TOOL_LABELS[toolId] ?? 'Workspace Tool';
    const embedded = presentation !== 'inline';
    // Sheet View is a visual canvas: give it the room a plot sheet needs.
    const isSheetView = toolId === 'sheet-view';
    // These compact canvas utilities keep their own tiny heading; the shelf
    // chrome should not wrap them in a second, heavier panel.
    const isLightweightCanvasTool = toolId === 'draw-menu' || toolId === 'command-help';
    // These tools already have a title in the fullscreen/floating/toolshelf
    // chrome. Drop the duplicated workspace heading there, but keep it in the
    // inline chat card where it is the only title.
    const hideToolHeading =
      (toolId === 'surveyors-eye' || toolId === 'area-of-interest' || isLightweightCanvasTool) && embedded;
    const hasSurfaceActions = Boolean(onPopOut || onDock || onChat || onFullscreen || onMinimize);
    const rendered = host.renderWorkspaceTool?.(toolId, presentation, payload);
    return (
      <div
        data-testid={`a2ui-surface-${toolId}`}
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        {(!hideToolHeading || hasSurfaceActions) && (
          <div className={`mb-1.5 flex items-center gap-2 px-0.5 ${hideToolHeading ? 'justify-end' : 'justify-between'}`}>
            {!hideToolHeading && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                <Wrench className="h-3 w-3" />
                {toolLabel}
              </span>
            )}
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        )}
        <div
          className={
            isLightweightCanvasTool && embedded
              ? 'min-h-0 flex-1 overflow-y-auto'
              : `overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/90 ${
                  embedded
                    ? 'min-h-0 flex-1 overflow-y-auto'
                    : isSheetView
                      ? 'h-[min(80vh,820px)] overflow-y-auto'
                      : 'max-h-[min(62vh,520px)] overflow-y-auto'
                }`
          }
        >
          {rendered ?? (
            <div className="p-4 text-xs text-slate-300">
              <p className="font-semibold text-white">{toolLabel}</p>
              <p className="mt-1 text-slate-400">
                Interactive {toolLabel} surface ready. Use Floating, Chat, Toolshelf, or Fullscreen for more room.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (payload.kind === 'cacp-manifests') {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-cacp-manifests"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            CACP Manifests
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-emerald-400/25 bg-[#070e18]/70 ${
            embedded ? 'min-h-0 flex-1' : 'h-[min(52vh,420px)]'
          }`}
        >
          <A2UICacpManifestExplorer initialAgent={payload.cacpManifests?.initialAgent} />
        </div>
      </div>
    );
  }

  if (payload.kind === 'cacp-review') {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-cacp-review"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            CACP Review
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-sky-400/25 bg-[#070e18]/70 ${
            embedded ? 'min-h-0 flex-1' : 'h-[min(52vh,420px)]'
          }`}
        >
          <A2UICacpReview
            context={payload.cacpReview ?? { items: [] }}
            onRetry={host.onRetryCacpItem}
            onInspect={agent => host.onInspectCacpAgent?.(agent)}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === 'selection-prompt') {
    if (!payload.selectionPrompt) return null;
    return (
      <div data-testid="a2ui-surface-selection-prompt" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
            Selection
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UISelectionPrompt
          prompt={payload.selectionPrompt}
          onStartSelection={host.onStartCanvasSelection}
          onUseSelection={() => host.onUseCanvasSelection?.(payload)}
        />
      </div>
    );
  }

  if (payload.kind === 'input-form') {
    if (!payload.inputForm) return null;
    return (
      <div data-testid="a2ui-surface-input-form" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Input Request
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] text-slate-500">The agent will continue automatically</span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onChat={onChat}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <A2UIInputForm
          form={payload.inputForm}
          onSubmit={message => host.onSubmitInput?.(message, payload)}
          onPickCanvasPoint={host.onPickCanvasPoint}
        />
      </div>
    );
  }

  if (payload.kind === 'zoning-research') {
    return (
      <div data-testid="a2ui-surface-zoning-research" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Zoning Research
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UIZoningResearch
          context={payload.zoningContext ?? { place: '' }}
          onAskQuestion={host.onZoningAskQuestion}
          onSelectDistrict={host.onZoningSelectDistrict}
        />
      </div>
    );
  }

  if (payload.kind === 'zoning-sources') {
    if (!payload.zoningSources) return null;
    return (
      <div data-testid="a2ui-surface-zoning-sources" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Zoning Sources
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UIZoningSources ledger={payload.zoningSources} />
      </div>
    );
  }

  if (payload.kind === 'standards-explorer') {
    return (
      <div data-testid="a2ui-surface-cad-standards-table" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Standards Sheet
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UIStandardsTable
          filter={payload.standardsFilter}
          onOpenEditor={host.onOpenSpreadsheetEditor ?? host.onOpenCadWorkspace ?? host.onOpenCadStandards}
          onOpenSpreadsheetEditor={host.onOpenSpreadsheetEditor}
        />
      </div>
    );
  }

  if (payload.kind === 'hatch-studio') {
    return (
      <div data-testid="a2ui-surface-hatch-studio" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Hatch Studio
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UIHatchStudio
          spec={payload.hatchStudio}
          onStartCanvasHatch={host.onStartCanvasHatch}
          onApplyToSelection={host.onApplyHatchToSelection}
          onOpenHatchManager={host.onOpenHatchManager}
          onOpenSpreadsheetEditor={host.onOpenSpreadsheetEditor}
        />
      </div>
    );
  }

  if (payload.kind === 'gps-rover') {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-gps-rover"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            GPS Rover
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-blue-400/25 bg-[#070e18]/70 ${
            embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[min(62vh,520px)] overflow-y-auto'
          }`}
        >
          <A2UIGpsRover
            spec={payload.gpsRover}
            getSnapshot={host.getGpsRoverSnapshot}
            onOpenPanel={host.onGpsOpenPanel}
            onSetTarget={host.onGpsSetTarget}
            onCollectPoint={host.onGpsCollectPoint}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === 'soil-limitations' && payload.soilLimitations) {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-soil-limitations"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Soil Limitations
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
            onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-amber-400/25 bg-[#0b0d10]/80 ${
            embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[min(70vh,640px)] overflow-y-auto'
          }`}
        >
          <A2UISoilLimitations
            spec={payload.soilLimitations}
            isDownloading={host.isDownloadingSoilLimitations}
            onDownload={host.onDownloadSoilLimitations}
            onAddToSheet={host.onAddSoilLimitationsToSheet}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === 'project-location') {
    const embedded = presentation !== 'inline';
    const snapshot = host.getProjectLocationSnapshot?.() ?? null;
    return (
      <div
        data-testid="a2ui-surface-project-location"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Project Location
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
            onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/70 ${
            embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[min(62vh,520px)] overflow-y-auto'
          }`}
        >
          {snapshot ? (
            <LsaiProjectLocationPanel
              clusterSet={snapshot.clusterSet}
              isResolving={snapshot.isResolving}
              error={snapshot.error ?? null}
              busy={snapshot.busy ?? null}
              onRefresh={() => host.onProjectLocationRefresh?.()}
              countyStatus={snapshot.countyStatus ?? null}
              onCountyRetry={() => host.onProjectLocationCountyRetry?.()}
              onOpenCountyGis={() => host.onOpenCountyGis?.()}
              inclusionArea={snapshot.inclusionArea ?? null}
              onFetchInclusion={action => host.onProjectLocationFetchInclusion?.(action)}
              onFocusCluster={cluster => host.onProjectLocationFocus?.(cluster.index)}
              onFetchParcels={cluster => host.onProjectLocationFetch?.('parcels', cluster.index)}
              onFetchFlood={cluster => host.onProjectLocationFetch?.('flood', cluster.index)}
              onFetchSoils={cluster => host.onProjectLocationFetch?.('soils', cluster.index)}
            />
          ) : (
            <div className="p-4 text-xs text-slate-400">
              Upload survey points to locate this project. LSAI resolves the state, county,
              and municipality for each separate point cluster.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (payload.kind === 'cad-manager') {
    if (presentation !== 'inline') {
      return (
        <div
          data-testid="a2ui-cad-manager-workspace"
          className={presentation === 'docked' ? 'h-full min-h-0' : 'h-[76vh] min-h-[520px]'}
        >
          {cadManagerContent ?? (
            <div className="p-4 text-xs text-slate-400">
              Open the CAD Manager workspace from its chat card to load the full editor.
            </div>
          )}
        </div>
      );
    }
    return (
      <div data-testid="a2ui-surface-cad-manager-workspace" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            CAD Manager
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <A2UICadManager
          onOpenWorkspace={host.onOpenCadWorkspace ?? onDock}
          onOpenStandards={host.onOpenCadStandards}
          onOpenSpreadsheetEditor={host.onOpenSpreadsheetEditor}
        />
      </div>
    );
  }

  if (payload.kind === 'point-entry') {
    const embedded = presentation !== 'inline';
    return (
      <div
        data-testid="a2ui-surface-point-entry"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Add Point
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
              onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-emerald-400/25 bg-[#070e18]/70 ${
            embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[min(70vh,620px)] overflow-y-auto'
          }`}
        >
          <A2UIPointEntry
            spec={payload.pointEntry}
            getNextPointNumber={host.getNextPointNumber}
            isPointNumberTaken={host.isPointNumberTaken}
            onAddPoint={host.onAddPointFromSurface}
            onStartCanvasPlacement={host.onStartPointPlacement}
            convertLatLon={host.convertLatLon}
            referenceLocation={host.plusCodeReference}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === 'experimental-agent') {
    const embedded = presentation !== 'inline';
    const accent = agentThemeColors[payload.agent] ?? '#94a3b8';
    return (
      <div
        data-testid="a2ui-surface-experimental-agent"
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            Experimental Agent
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
            onChat={onChat}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className="overflow-hidden rounded-xl border bg-[#070e18]/70"
          style={{ borderColor: `${accent}40` }}
        >
          <A2UIExperimentalAgentDialog
            agent={payload.agent}
            spec={payload.experimentalAgent}
            presentation={embedded ? 'surface' : 'inline'}
            onEnable={() => host.onEnableExperimentalAgent?.(payload.agent)}
            onDismiss={() => host.onDismissExperimentalAgentPrompt?.(payload.agent)}
          />
        </div>
      </div>
    );
  }

  if (payload.kind !== 'upload-widget') {
    return null;
  }

  const handleDismiss = () => {
    setIsCollapsed(true);
  };

  if (isCollapsed) {
    return (
      <div
        data-testid={`a2ui-collapsed-${payload.widgetType}`}
        className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs text-slate-300"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
            ✓
          </span>
          <span className="truncate font-medium">
            {payload.completedSummary
              ? `Loaded: ${payload.completedSummary}`
              : 'Upload options minimized'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
        >
          Show upload options
        </button>
      </div>
    );
  }

  const renderWidget = () => {
    switch (payload.widgetType) {
      case 'point-upload':
        return (
          <PointEditorInput
            onSessionStart={() => {
              host.onPointEditorSessionStart?.();
              setIsCollapsed(true);
            }}
            onPointsUploaded={(pts, fileName) => {
              host.onPointsUploaded?.(pts, fileName);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
          />
        );

      case 'raw-upload':
        return (
          <FileUpload
            onFileUploaded={(content, fileName) => {
              host.onRawFileUploaded?.(content, fileName);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'civil-drafter-upload':
        return (
          <CivilDrafterFileUpload
            onFileUploaded={(content, fileName) => {
              host.onCivilDrafterFileUploaded?.(content, fileName);
              setIsCollapsed(true);
            }}
            onPdfUploaded={(files) => {
              host.onCivilDrafterPdfUploaded?.(files);
              setIsCollapsed(true);
            }}
            existingPointCount={host.existingPointCount ?? 0}
            onUseExistingPoints={() => {
              host.onCivilDrafterUseExistingPoints?.();
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'deed-upload':
        return (
          <BoundaryDeedIntake
            variant="inline"
            onDeedSubmitted={(file) => {
              void host.onDeedSubmitted?.(file);
              setIsCollapsed(true);
            }}
            onDeedBatchSubmitted={
              host.onDeedBatchSubmitted
                ? (files) => {
                    void host.onDeedBatchSubmitted?.(files);
                    setIsCollapsed(true);
                  }
                : undefined
            }
            onStartFromScratch={() => {
              host.onDeedStartFromScratch?.();
              setIsCollapsed(true);
            }}
            onOpenGis={() => {
              host.onOpenBoundaryGis?.();
              setIsCollapsed(true);
            }}
          />
        );

      case 'plan-upload':
        return (
          <PlanInput
            onPlansSubmitted={(files) => {
              host.onPlansSubmitted?.(files);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'dxf-upload':
        return (
          <DxfInput
            onDxfUploaded={(content, fileName, options) => {
              host.onDxfUploaded?.(content, fileName, options);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'gis-upload':
        return (
          <GisInput
            onGisUploaded={(content, fileName, source) => {
              host.onGisUploaded?.(content, fileName, source);
              setIsCollapsed(true);
            }}
            inclusionBoundaries={host.inclusionBoundaries}
            activeInclusionBoundaryId={host.activeInclusionBoundaryId}
            hasInclusionLines={host.hasInclusionLines}
            getInclusionBboxWgs84={host.getInclusionBboxWgs84}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'zoning-intake':
        return (
          <ZoningInput
            onZoningSearch={(data) => {
              host.onZoningSearch?.(data);
              setIsCollapsed(true);
            }}
            jobInfo={host.jobInfo}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'title-search-upload':
        return (
          <DeedInput
            onDeedSubmitted={(file) => {
              host.onTitleSearchDeedSubmitted?.(file);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'standards-compliance-intake':
        return (
          <StandardsComplianceInput
            onSessionStart={(payloadData) => {
              host.onStandardsComplianceSessionStart?.(payloadData);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'image-upload':
        return (
          <ImageInput
            onImagesSubmitted={(files) => {
              host.onImagesSubmitted?.(files);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'centerline-upload':
        return (
          <CenterlineInput
            onSessionStart={() => {
              host.onCenterlineSessionStart?.();
              setIsCollapsed(true);
            }}
            onClFileUploaded={(content, fileName) => {
              host.onClFileUploaded?.(content, fileName);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'cad-manager-intake':
        return (
          <CadManagerInput
            onSessionStart={() => {
              host.onCadManagerSessionStart?.();
              setIsCollapsed(true);
            }}
            onFileUploaded={(content, fileName) => {
              host.onCadManagerFileUploaded?.(content, fileName);
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
          />
        );

      case 'road-links':
        return <RoadLinksSurface />;

      case 'roading-intake':
      case 'roading-designer':
        return (
          <RoadingInput
            centerlineCount={host.centerlineCount ?? 0}
            onSynthesizeExisting={() => {
              host.onRoadingSynthesizeExisting?.();
              setIsCollapsed(true);
            }}
            onDesignCorridor={(opts) => {
              host.onRoadingDesignCorridor?.(opts);
              setIsCollapsed(true);
            }}
            onOpenRoadingStudio={() => {
              host.onOpenRoadingStudio?.();
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      case 'redline-upload':
        return (
          <RedlineInput
            onPackageSubmitted={(files, readingMode) => {
              host.onRedlinePackageSubmitted?.(files, readingMode);
              setIsCollapsed(true);
            }}
            onOpenWorkspace={() => {
              host.onOpenRedlineWorkspace?.();
              setIsCollapsed(true);
            }}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
          />
        );

      default:
        return null;
    }
  };

  return (
    <A2UIEmbeddedContext.Provider value={true}>
      <div
        data-testid={`a2ui-surface-${payload.widgetType}`}
        className="relative mt-3 w-full"
        {...fileDrop.handlers}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Interactive Surface
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <SurfaceActions onPopOut={onPopOut} onDock={onDock} onChat={onChat} onFullscreen={onFullscreen} />
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[10.5px] font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              Minimize ▲
            </button>
          </div>
        </div>
        {fileDrop.enabled && (
          <div
            data-testid="a2ui-file-drop-hint"
            className="mb-1.5 flex items-center gap-1.5 rounded-md border border-dashed border-white/15 px-2 py-1 text-[9.5px] text-slate-400"
          >
            <span aria-hidden="true">⤓</span>
            Drag &amp; drop a file here
          </div>
        )}
        <Suspense fallback={<div className="p-3 text-xs text-slate-400">Loading upload options…</div>}>
          {renderWidget()}
        </Suspense>
        {fileDrop.overlay}
      </div>
    </A2UIEmbeddedContext.Provider>
  );
};

export default A2UISurface;
