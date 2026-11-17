import React from 'react';
import {
  summarizeReviewRows,
  updateReviewRow,
  type DocumentReviewMethod,
  type DocumentReviewRow,
} from '../utils/documentReview.ts';

export interface DocumentReviewTableProps {
  fileName: string;
  method: DocumentReviewMethod;
  sourceConfidence: number;
  summaryLanguage?: 'en' | 'ar';
  rows: DocumentReviewRow[];
  onRowsChange: (rows: DocumentReviewRow[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSendOriginal?: () => void;
  isApplying?: boolean;
}

function confidenceLabel(value: number): string {
  if (value >= 0.85) return 'High';
  if (value >= 0.65) return 'Check';
  return 'Review';
}

function confidenceClass(value: number): string {
  if (value >= 0.85) return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200';
  if (value >= 0.65) return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  return 'border-rose-400/40 bg-rose-400/10 text-rose-200';
}

function cellClass(value: number): string {
  if (value >= 0.85) return 'border-white/[0.08]';
  if (value >= 0.65) return 'border-amber-400/40';
  return 'border-rose-400/50';
}

const DocumentReviewTable: React.FC<DocumentReviewTableProps> = ({
  fileName,
  method,
  sourceConfidence,
  summaryLanguage = 'en',
  rows,
  onRowsChange,
  onConfirm,
  onCancel,
  onSendOriginal,
  isApplying = false,
}) => {
  const summary = summarizeReviewRows(rows);
  const sourceLabel = method === 'ocr' ? 'Arabic + English OCR' : 'PDF text layer';
  const confidencePercent = Math.round(sourceConfidence * 100);
  const summaryText = summaryLanguage === 'ar'
    ? `تم استخراج ${summary.rowCount} صفًا من الإحداثيات؛ ${summary.lowConfidenceCount} منها تحتاج إلى مراجعة قبل الرسم.`
    : `${summary.rowCount} coordinate row${summary.rowCount === 1 ? '' : 's'} extracted; ${summary.lowConfidenceCount} need review before plotting.`;

  const changeRow = (
    row: DocumentReviewRow,
    field: 'pointNumber' | 'northing' | 'easting' | 'description' | 'included',
    value: string | boolean,
  ) => {
    onRowsChange(updateReviewRow(rows, row.id, { [field]: value } as Parameters<typeof updateReviewRow>[2]));
  };

  return (
    <div className="space-y-3" dir="ltr" data-testid="document-review-table">
      <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/[0.05] p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">Review extracted coordinates</h3>
              <span className="rounded border border-fuchsia-400/40 bg-fuchsia-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-200">
                Beta
              </span>
              <span className="rounded border border-white/[0.10] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
                {sourceLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400">{fileName}</p>
            <p
              className="mt-1 text-[11px] text-slate-300"
              dir={summaryLanguage === 'ar' ? 'rtl' : 'ltr'}
              lang={summaryLanguage}
            >
              {summaryText}
            </p>
          </div>
          <div className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-right ${confidenceClass(sourceConfidence)}`}>
            <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">Source confidence</div>
            <div className="font-mono text-sm font-bold">{confidencePercent}%</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Calls found</div>
            <div className="font-mono text-sm font-semibold text-slate-100">{summary.rowCount}</div>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Needs review</div>
            <div className={`font-mono text-sm font-semibold ${summary.lowConfidenceCount > 0 ? 'text-rose-200' : 'text-emerald-200'}`}>
              {summary.lowConfidenceCount}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Duplicates</div>
            <div className={`font-mono text-sm font-semibold ${summary.duplicateCount > 0 ? 'text-amber-200' : 'text-slate-100'}`}>
              {summary.duplicateCount}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Selected</div>
            <div className="font-mono text-sm font-semibold text-slate-100">{summary.includedCount}</div>
          </div>
        </div>

        {summary.arabicDigitCount > 0 && (
          <p className="mt-2 rounded-md border border-cyan-400/25 bg-cyan-400/[0.05] px-2.5 py-1.5 text-[10.5px] text-cyan-100">
            {summary.arabicDigitCount} row{summary.arabicDigitCount === 1 ? '' : 's'} use Arabic-Indic digits. The source text is preserved in the table; numeric equivalents are used only when plotting.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100">
        <strong className="font-semibold">Assistive extraction, not a legal survey.</strong>{' '}
        Check every call against the source plan before plotting. Low-confidence fields are highlighted.
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/20">
        <table className="w-full min-w-[760px] border-collapse text-left text-[11px]" aria-label="Extracted coordinate review table">
          <thead>
            <tr className="border-b border-white/[0.08] text-[9px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="w-9 px-2 py-2 text-center">
                <span className="sr-only">Include row</span>
              </th>
              <th scope="col" className="min-w-[110px] px-2 py-2">Point</th>
              <th scope="col" className="min-w-[140px] px-2 py-2">Northing</th>
              <th scope="col" className="min-w-[140px] px-2 py-2">Easting</th>
              <th scope="col" className="min-w-[180px] px-2 py-2">Description</th>
              <th scope="col" className="min-w-[92px] px-2 py-2">Confidence</th>
              <th scope="col" className="min-w-[180px] px-2 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  No coordinate rows were detected. Try a clearer scan or a different page.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const rowTone = row.confidence < 0.65
                ? 'bg-rose-950/15'
                : row.confidence < 0.85
                  ? 'bg-amber-950/10'
                  : '';
              return (
                <tr key={row.id} className={`border-b border-white/[0.05] align-top last:border-b-0 ${rowTone} ${row.included ? '' : 'opacity-50'}`}>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={() => changeRow(row, 'included', !row.included)}
                      aria-label={`Include ${row.pointNumber || 'coordinate row'}`}
                      className="h-3.5 w-3.5 accent-fuchsia-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.pointNumber}
                      onChange={(event) => changeRow(row, 'pointNumber', event.target.value)}
                      dir="auto"
                      aria-label="Point number"
                      className={`w-full rounded border bg-black/30 px-1.5 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-fuchsia-300 ${cellClass(row.fieldConfidence.pointNumber)}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.northing}
                      onChange={(event) => changeRow(row, 'northing', event.target.value)}
                      dir="ltr"
                      inputMode="decimal"
                      aria-label="Northing"
                      className={`w-full rounded border bg-black/30 px-1.5 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-fuchsia-300 ${cellClass(row.fieldConfidence.northing)}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.easting}
                      onChange={(event) => changeRow(row, 'easting', event.target.value)}
                      dir="ltr"
                      inputMode="decimal"
                      aria-label="Easting"
                      className={`w-full rounded border bg-black/30 px-1.5 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-fuchsia-300 ${cellClass(row.fieldConfidence.easting)}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.description}
                      onChange={(event) => changeRow(row, 'description', event.target.value)}
                      dir="auto"
                      aria-label="Description"
                      className="w-full rounded border border-white/[0.08] bg-black/30 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-fuchsia-300"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${confidenceClass(row.confidence)}`}>
                      {confidenceLabel(row.confidence)} {Math.round(row.confidence * 100)}%
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[10px] leading-snug text-slate-400">
                    {row.issues.length === 0 ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {row.issues.slice(0, 3).map((issue) => (
                          <li key={issue} className={issue.startsWith('Duplicate') || issue.startsWith('Low') ? 'text-amber-200' : ''}>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {summary.invalidIncludedCount > 0 && (
        <p className="rounded-md border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-100" role="alert">
          {summary.invalidIncludedCount} included row{summary.invalidIncludedCount === 1 ? '' : 's'} still need a point number, northing and easting. Fix or exclude them before plotting.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/[0.22] hover:text-slate-100"
        >
          Back to upload
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {onSendOriginal && (
            <button
              type="button"
              onClick={onSendOriginal}
              className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/[0.22] hover:text-slate-100"
            >
              Skip review — use original plan
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={summary.includedCount === 0 || summary.invalidIncludedCount > 0 || isApplying}
            className="rounded-md bg-fuchsia-600 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? 'Applying…' : `Confirm & plot ${summary.includedCount} point${summary.includedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentReviewTable;
