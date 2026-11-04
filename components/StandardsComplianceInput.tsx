import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadIcon, ClipboardDocumentListIcon, XMarkIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadActionBar } from './UploadShell.tsx';
import PdfPageSelector from './PdfPageSelector';
import { useAppState } from '../contexts/AppStateContext.tsx';
import {
  type ComplianceSourceMode,
  type SessionFile,
  type StandardsComplianceCheckId,
  type StandardsComplianceCheckSelection,
} from '../types';
import { processPdfForMultimodal } from '../utils/pdfUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs';

interface StandardsComplianceInputProps {
  onSessionStart: (payload: {
    controlFiles: SessionFile[];
    subjectFile: SessionFile;
    checks: StandardsComplianceCheckSelection;
    sourceMode: ComplianceSourceMode;
  }) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

interface FileWithPages {
  file: File;
  pages?: number[];
}

const CHECK_LABELS: Array<{ id: StandardsComplianceCheckId; label: string }> = [
  { id: 'title_block', label: 'Title block completeness' },
  { id: 'north_arrow', label: 'North arrow presence' },
  { id: 'annotation_completeness', label: 'Annotation completeness' },
  { id: 'required_layers', label: 'Required layer presence' },
  { id: 'linetype_compliance', label: 'Linetype compliance' },
  { id: 'scale_and_sheet_metadata', label: 'Scale and sheet metadata' },
  { id: 'legend_symbol_consistency', label: 'Legend and symbol consistency' },
  { id: 'revision_block', label: 'Revision block completeness' },
  { id: 'zoning_table_and_dimensional_compliance', label: 'Zoning table and dimensional compliance' },
  { id: 'site_location_map', label: 'Site location map presence and validity' },
  { id: 'impervious_coverage_chart', label: 'Impervious coverage chart and calculations' },
];

const DEFAULT_CHECKS: StandardsComplianceCheckSelection = {
  title_block: true,
  north_arrow: true,
  annotation_completeness: true,
  required_layers: true,
  linetype_compliance: true,
  scale_and_sheet_metadata: true,
  legend_symbol_consistency: true,
  revision_block: true,
  zoning_table_and_dimensional_compliance: true,
  site_location_map: true,
  impervious_coverage_chart: true,
};

const SOURCE_OPTIONS: Array<{ value: ComplianceSourceMode; label: string; help: string }> = [
  { value: 'ask-each-run', label: 'Ask each run', help: 'Prompt source mode each time you run an audit.' },
  { value: 'cad-manager', label: 'CAD Manager only', help: 'Use active CAD standards and layers only.' },
  { value: 'control-pdf', label: 'Control PDF only', help: 'Use the uploaded reference PDF(s) as the standard.' },
  { value: 'combined', label: 'Combined', help: 'Use both CAD Manager and the reference PDF(s) context.' },
];

const StandardsComplianceInput: React.FC<StandardsComplianceInputProps> = ({
  onSessionStart,
  onGoBack,
  backButtonTitle = 'Go to Home Screen',
}) => {
  const { addNotification } = useAppState();

  const [controlFiles, setControlFiles] = useState<FileWithPages[]>([]);
  const [controlQueue, setControlQueue] = useState<File[]>([]);
  const [subjectFile, setSubjectFile] = useState<FileWithPages | null>(null);
  const [activeRoleForSelector, setActiveRoleForSelector] = useState<'control' | 'subject' | null>(null);
  const [pendingSelectorFile, setPendingSelectorFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<ComplianceSourceMode>('ask-each-run');
  const [checks, setChecks] = useState<StandardsComplianceCheckSelection>(DEFAULT_CHECKS);

  const selectedCheckCount = useMemo(
    () => Object.values(checks).filter(Boolean).length,
    [checks],
  );

  const notifyError = useCallback((message: string) => {
    addNotification({
      kind: 'standards-compliance',
      severity: 'error',
      title: 'Standards Compliance',
      message,
    });
  }, [addNotification]);

  const openPageSelectorIfNeeded = useCallback(async (
    role: 'control' | 'subject',
    file: File,
  ) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      if (pdf.numPages <= 1) {
        const next: FileWithPages = { file, pages: [1] };
        if (role === 'control') {
          setControlFiles(prev => [...prev, next]);
        } else {
          setSubjectFile(next);
        }
        return;
      }
      setActiveRoleForSelector(role);
      setPendingSelectorFile(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyError(`Could not read PDF "${file.name}": ${msg}`);
    }
  }, [notifyError]);

  // Reference/control PDFs are queued and processed one at a time so the page
  // selector (for multi-page files) only ever prompts for a single document
  // at once — supports adding as many reference PDFs as needed.
  useEffect(() => {
    if (activeRoleForSelector || pendingSelectorFile) return;
    if (controlQueue.length === 0) return;
    const [next, ...rest] = controlQueue;
    setControlQueue(rest);
    void openPageSelectorIfNeeded('control', next);
  }, [controlQueue, activeRoleForSelector, pendingSelectorFile, openPageSelectorIfNeeded]);

  const handleFilePick = useCallback(async (
    role: 'control' | 'subject',
    selectedFiles: FileList | null,
  ) => {
    const files = Array.from(selectedFiles || []);
    if (files.length === 0) return;

    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      notifyError('Only PDF files are supported for Standards Compliance intake.');
      return;
    }

    if (role === 'subject') {
      await openPageSelectorIfNeeded('subject', pdfFiles[0]);
      return;
    }

    setControlQueue(prev => [...prev, ...pdfFiles]);
  }, [notifyError, openPageSelectorIfNeeded]);

