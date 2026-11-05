/**
 * StandardUpload Component
 * 
 * Flexible file upload for CAD standards and survey code files.
 * Accepts multiple formats: .md, .csv, .txt, .xml, etc.
 * Uses InferenceService to parse content into standards format.
 * 
 * Features:
 * - Multi-format file support (.md, .csv, .txt, .xml, .json, .fxl)
 * - Content preview
 * - AI-powered parsing for any format
 * - Error handling with user-friendly messages
 */

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Upload, X } from 'lucide-react';
import { useMirrorError } from '../../hooks/useMirrorError';
import { StandardDefinition } from '../../contexts/types/CadManager.types';
import { InferenceService } from '../../services/InferenceService';
import { convertFclToTrimbleCsv, downloadTrimbleCsv } from '../../utils/fclConverter';


// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  '.md', '.markdown',  // Markdown standards
  '.csv',              // CSV point codes
  '.txt',              // Plain text lists
  '.xml',              // XML configurations
  '.json',             // JSON formats
  '.fxl',              // TrimbleLink fieldbook
  '.fcl',              // Carlson field code library
];


interface StandardUploadProps {
  onStandardParsed: (standard: StandardDefinition) => void;
  isLoading?: boolean;
}

/**
 * StandardUpload Component
 * 
 * Handles markdown file upload and parsing.
 */
export const StandardUpload: React.FC<StandardUploadProps> = ({
  onStandardParsed,
  isLoading: externalLoading = false,
}) => {
  // State management
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Standards upload', kind: 'standard-upload-error' });
  const [success, setSuccess] = useState<string | null>(null);

  const loading = isLoading || externalLoading;

  /**
   * Handle file selection
   */
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    // Get file extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    // Validate file type
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum 10MB allowed.');
      return;
    }

    setSelectedFile(file);

    // Read file content
    try {
      const content = await file.text();
      setFileContent(content);
      
      // Show preview (first 500 chars or until first separator)
      const previewText = content.length > 500 
        ? content.substring(0, 500) + '\n...' 
        : content;
      setPreview(previewText);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not read file: ${message}`);
      setSelectedFile(null);
      setFileContent('');
      setPreview('');
    }
  };

    /**
   * Handle Carlson FCL to Trimble CSV conversion
   */
  const handleFclExport = () => {
    if (!selectedFile || !fileContent) return;
    try {
      const trimbleCsv = convertFclToTrimbleCsv(fileContent);
      downloadTrimbleCsv(trimbleCsv, selectedFile.name);
      setSuccess(`✓ Converted Carlson FCL to Trimble CSV`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to convert FCL: ${message}`);
    }
  };

  /**
   * Handle parse button click

   */
  const handleParseClick = async () => {
    if (!selectedFile || !fileContent) {
      setError('Please select a file first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log(`[StandardUpload] Parsing ${selectedFile.name}...`);
      
      const standard = await InferenceService.parseStandards(
        fileContent,
        selectedFile.name
      );

      console.log(
        `[StandardUpload] Successfully parsed: ${standard.name} with ${standard.codes.length} codes`
      );

      setSuccess(`✓ Parsed: ${standard.name} with ${standard.codes.length} codes`);
      onStandardParsed(standard);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[StandardUpload] Parse error:', message);
      setError(`Failed to parse standards: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle clear button click
   */
  const handleClear = () => {
    setSelectedFile(null);
    setFileContent('');
    setPreview('');
    setError(null);
    setSuccess(null);
  };

  const fileSizeKB = selectedFile ? (selectedFile.size / 1024).toFixed(1) : '0';

  return (
    <div className="standard-upload-container p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-white">Import a standards file</h2>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
            Markdown, CSV, XML, JSON, Trimble FXL, or Carlson FCL. The agent parses the file into editable codes.
          </p>
        </div>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-7 text-center transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.04] ${
          loading ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-cyan-300">
          <Upload className="h-4 w-4" />
        </span>
        <span className="text-[11.5px] font-semibold text-slate-200">Choose a standards file</span>
        <span className="text-[9.5px] text-slate-500">.md · .csv · .txt · .xml · .json · .fxl · .fcl</span>
        <input
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(',')}
          onChange={handleFileSelected}
          disabled={loading}
          className="sr-only"
        />
      </label>

      {selectedFile && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-cyan-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-medium text-slate-200">{selectedFile.name}</p>
            <p className="text-[9px] text-slate-500">{fileSizeKB} KB</p>
          </div>
          <button
            onClick={handleClear}
            disabled={loading}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-40"
            title="Clear selected file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {preview && (
        <div className="mt-3">
          <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Preview</label>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-white/[0.07] bg-[#050a12] p-2.5">
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-slate-400">{preview}</pre>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[10.5px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong className="font-semibold">Error:</strong> {error}</span>
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-[10.5px] text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2 text-[10.5px] text-cyan-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Parsing the standards file…
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {selectedFile?.name.toLowerCase().endsWith('.fcl') && (
          <button
            onClick={handleFclExport}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export Trimble CSV
          </button>
        )}
        <button
          onClick={handleParseClick}
          disabled={!selectedFile || !fileContent || loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-2.5 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {loading ? 'Parsing…' : 'Parse standard'}
        </button>
        <button
          onClick={handleClear}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 text-[10.5px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <p className="mt-3 text-[9px] leading-relaxed text-slate-600">
        Upload any file containing survey codes, standards definitions, or point code lists. The agent parses and normalizes it regardless of format.
      </p>
    </div>
  );
};
