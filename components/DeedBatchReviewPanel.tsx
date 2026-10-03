// DeedBatchReviewPanel.tsx — Batch deed triage panel with parcel matching + coarse alignment
import React, { useMemo, useState } from 'react';
import type {
  DeedBatchJob,
  DeedBatchFileRecord,
  ParcelMatchCandidate,
  ParcelMatchInput,
  ParcelMatchResult,
} from '../types.ts';
import {
  scoreParcelMatchCandidates,
  decideAlignmentAction,
  exportBatchJobAsCsv,
  runCountyAdapterPreflight,
  type BatchPreflightResult,
} from '../services/batchDeedProcessor.ts';
import { PARCEL_GIS_SERVICES } from '../services/parcelGisService.ts';

export interface BatchParcelLabelPoint {
  parcelId: string | null;
  x: number;
  y: number;
}

export interface DeedBatchReviewPanelProps {
  job: DeedBatchJob;
  countyCandidates: ParcelMatchCandidate[];
  parcelLabelPoints: BatchParcelLabelPoint[];
  /** Active county service ID (matches PARCEL_GIS_SERVICES[].id). */
  activeCountyServiceId?: string;
  onComputeFile: (fileId: string) => void;
  onCoarseAlign: (fileId: string, targetParcelId: string) => void;
  onDismissFile: (fileId: string) => void;
  /** Rollback a coarse alignment to the pre-align snapshot. */
  onRollbackFile: (fileId: string) => void;
  /** Auto-align all high-confidence matched files in one pass. */
  onAlignAll: () => void;
  onClose: () => void;
}

const confidenceColor: Record<'high' | 'medium' | 'low', string> = {
  high:   'text-green-300 border-green-500/50 bg-green-900/20',
  medium: 'text-amber-300 border-amber-500/50 bg-amber-900/20',
  low:    'text-red-300   border-red-500/50   bg-red-900/20',
};

const statusColor: Record<string, string> = {
  queued:            'text-gray-400',
  extracting:        'text-blue-300',
  summarizing:       'text-blue-300',
  summarized:        'text-cyan-300',
  parsed:            'text-cyan-300',
  matched:           'text-amber-300',
  aligned:           'text-green-300',
  'review-required': 'text-yellow-300',
  completed:         'text-green-400',
  failed:            'text-red-300',
};

