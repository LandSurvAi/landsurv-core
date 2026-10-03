/**
 * SurveyUpload Component
 * 
 * Allows users to upload CSV files with survey codes.
 * Extracts unknown codes from the first column.
 * Displays code list with frequencies.
 * 
 * Features:
 * - File picker for .csv files
 * - CSV parsing (first column = code, second column optional = frequency)
 * - Code deduplication
 * - Display unknown codes with frequency
 * - "Start Matching" button (disabled if no standard loaded)
 */

import React, { useState } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import { StandardDefinition } from '../../contexts/types/CadManager.types';

interface CodeFrequency {
  code: string;
  frequency: number;
}

interface SurveyUploadProps {
  standard: StandardDefinition | null;
  onCodesExtracted: (codes: string[]) => void;
  isLoading?: boolean;
}

/**
 * Parse CSV content and extract codes from first column
 */
function parseCSV(content: string): CodeFrequency[] {
  const lines = content.split('\n').filter(line => line.trim());
  const codeMap = new Map<string, number>();

  for (const line of lines) {
    const [codeStr, frequencyStr] = line.split(',').map(s => s.trim());
    if (!codeStr) continue;

    const code = codeStr.toUpperCase();
    const frequency = frequencyStr ? parseInt(frequencyStr, 10) || 1 : 1;

    const current = codeMap.get(code) || 0;
    codeMap.set(code, current + frequency);
  }

  // Sort by frequency descending
  return Array.from(codeMap.entries())
    .map(([code, frequency]) => ({ code, frequency }))
    .sort((a, b) => b.frequency - a.frequency);
}

/**
 * SurveyUpload Component
 * 
 * Handles CSV file upload and code extraction.
 */
export const SurveyUpload: React.FC<SurveyUploadProps> = ({
  standard,
  onCodesExtracted,
  isLoading: externalLoading = false,
}) => {
  // State management
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [codes, setCodes] = useState<CodeFrequency[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Survey upload', kind: 'survey-upload-error' });

  const loading = isLoading || externalLoading;
  const canStartMatching = !!standard && codes.length > 0;

  /**
   * Handle file selection
   */
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file (.csv)');
      return;
    }

    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      setError('File too large. Maximum 50MB allowed.');
      return;
    }

    setSelectedFile(file);

    // Read and parse file
    try {
      const content = await file.text();
      setFileContent(content);

      const parsedCodes = parseCSV(content);
      setCodes(parsedCodes);

      console.log(
        `[SurveyUpload] Extracted ${parsedCodes.length} unique codes from ${file.name}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not read file: ${message}`);
      setSelectedFile(null);
      setFileContent('');
      setCodes([]);
    }
  };

  /**
   * Handle start matching button click
   */
  const handleStartMatching = () => {
    if (!canStartMatching) {
      setError('Load a standard first and select a CSV with codes');
      return;
    }

    const unknownCodes = codes.map(c => c.code);
    console.log(`[SurveyUpload] Starting match for ${unknownCodes.length} codes`);
    onCodesExtracted(unknownCodes);
  };

  /**
   * Handle clear button click
   */
  const handleClear = () => {
    setSelectedFile(null);
    setFileContent('');
    setCodes([]);
    setError(null);
  };

  const fileSizeKB = selectedFile ? (selectedFile.size / 1024).toFixed(1) : '0';

  return (
    <div className="survey-upload-container p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <h2 className="text-xl font-bold text-gray-200 mb-4">Upload Survey Codes</h2>

      {/* Status: Standard Loaded */}
      <div className="mb-4 p-3 rounded-lg border border-green-500/30 bg-green-900/20">
        <p className="text-sm text-green-300">
          ✓ Standard loaded: <strong>{standard?.name}</strong> ({standard?.codes.length} codes)
        </p>
      </div>

      {/* File Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Select CSV File
        </label>
        <input
          type="file"
          accept=".csv"
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
        <div className="mb-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
          <p className="text-sm text-gray-300">
            <strong>Selected:</strong> {selectedFile.name} ({fileSizeKB} KB)
          </p>
        </div>
      )}

      {/* Codes List */}
      {codes.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Unknown Codes Found: {codes.length}
          </label>
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-400">Code</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-400">Occurrences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {codes.slice(0, 20).map((item) => (
                  <tr key={item.code} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-mono text-gray-200">{item.code}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{item.frequency}</td>
                  </tr>
                ))}
                {codes.length > 20 && (
                  <tr className="bg-gray-800/30">
                    <td colSpan={2} className="px-4 py-2 text-center text-gray-500 text-xs">
                      ... and {codes.length - 20} more codes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 rounded-lg border border-red-500/30">
          <p className="text-sm text-red-300">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleStartMatching}
          disabled={!canStartMatching || loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium
            hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed
            transition-colors duration-200"
          title={!standard ? 'Load a standard file first' : ''}
        >
          {loading ? 'Processing...' : 'Start Matching'}
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
      <p className="text-xs text-gray-500 mt-4">
        CSV format: First column = codes, optional second column = frequency.
        {standard && codes.length > 0 && (
          <>
            <br />
            Ready to match <strong className="text-gray-300">{codes.length}</strong> unknown codes to <strong className="text-gray-300">{standard.codes.length}</strong> master codes.
          </>
        )}
      </p>
    </div>
  );
};
