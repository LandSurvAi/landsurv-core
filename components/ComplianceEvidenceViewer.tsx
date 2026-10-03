import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, StandardsComplianceIcon, XMarkIcon } from './icons';
import type { SessionFile, StandardsComplianceEvidence, StandardsComplianceReport } from '../types';

interface EvidenceTarget {
  fileName: string;
  pageNumber: number;
}

interface ComplianceEvidenceViewerProps {
  subjectFile: SessionFile | null;
  /** Any number of reference/control PDFs used as examples of the correct standard. */
  controlFiles: SessionFile[];
  report: StandardsComplianceReport | null;
  target?: EvidenceTarget | null;
  onTargetHandled?: () => void;
}

// 'subject', or the index of a reference/control document in `controlFiles`.
type ActiveDoc = 'subject' | number;

interface EvidenceMarker {
  id: string;
  kind: 'issue' | 'passed';
  title: string;
  evidence: StandardsComplianceEvidence;
  severity: 'error' | 'warning' | 'info';
}

const markerColors = {
  error: { border: '#f87171', fill: 'rgba(248, 113, 113, 0.22)', text: 'text-red-200' },
  warning: { border: '#fbbf24', fill: 'rgba(251, 191, 36, 0.22)', text: 'text-amber-200' },
  info: { border: '#34d399', fill: 'rgba(52, 211, 153, 0.20)', text: 'text-emerald-200' },
};

