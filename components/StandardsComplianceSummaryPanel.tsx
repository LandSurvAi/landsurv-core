import React, { useEffect, useMemo, useRef } from 'react';
import { StandardsComplianceIcon, ClipboardDocumentListIcon } from './icons';
import {
  type ComplianceSourceMode,
  type StandardsComplianceCheckId,
  type StandardsComplianceCheckSelection,
  type StandardsComplianceCheckResult,
  type StandardsComplianceReport,
} from '../types';

interface StandardsComplianceSummaryPanelProps {
  report: StandardsComplianceReport | null;
  subjectFileName?: string;
  controlFileNames?: string[];
  checks: StandardsComplianceCheckSelection;
  sourceMode: ComplianceSourceMode;
  isRunning?: boolean;
  onChecksChange: (checks: StandardsComplianceCheckSelection) => void;
  onSourceModeChange: (mode: ComplianceSourceMode) => void;
  onRunAudit: (mode?: ComplianceSourceMode) => void;
  onAddFiles: () => void;
  onOpenChat: () => void;
  onSelectEvidence?: (fileName: string, pageNumber: number) => void;
}

const CHECK_LABELS: Array<{ id: StandardsComplianceCheckId; label: string }> = [
  { id: 'title_block', label: 'Title block' },
  { id: 'north_arrow', label: 'North arrow' },
  { id: 'annotation_completeness', label: 'Annotations' },
  { id: 'required_layers', label: 'Required layers' },
  { id: 'linetype_compliance', label: 'Linetypes' },
  { id: 'scale_and_sheet_metadata', label: 'Scale & metadata' },
  { id: 'legend_symbol_consistency', label: 'Legend/symbols' },
  { id: 'revision_block', label: 'Revision block' },
  { id: 'zoning_table_and_dimensional_compliance', label: 'Zoning table & dimensions' },
  { id: 'site_location_map', label: 'Site location map' },
  { id: 'impervious_coverage_chart', label: 'Impervious coverage' },
];

const SOURCE_OPTIONS: Array<{ value: ComplianceSourceMode; label: string }> = [
  { value: 'ask-each-run', label: 'Auto (best available)' },
  { value: 'cad-manager', label: 'CAD Manager only' },
  { value: 'control-pdf', label: 'Reference PDF(s) only' },
  { value: 'combined', label: 'Combined' },
];

const SEVERITY_ORDER: Array<'error' | 'warning' | 'info'> = ['error', 'warning', 'info'];

const SEVERITY_STYLES: Record<'error' | 'warning' | 'info', { badge: string; label: string }> = {
  error: { badge: 'bg-red-900/40 border-red-600 text-red-300', label: 'Error' },
  warning: { badge: 'bg-amber-900/40 border-amber-600 text-amber-300', label: 'Warning' },
  info: { badge: 'bg-sky-900/40 border-sky-600 text-sky-300', label: 'Info' },
};

