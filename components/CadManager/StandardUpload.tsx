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
    <div className="standard-upload-container p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-200 light-theme:text-gray-800">Upload Standards or Codes</h2>

      {/* File Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
          Select File (any format)
        </label>
        <input
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(',')}
          onChange={handleFileSelected}
          disabled={loading}
          className="block w-full text-sm text-gray-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-indigo-600 file:text-white
            hover:file:bg-indigo-700
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* File Info */}
      {selectedFile && (
        <div className="mb-6 p-3 bg-indigo-900/30 rounded border border-indigo-500/30">
          <p className="text-sm text-indigo-200">
            <strong>Selected:</strong> {selectedFile.name} ({fileSizeKB} KB)
          </p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
            Preview:
          </label>
          <div className="bg-gray-900 border border-gray-700 rounded p-4 max-h-64 overflow-y-auto light-theme:bg-white light-theme:border-gray-300">
            <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono light-theme:text-gray-600">
              {preview}
            </pre>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 rounded border border-red-500/30">
          <p className="text-sm text-red-300">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-900/30 rounded border border-green-500/30">
          <p className="text-sm text-green-300">
            <strong>{success}</strong>
          </p>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="mb-6 p-4 bg-yellow-900/30 rounded border border-yellow-500/30">
          <p className="text-sm text-yellow-300">
            <strong>Parsing...</strong> Please wait while we analyze the standards file.
          </p>
        </div>
      )}

            {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {selectedFile?.name.toLowerCase().endsWith('.fcl') && (
          <button
            onClick={handleFclExport}
            disabled={loading}
            className="px-6 py-2 bg-emerald-600 text-white rounded-md font-medium
              hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed
              transition-colors duration-200 flex items-center gap-2"
          >
            📥 Export to Trimble CSV
          </button>
        )}
        <button
          onClick={handleParseClick}
          disabled={!selectedFile || !fileContent || loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium
            hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          {loading ? 'Parsing...' : 'Parse Standard'}
        </button>
        <button
          onClick={handleClear}
          disabled={loading}
          className="px-6 py-2 bg-gray-700 text-gray-300 rounded-md font-medium
            hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          Clear
        </button>
      </div>

      {/* Info Text */}
      <p className="text-xs text-gray-500 mt-4 mb-2">
        <strong>Supported formats:</strong> .md, .csv, .txt, .xml, .json, .fxl, .fcl
      </p>

      <p className="text-xs text-gray-500 mb-2">
        Upload any file containing survey codes, standards definitions, or point code lists. 
        The AI will parse and interpret the content regardless of format.
      </p>
      <div className="bg-gray-950 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto border border-gray-700">
        <pre>{`Examples:
• Markdown table with code definitions
• CSV with point codes (CODE, DESCRIPTION, LAYER...)
• Plain text list of field codes
• XML/FXL feature definitions
• Carlson FCL code libraries (Convert to Trimble CSV)
• Any structured or unstructured code list`}</pre>

      </div>
    </div>
  );
};