const ComplianceEvidenceViewer: React.FC<ComplianceEvidenceViewerProps> = ({
  subjectFile,
  controlFiles,
  report,
  target,
  onTargetHandled,
}) => {
  const [activeDoc, setActiveDoc] = useState<ActiveDoc>('subject');
  const [subjectPage, setSubjectPage] = useState(1);
  const [controlPages, setControlPages] = useState<Record<number, number>>({});
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const markers = useMemo<EvidenceMarker[]>(() => {
    if (!report) return [];
    const result: EvidenceMarker[] = [];
    report.issues.forEach((issue, issueIndex) => {
      (issue.spatialEvidence || []).forEach((evidence, evidenceIndex) => {
        result.push({
          id: `issue-${issueIndex}-${evidenceIndex}`,
          kind: 'issue',
          title: issue.title,
          evidence,
          severity: issue.severity,
        });
      });
    });
    (report.checkResults || []).filter(check => check.status === 'passed').forEach((check, checkIndex) => {
      (check.evidence || []).forEach((evidence, evidenceIndex) => {
        result.push({
          id: `passed-${checkIndex}-${evidenceIndex}`,
          kind: 'passed',
          title: check.conclusion,
          evidence,
          severity: 'info',
        });
      });
    });
    return result;
  }, [report]);

  const getPageCount = (file: SessionFile | null | undefined) => file?.rasterImageData?.length || 0;
  const getImageForPage = (file: SessionFile | null | undefined, page: number) => {
    if (!file?.rasterImageData?.length) return null;
    const selectedIndex = file.selectedPages?.indexOf(page) ?? -1;
    return file.rasterImageData[selectedIndex >= 0 ? selectedIndex : page - 1] || null;
  };

  useEffect(() => {
    if (!target) return;
    const controlIndex = controlFiles.findIndex(f => f.name === target.fileName);
    const isControl = controlIndex >= 0;
    const file = isControl ? controlFiles[controlIndex] : subjectFile;
    const pages = file?.selectedPages || [];
    const pageIndex = pages.indexOf(target.pageNumber);
    const page = pageIndex >= 0 ? target.pageNumber : Math.max(1, target.pageNumber);
    if (isControl) {
      setControlPages(prev => ({ ...prev, [controlIndex]: page }));
      setActiveDoc(controlIndex);
    } else {
      setSubjectPage(page);
      setActiveDoc('subject');
    }
    const marker = markers.find(item => item.evidence.fileName === target.fileName && item.evidence.pageNumber === target.pageNumber);
    setSelectedMarkerId(marker?.id || null);
    onTargetHandled?.();
  }, [controlFiles, markers, onTargetHandled, subjectFile, target]);

  const activeFile = activeDoc === 'subject' ? subjectFile : controlFiles[activeDoc];
  const activePage = activeDoc === 'subject' ? subjectPage : (controlPages[activeDoc] ?? 1);
  const setActivePage = (updater: (page: number) => number) => {
    if (activeDoc === 'subject') {
      setSubjectPage(updater);
    } else {
      const idx = activeDoc;
      setControlPages(prev => ({ ...prev, [idx]: updater(prev[idx] ?? 1) }));
    }
  };
  const activeImage = getImageForPage(activeFile, activePage);
  const activeMarkers = markers.filter(marker => marker.evidence.fileName === activeFile?.name && marker.evidence.pageNumber === activePage);
  const activePageCount = getPageCount(activeFile);
  const hasUnmappedFallbackFindings = report?.metadata.analysisMethod === 'text-heuristic'
    && activeDoc === 'subject'
    && report.issues.length > 0;

  const changePage = (delta: number) => {
    setActivePage(page => Math.min(Math.max(page + delta, 1), Math.max(activePageCount, 1)));
    setSelectedMarkerId(null);
  };

  const renderDocumentTab = (key: ActiveDoc, label: string, file: SessionFile | null | undefined) => (
    <button
      key={key}
      type="button"
      onClick={() => { setActiveDoc(key); setSelectedMarkerId(null); }}
      disabled={!file}
      className={`flex-shrink-0 min-w-0 px-3 py-2 text-left border-b-2 transition-colors ${
        activeDoc === key ? 'border-cyan-400 bg-gray-800 text-cyan-200' : 'border-transparent text-gray-500 hover:text-gray-300'
      } disabled:opacity-40`}
      style={{ maxWidth: '11rem' }}
    >
      <span className="block text-[10px] uppercase tracking-wider font-bold">{label}</span>
      <span className="block truncate text-xs mt-0.5">{file?.name || 'Not loaded'}</span>
    </button>
  );

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#111827] text-gray-200">
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-gray-700 bg-gray-950/70">
        <StandardsComplianceIcon className="w-5 h-5 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-100">Plan Evidence</h3>
          <p className="text-[11px] text-gray-500">Visual evidence from the reviewed PDF pages</p>
        </div>
        <span className="text-[10px] text-gray-500">{markers.length} mapped evidence item{markers.length === 1 ? '' : 's'}</span>
      </div>

      <div className="flex-shrink-0 flex border-b border-gray-700 overflow-x-auto">
        {renderDocumentTab('subject', 'Subject plan', subjectFile)}
        {controlFiles.map((file, idx) => renderDocumentTab(
          idx,
          controlFiles.length > 1 ? `Reference ${idx + 1}/${controlFiles.length}` : 'Reference plan',
          file,
        ))}
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
        <button type="button" onClick={() => changePage(-1)} disabled={activePage <= 1 || activePageCount === 0} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Previous page">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400 min-w-[86px] text-center">Page {activePage} / {activePageCount || '—'}</span>
        <button type="button" onClick={() => changePage(1)} disabled={activePage >= activePageCount || activePageCount === 0} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30" title="Next page">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-500">
          {hasUnmappedFallbackFindings ? 'Sheet-wide fallback review' : `${activeMarkers.length} marker${activeMarkers.length === 1 ? '' : 's'} on page`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 bg-[#0b1220]">
        {activeImage ? (
          <div className="relative mx-auto w-fit max-w-full shadow-2xl border border-gray-700 bg-black">
            <img src={activeImage} alt={`${activeDoc === 'subject' ? 'Subject plan' : 'Reference plan'} page ${activePage}`} className="block max-w-full max-h-[calc(100vh-260px)] object-contain" />
            {hasUnmappedFallbackFindings && (
              <div
                className="absolute inset-0 pointer-events-none border-2 border-amber-400/80"
                style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(251, 191, 36, 0.13) 0, rgba(251, 191, 36, 0.13) 8px, transparent 8px, transparent 22px)' }}
              >
                <span className="absolute left-2 top-2 bg-amber-950/95 border border-amber-400/70 px-2 py-1 rounded text-[10px] font-semibold text-amber-200 shadow-lg">
                  Text fallback: sheet-wide review required; not a precise location finding
                </span>
              </div>
            )}
            {activeMarkers.map(marker => {
              const box = marker.evidence.box2dNorm;
              if (!box) return null;
              const [ymin, xmin, ymax, xmax] = box;
              const colors = markerColors[marker.severity];
              const selected = marker.id === selectedMarkerId;
              return (
                <button
                  key={marker.id}
                  type="button"
                  onClick={() => setSelectedMarkerId(marker.id)}
                  className={`absolute border-2 transition-shadow ${selected ? 'z-10 shadow-[0_0_0_3px_rgba(255,255,255,0.8)]' : ''}`}
                  style={{ left: `${xmin / 10}%`, top: `${ymin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%`, borderColor: colors.border, backgroundColor: colors.fill }}
                  title={marker.title}
                >
                  <span className="absolute -top-5 left-0 whitespace-nowrap bg-gray-950/90 px-1.5 py-0.5 text-[10px] text-gray-100 rounded">
                    {marker.kind === 'passed' ? 'PASS' : marker.severity.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-full min-h-[240px] flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm text-gray-300">No raster page is available for this document.</p>
              <p className="text-xs text-gray-500 mt-1">Reprocess the PDF intake to create visual evidence pages.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900/90 px-3 py-2">
        {selectedMarkerId ? (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-100 truncate">{activeMarkers.find(marker => marker.id === selectedMarkerId)?.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{activeMarkers.find(marker => marker.id === selectedMarkerId)?.evidence.description || 'Selected evidence marker'}</p>
            </div>
            <button type="button" onClick={() => setSelectedMarkerId(null)} className="p-1 rounded hover:bg-gray-700 text-gray-500" title="Clear selected marker">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
            <span><i className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Error</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Warning</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />Successful evidence</span>
            <span>Boxes appear when Gemini returned a visual location.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplianceEvidenceViewer;