const StandardsComplianceSummaryPanel: React.FC<StandardsComplianceSummaryPanelProps> = ({
  report,
  subjectFileName,
  controlFileNames,
  checks,
  sourceMode,
  isRunning = false,
  onChecksChange,
  onSourceModeChange,
  onRunAudit,
  onAddFiles,
  onOpenChat,
  onSelectEvidence,
}) => {
  // Auto-run once when a subject file is loaded but no report exists yet, so the
  // summary panel is never blank on first arrival — it's the agent's default mode.
  const hasAutoRun = useRef(false);
  useEffect(() => {
    if (!report && subjectFileName && !hasAutoRun.current) {
      hasAutoRun.current = true;
      onRunAudit();
    }
  }, [report, subjectFileName, onRunAudit]);

  const issuesBySeverity = useMemo(() => {
    const groups: Record<'error' | 'warning' | 'info', StandardsComplianceReport['issues']> = {
      error: [], warning: [], info: [],
    };
    for (const issue of report?.issues ?? []) {
      groups[issue.severity].push(issue);
    }
    return groups;
  }, [report]);

  const checkResults = report?.checkResults ?? [];
  const checksByStatus = useMemo(() => {
    const groups: Record<'passed' | 'issue' | 'not-assessable', StandardsComplianceCheckResult[]> = {
      passed: [], issue: [], 'not-assessable': [],
    };
    for (const result of checkResults) groups[result.status].push(result);
    return groups;
  }, [checkResults]);

  const toggleCheck = (id: StandardsComplianceCheckId) => {
    onChecksChange({ ...checks, [id]: !checks[id] });
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5 bg-[#101722]">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 bg-[#171f2d] rounded-md border border-slate-700/80">
          <div className="w-9 h-9 grid place-items-center border border-violet-400/30 bg-violet-500/10 rounded-md flex-shrink-0">
            <StandardsComplianceIcon className="w-5 h-5 text-violet-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Plan QA / Compliance Review</p>
            <h2 className="text-base font-semibold text-slate-100 mt-0.5">Standards Compliance</h2>
            <p className="text-xs text-slate-400 truncate mt-1">
              Subject <span className="text-slate-200">{subjectFileName || 'No subject PDF loaded'}</span>
              {controlFileNames && controlFileNames.length > 0 && (
                <> <span className="text-slate-600 px-1">/</span> Reference{controlFileNames.length > 1 ? ` (${controlFileNames.length})` : ''} <span className="text-slate-200">{controlFileNames.join(', ')}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onAddFiles}
            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600 hover:border-slate-500 hover:bg-slate-700/50 text-slate-300 flex-shrink-0"
          >
            Replace Files
          </button>
        </div>

        {/* Controls: source mode + checklist + run */}
        <div className="p-3 bg-[#171f2d] rounded-md border border-slate-700/80 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-semibold">Source</label>
            <select
              value={sourceMode}
              onChange={(e) => onSourceModeChange(e.target.value as ComplianceSourceMode)}
              className="bg-slate-900 border border-slate-600 rounded-md text-xs px-2 py-1.5 text-slate-100"
            >
              {SOURCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => onRunAudit()}
              disabled={!subjectFileName || isRunning}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold"
            >
              {isRunning ? 'Analyzing…' : 'Run Audit'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHECK_LABELS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => toggleCheck(id)}
                disabled={isRunning}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                  checks[id]
                    ? 'bg-violet-500/15 border-violet-400/60 text-violet-200'
                    : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Report body */}
        {!report ? (
          <div className="p-6 bg-gray-900/60 rounded-lg border border-gray-700 text-center text-gray-400 text-sm">
            {isRunning ? 'Analyzing the PDF page images…' : subjectFileName ? 'Running audit…' : 'Upload a subject PDF to run a compliance audit.'}
          </div>
        ) : (
          <>
            <div className="bg-[#171f2d] rounded-md border border-slate-700/80 overflow-hidden">
              <div className={`h-1 ${report.passed ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <div className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 shrink-0 grid place-items-center rounded-md border ${
                  report.passed ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                }`}>
                  <span className="text-xs font-bold">{report.passed ? 'PASS' : 'REVIEW'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                    <h3 className="text-sm font-semibold text-slate-100">{report.passed ? 'Audit complete' : 'Review required'}</h3>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                      {report.metadata.analysisMethod === 'visual-ai' ? 'Visual AI review' : 'Text fallback'}
                    </span>
                  </div>
                  <p className="text-sm leading-5 text-slate-400 mt-1">{report.summary}</p>
                </div>
                <span className="text-[10px] text-slate-500 whitespace-nowrap pt-0.5">{new Date(report.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-700/80 rounded-md overflow-hidden bg-[#171f2d]">
              <div className="px-3 py-2.5 border-r border-b sm:border-b-0 border-slate-700/80">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Passed</p>
                <p className="text-lg leading-5 font-semibold text-emerald-300 mt-1">{checksByStatus.passed.length}</p>
              </div>
              <div className="px-3 py-2.5 border-b sm:border-b-0 sm:border-r border-slate-700/80">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Findings</p>
                <p className="text-lg leading-5 font-semibold text-slate-100 mt-1">{report.issues.length}</p>
              </div>
              <div className="px-3 py-2.5 border-r border-slate-700/80">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Critical</p>
                <p className={`text-lg leading-5 font-semibold mt-1 ${issuesBySeverity.error.length > 0 ? 'text-rose-300' : 'text-slate-400'}`}>{issuesBySeverity.error.length}</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Needs review</p>
                <p className={`text-lg leading-5 font-semibold mt-1 ${checksByStatus['not-assessable'].length > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{checksByStatus['not-assessable'].length}</p>
              </div>
            </div>

            {/* Issues, grouped by severity */}
            {SEVERITY_ORDER.map(sev => issuesBySeverity[sev].length > 0 && (
              <div key={sev} className="space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${sev === 'error' ? 'bg-rose-400' : sev === 'warning' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{SEVERITY_STYLES[sev].label} findings</h3>
                </div>
                {issuesBySeverity[sev].map((issue, idx) => (
                  <div key={`${sev}-${idx}`} className="p-3 bg-[#171f2d] rounded-md border border-slate-700/80 border-l-2" style={{ borderLeftColor: sev === 'error' ? '#fb7185' : sev === 'warning' ? '#fbbf24' : '#38bdf8' }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{issue.title}</p>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border flex-shrink-0 ${SEVERITY_STYLES[sev].badge}`}>
                        {SEVERITY_STYLES[sev].label}
                      </span>
                    </div>
                    <p className="text-sm leading-5 text-slate-400 mt-1">{issue.detail}</p>
                    {issue.evidence && (
                      <p className="text-xs text-gray-500 mt-1 font-mono break-words">Evidence: {issue.evidence}</p>
                    )}
                    {issue.spatialEvidence?.map((evidence, evidenceIndex) => (
                      <button
                        key={`${issue.checkId}-${idx}-${evidenceIndex}`}
                        type="button"
                        onClick={() => onSelectEvidence?.(evidence.fileName, evidence.pageNumber)}
                        className="block text-left text-xs text-cyan-400/80 hover:text-cyan-300 mt-1"
                      >
                        View {evidence.fileName}, page {evidence.pageNumber}: {evidence.description || evidence.textSnippet || 'visual evidence'}
                      </button>
                    ))}
                    {issue.recommendation && (
                      <p className="text-xs text-violet-300 mt-2 pt-2 border-t border-slate-700/70">Next step: {issue.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}

              {checksByStatus.passed.length > 0 && (
                <details open className="bg-emerald-950/20 rounded-lg border border-emerald-800/70">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-emerald-300">
                    Successful comparisons ({checksByStatus.passed.length})
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {checksByStatus.passed.map((result) => (
                      <div key={result.checkId} className="border-t border-emerald-900/70 pt-2">
                        <p className="text-sm font-medium text-gray-100">{CHECK_LABELS.find(check => check.id === result.checkId)?.label || result.checkId}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{result.conclusion}</p>
                        {result.evidence?.map((evidence, index) => (
                          <button
                            key={`${result.checkId}-${index}`}
                            type="button"
                            onClick={() => onSelectEvidence?.(evidence.fileName, evidence.pageNumber)}
                            className="block text-left text-xs text-emerald-400/80 hover:text-emerald-300 mt-1"
                          >
                            {evidence.fileName}, page {evidence.pageNumber}: {evidence.description || evidence.textSnippet || 'Evidence located'}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {checksByStatus['not-assessable'].length > 0 && (
                <details open className="bg-[#171f2d] rounded-md border border-slate-700/80">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-300">
                    Audit ledger — visual review pending ({checksByStatus['not-assessable'].length})
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {checksByStatus['not-assessable'].map((result) => (
                      <div key={result.checkId} className="border-t border-slate-700/80 pt-2">
                        <div className="flex gap-2 items-baseline">
                          <p className="text-sm font-medium text-gray-100">{CHECK_LABELS.find(check => check.id === result.checkId)?.label || result.checkId}</p>
                          <span className="text-[10px] uppercase tracking-wide text-amber-300">Needs visual review</span>
                        </div>
                        <p className="text-sm text-slate-400 mt-0.5">{result.conclusion}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

            {/* Metadata footer for repeatability / traceability */}
            <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-800 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>Report ID: {report.reportId}</span>
              <span>Standards source: {report.metadata.standardsSource}</span>
              <span>
                Analysis method: {report.metadata.analysisMethod === 'visual-ai' ? 'Visual AI (page images)' : 'Text heuristic'}
              </span>
              {typeof report.metadata.cadLayerCount === 'number' && <span>CAD layers: {report.metadata.cadLayerCount}</span>}
              {typeof report.metadata.cadCodeCount === 'number' && <span>CAD codes: {report.metadata.cadCodeCount}</span>}
              {typeof report.metadata.subjectPdfLayerCount === 'number' && (
                <span>
                  Subject PDF layers (OCG): {report.metadata.subjectPdfLayerCount > 0 ? report.metadata.subjectPdfLayerCount : 'none detected'}
                </span>
              )}
              {report.metadata.subjectPdfDashPatterns && report.metadata.subjectPdfDashPatterns.length > 0 && (
                <span>Subject PDF dash patterns: {report.metadata.subjectPdfDashPatterns.join(', ')}</span>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button
            onClick={onOpenChat}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1.5"
          >
            <ClipboardDocumentListIcon className="w-4 h-4" />
            Ask follow-up questions in chat
          </button>
        </div>
      </div>
    </div>
  );
};

export default StandardsComplianceSummaryPanel;