  const handlePagesSelected = useCallback((pages: number[]) => {
    if (!pendingSelectorFile || !activeRoleForSelector) return;
    const next: FileWithPages = { file: pendingSelectorFile, pages };
    if (activeRoleForSelector === 'control') {
      setControlFiles(prev => [...prev, next]);
    } else {
      setSubjectFile(next);
    }
    setPendingSelectorFile(null);
    setActiveRoleForSelector(null);
  }, [pendingSelectorFile, activeRoleForSelector]);

  const removeControlFile = useCallback((index: number) => {
    setControlFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const processOnePdf = useCallback(async (
    roleLabel: string,
    fileWithPages: FileWithPages,
  ): Promise<SessionFile> => {
    const { file, pages } = fileWithPages;
    if (!pages || pages.length === 0) {
      throw new Error(`No pages selected for ${roleLabel} PDF (${file.name}).`);
    }

    setProgress(`Processing ${roleLabel} PDF: ${file.name}`);

    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(String(event.target?.result || ''));
      reader.onerror = (event) => reject(event);
      reader.readAsDataURL(file);
    });

    const { text, rasterImageData, layerNames, dashPatterns } = await processPdfForMultimodal(
      file,
      (p) => {
        if (p.status === 'ocr_progress' && p.page && p.totalPages && p.progress) {
          const pct = Math.round(p.progress * 100);
          setProgress(`OCR ${roleLabel}: page ${p.page}/${p.totalPages} (${pct}%)`);
        }
      },
      pages,
    );

    return {
      name: file.name,
      content: text,
      fileData,
      rasterImageData,
      selectedPages: pages,
      pdfLayerNames: layerNames,
      pdfDashPatterns: dashPatterns,
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!subjectFile) {
      notifyError('Upload a subject PDF to audit.');
      return;
    }

    if (selectedCheckCount === 0) {
      notifyError('Enable at least one compliance check before starting.');
      return;
    }

    setIsProcessing(true);
    setProgress('Initializing Standards Compliance intake...');

    try {
      const processedSubject = await processOnePdf('subject', subjectFile);
      const processedControls: SessionFile[] = [];
      for (let i = 0; i < controlFiles.length; i++) {
        processedControls.push(await processOnePdf(`reference ${i + 1}/${controlFiles.length}`, controlFiles[i]));
      }

      onSessionStart({
        controlFiles: processedControls,
        subjectFile: processedSubject,
        checks,
        sourceMode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyError(`Failed to process Standards Compliance files: ${msg}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [checks, controlFiles, notifyError, onSessionStart, processOnePdf, selectedCheckCount, sourceMode, subjectFile]);

  const toggleCheck = useCallback((id: StandardsComplianceCheckId) => {
    setChecks(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <UploadShell
      icon={ClipboardDocumentListIcon}
      accent="#a78bfa"
      title="Standards Compliance"
      description="Audit a subject PDF against your own standard — add reference PDFs, choose the standards source, and pick which checks to run."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
      widthClassName="max-w-5xl"
    >
      {pendingSelectorFile && activeRoleForSelector && (
        <PdfPageSelector
          file={pendingSelectorFile}
          onSelect={handlePagesSelected}
          onCancel={() => {
            setPendingSelectorFile(null);
            setActiveRoleForSelector(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3.5 text-left lg:grid-cols-2">
        <UploadPanel eyebrow="Intake" title="Files">
          <label className="block text-[11.5px] font-medium text-slate-300">Subject PDF <span className="text-rose-300">*</span></label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => { void handleFilePick('subject', e.target.files); }}
            disabled={isProcessing}
            className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/20 p-2 text-[11.5px] text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-white/[0.06] file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-slate-200 hover:file:bg-white/[0.1]"
          />
          <p className="mb-4 mt-1.5 text-[11px] text-slate-500">
            {subjectFile ? `${subjectFile.file.name} (${subjectFile.pages?.length ?? 0} page(s) selected)` : 'No subject PDF selected.'}
          </p>

          <label className="block text-[11.5px] font-medium text-slate-300">Reference / control PDFs <span className="text-slate-500">(optional)</span></label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => { void handleFilePick('control', e.target.files); e.target.value = ''; }}
            disabled={isProcessing}
            className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/20 p-2 text-[11.5px] text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-white/[0.06] file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-slate-200 hover:file:bg-white/[0.1]"
          />
          {controlFiles.length === 0 && controlQueue.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-500">Add as many examples of the correct standard as you have.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {controlFiles.map((cf, idx) => (
                <li key={`${cf.file.name}-${idx}`} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[11px] text-slate-300">
                  <span className="truncate">{cf.file.name} ({cf.pages?.length ?? 0} page(s))</span>
                  <button
                    type="button"
                    onClick={() => removeControlFile(idx)}
                    disabled={isProcessing}
                    className="flex-shrink-0 text-slate-500 transition-colors hover:text-rose-300"
                    title="Remove this reference PDF"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {controlQueue.length > 0 && (
                <li className="px-2 text-[10.5px] italic text-slate-500">{controlQueue.length} more queued for page selection…</li>
              )}
            </ul>
          )}
        </UploadPanel>

        <UploadPanel eyebrow="Profile" title="Audit profile">
          <label className="block text-[11.5px] font-medium text-slate-300">Standards source mode</label>
          <select
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as ComplianceSourceMode)}
            disabled={isProcessing}
            className="mt-1.5 mb-1.5 w-full rounded-md border border-white/[0.08] bg-black/30 px-2.5 py-2 text-[12px] text-slate-200 outline-none focus:border-[color:var(--up-accent)]"
          >
            {SOURCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="mb-4 text-[11px] text-slate-500">
            {SOURCE_OPTIONS.find(opt => opt.value === sourceMode)?.help}
          </p>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Enabled checks ({selectedCheckCount})</p>
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {CHECK_LABELS.map(check => (
              <label key={check.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11.5px] text-slate-300 hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={checks[check.id]}
                  onChange={() => toggleCheck(check.id)}
                  disabled={isProcessing}
                  className="h-3.5 w-3.5 rounded border-white/20 accent-violet-500"
                />
                {check.label}
              </label>
            ))}
          </div>
        </UploadPanel>
      </div>

      {isProcessing && (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[12px] text-violet-200">
          <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
          {progress || 'Processing…'}
        </div>
      )}

      <UploadActionBar note={subjectFile ? 'Subject PDF ready' : 'Add a subject PDF to run the audit'}>
        <UploadPrimaryButton onClick={() => { void handleStart(); }} disabled={isProcessing || !subjectFile}>
          <UploadIcon className="h-3.5 w-3.5" />
          Start standards compliance
        </UploadPrimaryButton>
      </UploadActionBar>
    </UploadShell>
  );
};

export default StandardsComplianceInput;
