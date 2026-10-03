/**
 * ReviewModal Component
 * 
 * Displays inference results and allows users to review, confirm, or reject code matches.
 * Shows alternatives for each code and allows manual selection.
 * 
 * Features:
 * - Modal dialog
 * - Table of results (Code | Master | Confidence | Alternatives | Actions)
 * - Inline editing of master match
 * - Alternatives dropdown
 * - Batch confirm/reject buttons
 * - Progress indicator
 * - Loading state during inference
 */

import React, { useState, useEffect } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import {
  StandardDefinition,
  InferenceRequest,
  InferenceResult,
} from '../../contexts/types/CadManager.types';
import { InferenceService } from '../../services/InferenceService';

interface ReviewModalProps {
  isOpen: boolean;
  unknownCodes: string[];
  standard: StandardDefinition;
  previousAliases?: Record<string, string>;
  onConfirm: (results: InferenceResult[]) => void;
  onCancel: () => void;
  onAliasChange?: (alias: { unknownCode: string; masterCode: string }) => void;
}

/**
 * ReviewModal Component
 * 
 * Displays inference results and allows user confirmation.
 */
export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  unknownCodes,
  standard,
  previousAliases = {},
  onConfirm,
  onCancel,
  onAliasChange,
}) => {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<InferenceResult[]>([]);
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Review', kind: 'review-modal-error' });

  /**
   * Load and infer codes when modal opens
   */
  useEffect(() => {
    if (!isOpen) return;

    const performInference = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(`[ReviewModal] Starting inference for ${unknownCodes.length} codes...`);

        const request: InferenceRequest = {
          unknownCodes,
          masterCodes: standard.codes,
          previousAliases,
        };

        const inferredResults = await InferenceService.inferCodes(request);
        setResults(inferredResults);
        setEdits(new Map());
        setExpandedRow(null);

        console.log(`[ReviewModal] Inference complete: ${inferredResults.length} results`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ReviewModal] Inference error:', message);
        setError(`Failed to infer codes: ${message}`);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    performInference();
  }, [isOpen, unknownCodes, standard, previousAliases]);

  /**
   * Handle alternative selection
   */
  const handleAlternativeSelected = (unknownCode: string, alternativeCode: string) => {
    setEdits(prev => new Map(prev).set(unknownCode, alternativeCode));

    // Emit alias change if handler provided
    if (onAliasChange) {
      onAliasChange({
        unknownCode,
        masterCode: alternativeCode,
      });
    }

    console.log(`[ReviewModal] User selected: ${unknownCode} → ${alternativeCode}`);
  };

  /**
   * Handle confirm all
   */
  const handleConfirmAll = () => {
    // Apply all edits to results
    const confirmedResults = results.map(result => {
      const edited = edits.get(result.raw);
      if (edited && edited !== result.match) {
        return {
          ...result,
          match: edited,
          reasoning: 'User override',
        };
      }
      return result;
    });

    console.log(`[ReviewModal] User confirmed ${confirmedResults.length} matches`);
    onConfirm(confirmedResults);
  };

  /**
   * Get display master code (including edits)
   */
  const getDisplayMaster = (result: InferenceResult): string => {
    const edited = edits.get(result.raw);
    return edited || result.match || '?';
  };

  /**
   * Format confidence as percentage
   */
  const formatConfidence = (confidence: number): string => {
    return `${(confidence * 100).toFixed(0)}%`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Confirm Code Matches</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 font-bold text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Progress */}
        {!isLoading && results.length > 0 && (
          <div className="px-6 pt-4 pb-2 bg-gray-50 border-b">
            <p className="text-sm text-gray-600">
              Progress: <strong>{results.length}</strong> of <strong>{unknownCodes.length}</strong> codes
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading */}
          {isLoading && (
            <div className="p-8 text-center">
              <div className="inline-block">
                <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
              </div>
              <p className="mt-4 text-gray-600">
                Analyzing codes with AI... Please wait.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-6 bg-red-50 border border-red-200 m-4 rounded">
              <p className="text-red-700">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {/* Results Table */}
          {!isLoading && results.length > 0 && (
            <div className="p-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Unknown Code</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Match</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Confidence</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Alternatives</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((result) => (
                    <React.Fragment key={result.raw}>
                      <tr className={`hover:bg-gray-50 ${edits.has(result.raw) ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">
                          {result.raw}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={getDisplayMaster(result)}
                            onChange={(e) => handleAlternativeSelected(result.raw, e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded font-mono
                              focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Click to edit"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium
                              ${result.confidence >= 0.8
                                ? 'bg-green-100 text-green-800'
                                : result.confidence >= 0.5
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                          >
                            {formatConfidence(result.confidence)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.alternatives && result.alternatives.length > 0 && (
                            <button
                              onClick={() =>
                                setExpandedRow(
                                  expandedRow === result.raw ? null : result.raw
                                )
                              }
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              ▼ {result.alternatives.length}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Alternatives Row */}
                      {expandedRow === result.raw && result.alternatives && result.alternatives.length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-gray-600 mb-2">Alternatives:</p>
                              {result.alternatives.map((alt) => (
                                <button
                                  key={alt.code}
                                  onClick={() => {
                                    handleAlternativeSelected(result.raw, alt.code);
                                    setExpandedRow(null);
                                  }}
                                  className="block w-full text-left px-3 py-2 rounded border border-gray-300
                                    hover:bg-blue-50 hover:border-blue-400 transition-colors"
                                >
                                  <span className="font-mono font-medium">{alt.code}</span>
                                  <span className="ml-2 text-xs text-gray-600">
                                    ({formatConfidence(alt.confidence)})
                                  </span>
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No Results */}
          {!isLoading && results.length === 0 && !error && (
            <div className="p-8 text-center text-gray-500">
              <p>No results to display</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleConfirmAll}
            disabled={isLoading || results.length === 0}
            className="flex-1 px-6 py-2 bg-green-600 text-white rounded-md font-medium
              hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed
              transition-colors duration-200"
          >
            ✓ Confirm All
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-2 bg-gray-400 text-white rounded-md font-medium
              hover:bg-gray-500 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
