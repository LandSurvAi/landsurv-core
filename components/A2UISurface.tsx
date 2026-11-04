import React, { createContext, Suspense, lazy, useContext, useEffect, useState } from 'react';
import {
  type A2UIPayload,
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

// Lazy-load PDF-backed intake components so pdfjs-dist is only loaded when a PDF intake widget is rendered
const CivilDrafterFileUpload = lazy(() => import('./CivilDrafterFileUpload.tsx'));
const DeedInput = lazy(() => import('./DeedInput.tsx'));
const PlanInput = lazy(() => import('./PlanInput.tsx'));
const StandardsComplianceInput = lazy(() => import('./StandardsComplianceInput.tsx'));

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
  /** Open the full CAD standards spreadsheet editor. */
  onOpenCadStandards?: () => void;
}

export const A2UIHostContext = createContext<A2UIHostContextValue>({});

interface A2UISurfaceProps {
  payload: A2UIPayload;
  /** Optional: move this surface into the agent tool shelf. */
  onDock?: () => void;
}

export const A2UISurface: React.FC<A2UISurfaceProps> = ({ payload, onDock }) => {
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

  if (payload.kind === 'intake-prompt') {
    return null;
  }

  if (payload.kind === 'standards-explorer') {
    return (
      <div data-testid="a2ui-surface-cad-standards-table" className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            A2UI Standards Sheet
          </span>
          {onDock && (
            <button
              type="button"
              onClick={onDock}
              data-testid="a2ui-dock-button"
              className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
              title="Dock this sheet in the agent tool shelf"
            >
              Dock
            </button>
          )}
        </div>
        <A2UIStandardsTable
          filter={payload.standardsFilter}
          onOpenEditor={host.onOpenCadStandards}
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
            {onDock && (
              <button
                type="button"
                onClick={onDock}
                data-testid="a2ui-dock-button"
                className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
                title="Dock this tool in the agent tool shelf"
              >
                Dock
              </button>
            )}
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
