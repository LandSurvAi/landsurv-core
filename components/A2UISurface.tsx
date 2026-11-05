import React, { createContext, Suspense, lazy, useContext, useEffect, useState } from 'react';
import { Maximize2, Settings2, Wrench } from 'lucide-react';
import {
  type AgentType,
  type A2UIPayload,
  type A2UICacpReviewItem,
  type A2UIWorkspaceToolId,
  type ComplianceSourceMode,
  type InclusionBoundary,
  type JobInfo,
  type SessionFile,
  type StandardsComplianceCheckSelection,
  type SurveyPoint,
} from '../types.ts';
import { A2UIEmbeddedContext } from './UploadShell.tsx';
import PointEditorInput from './PointEditorInput.tsx';
import FileUpload from './FileUpload.tsx';
import DxfInput from './DxfInput.tsx';
import GisInput from './GisInput.tsx';
import ZoningInput, { type ZoningSearchData } from './ZoningInput.tsx';
import ImageInput from './ImageInput.tsx';
import CenterlineInput from './CenterlineInput.tsx';
import CadManagerInput from './CadManagerInput.tsx';
import { A2UIStandardsTable } from './A2UIStandardsTable.tsx';
import { A2UIZoningResearch } from './A2UIZoningResearch.tsx';
import { A2UIZoningSources } from './A2UIZoningSources.tsx';
import { A2UICadManager } from './A2UICadManager.tsx';
import { A2UIInputForm } from './A2UIInputForm.tsx';
import { A2UISelectionPrompt } from './A2UISelectionPrompt.tsx';
import { A2UICacpManifestExplorer } from './A2UICacpManifestExplorer.tsx';
import { A2UICacpReview } from './A2UICacpReview.tsx';
import { A2UISettingsSurface } from './A2UISettingsSurface.tsx';

// Lazy-load PDF-backed intake components so pdfjs-dist is only loaded when a PDF intake widget is rendered
const CivilDrafterFileUpload = lazy(() => import('./CivilDrafterFileUpload.tsx'));
const DeedInput = lazy(() => import('./DeedInput.tsx'));
const PlanInput = lazy(() => import('./PlanInput.tsx'));
const StandardsComplianceInput = lazy(() => import('./StandardsComplianceInput.tsx'));

export const WORKSPACE_TOOL_LABELS: Record<A2UIWorkspaceToolId, string> = {
  'symbol-manager': 'Symbol Manager',
  'linetype-manager': 'Linetype Manager',
  'hatch-manager': 'Hatch Manager',
  'annotate-manager': 'Annotate Manager',
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
  'sheet-view': 'Sheet View (24×36 Plot Layout)',
};

export interface A2UIHostContextValue {
  // Point Editor
  onPointsUploaded?: (points: SurveyPoint[], fileName: string) => void;
  onPointEditorSessionStart?: () => void;
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
  // CAD Manager
  onCadManagerSessionStart?: () => void;
  onCadManagerFileUploaded?: (content: string, fileName: string) => void;
  /** Open the live CAD standards sheet in chat. */
  onOpenCadStandards?: () => void;
  /** Open the CAD Manager workspace inside the A2UI float/dock host. */
  onOpenCadWorkspace?: () => void;
  /** Open the full-screen CAD standards spreadsheet editor directly. */
  onOpenSpreadsheetEditor?: () => void;
  /** Render a workspace manager/tool panel inside an A2UI surface. */
  renderWorkspaceTool?: (
    toolId: A2UIWorkspaceToolId,
    presentation: 'inline' | 'floating' | 'docked'
  ) => React.ReactNode;
  /** Send values collected by an A2UI input form back to the owning agent. */
  onSubmitInput?: (message: string, payload: A2UIPayload) => void;
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
}

export const A2UIHostContext = createContext<A2UIHostContextValue>({});

interface A2UISurfaceProps {
  payload: A2UIPayload;
  /** Optional: move this surface into the agent tool shelf. */
  onDock?: () => void;
  /** Optional: move this surface into a floating dialog on the canvas. */
  onPopOut?: () => void;
  /** Inline chat card vs. the same surface hosted in a float/dock. */
  presentation?: 'inline' | 'floating' | 'docked';
  /** Full CAD Manager workspace rendered by the floating/docked presentation. */
  cadManagerContent?: React.ReactNode;
}

