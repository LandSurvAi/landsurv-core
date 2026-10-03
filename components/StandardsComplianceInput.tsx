import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { HomeIcon, UploadIcon, ClipboardDocumentListIcon, XMarkIcon } from './icons';
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
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
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

      <button
        onClick={onGoBack}
        className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors"
        title={backButtonTitle}
      >
        <HomeIcon className="w-6 h-6" />
      </button>

      <h1 className="text-4xl sm:text-5xl font-extrabold leading-none tracking-tight text-center mb-3">
        <span className="text-white">Standards</span><span className="text-violet-400">Compliance</span>
      </h1>
      <p className="text-gray-300 mb-6 max-w-3xl">
        Upload a subject PDF to audit, optionally add one or more reference/control PDFs (examples of the correct standard), choose source mode, and define checks.
      </p>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-5 text-left">
        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-5 h-5" /> Intake Files
          </h3>

          <label className="block text-sm text-gray-300 mb-2">Subject PDF (required)</label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => { void handleFilePick('subject', e.target.files); }}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-700"
          />
          <div className="text-xs text-gray-400 mt-2 mb-4">
            {subjectFile ? `${subjectFile.file.name} (${subjectFile.pages?.length ?? 0} page(s) selected)` : 'No subject PDF selected.'}
          </div>

          <label className="block text-sm text-gray-300 mb-2">Reference / control PDFs (optional, any number)</label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => { void handleFilePick('control', e.target.files); e.target.value = ''; }}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-100 hover:file:bg-gray-600"
          />
          {controlFiles.length === 0 && controlQueue.length === 0 ? (
            <div className="text-xs text-gray-400 mt-2">No reference PDFs selected. Add as many examples of the correct standard as you have.</div>
          ) : (
            <ul className="mt-2 space-y-1">
              {controlFiles.map((cf, idx) => (
                <li key={`${cf.file.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-gray-300 bg-gray-800/60 border border-gray-700 rounded-md px-2 py-1.5">
                  <span className="truncate">{cf.file.name} ({cf.pages?.length ?? 0} page(s))</span>
                  <button
                    type="button"
                    onClick={() => removeControlFile(idx)}
                    disabled={isProcessing}
                    className="p-0.5 text-gray-400 hover:text-red-400 flex-shrink-0"
                    title="Remove this reference PDF"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
              {controlQueue.length > 0 && (
                <li className="text-xs text-gray-500 italic px-2">{controlQueue.length} more queued for page selection…</li>
              )}
            </ul>
          )}
        </div>

        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-violet-300 mb-3">Audit Profile</h3>

          <label className="block text-sm text-gray-300 mb-1">Standards source mode</label>
          <select
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as ComplianceSourceMode)}
            disabled={isProcessing}
            className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 mb-2"
          >
            {SOURCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mb-4">
            {SOURCE_OPTIONS.find(opt => opt.value === sourceMode)?.help}
          </p>

          <div className="space-y-2">
            <div className="text-sm text-gray-300">Enabled checks ({selectedCheckCount})</div>
            {CHECK_LABELS.map(check => (
              <label key={check.id} className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={checks[check.id]}
                  onChange={() => toggleCheck(check.id)}
                  disabled={isProcessing}
                  className="accent-violet-500"
                />
                {check.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        {isProcessing && (
          <div className="text-sm text-violet-200 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" />
            {progress || 'Processing...'}
          </div>
        )}

        <button
          onClick={() => { void handleStart(); }}
          disabled={isProcessing || !subjectFile}
          className="inline-flex items-center gap-2 px-8 py-3 text-lg font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200"
        >
          <UploadIcon className="w-5 h-5" /> Start Standards Compliance
        </button>
      </div>
    </div>
  );
};

export default StandardsComplianceInput;