function FileRow({
  file,
  candidates,
  parcelLabelPoints,
  isSelected,
  onSelect,
  onComputeFile,
  onCoarseAlign,
  onDismissFile,
  onRollbackFile,
}: {
  file: DeedBatchFileRecord;
  candidates: ParcelMatchCandidate[];
  parcelLabelPoints: BatchParcelLabelPoint[];
  isSelected: boolean;
  onSelect: () => void;
  onComputeFile: (id: string) => void;
  onCoarseAlign: (id: string, parcelId: string) => void;
  onDismissFile: (id: string) => void;
  onRollbackFile: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(isSelected);

  const matchResult = useMemo<ParcelMatchResult | undefined>(() => {
    if (file.topMatch) return file.topMatch;
    if (!file.summary || candidates.length === 0) return undefined;
    const input: ParcelMatchInput = {
      parcelId: file.summary.parcelId ?? null,
      ownerName: file.summary.owner ?? null,
      deedBook: file.summary.book ?? null,
      deedPage: file.summary.page ?? null,
    };
    return scoreParcelMatchCandidates(input, candidates)[0];
  }, [file.topMatch, file.summary, candidates]);

  const alignDecision = useMemo(
    () => file.alignmentDecision ?? decideAlignmentAction(matchResult),
    [file.alignmentDecision, matchResult],
  );

  const hasCentroid = matchResult?.candidate.parcelId
    ? parcelLabelPoints.some(lp => lp.parcelId === matchResult.candidate.parcelId)
    : false;

  const canCoarseAlign =
    alignDecision.action !== 'manual-review' &&
    hasCentroid &&
    matchResult?.candidate.parcelId != null;

  const tractCount = file.summary?.tracts.length ?? 0;

  return (
    <div className={`rounded border transition-colors ${isSelected ? 'border-emerald-500/60 bg-emerald-900/10' : 'border-gray-700 bg-gray-950/40'}`}>
      <button
        type="button"
        className="w-full text-left p-2 flex items-center justify-between gap-2"
        onClick={() => { onSelect(); setExpanded(e => !e); }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-gray-100 truncate" title={file.fileName}>{file.fileName}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] uppercase tracking-wide ${statusColor[file.status] ?? 'text-gray-400'}`}>{file.status}</span>
            {tractCount > 0 && <span className="text-[10px] text-gray-500">{tractCount} tract{tractCount !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        {matchResult && (
          <span className={`shrink-0 px-1.5 py-0.5 border rounded uppercase tracking-wide text-[10px] ${confidenceColor[matchResult.confidence]}`}>
            {matchResult.confidence}
          </span>
        )}
        <span className="text-[10px] text-gray-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-gray-800">
          {matchResult ? (
            <div className="space-y-0.5 pt-1.5">
              <div className="text-[11px] text-gray-300">
                <span className="text-gray-500">Match: </span>
                {matchResult.candidate.parcelId || 'Unknown parcel'}
                {matchResult.candidate.ownerName ? <span className="text-gray-400"> · {matchResult.candidate.ownerName}</span> : null}
              </div>
              <div className="text-[10px] text-gray-500">Score {matchResult.score} · {alignDecision.reason}</div>
              {matchResult.explanation.length > 0 && (
                <div className="text-[10px] text-gray-600">{matchResult.explanation.join(' ')}</div>
              )}
              {!hasCentroid && alignDecision.action !== 'manual-review' && (
                <div className="text-[10px] text-amber-400">No parcel centroid — fetch county GIS parcels to enable coarse alignment.</div>
              )}
            </div>
          ) : (
            <div className="pt-1.5 text-[11px] text-gray-500">
              {file.summary ? 'No GIS candidates — fetch county parcels to enable matching.' : 'Awaiting tract summary…'}
            </div>
          )}

          {tractCount > 0 && (
            <div className="space-y-0.5">
              {file.summary!.tracts.map(t => (
                <div key={t.tractId} className="text-[10px] text-gray-400 flex gap-2">
                  <span className="text-gray-300">{t.tractId}</span>
                  {t.acreage && <span>{t.acreage}</span>}
                  {t.grantor && <span className="truncate text-gray-500">{t.grantor}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {(file.status === 'summarized' || file.status === 'matched' || file.status === 'review-required') && (
              <button
                type="button"
                onClick={() => onComputeFile(file.id)}
                className="px-2 py-1 text-[10px] bg-cyan-700/60 hover:bg-cyan-600/60 text-cyan-200 border border-cyan-500/40 rounded transition-colors"
              >
                Compute Tracts
              </button>
            )}

            {canCoarseAlign && alignDecision.action === 'auto-align' && file.status !== 'aligned' && (
              <button
                type="button"
                onClick={() => onCoarseAlign(file.id, matchResult!.candidate.parcelId!)}
                className="px-2 py-1 text-[10px] bg-green-700/60 hover:bg-green-600/60 text-green-200 border border-green-500/40 rounded transition-colors"
                title="Centroid-to-centroid translation — high confidence"
              >
                ✓ Auto-Align
              </button>
            )}

            {canCoarseAlign && alignDecision.action === 'prompt' && file.status !== 'aligned' && (
              <button
                type="button"
                onClick={() => onCoarseAlign(file.id, matchResult!.candidate.parcelId!)}
                className="px-2 py-1 text-[10px] bg-amber-700/60 hover:bg-amber-600/60 text-amber-200 border border-amber-500/40 rounded transition-colors"
                title="Medium-confidence — confirm before committing"
              >
                ⚠ Approve Align
              </button>
            )}

            {file.status === 'aligned' && file.preAlignSnapshot !== undefined && (
              <button
                type="button"
                onClick={() => onRollbackFile(file.id)}
                className="px-2 py-1 text-[10px] bg-indigo-700/60 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40 rounded transition-colors"
                title="Restore pre-alignment transform"
              >
                ↩ Rollback
              </button>
            )}

            {file.status !== 'aligned' && (
              <button
                type="button"
                onClick={() => onDismissFile(file.id)}
                className="px-2 py-1 text-[10px] bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 border border-gray-600/40 rounded transition-colors"
              >
                Manual Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const DeedBatchReviewPanel: React.FC<DeedBatchReviewPanelProps> = ({
  job,
  countyCandidates,
  parcelLabelPoints,
  activeCountyServiceId,
  onComputeFile,
  onCoarseAlign,
  onDismissFile,
  onRollbackFile,
  onAlignAll,
  onClose,
}) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(job.files[0]?.id ?? '');
  const [preflight, setPreflight] = useState<BatchPreflightResult | null>(null);
  const [preflightRunning, setPreflightRunning] = useState(false);

  const { high, medium, low, pending } = useMemo(() => {
    let high = 0, medium = 0, low = 0, pending = 0;
    for (const file of job.files) {
      const conf = file.topMatch?.confidence;
      if (conf === 'high') high++;
      else if (conf === 'medium') medium++;
      else if (file.summary) low++;
      else pending++;
    }
    return { high, medium, low, pending };
  }, [job.files]);

  const handleExportCsv = () => {
    const csv = exportBatchJobAsCsv(job);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `batch-${job.id.slice(-8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRunPreflight = async () => {
    const serviceId = activeCountyServiceId ?? PARCEL_GIS_SERVICES[0]?.id;
    const service = PARCEL_GIS_SERVICES.find(s => s.id === serviceId);
    if (!service) return;
    setPreflightRunning(true);
    setPreflight(null);
    try {
      const result = await runCountyAdapterPreflight(
        service.url,
        service.parcelIdFields,
        service.ownerFields,
        service.attributeLookup?.deedBookFields,
        service.attributeLookup?.deedPageFields,
      );
      setPreflight(result);
    } finally {
      setPreflightRunning(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-30 w-[420px] max-w-[94vw] bg-gray-900/97 border border-emerald-500/40 rounded-lg shadow-2xl text-xs flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <div>
          <div className="font-semibold text-emerald-300">Batch Review Queue</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{job.processedFiles}/{job.totalFiles} processed · {job.status}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="text-[10px] px-2 py-1 bg-gray-700/70 hover:bg-gray-600/70 text-gray-300 border border-gray-600/50 rounded transition-colors"
            title="Download batch results as CSV"
          >
            Export CSV
          </button>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 text-base px-1" title="Close">×</button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-800 shrink-0 text-[10px]">
        {high   > 0 && <span className="text-green-300">{high} high</span>}
        {medium > 0 && <span className="text-amber-300">{medium} med</span>}
        {low    > 0 && <span className="text-red-300">{low} low</span>}
        {pending > 0 && <span className="text-gray-400">{pending} pending</span>}
        <span className="flex-1" />
        {high > 0 && (
          <button
            type="button"
            onClick={onAlignAll}
            className="px-2 py-0.5 bg-green-700/70 hover:bg-green-600/70 text-green-200 border border-green-500/50 rounded transition-colors"
            title={`Auto-align all ${high} high-confidence file(s)`}
          >
            Align All ({high})
          </button>
        )}
        <button
          type="button"
          onClick={handleRunPreflight}
          disabled={preflightRunning}
          className="px-2 py-0.5 bg-gray-700/70 hover:bg-gray-600/70 text-gray-300 border border-gray-600/50 rounded transition-colors disabled:opacity-50"
          title="Validate county GIS service configuration before batch run"
        >
          {preflightRunning ? 'Checking…' : 'Validate GIS'}
        </button>
      </div>

      {preflight && (
        <div className={`px-3 py-2 border-b text-[10px] space-y-0.5 ${preflight.passed ? 'border-green-800 bg-green-950/40' : 'border-red-800 bg-red-950/40'}`}>
          <div className={preflight.passed ? 'text-green-300 font-semibold' : 'text-red-300 font-semibold'}>
            {preflight.passed ? '✓ GIS adapter validated' : '✗ GIS adapter issues found'}
          </div>
          {preflight.issues.map((issue, i) => (
            <div key={i} className={issue.level === 'error' ? 'text-red-300' : 'text-amber-300'}>
              {issue.level === 'error' ? '✗' : '⚠'} {issue.message}
            </div>
          ))}
          {preflight.issues.length === 0 && (
            <div className="text-gray-400">All required fields present on the county service.</div>
          )}
        </div>
      )}

      {countyCandidates.length === 0 && !preflight && (
        <div className="px-3 py-1.5 border-b border-gray-800 text-[10px] text-gray-500 shrink-0">
          No GIS parcel candidates yet — fetch county parcels via the Parcel panel to enable matching and alignment.
        </div>
      )}

      <div className="overflow-auto flex-1 p-2 space-y-1.5">
        {job.files.map(file => (
          <FileRow
            key={file.id}
            file={file}
            candidates={countyCandidates}
            parcelLabelPoints={parcelLabelPoints}
            isSelected={file.id === selectedFileId}
            onSelect={() => setSelectedFileId(file.id)}
            onComputeFile={onComputeFile}
            onCoarseAlign={onCoarseAlign}
            onDismissFile={onDismissFile}
            onRollbackFile={onRollbackFile}
          />
        ))}
      </div>
    </div>
  );
};

export default DeedBatchReviewPanel;