const SurfaceActions: React.FC<{
  onPopOut?: () => void;
  onDock?: () => void;
  onFullscreen?: () => void;
  onMinimize?: () => void;
}> = ({ onPopOut, onDock, onFullscreen, onMinimize }) => {
  if (!onPopOut && !onDock && !onFullscreen && !onMinimize) return null;
  const buttonClass =
    'inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100';
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {onPopOut && (
        <button
          type="button"
          onClick={onPopOut}
          data-testid="a2ui-popout-button"
          className={buttonClass}
          title="Pop this surface out into a floating dialog"
        >
          Pop out
        </button>
      )}
      {onDock && (
        <button
          type="button"
          onClick={onDock}
          data-testid="a2ui-dock-button"
          className={buttonClass}
          title="Dock this surface in the agent tool shelf"
        >
          Dock
        </button>
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
  presentation = 'inline',
  cadManagerContent,
}) => {
  const host = useContext(A2UIHostContext);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    payload.status === 'completed' || payload.status === 'dismissed'
  );

  useEffect(() => {
    if (payload.status === 'completed' || payload.status === 'dismissed') {
      setIsCollapsed(true);
    } else if (payload.status === 'expanded') {
      setIsCollapsed(false);
    }
  }, [payload.status]);

  const onFullscreen =
    presentation === 'inline' && host.onOpenFullscreen
      ? () => host.onOpenFullscreen?.(payload)
      : undefined;

  const onMinimize =
    presentation === 'inline' ? () => setIsCollapsed(true) : undefined;

  if (payload.kind === 'intake-prompt') {
    return null;
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
            {payload.completedSummary || 'A2UI surface minimized'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onPopOut && (
            <button
              type="button"
              onClick={onPopOut}
              className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-400"
            >
              Pop out
            </button>
          )}
          {onDock && (
            <button
              type="button"
              onClick={onDock}
              className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-400"
            >
              Dock
            </button>
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

  if (payload.kind === 'settings') {
    return (
      <div data-testid="a2ui-surface-settings" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            <Settings2 className="h-3 w-3" />
            A2UI Project Settings
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-sky-200">
              Live
            </span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <A2UISettingsSurface
          initialSection={payload.settingsSection ?? 'all'}
          settingsSummary={payload.settingsSummary}
          onOpenFullscreen={onFullscreen}
        />
      </div>
    );
  }

  if (payload.kind === 'workspace-tool') {
    const toolId = (payload.workspaceTool ?? payload.widgetType) as A2UIWorkspaceToolId;
    const toolLabel = WORKSPACE_TOOL_LABELS[toolId] ?? 'Workspace Tool';
    const embedded = presentation !== 'inline';
    const rendered = host.renderWorkspaceTool?.(toolId, presentation);
    return (
      <div
        data-testid={`a2ui-surface-${toolId}`}
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'mt-3 w-full'}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            <Wrench className="h-3 w-3" />
            A2UI {toolLabel}
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/90 ${
            embedded ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[min(62vh,520px)] overflow-y-auto'
          }`}
        >
          {rendered ?? (
            <div className="p-4 text-xs text-slate-300">
              <p className="font-semibold text-white">{toolLabel}</p>
              <p className="mt-1 text-slate-400">
                Interactive {toolLabel} surface ready. Use Pop out, Dock, or Fullscreen for more room.
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
            A2UI CACP Manifests
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            A2UI CACP Review
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
            onFullscreen={onFullscreen}
            onMinimize={onMinimize}
          />
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-amber-400/25 bg-[#070e18]/70 ${
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
            A2UI Selection
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
            A2UI Input Request
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] text-slate-500">The agent will continue automatically</span>
            <SurfaceActions
              onPopOut={onPopOut}
              onDock={onDock}
              onFullscreen={onFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
        <A2UIInputForm
          form={payload.inputForm}
          onSubmit={message => host.onSubmitInput?.(message, payload)}
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
            A2UI Zoning Research
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
            A2UI Zoning Sources
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
            A2UI Standards Sheet
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
            A2UI CAD Manager
          </span>
          <SurfaceActions
            onPopOut={onPopOut}
            onDock={onDock}
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
          <DeedInput
            onDeedSubmitted={(file) => {
              host.onDeedSubmitted?.(file);
              setIsCollapsed(true);
            }}
            onDeedBatchSubmitted={
              host.onDeedBatchSubmitted
                ? (files) => {
                    host.onDeedBatchSubmitted?.(files);
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
            freeDeedsRemaining={host.freeDeedsRemaining ?? null}
            freeDeedsLimit={host.freeDeedsLimit}
            freeDeedsUnlimited={host.freeDeedsUnlimited}
            freeDeedsUnverified={host.freeDeedsUnverified}
            onShowUpgrade={host.onShowUpgrade}
            onGoBack={handleDismiss}
            backButtonTitle="Hide"
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

      default:
        return null;
    }
  };

  return (
    <A2UIEmbeddedContext.Provider value={true}>
      <div
        data-testid={`a2ui-surface-${payload.widgetType}`}
        className="mt-3 w-full"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            A2UI Interactive Surface
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <SurfaceActions onPopOut={onPopOut} onDock={onDock} onFullscreen={onFullscreen} />
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[10.5px] font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              Minimize ▲
            </button>
          </div>
        </div>
        <Suspense fallback={<div className="p-3 text-xs text-slate-400">Loading upload options…</div>}>
          {renderWidget()}
        </Suspense>
      </div>
    </A2UIEmbeddedContext.Provider>
  );
};

export default A2UISurface;
